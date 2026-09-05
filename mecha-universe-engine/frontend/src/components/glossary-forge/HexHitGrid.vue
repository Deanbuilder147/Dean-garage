<template>
  <svg
    class="hit-grid"
    :class="`skin-${skin}`"
    :viewBox="`0 0 ${vb.w} ${vb.h}`"
    xmlns="http://www.w3.org/2000/svg"
  >
    <g v-for="c in cells" :key="c.q + '_' + c.r">
      <polygon
        :points="hexPoints(px(c).x, px(c).y)"
        :class="cellClass(c)"
        @click.stop="pick(c)"
        @mouseenter="hover = { q: c.q, r: c.r }"
        @mouseleave="hover = null"
      >
        <title>({{ c.q - ORIGIN.q }}, {{ c.r - ORIGIN.r }})</title>
      </polygon>
    </g>

    <!-- 施法者原点 (0,0) -->
    <polygon :points="hexPoints(originPt.x, originPt.y)" class="caster" />
    <text :x="originPt.x" :y="originPt.y + 4" class="caster-txt">自</text>
  </svg>
</template>

<script setup>
import { computed, ref } from 'vue'
import { pointyTopCenter, hexDistance } from '../../utils/hexUtils.js'

const props = defineProps({
  skin:            { type: String, default: 'prism' },      // prism | blueprint
  mode:            { type: String, default: 'none' },        // none | aoe | map_cannon
  aoeCenter:       { type: Object, default: null },          // 相对偏移 {q,r}
  aoeSpread:       { type: Number, default: 0 },
  aoeInner:        { type: Number, default: 0 },
  mcDirections:    { type: Object, default: () => ({}) },    // { right:[{q,r}] } 相对偏移
  activeDir:       { type: String, default: 'right' },
  rangeMax:        { type: Number, default: 0 },             // 射程上限，用于画可达环
  reachable:       { type: Boolean, default: false }
})
const emit = defineEmits(['pick'])

// ---- 网格：19×19，原点 (9,9) = 施法者（与 HexCanvasEditor UNIT_ORIGIN 同口径）----
const N = 19
const ORIGIN = { q: 9, r: 9 }
const R = 13

const cells = (() => {
  const out = []
  for (let r = 0; r < N; r++) {
    for (let q = 0; q < N; q++) {
      const { flatX, flatY } = pointyTopCenter(q, r, R)
      out.push({ q, r, x: flatX, y: flatY })
    }
  }
  return out
})()

const bounds = cells.reduce((b, c) => ({
  minX: Math.min(b.minX, c.x), maxX: Math.max(b.maxX, c.x),
  minY: Math.min(b.minY, c.y), maxY: Math.max(b.maxY, c.y)
}), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity })

const PAD = R + 3
const OFF = { x: PAD - bounds.minX, y: PAD - bounds.minY }
const vb = computed(() => ({
  w: (bounds.maxX - bounds.minX) + PAD * 2,
  h: (bounds.maxY - bounds.minY) + PAD * 2
}))

// 平移后坐标（格子与施法者标记必须统一走这个，否则视觉与命中区错位）
function px(c) { return { x: c.x + OFF.x, y: c.y + OFF.y } }

/** 点击格子 → 抛出相对施法者的偏移坐标 */
function pick(c) {
  emit('pick', { q: c.q - ORIGIN.q, r: c.r - ORIGIN.r })
}
const originPt = px(cells.find(c => c.q === ORIGIN.q && c.r === ORIGIN.r))

const K = 0.866025  // √3/2
function hexPoints(cx, cy) {
  const p = [
    [cx, cy - R], [cx + K * R, cy - R / 2], [cx + K * R, cy + R / 2],
    [cx, cy + R], [cx - K * R, cy + R / 2], [cx - K * R, cy - R / 2]
  ]
  return p.map(a => a[0].toFixed(2) + ',' + a[1].toFixed(2)).join(' ')
}

const hover = ref(null)

// 地图炮已占用的格子（相对坐标 → "q,r" 集合），带方向标记
const mcMap = computed(() => {
  const m = new Map()
  Object.entries(props.mcDirections || {}).forEach(([dir, list]) => {
    (list || []).forEach(c => m.set(`${c.q},${c.r}`, dir))
  })
  return m
})

