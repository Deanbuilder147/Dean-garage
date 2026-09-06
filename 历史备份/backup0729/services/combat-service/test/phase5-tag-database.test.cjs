/**
 * Phase 5: 完整词条数据库测试
 */

const assert = require('assert');

// 加载模块
const TagDatabaseManager = require('../src/services/combatCore/tagDatabaseManager.cjs');
const { PriorityQueue, TagQueue, ActionQueue } = require('../src/services/combatCore/priorityQueue.cjs');
const TagChainManager = require('../src/services/combatCore/tagChainManager.cjs');
const CombatIntegrator = require('../src/services/combatCore/combatIntegrator.cjs');

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

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('【Phase 5: 完整词条数据库测试】');
console.log('═══════════════════════════════════════════════════════════════\n');

// ============================================
// PriorityQueue 测试
// ============================================
console.log('【PriorityQueue 优先级队列测试】');

test('应该正确入队和出队', () => {
  const queue = new PriorityQueue();
  queue.enqueue({ id: 'a' }, 1);
  queue.enqueue({ id: 'b' }, 2);
  queue.enqueue({ id: 'c' }, 3);

  assert.strictEqual(queue.size, 3);

  const first = queue.dequeue();
  assert.strictEqual(first.success, true);
  assert.strictEqual(first.element.data.id, 'c'); // 高优先级先出
});

test('应该按优先级自动排序', () => {
  const queue = new PriorityQueue();
  queue.enqueue({ id: 'low' }, 1);
  queue.enqueue({ id: 'high' }, 10);
  queue.enqueue({ id: 'mid' }, 5);

  const items = queue.toArray();
  assert.strictEqual(items[0].id, 'high');
  assert.strictEqual(items[1].id, 'mid');
  assert.strictEqual(items[2].id, 'low');
});

test('应该支持按ID移除', () => {
  const queue = new PriorityQueue();
  queue.enqueue({ id: 'a' }, 1);
  queue.enqueue({ id: 'b' }, 2);

  const result = queue.remove('a');
  assert.strictEqual(result.success, true);
  assert.strictEqual(queue.size, 1);
});

test('应该支持更新优先级', () => {
  const queue = new PriorityQueue();
  queue.enqueue({ id: 'a' }, 1);
  queue.enqueue({ id: 'b' }, 2);

  queue.updatePriority('a', 10);
  const items = queue.toArray();
  assert.strictEqual(items[0].id, 'a');
});

// ============================================
// TagQueue 测试
// ============================================
console.log('\n【TagQueue 词条队列测试】');

test('应该按优先级和入队时间排序', () => {
  const queue = new TagQueue();
  queue.enqueueTag({ id: 'tag1', params: { priority: 5 } });
  queue.enqueueTag({ id: 'tag2', params: { priority: 5 } });
  queue.enqueueTag({ id: 'tag3', params: { priority: 10 } });

  const items = queue.toArray();
  assert.strictEqual(items[0].id, 'tag3'); // 高优先级
  assert.strictEqual(items[1].id, 'tag1'); // 同优先级先入先出
  assert.strictEqual(items[2].id, 'tag2');
});

test('应该按阶段过滤词条', () => {
  const queue = new TagQueue();
  queue.enqueueTag({ id: 'tag1', trigger: { phase: 'pre_attack' } });
  queue.enqueueTag({ id: 'tag2', trigger: { phase: 'post_damage' } });
  queue.enqueueTag({ id: 'tag3', trigger: { phase: 'pre_attack' } });

  const phaseTags = queue.getByPhase('pre_attack');
  assert.strictEqual(phaseTags.length, 2);
});

// ============================================
// TagDatabaseManager 测试
// ============================================
console.log('\n【TagDatabaseManager 词条数据库测试】');

test('应该正确注册词条', () => {
  const db = Object.create(TagDatabaseManager);
  db.tags = new Map();
  db.loaded = true;

  const tag = {
    id: 'test_tag',
    name: '测试词条',
    trigger: { phase: 'post_damage' },
    effects: [{ type: 'damage_reduction', value: 2 }]
  };

  const result = db.register(tag);
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.action, 'created');
});

test('应该拒绝无效词条', () => {
  const db = Object.create(TagDatabaseManager);
  db.tags = new Map();
  db.loaded = true;

  const invalidTag = {
    id: 'invalid',
    name: '无效词条'
    // 缺少 trigger 和 effects
  };

  assert.throws(() => db.register(invalidTag), /缺少必需字段/);
});

