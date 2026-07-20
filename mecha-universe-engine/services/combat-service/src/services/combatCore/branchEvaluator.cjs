'use strict';
/**
 * branchEvaluator.cjs — 通用投骰多分支解析器（方案 Step 4 核心）
 *
 * 设计目标：彻底废弃硬编码分支判断（如历史 sniper/counter 写死常量），
 * 由配置中的 dice_branches 驱动：
 *   - 词条 has_dice=true 时，按 dice_type 掷出 roll；
 *   - 遍历所有 dice_branches，命中「点数集合 points」的判定分支全部收集；
 *   - 按 6 项核心动作词（damage/damage_bonus/heal/apply_status/mobility_mod/accuracy_mod）
 *     严格顺序执行每个命中分支下的全部《判定效果》。
 *
 * points 支持：离散点数 number（如 2）、区间 [min,max]、或二者数组并存。
 * 命中规则：roll 命中任一 points 条目即视为该分支命中（多分支可同时命中）。
 */

function rollDice(diceType = 6) {
  const faces = Number(diceType) > 0 ? Number(diceType) : 6;
  return Math.floor(Math.random() * faces) + 1;
}

// 单个点数条目是否命中 roll：number 精确 / [min,max] 区间
function pointMatches(point, roll) {
  if (point == null) return false;
  if (typeof point === 'number') return point === roll;
  if (Array.isArray(point)) {
    const min = Math.min(point[0], point[1]);
    const max = Math.max(point[0], point[1]);
    return roll >= min && roll <= max;
  }
  if (typeof point === 'object') {
    if (point.kind === 'range') {
      const min = Math.min(point.min, point.max);
      const max = Math.max(point.min, point.max);
      return roll >= min && roll <= max;
    }
    if (point.kind === 'exact') return point.value === roll;
  }
  return false;
}

// 分支是否命中（points 任一命中即命中）
function branchMatches(branch, roll) {
  const points = Array.isArray(branch.points) ? branch.points : [];
  return points.some((p) => pointMatches(p, roll));
}

/**
 * 遍历 dice_branches，返回所有命中分支（保持顺序）。
 * @returns Array<{ branchIndex, points, effects }>
 */
function evaluateBranches(diceBranches, roll) {
  if (!Array.isArray(diceBranches)) return [];
  const hits = [];
  diceBranches.forEach((b, i) => {
    if (b && branchMatches(b, roll)) {
      hits.push({
        branchIndex: i,
        points: b.points,
        effects: Array.isArray(b.effects) ? b.effects : []
      });
    }
  });
  return hits;
}

// 创建效果累加上下文
function newEffectContext(base = {}) {
  return Object.assign(
    {
      damage: 0, // 直伤（设定，覆盖）
      bonus: 0, // 追加伤害（累加）
      heal: 0, // 治疗
      accuracyMod: 0, // 命中修正
      mobilityMod: 0, // 机动修正
      statuses: [], // 收集 { status, target }
      log: []
    },
    base
  );
}

/**
 * 按 6 项动作词顺序执行 effects，累加进 ctx。
 * effect: { action, value, status?, target? }
 */
function applyBranchEffects(effects, ctx) {
  if (!Array.isArray(effects) || !ctx) return ctx;
  for (const e of effects) {
    if (!e) continue;
    const v = Number(e.value) || 0;
    switch (e.action) {
      case 'damage':
        ctx.damage = v; // 设定（覆盖）
        ctx.log.push(`直伤=${v}`);
        break;
      case 'damage_bonus':
        ctx.bonus += v;
        ctx.log.push(`追加伤害+${v}`);
        break;
      case 'heal':
        ctx.heal += v;
        ctx.log.push(`治疗+${v}`);
        break;
      case 'apply_status':
        ctx.statuses.push({ status: e.status || e.value, target: e.target || 'enemy' });
        ctx.log.push(`施加状态=${e.status || e.value}`);
        break;
      case 'mobility_mod':
        ctx.mobilityMod += v;
        ctx.log.push(`机动修正${v >= 0 ? '+' : ''}${v}`);
        break;
      case 'accuracy_mod':
        ctx.accuracyMod += v;
        ctx.log.push(`命中修正${v >= 0 ? '+' : ''}${v}`);
        break;
      default:
        ctx.log.push(`未知动作=${e.action}`);
    }
  }
  return ctx;
}

module.exports = {
  rollDice,
  pointMatches,
  branchMatches,
  evaluateBranches,
  newEffectContext,
  applyBranchEffects
};
