/**
 * Phase 29-HangarRestoration — Excel通用解析器 (TypeScript, 旧版兼容 v2.1)
 *
 * 基于配置模板解析 Excel 文件，产出归一化前的原始数据。
 * 完全对齐 hangar-service /import-excel 直导模式的坐标和分配逻辑：
 *   - 工作表: 优先 "设定器"，回退第一个
 *   - 技能归属: 按行号范围硬编码（非 slot 列数值）
 * Schema 归一化由 excel-schema-normalizer.ts 在后处理阶段完成。
 */
import * as XLSX from 'xlsx';
import { EXCEL_TEMPLATE, type ExcelTemplate } from './excel-template.js';

// 旧版阵营映射（与 /import-excel 直导一致）
const FACTION_MAP: Record<string, string> = {
  '地球联合': 'earth', '拜隆': 'balon', '马克西翁': 'maxion',
  '拜隆军': 'balon', '地球联合军': 'earth',
  '地球': 'earth', '马克': 'maxion',
};

export interface ParsedBasic {
  name: string;
  codename: string | null;
  faction: string;
  totalPoints: number | null;
}

export interface ParsedUnit {
  name: string;
  type: string;
  格斗: number;
  射击: number;
  结构: number;
  机动: number;
  skillSlots: number;
}

export interface ParsedSkill {
  row: number;
  name: string;
  type: string;
  attribute: string;
  effect: string;
  range: string;
  special: string;
  /** 技能归属单位名 (主机体/跟随/左手/右手/其它) */
  owner: string | null;
}

export interface ParsedResult {
  basic: ParsedBasic;
  units: Record<string, ParsedUnit>;
  skills: ParsedSkill[];
  metadata: {
    sheetName: string;
    parsedAt: string;
    version: string;
  };
}

export class ExcelParser {
  private template: ExcelTemplate;

  constructor(template: ExcelTemplate = EXCEL_TEMPLATE) {
    this.template = template;
  }

  /**
   * 解析 Excel 文件 Buffer
   */
  parse(buffer: Buffer): ParsedResult {
    console.log('[ExcelParser v2.1] 开始解析 Excel 文件...');

    const workbook = XLSX.read(buffer, { type: 'buffer' });
    console.log(`[ExcelParser v2.1] 工作表: ${workbook.SheetNames.join(', ')}`);

    // ====== 旧版兼容: 优先查找 "设定器" 工作表 ======
    const sheetName = this.selectSheet(workbook);
    const sheet = workbook.Sheets[sheetName];
    console.log(`[ExcelParser v2.1] 使用工作表: "${sheetName}"`);

    const result: ParsedResult = {
      basic: { name: '', codename: null, faction: 'earth', totalPoints: null },
      units: {},
      skills: [],
      metadata: {
        sheetName,
        parsedAt: new Date().toISOString(),
        version: this.template.version,
      },
    };

    try {
      result.basic = this.parseBasic(sheet);
      console.log('[ExcelParser v2.1] 基本信息:', JSON.stringify(result.basic));

      result.units = this.parseUnits(sheet);
      console.log('[ExcelParser v2.1] 单位数量:', Object.keys(result.units).length);

      result.skills = this.parseSkills(sheet);
      console.log('[ExcelParser v2.1] 技能数量:', result.skills.length);

      console.log('[ExcelParser v2.1] 解析完成');
      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[ExcelParser v2.1] 解析失败:', msg);
      throw error;
    }
  }

  /**
   * 选择工作表：优先 "设定器"，回退第一个
   */
  private selectSheet(workbook: XLSX.WorkBook): string {
    // 优先查找 "设定器" (与旧版 /import-excel 一致)
    if (workbook.Sheets['设定器']) {
      return '设定器';
    }
    // 回退到第一个工作表
    const first = workbook.SheetNames[0];
    if (!first) {
      throw new Error('Excel 文件中没有找到工作表');
    }
    console.warn(`[ExcelParser v2.1] 未找到"设定器"工作表，使用第一个: "${first}"`);
    return first;
  }

