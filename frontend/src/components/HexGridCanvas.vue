<template>
  <div class="game-canvas-sandbox" ref="canvasWrapper">
    <div class="canvas-container" ref="canvasContainer">
      <canvas ref="mapCanvas"></canvas>
    </div>
    <div class="cursor-hint" v-if="hoverCoord">{{ hoverCoord }}</div>
    <slot name="overlay" />
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted, nextTick, watch } from 'vue'
import {
  HEX_WIDTH, HEX_HEIGHT, HEX_RADIUS, HEX_APOTHEM,
  DEFAULT_SPACING_H, DEFAULT_SPACING_V,
  pointyTopCenter, pointyTopToHex,
  ISO_DEFAULTS,
} from '../utils/hexUtils.js'

// ================================================================
//  Props — 由父层注入差异化配置
// ================================================================
const props = defineProps({
  /** 模式: 'battle' 战场端(默认) | 'edit' 编辑器端 */
  mode: { type: String, default: 'battle', validator: v => ['battle', 'edit'].includes(v) },
  /** 网格宽度 (列数) */
  gridWidth: { type: Number, required: true },
  /** 网格高度 (行数) */
  gridHeight: { type: Number, required: true },
  /** 水平间距倍率 (edit 模式可动态传入) */
  spacingH: { type: Number, default: DEFAULT_SPACING_H },
  /** 垂直间距倍率 (edit 模式可动态传入) */
  spacingV: { type: Number, default: DEFAULT_SPACING_V },
  /**
   * 父层绘制函数: (ctx, { hlQ, hlR }) => void
   * ctx 已应用完整 CTM (translate → scale → ISO shear)，父层直接绘制即可
   */
  drawFn: { type: Function, default: null },
  /** 等距矩阵 shearX (3D 视角 X 轴倾斜) — 父层可动态绑定滑块 */
  isoShearX: { type: Number, default: ISO_DEFAULTS.shearX },
  /** 等距矩阵 shearY (3D 视角 Y 轴倾斜) — 父层可动态绑定滑块 */
  isoShearY: { type: Number, default: ISO_DEFAULTS.shearY },
  /** ISO 旋转角 (保留兼容，实际旋转由 computed 自动计算) */
  isoRotation: { type: Number, default: undefined },

})

const emit = defineEmits([
  /** hex-click: { q, r, event } — 左键点击六角格 */
  'hex-click',
  /** hex-hover: { q, r } — 鼠标悬停六角格 */
  'hex-hover',
  /** hex-contextmenu: { q, r, event } — 右键点击六角格 */
  'hex-contextmenu',
])

// ================================================================
//  响应式状态
// ================================================================
const canvasWrapper = ref(null)
const canvasContainer = ref(null)
const mapCanvas = ref(null)
const scale = ref(1)
const offsetX = ref(60)
const offsetY = ref(60)
const hoverCoord = ref('')
// ISO 矩阵参数 — 使用 reactive 以支持父层通过 props 动态调节 3D 视角
const ISO = reactive({ ...ISO_DEFAULTS })

// Phase9.6: 标准等距平行投影 — transform(scaleX, 0, shearX, scaleY, 0, 0)
// 性质: R=0 行 screenY=offsetY (绝对水平地平线), shearX 驱动 X 轴等距倾斜, 列向量绝对平行


// ================================================================
//  内部可变状态 (非响应式 — 仅驱动内部逻辑)
// ================================================================
let ctx = null
let isDragging = false
let dragStartX = 0, dragStartY = 0, dragStartOX = 0, dragStartOY = 0
let _windowDragMove = null
let _windowDragEnd = null
let _resizeTimer = null
let hlQ = -1, hlR = -1
let isFirstDraw = true

// ================================================================
//  六角格数学 — 包装 hexUtils，自动注入当前 spacing
// ================================================================

/** 六角格坐标 → 2D 世界坐标 */
function hexToPixel(q, r) {
  const { flatX, flatY } = pointyTopCenter(q, r, HEX_RADIUS, props.spacingH, props.spacingV)
  return { x: flatX, y: flatY }
}

