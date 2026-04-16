/**
 * 词条兼容适配器 (TagCompatibilityAdapter)
 * 
 * 职责:
 * 1. 确保 faction_skill 字段与词条系统双向兼容
 * 2. 提供统一的技能查询接口
 * 3. 在战斗流程中自动同步新旧系统
 */

const FactionSkillRegistry = require('./factionSkillRegistry.cjs');
const tagRegistry = require('./tagRegistry.cjs');
const skillConverter = require('./skillToTagConverter.cjs');

class TagCompatibilityAdapter {
  constructor() {
    this.initialized = false;
    this.factionTagMap = new Map(); // 阵营技能ID -> 转换后词条ID
  }

  /**
   * 初始化适配器
   * 自动将所有阵营技能转换为词条并注册
   */
  initialize() {
    if (this.initialized) {
      return { status: 'already_initialized', tagsRegistered: this.factionTagMap.size };
    }

    // 1. 转换所有阵营技能为词条
    skillConverter.convertAll();
    const convertedTags = skillConverter.getAllTags();

    // 2. 注册到词条注册表
    convertedTags.forEach(tag => {
      // 使用带前缀的ID避免冲突
      const registryId = tag.id;
      
      // 保存映射关系
      const originalKey = `${tag.source_faction}:${tag.source_skill_id}`;
      this.factionTagMap.set(originalKey, registryId);

      // 注册到词条注册表（带标记表明来源）
      try {
        tagRegistry.register(registryId, tag);
      } catch (e) {
        // 词条已存在，跳过
      }
    });

    this.initialized = true;

    return {
      status: 'initialized',
      tagsRegistered: convertedTags.length,
      factions: ['earth', 'balon', 'maxion']
    };
  }

  /**
   * 获取单位的有效技能列表
   * 同时支持 faction_skill 和 equipped_tags
   * 
   * @param {object} unit - 单位对象
   * @returns {object[]} 技能列表
   */
  getUnitSkills(unit) {
    const skills = [];

    // 1. 获取阵营技能（从 faction_skill 字段）
    if (unit.faction_skill) {
      const factionSkills = Array.isArray(unit.faction_skill) 
        ? unit.faction_skill 
        : [unit.faction_skill];
      
      factionSkills.forEach(skillId => {
        const skill = FactionSkillRegistry.getFactionSkill(unit.faction, skillId);
        if (skill) {
          skills.push({
            ...skill,
            source: 'faction_skill',
            source_type: 'faction'
          });
        }
      });
    }

    // 2. 获取装备词条（从 equipped_tags 字段）
    if (unit.equipped_tags) {
      const tags = Array.isArray(unit.equipped_tags) 
        ? unit.equipped_tags 
        : [unit.equipped_tags];
      
      tags.forEach(tagId => {
        const tag = tagRegistry.getById(tagId);
        if (tag) {
          skills.push({
            ...tag,
            source: 'equipped_tag',
            source_type: 'item'
          });
        }
      });
    }

    return skills;
  }

  /**
   * 获取技能执行的触发钩子
   * 
   * @param {object} skill - 技能/词条对象
   * @returns {string|null} 触发阶段
   */
  getTriggerPhase(skill) {
    // 来自阵营技能
    if (skill.source === 'faction_skill' || skill.trigger?.phase) {
      return skill.trigger?.phase || skill.trigger?.phase;
    }
    
    // 来自词条
    if (skill.source === 'equipped_tag' || skill.conditions?.required) {
      return skill.trigger?.phase;
    }

    return null;
  }

  /**
   * 检查技能是否可以触发
   * 
   * @param {object} unit - 单位
   * @param {string} skillId - 技能ID（支持 faction:skillId 或直接 tagId）
   * @param {object} context - 执行上下文
   * @returns {boolean}
   */
  canTrigger(unit, skillId, context) {
    // 解析技能ID
    let faction, skillIdPart;
    
    if (skillId.includes(':')) {
      [faction, skillIdPart] = skillId.split(':');
    } else {
      faction = unit.faction;
      skillIdPart = skillId;
    }

    // 尝试从阵营技能获取
    const factionSkill = FactionSkillRegistry.getFactionSkill(faction, skillIdPart);
    if (factionSkill) {
      return this.checkFactionSkillCondition(factionSkill, unit, context);
    }

    // 尝试从词条获取
    const tag = tagRegistry.getById(skillId);
    if (tag) {
      return this.checkTagCondition(tag, unit, context);
    }

    return false;
  }

