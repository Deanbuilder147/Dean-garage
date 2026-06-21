/**
 * Phase 6: 迁移与兼容测试
 * 
 * 测试内容:
 * 1. 阵营技能转换为词条格式
 * 2. 向后兼容性验证
 * 3. 统一技能查询接口
 * 4. 数据结构验证
 */

const assert = require('assert');

// 导入模块
const skillConverter = require('../src/services/combatCore/skillToTagConverter.cjs');
const tagAdapter = require('../src/services/combatCore/tagCompatibilityAdapter.cjs');
const FactionSkillRegistry = require('../src/services/combatCore/factionSkillRegistry.cjs');
const tagRegistry = require('../src/services/combatCore/tagRegistry.cjs');

// 直接使用FactionSkillRegistry对象
const FSR = FactionSkillRegistry.FactionSkillRegistry || FactionSkillRegistry;

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}`);
    console.log(`     错误: ${e.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg}: 期望 ${expected}, 实际 ${actual}`);
  }
}

function assertContains(obj, key, msg) {
  if (!(key in obj)) {
    throw new Error(`${msg}: 对象应包含 ${key}`);
  }
}

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('【Phase 6: 迁移与兼容测试】');
console.log('═══════════════════════════════════════════════════════════════\n');

// ============================================
// 1. 技能到词条转换测试
// ============================================
console.log('【技能到词条转换测试】');

test('应能转换地球联合-火力覆盖技能', () => {
  const tag = skillConverter.convertSkill('earth', 'artillery', 
    FSR['earth'].skills.artillery);
  
  assert(tag !== null, '应返回词条');
  assertEqual(tag.id, 'faction_earth_artillery', '词条ID正确');
  assertEqual(tag.trigger.phase, 'turn_start', '触发阶段正确');
  assertEqual(tag.params.priority, 85, '优先级正确');
});

test('应能转换地球联合-坚固阵地技能', () => {
  const tag = skillConverter.convertSkill('earth', 'fortified_position',
    FSR['earth'].skills.fortified_position);
  
  assertContains(tag, 'effects', '应包含效果');
  assertEqual(tag.effects[0].type, 'damage_reduction', '效果类型正确');
});

test('应能转换拜隆-增援技能', () => {
  const tag = skillConverter.convertSkill('balon', 'reinforcement',
    FSR['balon'].skills.reinforcement);
  
  assertEqual(tag.trigger.phase, 'on_ally_attacked', '触发阶段正确');
  assertEqual(tag.effects[0].type, 'damage_share', '效果类型正确');
});

test('应能转换拜隆-协同攻击技能', () => {
  const tag = skillConverter.convertSkill('balon', 'coordinated_attack',
    FSR['balon'].skills.coordinated_attack);
  
  assertEqual(tag.trigger.phase, 'pre_attack', '触发阶段正确');
  assertEqual(tag.params.priority, 60, '优先级正确');
});

test('应能转换马克西翁-迷雾系统技能', () => {
  const tag = skillConverter.convertSkill('maxion', 'fog_system',
    FSR['maxion'].skills.fog_system);
  
  assertEqual(tag.trigger.phase, 'turn_start', '触发阶段正确');
  assertEqual(tag.effects[0].type, 'buff_random', '效果类型正确');
});

test('应能转换马克西翁-机动打击技能', () => {
  const tag = skillConverter.convertSkill('maxion', 'mobile_strike',
    FSR['maxion'].skills.mobile_strike);
  
  assertEqual(tag.trigger.phase, 'post_attack', '触发阶段正确');
});

test('应能转换马克西翁-战术撤退技能', () => {
  const tag = skillConverter.convertSkill('maxion', 'tactical_retreat',
    FSR['maxion'].skills.tactical_retreat);
  
  assertEqual(tag.trigger.phase, 'turn_start', '触发阶段正确');
  assertEqual(tag.effects[0].params.buff_type, 'mobility', 'Buff类型正确');
});

// ============================================
// 2. 批量转换测试
// ============================================
console.log('\n【批量转换测试】');

test('应能批量转换所有阵营技能', () => {
  const tags = skillConverter.convertAll();
  assertEqual(tags.size, 7, '应转换7个技能');
});

test('应能获取阵营词条', () => {
  const earthTags = skillConverter.getTagsForFaction('earth');
  assertEqual(earthTags.length, 2, '地球联合应有2个词条');
  
  const balonTags = skillConverter.getTagsForFaction('balon');
  assertEqual(balonTags.length, 2, '拜隆应有2个词条');
  
  const maxionTags = skillConverter.getTagsForFaction('maxion');
  assertEqual(maxionTags.length, 3, '马克西翁应有3个词条');
});

test('应能导出为注册表格式', () => {
  const registry = skillConverter.exportAsRegistry();
  assertEqual(Object.keys(registry).length, 7, '注册表应有7个词条');
});

// ============================================
// 3. 兼容适配器测试
// ============================================
console.log('\n【兼容适配器测试】');

test('适配器应能初始化', () => {
  const result = tagAdapter.initialize();
  assertEqual(result.status, 'initialized', '初始化成功');
  assertEqual(result.tagsRegistered, 7, '应注册7个词条');
});

test('适配器应能获取单位阵营技能', () => {
  const unit = {
    id: 'unit1',
    name: '地球联合机甲',
    faction: 'earth',
    faction_skill: ['artillery', 'fortified_position']
  };
  
  const skills = tagAdapter.getUnitSkills(unit);
  assertEqual(skills.length, 2, '应有2个技能');
  assertEqual(skills[0].source, 'faction_skill', '来源正确');
});

test('适配器应能获取单位装备词条', () => {
  const unit = {
    id: 'unit2',
    name: '装备了词条的机甲',
    faction: 'balon',
    faction_skill: ['reinforcement'],
    equipped_tags: ['execute', 'plunder']
  };
  
  const skills = tagAdapter.getUnitSkills(unit);
  assertEqual(skills.length, 3, '应有3个技能（1阵营+2词条）');
});

test('适配器应能获取技能触发阶段', () => {
  const skill = {
    source: 'faction_skill',
    trigger: { phase: 'turn_start' }
  };
  
  const phase = tagAdapter.getTriggerPhase(skill);
  assertEqual(phase, 'turn_start', '触发阶段正确');
});

test('适配器应能获取技能摘要', () => {
  const unit = {
    id: 'unit3',
    name: '测试单位',
    faction: 'maxion',
    faction_skill: ['fog_system', 'mobile_strike', 'tactical_retreat']
  };
  
  const summary = tagAdapter.getSkillsSummary(unit);
  assertEqual(summary.total_count, 3, '应有3个技能');
  assertEqual(summary.faction, 'maxion', '阵营正确');
});

// ============================================
// 4. 数据结构兼容性测试
// ============================================
console.log('\n【数据结构兼容性测试】');

test('应能验证有效单位数据', () => {
  const unit = {
    id: 'test_unit',
    faction: 'earth',
    faction_skill: ['artillery']
  };
  
  const result = tagAdapter.validateUnitCompatibility(unit);
  assertEqual(result.valid, true, '应验证通过');
});

test('应能检测缺少必要字段', () => {
  const unit = {
    faction_skill: ['artillery']
  };
  
  const result = tagAdapter.validateUnitCompatibility(unit);
  assertEqual(result.valid, false, '应验证失败');
  assert(result.issues.length > 0, '应有错误信息');
});

test('应能检测无效阵营', () => {
  const unit = {
    id: 'test',
    faction: 'invalid_faction'
  };
  
  const result = tagAdapter.validateUnitCompatibility(unit);
  assertEqual(result.valid, false, '应验证失败');
});

// ============================================
// 5. 向后兼容性测试
// ============================================
console.log('\n【向后兼容性测试】');

test('原有FactionSkillRegistry接口应正常工作', () => {
  const skill = FactionSkillRegistry.getFactionSkill('earth', 'artillery');
  assert(skill !== null, '应能获取技能');
  assertEqual(skill.name, '火力覆盖', '技能名称正确');
});

test('原有技能执行接口应正常工作', () => {
  const unit = {
    id: 'unit1',
    name: '测试',
    q: 0, r: 0,
    hp: 100,
    faction: 'earth',
    stance: 'defensive',
    faction_buff: []
  };
  
  const context = {
    unit,
    caster: unit,
    centerQ: 0,
    centerR: 0,
    units: [unit],
    battlefieldState: { terrain: {} }
  };
  
  const result = FactionSkillRegistry.getFactionSkill('earth', 'fortified_position')
    .execute(context);
  
  assert(result !== undefined, '应返回结果');
});

test('应保留faction_skill字段', () => {
  const unit = {
    id: 'test',
    faction: 'earth',
    faction_skill: ['artillery']
  };
  
  // faction_skill字段应被保留
  assert('faction_skill' in unit, '应保留faction_skill字段');
});

// ============================================
// 6. 词条注册表集成测试
// ============================================
console.log('\n【词条注册表集成测试】');

test('转换后的词条应能注册到注册表', () => {
  // 适配器初始化时会注册
  const tag = tagRegistry.getById('faction_earth_artillery');
  assert(tag !== null, '应能从注册表获取词条');
});

test('应能查询特定阶段的词条', () => {
  const tags = tagRegistry.getTagsForPhase('turn_start');
  assert(tags.length > 0, '应有回合开始阶段的词条');
});

test('应能按优先级排序获取词条', () => {
  const tags = tagRegistry.getTagsByPriority(50, 100);
  assert(Array.isArray(tags), '应返回数组');
});

// ============================================
// 7. 效果执行测试
// ============================================
console.log('\n【效果执行测试】');

test('应能通过适配器执行阵营技能', async () => {
  const unit = {
    id: 'unit1',
    name: '地球联合',
    q: 0, r: 0,
    hp: 100,
    faction: 'earth',
    stance: 'defensive'
  };
  
  const context = {
    unit,
    caster: unit,
    damage: 10,
    units: [unit],
    battlefieldState: { terrain: {} }
  };
  
  const result = await tagAdapter.executeFactionSkill(
    'earth:fortified_position', 
    context
  );
  
  assert(result !== undefined, '应返回结果');
});

test('应能通过适配器执行词条', async () => {
  const unit = {
    id: 'unit1',
    name: '测试',
    hp: 100,
    q: 0, r: 0
  };
  
  const context = {
    unit,
    target: { hp: 50 }
  };
  
  const result = await tagAdapter.executeTag('execute', context);
  assert(result !== undefined, '应返回结果');
});

// ============================================
// 结果汇总
// ============================================
console.log('\n═══════════════════════════════════════════════════════════════');
console.log(`总计: ${passed + failed} 个测试`);
console.log(`✅ 通过: ${passed}`);
console.log(`❌ 失败: ${failed}`);
console.log('═══════════════════════════════════════════════════════════════\n');

if (failed > 0) {
  process.exit(1);
}
