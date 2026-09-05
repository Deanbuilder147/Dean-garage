<template>
  <div class="hex-canvas-wrap" ref="wrapRef">
    <canvas
      ref="cv"
      class="hex-canvas-el"
      @mousedown="onDown"
      @contextmenu.prevent="onRight"
      @mousemove="onMove"
      @mouseup="onUp"
      @mouseleave="onLeave"
      @wheel.prevent="onWheel"
      @dragover.prevent
      @drop="onDrop"
    ></canvas>
    <div v-if="viewMode === 'hexsix'" class="hexsix-hint">
      {{ activeLaneLabel || '点击六边形段格选中' }} · 从右栏拖原子入格
    </div>
    <div v-if="viewMode === 'hexsix'" class="hexsix-legend">
      <span><i class="hl hl-main"></i>主段(时机/条件/执行/代价)</span>
      <span><i class="hl hl-roll"></i>随机性分段母线</span>
      <span><i class="hl hl-seg"></i>一级分段</span>
      <span><i class="hl hl-sub"></i>二级子段</span>
      <span><i class="hl hl-atom"></i>原子输入</span>
      <span><i class="hl hl-empty"></i>空段格</span>
      <span><i class="hl hl-sel"></i>选中</span>
    </div>
    <div v-if="viewMode === 'map'" class="mc-toolbar">
      <span class="mc-tb-label">方向</span>
      <button
        v-for="d in MC_DIRS"
        :key="d.value"
        :class="['mc-dir-btn', { active: (rangeCtx.mcDir || 'right') === d.value }]"
        @click="setMcDir(d.value)"
      >{{ d.label }}</button>
      <button class="mc-act-btn" @click="completeSixDirs">六向补全</button>
      <button class="mc-act-btn ghost" @click="clearMcShapes">清除预设</button>
      <span v-if="mcTip" class="mc-tip">{{ mcTip }}</span>
    </div>
    <div v-if="viewMode === 'range' || viewMode === 'aoe' || viewMode === 'map'" class="range-legend">
      <span><i class="lg lg-hit"></i>可命中环带</span>
      <span><i class="lg lg-dead"></i>盲区(min_range)</span>
      <span><i class="lg lg-mc"></i>地图炮手绘格</span>
      <span><i class="lg lg-cond"></i>条件图层(Cond)</span>
      <span class="lg-num">格内数字=环号</span>
    </div>
    <div class="cam-hint">拖拽平移 · 滚轮缩放 · 空格+拖拽强制平移</div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { hexToPixel, pixelToHex, HEX_WIDTH, HEX_HEIGHT, HEX_RADIUS, getHexNeighbors, hexDistance } from '@/utils/hexUtils'
import { drawHexPath } from '@/utils/hexDraw'

// ===== 统一底板尺寸（与地图编辑器同款矩形遍历） =====
// 射程/AOE/地图炮视图用 19×19 居中；六段式不画底板，仅渲染六格星形
const GRID_COLS = 19
const GRID_ROWS = 19

const props = defineProps({
  width: { type: Number, default: 0 },
  height: { type: Number, default: 0 },
  viewMode: { type: String, default: 'range' }, // range | aoe | map | graph | hexsix
  lanes: { type: Array, default: () => [] },
  activeLaneIndex: { type: Number, default: 0 },
  rangeCtx: { type: Object, default: () => ({
    path: [],
    mcShapes: { right: [], rightup: [], leftup: [], left: [], leftdown: [], rightdown: [] },
    mcDir: 'right',
    brush: 'range', radius: 1, rangeMax: 3
  }) }
})

// 地图炮六向枚举（与 GlossaryHubNew MC_DIR_KEYS 一致）
const MC_DIRS = [
  { value: 'right', label: '右' },
  { value: 'rightup', label: '右上' },
  { value: 'leftup', label: '左上' },
  { value: 'left', label: '左' },
  { value: 'leftdown', label: '左下' },
  { value: 'rightdown', label: '右下' },
]

const emit = defineEmits([
  'place-cell', 'place-aoe', 'place-map', 'clear-cells', 'select-lane', 'drop-atom', 'set-brush',
  'mc-set-dir', 'mc-complete', 'mc-clear', 'select-aoe-point'
])

const cv = ref(null)
const wrapRef = ref(null)
const realW = ref(0)
const realH = ref(0)
const offset = ref({ x: 0, y: 0 })
const scale = ref(1)
const hover = ref(null)
const drawing = ref(false)
// 镜头拖拽/缩放
const camPan = ref(false)       // 是否正在拖拽平移镜头
const camPanStart = ref({ x: 0, y: 0, ox: 0, oy: 0 })
const panMode = ref(false)      // 空格/中键强制平移（即便在射程视图内）

const isRange = () => props.viewMode === 'range' || props.viewMode === 'aoe' || props.viewMode === 'map'
const isGraph = () => props.viewMode === 'graph'
const isHexSix = () => props.viewMode === 'hexsix'

function cw() { return props.width > 0 ? props.width : realW.value }
function ch() { return props.height > 0 ? props.height : realH.value }

// 单位自身原点：除六段式外的所有视图（射程/地图炮/AOE/图谱/战场模拟）统一以 (5,5) 作为「模拟玩家棋子中心」
// 六段式视图不绘制网格底板、不画玩家棋子，天然不受此中心影响。
// 射程/AOE/地图炮/图谱视图的模拟玩家棋子中心（19×19 网格正中心）
const UNIT_ORIGIN = { q: 9, r: 9 }

