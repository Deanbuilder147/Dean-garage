#!/usr/bin/env python3
"""
Stage 3: ISO_DEFAULTS alignment + deprecate old odd-r hexToPixel/pixelToHex
"""
import sys

filepath = sys.argv[1]
with open(filepath, 'r') as f:
    content = f.read()

# ====== Fix 1: ISO_DEFAULTS — align to calibrated baseline ======
old_iso_defaults = '''export const ISO_DEFAULTS = {
  shearX: 0.25,    // 斜切X（UI默认0.25，基准0.40）
  shearY: 0.0,     // 斜切Y
  scaleX: 1.0,     // 缩放X
  scaleY: 0.75,    // 缩放Y
  rotation: 0,     // 旋转°
  topFlat: 0.25,   // 顶角扁平度 (0=尖, 0.5=全平)
  bottomFlat: 0.25 // 底角扁平度 (0=尖, 0.5=全平)
};'''

new_iso_defaults = '''// --- 等距视角默认参数（已校准基准值，与 baseline 预设完全一致）---
// 校准值：shearX=0.25, shearY=0.44, scaleX=1.00, scaleY=0.39, rot=-24
// 单元=64×72, 顶角=25%, 底角=25%
export const ISO_DEFAULTS = {
  shearX: 0.25,    // 斜切X
  shearY: 0.44,    // 斜切Y（已校准）
  scaleX: 1.0,     // 缩放X
  scaleY: 0.39,    // 缩放Y（已校准）
  rotation: -24,   // 旋转°（已校准）
  topFlat: 0.25,   // 顶角扁平度 (0=尖, 0.5=全平)
  bottomFlat: 0.25 // 底角扁平度 (0=尖, 0.5=全平)
};'''

if old_iso_defaults in content:
    content = content.replace(old_iso_defaults, new_iso_defaults)
    print("[OK] ISO_DEFAULTS aligned to baseline (shearY=0.44, scaleY=0.39, rot=-24)")
else:
    print("[WARN] ISO_DEFAULTS not found, check format")

# ====== Fix 2: Deprecate old odd-r hexToPixel, replace with pointyTopCenter wrapper ======
old_hex_to_pixel = '''/**
 * 坐标转像素（蜂巢偏移坐标 - 奇数行向右偏移）
 */
export function hexToPixel(q, r, spacingH, spacingV, offsetFactor) {
  const x = q * HEX_WIDTH * spacingH + (r % 2 === 1 ? HEX_WIDTH * offsetFactor : 0)
  const y = r * HEX_HEIGHT * spacingV
  return { x, y }
}'''

new_hex_to_pixel = '''/**
 * 坐标转像素（尖顶 Even-R Offset，统一使用 pointyTopCenter）
 * @deprecated 旧 odd-r 版本已废弃，现委托给 pointyTopCenter。
 *   如需运行时可变 spacing，请在调用侧自行包装。
 * @param {number} q - 列
 * @param {number} r - 行
 * @param {number} spacingH - 水平间距倍率 (默认 1.0)
 * @param {number} spacingV - 垂直间距倍率 (默认 1.0)
 * @param {number} offsetFactor - 偏移因子（Even-R 自动偏移，此参数忽略）
 * @returns {{ x: number, y: number }}
 */
export function hexToPixel(q, r, spacingH = 1, spacingV = 1, offsetFactor = 0) {
  const { flatX, flatY } = pointyTopCenter(q, r, HEX_RADIUS, spacingH, spacingV)
  return { x: flatX, y: flatY }
}'''

if old_hex_to_pixel in content:
    content = content.replace(old_hex_to_pixel, new_hex_to_pixel)
    print("[OK] hexToPixel migrated from odd-r to Even-R (delegates to pointyTopCenter)")
else:
    print("[WARN] old hexToPixel not found, check format")

# ====== Fix 3: Deprecate old odd-r pixelToHex, replace with pointyTopToHex wrapper ======
old_pixel_to_hex = '''/** 像素转坐标（逆向转换，遍历找最近格子）
 */
export function pixelToHex(px, py, spacingH, spacingV, offsetFactor, gridWidth, gridHeight) {
  let bestQ = 0, bestR = 0, bestDist = Infinity
  for (let q = -1; q <= gridWidth; q++) {
    for (let r = -1; r <= gridHeight; r++) {
      const p = hexToPixel(q, r, spacingH, spacingV, offsetFactor)
      const cx = p.x + HEX_APOTHEM
      const cy = p.y + HEX_RADIUS
      const dist = Math.sqrt((cx - px) ** 2 + (cy - py) ** 2)
      if (dist < bestDist) {
        bestDist = dist
        bestQ = q
        bestR = r
      }
    }
  }
  return { q: bestQ, r: bestR }
}'''

new_pixel_to_hex = '''/** 像素转坐标（统一使用 pointyTopToHex，数学逆推 + Hex Rounding）
 * @deprecated 旧遍历法已废弃，现委托给 pointyTopToHex。
 * @param {number} px - 世界像素 X
 * @param {number} py - 世界像素 Y
 * @param {number} spacingH - 水平间距倍率
 * @param {number} spacingV - 垂直间距倍率
 * @param {number} offsetFactor - 忽略（Even-R 自动偏移）
 * @param {number} gridWidth - 忽略（不再需要遍历）
 * @param {number} gridHeight - 忽略（不再需要遍历）
 * @returns {{ q: number, r: number }}
 */
export function pixelToHex(px, py, spacingH = 1, spacingV = 1, offsetFactor = 0, gridWidth = 0, gridHeight = 0) {
  return pointyTopToHex(px, py, HEX_RADIUS, spacingH, spacingV)
}'''

if old_pixel_to_hex in content:
    content = content.replace(old_pixel_to_hex, new_pixel_to_hex)
    print("[OK] pixelToHex migrated from brute-force to pointyTopToHex (math inverse + Hex Rounding)")
else:
    print("[WARN] old pixelToHex not found, check format")

with open(filepath, 'w') as f:
    f.write(content)

print("[DONE] hexUtils.js patched")
