import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { normalizeOfficialArticleUrl, parseMinecraftNewsPayload } from '../src/shared/minecraftNews'

test('official Minecraft search payload is validated, classified and sorted', () => {
  const payload = { result: { results: [
    { title: 'Official announcement', url: 'https://www.minecraft.net/zh-hans/article/official-announcement', time: 1_790_000_000, tags: ['minecraft:news'], locale: 'zh-cn' },
    { title: 'Minecraft 26.4 Snapshot 5', url: 'https://www.minecraft.net/zh-hans/article/minecraft-26-4-snapshot-5', time: 1_792_504_800, tags: ['minecraft:news', 'minecraft:games/minecraft-java'], locale: 'zh-cn' },
    { title: 'Unsafe', url: 'https://example.com/article/unsafe', time: 1_800_000_000, tags: [] }
  ] } }
  const items = parseMinecraftNewsPayload(payload)
  assert.deepEqual(items.map(item => item.title), ['Minecraft 26.4 Snapshot 5', 'Official announcement'])
  assert.equal(items[0].category, 'Java 快照')
  assert.equal(items[0].locale, 'zh-cn')
  assert.equal(normalizeOfficialArticleUrl('javascript:alert(1)'), null)
  assert.equal(normalizeOfficialArticleUrl('https://www.minecraft.net/zh-hans/article/a'), 'https://www.minecraft.net/zh-hans/article/a')
})

test('Minecraft news uses the official async API, cache fallback and secure external opening', () => {
  const service = fs.readFileSync('src/main/core/minecraftNews.ts', 'utf8')
  const ipc = fs.readFileSync('src/main/ipc.ts', 'utf8')
  const home = fs.readFileSync('src/renderer/src/views/HomeView.vue', 'utf8')
  assert.match(service, /net-secondary\.web\.minecraft-services\.net\/api\/v1\.0\/zh-cn\/search/)
  assert.match(service, /CACHE_TTL_MS = 30 \* 60_000/)
  assert.match(service, /AbortSignal\.timeout\(REQUEST_TIMEOUT_MS\)/)
  assert.match(service, /systemProxy: true/)
  assert.match(service, /network|网络连接异常|网络/) // stale-cache path remains user friendly
  assert.match(ipc, /shell\.openExternal\(minecraftNews\.requireOfficialArticleUrl\(url\)\)/)
  assert.match(home, /<MinecraftNews class="news-panel"/)
})

test('Minecraft news card compiles and keeps its list internally scrollable', () => {
  const file = 'src/renderer/src/components/MinecraftNews.vue'
  const source = fs.readFileSync(file, 'utf8')
  const { descriptor, errors } = parse(source)
  assert.deepEqual(errors, [])
  const script = compileScript(descriptor, { id: file })
  const result = compileTemplate({ source: descriptor.template!.content, filename: file, id: file, compilerOptions: { bindingMetadata: script.bindings } })
  assert.deepEqual(result.errors, [])
  assert.match(source, /\.news-list \{[^}]*overflow-y: auto/)
  assert.match(source, /onMounted\(\(\) => \{ void load\(false\) \}\)/)
  assert.match(source, /@click="load\(true\)"/)
})