test('应该验证trigger.phase', () => {
  const db = Object.create(TagDatabaseManager);
  db.tags = new Map();
  db.loaded = true;

  const tag = {
    id: 'test',
    name: '测试',
    trigger: { phase: 'invalid_phase' },
    effects: [{ type: 'damage_reduction' }]
  };

  assert.throws(() => db.register(tag), /无效的 trigger.phase/);
});

test('应该正确查询词条', () => {
  const db = Object.create(TagDatabaseManager);
  db.tags = new Map();
  db.loaded = true;

  db.tags.set('tag1', { id: 'tag1', name: '攻击', trigger: { phase: 'pre_attack' }, effects: [] });
  db.tags.set('tag2', { id: 'tag2', name: '防御', trigger: { phase: 'on_damage_taken' }, effects: [] });

  const byPhase = db.getByPhase('pre_attack');
  assert.strictEqual(byPhase.length, 1);
  assert.strictEqual(byPhase[0].id, 'tag1');
});

test('应该搜索词条', () => {
  const db = Object.create(TagDatabaseManager);
  db.tags = new Map();
  db.loaded = true;

  db.tags.set('execute', { id: 'execute', name: '斩杀', trigger: { phase: 'post_damage' }, effects: [] });
  db.tags.set('resist', { id: 'resist', name: '抗性', trigger: { phase: 'on_damage_taken' }, effects: [] });

  const results = db.search('斩');
  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].id, 'execute');
});

test('应该导出为JSON', () => {
  const db = Object.create(TagDatabaseManager);
  db.tags = new Map();
  db.versions = [];
  db.loaded = true;

  db.tags.set('test', { id: 'test', name: '测试', trigger: { phase: 'pre_attack' }, effects: [] });

  const exportData = db.export();
  assert.strictEqual(exportData.count, 1);
  assert.strictEqual(exportData.tags.length, 1);
});

test('应该导出为Markdown', () => {
  const db = Object.create(TagDatabaseManager);
  db.tags = new Map();
  db.versions = [];
  db.loaded = true;

  db.tags.set('test', { id: 'test', name: '测试', trigger: { phase: 'pre_attack' }, effects: [] });

  const md = db.exportAs('markdown');
  assert.strictEqual(md.includes('# 词条数据库'), true);
  assert.strictEqual(md.includes('## pre_attack'), true);
});

test('应该获取数据库统计', () => {
  const db = Object.create(TagDatabaseManager);
  db.tags = new Map();
  db.versions = [];
  db.loaded = true;

  db.tags.set('tag1', { id: 'tag1', trigger: { phase: 'pre_attack' }, effects: [] });
  db.tags.set('tag2', { id: 'tag2', trigger: { phase: 'pre_attack' }, effects: [] });
  db.tags.set('tag3', { id: 'tag3', trigger: { phase: 'post_damage' }, effects: [] });

  const stats = db.getStats();
  assert.strictEqual(stats.total, 3);
  assert.strictEqual(stats.byPhase.pre_attack, 2);
  assert.strictEqual(stats.byPhase.post_damage, 1);
});

// ============================================
// TagChainManager 测试
// ============================================
console.log('\n【TagChainManager 词条链管理测试】');

test('应该定义词条链', () => {
  const manager = Object.create(TagChainManager);
  manager.chains = new Map();
  manager.conflicts = new Map();
  manager.activeChains = new Map();
  manager.combinations = new Map();
  manager.stats = { triggered: 0, skipped: 0, conflicts: 0, byChain: {} };

  const result = manager.defineChain('earth_attack', {
    name: '地球联合攻击链',
    tags: ['execute', 'focused_shot'],
    exclusive: true,
    priority: 10
  });

  assert.strictEqual(result.success, true);
  assert.strictEqual(manager.chains.has('earth_attack'), true);
});

test('应该检测独占冲突', () => {
  const manager = Object.create(TagChainManager);
  manager.chains = new Map();
  manager.conflicts = new Map();
  manager.activeChains = new Map();
  manager.combinations = new Map();
  manager.stats = { triggered: 0, skipped: 0, conflicts: 0, byChain: {} };

  manager.defineChain('chain1', {
    name: '链1',
    tags: ['execute', 'focused_shot'],
    exclusive: true
  });

  manager.defineChain('chain2', {
    name: '链2',
    tags: ['execute', 'resist'], // 与chain1共享execute
    exclusive: true
  });

  // 激活chain1
  manager.activateChain('chain1', {});

  // 尝试激活chain2应该失败
  const result = manager.activateChain('chain2', {});
  assert.strictEqual(result.success, false);
  assert.strictEqual(result.reason, 'conflict');
});

