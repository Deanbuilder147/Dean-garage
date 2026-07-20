/**
 * TerrainMovement 测试
 * 验证地形移动消耗系统 (所有单位都可以通过，只是消耗不同)
 */

const TerrainMovement = require('../src/services/combatCore/terrainMovement.cjs');

console.log('=== TerrainMovement 测试 (2D 战争棋) ===\n');

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

// ========== 移动消耗测试 ==========
console.log('--- 地形移动消耗测试 ---');

test('空地消耗 1', TerrainMovement.getMoveCost('empty') === 1);
test('平原消耗 1', TerrainMovement.getMoveCost('plain') === 1);
test('森林消耗 2', TerrainMovement.getMoveCost('forest') === 2);
test('山地消耗 3', TerrainMovement.getMoveCost('mountain') === 3);
test('水域消耗 2', TerrainMovement.getMoveCost('water') === 2);
test('基地消耗 1', TerrainMovement.getMoveCost('base') === 1);
test('母舰消耗 1', TerrainMovement.getMoveCost('mothership') === 1);
test('废墟消耗 2', TerrainMovement.getMoveCost('ruin') === 2);
test('岩浆消耗 3', TerrainMovement.getMoveCost('lava') === 3);
test('月面消耗 1', TerrainMovement.getMoveCost('lunar') === 1);
test('陨石坑消耗 2', TerrainMovement.getMoveCost('crater') === 2);
test('未知地形消耗 1 (默认)', TerrainMovement.getMoveCost('unknown') === 1);

console.log();

// ========== 防御加成测试 ==========
console.log('--- 地形防御加成测试 ---');

test('空地无防御加成', TerrainMovement.getDefenseBonus('empty') === 0);
test('平原无防御加成', TerrainMovement.getDefenseBonus('plain') === 0);
test('森林 +10% 防御', TerrainMovement.getDefenseBonus('forest') === 10);
test('山地 +20% 防御', TerrainMovement.getDefenseBonus('mountain') === 20);
test('水域无防御加成', TerrainMovement.getDefenseBonus('water') === 0);
test('基地无防御加成', TerrainMovement.getDefenseBonus('base') === 0);
test('废墟 +15% 防御', TerrainMovement.getDefenseBonus('ruin') === 15);
test('陨石坑 +5% 防御', TerrainMovement.getDefenseBonus('crater') === 5);

console.log();

// ========== 路径消耗计算测试 ==========
console.log('--- 路径消耗计算测试 ---');

const path1 = [
  { q: 0, r: 0, terrain: 'empty' },
  { q: 1, r: 0, terrain: 'empty' },
  { q: 2, r: 0, terrain: 'empty' }
];
test('3 格空地总消耗 3', TerrainMovement.calculatePathCost(path1) === 3);

const path2 = [
  { q: 0, r: 0, terrain: 'empty' },
  { q: 1, r: 0, terrain: 'forest' },
  { q: 2, r: 0, terrain: 'mountain' }
];
test('空地 + 森林 + 山地总消耗 6', TerrainMovement.calculatePathCost(path2) === 6);

const path3 = [
  { q: 0, r: 0, terrain: 'empty' },
  { q: 1, r: 0, terrain: 'water' },
  { q: 2, r: 0, terrain: 'empty' }
];
test('空地 + 水域 + 空地总消耗 4', TerrainMovement.calculatePathCost(path3) === 4);

console.log();

// ========== 移动力检查测试 ==========
console.log('--- 移动力检查测试 ---');

const result1 = TerrainMovement.canUnitMove(5, path1);
test('移动力 5 可以走 3 格空地', result1.canMove === true);
test('剩余移动力 2', result1.remainingMovement === 2);

const result2 = TerrainMovement.canUnitMove(5, path2);
test('移动力 5 不够走混合地形 (需要 6)', result2.canMove === false);
test('剩余移动力 -1', result2.remainingMovement === -1);

const result3 = TerrainMovement.canUnitMove(6, path2);
test('移动力 6 刚好走混合地形', result3.canMove === true);
test('剩余移动力 0', result3.remainingMovement === 0);

console.log();

// ========== 可达范围测试 ==========
console.log('--- 可达范围测试 ---');

const terrainMap = {
  '1,0': 'empty',
  '2,0': 'empty',
  '0,1': 'forest',
  '1,1': 'mountain',
  '2,1': 'water'
};

const reachable = TerrainMovement.getReachableHexes({ q: 0, r: 0 }, 3, terrainMap);

test('从 (0,0) 出发，移动力 3，至少可以到达起点', 
  reachable.some(hex => hex.q === 0 && hex.r === 0));

test('可以到达 (1,0) 空地', 
  reachable.some(hex => hex.q === 1 && hex.r === 0 && hex.cost === 1));

