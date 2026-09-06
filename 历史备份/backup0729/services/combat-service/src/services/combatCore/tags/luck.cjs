/**
 * 幸运 (luck)
 * 触发阶段: turn_start / on_airdrop_receive
 * 优先级: 80
 * 效果: 回合开始或获得空投时掷骰获得额外行动
 */

module.exports = {
  id: 'luck',
  name: '幸运',

  trigger: {
    phase: 'turn_start',
    timing: 'immediate',
    sources: ['turn_start', 'airdrop_receive']
  },

  conditions: {
    required: []
  },

  effects: [{
    type: 'luck_resolution',
    dice: {
      required: true,
      sides: 6,
      choices: [
        { range: [1, 2], effects: [{ type: 'skip_attack' }] },
        { range: [3, 4], effects: [{ type: 'normal_attack' }] },
        { range: [5, 6], effects: [{ type: 'extra_move' }, { type: 'extra_attack' }] }
      ]
    }
  }],

  params: {
    priority: 80,
    optional: false,
    consumable: true,
    duration: 1
  }
};
