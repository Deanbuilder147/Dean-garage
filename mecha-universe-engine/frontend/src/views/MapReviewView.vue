<template>
  <div class="page-container w-full h-full flex flex-col overflow-y-auto">
    <div class="editor-header">
      <h2>地图审核台</h2>
      <p class="subtitle">待审核的玩家投稿地图。请先点击「查看详情」核对地形与出生点配置，再决定是否通过或驳回。通过时默认公开（全员可用），亦可选择仅保留不公开。</p>
      <button class="btn btn-secondary btn-mini" @click="load" :disabled="loading">刷新</button>
    </div>

    <div v-if="loading" class="empty-state">加载中…</div>
    <div v-else-if="maps.length === 0" class="empty-state">暂无待审核地图。</div>
    <div v-else class="review-wrap">
      <!-- 概览表格：一屏纵览所有待审地图的关键字段 -->
      <table class="review-table">
        <thead>
          <tr>
            <th>投稿者</th>
            <th>名称</th>
            <th>格数</th>
            <th>出生点</th>
            <th>尺寸</th>
            <th>地形种类</th>
            <th>提交时间</th>
            <th class="col-act">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="m in maps" :key="m.id" :class="{ 'row-busy': busy === m.id }">
            <td class="cell-owner">{{ m.original_author_id }}</td>
            <td class="cell-name">{{ m.name }}</td>
            <td>{{ cellCount(m) }}</td>
            <td>{{ (m.spawn_points || []).length }}</td>
            <td>{{ (m.width || 100) }} × {{ (m.height || 100) }}</td>
            <td>{{ terrainTypeCount(m) }}</td>
            <td class="cell-time">{{ m.created_at }}</td>
            <td class="col-act">
              <button class="btn btn-secondary btn-mini" @click="openDetail(m)">详情</button>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- 卡片区：每张卡片承载完整操作与要点，信息不再挤成一团 -->
      <div class="review-grid">
        <div v-for="m in maps" :key="m.id" class="review-card">
          <div class="review-main">
            <h3>{{ m.name }}
              <span class="meta">格数 {{ cellCount(m) }} · 出生点 {{ (m.spawn_points || []).length }}</span>
            </h3>
            <p class="faction">{{ factionSummary(m) }}</p>
            <p class="meta">投稿者: {{ m.original_author_id }}</p>
            <p class="meta">地形种类: {{ terrainTypeCount(m) }}</p>
          </div>
          <div class="review-actions">
            <button class="btn btn-secondary btn-mini" @click="openDetail(m)">查看详情</button>
            <label class="pub-toggle">
              <input type="checkbox" v-model="m._public" /> 审核通过即公开
            </label>
            <button class="btn btn-primary btn-mini" @click="approve(m)" :disabled="busy === m.id">通过</button>
            <button class="btn btn-delete btn-mini" @click="reject(m)" :disabled="busy === m.id">驳回</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 详情弹窗 -->
    <div v-if="detail" class="modal-mask" @click.self="closeDetail">
      <div class="modal-box">
        <div class="modal-head">
          <h3>{{ detail.name }} <span class="meta">格数 {{ cellCount(detail) }}</span></h3>
          <button class="btn btn-ghost btn-mini" @click="closeDetail">关闭</button>
        </div>
        <div class="modal-body">
          <div class="detail-meta">
            <span>投稿者：{{ detail.original_author_id }}</span>
            <span>尺寸：{{ detail.width || 100 }} × {{ detail.height || 100 }}</span>
            <span>出生点：{{ (detail.spawn_points || []).length }}</span>
          </div>

          <h4 class="detail-sub">地形分布</h4>
          <div class="terrain-summary">
            <span v-for="(c, t) in terrainCount(detail)" :key="t" class="ts-item">
              <span class="ts-dot" :style="{ background: terrainColor(t) }"></span>{{ t }}: {{ c }}
            </span>
            <span v-if="Object.keys(terrainCount(detail)).length === 0" class="meta">无地形数据</span>
          </div>

          <h4 class="detail-sub">出生点（阵营分配）</h4>
          <div v-if="(detail.spawn_points || []).length" class="spawn-list">
            <div v-for="(sp, i) in detail.spawn_points" :key="i" class="spawn-item">
              ({{ sp.q }}, {{ sp.r }}) → {{ sp.faction || '未分配' }}
            </div>
          </div>
          <p v-else class="meta">无出生点</p>

          <h4 class="detail-sub">属性（attributes）</h4>
          <pre class="stats-preview">{{ prettyAttrs(detail) }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { mapAPI } from '../api/client.js'
import { terrainAPI } from '../api/client.js'

const maps = ref([])
const loading = ref(false)
const busy = ref(null)
const detail = ref(null)
const terrainDefs = ref([])

function cellCount(m) {
  try { return (m.cells || []).filter(c => c && c.t).length } catch { return 0 }
}
function terrainTypeCount(m) {
  try { return Object.keys(terrainCount(m)).length } catch { return 0 }
}
function factionSummary(m) {
  const sp = m.spawn_points || []
  if (!sp.length) return '未配置出生点'
  const byF = {}
  sp.forEach(p => { const f = p.faction || '未分配'; byF[f] = (byF[f] || 0) + 1 })
  return Object.keys(byF).map(f => `${f}×${byF[f]}`).join(' · ')
}
function terrainCount(m) {
  const out = {}
  try {
    (m.cells || []).forEach(c => { if (c && c.t) out[c.t] = (out[c.t] || 0) + 1 })
  } catch { /* noop */ }
  return out
}
function terrainColor(t) {
  const def = terrainDefs.value.find(d => d.id === t)
  return def ? def.color : '#444'
}
function prettyAttrs(m) {
  try {
    const a = m.attributes || {}
    return Object.keys(a).length ? JSON.stringify(a, null, 2) : '—'
  } catch { return '—' }
}

function openDetail(m) { detail.value = m }
function closeDetail() { detail.value = null }

async function load() {
  loading.value = true
  try {
    const res = await mapAPI.getReviewQueue()
    maps.value = (res.data.maps || []).map(m => ({ ...m, _public: true }))
  } catch (e) {
    maps.value = []
  } finally {
    loading.value = false
  }
}

async function approve(m) {
  busy.value = m.id
  try {
    await mapAPI.reviewMap(m.id, 'approve', m._public)
    maps.value = maps.value.filter(x => x.id !== m.id)
    if (detail.value && detail.value.id === m.id) detail.value = null
  } catch (e) {
    alert((e?.response?.data?.message) || '审核失败')
  } finally {
    busy.value = null
  }
}

async function reject(m) {
  busy.value = m.id
  try {
    await mapAPI.reviewMap(m.id, 'reject')
    maps.value = maps.value.filter(x => x.id !== m.id)
    if (detail.value && detail.value.id === m.id) detail.value = null
  } catch (e) {
    alert((e?.response?.data?.message) || '操作失败')
  } finally {
    busy.value = null
  }
}

onMounted(async () => {
  await load()
  try {
    const { data } = await terrainAPI.getTerrainTypes()
    terrainDefs.value = data.terrains || data || []
  } catch { /* noop */ }
})
</script>

<style scoped>
.review-wrap { display: flex; flex-direction: column; gap: 20px; }
.review-table {
  width: 100%; border-collapse: collapse; font-size: 13px; color: #e8dcc8;
  background: #1a1410; border: 1px solid #3a2e20; border-radius: 8px; overflow: hidden;
}
.review-table th, .review-table td {
  padding: 9px 10px; text-align: left; border-bottom: 1px solid #2c2218; white-space: nowrap;
}
.review-table th { background: #241a12; color: #f0c478; font-weight: 600; }
.review-table tbody tr:hover { background: #221913; }
.review-table tr.row-busy { opacity: 0.5; }
.review-table .cell-owner { color: #f0e0c8; font-weight: 600; }
.review-table .cell-name { color: #e8dcc8; }
.review-table .cell-time { color: #8a7a60; font-size: 12px; }
.review-table .col-act { text-align: right; }

.review-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 14px;
}
.review-card {
  display: flex; gap: 16px; align-items: flex-start; justify-content: space-between;
  background: #1a1410; border: 1px solid #3a2e20; border-radius: 10px; padding: 14px 16px;
}
.review-main { min-width: 0; }
.review-main h3 { margin: 0 0 6px; font-size: 16px; color: #f0e0c8; }
.faction { color: #c8b088; font-size: 13px; margin: 2px 0; }
.review-actions { display: flex; flex-direction: column; gap: 8px; align-items: flex-end; flex-shrink: 0; }
.pub-toggle { font-size: 12px; color: #b8a888; display: flex; align-items: center; gap: 6px; }

.empty-state { padding: 40px; text-align: center; color: #8a7a60; }

.modal-mask {
  position: fixed; inset: 0; background: rgba(0,0,0,0.55);
  display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 24px;
}
.modal-box {
  background: #1a1410; border: 1px solid #4a3a28; border-radius: 10px;
  width: min(820px, 96vw); max-height: 90vh; overflow-y: auto; color: #e8dcc8;
}
.modal-head {
  display: flex; justify-content: space-between; align-items: center;
  padding: 14px 18px; border-bottom: 1px solid #3a2e20; position: sticky; top: 0; background: #1a1410;
}
.modal-body { padding: 16px 18px; }
.detail-meta { display: flex; flex-wrap: wrap; gap: 14px; color: #b8a888; font-size: 13px; margin-bottom: 10px; }
.detail-sub { margin: 18px 0 8px; color: #f0c478; border-left: 3px solid #f0c478; padding-left: 8px; }
.terrain-summary { display: flex; flex-wrap: wrap; gap: 10px; }
.ts-item { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; background: #0f0b08; border: 1px solid #3a2e20; border-radius: 5px; padding: 4px 8px; }
.ts-dot { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
.spawn-list { display: flex; flex-direction: column; gap: 4px; font-family: monospace; font-size: 13px; }
.spawn-item { background: #0f0b08; border: 1px solid #3a2e20; border-radius: 5px; padding: 5px 8px; }
.stats-preview {
  background: #0f0b08; border: 1px solid #3a2e20; border-radius: 6px; padding: 10px;
  white-space: pre-wrap; word-break: break-word; font-size: 13px; color: #d8c8a8;
}
.btn-ghost { background: transparent; border: 1px solid #4a3a28; color: #e8dcc8; }
.meta { color: #a08a68; font-size: 12px; }
</style>