// ===== 六段式坐标（方案 B：六格星形 + coord 锚定，WHEN 锁定 (5,10) 不可移动/擦除） =====
// 以 WHEN 为锚点展开相对星形：coord[i] = WHEN + (neigh[i] - neigh[whenIndex])，
// WHEN(key='WHEN') 严格落在 (5,10)，其余 5 点围绕它形成六格星形。
// 用 key→coord 映射取代索引数组，与 GlossaryHubNew 的 LANE_SKELETON 顺序彻底解耦。
const HEXSIX_KEY_BY_NEIGHBOR = ['IF', 'WHEN', 'ROLL', 'DO', 'AFTER', 'COST']
const HEXSIX_NEIGHBORS = getHexNeighbors(0, 0) // 单位原点(0,0)的 6 邻居偏移
const WHEN_ANCHOR = { q: 5, r: 10 }
const WHEN_NEIGH_INDEX = HEXSIX_KEY_BY_NEIGHBOR.indexOf('WHEN')
// 六段绝对坐标（以 WHEN 为锚的相对星形），按 lane.key 索引
const HEXSIX_COORDS = HEXSIX_NEIGHBORS.map((c, i) => ({
  q: WHEN_ANCHOR.q + (c.q - HEXSIX_NEIGHBORS[WHEN_NEIGH_INDEX].q),
  r: WHEN_ANCHOR.r + (c.r - HEXSIX_NEIGHBORS[WHEN_NEIGH_INDEX].r),
}))
const HEXSIX_COORD_BY_KEY = {}
HEXSIX_KEY_BY_NEIGHBOR.forEach((k, i) => { HEXSIX_COORD_BY_KEY[k] = HEXSIX_COORDS[i] })
// WHEN 锚点坐标（不可移动/擦除的真相源）
const WHEN_COORD = { q: 5, r: 10 }
// 六段色板（对齐设计稿）：主段=黑色、随机性(ROLL)=青色、后效(AFTER)=灰黑；
// 一级分段=橙色、二级子段=蓝色、原子输入=黄色、空段格=深红/灰、选中=灰色高亮
const HEXSIX_COLORS = {
  IF:    { fill: 'rgba(20,20,24,0.92)',  stroke: '#2b2b30', text: '#e6e6ea' },
  WHEN:  { fill: 'rgba(20,20,24,0.92)',  stroke: '#2b2b30', text: '#e6e6ea' },
  ROLL:  { fill: 'rgba(40,120,120,0.90)', stroke: '#3fd0c4', text: '#a8f0e8' },
  DO:    { fill: 'rgba(20,20,24,0.92)',  stroke: '#2b2b30', text: '#e6e6ea' },
  AFTER: { fill: 'rgba(28,28,34,0.92)',  stroke: '#3a3a42', text: '#cfcfd6' },
  COST:  { fill: 'rgba(20,20,24,0.92)',  stroke: '#2b2b30', text: '#e6e6ea' },
}
// 裂变分段/子段/原子/空段格/选中 配色（设计稿 §3）
const BRANCH_COLORS = {
  segment: { fill: 'rgba(255,140,40,0.16)', stroke: '#ff8c28', text: '#ffc486' }, // 一级分段=橙
  subSegment: { fill: 'rgba(80,160,255,0.16)', stroke: '#5aa0ff', text: '#a8c8ff' }, // 二级子段=蓝
  atom: { fill: 'rgba(255,212,80,0.92)', stroke: '#ffd450', text: '#3a2e00' }, // 原子输入=黄
  empty: { fill: 'rgba(70,20,24,0.55)', stroke: '#7a2a30', text: '#c98a8e' }, // 空段格=深红
  selected: { fill: 'rgba(120,120,128,0.85)', stroke: '#9aa0aa', text: '#ffffff' }, // 选中=灰
}
// 取某 lane 的绘制坐标：优先 lane.coord（数据真相），回退 key→星形坐标，WHEN 恒为 (5,10)
function laneCoord(lane, idx) {
  if (lane && lane.coord) return lane.coord
  if (lane && lane.key && HEXSIX_COORD_BY_KEY[lane.key]) return HEXSIX_COORD_BY_KEY[lane.key]
  return HEXSIX_COORDS[idx] || { q: 0, r: 0 }
}
// 六段式「平行排列」坐标：所有段按索引 i 从左到右平行排成一排（偶数列错开，避免 Even-R 相邻重叠）
// 取代星形布局，便于增删自定义段后清晰可读；WHEN 不再锁 (5,10)，而是排在最左。
function hexsixLaneCoord(i) {
  return { q: i * 2, r: 0 }
}

// ---------- 尺寸自适应 ----------
let ro = null
function syncCanvasSize() {
  const el = wrapRef.value
  if (!el) return
  const dpr = window.devicePixelRatio || 1
  const rect = el.getBoundingClientRect()
  // 以容器尺寸为真相源，仅在极小情况下给最小可用性下限，避免画布比容器还大导致溢出/被裁切
  realW.value = Math.max(220, Math.floor(rect.width))
  realH.value = Math.max(200, Math.floor(rect.height))
  const c = cv.value
  if (!c) return
  c.style.width = realW.value + 'px'
  c.style.height = realH.value + 'px'
  c.width = Math.floor(realW.value * dpr)
  c.height = Math.floor(realH.value * dpr)
  const ctx = c.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  initCamera()
  draw()
}

// 相机：高度对齐靠左（竖向充满画布高度，水平贴左边距，非居中）
//   六段式视图（方案 B）按六段实际坐标包围盒居中、放大显示，不依赖 20×20 网格
function initCamera() {
  const W = cw(), H = ch()
  if (isHexSix()) {
    const lanes = props.lanes || []
    // 辐射式：六段按 HEXSIX_COORD_BY_KEY 星形排布 + 中心技能节点（= 六段 axial 质心，与 drawHexSix 一致）
    const sixCoords = lanes.map((l) => (l && l.key && HEXSIX_COORD_BY_KEY[l.key]) || { q: 9, r: 9 })
    const centerAxial = { q: 9, r: 9 }
    if (sixCoords.length) {
      centerAxial.q = sixCoords.reduce((t, c) => t + c.q, 0) / sixCoords.length
      centerAxial.r = sixCoords.reduce((t, c) => t + c.r, 0) / sixCoords.length
    }
    const coords = [centerAxial, ...sixCoords]
    sixCoords.forEach((c) => {
      // ROLL 裂变：一级分段(橙)在 ROLL 段格外侧，二级子段(蓝)在橙外侧 → 包围盒需外扩
      // 用 centerAxial 作为裂变方向基准
      const dx = c.q - centerAxial.q, dy = c.r - centerAxial.r
      const dlen = Math.hypot(dx, dy) || 1
      const ux = dx / dlen, uy = dy / dlen
      if (lanes[sixCoords.indexOf(c)] && lanes[sixCoords.indexOf(c)].key === 'ROLL') {
        const hostLane = lanes[sixCoords.indexOf(c)]
        const hosts = (Array.isArray(hostLane.atoms) ? hostLane.atoms : []).filter(a => a && a.effectType === 'roll_segment')
        let segCount = 0
        hosts.forEach(h => { segCount += (h.branches && h.branches.length) || 0 })
        for (let k = 0; k < Math.max(segCount, 1) + 1; k++) {
          coords.push({ q: c.q + ux * (k + 1) * 1.8, r: c.r + uy * (k + 1) * 1.8 })
        }
      }
    })
    if (!coords.length) coords.push({ q: 9, r: 9 })
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const c of coords) {
      const p = hexToPixel(c.q, c.r, 1, 1, 0)
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
    }
    minX -= HEX_WIDTH * 1.6; maxX += HEX_WIDTH * 1.6
    minY -= HEX_HEIGHT * 1.6; maxY += HEX_HEIGHT * 1.6
    const regionW = maxX - minX
    const regionH = maxY - minY
    // 放大到铺满画布（取较小缩放比，留边距），并居中
    const s = Math.min(W / regionW, H / regionH) * 0.92
    scale.value = s
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    offset.value = { x: W / 2 - cx * s, y: H / 2 - cy * s }
    return
  }
  // 计算 20×20 网格的 4 角像素坐标
  const corners = [
    hexToPixel(0, 0, 1, 1, 0),
    hexToPixel(GRID_COLS - 1, 0, 1, 1, 0),
    hexToPixel(0, GRID_ROWS - 1, 1, 1, 0),
    hexToPixel(GRID_COLS - 1, GRID_ROWS - 1, 1, 1, 0),
  ]
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of corners) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
  }
  minX -= HEX_WIDTH; maxX += HEX_WIDTH   // 1 格边距
  minY -= HEX_HEIGHT; maxY += HEX_HEIGHT
  const regionW = maxX - minX
  const regionH = maxY - minY
  // 竖向充满画布高度，水平方向以 1 格左边距左对齐
  const padL = HEX_WIDTH
  scale.value = H / regionH
  offset.value = { x: padL - minX * scale.value, y: 0 - minY * scale.value }
}

