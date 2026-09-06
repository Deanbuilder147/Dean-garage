// 单位体型（体积）统一配置与换算 —— 前端镜像版
// 与 backend-gateway/src/unitSize.ts 保持内容一致。
// 体型档位：s < m < l < xl（索引 0..3，档差按索引差累加）

export const SIZE_ORDER = ['s', 'm', 'l', 'xl']
export const SIZE_RENDER_SCALE = { s: 0.82, m: 1.0, l: 1.22, xl: 1.5 }
export const SIZE_HP_FACTOR = { s: 0.9, m: 1.0, l: 1.05, xl: 1.10 }
export const SIZE_MOB_FACTOR = { s: 1.1, m: 1.0, l: 0.95, xl: 0.90 }
export const SIZE_LABELS = { s: 'S', m: 'M', l: 'L', xl: 'XL' }

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
  return SIZE_RENDER_SCALE[normSize(size)] ?? 1.0
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
