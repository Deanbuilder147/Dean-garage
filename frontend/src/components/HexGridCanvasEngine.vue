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
    <!-- 双轴平移滑槽 -->
    <div class="slider-panel" @mousedown.stop @click.stop>
      <input type="range" class="slider-track slider-h" min="0" max="100" :value="hSlider" @input="onHSlider" title="水平平移">
      <span class="slider-divider">|</span>
      <input type="range" class="slider-track slider-v" min="0" max="100" :value="vSlider" @input="onVSlider" title="垂直平移">
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
import { ref, reactive, onMounted, onUnmounted, nextTick, watch } from 'vue'
import {
  HEX_WIDTH, HEX_HEIGHT, HEX_RADIUS,
  DEFAULT_SPACING_H, DEFAULT_SPACING_V,
  pointyTopCenter, pointyTopToHex,
  drawHexPath, drawHexPathDeformed,
  drawIsoHexPath, drawIsoHexPathDeformed,
  isoTransformPoint, isoInverseTransformPoint,
  UNIVERSAL_TERRAIN_MAP,
  ISO_DEFAULTS,
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
   * 等距视角配置
   * { shearX, shearY, scaleX, scaleY, rotation, topFlat, bottomFlat }
   */
  isoConfig: {
    type: Object,
    default: () => ({ ...ISO_DEFAULTS })
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

const scale = ref(1)
const offsetX = ref(60)
const offsetY = ref(60)
const hSlider = ref(50)
const vSlider = ref(50)
const hoverLabel = ref('')
const frameClock = ref(0)

// ISO 矩阵参数
const ISO = reactive({ ...ISO_DEFAULTS, ...props.isoConfig })

// 视口裁剪可见范围
const visibleRange = reactive({ minQ: 0, maxQ: 0, minR: 0, maxR: 0 })

// ================================================================
//  内部非响应式变量
// ================================================================
let ctx = null
let terrainCache = null      // 离屏 Canvas (地形静态层)
let terrainDirty = true      // 地形缓存脏标记
let isDragging = false
let dragStartX = 0, dragStartY = 0, dragStartOX = 0, dragStartOY = 0
let _windowDragMove = null
let _windowDragEnd = null
let _resizeObserver = null
let _sliderSyncing = false
let hlQ = -1, hlR = -1
let isFirstDraw = true
let animFrameId = null
let lastClockTick = 0

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

  const { x: flatX, y: flatY } = isoInverseTransformPoint(worldX, worldY, ISO)

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
  const { x: flatX, y: flatY } = isoInverseTransformPoint(worldX, worldY, ISO)
  return { x: flatX, y: flatY, wx: worldX, wy: worldY }
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

  // CTM: x' = x*scaleX + y*shearX,  y' = x*shearY + y*scaleY
  // Phase 30-Fix: 缓存高度补上 shearY 对 Y 轴的贡献（之前遗漏导致底部裁剪）
  const cacheW = Math.ceil(worldW2D * ISO.scaleX + worldH2D * Math.abs(ISO.shearX) + HEX_WIDTH * 4)
  const cacheH = Math.ceil(worldH2D * ISO.scaleY + worldW2D * Math.abs(ISO.shearY) + HEX_HEIGHT * 4)
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
      const terrainId = cell?.terrain || 'moon'
      const terrainInfo = UNIVERSAL_TERRAIN_MAP[terrainId] || UNIVERSAL_TERRAIN_MAP.moon

      const { flatX, flatY } = pointyTopCenter(q, r, HEX_RADIUS, h, v)

      // Phase 30-Fix: 使用 ISO 逐顶点变换绘制，Canvas 保持纯净 2D
      if (ISO.topFlat > 0.01 || ISO.bottomFlat > 0.01) {
        drawIsoHexPathDeformed(tctx, flatX, flatY, HEX_WIDTH, HEX_HEIGHT, ISO.topFlat, ISO.bottomFlat, ISO)
      } else {
        drawIsoHexPath(tctx, flatX, flatY, ISO)
      }
      tctx.fillStyle = terrainInfo.color
      tctx.fill()
      tctx.strokeStyle = 'rgba(255,255,255,0.08)'
      tctx.lineWidth = 0.5
      tctx.stroke()

      // 坐标标签 — 应用 ISO 变换到文本位置
      if (props.showCoords) {
        const textPos = isoTransformPoint(flatX, flatY, ISO)
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
  const midGrid = hexToPixel(Math.floor(data.width / 2), Math.floor(data.height / 2))

  // Phase 30-Fix: 使用 hexUtils.isoTransformPoint 统一 ISO 变换
  const transformedCorners = corners.map(p => isoTransformPoint(p.x, p.y, ISO))
  // 计算ISO变换后的AABB边界（含边距）
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
  // 变换后的中心点（纯ISO）
  const isoMid = isoTransformPoint(midGrid.x, midGrid.y, ISO)

  // fit-to-view 逻辑确保完整棋盘可见
  const viewW = canvas.width / scale.value
  const viewH = canvas.height / scale.value

  if (worldW > viewW || worldH > viewH) {
    // 棋盘比视图大，居中显示中心点
    offsetX.value = canvas.width / 2 - isoMid.x * scale.value
    offsetY.value = canvas.height / 2 - isoMid.y * scale.value
  } else {
    // 棋盘比视图小，完全居中
    offsetX.value = (canvas.width - worldW * scale.value) / 2 - minX * scale.value
    offsetY.value = (canvas.height - worldH * scale.value) / 2 - minY * scale.value
  }
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

  // 大网格自动缩放到 0.5x
  if (props.gridData.width > 30 || props.gridData.height > 30) {
    scale.value = 0.5
  }

  initTerrainCache()
  renderTerrainCache()
  centerGrid()
  updateVisibleRange()
  isFirstDraw = false
  draw()
}

// ================================================================
//  渲染入口 — CTM → 地形缓存 → 高亮 → drawFn → 恢复
// ================================================================

function draw() {
  const canvas = mainCanvas.value
  if (!canvas || !ctx) return

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.save()

  // === 纯净 2D 视口矩阵：仅 scale + translate，零 ISO 参数 ===
  // 严禁在此处传入 shearX/shearY/scaleX/scaleY！
  // ISO 等距变换由 hexUtils.js 的 drawIsoHexPath/drawIsoHexPathDeformed
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
  syncSlidersFromOffset()
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
      const terrainId = cell?.terrain || 'moon'
      const terrainInfo = UNIVERSAL_TERRAIN_MAP[terrainId] || UNIVERSAL_TERRAIN_MAP.moon
      const { flatX, flatY } = pointyTopCenter(q, r, HEX_RADIUS, h, v)

      // Phase 30-Fix: ISO 逐顶点变换绘制，Canvas 纯净 2D
      if (ISO.topFlat > 0.01 || ISO.bottomFlat > 0.01) {
        drawIsoHexPathDeformed(ctx2d, flatX, flatY, HEX_WIDTH, HEX_HEIGHT, ISO.topFlat, ISO.bottomFlat, ISO)
      } else {
        drawIsoHexPath(ctx2d, flatX, flatY, ISO)
      }
      ctx2d.fillStyle = terrainInfo.color
      ctx2d.fill()
      ctx2d.strokeStyle = 'rgba(255,255,255,0.08)'
      ctx2d.lineWidth = 0.5
      ctx2d.stroke()

      if (props.showCoords) {
        const textPos = isoTransformPoint(flatX, flatY, ISO)
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

    // Phase 30-Fix: ISO 逐顶点变换绘制
    if (ISO.topFlat > 0.01 || ISO.bottomFlat > 0.01) {
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
      const textPos = isoTransformPoint(flatX, flatY + 16, ISO)
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
    // Phase 30-Fix: ISO 逐顶点变换绘制
    if (ISO.topFlat > 0.01 || ISO.bottomFlat > 0.01) {
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
  const isoLast = isoTransformPoint(lastCell.x + HEX_RADIUS * 2, lastCell.y + HEX_RADIUS * 2, ISO)
  const isoOrigin = isoTransformPoint(originCell.x - HEX_RADIUS, originCell.y - HEX_RADIUS, ISO)
  const gridW = isoLast.x - isoOrigin.x
  const gridH = isoLast.y - isoOrigin.y
  return { gridW: Math.max(gridW, 200), gridH: Math.max(gridH, 200) }
}

function getSliderRange() {
  const canvas = mainCanvas.value
  if (!canvas) return { minX: -500, maxX: 500, minY: -500, maxY: 500 }
  const { gridW, gridH } = getGridDims()
  const scaledW = gridW * scale.value
  const scaledH = gridH * scale.value
  const cw = canvas.width
  const ch = canvas.height
  return {
    minX: -scaledW + cw * 0.2,
    maxX: cw * 0.8,
    minY: -scaledH + ch * 0.2,
    maxY: ch * 0.8,
  }
}

function syncSlidersFromOffset() {
  if (_sliderSyncing) return
  const { minX, maxX, minY, maxY } = getSliderRange()
  if (maxX > minX) hSlider.value = Math.round(((offsetX.value - minX) / (maxX - minX)) * 100)
  if (maxY > minY) vSlider.value = Math.round(((offsetY.value - minY) / (maxY - minY)) * 100)
}

function onHSlider(e) {
  const val = parseFloat(e.target.value)
  const { minX, maxX } = getSliderRange()
  _sliderSyncing = true
  offsetX.value = minX + (maxX - minX) * (val / 100)
  updateVisibleRange()
  draw()
  _sliderSyncing = false
}

function onVSlider(e) {
  const val = parseFloat(e.target.value)
  const { minY, maxY } = getSliderRange()
  _sliderSyncing = true
  offsetY.value = minY + (maxY - minY) * (val / 100)
  updateVisibleRange()
  draw()
  _sliderSyncing = false
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
    if (hex.q >= 0 && hex.q < data.width && hex.r >= 0 && hex.r < data.height) {
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
    if (hex.q >= 0 && hex.q < data.width && hex.r >= 0 && hex.r < data.height) {
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
    const ns = Math.max(0.2, Math.min(3, scale.value * delta))
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
  const ns = Math.max(0.2, scale.value / 1.2)
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
  const isoLast = isoTransformPoint(lastCell.x + HEX_RADIUS * 2, lastCell.y + HEX_RADIUS * 2, ISO)
  const cw = isoLast.x + 200
  const ch = isoLast.y + 200
  const viewW = wrapper.clientWidth
  const viewH = wrapper.clientHeight
  const fitScale = Math.min((viewW - 40) / cw, (viewH - 40) / ch)
  const ns = Math.max(0.2, Math.min(3, fitScale))
  const wc = canvasPosToWorld(canvas.width / 2, canvas.height / 2)
  offsetX.value += (scale.value - ns) * wc.wx
  offsetY.value += (scale.value - ns) * wc.wy
  scale.value = ns
  updateVisibleRange()
  draw()
}

/** 强制重绘 */
function redraw() { draw() }

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
  ctx, scale, offsetX, offsetY, ISO,
  hexToPixel, pixelToHex, getWorldPos, canvasPosToWorld,
  getHexAtEvent,
  zoomIn, zoomOut, zoomReset, redraw, invalidateTerrain, centerGrid,
  getVisibleRange, isInViewport,
  draw,
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
      centerGrid()
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

/* 双轴平移滑槽 */
.slider-panel {
  position: absolute;
  bottom: 6px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 2px;
  background: rgba(6, 18, 24, 0.82);
  border: 1px solid rgba(255, 176, 0, 0.18);
  border-radius: 6px;
  padding: 3px 10px;
  backdrop-filter: blur(4px);
}

.slider-track {
  -webkit-appearance: none;
  appearance: none;
  height: 3px;
  background: rgba(255, 176, 0, 0.12);
  border-radius: 2px;
  outline: none;
  cursor: pointer;
}

.slider-h { width: 140px; }
.slider-v { width: 100px; }

.slider-track::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 11px; height: 11px;
  border-radius: 50%;
  background: #ffb000;
  border: 1.5px solid #0d1f2d;
  cursor: grab;
}

.slider-divider {
  color: rgba(255, 176, 0, 0.25);
  font-size: 10px;
  margin: 0 4px;
  user-select: none;
}
</style>
