/**
 * Excel通用解析器
 * 基于配置模板解析Excel文件
 */
import xlsx from 'xlsx';

export class ExcelParser {
  constructor(template) {
    this.template = template;
  }

  /**
   * 解析Excel文件
   * @param {Buffer} buffer - Excel文件Buffer
   * @returns {Object} 解析后的数据
   */
  parse(buffer) {
    console.log('[ExcelParser] 开始解析Excel文件...');
    
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    console.log(`[ExcelParser] 工作表: ${workbook.SheetNames.join(', ')}`);

    // 使用第一个工作表
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    
    if (!sheet) {
      throw new Error('Excel文件中没有找到工作表');
    }

    const result = {
      basic: {},
      units: {},
      skills: [],
      metadata: {
        sheetName: workbook.SheetNames[0],
        parsedAt: new Date().toISOString(),
        version: this.template.version
      }
    };

    try {
      // 解析基本信息
      result.basic = this.parseBasic(sheet);
      console.log('[ExcelParser] 基本信息:', result.basic);

      // 解析单位属性
      result.units = this.parseUnits(sheet);
      console.log('[ExcelParser] 单位数量:', Object.keys(result.units).length);

      // 解析技能
      result.skills = this.parseSkills(sheet);
      console.log('[ExcelParser] 技能数量:', result.skills.length);

      console.log('[ExcelParser] 解析完成');
      return result;
    } catch (error) {
      console.error('[ExcelParser] 解析失败:', error.message);
      throw error;
    }
  }

  /**
   * 解析基本信息
   */
  parseBasic(sheet) {
    const basic = {};
    const fields = this.template.sheets.basic.fields;

    for (const field of fields) {
      const cell = sheet[field.cell];
      basic[field.key] = this.convertValue(cell?.v, field.type);
    }

    // 解析机体番号和行动代号（A2单元格）
    const nameCell = sheet['A2'];
    if (nameCell?.v) {
      const nameStr = String(nameCell.v).trim();
      // 尝试解析 "机体番号 (行动代号)" 格式
      const match = nameStr.match(/^(.+?)\s*\((.+?)\)$/);
      if (match) {
        basic.name = match[1].trim();
        basic.codename = match[2].trim();
      } else {
        basic.name = nameStr;
      }
    }

    return basic;
  }

  /**
   * 解析单位属性
   */
  parseUnits(sheet) {
    const units = {};
    const unitsConfig = this.template.sheets.units;
    const columns = unitsConfig.columns;

    for (const rowConfig of unitsConfig.rows) {
      const unitData = { name: rowConfig.name };
      
      for (const field of rowConfig.fields) {
        const col = columns[field];
        if (!col) continue;
        
        const cellRef = col + rowConfig.row;
        const cell = sheet[cellRef];
        
        if (field === 'type') {
          // 类型字段
          unitData[field] = cell?.v ? String(cell.v).trim() : 'none';
        } else {
          // 数值字段
          unitData[field] = this.parseNumber(cell?.v);
        }
      }

      // 判断单位是否存在（根据名称是否为空）
      const nameCell = sheet[columns.name + rowConfig.row];
      if (nameCell?.v && String(nameCell.v).trim() !== '') {
        units[rowConfig.name] = unitData;
      }
    }

    return units;
  }

  /**
   * 解析技能
   */
  parseSkills(sheet) {
    const skills = [];
    const skillsConfig = this.template.sheets.skills;
    const { startRow, maxRows, fields } = skillsConfig;

    for (let row = startRow; row < startRow + maxRows; row++) {
      const skill = { row };
      let hasData = false;

      for (const field of fields) {
        const cellRef = field.cell + row;
        const cell = sheet[cellRef];
        
        if (cell?.v) {
          hasData = true;
        }
        
        skill[field.key] = this.convertValue(cell?.v, field.type);
      }

      // 只保留有数据的技能
      if (hasData && skill.name) {
        // 确定技能所属单位
        skill.owner = this.getSkillOwner(skill.slot);
        skills.push(skill);
      }
    }

    return skills;
  }

  /**
   * 根据插槽号获取技能所属单位
   */
  getSkillOwner(slot) {
    if (!slot || typeof slot !== 'number') return null;
    
    const slots = this.template.sheets.skills.slots;
    if (slots.main.includes(slot)) return '主机体';
    if (slots.royroy.includes(slot)) return '跟随';
    if (slots.left.includes(slot)) return '左手';
    if (slots.right.includes(slot)) return '右手';
    if (slots.extra.includes(slot)) return '其它';
    return null;
  }

  /**
   * 转换单元格值
   */
  convertValue(value, type) {
    if (value === undefined || value === null) {
      return null;
    }

    switch (type) {
      case 'number':
        return this.parseNumber(value);
      case 'boolean':
        return Boolean(value);
      case 'select':
        return String(value).trim().toLowerCase();
      default:
        return String(value).trim();
    }
  }

  /**
   * 解析数值
   */
  parseNumber(value) {
    if (value === undefined || value === null) {
      return 0;
    }
    if (typeof value === 'number') {
      return value;
    }
    const parsed = parseFloat(String(value));
    return isNaN(parsed) ? 0 : parsed;
  }
}

export default ExcelParser;
