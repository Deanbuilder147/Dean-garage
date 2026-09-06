/**
 * verify-conditional-effects.cjs — Phase 4A 轻量验证脚本
 *
 * 验证：主动技能释放时，词条 trigger.condition 对【效果级】的门控：
 *   1) buff/debuff：条件不满足 → 不写 statusEffects_added，但技能基础动作仍 triggered
 *   2) attack：条件不满足 → 仅基础伤害结算，带 trigger 的额外伤害 effect 被跳过
 *   3) 回归：无 trigger 的 buff 仍正常写 status（行为不变）
 *
 * 运行：node mecha-universe-engine/scripts/verify-conditional-effects.cjs
 * 说明：combat-service 为 .cjs 源码即生效，无需编译。
 */
const SkillExecutor = require('../services/combat-service/src/services/combatCore/skillExecutor.cjs');
const se = new SkillExecutor();

// 固定骰子，消除掷骰方差，使"带/不带条件额外伤害"的基础伤害可比
se._evaluateDice = () => ({ roll: 4, diceType: '1d6', successLine: 4, isSuccess: true, bonusDamage: 0 });

function mkUnit(over) {
  return Object.assign({
    id: 'u', faction: 'earth', role: 'attack',
    hp: 100, max_hp: 100, current_hp: 100,
    q: 0, r: 0, size: 'M', statusEffects: [],
  }, over);
}

let pass = 0, fail = 0;
function assert(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + '  ' + (extra != null ? JSON.stringify(extra) : '')); }
}

const attacker = mkUnit({ id: 'A', faction: 'earth', role: 'attack', q: 0, r: 0 });
const full = mkUnit({ id: 'T1', faction: 'maxion', role: 'defense', hp: 100, max_hp: 100, current_hp: 100, q: 1, r: 0 });
const low  = mkUnit({ id: 'T2', faction: 'maxion', role: 'defense', hp: 20,  max_hp: 100, current_hp: 20, q: 1, r: 0 });

console.log('\n[Test 1] buff 技能级 trigger: hp_below_pct:30（目标为被作用主体）');
const buffDef = {
  name: 'QA-条件Buff', action_type: 'buff', target_scope: 'single_enemy', cast_range: 3,
  applies_on: 'guard', modifier: 'reduction', value: 3,
  trigger: { type: 'conditional', condition: { hp_below_pct: 30 } },
  consumption: { mode: 'duration', duration: 1 },
  effects: [{ type: 'status', status_type: 'defense', modifier: 'reduction', value: 3, duration: 1 }],
};
const rSkip = se.executeUniversalSkill('qa_cond_buff', attacker, full, {}, buffDef);
assert('条件不满足(目标100%HP) → 不写 statusEffects_added', !rSkip.statusEffects_added, rSkip.statusEffects_added);
assert('条件不满足 → 技能仍 triggered（基础动作照常）', rSkip.triggered === true);
const rApply = se.executeUniversalSkill('qa_cond_buff', attacker, low, {}, buffDef);
assert('条件满足(目标20%HP) → 写入 statusEffects_added', Array.isArray(rApply.statusEffects_added) && rApply.statusEffects_added.length === 1, rApply.statusEffects_added);
assert('条件满足 → expiry_phase 正确', rApply.statusEffects_added && rApply.statusEffects_added[0].expiry_phase === 'turn_end');

console.log('\n[Test 2] attack 效果级 trigger: 额外伤害 effect 带 hp_below_pct:30');
const atkDef = {
  name: 'QA-条件攻击', action_type: 'attack', target_scope: 'single_enemy',
  base_damage: 10, cast_range: 3,
  effects: [{ type: 'damage', trigger: { condition: { hp_below_pct: 30 } }, flat_value: 5 }],
};
// 无效果参照攻击（排除条件额外伤害，仅基础伤害 + 减伤管线）
const atkBase = Object.assign({}, atkDef, { effects: [] });
const refFull = se.executeUniversalSkill('qa_atk_base', attacker, full, {}, atkBase);
const refLow  = se.executeUniversalSkill('qa_atk_base', attacker, low, {}, atkBase);
const D0_full = refFull.final_damage;
const D0_low  = refLow.final_damage;
const aSkip = se.executeUniversalSkill('qa_cond_atk', attacker, full, {}, atkDef);
assert('条件不满足(目标100%HP) → 最终伤害==基础伤害（额外被跳过）', aSkip.final_damage === D0_full, aSkip.final_damage + ' vs ' + D0_full);
assert('条件不满足 → triggered（基础攻击照常结算）', aSkip.triggered === true);
const aApply = se.executeUniversalSkill('qa_cond_atk', attacker, low, {}, atkDef);
assert('条件满足(目标20%HP) → 最终伤害>基础伤害（额外已追加）', aApply.final_damage > D0_low, aApply.final_damage + ' vs ' + D0_low);

console.log('\n[Test 3] 回归：无 trigger 的 buff 仍正常写 status');
const plainBuff = {
  name: 'plain', action_type: 'buff', target_scope: 'single_enemy',
  applies_on: 'guard', modifier: 'reduction', value: 2,
  consumption: { mode: 'duration', duration: 1 },
  effects: [{ type: 'status', status_type: 'defense', modifier: 'reduction', value: 2, duration: 1 }],
};
const rPlain = se.executeUniversalSkill('qa_plain_buff', attacker, full, {}, plainBuff);
assert('无 trigger buff → 仍写 statusEffects_added', Array.isArray(rPlain.statusEffects_added) && rPlain.statusEffects_added.length === 1, rPlain.statusEffects_added);

console.log(`\n=== 结果: ${pass} passed, ${fail} failed ===`);
process.exit(fail === 0 ? 0 : 1);
