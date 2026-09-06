/**
 * 再动 (reattack)
 * 触发阶段: on_kill (击杀时)
 * 优先级: 90
 * 效果: 击杀敌方单位后获得额外回合
 */

module.exports = {
  id: 'reattack',
  name: '再动',

  trigger: {
    phase: 'on_kill',
    timing: 'immediate_after'
  },

  conditions: {
    required: [
      { check: 'target_faction', ref: 'enemy', operator: '==' },
      { check: 'extra_turn_used_this_round', value: false, operator: '==' }
    ]
  },

  effects: [{
    type: 'grant_extra_turn',
    scope: 'full_turn'
  }],

  params: {
    priority: 90,
    optional: false,
    trigger_limit: {
      type: 'per_round',
      max: 1
    },
    cooldown: {
      self_trigger: false
    }
  }
};
