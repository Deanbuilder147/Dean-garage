/**
 * @mecha/shared-kernel — hexMath（六边形网格数学真相源）
 *
 * 全栈唯一物理真相源：所有服务（map-service / combat-service / frontend / gateway）
 * 的六边形距离、邻居、范围枚举、坐标 Key 都必须取自本模块，禁止在各自包内
 * 另写副本（历史教训：曾存在 map-service.HexUtils.hexDistance、
 * skillExecutor._hexDistance、aiStrategies.hexDistance 三份同源副本分别维护，
 * 改一忘二即导致射程校验与寻路/AI 悄悄分叉）。
 *
 * 坐标系：Even-R Offset（尖顶，偶数行右移半格）
 *   - 列 q、行 r；r % 2 === 0 为偶数行，整体右移半格
 *   - 立方第三轴 s = -q - r（仅计算用，不存储）
 *
 * 本模块为纯函数、零外部依赖。编译产出：
 *   - dist/hexMath.js  (ESM，给 frontend / map-service / gateway 用)
 *   - dist/hexMath.cjs (CommonJS，给 combat-service 的 .cjs 核心用)
 */

import type { HexCoord } from './types.js';

/**
 * Even-R offset → axial 转换。
 * 坐标本质是偶行偏移(offset)，必须先转轴向再用立方距离，
 * 否则直接对 offset 套轴向公式会得到错误距离。
 */
function offsetToAxial(q: number, r: number): { q: number; r: number } {
  return { q: q - (r + (r & 1)) / 2, r };
}

/**
 * 六边形网格距离（Even-R offset → axial → cube 距离）。
 * 返回两格之间的最短 hex 步数。
 */
export function hexDistance(
  q1: number,
  r1: number,
  q2: number,
  r2: number,
): number {
  const a = offsetToAxial(q1, r1);
  const b = offsetToAxial(q2, r2);
  const dq = Math.abs(a.q - b.q);
  const dr = Math.abs(a.r - b.r);
  const ds = Math.abs(a.q + a.r - b.q - b.r);
  return Math.max(dq, dr, ds);
}

/**
 * 便捷重载：直接传坐标对象。
 */
export function hexDistanceCoord(a: HexCoord, b: HexCoord): number {
  return hexDistance(a.q, a.r, b.q, b.r);
}

/**
 * 获取某格的六个邻居（Even-R，奇偶行分支）。
 * 与前端 frontend/src/utils/hexUtils.js 的 getHexNeighbors 必须逐字节一致。
 */
export function getNeighbors(q: number, r: number): HexCoord[] {
  const dirs =
    r % 2 === 0
      ? [
          { q: 1, r: 0 },
          { q: 1, r: -1 },
          { q: 0, r: -1 },
          { q: -1, r: 0 },
          { q: 0, r: 1 },
          { q: 1, r: 1 },
        ]
      : [
          { q: 1, r: 0 },
          { q: 0, r: -1 },
          { q: -1, r: -1 },
          { q: -1, r: 0 },
          { q: -1, r: 1 },
          { q: 0, r: 1 },
        ];
  return dirs.map((d) => ({ q: q + d.q, r: r + d.r }));
}

/**
 * 枚举以 (centerQ, centerR) 为中心、半径 range 内的所有格（含中心）。
 * 基于 axial/cube 范围环（满足 |q|+|r|+|s| <= range 的六边形范围），
 * 与 hexDistance 同源，可直接用于「射程可达格枚举」「辐射范围 aoe_radius 枚举」。
 */
export function getHexesInRange(
  centerQ: number,
  centerR: number,
  range: number,
): HexCoord[] {
  const results: HexCoord[] = [];
  for (let q = -range; q <= range; q++) {
    for (
      let r = Math.max(-range, -q - range);
      r <= Math.min(range, -q + range);
      r++
    ) {
      results.push({ q: centerQ + q, r: centerR + r });
    }
  }
  return results;
}

/**
 * 坐标唯一 Key。前后端同构，禁止混用 `${q}_${r}`、反引号模板等写法，
 * 否则地形 Key 拼写漂移导致静默回退 'moon'。
 */
export function getHexKey(q: number, r: number): string {
  return q + ',' + r;
}

