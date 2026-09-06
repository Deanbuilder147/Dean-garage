/**
 * UnitTypeManager 测试
 * 验证陆地/空中/海上单位的移动和克制关系
 */

const UnitTypeManager = require('../src/services/combatCore/unitTypeManager.cjs');

console.log('=== UnitTypeManager 测试 ===\n');

let passed = 0;
let failed = 0;

function test(name, condition, expected = true) {
  const result = condition === expected;
  if (result) {
    console.log(`✅ ${name}`);
    passed++;
  } else {
    console.log(`❌ ${name} (期望：${expected}, 实际：${condition})`);
    failed++;
  }
}

// ========== 地形通行性测试 ==========
console.log('--- 地形通行性测试 ---');

test('陆地单位可以通过平原', 
  UnitTypeManager.canMoveTo('land', 'plain'));

test('陆地单位不能通过水域', 
  UnitTypeManager.canMoveTo('land', 'water'), false);

test('陆地单位不能通过岩浆', 
  UnitTypeManager.canMoveTo('land', 'lava'), false);

test('空中单位可以通过所有地形', 
  UnitTypeManager.canMoveTo('air', 'water') && 
  UnitTypeManager.canMoveTo('air', 'mountain') &&
  UnitTypeManager.canMoveTo('air', 'lava'));

test('海上单位只能通过水域', 
  UnitTypeManager.canMoveTo('sea', 'water') && 
  !UnitTypeManager.canMoveTo('sea', 'plain') &&
  !UnitTypeManager.canMoveTo('sea', 'mountain'));

console.log();

// ========== 移动消耗测试 ==========
console.log('--- 移动消耗测试 ---');

test('陆地在平原消耗 1', 
  UnitTypeManager.getMoveCost('land', 'plain') === 1);

test('陆地在山地消耗 2', 
  UnitTypeManager.getMoveCost('land', 'mountain') === 2);

test('陆地在水域消耗 999 (不可通行)', 
  UnitTypeManager.getMoveCost('land', 'water') === 999);

test('空中在所有地形消耗 1', 
  UnitTypeManager.getMoveCost('air', 'plain') === 1 &&
  UnitTypeManager.getMoveCost('air', 'mountain') === 1 &&
  UnitTypeManager.getMoveCost('air', 'water') === 1);

test('空中在岩浆消耗 2', 
  UnitTypeManager.getMoveCost('air', 'lava') === 2);

test('海上在水域消耗 1', 
  UnitTypeManager.getMoveCost('sea', 'water') === 1);

test('海上有陆地消耗 999', 
  UnitTypeManager.getMoveCost('sea', 'plain') === 999);

console.log();

// ========== 攻击克制测试 ==========
console.log('--- 攻击克制测试 ---');

test('地对地无修正', 
  UnitTypeManager.getAttackModifier('land', 'land') === 0);

test('地对空 -1 修正', 
  UnitTypeManager.getAttackModifier('land', 'air') === -1);

test('地对海 +1 修正', 
  UnitTypeManager.getAttackModifier('land', 'sea') === 1);

test('空对地无修正', 
  UnitTypeManager.getAttackModifier('air', 'land') === 0);

test('空对海 +2 修正', 
  UnitTypeManager.getAttackModifier('air', 'sea') === 2);

test('海对陆无法攻击 (-999)', 
  UnitTypeManager.getAttackModifier('sea', 'land') === -999);

test('海对空 -2 修正', 
  UnitTypeManager.getAttackModifier('sea', 'air') === -2);

console.log();

// ========== 防御闪避测试 ==========
console.log('--- 防御闪避测试 ---');

test('地对空闪避 +1', 
  UnitTypeManager.getDefenseModifier('land', 'air') === 1);

test('空对地闪避 -1', 
  UnitTypeManager.getDefenseModifier('air', 'land') === -1);

test('海对空闪避 +2', 
  UnitTypeManager.getDefenseModifier('sea', 'air') === 2);

