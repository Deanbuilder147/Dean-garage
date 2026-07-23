# Excel导入功能重设计方案

## 当前问题分析

1. **硬编码单元格位置**：行号和列号（如 'A2', 'B3'）分散在代码中，难以维护
2. **字段数量不匹配**：字段与占位符数量不一致导致SQL错误
3. **缺少事务处理**：导入失败时数据可能不完整
4. **错误处理不足**：没有详细的导入日志和错误定位
5. **Excel模板不灵活**：结构变更需要修改代码

## 新方案设计

### 1. 模板配置化（config/excel-template.js）

```javascript
export const EXCEL_TEMPLATE = {
  version: '1.0',
  sheets: {
    basic: {
      name: '基本信息',
      fields: [
        { key: 'name', cell: 'B2', label: '机体番号', required: true },
        { key: 'codename', cell: 'B3', label: '行动代号' },
        { key: 'faction', cell: 'B4', label: '所属阵营', type: 'select', options: ['earth', 'balon', 'maxion'] },
        { key: 'totalPoints', cell: 'B5', label: '总点数', type: 'number' }
      ]
    },
    units: {
      name: '单位属性',
      rows: [
        { name: '主机体', row: 7, fields: ['type', '格斗', '射击', '结构', '机动'] },
        { name: '左手', row: 8, fields: ['type', '格斗', '射击', '结构', '机动'] },
        { name: '右手', row: 9, fields: ['type', '格斗', '射击', '结构', '机动'] },
        { name: '跟随', row: 10, fields: ['type', '格斗', '射击', '结构', '机动'] },
        { name: '其它', row: 11, fields: ['type', '格斗', '射击', '结构', '机动'] }
      ]
    },
    skills: {
      name: '技能列表',
      startRow: 14,
      maxRows: 20,
      fields: [
        { key: 'owner', cell: 'A', label: '所属单位', required: true },
        { key: 'name', cell: 'B', label: '技能名称', required: true },
        { key: 'type', cell: 'C', label: '技能类型' },
        { key: 'attribute', cell: 'D', label: '攻击属性' },
        { key: 'effect', cell: 'E', label: '技能效果' },
        { key: 'range', cell: 'F', label: '射程' },
        { key: 'special', cell: 'G', label: '特殊效果' }
      ]
    }
  }
};
```

### 2. 数据验证器（services/excel-validator.js）

```javascript
export class ExcelValidator {
  constructor(config) {
    this.config = config;
    this.errors = [];
    this.warnings = [];
  }

  validate(data) {
    this.errors = [];
    this.warnings = [];

    // 验证基本信息
    this.validateBasic(data.basic);
    
    // 验证单位属性
    this.validateUnits(data.units);
    
    // 验证技能
    this.validateSkills(data.skills);

    return {
      valid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings
    };
  }

  validateBasic(basic) {
    if (!basic.name) {
      this.errors.push({ field: 'name', message: '机体番号不能为空' });
    }
    if (basic.totalPoints && (basic.totalPoints < 0 || basic.totalPoints > 1000)) {
      this.errors.push({ field: 'totalPoints', message: '总点数必须在0-1000之间' });
    }
  }

  validateUnits(units) {
    const required = ['主机体'];
    for (const name of required) {
      if (!units[name]) {
        this.errors.push({ field: `units.${name}`, message: `${name}数据缺失` });
      }
    }
  }

  validateSkills(skills) {
    const validOwners = ['主机体', '左手', '右手', '跟随', '其它'];
    for (const skill of skills) {
      if (!validOwners.includes(skill.owner)) {
        this.errors.push({ field: 'skills', message: `无效的所属单位: ${skill.owner}` });
      }
    }
  }
}
```

### 3. 通用Excel解析器（services/excel-parser.js）

```javascript
import xlsx from 'xlsx';

export class ExcelParser {
  constructor(template) {
    this.template = template;
  }

  parse(buffer) {
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    const result = {
      basic: {},
      units: {},
      skills: [],
      metadata: {
        sheetNames: workbook.SheetNames,
        parsedAt: new Date().toISOString()
      }
    };

    // 优先尝试从第一个sheet读取
    const sheet = workbook.Sheets[workbook.SheetNames[0]];

    // 解析基本信息
    result.basic = this.parseBasic(sheet);

    // 解析单位属性
    result.units = this.parseUnits(sheet);

    // 解析技能
    result.skills = this.parseSkills(sheet);

    return result;
  }

  parseBasic(sheet) {
    const basic = {};
    for (const field of this.template.sheets.basic.fields) {
      const cell = sheet[field.cell];
      basic[field.key] = this.convertValue(cell?.v, field.type);
    }
    return basic;
  }

  parseUnits(sheet) {
    const units = {};
    const columns = { type: 'B', 格斗: 'D', 射击: 'E', 结构: 'F', 机动: 'G' };

    for (const rowConfig of this.template.sheets.units.rows) {
      const unitData = { name: rowConfig.name };
      for (const field of rowConfig.fields) {
        const cellRef = columns[field] + rowConfig.row;
        const cell = sheet[cellRef];
        unitData[field] = field === 'type' ? (cell?.v || 'none') : (parseInt(cell?.v) || 0);
      }
      units[rowConfig.name] = unitData;
    }
    return units;
  }

  parseSkills(sheet) {
    const skills = [];
    const { startRow, maxRows, fields } = this.template.sheets.skills;

    for (let row = startRow; row < startRow + maxRows; row++) {
      const skill = { row };
      let hasData = false;

      for (const field of fields) {
        const cellRef = field.cell + row;
        const cell = sheet[cellRef];
        if (cell?.v) hasData = true;
        skill[field.key] = this.convertValue(cell?.v, field.type);
      }

      if (hasData) {
        skills.push(skill);
      }
    }
    return skills;
  }

  convertValue(value, type) {
    if (value === undefined || value === null) return null;
    switch (type) {
      case 'number': return parseFloat(value) || 0;
      case 'boolean': return Boolean(value);
      default: return String(value).trim();
    }
  }
}
```

