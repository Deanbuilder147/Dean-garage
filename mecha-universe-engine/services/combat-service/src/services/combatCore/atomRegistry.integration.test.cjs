/**
 * 第一顺位：atomRegistry → effectExecutor 端到端映射集成测试（2026-08-23）
 * 验证：① 所有注册语义名的 handlerKey 真实对应 effectExecutor 上的真实 handler 方法
 *      ② B 类新原子（TARGET/DISPLACE/SPAWN/ENTRY/CLEANUP/COST）经 resolve 后能被引擎真实执行
 *
 * 注：effectExecutor.handlers 在部分运行环境下因 Function.bind patch 返回 stub，
 * 故端到端执行统一通过「语义名 → handlerKey → 真实方法(executor.handleX)」直接调用，
 * 与 skillExecutor 正式 dispatch 路径在真实 Node 下行为一致。
 */

const assert = require('assert');
const atomRegistry = require('./atomRegistry.cjs');
const executor = require('./effectExecutor.cjs');
const configLoader = require('./configLoader.cjs');

// handlerKey → 真实实例方法名
const METHOD_OF = {
  resolve_target: 'handleResolveTarget',
  displace: 'handleDisplace',
  spawn_unit: 'handleSpawnUnit',
  trigger_entry: 'handleTriggerEntry',
  remove_buff: 'handleRemoveBuff',
  modify_stat: 'handleModifyStat',
  cost_ap: 'handleCostAp',
  cost_energy: 'handleCostEnergy',
  cost_durability: 'handleCostDurability',
};

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (e) { console.log(`  ❌ ${name}\n     ${e.message}`); failed++; }
}

console.log('══════ 第一顺位 atomRegistry → effectExecutor 集成测试 ══════\n');

// ① 全量 handlerKey → 引擎 handlers 存在性（真实环境 handlerMap 全注册）
const metas = atomRegistry.listMeta();
test(`所有 ${metas.length} 个注册语义名的 handlerKey 真实存在`, () => {
  const missing = [];
  for (const m of metas) {
    if (!m.handlerKey || m.handlerKey === '_modifier') continue;
    if (typeof executor.handlers[m.handlerKey] !== 'function') {
      missing.push(`${m.semantic} → ${m.handlerKey}`);
    }
  }
  if (missing.length) throw new Error('缺失 handler: ' + missing.join(', '));
});

// 工具：resolve 后直接调真实方法执行（handler 均为 async，需 await）
async function runAtom(atom, ctx) {
  const resolved = atomRegistry.resolve(atom);
  const method = METHOD_OF[resolved.type];
  assert.ok(method && typeof executor[method] === 'function', `无真实方法对应 ${resolved.type}`);
  return await executor[method].call(executor, resolved, ctx);
}

// ② B_TARGET → resolve_target
test('B_TARGET 经 resolve 后引擎执行（写 context.resolvedTargets）', async () => {
  const atom = { type: 'B_TARGET', scope: 'self', radius: 1 };
  const resolved = atomRegistry.resolve(atom);
  assert.strictEqual(resolved.type, 'resolve_target');
  assert.strictEqual(resolved.target_scope, 'self'); // paramMap 生效
  const ctx = { unit: { id: 'a', q: 0, r: 0 }, allUnits: [{ id:'a', q: 0, r: 0 }] };
  const r = await runAtom(atom, ctx);
  assert.strictEqual(r.success, true);
  assert.strictEqual(ctx.resolvedTargets.length, 1);
});

// ③ B_DISPLACE → displace（fixed6 三分法）
test('B_DISPLACE 经 resolve 后执行位移三分法', async () => {
  const atom = { type: 'B_DISPLACE', direction: 'fixed6', fixed_dir: 0, cells: 2, target_scope: 'self' };
  const resolved = atomRegistry.resolve(atom);
  assert.strictEqual(resolved.type, 'displace');
  assert.strictEqual(resolved.mode, 'fixed6'); // paramMap 生效
  assert.strictEqual(resolved.steps, 2);
  const u = { id: 'a', q: 0, r: 0 };
  await runAtom(atom, { unit: u, allUnits: [u] });
  assert.strictEqual(u.q, 2); assert.strictEqual(u.r, 0);
});

// ④ B_SPAWN → spawn_unit 三路同步
test('First顺位 B_SPAWN 经 resolve 后执行召唤（三处注册）', async () => {
  const atom = { type: 'B_SPAWN', entity_type: 'drone', count: 1, unit_id: 'd1', q: 1, r: 1 };
  const resolved = atomRegistry.resolve(atom);
  assert.strictEqual(resolved.type, 'spawn_unit');
  assert.strictEqual(resolved.role, 'drone'); // paramMap 生效
  const allUnits = [{ id: 's', q: 0, r: 0 }];
  const battleState = { units: new Map(), turnOrder: [] };
  await runAtom(atom, { unit: allUnits[0], allUnits, battleState });
  assert.ok(battleState.units.has('d1'));
  assert.ok(battleState.turnOrder.includes('d1'));
});

