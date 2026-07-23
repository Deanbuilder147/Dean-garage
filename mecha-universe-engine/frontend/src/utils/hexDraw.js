// ============= 六角格绘制函数模块 =============
// 从 hexUtils.js 剥离的「纯 Canvas 绘制」函数（阶段 1 · §3.1g）。
//
// 宪法红线（与 hexUtils 解耦）：
// - 本模块只依赖 hexUtils 的纯数学常量 (HEX_RADIUS) 与 ISO 变换 (isoTransformPoint)
// - 不读取任何 Vue 状态 / Store / 业务数据
// - 坐标转换的"数学真理"仍在 hexUtils.js（pixelToHex / hexToPixel / flatTopCenter / flatTopToHex ...）
//   本模块仅负责把「已算好的 2D / ISO 顶点」画到 ctx 上
//
// 需求③ 的挤出绘制函数 drawIsoHexColumn 将在阶段 3 接入挤出渲染时定义于此，
// 遵循"绘制函数统一收敛到 hexDraw.js"的拆分约定。

import { HEX_RADIUS, HEX_WIDTH, HEX_HEIGHT, isoTransformPoint } from './hexUtils.js'

// ---- 基础六边形路径（尖顶，外接圆 HEX_RADIUS）----

/**
 * 绘制正六边形路径
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx 中心 X
 * @param {number} cy 中心 Y
 */
export function drawHexPath(ctx, cx, cy) {
  ctx.beginPath()
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 2
    const hx = cx + HEX_RADIUS * Math.cos(angle)
    const hy = cy + HEX_RADIUS * Math.sin(angle)
    if (i === 0) ctx.moveTo(hx, hy)
    else ctx.lineTo(hx, hy)
  }
  ctx.closePath()
}

// ---- 单元格变形绘制（支持顶角 / 底角扁平度）----

/**
 * 绘制可变形六边形路径（支持顶角/底角扁平度调整）
 * @param ctx Canvas 2D context
 * @param cx 中心 x
 * @param cy 中心 y
 * @param cellW 单元格宽度
 * @param cellH 单元格高度
 * @param topFlat 顶角扁平度 (0=尖顶, 0.5=全平)
 * @param bottomFlat 底角扁平度 (0=尖底, 0.5=全平)
 */
export function drawHexPathDeformed(ctx, cx, cy, cellW, cellH, topFlat, bottomFlat) {
  const hw = cellW / 2;
  const hh = cellH / 2;
  const sideTopY = cy - hh + topFlat * cellH;     // 顶侧角 Y (topFlat↑ → Y↓)
  const sideBotY = cy + hh - bottomFlat * cellH;  // 底侧角 Y (bottomFlat↑ → Y↑)
  ctx.beginPath();
  ctx.moveTo(cx, cy - hh);           // 顶点 (固定)
  ctx.lineTo(cx + hw, sideTopY);     // 右上 (Y 可调)
  ctx.lineTo(cx + hw, sideBotY);     // 右下 (Y 可调)
  ctx.lineTo(cx, cy + hh);           // 底点 (固定)
  ctx.lineTo(cx - hw, sideBotY);     // 左下 (Y 可调)
  ctx.lineTo(cx - hw, sideTopY);     // 左上 (Y 可调)
  ctx.closePath();
}

// ---- 等距视角绘制（逐顶点施加 ISO 仿射变换，无需 ctx.transform）----

/**
 * 绘制等距六边形路径（对 6 个顶点逐点施加 ISO 变换）
 * 在纯净 2D Canvas 上直接 lineTo，无需 ctx.transform
 * @param {CanvasRenderingContext2D} ctx Canvas 2D 上下文（必须为纯净 2D）
 * @param {number} cx 2D 中心 X
 * @param {number} cy 2D 中心 Y
 * @param {{ shearX, shearY, scaleX, scaleY }} iso ISO 参数
 */
export function drawIsoHexPath(ctx, cx, cy, iso) {
  ctx.beginPath()
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 2
    const hx = cx + HEX_RADIUS * Math.cos(angle)
    const hy = cy + HEX_RADIUS * Math.sin(angle)
    const pt = isoTransformPoint(hx, hy, iso)
    if (i === 0) ctx.moveTo(pt.x, pt.y)
    else ctx.lineTo(pt.x, pt.y)
  }
  ctx.closePath()
}

/**
 * 绘制等距扁六边形路径（顶角/底角扁平化 + ISO 逐顶点变换）
 * @param {CanvasRenderingContext2D} ctx Canvas 2D 上下文（必须为纯净 2D）
 * @param {number} cx 2D 中心 X
 * @param {number} cy 2D 中心 Y
 * @param {number} cellW 单元格宽度
 * @param {number} cellH 单元格高度
 * @param {number} topFlat 顶角扁平度 (0=尖顶, 0.5=全平)
 * @param {number} bottomFlat 底角扁平度 (0=尖底, 0.5=全平)
 * @param {{ shearX, shearY, scaleX, scaleY }} iso ISO 参数
 */
