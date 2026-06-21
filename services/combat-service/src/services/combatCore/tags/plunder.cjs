/**
 * 抢夺 (plunder)
 * 触发阶段: post_damage (伤害结算后)
 * 优先级: 50
 * 效果: 伤害值>目标武器攻击值时，可选择抢夺目标武器
 */

module.exports = {
  id: 'plunder',
  name: '抢夺',

  trigger: {
    phase: 'post_damage',
    timing: 'after_damage_resolved'
  },

  conditions: {
    required: [
      { check: 'damage_dealt', ref: 'target_weapon_attack', operator: '>' },
      { check: 'target_has_weapon', value: true, operator: '==' }
    ]
  },

  effects: [{
    type: 'plunder_attempt',
    dice: {
      required: true,
      sides: 6,
      choices: [
        { range: [1, 3], result: 'fail', effect: null },
        { range: [4, 6], result: 'success', effect: { damage_modifier: -10, loot_weapon: true } }
      ]
    }
  }],

  params: {
    priority: 50,
    optional: true,
    choices: ['attempt', 'skip']
  }
};
