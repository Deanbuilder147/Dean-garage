/**
 * EquipmentManager 测试
 * 验证装备属性加成计算
 */

const EquipmentManager = require('../src/services/combatCore/equipManager.cjs');

console.log('=== EquipmentManager 测试 ===\n');

// 测试 1: 武器加成 (近战)
console.log('测试 1: 武器加成 (近战)');
const unit1 = {
  left_hand_type: 'weapon',
  left_hand_melee: 3,
  left_hand_ranged: 1,
  left_hand_name: '动力剑',
  right_hand_type: 'weapon',
  right_hand_melee: 2,
  right_hand_ranged: 4,
  right_hand_name: ' assault rifle'
};

const meleeBonus = EquipmentManager.getWeaponBonus(unit1, 'melee');
console.log('  单位装备:', {
  left: unit1.left_hand_name,
  right: unit1.right_hand_name
});
console.log('  近战加成:', meleeBonus.bonus, '(期望：5 = 3+2)');
console.log('  来源:', meleeBonus.sources.map(s => `${s.name} +${s.bonus}`).join(', '));
console.log('  ✅', meleeBonus.bonus === 5 ? '通过' : '失败');
console.log();

// 测试 2: 武器加成 (远程)
console.log('测试 2: 武器加成 (远程)');
const rangedBonus = EquipmentManager.getWeaponBonus(unit1, 'ranged');
console.log('  远程加成:', rangedBonus.bonus, '(期望：5 = 1+4)');
console.log('  来源:', rangedBonus.sources.map(s => `${s.name} +${s.bonus}`).join(', '));
console.log('  ✅', rangedBonus.bonus === 5 ? '通过' : '失败');
console.log();

// 测试 3: 防具防御
console.log('测试 3: 防具防御');
const unit2 = {
  left_hand_type: 'armor',
  left_hand_defense: 3,
  left_hand_durability: 5,
  left_hand_resistance: 'kinetic',
  left_hand_name: '复合装甲',
  right_hand_type: 'armor',
  right_hand_defense: 2,
  right_hand_durability: 3,
  right_hand_resistance: 'energy',
  right_hand_name: '能量护盾'
};

const armorDefense = EquipmentManager.getArmorDefense(unit2);
console.log('  单位装备:', {
  left: unit2.left_hand_name,
  right: unit2.right_hand_name
});
console.log('  防御加成:', armorDefense.reduction, '(期望：5 = 3+2)');
console.log('  来源:', armorDefense.sources.map(s => `${s.name} +${s.reduction}`).join(', '));
console.log('  ✅', armorDefense.reduction === 5 ? '通过' : '失败');
console.log();

// 测试 4: 耐久度消耗
console.log('测试 4: 耐久度消耗');
const unit3 = {
  left_hand_type: 'armor',
  left_hand_defense: 3,
  left_hand_durability: 2,
  left_hand_name: '重装甲'
};

console.log('  消耗前耐久:', unit3.left_hand_durability);
const consumeResult = EquipmentManager.consumeArmorDurability(unit3);
console.log('  消耗后耐久:', unit3.left_hand_durability);
console.log('  消耗记录:', consumeResult.consumed.length, '个装备');
console.log('  摧毁记录:', consumeResult.destroyed.length, '个装备');
console.log('  ✅', unit3.left_hand_durability === 1 ? '通过' : '失败');
console.log();

// 测试 5: 耐久度归零摧毁
console.log('测试 5: 耐久度归零摧毁');
const unit4 = {
  left_hand_type: 'armor',
  left_hand_defense: 3,
  left_hand_durability: 1,
  left_hand_name: '破损装甲'
};

console.log('  消耗前耐久:', unit4.left_hand_durability);
EquipmentManager.consumeArmorDurability(unit4);
console.log('  消耗后耐久:', unit4.left_hand_durability);
console.log('  装备类型:', unit4.left_hand_type, '(期望：null)');
console.log('  ✅', unit4.left_hand_durability === 0 && unit4.left_hand_type === null ? '通过' : '失败');
console.log();

// 测试 6: 抗性检查
console.log('测试 6: 抗性检查');
const unit5 = {
  left_hand_type: 'armor',
  left_hand_resistance: 'kinetic',
  right_hand_type: 'armor',
  right_hand_resistance: 'energy'
};

const resistances = EquipmentManager.getResistances(unit5);
console.log('  抗性列表:', resistances);
console.log('  有动能抗性:', EquipmentManager.hasResistance(unit5, 'kinetic'));
console.log('  有爆炸抗性:', EquipmentManager.hasResistance(unit5, 'explosive'));
console.log('  ✅', resistances.length === 2 && EquipmentManager.hasResistance(unit5, 'kinetic') ? '通过' : '失败');
console.log();

// 测试 7: 完整装备列表
console.log('测试 7: 完整装备列表');
const unit6 = {
  left_hand_type: 'weapon',
  left_hand_name: '激光剑',
  left_hand_melee: 5,
  right_hand_type: 'armor',
  right_hand_name: '塔盾',
  right_hand_defense: 4,
  right_hand_durability: 10
};

const allEquipment = EquipmentManager.getAllEquipment(unit6);
console.log('  装备数量:', allEquipment.length, '(期望：2)');
console.log('  装备详情:', JSON.stringify(allEquipment, null, 2));
console.log('  ✅', allEquipment.length === 2 ? '通过' : '失败');
console.log();

console.log('=== 测试完成 ===');
