/**
 * B.1 位移三分法 + B.4 目标解析测试（2026-08-23）
 */

const assert = require('assert');
const executor = require('./effectExecutor.cjs');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (e) { console.log(`  ❌ ${name}\n     ${e.message}`); failed++; }
}

function unit(id, q, r) {
  return { id, q, r, _meta: { flags: {}, charge_layers: {}, durability: {}, permanently_disabled_skills: [] } };
}

console.log('══════ B.1 位移三分法 + B.4 目标解析测试 ══════\n');

// B.1 fixed6：方向 0 = (+1,0)，steps=2
test('fixed6 固定六向位移', async () => {
  const u = unit('a', 0, 0);
  const ctx = { unit: u, allUnits: [u] };
  const r = await executor.handleDisplace({ mode: 'fixed6', dir: 0, steps: 2, target_scope: 'self' }, ctx);
  assert.strictEqual(u.q, 2); assert.strictEqual(u.r, 0);
  assert.strictEqual(r.mode, 'fixed6');
});

// B.1 fixed6 方向 2 = (0,-1)
test('fixed6 方向2 (0,-1)', async () => {
  const u = unit('a', 5, 5);
  const r = await executor.handleDisplace({ mode: 'fixed6', dir: 2, steps: 1, target_scope: 'self' }, { unit: u, allUnits: [u] });
  assert.strictEqual(u.q, 5); assert.strictEqual(u.r, 4);
});

// B.1 relative：释放者(0,0) → 目标(2,0) 指向，steps=1 应沿 +q 推离
test('relative 相对方向位移（远离施法者）', async () => {
  const src = unit('s', 0, 0);
  const tgt = unit('t', 2, 0);
  const r = await executor.handleDisplace({ mode: 'relative', steps: 1, target_scope: 'primary' }, { unit: src, target: tgt, allUnits: [src, tgt] });
  assert.strictEqual(tgt.q, 3); assert.strictEqual(tgt.r, 0); // 沿 dq=+1 推 1 格
});

// B.1 random：seed=3 → dir=3=(-1,0)
test('random 随机六向（seed确定性）', async () => {
  const u = unit('a', 0, 0);
  const r = await executor.handleDisplace({ mode: 'random', steps: 1, seed: 3, target_scope: 'self' }, { unit: u, allUnits: [u] });
  assert.strictEqual(u.q, -1); assert.strictEqual(u.r, 0);
});

// 旧式兼容 dx/dy
test('旧式 dx/dy 偏移兼容', async () => {
  const u = unit('a', 0, 0);
  const r = await executor.handleDisplace({ dx: 1, dy: -1, target_scope: 'self' }, { unit: u, allUnits: [u] });
  assert.strictEqual(u.q, 1); assert.strictEqual(u.r, -1);
});

// B.4 目标解析：area scope + radius
test('B.4 目标解析 area + radius', async () => {
  const src = unit('s', 0, 0);
  const near = unit('n', 1, 0);   // 距离1
  const far = unit('f', 5, 5);    // 距离远
  const ctx = { unit: src, allUnits: [src, near, far] };
  const r = await executor.handleResolveTarget({ target_scope: 'area', area_radius: 1 }, ctx);
  assert.strictEqual(r.count, 2);
  assert.deepStrictEqual(r.unit_ids.sort(), ['s', 'n']);
  assert.strictEqual(ctx.resolvedTargets.length, 2);
});

// B.4 自定义 store_as
test('B.4 自定义 store_as 存储键', async () => {
  const src = unit('s', 0, 0);
  const ctx = { unit: src, allUnits: [src] };
  const r = await executor.handleResolveTarget({ target_scope: 'self', store_as: 'myTargets' }, ctx);
  assert.strictEqual(ctx.myTargets.length, 1);
  assert.strictEqual(ctx.myTargets[0].id, 's');
});

console.log(`\n结果：通过 ${passed}，失败 ${failed}`);
process.exit(failed === 0 ? 0 : 1);
