<template>
  <!-- 
    HexGridCanvasEngine — 大一统无状态离散几何渲染内核
    宪法红线:
    1. 禁止 import vuex/pinia/任何状态机
    2. 禁止出现 isEditor/isBattle/store.state/combat/unit 等业务字眼
    3. props → 单向数据管道的入口；emits → 纯粹坐标广播的出口
    4. Canvas 尺寸由逻辑脚本硬性控制，严禁 CSS Flex/百分比拉伸
  -->
  <div class="hex-engine-sandbox" ref="engineWrapper">
    <div class="hex-engine-container" ref="engineContainer">
      <canvas ref="mainCanvas"></canvas>
    </div>
    <div class="cursor-hint" v-if="hoverLabel">{{ hoverLabel }}</div>
  </div>
</template>

<script setup>
// ================================================================
// Phase 30-CSP 代码审计：CSP 'unsafe-eval' 豁免说明
// -------------------------------------------------------------
// 本组件是纯几何渲染内核，**不使用 eval() 或 new Function()**。
// CSP 中 'unsafe-eval' 的豁免服务于以下上游依赖：
// 1. Vue 3 模板编译器 — 开发模式下的动态编译依赖 new Function()
// 2. DiceScript 数学公式解析 — 使用 RegExp + Math.random() 纯数学模拟，无需 eval
// 3. Webpack/Vite HMR — 热更新注入的 eval source map
//
// 审计结论（2026-07-11）：本组件 0 处动态代码执行点，
// 'unsafe-eval' 仅作为 Vue 运行时基础设施的必要豁免保留。
// ================================================================

/**
 *  HexGridCanvasEngine — 大一统无状态离散几何渲染内核
 *  
 *  职责边界：
 *  - 渲染地形格子（从 gridData 内建）
 *  - 渲染高亮覆盖（从 highlightCells）
 *  - 广播 cell-clicked 纯坐标事件
 *  - 提供视口裁剪 + 离屏地形缓存 + 16 帧动画时钟
 *  - 通过 drawFn 委托父层绘制单位/覆盖层
 *
 *  不负责：
 *  - 任何业务逻辑（编辑/对战/寻路/伤害）
 *  - 状态管理
 *  - 数据持久化
 * ================================================================
 */