function worldToScreen(wx, wy) {
  return { x: offset.value.x + wx * scale.value, y: offset.value.y + wy * scale.value }
}
function screenToWorld(sx, sy) {
  return { x: (sx - offset.value.x) / scale.value, y: (sy - offset.value.y) / scale.value }
}

function screenToHex(sx, sy) {
  const w = screenToWorld(sx, sy)
  return pixelToHex(w.x, w.y, 1, 1, 0, HEX_WIDTH, HEX_HEIGHT)
}
function hexToScreen(q, r) {
  const p = hexToPixel(q, r, 1, 1, 0)
  return worldToScreen(p.x, p.y)
}

function eventPos(e) {
  const rect = cv.value.getBoundingClientRect()
  return { x: e.clientX - rect.left, y: e.clientY - rect.top }
}

// ========== 统一底板绘制：20×10 Even-R 矩形六边形网格（与地图编辑器完全一致） ==========
function drawGridBase(ctx) {
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let q = 0; q < GRID_COLS; q++) {
      const s = hexToScreen(q, r)
      drawHexPath(ctx, s.x, s.y, HEX_RADIUS * scale.value)
      ctx.strokeStyle = 'rgba(255,255,255,0.06)'
      ctx.lineWidth = 0.5
      ctx.stroke()
    }
  }
}

// ---------- 绘制入口 ----------
function draw() {
  const c = cv.value
  if (!c) return
  const ctx = c.getContext('2d')
  ctx.clearRect(0, 0, cw(), ch())
  ctx.save()
  // 射程/AOE/地图炮/图谱视图先画统一 20×20 底板；六段式（方案 B）只渲染六格星形，不画底板
  if (!isHexSix()) drawGridBase(ctx)
  if (isGraph()) drawGraph(ctx)
  else if (isHexSix()) drawHexSix(ctx)
  else drawRange(ctx)
  ctx.restore()
}

// 报告第五部分：射程真相源优先级
//   优先读 rangeCtx.target（WHO 段），回退到 rangeCtx.rangeMax/radius（旧扁平字段）
function resolveRange() {
  const t = props.rangeCtx.target
  if (t && (t.max_range != null)) {
    return {
      minR: t.min_range || 0,
      maxR: t.max_range || 0,
      shape: props.rangeCtx.shape || t.shape || 'circle'
    }
  }
  return {
    minR: props.rangeCtx.radius || 1,
    maxR: props.rangeCtx.rangeMax || 3,
    shape: props.rangeCtx.shape || 'circle'
  }
}

// 报告第五部分：方向性线性射线（line 形态）沿 6 向之一拉伸
// 返回从中心沿某方向延伸 maxR 格的 cell 列表
function lineCells(center, dirIdx, len) {
  // Even-R 6 邻居方向（与 getHexNeighbors(0,0) 顺序一致：E, NE, NW, W, SW, SE）
  const DIRS = getHexNeighbors(0, 0)
  const d = DIRS[((dirIdx % 6) + 6) % 6]
  const out = []
  for (let i = 1; i <= len; i++) out.push({ q: center.q + d.q * i, r: center.r + d.r * i })
  return out
}

// 报告第五部分：条件图层（Cond）—— 将 IF 段空间类条件覆盖绘制校验
// 支持 in_range / mutual_in_range（环带）与 collinear_adjacent（共线相邻射线）
function drawConditionLayer(ctx, center) {
  const conds = props.rangeCtx.conditions || []
  if (!conds.length) return
  const SPATIAL = ['in_range', 'mutual_in_range', 'collinear_adjacent', 'adjacent', 'front', 'flank']
  const spatial = conds.filter(c => c && SPATIAL.includes(c.type || c.kind))
  if (!spatial.length) return
  ctx.save()
  for (const c of spatial) {
    const t = c.target || c
    const minR = Number(t.min ?? t.min_range ?? 0)
    const maxR = Number(t.max ?? t.max_range ?? t.radius ?? 1)
    // 环带类：以中心画半透明橙色校验环
    const list = []
    if (c.type === 'collinear_adjacent') {
      // 沿 6 向各取相邻 1 格
      for (let k = 0; k < 6; k++) list.push(...lineCells(center, k, 1))
    } else if (c.type === 'adjacent') {
      list.push(...getHexNeighbors(center.q, center.r))
    } else {
      for (let r = 0; r < GRID_ROWS; r++) {
        for (let q = 0; q < GRID_COLS; q++) {
          const d = hexDistance(center.q, center.r, q, r)
          if (d >= minR && d <= maxR) list.push({ q, r })
        }
      }
    }
    for (const cell of list) {
      if (cell.q < 0 || cell.q >= GRID_COLS || cell.r < 0 || cell.r >= GRID_ROWS) continue
      const s = hexToScreen(cell.q, cell.r)
      drawHexPath(ctx, s.x, s.y, HEX_RADIUS * scale.value * 0.92)
      ctx.strokeStyle = 'rgba(255,138,76,0.55)'
      ctx.lineWidth = 1
      ctx.setLineDash([3, 3])
      ctx.stroke()
      ctx.setLineDash([])
    }
  }
  ctx.restore()
}