/** 2D 世界坐标 → 六角格坐标 */
function pixelToHex(px, py) {
  return pointyTopToHex(px, py, HEX_RADIUS, props.spacingH, props.spacingV)
}

/** 列号 → 字母 (0→A, ..., 25→Z, 26→AA) */
function colToLetter(n) {
  let result = ''
  let cur = n
  while (cur >= 0) {
    result = String.fromCharCode(65 + (cur % 26)) + result
    cur = Math.floor(cur / 26) - 1
  }
  return result
}

/** 格式化坐标标签: A1, B2, ... */
function formatCoord(q, r) {
  return `${colToLetter(q)}${r + 1}`
}

// ================================================================
//  坐标转换 — 纯数学管道 (零 DOM 依赖)
// ================================================================

/**
 * canvas 像素坐标 → 世界坐标 (含 ISO 逆矩阵)
 *
 * 正向 CTM: translate → scale → transform(scaleX, 0, shearX, scaleY, 0, 0)
 *   即: screenX = offsetX + scale * (scaleX * flatX + shearX * flatY)
 *       screenY = offsetY + scale * (scaleY * flatY)
 *
 * 性质:
 *   - R=0 行: flatY=0 → screenY=offsetY (绝对水平地平线)
 *   - shearX 驱动 X 轴倾斜 (flatY 越大, X 偏移越多 → 标准等距纵深感)
 *
 * 逆矩阵管线 (严格成对倒数):
 *   1) relX = cx - offsetX, relY = cy - offsetY
 *   2) worldX = relX / scale, worldY = relY / scale
 *   3) flatY = worldY / scaleY
 *   4) flatX = (worldX - shearX * flatY) / scaleX
 *         = (worldX - shearX * worldY / scaleY) / scaleX
 */
function canvasPosToWorld(cx, cy) {
  // 1) 减去相机平移量
  const relX = cx - offsetX.value
  const relY = cy - offsetY.value
  // 2) 除以缩放比例
  const worldX = relX / scale.value
  const worldY = relY / scale.value
  // 3) 逆向 ISO 仿射: 与正向 CTM transform(scaleX, 0, shearX, scaleY, 0, 0) 严格成对倒数
  const flatY = worldY / ISO.scaleY
  const flatX = (worldX - ISO.shearX * flatY) / ISO.scaleX
  return { x: flatX, y: flatY, wx: worldX, wy: worldY }
}

/** 鼠标事件 → 世界坐标 (含 getBoundingClientRect 缩放补偿) */
function getWorldPos(e) {
  const canvas = mapCanvas.value
  if (!canvas) return { x: 0, y: 0, wx: 0, wy: 0 }
  const rect = canvas.getBoundingClientRect()
  const sx = canvas.width / rect.width
  const sy = canvas.height / rect.height
  const cx = (e.clientX - rect.left) * sx
  const cy = (e.clientY - rect.top) * sy
  return canvasPosToWorld(cx, cy)
}

// ================================================================
//  Canvas 尺寸计算 & 居中
// ================================================================



/** 设置 offsetX/offsetY 使棋盘几何中心对齐画布中心 (含等距变换) */
/**
 * 设置 offsetX/offsetY 使棋盘几何中心对齐画布中心
 * 使用标准等距平行投影:
 *   screenX = scaleX * flatX + shearX * flatY
 *   screenY = scaleY * flatY  (仅依赖 flatY, R=0 行绝对水平)
 */
function centerGrid() {
  const canvas = mapCanvas.value
  if (!canvas) return
  const midGrid = hexToPixel(Math.floor(props.gridWidth / 2), Math.floor(props.gridHeight / 2))
  // 标准等距: X 由 flatX 和 flatY (通过 shearX) 共同决定, Y 仅由 flatY 决定
  const isoCenterX = midGrid.x * ISO.scaleX + midGrid.y * ISO.shearX
  const isoCenterY = midGrid.y * ISO.scaleY
  offsetX.value = canvas.width / 2 - isoCenterX * scale.value
  offsetY.value = canvas.height / 2 - isoCenterY * scale.value
}

