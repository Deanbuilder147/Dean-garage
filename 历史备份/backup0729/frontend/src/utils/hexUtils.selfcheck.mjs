// ============= hexUtils / hexDraw 纯数学自检（headless） =============
// 运行：node mecha-universe-engine/frontend/src/utils/hexUtils.selfcheck.mjs
// 阶段 1 · §3.1 验收：锁定平顶几何数学 + 既有尖顶函数回归 + draw 函数迁移完整性。

import {
  HEX_RADIUS, HEX_WIDTH, HEX_HEIGHT,
  pointyTopCenter, pointyTopToHex,
  flatTopCenter, flatTopToHex,
  getHexNeighbors, getHexNeighborsFlatTop,
  isoTransformPoint, isoInverseTransformPoint,
  UNIVERSAL_TERRAIN_MAP, TERRAIN_COLORS,
} from './hexUtils.js'
import {
  drawHexPath, drawHexPathDeformed,
  drawIsoHexPath, drawIsoHexPathDeformed,
} from './hexDraw.js'

let failures = 0
function assert(cond, msg) {
  if (!cond) {
    failures++
    console.error('  ✗ FAIL: ' + msg)
  } else {
    console.log('  ✓ ' + msg)
  }
}
const eq = (a, b) => a.q === b.q && a.r === b.r

// ---- 1. flatTopCenter / flatTopToHex round-trip（平顶几何数学） ----
console.log('[1] flatTopCenter ↔ flatTopToHex round-trip')
let flatOk = true
for (let q = -4; q <= 4; q++) {
  for (let r = -4; r <= 4; r++) {
    const c = flatTopCenter(q, r, HEX_RADIUS)
    const back = flatTopToHex(c.flatX, c.flatY, HEX_RADIUS)
    if (!eq(back, { q, r })) { flatOk = false; console.error(`     mismatch (${q},${r}) -> (${back.q},${back.r})`) }
  }
}
assert(flatOk, 'all (q,r) in [-4,4]² round-trip exactly')

// ---- 2. pointyTopCenter / pointyTopToHex round-trip（尖顶回归，不可变） ----
console.log('[2] pointyTopCenter ↔ pointyTopToHex round-trip (regression)')
let pointyOk = true
for (let q = -4; q <= 4; q++) {
  for (let r = -4; r <= 4; r++) {
    const c = pointyTopCenter(q, r, HEX_RADIUS)
    const back = pointyTopToHex(c.flatX, c.flatY, HEX_RADIUS)
    if (!eq(back, { q, r })) { pointyOk = false; console.error(`     mismatch (${q},${r}) -> (${back.q},${back.r})`) }
  }
}
assert(pointyOk, 'all (q,r) in [-4,4]² round-trip exactly (尖顶未受影响)')

// ---- 3. getHexNeighbors 不变（回归） ----
console.log('[3] getHexNeighbors pointy Even-R 回归')
assert(JSON.stringify(getHexNeighbors(2, 3)) === JSON.stringify([
  { q: 3, r: 3 }, { q: 2, r: 2 }, { q: 1, r: 2 }, { q: 1, r: 3 }, { q: 1, r: 4 }, { q: 2, r: 4 },
]), 'getHexNeighbors(2,3) 回归值正确')
assert(JSON.stringify(getHexNeighbors(2, 2)) === JSON.stringify([
  { q: 3, r: 2 }, { q: 3, r: 1 }, { q: 2, r: 1 }, { q: 1, r: 2 }, { q: 2, r: 3 }, { q: 3, r: 3 },
]), 'getHexNeighbors(2,2) 回归值正确')

// ---- 4. getHexNeighborsFlatTop（平顶 Even-Q） ----
console.log('[4] getHexNeighborsFlatTop 平顶 Even-Q')
const wantEvenQ = [
  { q: 3, r: 3 }, { q: 3, r: 2 }, { q: 2, r: 2 }, { q: 1, r: 2 }, { q: 1, r: 3 }, { q: 2, r: 4 },
]
const wantOddQ = [
  { q: 4, r: 4 }, { q: 4, r: 3 }, { q: 3, r: 2 }, { q: 2, r: 3 }, { q: 2, r: 4 }, { q: 3, r: 4 },
]
assert(JSON.stringify(getHexNeighborsFlatTop(2, 3)) === JSON.stringify(wantEvenQ), 'getHexNeighborsFlatTop(2,3) even-q 表正确')
assert(JSON.stringify(getHexNeighborsFlatTop(3, 3)) === JSON.stringify(wantOddQ), 'getHexNeighborsFlatTop(3,3) odd-q 表正确')
// 每个邻居必可 round-trip 回自身（数学一致性）
let flatNbOk = true
for (const n of [...getHexNeighborsFlatTop(2, 3), ...getHexNeighborsFlatTop(3, 3)]) {
  const c = flatTopCenter(n.q, n.r, HEX_RADIUS)
  if (!eq(flatTopToHex(c.flatX, c.flatY, HEX_RADIUS), n)) flatNbOk = false
}
assert(flatNbOk, 'flat-top 邻居均能 round-trip 回自身')

