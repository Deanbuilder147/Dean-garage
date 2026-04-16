const ConditionEvaluator = require('../src/services/combatCore/conditionEvaluator.cjs');
const TagRegistry = require('../src/services/combatCore/tagRegistry.cjs');
const HookChain = require('../src/services/combatCore/hookChain.cjs');

console.log('\n=== 调试斩杀词条 ===');
const executeTag = TagRegistry.getById('execute');
console.log('斩杀词条:', JSON.stringify(executeTag.conditions, null, 2));

const context1 = {
  attackType: 'melee',
  target: { hp: 3 },
  damageDealt: 2,
  attacker: { faction: 'earth' }
};

const result1 = ConditionEvaluator.evaluate(executeTag.conditions, context1);
console.log('条件评估结果:', result1);

// 检查 target_hp
const hpResult = ConditionEvaluator.evaluateSingle(
  { check: 'target_hp', value: 5, operator: '<' },
  context1
);
console.log('target_hp 评估:', hpResult, '(target.hp =', context1.target.hp + ')');

console.log('\n=== 调试专注射击词条 ===');
const focusedShotTag = TagRegistry.getById('focused_shot');
console.log('专注射击词条:', JSON.stringify(focusedShotTag.conditions, null, 2));

const context2 = {
  attackType: 'ranged',
  moveActionUsed: false,
  damageContext: { addStep: () => {} }
};

const result2 = ConditionEvaluator.evaluate(focusedShotTag.conditions, context2);
console.log('条件评估结果:', result2);

// 检查 move_action_used
const moveResult = ConditionEvaluator.evaluateSingle(
  { check: 'move_action_used', value: false, operator: '==' },
  context2
);
console.log('move_action_used 评估:', moveResult, '(value =', context2.moveActionUsed + ')');

console.log('\n=== 调试抗性词条 ===');
const resistanceTag = TagRegistry.getById('resistance');
console.log('抗性词条:', JSON.stringify(resistanceTag.conditions, null, 2));

const context3 = {
  defender: {
    right_hand_type: 'armor',
    right_hand_durability: 3,
    right_hand_resistance: 'kinetic'
  },
  damageType: 'kinetic'
};

const result3 = ConditionEvaluator.evaluate(resistanceTag.conditions, context3);
console.log('条件评估结果:', result3);

// 检查 has_armor
const armorResult = ConditionEvaluator.evaluateSingle(
  { check: 'has_armor', value: true, operator: '==' },
  context3
);
console.log('has_armor 评估:', armorResult);

// 检查 armor_resistance_type
const resistanceResult = ConditionEvaluator.evaluateSingle(
  { check: 'armor_resistance_type', ref: 'attack_damage_type', operator: '==' },
  context3
);
console.log('armor_resistance_type 评估:', resistanceResult);
console.log('  defender.right_hand_resistance =', context3.defender.right_hand_resistance);
console.log('  damageType =', context3.damageType);
