/**
 * 奇袭系统词条 - 马克西翁阵营核心
 * 
 * 包含词条:
 * 1. stealth_initiate - 战术隐蔽（回合开始进入隐身）
 * 2. stealth_ambush - 奇袭（隐身攻击额外伤害）
 * 3. stealth_camouflage - 伪装（隐身闪避判定）
 * 4. stealth_break - 暴露（隐身结束后）
 */

module.exports = [
  // ============================================================
  // 词条1: 战术隐蔽 (stealth_initiate)
  // 触发阶段: turn_start
  // 优先级: 70
  // 效果: 单位进入隐身状态，直到攻击或移动
  // ============================================================
  {
    id: 'stealth_initiate',
    name: '战术隐蔽',
    faction: 'maxion', // 马克西翁专属
    description: '回合开始时进入隐身状态，攻击或移动后暴露',

    trigger: {
      phase: 'turn_start',
      timing: 'turn_begins_before_actions'
    },

    conditions: {
      required: [
        { check: 'unit_faction', value: 'maxion', operator: '==' }
      ]
    },

    effects: [{
      type: 'enter_stealth',
      stealthDuration: 'until_action',
      revealTriggers: ['attack', 'move', 'skill']
    }],

    params: {
      priority: 70,
      optional: false,
      passive: true,
      faction_lock: 'maxion'
    }
  },

  // ============================================================
  // 词条2: 奇袭 (stealth_ambush)
  // 触发阶段: pre_attack
  // 优先级: 80
  // 效果: 隐身攻击造成额外伤害
  // ============================================================
  {
    id: 'stealth_ambush',
    name: '奇袭',
    faction: 'maxion',
    description: '隐身状态下攻击造成额外50%伤害',

    trigger: {
      phase: 'pre_attack',
      timing: 'before_attack_resolved'
    },

    conditions: {
      required: [
        { check: 'attacker_is_stealth', value: true, operator: '==' }
      ]
    },

    effects: [{
      type: 'stealth_attack_bonus',
      multiplier: 1.5,
      bonusDice: { required: true, sides: 6, threshold: 5 }
    }],

    params: {
      priority: 80,
      optional: false,
      passive: false,
      interrupt: false,
      faction_lock: 'maxion'
    }
  },

  // ============================================================
  // 词条3: 伪装 (stealth_camouflage)
  // 触发阶段: on_defended (被攻击时)
  // 优先级: 60
  // 效果: 隐身状态下有概率闪避攻击
  // ============================================================
  {
    id: 'stealth_camouflage',
    name: '伪装',
    faction: 'maxion',
    description: '隐身状态下被攻击时有50%概率闪避',

    trigger: {
      phase: 'on_defended',
      timing: 'before_damage_taken'
    },

    conditions: {
      required: [
        { check: 'defender_is_stealth', value: true, operator: '==' }
      ]
    },

    effects: [{
      type: 'stealth_evasion',
      evasionChance: 0.5,
      dice: { required: true, sides: 6, threshold: 3 }
    }],

    params: {
      priority: 60,
      optional: false,
      passive: false,
      faction_lock: 'maxion'
    }
  },

  // ============================================================
  // 词条4: 暴露 (stealth_break)
  // 触发阶段: post_attack / movement_end
  // 优先级: 50
  // 效果: 攻击或移动后退出隐身状态
  // ============================================================
  {
    id: 'stealth_break',
    name: '暴露',
    faction: 'maxion',
    description: '攻击或移动后退出隐身状态',

    trigger: {
      phase: 'post_attack',
      timing: 'after_attack_resolved'
    },

    conditions: {
      required: [
        { check: 'attacker_is_stealth', value: true, operator: '==' }
      ]
    },

    effects: [{
      type: 'exit_stealth',
      reason: 'attack'
    }],

    params: {
      priority: 50,
      optional: false,
      passive: true,
      faction_lock: 'maxion'
    }
  },

  // ============================================================
  // 词条4b: 暴露 (移动后)
  // 触发阶段: movement_end
  // 优先级: 50
  // ============================================================
  {
    id: 'stealth_break_move',
    name: '暴露-移动',
    faction: 'maxion',
    description: '移动后退出隐身状态',

    trigger: {
      phase: 'movement_end',
      timing: 'after_move_resolved'
    },

    conditions: {
      required: [
        { check: 'moving_unit_is_stealth', value: true, operator: '==' }
      ]
    },

    effects: [{
      type: 'exit_stealth',
      reason: 'movement'
    }],

    params: {
      priority: 50,
      optional: false,
      passive: true,
      faction_lock: 'maxion'
    }
  }
];