import { ref, reactive, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import {
  drawHexPath, drawHexPathDeformed,
  drawIsoHexPath, drawIsoHexPathDeformed, drawIsoHexColumn,
} from '../utils/hexDraw.js'
import {
  HEX_WIDTH, HEX_HEIGHT, HEX_RADIUS,
  DEFAULT_SPACING_H, DEFAULT_SPACING_V,
  pointyTopCenter, pointyTopToHex,
  isoTransformPoint, isoInverseTransformPoint,
  UNIVERSAL_TERRAIN_MAP,
  ISO_DEFAULTS, PLANAR_CONFIG,
} from '../utils/hexUtils.js'

// ================================================================
//  Props — 单向数据管道入口
// ================================================================
const props = defineProps({
  /**
   * 网格数据包
   * {
   *   width: number,        // 列数
   *   height: number,       // 行数
   *   cells: Array<{ q: number, r: number, terrain: string }>,
   *   topologyParam: {
   *     spacingH: number,   // 水平间距倍率 (默认 1.0)
   *     spacingV: number,   // 垂直间距倍率 (默认 1.0)
   *   }
   * }
   */
  gridData: {
    type: Object,
    required: true,
    validator: v => v && typeof v.width === 'number' && typeof v.height === 'number' && Array.isArray(v.cells)
  },

  /**
   * 高亮格子数组
   * [{ q: number, r: number, style?: 'move'|'attack'|'select'|'warning', color?: string, label?: string }]
   */
  highlightCells: {
    type: Array,
    default: () => []
  },

  /**
   * 父层追加绘制函数 (ctx, context) => void
   * context = { frameClock: 0-15, visibleRange, isInViewport(q,r): bool }
   * ctx 已应用完整 CTM，父层直接绘制即可
   */
  drawFn: { type: Function, default: null },

  /**
   * 是否在网格中高亮画布中心点
   * 编辑器 50×50 时，中心 = floor((50-1)/2)=24 起的 2×2 块 (q24-25, r24-25)
   * 即坐标标签的 Y25/Z25/Y26/Z26（"y25:z26" 四个格子）
   */
  showCenterMarker: { type: Boolean, default: false },

  /**
   * 等距视角配置
   * { shearX, shearY, scaleX, scaleY, rotation, topFlat, bottomFlat }
   */
  isoConfig: {
    type: Object,
    default: () => ({ ...ISO_DEFAULTS })
  },

  /**
   * 渲染模式
   * 'planar' — 顶视平面（强制 PLANAR_CONFIG，用于地图编辑器，需求①）
   * 'iso'    — 伪 3D 等距（沿用传入 isoConfig，用于战场）
   */
  mode: {
    type: String,
    default: 'iso',
    validator: (v) => v === 'planar' || v === 'iso',
  },

  /** 是否启用 2.5D 挤出立柱（需求③）；渲染分支在阶段 3 接入 */
  extrude: {
    type: Boolean,
    default: false,
  },

  /** 需求④ 全局地形素材库：terrainId → 材质图 url（CanvasPattern 平铺，纯色回退） */
  terrainMaterials: {
    type: Object,
    default: () => ({}),
  },

  /** 是否显示坐标标签 */
  showCoords: { type: Boolean, default: true },

  /** 悬停时是否显示坐标提示 */
  showHover: { type: Boolean, default: true },

  /** 是否启用离屏地形缓存 (编辑模式建议关闭，战场模式建议开启) */
  useTerrainCache: { type: Boolean, default: true },

  /** 动画时钟间隔 (ms) */
  clockInterval: { type: Number, default: 100 },
})

// ================================================================
//  Emits — 纯粹坐标广播出口
// ================================================================
const emit = defineEmits([
  /** cell-clicked: 用户点击任意像素 → 反算 Even-R (q,r) → 广播 */
  'cell-clicked',
])

// ================================================================
//  内部响应式状态
// ================================================================
const engineWrapper = ref(null)
const engineContainer = ref(null)
const mainCanvas = ref(null)

// ================================================================
//  Camera 对象（§3.2g 收拢：offsetX/offsetY/scale/ISO 单一真相源）
//  外部/内部仍通过 offsetX.value / scale.value / ISO.xxx 访问（零回归）
// ================================================================
const camera = reactive({
  offsetX: 60,
  offsetY: 60,
  scale: 1,
  iso: { ...ISO_DEFAULTS, ...props.isoConfig }, // 平顶化前的默认 ISO
  viewport: { width: 0, height: 0 },            // 供略缩图栏读取（§3.5）
})

// ================================================================
//  内部非响应式变量（须在任何 watch/immediate 回调之前声明，避免 TDZ）
// ================================================================
let ctx = null
let terrainCache = null      // 离屏 Canvas (地形静态层)
let terrainDirty = true      // 地形缓存脏标记
let isDragging = false
let dragStartX = 0, dragStartY = 0, dragStartOX = 0, dragStartOY = 0
let _windowDragMove = null
let _windowDragEnd = null
let _resizeObserver = null
let hlQ = -1, hlR = -1
let isFirstDraw = true
let animFrameId = null
let lastClockTick = 0

// 模式切换：planar 强制 PLANAR_CONFIG（顶视）；iso 沿用传入 isoConfig
const effectiveIso = computed(() =>
  props.mode === 'planar'
    ? PLANAR_CONFIG
    : { ...ISO_DEFAULTS, ...props.isoConfig }
)
watch(effectiveIso, (v) => { Object.assign(camera.iso, v) }, { immediate: true })
// ISO / 挤出开关变化 → 地形缓存失效并重绘（§3.2d）
watch(effectiveIso, () => { invalidateTerrain() })
watch(() => props.extrude, () => { invalidateTerrain() })
// 需求④ 材质变化：预加载图片并重绘（异步加载完成由 onload 再次触发）
watch(() => props.terrainMaterials, (m) => {
  if (m && typeof m === 'object') Object.values(m).forEach((url) => ensureMaterialImage(url))
  invalidateTerrain()
}, { immediate: true, deep: true })

// 兼容访问器：维持组件内 offsetX.value / scale.value / ISO.xxx 原用法不变
const scale = computed({ get: () => camera.scale, set: (v) => { camera.scale = v } })
const offsetX = computed({ get: () => camera.offsetX, set: (v) => { camera.offsetX = v } })
const offsetY = computed({ get: () => camera.offsetY, set: (v) => { camera.offsetY = v } })
const ISO = camera.iso

// 需求④ 材质图片缓存（异步加载，onload 触发重绘；失败缓存避免反复请求）
const materialImageCache = new Map()
function ensureMaterialImage(url) {
  if (!url) return null
  const cached = materialImageCache.get(url)
  if (cached) return cached
  const img = new Image()
  img.onload = () => { materialImageCache.set(url, img); invalidateTerrain() }
  img.onerror = () => { materialImageCache.set(url, { complete: true, __failed: true }); invalidateTerrain() }
  img.src = url
  materialImageCache.set(url, img)
  return img
}

const hoverLabel = ref('')
const frameClock = ref(0)

// 视口裁剪可见范围
const visibleRange = reactive({ minQ: 0, maxQ: 0, minR: 0, maxR: 0 })

// ================================================================
//  六角格数学 — 包装 hexUtils，自动注入当前间距
// ================================================================

function getSpacingH() {
  return props.gridData?.topologyParam?.spacingH ?? DEFAULT_SPACING_H
}
function getSpacingV() {
  return props.gridData?.topologyParam?.spacingV ?? DEFAULT_SPACING_V
}
// Phase 30-Fix: 偏移系数实时读取并参与六角格定位计算
function getOffsetFactor() {
  return props.gridData?.topologyParam?.offsetFactor ?? 0
}

function hexToPixel(q, r) {
  const { flatX, flatY } = pointyTopCenter(q, r, HEX_RADIUS, getSpacingH(), getSpacingV())
  // Phase 30-Fix: offsetFactor 提供额外的 X 轴行级错位调整
  const of = getOffsetFactor()
  return { x: flatX + r * of * HEX_RADIUS * Math.sqrt(3) / 2, y: flatY }
}

function pixelToHex(px, py) {
  return pointyTopToHex(px, py, HEX_RADIUS, getSpacingH(), getSpacingV())
}

function colToLetter(n) {
  let result = '', cur = n
  while (cur >= 0) { result = String.fromCharCode(65 + (cur % 26)) + result; cur = Math.floor(cur / 26) - 1 }
  return result
}

function formatCoord(q, r) {
  return `${colToLetter(q)}${r + 1}`
}

// ================================================================
//  坐标转换管道 — 纯数学，零 DOM 依赖
// ================================================================

/**
 * canvas 像素坐标 → 六角格 (q, r)
 * 
 * 逆变换链（Canvas 纯净 2D，ISO 逆解在 hexUtils 完成）:
 *   1) worldX = (screenX - offsetX) / scale    ← 剥离视口
 *   2) worldY = (screenY - offsetY) / scale
 *   3) { x, y } = isoInverseTransformPoint(worldX, worldY, ISO)  ← ISO→2D
 *   4) pixelToHex(x, y) → (q, r)
 */
function canvasPosToHex(cx, cy) {
  const v = getSpacingV()
  const h = getSpacingH()
  const worldX = (cx - offsetX.value) / scale.value
  const worldY = (cy - offsetY.value) / scale.value

  // planar(编辑器)：世界坐标即纯净 2D 坐标（worldOf 恒等），无需 ISO 逆变换
  // iso(战场)：需 isoInverseTransformPoint 逆解回 2D
  const flat = props.mode === 'planar'
    ? { x: worldX, y: worldY }
    : isoInverseTransformPoint(worldX, worldY, ISO)
  const flatX = flat.x, flatY = flat.y

  const r = Math.round(flatY / (1.5 * HEX_RADIUS * v))

  const evenOffset = (r % 2 === 0) ? (HEX_RADIUS * Math.sqrt(3) / 2) : 0
  const q = Math.round((flatX / h - evenOffset) / (HEX_RADIUS * Math.sqrt(3)))

  return { q, r }
}

/** canvas 像素坐标 → 世界坐标 (用于缩放锚点) */
function canvasPosToWorld(cx, cy) {
  const relX = cx - offsetX.value
  const relY = cy - offsetY.value
  const worldX = relX / scale.value
  const worldY = relY / scale.value
  // planar(编辑器)：世界坐标即纯净 2D 坐标（worldOf 恒等），无需 ISO 逆变换
  const flat = props.mode === 'planar'
    ? { x: worldX, y: worldY }
    : isoInverseTransformPoint(worldX, worldY, ISO)
  return { x: flat.x, y: flat.y, wx: worldX, wy: worldY }
}

/** 鼠标事件 → 六角格 (q,r)
 *  Phase 29-ParitySync: DPR 刚性校准
 *  getBoundingClientRect() 始终返回 CSS 像素 (与 DPR 无关)
 *  canvas.width/height = container.clientWidth/Height (CSS 像素)
 *  → ratio sx/sy 在任意 DPR 下恒为 1.0，但使用显式比例尺确保安全
 */
function getHexAtEvent(e) {
  const canvas = mainCanvas.value
  if (!canvas) return { q: -1, r: -1 }
  const rect = canvas.getBoundingClientRect()
  // DPR-safe: canvas 物理像素 / rect CSS 像素 = 缩放比 (DPR=2 时为 canvas.width/2 : rect.width)
  const sx = canvas.width / rect.width
  const sy = canvas.height / rect.height
  const cx = (e.clientX - rect.left) * sx
  const cy = (e.clientY - rect.top) * sy
  return canvasPosToHex(cx, cy)
}

/** 鼠标事件 → 世界坐标 */
function getWorldPos(e) {
  const canvas = mainCanvas.value
  if (!canvas) return { x: 0, y: 0, wx: 0, wy: 0 }
  const rect = canvas.getBoundingClientRect()
  const sx = canvas.width / rect.width
  const sy = canvas.height / rect.height
  const cx = (e.clientX - rect.left) * sx
  const cy = (e.clientY - rect.top) * sy
  return canvasPosToWorld(cx, cy)
}

// ================================================================
//  视口裁剪 — 计算当前视野内的格子范围
// ================================================================

function updateVisibleRange() {
  const canvas = mainCanvas.value
  if (!canvas || !props.gridData) {
    visibleRange.minQ = 0; visibleRange.maxQ = 0
    visibleRange.minR = 0; visibleRange.maxR = 0
    return
  }
  // 取画布四角反算六角格坐标
  const corners = [
    canvasPosToHex(0, 0),
    canvasPosToHex(canvas.width, 0),
    canvasPosToHex(0, canvas.height),
    canvasPosToHex(canvas.width, canvas.height)
  ]
  const w = props.gridData.width
  const h = props.gridData.height
  const pad = 2 // 缓冲 2 格防边缘闪烁
  visibleRange.minQ = Math.max(0, Math.min(...corners.map(c => c.q)) - pad)
  visibleRange.maxQ = Math.min(w - 1, Math.max(...corners.map(c => c.q)) + pad)
  visibleRange.minR = Math.max(0, Math.min(...corners.map(c => c.r)) - pad)
  visibleRange.maxR = Math.min(h - 1, Math.max(...corners.map(c => c.r)) + pad)
}

/** 判断指定格子是否在视野内 */
function isInViewport(q, r) {
  return q >= visibleRange.minQ && q <= visibleRange.maxQ &&
         r >= visibleRange.minR && r <= visibleRange.maxR
}

// ================================================================
//  离屏地形缓存 — OffscreenCanvas 静态地形层
// ================================================================

function initTerrainCache() {
  if (!terrainCache) {
    terrainCache = document.createElement('canvas')
  }
  const data = props.gridData
  const lastCell = hexToPixel(data.width - 1, data.height - 1)

  // 缓存尺寸必须考虑 ISO 变换后的完整扩展
  // 原始 2D 世界尺寸
  const worldW2D = lastCell.x + HEX_WIDTH * 1.5
  const worldH2D = lastCell.y + HEX_HEIGHT * 1.5

  let cacheW, cacheH
  if (props.mode === 'planar') {
    // 编辑器：纯净 2D 世界坐标（无 ISO 变形），缓存按真实 2D 尺寸扩展，避免被 scaleY 压扁裁切
    cacheW = Math.ceil(worldW2D + HEX_WIDTH * 4)
    cacheH = Math.ceil(worldH2D + HEX_HEIGHT * 4)
  } else {
    // 战场：CTM: x' = x*scaleX + y*shearX,  y' = x*shearY + y*scaleY
    // Phase 30-Fix: 缓存高度补上 shearY 对 Y 轴的贡献（之前遗漏导致底部裁剪）
    cacheW = Math.ceil(worldW2D * ISO.scaleX + worldH2D * Math.abs(ISO.shearX) + HEX_WIDTH * 4)
    cacheH = Math.ceil(worldH2D * ISO.scaleY + worldW2D * Math.abs(ISO.shearY) + HEX_HEIGHT * 4)
  }
  terrainCache.width = Math.max(cacheW, 100)
  terrainCache.height = Math.max(cacheH, 100)
}

function renderTerrainCache() {
  if (!props.useTerrainCache || !terrainCache) {
    // 不使用缓存模式：直接在每帧渲染
    terrainDirty = false
    return
  }
  const tctx = terrainCache.getContext('2d')
  tctx.clearRect(0, 0, terrainCache.width, terrainCache.height)

  const data = props.gridData
  if (!data || !data.cells) return

  const v = getSpacingV()
  const h = getSpacingH()

  // 构建快速查找 Map
  const cellMap = new Map()
  for (const cell of data.cells) {
    cellMap.set(`${cell.q},${cell.r}`, cell)
  }

  // 遍历所有格子
  for (let r = 0; r < data.height; r++) {
    for (let q = 0; q < data.width; q++) {
      const key = `${q},${r}`
      const cell = cellMap.get(key)
      const terrainId = cell?.terrain || 'void'
      const terrainInfo = UNIVERSAL_TERRAIN_MAP[terrainId] || UNIVERSAL_TERRAIN_MAP.void
      const { flatX, flatY } = pointyTopCenter(q, r, HEX_RADIUS, h, v)

      // 留白(void)地形：透明填充，但保留极淡边线使网格结构可见（编辑器与战场均画）。
      if (terrainId === 'void') {
        if (props.mode === 'planar') {
          drawHexPath(tctx, flatX, flatY)
          tctx.strokeStyle = 'rgba(255,255,255,0.25)'
          tctx.lineWidth = 0.5
          tctx.stroke()
        } else if (ISO.topFlat > 0.01 || ISO.bottomFlat > 0.01) {
          drawIsoHexPathDeformed(tctx, flatX, flatY, HEX_WIDTH, HEX_HEIGHT, ISO.topFlat, ISO.bottomFlat, ISO)
          tctx.strokeStyle = 'rgba(255,255,255,0.10)'
          tctx.lineWidth = 0.5
          tctx.stroke()
        } else {
          drawIsoHexPath(tctx, flatX, flatY, ISO)
          tctx.strokeStyle = 'rgba(255,255,255,0.10)'
          tctx.lineWidth = 0.5
          tctx.stroke()
        }
        continue
      }

      // 需求④ 材质：命中 material_url 且已加载 → CanvasPattern 平铺；否则纯色回退
      const matUrl = props.terrainMaterials ? props.terrainMaterials[terrainId] : null
      const matImg = matUrl ? ensureMaterialImage(matUrl) : null
      const matPattern = (matImg && matImg.complete && !matImg.__failed) ? tctx.createPattern(matImg, 'repeat') : null

      // 编辑器(planar)：标准正六边形（无等距变形）。战场(iso)：挤出/等距绘制。
      if (props.mode === 'planar') {
        drawHexPath(tctx, flatX, flatY)
        tctx.fillStyle = matPattern || terrainInfo.color
        tctx.fill()
        tctx.strokeStyle = 'rgba(255,255,255,0.08)'
        tctx.lineWidth = 0.5
        tctx.stroke()
      } else if (props.extrude && (terrainInfo.height || 0) > 0) {
        drawIsoHexColumn(tctx, flatX, flatY, ISO, terrainInfo.height, terrainInfo.color, matPattern || terrainInfo.color)
      } else if (ISO.topFlat > 0.01 || ISO.bottomFlat > 0.01) {
        drawIsoHexPathDeformed(tctx, flatX, flatY, HEX_WIDTH, HEX_HEIGHT, ISO.topFlat, ISO.bottomFlat, ISO)
        tctx.fillStyle = matPattern || terrainInfo.color
        tctx.fill()
        tctx.strokeStyle = 'rgba(255,255,255,0.08)'
        tctx.lineWidth = 0.5
        tctx.stroke()
      } else {
        drawIsoHexPath(tctx, flatX, flatY, ISO)
        tctx.fillStyle = matPattern || terrainInfo.color
        tctx.fill()
        tctx.strokeStyle = 'rgba(255,255,255,0.08)'
        tctx.lineWidth = 0.5
        tctx.stroke()
      }

      // 坐标标签 — planar 用纯净 2D，iso 用 ISO 变换
      if (props.showCoords) {
        const textPos = props.mode === 'planar' ? { x: flatX, y: flatY } : isoTransformPoint(flatX, flatY, ISO)
        tctx.fillStyle = 'rgba(255,255,255,0.35)'
        tctx.font = '9px "Fira Code", monospace'
        tctx.textAlign = 'center'
        tctx.textBaseline = 'middle'
        tctx.fillText(formatCoord(q, r), textPos.x, textPos.y)
      }
    }
  }
  terrainDirty = false
}

// ================================================================
//  棋盘居中
// ================================================================

// planar(编辑器)：忽略 ISO 等距变换，使用纯净 2D 世界坐标（标准正六边形）。
// iso(战场)：沿用 isoTransformPoint 统一等距变换。
function worldOf(flatX, flatY) {
  if (props.mode === 'planar') return { x: flatX, y: flatY }
  return isoTransformPoint(flatX, flatY, ISO)
}

function centerGrid() {
  const canvas = mainCanvas.value
  if (!canvas || !props.gridData) return
  const data = props.gridData
  // Phase 29-TrueFinal: 纯净ISO坐标系，与CTM变换链100%对账（无rotate）
  // 计算4个角点的2D世界坐标
  const corners = [
    hexToPixel(0, 0),
    hexToPixel(data.width - 1, 0),
    hexToPixel(0, data.height - 1),
    hexToPixel(data.width - 1, data.height - 1)
  ]

  // 居中锚点：默认画布几何中心。
  // 战场模式(iso)：改为"画"(实际非 void 留白地形)的包围盒中心，使地图在 100×100 画布中居中、留白环绕。
  // 编辑器(planar)保持原行为，避免用户涂在角落的画被平移走。
  let midGrid = hexToPixel(Math.floor(data.width / 2), Math.floor(data.height / 2))
  if (props.mode === 'iso' && data.cells && data.cells.length) {
    let minQ = Infinity, maxQ = -Infinity, minR = Infinity, maxR = -Infinity
    for (const c of data.cells) {
      if (!c || c.terrain === 'void') continue
      if (c.q < minQ) minQ = c.q
      if (c.q > maxQ) maxQ = c.q
      if (c.r < minR) minR = c.r
      if (c.r > maxR) maxR = c.r
    }
    if (minQ !== Infinity) {
      midGrid = hexToPixel((minQ + maxQ) / 2, (minR + maxR) / 2)
    }
  }

  // Phase 30-Fix: 使用统一 worldOf 变换（planar=恒等，iso=等距）
  const transformedCorners = corners.map(p => worldOf(p.x, p.y))
  // 计算变换后的AABB边界（含边距）
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const c of transformedCorners) {
    if (c.x < minX) minX = c.x
    if (c.x > maxX) maxX = c.x
    if (c.y < minY) minY = c.y
    if (c.y > maxY) maxY = c.y
  }
  const pad = HEX_WIDTH
  minX -= pad; minY -= pad; maxX += pad; maxY += pad

  const worldW = maxX - minX
  const worldH = maxY - minY
  // 变换后的中心点
  const isoMid = worldOf(midGrid.x, midGrid.y)

  // fit-to-view 逻辑确保完整棋盘可见
  const viewW = canvas.width / scale.value
  const viewH = canvas.height / scale.value

  if (worldW > viewW || worldH > viewH) {
    // 棋盘比视图大，居中显示"画"的中心点
    offsetX.value = canvas.width / 2 - isoMid.x * scale.value
    offsetY.value = canvas.height / 2 - isoMid.y * scale.value
  } else {
    // 棋盘比视图小，以"画"的中心为锚点居中（留白=空白画布环绕）
    offsetX.value = canvas.width / 2 - isoMid.x * scale.value
    offsetY.value = canvas.height / 2 - isoMid.y * scale.value
  }
}

