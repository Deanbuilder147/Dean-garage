/**
 * G_block_movement 消费侧闭环测试（2026-08-23）
 * 验证：
 *  ① handleBlockMovement 真实写入 target._meta.flags.block_movement + block_movement_until
 *  ② 移动拦截判定（与 backend-gateway combat.ts /move 内联逻辑一致）正确拦截/放行
 *  ③ 到期自动恢复（round > until 时放行）
 */
const assert = require('assert');
const { createRequire } = require('module');
const req = createRequire(__filename);
const atomRegistry = req('./atomRegistry.cjs');
const effectExecutor = req('./effectExecutor.cjs');

// 与 combat.ts /move 内联拦截逻辑保持一致
function isMovementBlocked(unit, round) {
  const bmFlags = unit && unit._meta && unit._meta.flags;
  if (bmFlags && bmFlags.block_movement === true) {
    const until = typeof bmFlags.block_movement_until === 'number' ? bmFlags.block_movement_until : Infinity;
    if (round <= until) return { blocked: true, until_round: until === Infinity ? null : until };
  }
  return { blocked: false, until_round: null };
}

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (e) { console.log(`  ❌ ${name}\n     ${e.message}`); failed++; }
}

console.log('══════ G_block_movement 消费侧闭环测试 ══════\n');

test('① handleBlockMovement 真实写入阻断标记(含 duration)', async () => {
  const u = { id: 'u1', q: 5, r: 5, position: { q: 5, r: 5 }, currentStats: { hp: 100 }, _meta: { flags: {}, modifiers: {}, cooldowns: {} } };
  const ctx = { unit: u, allUnits: [u], target: u, targetUnit: u, battle: { units: [u], round: 3 }, _meta: { flags: {} } };
  const ex = atomRegistry.resolve({ type: 'G_block_movement', duration: 2 });
  const r = await effectExecutor.executeSync([ex], ctx);
  assert.strictEqual(u._meta.flags.block_movement, true, 'block_movement 标记未写入');
  assert.strictEqual(u._meta.flags.block_movement_until, 5, 'until 应为 round(3)+duration(2)=5');
  assert.strictEqual(r.applied[0].success, true);
});

test('② 拦截判定：生效期内请求移动被拒绝', () => {
  const u = { id: 'u1', _meta: { flags: { block_movement: true, block_movement_until: 5 } } };
  const r = isMovementBlocked(u, 4); // round 4 <= 5
  assert.strictEqual(r.blocked, true);
  assert.strictEqual(r.until_round, 5);
});

test('③ 到期自动恢复：round > until 时放行', () => {
  const u = { id: 'u1', _meta: { flags: { block_movement: true, block_movement_until: 5 } } };
  const r = isMovementBlocked(u, 6); // round 6 > 5
  assert.strictEqual(r.blocked, false, '到期后应放行');
});

test('④ 无 duration 的永久阻断：始终拦截', () => {
  const u = { id: 'u1', _meta: { flags: { block_movement: true } } };
  assert.strictEqual(isMovementBlocked(u, 999).blocked, true, '无 until 应视为永久阻断');
});

test('⑤ 无标记单位正常放行', () => {
  const u = { id: 'u1', _meta: { flags: {} } };
  assert.strictEqual(isMovementBlocked(u, 1).blocked, false);
});

console.log(`\n结果：通过 ${passed}，失败 ${failed}`);
process.exit(failed === 0 ? 0 : 1);
