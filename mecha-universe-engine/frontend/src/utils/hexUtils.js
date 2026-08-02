// ============= 六角格公共工具模块（纯数学 · 坐标/邻居/ISO 变换/地形表） =============
// 供 BattlefieldView（地图编辑器）和 NewBattleView（战场指挥）共同使用
// 修改此文件即可同步影响所有使用六角格的页面
//
// ⚠️ Canvas 绘制函数（drawHexPath / drawHexPathDeformed / drawIsoHexPath / drawIsoHexPathDeformed）
//    已迁至 hexDraw.js（阶段 1 · §3.1g）。本文件只保留"数学真理"，严禁在此新增绘制逻辑。

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

/**
 * A2 坐标 Key 唯一真相源（与后端 services/combat-service 的 hexKey.cjs 同构）。
 * 所有「地形/占用/友军」字典 Key 必须统一调用本函数，杜绝 `${q},${r}` 与 `${q}_${r}` 拼写漂移。
 */
export function getHexKey(q, r) {
  return q + ',' + r
}

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
 * ★ Phase 30-HexTruth：六边形网格距离（前端镜像真相源）。
 * 算法与 @mecha/shared-kernel/src/hexMath.ts 的 hexDistance 逐字一致——改一处须同步另一处。
 * Even-R offset → axial → cube 距离，返回两格最短 hex 步数。
 * 注意：坐标本质是偶行偏移(offset)，必须先转轴向再用立方距离，否则直接对 offset 套轴向公式会得错距。
 * @param {number} q1
 * @param {number} r1
 * @param {number} q2
 * @param {number} r2
 * @returns {number}
 */
export function hexDistance(q1, r1, q2, r2) {
  const offToAx = (q, r) => ({ q: q - (r + (r & 1)) / 2, r });
  const a = offToAx(q1, r1);
  const b = offToAx(q2, r2);
  const dq = Math.abs(a.q - b.q);
  const dr = Math.abs(a.r - b.r);
  const ds = Math.abs(a.q + a.r - b.q - b.r);
  return Math.max(dq, dr, ds);
}

/**
 * ★ Phase 30-HexTruth：枚举以 (centerQ, centerR) 为中心、半径 range 内的所有格（含中心）。
 * 前端镜像真相源，算法与 @mecha/shared-kernel/src/hexMath.ts 的 getHexesInRange 逐字一致。
 * 基于 axial/cube 范围环（满足 |q|+|r|+|s| <= range 的六边形范围），与 hexDistance 同源，
 * 用于「射程可达格枚举」「辐射范围 aoe_radius 枚举（高亮/圈定）」。
 * @param {number} centerQ
 * @param {number} centerR
 * @param {number} range
 * @returns {Array<{q:number, r:number}>}
 */
export function getHexesInRange(centerQ, centerR, range) {
  const results = [];
  for (let q = -range; q <= range; q++) {
    for (let r = Math.max(-range, -q - range); r <= Math.min(range, -q + range); r++) {
      results.push({ q: centerQ + q, r: centerR + r });
    }
  }
  return results;
}


/**
 * 平顶六边形邻居（Even-Q Offset）— 与 flatTopCenter / flatTopToHex 配套（阶段 1 · §3.1c）。
 * 平顶与尖顶的相邻关系不同；引擎在阶段 3 切换到平顶渲染时，
 * 所有"相邻格"逻辑（移动范围 / 命中 / 寻路）必须同步改用本函数。
 * 数学保证：flatTopToHex(flatTopCenter(neighbor)) === neighbor（axial round-trip 精确）。
 * @param {number} q
 * @param {number} r
 * @returns {Array<{q:number, r:number}>} 6 个相邻格
 */
export function getHexNeighborsFlatTop(q, r) {
  if (q % 2 === 0) {
    return [
      { q: q + 1, r },
      { q: q + 1, r: r - 1 },
      { q, r: r - 1 },
      { q: q - 1, r: r - 1 },
      { q: q - 1, r },
      { q, r: r + 1 }
    ]
  } else {
    return [
      { q: q + 1, r: r + 1 },
      { q: q + 1, r },
      { q, r: r - 1 },
      { q: q - 1, r },
      { q: q - 1, r: r + 1 },
      { q, r: r + 1 }
    ]
  }
}