console.log();

// ========== 攻击有效性测试 ==========
console.log('--- 攻击有效性测试 ---');

const canAttackLandVsSea = UnitTypeManager.canAttack('land', 'sea');
test('陆地可以攻击海上单位', canAttackLandVsSea.valid);

const canAttackSeaVsLand = UnitTypeManager.canAttack('sea', 'land');
test('海上不能攻击陆地单位', canAttackSeaVsLand.valid, false);

const canAttackAirVsLand = UnitTypeManager.canAttack('air', 'land');
test('空中可以攻击陆地单位', canAttackAirVsLand.valid);

console.log();

// ========== 完整克制效果测试 ==========
console.log('--- 完整克制效果测试 ---');

const effect1 = UnitTypeManager.calculateTypeEffectiveness(
  { move_type: 'air' }, 
  { move_type: 'sea' }
);
test('空对海：攻击 +2, 优势', effect1.attack_modifier === 2 && effect1.advantage === 'advantage');

const effect2 = UnitTypeManager.calculateTypeEffectiveness(
  { move_type: 'land' }, 
  { move_type: 'air' }
);
test('地对空：攻击 -1, 劣势', effect2.attack_modifier === -1 && effect2.advantage === 'disadvantage');

const effect3 = UnitTypeManager.calculateTypeEffectiveness(
  { move_type: 'sea' }, 
  { move_type: 'land' }
);
test('海对陆：无法攻击', effect3.can_attack === false);

console.log();

// ========== 路径验证测试 ==========
console.log('--- 路径验证测试 ---');

const path1 = [
  { q: 0, r: 0, terrain: 'plain' },
  { q: 1, r: 0, terrain: 'plain' },
  { q: 2, r: 0, terrain: 'forest' }
];

const result1 = UnitTypeManager.validateMovement('land', path1, 5);
test('陆地单位路径验证 (合法)', result1.valid && result1.totalCost === 3);

const path2 = [
  { q: 0, r: 0, terrain: 'plain' },
  { q: 1, r: 0, terrain: 'water' }
];

const result2 = UnitTypeManager.validateMovement('land', path2, 5);
test('陆地单位路径验证 (被水阻挡)', !result2.valid && result2.blockedAt === 1);

const path3 = [
  { q: 0, r: 0, terrain: 'plain' },
  { q: 1, r: 0, terrain: 'mountain' },
  { q: 2, r: 0, terrain: 'plain' }
];

const result3 = UnitTypeManager.validateMovement('land', path3, 2);
test('陆地单位路径验证 (移动力不足)', !result3.valid && result3.reason === '移动力不足');

const path4 = [
  { q: 0, r: 0, terrain: 'plain' },
  { q: 1, r: 0, terrain: 'water' },
  { q: 2, r: 0, terrain: 'mountain' }
];

const result4 = UnitTypeManager.validateMovement('air', path4, 5);
test('空中单位路径验证 (无视水域)', result4.valid && result4.totalCost === 3);

console.log();

// ========== 描述文本测试 ==========
console.log('--- 描述文本测试 ---');

const desc1 = UnitTypeManager.getTypeDescription('land', 'air');
test('地对空描述包含 "难以命中"', desc1.includes('难以命中'));

const desc2 = UnitTypeManager.getTypeDescription('air', 'sea');
test('空对海描述包含 "制空权"', desc2.includes('制空权'));

const desc3 = UnitTypeManager.getTypeDescription('sea', 'land');
test('海对陆描述包含 "无法攻击"', desc3.includes('无法攻击'));

console.log();

// ========== 汇总 ==========
console.log('=== 测试汇总 ===');
console.log(`通过：${passed}`);
console.log(`失败：${failed}`);
console.log(`总计：${passed + failed}`);
console.log();

if (failed === 0) {
  console.log('🎉 所有测试通过！单位类型系统工作正常！');
} else {
  console.log('⚠️  有测试失败，请检查实现。');
  process.exit(1);
}
