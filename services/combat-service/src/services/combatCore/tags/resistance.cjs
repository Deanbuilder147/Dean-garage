/**
 * 抗性 (resistance)
 * 触发阶段: on_damage_taken (受到伤害时)
 * 优先级: 30
 * 效果: 有匹配抗性的防具时伤害-2
 */

module.exports = {
  id: 'resistance',
  name: '抗性',

  trigger: {
    phase: 'on_damage_taken',
    timing: 'damage_calculation'
  },

  conditions: {
    required: [
      { check: 'has_armor', value: true },
      { check: 'armor_resistance_type', ref: 'attack_damage_type', operator: '==' }
    ],
    armor_declaration: {
      types: ['kinetic', 'energy'],
      value: 2
    }
  },

  effects: [{
    type: 'damage_reduction',
    value: 2,
    calculation: 'subtract_before_armor'
  }],

  params: {
    priority: 30,
    optional: false,
    stacking: false,
    armor_linked: true
  }
};