// ---- 5. isoTransformPoint / isoInverseTransformPoint 互逆 ----
console.log('[5] isoTransformPoint ↔ isoInverseTransformPoint 互逆')
const iso = { shearX: 0.38, shearY: 0, scaleX: 1, scaleY: 0.39 }
let isoOk = true
for (let i = 0; i < 200; i++) {
  const px = Math.random() * 2000 - 1000
  const py = Math.random() * 2000 - 1000
  const fwd = isoTransformPoint(px, py, iso)
  const inv = isoInverseTransformPoint(fwd.x, fwd.y, iso)
  if (Math.abs(inv.x - px) > 1e-6 || Math.abs(inv.y - py) > 1e-6) { isoOk = false; break }
}
assert(isoOk, '200 随机点变换/逆变换误差 < 1e-6')

// ---- 6. hexDraw 4 函数已迁移且可调用（stub ctx） ----
console.log('[6] hexDraw 绘制函数迁移完整性')
function makeCtx() {
  const log = { beginPath: 0, closePath: 0, moveTo: 0, lineTo: 0 }
  return {
    log,
    beginPath() { log.beginPath++ },
    closePath() { log.closePath++ },
    moveTo() { log.moveTo++ },
    lineTo() { log.lineTo++ },
  }
}
let drawOk = true
try {
  const c1 = makeCtx(); drawHexPath(c1, 100, 100)
  drawOk = drawOk && c1.log.beginPath === 1 && c1.log.closePath === 1 && c1.log.moveTo === 1 && c1.log.lineTo === 5
  const c2 = makeCtx(); drawHexPathDeformed(c2, 100, 100, HEX_WIDTH, HEX_HEIGHT, 0.25, 0.25)
  drawOk = drawOk && c2.log.lineTo === 5
  const c3 = makeCtx(); drawIsoHexPath(c3, 100, 100, iso)
  drawOk = drawOk && c3.log.lineTo === 5
  const c4 = makeCtx(); drawIsoHexPathDeformed(c4, 100, 100, HEX_WIDTH, HEX_HEIGHT, 0.25, 0.25, iso)
  drawOk = drawOk && c4.log.lineTo === 5
} catch (e) {
  drawOk = false
  console.error('     throw: ' + e.message)
}
assert(drawOk, '4 个 draw 函数均从 hexDraw.js 正常导出并可执行（6 顶点路径）')

// ---- 7. 地形表完整性（副作用检查） ----
console.log('[7] 地形表完整性')
assert(typeof UNIVERSAL_TERRAIN_MAP === 'object' && Object.keys(UNIVERSAL_TERRAIN_MAP).length >= 20, 'UNIVERSAL_TERRAIN_MAP 含 ≥20 种地形')
assert(typeof TERRAIN_COLORS === 'object', 'TERRAIN_COLORS 存在')

// 7b. 需求③ height 字段（§3.1d）
assert(UNIVERSAL_TERRAIN_MAP.mountain.height === 22, 'mountain.height = 22')
assert(UNIVERSAL_TERRAIN_MAP.water.height === 0, 'water.height = 0（贴地不挤出）')
assert(UNIVERSAL_TERRAIN_MAP.plain.height === 8, 'plain.height = 8')
const heightsOk = Object.values(UNIVERSAL_TERRAIN_MAP).every(t => typeof t.height === 'number' && t.height >= 0)
assert(heightsOk, '每种地形均有非负数值 height 字段')

console.log('')
if (failures === 0) {
  console.log('✅ 全部自检通过（' + 'hexUtils 纯数学 + hexDraw 迁移）')
  process.exit(0)
} else {
  console.error('❌ ' + failures + ' 项自检失败')
  process.exit(1)
}
