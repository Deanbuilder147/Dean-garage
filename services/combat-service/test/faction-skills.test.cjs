/**
 * 阵营技能系统测试
 * 测试三大阵营的核心技能
 */

const DamagePipe = require('../src/services/combatCore/damagePipe.cjs');
const FactionSkillRegistry = require('../src/services/combatCore/factionSkillRegistry.cjs');

const {
  FACTION_IDS,
  getFactionSkill,
  getFactionSkills,
  getFactionInfo,
  unitHasSkill,
  getUnitSkills
} = FactionSkillRegistry;

// 测试工具函数
function logSection(title) {
  console.log(`\n═══════════════════════════════════════════════════════════════`);
  console.log(`【${title}】`);
  console.log(`═══════════════════════════════════════════════════════════════`);
}

function assertEqual(actual, expected, msg) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (pass) {
    console.log(`  ✅ ${msg}`);
  } else {
    console.log(`  ❌ ${msg}`);
    console.log(`     Expected: ${JSON.stringify(expected)}`);
    console.log(`     Actual:   ${JSON.stringify(actual)}`);
  }
  return pass;
}

// 模拟战场状态
const mockBattlefieldState = {
  cells: [
    { q: 0, r: 0, terrain: 'lunar' },
    { q: 1, r: 0, terrain: 'crater' },
    { q: 2, r: 0, terrain: 'mountain' }
  ]
};

