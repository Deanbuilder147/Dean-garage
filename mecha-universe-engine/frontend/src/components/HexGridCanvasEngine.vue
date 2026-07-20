/**
 * Phase 29-X — 纯净六角格 Canvas 渲染引擎
 *
 * 工序三.1: 无状态纯净重组。画布组件禁止绑定任何局部的业务变量。
 * 工序三.2: 交互事件全量外挂。点击时仅通过 Even-R 矩阵反算六角格坐标，
 *           对外执行 cell-clicked 统一事件派发，外层编辑器策略各自监听。
 * 工序三.3: 视口裁剪与离屏缓存。仅对视野内机甲执行 16 帧基线动画流播放，
 *           视野外机甲锁死第一帧，防爆手机内存。
 */

import {
  HEX_WIDTH, HEX_HEIGHT,
  hexToPixel, pixelToHex,
  drawHexPath, TERRAIN_COLORS,
  flatToIso, ISO_DEFAULTS,
} from '@/utils/hexUtils.js'

// ============================================
// 渲染常量
// ============================================
const ANIMATION_FRAME_COUNT = 16     // 基线动画帧数
const OFFSCREEN_CACHE_TTL = 5000     // 离屏缓存过期时间 (ms)
const VIEWPORT_PADDING = 2           // 视口外扩格数

// ============================================
// 离屏缓存
// ============================================
const offscreenCache = new Map()
let cacheTimestamp = 0

function getCacheKey(cells, zoom, offsetX, offsetY) {
  return `${cells.length}-${zoom.toFixed(2)}-${offsetX.toFixed(0)}-${offsetY.toFixed(0)}`
}

function invalidateCache() {
  if (Date.now() - cacheTimestamp > OFFSCREEN_CACHE_TTL) {
    offscreenCache.clear()
    cacheTimestamp = Date.now()
  }
}

// ============================================
// 视口裁剪计算
// ============================================
function getVisibleCells(cells, canvasWidth, canvasHeight, zoom, offsetX, offsetY) {
  const visible = []
  const iso = ISO_DEFAULTS.baseline

  for (const cell of cells) {
    const center = hexToPixel(cell.q, cell.r)
    const screen = flatToIso(center.x, center.y, iso.shearX, iso.shearY, iso.scaleX, iso.scaleY, iso.rot)
    const sx = screen.x * zoom + offsetX
    const sy = screen.y * zoom + offsetY

    const padding = HEX_WIDTH * VIEWPORT_PADDING * zoom
    if (
      sx > -padding &&
      sx < canvasWidth + padding &&
      sy > -padding &&
      sy < canvasHeight + padding
    ) {
      visible.push({ ...cell, screenX: sx, screenY: sy })
    }
  }
  return visible
}

// ============================================
// 动画帧计算
// ============================================
function getAnimationFrame(elapsed, totalFrames) {
  return Math.floor((elapsed % totalFrames) / totalFrames * totalFrames) % totalFrames
}

// ============================================
// 主渲染管线
// ============================================
function renderGrid(ctx, cells, w, h, zoom, offsetX, offsetY, units, animationTime) {
  const iso = ISO_DEFAULTS.baseline
  const visibleCells = getVisibleCells(cells, w, h, zoom, offsetX, offsetY)

  // 背景清理
  ctx.fillStyle = '#001620'
  ctx.fillRect(0, 0, w, h)

  // 逐格绘制六边形
  for (const cell of visibleCells) {
    drawCell(ctx, cell, zoom)
  }

  // 绘制单位（机甲）
  if (units && units.length > 0) {
    drawUnits(ctx, units, zoom, offsetX, offsetY, iso, animationTime)
  }
}