// ============================================================
// Phase 31-RangeNormalize：射程校验纯函数（三端共用真相源）
// ============================================================
// 历史问题：前端 getSkillRange+validTargets、网关 /skill 跳过校验、
// executeUniversalSkill 内部 hexDistance 校验 三套口径不一致，
// 反击/决斗经 executeUniversalSkill 内部路径会硬吃 out_of_range 静默失败。
// 现统一抽到此纯函数，三端共用，杜绝"前端能选后端打不出"。
//
// 设计约束：
//   - 不引入未实现的"地形射程修正"（height_bonus_per_diff 是伤害加成非射程加成）；
//     terrainContext 参数预留为可选扩展点，当前仅透传，不改变判定。
//   - 纯函数、零外部依赖，可被 frontend(ESM) / gateway(TS) / combat-core(CJS) 共用。

/**
 * 技能射程归一化字段（由各端的 _getUniversalFields / getSkillRange 产出）。
 */
export interface SkillRangeFields {
  /** 最小施放距离（含自身格时为 0） */
  minRange: number;
  /** 最大施放距离 */
  maxRange: number;
}

/**
 * 判定目标是否在技能射程内。
 *
 * @param sourceQ/sourceR 施放者坐标
 * @param targetQ/targetR 目标坐标
 * @param fields 归一化射程字段 { minRange, maxRange }
 * @param terrainContext 预留扩展点（地形射程修正等），当前未使用
 * @returns true=在射程内，false=越界（dist < minRange 或 dist > maxRange）
 */
export function isTargetInRange(
  sourceQ: number,
  sourceR: number,
  targetQ: number,
  targetR: number,
  fields: SkillRangeFields,
  _terrainContext?: unknown,
): boolean {
  const dist = hexDistance(sourceQ, sourceR, targetQ, targetR);
  return dist >= fields.minRange && dist <= fields.maxRange;
}

/**
 * 便捷重载：直接传坐标对象 + 归一化射程字段。
 */
export function isTargetInRangeCoord(
  source: HexCoord,
  target: HexCoord,
  fields: SkillRangeFields,
  terrainContext?: unknown,
): boolean {
  return isTargetInRange(source.q, source.r, target.q, target.r, fields, terrainContext);
}

// ============================================================
// ★ Phase 31-RangeNormalize 治本（三不原则真相源）
// 历史教训：DEFAULT_RANGE_BY_CATEGORY 曾散落在 4 处（前端 NewBattleView /
// 引擎 skillExecutor / 网关 normalizer / 网关 glossary），且数值互相打架
// （前端/引擎基础攻击=6，技能默认表=3），导致"远程到底是 3 还是 6"永远对不上。
// 现**唯一真相源**收敛于此：
//   - 各端（gateway / combat-core / 前端镜像）一律 import 本段，禁止本地再写副本。
//   - 远程唯一真相值 = 3（2026-08-02 终态裁定）。
//   - 数据源（normalizer / glossary）未配置射程时**必须保持 undefined**，
//     交由下游 _getUniversalFields / getSkillRange 经本表动态兜底，
//     绝不允许在数据源把 cast_range 写死成 1/3（否则下游兜底被废，陷阱1复发）。
// ============================================================

/**
 * ★ 技能分类 → 默认最大射程（唯一真相源）。
 * 类型仅三种：melee（近战，1）/ ranged（远程，3）/ auto（自动化/辅助，0=自身格）。
 * "爆炸/范围伤害"等不再作为类型，一律由技能【词条】设定（见 getSkillRangeFields 的词条优先）。
 * automation 仅是 auto 的录入别名（resolveSkillCategory 已归一为 auto），不在此占用条目。
 */
export const DEFAULT_RANGE_BY_CATEGORY: Record<string, number> = {
  melee: 1,
  ranged: 3, // ★ 唯一真相值（2026-08-02 裁定，曾误为 6 导致与技能表打架）
  auto: 0,
};

/**
 * ★ 技能分类 → 默认最小射程（唯一真相源）。
 * auto 允许自身格=0；近战排除自身=1；远程最小=1（可由词条下调到 0）。
 */