// ================================================================
//  Canvas 初始化
// ================================================================

function initCanvas() {
  const canvas = mapCanvas.value
  const container = canvasContainer.value
  if (!canvas || !container) return
  ctx = canvas.getContext('2d')

  // 宪法红线: canvas 物理尺寸严格等于容器 CSS 像素尺寸，绝不使用世界坐标
  canvas.width = container.clientWidth
  canvas.height = container.clientHeight
  canvas.style.display = 'block'

  if (props.gridWidth > 30 || props.gridHeight > 30) {
    scale.value = 0.5
  }

  centerGrid()
  isFirstDraw = false
  draw()
}

// ================================================================
//  渲染入口 — CTM 变换链 → 调用父层 drawFn
// ================================================================

/**
 * 每帧绘制管线:
 *   1. 清空 Canvas
 *   2. 应用 CTM: translate(offset) → scale(scale) → transform(ISO shear)
 *   3. 调用父层注入的 drawFn(ctx, { hlQ, hlR })
 *   4. restore CTM
 *
 * 注: 间距变化时自动重新计算画布尺寸并居中
 */
function draw() {
  const canvas = mapCanvas.value
  if (!canvas || !ctx) return

  // 宪法红线: canvas 物理尺寸永不改变，所有变换通过 CTM 实现
  if (isFirstDraw) {
    centerGrid()
    isFirstDraw = false
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.save()

  // === CTM: 平移 → 缩放 → 标准等距平行投影 ===
  // 公式:
  //   screenX = scaleX * flatX + shearX * flatY  (shearX 驱动 X 轴纵深感)
  //   screenY = scaleY * flatY                    (Y 仅依赖 flatY, 绝对水平)
  // 等价 canvas: transform(scaleX, 0, shearX, scaleY, 0, 0)
  // 性质:
  //   - R=0 行 screenY=0 → 画布上绝对水平地平线
  //   - shearX 滑块拉动 → 整列平行推移 (等距纵深感)
  //   - 列斜率恒定 = shearX * scaleY / (scaleX * sqrt(3)), 首尾列绝对平行
  ctx.translate(offsetX.value, offsetY.value)
  ctx.scale(scale.value, scale.value)
  ctx.transform(ISO.scaleX, 0, ISO.shearX, ISO.scaleY, 0, 0)

  // 调用父层绘制函数 (ctx 已应用 CTM)
  if (props.drawFn) {
    props.drawFn(ctx, { hlQ, hlR })
  }

  ctx.restore()
}

// ================================================================
//  Window Resize 事件驱动 — 补位已切除的 draw() 动态 resize
// ================================================================

/**
 * 浏览器窗口/侧边栏变化时，同步 canvas 位图像素与容器 CSS 物理尺寸。
 * 宪法红线: 仅 resize 事件触发时执行，绝不在 draw() 每帧执行。
 */
function handleWindowResize() {
  const canvas = mapCanvas.value
  const container = canvasContainer.value
  if (!canvas || !container) return
  canvas.width = container.clientWidth
  canvas.height = container.clientHeight
  centerGrid()
  draw()
}

// ================================================================
//  事件绑定 — 全部统一使用 addEventListener (不再混用 onclick)
// ================================================================

function setupEvents() {
  const canvas = mapCanvas.value
  if (!canvas) return

  // ---- click (左键点击) ----
  canvas.addEventListener('click', (e) => {
    if (isDragging) return
    const wp = getWorldPos(e)
    const hex = pixelToHex(wp.x, wp.y)
    if (hex.q >= 0 && hex.q < props.gridWidth && hex.r >= 0 && hex.r < props.gridHeight) {
      emit('hex-click', { q: hex.q, r: hex.r, event: e })
    }
  })

  // ---- contextmenu (右键) ----
  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault()
    if (isDragging) return
    const wp = getWorldPos(e)
    const hex = pixelToHex(wp.x, wp.y)
    if (hex.q >= 0 && hex.q < props.gridWidth && hex.r >= 0 && hex.r < props.gridHeight) {
      emit('hex-contextmenu', { q: hex.q, r: hex.r, event: e })
    }
  })

  // ---- mousedown (拖拽起点，绑定 window 级事件防止鼠标出界) ----
  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return
    isDragging = false
    dragStartX = e.clientX
    dragStartY = e.clientY
    dragStartOX = offsetX.value
    dragStartOY = offsetY.value
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
      canvas.style.cursor = props.mode === 'edit' ? 'crosshair' : 'grab'
      isDragging = false
      window.removeEventListener('mousemove', _windowDragMove)
      window.removeEventListener('mouseup', _windowDragEnd)
      _windowDragMove = null
      _windowDragEnd = null
    }

    window.addEventListener('mousemove', _windowDragMove)
    window.addEventListener('mouseup', _windowDragEnd)
  })

  // ---- mousemove (hover, 拖拽由 window handler 处理) ----
  canvas.addEventListener('mousemove', (e) => {
    if (isDragging) return
    const wp = getWorldPos(e)
    const hex = pixelToHex(wp.x, wp.y)
    if (hex.q >= 0 && hex.q < props.gridWidth && hex.r >= 0 && hex.r < props.gridHeight) {
      hlQ = hex.q
      hlR = hex.r
      hoverCoord.value = formatCoord(hex.q, hex.r)
      emit('hex-hover', { q: hex.q, r: hex.r })
    } else {
      hlQ = -1
      hlR = -1
      hoverCoord.value = ''
    }
    draw()
  })

  // ---- mouseleave (仅清悬停，不重置 isDragging) ----
  canvas.addEventListener('mouseleave', () => {
    hlQ = -1
    hlR = -1
    hoverCoord.value = ''
    draw()
  })

  // ---- wheel (带 ISO 锚点补偿的滚轮缩放，统一 0.9/1.1) ----
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    const ns = Math.max(0.2, Math.min(3, scale.value * delta))
    const worldPos = getWorldPos(e)
    // offset_new = offset_old + (scale_old - scale_new) * worldPos.wx/wy
    // 保证缩放前后鼠标下的世界坐标点始终在同一屏幕位置
    offsetX.value += (scale.value - ns) * worldPos.wx
    offsetY.value += (scale.value - ns) * worldPos.wy
    scale.value = ns
    draw()
  }, { passive: false })

  canvas.style.cursor = props.mode === 'edit' ? 'crosshair' : 'grab'
}