// 需求② 略缩图点击跳转：把视图中心移到指定格 (q, r)
function centerOn(q, r) {
  const canvas = mainCanvas.value
  if (!canvas || !props.gridData) return
  const { flatX, flatY } = pointyTopCenter(q, r, HEX_RADIUS, getSpacingH(), getSpacingV())
  const isoMid = worldOf(flatX, flatY)
  offsetX.value = canvas.width / 2 - isoMid.x * scale.value
  offsetY.value = canvas.height / 2 - isoMid.y * scale.value
  invalidateTerrain()
  redraw()
}

// 计算"整张网格完整落入视口"所需的最小缩放（用户需求：缩到最小即整图可见，不再继续缩小）
function computeFitScale() {
  const canvas = mainCanvas.value
  const data = props.gridData
  if (!canvas || !data) return 0.2
  const corners = [
    hexToPixel(0, 0), hexToPixel(data.width - 1, 0),
    hexToPixel(0, data.height - 1), hexToPixel(data.width - 1, data.height - 1),
  ].map(p => worldOf(p.x, p.y))
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const c of corners) {
    if (c.x < minX) minX = c.x
    if (c.x > maxX) maxX = c.x
    if (c.y < minY) minY = c.y
    if (c.y > maxY) maxY = c.y
  }
  // 用户需求：最小缩放下整张网格(含最上/最下排)完整可见，并额外空出约 1 个单元格行的边距。
  // fit 区域 = 网格包围盒 + 上下各约 1 行(HEX_HEIGHT) + 左右各约 1 列(HEX_WIDTH)。
  const padX = HEX_WIDTH
  const padY = HEX_HEIGHT
  minX -= padX; maxX += padX; minY -= padY; maxY += padY
  const regionW = Math.max(1, maxX - minX)
  const regionH = Math.max(1, maxY - minY)
  const margin = 0.98
  const fitW = (canvas.width / regionW) * margin
  const fitH = (canvas.height / regionH) * margin
  // 下限即"整图入框+1 行边距"，不再用固定硬下限(避免大地图无法缩到整图)
  return Math.max(0.001, Math.min(fitW, fitH))
}

