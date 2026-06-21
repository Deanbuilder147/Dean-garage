// 单位类型配置
const UNIT_TYPES = {
  '机体': { totalPoints: 40, hpFormula: '结构 * 10', constraint: null },
  'Royroy': { totalPoints: 25, hpFormula: '结构 * 3', constraint: { minStat: 10 } },
  '武器': { totalPoints: 15, hpFormula: '结构 * 1', constraint: { minStructure: 1 } },
  '防具': { totalPoints: 15, hpFormula: '结构 * 2', constraint: { minStructure: 10 } },
  '载具': { totalPoints: 15, hpFormula: '结构 * 1', constraint: { min机动: 10 } },
  '背包': { totalPoints: 10, hpFormula: '结构 * 2', constraint: null }
};

export default UNIT_TYPES;
