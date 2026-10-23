import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import type {
  SeedMapCapabilities,
  SeedMapDimension,
  SeedMapStructureRequest,
  SeedMapStructureResult,
  SeedMapTileRequest,
  SeedMapTileResult
} from '../../shared/types'

const TILE_SIZE = 128
const VERSIONS = [
  '1.16','1.16.1','1.16.2','1.16.3','1.16.4','1.16.5',
  '1.17','1.17.1','1.18','1.18.1','1.18.2',
  '1.19','1.19.1','1.19.2','1.19.3','1.19.4',
  '1.20','1.20.1','1.20.2','1.20.3','1.20.4','1.20.5','1.20.6',
  '1.21','1.21.1','1.21.2','1.21.3','1.21.4'
] as const
const DIMENSIONS: SeedMapDimension[] = ['overworld', 'nether', 'end']
const SCALES = [4, 8, 16, 32, 64]
const structures: SeedMapCapabilities['structures'] = [
  { id:'village', label:'村庄', dimension:'overworld', color:'#f5c45b', symbol:'村', since:'1.16' },
  { id:'outpost', label:'掠夺者前哨站', dimension:'overworld', color:'#8f6b52', symbol:'哨', since:'1.16' },
  { id:'desert_pyramid', label:'沙漠神殿', dimension:'overworld', color:'#e7a94f', symbol:'沙', since:'1.16', predicted:true },
  { id:'jungle_pyramid', label:'丛林神庙', dimension:'overworld', color:'#4cae58', symbol:'丛', since:'1.16', predicted:true },
  { id:'monument', label:'海底神殿', dimension:'overworld', color:'#42b8bd', symbol:'海', since:'1.16' },
  { id:'mansion', label:'林地府邸', dimension:'overworld', color:'#704c3e', symbol:'府', since:'1.16', predicted:true },
  { id:'ancient_city', label:'远古城市', dimension:'overworld', color:'#397888', symbol:'古', since:'1.19' },
  { id:'stronghold', label:'要塞', dimension:'overworld', color:'#8e75d6', symbol:'要', since:'1.16' },
  { id:'trial_chambers', label:'试炼密室', dimension:'overworld', color:'#bd7a43', symbol:'试', since:'1.21' },
  { id:'ruined_portal', label:'废弃传送门', dimension:'overworld', color:'#a65ac5', symbol:'门', since:'1.16' },
  { id:'fortress', label:'下界要塞', dimension:'nether', color:'#b54242', symbol:'堡', since:'1.16' },
  { id:'bastion', label:'堡垒遗迹', dimension:'nether', color:'#6f5148', symbol:'垒', since:'1.16' },
  { id:'ruined_portal_nether', label:'废弃传送门', dimension:'nether', color:'#a65ac5', symbol:'门', since:'1.16' },
  { id:'end_city', label:'末地城', dimension:'end', color:'#b692d2', symbol:'城', since:'1.16', predicted:true }
]

export const seedMapCapabilities = (): SeedMapCapabilities => ({
  engine: 'Cubiomes e61f905 (MIT) · 离线原生计算',
  versions: VERSIONS.map(value => ({ value, label: `Java ${value}` })),
  dimensions: [
    { value:'overworld', label:'主世界' },
    { value:'nether', label:'下界' },
    { value:'end', label:'末地' }
  ],
  structures,
  tileSize: TILE_SIZE,
  scales: SCALES
})

const enginePath = (): string => path.join(__dirname, 'SeedMapEngine.exe').replace('app.asar', 'app.asar.unpacked')
const tileCache = new Map<string, SeedMapTileResult>()
const structureCache = new Map<string, SeedMapStructureResult>()

function remember<T>(cache: Map<string,T>, key: string, value: T, limit: number): T {
  cache.delete(key)
  cache.set(key, value)
  while (cache.size > limit) cache.delete(cache.keys().next().value!)
  return value
}

function validateSeed(value: unknown): string {
  const seed = String(value ?? '').trim()
  if (!/^-?\d+$/.test(seed)) throw new Error('种子必须是十进制整数，可输入负数')
  const parsed = BigInt(seed)
  if (parsed < -9223372036854775808n || parsed > 9223372036854775807n) throw new Error('种子超出 Java Edition 64 位有符号整数范围')
  return parsed.toString()
}

function validateVersion(value: unknown): string {
  const version = String(value)
  if (!(VERSIONS as readonly string[]).includes(version)) throw new Error(`暂不支持 Minecraft ${version || '未知版本'}，不会替换为其他版本算法`)
  return version
}

