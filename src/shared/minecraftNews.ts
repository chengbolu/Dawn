import type { MinecraftNewsItem } from './types'

interface OfficialSearchItem {
  title?: unknown
  url?: unknown
  tags?: unknown
  time?: unknown
  type?: unknown
  locale?: unknown
}

const OFFICIAL_HOST = 'www.minecraft.net'
const ARTICLE_PATH = /^\/(?:[a-z]{2}(?:-[a-z]+)?)\/article\/[^/?#]+$/i

/** 只接受官网搜索接口返回的 HTTPS 文章地址，防止 IPC 被滥用于打开任意链接。 */
export function normalizeOfficialArticleUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.hostname !== OFFICIAL_HOST || !ARTICLE_PATH.test(url.pathname)) return null
    url.hash = ''
    return url.toString()
  } catch {
    return null
  }
}

export function minecraftNewsCategory(title: string, rawTags: unknown): string {
  const tags = Array.isArray(rawTags) ? rawTags.filter((tag): tag is string => typeof tag === 'string') : []
  const normalized = title.toLowerCase()
  if (/snapshot/.test(normalized)) return 'Java 快照'
  if (/pre[- ]release/.test(normalized)) return 'Java 预发布'
  if (/release candidate/.test(normalized)) return 'Java 候选版'
  if (/preview/.test(normalized) && tags.some(tag => tag.includes('minecraft-bedrock'))) return '基岩版预览'
  if (/changelog|java edition \d|bedrock edition \d/.test(normalized) || tags.includes('minecraft:news/updates')) return '版本更新'
  if (tags.includes('minecraft:marketplace')) return '商城资讯'
  if (tags.some(tag => tag.includes('minecraft-dungeons'))) return 'Dungeons'
  if (tags.some(tag => tag.includes('realms'))) return 'Realms'
  return '官方公告'
}

/** 将 Minecraft 官网搜索 API 返回值收窄为渲染层可用的安全字段。 */
export function parseMinecraftNewsPayload(payload: unknown, limit = 5): MinecraftNewsItem[] {
  const root = payload as { result?: { results?: unknown } } | null
  const rows = root?.result?.results
  if (!Array.isArray(rows)) throw new Error('Minecraft 资讯数据格式不正确')
  const seen = new Set<string>()
  const items: MinecraftNewsItem[] = []
  for (const raw of rows as OfficialSearchItem[]) {
    const title = typeof raw?.title === 'string' ? raw.title.trim() : ''
    const url = normalizeOfficialArticleUrl(raw?.url)
    const seconds = typeof raw?.time === 'number' ? raw.time : Number(raw?.time)
    if (!title || !url || !Number.isFinite(seconds) || seconds <= 0 || seen.has(url)) continue
    const publishedAt = new Date(seconds * 1000)
    if (!Number.isFinite(publishedAt.getTime())) continue
    seen.add(url)
    items.push({
      id: new URL(url).pathname.split('/').pop()!,
      title,
      publishedAt: publishedAt.toISOString(),
      category: minecraftNewsCategory(title, raw.tags),
      url,
      locale: typeof raw.locale === 'string' ? raw.locale : 'zh-cn'
    })
  }
  return items.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)).slice(0, Math.max(0, limit))
}
