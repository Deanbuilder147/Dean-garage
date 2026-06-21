// ============= 六角格公共工具模块 =============
// 供 BattlefieldView（地图编辑器）和 NewBattleView（战场指挥）共同使用
// 修改此文件即可同步影响所有使用六角格的页面

// ---- 六角格尺寸 ----
export const HEX_WIDTH = 64
export const HEX_HEIGHT = 72
export const HEX_APOTHEM = HEX_WIDTH / 2   // 边心距 = 32
export const HEX_RADIUS = HEX_HEIGHT / 2   // 外接圆半径 = 36

// ---- 默认格子间距参数（基准值，已校准） ----
export const DEFAULT_SPACING_H = 1.00   // 水平间距（尖顶 Even-R 自然间距）
export const DEFAULT_SPACING_V = 1.00   // 垂直间距（尖顶 Even-R 自然间距）
export const DEFAULT_OFFSET_FACTOR = 0.00  // 行偏移量（尖顶 Even-R 自动偏移，不再需要此参数）

// ---- 坐标系转换工具 ----

/** 数字列号转字母（0→A, 1→B, ..., 25→Z, 26→AA, ...） */
export function colToLetter(q) {
  let result = ''
  let n = q
  while (n >= 0) {
    result = String.fromCharCode(65 + (n % 26)) + result
    n = Math.floor(n / 26) - 1
  }
  return result
}

/** 字母转数字列号（A→0, B→1, ..., Z→25, AA→26, ...） */
export function letterToCol(str) {
  let result = 0
  for (let i = 0; i < str.length; i++) {
    result = result * 26 + (str.charCodeAt(i) - 64)
  }
  return result - 1
}

/** 格式化坐标标签：A1, B2, ... */
export function formatCoord(q, r) {
  return colToLetter(q) + String(r + 1)
}

/** 解析坐标字符串（如 "A1"）为 {q, r} */
export function parseCoord(coordStr) {
  const match = coordStr.trim().match(/^([A-Za-z]+)(\d+)$/)
  if (!match) return null
  return { q: letterToCol(match[1].toUpperCase()), r: parseInt(match[2]) - 1 }
}

/** 解析坐标范围（如 "A1:C5"） */
export function parseCoordRange(rangeStr) {
  const parts = rangeStr.split(':').map(s => s.trim())
  if (parts.length !== 2) return null
  const start = parseCoord(parts[0])
  const end = parseCoord(parts[1])
  if (!start || !end) return null
  return {
    minQ: Math.min(start.q, end.q),
    maxQ: Math.max(start.q, end.q),
    minR: Math.min(start.r, end.r),
    maxR: Math.max(start.r, end.r)
  }
}

// ---- 六角格数学 ----

/**
 * 坐标转像素（尖顶 Even-R Offset，统一使用 pointyTopCenter）
 * @deprecated 旧 odd-r 版本已废弃，现委托给 pointyTopCenter。
 *   如需运行时可变 spacing，请在调用侧自行包装。
 * @param {number} q - 列
 * @param {number} r - 行
 * @param {number} spacingH - 水平间距倍率 (默认 1.0)
 * @param {number} spacingV - 垂直间距倍率 (默认 1.0)
 * @param {number} offsetFactor - 偏移因子（Even-R 自动偏移，此参数忽略）
 * @returns {{ x: number, y: number }}
 */
export function hexToPixel(q, r, spacingH = 1, spacingV = 1, offsetFactor = 0) {
  const { flatX, flatY } = pointyTopCenter(q, r, HEX_RADIUS, spacingH, spacingV)
  return { x: flatX, y: flatY }
}

// ============= 等距伪 3D 坐标转换（逻辑与渲染分离） =============
// 核心原则：底层 2D 六边形立方坐标系（寻路、邻居查找）100% 不变
// 等距伪 3D 效果仅通过渲染层坐标映射和鼠标逆映射完成
//
// 数学框架（平顶 Flat-Top 六边形）：
//   flatX = size * 1.5 * q
//   flatY = size * sqrt(3) * (r + q / 2)
//   渲染：isoX = flatX + cameraX, isoY = (flatY * 0.5) + cameraY - heightOffset
//   逆变换：flatX = isoX - cameraX, flatY = (isoY - cameraY) / 0.5

