<template>
  <div class="page-container">
    <main class="main-content">
      <header class="page-header">
        <h1>[ 六角格战场编辑器 ]</h1>
        <div class="header-meta">
          <span class="meta-item"><span class="dot-live"></span> 在线</span>
          <span class="sep">::</span>
          <span>六边形地形设计工具</span>
        </div>
      </header>

      <!-- Map Info -->
      <div class="map-info-bar">
        <div class="info-item"><span class="info-label">地图名称</span><span class="info-value">{{ battlefield?.name || '未命名地图' }}</span></div>
        <div class="info-item"><span class="info-label">地形格子</span><span class="info-value">{{ nonEmptyCellCount }} / {{ totalCellCount }}</span></div>
        <div class="info-item"><span class="info-label">地图尺寸</span><span class="info-value">{{ gridW }} × {{ gridH }}</span></div>
        <div class="info-item"><span class="info-label">当前画笔</span><span class="info-value" :style="{ color: currentTerrainColor }">{{ brushName }}</span></div>
        <button class="btn-save" @click="saveMap" :disabled="saving">{{ saving ? '保存中...' : '保存地图' }}</button>
        <button class="btn-export" @click="exportJSON">📤 导出 JSON</button>
        <button class="btn-export" @click="showTerrainMgr=true;loadTerrainDefinitions()">[ 地形管理 ]</button>
        <button class="btn-export" @click="showNewMapModal = true">[ 新建地图 ]</button>
        <div class="map-load-group">
          <select v-model="selectedMapFile" @change="onSelectMapFile" class="map-load-select">
            <option value="">🗺️ 加载旧地图...</option>
            <option v-for="m in mapFileList" :key="m.filename" :value="m.id">
              {{ m.name }} [{{ m.terrainCount }}格]
            </option>
          </select>
          <span v-if="mapLoadStatus" class="map-load-status">{{ mapLoadStatus }}</span>
        </div>
      </div>

      <!-- HexGridCanvas 组件 (mode="edit") -->
      <HexGridCanvas
        ref="hexGrid"
        mode="edit"
        :grid-width="gridW"
        :grid-height="gridH"
        :spacing-h="spacingH"
        :spacing-v="spacingV"
        :iso-shear-x="isoShearX"
        :iso-shear-y="isoShearY"
        :draw-fn="editorDrawFn"
        @hex-click="onHexClick"
        @hex-hover="onHexHover"
        @hex-contextmenu="onHexContextMenu"
      />

      <!-- Terrain Palette -->
      <div class="terrain-palette">
        <span class="palette-label">地形画笔:</span>
        <button
          v-for="t in allTerrainTypes"
          :key="t.id"
          :class="['t-btn', { active: brush === t.id }]"
          @click="selectBrush(t.id)"
        >
          <span class="terrain-swatch" :style="{ background: getTerrainColor(t.id) }"></span>
          {{ t.name }}
        </button>
      </div>


    <!-- Phase9: 区间批量地形修改器 -->
    <div class="batch-panel">
      <div class="batch-title">[ 区间批量修改 ]</div>
      <div class="batch-row">
        <label class="batch-label">起点</label>
        <input v-model.number="batchStartQ" type="number" min="0" class="batch-input" placeholder="Q" />
        <input v-model.number="batchStartR" type="number" min="0" class="batch-input" placeholder="R" />
        <label class="batch-label">终点</label>
        <input v-model.number="batchEndQ" type="number" min="0" class="batch-input" placeholder="Q" />
        <input v-model.number="batchEndR" type="number" min="0" class="batch-input" placeholder="R" />
      </div>
      <div class="batch-row">
        <select v-model="batchTerrain" class="batch-select">
          <option v-for="t in allTerrainTypes" :key="t.id" :value="t.id">{{ t.name }}</option>
        </select>
        <button class="btn-batch" @click="applyBatchTerrain">批量修改</button>
        <span v-if="batchResult" class="batch-result">{{ batchResult }}</span>
      </div>
    </div>

      <!-- Controls Bar: Spacing + 3D Perspective + Zoom -->
      <div class="spacing-bar">
        <div class="spacing-group">
          <span class="spacing-label">水平间距</span>
          <button class="spacing-btn" @click="adjustSpacing('h', -2)">-</button>
          <span class="spacing-val">{{ spacingH.toFixed(2) }}</span>
          <button class="spacing-btn" @click="adjustSpacing('h', 2)">+</button>
        </div>
        <div class="spacing-group">
          <span class="spacing-label">垂直间距</span>
          <button class="spacing-btn" @click="adjustSpacing('v', -2)">-</button>
          <span class="spacing-val">{{ spacingV.toFixed(2) }}</span>
          <button class="spacing-btn" @click="adjustSpacing('v', 2)">+</button>
        </div>
        <div class="spacing-group">
          <span class="spacing-label">偏移系数</span>
          <button class="spacing-btn" @click="adjustSpacing('o', -2)">-</button>
          <span class="spacing-val">{{ offsetFactor.toFixed(2) }}</span>
          <button class="spacing-btn" @click="adjustSpacing('o', 2)">+</button>
        </div>
        <button class="spacing-reset" @click="resetSpacing">重置间距</button>

        <!-- 3D 视角动态调节滑块 -->
        <div class="spacing-group iso-group">
          <span class="spacing-label">3D 倾斜X</span>
          <input type="range" min="0.00" max="0.80" step="0.01" v-model.number="isoShearX" class="iso-slider" />
          <input type="number" min="0.00" max="0.80" step="0.01" v-model.number="isoShearX" class="iso-input" />
        </div>
        <div class="spacing-group iso-group">
          <span class="spacing-label">3D 倾斜Y</span>
          <input type="range" min="0.00" max="0.80" step="0.01" v-model.number="isoShearY" class="iso-slider" />
          <input type="number" min="0.00" max="0.80" step="0.01" v-model.number="isoShearY" class="iso-input" />
        </div>
        <div class="spacing-group iso-save-group">
          <button class="btn-save-iso" @click="saveViewConfig" :disabled="savingViewConfig">
            {{ savingViewConfig ? '保存中...' : '💾 保存 3D 视角' }}
          </button>
          <span v-if="viewSaveMsg" class="view-save-msg">{{ viewSaveMsg }}</span>
        </div>

        <div class="zoom-group">
          <button class="spacing-btn" @click="hexGrid?.zoomIn()">🔍+</button>
          <button class="spacing-btn" @click="hexGrid?.zoomOut()">🔍-</button>
          <button class="spacing-btn" @click="hexGrid?.zoomReset()">1:1</button>
        </div>
      </div>
    </main></div>


    <!-- Phase 13.5: 新建地图弹窗 -->
    <div v-if="showNewMapModal" class="terrain-mgr-overlay" @click.self="showNewMapModal=false">
      <div class="terrain-mgr-panel" style="max-width: 420px;">
        <div class="terrain-mgr-header">
          <span>[ 新建地图 ]</span>
          <button class="tm-close" @click="showNewMapModal=false">✕</button>
        </div>
        <div class="terrain-mgr-body" style="display:flex;flex-direction:column;gap:16px;padding:20px;">
          <div style="display:flex;gap:20px;align-items:center;">
            <div style="flex:1;">
              <label style="display:block;color:#c1e8ff;font-size:11px;margin-bottom:6px;">宽度 (列) · 10–200</label>
              <input v-model.number="newMapWidth" type="number" min="10" max="200"
                style="width:100%;background:rgba(0,0,0,0.3);border:1px solid rgba(255,176,0,0.3);color:#f1f3fc;padding:8px 10px;border-radius:4px;font-size:15px;font-family:'Fira Code',monospace;" />
            </div>
            <span style="color:rgba(255,176,0,0.4);font-size:18px;margin-top:20px;">×</span>
            <div style="flex:1;">
              <label style="display:block;color:#c1e8ff;font-size:11px;margin-bottom:6px;">高度 (行) · 10–200</label>
              <input v-model.number="newMapHeight" type="number" min="10" max="200"
                style="width:100%;background:rgba(0,0,0,0.3);border:1px solid rgba(255,176,0,0.3);color:#f1f3fc;padding:8px 10px;border-radius:4px;font-size:15px;font-family:'Fira Code',monospace;" />
            </div>
          </div>
          <div style="color:rgba(241,243,252,0.4);font-size:10px;text-align:center;">
            总计 {{ newMapWidth * newMapHeight }} 格 · 最小 100 格 · 最大 40,000 格
          </div>
          <div v-if="newMapError" style="color:#ff4d4d;font-size:11px;text-align:center;">{{ newMapError }}</div>
        </div>
        <div class="terrain-mgr-footer">
          <button class="btn-save" @click="createNewMap" style="width:100%;">确认创建</button>
        </div>
      </div>
    </div>
    <!-- Phase9: 自定义地形管理弹窗 -->
    <div v-if="showTerrainMgr" class="terrain-mgr-overlay" @click.self="showTerrainMgr=false">
      <div class="terrain-mgr-panel">
        <div class="terrain-mgr-header">
          <span>[ 自定义地形管理 ]</span>
          <button class="tm-close" @click="showTerrainMgr=false">✕</button>
        </div>
        <div class="terrain-mgr-body">
          <div v-for="(def, key) in editableTerrains" :key="key" class="tm-item">
            <div class="tm-item-header">
              <input v-model="editableTerrains[key].name" class="tm-input-name" placeholder="地形名" />
              <span class="tm-swatch" :style="{background: editableTerrains[key].color||'#888'}"></span>
              <input v-model="editableTerrains[key].color" class="tm-input-color" placeholder="#hex" />
            </div>
            <div class="tm-row">
              <label>移动消耗<input v-model.number="editableTerrains[key].move_cost" type="number" min="0" class="tm-input-num" /></label>
              <label>防御修正<input v-model.number="editableTerrains[key].defense_bonus" type="number" class="tm-input-num" /></label>
              <label>可破坏<input type="checkbox" v-model="editableTerrains[key].is_destructible" /></label>
            </div>
            <div v-if="editableTerrains[key].is_destructible" class="tm-row">
              <label>最大HP<input v-model.number="editableTerrains[key].max_hp" type="number" min="1" class="tm-input-num" /></label>
              <label>破坏后→
                <select v-model="editableTerrains[key].destroyed_transform_to" class="tm-select">
                  <option v-for="k in Object.keys(editableTerrains)" :key="k" :value="k">{{ editableTerrains[k]?.name || k }}</option>
                </select>
              </label>
            </div>
            <button class="tm-delete" @click="deleteTerrainType(key)">删除</button>
          </div>
          <div class="tm-add-row">
            <input v-model="newTerrainKey" class="tm-input-name" placeholder="新地形KEY" />
            <button class="btn-batch" @click="addTerrainType">添加地形</button>
          </div>
        </div>
        <div class="terrain-mgr-footer">
          <button class="btn-save" @click="saveTerrainConfig">保存地形库</button>
          <span v-if="terrainSaveMsg" class="batch-result">{{ terrainSaveMsg }}</span>
        </div>
      </div>
    </div>

