// 单位体型（体积）统一配置与换算 —— 后端权威版
// 与 frontend/src/utils/unitSize.js 保持内容镜像，避免前后端机动/渲染缩放漂移。
//
// 体型档位：s < m < l < xl（索引 0..3，档差按索引差累加）
// 属性修正：
//   HP  —— s -10% / m 0 / l +5% / xl +10%；上调(增加)用 Math.ceil，下调(减少)用 Math.floor
//   机动 —— s +10% / m 0 / l -5% / xl -10%；同上
// 战斗：
//   被更小机体攻击 → 防守方每档 +1 防御减伤
//   被更大机体攻击 → 防守方每档 +1 机动增量（临时 Buff）

export const SIZE_ORDER = ['s', 'm', 'l', 'xl'] as const
export type UnitSize = typeof SIZE_ORDER[number]

// 渲染缩放（棋子外观），可调
export const SIZE_RENDER_SCALE: Record<string, number> = { s: 0.82, m: 1.0, l: 1.22, xl: 1.5 }

// HP 系数
export const SIZE_HP_FACTOR: Record<string, number> = { s: 0.9, m: 1.0, l: 1.05, xl: 1.10 }
// 机动系数
export const SIZE_MOB_FACTOR: Record<string, number> = { s: 1.1, m: 1.0, l: 0.95, xl: 0.90 }

export const SIZE_LABELS: Record<string, string> = { s: 'S', m: 'M', l: 'L', xl: 'XL' }

const SIZE_ALIAS: Record<string, string> = {
  s: 's', small: 's', 小: 's',
  m: 'm', medium: 'm', 中: 'm',
  l: 'l', large: 'l', 大: 'l',
  xl: 'xl', xlarge: 'xl', 特大: 'xl', 超大: 'xl',
}

export function normSize(v: any): string {
  const s = String(v == null ? '' : v).trim().toLowerCase()
  if ((SIZE_ORDER as readonly string[]).includes(s)) return s
  return SIZE_ALIAS[s] ?? 'm'
}

function applyFactor(base: number, factor: number): number {
  const v = base * factor
  // 上调(>=1)用 ceil；下调(<1)用 floor
  return factor >= 1 ? Math.ceil(v) : Math.floor(v)
}

export function applySizeHp(base: number, size: any): number {
  return applyFactor(base, SIZE_HP_FACTOR[normSize(size)] ?? 1.0)
}

export function applySizeMobility(base: number, size: any): number {
  return applyFactor(base, SIZE_MOB_FACTOR[normSize(size)] ?? 1.0)
}

export function sizeRenderScale(size: any): number {
  return SIZE_RENDER_SCALE[normSize(size)] ?? 1.0
}

// 索引档差（绝对差）
export function sizeTierDiff(a: any, b: any): number {
  const ai = SIZE_ORDER.indexOf(normSize(a) as UnitSize)
  const bi = SIZE_ORDER.indexOf(normSize(b) as UnitSize)
  if (ai < 0 || bi < 0) return 0
  return Math.abs(ai - bi)
}

// 被更小攻击者 → 防守方每档 +1 防御减伤
export function sizeDefenseBonus(attackerSize: any, defenderSize: any): number {
  const ai = SIZE_ORDER.indexOf(normSize(attackerSize) as UnitSize)
  const di = SIZE_ORDER.indexOf(normSize(defenderSize) as UnitSize)
  if (ai < 0 || di < 0) return 0
  return ai < di ? di - ai : 0
}

// 被更大攻击者 → 防守方每档 +1 机动增量
export function sizeMobilityBonus(attackerSize: any, defenderSize: any): number {
  const ai = SIZE_ORDER.indexOf(normSize(attackerSize) as UnitSize)
  const di = SIZE_ORDER.indexOf(normSize(defenderSize) as UnitSize)
  if (ai < 0 || di < 0) return 0
  return ai > di ? ai - di : 0
}
