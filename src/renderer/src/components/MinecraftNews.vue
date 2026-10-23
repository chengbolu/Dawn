<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { MinecraftNewsItem } from '@shared/types'
import { errText, getMinecraftNews, openMinecraftNews } from '../api'

const items = ref<MinecraftNewsItem[]>([])
const loading = ref(true)
const error = ref('')
const notice = ref('')
const fetchedAt = ref(0)
let requestId = 0

function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
    : '日期未知'
}

function cacheStatus(): string {
  if (!fetchedAt.value) return ''
  const time = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date(fetchedAt.value))
  return notice.value ? `缓存更新于 ${time}` : `更新于 ${time}`
}

async function load(refresh = false): Promise<void> {
  const current = ++requestId
  loading.value = true
  error.value = ''
  try {
    const result = await getMinecraftNews(refresh)
    if (current !== requestId) return
    items.value = result.items
    fetchedAt.value = result.fetchedAt
    notice.value = result.notice ?? ''
  } catch (reason) {
    if (current !== requestId) return
    error.value = errText(reason).replace(/^Error invoking remote method '[^']+':\s*/, '')
    notice.value = ''
  } finally {
    if (current === requestId) loading.value = false
  }
}

async function open(item: MinecraftNewsItem): Promise<void> {
  try {
    await openMinecraftNews(item.url)
  } catch (reason) {
    error.value = errText(reason).replace(/^Error invoking remote method '[^']+':\s*/, '')
  }
}

onMounted(() => { void load(false) })
</script>

<template>
  <section class="minecraft-news" aria-labelledby="minecraft-news-title">
    <header>
      <div>
        <h3 id="minecraft-news-title">Minecraft 资讯</h3>
        <span>来自 Minecraft 官方</span>
      </div>
      <button class="news-refresh" type="button" :disabled="loading" title="刷新 Minecraft 资讯" aria-label="刷新 Minecraft 资讯" @click="load(true)">
        <svg :class="{ spinning: loading }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7v5h-5" /><path d="M4 17v-5h5" /><path d="M6.1 9A7 7 0 0 1 18 6l2 1M4 17l2 1a7 7 0 0 0 11.9-3" /></svg>
      </button>
    </header>

    <div v-if="loading && !items.length" class="news-state" role="status">
      <span class="news-spinner"></span>
      <span>正在获取最新资讯…</span>
    </div>
    <div v-else-if="error && !items.length" class="news-state news-error">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v6m0 4h.01"/></svg>
      <span>{{ error }}</span>
      <button type="button" @click="load(true)">重新加载</button>
    </div>
    <div v-else class="news-list" :aria-busy="loading">
      <button v-for="item in items" :key="item.id" class="news-item" type="button" :title="`打开官网：${item.title}`" @click="open(item)">
        <span class="news-title">{{ item.title }}</span>
        <span class="news-meta">
          <span class="news-tag">{{ item.category }}</span>
          <time :datetime="item.publishedAt">{{ formatDate(item.publishedAt) }}</time>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 5h5v5"/><path d="m10 14 9-9"/><path d="M19 13v6H5V5h6"/></svg>
        </span>
      </button>
    </div>

    <footer v-if="items.length">
      <span :class="{ warning: notice }" :title="notice || cacheStatus()">{{ notice || cacheStatus() }}</span>
      <span v-if="loading">刷新中…</span>
    </footer>
  </section>
</template>

<style scoped>
.minecraft-news {
  display: flex;
  height: 300px;
  min-height: 240px;
  min-width: 0;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg, 15px);
  background: var(--surface-content);
  box-shadow: var(--shadow);
}
header { display: flex; flex: none; align-items: flex-start; justify-content: space-between; padding: 15px 15px 10px 17px; }
header > div { display: flex; min-width: 0; flex-direction: column; gap: 3px; }
h3 { color: var(--text); font-size: 14px; font-weight: 720; }
header span { color: var(--text-dim); font-size: 10px; }
.news-refresh { display: inline-flex; width: 30px; height: 30px; flex: none; align-items: center; justify-content: center; border: 0; border-radius: 8px; background: transparent; color: var(--text-dim); cursor: pointer; }
.news-refresh:hover:not(:disabled) { background: var(--hover); color: var(--text); }
.news-refresh:disabled { opacity: .45; cursor: default; }
.news-refresh svg { width: 17px; height: 17px; }
.spinning { animation: news-spin .8s linear infinite; }
.news-list { min-height: 0; flex: 1; overflow-x: hidden; overflow-y: auto; padding: 0 9px 6px; scrollbar-width: thin; scrollbar-color: color-mix(in srgb, var(--accent) 38%, transparent) transparent; }
.news-item { display: flex; width: 100%; min-width: 0; flex-direction: column; gap: 7px; padding: 10px 9px; border: 0; border-radius: 10px; background: transparent; color: var(--text); font-family: inherit; text-align: left; cursor: pointer; transition: background .16s ease, transform .16s ease; }
.news-item + .news-item { border-top: 1px solid color-mix(in srgb, var(--border) 72%, transparent); border-radius: 0 0 10px 10px; }
.news-item:hover, .news-item:focus-visible { background: color-mix(in srgb, var(--accent) 10%, transparent); outline: none; transform: translateX(2px); }
.news-title { display: -webkit-box; overflow: hidden; font-size: 12px; font-weight: 620; line-height: 1.45; overflow-wrap: anywhere; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.news-meta { display: flex; min-width: 0; align-items: center; gap: 7px; color: var(--text-dim); font-size: 10px; }
.news-tag { max-width: 94px; overflow: hidden; padding: 2px 6px; border-radius: 999px; background: var(--accent-soft); color: var(--accent-2); font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.news-meta time { white-space: nowrap; }
.news-meta svg { width: 12px; height: 12px; margin-left: auto; flex: none; opacity: .65; }
.news-state { display: flex; min-height: 0; flex: 1; align-items: center; justify-content: center; gap: 9px; padding: 22px; color: var(--text-dim); font-size: 11px; text-align: center; }
.news-spinner { width: 15px; height: 15px; flex: none; border: 2px solid color-mix(in srgb, var(--accent) 24%, transparent); border-top-color: var(--accent-2); border-radius: 50%; animation: news-spin .8s linear infinite; }
.news-error { flex-direction: column; line-height: 1.6; }
.news-error svg { width: 22px; height: 22px; color: var(--danger); }
.news-error button { padding: 6px 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--card-2); color: var(--text); font: inherit; cursor: pointer; }
footer { display: flex; min-height: 27px; flex: none; align-items: center; justify-content: space-between; gap: 8px; padding: 5px 14px 7px; border-top: 1px solid color-mix(in srgb, var(--border) 68%, transparent); color: var(--text-dim); font-size: 9px; }
footer span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
footer .warning { color: color-mix(in srgb, var(--warning, #d9a441) 82%, var(--text)); }
@keyframes news-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spinning, .news-spinner { animation-duration: 1.8s; } .news-item { transition: none; } }
</style>