/**
 * 平顶六边形：2D 俯视中心坐标
 * @param {number} q - 列坐标
 * @param {number} r - 行坐标
 * @param {number} size - 六边形外接圆半径 (HEX_RADIUS)
 * @returns {{ flatX: number, flatY: number }}
 */
export function flatTopCenter(q, r, size, spacingH = 1, spacingV = 1) {
  return {
    flatX: size * 1.5 * q * spacingH,
    flatY: size * Math.sqrt(3) * (r + q / 2) * spacingV
  }
}

/**
 * 尖顶六边形 Even-R Offset: 2D 俯视中心坐标
 * Even-R: 双数行整体向右错位半格 (r % 2 === 0)
 *   x = size * sqrt(3) * q     +  (r%2===0 ? size * sqrt(3) / 2 : 0)
 *   y = size * 1.5 * r                ← Even-R 刚性步长 (1.5*size 不可变)
 * @param {number} q - 列坐标
 * @param {number} r - 行坐标
 * @param {number} size - 六边形外接圆半径
 * @param {number} spacingH - 水平间距倍率
 * @param {number} spacingV - 垂直间距倍率
 * @returns {{ flatX: number, flatY: number }}
 */
export function pointyTopCenter(q, r, size, spacingH = 1, spacingV = 1) {
  let x = size * Math.sqrt(3) * q * spacingH
  if (r % 2 === 0) x += (size * Math.sqrt(3) / 2) * spacingH
  const y = size * 1.5 * r * spacingV
  return { flatX: x, flatY: y }
}

/**
 * 2D 平顶坐标 → 等距伪 3D 渲染坐标（2:1 纵向压扁 + 相机平移）
 * 在 canvas 绘制时调用，将逻辑坐标映射为屏幕像素坐标。
 * @param {number} flatX - 2D 平顶 X 坐标
 * @param {number} flatY - 2D 平顶 Y 坐标
 * @param {number} cameraX - 相机 X 偏移
 * @param {number} cameraY - 相机 Y 偏移
 * @param {number} heightOffset - 厚度/高度差偏移（向上移动）
 * @returns {{ isoX: number, isoY: number }}
 */
export function flatToIso(flatX, flatY, cameraX = 0, cameraY = 0, heightOffset = 0) {
  return {
    isoX: flatX + cameraX,
    isoY: (flatY * 0.5) + cameraY - heightOffset
  }
}

/**
 * 等距屏幕坐标 → 2D 平顶坐标（逆向还原，用于鼠标检测）
 * @param {number} isoX - 等距屏幕 X 坐标
 * @param {number} isoY - 等距屏幕 Y 坐标
 * @param {number} cameraX - 相机 X 偏移
 * @param {number} cameraY - 相机 Y 偏移
 * @returns {{ flatX: number, flatY: number }}
 */
export function isoToFlat(isoX, isoY, cameraX = 0, cameraY = 0) {
  return {
    flatX: isoX - cameraX,
    flatY: (isoY - cameraY) / 0.5  // = (isoY - cameraY) * 2
  }
}

/**
 * 六进制小数坐标四舍五入（Hex Rounding）
 * 将 (q, r, -q-r) 的小数分量各自四舍五入，最大误差分量重置为 -sum(另两个)
 */
function hexRound(qFrac, rFrac) {
  const sFrac = -qFrac - rFrac
  let q = Math.round(qFrac)
  let r = Math.round(rFrac)
  let s = Math.round(sFrac)
  const qDiff = Math.abs(q - qFrac)
  const rDiff = Math.abs(r - rFrac)
  const sDiff = Math.abs(s - sFrac)
  if (qDiff > rDiff && qDiff > sDiff) {
    q = -r - s
  } else if (rDiff > sDiff) {
    r = -q - s
  }
  return { q, r }
}

