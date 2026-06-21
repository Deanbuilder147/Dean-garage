/**
 * 专注射击 (focused_shot)
 * 触发阶段: pre_attack (攻击前)
 * 优先级: 40
 * 效果: 远程攻击时放弃移动，掷骰获得伤害加成
 */

module.exports = {
  id: 'focused_shot',
  name: '专注射击',

  trigger: {
    phase: 'pre_attack',
    timing: 'before_damage_calc'
  },

  conditions: {
    required: [
      { check: 'attack_type', value: 'ranged', operator: '==' },
      { check: 'move_action_used', value: false, operator: '==' }
    ],
    action_cost: {
      give_up: 'move_action',
      remaining: false
    }
  },

  effects: [{
    type: 'damage_bonus_dice',
    dice: {
      required: true,
      sides: 6,
      choices: [
        { range: [1, 4], damage_bonus: 3 },
        { range: [5, 6], damage_bonus: 5 }
      ]
    }
  }],

  params: {
    priority: 40,
    optional: true,
    setup_phase: 'turn_start'
  }
};
