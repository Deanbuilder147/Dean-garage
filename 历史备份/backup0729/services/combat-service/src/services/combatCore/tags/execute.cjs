/**
 * 斩杀 (execute)
 * 触发阶段: post_damage (伤害结算后)
 * 优先级: 60
 * 效果: 近战攻击后，若目标HP<5，掷骰≥目标血量则斩杀
 */

module.exports = {
  id: 'execute',
  name: '斩杀',

  trigger: {
    phase: 'post_damage',
    timing: 'after_melee'
  },

  conditions: {
    required: [
      { check: 'attack_type', value: 'melee', operator: '==' },
      { check: 'target_hp', value: 5, operator: '<' }
    ]
  },

  effects: [{
    type: 'instant_kill',
    dice: {
      required: true,
      sides: 6,
      condition: '>= target_hp',
      outcomes: {
        success: 'target_dead',
        fail: 'continue'
      }
    }
  }],

  params: {
    priority: 60,
    optional: false,
    consumable: false,
    interrupt: false
  }
};
