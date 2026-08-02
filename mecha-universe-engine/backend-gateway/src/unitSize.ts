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
// 受击系数：受击时伤害结算的体型修正（越大挨打越疼）。可调，后台「体型工坊」维护。
export const SIZE_HIT_FACTOR: Record<string, number> = { s: 0.9, m: 1.0, l: 1.1, xl: 1.2 }

// 七视图固定绘制盒子（基础值，绘制时再 × BOX_ENLARGE=1.6）。
// 用于消除"原图比例导致小尺寸反而更大"的问题：每档尺寸锁定固定基础盒子，
// 体型层级由尺寸档唯一决定，不再被原图宽高比窜改。后台「体型工坊」可覆盖。
export const SIZE_SEVEN_BOX: Record<string, { w: number; h: number }> = {
  s: { w: 44, h: 40 },
  m: { w: 54, h: 54 },
  l: { w: 66, h: 67 },
  xl: { w: 82, h: 83 },
}

export const SIZE_LABELS: Record<string, string> = { s: 'S', m: 'M', l: 'L', xl: 'XL' }

// 运行时配置覆盖（由 glossary.size 段热更新注入）。内存态，进程生命周期内有效。
let _override: any = null
export function applySizeConfigOverride(cfg: any): void {
  _override = cfg && typeof cfg === 'object' ? cfg : null
}
export function getSizeConfigOverride(): any {
  return _override
}

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
  const ov = _override?.renderScale
  if (ov && typeof ov === 'object' && typeof ov[normSize(size)] === 'number') {
    return ov[normSize(size)]
  }
  return SIZE_RENDER_SCALE[normSize(size)] ?? 1.0
}

/** 七视图固定盒子（基础值，不含 BOX_ENLARGE 放大）。优先取覆盖配置。 */
export function sizeSevenBox(size: any): { w: number; h: number } {
  const n = normSize(size)
  const ov = _override?.sevenBox
  const sBox = SIZE_SEVEN_BOX['s']
  if (ov && typeof ov === 'object' && ov[n] && typeof ov[n].w === 'number' && typeof ov[n].h === 'number') {
    // 防护：覆盖值不得小于最小档(s)基准，否则会导致体型层级错乱（如 L<S）。
    if (ov[n].w >= sBox.w && ov[n].h >= sBox.h) return { w: ov[n].w, h: ov[n].h }
  }
  return SIZE_SEVEN_BOX[n] ?? { w: 54, h: 54 }
}

/** 受击系数（体型挨打修正）。优先取覆盖配置。 */
export function sizeHitFactor(size: any): number {
  const ov = _override?.hitFactor
  if (ov && typeof ov === 'object' && typeof ov[normSize(size)] === 'number') {
    return ov[normSize(size)]
  }
  return SIZE_HIT_FACTOR[normSize(size)] ?? 1.0
}

/** 序列化当前生效配置（供后端 size-config 接口返回）。 */
export function snapshotSizeConfig(): any {
  return {
    renderScale: { ...SIZE_RENDER_SCALE, ...(_override?.renderScale || {}) },
    hpFactor: { ...SIZE_HP_FACTOR, ...(_override?.hpFactor || {}) },
    mobFactor: { ...SIZE_MOB_FACTOR, ...(_override?.mobFactor || {}) },
    hitFactor: { ...SIZE_HIT_FACTOR, ...(_override?.hitFactor || {}) },
    sevenBox: {
      s: sizeSevenBox('s'), m: sizeSevenBox('m'), l: sizeSevenBox('l'), xl: sizeSevenBox('xl'),
    },
  }
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