### 4. 事务化导入服务（services/unit-import-service.js）

```javascript
export class UnitImportService {
  constructor(db) {
    this.db = db;
  }

  async import(data, userId) {
    const log = new ImportLog();
    
    try {
      // 开始事务
      this.db.prepare('BEGIN TRANSACTION').run();
      log.addStep('transaction', '开始事务');

      // 1. 插入主记录
      const unitId = await this.insertUnit(data, userId, log);
      
      // 2. 插入装备
      await this.insertEquipments(unitId, data.units, log);
      
      // 3. 插入技能
      await this.insertSkills(unitId, data.skills, log);

      // 提交事务
      this.db.prepare('COMMIT').run();
      log.addStep('transaction', '提交事务成功');

      return {
        success: true,
        unitId,
        log: log.getEntries()
      };
    } catch (error) {
      // 回滚事务
      this.db.prepare('ROLLBACK').run();
      log.addStep('error', `导入失败: ${error.message}`);
      
      return {
        success: false,
        error: error.message,
        log: log.getEntries()
      };
    }
  }

  async insertUnit(data, userId, log) {
    const unit = data.basic;
    const mainUnit = data.units['主机体'];

    const sql = `
      INSERT INTO units (
        name, faction, user_id, codename,
        main_type, main_格斗, main_射击, main_结构, main_机动, main_skills,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `;

    const result = this.db.prepare(sql).run(
      unit.name,
      unit.faction || 'earth',
      userId,
      unit.codename || null,
      '机体',
      mainUnit.格斗 || 0,
      mainUnit.射击 || 0,
      mainUnit.结构 || 0,
      mainUnit.机动 || 0,
      JSON.stringify(data.skills.filter(s => s.owner === '主机体'))
    );

    log.addStep('insert', `创建单位: ${unit.name}, ID: ${result.lastInsertRowid}`);
    return result.lastInsertRowid;
  }
}

class ImportLog {
  constructor() {
    this.entries = [];
    this.startTime = Date.now();
  }

  addStep(type, message) {
    this.entries.push({
      timestamp: new Date().toISOString(),
      elapsed: Date.now() - this.startTime,
      type,
      message
    });
  }

  getEntries() {
    return this.entries;
  }
}
```

### 5. API路由简化（routes/units.js）

```javascript
import { ExcelParser } from '../services/excel-parser.js';
import { ExcelValidator } from '../services/excel-validator.js';
import { UnitImportService } from '../services/unit-import-service.js';
import { EXCEL_TEMPLATE } from '../config/excel-template.js';

router.post('/import-excel', authenticate, upload.single('file'), async (req, res) => {
  try {
    // 1. 解析Excel
    const parser = new ExcelParser(EXCEL_TEMPLATE);
    const data = parser.parse(req.file.buffer);

    // 2. 验证数据
    const validator = new ExcelValidator(EXCEL_TEMPLATE);
    const validation = validator.validate(data);
    
    if (!validation.valid) {
      return res.status(400).json({
        error: '数据验证失败',
        details: validation.errors,
        warnings: validation.warnings
      });
    }

    // 3. 导入数据
    const importService = new UnitImportService(db);
    const result = await importService.import(data, req.user.id);

    if (!result.success) {
      return res.status(500).json({
        error: '导入失败',
        message: result.error,
        log: result.log
      });
    }

    res.json({
      success: true,
      message: '导入成功',
      unitId: result.unitId,
      warnings: validation.warnings,
      log: result.log
    });

  } catch (error) {
    console.error('Excel导入错误:', error);
    res.status(500).json({
      error: '系统错误',
      message: error.message
    });
  }
});
```

## 方案优势

| 特性 | 旧方案 | 新方案 |
|------|--------|--------|
| 配置化 | ❌ 硬编码 | ✅ 模板配置 |
| 验证器 | ⚠️ 简单检查 | ✅ 详细验证+错误定位 |
| 事务 | ❌ 无 | ✅ 完整事务支持 |
| 日志 | ⚠️ 控制台 | ✅ 结构化导入日志 |
| 错误恢复 | ❌ 失败即崩溃 | ✅ 回滚+详细报告 |
| 维护性 | ❌ 难维护 | ✅ 模块化+配置驱动 |

## 实施计划

1. **阶段1**: 创建配置和验证器（1天）
2. **阶段2**: 实现通用解析器（1天）
3. **阶段3**: 实现事务化导入服务（1天）
4. **阶段4**: 重构API路由（0.5天）
5. **阶段5**: 集成测试（1天）

## 兼容性

- 保持现有Excel模板格式兼容
- 新增配置项支持扩展
- 逐步迁移，不影响现有数据