test('可以到达 (2,0) 空地 (消耗 2)', 
  reachable.some(hex => hex.q === 2 && hex.r === 0 && hex.cost === 2));

test('可以到达 (0,1) 森林 (消耗 2)', 
  reachable.some(hex => hex.q === 0 && hex.r === 1 && hex.cost === 2));

// 山地消耗 3，从 (0,0) 到 (1,1) 需要：(1,0) 消耗 1 + (1,1) 消耗 3 = 4
// 所以移动力 3 无法到达 (1,1)
test('移动力 3 无法到达 (1,1) 山地 (需要 4)', 
  !reachable.some(hex => hex.q === 1 && hex.r === 1));

// 水域消耗 2，从 (0,0) 到 (2,1) 需要：(1,0) 消耗 1 + (2,0) 消耗 1 + (2,1) 消耗 2 = 4
// 所以移动力 3 无法到达 (2,1)
test('移动力 3 无法到达 (2,1) 水域 (需要 4)', 
  !reachable.some(hex => hex.q === 2 && hex.r === 1));

console.log();

// ========== 地形描述测试 ==========
console.log('--- 地形描述测试 ---');

const emptyDesc = TerrainMovement.getTerrainDescription('empty');
test('空地描述包含中文', emptyDesc.cn === '空地');
test('空地消耗描述正确', emptyDesc.cost === 1);
test('空地防御描述正确', emptyDesc.defense === 0);

const mountainDesc = TerrainMovement.getTerrainDescription('mountain');
test('山地描述包含中文', mountainDesc.cn === '山地');
test('山地消耗描述正确', mountainDesc.cost === 3);
test('山地防御描述正确', mountainDesc.defense === 20);

const waterDesc = TerrainMovement.getTerrainDescription('water');
test('水域描述包含中文', waterDesc.cn === '水域');
test('水域消耗描述正确', waterDesc.cost === 2);
test('水域防御描述正确', waterDesc.defense === 0);

console.log();

// ========== 边界情况测试 ==========
console.log('--- 边界情况测试 ---');

const emptyPath = [];
test('空路径消耗 0', TerrainMovement.calculatePathCost(emptyPath) === 0);

const nullTerrain = TerrainMovement.getMoveCost(null);
test('null 地形返回默认 1', nullTerrain === 1);

const unknownPath = [
  { q: 0, r: 0, terrain: 'unknown1' },
  { q: 1, r: 0, terrain: 'unknown2' }
];
test('未知地形路径消耗 2 (每格默认 1)', TerrainMovement.calculatePathCost(unknownPath) === 2);

console.log();

// ========== 实际游戏场景测试 ==========
console.log('--- 实际游戏场景测试 ---');

// 场景 1: 机甲部队穿越森林进攻山地
const scenario1Path = [
  { q: 0, r: 0, terrain: 'empty' },
  { q: 1, r: 0, terrain: 'forest' },
  { q: 2, r: 0, terrain: 'forest' },
  { q: 3, r: 0, terrain: 'mountain' }
];
// 总消耗：1 (空地) + 2 (森林) + 2 (森林) + 3 (山地) = 8
const scenario1 = TerrainMovement.canUnitMove(7, scenario1Path);
test('机甲 (移动 7) 无法走完森林 + 山地路径 (需要 8)', scenario1.canMove === false);
test('剩余移动力 -1', scenario1.remainingMovement === -1);

// 场景 2: 两栖部队跨越水域
const scenario2Path = [
  { q: 0, r: 0, terrain: 'empty' },
  { q: 1, r: 0, terrain: 'water' },
  { q: 2, r: 0, terrain: 'water' },
  { q: 3, r: 0, terrain: 'empty' }
];
// 总消耗：1 (空地) + 2 (水域) + 2 (水域) + 1 (空地) = 6
const scenario2 = TerrainMovement.canUnitMove(5, scenario2Path);
test('部队 (移动 5) 无法跨越水域 (需要 6)', scenario2.canMove === false);

// 场景 3: 防御阵地选择
const mountainDef = TerrainMovement.getDefenseBonus('mountain');
const forestDef = TerrainMovement.getDefenseBonus('forest');
test('山地防御高于森林', mountainDef > forestDef);

console.log();

// ========== 汇总 ==========
console.log('=== 测试汇总 ===');
console.log(`通过：${passed}`);
console.log(`失败：${failed}`);
console.log(`总计：${passed + failed}`);
console.log();

if (failed === 0) {
  console.log('🎉 所有测试通过！地形移动系统工作正常！');
  console.log('✅ 所有单位都可以在任何地形移动');
  console.log('✅ 不同地形有不同移动消耗');
  console.log('✅ 地形提供防御加成');
} else {
  console.log('⚠️  有测试失败，请检查实现。');
  process.exit(1);
}
