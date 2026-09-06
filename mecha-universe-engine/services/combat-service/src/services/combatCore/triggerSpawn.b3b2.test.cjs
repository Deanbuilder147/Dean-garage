/**
 * B.3 词条联动触发 + B.2 召唤生成 测试（2026-08-23）
 * 临时向真实 glossary 注入测试词条，测试后清理。
 */

const assert = require('assert');
const executor = require('./effectExecutor.cjs');
const configLoader = require('./configLoader.cjs');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (e) { console.log(`  ❌ ${name}\n     ${e.message}`); failed++; }
}

const TEST_ENTRY = 'b3_test_entry';
function unit(id, q, r) {
  return { id, q, r, _meta: { flags: {}, charge_layers: {}, durability: {}, permanently_disabled_skills: [] }, statusEffects: [] };
}

// 注入临时词条（effects 直接数组）
function injectEntry() {
  const cfg = configLoader.getGlossaryConfig() || { skills: {} };
  cfg.skills = cfg.skills || {};
  cfg.skills[TEST_ENTRY] = {
    key: TEST_ENTRY, schema_version: 2,
    effects: [
      { type: 'displace', dx: 1, dy: 0, target_scope: 'self' },
      { type: 'status', target_stat: 'melee_attack', value: 2, duration: 2 }, // → modify_stat +2
    ],
  };
  configLoader.saveGlossaryConfig(cfg);
}

console.log('══════ B.3 词条联动 + B.2 召唤 测试 ══════\n');

// 注入临时词条
injectEntry();
let cleanupOk = true;
try {
  // B.3 成功联动：displace + modify_stat
  test('B.3 联动已存在词条（位移+数值）', async () => {
    const u = unit('a', 0, 0);
    const r = await executor.handleTriggerEntry({ entry_key: TEST_ENTRY }, { unit: u, allUnits: [u] });
    assert.strictEqual(r.success, true, '应成功');
    assert.strictEqual(u.q, 1); assert.strictEqual(u.r, 0); // displace 生效
    assert.strictEqual(u.statusEffects.length, 1, 'modify_stat 应新增状态'); // 数值修饰入栈
  });

  // B.3 环路拦截：entry 自身联动自身
  test('B.3 自触发环路拦截 CIRCULAR_ENTRY_TRIGGER', async () => {
    const u = unit('a', 0, 0);
    const r = await executor.handleTriggerEntry(
      { entry_key: TEST_ENTRY },
      { unit: u, allUnits: [u], entryCallStack: new Set([TEST_ENTRY]), entryDepth: 1 }
    );
    assert.strictEqual(r.success, false);
    assert.strictEqual(r.reason, 'CIRCULAR_ENTRY_TRIGGER');
  });

  // B.3 深度上限拦截
  test('B.3 深度≥2 拦截 ENTRY_DEPTH_EXCEEDED', async () => {
    const u = unit('a', 0, 0);
    const r = await executor.handleTriggerEntry(
      { entry_key: TEST_ENTRY },
      { unit: u, allUnits: [u], entryCallStack: new Set(['other']), entryDepth: 2 }
    );
    assert.strictEqual(r.success, false);
    assert.strictEqual(r.reason, 'ENTRY_DEPTH_EXCEEDED');
  });

  // B.3 词条不存在
  test('B.3 entry_not_found', async () => {
    const u = unit('a', 0, 0);
    const r = await executor.handleTriggerEntry({ entry_key: 'no_such_entry_xyz' }, { unit: u, allUnits: [u] });
    assert.strictEqual(r.success, false);
    assert.strictEqual(r.reason, 'entry_not_found');
  });
} finally {
  cleanupOk = configLoader.deleteSkills([TEST_ENTRY]);
}

// B.2 召唤生成
test('B.2 召唤单位并同步注册三处', async () => {
  const src = unit('s', 0, 0);
  const allUnits = [src];
  const battleState = { units: new Map(), turnOrder: ['s'] };
  const r = await executor.handleSpawnUnit({ unit_id: 'sum1', q: 3, r: 4, role: 'summoned', hp: 5 }, { unit: src, allUnits, battleState });
  assert.strictEqual(r.success, true);
  assert.strictEqual(r.unit_id, 'sum1');
  // allUnits 已含
  assert.ok(allUnits.find((u) => u.id === 'sum1'), 'allUnits 应包含召唤体');
  // battleState.units Map
  assert.ok(battleState.units.has('sum1'), 'battleState.units 应包含召唤体');
  // turnOrder
  assert.ok(battleState.turnOrder.includes('sum1'), 'turnOrder 应包含召唤体');
  // 召唤体结构完整
  const su = battleState.units.get('sum1');
  assert.strictEqual(su.q, 3); assert.strictEqual(su.r, 4);
  assert.strictEqual(su.baseStats.hp, 5);
  assert.strictEqual(su._meta.is_summoned, true);
});

test('B.2 未指定坐标时相对施法者偏移生成', async () => {
  const src = unit('s', 2, 2);
  const battleState = { units: new Map(), turnOrder: [] };
  const r = await executor.handleSpawnUnit({}, { unit: src, allUnits: [src], battleState });
  assert.strictEqual(r.q, 3); assert.strictEqual(r.r, 2); // q+1 默认
});

console.log(`\n清理临时词条: ${cleanupOk ? 'OK' : 'FAILED'}`);
console.log(`结果：通过 ${passed}，失败 ${failed}`);
process.exit(failed === 0 && cleanupOk ? 0 : 1);
