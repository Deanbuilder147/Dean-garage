const ConditionEvaluator = require('../src/services/combatCore/conditionEvaluator.cjs');

const context = {
  defender: {
    right_hand_type: 'armor',
    right_hand_durability: 3,
    right_hand_resistance: 'kinetic'
  },
  damageType: 'kinetic'
};

console.log('defender.right_hand_resistance =', 
  ConditionEvaluator.getValueFromContext(context, 'defender.right_hand_resistance'));
console.log('armor_resistance_type =', 
  ConditionEvaluator.getValueFromContext(context, 'armor_resistance_type'));
console.log('attack_damage_type =', 
  ConditionEvaluator.getValueFromContext(context, 'attack_damage_type'));
console.log('damageType =', 
  ConditionEvaluator.getValueFromContext(context, 'damageType'));

// 测试 armor_resistance_type 的条件
const result = ConditionEvaluator.evaluateSingle(
  { check: 'armor_resistance_type', ref: 'attack_damage_type', operator: '==' },
  context
);
console.log('\narmor_resistance_type == attack_damage_type:', result);
