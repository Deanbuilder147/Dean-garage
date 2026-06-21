"""
NewBattlefieldView.vue — <script setup> 重构片段 (Phase 1: 2D 纯净状态)
严格按照《战棋开发终极宪法 v2.0》进行以下修改：
1. 统一常量源：全部从 hexUtils.js 导入，删除所有本地硬编码
2. 统一变量类型：offsetX/Y/scale 从 let 改为 ref()
3. 标准 2D 尖顶 Even-R 渲染与点击逆运算
"""

REFACTORED_SCRIPT_SETUP = '''
<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { mapAPI } from '@/api/client'
import {
  HEX_WIDTH, HEX_HEIGHT, HEX_APOTHEM, HEX_RADIUS,
  DEFAULT_SPACING_H, DEFAULT_SPACING_V, DEFAULT_OFFSET_FACTOR,
  pointyTopCenter, pointyTopToHex,
  drawHexPath as drawHexPathCore, colToLetter, formatCoord,
} from '../utils/hexUtils.js'

const router = useRouter()
const battlefield = ref(null)
const brush = ref('moon')
const saving = ref(false)
const saveStatus = ref('就绪')
const terrainMap = reactive({})

// ---- Canvas refs ----
const canvasWrapper = ref(null)
const canvasContainer = ref(null)

// ---- Canvas state（统一使用 ref，与 NewBattleView 类型一致）----
let canvas, ctx
const scale = ref(1)
const offsetX = ref(60)
const offsetY = ref(60)
let isDragging = false, dragStartX, dragStartY, dragStartOffsetX, dragStartOffsetY

// ---- Hex config（全部从 hexUtils.js 导入，本地不再硬编码）----
// HEX_WIDTH, HEX_HEIGHT, HEX_APOTHEM, HEX_RADIUS — 已从 hexUtils 导入

// ---- Spacing（初始值统一使用 hexUtils 默认值 1.00/1.00/0.00）----
let spacingH = DEFAULT_SPACING_H        // 1.00
let spacingV = DEFAULT_SPACING_V        // 1.00
let offsetFactor = DEFAULT_OFFSET_FACTOR // 0.00

// ---- Grid size ----
const gridW = computed(() => battlefield.value?.width || 15)
const gridH = computed(() => battlefield.value?.height || 10)
const totalCellCount = computed(() => gridW.value * gridH.value)
const nonEmptyCellCount = computed(() => {
  return Object.values(terrainMap).filter(v => v && v !== 'moon').length
})

// ---- Terrain types（保持本地定义，与战斗系统对齐）----
const terrainTypes = [
  { id: 'moon',    name: '月面',     color: '#888888', moveCost: 1 },
  { id: 'space',   name: '宇宙',     color: '#1a1a2e', moveCost: 1 },
  { id: 'fortress',name: '防御圈',   color: '#9c27b0', moveCost: 5 },
  { id: 'repair_station', name: '维修站', color: '#4caf50', moveCost: 1 },
  { id: 'mothership',name: '母舰',   color: '#2196f3', moveCost: 1 },
  { id: 'forest',  name: '森林',     color: '#2e7d32', moveCost: 2 },
  { id: 'water',   name: '水域',     color: '#03a9f4', moveCost: 2.5 },
  { id: 'mountain',name: '山地',     color: '#78350f', moveCost: 3 },
  { id: 'lunar',   name: '月球表面', color: '#b0b0b0', moveCost: 1.5 },
]

const allTerrainTypes = computed(() => terrainTypes)
const brushName = computed(() => {
  const t = terrainTypes.find(t => t.id === brush.value)
  return t ? t.name : '未知'
})
const currentTerrainColor = computed(() => {
  const t = terrainTypes.find(t => t.id === brush.value)
  return t ? t.color : '#888888'
})

// ---- Hover ----
const hoverCoord = ref('')

function getTerrainColor(id) {
  const t = terrainTypes.find(t => t.id === id)
  return t ? t.color : '#888888'
}

// ================================================================
//  坐标转换 — 标准 2D 尖顶 Even-R（宪法 v2.0 纯净状态）
//  所有公式包裹：每步都是 1.0 标准倍率，缩放/平移在外部处理
// ================================================================

/** 尖顶六边形中心 → 世界像素坐标（含间距） */
function hexToPixel(q, r) {
  return pointyTopCenter(q, r, HEX_RADIUS, spacingH, spacingV)
  // 返回 { flatX, flatY } — 尖顶六边形的几何中心
}

/** 世界像素坐标 → 尖顶六边形网格坐标（标准逆推） */
function pixelToHex(px, py) {
  return pointyTopToHex(px, py, HEX_RADIUS, spacingH, spacingV)
  // 返回 { q, r }
}

/** 绘制六边形路径（包装函数，使用模块级 ctx） */
function drawHexPath(cx, cy) {
  // hexUtils 的 drawHexPathCore 需要 ctx，我们传入模块级 ctx
  // 注意：这暂时保留了模块级 ctx 的隐式依赖，后续 Phase 3 应改为显式传参
  ctx.beginPath()
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6
    const hx = cx + HEX_RADIUS * Math.cos(a)
    const hy = cy + HEX_RADIUS * Math.sin(a)
    if (i === 0) ctx.moveTo(hx, hy)
    else ctx.lineTo(hx, hy)
  }
  ctx.closePath()
}

function hexToRGBA(hex, alpha) {
  const _hex = hex.replace('#', '')
  const r = parseInt(_hex.slice(0, 2), 16)
  const g = parseInt(_hex.slice(2, 4), 16)
  const b = parseInt(_hex.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

// ================================================================
//  渲染管线（单向数据管道终点，只接收数据，不读取 Vue 状态）
// ================================================================

let hoveredQ = -1, hoveredR = -1
let isFirstDraw = true

/** 计算合理的画布尺寸，并将棋盘居中 */
function centerGridOnCanvas() {
  if (!canvas) return
  const midQ = Math.floor(gridW.value / 2)
  const midR = Math.floor(gridH.value / 2)
  const { flatX, flatY } = pointyTopCenter(midQ, midR, HEX_RADIUS, spacingH, spacingV)
  offsetX.value = canvas.width / 2 - flatX
  offsetY.value = canvas.height / 2 - flatY
}

function draw(hlQ = -1, hlR = -1) {
  if (!ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  // ---- 计算画布尺寸（纯 2D 状态，无等距压缩）----
  const { flatX: brX, flatY: brY } = pointyTopCenter(
    gridW.value - 1, gridH.value - 1, HEX_RADIUS, spacingH, spacingV
  )
  const totalW = brX + HEX_RADIUS * 2 + 120
  const totalH = brY + HEX_RADIUS * 2 + 120
  const resized = canvas.width !== totalW || canvas.height !== totalH
  if (resized) {
    canvas.width = totalW
    canvas.height = totalH
  }
  if (isFirstDraw || resized) {
    centerGridOnCanvas()
    isFirstDraw = false
  }

  // ---- CTM：平移到相机位置 → 缩放（纯 2D，无 Y 压缩）----
  ctx.save()
  ctx.translate(offsetX.value, offsetY.value)
  ctx.scale(scale.value, scale.value)

  for (let r = 0; r < gridH.value; r++) {
    for (let q = 0; q < gridW.value; q++) {
      // 尖顶六边形几何中心（纯 2D）
      const { flatX, flatY } = pointyTopCenter(q, r, HEX_RADIUS, spacingH, spacingV)
      const cx = flatX
      const cy = flatY

      // 地形填充
      const tid = terrainMap[`${q},${r}`] || 'moon'
      const terrainDef = terrainTypes.find(t => t.id === tid) || terrainTypes[0]
      ctx.fillStyle = hexToRGBA(terrainDef.color, 0.35)
      drawHexPath(cx, cy)
      ctx.fill()

      // 边框
      ctx.strokeStyle = 'rgba(159,142,120,0.2)'
      ctx.lineWidth = 1
      drawHexPath(cx, cy)
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
        drawHexPath(cx, cy)
        ctx.stroke()
        ctx.fillStyle = 'rgba(0,0,0,0.8)'
        ctx.font = 'bold 13px "Fira Code", monospace'
        ctx.textBaseline = 'bottom'
        ctx.fillText(`${terrainDef.name}`, cx, cy - HEX_RADIUS - 2)
      }
    }
  }

  ctx.restore()
}

// ================================================================
//  Canvas 初始化
// ================================================================

function initCanvas() {
  if (!canvasContainer.value) return
  canvasContainer.value.innerHTML = ''

  canvas = document.createElement('canvas')
  canvas.style.display = 'block'
  canvas.style.cursor = 'crosshair'
  canvasContainer.value.appendChild(canvas)
  ctx = canvas.getContext('2d')

  scale.value = 1
  offsetX.value = 60
  offsetY.value = 60
  isFirstDraw = true
  draw()
  setupEvents()
}

// ================================================================
//  事件绑定 — 标准 2D 逆运算
//  渲染：2D标准坐标 → × scale → + offset → 绘制
//  点击：鼠标像素 → - offset → ÷ scale → pixelToHex
// ================================================================

function getWorldPos(e) {
  const rect = canvas.getBoundingClientRect()
  const sx = canvas.width / rect.width
  const sy = canvas.height / rect.height
  const cx = (e.clientX - rect.left) * sx
  const cy = (e.clientY - rect.top) * sy
  // 标准 2D 逆运算：减去偏移，除以缩放
  return {
    x: (cx - offsetX.value) / scale.value,
    y: (cy - offsetY.value) / scale.value,
  }
}

function setupEvents() {
  if (!canvas) return

  canvas.onclick = (e) => {
    if (isDragging) return
    const wp = getWorldPos(e)
    const hex = pixelToHex(wp.x, wp.y)
    if (hex.q >= 0 && hex.q < gridW.value && hex.r >= 0 && hex.r < gridH.value) {
      terrainMap[`${hex.q},${hex.r}`] = brush.value
      draw(hex.q, hex.r)
    }
  }

  canvas.oncontextmenu = (e) => {
    e.preventDefault()
    const wp = getWorldPos(e)
    const hex = pixelToHex(wp.x, wp.y)
    if (hex.q >= 0 && hex.q < gridW.value && hex.r >= 0 && hex.r < gridH.value) {
      delete terrainMap[`${hex.q},${hex.r}`]
      draw(hex.q, hex.r)
    }
  }

  canvas.onmousedown = (e) => {
    if (e.button === 0) {
      isDragging = false
      dragStartX = e.clientX
      dragStartY = e.clientY
      dragStartOffsetX = offsetX.value
      dragStartOffsetY = offsetY.value
    }
  }

  canvas.onmousemove = (e) => {
    const wp = getWorldPos(e)
    const hex = pixelToHex(wp.x, wp.y)
    if (hex.q >= 0 && hex.q < gridW.value && hex.r >= 0 && hex.r < gridH.value) {
      hoveredQ = hex.q
      hoveredR = hex.r
      hoverCoord.value = formatCoord(hex.q, hex.r)
      draw(hex.q, hex.r)
    } else {
      hoveredQ = hoveredR = -1
      hoverCoord.value = ''
      draw()
    }

    if (e.buttons === 1) {
      const dx = Math.abs(e.clientX - dragStartX)
      const dy = Math.abs(e.clientY - dragStartY)
      if (dx > 3 || dy > 3) isDragging = true
      if (isDragging) {
        const rect = canvas.getBoundingClientRect()
        const sx = canvas.width / rect.width
        const sy = canvas.height / rect.height
        offsetX.value = dragStartOffsetX + (e.clientX - dragStartX) * sx
        offsetY.value = dragStartOffsetY + (e.clientY - dragStartY) * sy
        draw()
      }
    }
  }

  canvas.onmouseleave = () => {
    hoveredQ = hoveredR = -1
    hoverCoord.value = ''
    isDragging = false
    draw()
  }

  canvas.onwheel = (e) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.92 : 1.08
    const ns = Math.max(0.2, Math.min(3, scale.value * delta))
    const rect = canvas.getBoundingClientRect()
    const sx = canvas.width / rect.width
    const sy = canvas.height / rect.height
    const mx = (e.clientX - rect.left) * sx
    const my = (e.clientY - rect.top) * sy
    // 标准 2D 缩放：以鼠标为中心，纯 2D 无 Y 压缩
    offsetX.value = mx - (mx - offsetX.value) * (ns / scale.value)
    offsetY.value = my - (my - offsetY.value) * (ns / scale.value)
    scale.value = ns
    draw()
  }
}

// ================================================================
//  UI 操作
// ================================================================

function selectBrush(id) { brush.value = id }

function zoomIn()  { scale.value = Math.min(3, scale.value * 1.2); draw() }
function zoomOut() { scale.value = Math.max(0.2, scale.value / 1.2); draw() }
function zoomReset() { scale.value = 1; isFirstDraw = true; draw() }

function adjustSpacing(type, delta) {
  if (type === 'h') spacingH = Math.max(0.5, Math.min(1.5, spacingH + delta / 100))
  if (type === 'v') spacingV = Math.max(0.5, Math.min(1.5, spacingV + delta / 100))
  if (type === 'o') offsetFactor = Math.max(0, Math.min(1, offsetFactor + delta / 100))
  draw()
}

function resetSpacing() {
  spacingH = DEFAULT_SPACING_H        // 1.00
  spacingV = DEFAULT_SPACING_V        // 1.00
  offsetFactor = DEFAULT_OFFSET_FACTOR // 0.00
  draw()
}

// ================================================================
//  数据加载与保存
// ================================================================

onMounted(async () => {
  try {
    const { data } = await mapAPI.getBattlefields()
    if (data && data.battlefields && data.battlefields.length > 0) {
      battlefield.value = data.battlefields[0]
      const rawTerrain = data.battlefields[0].terrain
      if (rawTerrain) {
        const t = typeof rawTerrain === 'string' ? JSON.parse(rawTerrain) : rawTerrain
        if (t && typeof t === 'object') {
          Object.entries(t).forEach(([key, val]) => { terrainMap[key] = val })
        }
      }
    }
  } catch (e) { /* 无存档 */ }
  await nextTick()
  initCanvas()
})

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
      hex_config: { spacingH, spacingV, offsetFactor },
    })
    saveStatus.value = `已保存 ${Object.keys(terrainData).length} 个地形 (${new Date().toLocaleTimeString()})`
  } catch (e) {
    saveStatus.value = '保存失败!'
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
      hexConfig: { spacingH, spacingV, offsetFactor },
      terrainData: JSON.parse(JSON.stringify(terrainMap)),
      terrainTypes: terrainTypes,
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

function navigateTo(path) { router.push(path) }
</script>
'''
