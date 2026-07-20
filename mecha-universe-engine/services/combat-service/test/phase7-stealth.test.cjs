/**
 * Phase 7: 奇袭系统测试
 * 测试隐身机制相关功能
 */

const assert = require('assert');

// 加载模块
const HookChain = require('../src/services/combatCore/hookChain.cjs');
const ConditionEvaluator = require('../src/services/combatCore/conditionEvaluator.cjs');
const EffectExecutor = require('../src/services/combatCore/effectExecutor.cjs');
const TagRegistry = require('../src/services/combatCore/tagRegistry.cjs');

// 加载奇袭词条
const stealthTags = require('../src/services/combatCore/tags/stealth-tags.cjs');

// 测试计数器
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (error) {
    console.log(`  ❌ ${name}`);
    console.log(`     Error: ${error.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function assertTrue(value, message) {
  if (!value) {
    throw new Error(`${message}: expected truthy, got ${value}`);
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================
// 测试开始
// ============================================================

console.log('\n═══════════════════════════════════════════════════════');
console.log('【Phase 7: 奇袭系统测试】');
console.log('═══════════════════════════════════════════════════════\n');

// ============================================================
// 1. 奇袭词条定义测试
// ============================================================

console.log('【奇袭词条定义测试】');

test('应该导出5个词条', () => {
  assertEqual(stealthTags.length, 5, '词条数量');
});

test('应该包含stealth_initiate词条', () => {
  const tag = stealthTags.find(t => t.id === 'stealth_initiate');
  assertTrue(tag, '词条存在');
  assertEqual(tag.trigger.phase, 'turn_start', '触发阶段');
  assertEqual(tag.params.priority, 70, '优先级');
});

test('应该包含stealth_ambush词条', () => {
  const tag = stealthTags.find(t => t.id === 'stealth_ambush');
  assertTrue(tag, '词条存在');
  assertEqual(tag.trigger.phase, 'pre_attack', '触发阶段');
  assertEqual(tag.effects[0].type, 'stealth_attack_bonus', '效果类型');
});

test('应该包含stealth_camouflage词条', () => {
  const tag = stealthTags.find(t => t.id === 'stealth_camouflage');
  assertTrue(tag, '词条存在');
  assertEqual(tag.trigger.phase, 'on_defended', '触发阶段');
});

test('应该包含stealth_break词条', () => {
  const tag = stealthTags.find(t => t.id === 'stealth_break');
  assertTrue(tag, '词条存在');
  assertEqual(tag.trigger.phase, 'post_attack', '触发阶段');
});

test('应该包含stealth_break_move词条', () => {
  const tag = stealthTags.find(t => t.id === 'stealth_break_move');
  assertTrue(tag, '词条存在');
  assertEqual(tag.trigger.phase, 'movement_end', '触发阶段');
});

// ============================================================
// 2. 隐身条件检查器测试
// ============================================================

console.log('\n【隐身条件检查器测试】');

test('应该支持attacker_is_stealth检查', async () => {
  const ctx = {
    attacker: { id: 'u1', stealth: true }
  };
  const result = await ConditionEvaluator.evaluate(
    { check: 'attacker_is_stealth', value: true, operator: '==' },
    ctx
  );
  assertTrue(result, '应该返回true');
});

test('attacker_is_stealth应该正确识别非隐身', async () => {
  const ctx = {
    attacker: { id: 'u1', stealth: false }
  };
  const result = await ConditionEvaluator.evaluate(
    { check: 'attacker_is_stealth', value: true, operator: '==' },
    ctx
  );
  assertEqual(result, false, '应该返回false');
});

test('应该支持defender_is_stealth检查', async () => {
  const ctx = {
    defender: { id: 'u2', stealth: true }
  };
  const result = await ConditionEvaluator.evaluate(
    { check: 'defender_is_stealth', value: true, operator: '==' },
    ctx
  );
  assertTrue(result, '应该返回true');
});

test('应该支持moving_unit_is_stealth检查', async () => {
  const ctx = {
    movingUnit: { id: 'u3', stealth: true }
  };
  const result = await ConditionEvaluator.evaluate(
    { check: 'moving_unit_is_stealth', value: true, operator: '==' },
    ctx
  );
  assertTrue(result, '应该返回true');
});

test('应该支持unit_faction检查', async () => {
  const ctx = {
    unit: { id: 'u1', faction: 'maxion' }
  };
  const result = await ConditionEvaluator.evaluate(
    { check: 'unit_faction', value: 'maxion', operator: '==' },
    ctx
  );
  assertTrue(result, '应该返回true');
});

// ============================================================
// 3. 隐身效果处理器测试
// ============================================================

console.log('\n【隐身效果处理器测试】');

test('应该能进入隐身状态', async () => {
  const unit = { id: 'u1', name: '测试单位', hp: 100 };
  const ctx = { unit };

  const result = await EffectExecutor.execute([{
    type: 'enter_stealth',
    stealthDuration: 'until_action'
  }], ctx);

  assertTrue(result[0].success, '应该执行成功');
  assertTrue(unit.stealth === true, '单位应该进入隐身');
  assertTrue(unit.stealthData !== null, '应该有隐身数据');
});

test('重复进入隐身应该返回already_stealth', async () => {
  const unit = { id: 'u1', stealth: true, stealthData: {} };
  const ctx = { unit };

  const result = await EffectExecutor.execute([{
    type: 'enter_stealth'
  }], ctx);

  assertTrue(result[0].success, '应该执行成功');
  assertEqual(result[0].result, 'already_stealth', '结果');
});

test('应该能退出隐身状态', async () => {
  const unit = { id: 'u1', stealth: true, stealthData: { enteredAt: Date.now() } };
  const ctx = { unit };

  const result = await EffectExecutor.execute([{
    type: 'exit_stealth',
    reason: 'attack'
  }], ctx);

  assertTrue(result[0].success, '应该执行成功');
  assertEqual(result[0].result, 'stealth_broken', '结果');
  assertEqual(unit.stealth, false, '单位应该退出隐身');
});

test('应该能处理隐身攻击加成', async () => {
  // 模拟伤害管道
  const damageSteps = [];
  const damageContext = {
    steps: damageSteps,
    addStep: (step) => damageSteps.push(step),
    getTotal: () => {
      return damageSteps.reduce((sum, s) => sum + (s.value || 0), 0);
    }
  };

  // 添加基础伤害
  damageContext.addStep({ source: 'base', type: 'weapon', value: 10, description: '武器伤害' });

  const ctx = { damageContext };

  const result = await EffectExecutor.execute([{
    type: 'stealth_attack_bonus',
    multiplier: 1.5
  }], ctx);

  assertTrue(result[0].success, '应该执行成功');
  assertTrue(result[0].bonus > 0, '应该有加成');
  assertEqual(result[0].multiplier, 1.5, '乘数');
});

test('应该能处理隐身闪避', async () => {
  const ctx = {};

  // 多次测试以验证骰子机制
  let evasionCount = 0;
  for (let i = 0; i < 20; i++) {
    const result = await EffectExecutor.execute([{
      type: 'stealth_evasion',
      dice: { required: true, sides: 6, threshold: 3 }
    }], ctx);

    if (result[0].evaded) evasionCount++;
  }

  // 掷骰阈值3 means 4,5,6 succeed = 50% chance
  // 20次测试，预期8-12次闪避
  assertTrue(evasionCount >= 4 && evasionCount <= 16, `闪避次数${evasionCount}在合理范围`);
});

// ============================================================
// 4. HookChain 隐身钩子测试
// ============================================================

console.log('\n【HookChain 隐身钩子测试】');

test('应该能注册stealth_initiate到turn_start钩子', () => {
  HookChain.clear();
  HookChain.register('turn_start', stealthTags[0], HookChain.createTagHandler(stealthTags[0]));

  const hooks = HookChain.hooks['turn_start'];
  assertTrue(hooks.length > 0, '应该有注册的钩子');
});

test('应该能注册stealth_ambush到pre_attack钩子', () => {
  HookChain.clear();
  HookChain.register('pre_attack', stealthTags[1], HookChain.createTagHandler(stealthTags[1]));

  const hooks = HookChain.hooks['pre_attack'];
  assertTrue(hooks.length > 0, '应该有注册的钩子');
});

test('应该能注册stealth_break到post_attack钩子', () => {
  HookChain.clear();
  HookChain.register('post_attack', stealthTags[3], HookChain.createTagHandler(stealthTags[3]));

  const hooks = HookChain.hooks['post_attack'];
  assertTrue(hooks.length > 0, '应该有注册的钩子');
});

test('应该能注册stealth_break_move到movement_end钩子', () => {
  HookChain.clear();
  HookChain.register('movement_end', stealthTags[4], HookChain.createTagHandler(stealthTags[4]));

  const hooks = HookChain.hooks['movement_end'];
  assertTrue(hooks.length > 0, '应该有注册的钩子');
});

test('movement_end钩子应该存在', () => {
  assertTrue(HookChain.hooks['movement_end'] !== undefined, '钩子存在');
});

// ============================================================
// 5. 完整流程测试
// ============================================================

console.log('\n【完整流程测试】');

test('马克西翁单位应该能进入隐身并攻击', async () => {
  HookChain.clear();

  // 注册所有隐身词条
  stealthTags.forEach(tag => {
    HookChain.register(tag.trigger.phase, tag, HookChain.createTagHandler(tag));
  });

  // 创建马克西翁单位
  const maxionUnit = {
    id: 'maxion_1',
    name: '马克西翁突击者',
    faction: 'maxion',
    hp: 100,
    stealth: false,
    equipped_tags: ['stealth_initiate', 'stealth_ambush', 'stealth_break']
  };

  // 创建敌人
  const enemyUnit = {
    id: 'enemy_1',
    name: '地球联合步兵',
    faction: 'earth',
    hp: 50
  };

  // 模拟回合开始 - 进入隐身
  const turnStartCtx = {
    unit: maxionUnit,
    attacker: maxionUnit
  };

  const turnStartResult = await HookChain.execute('turn_start', turnStartCtx);

  // 验证进入隐身
  assertTrue(maxionUnit.stealth === true, '单位应该进入隐身');

  // 模拟攻击 - 奇袭
  const attackCtx = {
    attacker: maxionUnit,
    target: enemyUnit,
    attackType: 'melee'
  };

  const attackResult = await HookChain.execute('pre_attack', attackCtx);

  // 验证奇袭词条触发
  const ambushTriggered = attackResult.results.some(r =>
    r.tag === 'stealth_ambush' && r.triggered
  );
  assertTrue(ambushTriggered, '奇袭词条应该触发');

  // 模拟攻击后 - 暴露
  const postAttackCtx = {
    attacker: maxionUnit
  };

  const postAttackResult = await HookChain.execute('post_attack', postAttackCtx);

  // 验证暴露
  assertEqual(maxionUnit.stealth, false, '单位应该暴露');
});

test('非马克西翁单位不应该触发隐身词条', async () => {
  HookChain.clear();

  // 注册所有隐身词条
  stealthTags.forEach(tag => {
    HookChain.register(tag.trigger.phase, tag, HookChain.createTagHandler(tag));
  });

  // 创建非马克西翁单位
  const earthUnit = {
    id: 'earth_1',
    name: '地球联合士兵',
    faction: 'earth',
    hp: 100
  };

  // 模拟回合开始
  const turnStartCtx = {
    unit: earthUnit,
    attacker: earthUnit
  };

  const turnStartResult = await HookChain.execute('turn_start', turnStartCtx);

  // 验证不会进入隐身
  assertEqual(earthUnit.stealth, undefined, '非马克西翁单位不会进入隐身');
});

// ============================================================
// 6. EffectExecutor 可用类型测试
// ============================================================

console.log('\n【EffectExecutor 可用类型测试】');

test('应该包含enter_stealth效果类型', () => {
  const types = EffectExecutor.getAvailableTypes();
  assertTrue(types.includes('enter_stealth'), '应该包含enter_stealth');
});

test('应该包含exit_stealth效果类型', () => {
  const types = EffectExecutor.getAvailableTypes();
  assertTrue(types.includes('exit_stealth'), '应该包含exit_stealth');
});

test('应该包含stealth_attack_bonus效果类型', () => {
  const types = EffectExecutor.getAvailableTypes();
  assertTrue(types.includes('stealth_attack_bonus'), '应该包含stealth_attack_bonus');
});

test('应该包含stealth_evasion效果类型', () => {
  const types = EffectExecutor.getAvailableTypes();
  assertTrue(types.includes('stealth_evasion'), '应该包含stealth_evasion');
});

// ============================================================
// 测试结果汇总
// ============================================================

console.log('\n═══════════════════════════════════════════════════════');
console.log(`总计: ${passed + failed} 个测试`);
console.log(`✅ 通过: ${passed}`);
console.log(`❌ 失败: ${failed}`);
console.log('═══════════════════════════════════════════════════════\n');

process.exit(failed > 0 ? 1 : 0);