// ⚠️ drawHexPath 已迁至 hexDraw.js（阶段 1 · §3.1g）。本模块仅保留纯数学。

// ---- 地形配色 ----
export const TERRAIN_COLORS = {
  space:       { name: '宇宙',     color: '#1a1a2e' },
  moon:        { name: '月面',     color: '#888888' },
  lunar:       { name: '月面',     color: '#888888' }, // 旧存档别名，等同 moon（修复主战场灰色格渲染）
  // ★ 留白地形：透明（引擎跳过绘制，露出画布背景）、移动消耗 999 不可通行。
  // 作为 100×100 画布对"画"之外的填充物，替代原 moon 填充。
  void:        { name: '留白',     color: 'rgba(120,140,180,0.06)' },
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
  spawn:        { name: '出生点',   color: '#ffb000' },
  // Phase 29-GlossaryMerge: 词条库复活地形（与 glossary-skill-config.json terrains 对齐）
  plain:        { name: '平原',     color: '#7a9b4f' },
  ruins:        { name: '废墟',     color: '#696969' },
  crystal:      { name: '晶矿',     color: '#7b68ee' },
  rubble:       { name: '残骸',     color: '#8b7d6b' },
  city_building:{ name: '城市建筑', color: '#b8860b' }
}

// ================================================================
//  UNIVERSAL_TERRAIN_MAP — 全项目唯一地形真理（20 种）
//  Phase 29-GlossaryMerge: +5 词条库复活地形 (plain/ruins/crystal/rubble/city_building)
//  规则：TERRAIN_COLORS 提供颜色/名称，此处统一追加 cost
//  新增或修改地形时，只需改此处与 TERRAIN_COLORS 即可。
//  注：lunar / empty 曾作为 moon 的重复项（同名"月面"），已从前端表移除；
//      旧存档若残留这两个 id，由 NewBattlefieldView.extractTerrainId 归一化为 moon。
// ================================================================
export const UNIVERSAL_TERRAIN_MAP = {
  space:       { ...TERRAIN_COLORS.space, cost: 1, height: 6 },
  moon:        { ...TERRAIN_COLORS.moon, cost: 1, height: 8 },
  lunar:       { ...TERRAIN_COLORS.lunar, cost: 1, height: 8 }, // 旧存档别名，等同 moon
  void:        { ...TERRAIN_COLORS.void, cost: 999, height: 0 }, // 留白：不可通行
  fortress:    { ...TERRAIN_COLORS.fortress, cost: 5, height: 16 },
  base:        { ...TERRAIN_COLORS.base, cost: 1, height: 8 },
  mothership:  { ...TERRAIN_COLORS.mothership, cost: 1, height: 10 },
  forest:      { ...TERRAIN_COLORS.forest, cost: 2, height: 10 },
  desert:      { ...TERRAIN_COLORS.desert, cost: 1.5, height: 6 },
  water:       { ...TERRAIN_COLORS.water, cost: 2.5, height: 0 },   // 贴地水面，不挤出
  mountain:    { ...TERRAIN_COLORS.mountain, cost: 3, height: 22 },
  wall:        { ...TERRAIN_COLORS.wall, cost: 99, height: 24 },
  repair_station: { ...TERRAIN_COLORS.repair_station, cost: 1, height: 8 },
  spawn_earth:  { ...TERRAIN_COLORS.spawn_earth, cost: 0, height: 6 },
  spawn_maxion: { ...TERRAIN_COLORS.spawn_maxion, cost: 0, height: 6 },
  spawn:        { ...TERRAIN_COLORS.spawn, cost: 0, height: 6 },
  // Phase 29-GlossaryMerge: 词条库复活地形 — 与 glossary-skill-config.json terrains 100% 对齐
  plain:        { ...TERRAIN_COLORS.plain, cost: 1, height: 8 },
  ruins:        { ...TERRAIN_COLORS.ruins, cost: 2, height: 10 },
  crystal:      { ...TERRAIN_COLORS.crystal, cost: 2, height: 12 },
  rubble:       { ...TERRAIN_COLORS.rubble, cost: 2, height: 6 },
  city_building:{ ...TERRAIN_COLORS.city_building, cost: 1, height: 14 }
}