// 绘制模拟玩家棋子标记（固定在棋盘中心 UNIT_ORIGIN）
function drawUnitMarker(ctx, cell, color) {
  const s = hexToScreen(cell.q, cell.r)
  const rad = HEX_RADIUS * scale.value * 0.62
  ctx.beginPath()
  ctx.arc(s.x, s.y, rad, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.globalAlpha = 0.85
  ctx.fill()
  ctx.globalAlpha = 1
  ctx.strokeStyle = '#1a1205'
  ctx.lineWidth = 2
  ctx.stroke()
}

// 报告第五部分：环带射程（circle 形态）
//   - min_range 内圈：盲区阴影
//   - min_range~max_range：可命中环带，每格标注环号
// pal 可选：配色调色板（射程=绿色默认；地图炮=紫色；AOE=蓝色），实现「同样内容、换色」复用
function drawRingRange(ctx, center, minR, maxR, pal = {}) {
  const deadFill = pal.deadFill || 'rgba(200,40,40,0.22)'
  const hitFill = pal.hitFill || 'rgba(80,200,120,0.16)'
  const hitStroke = pal.hitStroke || 'rgba(80,220,140,0.45)'
  const numColor = pal.numColor || 'rgba(180,255,200,0.8)'
  const unitColor = pal.unitColor || '#ffd479'
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let q = 0; q < GRID_COLS; q++) {
      const d = hexDistance(center.q, center.r, q, r)
      if (d < minR) {
        // 盲区（min_range 内）：阴影
        const s = hexToScreen(q, r)
        drawHexPath(ctx, s.x, s.y, HEX_RADIUS * scale.value * 0.96)
        ctx.fillStyle = deadFill
        ctx.fill()
      } else if (d <= maxR) {
        // 可命中环带
        const s = hexToScreen(q, r)
        drawHexPath(ctx, s.x, s.y, HEX_RADIUS * scale.value * 0.96)
        ctx.fillStyle = hitFill
        ctx.fill()
        ctx.strokeStyle = hitStroke
        ctx.lineWidth = 1
        ctx.stroke()
        // 每格环号标注
        ctx.fillStyle = numColor
        ctx.font = '9px system-ui, sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(String(d), s.x, s.y)
      }
    }
  }
  // 中心格高亮（玩家棋子视觉锚）
  drawUnitMarker(ctx, center, unitColor)
}

// ---------- 射程/AOE/地图炮 ----------
function drawRange(ctx) {
  _ctxRef = ctx
  const R = resolveRange()
  // 射程中心：以单位自身原点（地图格中心点）为锚（B 决策：射程/地图炮/AOE/战场模拟均用单位自身）
  const center = { ...UNIT_ORIGIN }

  // 地图炮：与射程「同样的方式、同样的内容」布置——[min,max] 环带（中心 9,9、盲区、可命中环带、环号），
  // 复用射程/AOE 同一套绿/红配色（与图例对齐）；手绘六向格用琥珀高亮叠加，确保流向补全结果清晰可见。
  if (props.viewMode === 'map') {
    if (R.maxR > 0) {
      drawRingRange(ctx, center, R.minR, R.maxR, {
        deadFill: 'rgba(200,40,40,0.22)',
        hitFill: 'rgba(80,200,120,0.16)',
        hitStroke: 'rgba(80,220,140,0.45)',
        numColor: 'rgba(180,255,200,0.8)',
        unitColor: '#ffd479'
      })
    }
    // 叠加：6 方向 mcShapes 手绘格（当前方向高亮加粗，琥珀色与射程/aoe 同一视觉家族）
    const shapes = props.rangeCtx.mcShapes || {}
    const curDir = props.rangeCtx.mcDir || 'right'
    const place = (list, color, fill, lw = 2) => {
      for (const cell of list) {
        if (cell.q < 0 || cell.q >= GRID_COLS || cell.r < 0 || cell.r >= GRID_ROWS) continue
        const s = hexToScreen(cell.q, cell.r)
        drawHexPath(ctx, s.x, s.y, HEX_RADIUS * scale.value * 0.92)
        ctx.fillStyle = fill
        ctx.fill()
        ctx.strokeStyle = color
        ctx.lineWidth = lw
        ctx.stroke()
      }
    }
    for (const d of MC_DIRS) {
      const list = shapes[d.value] || []
      const isCur = d.value === curDir
      place(list, isCur ? '#fff7e0' : '#ffd479', isCur ? 'rgba(255,212,121,0.34)' : 'rgba(255,212,121,0.18)', isCur ? 3 : 2)
    }
    return
  }

  // 报告第五部分：环带射程 / 方向射线 / AOE / 条件图层
  if (props.viewMode === 'range') {
    if (R.shape === 'line') {
      // 方向性线性射线：默认沿「右」朝向，可由 rangeCtx.mcDir 指定（right→0）
      const dirMap = { right: 0, rightup: 1, leftup: 2, left: 3, leftdown: 4, rightdown: 5 }
      const dirIdx = dirMap[props.rangeCtx.mcDir] ?? 0
      const line = lineCells(center, dirIdx, Math.max(R.maxR, 1))
      for (const cell of line) {
        if (cell.q < 0 || cell.q >= GRID_COLS || cell.r < 0 || cell.r >= GRID_ROWS) continue
        const s = hexToScreen(cell.q, cell.r)
        drawHexPath(ctx, s.x, s.y, HEX_RADIUS * scale.value * 0.96)
        ctx.fillStyle = 'rgba(80,200,120,0.16)'
        ctx.fill()
        ctx.strokeStyle = 'rgba(80,220,140,0.5)'
        ctx.lineWidth = 1
        ctx.stroke()
      }
    } else {
      // 默认圆形环带射程 + 盲区阴影 + 环号
      drawRingRange(ctx, center, R.minR, R.maxR)
    }
    // 射程视图：模拟玩家棋子固定在棋盘中心
    drawUnitMarker(ctx, center, '#ffd479')
  } else if (props.viewMode === 'aoe') {
    // AOE 视图正确语义（2026-08-12 修正）：
    // 射程 = 以自己(UNIT_ORIGIN)为心、[min,max] —— 决定"能选哪些格当目标落点"
    // 攻击范围(AOE) = 以【已选定的目标点】为心、aoeSpread(攻击半径) —— 该目标格周围连带命中圈
    // 二者锚点完全不同：射程锚自己，AOE 锚目标点。
    const rr = resolveRange()
    drawUnitMarker(ctx, { ...UNIT_ORIGIN }, '#ffd479')
    // 射程可选区（淡绿，提示：目标点须落在射程内）
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let q = 0; q < GRID_COLS; q++) {
        const d = hexDistance(UNIT_ORIGIN.q, UNIT_ORIGIN.r, q, r)
        if (d < rr.minR || d > rr.maxR) continue
        const s = hexToScreen(q, r)
        drawHexPath(ctx, s.x, s.y, HEX_RADIUS * scale.value * 0.98)
        ctx.fillStyle = 'rgba(93,212,127,0.06)'
        ctx.fill()
      }
    }
    const aoeCenter = props.rangeCtx.aoeCenter
    if (aoeCenter) {
      // 目标落点（蓝色实心高亮）
      const cs = hexToScreen(aoeCenter.q, aoeCenter.r)
      drawHexPath(ctx, cs.x, cs.y, HEX_RADIUS * scale.value)
      ctx.fillStyle = 'rgba(91,214,255,0.45)'
      ctx.fill()
      ctx.strokeStyle = '#5bd6ff'
      ctx.lineWidth = 2
      ctx.stroke()
      // 攻击范围：以目标落点为心的同心圆（半径 = aoeSpread），内部全部连带命中
      const aoeSpread = props.rangeCtx.aoeSpread || 0
      for (let r = 0; r < GRID_ROWS; r++) {
        for (let q = 0; q < GRID_COLS; q++) {
          const d = hexDistance(aoeCenter.q, aoeCenter.r, q, r)
          if (d < 1 || d > aoeSpread) continue
          const s = hexToScreen(q, r)
          drawHexPath(ctx, s.x, s.y, HEX_RADIUS * scale.value * 0.96)
          ctx.fillStyle = 'rgba(91,214,255,0.20)'
          ctx.fill()
          ctx.strokeStyle = 'rgba(91,214,255,0.55)'
          ctx.lineWidth = 1
          ctx.stroke()
          ctx.fillStyle = 'rgba(180,235,255,0.85)'
          ctx.font = '9px system-ui, sans-serif'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(String(d), s.x, s.y)
        }
      }
    }
  }

  // 条件图层（Cond）：覆盖绘制 IF 段空间条件校验
  drawConditionLayer(ctx, center)

  // 路径
  if (props.rangeCtx.path.length > 1) {
    ctx.beginPath()
    props.rangeCtx.path.forEach((cell, i) => {
      const s = hexToScreen(cell.q, cell.r)
      if (i === 0) ctx.moveTo(s.x, s.y)
      else ctx.lineTo(s.x, s.y)
    })
    ctx.strokeStyle = '#ffd479'
    ctx.lineWidth = 3
    ctx.stroke()
  }
  // 悬停高亮
  if (hover.value && hover.value.q >= 0 && hover.value.q < GRID_COLS && hover.value.r >= 0 && hover.value.r < GRID_ROWS) {
    const s = hexToScreen(hover.value.q, hover.value.r)
    drawHexPath(ctx, s.x, s.y, HEX_RADIUS * scale.value)
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2
    ctx.stroke()
  }
}

