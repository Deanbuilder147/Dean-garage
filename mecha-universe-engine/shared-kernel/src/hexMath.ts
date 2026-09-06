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
// 战场模拟 AOE 命中格推导（2026-08-11 /glossary-studio 重构 Phase 1-1）
// 解决 #2「选取点受射程限、作用范围可超射程」：
//   以 targetCoord 为原点展开作用范围，半径独立于 maxRange（不受射程约束）。
// 复用 hexDistance / getHexesInRange / getHexKey，纯函数、零副作用。
// ============================================================

/**
 * AOE 形状描述（相对原点 targetCoord 的表达，或地图炮六向补全）。
 * - handDrawn : 用户在 AOE 视图手绘的阴影，cells 为相对 targetCoord 的偏移 {dq,dr} 列表
 * - radius    : 以 targetCoord 为原点、半径 radius 的六边形全覆盖（半径独立 maxRange）
 * - mapcannon : 地图炮六向补全，baseShadowEast 为正右基准阴影偏移列表，
 *               dir 为顺时针旋转步数（0=正右，每步 60°，与 DIRECTIONS/computeDirection 对齐）
 */
export type AoeShape =
  | { kind: 'handDrawn'; cells: Array<{ dq: number; dr: number }> }
  | { kind: 'radius'; radius: number }
  | { kind: 'mapcannon'; baseShadowEast: Array<{ dq: number; dr: number }>; dir: number };

/**
 * 计算 AOE 最终命中的六角格集合（绝对坐标）。
 * @param casterCoord 施法者坐标（用于校验目标点是否在射程内，由调用方决定，本函数不强制）
 * @param targetCoord AOE 原点（玩家在射程环带内点的目标格）
 * @param aoeShape    AOE 形状（见 AoeShape）
 * @returns 命中格绝对坐标数组（已去重）
 */
export function computeAOECells(
  casterCoord: HexCoord,
  targetCoord: HexCoord,
  aoeShape: AoeShape,
): HexCoord[] {
  const tQ = targetCoord.q;
  const tR = targetCoord.r;
  let rel: Array<{ dq: number; dr: number }> = [];

  if (aoeShape.kind === 'radius') {
    // 等价于以 targetCoord 为圆心的六边形范围（半径独立于 maxRange）
    return getHexesInRange(tQ, tR, aoeShape.radius);
  } else if (aoeShape.kind === 'handDrawn') {
    rel = aoeShape.cells || [];
  } else {
    // mapcannon：以正右基准阴影 rotate(dir * 60°) 顺时针补全
    rel = rotateShadowEast(aoeShape.baseShadowEast || [], aoeShape.dir || 0);
  }

  const seen = new Set<string>();
  const out: HexCoord[] = [];
  for (const off of rel) {
    const q = tQ + (off.dq || 0);
    const r = tR + (off.dr || 0);
    const key = getHexKey(q, r);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ q, r });
  }
  return out;
}

/**
 * 地图炮阴影旋转：以正右(dir=0)基准阴影，顺时针按 60°×dir 步长旋转。
 * 在 Even-R offset 坐标系中，顺时针旋转等价于对偏移做旋转矩阵变换。
 * 简化实现：以 targetCoord 为中心，把每个相对偏移 (dq,dr) 绕原点旋转 60°×dir。
 * 采用 axial 旋转（旋转 60° 的 cube 坐标循环变换），再转回 offset。
 */
