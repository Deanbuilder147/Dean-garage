<template>
  <div class="asset-gen">
    <header class="ag-header">
      <h1>AI 素材工坊</h1>
      <p class="ag-sub">上传参考图 + 描述，由 Meowa 生成游戏素材并自动落盘到服务器</p>
      <div class="ag-credits" v-if="credits !== null">
        积分: <b>{{ credits }}</b>
        <span class="ag-cost">（单位生成 -{{ cost.unit }} / 地形 -{{ cost.terrain }}）</span>
      </div>
    </header>

    <div class="ag-card">
      <!-- 类型切换 -->
      <div class="ag-tabs">
        <button :class="['ag-tab', { active: type === 'unit' }]" @click="type = 'unit'">单位七视图精灵</button>
        <button :class="['ag-tab', { active: type === 'terrain' }]" @click="type = 'terrain'">地形 Tileset</button>
      </div>

      <!-- 单位表单 -->
      <div v-if="type === 'unit'" class="ag-form">
        <label>目标单位
          <select v-model="unitCode" :disabled="loading">
            <option value="">— 选择要生成精灵的单位 —</option>
            <option v-for="u in units" :key="u.id" :value="u.codename || u.sprite_key || u.id">
              {{ u.name }}（{{ u.codename || u.sprite_key || u.id }}）
            </option>
          </select>
        </label>
        <label>风格描述（可选）
          <input v-model="style" :disabled="loading" placeholder="例如：机械朋克、低多边形、赛博霓虹" />
        </label>
      </div>

      <!-- 地形表单 -->
      <div v-else class="ag-form">
        <label>地形标识 (terrainId)
          <input v-model="terrainId" :disabled="loading" placeholder="例如：forest / mountain / desert" />
        </label>
        <label>风格描述（可选）
          <input v-model="style" :disabled="loading" placeholder="例如：可平铺石质、苔藓覆盖" />
        </label>
        <label class="ag-force">
          <input type="checkbox" v-model="force" :disabled="loading" /> 强制重新生成（忽略已生成的素材）
        </label>
      </div>

      <!-- 通用：prompt + 参考图 -->
      <label class="ag-full">生成提示词 (Prompt)
        <textarea v-model="prompt" :disabled="loading" rows="3"
          placeholder="描述你想要的素材，例如：一台人形机甲，正面站立，金属装甲，蓝色能量核心"></textarea>
      </label>

      <label class="ag-full">参考图（可选，提升相似度）
        <input type="file" accept="image/*" :disabled="loading" @change="onFile" />
        <img v-if="previewUrl" :src="previewUrl" class="ag-ref-preview" alt="参考图预览" />
      </label>

      <div class="ag-actions">
        <button class="ag-gen-btn" :disabled="loading || !canGenerate" @click="generate">
          {{ loading ? '生成中…（Meowa 通常需 1-5 分钟）' : '生成并落盘' }}
        </button>
      </div>

      <p v-if="error" class="ag-error">{{ error }}</p>

      <!-- 结果 -->
      <div v-if="result" class="ag-result">
        <h3>✅ 已生成并写入服务器</h3>
        <div v-if="type === 'unit'" class="ag-grid">
          <div v-for="(u, i) in result.previewUrls" :key="i" class="ag-cell">
            <img :src="u" :alt="`方向 ${i}`" />
            <span>方向 {{ i }}</span>
          </div>
        </div>
        <div v-else class="ag-terrain-result">
          <img :src="result.previewUrls[0]" alt="地形 tileset" />
          <div class="ag-terrain-meta">
            <p v-if="result.cached" class="ag-ok">✓ 复用已生成素材，未消耗积分。如需更新风格请勾「强制重新生成」。</p>
            <p v-if="result.configUpdated" class="ag-ok">✓ 已自动写入地形库配置，地图编辑器即显示此纹理（无需手动粘贴）。</p>
            <p v-else class="ag-hint">尚未自动联动，可在「地图编辑器」对应地形的素材字段粘贴此 URL 应用纹理。</p>
            <p>素材 URL：<code>{{ result.materialUrl }}</code></p>
            <button class="ag-copy" @click="copy(result.materialUrl)">复制 URL</button>
            <p v-if="result.configNote" class="ag-hint">{{ result.configNote }}</p>
          </div>
        </div>
        <p class="ag-applied">应用于：<b>{{ result.appliedTo }}</b> · 消耗积分 <b>{{ result.cost }}</b></p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { assetAPI } from '../api/client.js'
import { hangarAPI } from '../api/client.js'

const type = ref('unit')
const prompt = ref('')
const style = ref('')
const unitCode = ref('')
const terrainId = ref('')
const force = ref(false)
const reference = ref(null)
const previewUrl = ref('')
const loading = ref(false)
const error = ref('')
const result = ref(null)
const credits = ref(null)
const cost = ref({ unit: 2, terrain: 3 })
const units = ref([])

const canGenerate = computed(() => {
  if (!prompt.value.trim()) return false
  if (type.value === 'unit') return !!unitCode.value
  return !!terrainId.value.trim()
})

