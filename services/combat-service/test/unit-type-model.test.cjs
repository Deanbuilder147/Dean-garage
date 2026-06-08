/**
 * UnitTypeModel 测试
 * 验证基于现有数据库的单位类型映射
 */

const UnitTypeModel = require('../src/services/combatCore/unitTypeModel.cjs');

console.log('=== UnitTypeModel 测试 (无数据库修改) ===\n');

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

// ========== main_type 映射测试 ==========
console.log('--- main_type 映射测试 ---');

test('机体 → 陆地单位', 
  UnitTypeModel.mapMainTypeToMoveType('机体') === 'land');

test('Royroy → 陆地单位', 
  UnitTypeModel.mapMainTypeToMoveType('Royroy') === 'land');

test('防具 → 陆地单位', 
  UnitTypeModel.mapMainTypeToMoveType('防具') === 'land');

test('背包 → 陆地单位', 
  UnitTypeModel.mapMainTypeToMoveType('背包') === 'land');

test('武器 → 陆地单位 (作为附件)', 
  UnitTypeModel.mapMainTypeToMoveType('武器') === 'land');

test('载具 (地球) → 陆地单位', 
  UnitTypeModel.mapMainTypeToMoveType('载具', 'earth') === 'land');

test('载具 (马克西恩) → 海上单位', 
  UnitTypeModel.mapMainTypeToMoveType('载具', 'maxion') === 'sea');

console.log();

// ========== codename 关键词测试 ==========
console.log('--- codename 关键词测试 (空中单位) ---');

test('codename 含 "飞" → 空中', 
  UnitTypeModel.mapMainTypeToMoveType('机体', 'earth', '飞鹰') === 'air');

test('codename 含 "翼" → 空中', 
  UnitTypeModel.mapMainTypeToMoveType('机体', 'earth', '翼战士') === 'air');

test('codename 含 "空" → 空中', 
  UnitTypeModel.mapMainTypeToMoveType('机体', 'earth', '空战王') === 'air');

test('codename 含 "wind" → 空中', 
  UnitTypeModel.mapMainTypeToMoveType('机体', 'earth', 'Wind Falcon') === 'air');

test('codename 含 "fly" → 空中', 
  UnitTypeModel.mapMainTypeToMoveType('机体', 'earth', 'Flyer') === 'air');

console.log();

console.log('--- codename 关键词测试 (海上单位) ---');

test('codename 含 "海" → 海上', 
  UnitTypeModel.mapMainTypeToMoveType('载具', 'earth', '海军上将') === 'sea');

test('codename 含 "舰" → 海上', 
  UnitTypeModel.mapMainTypeToMoveType('载具', 'earth', '战舰') === 'sea');

test('codename 含 "船" → 海上', 
  UnitTypeModel.mapMainTypeToMoveType('载具', 'earth', '飞船') === 'sea');

test('codename 含 "ship" → 海上', 
  UnitTypeModel.mapMainTypeToMoveType('载具', 'earth', 'Battleship') === 'sea');

test('codename 含 "marine" → 海上', 
  UnitTypeModel.mapMainTypeToMoveType('载具', 'earth', 'Marine') === 'sea');

console.log();

// ========== 优先级测试 ==========
console.log('--- 优先级测试 (codename 优先于 main_type) ---');

test('机体 + "飞鹰" codename → 空中 (codename 优先)', 
  UnitTypeModel.mapMainTypeToMoveType('机体', 'earth', '飞鹰') === 'air');

test('载具 (马克西恩) + "飞" codename → 空中 (codename 最优先)', 
  UnitTypeModel.mapMainTypeToMoveType('载具', 'maxion', '飞行器') === 'air');

test('机体 + "战舰" codename → 海上 (codename 优先)', 
  UnitTypeModel.mapMainTypeToMoveType('机体', 'earth', '战舰') === 'sea');

// ========== 完整单位对象测试 ==========
console.log('--- 完整单位对象测试 ---');

const unit1 = {
  id: 1,
  name: '地球联合敢死队',
  codename: '陆战勇士',
  faction: 'earth',
  main_type: '机体'
};

const info1 = UnitTypeModel.getUnitTypeInfo(unit1);
test('陆地单位信息提取', 
  info1.move_type === 'land' && info1.faction === 'earth');

const unit2 = {
  id: 2,
  name: '拜火教飞鹰',
  codename: 'Fly Eagle',
  faction: 'byron',
  main_type: '机体'
};

const info2 = UnitTypeModel.getUnitTypeInfo(unit2);
test('空中单位信息提取', 
  info2.move_type === 'air' && info2.keywords.air.includes('fly'));

const unit3 = {
  id: 3,
  name: '马克西恩战舰',
  codename: '海王',
  faction: 'maxion',
  main_type: '载具'
};

const info3 = UnitTypeModel.getUnitTypeInfo(unit3);
test('海上单位信息提取', 
  info3.move_type === 'sea' && info3.keywords.sea.includes('海'));

console.log();