export function rotateShadowEast(
  baseShadowEast: Array<{ dq: number; dr: number }>,
  dir: number,
): Array<{ dq: number; dr: number }> {
  const steps = ((dir % 6) + 6) % 6;
  return baseShadowEast.map(({ dq, dr }) => {
    // offset → axial
    const ax = dq - (dr + (dr & 1)) / 2;
    const ar = dr;
    // cube
    let cq = ax;
    let cr = ar;
    let cs = -ax - ar;
    // 每步 60° 顺时针旋转：(q,r,s) → (-s,-q,-r) 是逆时针；顺时针用 (r,s,q)
    for (let i = 0; i < steps; i++) {
      const nq = -cs;
      const nr = -cq;
      const ns = -cr;
      cq = nq;
      cr = nr;
      cs = ns;
    }
    // cube → axial → offset
    const offQ = cq + (cr + (cr & 1)) / 2;
    const offR = cr;
    return { dq: offQ, dr: offR };
  });
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
 * 最大射程 = BASE_RANGE_BY_CATEGORY[category] + (Number(bonus_range)||0)
 * 最小射程 = 配置了 min_range 则优先使用，否则 DEFAULT_MIN_RANGE_BY_CATEGORY[category]
 * ★ 裁定 6.1 红线：严禁读取 cast_range / range / max_range / range_max / rangeLabel 等绝对射程字段。
 *   min_range 与 bonus_range 是合法的相对射程字段（最小/最大加成），予以保留。
 */
export function getSkillRangeFields(
  skill: {
    category?: string;
    type?: string;
    typeLabel?: string;
    attack_type?: string | string[];
    action_type?: string | string[];
    bonus_range?: number | string;
    extra_range?: number | string;
    min_range?: number | string;
  } | null | undefined,
  // ★ 隐患 7.3 预留：施法者状态/环境对射程的动态叠加（如被动+1、迷雾-1）。当前传 null 即可。
  casterContext?: { passiveBonusRange?: number; envModifier?: number } | null,
): SkillRangeFields {
  const cat = resolveSkillCategory(skill);
  const baseRange = DEFAULT_RANGE_BY_CATEGORY[cat];
  const baseMin = DEFAULT_MIN_RANGE_BY_CATEGORY[cat];
  if (!skill) return { minRange: baseMin, maxRange: baseRange };
  // ============================================================
  // ★ 射程加法模型（裁定 6.1）：
  //   maxRange = 类型基准射程(DEFAULT_RANGE_BY_CATEGORY) + bonusRange
  //   1) 类型基准：近战=1 / 远程=3 / 自动化=0。
  //   2) bonusRange = Number(skill.bonus_range || skill.extra_range) || 0。
  //   ★ 彻底切断历史绝对射程字段：cast_range / range / max_range / range_max / rangeLabel，一律不读取。
  //   3) 最小射程：配置了 min_range 则优先采用，否则用分类基准 baseMin（近战/远程=1, auto=0）。
  //      min_range 是合法相对字段（表达 3~6 格狙击等盲区），非被废除的绝对字段。
  //   4) 动态叠加（隐患 7.3 预留）：casterContext.passiveBonusRange / envModifier 加进 maxRange。
  // ============================================================
  const bonusRaw = (skill as any).bonus_range ?? (skill as any).extra_range;
  let bonusRange = Number(bonusRaw) || 0;
  const ctx = casterContext || (skill as any).__casterContext;
  if (ctx) {
    bonusRange += (Number((ctx as any).passiveBonusRange) || 0) + (Number((ctx as any).envModifier) || 0);
  }
  const maxRange = baseRange + bonusRange;
  const minRaw = (skill as any).min_range;
  const minRange = (minRaw != null) ? (Number(minRaw) || 0) : baseMin;
  return { minRange, maxRange };
}

// ============================================================
// ★ I-6：视线阻挡（LoS）几何真相源（服务端权威）
// 消费 TerrainCellContract.elevation / blocks_sight（注意非 height）。
// ============================================================

/** cube round：把小数 cube 坐标四舍五入到最近整数格（保证 q+r+s===0） */
function cubeRound(x: number, y: number, z: number): { q: number; r: number; s: number } {
  let rx = Math.round(x);
  let ry = Math.round(y);
  let rz = Math.round(z);
  const dx = Math.abs(rx - x);
  const dy = Math.abs(ry - y);
  const dz = Math.abs(rz - z);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;
  return { q: rx, r: ry, s: rz };
}

/** axial → offset（Even-R）反变换 */
function axialToOffset(q: number, r: number): { q: number; r: number } {
  return { q: q + (r + (r & 1)) / 2, r };
}

/**
 * 六角格直线插值（cube lerp + cube round）。
 * 返回从 from 到 to（含两端）的直线经过的所有格的 offset 坐标序列。
 * 与前端 frontend/src/utils/hexUtils.js 的 hexLineDraw 必须逐字节一致。
 */
export function hexLineDraw(
  fromQ: number, fromR: number,
  toQ: number, toR: number,
): { q: number; r: number }[] {
  const a = offsetToAxial(fromQ, fromR);
  const b = offsetToAxial(toQ, toR);
  const aCube = { q: a.q, r: a.r, s: -a.q - a.r };
  const bCube = { q: b.q, r: b.r, s: -b.q - b.r };
  const n = hexDistance(fromQ, fromR, toQ, toR);
  if (n === 0) return [{ q: fromQ, r: fromR }];
  const result: { q: number; r: number }[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const c = cubeRound(
      aCube.q + (bCube.q - aCube.q) * t,
      aCube.r + (bCube.r - aCube.r) * t,
      aCube.s + (bCube.s - aCube.s) * t,
    );
    const off = axialToOffset(c.q, c.r);
    result.push(off);
  }
  return result;
}

/** LoS 容差：中间格高程低于观察者视线高程多少以内仍视为不阻挡（俯瞰裕度） */
export const LOS_TOLERANCE = 1;

/**
 * 服务端权威视线判定。
 * @param fromQ/fromR 观察者坐标；toQ/toR 目标坐标
 * @param grid Map<getHexKey, { elevation:number, blocks_sight:boolean }>
 * @param opts.sightRange 观察者 sightRange（单位属性），超出即不可见
 * @param opts.viewerEye 观察者所在格高程（默认取 grid 中该格 elevation）
 * @returns true=视线可达（可见），false=被阻挡（不可见）
 */
export function computeLoS(
  fromQ: number, fromR: number,
  toQ: number, toR: number,
  grid: Map<string, { elevation: number; blocks_sight: boolean }>,
  opts: { sightRange?: number; viewerEye?: number } = {},
): boolean {
  const dist = hexDistance(fromQ, fromR, toQ, toR);
  if (opts.sightRange != null && dist > opts.sightRange) return false;
  const line = hexLineDraw(fromQ, fromR, toQ, toR);
  const viewerEye = opts.viewerEye ?? grid.get(getHexKey(fromQ, fromR))?.elevation ?? 0;
  // 逐格检查（跳过起点与终点本身）
  for (let i = 1; i < line.length - 1; i++) {
    const cell = grid.get(getHexKey(line[i].q, line[i].r));
    if (!cell) continue;
    if (cell.blocks_sight) return false;
    // 高程阻挡：中间格明显高出观察者视线（超过容差）则遮断俯瞰
    if (cell.elevation - viewerEye > LOS_TOLERANCE) return false;
  }
  return true;
}