// ================================================================
//  公开 API — 供父层通过 template ref 调用
// ================================================================

/**
 * 放大 (1.2x)，以画布中心世界坐标为锚点
 *   offset += (scale_old - scale_new) * worldCenter.wx/wy
 */
function zoomIn() {
  const canvas = mapCanvas.value
  if (!canvas) return
  const ns = Math.min(3, scale.value * 1.2)
  const worldCenter = canvasPosToWorld(canvas.width / 2, canvas.height / 2)
  offsetX.value += (scale.value - ns) * worldCenter.wx
  offsetY.value += (scale.value - ns) * worldCenter.wy
  scale.value = ns
  draw()
}

/**
 * 缩小 (÷1.2)，以画布中心世界坐标为锚点
 */
function zoomOut() {
  const canvas = mapCanvas.value
  if (!canvas) return
  const ns = Math.max(0.2, scale.value / 1.2)
  const worldCenter = canvasPosToWorld(canvas.width / 2, canvas.height / 2)
  offsetX.value += (scale.value - ns) * worldCenter.wx
  offsetY.value += (scale.value - ns) * worldCenter.wy
  scale.value = ns
  draw()
}

/**
 * 自适应缩放: 使整个棋盘适配当前视口
 *   1. 计算棋盘总尺寸 → 2. 计算 fitScale → 3. 以画布中心为锚点缩放
 */
