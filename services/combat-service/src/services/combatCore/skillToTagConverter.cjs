/**
 * 技能到词条转换器
 * 
 * 将阵营技能（FactionSkillRegistry）转换为词条格式（v2规范）
 * 实现向后兼容：新系统使用词条，旧系统保持 faction_skill 接口
 */

const FactionSkillRegistry = require('./factionSkillRegistry.cjs');
const { FACTION_IDS } = FactionSkillRegistry;

/**
 * 阵营技能转换配置
 * 定义每个技能如何映射到词条格式
 */
const SKILL_TO_TAG_MAPPINGS = {
  // ========== 地球联合 ==========
  'earth:artillery': {
    // 技能ID -> 词条配置
    targetPhase: 'turn_start',
    priority: 85,
    conditions: {
      type: 'action_available',
      params: { cooldown_ready: true }
    },
    effects: {
      type: 'area_damage',
      params: { damage: 15, radius: 2 }
    }
  },
  'earth:fortified_position': {
    targetPhase: 'on_damage_taken',
    priority: 75,
    conditions: {
      type: 'stance_check',
      params: { stance: 'defensive' }
    },
    effects: {
      type: 'damage_reduction',
      params: { amount: 3 }
    }
  },

  // ========== 拜隆 ==========
  'balon:reinforcement': {
    targetPhase: 'on_ally_attacked',
    priority: 80,
    conditions: {
      type: 'ally_in_range',
      params: { range: 2, faction: 'balon' }
    },
    effects: {
      type: 'damage_share',
      params: { share_ratio: 0.5 }
    }
  },
  'balon:coordinated_attack': {
    targetPhase: 'pre_attack',
    priority: 60,
    conditions: {
      type: 'ally_in_range',
      params: { range: 2 }
    },
    effects: {
      type: 'attack_bonus',
      params: { amount: 2 }
    }
  },

  // ========== 马克西翁 ==========
  'maxion:fog_system': {
    targetPhase: 'turn_start',
    priority: 50,
    conditions: {
      type: 'auto_trigger',
      params: { faction: 'maxion' }
    },
    effects: {
      type: 'buff_random',
      params: {
        dice_sides: 6,
        effects: {
          1: { buff_type: 'defense', value: 2 },
          2: { buff_type: 'defense', value: 2 },
          3: { buff_type: 'mobility', value: 1 },
          4: { buff_type: 'mobility', value: 1 },
          5: { buff_type: 'attack', value: 1 },
          6: { buff_type: 'attack', value: 1 }
        }
      }
    }
  },
  'maxion:mobile_strike': {
    targetPhase: 'post_attack',
    priority: 55,
    conditions: {
      type: 'dice_check',
      params: { sides: 10, threshold: 5, comparison: '>' }
    },
    effects: {
      type: 'grant_buff',
      params: { buff_type: 'mobility', value: 1, duration: 1 }
    }
  },
  'maxion:tactical_retreat': {
    targetPhase: 'turn_start',
    priority: 45,
    conditions: {
      type: 'hp_threshold',
      params: { threshold: 0.3 }
    },
    effects: {
      type: 'grant_buff',
      params: { buff_type: 'mobility', value: 2, duration: 1 }
    }
  }
};

/**
 * 效果类型枚举
 */
const EFFECT_TYPES = {
  AREA_DAMAGE: 'area_damage',
  DAMAGE_REDUCTION: 'damage_reduction',
  DAMAGE_SHARE: 'damage_share',
  ATTACK_BONUS: 'attack_bonus',
  BUFF_RANDOM: 'buff_random',
  GRANT_BUFF: 'grant_buff'
};

/**
 * 技能到词条转换器
 */
class SkillToTagConverter {
  constructor() {
    this.mappings = SKILL_TO_TAG_MAPPINGS;
    this.convertedTags = new Map();
  }

  /**
   * 获取技能的唯一键
   * @param {string} faction - 阵营ID
   * @param {string} skillId - 技能ID
   * @returns {string}
   */
  getSkillKey(faction, skillId) {
    return `${faction}:${skillId}`;
  }

  /**
   * 转换单个技能为词条格式
   * @param {string} faction - 阵营ID
   * @param {string} skillId - 技能ID
   * @param {object} skill - 技能定义
   * @returns {object} 词条格式
   */
  convertSkill(faction, skillId, skill) {
    const key = this.getSkillKey(faction, skillId);
    const mapping = this.mappings[key];

    if (!mapping) {
      console.warn(`[Converter] 未找到映射配置: ${key}`);
      return null;
    }

    const tag = {
      id: `faction_${faction}_${skillId}`,
      name: skill.name,
      source: 'faction_skill',
      source_faction: faction,
      source_skill_id: skillId,

      trigger: {
        phase: mapping.targetPhase,
        type: skill.type
      },

      conditions: this.buildConditions(mapping, skill, faction),

      effects: this.buildEffects(mapping, skill),

      params: {
        priority: mapping.priority,
        optional: skill.type === 'action_available',
        passive: skill.type === 'passive' || skill.type === 'conditional_passive',
        cooldown: skill.params?.cooldown || null
      },

      // 保留原始技能信息用于向后兼容
      _original_skill: {
        id: skill.id,
        name: skill.name,
        description: skill.description,
        type: skill.type
      }
    };

    this.convertedTags.set(key, tag);
    return tag;
  }

