/**
 * DiceEngine - 【已废除】海豹骰子 dicescript 适配层
 * 
 * 于 2026-06-19 Phase 4 全站去骰化中彻底移除。
 * 原文件已归档至 services/backups/20260619-purge/DiceEngine.cjs
 * 
 * 所有技能判定已转为词条库确定性公式。
 * 如需内部随机数，请直接使用 Math.random()。
 */

// 导出空对象防止引用报错
module.exports = {
    DiceEngine: null,
    defaultEngine: null
};
