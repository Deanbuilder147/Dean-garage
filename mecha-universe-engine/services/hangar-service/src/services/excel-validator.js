/**
 * Excel数据验证器
 * Phase 28: 动态阵营支持 — faction 字段仅做软校验（warn），不阻止导入
 */
export class ExcelValidator {
  constructor(config) {
    this.config = config;
    this.errors = [];
    this.warnings = [];
  }

  /**
   * 验证完整数据
   * @param {Object} data - 解析后的Excel数据
   * @returns {Object} 验证结果 {valid, errors, warnings}
   */
  validate(data) {
    this.errors = [];
    this.warnings = [];

    console.log('[ExcelValidator] 开始验证数据...');

    // 验证基本信息
    this.validateBasic(data.basic);
    
    // 验证单位属性
    this.validateUnits(data.units);
    
    // 验证技能
    this.validateSkills(data.skills);

    const result = {
      valid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings
    };

    console.log(`[ExcelValidator] 验证完成: ${result.valid ? '通过' : '失败'}, 错误=${this.errors.length}, 警告=${this.warnings.length}`);
    
    return result;
  }

  /**
   * 验证基本信息
   */
  validateBasic(basic) {
    if (!basic) {
      this.errors.push({ field: 'basic', message: '基本信息缺失' });
      return;
    }

    // 验证机体番号
    if (!basic.name || basic.name.trim() === '') {
      this.errors.push({ field: 'name', message: '机体番号不能为空' });
    } else if (basic.name.length > 100) {
      this.errors.push({ field: 'name', message: '机体番号不能超过100个字符' });
    }

    // 验证阵营 (Phase 28: 动态阵营，仅做软校验)
    if (!basic.faction || basic.faction.trim() === '') {
      this.warnings.push({ 
        field: 'faction', 
        message: '阵营未填写，将使用默认值 earth' 
      });
    }

    // 验证总点数
    if (basic.totalPoints !== null && basic.totalPoints !== undefined) {
      const range = this.config.validation.ranges.totalPoints;
      if (basic.totalPoints < range.min || basic.totalPoints > range.max) {
        this.warnings.push({ 
          field: 'totalPoints', 
          message: `总点数 ${basic.totalPoints} 超出范围 ${range.min}-${range.max}` 
        });
      }
    }
  }

  /**
   * 验证单位属性
   */
  validateUnits(units) {
    if (!units) {
      this.errors.push({ field: 'units', message: '单位属性数据缺失' });
      return;
    }

    const required = ['主机体'];
    
    for (const name of required) {
      if (!units[name]) {
        this.errors.push({ field: `units.${name}`, message: `${name}数据缺失` });
      }
    }

    // 验证每个单位的属性
    for (const [name, unit] of Object.entries(units)) {
      this.validateUnit(name, unit);
    }
  }

  /**
   * 验证单个单位
   */
  validateUnit(name, unit) {
    if (!unit) return;

    // 验证类型
    if (unit.type && !this.config.validation.unitTypes.includes(unit.type)) {
      this.warnings.push({ 
        field: `units.${name}.type`, 
        message: `未知的单位类型: ${unit.type}` 
      });
    }

    // 验证数值属性
    const numericFields = ['格斗', '射击', '结构', '机动', 'skillSlots'];
    for (const field of numericFields) {
      const value = unit[field];
      if (value !== undefined && value !== null) {
        if (typeof value !== 'number') {
          this.warnings.push({ 
            field: `units.${name}.${field}`, 
            message: `${field}应为数值类型` 
          });
        } else {
          const range = this.config.validation.ranges[field];
          if (range && (value < range.min || value > range.max)) {
            this.warnings.push({ 
              field: `units.${name}.${field}`, 
              message: `${field} ${value} 超出范围 ${range.min}-${range.max}` 
            });
          }
        }
      }
    }
  }

  /**
   * 验证技能
   */
  validateSkills(skills) {
    if (!Array.isArray(skills)) {
      this.errors.push({ field: 'skills', message: '技能数据格式错误' });
      return;
    }

    // 统计各单位技能数量（键统一为中文口径，与解析器/落库一致）
    const skillCounts = {
      主机体: 0, 跟随: 0, 左手: 0, 右手: 0, 其它: 0
    };

    for (let i = 0; i < skills.length; i++) {
      const skill = skills[i];
      
      // 确定技能所属单位
      const owner = this.getSkillOwner(skill.slot);
      if (owner) {
        skillCounts[owner]++;
      }

      // 验证必填字段
      if (!skill.name || skill.name.trim() === '') {
        // 技能名称为空，跳过
        continue;
      }

      // 验证插槽号
      if (skill.slot !== undefined) {
        if (!Number.isInteger(skill.slot) || skill.slot < 1 || skill.slot > 12) {
          this.warnings.push({ 
            field: `skills[${i}].slot`, 
            message: `技能插槽号 ${skill.slot} 无效` 
          });
        }
      }

      // 验证技能类型
      if (skill.type && !['自动', '手动', '被动'].includes(skill.type)) {
        this.warnings.push({ 
          field: `skills[${i}].type`, 
          message: `未知的技能类型: ${skill.type}` 
        });
      }
    }

    // 检查技能数量是否超过限制
    const limits = this.config.sheets.skills.slots;
    const maxSlots = {
      主机体: limits.main.length,
      跟随: limits.royroy.length,
      左手: limits.left.length,
      右手: limits.right.length,
      其它: limits.extra.length
    };

    for (const [owner, count] of Object.entries(skillCounts)) {
      if (count > maxSlots[owner]) {
        this.warnings.push({ 
          field: `skills.${owner}`, 
          message: `${owner}技能数量${count}超过限制${maxSlots[owner]}` 
        });
      }
    }
  }

  /**
   * 根据插槽号获取技能所属单位（统一返回中文口径，与解析器一致）
   */
  getSkillOwner(slot) {
    if (!slot) return null;

    const slots = this.config.sheets.skills.slots;
    if (slots.main.includes(slot)) return '主机体';
    if (slots.royroy.includes(slot)) return '跟随';
    if (slots.left.includes(slot)) return '左手';
    if (slots.right.includes(slot)) return '右手';
    if (slots.extra.includes(slot)) return '其它';
    return null;
  }
}

export default ExcelValidator;