/**
 * 平顶像素坐标 → 六边形 (q, r)（含 Hex Rounding）
 * 逆推公式（从 flatX = size * 1.5 * q, flatY = size * sqrt(3) * (r + q/2) 解出）：
 *   q = (2/3) * flatX / size
 *   r = flatY / (size * sqrt(3)) - flatX / (3 * size)
 * @param {number} flatX - 2D 平顶 X 坐标
 * @param {number} flatY - 2D 平顶 Y 坐标
 * @param {number} size - 六边形外接圆半径
 * @returns {{ q: number, r: number }}
 */
export function flatTopToHex(flatX, flatY, size, spacingH = 1, spacingV = 1) {
  // Reverse spacing before hex math
  const x = flatX / spacingH
  const y = flatY / spacingV
  const qFrac = (2 / 3) * x / size
  const rFrac = (Math.sqrt(3) / 3) * y / size - (1 / 3) * x / size
  return hexRound(qFrac, rFrac)
}
/**
 * 尖顶 Even-R Offset: 像素坐标 → 六边形 (q, r)
 * 逆推:
 *   1) 先除间距: x = flatX/spacingH, y = flatY/spacingV
 *   2) r = round( y / (1.5 * size) )
 *   3) 若 r 为偶数则 x -= size * sqrt(3) / 2
 *   4) q = round( x / (size * sqrt(3)) )
 * @param {number} flatX
 * @param {number} flatY
 * @param {number} size - 六边形外接圆半径
 * @param {number} spacingH
 * @param {number} spacingV
 * @returns {{ q: number, r: number }}
 */
/**
 * 尖顶 Even-R Offset: 像素坐标 → 六边形 (q, r)
 * 逆推:
 *   1) r = round( flatY / (spacingV * 1.5 * size) )  ← 1.5*size Even-R 刚性步长
 *   2) 若 r 为偶数: flatX' = flatX - size * sqrt(3) / 2 * spacingH
 *   3) q = round( flatX' / (spacingH * size * sqrt(3)) )
 * @param {number} flatX
 * @param {number} flatY
 * @param {number} size - 六边形外接圆半径
 * @param {number} spacingH
 * @param {number} spacingV
 * @returns {{ q: number, r: number }}
 */
export function pointyTopToHex(flatX, flatY, size, spacingH = 1, spacingV = 1) {
  // 先消除间距缩放
  const x = flatX / spacingH
  const y = flatY / spacingV
  const rFrac = y / (1.5 * size)
  const r = Math.round(rFrac)
  const offset = (r % 2 === 0) ? (size * Math.sqrt(3) / 2) : 0
  const qFrac = (x - offset) / (size * Math.sqrt(3))
  const q = Math.round(qFrac)
  return { q, r }
}

/** 像素转坐标（统一使用 pointyTopToHex，数学逆推 + Hex Rounding）
 * @deprecated 旧遍历法已废弃，现委托给 pointyTopToHex。
 * @param {number} px - 世界像素 X
 * @param {number} py - 世界像素 Y
 * @param {number} spacingH - 水平间距倍率
 * @param {number} spacingV - 垂直间距倍率
 * @param {number} offsetFactor - 忽略（Even-R 自动偏移）
 * @param {number} gridWidth - 忽略（不再需要遍历）
 * @param {number} gridHeight - 忽略（不再需要遍历）
 * @returns {{ q: number, r: number }}
 */
export function pixelToHex(px, py, spacingH = 1, spacingV = 1, offsetFactor = 0, gridWidth = 0, gridHeight = 0) {
  return pointyTopToHex(px, py, HEX_RADIUS, spacingH, spacingV)
}

/**
 * 六边形偏移坐标邻居 (odd-r offset, 奇数行右侧偏移)
 */
export function getHexNeighbors(q, r) {
  // Even-R 偏移: 双数行向右错位半格
  if (r % 2 === 0) {
    return [
      { q: q + 1, r },
      { q: q + 1, r: r - 1 },
      { q, r: r - 1 },
      { q: q - 1, r },
      { q, r: r + 1 },
      { q: q + 1, r: r + 1 }
    ]
  } else {
    return [
      { q: q + 1, r },
      { q, r: r - 1 },
      { q: q - 1, r: r - 1 },
      { q: q - 1, r },
      { q: q - 1, r: r + 1 },
      { q, r: r + 1 }
    ]
  }
}