// 战场默认视角：聚焦"画"正中 sideN×sideN 格（默认 10×10），其余靠玩家缩放/平移
// 计算"画"(非 void)包围盒中心，取 N×N 区域的 ISO 世界 AABB，按视图缩放并居中。
function focusCentralGrid(sideN = 10) {
  const canvas = mainCanvas.value
  const data = props.gridData
  if (!canvas || !data) return

  // 1) 求"画"的中心 (非 void 包围盒中心)
  let cq = Math.floor(data.width / 2), cr = Math.floor(data.height / 2)
  let minQ = Infinity, maxQ = -Infinity, minR = Infinity, maxR = -Infinity
  if (data.cells && data.cells.length) {
    for (const c of data.cells) {
      if (!c || c.terrain === 'void') continue
      if (c.q < minQ) minQ = c.q
      if (c.q > maxQ) maxQ = c.q
      if (c.r < minR) minR = c.r
      if (c.r > maxR) maxR = c.r
    }
    if (minQ !== Infinity) {
      cq = (minQ + maxQ) / 2
      cr = (minR + maxR) / 2
    } else {
      minQ = 0; maxQ = data.width - 1; minR = 0; maxR = data.height - 1
    }
  } else {
    minQ = 0; maxQ = data.width - 1; minR = 0; maxR = data.height - 1
  }

  // 2) 取 N×N 区域的 ISO 世界 AABB（夹紧到地图实际范围，避免小图过度缩小）
  const half = Math.min(sideN / 2, Math.max(0, (maxQ - minQ) / 2), Math.max(0, (maxR - minR) / 2))
  const qs = [cq - half, cq + half]
  const rs = [cr - half, cr + half]
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const q of qs) for (const r of rs) {
    const p = hexToPixel(q, r)
    const iso = isoTransformPoint(p.x, p.y, ISO)
    if (iso.x < minX) minX = iso.x
    if (iso.x > maxX) maxX = iso.x
    if (iso.y < minY) minY = iso.y
    if (iso.y > maxY) maxY = iso.y
  }
  // 加半格边距，让 10×10 块四周留一点呼吸空间
  minX -= HEX_WIDTH / 2; maxX += HEX_WIDTH / 2
  minY -= HEX_HEIGHT / 2; maxY += HEX_HEIGHT / 2
  const regionW = maxX - minX
  const regionH = maxY - minY
  const margin = 0.9
  const fitW = (canvas.width / regionW) * margin
  const fitH = (canvas.height / regionH) * margin
  let ns = Math.min(fitW, fitH)
  ns = Math.max(computeFitScale(), Math.min(3, ns))
  scale.value = ns

  // 3) 居中该区域
  const center = isoTransformPoint(hexToPixel(cq, cr).x, hexToPixel(cq, cr).y, ISO)
  offsetX.value = canvas.width / 2 - center.x * ns
  offsetY.value = canvas.height / 2 - center.y * ns
  updateVisibleRange()
}

