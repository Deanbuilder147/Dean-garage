/**
 * TagRegistry - 词条注册表
 * 管理所有词条定义，提供按阶段、优先级、效果类型查询
 */

const execute = require('./tags/execute.cjs');
const duel = require('./tags/duel.cjs');
const plunder = require('./tags/plunder.cjs');
const focusedShot = require('./tags/focused_shot.cjs');
const luck = require('./tags/luck.cjs');
const reattack = require('./tags/reattack.cjs');
const assist = require('./tags/assist.cjs');
const airdrop = require('./tags/airdrop.cjs');
const formationDefense = require('./tags/formation_defense.cjs');
const resistance = require('./tags/resistance.cjs');

class TagRegistry {
  constructor() {
    // 注册所有词条
    this.tags = {
      execute,
      duel,
      plunder,
      focused_shot: focusedShot,
      luck,
      reattack,
      assist,
      airdrop,
      formation_defense: formationDefense,
      resistance
    };

    // 按触发阶段索引
    this.byPhase = {
      round_start: ['airdrop'],
      turn_start: ['luck'],
      pre_attack: ['duel', 'focused_shot'],
      post_damage: ['execute', 'plunder'],
      on_kill: ['reattack'],
      on_ally_attacked: ['assist'],
      on_damage_taken: ['resistance'],
      on_airdrop_receive: ['luck'],
      movement_check: ['formation_defense']
    };

    // 按优先级排序
    this.byPriority = [
      { id: 'formation_defense', name: '联防', priority: 95 },
      { id: 'reattack', name: '再动', priority: 90 },
      { id: 'luck', name: '幸运', priority: 80 },
      { id: 'assist', name: '援助', priority: 70 },
      { id: 'execute', name: '斩杀', priority: 60 },
      { id: 'plunder', name: '抢夺', priority: 50 },
      { id: 'focused_shot', name: '专注射击', priority: 40 },
      { id: 'resistance', name: '抗性', priority: 30 },
      { id: 'duel', name: '决斗', priority: 10 },
      { id: 'airdrop', name: '空投', priority: 5 }
    ];

    // 按效果类型索引
    this.byEffect = {
      instant_kill: ['execute'],
      duel_resolution: ['duel'],
      plunder_attempt: ['plunder'],
      damage_bonus_dice: ['focused_shot'],
      luck_resolution: ['luck'],
      grant_extra_turn: ['reattack'],
      assist_choice: ['assist'],
      spawn_items: ['airdrop'],
      trigger_if_occupied: ['airdrop'],
      block_movement: ['formation_defense'],
      damage_reduction: ['resistance']
    };
  }

  /**
   * 获取所有词条
   */
  getAll() {
    return Object.values(this.tags);
  }

  /**
   * 根据ID获取词条
   */
  getById(id) {
    return this.tags[id];
  }

  /**
   * 获取指定阶段的词条ID列表
   */
  getTagsByPhase(phase) {
    return this.byPhase[phase] || [];
  }

  /**
   * 获取指定阶段的完整词条
   */
  getFullTagsByPhase(phase) {
    const tagIds = this.getTagsByPhase(phase);
    return tagIds.map(id => this.tags[id]).filter(Boolean);
  }

  /**
   * 按优先级获取词条（从高到低）
   */
  getTagsByPriority(phase = null) {
    if (phase) {
      const tagIds = this.getTagsByPhase(phase);
      return this.byPriority.filter(t => tagIds.includes(t.id));
    }
    return [...this.byPriority];
  }

  /**
   * 获取指定效果类型的词条
   */
  getTagsByEffect(effectType) {
    const tagIds = this.byEffect[effectType] || [];
    return tagIds.map(id => this.tags[id]).filter(Boolean);
  }

  /**
   * 获取词条列表（按优先级排序）
   */
  getTagsForPhase(phase) {
    const tagIds = this.getTagsByPhase(phase);
    return this.byPriority
      .filter(t => tagIds.includes(t.id))
      .map(t => this.tags[t.id])
      .filter(Boolean);
  }

  /**
   * 获取词条中文名称
   */
  getTagName(id) {
    const tag = this.tags[id];
    return tag ? tag.name : id;
  }

  /**
   * 获取词条信息摘要
   */
  getSummary() {
    return {
      total: Object.keys(this.tags).length,
      byPhase: Object.fromEntries(
        Object.entries(this.byPhase).map(([k, v]) => [k, v.length])
      ),
      tags: Object.entries(this.tags).map(([id, tag]) => ({
        id,
        name: tag.name,
        phase: tag.trigger.phase,
        priority: tag.params.priority
      }))
    };
  }
}

// 单例导出
module.exports = new TagRegistry();
