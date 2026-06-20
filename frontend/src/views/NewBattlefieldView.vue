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
    </main>

    <footer class="footer">
      <div class="footer-left"><span>[ 系统稳定 // 12:04:99 ]</span></div>
      <div class="footer-right">
        <span class="good">{{ saveStatus }}</span>
        <span class="muted">左键绘制 | 右键清除 | 滚轮缩放 | 拖拽平移</span>
      </div>
    </footer>
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
const saving = ref(false)
const saveStatus = ref('就绪')

// ---- HexGridCanvas 组件引用 ----
const hexGrid = ref(null)

// ---- 3D 视角动态参数 (绑定到 HexGridCanvas 的 isoShearX/isoShearY props) ----
const isoShearX = ref(ISO_DEFAULTS.shearX)  // 默认 0.25
const isoShearY = ref(ISO_DEFAULTS.shearY)  // 默认 0.44

// ---- 动态间距 (ref 以支持实时 prop 绑定) ----
const spacingH = ref(DEFAULT_SPACING_H)      // 1.00
const spacingV = ref(DEFAULT_SPACING_V)      // 1.00
const offsetFactor = ref(DEFAULT_OFFSET_FACTOR) // 0.00

// ---- 网格尺寸 ----
const gridW = computed(() => battlefield.value?.width || 15)
const gridH = computed(() => battlefield.value?.height || 10)
const totalCellCount = computed(() => gridW.value * gridH.value)
const nonEmptyCellCount = computed(() =>
  Object.values(terrainMap).filter(v => v && v !== 'moon').length
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
const currentTerrainColor = computed(() => {
  const t = terrainTypes.find(t => t.id === brush.value)
  return t ? t.color : '#888888'
})

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

      // 地形填充
      const tid = terrainMap[`${q},${r}`] || 'moon'
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

async function saveMap() {
  if (!battlefield.value) return
  saving.value = true
  saveStatus.value = '保存中...'
  try {
    const terrainData = {}
    Object.entries(terrainMap).forEach(([key, val]) => {
      if (val && val !== 'moon') terrainData[key] = val
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
</style>