</template>

<script setup>
import { ref, reactive, computed, onMounted, nextTick, inject } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { mapAPI, glossaryAPI } from '@/api/client'
import {
  HEX_WIDTH, HEX_HEIGHT, HEX_APOTHEM, HEX_RADIUS,
  DEFAULT_SPACING_H, DEFAULT_SPACING_V, DEFAULT_OFFSET_FACTOR,
  pointyTopCenter, drawHexPath, formatCoord,
  UNIVERSAL_TERRAIN_MAP,
  ISO_DEFAULTS,
} from '../utils/hexUtils.js'
import HexGridCanvas from '@/components/HexGridCanvas.vue'

const router = useRouter()
const route = useRoute()
const sidebarActionLog = inject('sidebarActionLog')

// ---- 地图数据 ----
const battlefield = ref(null)
const terrainMap = reactive({})

// ---- 画笔状态 ----
const brush = ref('moon')
// Phase9: 批量地形修改器状态
const batchStartQ = ref(0)
const batchStartR = ref(0)
const batchEndQ = ref(0)
const batchEndR = ref(0)
const batchTerrain = ref('moon')
const batchResult = ref('')

const saving = ref(false)
const saveStatus = ref('就绪')

// Phase 13: 地图文件列表 & 选中状态
const mapFileList = ref([])
const selectedMapFile = ref('')
const mapLoadStatus = ref('')
// Phase 13.5: 新建地图弹窗状态
const showNewMapModal = ref(false)
const newMapWidth = ref(15)
const newMapHeight = ref(10)
const newMapError = ref('')