export const DEFAULT_MIN_RANGE_BY_CATEGORY: Record<string, number> = {
  melee: 1,
  ranged: 1,
  auto: 0,
};

/**
 * ★ 统一推导技能分类（唯一真相源，消灭字段脱节陷阱4）。
 * 兼容数据链路中各处写法：category / type('ranged'|'远程') / typeLabel('远程'|'自动化')
 * / attack_type[] / action_type[]。任何一端都只调本函数，杜绝因字段名不同而读 undefined 落 ??1。
 */
export function resolveSkillCategory(skill: {
  category?: string;
  type?: string;
  typeLabel?: string;
  attack_type?: string | string[];
  action_type?: string | string[];
} | null | undefined): string {
  if (!skill) return 'melee';
  const type = (skill.type || '').toString().toLowerCase();
  const typeLabel = (skill.typeLabel || '').toString().toLowerCase();
  if (type === 'ranged' || type === '远程' || typeLabel === '远程') return 'ranged';
  if (type === 'auto' || type === '自动化' || typeLabel === '自动化') return 'auto';
  const atList: string[] = [];
  const pushAt = (v: string | string[] | undefined) => {
    if (Array.isArray(v)) atList.push(...v);
    else if (typeof v === 'string') atList.push(v);
  };
  pushAt(skill.attack_type);
  pushAt(skill.action_type);
  if (atList.includes('ranged')) return 'ranged';
  if (atList.includes('auto') || atList.includes('automation') || atList.includes('support')) return 'auto';
  // 类型仅 melee/ranged/auto 三种；special/support 等非法/旧类型一律不承认，
  // 仅在 skill.category 命中合法三类型时采用，否则兜底 melee（绝不引入第四种）。
  if (skill.category === 'ranged' || skill.category === 'auto' || skill.category === 'melee') return skill.category;
  return 'melee';
}

/**
 * ★ 由技能对象推导归一化射程字段（唯一真相源，三端共用）。
 * 优先级：rawMax = cast_range ?? max_range ?? range_max ?? range（首个非空）；
 * rawMin = min_cast_range ?? min_range ?? range_min。
 * 均未配置时按分类经 DEFAULT_RANGE_BY_CATEGORY / DEFAULT_MIN_RANGE_BY_CATEGORY 兜底。
 * 数据源若未填（undefined）会正确落到分类兜底；若数据源写死错误值则会被采用——
 * 故数据源必须遵循"不写死"原则（见上）。
 */
export function getSkillRangeFields(skill: {
  category?: string;
  type?: string;
  typeLabel?: string;
  attack_type?: string | string[];
  action_type?: string | string[];
  bonus_range?: number | string;
  extra_range?: number | string;
} | null | undefined): SkillRangeFields {
  const cat = resolveSkillCategory(skill);
  const baseRange = DEFAULT_RANGE_BY_CATEGORY[cat];
  const baseMin = DEFAULT_MIN_RANGE_BY_CATEGORY[cat];
  if (!skill) return { minRange: baseMin, maxRange: baseRange };
  // ============================================================
  // ★ 射程计算模型（2026-08-03 用户裁定 · 严格收敛版）：
  //   range = 类型基准射程(DEFAULT_RANGE_BY_CATEGORY)  +  bonusRange
  //   1) 类型基准：近战=1 / 远程=3 / 自动化=0。
  //   2) bonusRange = Number(skill.bonus_range || skill.extra_range) || 0。
  //   ★★★ 彻底切断历史绝对射程字段：cast_range / range / max_range / range_max /
  //       rangeLabel / min_cast_range / min_range / range_min 一律【不再读取】。
  //       旧数据里 range:2 到底是"绝对 2 格"还是"加成 +2 格"存在语义歧义，
  //       继续兼容只会让远程(基准3)误算成 3+2=5，破坏算法；故彻底断开。
  //   3) 最小射程固定为类型基准(近战/远程=1, 自动化=0)；不再读任何历史 min 字段。
  // ============================================================
  const bonusRaw = (skill as any).bonus_range ?? (skill as any).extra_range;
  const bonusRange = Number(bonusRaw) || 0;
  const maxRange = baseRange + bonusRange;
  const minRange = baseMin;
  return { minRange, maxRange };
}