// ================================================================
//  Canvas 初始化
// ================================================================

function initCanvas() {
  const canvas = mainCanvas.value
  const container = engineContainer.value
  if (!canvas || !container) return
  ctx = canvas.getContext('2d')

  // 宪法红线: canvas 物理尺寸 = 容器 CSS 像素，绝不使用百分比
  canvas.width = container.clientWidth
  canvas.height = container.clientHeight
  canvas.style.display = 'block'
  camera.viewport.width = canvas.width
  camera.viewport.height = canvas.height

  // 战场(iso)：进入默认聚焦地图正中 10×10 格，其余靠玩家缩放/平移。
  // 编辑器(planar)：大网格自动缩放到整图可见的 0.5x。
  if (props.mode === 'iso') {
    focusCentralGrid(10)
  } else if (props.gridData.width > 30 || props.gridData.height > 30) {
    scale.value = 0.5
  }

  initTerrainCache()
  renderTerrainCache()
  if (props.mode !== 'iso') centerGrid()
  updateVisibleRange()
  isFirstDraw = false
  draw()
  // 布局延迟自愈：路由返回/首帧容器尺寸未稳定（clientWidth=0）时，
  // 下一帧容器就绪后重新同步尺寸并绘制，避免画布空白。
  requestAnimationFrame(() => {
    const canvas = mainCanvas.value
    const container = engineContainer.value
    if (canvas && container) {
      const cw = container.clientWidth, ch = container.clientHeight
      if (cw > 0 && ch > 0 && (Math.abs(canvas.width - cw) > 1 || Math.abs(canvas.height - ch) > 1)) {
        canvas.width = cw
        canvas.height = ch
        camera.viewport.width = cw
        camera.viewport.height = ch
        if (props.mode === 'iso') focusCentralGrid(10)
        else centerGrid()
        invalidateTerrain()
        draw()
      }
    }
  })
}

// ================================================================
//  渲染入口 — CTM → 地形缓存 → 高亮 → drawFn → 恢复
// ================================================================

function draw() {
  const canvas = mainCanvas.value
  if (!canvas || !ctx) return
  camera.viewport.width = canvas.width
  camera.viewport.height = canvas.height

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.save()

  // === 纯净 2D 视口矩阵：仅 scale + translate，零 ISO 参数 ===
  // 严禁在此处传入 shearX/shearY/scaleX/scaleY！
  // ISO 等距变换由 hexDraw.js 的 drawIsoHexPath/drawIsoHexPathDeformed
  // 在逐顶点层面精确施加，Canvas 只负责视口缩放与平移。
  ctx.setTransform(
    scale.value,     // a: 水平缩放（仅限视口放大缩小）
    0,               // b: 垂直倾斜（必须为 0）
    0,               // c: 水平倾斜（必须为 0）
    scale.value,     // d: 垂直缩放（仅限视口放大缩小）
    offsetX.value,   // e: 水平偏移
    offsetY.value    // f: 垂直偏移
  )

  // === 第一层：地形 (离屏缓存或实时渲染) ===
  if (props.useTerrainCache && terrainCache && !terrainDirty) {
    ctx.drawImage(terrainCache, 0, 0)
  } else {
    // 实时渲染地形 (不使用缓存时)
    renderTerrainInline(ctx)
  }

  // === 第二层：高亮格子覆盖 ===
  renderHighlights(ctx)

  // === 第二层半：画布中心点高亮（编辑器） ===
  if (props.showCenterMarker) {
    renderCenterMarker(ctx)
  }

  // === 第三层：父层追加 (单位/范围/特效) ===
  //  通过局部 save/transform/restore 临时施加 ISO 以保持向后兼容
  if (props.drawFn) {
    ctx.save()
    ctx.transform(ISO.scaleX, ISO.shearY, ISO.shearX, ISO.scaleY, 0, 0)
    props.drawFn(ctx, {
      frameClock: frameClock.value,
      visibleRange,
      isInViewport,
      iso: { ...ISO },
    })
    ctx.restore()
  }

  ctx.restore()
}