  /**
   * 构建条件
   */
  buildConditions(mapping, skill, faction) {
    const conditions = {
      required: []
    };

    switch (mapping.conditions.type) {
      case 'action_available':
        conditions.required.push({
          check: 'cooldown_ready',
          value: true
        });
        break;

      case 'stance_check':
        conditions.required.push({
          check: 'unit_stance',
          value: mapping.conditions.params.stance
        });
        break;

      case 'ally_in_range':
        conditions.required.push({
          check: 'ally_in_line_of_sight',
          value: mapping.conditions.params.range
        });
        if (mapping.conditions.params.faction) {
          conditions.required.push({
            check: 'target_faction',
            value: mapping.conditions.params.faction,
            operator: '=='
          });
        }
        break;

      case 'dice_check':
        conditions.required.push({
          check: 'dice_roll',
          value: mapping.conditions.params.threshold,
          operator: mapping.conditions.params.comparison
        });
        break;

      case 'hp_threshold':
        conditions.required.push({
          check: 'target_hp_percent',
          value: mapping.conditions.params.threshold,
          operator: '<='
        });
        break;

      case 'auto_trigger':
        // 自动触发无需额外条件
        break;
    }

    return conditions;
  }

  /**
   * 构建效果
   */
  buildEffects(mapping, skill) {
    const effects = [];

    switch (mapping.effects.type) {
      case EFFECT_TYPES.AREA_DAMAGE:
        effects.push({
          type: 'area_damage',
          dice: false,
          params: {
            damage: mapping.effects.params.damage,
            radius: mapping.effects.params.radius
          }
        });
        break;

      case EFFECT_TYPES.DAMAGE_REDUCTION:
        effects.push({
          type: 'damage_reduction',
          dice: false,
          params: {
            amount: mapping.effects.params.amount
          }
        });
        break;

      case EFFECT_TYPES.DAMAGE_SHARE:
        effects.push({
          type: 'damage_share',
          dice: false,
          params: {
            share_ratio: mapping.effects.params.share_ratio
          }
        });
        break;

      case EFFECT_TYPES.ATTACK_BONUS:
        effects.push({
          type: 'damage_bonus',
          dice: false,
          params: {
            amount: mapping.effects.params.amount
          }
        });
        break;

      case EFFECT_TYPES.BUFF_RANDOM:
        effects.push({
          type: 'buff_random',
          dice: true,
          params: mapping.effects.params
        });
        break;

      case EFFECT_TYPES.GRANT_BUFF:
        effects.push({
          type: 'grant_buff',
          dice: false,
          params: mapping.effects.params
        });
        break;
    }

    return effects;
  }

  /**
   * 转换所有阵营技能
   * @returns {Map<string, object>} 转换后的词条
   */
  convertAll() {
    // 地球联合
    const earthData = FactionSkillRegistry.FactionSkillRegistry?.earth || FactionSkillRegistry['earth'];
    if (earthData) {
      Object.entries(earthData.skills).forEach(([skillId, skill]) => {
        this.convertSkill(FACTION_IDS.EARTH, skillId, skill);
      });
    }

    // 拜隆
    const balonData = FactionSkillRegistry.FactionSkillRegistry?.balon || FactionSkillRegistry['balon'];
    if (balonData) {
      Object.entries(balonData.skills).forEach(([skillId, skill]) => {
        this.convertSkill(FACTION_IDS.BALON, skillId, skill);
      });
    }

    // 马克西翁
    const maxionData = FactionSkillRegistry.FactionSkillRegistry?.maxion || FactionSkillRegistry['maxion'];
    if (maxionData) {
      Object.entries(maxionData.skills).forEach(([skillId, skill]) => {
        this.convertSkill(FACTION_IDS.MAXION, skillId, skill);
      });
    }

    return this.convertedTags;
  }

  /**
   * 获取阵营的词条
   * @param {string} faction - 阵营ID
   * @returns {object[]} 词条数组
   */
  getTagsForFaction(faction) {
    const tags = [];
    this.convertedTags.forEach((tag, key) => {
      if (key.startsWith(`${faction}:`)) {
        tags.push(tag);
      }
    });
    return tags;
  }

  /**
   * 获取所有已转换的词条
   * @returns {object[]}
   */
  getAllTags() {
    return Array.from(this.convertedTags.values());
  }

  /**
   * 导出为注册表格式
   * @returns {object} 可用于注册到 TagRegistry 的格式
   */
  exportAsRegistry() {
    const registry = {};
    this.convertedTags.forEach((tag, key) => {
      registry[tag.id] = tag;
    });
    return registry;
  }
}

// 单例导出
module.exports = new SkillToTagConverter();
module.exports.SkillToTagConverter = SkillToTagConverter;
module.exports.EFFECT_TYPES = EFFECT_TYPES;
