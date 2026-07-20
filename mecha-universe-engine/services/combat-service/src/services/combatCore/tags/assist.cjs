/**
 * 援助 (assist)
 * 触发阶段: on_ally_attacked (友军被攻击时)
 * 优先级: 70
 * 效果: 友军被攻击时可选择帮助
 */

module.exports = {
  id: 'assist',
  name: '援助',

  trigger: {
    phase: 'on_ally_attacked',
    timing: 'during_attack'
  },

  conditions: {
    required: [
      { check: 'ally_in_line_of_sight', value: true },
      { check: 'ally_faction', ref: 'self_faction', operator: '==' },
      { check: 'ally_is_being_attacked', value: true }
    ]
  },

  effects: [{
    type: 'assist_choice',
    choices: [
      {
        id: 'move_intercept',
        cost: 'give_up_move_action',
        effects: [
          { type: 'teleport_to_position', position: 'between_attacker_and_ally' },
          { type: 'share_damage', value: 5 }
        ]
      },
      {
        id: 'counter_attack',
        cost: 'give_up_combat_action',
        effects: [
          { type: 'counter_damage', target: 'attacker', value: 5 }
        ]
      }
    ]
  }],

  params: {
    priority: 70,
    optional: true,
    timing_lock: 'next_turn'
  }
};
