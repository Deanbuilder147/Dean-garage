/**
 * 战斗核心模块测试
 * 测试 DamagePipe, BuffManager, EquipmentManager
 */

import { DamagePipe, BuffManager, EquipmentManager } from '../src/services/combatCore/index.js';

console.log('========================================');
console.log('  机甲战棋 - 战斗核心模块测试');
console.log('========================================\n');

// 测试数据
const mockAttacker = {
  id: 'unit-001',
  name: '重装机甲',
  faction: 'earth',
  hp: 100,
  格斗: 8,
  射击: 5,
  机动: 4,
  left_hand_type: 'weapon',
  left_hand_melee: 3,
  left_hand_ranged: 2,
  right_hand_type: null,
  has_critical_chance: true
};

const mockTarget = {
  id: 'unit-002',
  name: '轻装机甲',
  faction: 'maxion',
  hp: 50,
  格斗: 4,
  射击: 3,
  机动: 5,
  left_hand_type: 'armor',
  left_hand_defense: 3,
  left_hand_durability: 2,
  right_hand_type: null,
  q: 2,
  r: 1
};

// =====================================
// 测试 1: EquipmentManager
// =====================================
console.log('【测试 1】EquipmentManager');
console.log('-'.repeat(40));

const weaponBonus = EquipmentManager.getWeaponBonus(mockAttacker, 'melee');
console.log('武器加成 (近战):', weaponBonus);

const armorDefense = EquipmentManager.getArmorDefense(mockTarget);
console.log('防具减伤:', armorDefense);

const handEquipment = EquipmentManager.getHandEquipment(mockAttacker);
console.log('手持装备:', handEquipment);
console.log('');

// =====================================
// 测试 2: BuffManager
// =====================================
console.log('【测试 2】BuffManager');
console.log('-'.repeat(40));

// 应用攻击Buff
const applyResult = BuffManager.applyBuff(mockAttacker, BuffManager.BUFF_TYPES.ATTACK, 2, 2);
console.log('应用攻击Buff:', applyResult);

const attackBonus = BuffManager.getAttackBonus(mockAttacker);
console.log('当前攻击加成:', attackBonus);

const activeBuffs = BuffManager.getActiveBuffs(mockAttacker);
console.log('所有有效Buff:', activeBuffs);

// 模拟回合
const expired = BuffManager.tickBuffs(mockAttacker);
console.log('回合开始，Buff减少:', expired);

console.log('');

// =====================================
// 测试 3: DamagePipe
// =====================================
console.log('【测试 3】DamagePipe - 完整攻击流程');
console.log('-'.repeat(40));

// 恢复目标HP
mockTarget.hp = 50;

// 恢复攻击者Buff
BuffManager.applyBuff(mockAttacker, BuffManager.BUFF_TYPES.ATTACK, 2, 3);

const attackResult = DamagePipe.resolve(mockAttacker, mockTarget, 'melee');
console.log('攻击结果:');
console.log(JSON.stringify(attackResult, null, 2));

console.log('');

// =====================================
// 测试 4: DamagePipe - 伤害计算分段
// =====================================
console.log('【测试 4】DamagePipe - 伤害计算分段');
console.log('-'.repeat(40));

mockTarget.hp = 40;
const damageCalc = DamagePipe.calculate({
  attacker: mockAttacker,
  target: mockTarget,
  attackType: 'melee'
});

console.log('伤害计算详情:');
damageCalc.steps.forEach((step, i) => {
  console.log(`  ${i + 1}. [${step.phase}] ${step.value} - ${step.note}`);
});

console.log('\n最终伤害:', damageCalc.final_damage);
console.log('目标HP:', `${damageCalc.target_hp_before} → ${damageCalc.target_hp_after}`);
console.log('Modifiers:', damageCalc.modifiers);

console.log('');

// =====================================
// 测试 5: 远程攻击
// =====================================
console.log('【测试 5】DamagePipe - 远程攻击');
console.log('-'.repeat(40));

mockTarget.hp = 30;
const rangedResult = DamagePipe.resolve(mockAttacker, mockTarget, 'ranged');
console.log('远程攻击伤害:', rangedResult.final_damage);

console.log('');

// =====================================
// 测试 6: 防御Buff生效
// =====================================
console.log('【测试 6】Buff系统 - 防御Buff');
console.log('-'.repeat(40));

// 清除之前的Buff
BuffManager.clearAllBuffs(mockAttacker);
BuffManager.clearAllBuffs(mockTarget);

// 应用防御Buff到目标
BuffManager.applyBuff(mockTarget, BuffManager.BUFF_TYPES.DEFENSE, 3, 2);
console.log('目标防御Buff:', BuffManager.getDefenseBonus(mockTarget));

// 再次攻击
mockTarget.hp = 40;
const withDefense = DamagePipe.resolve(mockAttacker, mockTarget, 'melee');
console.log('有防御Buff时伤害:', withDefense.final_damage);
console.log('防御减伤详情:', withDefense.breakdown.defense_reduction);

console.log('\n========================================');
console.log('  测试完成！');
console.log('========================================');
