/**
 * @mecha/shared-kernel — hexMath（六边形网格数学真相源）
 *
 * 全栈唯一物理真相源：所有服务（map-service / combat-service / frontend / gateway）
 * 的六边形距离、邻居、范围枚举、坐标 Key 都必须取自本模块，禁止在各自包内
 * 另写副本（历史教训：曾存在 map-service.HexUtils.hexDistance、
 * skillExecutor._hexDistance、aiStrategies.hexDistance 三份同源副本分别维护，
 * 改一忘二即导致射程校验与寻路/AI 悄悄分叉）。
 *
 * 坐标系：Even-R Offset（尖顶，偶数行右移半格）
 *   - 列 q、行 r；r % 2 === 0 为偶数行，整体右移半格
 *   - 立方第三轴 s = -q - r（仅计算用，不存储）
 *
 * 本模块为纯函数、零外部依赖。编译产出：
 *   - dist/hexMath.js  (ESM，给 frontend / map-service / gateway 用)
 *   - dist/hexMath.cjs (CommonJS，给 combat-service 的 .cjs 核心用)
 */

import type { HexCoord } from './types.js';

/**
 * Even-R offset → axial 转换。
 * 坐标本质是偶行偏移(offset)，必须先转轴向再用立方距离，
 * 否则直接对 offset 套轴向公式会得到错误距离。
 */
function offsetToAxial(q: number, r: number): { q: number; r: number } {
  return { q: q - (r + (r & 1)) / 2, r };
}

/**
 * 六边形网格距离（Even-R offset → axial → cube 距离）。
 * 返回两格之间的最短 hex 步数。
 */
export function hexDistance(
  q1: number,
  r1: number,
  q2: number,
  r2: number,
): number {
  const a = offsetToAxial(q1, r1);
  const b = offsetToAxial(q2, r2);
  const dq = Math.abs(a.q - b.q);
  const dr = Math.abs(a.r - b.r);
  const ds = Math.abs(a.q + a.r - b.q - b.r);
  return Math.max(dq, dr, ds);
}

/**
 * 便捷重载：直接传坐标对象。
 */
export function hexDistanceCoord(a: HexCoord, b: HexCoord): number {
  return hexDistance(a.q, a.r, b.q, b.r);
}

/**
 * 获取某格的六个邻居（Even-R，奇偶行分支）。
 * 与前端 frontend/src/utils/hexUtils.js 的 getHexNeighbors 必须逐字节一致。
 */
export function getNeighbors(q: number, r: number): HexCoord[] {
  const dirs =
    r % 2 === 0
      ? [
          { q: 1, r: 0 },
          { q: 1, r: -1 },
          { q: 0, r: -1 },
          { q: -1, r: 0 },
          { q: 0, r: 1 },
          { q: 1, r: 1 },
        ]
      : [
          { q: 1, r: 0 },
          { q: 0, r: -1 },
          { q: -1, r: -1 },
          { q: -1, r: 0 },
          { q: -1, r: 1 },
          { q: 0, r: 1 },
        ];
  return dirs.map((d) => ({ q: q + d.q, r: r + d.r }));
}

/**
 * 枚举以 (centerQ, centerR) 为中心、半径 range 内的所有格（含中心）。
 * 基于 axial/cube 范围环（满足 |q|+|r|+|s| <= range 的六边形范围），
 * 与 hexDistance 同源，可直接用于「射程可达格枚举」「辐射范围 aoe_radius 枚举」。
 */
export function getHexesInRange(
  centerQ: number,
  centerR: number,
  range: number,
): HexCoord[] {
  const results: HexCoord[] = [];
  for (let q = -range; q <= range; q++) {
    for (
      let r = Math.max(-range, -q - range);
      r <= Math.min(range, -q + range);
      r++
    ) {
      results.push({ q: centerQ + q, r: centerR + r });
    }
  }
  return results;
}

/**
 * 坐标唯一 Key。前后端同构，禁止混用 `${q}_${r}`、反引号模板等写法，
 * 否则地形 Key 拼写漂移导致静默回退 'moon'。
 */
export function getHexKey(q: number, r: number): string {
  return q + ',' + r;
}