/** 不使用缓存时的内联地形渲染 */
function renderTerrainInline(ctx2d) {
  const data = props.gridData
  if (!data || !data.cells) return
  const v = getSpacingV()
  const h = getSpacingH()
  const cellMap = new Map()
  for (const cell of data.cells) {
    cellMap.set(`${cell.q},${cell.r}`, cell)
  }

  // 仅渲染视野内的格子
  for (let r = visibleRange.minR; r <= visibleRange.maxR; r++) {
    for (let q = visibleRange.minQ; q <= visibleRange.maxQ; q++) {
      const key = `${q},${r}`
      const cell = cellMap.get(key)
      const terrainId = cell?.terrain || 'void'
      const terrainInfo = UNIVERSAL_TERRAIN_MAP[terrainId] || UNIVERSAL_TERRAIN_MAP.void
      const { flatX, flatY } = pointyTopCenter(q, r, HEX_RADIUS, h, v)

      // 留白(void)地形：透明填充，但保留极淡边线使网格结构可见（编辑器与战场均画）。
      if (terrainId === 'void') {
        if (props.mode === 'planar') {
          drawHexPath(ctx2d, flatX, flatY)
          ctx2d.strokeStyle = 'rgba(255,255,255,0.25)'
          ctx2d.lineWidth = 0.5
          ctx2d.stroke()
        } else if (ISO.topFlat > 0.01 || ISO.bottomFlat > 0.01) {
          drawIsoHexPathDeformed(ctx2d, flatX, flatY, HEX_WIDTH, HEX_HEIGHT, ISO.topFlat, ISO.bottomFlat, ISO)
          ctx2d.strokeStyle = 'rgba(255,255,255,0.10)'
          ctx2d.lineWidth = 0.5
          ctx2d.stroke()
        } else {
          drawIsoHexPath(ctx2d, flatX, flatY, ISO)
          ctx2d.strokeStyle = 'rgba(255,255,255,0.10)'
          ctx2d.lineWidth = 0.5
          ctx2d.stroke()
        }
        continue
      }

      // 需求④ 材质：实时渲染分支也平铺素材，与缓存分支(renderTerrainCache)保持一致。
      // 素材仅在图片已成功加载(complete 且未失败)时使用，否则回退纯色。
      const matUrl = props.terrainMaterials ? props.terrainMaterials[terrainId] : null
      const matImg = matUrl ? ensureMaterialImage(matUrl) : null
      const matPattern = (matImg && matImg.complete && !matImg.__failed) ? ctx2d.createPattern(matImg, 'repeat') : null

      // 编辑器(planar)：标准正六边形（无等距变形）。战场(iso)：等距逐顶点绘制。
      if (props.mode === 'planar') {
        drawHexPath(ctx2d, flatX, flatY)
      } else if (ISO.topFlat > 0.01 || ISO.bottomFlat > 0.01) {
        drawIsoHexPathDeformed(ctx2d, flatX, flatY, HEX_WIDTH, HEX_HEIGHT, ISO.topFlat, ISO.bottomFlat, ISO)
      } else {
        drawIsoHexPath(ctx2d, flatX, flatY, ISO)
      }
      ctx2d.fillStyle = matPattern || terrainInfo.color
      ctx2d.fill()
      ctx2d.strokeStyle = 'rgba(255,255,255,0.08)'
      ctx2d.lineWidth = 0.5
      ctx2d.stroke()

      if (props.showCoords) {
        const textPos = props.mode === 'planar' ? { x: flatX, y: flatY } : isoTransformPoint(flatX, flatY, ISO)
        ctx2d.fillStyle = 'rgba(255,255,255,0.35)'
        ctx2d.font = '9px "Fira Code", monospace'
        ctx2d.textAlign = 'center'
        ctx2d.textBaseline = 'middle'
        ctx2d.fillText(formatCoord(q, r), textPos.x, textPos.y)
      }
    }
  }
}

/** 渲染高亮格子 */
function renderHighlights(ctx2d) {
  const v = getSpacingV()
  const h = getSpacingH()

  const styleColors = {
    move:    { fill: 'rgba(0, 150, 255, 0.25)', stroke: 'rgba(0, 150, 255, 0.7)' },
    attack:  { fill: 'rgba(255, 80, 80, 0.3)', stroke: 'rgba(255, 80, 80, 0.8)' },
    select:  { fill: 'rgba(255, 176, 0, 0.3)', stroke: 'rgba(255, 176, 0, 0.9)' },
    warning: { fill: 'rgba(255, 0, 0, 0.2)', stroke: 'rgba(255, 0, 0, 0.7)' },
    deploy:  { fill: 'rgba(160, 32, 240, 0.3)', stroke: 'rgba(160, 32, 240, 0.8)' },
  }

  for (const hc of props.highlightCells) {
    if (!isInViewport(hc.q, hc.r)) continue
    const { flatX, flatY } = pointyTopCenter(hc.q, hc.r, HEX_RADIUS, h, v)
    const colors = hc.color
      ? { fill: hc.color, stroke: hc.color }
      : (styleColors[hc.style] || styleColors.select)

    // 编辑器(planar)：标准正六边形；战场(iso)：等距
    if (props.mode === 'planar') {
      drawHexPath(ctx2d, flatX, flatY)
    } else if (ISO.topFlat > 0.01 || ISO.bottomFlat > 0.01) {
      drawIsoHexPathDeformed(ctx2d, flatX, flatY, HEX_WIDTH, HEX_HEIGHT, ISO.topFlat, ISO.bottomFlat, ISO)
    } else {
      drawIsoHexPath(ctx2d, flatX, flatY, ISO)
    }
    ctx2d.fillStyle = colors.fill
    ctx2d.fill()
    ctx2d.strokeStyle = colors.stroke
    ctx2d.lineWidth = 2
    ctx2d.stroke()
    ctx2d.lineWidth = 1

    if (hc.label) {
      const textPos = props.mode === 'planar' ? { x: flatX, y: flatY + 16 } : isoTransformPoint(flatX, flatY + 16, ISO)
      ctx2d.fillStyle = '#fff'
      ctx2d.font = 'bold 11px "Fira Code", monospace'
      ctx2d.textAlign = 'center'
      ctx2d.textBaseline = 'middle'
      ctx2d.fillText(hc.label, textPos.x, textPos.y)
    }
  }

  // === 鼠标悬停高亮边框 (hlQ/hlR 复活) ===
  if (props.showHover && hlQ >= 0 && hlR >= 0 && isInViewport(hlQ, hlR)) {
    const { flatX, flatY } = pointyTopCenter(hlQ, hlR, HEX_RADIUS, h, v)
    // 编辑器(planar)：标准正六边形；战场(iso)：等距
    if (props.mode === 'planar') {
      drawHexPath(ctx2d, flatX, flatY)
    } else if (ISO.topFlat > 0.01 || ISO.bottomFlat > 0.01) {
      drawIsoHexPathDeformed(ctx2d, flatX, flatY, HEX_WIDTH, HEX_HEIGHT, ISO.topFlat, ISO.bottomFlat, ISO)
    } else {
      drawIsoHexPath(ctx2d, flatX, flatY, ISO)
    }
    ctx2d.strokeStyle = 'rgba(255, 215, 0, 0.85)'
    ctx2d.lineWidth = 2.5
    ctx2d.stroke()
    ctx2d.lineWidth = 1
  }
}

