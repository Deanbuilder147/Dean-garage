/**
 * 空投 (airdrop)
 * 触发阶段: round_start (轮次开始)
 * 优先级: 5
 * 效果: 第二轮开始时DM掷骰生成武器/防具
 */

module.exports = {
  id: 'airdrop',
  name: '空投',

  trigger: {
    phase: 'round_start',
    timing: 'turn_2_and_after',
    activation: 'dm_roll'
  },

  conditions: {
    required: [
      { check: 'current_round', value: 2, operator: '>=' }
    ]
  },

  effects: [
    {
      type: 'spawn_items',
      dice: {
        required: true,
        sides: 6,
        item_count: 'dice_result'
      },
      item_types: ['weapon', 'armor'],
      position: 'random'
    },
    {
      type: 'trigger_if_occupied',
      condition: 'target_position_has_unit',
      trigger: 'luck'
    }
  ],

  params: {
    priority: 5,
    optional: false,
    dm_controlled: true
  }
};