test('应该检查词条冲突', () => {
  const manager = Object.create(TagChainManager);
  manager.chains = new Map();
  manager.conflicts = new Map();
  manager.activeChains = new Map();
  manager.combinations = new Map();
  manager.stats = { triggered: 0, skipped: 0, conflicts: 0, byChain: {} };

  manager.defineChain('test_chain', {
    name: '测试链',
    tags: ['execute', 'focused_shot'],
    exclusive: true
  });

  manager.activateChain('test_chain', {});

  const conflicts = manager.checkConflicts('execute');
  assert.strictEqual(conflicts.includes('focused_shot'), true);
});

test('应该检查组合词条', () => {
  const manager = Object.create(TagChainManager);
  manager.chains = new Map();
  manager.conflicts = new Map();
  manager.activeChains = new Map();
  manager.combinations = new Map();
  manager.stats = { triggered: 0, skipped: 0, conflicts: 0, byChain: {} };

  manager.defineCombination('combo1', {
    name: '超级组合',
    requiredTags: ['execute', 'focused_shot'],
    bonusEffects: [{ type: 'damage_bonus_dice' }],
    bonusPriority: 20
  });

  const combos = manager.checkCombinations(['execute', 'focused_shot', 'resist']);
  assert.strictEqual(combos.length, 1);
  assert.strictEqual(combos[0].id, 'combo1');
});

test('应该激活和停用词条链', () => {
  const manager = Object.create(TagChainManager);
  manager.chains = new Map();
  manager.conflicts = new Map();
  manager.activeChains = new Map();
  manager.combinations = new Map();
  manager.stats = { triggered: 0, skipped: 0, conflicts: 0, byChain: {} };

  manager.defineChain('test', { name: '测试', tags: ['tag1'] });

  manager.activateChain('test', {});
  assert.strictEqual(manager.activeChains.has('test'), true);

  manager.deactivateChain('test');
  assert.strictEqual(manager.activeChains.has('test'), false);
});

test('应该获取链摘要', () => {
  const manager = Object.create(TagChainManager);
  manager.chains = new Map();
  manager.conflicts = new Map();
  manager.activeChains = new Map();
  manager.combinations = new Map();
  manager.stats = { triggered: 0, skipped: 0, conflicts: 0, byChain: {} };

  manager.defineChain('test', { name: '测试', tags: ['tag1'], priority: 5 });
  manager.activateChain('test', {});

  const summary = manager.getChainSummary('test');
  assert.strictEqual(summary.id, 'test');
  assert.strictEqual(summary.isActive, true);
  assert.strictEqual(summary.priority, 5);
});

test('应该获取所有链摘要', () => {
  const manager = Object.create(TagChainManager);
  manager.chains = new Map();
  manager.conflicts = new Map();
  manager.activeChains = new Map();
  manager.combinations = new Map();
  manager.stats = { triggered: 0, skipped: 0, conflicts: 0, byChain: {} };

  manager.defineChain('chain1', { name: '链1', tags: ['tag1'] });
  manager.defineChain('chain2', { name: '链2', tags: ['tag2'] });

  const summaries = manager.getAllChainSummaries();
  assert.strictEqual(summaries.length, 2);
});

// ============================================
// CombatIntegrator 测试
// ============================================
console.log('\n【CombatIntegrator 战斗集成器测试】');

test('应该正确初始化', async () => {
  const integrator = Object.create(CombatIntegrator);
  integrator.battle = null;
  integrator.unitStates = new Map();
  integrator.history = [];
  integrator.initialized = false;

  const result = await integrator.initialize();
  assert.strictEqual(result.status, 'initialized');
  assert.strictEqual(integrator.initialized, true);
});

test('应该创建战斗', () => {
  const integrator = Object.create(CombatIntegrator);
  integrator.battle = null;
  integrator.unitStates = new Map();
  integrator.history = [];
  integrator.initialized = true;

  const result = integrator.createBattle({
    id: 'battle_test',
    units: [
      { id: 'unit1', name: '单位1', hp: 100, faction: 'earth' },
      { id: 'unit2', name: '单位2', hp: 80, faction: 'bailun' }
    ]
  });

  assert.strictEqual(result.battleId, 'battle_test');
  assert.strictEqual(integrator.battle.state, 'created');
  assert.strictEqual(integrator.unitStates.size, 2);
});

