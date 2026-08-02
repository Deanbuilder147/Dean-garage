'use strict';
/**
 * conditionTrigger.cjs - 条件触发匹配引擎（Conditional Triggers）
 *
 * 为 Buff/Status 系统提供统一的「触发条件匹配」纯函数。
 * damagePipe 与 BuffManager 共用，保证行为一致。
 *
 * 设计要点（契合战斗宪法「单向数据管道」）：
 *   - 本模块是纯函数，不修改任何单位状态，只读取 trigger 配置 + 攻击上下文。
 *   - 未来任何「条件化自动技能」只需在词条库配置
 *       trigger: { type:'conditional', attack_type:[...], damage_kind:[...] }
 *     即可落地，匹配引擎与管线无需改动。
 *
 * matchTrigger(buff, ctx):
 *   - unconditional：始终匹配（返回 true）。
 *   - conditional：攻击类型(attack_type) AND 伤害类型(damage_kind) 同时命中才匹配。
 *       · attack_type 为 null/空 => 不限攻击类型
 *       · damage_kind 为 null/空 => 不限伤害类型
 */

/**
 * 判定某 buff/status 实例是否被本次攻击触发。
 * @param {Object} buff - statusEffects 元素（含 trigger 字段）
 * @param {Object} ctx  - { attack_type:'melee'|'ranged', damage_kind:'beam'|'kinetic'|... }
 * @returns {boolean}
 */
function matchTrigger(buff, ctx) {
  if (!buff) return false;
  const t = buff.trigger || (buff.consumption && buff.consumption.trigger) || { type: 'unconditional' };
  if (t.type !== 'conditional') return true; // 无条件：始终匹配

  const aType = ctx ? ctx.attack_type : undefined;
  const dKind = ctx ? ctx.damage_kind : undefined;

  const atOk = !t.attack_type || !t.attack_type.length || t.attack_type.indexOf(aType) >= 0;
  const dkOk = !t.damage_kind || !t.damage_kind.length || t.damage_kind.indexOf(dKind) >= 0;
  return atOk && dkOk;
}

module.exports = { matchTrigger };
