/**
 * 联防 (formation_defense)
 * 触发阶段: movement_check (移动判定时)
 * 优先级: 95
 * 效果: 3个同阵营单位横向排列阻挡敌方穿越
 */

module.exports = {
  id: 'formation_defense',
  name: '联防',

  trigger: {
    phase: 'movement_check',
    timing: 'before_move_resolved'
  },

  conditions: {
    required: [
      { check: 'moving_unit_faction', ref: 'defending_units_faction', operator: '!=' },
      { check: 'blocking_units_count', value: 3, operator: '>=' },
      { check: 'blocking_units_aligned', value: 'horizontal', operator: '==' }
    ],
    formation: {
      type: 'line',
      orientation: 'horizontal',
      min_units: 3,
      spacing: 'adjacent'
    }
  },

  effects: [{
    type: 'block_movement',
    blocked: {
      directions: 'straight_line_through',
      exceptions: null
    },
    resolution: 'must_route_around'
  }],

  params: {
    priority: 95,
    optional: false,
    passive: true
  }
};
