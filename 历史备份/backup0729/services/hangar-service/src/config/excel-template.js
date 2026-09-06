/**
 * Excel导入模板配置
 * 定义Excel文件的结构和字段映射
 */
export const EXCEL_TEMPLATE = {
  version: '1.0',
  description: '机甲战棋棋子Excel导入模板',
  sheets: {
    basic: {
      name: '基本信息',
      fields: [
        { key: 'name', cell: 'B2', label: '机体番号', required: true },
        { key: 'codename', cell: 'B3', label: '行动代号' },
        { key: 'faction', cell: 'B4', label: '所属阵营', type: 'select', options: ['earth', 'balon', 'maxion'] },
        { key: 'totalPoints', cell: 'C3', label: '总点数', type: 'number' }
      ]
    },
    units: {
      name: '单位属性',
      // 行7-11对应各单位
      rows: [
        { name: '主机体', row: 7, fields: ['type', '格斗', '射击', '结构', '机动', 'skillSlots'] },
        { name: '跟随', row: 8, fields: ['type', '格斗', '射击', '结构', '机动', 'skillSlots'] },
        { name: '左手', row: 9, fields: ['type', '格斗', '射击', '结构', '机动', 'skillSlots'] },
        { name: '右手', row: 10, fields: ['type', '格斗', '射击', '结构', '机动', 'skillSlots'] },
        { name: '其它', row: 11, fields: ['type', '格斗', '射击', '结构', '机动', 'skillSlots'] }
      ],
      // 列映射
      columns: {
        name: 'A',
        type: 'B',
        格斗: 'D',
        射击: 'E',
        结构: 'F',
        机动: 'G',
        skillSlots: 'H'
      }
    },
    skills: {
      name: '技能列表',
      // 技能表从第14行开始
      startRow: 14,
      maxRows: 12,  // 最多读取12行技能
      fields: [
        { key: 'slot', cell: 'A', label: '插槽', type: 'number' },
        { key: 'name', cell: 'C', label: '技能名称' },
        { key: 'type', cell: 'D', label: '类型' },
        { key: 'attribute', cell: 'E', label: '攻击属性' },
        { key: 'effect', cell: 'F', label: '技能效果' },
        { key: 'range', cell: 'G', label: '射程' },
        { key: 'special', cell: 'H', label: '特殊效果' }
      ],
      // 技能分配规则
      slots: {
        main: [1, 2, 3],      // 主机体技能：插槽1-3
        royroy: [4, 5],       // 跟随技能：插槽4-5
        right: [6, 7],        // 右手技能：插槽6-7
        left: [8, 9],         // 左手技能：插槽8-9
        extra: [10, 11, 12]   // 其它技能：插槽10-12
      }
    }
  },
  // 验证规则
  validation: {
    // 数值范围
    ranges: {
      格斗: { min: 0, max: 99 },
      射击: { min: 0, max: 99 },
      结构: { min: 0, max: 99 },
      机动: { min: 0, max: 99 },
      skillSlots: { min: 0, max: 5 },
      totalPoints: { min: 0, max: 1000 }
    },
    // 必填字段
    required: ['name', '主机体'],
    // 阵营选项
    factions: ['earth', 'balon', 'maxion'],
    // 装备类型
    unitTypes: ['机体', '装甲', '推进器', '武器', '盾牌', '辅助', 'none']
  }
};

export default EXCEL_TEMPLATE;