// 通用：绘制一组 cell
function placeCells(list, color, fill, lw = 2) {
  for (const cell of list) {
    if (cell.q < 0 || cell.q >= GRID_COLS || cell.r < 0 || cell.r >= GRID_ROWS) continue
    const s = hexToScreen(cell.q, cell.r)
    drawHexPath(ctxRef(), s.x, s.y, HEX_RADIUS * scale.value)
    ctxRef().fillStyle = fill
    ctxRef().fill()
    ctxRef().strokeStyle = color
    ctxRef().lineWidth = lw
    ctxRef().stroke()
  }
}
// 取当前 ctx（draw 内通过闭包传参，这里复用 draw 时保存的引用）
let _ctxRef = null
function ctxRef() { return _ctxRef }

// ---------- 六段式（辐射式重做：设计稿 §2/§3/§4） ----------
// 中心技能节点 + 六段格按 HEXSIX_COORD_BY_KEY 辐射；ROLL 裂变出橙框一级分段 + 蓝框二级子段
function drawHexSix(ctx) {
  const lanes = props.lanes || []
  // 六段屏幕坐标（辐射布局），其质心作为中心技能节点位置，使连线自然汇聚
  const laneScreens = lanes.map((lane, i) => {
    const coord = (lane && lane.key && HEXSIX_COORD_BY_KEY[lane.key]) || HEXSIX_COORDS[i]
    return hexToScreen(coord.q, coord.r)
  })
  const center = { x: 0, y: 0 }
  if (laneScreens.length) {
    laneScreens.forEach(p => { center.x += p.x; center.y += p.y })
    center.x /= laneScreens.length; center.y /= laneScreens.length
  } else {
    center.x = cw() / 2; center.y = ch() / 2
  }
  const R = HEX_RADIUS * scale.value

  // 1) 中心技能节点（六边形，标「技能」）
  drawHexPath(ctx, center.x, center.y, R * 0.92)
  ctx.fillStyle = 'rgba(255,212,121,0.16)'
  ctx.fill()
  ctx.strokeStyle = '#ffd479'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.fillStyle = '#ffe9b0'
  ctx.font = 'bold 13px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('技能', center.x, center.y)

  // 2) 六段格辐射 + 连线到中心
  lanes.forEach((lane, i) => {
    const key = (lane && lane.key) || 'WHEN'
    const coord = (lane && lane.key && HEXSIX_COORD_BY_KEY[lane.key]) || HEXSIX_COORDS[i]
    const s = hexToScreen(coord.q, coord.r)
    const atoms = Array.isArray(lane.atoms) ? lane.atoms : []
    const isActive = props.activeLaneIndex === i
    const isWhen = key === 'WHEN'
    const pal = HEXSIX_COLORS[key] || HEXSIX_COLORS.WHEN
    const sel = BRANCH_COLORS.selected

    // 段格 → 中心 连线（辐射骨架）
    ctx.beginPath()
    ctx.moveTo(center.x, center.y)
    ctx.lineTo(s.x, s.y)
    ctx.strokeStyle = isActive ? 'rgba(255,212,121,0.5)' : 'rgba(150,150,160,0.28)'
    ctx.lineWidth = isActive ? 2 : 1
    ctx.stroke()

    // 段格本体
    drawHexPath(ctx, s.x, s.y, R)
    if (isActive) {
      ctx.fillStyle = sel.fill; ctx.fill()
      ctx.strokeStyle = sel.stroke; ctx.lineWidth = 3; ctx.stroke()
    } else {
      ctx.fillStyle = pal.fill; ctx.fill()
      ctx.strokeStyle = pal.stroke; ctx.lineWidth = isWhen ? 3 : 2; ctx.stroke()
    }
    if (isWhen) {
      drawHexPath(ctx, s.x, s.y, R - 4)
      ctx.strokeStyle = 'rgba(255,212,121,0.65)'; ctx.lineWidth = 1; ctx.stroke()
    }
    ctx.fillStyle = isActive ? sel.text : pal.text
    ctx.font = 'bold 13px system-ui, sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    const seqLabel = (i + 1) + '·' + (lane.label || key || ('段' + (i + 1)))
    ctx.fillText(seqLabel + (isWhen ? '🔒' : ''), s.x, s.y - 10)

    // 段格内原子：黄色小六边形环绕
    const atomR = R * 0.3
    if (!atoms.length) {
      ctx.fillStyle = 'rgba(201,138,142,0.9)'
      ctx.font = '11px system-ui, sans-serif'
      ctx.fillText('空', s.x, s.y + 14)
    } else {
      atoms.forEach((a, ai) => {
        const ang = (Math.PI * 2 / Math.max(atoms.length, 6)) * ai - Math.PI / 2
        const ax = s.x + Math.cos(ang) * R * 0.6
        const ay = s.y + Math.sin(ang) * R * 0.6
        drawHexPath(ctx, ax, ay, atomR)
        ctx.fillStyle = BRANCH_COLORS.atom.fill; ctx.fill()
        ctx.strokeStyle = BRANCH_COLORS.atom.stroke; ctx.lineWidth = 1; ctx.stroke()
        ctx.fillStyle = BRANCH_COLORS.atom.text
        ctx.font = 'bold 9px system-ui, sans-serif'
        ctx.fillText((a.effectType || a.label || '?').slice(0, 3), ax, ay)
      })
    }

    // 3) ROLL 裂变可视化（橙框一级分段 + 蓝框二级子段）
    if (key === 'ROLL') {
      const hosts = atoms.filter(a => a && a.effectType === 'roll_segment')
      if (hosts.length) drawRollFission(ctx, s, center, hosts)
    }
  })
}

