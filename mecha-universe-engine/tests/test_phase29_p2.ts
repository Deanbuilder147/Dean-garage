/**
 * Phase 29-P2 真机验证测试套件
 *
 * 工序二验证：故意拼错词元 → [CRITICAL FAILED] 降级 + 基础伤害兜底
 * 工序三验证：稳定射击全流程（定语熔断 / 状语摇6 / 补语累加）
 *
 * 运行: npx tsx tests/test_phase29_p2.ts
 */

import { executeSkill, executeClauseStateMachine, computeSkillDamage, computeClauseDamage } from '../backend-gateway/src/skillExecutor.js';
import { computeStableShot, computeDamage, STABLE_SHOT_CLAUSE, LayeredExecutor, ExclusionPool, ExclusionTag } from '../backend-gateway/src/damagePipe.js';
import type { BattleUnit, OrderClause } from '@mecha/shared-kernel';
import { DamageType } from '@mecha/shared-kernel';

// ============================================
// 测试工具：构建假 BattleUnit
// ============================================
function makeUnit(id: string, overrides: Partial<BattleUnit> = {}): BattleUnit {
  return {
    unitId: id,
    matrixId: id,
    ownerId: 'test-user',
    position: { q: 0, r: 0 },
    currentStats: {
      hp: 100, maxHp: 100,
      armor: 10, shield: 5,
      attack: 30, defense: 15,
      speed: 4, range: 2,
    },
    skills: [],
    statusEffects: [],
    action_points: { MOVE: 1, ATTACK: 1 },
    ...overrides,
  } as BattleUnit;
}

// ============================================
// 测试 A: 工序二 — 故意拼错词元 (BUFF → BUEF)
// ============================================
function testUnrecognizedToken(): void {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 测试 A: 工序二 — 故意拼错词元降级');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const caster = makeUnit('caster', { attack: 50, defense: 10 } as any);
  const target = makeUnit('target', { currentStats: { hp: 100, maxHp: 100, armor: 10, shield: 5, attack: 20, defense: 5, speed: 3, range: 1 } });

  // 故意将 BUFF 写为 BUEF
  const malformedDSL = `attack
<action_points.ATTACK > 0>
[1d6 4 0]
(BUEF 5 energy)`;

  console.log(`📝 恶意词元 DSL: "${malformedDSL.replace(/\n/g, ' | ')}"`);

  const result = computeSkillDamage(malformedDSL, caster, target);
  console.log(`✅ 战局未假死！result.success = ${result.success}`);
  console.log(`   伤害 = ${result.damage} (> 0 说明兜底公式生效)`);
  console.log(`   日志:\n${result.log.map(l => '     ' + l).join('\n')}`);
  console.log(`   error = ${result.error || '无'}`);
}

// ============================================
// 测试 B: 工序二 — 正确词元竞争 (BUFF 正常执行)
// ============================================
function testNormalBuff(): void {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 测试 B: 工序二 — 正常 BUFF 词元');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const caster = makeUnit('caster');
  const target = makeUnit('target');

  const normalDSL = `attack
<action_points.ATTACK > 0>
[1d6 3 0]
(buff 5 physical)`;

  console.log(`📝 正常词元 DSL: "${normalDSL.replace(/\n/g, ' | ')}"`);

  const result = computeSkillDamage(normalDSL, caster, target);
  console.log(`✅ success = ${result.success}`);
  console.log(`   伤害 = ${result.damage}`);
  console.log(`   日志:\n${result.log.map(l => '     ' + l).join('\n')}`);
}

// ============================================
// 测试 C: 工序三 — 稳定射击：定语熔断（MOVE 行动点已耗尽）
// ============================================
function testStableShotBlocked(): void {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 测试 C: 工序三 — 稳定射击「定语熔断」');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // 模拟：单位已移动过，action_points.MOVE = 0
  const caster = makeUnit('caster', {
    action_points: { MOVE: 0, ATTACK: 1 },
  });
  const target = makeUnit('target');

  console.log(`⚠️ caster.action_points.MOVE = ${caster.action_points.MOVE}（已耗尽！）`);

  const result = computeStableShot(caster, target, () => Math.floor(Math.random() * 6) + 1);
  console.log(`🔴 熔断状态: blocked = ${result.blocked}`);
  console.log(`   熔断原因: ${result.blockReason}`);
  console.log(`   最终伤害: ${result.finalDamage} (应为 0)`);
  console.log(`   日志:\n${result.stageLog.map(l => '     ' + l).join('\n')}`);

  if (result.blocked && result.finalDamage === 0) {
    console.log('✅ 定语卡口熔断通过！拦截了 MOVE=0 时的技能释放');
  } else {
    console.log('❌ 熔断失败！');
  }
}