// ⑤ B_CLEANUP → remove_buff（undispellable 护栏）
test('B_CLEANUP 经 resolve 后执行驱散（含 undispellable 拦截）', async () => {
  const atom = { type: 'B_CLEANUP', buff_key: 'x', scope: 'target' };
  const resolved = atomRegistry.resolve(atom);
  assert.strictEqual(resolved.type, 'remove_buff');
  assert.strictEqual(resolved.target, 'target'); // paramMap 生效
  const target = { statusEffects: [
    { key: 'x', op: 'add', value: 1, duration: 2 },
    { key: 'y', op: 'add', value: 1, duration: 2, undispellable: true },
  ] };
  const r = await runAtom(atom, { target, allUnits: [target] });
  assert.strictEqual(r.removed_count, 1);
});

// ⑥ B_ENTRY → trigger_entry（需临时词条）
const TEST_ENTRY = 'b7_integration_entry';
(function setup() {
  const cfg = configLoader.getGlossaryConfig() || { skills: {} };
  cfg.skills = cfg.skills || {};
  cfg.skills[TEST_ENTRY] = { key: TEST_ENTRY, schema_version: 2, effects: [
    { type: 'modify_stat', stat_type: 'melee_attack', op: 'add', value: 1, duration: 1, target_scope: 'self' },
  ] };
  configLoader.saveGlossaryConfig(cfg);
})();
try {
  test('B_ENTRY 经 resolve 后执行词条联动', async () => {
    const atom = { type: 'B_ENTRY', entry_id: TEST_ENTRY };
    const resolved = atomRegistry.resolve(atom);
    assert.strictEqual(resolved.type, 'trigger_entry');
    assert.strictEqual(resolved.entry_key, TEST_ENTRY); // paramMap 生效
    const u = { id: 'a', q: 0, r: 0, statusEffects: [] };
    const r = await runAtom(atom, { unit: u, allUnits: [u] });
    assert.strictEqual(r.success, true);
    assert.strictEqual(u.statusEffects.length, 1);
    assert.strictEqual(atomRegistry.validateEntryExists(TEST_ENTRY), true);
  });
} finally {
  configLoader.deleteSkills([TEST_ENTRY]);
}

// ⑦ A_APPLY_VALUE → modify_stat（B.6 栈）
test('A_APPLY_VALUE 经 resolve 后执行数值应用（入栈）', async () => {
  const atom = { type: 'A_APPLY_VALUE', stat: 'melee_attack', value: 3, duration: 2 };
  const resolved = atomRegistry.resolve(atom);
  assert.strictEqual(resolved.type, 'modify_stat');
  const u = { id: 'a', q: 0, r: 0, statusEffects: [] };
  await runAtom(atom, { unit: u, allUnits: [u] });
  assert.strictEqual(u.statusEffects.length, 1);
  assert.strictEqual(u.statusEffects[0].stat_type, 'melee_attack');
});

// ⑧ C_*_COST → 真实消耗 handler
test('C_AP_COST / C_ENERGY_COST / C_DURABILITY_COST 经 resolve 后真实扣减', async () => {
  const apUnit = { id: 'a', ap: 10, statusEffects: [] };
  const r1 = await runAtom({ type: 'C_AP_COST', amount: 3, target_scope: 'self' }, { unit: apUnit, allUnits: [apUnit] });
  assert.strictEqual(r1.success, true); assert.strictEqual(apUnit.ap, 7);

  const enUnit = { id: 'e', energy: 5, statusEffects: [] };
  const r2 = await runAtom({ type: 'C_ENERGY_COST', amount: 2, target_scope: 'self' }, { unit: enUnit, allUnits: [enUnit] });
  assert.strictEqual(enUnit.energy, 3);

  const durUnit = { id: 'd', _meta: { durability: { body: 4 } }, statusEffects: [] };
  const r3 = await runAtom({ type: 'C_DURABILITY_COST', amount: 1, slot: 'body', target_scope: 'self' }, { unit: durUnit, allUnits: [durUnit] });
  assert.strictEqual(durUnit._meta.durability.body, 3);
});

// ⑨ 直通策略：未注册 type 原样委托引擎
test('直通策略：未注册 type 原样委托引擎', () => {
  const atom = { type: 'direct_damage', amount: 5, target_scope: 'primary' };
  const resolved = atomRegistry.resolve(atom);
  assert.strictEqual(resolved.type, 'direct_damage');
  assert.strictEqual(resolved._semantic, undefined);
});

console.log(`\n结果：通过 ${passed}，失败 ${failed}`);
process.exit(failed === 0 ? 0 : 1);
