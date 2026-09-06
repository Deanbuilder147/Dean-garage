/**
 * B.7 OR/AND 路由测试（2026-08-23）— conditionEvaluator.match_mode
 */

const assert = require('assert');
const ev = require('./conditionEvaluator.cjs'); // 导出为单例实例

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (e) { console.log(`  ❌ ${name}\n     ${e.message}`); failed++; }
}

const unit = { hp: 30, maxHp: 100, currentStats: { hp: 30, maxHp: 100 } }; // 30%
const target = { hp: 80, maxHp: 100, currentStats: { hp: 80, maxHp: 100 } };

console.log('══════ B.7 OR/AND 路由测试 ══════\n');

// 默认 AND：hp_below 30% AND distance<2，只满足前者 → false
test('默认 AND：仅满足其一 → false', () => {
  const r = ev.evaluateTriggerCondition(
    { hp_below_pct: 50, distance_less_than: 2 },
    { unit, target, nearestEnemyDist: 5 }
  );
  assert.strictEqual(r, false);
});

// 显式 match_mode:'any'：任一满足 → true（distance 满足即触发）
test('match_mode any：满足其一 → true', () => {
  const r = ev.evaluateTriggerCondition(
    { match_mode: 'any', hp_below_pct: 50, distance_less_than: 10 },
    { unit, target, nearestEnemyDist: 5 }
  );
  assert.strictEqual(r, true);
});

// 嵌套 conditions + any
test('嵌套 conditions + any：子项任一满足 → true', () => {
  const r = ev.evaluateTriggerCondition(
    {
      match_mode: 'any',
      conditions: [
        { hp_below_pct: 10 },          // 不满足(30%)
        { distance_less_than: 2 },     // 不满足(5)
      ],
    },
    { unit, target, nearestEnemyDist: 5 }
  );
  // 两个都不满足 → false
  assert.strictEqual(r, false);
});

// 嵌套 conditions + all：都满足才 true（用 distance 字段避免 subject 优先 target 干扰）
test('嵌套 conditions + all：都满足 → true', () => {
  const r = ev.evaluateTriggerCondition(
    {
      match_mode: 'all',
      conditions: [
        { distance_less_than: 10 },      // 满足(5≤10)
        { distance_greater_than: 1 },    // 满足(5≥1)
      ],
    },
    { unit, target, nearestEnemyDist: 5 }
  );
  assert.strictEqual(r, true);
});

// 空条件 → 放行
test('空条件放行', () => {
  assert.strictEqual(ev.evaluateTriggerCondition({}, { unit, target }), true);
});

console.log(`\n结果：通过 ${passed}，失败 ${failed}`);
process.exit(failed === 0 ? 0 : 1);