/**
 * 方案A：将词条库(glossary) terrains 同步进前端地形表(UNIVERSAL_TERRAIN_MAP / TERRAIN_COLORS)。
 * glossary terrains 为单一真相源(S3)，前端调色板/着色据此派生。
 *  - 更新已有地形：name / color；cost 取 glossary.move_cost（缺省保留原 cost）
 *  - 新增地形（编辑器动态添加的）：自动加入，使画笔可调出
 *  - height 由前端静态表提供（glossary 无此字段），保留不覆盖
 *
 * @param {Object} terrains  glossary.config.terrains
 */
export function syncTerrainFromGlossary(terrains) {
  if (!terrains || typeof terrains !== 'object') return;
  for (const [id, def] of Object.entries(terrains)) {
    if (!def) continue;
    const color = def.color || (UNIVERSAL_TERRAIN_MAP[id] && UNIVERSAL_TERRAIN_MAP[id].color) || '#888888';
    const name = def.name || (UNIVERSAL_TERRAIN_MAP[id] && UNIVERSAL_TERRAIN_MAP[id].name) || id;
    const cost = typeof def.move_cost === 'number'
      ? def.move_cost
      : (UNIVERSAL_TERRAIN_MAP[id] ? UNIVERSAL_TERRAIN_MAP[id].cost : 1);
    if (!TERRAIN_COLORS[id]) {
      TERRAIN_COLORS[id] = { name, color };
    } else {
      TERRAIN_COLORS[id].name = name;
      TERRAIN_COLORS[id].color = color;
    }
    if (!UNIVERSAL_TERRAIN_MAP[id]) {
      UNIVERSAL_TERRAIN_MAP[id] = { name, color, cost, height: 0 };
    } else {
      UNIVERSAL_TERRAIN_MAP[id].name = name;
      UNIVERSAL_TERRAIN_MAP[id].color = color;
      UNIVERSAL_TERRAIN_MAP[id].cost = cost;
      if (UNIVERSAL_TERRAIN_MAP[id].height === undefined) UNIVERSAL_TERRAIN_MAP[id].height = 0;
    }
  }
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

// ⚠️ drawHexPathDeformed 已迁至 hexDraw.js（阶段 1 · §3.1g）。

// ---- 等距视角坐标转换 ----

/**
 * ISO 等距正向变换：2D 平面坐标 → ISO 屏幕坐标
 * CTM 等价: x' = x*scaleX + y*shearX,  y' = x*shearY + y*scaleY
 * @param {number} px 2D X
 * @param {number} py 2D Y
 * @param {{ shearX, shearY, scaleX, scaleY }} iso ISO 参数
 * @returns {{ x: number, y: number }}
 */
export function isoTransformPoint(px, py, iso) {
  return {
    x: px * iso.scaleX + py * iso.shearX,
    y: px * iso.shearY + py * iso.scaleY
  }
}

/**
 * ISO 等距逆向变换：ISO 屏幕坐标 → 2D 平面坐标
 * 2×2 仿射逆矩阵: det = scaleX*scaleY - shearX*shearY
 * @param {number} px ISO 屏幕 X
 * @param {number} py ISO 屏幕 Y
 * @param {{ shearX, shearY, scaleX, scaleY }} iso ISO 参数
 * @returns {{ x: number, y: number }}
 */
export function isoInverseTransformPoint(px, py, iso) {
  const det = iso.scaleX * iso.scaleY - iso.shearX * iso.shearY
  return {
    x: (px * iso.scaleY - iso.shearX * py) / det,
    y: (iso.scaleX * py - iso.shearY * px) / det
  }
}

// ⚠️ drawIsoHexPath / drawIsoHexPathDeformed 已迁至 hexDraw.js（阶段 1 · §3.1g）。
// 纯数学 isoTransformPoint / isoInverseTransformPoint 保留在下方（引擎与 hexDraw 共用）。

// ================================================================
//  旧版坐标变换（向后兼容，已在 Phase 30 中弃用）
// ================================================================

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
// 校准值：shearX=0.38, shearY=0, scaleX=1.00, scaleY=0.39, rot=-24
// 单元=64×72, 顶角=25%, 底角=25%
export const ISO_DEFAULTS = {
  shearX: 0.38,    // 斜切X
  shearY: 0,       // 斜切Y（默认0）
  scaleX: 1.00,    // 缩放X
  scaleY: 0.39,    // 缩放Y（已校准）
  rotation: -24,   // 旋转°（已校准）
  topFlat: 0.25,   // 顶角扁平度 (0=尖, 0.5=全平)
  bottomFlat: 0.25 // 底角扁平度 (0=尖, 0.5=全平)
};

// 平面视图配置（顶视，恒等变换）— 编辑器默认平面化用（阶段 2 · §3.1c）
// shearX/shearY/scaleX/scaleY/rotation/topFlat/bottomFlat 全 0/1 → drawIsoHexPath 退化为恒等，六边形呈顶视平面
export const PLANAR_CONFIG = {
  shearX: 0, shearY: 0, scaleX: 1, scaleY: 1, rotation: 0, topFlat: 0, bottomFlat: 0,
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
//   7-View Direction Enum — 2D 棋子 7 视图朝向系统 (Phase 28-D)
//   ⚠️ 已废弃旧 9 视图 (0-8) 体系，全量切换为 0-6 大一统引擎
// =======================================================================
//   编码契约:
//     0 = 默认正面特写（格纳库/整备室默认无位移状态）
//     1 = 正右（Pointy-Hex 顺时针起点）
//     2 = 右下   3 = 左下   4 = 正左   5 = 左上   6 = 右上
//
//   资产命名: {unitCode}_{0-6}_idle.png
//   运行时 Schema: unit.direction (int 0-6) + unit.actionState (str 'idle')
// =======================================================================

/** 7 视图方向常量 */
export const DIRECTIONS = Object.freeze({
  FRONT: 0,
  E:  1,   // 正右
  SE: 2,   // 右下
  SW: 3,   // 左下
  W:  4,   // 正左
  NW: 5,   // 左上
  NE: 6,   // 右上
})

/** 方向标签映射 */
export const DIRECTION_LABELS = Object.freeze({
  0: '正面',
  1: '正右',
  2: '右下',
  3: '左下',
  4: '正左',
  5: '左上',
  6: '右上',
})

/** 方向总数 */
export const DIRECTION_COUNT = 7

/**
 * 根据六角格坐标增量自动计算朝向（角度量化法 v2.0）
 *
 * 使用 atan2 将屏幕像素坐标差 (dx, dy) 映射到最近的 6 方向之一。
 * 6 扇区各 60°，角度从正东 (0°) 顺时针旋转（屏幕坐标系 Y 向下）。
 *
 *   扇区分布 (每个扇区 60°，中心偏移 +30°):
 *     1(正右): -30°– 30° (即 330°–30°)
 *     2(右下):  30°– 90°
 *     3(左下):  90°–150°
 *     4(正左): 150°–210°
 *     5(左上): 210°–270°
 *     6(右上): 270°–330°
 *
 *   绝杀 Even-R 奇偶行判定死锁：不使用固定 Delta 硬匹配，
 *   统一采用 atan2 角度量化，100% 准确、永不死锁。
 *
 * @param {number} fromQ - 起始列
 * @param {number} fromR - 起始行
 * @param {number} toQ   - 目标列
 * @param {number} toR   - 目标行
 * @returns {number|null} direction (1-6)，同格返回 null
 */
export function computeDirection(fromQ, fromR, toQ, toR) {
  if (fromQ === toQ && fromR === toR) return null

  const dx = toQ - fromQ
  const dy = toR - fromR

  // atan2 返回弧度，转为度数。屏幕坐标系 Y 向下。
  let angle = Math.atan2(dy, dx) * (180 / Math.PI)
  if (angle < 0) angle += 360

  // 6 扇区量化 (每个扇区 60°，偏移 +30° 使扇区边界对齐)
  // 公式: sector = floor((angle + 30) % 360 / 60)
  // direction = sector + 1 (输出 1-6)
  const sector = Math.floor(((angle + 30) % 360) / 60)
  return sector + 1
}

/**
 * 严格邻格版本的 computeDirection（仅当 to 在 from 的 6 邻格内时返回方向）
 *
 * 使用 getHexNeighbors 验证邻格关系（处理 Even-R 奇偶行偏移），
 * 然后通过 atan2 角度量化计算方向（避开奇偶行 Delta 歧义）。
 *
 * @param {number} fromQ
 * @param {number} fromR
 * @param {number} toQ
 * @param {number} toR
 * @param {Function} getNeighborsFn - getHexNeighbors 函数引用
 * @returns {number|null} direction (1-6)，非邻格返回 null
 */
export function computeDirectionStrict(fromQ, fromR, toQ, toR, getNeighborsFn) {
  if (fromQ === toQ && fromR === toR) return null

  // 邻格关系验证（处理 Even-R 奇偶行偏移）
  if (getNeighborsFn) {
    const neighbors = getNeighborsFn(fromQ, fromR)
    const isAdjacent = neighbors.some(n => n.q === toQ && n.r === toR)
    if (!isAdjacent) return null
  }

  // 统一使用 atan2 角度量化法计算方向（绝杀奇偶行 Delta 歧义）
  return computeDirection(fromQ, fromR, toQ, toR)
}

// ============= 联防 blockade_line 共享纯函数（前后端数学真理一致） =============
// D5 已拍板：「并列」= 严格立方共线（(q,r,s=-q-r) 轴向）。
// 仅当 >=3 同阵营单位严格共线，且移动方穿越其中两 blocker 之间的公共边时禁止该步。

/** 轴向(q,r) → 立方(x,y,z) */
export function axialToCube(q, r) {
  return { x: q, y: -q - r, z: r }
}

/** 两立方坐标是否同轴共线 */
export function areCubeCollinear(a, b) {
  return a.x === b.x || a.y === b.y || a.z === b.z
}

/** 取 >=3 同阵营严格共线且"连续无空挡"的直线集合 */
export function blockerLines(units) {
  const byFaction = {}
  for (const u of units) {
    if (!u || !u.position) continue
    const f = u.faction || 'neutral'
    ;(byFaction[f] = byFaction[f] || []).push(axialToCube(u.position.q, u.position.r))
  }
  const lines = []
  for (const f in byFaction) {
    const arr = byFaction[f]
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        if (!areCubeCollinear(arr[i], arr[j])) continue
        const line = arr.filter(c => areCubeCollinear(c, arr[i]) && areCubeCollinear(c, arr[j]))
        const sorted = line.slice().sort((a, b) => (a.x - b.x) || (a.y - b.y) || (a.z - b.z))
        let consecutive = sorted.length >= 3
        for (let k = 1; k < sorted.length; k++) {
          const d = Math.max(
            Math.abs(sorted[k].x - sorted[k - 1].x),
            Math.abs(sorted[k].y - sorted[k - 1].y),
            Math.abs(sorted[k].z - sorted[k - 1].z)
          )
          if (d !== 1) { consecutive = false; break }
        }
        if (consecutive) lines.push(sorted)
      }
    }
  }
  return lines
}