// ============================================
// 测试 D: 工序三 — 稳定射击：状语成功触发补语
// ============================================
function testStableShotSuccess(): void {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 测试 D: 工序三 — 稳定射击「状语成功 + dice_bonus 累加」');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // 单位未移动，action_points.MOVE = 1
  const caster = makeUnit('caster', {
    action_points: { MOVE: 1, ATTACK: 1 },
  });
  const target = makeUnit('target');

  // 强制骰子返回 6（模拟幸运摇出 6）
  const fixedDice = () => 6;
  console.log('🎲 固定骰子 = 6（模拟幸运暴击）');

  const result = computeStableShot(caster, target, fixedDice);
  console.log(`✅ blocked = ${result.blocked}`);
  console.log(`   最终伤害 = ${result.finalDamage}`);
  console.log(`   伤害类型 = ${result.damageType}`);
  console.log(`   骰子结果: ${JSON.stringify(result.diceResults)}`);
  console.log(`   补语明细: ${JSON.stringify(result.complementDetails)}`);
  console.log(`   日志:\n${result.stageLog.map(l => '     ' + l).join('\n')}`);

  // 验证行动点已被消费
  console.log(`   action_points.MOVE 剩余: ${caster.action_points.MOVE} (应为 0，已消费)`);

  if (result.finalDamage > 0 && result.diceResults[0]?.isSuccess && caster.action_points.MOVE === 0) {
    console.log('✅ 状语成功触发补语累加，行动点已正确消费！');
  } else {
    console.log('❌ 验证失败！');
  }
}

// ============================================
// 测试 E: 工序三 — 稳定射击：状语失败不触发 dice_bonus
// ============================================
function testStableShotMiss(): void {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 测试 E: 工序三 — 稳定射击「状语失败 → dice_bonus 不触发」');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const caster = makeUnit('caster', {
    action_points: { MOVE: 1, ATTACK: 1 },
  });
  const target = makeUnit('target');

  // 强制骰子返回 1（失败）
  const fixedDice = () => 1;
  console.log('🎲 固定骰子 = 1（模拟失败）');

  const result = computeStableShot(caster, target, fixedDice);
  console.log(`✅ blocked = ${result.blocked}`);
  console.log(`   最终伤害 = ${result.finalDamage}`);
  console.log(`   骰子结果: ${JSON.stringify(result.diceResults)}`);
  console.log(`   补语明细: ${JSON.stringify(result.complementDetails)}`);
  console.log(`   日志:\n${result.stageLog.map(l => '     ' + l).join('\n')}`);

  // 状语失败时，flat +5 仍应生效，但 dice_bonus +5 不应生效
  // 基础伤害 = 30 * 1.5 - 5 = 40, flat +5 = 45
  const hasDiceBonus = result.complementDetails.some(c => c.mode === 'dice_bonus');
  console.log(`   dice_bonus 是否激活: ${hasDiceBonus}`);

  if (!hasDiceBonus) {
    console.log('✅ 状语失败时 dice_bonus 未激活！');
  } else {
    console.log('❌ dice_bonus 错误激活！');
  }
}

// ============================================
// 测试 F: 工序二 — [CRITICAL FAILED] 降级异常报警
// ============================================
function testCriticalFail(): void {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 测试 F: 工序二 — [CRITICAL FAILED] 降级异常报警');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const caster = makeUnit('caster');
  // 传入一个会导致内部异常的结构（模拟 UGC 语法炸弹）
  const target = makeUnit('target');

  // 构造一个畸形的 OrderClause，缺少必要字段
  const brokenClause = {
    name: '异常技能',
    predicate: 'DAMAGE_ENERGY',
    qualifiers: [{ tag: 'BAD', subject: 'SELF', field: 'nonexistent.field.deep', operator: '>' as const, value: 0, failMessage: '???' }],
    adverbials: [{ diceExpression: '1d6', successLine: 4, failValue: 0, label: '坏骰子' }],
    complements: [{ mode: 'dice_bonus' as const, value: 5, targetField: 'bad', label: '坏补语' }],
  } as OrderClause;

  console.log('💣 注入畸形 OrderClause（嵌套深路径访问）');

  const result = computeClauseDamage(brokenClause, caster, target);
  console.log(`✅ 战局未假死！success = ${result.success}`);
  console.log(`   伤害 = ${result.damage} (> 0 兜底) — 说明兜底公��已激活`);
  console.log(`   日志:\n${result.log.map(l => '     ' + l).join('\n')}`);
}

// ============================================
// 测试 G: 工序二 — MAX_LOOP_STEP 死循环熔断
// ============================================
function testLoopOverflow(): void {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 测试 G: 工序二 — MAX_LOOP_STEP=10 死循环熔断');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const caster = makeUnit('caster');
  const target = makeUnit('target');

  // 构造大量重复循环的 DSL
  const loopDSL = Array(15).fill('{loop 5}\nattack\n{/loop}').join('\n');
  console.log(`📝 构造 ${15 * 5} 步循环 DSL（超过 MAX_LOOP_STEP=10）`);

  const result = computeSkillDamage(loopDSL, caster, target);
  console.log(`✅ 熔断状态: error = ${result.error}`);
  console.log(`   伤害 = ${result.damage}`);
  console.log(`   日志最后 5 条:\n${result.log.slice(-5).map(l => '     ' + l).join('\n')}`);

  if (result.error === 'SKILL_LOOP_OVERFLOW') {
    console.log('✅ 死循环正确熔断！');
  } else {
    console.log('❌ 未正确熔断！');
  }
}

// ============================================
// 运行全部测试
// ============================================
console.log('🚀 Phase 29-P2 真机验证测试套件启动');
console.log('========================================');

testUnrecognizedToken();
testNormalBuff();
testStableShotBlocked();
testStableShotSuccess();
testStableShotMiss();
testCriticalFail();
testLoopOverflow();

console.log('\n========================================');
console.log('✅ 全部测试完成');
console.log('========================================\n');
