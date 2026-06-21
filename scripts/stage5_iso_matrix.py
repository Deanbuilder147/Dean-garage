#!/usr/bin/env python3
"""
阶段五：全局等距矩阵压扁
- 在渲染管线中添加等距 CTM 变换 (shear + scaleY)
- 在逆推管线中添加等距逆矩阵
- 调整 Canvas 尺寸计算以适应等距扩展
- 调整中心对齐公式以适应等距变换
"""

import sys, re

def patch_new_battle_view(content):
    """Patches NewBattleView.vue (battle scene)"""
    
    # 1. Add ISO_DEFAULTS to imports
    old_import = "import { HEX_WIDTH, HEX_HEIGHT, HEX_APOTHEM, HEX_RADIUS, DEFAULT_SPACING_H, DEFAULT_SPACING_V, DEFAULT_OFFSET_FACTOR, drawHexPath, getHexNeighbors, TERRAIN_COLORS, UNIVERSAL_TERRAIN_MAP, convertMapFormat, pointyTopCenter, pointyTopToHex } from '../utils/hexUtils.js'"
    new_import = "import { HEX_WIDTH, HEX_HEIGHT, HEX_APOTHEM, HEX_RADIUS, DEFAULT_SPACING_H, DEFAULT_SPACING_V, DEFAULT_OFFSET_FACTOR, drawHexPath, getHexNeighbors, TERRAIN_COLORS, UNIVERSAL_TERRAIN_MAP, convertMapFormat, ISO_DEFAULTS, pointyTopCenter, pointyTopToHex } from '../utils/hexUtils.js'"
    content = content.replace(old_import, new_import)
    
    # 2. Add ISO constant after spacing declarations
    old_spacing = '''const spacingH = DEFAULT_SPACING_H
const spacingV = DEFAULT_SPACING_V'''
    new_spacing = '''const spacingH = DEFAULT_SPACING_H
const spacingV = DEFAULT_SPACING_V
const ISO = ISO_DEFAULTS  // 等距矩阵参数 (baseline: shearX=0.25, shearY=0.44, scaleX=1.00, scaleY=0.39)'''
    content = content.replace(old_spacing, new_spacing)
    
    # 3. Update draw() CTM: add isometric transform after scale
    old_ctm = '''  // === 标准 2D 变换（宪法 v2.0 纯净状态）：平移 → 缩放 ===
  ctx.translate(offsetX.value, offsetY.value)
  ctx.scale(scale.value, scale.value)'''
    new_ctm = '''  // === 等距 3D 变换：平移 → 缩放 → 等距矩阵压扁 ===
  ctx.translate(offsetX.value, offsetY.value)
  ctx.scale(scale.value, scale.value)
  ctx.transform(ISO.scaleX, ISO.shearY, ISO.shearX, ISO.scaleY, 0, 0)  // 等距 shear+scaleY'''
    content = content.replace(old_ctm, new_ctm)
    
    # 4. Update canvasPosToWorld: add inverse isometric matrix
    old_cpos = '''function canvasPosToWorld(cx, cy) {
  // 1) 减去相机平移量
  const relX = cx - offsetX.value
  const relY = cy - offsetY.value
  // 2) 除以缩放比例，还原到 1.0 标准倍率下的世界坐标（纯 2D，无 Y 压缩）
  const worldX = relX / scale.value
  const worldY = relY / scale.value
  // 3) 标准尖顶六边形 Even-R 逆推
  const { q, r } = pointyTopToHex(worldX, worldY, HEX_RADIUS, spacingH, spacingV);'''
    
    new_cpos = '''function canvasPosToWorld(cx, cy) {
  // 1) 减去相机平移量
  const relX = cx - offsetX.value
  const relY = cy - offsetY.value
  // 2) 除以缩放比例
  const worldX = relX / scale.value
  const worldY = relY / scale.value
  // 3) 等距逆向矩阵：undo shear/scale
  const det = ISO.scaleX * ISO.scaleY - ISO.shearX * ISO.shearY
  const flatX = (ISO.scaleY * worldX - ISO.shearX * worldY) / det
  const flatY = (-ISO.shearY * worldX + ISO.scaleX * worldY) / det
  // 4) 标准尖顶六边形 Even-R 逆推
  const { q, r } = pointyTopToHex(flatX, flatY, HEX_RADIUS, spacingH, spacingV);'''
    content = content.replace(old_cpos, new_cpos)
    
    # 5. Update initCanvas: adjust canvas size for isometric expansion
    old_init_canvas_dim = '''  const lastCol = hexToPixel(gridWidth.value - 1, 0)
  const lastRow = hexToPixel(0, gridHeight.value - 1)
  const mapW = lastCol.x + HEX_RADIUS * 2 + 120
  const mapH = lastRow.y + HEX_RADIUS * 2 + 120'''
    
    new_init_canvas_dim = '''  const lastCol = hexToPixel(gridWidth.value - 1, 0)
  const lastRow = hexToPixel(0, gridHeight.value - 1)
  const worldW = lastCol.x + HEX_RADIUS * 2
  const worldH = lastRow.y + HEX_RADIUS * 2
  // 等距扩展：shearX 推宽 X 方向，shearY 推高 Y 方向
  const mapW = worldW * ISO.scaleX + worldH * Math.abs(ISO.shearX) + 200
  const mapH = worldW * Math.abs(ISO.shearY) + worldH * ISO.scaleY + 200'''
    content = content.replace(old_init_canvas_dim, new_init_canvas_dim)
    
    # 6. Update centerGrid: account for isometric transform when centering
    old_center = '''/** 设置 offsetX/offsetY 使棋盘几何中心对齐画布中心 */
function centerGrid() {
  const canvas = mapCanvas.value
  if (!canvas) return

  // 棋盘几何中心（世界坐标）
  const midGrid = hexToPixel(Math.floor(gridWidth.value / 2), Math.floor(gridHeight.value / 2))
  const gridCenterX = midGrid.x + HEX_APOTHEM
  const gridCenterY = midGrid.y + HEX_RADIUS
}'''
    
    new_center = '''/** 设置 offsetX/offsetY 使棋盘几何中心对齐画布中心（含等距变换） */
function centerGrid() {
  const canvas = mapCanvas.value
  if (!canvas) return

  // 棋盘几何中心（世界坐标）
  const midGrid = hexToPixel(Math.floor(gridWidth.value / 2), Math.floor(gridHeight.value / 2))
  const gridCenterX = midGrid.x
  const gridCenterY = midGrid.y
  const isoCenterX = gridCenterX * ISO.scaleX + gridCenterY * ISO.shearX
  const isoCenterY = gridCenterX * ISO.shearY + gridCenterY * ISO.scaleY
  offsetX.value = canvas.width / 2 - isoCenterX * scale.value
  offsetY.value = canvas.height / 2 - isoCenterY * scale.value
}'''
    content = content.replace(old_center, new_center)
    
    # 7. Update recalcCanvas: adjust canvas size for isometric bounds (for resize)
    old_recalc = '''  const lastCol2 = hexToPixel(w - 1, 0)
  const lastRow2 = hexToPixel(0, h - 1)'''
    new_recalc = '''  const lastCol2 = hexToPixel(w - 1, 0)
  const lastRow2 = hexToPixel(0, h - 1)
  const ww = lastCol2.x + HEX_RADIUS * 2
  const wh_ = lastRow2.y + HEX_RADIUS * 2
  nw = ww * ISO.scaleX + wh_ * Math.abs(ISO.shearX) + 200
  nh = ww * Math.abs(ISO.shearY) + wh_ * ISO.scaleY + 200'''
    
    # Find the recalcCanvas function and modify it
    # Look for the pattern after "function recalcCanvas"
    recalc_pattern = r'(function recalcCanvas\(w, h\) \{[^}]*?)(  const lastCol2 = hexToPixel\(w - 1, 0\)\s+const lastRow2 = hexToPixel\(0, h - 1\)\s+nw = lastCol2\.x \+ HEX_RADIUS \* 2 \+ 120\s+nh = lastRow2\.y \+ HEX_RADIUS \* 2 \+ 120)'
    
    def replace_recalc(m):
        return (m.group(1) + 
                '  const lastCol2 = hexToPixel(w - 1, 0)\n'
                '  const lastRow2 = hexToPixel(0, h - 1)\n'
                '  const ww = lastCol2.x + HEX_RADIUS * 2\n'
                '  const wh_ = lastRow2.y + HEX_RADIUS * 2\n'
                '  nw = ww * ISO.scaleX + wh_ * Math.abs(ISO.shearX) + 200\n'
                '  nh = ww * Math.abs(ISO.shearY) + wh_ * ISO.scaleY + 200')
    
    content = re.sub(recalc_pattern, replace_recalc, content, flags=re.DOTALL)
    
    return content