/** 线段 cur→next 在 cube 空间是否穿越两 consecutive blocker 之间的公共边（落在二者之间） */
function crossesBlockerSeam(cur, next, line) {
  const N = 8
  const ac = axialToCube(cur.q, cur.r)
  const bc = axialToCube(next.q, next.r)
  for (let i = 1; i < N; i++) {
    const t = i / N
    const px = ac.x + (bc.x - ac.x) * t
    const py = ac.y + (bc.y - ac.y) * t
    const pz = ac.z + (bc.z - ac.z) * t
    if (line.some(c => Math.abs(c.x - px) < 1e-6 && Math.abs(c.y - py) < 1e-6 && Math.abs(c.z - pz) < 1e-6)) {
      return false
    }
    for (let k = 1; k < line.length; k++) {
      const m = {
        x: (line[k].x + line[k - 1].x) / 2,
        y: (line[k].y + line[k - 1].y) / 2,
        z: (line[k].z + line[k - 1].z) / 2,
      }
      if (Math.abs(m.x - px) < 1e-6 && Math.abs(m.y - py) < 1e-6 && Math.abs(m.z - pz) < 1e-6) {
        return true
      }
    }
  }
  return false
}

/**
 * 严格共线联防边阻塞判定（前端寻路 BFS 与后端 tsFindPath 共用此规则）。
 * @param cur 移动起点 {q,r}
 * @param next 移动终点 {q,r}
 * @param units 全部单位（含 faction/position）
 * @returns Boolean 是否禁止该步
 */
export function isCollinearBlockade(cur, next, units) {
  if (!cur || !next || !Array.isArray(units)) return false
  const lines = blockerLines(units)
  for (const line of lines) {
    if (crossesBlockerSeam(cur, next, line)) return true
  }
  return false
}