  /**
   * 检查阵营技能触发条件
   */
  checkFactionSkillCondition(skill, unit, context) {
    // 检查冷却
    if (skill.params?.cooldown && context.cooldowns?.[skill.id] > 0) {
      return false;
    }

    // 检查姿态
    if (skill.checkCondition && typeof skill.checkCondition === 'function') {
      return skill.checkCondition(unit);
    }

    return true;
  }

  /**
   * 检查词条触发条件
   */
  checkTagCondition(tag, unit, context) {
    const ConditionEvaluator = require('./conditionEvaluator.cjs');
    return ConditionEvaluator.evaluate(tag.conditions, context);
  }

  /**
   * 执行技能/词条
   * 统一接口，屏蔽来源差异
   * 
   * @param {string} skillId - 技能ID
   * @param {string} source - 来源类型 'faction_skill' | 'equipped_tag'
   * @param {object} context - 执行上下文
   * @returns {object} 执行结果
   */
  async execute(skillId, source, context) {
    if (source === 'faction_skill') {
      return this.executeFactionSkill(skillId, context);
    } else {
      return this.executeTag(skillId, context);
    }
  }

  /**
   * 执行阵营技能
   */
  async executeFactionSkill(skillId, context) {
    const [faction, sid] = skillId.includes(':') 
      ? skillId.split(':') 
      : [context.unit?.faction, skillId];

    const skill = FactionSkillRegistry.getFactionSkill(faction, sid);
    if (!skill || !skill.execute) {
      return { success: false, error: 'skill_not_found' };
    }

    return await skill.execute(context);
  }

  /**
   * 执行词条
   */
  async executeTag(tagId, context) {
    const EffectExecutor = require('./effectExecutor.cjs');
    const tag = tagRegistry.getById(tagId);
    
    if (!tag) {
      return { success: false, error: 'tag_not_found' };
    }

    return await EffectExecutor.execute(tag.effects, context);
  }

  /**
   * 获取兼容的技能信息摘要
   * 用于UI展示
   * 
   * @param {object} unit - 单位
   * @returns {object} 技能摘要
   */
  getSkillsSummary(unit) {
    const skills = this.getUnitSkills(unit);
    
    return {
      unit_id: unit.id,
      unit_name: unit.name,
      faction: unit.faction,
      skills: skills.map(s => ({
        id: s.id,
        name: s.name,
        description: s.description,
        source: s.source,
        trigger_phase: this.getTriggerPhase(s),
        type: s.type
      })),
      total_count: skills.length
    };
  }

  /**
   * 验证单位数据结构兼容性
   * 
   * @param {object} unit - 单位对象
   * @returns {object} 验证结果
   */
  validateUnitCompatibility(unit) {
    const issues = [];

    // 检查必要字段
    if (!unit.id) issues.push('缺少 id 字段');
    if (!unit.faction) issues.push('缺少 faction 字段');

    // 检查阵营有效性
    if (unit.faction && !['earth', 'balon', 'maxion'].includes(unit.faction)) {
      issues.push(`无效阵营: ${unit.faction}`);
    }

    // 检查技能字段（可选）
    const hasFactionSkill = unit.faction_skill !== undefined;
    const hasEquippedTags = unit.equipped_tags !== undefined;

    if (!hasFactionSkill && !hasEquippedTags) {
      issues.push('建议添加 faction_skill 或 equipped_tags 字段以获得完整技能');
    }

    return {
      valid: issues.length === 0,
      issues,
      warnings: issues.filter(i => i.includes('建议'))
    };
  }
}

// 单例导出
module.exports = new TagCompatibilityAdapter();
module.exports.TagCompatibilityAdapter = TagCompatibilityAdapter;
