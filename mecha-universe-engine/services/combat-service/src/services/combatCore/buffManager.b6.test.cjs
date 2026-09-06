/**
 * B.6 状态叠加语义与属性管线纯函数测试（2026-08-23，档位 X）
 * 覆盖：叠加三规则（同 key 同 val 续期 / 异 val 独立计时）、
 *       管线算值（base+add → ×(1+pct) → ×mult）、不可驱散标记、永久改 baseStats。
 */

const assert = require('assert');
const BuffManager = require('./buffManager.cjs');

let testsPassed = 0;
let testsFailed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✅ ${name}`); testsPassed++; }
  catch (e) { console.log(`  ❌ ${name}\n     ${e.message}`); testsFailed++; }
}

function makeUnit(base) {
  return {
    baseStats: Object.assign({}, base || { melee_attack: 10 }),
    currentStats: Object.assign({}, base || { melee_attack: 10 }),
    statusEffects: [],
  };
}

console.log('══════ B.6 状态叠加与属性管线测试 ══════\n');

// 规则 1：同 key 同 value 同 op → 续时长，不新增实例
test('规则1 同key同val续时长', () => {
  const u = makeUnit();
  BuffManager.addStatModifier(u, { type: 'stat_modifier', key: 'atk_up', stat_type: 'melee_attack', op: 'add', value: 3, duration: 2 });
  BuffManager.addStatModifier(u, { type: 'stat_modifier', key: 'atk_up', stat_type: 'melee_attack', op: 'add', value: 3, duration: 2 });
  assert.strictEqual(u.statusEffects.filter(e => e.type === 'stat_modifier').length, 1, '应只保留1个实例');
  const inst = u.statusEffects[0];
  assert.strictEqual(inst.consumption.remaining, 4, 'remaining 应为 2+2=4');
});

// 规则 2：异 value → 独立计时压栈
test('规则2 异val独立计时', () => {
  const u = makeUnit();
  BuffManager.addStatModifier(u, { type: 'stat_modifier', key: 'atk_up', stat_type: 'melee_attack', op: 'add', value: 3, duration: 2 });
  BuffManager.addStatModifier(u, { type: 'stat_modifier', key: 'atk_up', stat_type: 'melee_attack', op: 'add', value: 5, duration: 2 });
  assert.strictEqual(u.statusEffects.filter(e => e.type === 'stat_modifier').length, 2, '应有两个独立实例');
});

// 规则 3：管线算值顺序 base+add → ×(1+pct) → ×mult
test('管线算值 固定+百分比+倍率', () => {
  const u = makeUnit({ melee_attack: 10 });
  // +10 固定, +20% 百分比, ×1.5 倍率 => (10+10)*(1+0.2)*1.5 = 36
  BuffManager.addStatModifier(u, { type: 'stat_modifier', key: 'a', stat_type: 'melee_attack', op: 'add', value: 10, duration: 5 });
  BuffManager.addStatModifier(u, { type: 'stat_modifier', key: 'b', stat_type: 'melee_attack', op: 'percent', value: 0.20, duration: 5 });
  BuffManager.addStatModifier(u, { type: 'stat_modifier', key: 'c', stat_type: 'melee_attack', op: 'multiplier', value: 1.5, duration: 5 });
  const eff = BuffManager.calculateEffectiveStat(u, 'melee_attack');
  assert.strictEqual(eff, 36, '应为 (10+10)*1.2*1.5 = 36');
});

// 规则 3 链式：移除底层固定值后，百分比仍基于剩余已生效值动态响应
test('规则3 动态响应：驱散底层固定后百分比重算', () => {
  const u = makeUnit({ melee_attack: 10 });
  BuffManager.addStatModifier(u, { type: 'stat_modifier', key: 'base10', stat_type: 'melee_attack', op: 'add', value: 10, duration: 5 });
  BuffManager.addStatModifier(u, { type: 'stat_modifier', key: 'pct20', stat_type: 'melee_attack', op: 'percent', value: 0.20, duration: 5 });
  assert.strictEqual(BuffManager.calculateEffectiveStat(u, 'melee_attack'), 24, '(10+10)*1.2=24');
  // 模拟驱散底层固定（B.5 将调用此移除逻辑，此处直接 splice 模拟 expired/tick 移除）
  const idx = u.statusEffects.findIndex(e => e.key === 'base10');
  u.statusEffects.splice(idx, 1);
  assert.strictEqual(BuffManager.calculateEffectiveStat(u, 'melee_attack'), 12, '10*1.2=12（无脏数据）');
});

// 不可驱散标记：undispellable 在实例上保留，供 B.5 跳过（此处校验字段存在）
test('undispellable 标记写入', () => {
  const u = makeUnit();
  BuffManager.addStatModifier(u, { type: 'stat_modifier', key: 'u1', stat_type: 'melee_attack', op: 'add', value: 2, duration: 3, undispellable: true });
  const inst = u.statusEffects.find(e => e.key === 'u1');
  assert.strictEqual(inst.undispellable, true, '应标记不可驱散');
});

// 向后兼容：无 op 字段实例按 add 处理
test('向后兼容 无op默认add', () => {
  const u = makeUnit({ melee_attack: 10 });
  u.statusEffects.push({ type: 'stat_modifier', key: 'legacy', stat_type: 'melee_attack', value: 5, consumption: { mode: 'duration', remaining: 3, max: 3 } });
  assert.strictEqual(BuffManager.calculateEffectiveStat(u, 'melee_attack'), 15, '无op应视为+5');
});

// 永久强化走 baseStats（在 effectExecutor.handleModifyStat 中处理，此处验证 calculateEffectiveStat 读 baseStats）
test('calculateEffectiveStat 读取 baseStats 变更', () => {
  const u = makeUnit({ melee_attack: 10 });
  u.baseStats.melee_attack = 15; // 模拟永久强化改 baseStats
  assert.strictEqual(BuffManager.calculateEffectiveStat(u, 'melee_attack'), 15, '应读 15');
});

console.log(`\n结果：通过 ${testsPassed}，失败 ${testsFailed}`);
process.exit(testsFailed === 0 ? 0 : 1);