// ---- HexGridCanvas 组件引用 ----
const hexGrid = ref(null)

// ---- 3D 视角动态参数 (绑定到 HexGridCanvas 的 isoShearX/isoShearY props) ----
const isoShearX = ref(ISO_DEFAULTS.shearX)  // 默认 0.38
const isoShearY = ref(ISO_DEFAULTS.shearY)  // 默认 0

// ---- 动态间距 (ref 以支持实时 prop 绑定) ----
const spacingH = ref(DEFAULT_SPACING_H)      // 1.00
const spacingV = ref(DEFAULT_SPACING_V)      // 1.00
const offsetFactor = ref(DEFAULT_OFFSET_FACTOR) // 0.00

// ---- 网格尺寸 ----
const gridW = computed(() => battlefield.value?.width || 15)
const gridH = computed(() => battlefield.value?.height || 10)
const totalCellCount = computed(() => gridW.value * gridH.value)
const nonEmptyCellCount = computed(() =>
  Object.values(terrainMap).filter(v => v && extractTerrainId(v) !== 'moon').length
)

// ---- 地形调色板 (从全项目唯一真理 UNIVERSAL_TERRAIN_MAP 派生) ----
const terrainTypes = Object.entries(UNIVERSAL_TERRAIN_MAP).map(([id, def]) => ({
  id,
  name: def.name,
  color: def.color,
  moveCost: def.cost,
}))

const allTerrainTypes = computed(() => terrainTypes)
const brushName = computed(() => {
  const t = terrainTypes.find(t => t.id === brush.value)
  return t ? t.name : '未知'
})


// Phase9: 自定义地形库管理
const showTerrainMgr = ref(false)
const editableTerrains = reactive({})
const newTerrainKey = ref('')
const terrainSaveMsg = ref('')

// 从 glossary API 加载全量地形定义
async function loadTerrainDefinitions() {
  try {
    const res = await fetch('/api/combat/glossary-config')
    const data = await res.json()
    if (data.terrains) {
      Object.keys(editableTerrains).forEach(k => delete editableTerrains[k])
      Object.entries(data.terrains).forEach(([k, v]) => {
        editableTerrains[k] = { ...v }
      })
    }
  } catch (e) {
    console.warn('加载地形定义失败, 使用默认值', e)
  }
}

function addTerrainType() {
  const key = newTerrainKey.value.trim()
  if (!key) return
  if (editableTerrains[key]) { terrainSaveMsg.value = 'KEY 已存在!'; return }
  editableTerrains[key] = {
    name: key, color: '#888888', move_cost: 1, defense_bonus: 0,
    is_destructible: false, max_hp: 0, destroyed_transform_to: 'moon'
  }
  newTerrainKey.value = ''
  terrainSaveMsg.value = `已添加: ${key}`
  setTimeout(() => { terrainSaveMsg.value = '' }, 2000)
}

function deleteTerrainType(key) {
  if (!confirm(`确认删除地形 "${key}"?`)) return
  delete editableTerrains[key]
  terrainSaveMsg.value = `已删除: ${key}`
  setTimeout(() => { terrainSaveMsg.value = '' }, 2000)
}