export function drawIsoHexPathDeformed(ctx, cx, cy, cellW, cellH, topFlat, bottomFlat, iso) {
  const hw = cellW / 2
  const hh = cellH / 2
  const sideTopY = cy - hh + topFlat * cellH
  const sideBotY = cy + hh - bottomFlat * cellH

  const vertices = [
    { x: cx, y: cy - hh },              // 顶点
    { x: cx + hw, y: sideTopY },        // 右上
    { x: cx + hw, y: sideBotY },        // 右下
    { x: cx, y: cy + hh },              // 底点
    { x: cx - hw, y: sideBotY },        // 左下
    { x: cx - hw, y: sideTopY }         // 左上
  ]

  ctx.beginPath()
  for (let i = 0; i < 6; i++) {
    const pt = isoTransformPoint(vertices[i].x, vertices[i].y, iso)
    if (i === 0) ctx.moveTo(pt.x, pt.y)
    else ctx.lineTo(pt.x, pt.y)
  }
  ctx.closePath()
}

// ================================================================
//  需求③ 路线 A — 等距挤出立柱（2.5D）
//  保持现有尖顶布局 + topFlat 压扁俯视机制（不切 flat-top 朝向坐标系统），
//  仅在此叠加"立柱"体积感。画家算法由调用方保证（r 升序→q 升序，远→近）。
// ================================================================

/** 把 #rgb / #rrggbb 颜色按系数 k 调暗 (k<1 变暗)，非 hex 原样返回 */
function shade(hexColor, k) {
  if (typeof hexColor !== 'string' || !hexColor.startsWith('#')) return hexColor
  let h = hexColor.slice(1)
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * k)))
  return `rgb(${f(r)},${f(g)},${f(b)})`
}

/** 顶面顶点（尖顶外接圆，与 drawIsoHexPath 一致） */
function isoHexTopVerts(cx, cy, iso) {
  const verts = []
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 2
    const hx = cx + HEX_RADIUS * Math.cos(angle)
    const hy = cy + HEX_RADIUS * Math.sin(angle)
    verts.push(isoTransformPoint(hx, hy, iso))
  }
  return verts
}

/** 顶面顶点（矩形压扁，随 topFlat/bottomFlat，与 drawIsoHexPathDeformed 一致） */
function isoHexTopVertsDeformed(cx, cy, iso) {
  const hw = HEX_WIDTH / 2
  const hh = HEX_HEIGHT / 2
  const topFlat = iso.topFlat || 0
  const bottomFlat = iso.bottomFlat || 0
  const sideTopY = cy - hh + topFlat * HEX_HEIGHT
  const sideBotY = cy + hh - bottomFlat * HEX_HEIGHT
  const raw = [
    { x: cx, y: cy - hh },        // 顶点
    { x: cx + hw, y: sideTopY },  // 右上
    { x: cx + hw, y: sideBotY },  // 右下
    { x: cx, y: cy + hh },        // 底点
    { x: cx - hw, y: sideBotY },  // 左下
    { x: cx - hw, y: sideTopY }   // 左上
  ]
  return raw.map(p => isoTransformPoint(p.x, p.y, iso))
}

/**
 * 绘制等距挤出立柱（需求③）
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx,cy 2D 中心
 * @param {{shearX,shearY,scaleX,scaleY,topFlat,bottomFlat}} iso
 * @param {number} height 立柱高度（屏幕深度像素）
 * @param {string} topColor 顶面纯色（侧面阴影计算 / 无材质回退）
 * @param {(string|CanvasPattern)} [topFill] 顶面填充（颜色或图案；默认=topColor，阶段5 接入材质）
 */
export function drawIsoHexColumn(ctx, cx, cy, iso, height, topColor, topFill) {
  const topVerts = (iso.topFlat > 0.01 || iso.bottomFlat > 0.01)
    ? isoHexTopVertsDeformed(cx, cy, iso)
    : isoHexTopVerts(cx, cy, iso)
  const dy = height * (iso.scaleY || 1)
  const botVerts = topVerts.map(p => ({ x: p.x, y: p.y + dy }))

  // 1) 侧面墙：仅下半可见边，双档明暗（右面更暗 0.38 / 左面较亮 0.55）
  for (let i = 0; i < 6; i++) {
    const a = topVerts[i]
    const b = topVerts[(i + 1) % 6]
    const c = botVerts[(i + 1) % 6]
    const d = botVerts[i]
    if (b.y > a.y) {
      ctx.beginPath()
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y)
      ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y)
      ctx.closePath()
      ctx.fillStyle = (b.x >= a.x) ? shade(topColor, 0.38) : shade(topColor, 0.55)
      ctx.fill()
    }
  }

  // 2) 顶面（填充 topFill，可图案；描浅色边与现有风格一致）
  ctx.beginPath()
  for (let i = 0; i < 6; i++) {
    const p = topVerts[i]
    if (i === 0) ctx.moveTo(p.x, p.y)
    else ctx.lineTo(p.x, p.y)
  }
  ctx.closePath()
  ctx.fillStyle = (topFill !== undefined) ? topFill : topColor
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.lineWidth = 0.5
  ctx.stroke()
}