function onFile(e) {
  const f = e.target.files?.[0]
  if (!f) return
  reference.value = f
  previewUrl.value = URL.createObjectURL(f)
}

function copy(text) {
  navigator.clipboard?.writeText(text)
}

async function loadMeta() {
  try {
    const m = await assetAPI.getCredits()
    credits.value = m.credits
    cost.value = m.cost || cost.value
  } catch (e) { /* 非致命 */ }
  try {
    const r = await hangarAPI.getUnits() // 已解包为数据本身：{ units: [...] }
    const list = (r && r.units) ? r.units : (Array.isArray(r) ? r : [])
    units.value = list.filter(u => u.codename || u.sprite_key || u.id)
  } catch (e) { /* 非致命 */ }
}

async function generate() {
  error.value = ''
  result.value = null
  loading.value = true
  try {
    const payload = {
      type: type.value,
      prompt: prompt.value,
      style: style.value,
      reference: reference.value || undefined,
    }
    if (type.value === 'unit') payload.unitCode = unitCode.value
    else payload.terrainId = terrainId.value.trim()
    payload.force = force.value
    const r = await assetAPI.generate(payload)
    result.value = r
    if (r.credits !== undefined) credits.value = r.credits
    else loadMeta()
  } catch (e) {
    error.value = e?.response?.data?.error || e?.message || '生成失败'
  } finally {
    loading.value = false
  }
}

onMounted(loadMeta)
</script>

<style scoped>
.asset-gen { max-width: 880px; margin: 0 auto; padding: 24px 16px 60px; color: #f1f3fc; }
.ag-header h1 { font-size: 22px; color: #ffb000; letter-spacing: 2px; margin: 0 0 4px; }
.ag-sub { color: rgba(193,232,255,0.6); font-size: 13px; margin: 0 0 8px; }
.ag-credits { font-size: 13px; }
.ag-credits b { color: #13ff43; }
.ag-cost { color: rgba(193,232,255,0.45); font-size: 11px; }
.ag-card { background: rgba(20,24,38,0.7); border: 1px solid rgba(255,176,0,0.12); border-radius: 10px; padding: 18px; margin-top: 14px; }
.ag-tabs { display: flex; gap: 8px; margin-bottom: 16px; }
.ag-tab { flex: 1; padding: 10px; background: transparent; border: 1px solid rgba(255,176,0,0.2); color: rgba(241,243,252,0.5); border-radius: 6px; cursor: pointer; font-family: inherit; letter-spacing: 1px; }
.ag-tab.active { background: rgba(255,176,0,0.12); color: #ffb000; border-color: #ffb000; }
.ag-form { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
.ag-force { flex-direction: row; align-items: center; gap: 8px; font-size: 12px; color: rgba(193,232,255,0.7); grid-column: 1 / -1; }
label { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: rgba(193,232,255,0.7); }
.ag-full { margin-bottom: 12px; }
select, input, textarea { background: rgba(10,12,20,0.8); border: 1px solid rgba(255,176,0,0.15); color: #f1f3fc; border-radius: 6px; padding: 8px 10px; font-family: inherit; font-size: 13px; }
select:focus, input:focus, textarea:focus { outline: none; border-color: #ffb000; }
.ag-ref-preview { max-width: 160px; max-height: 160px; border-radius: 6px; border: 1px solid rgba(255,176,0,0.2); margin-top: 6px; }
.ag-actions { margin-top: 8px; }
.ag-gen-btn { width: 100%; padding: 12px; background: linear-gradient(90deg,#ffb000,#ff8c00); color: #1a1a2e; border: none; border-radius: 8px; font-weight: 700; font-size: 14px; letter-spacing: 1px; cursor: pointer; }
.ag-gen-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.ag-error { color: #ff6b6b; font-size: 13px; margin-top: 10px; }
.ag-result { margin-top: 18px; border-top: 1px solid rgba(255,176,0,0.12); padding-top: 14px; }
.ag-result h3 { color: #13ff43; font-size: 15px; margin: 0 0 12px; }
.ag-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.ag-cell { background: rgba(10,12,20,0.6); border-radius: 6px; padding: 6px; text-align: center; }
.ag-cell img { width: 100%; border-radius: 4px; background: #0a0c14; }
.ag-cell span { font-size: 10px; color: rgba(193,232,255,0.5); }
.ag-terrain-result { display: flex; gap: 16px; align-items: flex-start; }
.ag-terrain-result img { max-width: 240px; border-radius: 6px; border: 1px solid rgba(255,176,0,0.2); }
.ag-terrain-meta code { color: #c1e8ff; font-size: 11px; word-break: break-all; }
.ag-copy { margin: 8px 0; padding: 6px 12px; background: rgba(255,176,0,0.12); border: 1px solid #ffb000; color: #ffb000; border-radius: 6px; cursor: pointer; font-family: inherit; }
.ag-hint { color: rgba(193,232,255,0.45); font-size: 11px; }
.ag-applied { color: rgba(193,232,255,0.7); font-size: 13px; margin-top: 12px; }
.ag-applied b { color: #ffb000; }
</style>