async function saveTerrainConfig() {
  try {
    const current = await fetch('/api/combat/glossary-config').then(r => r.json())
    current.terrains = JSON.parse(JSON.stringify(editableTerrains))
    current._meta = current._meta || {}
    current._meta.date = new Date().toISOString().replace('T',' ').substring(0,19)
    const res = await fetch('/api/combat/glossary-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(current)
    })
    if (res.ok) {
      terrainSaveMsg.value = '地形库保存成功!'
      addLog('terrain', '地形库配置已保存')
    } else {
      terrainSaveMsg.value = '保存失败: ' + (await res.json()).error
    }
  } catch (e) {
    terrainSaveMsg.value = '网络错误: ' + e.message
  }
  setTimeout(() => { terrainSaveMsg.value = '' }, 3000)
}

// 初始化加载
loadTerrainDefinitions()

const currentTerrainColor = computed(() => {
  const t = terrainTypes.find(t => t.id === brush.value)
  return t ? t.color : '#888888'
})


// Phase 13: 地形ID提取 — 兼容旧版字符串和新版结构化对象
function extractTerrainId(cellValue) {
  if (!cellValue) return 'moon'
  if (typeof cellValue === 'string') return cellValue
  if (typeof cellValue === 'object' && cellValue.terrain_id) return cellValue.terrain_id
  if (typeof cellValue === 'object' && cellValue.terrain) return cellValue.terrain
  if (typeof cellValue === 'object' && cellValue.type) return cellValue.type
  return 'moon'
}

// Phase 13: 地形名称提取 — 兼容新版结构化对象
function extractTerrainName(cellValue, terrainTypes) {
  const tid = extractTerrainId(cellValue)
  const def = terrainTypes.find(t => t.id === tid)
  return def ? def.name : tid
}

function getTerrainColor(id) {
  const def = UNIVERSAL_TERRAIN_MAP[id]
  return def ? def.color : '#888888'
}

// ================================================================
//  HexGridCanvas drawFn — 地形网格渲染
//  ctx 已由组件应用完整 CTM (translate → scale → ISO shear)，
//  父层直接以 pointyTopCenter 标准坐标绘制即可
// ================================================================

