// 单位体型（体积）统一配置与换算 —— 前端镜像版
// 与 backend-gateway/src/unitSize.ts 保持内容一致。
// 体型档位：s < m < l < xl（索引 0..3，档差按索引差累加）

export const SIZE_ORDER = ['s', 'm', 'l', 'xl']
export const SIZE_RENDER_SCALE = { s: 0.82, m: 1.0, l: 1.22, xl: 1.5 }
export const SIZE_HP_FACTOR = { s: 0.9, m: 1.0, l: 1.05, xl: 1.10 }
export const SIZE_MOB_FACTOR = { s: 1.1, m: 1.0, l: 0.95, xl: 0.90 }
// 受击系数：受击时伤害结算的体型修正（越大挨打越疼），后台「体型工坊」可维护
export const SIZE_HIT_FACTOR = { s: 0.9, m: 1.0, l: 1.1, xl: 1.2 }
// 七视图固定绘制盒子（基础值，绘制时再 × BOX_ENLARGE=1.6）。每档尺寸锁定固定基础盒子，
// 消除"原图比例导致小尺寸反而更大"的问题，体型层级由尺寸档唯一决定。
export const SIZE_SEVEN_BOX = {
  s: { w: 44, h: 40 },
  m: { w: 54, h: 54 },
  l: { w: 66, h: 67 },
  xl: { w: 82, h: 83 },
}
export const SIZE_LABELS = { s: 'S', m: 'M', l: 'L', xl: 'XL' }

// —— 体型工坊热更新覆盖（localStorage 持久，刷新即生效，无需重新登录）——
const SIZE_OVERRIDE_KEY = 'mecha.size-config-override'
let _override = null
export function setSizeConfigOverride(cfg) {
  _override = cfg && typeof cfg === 'object' ? cfg : null
  try {
    if (_override) localStorage.setItem(SIZE_OVERRIDE_KEY, JSON.stringify(_override))
    else localStorage.removeItem(SIZE_OVERRIDE_KEY)
  } catch (e) { /* 忽略隐私模式写入失败 */ }
}
export function loadSizeConfigOverride() {
  try {
    const raw = localStorage.getItem(SIZE_OVERRIDE_KEY)
    if (raw) _override = JSON.parse(raw)
  } catch (e) { _override = null }
  _loaded = true
  return _override
}
let _loaded = false
// 惰性加载：避免在模块求值阶段（import 时）执行副作用，消除潜在的模块初始化 TDZ。
function ensureLoaded() {
  if (!_loaded) loadSizeConfigOverride()
}

const SIZE_ALIAS = {
  s: 's', small: 's', 小: 's',
  m: 'm', medium: 'm', 中: 'm',
  l: 'l', large: 'l', 大: 'l',
  xl: 'xl', xlarge: 'xl', 特大: 'xl', 超大: 'xl',
}

export function normSize(v) {
  const s = String(v == null ? '' : v).trim().toLowerCase()
  if (SIZE_ORDER.includes(s)) return s
  return SIZE_ALIAS[s] || 'm'
}

function applyFactor(base, factor) {
  const v = base * factor
  return factor >= 1 ? Math.ceil(v) : Math.floor(v)
}

export function applySizeHp(base, size) {
  return applyFactor(base, SIZE_HP_FACTOR[normSize(size)] ?? 1.0)
}

export function applySizeMobility(base, size) {
  return applyFactor(base, SIZE_MOB_FACTOR[normSize(size)] ?? 1.0)
}

export function sizeRenderScale(size) {
  ensureLoaded()
  const ov = _override && _override.renderScale
  if (ov && typeof ov === 'object' && typeof ov[normSize(size)] === 'number') return ov[normSize(size)]
  return SIZE_RENDER_SCALE[normSize(size)] ?? 1.0
}

/** 七视图固定盒子（基础值，不含 BOX_ENLARGE）。优先取覆盖配置。 */
export function sizeSevenBox(size) {
  ensureLoaded()
  const n = normSize(size)
  const ov = _override && _override.sevenBox
  const sBox = SIZE_SEVEN_BOX['s']
  if (ov && ov[n] && typeof ov[n].w === 'number' && typeof ov[n].h === 'number') {
    // 防护：覆盖值不得小于最小档(s)基准，否则会导致体型层级错乱（如 L<S）。
    // 常见于体型工坊误调或 localStorage 残留旧覆盖，此处自动回退默认，避免渲染异常。
    if (ov[n].w >= sBox.w && ov[n].h >= sBox.h) return { w: ov[n].w, h: ov[n].h }
  }
  return SIZE_SEVEN_BOX[n] || { w: 54, h: 54 }
}

/** 受击系数（体型挨打修正）。优先取覆盖配置。 */
export function sizeHitFactor(size) {
  ensureLoaded()
  const ov = _override && _override.hitFactor
  if (ov && typeof ov === 'object' && typeof ov[normSize(size)] === 'number') return ov[normSize(size)]
  return SIZE_HIT_FACTOR[normSize(size)] ?? 1.0
}

/** 序列化当前生效配置（供前端 SizeConfigView 初始化/回显）。 */
export function snapshotSizeConfig() {
  return {
    renderScale: { ...SIZE_RENDER_SCALE, ...((_override && _override.renderScale) || {}) },
    hpFactor: { ...SIZE_HP_FACTOR, ...((_override && _override.hpFactor) || {}) },
    mobFactor: { ...SIZE_MOB_FACTOR, ...((_override && _override.mobFactor) || {}) },
    hitFactor: { ...SIZE_HIT_FACTOR, ...((_override && _override.hitFactor) || {}) },
    sevenBox: {
      s: sizeSevenBox('s'), m: sizeSevenBox('m'), l: sizeSevenBox('l'), xl: sizeSevenBox('xl'),
    },
  }
}

export function sizeTierDiff(a, b) {
  const ai = SIZE_ORDER.indexOf(normSize(a))
  const bi = SIZE_ORDER.indexOf(normSize(b))
  if (ai < 0 || bi < 0) return 0
  return Math.abs(ai - bi)
}

export function sizeDefenseBonus(attackerSize, defenderSize) {
  const ai = SIZE_ORDER.indexOf(normSize(attackerSize))
  const di = SIZE_ORDER.indexOf(normSize(defenderSize))
  if (ai < 0 || di < 0) return 0
  return ai < di ? di - ai : 0
}

export function sizeMobilityBonus(attackerSize, defenderSize) {
  const ai = SIZE_ORDER.indexOf(normSize(attackerSize))
  const di = SIZE_ORDER.indexOf(normSize(defenderSize))
  if (ai < 0 || di < 0) return 0
  return ai > di ? ai - di : 0
}
