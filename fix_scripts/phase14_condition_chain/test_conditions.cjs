/**
 * Phase 14: conditionEvaluator 复合条件链测试
 * 
 * 测试覆盖:
 * 1. 新 checker: requires_hp_below, requires_unmoved, target_on_terrain
 * 2. Flat 格式条件
 * 3. 结构化格式条件 (向后兼容)
 * 4. 复合条件 (多条件同时)
 */

const ConditionEvaluator = require('/root/original-project/services/combat-service/src/services/combatCore/conditionEvaluator.cjs');

let pass = 0;
let fail = 0;

function assert(condition, label) {
    if (condition) { pass++; console.log(`  PASS: ${label}`); }
    else { fail++; console.log(`  FAIL: ${label}`); }
}

// ============================================================
// TEST 1: requires_hp_below
// ============================================================
console.log('=== TEST 1: requires_hp_below ===');

const ctx_hp_30 = { unit: { hp: 30, maxHp: 100 } };
const ctx_hp_60 = { unit: { hp: 60, maxHp: 100 } };

assert(ConditionEvaluator.evaluate({ requires_hp_below: 50 }, ctx_hp_30) === true,
    'HP=30 < 50 -> 通过');
assert(ConditionEvaluator.evaluate({ requires_hp_below: 50 }, ctx_hp_60) === false,
    'HP=60 < 50 -> 不通过');
assert(ConditionEvaluator.evaluate({ requires_hp_below: 0 }, ctx_hp_60) === true,
    'requires_hp_below=0 -> 自动通过 (无限制)');
assert(ConditionEvaluator.evaluate({ requires_hp_below: 100 }, ctx_hp_60) === true,
    'HP=60 < 100 -> 通过');

// ============================================================
// TEST 2: requires_unmoved
// ============================================================
console.log('=== TEST 2: requires_unmoved ===');

const ctx_moved = { unit: { hp: 100, has_moved: true } };
const ctx_unmoved = { unit: { hp: 100, has_moved: false } };

assert(ConditionEvaluator.evaluate({ requires_unmoved: true }, ctx_unmoved) === true,
    'has_moved=false + requires_unmoved=true -> 通过');
assert(ConditionEvaluator.evaluate({ requires_unmoved: true }, ctx_moved) === false,
    'has_moved=true + requires_unmoved=true -> 不通过');
assert(ConditionEvaluator.evaluate({ requires_unmoved: false }, ctx_moved) === true,
    'requires_unmoved=false -> 自动通过');
assert(ConditionEvaluator.evaluate({ requires_unmoved: false }, ctx_unmoved) === true,
    'requires_unmoved=false + has_moved=false -> 通过');

// ============================================================
// TEST 3: target_on_terrain
// ============================================================
console.log('=== TEST 3: target_on_terrain ===');

const ctx_water = { target: { terrain: 'water', hp: 50 } };
const ctx_forest = { target: { terrain: 'forest', hp: 50 } };
const ctx_plain = { target: { terrain: 'plain', hp: 50 } };

assert(ConditionEvaluator.evaluate({ target_on_terrain: 'water' }, ctx_water) === true,
    '目标在水域 + target_on_terrain=water -> 通过');
assert(ConditionEvaluator.evaluate({ target_on_terrain: 'water' }, ctx_forest) === false,
    '目标在森林 + target_on_terrain=water -> 不通过');
assert(ConditionEvaluator.evaluate({ target_on_terrain: '' }, ctx_water) === true,
    'target_on_terrain=空 -> 自动通过');
assert(ConditionEvaluator.evaluate({ target_on_terrain: '' }, ctx_forest) === true,
    'target_on_terrain=空 + 任意地形 -> 通过');

// ============================================================
// TEST 4: 复合条件 (多条件同时)
// ============================================================
console.log('=== TEST 4: 复合条件 (3 condition AND) ===');

const ctx_passing = {
    unit: { hp: 20, has_moved: false },
    target: { terrain: 'water', hp: 100 }
};
const ctx_fail_hp = {
    unit: { hp: 80, has_moved: false },  // HP too high
    target: { terrain: 'water', hp: 100 }
};
const ctx_fail_moved = {
    unit: { hp: 20, has_moved: true },   // already moved
    target: { terrain: 'water', hp: 100 }
};
const ctx_fail_terrain = {
    unit: { hp: 20, has_moved: false },
    target: { terrain: 'forest', hp: 100 } // wrong terrain
};

const triple_condition = {
    requires_hp_below: 50,
    requires_unmoved: true,
    target_on_terrain: 'water'
};

assert(ConditionEvaluator.evaluate(triple_condition, ctx_passing) === true,
    '三条件全满足 -> 通过');
assert(ConditionEvaluator.evaluate(triple_condition, ctx_fail_hp) === false,
    'HP不满足 -> 不通过');