function hexToRGBA(hex, alpha) {
  const _hex = hex.replace('#', '')
  const r = parseInt(_hex.slice(0, 2), 16)
  const g = parseInt(_hex.slice(2, 4), 16)
  const b = parseInt(_hex.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function editorDrawFn(ctx, { hlQ, hlR }) {
  const h = spacingH.value
  const v = spacingV.value

  for (let r = 0; r < gridH.value; r++) {
    for (let q = 0; q < gridW.value; q++) {
      const { flatX: cx, flatY: cy } = pointyTopCenter(q, r, HEX_RADIUS, h, v)

      // 地形填充 (Phase 13: 兼容旧版字符串和新版结构化对象)
      const rawCell = terrainMap[`${q},${r}`]
      const tid = extractTerrainId(rawCell)
      const terrainDef = terrainTypes.find(t => t.id === tid) || terrainTypes[0]
      ctx.fillStyle = hexToRGBA(terrainDef.color, 0.35)
      drawHexPath(ctx, cx, cy)
      ctx.fill()

      // 边框
      ctx.strokeStyle = 'rgba(159,142,120,0.2)'
      ctx.lineWidth = 1
      drawHexPath(ctx, cx, cy)
      ctx.stroke()

      // 坐标标签
      ctx.fillStyle = 'rgba(193,232,255,0.6)'
      ctx.font = 'bold 12px "Fira Code", monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText(formatCoord(q, r), cx, cy + 2)

      // 悬停高亮
      if (hlQ === q && hlR === r) {
        ctx.strokeStyle = '#ffb000'
        ctx.lineWidth = 2.5
        drawHexPath(ctx, cx, cy)
        ctx.stroke()
        ctx.fillStyle = 'rgba(0,0,0,0.8)'
        ctx.font = 'bold 13px "Fira Code", monospace'
        ctx.textBaseline = 'bottom'
        ctx.fillText(terrainDef.name, cx, cy - HEX_RADIUS - 2)
      }
    }
  }
}

// ================================================================
//  HexGridCanvas 事件处理器
//  ================================================================

/** 左键点击 — 涂抹当前画笔地形 */
function onHexClick({ q, r }) {
  if (q >= 0 && q < gridW.value && r >= 0 && r < gridH.value) {
    terrainMap[`${q},${r}`] = brush.value
    hexGrid.value?.redraw()
  }
}

/** 鼠标悬停 — HexGridCanvas 内部处理悬停坐标显示 */
function onHexHover({ q, r }) {
  // 悬停逻辑由 HexGridCanvas 内部 + drawFn 的 hlQ/hlR 处理
  // 额外编辑器悬停逻辑可在此扩展
}

/** 右键点击 — 擦除地形 (恢复为默认 moon) */
function onHexContextMenu({ q, r }) {
  if (q >= 0 && q < gridW.value && r >= 0 && r < gridH.value) {
    delete terrainMap[`${q},${r}`]
    hexGrid.value?.redraw()
  }
}

// ================================================================
//  侧边栏日志管道
// ================================================================

function addLog(type, message) {
  if (!sidebarActionLog) return
  const time = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  sidebarActionLog.value.unshift({ type, message, time })
  if (sidebarActionLog.value.length > 200) sidebarActionLog.value.pop()
}

// ================================================================
//  UI 操作
// ================================================================

// Phase9: 批量应用地形
function applyBatchTerrain() {
  const sq = Math.min(batchStartQ.value, batchEndQ.value)
  const eq = Math.max(batchStartQ.value, batchEndQ.value)
  const sr = Math.min(batchStartR.value, batchEndR.value)
  const er = Math.max(batchStartR.value, batchEndR.value)
  let count = 0
  for (let r = sr; r <= er; r++) {
    for (let q = sq; q <= eq; q++) {
      if (q >= 0 && q < gridW.value && r >= 0 && r < gridH.value) {
        terrainMap[`${q},${r}`] = batchTerrain.value
        count++
      }
    }
  }
  batchResult.value = `已修改 ${count} 个格子为 ${batchTerrain.value}`
  hexGrid.value?.redraw()
  addLog('batch', `区间[${sq},${sr}]→[${eq},${er}] 地形 → ${batchTerrain.value} (${count}格)`)
  setTimeout(() => { batchResult.value = '' }, 3000)
}

function selectBrush(id) { brush.value = id }

function adjustSpacing(type, delta) {
  if (type === 'h') spacingH.value = Math.max(0.5, Math.min(1.5, spacingH.value + delta / 100))
  if (type === 'v') spacingV.value = Math.max(0.5, Math.min(1.5, spacingV.value + delta / 100))
  if (type === 'o') offsetFactor.value = Math.max(0, Math.min(1, offsetFactor.value + delta / 100))
  // HexGridCanvas 内部 watch spacingH/spacingV props，自动触发重绘
}

function resetSpacing() {
  spacingH.value = DEFAULT_SPACING_H
  spacingV.value = DEFAULT_SPACING_V
  offsetFactor.value = DEFAULT_OFFSET_FACTOR
}

function navigateTo(path) { router.push(path) }

// ================================================================
//  数据加载 / 保存 / 导出
// ================================================================

// Phase 13: 从后端拉取地图文件列表
async function fetchMapFileList() {
  try {
    const res = await fetch('/api/map/list')
    const data = await res.json()
    mapFileList.value = data.maps || []
    if (mapFileList.value.length > 0) {
      addLog('info', `发现 ${mapFileList.value.length} 个已保存的地图文件`)
    }
  } catch (e) {
    console.warn('[MapList] 拉取地图列表失败:', e.message)
  }
}

// Phase 13: 选中地图后加载
async function onSelectMapFile() {
  const filename = selectedMapFile.value
  if (!filename) return
  mapLoadStatus.value = '加载中...'
  try {
    const res = await fetch(`/api/map/list?id=${encodeURIComponent(filename)}`)
    if (!res.ok && res.status === 404) {
      // 回退: 使用原有 getBattlefields 加载
      const { data } = await mapAPI.getBattlefields()
      const maps = data?.battlefields || data?.maps || []
      const found = maps.find(m => String(m.id) === filename || m.name === filename.replace('.json', ''))
      if (found) {
        await loadMapData(found)
        mapLoadStatus.value = `✓ 已加载: ${found.name || filename}`
        setTimeout(() => { mapLoadStatus.value = '' }, 3000)
        return
      }
      mapLoadStatus.value = '✗ 地图未找到'
      setTimeout(() => { mapLoadStatus.value = '' }, 3000)
      return
    }
    const data = await res.json()
    if (data) {
      await loadMapData(data)
      mapLoadStatus.value = `✓ 已加载: ${(data).name || filename}`
      setTimeout(() => { mapLoadStatus.value = '' }, 3000)
    }
  } catch (e) {
    mapLoadStatus.value = '✗ 加载失败'
    console.error('[MapList] 加载地图失败:', e)
    setTimeout(() => { mapLoadStatus.value = '' }, 3000)
  }
}

// Phase 13: 加载地图数据到编辑器
async function loadMapData(mapData) {
  battlefield.value = mapData
  // 清空现有地形
  Object.keys(terrainMap).forEach(k => delete terrainMap[k])
  // 加载地形数据
  const rawTerrain = mapData.terrain || mapData.terrainData
  if (rawTerrain) {
    const t = typeof rawTerrain === 'string' ? JSON.parse(rawTerrain) : rawTerrain
    if (t && typeof t === 'object') {
      Object.entries(t).forEach(([key, val]) => { terrainMap[key] = val })
    }
  }
  // 恢复 hex 配置
  if (mapData.hexConfig || mapData.hex_config) {
    const hc = mapData.hexConfig || mapData.hex_config
    if (hc.spacingH !== undefined) spacingH.value = hc.spacingH
    if (hc.spacingV !== undefined) spacingV.value = hc.spacingV
    if (hc.offsetFactor !== undefined) offsetFactor.value = hc.offsetFactor
  }
  hexGrid.value?.redraw()
  addLog('system', `加载地图: ${mapData.name || '未命名'} (${Object.keys(terrainMap).filter(k => terrainMap[k] && terrainMap[k] !== 'moon').length} 个地形格子)`)
}

onMounted(async () => {
  const mapId = route.query.id || route.params.id
  let mapData = null
  try {
    if (mapId) {
      try {
        const res = await mapAPI.getBattlefield(mapId)
        mapData = res.data?.battlefield || res.data
      } catch (e) {
        console.warn('[BattlefieldEdit] Failed to load map by ID:', mapId, e.message)
      }
    }
    if (!mapData) {
      const { data } = await mapAPI.getBattlefields()
      if (data && data.battlefields && data.battlefields.length > 0) {
        mapData = data.battlefields[0]
      }
    }
    if (mapData) {
      battlefield.value = mapData
      const rawTerrain = mapData.terrain
      if (rawTerrain) {
        const t = typeof rawTerrain === 'string' ? JSON.parse(rawTerrain) : rawTerrain
        if (t && typeof t === 'object') {
          Object.entries(t).forEach(([key, val]) => { terrainMap[key] = val })
        }
      }
      addLog('system', `加载地图: ${mapData.name || '未命名'} (${Object.keys(terrainMap).filter(k => terrainMap[k] && terrainMap[k] !== 'moon').length} 个地形格子)`)
    } else {
      addLog('info', '未找到已保存的地图，开始创建新地图')
    }
  } catch (e) {
    addLog('error', `加载地图失败: ${e.message || e}`)
  }
  await nextTick()
  // Phase 13: 异步拉取地图文件列表
  fetchMapFileList().catch(() => {})
  // HexGridCanvas 在 onMounted 中自行初始化 Canvas + 事件绑定
})

// ---- 保存 3D 视角配置到后端 ----
const savingViewConfig = ref(false)
const viewSaveMsg = ref('')
let viewSaveMsgTimer = null

async function saveViewConfig() {
  savingViewConfig.value = true
  viewSaveMsg.value = ''
  try {
    const isoConfig = {
      shearX: isoShearX.value,
      shearY: isoShearY.value,
      scaleX: 1.00,
      scaleY: 0.39,
      rotation: -24
    }
    await glossaryAPI.saveConfig({
      _meta: {
        version: '3.0-view',
        date: new Date().toISOString().replace('T', ' ').substring(0, 19),
        generated_from: 'NewBattlefieldView.vue 3D 视角调校'
      },
      _view: isoConfig
    })
    viewSaveMsg.value = '✓ 3D 视角已保存'
  } catch (e) {
    viewSaveMsg.value = '✗ 保存失败: ' + (e.response?.data?.error || e.message)
    console.error('保存视角配置失败:', e)
  } finally {
    savingViewConfig.value = false
    if (viewSaveMsgTimer) clearTimeout(viewSaveMsgTimer)
    viewSaveMsgTimer = setTimeout(() => { viewSaveMsg.value = '' }, 4000)
  }
}


// Phase 13.5: 根据输入的 width/height 创建新地图
function createNewMap() {
  newMapError.value = ''
  const w = newMapWidth.value
  const h = newMapHeight.value

  // 刚性约束
  if (w < 10 || w > 200 || h < 10 || h > 200) {
    newMapError.value = '尺寸必须在 10–200 范围内'
    return
  }
  if (!Number.isInteger(w) || !Number.isInteger(h)) {
    newMapError.value = '尺寸必须为整数'
    return
  }

  // 清空旧地形
  Object.keys(terrainMap).forEach(k => delete terrainMap[k])

  // 动态设置 battlefield 的 width/height
  battlefield.value = {
    id: null,
    name: `新战场 ${w}x${h}`,
    width: w,
    height: h,
    terrainData: {},
  }

  showNewMapModal.value = false
  saveStatus.value = `已创建 ${w}×${h} 地图`

  // 触发 HexGridCanvas 重绘 + 滑槽边界重算
  nextTick(() => {
    hexGrid.value?.redraw()
  })

  addLog('system', `新建地图: ${w}×${h} (${w * h} 格)`)
}
async function saveMap() {
  if (!battlefield.value) return
  saving.value = true
  saveStatus.value = '保存中...'
  try {
    const terrainData = {}
    Object.entries(terrainMap).forEach(([key, val]) => {
      if (val && extractTerrainId(val) !== 'moon') terrainData[key] = val
    })
    await mapAPI.updateBattlefield(battlefield.value.id, {
      terrain: terrainData,
      terrain_defs: terrainTypes,
      hex_config: {
        spacingH: spacingH.value,
        spacingV: spacingV.value,
        offsetFactor: offsetFactor.value,
      },
    })
    saveStatus.value = `已保存 ${Object.keys(terrainData).length} 个地形 (${new Date().toLocaleTimeString()})`
    addLog('info', `地图已保存: ${battlefield.value?.name || '未命名'} (${Object.keys(terrainData).length} 个地形格子)`)
  } catch (e) {
    saveStatus.value = '保存失败!'
    addLog('error', '地图保存失败')
  } finally {
    saving.value = false
  }
}

function exportJSON() {
  const name = battlefield.value?.name || '未命名'
  const exportData = {
    version: '1.0',
    exportDate: new Date().toISOString(),
    battlefield: {
      name,
      width: gridW.value,
      height: gridH.value,
      hexConfig: {
        spacingH: spacingH.value,
        spacingV: spacingV.value,
        offsetFactor: offsetFactor.value,
      },
      terrainData: JSON.parse(JSON.stringify(terrainMap)),
      terrainTypes: Object.entries(UNIVERSAL_TERRAIN_MAP).map(([id, d]) => ({ id, ...d })),
      cellCount: totalCellCount.value,
      terrainCount: Object.keys(terrainMap).filter(k => terrainMap[k] && terrainMap[k] !== 'moon').length,
    },
  }
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `hex_battlefield_${name}_${new Date().toISOString().split('T')[0]}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  saveStatus.value = '导出成功'
}
</script>

<style scoped>
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
.page-container {
  height: 100vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.icon { width: 1em; height: 1em; display: inline-block; vertical-align: middle; fill: currentColor; flex-shrink: 0; }
.icon-lg { font-size: 2.5rem; }

.main-content {
  height: 100vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-width: 0;
  width: 100%;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  flex-shrink: 0;
  margin-bottom: 12px;
}
.page-header h1 {
  font-size: 18px;
  letter-spacing: 6px;
  text-transform: uppercase;
  color: #ffb000;
  font-weight: 700;
}
.header-meta { display: flex; align-items: center; gap: 8px; font-size: 11px; color: #9f8e78; }
.dot-live {
  width: 6px; height: 6px;
  background: #00ff41;
  border-radius: 50%;
  display: inline-block;
  margin-right: 4px;
}
.sep { color: rgba(159,142,120,0.2); }

.map-info-bar {
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
  padding: 10px 0;
  flex-shrink: 0;
  border-bottom: 1px solid rgba(159,142,120,0.1);
  margin-bottom: 10px;
}
.info-item { display: flex; align-items: center; gap: 6px; }
.info-label { font-size: 9px; color: #9f8e78; text-transform: uppercase; }
.info-value { font-size: 11px; font-family: 'Fira Code', monospace; color: #c1e8ff; }
.btn-save {
  padding: 6px 16px;
  background: rgba(0,150,180,0.2);
  color: rgba(0,200,255,0.9);
  border: 1px solid rgba(0,150,180,0.3);
  font-size: 11px;
  cursor: pointer;
  font-family: monospace;
  margin-left: auto;
}
.btn-save:hover { background: rgba(0,150,180,0.4); }
.btn-save:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-export {
  padding: 6px 16px;
  background: rgba(255,176,0,0.15);
  color: #ffb000;
  border: 1px solid rgba(255,176,0,0.3);
  font-size: 11px;
  cursor: pointer;
  font-family: monospace;
}
.btn-export:hover { background: rgba(255,176,0,0.3); }

/* Phase 13: 地图加载下拉框 */
.map-load-group {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}
.map-load-select {
  padding: 5px 10px;
  background: rgba(0,0,0,0.4);
  color: #c1e8ff;
  border: 1px solid rgba(255,176,0,0.3);
  font-size: 11px;
  font-family: 'Fira Code', monospace;
  cursor: pointer;
  min-width: 200px;
}
.map-load-select:hover {
  border-color: #ffb000;
}
.map-load-select option {
  background: #001620;
  color: #c1e8ff;
}
.map-load-status {
  font-size: 10px;
  font-family: 'Fira Code', monospace;
  color: #ffb000;
  white-space: nowrap;
}

.terrain-palette {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  padding: 12px 0;
  flex-shrink: 0;
  pointer-events: auto;
}
.palette-label {
  font-size: 11px;
  color: #ffd597;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-right: 8px;
}
.t-btn {
  padding: 6px 12px;
  background: transparent;
  border: 1px solid rgba(159,142,120,0.3);
  color: rgba(193,232,255,0.55);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
  display: flex;
  align-items: center;
  gap: 4px;
}
.t-btn:hover { border-color: #ffb000; color: #ffb000; }
.t-btn.active {
  background: #ffb000;
  color: #0a1628;
  border-color: #ffb000;
  font-weight: 700;
}
.terrain-swatch {
  width: 10px; height: 10px;
  border: 1px solid rgba(255,255,255,0.3);
  flex-shrink: 0;
}

.spacing-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  padding: 10px 0;
  flex-shrink: 0;
  border-top: 1px solid rgba(159,142,120,0.1);
  pointer-events: auto;
}
.spacing-group { display: flex; align-items: center; gap: 4px; }
.spacing-label {
  font-size: 9px;
  color: #9f8e78;
  text-transform: uppercase;
  margin-right: 4px;
  white-space: nowrap;
}
.spacing-val {
  font-size: 11px;
  font-family: 'Fira Code', monospace;
  color: #c1e8ff;
  min-width: 40px;
  text-align: center;
}
.spacing-btn {
  padding: 2px 8px;
  background: rgba(0,150,180,0.15);
  color: rgba(0,200,255,0.8);
  border: 1px solid rgba(0,150,180,0.3);
  font-size: 10px;
  cursor: pointer;
  font-family: monospace;
}
.spacing-btn:hover { background: rgba(0,150,180,0.3); }
.spacing-reset {
  padding: 4px 12px;
  background: transparent;
  color: rgba(0,200,255,0.6);
  border: 1px solid rgba(0,150,180,0.2);
  font-size: 10px;
  cursor: pointer;
  margin-left: 8px;
}
.spacing-reset:hover { color: #ffb000; border-color: rgba(255,176,0,0.3); }
.zoom-group { display: flex; align-items: center; gap: 4px; margin-left: auto; }

/* ===== 3D 视角动态滑块 ===== */
.iso-group {
  margin-left: 8px;
  padding-left: 12px;
  border-left: 1px solid rgba(159,142,120,0.15);
}
.iso-slider {
  width: 70px;
  height: 4px;
  accent-color: #ffb000;
  cursor: pointer;
}
.iso-input {
  width: 52px;
  padding: 2px 4px;
  background: rgba(0,0,0,0.4);
  color: #c1e8ff;
  border: 1px solid rgba(159,142,120,0.3);
  font-size: 10px;
  font-family: 'Fira Code', monospace;
  text-align: center;
}
.iso-input:focus {
  border-color: #ffb000;
  outline: none;
}

/* ===== Footer ===== */
.footer {
  position: fixed;
  bottom: 0;
  left: 256px;
  right: 0;
  background: rgba(2,9,17,0.92);
  border-top: 1px solid rgba(0,255,65,0.18);
  padding: 6px 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-family: 'Fira Code', monospace;
  font-size: 10px;
  z-index: 50;
  pointer-events: auto;
}
.footer-left span {
  color: #00ff41;
  font-weight: 700;
  letter-spacing: 2px;
  text-transform: uppercase;
}
.footer-right { display: flex; gap: 28px; letter-spacing: 2px; text-transform: uppercase; }
.footer-right .good { color: rgba(122,236,255,0.8); }
.footer-right .muted { color: rgba(0,255,65,0.35); }
/* ===== Phase9: 批量地形修改器 ===== */
.batch-panel {
  padding: 10px 0;
  border-top: 1px solid rgba(159,142,120,0.15);
  border-bottom: 1px solid rgba(159,142,120,0.15);
  margin: 6px 0;
  flex-shrink: 0;
  pointer-events: auto;
}
.batch-title {
  font-size: 11px;
  color: #ffd597;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 6px;
}
.batch-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}
.batch-label {
  font-size: 9px;
  color: #9f8e78;
  text-transform: uppercase;
  min-width: 24px;
}
.batch-input {
  width: 48px;
  padding: 3px 4px;
  background: rgba(0,0,0,0.5);
  color: #c1e8ff;
  border: 1px solid rgba(159,142,120,0.4);
  font-size: 11px;
  font-family: 'Fira Code', monospace;
  text-align: center;
}
.batch-input:focus {
  border-color: #ffb000;
  outline: none;
}
.batch-select {
  padding: 4px 8px;
  background: rgba(0,0,0,0.5);
  color: #c1e8ff;
  border: 1px solid rgba(159,142,120,0.4);
  font-size: 11px;
  font-family: 'Fira Code', monospace;
}
.batch-select:focus {
  border-color: #ffb000;
  outline: none;
}
.btn-batch {
  padding: 4px 14px;
  background: rgba(255,176,0,0.2);
  color: #ffb000;
  border: 1px solid rgba(255,176,0,0.4);
  font-size: 11px;
  cursor: pointer;
  font-family: monospace;
}
.btn-batch:hover {
  background: rgba(255,176,0,0.4);
}
.batch-result {
  font-size: 10px;
  color: #00ff41;
  font-family: 'Fira Code', monospace;
  margin-left: 8px;
}


/* ===== Phase9: 地形管理弹窗 ===== */
.terrain-mgr-overlay {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.75);
  z-index: 1000;
  display: flex; align-items: center; justify-content: center;
}
.terrain-mgr-panel {
  background: #0a1628;
  border: 1px solid #ffb000;
  border-radius: 4px;
  width: 580px;
  max-height: 80vh;
  display: flex; flex-direction: column;
  box-shadow: 0 0 40px rgba(255,176,0,0.15);
}
.terrain-mgr-header {
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255,176,0,0.2);
  display: flex; justify-content: space-between; align-items: center;
  font-size: 14px; color: #ffb000; font-weight: 700; letter-spacing: 2px;
}
.tm-close {
  background: none; border: none; color: #ffb000; font-size: 18px; cursor: pointer;
}
.tm-close:hover { color: #ff4444; }
.terrain-mgr-body {
  padding: 12px 16px;
  overflow-y: auto;
  flex: 1;
}
.tm-item {
  background: rgba(0,0,0,0.3);
  border: 1px solid rgba(159,142,120,0.2);
  padding: 8px;
  margin-bottom: 8px;
}
.tm-item-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.tm-input-name {
  width: 100px; padding: 3px 6px;
  background: rgba(0,0,0,0.5); color: #c1e8ff;
  border: 1px solid rgba(159,142,120,0.4); font-size: 11px; font-family: monospace;
}
.tm-input-color {
  width: 72px; padding: 3px 6px;
  background: rgba(0,0,0,0.5); color: #c1e8ff;
  border: 1px solid rgba(159,142,120,0.4); font-size: 11px; font-family: monospace;
}
.tm-swatch { width: 16px; height: 16px; border: 1px solid rgba(255,255,255,0.3); flex-shrink: 0; }
.tm-row { display: flex; gap: 16px; align-items: center; margin: 4px 0; font-size: 10px; color: #9f8e78; }
.tm-row label { display: flex; align-items: center; gap: 4px; }
.tm-input-num {
  width: 48px; padding: 2px 4px;
  background: rgba(0,0,0,0.5); color: #c1e8ff;
  border: 1px solid rgba(159,142,120,0.4); font-size: 11px; font-family: monospace; text-align: center;
}
.tm-select {
  padding: 2px 4px;
  background: rgba(0,0,0,0.5); color: #c1e8ff;
  border: 1px solid rgba(159,142,120,0.4); font-size: 10px; font-family: monospace;
}
.tm-delete {
  margin-top: 4px; padding: 2px 8px;
  background: rgba(255,0,0,0.15); color: #ff6666;
  border: 1px solid rgba(255,0,0,0.3); font-size: 10px; cursor: pointer;
}
.tm-delete:hover { background: rgba(255,0,0,0.3); }
.tm-add-row { display: flex; gap: 8px; align-items: center; margin-top: 12px; }
.terrain-mgr-footer {
  padding: 10px 16px; border-top: 1px solid rgba(255,176,0,0.2);
  display: flex; align-items: center; gap: 12px;
}

</style>
