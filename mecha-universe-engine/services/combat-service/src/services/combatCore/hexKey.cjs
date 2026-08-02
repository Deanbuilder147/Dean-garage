'use strict';

/**
 * 六边形坐标 Key + 距离/邻居/范围 唯一真相源（A2 坐标大一统 + Phase 30-HexTruth）。
 *
 * 所有「地形字典 / 占用集合 / 友军识别 / ZOC 判定」的字典 Key 必须统一调用
 * getHexKey(q, r) 生成，严禁混用 `${q},${r}`、`${q}_${r}`、反引号模板等写法，
 * 否则会出现「拼写漂移」导致地形 Key 命中失败、静默回退 moon（无减伤）。
 *
 * ★ Phase 30-HexTruth：距离/邻居/范围数学统一复用 @mecha/shared-kernel 的 CJS 真相源
 * （dist/hexMath.cjs）。本模块从 shared-kernel 引入并 re-export，作为 combat-core
 * 内部所有 .cjs 的统一 hex 数学入口；原 skillExecutor._hexDistance 与
 * aiStrategies.hexDistance 本地副本已删除，全部改走此处，杜绝三份副本漂移。
 */

// 物理真相源：全栈唯一的 hex 数学（CJS 侧，供 combat-core 同步 require）
const {
  hexDistance,
  hexDistanceCoord,
  getNeighbors,
  getHexesInRange,
  getHexKey,
} = require('@mecha/shared-kernel/hexMath');

module.exports = {
  getHexKey,
  hexDistance,
  hexDistanceCoord,
  getNeighbors,
  getHexesInRange,
};
