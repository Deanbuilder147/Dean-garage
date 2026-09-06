/**
 * B.5 驱散 / 结算清理测试（2026-08-23，承接 B.6 状态栈）
 * 覆盖：指定 key 移除、全量清除、undispellable 免疫、移除后管线动态回退。
 */

const assert = require('assert');
const executor = require('./effectExecutor.cjs');
const BuffManager = require('./buffManager.cjs');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (e) { console.log(`  ❌ ${name}\n     ${e.message}`); failed++; }
}

function makeUnit(base) {
  return {
    baseStats: Object.assign({}, base || { melee_attack: 10 }),
    currentStats: Object.assign({}, base || { melee_attack: 10 }),
    statusEffects: [],
  };
}

console.log('══════ B.5 驱散 / 结算清理测试 ══════\n');

// 1. 指定 key 精准移除
test('指定 buff_key 移除匹配实例', async () => {
  const u = makeUnit();
  BuffManager.addStatModifier(u, { type: 'stat_modifier', key: 'atk_up', stat_type: 'melee_attack', op: 'add', value: 3, duration: 2 });
  BuffManager.addStatModifier(u, { type: 'stat_modifier', key: 'def_up', stat_type: 'melee_attack', op: 'add', value: 2, duration: 2 });
  const r = await executor.handleRemoveBuff({ buff_key: 'atk_up', target_unit: u }, {});
  assert.strictEqual(r.success, true);
  assert.strictEqual(r.removed_count, 1, '应移除1个');
  assert.deepStrictEqual(r.removed_keys, ['atk_up']);
  assert.strictEqual(u.statusEffects.length, 1, '残留1个');
  assert.strictEqual(u.statusEffects[0].key, 'def_up');
});

// 2. 全量清除（scope=all，无 key）
test('全量清除（保留 undispellable）', async () => {
  const u = makeUnit();
  BuffManager.addStatModifier(u, { type: 'stat_modifier', key: 'a', stat_type: 'melee_attack', op: 'add', value: 3, duration: 2 });
  BuffManager.addStatModifier(u, { type: 'stat_modifier', key: 'b', stat_type: 'melee_attack', op: 'add', value: 2, duration: 2 });
  BuffManager.addStatModifier(u, { type: 'stat_modifier', key: 'c', stat_type: 'melee_attack', op: 'add', value: 1, duration: 2, undispellable: true });
  const r = await executor.handleRemoveBuff({ target_unit: u }, {}); // 无 key → 全清
  assert.strictEqual(r.removed_count, 2, '应移除2个可驱散');
  assert.strictEqual(u.statusEffects.length, 1, 'undispellable 保留');
  assert.strictEqual(u.statusEffects[0].key, 'c');
});

// 3. undispellable 免疫指定 key 驱散
test('undispellable 实例对指定 key 驱散免疫', async () => {
  const u = makeUnit();
  BuffManager.addStatModifier(u, { type: 'stat_modifier', key: 'shield', stat_type: 'melee_attack', op: 'add', value: 5, duration: 3, undispellable: true });
  const r = await executor.handleRemoveBuff({ buff_key: 'shield', target_unit: u }, {});
  assert.strictEqual(r.removed_count, 0, '不可驱散应移除0');
  assert.strictEqual(u.statusEffects.length, 1, '实例保留');
});

// 4. 移除后管线数值动态回退（承接 B.6）
test('移除后 calculateEffectiveStat 动态回退', async () => {
  const u = makeUnit({ melee_attack: 10 });
  BuffManager.addStatModifier(u, { type: 'stat_modifier', key: 'atk_up', stat_type: 'melee_attack', op: 'add', value: 5, duration: 5 });
  assert.strictEqual(BuffManager.calculateEffectiveStat(u, 'melee_attack'), 15, '挂上后=15');
  const r = await executor.handleRemoveBuff({ buff_key: 'atk_up', target_unit: u }, {});
  assert.strictEqual(r.removed_count, 1);
  assert.strictEqual(BuffManager.calculateEffectiveStat(u, 'melee_attack'), 10, '移除后回退=10（无脏数据）');
});

// 5. 无目标返回失败
test('无目标返回失败', async () => {
  const r = await executor.handleRemoveBuff({ buff_key: 'x' }, {});
  assert.strictEqual(r.success, false);
  assert.strictEqual(r.reason, 'no_unit');
});

console.log(`\n结果：通过 ${passed}，失败 ${failed}`);
process.exit(failed === 0 ? 0 : 1);