// ================================================================
//  画布中心点高亮（编辑器 50×50 → y25:z26 这 2×2 格）
// ================================================================
function renderCenterMarker(ctx2d) {
  const data = props.gridData
  if (!data) return
  const gw = data.width || 50
  const gh = data.height || 50
  // 中心 2×2 块：floor((n-1)/2) 起的相邻两格
  const cq = Math.floor((gw - 1) / 2)
  const cr = Math.floor((gh - 1) / 2)
  const block = [
    { q: cq, r: cr }, { q: cq + 1, r: cr },
    { q: cq, r: cr + 1 }, { q: cq + 1, r: cr + 1 },
  ]
  const sh = getSpacingH()
  const sv = getSpacingV()

  ctx2d.save()
  // 1) 四格金色描边 + 淡填充
  for (const c of block) {
    if (!isInViewport(c.q, c.r)) continue
    const { flatX, flatY } = pointyTopCenter(c.q, c.r, HEX_RADIUS, sh, sv)
    if (props.mode === 'planar') {
      drawHexPath(ctx2d, flatX, flatY)
    } else if (ISO.topFlat > 0.01 || ISO.bottomFlat > 0.01) {
      drawIsoHexPathDeformed(ctx2d, flatX, flatY, HEX_WIDTH, HEX_HEIGHT, ISO.topFlat, ISO.bottomFlat, ISO)
    } else {
      drawIsoHexPath(ctx2d, flatX, flatY, ISO)
    }
    ctx2d.fillStyle = 'rgba(255, 176, 0, 0.18)'
    ctx2d.fill()
    ctx2d.strokeStyle = 'rgba(255, 176, 0, 0.95)'
    ctx2d.lineWidth = 2.5
    ctx2d.stroke()
  }

  // 2) 中心十字（金线）定位 2×2 块几何中心
  const a = pointyTopCenter(cq, cr, HEX_RADIUS, sh, sv)
  const b = pointyTopCenter(cq + 1, cr + 1, HEX_RADIUS, sh, sv)
  const cx0 = (a.flatX + b.flatX) / 2
  const cy0 = (a.flatY + b.flatY) / 2
  ctx2d.strokeStyle = 'rgba(255, 215, 0, 0.9)'
  ctx2d.lineWidth = 1.5
  ctx2d.beginPath()
  ctx2d.moveTo(cx0 - 18, cy0); ctx2d.lineTo(cx0 + 18, cy0)
  ctx2d.moveTo(cx0, cy0 - 14); ctx2d.lineTo(cx0, cy0 + 14)
  ctx2d.stroke()
  ctx2d.lineWidth = 1

  // 3) 标注文字 "中心"
  ctx2d.fillStyle = 'rgba(255, 215, 0, 0.95)'
  ctx2d.font = '11px "Fira Code", monospace'
  ctx2d.textAlign = 'center'
  ctx2d.textBaseline = 'middle'
  ctx2d.fillText('中心 CENTER', cx0, cy0 - 22)
  ctx2d.restore()
}

// ================================================================
//  16 帧动画时钟 — requestAnimationFrame 驱动
// ================================================================

function startClock() {
  if (animFrameId) return
  lastClockTick = performance.now()
  function tick(ts) {
    animFrameId = requestAnimationFrame(tick)
    if (ts - lastClockTick >= props.clockInterval) {
      frameClock.value = (frameClock.value + 1) % 16
      lastClockTick = ts
      draw()
    }
  }
  animFrameId = requestAnimationFrame(tick)
}

function stopClock() {
  if (animFrameId) {
    cancelAnimationFrame(animFrameId)
    animFrameId = null
  }
}

// ================================================================
//  滑槽系统
// ================================================================

function getGridDims() {
  const data = props.gridData
  if (!data) return { gridW: 800, gridH: 600 }
  // Phase 30-Fix: 使用 isoTransformPoint 计算 ISO 扩展后的精确视觉边界
  // 取棋盘右下角在 ISO 空间中的位置
  const lastCell = hexToPixel(data.width - 1, data.height - 1)
  const originCell = hexToPixel(0, 0)
  const isoLast = worldOf(lastCell.x + HEX_RADIUS * 2, lastCell.y + HEX_RADIUS * 2)
  const isoOrigin = worldOf(originCell.x - HEX_RADIUS, originCell.y - HEX_RADIUS)
  const gridW = isoLast.x - isoOrigin.x
  const gridH = isoLast.y - isoOrigin.y
  return { gridW: Math.max(gridW, 200), gridH: Math.max(gridH, 200) }
}

// ================================================================
//  事件绑定
// ================================================================

function setupEvents() {
  const canvas = mainCanvas.value
  if (!canvas) return

  // ---- click → cell-clicked 广播 ----
  canvas.addEventListener('click', (e) => {
    if (isDragging) return
    const hex = getHexAtEvent(e)
    const data = props.gridData
    if (hex.q >= 0 && hex.q < (data.width || 100) && hex.r >= 0 && hex.r < (data.height || 100)) {
      emit('cell-clicked', { q: hex.q, r: hex.r })
    }
  })

  // ---- 拖拽平移 ----
  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return
    isDragging = false
    dragStartX = e.clientX; dragStartY = e.clientY
    dragStartOX = offsetX.value; dragStartOY = offsetY.value
    canvas.style.cursor = 'grabbing'

    _windowDragMove = (ev) => {
      const rect = canvas.getBoundingClientRect()
      const sx = canvas.width / rect.width
      const sy = canvas.height / rect.height
      const dx = ev.clientX - dragStartX
      const dy = ev.clientY - dragStartY
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) isDragging = true
      if (isDragging) {
        offsetX.value = dragStartOX + dx * sx
        offsetY.value = dragStartOY + dy * sy
        draw()
      }
    }

    _windowDragEnd = () => {
      canvas.style.cursor = 'grab'
      if (isDragging) updateVisibleRange()
      isDragging = false
      window.removeEventListener('mousemove', _windowDragMove)
      window.removeEventListener('mouseup', _windowDragEnd)
      _windowDragMove = null; _windowDragEnd = null
    }

    window.addEventListener('mousemove', _windowDragMove)
    window.addEventListener('mouseup', _windowDragEnd)
  })

  // ---- 悬停检测 ----
  canvas.addEventListener('mousemove', (e) => {
    if (isDragging) return

    const hex = getHexAtEvent(e)
    const data = props.gridData
    if (hex.q >= 0 && hex.q < (data.width || 100) && hex.r >= 0 && hex.r < (data.height || 100)) {
      hlQ = hex.q; hlR = hex.r
      if (props.showHover) hoverLabel.value = formatCoord(hex.q, hex.r)
    } else {
      hlQ = -1; hlR = -1
      hoverLabel.value = ''
    }
    draw()
  })

  canvas.addEventListener('mouseleave', () => {
    hlQ = -1; hlR = -1
    hoverLabel.value = ''
    draw()
  })

  // ---- 滚轮缩放 (ISO 锚点补偿) ----
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    const ns = Math.max(computeFitScale(), Math.min(3, scale.value * delta))
    const worldPos = getWorldPos(e)
    offsetX.value += (scale.value - ns) * worldPos.wx
    offsetY.value += (scale.value - ns) * worldPos.wy
    scale.value = ns
    updateVisibleRange()
    draw()
  }, { passive: false })

  canvas.style.cursor = 'grab'
}

// ================================================================
//  公开 API
// ================================================================