/**
 * 绘制六边形路径
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

// ---- 地形配色 ----
export const TERRAIN_COLORS = {
  space:       { name: '宇宙',     color: '#1a1a2e' },
  moon:        { name: '月面',     color: '#888888' },
  lunar:       { name: '月面',     color: '#888888' },
  empty:       { name: '月面',     color: '#888888' },
  fortress:    { name: '防御圈',   color: '#9c27b0' },
  base:        { name: '基地',     color: '#4caf50' },
  mothership:  { name: '母舰',     color: '#2196f3' },
  forest:      { name: '森林',     color: '#2e7d32' },
  desert:      { name: '沙漠',     color: '#c4a34a' },
  water:       { name: '水域',     color: '#03a9f4' },
  mountain:    { name: '山地',     color: '#9f8e78' },
  wall:        { name: '墙壁',     color: '#607d8b' },
  repair_station: { name: '维修站', color: '#ff9800' },
  spawn_earth:  { name: '出生(地)', color: '#13ff43' },
  spawn_maxion: { name: '出生(马)', color: '#ff4d4d' },
  spawn:        { name: '出生点',   color: '#ffb000' }
}

// ================================================================
//  UNIVERSAL_TERRAIN_MAP — 全项目唯一地形真理（16 种）
//  规则：TERRAIN_COLORS 提供颜色/名称，此处统一追加 cost
//  新增或修改地形时，只需改此处与 TERRAIN_COLORS 即可。
// ================================================================
export const UNIVERSAL_TERRAIN_MAP = {
  space:       { ...TERRAIN_COLORS.space, cost: 1 },
  moon:        { ...TERRAIN_COLORS.moon, cost: 1 },
  lunar:       { ...TERRAIN_COLORS.lunar, cost: 1 },
  empty:       { ...TERRAIN_COLORS.empty, cost: 1 },
  fortress:    { ...TERRAIN_COLORS.fortress, cost: 5 },
  base:        { ...TERRAIN_COLORS.base, cost: 1 },
  mothership:  { ...TERRAIN_COLORS.mothership, cost: 1 },
  forest:      { ...TERRAIN_COLORS.forest, cost: 2 },
  desert:      { ...TERRAIN_COLORS.desert, cost: 1.5 },
  water:       { ...TERRAIN_COLORS.water, cost: 2.5 },
  mountain:    { ...TERRAIN_COLORS.mountain, cost: 3 },
  wall:        { ...TERRAIN_COLORS.wall, cost: 99 },
  repair_station: { ...TERRAIN_COLORS.repair_station, cost: 1 },
  spawn_earth:  { ...TERRAIN_COLORS.spawn_earth, cost: 0 },
  spawn_maxion: { ...TERRAIN_COLORS.spawn_maxion, cost: 0 },
  spawn:        { ...TERRAIN_COLORS.spawn, cost: 0 }
}

/**
 * 纯静态格式转换器：在编辑器 {"q,r": id} 键值对与战场端数组之间无缝互转
 *
 * @param {Object|Array} data   输入数据
 * @param {string} direction
 *   'to-array':  {"q,r": id} → [{q, r, terrain: id}]
 *   'to-map':    [{q, r, terrain: id}] → {"q,r": id}
 * @returns {Object|Array}
 *
 * 示例:
 *   convertMapFormat({'0,0':'moon','1,2':'forest'}, 'to-array')
 *   // → [{q:0, r:0, terrain:'moon'}, {q:1, r:2, terrain:'forest'}]
 *
 *   convertMapFormat([{q:0,r:0,terrain:'moon'}], 'to-map')
 *   // → {'0,0': 'moon'}
 */
