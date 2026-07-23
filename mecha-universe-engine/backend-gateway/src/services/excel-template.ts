/**
 * Phase 29-HangarRestoration — Excel导入模板配置 (旧版兼容 v2.1)
 *
 * 定义Excel文件的结构和字段映射。
 * 坐标完全对齐 hangar-service /import-excel 直导模式：
 *   - 工作表: 优先 "设定器"，回退第一个
 *   - 基本信息: name=C2, codename=F2, faction=I2
 *   - 单位属性: 行4-8，单位归属由 A 列内容判定 (resolveUnitKey 归一为 主机体/跟随/左手/右手/其它)
 *     注意: rows[].name 仅作行号定位占位，实际单位 key 取自 A 列内容，而非写死 name
 *   - 技能列表: 行12-22, 按行号范围分配归属
 */

export interface ExcelTemplateField {
  key: string;
  cell: string;
  label: string;
  type?: 'number' | 'boolean' | 'select' | 'text';
  options?: string[];
  required?: boolean;
}

export interface ExcelUnitRow {
  name: string;
  row: number;
  fields: string[];
}

export interface ExcelSkillField {
  key: string;
  cell: string;
  label: string;
  type?: string;
}

export interface ExcelSkillsConfig {
  name: string;
  startRow: number;
  maxRows: number;
  fields: ExcelSkillField[];
  /** 按行号范围分配技能归属 (旧版兼容模式) */
  rowRanges: Record<string, [number, number]>;
}

export interface ExcelTemplateSheets {
  basic: {
    name: string;
    fields: ExcelTemplateField[];
  };
  units: {
    name: string;
    rows: ExcelUnitRow[];
    columns: Record<string, string>;
  };
  skills: ExcelSkillsConfig;
}

export interface ExcelTemplate {
  version: string;
  description: string;
  sheets: ExcelTemplateSheets;
  validation: {
    ranges: Record<string, { min: number; max: number }>;
    required: string[];
    factions: string[];
    unitTypes: string[];
  };
}

export const EXCEL_TEMPLATE: ExcelTemplate = {
  version: '2.1',
  description: '机甲战棋棋子Excel导入模板 (兼容旧版设定器格式 v2.1)',
  sheets: {
    basic: {
      name: '基本信息',
      fields: [
        { key: 'name', cell: 'C2', label: '机体番号', required: true },
        { key: 'codename', cell: 'F2', label: '行动代号' },
        { key: 'faction', cell: 'I2', label: '所属阵营', type: 'select', options: ['earth', 'balon', 'maxion'] },
      ],
    },
    units: {
      name: '单位属性',
      // ★ 单位归属由 A 列内容判定 (见 excel-parser.ts resolveUnitKey)，rows[].name 仅占位
      rows: [
        { name: '主机体', row: 4, fields: ['type', '格斗', '射击', '结构', '机动', 'skillSlots'] },
        { name: '跟随', row: 5, fields: ['type', '格斗', '射击', '结构', '机动', 'skillSlots'] },
        { name: '左手', row: 6, fields: ['type', '格斗', '射击', '结构', '机动', 'skillSlots'] },
        { name: '右手', row: 7, fields: ['type', '格斗', '射击', '结构', '机动', 'skillSlots'] },
        { name: '其它', row: 8, fields: ['type', '格斗', '射击', '结构', '机动', 'skillSlots'] },
      ],
      columns: {
        name: 'A', type: 'B', 格斗: 'D', 射击: 'E', 结构: 'F', 机动: 'G', skillSlots: 'H',
      },
    },
    skills: {
      name: '技能列表',
      startRow: 12,
      maxRows: 11,
      fields: [
        { key: 'name', cell: 'C', label: '技能名称' },
        { key: 'type', cell: 'D', label: '类型' },
        { key: 'attribute', cell: 'E', label: '攻击属性' },
        { key: 'effect', cell: 'F', label: '技能效果' },
        { key: 'range', cell: 'G', label: '射程' },
        { key: 'special', cell: 'H', label: '特殊效果' },
      ],
      // 旧版按行号硬编码分配（与 /import-excel 直导完全一致）:
      //   行 12-14 → 主机体 (3个)
      //   行 15-16 → 跟随   (2个)
      //   行 17-18 → 右手   (2个)
      //   行 19-20 → 左手   (2个)
      //   行 21-22 → 其它   (2个)
      rowRanges: {
        main:   [12, 14],
        royroy: [15, 16],
        right:  [17, 18],
        left:   [19, 20],
        extra:  [21, 22],
      },
    },
  },
  validation: {
    ranges: {
      格斗: { min: 0, max: 99 },
      射击: { min: 0, max: 99 },
      结构: { min: 0, max: 99 },
      机动: { min: 0, max: 99 },
      skillSlots: { min: 0, max: 5 },
      totalPoints: { min: 0, max: 1000 },
    },
    required: ['name', '主机体'],
    factions: ['earth', 'balon', 'maxion'],
    // 含 weirdnova 等真实文件的合法值 (Royroy/载具) — 避免误报 warning
    unitTypes: ['机体', '装甲', '推进器', '武器', '盾牌', '辅助', 'none', 'Royroy', '载具'],
  },
};

export default EXCEL_TEMPLATE;
