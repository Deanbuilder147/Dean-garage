/**
 * Phase 8: 人机AI系统测试
 */

const assert = require('assert');

console.log('═══════════════════════════════════════════════════════════════');
console.log('【Phase 8: 人机AI系统测试】');
console.log('═══════════════════════════════════════════════════════════════\n');

let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    testsPassed++;
  } catch (error) {
    console.log(`  ❌ ${name}`);
    console.log(`     Error: ${error.message}`);
    testsFailed++;
  }
}

// 导入模块
const { AIEngine, AI_DIFFICULTY } = require('./aiEngine.cjs');
const { bt, NODE_STATUS } = require('./behaviorTree.cjs');
const { createStrategy, AggressiveStrategy, DefensiveStrategy, BalancedStrategy, manhattanDistance } = require('./aiStrategies.cjs');
const { getDifficultyConfig, AIDifficultyProxy, getAllDifficulties, compareDifficulty } = require('./aiDifficulty.cjs');
const { AICombatController } = require('./aiIntegration.cjs');

console.log('【AIEngine 引擎测试】\n');

test('AI引擎应该能正确初始化', () => {
  const mockCombatCore = {};
  const engine = new AIEngine(mockCombatCore, { difficulty: AI_DIFFICULTY.NORMAL });
  assert.strictEqual(engine.difficulty, AI_DIFFICULTY.NORMAL);
  assert.strictEqual(engine.enabled, false);
});

test('AI引擎应该能注册和注销AI单位', () => {
  const engine = new AIEngine({});
  engine.registerAIUnit('unit_001', 'earth');
  assert.strictEqual(engine.isAIUnit('unit_001'), true);
  assert.strictEqual(engine.isAIUnit('unit_002'), false);
  
  engine.unregisterAIUnit('unit_001');
  assert.strictEqual(engine.isAIUnit('unit_001'), false);
});

test('AI引擎应该能获取AI单位列表', () => {
  const engine = new AIEngine({});
  engine.registerAIUnit('unit_001', 'earth');
  engine.registerAIUnit('unit_002', 'bailun');
  
  const units = engine.getAIUnits();
  assert.strictEqual(units.length, 2);
});

test('AI引擎应该能设置难度', () => {
  const engine = new AIEngine({});
  engine.setDifficulty(AI_DIFFICULTY.HARD);
  assert.strictEqual(engine.difficulty, AI_DIFFICULTY.HARD);
});

test('AI引擎应该能启用和禁用', () => {
  const engine = new AIEngine({});
  engine.enable();
  assert.strictEqual(engine.enabled, true);
  engine.disable();
  assert.strictEqual(engine.enabled, false);
});

console.log('\n【行为树测试】\n');

test('选择器节点应该按顺序执行直到成功', async () => {
  let counter = 0;
  const selector = bt.selector('TestSelector')
    .addChild(bt.action('fail', async () => { counter++; return false; }))
    .addChild(bt.action('success', async () => { counter++; return true; }))
    .addChild(bt.action('never', async () => { counter++; return true; }));
  
  const result = await selector.execute({});
  assert.strictEqual(result, NODE_STATUS.SUCCESS);
  assert.strictEqual(counter, 2); // 应该停在第二个
});

test('序列器节点应该执行全部子节点', async () => {
  let counter = 0;
  const sequence = bt.sequence('TestSequence')
    .addChild(bt.action('first', async () => { counter++; return true; }))
    .addChild(bt.action('second', async () => { counter++; return true; }));
  
  const result = await sequence.execute({});
  assert.strictEqual(result, NODE_STATUS.SUCCESS);
  assert.strictEqual(counter, 2);
});

test('序列器节点遇到失败应该停止', async () => {
  let counter = 0;
  const sequence = bt.sequence('TestSequence')
    .addChild(bt.action('first', async () => { counter++; return true; }))
    .addChild(bt.action('fail', async () => { counter++; return false; }))
    .addChild(bt.action('never', async () => { counter++; return true; }));
  
  const result = await sequence.execute({});
  assert.strictEqual(result, NODE_STATUS.FAILURE);
  assert.strictEqual(counter, 2);
});

test('条件节点应该正确检查条件', async () => {
  const condition = bt.condition('test', async (ctx) => ctx.value > 5);
  
  const successResult = await condition.execute({ value: 10 });
  assert.strictEqual(successResult, NODE_STATUS.SUCCESS);
  
  condition.reset();
  const failResult = await condition.execute({ value: 3 });
  assert.strictEqual(failResult, NODE_STATUS.FAILURE);
});

console.log('\n【AI策略测试】\n');

