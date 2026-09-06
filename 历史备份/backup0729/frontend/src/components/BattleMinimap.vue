<template>
  <div class="battle-minimap" :style="{ width: size + 'px', height: size + 'px' }">
    <canvas
      ref="canvasRef"
      :width="size"
      :height="size"
      class="minimap-canvas"
      @click="onClick"
    ></canvas>
    <div class="minimap-label">地图缩略</div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import {
  pointyTopCenter, pointyTopToHex, HEX_RADIUS,
  DEFAULT_SPACING_H, DEFAULT_SPACING_V, UNIVERSAL_TERRAIN_MAP,
} from '../utils/hexUtils.js'

// 需求② 略缩图栏（§3.5）：独立小 canvas，平面顶视缩略整张地图 + 视口框 + 点击跳转
const props = defineProps({
  gridData: { type: Object, default: () => ({}) },   // { width, height, cells }
  cells: { type: Array, default: () => [] },          // 优先于 gridData.cells
  units: { type: Array, default: () => [] },
  engine: { type: Object, default: null },            // HexGridCanvasEngine 实例
  size: { type: Number, default: 180 },
})

const canvasRef = ref(null)
let pollTimer = null

const PAD = HEX_RADIUS

function resolveCells() {
  if (props.cells && props.cells.length) return props.cells
  return props.gridData?.cells || []
}

// 简洁阵营色（与战场视觉辅助一致；如需精确色可改为 import getFactionConfig）
function factionColor(faction) {
  const m = {
    attacker: '#ff5252', defender: '#4fc3f7', ambush: '#ba68c8',
    royroy: '#ffd54f', neutral: '#cfd8dc',
  }
  return m[faction] || '#cfd8dc'
}

function worldBounds() {
  const cells = resolveCells()
  if (!cells.length) return null
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const c of cells) {
    const { flatX, flatY } = pointyTopCenter(c.q, c.r, HEX_RADIUS, DEFAULT_SPACING_H, DEFAULT_SPACING_V)
    if (flatX < minX) minX = flatX
    if (flatX > maxX) maxX = flatX
    if (flatY < minY) minY = flatY
    if (flatY > maxY) maxY = flatY
  }
  return { minX, maxX, minY, maxY }
}

function drawMinimap() {
  const cvs = canvasRef.value
  if (!cvs) return
  const ctx = cvs.getContext('2d')
  const W = cvs.width, H = cvs.height
  ctx.clearRect(0, 0, W, H)
  const b = worldBounds()
  if (!b) return
  const worldW = (b.maxX - b.minX) + PAD * 2
  const worldH = (b.maxY - b.minY) + PAD * 2
  const scale = Math.min(W / worldW, H / worldH)
  const offX = (W - (b.maxX - b.minX) * scale) / 2 - b.minX * scale
  const offY = (H - (b.maxY - b.minY) * scale) / 2 - b.minY * scale
  const toMini = (x, y) => ({ x: offX + x * scale, y: offY + y * scale })

  // 地形色块
  const cells = resolveCells()
  const cellR = Math.max(1.2, HEX_RADIUS * 0.42 * scale)
  for (const c of cells) {
    const { flatX, flatY } = pointyTopCenter(c.q, c.r, HEX_RADIUS, DEFAULT_SPACING_H, DEFAULT_SPACING_V)
    const p = toMini(flatX, flatY)
    const t = UNIVERSAL_TERRAIN_MAP[c.terrain] || UNIVERSAL_TERRAIN_MAP.moon
    ctx.fillStyle = t.color
    ctx.beginPath(); ctx.arc(p.x, p.y, cellR, 0, Math.PI * 2); ctx.fill()
  }

  // 单位点（按 faction 着色）
  for (const u of props.units || []) {
    if (u.q === undefined) continue
    const { flatX, flatY } = pointyTopCenter(u.q, u.r, HEX_RADIUS, DEFAULT_SPACING_H, DEFAULT_SPACING_V)
    const p = toMini(flatX, flatY)
    ctx.fillStyle = factionColor(u.faction)
    ctx.beginPath(); ctx.arc(p.x, p.y, cellR * 0.75, 0, Math.PI * 2); ctx.fill()
  }

  // 视口框（来自引擎 getVisibleRange()）
  const eng = props.engine
  if (eng && typeof eng.getVisibleRange === 'function') {
    const vr = eng.getVisibleRange()
    if (vr && vr.maxQ >= vr.minQ && vr.maxR >= vr.minR) {
      const corners = [
        [vr.minQ, vr.minR], [vr.maxQ, vr.minR],
        [vr.maxQ, vr.maxR], [vr.minQ, vr.maxR],
      ]
      const pts = corners.map(([q, r]) => {
        const { flatX, flatY } = pointyTopCenter(q, r, HEX_RADIUS, DEFAULT_SPACING_H, DEFAULT_SPACING_V)
        return toMini(flatX, flatY)
      })
      ctx.strokeStyle = 'rgba(255,255,255,0.95)'
      ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y)
      for (let i = 1; i < 4; i++) ctx.lineTo(pts[i].x, pts[i].y)
      ctx.closePath(); ctx.stroke()
    }
  }
}

// 点击 → 反推 q,r → 引擎 centerOn 跳转
function onClick(e) {
  const cvs = canvasRef.value
  if (!cvs) return
  const rect = cvs.getBoundingClientRect()
  const mx = (e.clientX - rect.left) * (cvs.width / rect.width)
  const my = (e.clientY - rect.top) * (cvs.height / rect.height)
  const b = worldBounds()
  if (!b) return
  const worldW = (b.maxX - b.minX) + PAD * 2
  const worldH = (b.maxY - b.minY) + PAD * 2
  const scale = Math.min(cvs.width / worldW, cvs.height / worldH)
  const offX = (cvs.width - (b.maxX - b.minX) * scale) / 2 - b.minX * scale
  const offY = (cvs.height - (b.maxY - b.minY) * scale) / 2 - b.minY * scale
  const wx = (mx - offX) / scale
  const wy = (my - offY) / scale
  const { q, r } = pointyTopToHex(wx, wy, HEX_RADIUS, DEFAULT_SPACING_H, DEFAULT_SPACING_V)
  const eng = props.engine
  if (eng && typeof eng.centerOn === 'function') eng.centerOn(q, r)
  else if (eng && typeof eng.centerGrid === 'function') eng.centerGrid()
}

watch(() => [props.cells, props.units, props.gridData], () => drawMinimap(), { deep: true })

onMounted(() => {
  drawMinimap()
  // 低频轮询视口框（引擎 rAF 主循环之外的轻量同步，400ms 足够；脏检查可省）
  pollTimer = setInterval(drawMinimap, 400)
})
onUnmounted(() => { if (pollTimer) clearInterval(pollTimer) })
</script>

<style scoped>
.battle-minimap {
  position: relative;
  background: rgba(12, 16, 24, 0.82);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 8px;
  overflow: hidden;
  pointer-events: auto;
}
.minimap-canvas {
  display: block;
  cursor: pointer;
}
.minimap-label {
  position: absolute;
  top: 4px;
  left: 6px;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.6);
  pointer-events: none;
  text-shadow: 0 1px 2px #000;
}
</style>