def patch_new_battlefield_view(content):
    """Patches NewBattlefieldView.vue (map editor)"""
    
    # 1. Add ISO_DEFAULTS to imports
    old_import = '''import {
  HEX_WIDTH, HEX_HEIGHT, HEX_APOTHEM, HEX_RADIUS,
  DEFAULT_SPACING_H, DEFAULT_SPACING_V, DEFAULT_OFFSET_FACTOR,
  pointyTopCenter, pointyTopToHex,
  drawHexPath, colToLetter, formatCoord,
  UNIVERSAL_TERRAIN_MAP, convertMapFormat,
} from '../utils/hexUtils.js\''''
    new_import = '''import {
  HEX_WIDTH, HEX_HEIGHT, HEX_APOTHEM, HEX_RADIUS,
  DEFAULT_SPACING_H, DEFAULT_SPACING_V, DEFAULT_OFFSET_FACTOR,
  pointyTopCenter, pointyTopToHex,
  drawHexPath, colToLetter, formatCoord,
  UNIVERSAL_TERRAIN_MAP, convertMapFormat,
  ISO_DEFAULTS,
} from '../utils/hexUtils.js\''''
    
    if old_import in content:
        content = content.replace(old_import, new_import)
    else:
        # Try single-line import
        old_single = "import {\n  HEX_WIDTH, HEX_HEIGHT, HEX_APOTHEM, HEX_RADIUS,\n  DEFAULT_SPACING_H, DEFAULT_SPACING_V, DEFAULT_OFFSET_FACTOR,\n  pointyTopCenter, pointyTopToHex,\n  drawHexPath, colToLetter, formatCoord,\n  UNIVERSAL_TERRAIN_MAP, convertMapFormat,\n} from '../utils/hexUtils.js'"
        new_single = "import {\n  HEX_WIDTH, HEX_HEIGHT, HEX_APOTHEM, HEX_RADIUS,\n  DEFAULT_SPACING_H, DEFAULT_SPACING_V, DEFAULT_OFFSET_FACTOR,\n  pointyTopCenter, pointyTopToHex,\n  drawHexPath, colToLetter, formatCoord,\n  UNIVERSAL_TERRAIN_MAP, convertMapFormat,\n  ISO_DEFAULTS,\n} from '../utils/hexUtils.js'"
        content = content.replace(old_single, new_single)
    
    # 2. Add ISO constant after spacing declarations
    old_spacing = '''let spacingH = DEFAULT_SPACING_H        // 1.00
let spacingV = DEFAULT_SPACING_V        // 1.00'''
    new_spacing = '''let spacingH = DEFAULT_SPACING_H        // 1.00
let spacingV = DEFAULT_SPACING_V        // 1.00
const ISO = ISO_DEFAULTS                // 等距矩阵参数 (baseline)'''
    content = content.replace(old_spacing, new_spacing)
    
    # 3. Update draw() CTM
    old_ctm = '''  // ---- CTM：平移到相机位置 → 缩放（纯 2D，无 Y 压缩）----
  ctx.save()
  ctx.translate(offsetX.value, offsetY.value)
  ctx.scale(scale.value, scale.value)'''
    new_ctm = '''  // ---- CTM：平移 → 缩放 → 等距矩阵压扁 ----
  ctx.save()
  ctx.translate(offsetX.value, offsetY.value)
  ctx.scale(scale.value, scale.value)
  ctx.transform(ISO.scaleX, ISO.shearY, ISO.shearX, ISO.scaleY, 0, 0)'''
    content = content.replace(old_ctm, new_ctm)
    
    # 4. Update centerGridOnCanvas: account for isometric transform
    old_center = '''function centerGridOnCanvas() {
  if (!canvas) return
  const midQ = Math.floor(gridW.value / 2)
  const midR = Math.floor(gridH.value / 2)
  const { flatX, flatY } = pointyTopCenter(midQ, midR, HEX_RADIUS, spacingH, spacingV)
  offsetX.value = canvas.width / 2 - flatX'''
    # The function might have more lines. Let's do a multiline match.
    
    # Use regex to find the full function body
    old_center_pattern = r'(function centerGridOnCanvas\(\) \{\s+if \(!canvas\) return\s+const midQ = Math\.floor\(gridW\.value \/ 2\)\s+const midR = Math\.floor\(gridH\.value \/ 2\)\s+const \{ flatX, flatY \} = pointyTopCenter\(midQ, midR, HEX_RADIUS, spacingH, spacingV\)\s+offsetX\.value = canvas\.width \/ 2 - flatX\s+offsetY\.value = canvas\.height \/ 2 - flatY\s+\})'
    
    new_center = '''function centerGridOnCanvas() {
  if (!canvas) return
  const midQ = Math.floor(gridW.value / 2)
  const midR = Math.floor(gridH.value / 2)
  const { flatX, flatY } = pointyTopCenter(midQ, midR, HEX_RADIUS, spacingH, spacingV)
  const isoX = flatX * ISO.scaleX + flatY * ISO.shearX
  const isoY = flatX * ISO.shearY + flatY * ISO.scaleY
  offsetX.value = canvas.width / 2 - isoX
  offsetY.value = canvas.height / 2 - isoY
}'''
    
    content = re.sub(old_center_pattern, new_center, content, flags=re.DOTALL)
    
    # 5. Update canvas size computation in draw(): account for isometric bounds
    old_canvas_size = '''  // ---- 计算画布尺寸（纯 2D 状态，无等距压缩）----
  const { flatX: brX, flatY: brY } = pointyTopCenter(
    gridW.value - 1, gridH.value - 1, HEX_RADIUS, spacingH, spacingV
  )
  const totalW = brX + HEX_RADIUS * 2 + 120
  const totalH = brY + HEX_RADIUS * 2 + 120'''
    
    new_canvas_size = '''  // ---- 计算画布尺寸（含等距扩展）----
  const { flatX: brX, flatY: brY } = pointyTopCenter(
    gridW.value - 1, gridH.value - 1, HEX_RADIUS, spacingH, spacingV
  )
  const worldW = brX + HEX_RADIUS * 2
  const worldH = brY + HEX_RADIUS * 2
  const totalW = worldW * ISO.scaleX + worldH * Math.abs(ISO.shearX) + 200
  const totalH = worldW * Math.abs(ISO.shearY) + worldH * ISO.scaleY + 200'''
    content = content.replace(old_canvas_size, new_canvas_size)
    
    # 6. Update getWorldPos: add inverse isometric matrix
    old_wp = '''  // 标准 2D 逆运算：减去偏移，除以缩放
  return {
    x: (cx - offsetX.value) / scale.value,
    y: (cy - offsetY.value) / scale.value,
  }'''
    
    new_wp = '''  // 标准 2D 逆运算 + 等距逆向
  const wx = (cx - offsetX.value) / scale.value
  const wy = (cy - offsetY.value) / scale.value
  const det = ISO.scaleX * ISO.scaleY - ISO.shearX * ISO.shearY
  return {
    x: (ISO.scaleY * wx - ISO.shearX * wy) / det,
    y: (-ISO.shearY * wx + ISO.scaleX * wy) / det,
  }'''
    content = content.replace(old_wp, new_wp)
    
    return content


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 stage5_iso_matrix.py <file_to_patch> [newbattle|newbattlefield]")
        sys.exit(1)
    
    filepath = sys.argv[1]
    mode = sys.argv[2] if len(sys.argv) > 2 else 'auto'
    
    with open(filepath, 'r') as f:
        content = f.read()
    
    if mode == 'newbattle' or (mode == 'auto' and 'NewBattleView' in filepath and 'field' not in filepath):
        content = patch_new_battle_view(content)
        print(f"✓ Patched NewBattleView: iso CTM + inverse + canvas sizing + centering")
    elif mode == 'newbattlefield' or (mode == 'auto' and 'NewBattlefieldView' in filepath):
        content = patch_new_battlefield_view(content)
        print(f"✓ Patched NewBattlefieldView: iso CTM + inverse + canvas sizing + centering")
    else:
        # Try both
        if 'NewBattlefieldView' in filepath:
            content = patch_new_battlefield_view(content)
            print(f"✓ Patched NewBattlefieldView")
        else:
            content = patch_new_battle_view(content)
            print(f"✓ Patched NewBattleView")
    
    with open(filepath, 'w') as f:
        f.write(content)
    
    print(f"  File: {filepath}")


if __name__ == '__main__':
    main()
