/**
 * 决斗 (duel)
 * 触发阶段: pre_attack (攻击前)
 * 优先级: 10
 * 效果: 双方互相在射程内且HP都低于对方攻击值时，进入决斗模式
 */

module.exports = {
  id: 'duel',
  name: '决斗',

  trigger: {
    phase: 'pre_attack',
    timing: 'before_damage_calc'
  },

  conditions: {
    required: [
      { check: 'target_in_range', value: true, operator: '==' },
      { check: 'self_in_target_range', value: true, operator: '==' },
      { check: 'self_hp', ref: 'target_attack_max', operator: '<' },
      { check: 'target_hp', ref: 'self_attack_max', operator: '<' }
    ]
  },

  effects: [{
    type: 'duel_resolution',
    dice: {
      required: true,
      sides: 6,
      participants: ['attacker', 'defender'],
      outcomes: {
        'higher_wins': 'winner_continues_attack',
        'tie': 'both_dead'
      }
    }
  }],

  params: {
    priority: 10,
    optional: false,
    interrupt: true
  }
};
