<template>
  <div class="page-container w-full h-full flex flex-col overflow-y-auto">
    <div class="editor-header">
      <h2>棋子审核台</h2>
      <p class="subtitle">待审核的玩家投稿。请先点击「查看详情」核对棋子内容（含七视图），再决定是否通过或驳回。通过时可选择是否公开（公开后全员可用）。</p>
      <button class="btn btn-secondary btn-mini" @click="load" :disabled="loading">刷新</button>
    </div>

    <div v-if="loading" class="empty-state">加载中…</div>
    <div v-else-if="units.length === 0" class="empty-state">暂无待审核棋子。</div>
    <div v-else class="review-wrap">
      <!-- 概览表格：一屏纵览所有待审棋子的关键字段 -->
      <table class="review-table">
        <thead>
          <tr>
            <th>投稿者</th>
            <th>名称</th>
            <th>代号</th>
            <th>阵营</th>
            <th>分类</th>
            <th>体型</th>
            <th>等级</th>
            <th>总点数</th>
            <th>提交时间</th>
            <th class="col-act">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="unit in units" :key="unit.id" :class="{ 'row-busy': busy === unit.id }">
            <td class="cell-owner">{{ unit.owner_name || unit.owner_id }}</td>
            <td class="cell-name">{{ unit.name }}</td>
            <td class="cell-code">{{ unit.codename || '—' }}</td>
            <td>{{ unit.faction }}</td>
            <td>{{ unit.category }}</td>
            <td>{{ unit.size?.toUpperCase() || 'M' }}</td>
            <td>T{{ unit.tier }}</td>
            <td>{{ unit.total_points ?? '—' }}</td>
            <td class="cell-time">{{ unit.created_at }}</td>
            <td class="col-act">
              <button class="btn btn-secondary btn-mini" @click="openDetail(unit)">详情</button>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- 卡片区：每张卡片承载完整操作与要点，信息不再挤成一团 -->
      <div class="review-grid">
        <div v-for="unit in units" :key="unit.id" class="review-card">
          <div class="review-main">
            <h3>{{ unit.name }}
              <span class="meta">T{{ unit.tier }} · {{ unit.category }} · {{ unit.size?.toUpperCase() || 'M' }}</span>
            </h3>
            <p v-if="unit.codename" class="meta">代号: {{ unit.codename }}</p>
            <p class="faction">{{ unit.faction }}</p>
            <p class="meta">投稿者: {{ unit.owner_name || unit.owner_id }}</p>
            <p class="meta" v-if="unit.total_points != null">总点数: {{ unit.total_points }}</p>
          </div>
          <div class="review-actions">
            <button class="btn btn-secondary btn-mini" @click="openDetail(unit)">查看详情</button>
            <label class="pub-toggle">
              <input type="checkbox" v-model="unit._public" /> 审核通过即公开
            </label>
            <button class="btn btn-primary btn-mini" @click="approve(unit)" :disabled="busy === unit.id">通过</button>
            <button class="btn btn-delete btn-mini" @click="reject(unit)" :disabled="busy === unit.id">驳回</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 详情弹窗：完整内容 + 七视图 -->
    <div v-if="detail" class="modal-mask" @click.self="closeDetail">
      <div class="modal-box">
        <div class="modal-head">
          <h3>{{ detail.name }} <span class="meta">T{{ detail.tier }} · {{ detail.category }} · {{ detail.size?.toUpperCase() }}</span></h3>
          <button class="btn btn-ghost btn-mini" @click="closeDetail">关闭</button>
        </div>
        <div class="modal-body">
          <div class="detail-meta">
            <span v-if="detail.codename">代号：{{ detail.codename }}</span>
            <span>阵营：{{ detail.faction }}</span>
            <span>投稿者：{{ detail.owner_name || detail.owner_id }}</span>
            <span v-if="detail.totalPoints != null">总点数：{{ detail.totalPoints }}</span>
          </div>

          <h4 class="detail-sub">七视图</h4>
          <div class="seven-views">
            <div v-for="d in 7" :key="d - 1" class="view-slot">
              <div class="view-img-wrap">
                <img v-if="viewUrl(detail, d - 1)" :src="viewUrl(detail, d - 1)" @error="onImgError" alt="视图" />
                <span v-else class="view-empty">无图</span>
              </div>
              <span class="view-dir">{{ dirLabel(d - 1) }}</span>
            </div>
          </div>

          <h4 class="detail-sub">数值（stats）</h4>
          <pre class="stats-preview">{{ prettyStats(detail) }}</pre>

          <h4 class="detail-sub">技能（skills）</h4>
          <div v-if="detail.skills && detail.skills.length" class="skill-list">
            <div v-for="(s, i) in detail.skills" :key="i" class="skill-item">
              <strong>{{ s.name || '(未命名)' }}</strong>
              <span class="meta"> {{ s.type || '' }} · 射程 {{ s.range || '—' }}</span>
              <div v-if="s.effect" class="skill-eff">{{ s.effect }}</div>
            </div>
          </div>
          <p v-else class="meta">无技能</p>

          <h4 class="detail-sub">部件（attributes.parts）</h4>
          <div v-if="partsList(detail).length" class="part-list">
            <div v-for="p in partsList(detail)" :key="p.slot" class="part-item">
              <strong>{{ p.slot }}</strong>：{{ p.type }}（结构 {{ p.结构 }}，机动 {{ p.机动 }}，格斗 {{ p.格斗 }}，射击 {{ p.射击 }}）
            </div>
          </div>
          <p v-else class="meta">无部件数据</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { hangarAPI as unitsAPI } from '../api/client.js'