function zoomIn() {
  const canvas = mainCanvas.value
  if (!canvas) return
  const ns = Math.min(3, scale.value * 1.2)
  const wc = canvasPosToWorld(canvas.width / 2, canvas.height / 2)
  offsetX.value += (scale.value - ns) * wc.wx
  offsetY.value += (scale.value - ns) * wc.wy
  scale.value = ns
  updateVisibleRange()
  draw()
}

function zoomOut() {
  const canvas = mainCanvas.value
  if (!canvas) return
  const ns = Math.max(computeFitScale(), scale.value / 1.2)
  const wc = canvasPosToWorld(canvas.width / 2, canvas.height / 2)
  offsetX.value += (scale.value - ns) * wc.wx
  offsetY.value += (scale.value - ns) * wc.wy
  scale.value = ns
  updateVisibleRange()
  draw()
}

function zoomReset() {
  const wrapper = engineWrapper.value
  const canvas = mainCanvas.value
  if (!wrapper || !canvas || !props.gridData) { scale.value = 1; draw(); return }
  const data = props.gridData
  // Phase 30-Fix: 使用 isoTransformPoint 计算精确 ISO 视觉边界
  const lastCell = hexToPixel(data.width - 1, data.height - 1)
  const isoLast = worldOf(lastCell.x + HEX_RADIUS * 2, lastCell.y + HEX_RADIUS * 2)
  const cw = isoLast.x + 200
  const ch = isoLast.y + 200
  const viewW = wrapper.clientWidth
  const viewH = wrapper.clientHeight
  const fitScale = Math.min((viewW - 40) / cw, (viewH - 40) / ch)
  const ns = Math.max(computeFitScale(), Math.min(3, fitScale))
  const wc = canvasPosToWorld(canvas.width / 2, canvas.height / 2)
  offsetX.value += (scale.value - ns) * wc.wx
  offsetY.value += (scale.value - ns) * wc.wy
  scale.value = ns
  updateVisibleRange()
  draw()
}

/** 强制重绘 */
function redraw() {
  // 尺寸自愈：若容器尺寸已变化（如路由返回后布局时机导致初始尺寸为 0/错误），
  // 重设 canvas 物理尺寸并重算相机，避免「返回战局后画布空白」。
  const canvas = mainCanvas.value
  const container = engineContainer.value
  if (canvas && container) {
    const cw = container.clientWidth, ch = container.clientHeight
    if (cw > 0 && ch > 0 && (Math.abs(canvas.width - cw) > 1 || Math.abs(canvas.height - ch) > 1)) {
      canvas.width = cw
      canvas.height = ch
      camera.viewport.width = cw
      camera.viewport.height = ch
      // 战场(iso)重聚焦默认视角；编辑器回到整图居中
      if (props.mode === 'iso') focusCentralGrid(10)
      else centerGrid()
      invalidateTerrain()
    }
  }
  draw()
}

/** 标记地形缓存失效并重绘 */
function invalidateTerrain() {
  terrainDirty = true
  renderTerrainCache()
  draw()
}

/** 获取当前可见格子范围 (供父层查询) */
function getVisibleRange() {
  return { ...visibleRange }
}

defineExpose({
  mainCanvas, engineWrapper, engineContainer,
  ctx, scale, offsetX, offsetY, ISO, camera,
  hexToPixel, pixelToHex, getWorldPos, canvasPosToWorld,
  getHexAtEvent,
  zoomIn, zoomOut, zoomReset, redraw, invalidateTerrain, centerGrid,
  getVisibleRange, isInViewport,
  draw, centerOn, focusCentralGrid,
})

// ================================================================
//  ResizeObserver
// ================================================================

function setupResizeObserver() {
  const container = engineContainer.value
  if (!container || typeof ResizeObserver === 'undefined') return
  _resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const { width, height } = entry.contentRect
      const canvas = mainCanvas.value
      if (!canvas) continue
      if (Math.abs(canvas.width - width) > 1 || Math.abs(canvas.height - height) > 1) {
        canvas.width = width
        canvas.height = height
        centerGrid()
        updateVisibleRange()
        draw()
      }
    }
  })
  _resizeObserver.observe(container)
}

// ================================================================
//  Watchers
// ================================================================

watch(() => props.gridData, () => {
  terrainDirty = true
  initTerrainCache()
  renderTerrainCache()
  if (!isFirstDraw) draw()
}, { deep: true })

watch(() => props.gridData?.topologyParam?.spacingH, () => {
  terrainDirty = true; renderTerrainCache(); draw()
})
watch(() => props.gridData?.topologyParam?.spacingV, () => {
  terrainDirty = true; renderTerrainCache(); draw()
})
// Phase 30-Fix: offsetFactor 变化时触发地形缓存重绘
watch(() => props.gridData?.topologyParam?.offsetFactor, () => {
  terrainDirty = true; renderTerrainCache(); draw()
})

watch(() => props.isoConfig, (cfg) => {
  if (!cfg) return
  Object.assign(ISO, cfg)
  terrainDirty = true
  renderTerrainCache()
  centerGrid()
  updateVisibleRange()
  draw()
}, { deep: true, immediate: true })

watch(() => props.highlightCells, () => { draw() }, { deep: true })

// ================================================================
//  生命周期
// ================================================================

onMounted(async () => {
  await nextTick()
  initCanvas()
  setupEvents()
  setupResizeObserver()
  startClock()

  window.addEventListener('resize', () => {
    setTimeout(() => {
      const canvas = mainCanvas.value
      const container = engineContainer.value
      if (!canvas || !container) return
      canvas.width = container.clientWidth
      canvas.height = container.clientHeight
      // 战场(iso)保持 focusCentralGrid 的 10×10 默认视角；编辑器回到整图居中
      if (props.mode === 'iso') focusCentralGrid(10)
      else centerGrid()
      updateVisibleRange()
      draw()
    }, 150)
  })
})

onUnmounted(() => {
  stopClock()
  if (_resizeObserver) { _resizeObserver.disconnect(); _resizeObserver = null }
  if (_windowDragMove) {
    window.removeEventListener('mousemove', _windowDragMove); _windowDragMove = null
  }
  if (_windowDragEnd) {
    window.removeEventListener('mouseup', _windowDragEnd); _windowDragEnd = null
  }
  isDragging = false
  ctx = null
  terrainCache = null
})
</script>

<style scoped>
.hex-engine-sandbox {
  position: relative;
  overflow: hidden;
  flex: 1;
  min-height: 0;
  min-width: 0;
  background: #061218;
  border: 1px solid rgba(255, 176, 0, 0.08);
}

.hex-engine-container {
  position: relative;
  overflow: hidden;
  width: 100%;
  height: 100%;
}

.hex-engine-container canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.cursor-hint {
  position: absolute;
  bottom: 8px;
  left: 8px;
  background: rgba(0, 0, 0, 0.8);
  color: #ffb000;
  padding: 4px 12px;
  font-size: 11px;
  font-family: 'Fira Code', monospace;
  border: 1px solid rgba(255, 176, 0, 0.3);
  pointer-events: none;
  user-select: none;
  z-index: 10;
}
</style>