function zoomReset() {
  const wrapper = canvasWrapper.value
  if (!wrapper) { scale.value = 1; draw(); return }
  const canvas = mapCanvas.value
  const lastCol = hexToPixel(props.gridWidth - 1, 0)
  const lastRow = hexToPixel(0, props.gridHeight - 1)
  const worldW = lastCol.x + HEX_RADIUS * 2
  const worldH = lastRow.y + HEX_RADIUS * 2
  const cw = worldW * ISO.scaleX + worldH * Math.abs(ISO.shearX) + 200
  const ch = worldH * ISO.scaleY + 200  // 新公式: screenY=scaleY*flatY, 无 shearY 分量
  const viewW = wrapper.clientWidth
  const viewH = wrapper.clientHeight
  const pad = 20
  const fitScale = Math.min((viewW - pad * 2) / cw, (viewH - pad * 2) / ch)
  const ns = Math.max(0.2, Math.min(3, fitScale))
  const worldCenter = canvasPosToWorld(canvas.width / 2, canvas.height / 2)
  offsetX.value += (scale.value - ns) * worldCenter.x
  offsetY.value += (scale.value - ns) * worldCenter.y
  scale.value = ns
  draw()
}

/** 强制重绘 (父层数据变更后调用) */
function redraw() { draw() }

// ================================================================
//  生命周期
// ================================================================

onMounted(async () => {
  await nextTick()
  initCanvas()
  setupEvents()
  // debounce resize: 避免高频触发导致重绘风暴
  window.addEventListener('resize', () => {
    if (_resizeTimer) clearTimeout(_resizeTimer)
    _resizeTimer = setTimeout(handleWindowResize, 150)
  })
})

onUnmounted(() => {
  // 彻底清理 window 级事件监听，消灭内存泄漏风险
  window.removeEventListener('resize', handleWindowResize)
  if (_resizeTimer) {
    clearTimeout(_resizeTimer)
    _resizeTimer = null
  }
  if (_windowDragMove) {
    window.removeEventListener('mousemove', _windowDragMove)
    _windowDragMove = null
  }
  if (_windowDragEnd) {
    window.removeEventListener('mouseup', _windowDragEnd)
    _windowDragEnd = null
  }
  isDragging = false
  ctx = null
})

// ================================================================
//  Spacing 变化监听 (edit 模式动态调整间距时触发重绘)
// ================================================================

watch(() => props.spacingH, () => { isFirstDraw = true; draw() })
watch(() => props.spacingV, () => { isFirstDraw = true; draw() })

// ---- 3D 视角参数变化监听 ----
// 父层滑块拖动时实时同步 ISO 矩阵并触发重绘
watch(() => props.isoShearX, (v) => {
  if (v !== undefined && v !== null) ISO.shearX = v
  draw()
})
watch(() => props.isoShearY, (v) => {
  if (v !== undefined && v !== null) ISO.shearY = v
  draw()
})

// isoRotation prop 保留向后兼容 (简化 ISO 不再需要旋转角)
watch(() => props.isoRotation, () => { draw() })


// ================================================================
//  暴露给父层 (template ref 可访问)
// ================================================================

defineExpose({
  mapCanvas,
  canvasWrapper,
  canvasContainer,
  ctx,
  scale,
  offsetX,
  offsetY,
  ISO,
  hexToPixel,
  pixelToHex,
  getWorldPos,
  canvasPosToWorld,
  zoomIn,
  zoomOut,
  zoomReset,
  redraw,
  draw,
})
</script>

<style scoped>
/* ===== 沙盒隔离容器 ===== */
.game-canvas-sandbox {
  position: relative;
  overflow: hidden;
  flex: 1;
  min-height: 0;
  min-width: 0;
  background: #061218;
  border: 1px solid rgba(255, 176, 0, 0.08);
}

.canvas-container {
  position: relative;
  overflow: hidden;
  width: 100%;
  height: 100%;
}

.canvas-container canvas {
  display: block;
  width: 100%;
  height: 100%;
}

/* 悬停坐标提示 */
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