  /**
   * 解析基本信息区域 (旧版坐标: C2=番号, F2=代号, I2=阵营)
   */
  private parseBasic(sheet: XLSX.WorkSheet): ParsedBasic {
    const basic: ParsedBasic = {
      name: '',
      codename: null,
      faction: 'earth',
      totalPoints: null,
    };

    // 按字段配置解析
    for (const field of this.template.sheets.basic.fields) {
      const cell = sheet[field.cell];
      const val = this.convertValue(cell?.v, field.type);

      if (field.key === 'name') {
        basic.name = String(val ?? '').trim();
      } else if (field.key === 'codename') {
        basic.codename = val ? String(val).trim() : null;
      } else if (field.key === 'faction') {
        // 旧版阵营映射：先尝试中文映射，再直接用值
        const raw = String(val ?? 'earth').trim();
        basic.faction = FACTION_MAP[raw] || raw.toLowerCase() || 'earth';
      } else if (field.key === 'totalPoints') {
        basic.totalPoints = typeof val === 'number' ? val : null;
      }
    }

    // 兜底: 如果 C2 为空，尝试 A2 的 "番号 (代号)" 格式
    if (!basic.name) {
      const fallbackCell = sheet['A2'];
      if (fallbackCell?.v) {
        const nameStr = String(fallbackCell.v).trim();
        const match = nameStr.match(/^(.+?)\s*\((.+?)\)$/);
        if (match) {
          basic.name = match[1].trim();
          basic.codename = match[2].trim();
        } else {
          basic.name = nameStr;
        }
      }
    }

    return basic;
  }

  /**
   * 解析单位属性区域 (旧版: 行4-8)
   *
   * ★ 改造点 (Phase 29 动态归属):
   *   单位归属由 A 列内容判定，而非写死的行号/name。
   *   A=名称(单位归属来源), B=类型, C=总点数(忽略),
   *   D=格斗, E=射击, F=结构, G=机动, H=插槽。
   *   A 列内容经 resolveUnitKey 归一为标准 key (主机体/跟随/左手/右手/其它)，
   *   命中别名/标准名则存标准 key，否则存 A 列原文。A 列为空则跳过该行。
   */
  private parseUnits(sheet: XLSX.WorkSheet): Record<string, ParsedUnit> {
    const units: Record<string, ParsedUnit> = {};
    const unitsConfig = this.template.sheets.units;
    const columns = unitsConfig.columns;

    for (const rowConfig of unitsConfig.rows) {
      // A 列内容 = 单位归属来源
      const nameCell = sheet[columns.name + String(rowConfig.row)];
      const aText = nameCell?.v ? String(nameCell.v).trim() : '';
      if (!aText) continue; // A 列为空 → 跳过该行

      const unitKey = this.resolveUnitKey(aText) || aText;
      if (units[unitKey]) {
        console.warn(`[ExcelParser v2.1] 单位 "${unitKey}" 在行 ${rowConfig.row} 重复出现，后者覆盖前者`);
      }

      const unitData: ParsedUnit = {
        name: aText,
        type: 'none',
        格斗: 0,
        射击: 0,
        结构: 0,
        机动: 0,
        skillSlots: 0,
      };

      for (const field of rowConfig.fields) {
        if (field === 'name') continue; // name 已取自 A 列
        const col = columns[field];
        if (!col) continue;

        const cellRef = col + String(rowConfig.row);
        const cell = sheet[cellRef];
        const val = cell?.v;

        if (field === 'type') {
          unitData.type = val ? String(val).trim() : 'none';
        } else if (field === 'skillSlots') {
          unitData.skillSlots = this.parseNumber(val);
        } else {
          (unitData as any)[field] = this.parseNumber(val);
        }
      }

      units[unitKey] = unitData;
      console.log(`[ExcelParser v2.1] 行 ${rowConfig.row}: A="${aText}" → key="${unitKey}"`);
    }

    return units;
  }

