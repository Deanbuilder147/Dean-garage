#!/usr/bin/env python3
"""Phase 2: 在 hexUtils.js 末尾追加 DIRECTIONS + computeDirection"""
import os

TARGET = '/root/original-project/frontend/src/utils/hexUtils.js'

# 需要追加的代码块
APPEND = '''


// =======================================================================
//   9-View Direction Enum — 2D 棋子 9 视图朝向系统 (Phase 2)
// =======================================================================

/** 9 视图方向常量 */
export const DIRECTIONS = Object.freeze({
  N:  0,
  NE: 1,
  E:  2,
  SE: 3,
  S:  4,
  SW: 5,
  W:  6,
  NW: 7,
  TOP: 8,
})

/** 方向标签映射 */
export const DIRECTION_LABELS = Object.freeze({
  0: 'N',  1: 'NE', 2: 'E',  3: 'SE',
  4: 'S',  5: 'SW', 6: 'W',  7: 'NW',
  8: 'TOP',
})

/** 方向总数 */
export const DIRECTION_COUNT = 9

/**
 * 根据六角格坐标增量自动计算朝向（角度量化法）
 *
 * 使用 atan2 将 (dq, dr) 映射到最近的 8 方向之一。
 * 8 扇区各 45°，角度从正东 (0°) 顺时针旋转（屏幕坐标系 Y 向下）。
 *
 *   扇区分布:
 *     0(N):  337.5°–22.5°   4(S):  157.5°–202.5°
 *     1(NE): 22.5°–67.5°    5(SW): 202.5°–247.5°
 *     2(E):  67.5°–112.5°   6(W):  247.5°–292.5°
 *     3(SE): 112.5°–157.5°  7(NW): 292.5°–337.5°
 *
 * @param {number} fromQ - 起始列
 * @param {number} fromR - 起始行
 * @param {number} toQ   - 目标列
 * @param {number} toR   - 目标行
 * @returns {number|null} direction (0-7)，同格返回 null
 */
export function computeDirection(fromQ, fromR, toQ, toR) {
  if (fromQ === toQ && fromR === toR) return null

  const dx = toQ - fromQ
  const dy = toR - fromR

  // atan2 返回弧度，转为度数。屏幕坐标系 Y 向下。
  let angle = Math.atan2(dy, dx) * (180 / Math.PI)
  if (angle < 0) angle += 360

  // 8 方向扇区量化 (每个扇区 45°)
  // 偏移 -22.5° 使扇区边界对齐:
  const adjusted = (angle + 22.5) % 360
  const octant = Math.floor(adjusted / 45) % 8
  return octant
}

/**
 * 严格邻格版本的 computeDirection（仅当 to 在 from 的 6 邻格内时返回方向）
 * 使用 hexUtils.getHexNeighbors 精确验证。
 *
 * @param {number} fromQ
 * @param {number} fromR
 * @param {number} toQ
 * @param {number} toR
 * @param {Function} getNeighborsFn - getHexNeighbors 函数引用
 * @returns {number|null} direction (0-7)，非邻格返回 null
 */
export function computeDirectionStrict(fromQ, fromR, toQ, toR, getNeighborsFn) {
  if (!getNeighborsFn) return computeDirection(fromQ, fromR, toQ, toR)

  const neighbors = getNeighborsFn(fromQ, fromR)
  const idx = neighbors.findIndex(n => n.q === toQ && n.r === toR)
  if (idx === -1) return null

  // getHexNeighbors 返回 [NE, E, SE, SW, W, NW] → 映射到方向码 [1,2,3,5,6,7]
  const NEIGHBOR_TO_DIRECTION = [1, 2, 3, 5, 6, 7]
  return NEIGHBOR_TO_DIRECTION[idx]
}
'''

with open(TARGET, 'r') as f:
    content = f.read()

# 检查是否已追加
if 'export const DIRECTIONS' in content:
    print("DIRECTIONS already exists — skipping append")
else:
    with open(TARGET, 'a') as f:
        f.write(APPEND)
    print("Appended DIRECTIONS + computeDirection to hexUtils.js")

# 验证
with open(TARGET, 'r') as f:
    verify = f.read()

checks = [
    ('DIRECTIONS', 'export const DIRECTIONS = Object.freeze'),
    ('DIRECTION_LABELS', 'export const DIRECTION_LABELS'),
    ('DIRECTION_COUNT', 'export const DIRECTION_COUNT'),
    ('computeDirection', 'export function computeDirection'),
    ('computeDirectionStrict', 'export function computeDirectionStrict'),
]
all_ok = True
for name, pattern in checks:
    if pattern in verify:
        print(f"  ✓ {name}")
    else:
        print(f"  ✗ {name} MISSING")
        all_ok = False

print(f"\nFinal size: {len(verify.splitlines())} lines")
print(f"Result: {'ALL OK' if all_ok else 'SOME FAILED'}")