function cellClass(c) {
  const rel = { q: c.q - ORIGIN.q, r: c.r - ORIGIN.r }
  const key = `${rel.q},${rel.r}`
  const cls = ['cell']

  // 地图炮占用
  if (props.mode === 'map_cannon' && mcMap.value.has(key)) {
    cls.push('mc-on')
    if (mcMap.value.get(key) === props.activeDir) cls.push('mc-active')
  }

  // AOE 中心 / 覆盖半径
  if (props.mode === 'aoe') {
    if (props.aoeCenter) {
      const d = hexDistance(ORIGIN.q + props.aoeCenter.q, ORIGIN.r + props.aoeCenter.r, c.q, c.r)
      const dd = hexDistance(ORIGIN.q + rel.q, ORIGIN.r + rel.r,
                             ORIGIN.q + props.aoeCenter.q, ORIGIN.r + props.aoeCenter.r)
      if (rel.q === props.aoeCenter.q && rel.r === props.aoeCenter.r) cls.push('aoe-center')
      else if (dd <= props.aoeSpread && dd > (props.aoeInner || 0)) cls.push('aoe-in')
      else if (dd <= (props.aoeInner || 0)) cls.push('aoe-blind')
    }
    // 可选落点范围（射程内）
    if (props.reachable) {
      const dc = hexDistance(ORIGIN.q, ORIGIN.r, c.q, c.r)
      if (dc <= props.rangeMax && dc > 0) cls.push('reachable')
    }
  }

  if (hover.value && hover.value.q === c.q && hover.value.r === c.r) cls.push('hover')
  return cls
}
</script>

<style scoped>
.hit-grid { width: 100%; height: auto; display: block; user-select: none; }

/* ---- 通用格 ---- */
.cell { fill: rgba(255,255,255,.03); stroke: rgba(255,255,255,.09); stroke-width: .6; cursor: pointer; }
.cell.hover { fill: rgba(255,255,255,.12); }
.caster { fill: rgba(255,255,255,.16); stroke: rgba(255,255,255,.5); stroke-width: 1.1; }
.caster-txt { font-size: 11px; text-anchor: middle; fill: rgba(255,255,255,.85); pointer-events: none; }

/* ---- 皮肤 A：棱柱宝石（琥珀金）---- */
.skin-prism .cell.reachable { fill: rgba(36,197,240,.10); stroke: rgba(36,197,240,.28); }
.skin-prism .cell.aoe-in    { fill: rgba(255,176,0,.42); stroke: rgba(255,214,120,.9); }
.skin-prism .cell.aoe-blind { fill: rgba(120,120,120,.30); stroke: rgba(180,180,180,.5); }
.skin-prism .cell.aoe-center{ fill: rgba(255,64,120,.85); stroke: #ffd597; stroke-width: 1.4; }
.skin-prism .cell.mc-on     { fill: rgba(255,176,0,.34); stroke: rgba(255,214,120,.7); }
.skin-prism .cell.mc-active { fill: rgba(255,176,0,.62); stroke: #fff3d0; stroke-width: 1.2; }

/* ---- 皮肤 B：战术蓝图（青蓝 + 等宽网格）---- */
.skin-blueprint .cell { stroke: rgba(54,197,240,.16); stroke-width: .5; }
.skin-blueprint .cell.reachable { fill: rgba(54,197,240,.08); stroke: rgba(54,197,240,.3); stroke-dasharray: 2 2; }
.skin-blueprint .cell.aoe-in    { fill: rgba(54,197,240,.38); stroke: #7fe7ff; stroke-width: 1; }
.skin-blueprint .cell.aoe-blind { fill: rgba(90,110,130,.35); stroke: rgba(160,180,200,.5); }
.skin-blueprint .cell.aoe-center{ fill: rgba(0,255,214,.75); stroke: #d6fffa; stroke-width: 1.4; }
.skin-blueprint .cell.mc-on     { fill: rgba(54,197,240,.3); stroke: #7fe7ff; }
.skin-blueprint .cell.mc-active { fill: rgba(54,197,240,.6); stroke: #eaffff; stroke-width: 1.2; }
.skin-blueprint .caster { fill: rgba(54,197,240,.2); stroke: #7fe7ff; }
</style>
