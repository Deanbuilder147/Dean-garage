/**
 * Phase 29-HangarRestoration — Excel数据验证器 (TypeScript, 旧版兼容 v2.1)
 *
 * 验证逻辑对齐 hangar-service /import-excel 直导模式：
 *   - 技能归属通过 owner 字段（行号范围分配）判断
 *   - 不再依赖 slot 列数值
 */

import { EXCEL_TEMPLATE, type ExcelTemplate } from './excel-template.js';
import type { ParsedResult, ParsedUnit, ParsedSkill } from './excel-parser.js';

export interface ValidationMessage {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationMessage[];
  warnings: ValidationMessage[];
}

export class ExcelValidator {
  private config: ExcelTemplate;
  private errors: ValidationMessage[] = [];
  private warnings: ValidationMessage[] = [];

  constructor(config: ExcelTemplate = EXCEL_TEMPLATE) {
    this.config = config;
  }

  /**
   * 验证完整解析数据
   */
  validate(data: ParsedResult): ValidationResult {
    this.errors = [];
    this.warnings = [];

    console.log('[ExcelValidator v2.1] 开始验证数据...');

    this.validateBasic(data.basic);
    this.validateUnits(data.units);
    this.validateSkills(data.skills);

    const result: ValidationResult = {
      valid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings,
    };

    console.log(
      `[ExcelValidator v2.1] 验证完成: ${result.valid ? '通过' : '失败'}, ` +
      `错误=${this.errors.length}, 警告=${this.warnings.length}`
    );

    return result;
  }

  /**
   * 验证基本信息
   */
  private validateBasic(basic: ParsedResult['basic']): void {
    if (!basic) {
      this.errors.push({ field: 'basic', message: '基本信息缺失' });
      return;
    }

    if (!basic.name || basic.name.trim() === '') {
      this.errors.push({ field: 'name', message: '机体番号不能为空 (期望在 C2 单元格)' });
    } else if (basic.name.length > 100) {
      this.errors.push({ field: 'name', message: '机体番号不能超过100个字符' });
    }

    if (!basic.faction || basic.faction.trim() === '') {
      this.warnings.push({ field: 'faction', message: '阵营未填写 (期望在 I2)，将使用默认值 earth' });
    }
  }

  /**
   * 验证单位属性
   */
  private validateUnits(units: Record<string, ParsedUnit>): void {
    if (!units) {
      this.errors.push({ field: 'units', message: '单位属性数据缺失' });
      return;
    }

    // 必须有主机体
    const required = ['主机体'];
    for (const name of required) {
      if (!units[name]) {
        this.errors.push({ field: `units.${name}`, message: `${name}数据缺失 (期望在第 ${this.getUnitRow(name)} 行)` });
      }
    }

    for (const [name, unit] of Object.entries(units)) {
      this.validateUnit(name, unit);
    }
  }

  /**
   * 获取单位对应的行号 (用于错误提示)
   */
  private getUnitRow(unitName: string): number {
    for (const rowConfig of this.config.sheets.units.rows) {
      if (rowConfig.name === unitName) return rowConfig.row;
    }
    return 0;
  }

  /**
   * 验证单个单位
   */
  private validateUnit(name: string, unit: ParsedUnit): void {
    if (!unit) return;

    if (unit.type && !this.config.validation.unitTypes.includes(unit.type)) {
      this.warnings.push({
        field: `units.${name}.type`,
        message: `未知的单位类型: ${unit.type}`,
      });
    }

    // 数值非负检查 (与旧版 /import-excel 的宽松验证一致)
    const numericFields = ['格斗', '射击', '结构', '机动'];
    for (const field of numericFields) {
      const value = (unit as any)[field];
      if (value !== undefined && value !== null) {
        if (typeof value !== 'number') {
          this.warnings.push({
            field: `units.${name}.${field}`,
            message: `${field}应为数值类型`,
          });
        } else if (value < 0) {
          this.warnings.push({
            field: `units.${name}.${field}`,
            message: `${name}${field}不能为负数 (当前值: ${value})`,
          });
        }
      }
    }
  }

  /**
   * 验证技能 (v2.1: 基于 owner 行号范围)
   */
  private validateSkills(skills: ParsedSkill[]): void {
    if (!Array.isArray(skills)) {
      this.errors.push({ field: 'skills', message: '技能数据格式错误' });
      return;
    }

    // 按 owner 统计技能数量
    const skillCounts: Record<string, number> = {};

    for (let i = 0; i < skills.length; i++) {
      const skill = skills[i];

      // 使用 owner 字段统计 (行号范围已由 parser 分配)
      const owner = skill.owner || '未知';
      skillCounts[owner] = (skillCounts[owner] || 0) + 1;

      if (!skill.name || skill.name.trim() === '') continue;

      // 技能类型软校验
      if (skill.type && !['自动', '自动化', '手动', '被动'].includes(skill.type)) {
        this.warnings.push({
          field: `skills[${i}].type`,
          message: `未知的技能类型: ${skill.type} (行${skill.row})`,
        });
      }
    }

    // 基于行号范围检查数量上限
    const ranges = this.config.sheets.skills.rowRanges;
    if (ranges) {
      const ownerLabelMap: Record<string, string> = {
        '主机体': 'main', '跟随': 'royroy',
        '右手': 'right', '左手': 'left', '其它': 'extra',
      };

      for (const [ownerKey, [start, end]] of Object.entries(ranges)) {
        const maxCount = end - start + 1;
        const displayName = { main: '主机体', royroy: '跟随', right: '右手', left: '左手', extra: '其它' }[ownerKey] || ownerKey;

        // 查找对应 owner 的实际数量
        let actualCount = 0;
        for (const [ownerName, count] of Object.entries(skillCounts)) {
          if (ownerLabelMap[ownerName] === ownerKey || ownerName === displayName) {
            actualCount += count;
          }
        }

        if (actualCount > maxCount) {
          this.warnings.push({
            field: `skills.${ownerKey}`,
            message: `${displayName}技能数量${actualCount}超过行${start}-${end}的范围限制(${maxCount}个)`,
          });
        }
      }
    }
  }
}

export default ExcelValidator;
