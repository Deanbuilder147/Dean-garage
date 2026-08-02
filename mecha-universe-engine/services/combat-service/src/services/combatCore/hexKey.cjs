'use strict';

/**
 * 六边形坐标 Key 唯一真相源（A2 坐标大一统）。
 *
 * 所有「地形字典 / 占用集合 / 友军识别 / ZOC 判定」的字典 Key 必须统一调用
 * getHexKey(q, r) 生成，严禁混用 `${q},${r}`、`${q}_${r}`、反引号模板等写法，
 * 否则会出现「拼写漂移」导致地形 Key 命中失败、静默回退 moon（无减伤）。
 *
 * 坐标本身为 Even-R offset；轴向/立方换算由各引擎的 hexDistanceOffset 统一处理，
 * 与本 Key 格式化无关。
 */
function getHexKey(q, r) {
  return q + ',' + r;
}

module.exports = { getHexKey };