test('应该获取战斗状态', () => {
  const integrator = Object.create(CombatIntegrator);
  integrator.battle = {
    id: 'battle_1',
    round: 1,
    turn: 2,
    phase: 'action',
    state: 'active',
    units: new Map([['unit1', { id: 'unit1' }]]),
    turnOrder: ['unit1'],
    currentUnitIndex: 0
  };
  integrator.unitStates = new Map([['unit1', { hp: 100, buffs: [], isDead: false }]]);
  integrator.history = [];

  const state = integrator.getBattleState();
  assert.strictEqual(state.id, 'battle_1');
  assert.strictEqual(state.round, 1);
  assert.strictEqual(state.turn, 2);
  assert.strictEqual(state.phase, 'action');
  assert.strictEqual(state.units.length, 1);
});

test('应该添加buff', () => {
  const integrator = Object.create(CombatIntegrator);
  integrator.unitStates = new Map([['unit1', { buffs: [] }]]);

  const result = integrator.addBuff('unit1', {
    id: 'attack_buff',
    name: '攻击增强',
    type: 'attack_buff',
    value: 3,
    duration: 2
  });

  assert.strictEqual(result.success, true);
  assert.strictEqual(integrator.unitStates.get('unit1').buffs.length, 1);
});

test('应该获取单位状态', () => {
  const integrator = Object.create(CombatIntegrator);
  integrator.unitStates = new Map([['unit1', { hp: 100, buffs: [] }]]);

  const state = integrator.getUnitState('unit1');
  assert.strictEqual(state.hp, 100);
});

test('应该结束战斗并返回结果', () => {
  const integrator = Object.create(CombatIntegrator);
  integrator.battle = {
    id: 'battle_end',
    state: 'active',
    round: 5,
    turn: 10,
    createdAt: Date.now() - 60000,
    units: new Map()
  };
  integrator.unitStates = new Map([
    ['unit1', { hp: 50, isDead: false }],
    ['unit2', { hp: 0, isDead: true }]
  ]);
  integrator.history = [];

  const result = integrator.endBattle();
  assert.strictEqual(result.battleId, 'battle_end');
  assert.deepStrictEqual(result.survivors, ['unit1']);
  assert.strictEqual(result.totalRounds, 5);
});

test('应该重置集成器', () => {
  const integrator = Object.create(CombatIntegrator);
  integrator.battle = { id: 'test' };
  integrator.unitStates = new Map([['unit1', {}]]);
  integrator.history = [{ type: 'test' }];

  integrator.reset();
  assert.strictEqual(integrator.battle, null);
  assert.strictEqual(integrator.unitStates.size, 0);
  assert.strictEqual(integrator.history.length, 0);
});

// ============================================
// 集成测试
// ============================================
console.log('\n【集成测试】');

test('完整流程：词条链 → 优先级队列 → 战斗集成', () => {
  // 1. 创建词条链
  const chainManager = Object.create(TagChainManager);
  chainManager.chains = new Map();
  chainManager.conflicts = new Map();
  chainManager.activeChains = new Map();
  chainManager.combinations = new Map();
  chainManager.stats = { triggered: 0, skipped: 0, conflicts: 0, byChain: {} };

  chainManager.defineChain('earth_chain', {
    name: '地球联合链',
    tags: ['execute', 'focused_shot'],
    exclusive: true,
    priority: 10
  });

  chainManager.activateChain('earth_chain', {});

  // 2. 使用优先级队列
  const queue = new TagQueue();
  const chain = chainManager.chains.get('earth_chain');
  for (const tagId of chain.tags) {
    queue.enqueueTag({ id: tagId, params: { priority: chain.priority } });
  }

  assert.strictEqual(queue.size, 2);

  // 3. 战斗集成
  const integrator = Object.create(CombatIntegrator);
  integrator.battle = null;
  integrator.unitStates = new Map();
  integrator.history = [];
  integrator.initialized = true;

  integrator.createBattle({
    id: 'integration_test',
    units: [
      { id: 'unit1', name: '单位1', hp: 100, equipped_tags: ['execute', 'focused_shot'] }
    ]
  });

  const state = integrator.getBattleState();
  // state.units[0].state 包含 unit, hp, buffs, tags 等属性
  assert.strictEqual(state.units[0].state.tags.length, 2);
});

// ============================================
// 测试统计
// ============================================
console.log('\n═══════════════════════════════════════════════════════════════');
console.log(`总计: ${passed + failed} 个测试`);
console.log(`✅ 通过: ${passed}`);
console.log(`❌ 失败: ${failed}`);
console.log('═══════════════════════════════════════════════════════════════\n');

process.exit(failed > 0 ? 1 : 0);