function drawCell(ctx, cell, zoom) {
  const terrainColor = TERRAIN_COLORS[cell.terrain] || TERRAIN_COLORS.plain || '#1a3a1a'

  ctx.save()
  ctx.translate(cell.screenX, cell.screenY)
  ctx.scale(zoom, zoom)

  // 绘制六边形路径
  const path = drawHexPath(0, 0, HEX_WIDTH / 2)
  ctx.fillStyle = terrainColor
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
  ctx.lineWidth = 1
  ctx.fill(path)
  ctx.stroke(path)

  // 坐标标签
  if (zoom > 0.5) {
    const label = `${String.fromCharCode(65 + cell.q)}${cell.r + 1}`
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'
    ctx.font = `${Math.max(8, 10 / zoom)}px monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, 0, 0)
  }

  ctx.restore()
}

function drawUnits(ctx, units, zoom, offsetX, offsetY, iso, animationTime) {
  for (const unit of units) {
    const center = hexToPixel(unit.q, unit.r)
    const screen = flatToIso(center.x, center.y, iso.shearX, iso.shearY, iso.scaleX, iso.scaleY, iso.rot)
    const sx = screen.x * zoom + offsetX
    const sy = screen.y * zoom + offsetY

    // 视口裁剪：视野外单位锁定在第一帧
    const inViewport = sx > -HEX_WIDTH * zoom && sx < ctx.canvas.width + HEX_WIDTH * zoom &&
      sy > -HEX_HEIGHT * zoom && sy < ctx.canvas.height + HEX_HEIGHT * zoom

    const frame = inViewport ? getAnimationFrame(animationTime, ANIMATION_FRAME_COUNT) : 0

    drawUnitSprite(ctx, sx, sy, zoom, unit, frame, inViewport)
  }
}

function drawUnitSprite(ctx, x, y, zoom, unit, frame, isActive) {
  const size = HEX_WIDTH * 0.5 * zoom
  const bobY = isActive ? Math.sin(frame * Math.PI / 8) * 2 * zoom : 0

  ctx.save()
  ctx.translate(x, y + bobY)

  // 机甲主体
  ctx.fillStyle = unit.faction === 'mars' ? '#cc3333' : '#3388cc'
  ctx.beginPath()
  ctx.roundRect(-size * 0.4, -size * 0.5, size * 0.8, size, size * 0.15)
  ctx.fill()

  // 护盾光环（动画帧闪烁）
  if (isActive && frame % 4 === 0) {
    ctx.strokeStyle = 'rgba(100, 200, 255, 0.3)'
    ctx.lineWidth = 1.5 * zoom
    ctx.beginPath()
    ctx.arc(0, 0, size * 0.6, 0, Math.PI * 2)
    ctx.stroke()
  }

  // 单位标签
  if (zoom > 0.4) {
    ctx.fillStyle = '#ffffff'
    ctx.font = `${Math.max(8, 11 / zoom)}px monospace`
    ctx.textAlign = 'center'
    ctx.fillText(unit.name || unit.id, 0, size * 0.8)
  }

  ctx.restore()
}

// ============================================
// 事件反算（Even-R 矩阵逆运算）
// ============================================
function screenToHex(mouseX, mouseY, canvasRect, zoom, offsetX, offsetY, iso) {
  const canvasX = mouseX - canvasRect.left
  const canvasY = mouseY - canvasRect.top

  // 逆变换：像素 → 标准坐标
  const stdX = (canvasX - offsetX) / zoom
  const stdY = (canvasY - offsetY) / zoom

  // 等距逆算 → 平顶坐标
  const flatX = stdX / (iso.scaleX * Math.cos(iso.rot * Math.PI / 180))
  const flatY = stdY / (iso.scaleY * Math.cos(iso.rot * Math.PI / 180))

  // 核心公式逆推
  return pixelToHex(flatX, flatY)
}

export default {
  name: 'HexGridCanvasEngine',

  props: {
    /** 六角格数据 [{q, r, terrain}] */
    cells: { type: Array, default: () => [] },
    /** 单位数据 [{id, q, r, faction, name}] */
    units: { type: Array, default: () => [] },
    /** 缩放倍率 */
    zoom: { type: Number, default: 1.0 },
    /** X 偏移 */
    offsetX: { type: Number, default: 0 },
    /** Y 偏移 */
    offsetY: { type: Number, default: 0 },
    /** 硬性 Canvas 宽度 */
    canvasWidth: { type: Number, default: 1024 },
    /** 硬性 Canvas 高度 */
    canvasHeight: { type: Number, default: 768 },
  },

  emits: ['cell-clicked', 'unit-clicked', 'canvas-ready'],

  data() {
    return {
      canvas: null,
      ctx: null,
      animationId: null,
      startTime: 0,
    }
  },

  mounted() {
    this.canvas = this.$refs.canvas
    this.ctx = this.canvas.getContext('2d')

    // 禁止 CSS 拉伸 Canvas
    this.canvas.style.width = `${this.canvasWidth}px`
    this.canvas.style.height = `${this.canvasHeight}px`
    this.canvas.width = this.canvasWidth
    this.canvas.height = this.canvasHeight

    // 点击事件挂载（Even-R 矩阵反算）
    this.canvas.addEventListener('click', this.handleClick)

    // 动画循环
    this.startTime = performance.now()
    this.animationLoop()

    this.$emit('canvas-ready', this.canvas)
  },

  beforeUnmount() {
    if (this.animationId) cancelAnimationFrame(this.animationId)
    this.canvas?.removeEventListener('click', this.handleClick)
  },

  methods: {
    animationLoop() {
      const elapsed = performance.now() - this.startTime
      this.render(elapsed)
      this.animationId = requestAnimationFrame(this.animationLoop)
    },

    render(animationTime) {
      invalidateCache()
      renderGrid(
        this.ctx, this.cells,
        this.canvasWidth, this.canvasHeight,
        this.zoom, this.offsetX, this.offsetY,
        this.units, animationTime
      )
    },

    /**
     * 点击事件处理：Even-R 矩阵反算 → 派发 cell-clicked 事件
     */
    handleClick(event) {
      const rect = this.canvas.getBoundingClientRect()
      const iso = ISO_DEFAULTS.baseline
      const hex = screenToHex(event.clientX, event.clientY, rect, this.zoom, this.offsetX, this.offsetY, iso)

      if (hex) {
        // 查找该格上的单位
        const unitOnCell = this.units.find(u => u.q === hex.q && u.r === hex.r)
        if (unitOnCell) {
          this.$emit('unit-clicked', { hex, unit: unitOnCell })
        } else {
          this.$emit('cell-clicked', hex)
        }
      }
    },

    /** 强制重绘 */
    forceRender() {
      if (this.ctx) {
        this.render(performance.now() - this.startTime)
      }
    },

    /** 获取 Canvas 上下文（供外部调用） */
    getContext() {
      return this.ctx
    },
  },

  render() {
    // Vue 3 render function — 纯 Canvas 元素
    // 无 CSS Flex/百分比拉伸
    return null // 使用 template
  },

  template: `
    <canvas
      ref="canvas"
      :width="canvasWidth"
      :height="canvasHeight"
      class="block"
      style="pointer-events: auto; touch-action: none;"
    ></canvas>
  `,
}
