/**
 * Phase 4: 钩子链系统测试
 * 
 * 测试内容:
 * 1. HookChain 基本功能
 * 2. 条件评估器
 * 3. 效果执行器
 * 4. 集成测试（词条通过钩子链执行）
 */

const HookChain = require('../src/services/combatCore/hookChain.cjs');
const ConditionEvaluator = require('../src/services/combatCore/conditionEvaluator.cjs');
const EffectExecutor = require('../src/services/combatCore/effectExecutor.cjs');
const TagRegistry = require('../src/services/combatCore/tagRegistry.cjs');

// 测试统计
let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (error) {
    console.log(`  ❌ ${name}: ${error.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg || 'Assertion failed'}: expected ${expected}, got ${actual}`);
  }
}

function assertTrue(value, msg) {
  if (!value) {
    throw new Error(msg || 'Expected true but got false');
  }
}

async function runTests() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('【Phase 4: 钩子链系统测试】');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // ═══════════════════════════════════════════════════════════════
  // 测试组1: HookChain 基础功能
  // ═══════════════════════════════════════════════════════════════
  console.log('\n【HookChain 基础功能测试】');

  await test('钩子链应有17个预定义钩子点', async () => {
    const summary = HookChain.getSummary();
    assertEqual(summary.length, 17, '应有17个钩子点');
  });

  await test('钩子点包含所有 phase 枚举值', async () => {
    const summary = HookChain.getSummary();
    const phases = summary.map(s => s.phase);
    
    const requiredPhases = [
      'round_start', 'turn_start', 'turn_end',
      'pre_attack', 'on_attack', 'post_attack',
      'pre_damage', 'on_damage', 'post_damage',
      'on_kill', 'on_death', 'on_defended',
      'on_damage_taken', 'on_ally_attacked',
      'movement_check', 'on_airdrop_receive', 'on_buff_expire'
    ];
    
    requiredPhases.forEach(phase => {
      assertTrue(phases.includes(phase), `应包含 ${phase}`);
    });
  });

  await test('可以注册词条到钩子', async () => {
    HookChain.clear();
    
    const mockTag = {
      id: 'test_tag',
      name: '测试词条',
      params: { priority: 50 },
      effects: []
    };
    
    HookChain.register('pre_attack', mockTag, () => ({ triggered: true }));
    
    const summary = HookChain.getSummary();
    const preAttack = summary.find(s => s.phase === 'pre_attack');
    
    assertEqual(preAttack.count, 1, 'pre_attack 应有1个钩子');
    assertEqual(preAttack.tags[0].id, 'test_tag', '词条ID应正确');
  });

  await test('词条按优先级排序', async () => {
    HookChain.clear();
    
    const tag1 = { id: 'low', name: '低优先级', params: { priority: 10 } };
    const tag2 = { id: 'high', name: '高优先级', params: { priority: 90 } };
    const tag3 = { id: 'mid', name: '中优先级', params: { priority: 50 } };
    
    HookChain.register('turn_start', tag1, () => {});
    HookChain.register('turn_start', tag2, () => {});
    HookChain.register('turn_start', tag3, () => {});
    
    const summary = HookChain.getSummary();
    const turnStart = summary.find(s => s.phase === 'turn_start');
    
    const priorities = turnStart.tags.map(t => t.priority);
    assertEqual(priorities[0], 90, '第一个应是高优先级');
    assertEqual(priorities[1], 50, '第二个应是中优先级');
    assertEqual(priorities[2], 10, '第三个应是低优先级');
  });

  // ═══════════════════════════════════════════════════════════════
  // 测试组2: 从注册表加载词条
  // ═══════════════════════════════════════════════════════════════
  console.log('\n【从注册表加载词条测试】');

  await test('loadFromRegistry 应加载所有词条', async () => {
    HookChain.clear();
    const summary = HookChain.loadFromRegistry();
    
    // 检查是否加载了词条
    const totalHooks = summary.reduce((sum, s) => sum + s.count, 0);
    assertTrue(totalHooks >= 10, `应加载至少10个词条，实际 ${totalHooks}`);
  });

  await test('斩杀词条应注册到 post_damage', async () => {
    const summary = HookChain.getSummary();
    const postDamage = summary.find(s => s.phase === 'post_damage');
    
    assertTrue(postDamage.count > 0, 'post_damage 应有词条');
    assertTrue(
      postDamage.tags.some(t => t.id === 'execute'),
      'post_damage 应包含斩杀词条'
    );
  });

  await test('联防词条应注册到 movement_check', async () => {
    const summary = HookChain.getSummary();
    const movementCheck = summary.find(s => s.phase === 'movement_check');
    
    assertTrue(movementCheck.count > 0, 'movement_check 应有词条');
    assertTrue(
      movementCheck.tags.some(t => t.id === 'formation_defense'),
      'movement_check 应包含联防词条'
    );
  });

  // ═══════════════════════════════════════════════════════════════
  // 测试组3: 条件评估器
  // ═══════════════════════════════════════════════════════════════
  console.log('\n【条件评估器测试】');

  await test('简单等值条件评估', async () => {
    const context = { attackType: 'melee' };
    const result = ConditionEvaluator.evaluateSingle(
      { check: 'attack_type', value: 'melee', operator: '==' },
      context
    );
    assertTrue(result, 'melee 应满足条件');
  });

  await test('数值比较条件评估', async () => {
    const context = { target: { hp: 3 } };
    const result = ConditionEvaluator.evaluateSingle(
      { check: 'target_hp', value: 5, operator: '<' },
      context
    );
    assertTrue(result, 'hp=3 < 5 应满足条件');
  });

  await test('AND 条件组评估', async () => {
    const context = { 
      attackType: 'melee',
      target: { hp: 3 }
    };
    const result = ConditionEvaluator.evaluate(
      {
        required: [
          { check: 'attack_type', value: 'melee', operator: '==' },
          { check: 'target_hp', value: 5, operator: '<' }
        ]
      },
      context
    );
    assertTrue(result, '两个条件都满足时应返回true');
  });

  await test('AND 条件组 - 任一不满足返回false', async () => {
    const context = { 
      attackType: 'ranged',
      target: { hp: 3 }
    };
    const result = ConditionEvaluator.evaluate(
      {
        required: [
          { check: 'attack_type', value: 'melee', operator: '==' },
          { check: 'target_hp', value: 5, operator: '<' }
        ]
      },
      context
    );
    assertEqual(result, false, '攻击类型不匹配时应返回false');
  });

  await test('阵营判断条件', async () => {
    const context = {
      attacker: { faction: 'earth' },
      target: { faction: 'balon' }
    };
    const result = ConditionEvaluator.evaluateSingle(
      { check: 'target_faction', value: 'enemy' },
      context
    );
    assertTrue(result, '不同阵营应识别为enemy');
  });

  await test('同阵营判断', async () => {
    const context = {
      attacker: { faction: 'earth' },
      target: { faction: 'earth' }
    };
    const result = ConditionEvaluator.evaluateSingle(
      { check: 'target_faction', value: 'ally' },
      context
    );
    assertTrue(result, '相同阵营应识别为ally');
  });

  // ═══════════════════════════════════════════════════════════════
  // 测试组4: 效果执行器
  // ═══════════════════════════════════════════════════════════════
  console.log('\n【效果执行器测试】');

  await test('instant_kill 效果执行', async () => {
    const context = { target: { hp: 4 } };
    const result = await EffectExecutor.executeSingle(
      { 
        type: 'instant_kill',
        dice: { required: true, sides: 6 }
      },
      context
    );
    
    assertEqual(result.type, 'instant_kill');
    assertTrue(result.roll >= 1 && result.roll <= 6, '掷骰结果应在1-6之间');
  });

  await test('damage_bonus_dice 效果执行', async () => {
    const context = { damageContext: { addStep: () => {} } };
    const result = await EffectExecutor.executeSingle(
      {
        type: 'damage_bonus_dice',
        dice: { required: true, sides: 6 },
        bonus: { high: 5, mid: 4, low: 3 }
      },
      context
    );
    
    assertEqual(result.type, 'damage_bonus_dice');
    assertTrue(result.bonus >= 3 && result.bonus <= 5, '加成应在3-5之间');
  });

  await test('duel_resolution 效果执行', async () => {
    const result = await EffectExecutor.executeSingle(
      { type: 'duel_resolution' },
      {}
    );
    
    assertEqual(result.type, 'duel_resolution');
    assertTrue(result.attackerRoll >= 1 && result.attackerRoll <= 6);
    assertTrue(result.defenderRoll >= 1 && result.defenderRoll <= 6);
    assertTrue(['attacker', 'defender', 'tie'].includes(result.winner));
  });

  await test('luck_resolution 效果执行', async () => {
    const result = await EffectExecutor.executeSingle(
      { type: 'luck_resolution' },
      {}
    );
    
    assertEqual(result.type, 'luck_resolution');
    assertTrue(result.roll >= 1 && result.roll <= 6);
    assertTrue(typeof result.lucky === 'boolean');
  });

  await test('grant_extra_turn 效果执行', async () => {
    const unit = { id: 'u1', name: '测试单位', extraTurn: false };
    const context = {
      attacker: unit,
      getUnit: (id) => unit
    };
    
    const result = await EffectExecutor.executeSingle(
      { type: 'grant_extra_turn' },
      context
    );
    
    assertEqual(result.type, 'grant_extra_turn');
    assertTrue(result.success, '应成功给予额外回合');
    assertTrue(unit.extraTurn, '单位应有extraTurn标记');
  });

  await test('block_movement 效果执行', async () => {
    const result = await EffectExecutor.executeSingle(
      { 
        type: 'block_movement',
        blocked: { directions: 'straight_line_through' },
        resolution: 'must_route_around'
      },
      {}
    );
    
    assertEqual(result.type, 'block_movement');
    assertTrue(result.success);
    assertTrue(result.interrupt, '阻挡应触发中断');
  });

  // ═══════════════════════════════════════════════════════════════
  // 测试组5: 集成测试
  // ═══════════════════════════════════════════════════════════════
  console.log('\n【集成测试 - 词条通过钩子链执行】');

  await test('executePhase 执行指定阶段的词条', async () => {
    const context = {
      attackType: 'melee',
      target: { hp: 4 },
      damageDealt: 2
    };
    
    const result = await HookChain.executePhase('post_damage', context);
    
    assertEqual(result.phase, 'post_damage');
    assertTrue(result.total > 0, '应有词条被检查');
  });

  await test('斩杀词条完整流程', async () => {
    // 模拟斩杀触发条件
    const context = {
      attackType: 'melee',
      target: { hp: 1 },  // 设置HP=1，掷骰必定≥1
      damageDealt: 2,
      attacker: { faction: 'earth' }
    };
    
    const executeTag = TagRegistry.getById('execute');
    assertTrue(!!executeTag, '应能获取斩杀词条');
    
    // 检查条件
    const canTrigger = await HookChain.checkConditions(executeTag, context);
    assertTrue(canTrigger, '应满足斩杀触发条件');
    
    // 执行效果（HP=1时掷骰必定≥1，斩杀一定成功）
    const result = await HookChain.executeEffects(executeTag, context);
    assertTrue(result.success, '斩杀效果应成功执行');
  });

  await test('专注射击词条完整流程', async () => {
    const context = {
      attackType: 'ranged',
      moveActionUsed: false,
      damageContext: { addStep: () => {} }
    };
    
    const focusedShotTag = TagRegistry.getById('focused_shot');
    assertTrue(!!focusedShotTag, '应能获取专注射击词条');
    
    // 检查条件（远程 + 未使用移动）
    const canTrigger = await HookChain.checkConditions(focusedShotTag, context);
    assertTrue(canTrigger, '应满足专注射击触发条件');
  });

  await test('抗性词条完整流程', async () => {
    const context = {
      defender: {
        right_hand_type: 'armor',
        right_hand_durability: 3,
        right_hand_resistance: 'kinetic'
      },
      damageType: 'kinetic'
    };
    
    const resistanceTag = TagRegistry.getById('resistance');
    assertTrue(!!resistanceTag, '应能获取抗性词条');
    
    // 检查条件
    const canTrigger = await HookChain.checkConditions(resistanceTag, context);
    assertTrue(canTrigger, '应满足抗性触发条件');
  });

  // ═══════════════════════════════════════════════════════════════
  // 测试总结
  // ═══════════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`总计: ${passed + failed} 个测试`);
  console.log(`✅ 通过: ${passed}`);
  console.log(`❌ 失败: ${failed}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  // 清理
  HookChain.clear();

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
