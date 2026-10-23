import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const root = path.resolve(__dirname, '..')
const engine = path.join(root, 'out', 'main', 'SeedMapEngine.exe')

test('seed map ships the MIT Cubiomes source and original native engine', () => {
  assert.ok(fs.existsSync(path.join(root, 'vendor', 'cubiomes', 'LICENSE')))
  assert.match(fs.readFileSync(path.join(root, 'licenses', 'cubiomes.txt'), 'utf8'), /MIT License/)
  assert.ok(fs.existsSync(engine), 'SeedMapEngine.exe should be built by the native build hook')
})

test('seed map calculates deterministic real structures for seed 0', () => {
  const text = execFileSync(engine, [
    'structures', '1.21.4', '0', 'overworld', '-2500', '-2500', '2500', '2500', 'village,stronghold', '2500'
  ], { encoding: 'utf8', windowsHide: true })
  const result = JSON.parse(text) as { items: Array<{ type: string; x: number; z: number }> }
  assert.ok(result.items.some(item => item.type === 'stronghold' && item.x === -204 && item.z === -1692))
  assert.ok(result.items.some(item => item.type === 'village'))
})

test('seed map accepts negative 64-bit seeds and returns a complete RGBA tile', () => {
  const rgba = execFileSync(engine, [
    'biomes', '1.20.6', '-9223372036854775808', 'overworld', '-512', '-512', '16', '16', '4', '64'
  ], { encoding: 'buffer', windowsHide: true })
  assert.equal(rgba.length, 16 * 16 * 4)
  assert.ok(rgba.some((value, index) => index % 4 !== 3 && value !== 0), 'biome tile should contain generated color data')
  assert.ok(rgba.every((value, index) => index % 4 !== 3 || value === 255), 'every generated pixel should be opaque')
})

test('seed map UI exposes navigation, dimension, filters and tiled interaction', () => {
  const app = fs.readFileSync(path.join(root, 'src', 'renderer', 'src', 'App.vue'), 'utf8')
  const view = fs.readFileSync(path.join(root, 'src', 'renderer', 'src', 'views', 'SeedMapView.vue'), 'utf8')
  const service = fs.readFileSync(path.join(root, 'src', 'main', 'core', 'seedMap.ts'), 'utf8')
  assert.match(app, /种子地图/)
  assert.match(view, /游戏版本/)
  assert.match(service, /主世界/)
  assert.match(view, /复制坐标/)
  assert.match(view, /wheel/)
  assert.match(view, /const tiles = new Map/)
})