test('应该能创建攻击型策略', () => {
  const engine = new AIEngine({});
  const strategy = createStrategy(engine, AI_DIFFICULTY.EASY);
  assert.ok(strategy instanceof AggressiveStrategy);
});

test('应该能创建平衡型策略', () => {
  const engine = new AIEngine({});
  const strategy = createStrategy(engine, AI_DIFFICULTY.NORMAL);
  assert.ok(strategy instanceof BalancedStrategy);
});

test('应该能创建防守型策略', () => {
  const engine = new AIEngine({});
  const strategy = new DefensiveStrategy(engine, AI_DIFFICULTY.NORMAL);
  assert.ok(strategy instanceof DefensiveStrategy);
});

test('攻击型策略应该优先攻击可攻击目标', async () => {
  const engine = new AIEngine({});
  const strategy = new AggressiveStrategy(engine, AI_DIFFICULTY.EASY);
  
  const gameState = {
    units: [
      { id: 'unit_1', faction: 'earth', position: { q: 0, r: 0 }, hp: 50, attack_range: 2 },
      { id: 'unit_2', faction: 'bailun', position: { q: 1, r: 0 }, hp: 30, attack_range: 1 },
      { id: 'unit_3', faction: 'bailun', position: { q: 0, r: 0 }, hp: 20, attack_range: 1 }
    ]
  };
  
  const decision = await strategy.decide('unit_1', gameState);
  assert.strictEqual(decision.type, 'attack');
  assert.strictEqual(decision.target.id, 'unit_3'); // 应该选择HP最低的
});

test('攻击型策略在无目标时应移动向敌人', async () => {
  const engine = new AIEngine({});
  const strategy = new AggressiveStrategy(engine, AI_DIFFICULTY.EASY);
  
  const gameState = {
    units: [
      { id: 'unit_1', faction: 'earth', position: { q: 0, r: 0 }, hp: 50, attack_range: 1, mobility: 3 },
      { id: 'unit_2', faction: 'bailun', position: { q: 5, r: 0 }, hp: 30, attack_range: 1 }
    ]
  };
  
  const decision = await strategy.decide('unit_1', gameState);
  assert.strictEqual(decision.type, 'move');
});

test('距离计算应该正确', () => {
  const a = { q: 0, r: 0 };
  const b = { q: 3, r: 0 };
  assert.strictEqual(manhattanDistance(a, b), 3);
  
  const c = { q: 2, r: 3 };
  assert.strictEqual(manhattanDistance(a, c), 5);
});

console.log('\n【难度分级测试】\n');

test('应该能获取所有难度列表', () => {
  const difficulties = getAllDifficulties();
  assert.strictEqual(difficulties.length, 3);
  assert.strictEqual(difficulties[0].name, '简单');
  assert.strictEqual(difficulties[1].name, '普通');
  assert.strictEqual(difficulties[2].name, '困难');
});

test('应该能获取难度配置', () => {
  const config = getDifficultyConfig(AI_DIFFICULTY.HARD);
  assert.strictEqual(config.name, '困难');
  assert.strictEqual(config.useRandomness, false);
  assert.strictEqual(config.accuracy, 0.95);
});

test('难度代理应该应用随机性', () => {
  const baseAI = { enabled: true };
  const proxy = new AIDifficultyProxy(baseAI, AI_DIFFICULTY.EASY);
  
  const original = { type: 'attack', unitId: 'u1', target: {} };
  // 简单难度有30%概率随机行动
  const result = proxy.applyRandomness(original);
  assert.ok(result.hasOwnProperty('isRandom'));
});

test('难度比较应该正确', () => {
  assert.strictEqual(compareDifficulty(AI_DIFFICULTY.EASY, AI_DIFFICULTY.HARD), -2);
  assert.strictEqual(compareDifficulty(AI_DIFFICULTY.NORMAL, AI_DIFFICULTY.NORMAL), 0);
  assert.strictEqual(compareDifficulty(AI_DIFFICULTY.HARD, AI_DIFFICULTY.EASY), 2);
});

test('难度代理应该返回正确的思考延迟', () => {
  const proxyEasy = new AIDifficultyProxy({}, AI_DIFFICULTY.EASY);
  assert.strictEqual(proxyEasy.getThinkDelay(), 500);
  
  const proxyHard = new AIDifficultyProxy({}, AI_DIFFICULTY.HARD);
  assert.strictEqual(proxyHard.getThinkDelay(), 1500);
});

console.log('\n【AI战斗控制器测试】\n');