export function convertMapFormat(data, direction) {
  if (!data) return direction === 'to-array' ? [] : {}

  if (direction === 'to-array') {
    if (Array.isArray(data)) return data  // 已经是数组
    return Object.entries(data)
      .filter(([_, val]) => val !== undefined && val !== null)
      .map(([key, val]) => {
        const [qs, rs] = key.split(',')
        return { q: parseInt(qs, 10), r: parseInt(rs, 10), terrain: val }
      })
  }

  if (direction === 'to-map') {
    if (!Array.isArray(data)) return data  // 已经是 map
    const map = {}
    for (const cell of data) {
      if (cell && cell.q !== undefined && cell.r !== undefined) {
        map[cell.q + ',' + cell.r] = cell.terrain || 'moon'
      }
    }
    return map
  }

  throw new Error('convertMapFormat: unknown direction "' + direction + '", use "to-array" or "to-map"')
}

// ---- 单元格变形绘制 ----

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

// ---- 等距视角坐标转换 ----

/**
 * 将六角格中心坐标映射到屏幕像素（支持等距变换）
 * 变换链: scale(zoom) → translate(ox,oy) → shear/scale → rotate
 */
export function cellToScreen(hcx, hcy, params) {
  const { canvasW, canvasH, isoOn, shearX, shearY, scaleX, scaleY, rot, zoom, ox, oy } = params;
  const ccx = canvasW / 2;
  const ccy = canvasH / 2;
  let sx = hcx;
  let sy = hcy;

  if (isoOn) {
    // 1. zoom + offset
    sx = sx * zoom + ox;
    sy = sy * zoom + oy;
    // 2. shear matrix [scaleX, shearY, shearX, scaleY]
    const tsx = sx * scaleX + sy * shearX;
    const tsy = sx * shearY + sy * scaleY;
    sx = tsx; sy = tsy;
    // 3. rotate around canvas center
    if (rot !== 0) {
      const rd = rot * Math.PI / 180;
      const cos = Math.cos(rd);
      const sin = Math.sin(rd);
      const dx = sx - ccx;
      const dy = sy - ccy;
      sx = ccx + dx * cos - dy * sin;
      sy = ccy + dx * sin + dy * cos;
    }
  } else {
    sx = sx * zoom + ox;
    sy = sy * zoom + oy;
  }
  return { x: sx, y: sy };
}

/**
 * 屏幕像素 → 等距世界坐标（逆向变换）
 */
export function screenToWorld(px, py, params) {
  const { canvasW, canvasH, isoOn, shearX, shearY, scaleX, scaleY, rot, zoom, ox, oy } = params;
  let wx = px;
  let wy = py;

  if (isoOn) {
    // 1. undo rotation
    if (rot !== 0) {
      const ccx = canvasW / 2;
      const ccy = canvasH / 2;
      const rd = -rot * Math.PI / 180;
      const cos = Math.cos(rd);
      const sin = Math.sin(rd);
      const dx = wx - ccx;
      const dy = wy - ccy;
      wx = ccx + dx * cos - dy * sin;
      wy = ccy + dx * sin + dy * cos;
    }
    // 2. undo shear/scale
    const det = scaleX * scaleY - shearX * shearY;
    if (Math.abs(det) > 0.0001) {
      const rx = wx;
      const ry = wy;
      wx = (scaleY * rx - shearX * ry) / det;
      wy = (-shearY * rx + scaleX * ry) / det;
    }
  }
  // 3. undo offset and zoom
  wx = (wx - ox) / zoom;
  wy = (wy - oy) / zoom;
  return { x: wx, y: wy };
}

// --- 等距视角默认参数（已校准基准值，与 baseline 预设完全一致）---
// 校准值：shearX=0.25, shearY=0.44, scaleX=1.00, scaleY=0.39, rot=-24
// 单元=64×72, 顶角=25%, 底角=25%
export const ISO_DEFAULTS = {
  shearX: 0.25,    // 斜切X
  shearY: 0.44,    // 斜切Y（已校准）
  scaleX: 1.00,    // 缩放X
  scaleY: 0.39,    // 缩放Y（已校准）
  rotation: -24,   // 旋转°（已校准）
  topFlat: 0.25,   // 顶角扁平度 (0=尖, 0.5=全平)
  bottomFlat: 0.25 // 底角扁平度 (0=尖, 0.5=全平)
};