// ROLL 裂变：沿「ROLL段格 → 中心」连线的外侧方向，依次展开橙框分段节点，每个分段下再挂蓝框子段原子
function drawRollFission(ctx, rollPos, center, hosts) {
  const R = HEX_RADIUS * scale.value
  // 裂变整体朝「远离中心」的方向展开
  const dx = rollPos.x - center.x
  const dy = rollPos.y - center.y
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len, uy = dy / len
  const perpX = -uy, perpY = ux
  let segIdx = 0
  hosts.forEach((host) => {
    const branches = (host.branches && host.branches.length) ? host.branches : []
    branches.forEach((br, bi) => {
      segIdx++
      // 一级分段（橙）位置：ROLL 段格外推一层
      const segDist = R * 1.9
      const spread = (segIdx - 1) * (R * 1.15) - (Math.max(hosts.reduce((t, h) => t + ((h.branches || []).length), 0), 1) - 1) * (R * 0.575)
      const sx = rollPos.x + ux * segDist + perpX * spread
      const sy = rollPos.y + uy * segDist + perpY * spread
      // 连线：ROLL → 分段
      ctx.beginPath()
      ctx.moveTo(rollPos.x, rollPos.y); ctx.lineTo(sx, sy)
      ctx.strokeStyle = BRANCH_COLORS.segment.stroke; ctx.lineWidth = 1.5; ctx.stroke()
      // 一级分段节点（橙框六边形）
      drawHexPath(ctx, sx, sy, R * 0.78)
      ctx.fillStyle = BRANCH_COLORS.segment.fill; ctx.fill()
      ctx.strokeStyle = BRANCH_COLORS.segment.stroke; ctx.lineWidth = 2; ctx.stroke()
      ctx.fillStyle = BRANCH_COLORS.segment.text
      ctx.font = 'bold 10px system-ui, sans-serif'
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      const segTitle = '分段' + segIdx + (br.range ? ' 掷' + br.range : '')
      ctx.fillText('分段' + segIdx, sx, sy - 7)
      // 二级子段（蓝）：每个 branch.atoms 画蓝框节点在橙外侧
      const subAtoms = Array.isArray(br.atoms) ? br.atoms : []
      const subN = Math.max(subAtoms.length, 1)
      subAtoms.forEach((sa, si) => {
        const subDist = R * 1.7
        const subSpread = (si - (subN - 1) / 2) * (R * 0.95)
        const bx = sx + ux * subDist + perpX * subSpread
        const by = sy + uy * subDist + perpY * subSpread
        ctx.beginPath()
        ctx.moveTo(sx, sy); ctx.lineTo(bx, by)
        ctx.strokeStyle = BRANCH_COLORS.subSegment.stroke; ctx.lineWidth = 1; ctx.stroke()
        drawHexPath(ctx, bx, by, R * 0.6)
        ctx.fillStyle = BRANCH_COLORS.subSegment.fill; ctx.fill()
        ctx.strokeStyle = BRANCH_COLORS.subSegment.stroke; ctx.lineWidth = 2; ctx.stroke()
        ctx.fillStyle = BRANCH_COLORS.subSegment.text
        ctx.font = 'bold 8px system-ui, sans-serif'
        ctx.fillText((sa.effectType || sa.label || '子') .slice(0, 3), bx, by)
      })
      if (!subAtoms.length) {
        const bx = sx + ux * R * 1.7, by = sy + uy * R * 1.7
        drawHexPath(ctx, bx, by, R * 0.5)
        ctx.fillStyle = BRANCH_COLORS.subSegment.fill; ctx.fill()
        ctx.strokeStyle = BRANCH_COLORS.subSegment.stroke; ctx.lineWidth = 1.5; ctx.stroke()
        ctx.fillStyle = BRANCH_COLORS.subSegment.text
        ctx.font = '8px system-ui, sans-serif'
        ctx.fillText('空', bx, by)
      }
    })
  })
  if (!segIdx) {
    // 无裂变：在 ROLL 旁提示可裂变
    ctx.fillStyle = 'rgba(255,140,40,0.8)'
    ctx.font = '10px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('（拖入掷骰区间原子以裂变）', rollPos.x, rollPos.y + R * 1.5)
  }
}

// ---------- 图谱 ----------
function drawGraph(ctx) {
  const lanes = props.lanes || []
  const n = lanes.length || 6
  const colsN = Math.min(n, GRID_COLS)
  const rowsN = Math.min(Math.ceil(n / colsN), GRID_ROWS)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  lanes.forEach((lane, i) => {
    if (i >= colsN * rowsN) return
    const col = i % colsN
    const row = Math.floor(i / colsN)
    const s = hexToScreen(col, row)
    const isActive = props.activeLaneIndex === i
    drawHexPath(ctx, s.x, s.y, HEX_RADIUS * scale.value)
    ctx.fillStyle = isActive ? 'rgba(255,212,121,0.22)' : 'rgba(255,212,121,0.12)'
    ctx.fill()
    ctx.strokeStyle = isActive ? '#fff' : '#ffd479'
    ctx.lineWidth = isActive ? 3 : 2
    ctx.stroke()
    ctx.fillStyle = isActive ? '#fff' : '#ffd479'
    ctx.font = 'bold 12px system-ui, sans-serif'
    ctx.fillText(lane.label || ('段' + (i + 1)), s.x, s.y - 8)
    const atoms = Array.isArray(lane.atoms) ? lane.atoms : []
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.font = '11px system-ui, sans-serif'
    ctx.fillText(atoms.length ? `${atoms.length} 原子` : '空', s.x, s.y + 10)
  })
}

// ---------- 交互 ----------
// 判断本次按下是否应进入「镜头平移」而非功能绘制
function shouldPan(e) {
  // 中键 或 右键拖拽 或 显式平移模式：始终平移
  if (e.button === 1 || panMode.value) return true
  // 左键（button===0）：射程视图内默认仍绘制，但按住空格强制平移；其余视图左键也平移
  if (e.button === 0) {
    if (isRange() && !panMode.value) return false
    return true
  }
  return false
}