// ========== 地形映射测试 ==========
console.log('--- 地形 ID 映射测试 (Map Service ↔ UnitTypeManager) ---');

test('empty → plain', 
  UnitTypeModel.mapTerrainId('empty') === 'plain');

test('mountain → mountain', 
  UnitTypeModel.mapTerrainId('mountain') === 'mountain');

test('forest → forest', 
  UnitTypeModel.mapTerrainId('forest') === 'forest');

test('water → water', 
  UnitTypeModel.mapTerrainId('water') === 'water');

test('mothership → base', 
  UnitTypeModel.mapTerrainId('mothership') === 'base');

test('base → base', 
  UnitTypeModel.mapTerrainId('base') === 'base');

console.log();

console.log('--- 反向地形映射测试 ---');

test('plain → empty', 
  UnitTypeModel.reverseMapTerrainId('plain') === 'empty');

test('mountain → mountain', 
  UnitTypeModel.reverseMapTerrainId('mountain') === 'mountain');

test('ruin → empty', 
  UnitTypeModel.reverseMapTerrainId('ruin') === 'empty');

test('lava → water', 
  UnitTypeModel.reverseMapTerrainId('lava') === 'water');

console.log();

// ========== 描述文本测试 ==========
console.log('--- 移动类型描述测试 ---');

const landDesc = UnitTypeModel.getMoveTypeDescription('land');
test('陆地单位描述包含中文', 
  landDesc.cn === '陆地单位');

test('陆地单位优势描述', 
  landDesc.advantage.includes('地对海 +1'));

test('陆地单位劣势描述', 
  landDesc.disadvantage.includes('地对空 -1'));

const airDesc = UnitTypeModel.getMoveTypeDescription('air');
test('空中单位描述包含中文', 
  airDesc.cn === '空中单位');

test('空中单位优势描述', 
  airDesc.advantage.includes('空对海 +2'));

const seaDesc = UnitTypeModel.getMoveTypeDescription('sea');
test('海上单位描述包含中文', 
  seaDesc.cn === '海上单位');

test('海上单位劣势描述', 
  seaDesc.disadvantage.includes('无法攻击陆地'));

console.log();

// ========== 关键词检测测试 ==========
console.log('--- 关键词检测测试 ---');

const keywords1 = UnitTypeModel.detectKeywords('飞鹰战士');
test('检测 "飞" 关键词', 
  keywords1.air.includes('飞'));

const keywords2 = UnitTypeModel.detectKeywords('Marine Battleship');
test('检测 "marine" 关键词', 
  keywords2.sea.includes('marine'));

const keywords3 = UnitTypeModel.detectKeywords('陆战勇士');
test('陆地单位无特殊关键词', 
  keywords3.air.length === 0 && keywords3.sea.length === 0);

console.log();

// ========== 边界情况测试 ==========
console.log('--- 边界情况测试 ---');

test('未知 main_type → 默认陆地', 
  UnitTypeModel.mapMainTypeToMoveType('未知类型') === 'land');

test('空 codename → 默认基于 main_type', 
  UnitTypeModel.mapMainTypeToMoveType('机体', 'earth', '') === 'land');

test('null codename → 默认基于 main_type', 
  UnitTypeModel.mapMainTypeToMoveType('机体', 'earth', null) === 'land');

test('空对象 → 默认陆地', 
  UnitTypeModel.getUnitMoveType({}) === 'land');

console.log();

// ========== 与 UnitTypeManager 集成测试 ==========
console.log('--- 与 UnitTypeManager 集成测试 ---');

const testUnit = {
  main_type: '机体',
  codename: '飞鹰',
  faction: 'earth'
};

// 测试地形通行性
const canFlyOverWater = UnitTypeModel.canUnitMoveToTerrain(testUnit, 'water');
test('空中单位可以通过水域', canFlyOverWater);

const canFlyOverMountain = UnitTypeModel.canUnitMoveToTerrain(testUnit, 'mountain');
test('空中单位可以通过山地', canFlyOverMountain);

const landUnit = {
  main_type: '机体',
  codename: '陆战',
  faction: 'earth'
};

const cantLandOnWater = !UnitTypeModel.canUnitMoveToTerrain(landUnit, 'water');
test('陆地单位不能通过水域', cantLandOnWater);

const canLandOnMountain = UnitTypeModel.canUnitMoveToTerrain(landUnit, 'mountain');
test('陆地单位可以通过山地', canLandOnMountain);

console.log();

// ========== 汇总 ==========
console.log('=== 测试汇总 ===');
console.log(`通过：${passed}`);
console.log(`失败：${failed}`);
console.log(`总计：${passed + failed}`);
console.log();

if (failed === 0) {
  console.log('🎉 所有测试通过！单位类型模型映射工作正常！');
  console.log('✅ 无需修改数据库结构');
  console.log('✅ 通过现有字段智能映射');
} else {
  console.log('⚠️  有测试失败，请检查实现。');
  process.exit(1);
}
