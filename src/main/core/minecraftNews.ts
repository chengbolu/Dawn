import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { app } from 'electron'
import type { MinecraftNewsItem, MinecraftNewsResult } from '../../shared/types'
import { normalizeOfficialArticleUrl, parseMinecraftNewsPayload } from '../../shared/minecraftNews'
import { httpFetch } from './httpClient'
import { logScope } from './launcherLog'

const log = logScope('minecraft-news')
const NEWS_ENDPOINT = 'https://net-secondary.web.minecraft-services.net/api/v1.0/zh-cn/search'
const CACHE_TTL_MS = 30 * 60_000
const REQUEST_TIMEOUT_MS = 10_000
const DISPLAY_LIMIT = 5
const FETCH_LIMIT = 8

interface NewsCache {
  version: 1
  fetchedAt: number
  items: MinecraftNewsItem[]
}

let activeRequest: Promise<MinecraftNewsResult> | null = null

function cacheFile(): string {
  return path.join(app.getPath('userData'), 'cache', 'minecraft-news-v1.json')
}

function validCachedItem(item: unknown): item is MinecraftNewsItem {
  const value = item as MinecraftNewsItem | null
  return !!value
    && typeof value.id === 'string'
    && typeof value.title === 'string'
    && typeof value.category === 'string'
    && typeof value.locale === 'string'
    && Number.isFinite(Date.parse(value.publishedAt))
    && normalizeOfficialArticleUrl(value.url) === value.url
}

function readCache(): NewsCache | null {
  try {
    const value = JSON.parse(fs.readFileSync(cacheFile(), 'utf8')) as Partial<NewsCache>
    if (value.version !== 1 || !Number.isFinite(value.fetchedAt) || !Array.isArray(value.items)) return null
    const items = value.items.filter(validCachedItem).slice(0, DISPLAY_LIMIT)
    return items.length ? { version: 1, fetchedAt: value.fetchedAt!, items } : null
  } catch {
    return null
  }
}

async function writeCache(cache: NewsCache): Promise<void> {
  const file = cacheFile()
  const temporary = `${file}.${randomUUID()}.tmp`
  try {
    await fs.promises.mkdir(path.dirname(file), { recursive: true })
    await fs.promises.writeFile(temporary, JSON.stringify(cache), { encoding: 'utf8', flag: 'wx' })
    await fs.promises.rename(temporary, file)
  } catch (error) {
    log.debug('资讯缓存写入失败（不影响展示）', error)
  } finally {
    await fs.promises.rm(temporary, { force: true }).catch(() => undefined)
  }
}

function endpoint(): string {
  const url = new URL(NEWS_ENDPOINT)
  url.search = new URLSearchParams({
    category: 'News',
    sortType: 'Recent',
    newsOnly: 'true',
    page: '1',
    pageSize: String(FETCH_LIMIT),
    geography: 'CN'
  }).toString()
  return url.toString()
}

async function fetchOfficialNews(): Promise<MinecraftNewsItem[]> {
  const response = await httpFetch(endpoint(), {
    systemProxy: true,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      Accept: 'application/json',
      'User-Agent': 'DCL-Launcher'
    }
  })
  if (!response.ok) throw new Error(`Minecraft 官网返回 HTTP ${response.status}`)
  const items = parseMinecraftNewsPayload(await response.json(), DISPLAY_LIMIT)
  if (!items.length) throw new Error('Minecraft 官网暂未返回可用资讯')
  return items
}

async function loadNews(refresh: boolean): Promise<MinecraftNewsResult> {
  const cached = readCache()
  if (!refresh && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return { items: cached.items, fetchedAt: cached.fetchedAt, fromCache: true, stale: false }
  }
  try {
    const items = await fetchOfficialNews()
    const fetchedAt = Date.now()
    await writeCache({ version: 1, fetchedAt, items })
    return { items, fetchedAt, fromCache: false, stale: false }
  } catch (error) {
    log.warn('官方资讯获取失败', error)
    if (cached) {
      return {
        items: cached.items,
        fetchedAt: cached.fetchedAt,
        fromCache: true,
        stale: true,
        notice: '网络连接异常，当前显示上次缓存的资讯'
      }
    }
    throw new Error('暂时无法获取 Minecraft 资讯，请检查网络后重试')
  }
}

/** 启动时使用 30 分钟缓存；手动刷新绕过有效期。并发调用共享同一个请求。 */
export function getMinecraftNews(refresh = false): Promise<MinecraftNewsResult> {
  if (activeRequest) return activeRequest
  activeRequest = loadNews(refresh).finally(() => { activeRequest = null })
  return activeRequest
}

export function requireOfficialArticleUrl(value: unknown): string {
  const url = normalizeOfficialArticleUrl(value)
  if (!url) throw new Error('无效的 Minecraft 官方资讯链接')
  return url
}