// ---------- 地图炮六向补全（复刻自「打击范围图层·六向补全逻辑说明」） ----------
// offset → axial 互转（与 hexUtils.hexDistance 内部 offToAx 同源）
function offToAx(q, r) { return { q: q - (r + (r & 1)) / 2, r } }
function axToOff(q, r) { return { q: q + (r + (r & 1)) / 2, r } }
// 屏幕 Y 轴向下时，标准数学 CCW {x:-z,y:-x,z:-y} 会变视觉向下旋转；
// 用 {x:-y,y:-z,z:-x} 才能在屏幕上产生视觉向上的逆时针 60° 旋转，使 rightup 落到屏幕上方。
function rotCCW(cube) { return { x: -cube.y, y: -cube.z, z: -cube.x } }
function toCube(col, row) { const a = offToAx(col, row); return { x: a.q, z: a.r, y: -a.q - a.r } }
function fromCube(cube) { const off = axToOff(cube.x, cube.z); return { q: off.col, r: off.row } }

// 以战场中心格为锚，将当前方向绘制的形状镜像旋转复制到全部 6 方向
const mcTip = ref('')
function completeSixDirs() {
  const CENTER = { ...UNIT_ORIGIN }
  const shapes = props.rangeCtx.mcShapes || {}
  const srcDir = props.rangeCtx.mcDir || 'right'
  let base = shapes[srcDir] || []
  if (!base.length) {
    // 当前方向还没画格：自动以「中心向外一步」作为种子再补全，避免按钮静默无反应
    const dirMap = { right: 0, rightup: 1, leftup: 2, left: 3, leftdown: 4, rightdown: 5 }
    const dirIdx = dirMap[srcDir] ?? 0
    const seed = lineCells(CENTER, dirIdx, 1)[0]
    if (seed) {
      base = [seed]
      // 把种子写回当前方向，保证画布立即显示起点（最终会经 mc-complete 落回父层）
      shapes[srcDir] = [seed]
    }
  }
  if (!base.length) {
    mcTip.value = '请先在「' + (MC_DIRS.find(d => d.value === srcDir)?.label || srcDir) + '」方向画至少一格'
    setTimeout(() => { if (mcTip.value) mcTip.value = '' }, 2200)
    return
  }
  mcTip.value = ''
  const srcIdx = MC_DIRS.findIndex(d => d.value === srcDir)
  if (srcIdx === -1) return
  const centerCube = toCube(CENTER.q, CENTER.r)
  const out = {}
  // 合并补全：已绘制的方向保留原格，未绘制的方向用 srcDir 旋转推导，避免清除用户原绘制
  for (let k = 0; k < 6; k++) {
    const dirVal = MC_DIRS[k].value
    const painted = shapes[dirVal] && shapes[dirVal].length
    if (painted) {
      out[dirVal] = shapes[dirVal].map(c => ({ q: c.q, r: c.r }))
      continue
    }
    const steps = (k - srcIdx + 6) % 6
    const cells = []
    for (const cell of base) {
      const v = toCube(cell.q, cell.r)
      const rel = { x: v.x - centerCube.x, y: v.y - centerCube.y, z: v.z - centerCube.z }
      let cur = rel
      for (let t = 0; t < steps; t++) cur = rotCCW(cur)
      const off = fromCube({ x: cur.x + centerCube.x, y: cur.y + centerCube.y, z: cur.z + centerCube.z })
      if (off.q >= 0 && off.q < GRID_COLS && off.r >= 0 && off.r < GRID_ROWS) cells.push({ q: off.q, r: off.r })
    }
    out[dirVal] = cells
  }
  emit('mc-complete', out)
}
function clearMcShapes() { emit('mc-clear') }
function setMcDir(dir) { emit('mc-set-dir', dir) }

// 命中六段格：按 lane.coord/lane.key 定位（顺序无关），WHEN 锚点 (5,10) 亦可命中
function hexsixHit(h) {
  const lanes = props.lanes || []
  for (let i = 0; i < lanes.length; i++) {
    const co = laneCoord(lanes[i], i)
    if (co.q === h.q && co.r === h.r) return i
  }
  return -1
}
function onMove(e) {
  const { x, y } = eventPos(e)
  // 镜头平移中
  if (camPan.value) {
    offset.value = {
      x: camPanStart.value.ox + (x - camPanStart.value.x),
      y: camPanStart.value.oy + (y - camPanStart.value.y),
    }
    draw()
    return
  }
  if (isRange() && drawing.value) {
    const h = screenToHex(x, y)
    if (!hover.value || hover.value.q !== h.q || hover.value.r !== h.r) hover.value = h
    return
  }
  if (isHexSix()) {
    const h = screenToHex(x, y)
    const idx = hexsixHit(h)
    if (idx >= 0 && props.activeLaneIndex !== idx) emit('select-lane', idx)
    hover.value = idx >= 0 ? h : null
    return
  }
  hover.value = screenToHex(x, y)
}
function onDown(e) {
  const { x, y } = eventPos(e)
  if (shouldPan(e)) {
    camPan.value = true
    camPanStart.value = { x, y, ox: offset.value.x, oy: offset.value.y }
    cv.value.style.cursor = 'grabbing'
    return
  }
  if (isRange()) {
    dragging.value = true
    const h = screenToHex(x, y)
    hover.value = h
  } else if (isHexSix()) {
    const h = screenToHex(x, y)
    const idx = hexsixHit(h)
    if (idx >= 0) emit('select-lane', idx)
  } else if (isGraph()) {
    const h = screenToHex(x, y)
    if (h.q >= 0 && h.q < GRID_COLS && h.r >= 0 && h.r < GRID_ROWS) {
      const n = (props.lanes || []).length || 6
      const colsN = Math.min(n, GRID_COLS)
      const rowsN = Math.min(Math.ceil(n / colsN), GRID_ROWS)
      const idx = h.r * colsN + h.q
      if (idx < n) emit('select-lane', idx)
    }
  }
}
const dragging = ref(false)
function onUp(e) {
  if (camPan.value) {
    camPan.value = false
    cv.value.style.cursor = ''
    return
  }
  if (isRange() && dragging.value) {
    const { x, y } = eventPos(e)
    const h = screenToHex(x, y)
    dragging.value = false
    if (props.viewMode === 'aoe') {
      // AOE 视图：点击 = 设置目标落点（须落在射程内，由父层校验）
      emit('select-aoe-point', h)
    }
    else if (props.viewMode === 'map') emit('place-map', h)
    // 注：射程视图(range)不再自由绘格——由 min/max 区间驱动
  }
}
function onLeave() {
  hover.value = null
  dragging.value = false
  if (camPan.value) { camPan.value = false; if (cv.value) cv.value.style.cursor = '' }
}
// 滚轮缩放（以鼠标位置为锚点）
function onWheel(e) {
  const { x, y } = eventPos(e)
  const before = screenToWorld(x, y)
  const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
  const newScale = Math.min(4, Math.max(0.2, scale.value * factor))
  scale.value = newScale
  // 缩放后保持锚点不动：offset = screen - world*scale
  offset.value = { x: x - before.x * newScale, y: y - before.y * newScale }
  draw()
}
function onRight(e) {
  if (camPan.value) return
  if (props.viewMode !== 'map') return
  const { x, y } = eventPos(e)
  const h = screenToHex(x, y)
  emit('place-map', h)
}
function onDrop(e) {
  const dt = e.dataTransfer
  if (!dt) return
  const atom = dt.getData('application/atom') || dt.getData('text/atom') || dt.getData('text/plain')
  if (!atom) return
  const { x, y } = eventPos(e)
  const h = screenToHex(x, y)
  const idx = hexsixHit(h)
  if (idx >= 0) {
    emit('drop-atom', { laneIndex: idx, atom: JSON.parse(atom) })
  } else if (isRange()) {
    emit('drop-atom', { laneIndex: -1, atom: JSON.parse(atom), cell: h })
  }
}