function validateDimension(value: unknown): SeedMapDimension {
  if (!DIMENSIONS.includes(value as SeedMapDimension)) throw new Error('不支持的维度')
  return value as SeedMapDimension
}

function coordinate(value: unknown, name: string): number {
  const n = Number(value)
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < -30000000 || n > 30000000) throw new Error(`${name} 必须是 -30000000 到 30000000 的整数`)
  return n
}

let active = 0
const pending: Array<() => void> = []
async function slot<T>(work: () => Promise<T>): Promise<T> {
  if (active >= 2) await new Promise<void>(resolve => pending.push(resolve))
  active++
  try { return await work() }
  finally { active--; pending.shift()?.() }
}

function execute(args: string[], binary: boolean): Promise<Buffer> {
  const executable = enginePath()
  if (!fs.existsSync(executable)) throw new Error('种子地图原生计算器缺失，请重新安装完整版本')
  return slot(() => new Promise<Buffer>((resolve, reject) => {
    execFile(executable, args, { encoding:'buffer', windowsHide:true, timeout:45000, maxBuffer:8*1024*1024 }, (error, stdout, stderr) => {
      if (error) {
        const detail = Buffer.isBuffer(stderr) ? stderr.toString('utf8').trim() : String(stderr || '').trim()
        reject(new Error(detail || (error.killed ? '种子地图计算超时，请缩小范围后重试' : error.message)))
        return
      }
      const output = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout)
      if (!binary && !output.length) reject(new Error('种子地图计算器没有返回结果'))
      else resolve(output)
    })
  }))
}

export async function seedMapTile(request: SeedMapTileRequest): Promise<SeedMapTileResult> {
  const seed = validateSeed(request?.seed)
  const version = validateVersion(request?.version)
  const dimension = validateDimension(request?.dimension)
  const x = coordinate(request?.x, 'X')
  const z = coordinate(request?.z, 'Z')
  const scale = Number(request?.scale)
  if (!SCALES.includes(scale)) throw new Error('不支持的地图缩放精度')
  const y = Math.trunc(Number(request?.y))
  if (!Number.isFinite(y) || y < -64 || y > 320) throw new Error('Y 坐标超出支持范围')
  const key = [seed,version,dimension,x,z,scale,y].join('|')
  const cached = tileCache.get(key)
  if (cached) { tileCache.delete(key); tileCache.set(key,cached); return cached }
  const bytes = await execute(['biomes',version,seed,dimension,String(x),String(z),String(TILE_SIZE),String(TILE_SIZE),String(scale),String(y)], true)
  if (bytes.length !== TILE_SIZE*TILE_SIZE*4) throw new Error(`生物群系图块数据长度异常：${bytes.length}`)
  return remember(tileCache,key,{ width:TILE_SIZE, height:TILE_SIZE, rgbaBase64:bytes.toString('base64') },192)
}

export async function seedMapStructures(request: SeedMapStructureRequest): Promise<SeedMapStructureResult> {
  const seed = validateSeed(request?.seed)
  const version = validateVersion(request?.version)
  const dimension = validateDimension(request?.dimension)
  const minX = coordinate(request?.minX, '最小 X'), minZ = coordinate(request?.minZ, '最小 Z')
  const maxX = coordinate(request?.maxX, '最大 X'), maxZ = coordinate(request?.maxZ, '最大 Z')
  if (minX > maxX || minZ > maxZ || maxX-minX > 160000 || maxZ-minZ > 160000) throw new Error('结构查询范围过大，请放大地图后重试')
  const allowed = new Set(structures.filter(item => item.dimension === dimension).map(item => item.id))
  const types = [...new Set(Array.isArray(request?.types) ? request.types.map(String) : [])].filter(type => allowed.has(type)).sort()
  if (!types.length) return { items:[], truncated:false }
  const key = [seed,version,dimension,minX,minZ,maxX,maxZ,types.join(',')].join('|')
  const cached = structureCache.get(key)
  if (cached) { structureCache.delete(key); structureCache.set(key,cached); return cached }
  const bytes = await execute(['structures',version,seed,dimension,String(minX),String(minZ),String(maxX),String(maxZ),types.join(','),'2500'], false)
  const parsed = JSON.parse(bytes.toString('utf8')) as SeedMapStructureResult
  if (!parsed || !Array.isArray(parsed.items)) throw new Error('结构数据解析失败')
  const items = parsed.items.filter(item => allowed.has(item.type) && Number.isInteger(item.x) && Number.isInteger(item.z))
  return remember(structureCache,key,{ items, truncated:parsed.truncated === true },48)
}
