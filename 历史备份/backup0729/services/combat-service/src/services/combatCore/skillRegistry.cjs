'use strict';
/**
 * skillRegistry.cjs - 基于 key/type 的技能动态注册表
 *
 * 目的（方案 Step 3）：消除 combatResolver.js 中按技能名写死的
 * if/else 分发（_extractSkillBonuses），改为「注册即生效」的动态查找。
 *
 * 注册表键 = skill.type（即词条 key）。
 * 提取器签名：(ctx) => bonusObject | null
 *   ctx = { executor, unit, skill, resolvedSkill }
 *   - 仅在技能激活且触发时返回加成对象，否则返回 null（调用方 Skip）。
 *   - 行为与旧 _extractSkillBonuses 逐条 if 完全一致（零行为变更）。
 *
 * 新增机制只需 registerSkill(type, extractor)，无需改动 combatResolver 分发体。
 */

const REGISTRY = {};

function registerSkill(type, extractor) {
  if (!type || typeof extractor !== 'function') {
    throw new Error('registerSkill 需要 type 与 extractor 函数');
  }
  REGISTRY[type] = extractor;
}

function getBonusExtractor(type) {
  return REGISTRY[type] || null;
}

function hasSkill(type) {
  return Object.prototype.hasOwnProperty.call(REGISTRY, type);
}

// 内置注册（v5：由结构化 statusEffects 动态提取，彻底废弃 executeAssist/Guard/Blockade 写死函数）
function statusSum(unit, appliesOn) {
  const list = (unit && Array.isArray(unit.statusEffects)) ? unit.statusEffects : [];
  return list.reduce((a, s) => (s && s.applies_on === appliesOn) ? a + (Number(s.value) || 0) : a, 0);
}

registerSkill('assist', ({ unit }) => {
  const v = statusSum(unit, 'attack');
  return v ? { type: 'assist', value: v, bonus_value: v } : null;
});

registerSkill('blockade', ({ unit }) => {
  const v = statusSum(unit, 'attack_debuff_target');
  return v ? { type: 'blockade', value: v, bonus_value: v } : null;
});

// 注：counter 在旧 _extractSkillBonuses 中写死 value:2（已知 P4 双份真相问题，
// 后续 Step 统一修复）；此处保留原值以保证零行为变更。
registerSkill('counter', () => ({ type: 'counter', value: 2, bonus_value: 2 }));

registerSkill('focused_fire', ({ executor, resolvedSkill }) => {
  // 旧逻辑：仅当当前结算技能正是 focused_fire 时才注入加成
  if (!(resolvedSkill && resolvedSkill.type === 'focused_fire')) return null;
  const ff = executor.executeFocusedFire();
  return { type: 'focused_fire', value: ff.bonus, bonus_value: ff.bonus };
});

registerSkill('guard', ({ unit }) => {
  const v = statusSum(unit, 'defense');
  return v ? { type: 'guard', value: v, bonus_value: v } : null;
});

module.exports = { registerSkill, getBonusExtractor, hasSkill, REGISTRY };