onMounted(() => {
  nextTick(() => {
    syncCanvasSize()
    if (window.ResizeObserver) {
      ro = new ResizeObserver(() => syncCanvasSize())
      ro.observe(wrapRef.value)
    } else {
      window.addEventListener('resize', syncCanvasSize)
    }
  })
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
})
onBeforeUnmount(() => {
  if (ro && wrapRef.value) ro.unobserve(wrapRef.value)
  if (ro) ro.disconnect()
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
})
function onKeyDown(e) {
  if (e.code === 'Space') { panMode.value = true; if (cv.value) cv.value.style.cursor = 'grab' }
}
function onKeyUp(e) {
  if (e.code === 'Space') { panMode.value = false; if (cv.value) cv.value.style.cursor = '' }
}
// 视图/泳道切换才重置镜头；rangeCtx 深层变更（按钮点按、落点绘制）只重绘，绝不重置镜头
// 修复：此前每次 rangeCtx 变化都 initCamera()，导致点一下按钮镜头跳回初始，用户误以为"点了没反应"
watch(() => [props.viewMode, props.lanes], () => { initCamera(); draw() }, { deep: true })
watch(() => props.rangeCtx, () => { draw() }, { deep: true })
watch(() => [props.width, props.height], () => syncCanvasSize())
</script>

<style scoped>
.hex-canvas-wrap {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0d0f14;
  border-radius: 10px;
  overflow: hidden;
}
.hex-canvas-el {
  width: 100%;
  height: 100%;
  display: block;
  cursor: grab;
}
.hex-canvas-el:active {
  cursor: grabbing;
}
.hexsix-hint {
  position: absolute;
  left: 12px;
  bottom: 10px;
  padding: 4px 10px;
  background: rgba(0,0,0,0.55);
  color: #ffd479;
  border: 1px solid rgba(255,212,121,0.4);
  border-radius: 6px;
  font-size: 12px;
}
.hexsix-legend {
  position: absolute;
  right: 12px;
  top: 10px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 6px 9px;
  background: rgba(0,0,0,0.55);
  border: 1px solid rgba(255,255,255,0.18);
  border-radius: 6px;
  font-size: 11px;
  color: #d8d8e0;
}
.hexsix-legend span { display: flex; align-items: center; gap: 5px; }
.hexsix-legend .hl { width: 11px; height: 11px; border-radius: 2px; display: inline-block; }
.hl-main { background: rgba(20,20,24,0.92); border: 1px solid #2b2b30; }
.hl-roll { background: rgba(40,120,120,0.90); border: 1px solid #3fd0c4; }
.hl-seg { background: rgba(255,140,40,0.16); border: 1px solid #ff8c28; }
.hl-sub { background: rgba(80,160,255,0.16); border: 1px solid #5aa0ff; }
.hl-atom { background: rgba(255,212,80,0.92); border: 1px solid #ffd450; }
.hl-empty { background: rgba(70,20,24,0.55); border: 1px solid #7a2a30; }
.hl-sel { background: rgba(120,120,128,0.85); border: 1px solid #9aa0aa; }
.cam-hint {
  position: absolute;
  right: 12px;
  bottom: 10px;
  padding: 4px 10px;
  background: rgba(0,0,0,0.55);
  color: rgba(255,255,255,0.7);
  border: 1px solid rgba(255,255,255,0.18);
  border-radius: 6px;
  font-size: 11px;
  pointer-events: none;
}
.mc-toolbar {
  position: absolute;
  right: 12px;
  top: 10px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  background: rgba(0,0,0,0.55);
  border: 1px solid rgba(255,212,121,0.35);
  border-radius: 8px;
  z-index: 5;
}
.mc-tb-label { color: #ffd479; font-size: 12px; margin-right: 2px; }
.mc-dir-btn {
  padding: 3px 8px;
  background: rgba(255,212,121,0.12);
  color: #ffe6ad;
  border: 1px solid rgba(255,212,121,0.4);
  border-radius: 5px;
  font-size: 12px;
  cursor: pointer;
}
.mc-dir-btn.active { background: #ffd479; color: #2a1c00; border-color: #ffd479; font-weight: bold; }
.mc-act-btn {
  padding: 3px 8px;
  background: #3fae6e;
  color: #fff;
  border: 1px solid #3fae6e;
  border-radius: 5px;
  font-size: 12px;
  cursor: pointer;
}
.mc-act-btn.ghost { background: transparent; color: #ff8a8a; border-color: rgba(200,40,40,0.5); }
.mc-tip { color: #ffd479; font-size: 11px; margin-left: 4px; white-space: nowrap; }
.range-legend {
  position: absolute;
  left: 12px;
  bottom: 10px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 5px 9px;
  background: rgba(0,0,0,0.55);
  border: 1px solid rgba(255,255,255,0.16);
  border-radius: 8px;
  font-size: 11px;
  color: rgba(255,255,255,0.8);
  z-index: 5;
  pointer-events: none;
}
.range-legend .lg {
  display: inline-block;
  width: 11px;
  height: 11px;
  border-radius: 2px;
  margin-right: 4px;
  vertical-align: -1px;
}
.range-legend .lg-hit { background: rgba(80,200,120,0.45); }
.range-legend .lg-dead { background: rgba(200,40,40,0.55); }
.range-legend .lg-mc { background: rgba(255,212,121,0.55); }
.range-legend .lg-cond { background: transparent; border: 1px dashed rgba(255,138,76,0.9); }
.range-legend .lg-num { color: rgba(180,255,200,0.9); }
</style>