assert(ConditionEvaluator.evaluate(triple_condition, ctx_fail_moved) === false,
    '移动不满足 -> 不通过');
assert(ConditionEvaluator.evaluate(triple_condition, ctx_fail_terrain) === false,
    '地形不满足 -> 不通过');

// ============================================================
// TEST 5: 非条件字段被忽略
// ============================================================
console.log('=== TEST 5: 非条件字段被忽略 ===');

const mixed_config = {
    label: '水战特化',
    base_damage: 15,
    cast_range: 3,
    action_type: 'attack',
    requires_unmoved: true,
    requires_hp_below: 30,
    damage_kind: 'kinetic',
    category: 'melee'
};

assert(ConditionEvaluator.evaluate(mixed_config, ctx_passing) === true,
    '混合配置: 跳过非条件字段(label等), 检查条件 -> HP=20<30 && unmoved -> 通过');

const ctx_mixed_fail = { unit: { hp: 80, has_moved: true }, target: { terrain: 'water', hp: 100 } };
assert(ConditionEvaluator.evaluate(mixed_config, ctx_mixed_fail) === false,
    '混合配置: HP=80不满足 -> 不通过');

// ============================================================
// TEST 6: 向后兼容 - 结构化格式 (required/any/not)
// ============================================================
console.log('=== TEST 6: 向后兼容 - 结构化格式 ===');

const structured_condition = {
    required: [
        { check: 'target_hp', value: 5, operator: '<' },
        { check: 'attack_type', value: 'melee', operator: '==' }
    ]
};

const ctx_structured_pass = {
    target: { hp: 3 },
    attackType: 'melee'
};

const ctx_structured_fail = {
    target: { hp: 10 },
    attackType: 'melee'
};

assert(ConditionEvaluator.evaluate(structured_condition, ctx_structured_pass) === true,
    '结构化 required AND: HP=3<5 && melee -> 通过');
assert(ConditionEvaluator.evaluate(structured_condition, ctx_structured_fail) === false,
    '结构化 required AND: HP=10不满足 -> 不通过');

// ============================================================
// TEST 7: 空条件/null
// ============================================================
console.log('=== TEST 7: 空条件/null ===');

assert(ConditionEvaluator.evaluate(null, {}) === true,
    'conditions=null -> 自动通过');
assert(ConditionEvaluator.evaluate(undefined, {}) === true,
    'conditions=undefined -> 自动通过');
assert(ConditionEvaluator.evaluate({}, {}) === true,
    'conditions={} -> 自动通过');

// ============================================================
// TEST 8: evaluateFlat 直接测试
// ============================================================
console.log('=== TEST 8: evaluateFlat 直接调用 ===');

const ctx_flat = { unit: { hp: 25, has_moved: false }, target: { terrain: 'forest', hp: 40 } };

assert(ConditionEvaluator.evaluateFlat({ requires_hp_below: 30, target_on_terrain: 'forest' }, ctx_flat) === true,
    'evaluateFlat: HP<30 && forest -> 通过');
assert(ConditionEvaluator.evaluateFlat({ requires_hp_below: 10, target_on_terrain: 'forest' }, ctx_flat) === false,
    'evaluateFlat: HP=25不满足 -> 不通过');

// ============================================================
// TEST 9: 单条件通过结构化的 check 调用
// ============================================================
console.log('=== TEST 9: 单条件结构化 ===');

assert(ConditionEvaluator.evaluate(
    { check: 'requires_hp_below', value: 40 },
    { unit: { hp: 25 } }
) === true, '单check: requires_hp_below=40, HP=25 -> 通过');

assert(ConditionEvaluator.evaluate(
    { check: 'target_on_terrain', value: 'mountain' },
    { target: { terrain: 'mountain' } }
) === true, '单check: target_on_terrain=mountain -> 通过');

// ============================================================
// TEST 10: requires_stealth
// ============================================================
console.log('=== TEST 10: requires_stealth ===');

assert(ConditionEvaluator.evaluate({ requires_stealth: true }, { unit: { stealth: true } }) === true,
    '潜行=true -> 通过');
assert(ConditionEvaluator.evaluate({ requires_stealth: true }, { unit: { stealth: false } }) === false,
    '潜行=false -> 不通过');
assert(ConditionEvaluator.evaluate({ requires_stealth: false }, { unit: { stealth: false } }) === true,
    'requires_stealth=false -> 自动通过');

// ============================================================
// SUMMARY
// ============================================================
console.log(`\n==================================================`);
console.log(`  ${pass} PASS / ${fail} FAIL (${pass+fail} tests)`);
console.log(`==================================================`);

if (fail > 0) {
    console.log('SOME TESTS FAILED');
    process.exit(1);
} else {
    console.log('ALL TESTS PASSED');
}
