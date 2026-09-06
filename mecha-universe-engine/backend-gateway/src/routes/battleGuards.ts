// ============================================
// ★ B.7 Gateway 预注入校验器（难度 / H-Safe 数值护栏）
// 零依赖模块：在战斗 zygote 进入引擎前，对外部输入做合法化与钳制。
//   - difficulty：仅允许枚举 { easy, normal, hard, nightmare }，非法/缺失回退 'normal'
//   - 数值护栏（H-Safe）：对每个单位 currentStats 的有限数值钳制到 [0, 9999]，
//     倍率类字段(percent/rate/multiplier/modifier)钳制到 [0, 50]，
//     statusEffects[].value 同样钳制，阻断词链条目/快照造成的属性爆炸或负值穿透。
// ============================================
const HSAFE_DIFFICULTIES = ['easy', 'normal', 'hard', 'nightmare'] as const;
const HSAFE_VALUE_CAP = 9999;
const HSAFE_RATE_CAP = 50;

function clampNum(v: any, min: number, max: number): number | any {
  if (typeof v !== 'number' || !isFinite(v)) return v;
  return Math.min(max, Math.max(min, v));
}

function hSafeStats(stats: any): any {
  if (!stats || typeof stats !== 'object') return stats;
  const out: any = {};
  for (const [k, v] of Object.entries(stats)) {
    const isRate = /percent|rate|multiplier|modifier/i.test(k);
    out[k] = clampNum(v, 0, isRate ? HSAFE_RATE_CAP : HSAFE_VALUE_CAP);
  }
  return out;
}

function hSafeUnit(u: any): any {
  if (!u || typeof u !== 'object') return u;
  const cloned = { ...u };
  if (cloned.currentStats) cloned.currentStats = hSafeStats(cloned.currentStats);
  if (Array.isArray(cloned.statusEffects)) {
    cloned.statusEffects = cloned.statusEffects.map((e: any) =>
      e && typeof e === 'object' ? { ...e, value: clampNum(e.value, -HSAFE_RATE_CAP, HSAFE_VALUE_CAP) } : e
    );
  }
  return cloned;
}

export function preInjectBattleGuards(body: any): {
  difficulty: string; units: any[]; sanitized: boolean;
} {
  const raw = body || {};
  const difficulty = (HSAFE_DIFFICULTIES as readonly string[]).includes(raw.difficulty)
    ? raw.difficulty
    : 'normal';
  const units = Array.isArray(raw.units) ? raw.units.map(hSafeUnit) : [];
  return { difficulty, units, sanitized: difficulty !== raw.difficulty };
}