const units = ref([])
const loading = ref(false)
const busy = ref(null)
const detail = ref(null)

const DIR_LABELS = ['正面', '右前', '右后', '背面', '左后', '左前', '等距']

function dirLabel(d) { return DIR_LABELS[d] || ('方向' + d) }
function viewUrl(u, d) {
  const v = u.view_urls || {}
  return v[d] || v[String(d)] || null
}
function partsList(u) {
  try {
    const parts = u.attributes?.parts || {}
    return Object.keys(parts).map(k => ({ slot: k, ...parts[k] }))
  } catch { return [] }
}
function prettyStats(u) {
  try {
    const s = u.stats || {}
    const keys = ['hp', 'maxHp', 'armor', 'shield', 'attack', 'defense', 'speed', 'mobility', 'range']
    return keys.filter(k => s[k] !== undefined).map(k => `${k}: ${s[k]}`).join('  ') || '—'
  } catch { return '—' }
}

function openDetail(u) { detail.value = u }
function closeDetail() { detail.value = null }
function onImgError(e) { e.target.style.visibility = 'hidden' }

async function load() {
  loading.value = true
  try {
    const res = await unitsAPI.getReviewQueue()
    units.value = (res.data.units || []).map(u => ({ ...u, _public: true }))
  } catch (e) {
    units.value = []
  } finally {
    loading.value = false
  }
}

async function approve(u) {
  busy.value = u.id
  try {
    await unitsAPI.reviewUnit(u.id, 'approve', u._public)
    units.value = units.value.filter(x => x.id !== u.id)
    if (detail.value && detail.value.id === u.id) detail.value = null
  } catch (e) {
    alert((e?.response?.data?.message) || '审核失败')
  } finally {
    busy.value = null
  }
}

async function reject(u) {
  busy.value = u.id
  try {
    await unitsAPI.reviewUnit(u.id, 'reject')
    units.value = units.value.filter(x => x.id !== u.id)
    if (detail.value && detail.value.id === u.id) detail.value = null
  } catch (e) {
    alert((e?.response?.data?.message) || '操作失败')
  } finally {
    busy.value = null
  }
}

onMounted(load)
</script>

<style scoped>
.modal-mask {
  position: fixed; inset: 0; background: rgba(0,0,0,0.55);
  display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 24px;
}
.modal-box {
  background: #1a1410; border: 1px solid #4a3a28; border-radius: 10px;
  width: min(860px, 96vw); max-height: 90vh; overflow-y: auto; color: #e8dcc8;
}
.modal-head {
  display: flex; justify-content: space-between; align-items: center;
  padding: 14px 18px; border-bottom: 1px solid #3a2e20; position: sticky; top: 0; background: #1a1410;
}
.modal-body { padding: 16px 18px; }
.detail-meta { display: flex; flex-wrap: wrap; gap: 14px; color: #b8a888; font-size: 13px; margin-bottom: 10px; }
.detail-sub { margin: 18px 0 8px; color: #f0c478; border-left: 3px solid #f0c478; padding-left: 8px; }
.seven-views { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.view-slot { text-align: center; }
.view-img-wrap {
  width: 100%; aspect-ratio: 1 / 1; background: #0f0b08; border: 1px solid #3a2e20;
  border-radius: 6px; display: flex; align-items: center; justify-content: center; overflow: hidden;
}
.view-img-wrap img { max-width: 100%; max-height: 100%; object-fit: contain; }
.view-empty { color: #6a5a44; font-size: 12px; }
.view-dir { display: block; margin-top: 4px; color: #b8a888; font-size: 12px; }
.stats-preview {
  background: #0f0b08; border: 1px solid #3a2e20; border-radius: 6px; padding: 10px;
  white-space: pre-wrap; word-break: break-word; font-size: 13px; color: #d8c8a8;
}
.skill-list, .part-list { display: flex; flex-direction: column; gap: 8px; }
.skill-item, .part-item {
  background: #0f0b08; border: 1px solid #3a2e20; border-radius: 6px; padding: 8px 10px; font-size: 13px;
}
.skill-eff { color: #b8a888; margin-top: 4px; }
.btn-ghost { background: transparent; border: 1px solid #4a3a28; color: #e8dcc8; }
.meta { color: #a08a68; font-size: 12px; }

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
.review-table .cell-code { color: #b8a888; }
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
</style>