// ---- 等距视角预设 ----
export const ISO_PRESETS = {
  flat:     { shearX: 0.00, shearY: 0, scaleX: 1.00, scaleY: 1.00, rotation: 0 },
  light:    { shearX: 0.15, shearY: 0, scaleX: 1.00, scaleY: 0.85, rotation: 0 },
  medium:   { shearX: 0.25, shearY: 0, scaleX: 1.00, scaleY: 0.75, rotation: 0 },
  heavy:    { shearX: 0.40, shearY: 0, scaleX: 1.00, scaleY: 0.60, rotation: 0 },
  baseline: { shearX: 0.25, shearY: 0.44, scaleX: 1.00, scaleY: 0.39, rotation: -24, cellW: 64, cellH: 72, topFlat: 0.25, bottomFlat: 0.25, spacingH: 1.03, spacingV: 0.79, offsetFactor: 0.51 }
};



// =======================================================================
//   9-View Direction Enum — 2D 棋子 9 视图朝向系统 (Phase 2)
// =======================================================================

/** 9 视图方向常量 */
export const DIRECTIONS = Object.freeze({
  N:  0,
  NE: 1,
  E:  2,
  SE: 3,
  S:  4,
  SW: 5,
  W:  6,
  NW: 7,
  TOP: 8,
})

/** 方向标签映射 */
export const DIRECTION_LABELS = Object.freeze({
  0: 'N',  1: 'NE', 2: 'E',  3: 'SE',
  4: 'S',  5: 'SW', 6: 'W',  7: 'NW',
  8: 'TOP',
})

/** 方向总数 */
export const DIRECTION_COUNT = 9

/**
 * 根据六角格坐标增量自动计算朝向（角度量化法）
 *
 * 使用 atan2 将 (dq, dr) 映射到最近的 8 方向之一。
 * 8 扇区各 45°，角度从正东 (0°) 顺时针旋转（屏幕坐标系 Y 向下）。
 *
 *   扇区分布:
 *     0(N):  337.5°–22.5°   4(S):  157.5°–202.5°
 *     1(NE): 22.5°–67.5°    5(SW): 202.5°–247.5°
 *     2(E):  67.5°–112.5°   6(W):  247.5°–292.5°
 *     3(SE): 112.5°–157.5°  7(NW): 292.5°–337.5°
 *
 * @param {number} fromQ - 起始列
 * @param {number} fromR - 起始行
 * @param {number} toQ   - 目标列
 * @param {number} toR   - 目标行
 * @returns {number|null} direction (0-7)，同格返回 null
 */
export function computeDirection(fromQ, fromR, toQ, toR) {
  if (fromQ === toQ && fromR === toR) return null

  const dx = toQ - fromQ
  const dy = toR - fromR

  // atan2 返回弧度，转为度数。屏幕坐标系 Y 向下。
  let angle = Math.atan2(dy, dx) * (180 / Math.PI)
  if (angle < 0) angle += 360

  // 8 方向扇区量化 (每个扇区 45°)
  // 偏移 -22.5° 使扇区边界对齐:
  const adjusted = (angle + 22.5) % 360
  const octant = Math.floor(adjusted / 45) % 8
  return octant
}

/**
 * 严格邻格版本的 computeDirection（仅当 to 在 from 的 6 邻格内时返回方向）
 * 使用 hexUtils.getHexNeighbors 精确验证。
 *
 * @param {number} fromQ
 * @param {number} fromR
 * @param {number} toQ
 * @param {number} toR
 * @param {Function} getNeighborsFn - getHexNeighbors 函数引用
 * @returns {number|null} direction (0-7)，非邻格返回 null
 */
export function computeDirectionStrict(fromQ, fromR, toQ, toR, getNeighborsFn) {
  if (!getNeighborsFn) return computeDirection(fromQ, fromR, toQ, toR)

  const neighbors = getNeighborsFn(fromQ, fromR)
  const idx = neighbors.findIndex(n => n.q === toQ && n.r === toR)
  if (idx === -1) return null

  // getHexNeighbors 返回 [NE, E, SE, SW, W, NW] → 映射到方向码 [1,2,3,5,6,7]
  const NEIGHBOR_TO_DIRECTION = [1, 2, 3, 5, 6, 7]
  return NEIGHBOR_TO_DIRECTION[idx]
}