  /**
   * 将 A 列填写的单位名归一为标准 key (主机体/跟随/左手/右手/其它)。
   * 精确匹配标准名或别名 → 返回标准 key；否则返回 null (交由调用方使用原文)。
   */
  private resolveUnitKey(aText: string): string | null {
    const ALIASES: Record<string, string[]> = {
      '主机体': ['主机体', '主机', '本体', '主体', 'main', 'mech', '机体'],
      '跟随':   ['跟随', '随从', '辅机', '支援机', 'royroy', 'sub'],
      '左手':   ['左手', '左臂', '左武器', 'left', 'l'],
      '右手':   ['右手', '右臂', '右武器', 'right', 'r'],
      '其它':   ['其它', '其他', '配件', '装备', 'extra'],
    };
    const norm = aText.trim().toLowerCase();
    // 1) 精确匹配（标准名 + 别名）
    for (const [key, aliases] of Object.entries(ALIASES)) {
      if (key.toLowerCase() === norm) return key;
      if (aliases.some((a) => a.toLowerCase() === norm)) return key;
    }
    // 2) 包含匹配兜底（如 "主机-α" → 主机体）
    for (const [key, aliases] of Object.entries(ALIASES)) {
      if (aliases.some((a) => norm.includes(a.toLowerCase()))) return key;
    }
    return null;
  }

  /**
   * 解析技能区域 (旧版: 行12-22, 按行号范围分配归属)
   *
   * 字段: C=名称, D=类型, E=属性, F=效果, G=射程, H=特殊
   * 分配规则:
   *   行 12-14 → 主机体 (3个)
   *   行 15-16 → 跟随   (2个)
   *   行 17-18 → 右手   (2个)
   *   行 19-20 → 左手   (2个)
   *   行 21-22 → 其它   (2个)
   */
  private parseSkills(sheet: XLSX.WorkSheet): ParsedSkill[] {
    const skills: ParsedSkill[] = [];
    const skillsConfig = this.template.sheets.skills;
    const { startRow, maxRows, fields } = skillsConfig;

    for (let row = startRow; row < startRow + maxRows; row++) {
      const skill: ParsedSkill = {
        row,
        name: '',
        type: '',
        attribute: '',
        effect: '',
        range: '',
        special: '',
        owner: null,
      };
      let hasData = false;

      for (const field of fields) {
        const cellRef = field.cell + String(row);
        const cell = sheet[cellRef];

        if (cell?.v) hasData = true;

        const val = this.convertValue(cell?.v, field.type);
        if (val !== null && val !== undefined) {
          (skill as any)[field.key] = String(val).trim();
        }
      }

      // 仅保留有技能名的行
      if (hasData && skill.name) {
        // ★ 核心改动: 按行号范围确定归属（与旧版 /import-excel 一致）
        skill.owner = this.getSkillOwnerByRow(row);
        skills.push(skill);
      }
    }

    return skills;
  }

  /**
   * 根据行号确定技能归属单位 (旧版兼容模式)
   *
   * 映射规则完全复制自 hangar-service/routes/units.js:399-411
   */
  private getSkillOwnerByRow(row: number): string | null {
    const ranges = this.template.sheets.skills.rowRanges;
    if (!ranges) return null;

    for (const [owner, [start, end]] of Object.entries(ranges)) {
      if (row >= start && row <= end) {
        // 映射内部 key 到显示名
        const ownerMap: Record<string, string> = {
          main: '主机体', royroy: '跟随',
          right: '右手', left: '左手', extra: '其它',
        };
        return ownerMap[owner] || owner;
      }
    }
    return null;
  }

  /**
   * 类型安全的值转换
   */
  private convertValue(value: unknown, type?: string): string | number | boolean | null {
    if (value === undefined || value === null) return null;

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
   * 安全的数值解析
   */
  private parseNumber(value: unknown): number {
    if (value === undefined || value === null) return 0;
    if (typeof value === 'number') return value;
    const parsed = parseFloat(String(value));
    return isNaN(parsed) ? 0 : parsed;
  }
}

export default ExcelParser;