// 测试用例
async function runTests() {
  let passed = 0;
  let failed = 0;

  // ============================================================
  logSection('阵营技能注册表基础测试');
  // ============================================================
  
  // 测试1: 获取阵营信息
  const earthInfo = getFactionInfo(FACTION_IDS.EARTH);
  if (earthInfo && earthInfo.name === '地球联合') {
    console.log(`  ✅ 地球联合阵营信息正确`);
    passed++;
  } else {
    console.log(`  ❌ 地球联合阵营信息错误`);
    failed++;
  }

  const balonInfo = getFactionInfo(FACTION_IDS.BALON);
  if (balonInfo && balonInfo.name === '拜隆') {
    console.log(`  ✅ 拜隆阵营信息正确`);
    passed++;
  } else {
    console.log(`  ❌ 拜隆阵营信息错误`);
    failed++;
  }

  const maxionInfo = getFactionInfo(FACTION_IDS.MAXION);
  if (maxionInfo && maxionInfo.name === '马克西翁') {
    console.log(`  ✅ 马克西翁阵营信息正确`);
    passed++;
  } else {
    console.log(`  ❌ 马克西翁阵营信息错误`);
    failed++;
  }

  // 测试2: 技能数量
  logSection('阵营技能数量验证');
  const earthSkills = getFactionSkills(FACTION_IDS.EARTH);
  const balonSkills = getFactionSkills(FACTION_IDS.BALON);
  const maxionSkills = getFactionSkills(FACTION_IDS.MAXION);
  
  assertEqual(earthSkills.length, 2, `地球联合应有2个技能 (artillery, fortified_position)`);
  assertEqual(balonSkills.length, 2, `拜隆应有2个技能 (reinforcement, coordinated_attack)`);
  assertEqual(maxionSkills.length, 3, `马克西翁应有3个技能 (fog_system, mobile_strike, tactical_retreat)`);

  // ============================================================
  logSection('地球联合: 火力覆盖测试');
  // ============================================================
  
  // 创建测试单位
  const earthUnit = {
    id: 'earth_001',
    name: '地球重装',
    faction: FACTION_IDS.EARTH,
    q: 0, r: 0,
    hp: 100
  };
  
  const enemy1 = {
    id: 'enemy_001',
    name: '敌方单位1',
    faction: 'enemy',
    q: 1, r: 0,  // 距离1
    hp: 50
  };
  
  const enemy2 = {
    id: 'enemy_002',
    name: '敌方单位2',
    faction: 'enemy',
    q: 2, r: 0,  // 距离2
    hp: 50
  };
  
  const ally = {
    id: 'earth_ally',
    name: '友军单位',
    faction: FACTION_IDS.EARTH,
    q: 1, r: 1,
    hp: 80
  };

  const units = [earthUnit, enemy1, enemy2, ally];
  
  // 执行火力覆盖
  const artillerySkill = getFactionSkill(FACTION_IDS.EARTH, 'artillery');
  const artilleryResult = artillerySkill.execute({
    caster: earthUnit,
    centerQ: 0,
    centerR: 0,
    units: units,
    battlefieldState: mockBattlefieldState
  });

  console.log(`  技能执行结果:`);
  console.log(`    - 目标数量: ${artilleryResult.units_affected.length}`);
  console.log(`    - 伤害值: ${artilleryResult.damage}`);
  console.log(`    - 范围半径: ${artilleryResult.radius}`);
  
  // 火力覆盖应该命中所有范围内的单位（包括友军）
  // earthUnit(0,0)距离0, enemy1(1,0)距离1, enemy2(2,0)距离2, ally(1,1)距离2 - 共4个
  if (artilleryResult.units_affected.length === 4) {
    console.log(`  ✅ 火力覆盖命中4个单位`);
    passed++;
  } else {
    console.log(`  ❌ 火力覆盖应命中4个单位，实际: ${artilleryResult.units_affected.length}`);
    failed++;
  }

  // 验证伤害计算
  const target1Hit = artilleryResult.units_affected.find(u => u.unit_id === 'enemy_001');
  const target2Hit = artilleryResult.units_affected.find(u => u.unit_id === 'enemy_002');
  
  if (target1Hit && target1Hit.damage_taken === 12) {  // 15 - 3(crater)
    console.log(`  ✅ 地形减伤正确 (crater: -3)`);
    passed++;
  } else {
    console.log(`  ❌ 地形减伤计算错误`);
    failed++;
  }

  if (target2Hit && target2Hit.damage_taken === 10) {  // 15 - 5(mountain)
    console.log(`  ✅ 山地减伤正确 (mountain: -5)`);
    passed++;
  } else {
    console.log(`  ❌ 山地减伤计算错误`);
    failed++;
  }

  // ============================================================
  logSection('拜隆: 增援系统测试');
  // ============================================================
  
  // 重置单位HP
  const balonTarget = {
    id: 'balon_001',
    name: '拜隆主力',
    faction: FACTION_IDS.BALON,
    q: 5, r: 5,
    hp: 80,
    max_hp: 100
  };
  
  const balonSupporter = {
    id: 'balon_002',
    name: '拜隆增援',
    faction: FACTION_IDS.BALON,
    q: 6, r: 5,  // 距离1
    hp: 60,
    max_hp: 100
  };
  
  const balonFar = {
    id: 'balon_003',
    name: '拜隆远程',
    faction: FACTION_IDS.BALON,
    q: 10, r: 10,  // 距离太远
    hp: 40,
    max_hp: 100
  };
  
  const balonUnits = [balonTarget, balonSupporter, balonFar];
  
  const reinforcementSkill = getFactionSkill(FACTION_IDS.BALON, 'reinforcement');
  
  // 测试获取增援单位
  const availableSupports = reinforcementSkill.getSupportUnits(balonTarget, balonUnits);
  
  if (availableSupports.length === 1 && availableSupports[0].id === 'balon_002') {
    console.log(`  ✅ 增援单位筛选正确 (仅在范围内)`);
    passed++;
  } else {
    console.log(`  ❌ 增援单位筛选错误`);
    failed++;
  }
  
  // 测试增援执行
  const originalDamage = 20;
  const reinforcementResult = reinforcementSkill.execute({
    target: balonTarget,
    damage: originalDamage,
    availableSupportUnits: availableSupports
  });
  
  if (reinforcementResult.damage_reduced === 10) {  // 50%分担
    console.log(`  ✅ 伤害分担正确 (50%: 20 → 10)`);
    passed++;
  } else {
    console.log(`  ❌ 伤害分担计算错误: ${reinforcementResult.damage_reduced}`);
    failed++;
  }
  
  if (balonSupporter.hp === 50) {  // 60 - 10 = 50
    console.log(`  ✅ 增援单位HP扣减正确 (60 - 10 = 50)`);
    passed++;
  } else {
    console.log(`  ❌ 增援单位HP扣减错误: ${balonSupporter.hp}`);
    failed++;
  }

  // ============================================================
  logSection('马克西翁: 迷雾系统测试');
  // ============================================================
  
  const maxion1 = {
    id: 'maxion_001',
    name: '马克西翁单位1',
    faction: FACTION_IDS.MAXION,
    hp: 80
  };
  
  const maxion2 = {
    id: 'maxion_002',
    name: '马克西翁单位2',
    faction: FACTION_IDS.MAXION,
    hp: 60
  };
  
  const nonMaxion = {
    id: 'other_001',
    name: '其他单位',
    faction: 'enemy',
    hp: 50
  };
  
  const maxionUnits = [maxion1, maxion2, nonMaxion];
  
  const fogSkill = getFactionSkill(FACTION_IDS.MAXION, 'fog_system');
  const fogResult = fogSkill.execute({
    units: maxionUnits,
    battlefieldState: mockBattlefieldState
  });
  
  console.log(`  迷雾系统执行结果:`);
  console.log(`    - 掷骰结果: ${fogResult.roll}`);
  console.log(`    - 效果: ${fogResult.effect?.name}`);
  console.log(`    - 影响的单位: ${fogResult.units_affected.length}`);
  
  if (fogResult.units_affected.length === 2) {  // 只有马克西翁单位
    console.log(`  ✅ 迷雾只影响马克西翁单位`);
    passed++;
  } else {
    console.log(`  ❌ 迷雾影响单位数量错误`);
    failed++;
  }
  
  // 验证Buff应用
  if (fogResult.units_affected.every(u => u.buff)) {
    console.log(`  ✅ 所有单位都获得Buff`);
    passed++;
  } else {
    console.log(`  ❌ Buff应用不完整`);
    failed++;
  }

  // ============================================================
  logSection('被动技能测试');
  // ============================================================
  
  // 测试坚固阵地
  const fortifiedSkill = getFactionSkill(FACTION_IDS.EARTH, 'fortified_position');
  
  const defensiveUnit = { ...earthUnit, stance: 'defensive' };
  const normalUnit = { ...earthUnit, stance: 'normal' };
  
  const fortifiedResult = fortifiedSkill.execute({ unit: defensiveUnit, damage: 20 });
  if (fortifiedResult.triggered && fortifiedResult.damage_reduction === 3) {
    console.log(`  ✅ 坚固阵地被动生效 (防御姿态: -3伤害)`);
    passed++;
  } else {
    console.log(`  ❌ 坚固阵地被动未生效`);
    failed++;
  }
  
  const normalResult = fortifiedSkill.execute({ unit: normalUnit, damage: 20 });
  if (!normalResult.triggered) {
    console.log(`  ✅ 坚固阵地被动正确不触发 (非防御姿态)`);
    passed++;
  } else {
    console.log(`  ❌ 坚固阵地被动错误触发`);
    failed++;
  }

  // 测试战术撤退
  const retreatSkill = getFactionSkill(FACTION_IDS.MAXION, 'tactical_retreat');
  
  const lowHpUnit = { id: 'maxion_low', name: '低血量单位', faction: FACTION_IDS.MAXION, hp: 20, max_hp: 100 };
  const highHpUnit = { id: 'maxion_high', name: '满血单位', faction: FACTION_IDS.MAXION, hp: 80, max_hp: 100 };
  
  const retreatResult = retreatSkill.execute({ unit: lowHpUnit });
  if (retreatResult.triggered && retreatResult.mobility_bonus === 2) {
    console.log(`  ✅ 战术撤退被动生效 (低HP: +2机动)`);
    passed++;
  } else {
    console.log(`  ❌ 战术撤退被动未生效`);
    failed++;
  }
  
  const normalRetreatResult = retreatSkill.execute({ unit: highHpUnit });
  if (!normalRetreatResult.triggered) {
    console.log(`  ✅ 战术撤退被动正确不触发 (高HP)`);
    passed++;
  } else {
    console.log(`  ❌ 战术撤退被动错误触发`);
    failed++;
  }

  // ============================================================
  logSection('协同攻击被动测试');
  // ============================================================
  
  const coordinatedSkill = getFactionSkill(FACTION_IDS.BALON, 'coordinated_attack');
  
  const attacker = { id: 'balon_attacker', name: '攻击者', faction: FACTION_IDS.BALON, hp: 50, q: 0, r: 0 };
  const ally1 = { id: 'balon_ally1', name: '友军1', faction: FACTION_IDS.BALON, hp: 50, q: 1, r: 0 };  // 距离1
  const ally2 = { id: 'balon_ally2', name: '友军2', faction: FACTION_IDS.BALON, hp: 50, q: 5, r: 5 };  // 距离太远
  const allUnits = [attacker, ally1, ally2];
  
  const coordResult = coordinatedSkill.execute({ attacker, units: allUnits });
  
  if (coordResult.triggered && coordResult.attack_bonus === 2) {
    console.log(`  ✅ 协同攻击被动生效 (友军在范围内: +2攻击)`);
    passed++;
  } else {
    console.log(`  ❌ 协同攻击被动未生效`);
    failed++;
  }

  // ============================================================
  logSection('测试总结');
  // ============================================================
  
  console.log(`\n═══════════════════════════════════════════════════════════════`);
  console.log(`总计: ${passed + failed} 个测试`);
  console.log(`  ✅ 通过: ${passed}`);
  console.log(`  ❌ 失败: ${failed}`);
  console.log(`═══════════════════════════════════════════════════════════════`);
  
  return failed === 0;
}

// 运行测试
console.log('\n🧪 阵营技能系统测试');
console.log('═══════════════════════════════════════════════════════════════');

runTests()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(err => {
    console.error('测试执行失败:', err);
    process.exit(1);
  });