test('AI战斗控制器应该能正确初始化', () => {
  const mockIntegrator = {
    getBattle: () => ({ units: [] }),
    getUnitStatus: (id) => null
  };
  const controller = new AICombatController(mockIntegrator, { difficulty: AI_DIFFICULTY.NORMAL });
  assert.strictEqual(controller.aiEngine.difficulty, AI_DIFFICULTY.NORMAL);
});

test('AI战斗控制器应该能注册和注销AI单位', () => {
  const mockIntegrator = {
    getBattle: () => ({ units: [] }),
    getUnitStatus: (id) => null
  };
  const controller = new AICombatController(mockIntegrator);
  
  controller.registerAIUnit('ai_1', 'earth');
  assert.strictEqual(controller.aiEngine.isAIUnit('ai_1'), true);
  
  controller.unregisterAIUnit('ai_1');
  assert.strictEqual(controller.aiEngine.isAIUnit('ai_1'), false);
});

test('AI战斗控制器应该能设置难度', () => {
  const mockIntegrator = {
    getBattle: () => ({ units: [] }),
    getUnitStatus: (id) => null
  };
  const controller = new AICombatController(mockIntegrator);
  
  controller.setDifficulty(AI_DIFFICULTY.HARD);
  assert.strictEqual(controller.aiEngine.difficulty, AI_DIFFICULTY.HARD);
});

test('AI战斗控制器应该能启用和禁用', () => {
  const mockIntegrator = {
    getBattle: () => ({ units: [] }),
    getUnitStatus: (id) => null
  };
  const controller = new AICombatController(mockIntegrator);
  
  controller.enable();
  assert.strictEqual(controller.isRunning, true);
  
  controller.disable();
  assert.strictEqual(controller.isRunning, false);
});

test('AI战斗控制器应该能获取状态', () => {
  const mockIntegrator = {
    getBattle: () => ({ units: [] }),
    getUnitStatus: (id) => null
  };
  const controller = new AICombatController(mockIntegrator, { difficulty: AI_DIFFICULTY.NORMAL });
  
  const state = controller.getState();
  assert.strictEqual(state.enabled, true);
  assert.strictEqual(state.difficulty, AI_DIFFICULTY.NORMAL);
  assert.strictEqual(state.difficultyConfig.name, '普通');
});

test('AI战斗控制器应该能获取可用难度列表', () => {
  const mockIntegrator = {
    getBattle: () => ({ units: [] }),
    getUnitStatus: (id) => null
  };
  const controller = new AICombatController(mockIntegrator);
  
  const difficulties = controller.getAvailableDifficulties();
  assert.strictEqual(difficulties.length, 3);
});

test('AI战斗控制器应该能监听事件', () => {
  const mockIntegrator = {
    getBattle: () => ({ units: [] }),
    getUnitStatus: (id) => null
  };
  const controller = new AICombatController(mockIntegrator);
  
  let eventFired = false;
  controller.on('difficulty_changed', () => { eventFired = true; });
  
  controller.setDifficulty(AI_DIFFICULTY.HARD);
  assert.strictEqual(eventFired, true);
});

console.log('\n【伤害修正测试】\n');

test('困难难度应该增加AI伤害', () => {
  const proxy = new AIDifficultyProxy({}, AI_DIFFICULTY.HARD);
  const damage = proxy.applyDamage(100, false);
  assert.strictEqual(damage, 110); // 1.1x
});

test('简单难度应该减少AI伤害', () => {
  const proxy = new AIDifficultyProxy({}, AI_DIFFICULTY.EASY);
  const damage = proxy.applyDamage(100, false);
  assert.strictEqual(damage, 80); // 0.8x
});

test('简单难度应该增加AI承受伤害', () => {
  const proxy = new AIDifficultyProxy({}, AI_DIFFICULTY.EASY);
  const damage = proxy.applyDamage(100, true);
  assert.strictEqual(damage, 120); // 1.2x
});

test('困难难度应该减少AI承受伤害', () => {
  const proxy = new AIDifficultyProxy({}, AI_DIFFICULTY.HARD);
  const damage = proxy.applyDamage(100, true);
  assert.strictEqual(damage, 90); // 0.9x
});

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('测试结果汇总');
console.log('═══════════════════════════════════════════════════════════════');
console.log(`总计: ${testsPassed + testsFailed} 个测试`);
console.log(`✅ 通过: ${testsPassed}`);
console.log(`❌ 失败: ${testsFailed}`);
console.log('═══════════════════════════════════════════════════════════════\n');

if (testsFailed > 0) {
  process.exit(1);
} else {
  console.log('所有测试通过！✅\n');
}
