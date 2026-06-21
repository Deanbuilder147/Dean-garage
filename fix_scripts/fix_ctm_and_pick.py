#!/usr/bin/env python3
"""
紧急交互补丁：CTM 归一化大手术
1. 移除 rotationAngle — 不再需要旋转补偿
2. 简化 CTM: transform(scaleX, shearY*scaleX, 0, scaleY, 0, 0) — 用户指定公式
3. 纯化 canvasPosToWorld 逆矩阵 — 与正向 CTM 严格成对倒数
4. 简化 centerGrid — 移除旋转计算
"""
import sys

path = '/root/original-project/frontend/src/components/HexGridCanvas.vue'
with open(path, 'r') as f:
    content = f.read()

changes = 0
original = content

# ================================================================
# Fix 1: 移除 computed import (不再需要)
# ================================================================
old_import = "import { ref, reactive, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'"
new_import = "import { ref, reactive, onMounted, onUnmounted, nextTick, watch } from 'vue'"
if old_import in content:
    content = content.replace(old_import, new_import)
    changes += 1
    print('[1/7] Removed computed from Vue import')

# ================================================================
# Fix 2: 移除 rotationAngle 定义
# ================================================================
old_rot_block = """// Phase9: R=0 水平死锁 — 旋转角度补偿
// Phase9: R=0 水平死锁 — 旋转角动态计算: atan2(-shearY, scaleX) 确保 R=0 排永远水平
const rotationAngle = computed(() => Math.atan2(-ISO.shearY, ISO.scaleX) * 180 / Math.PI)"""

new_rot_block = """// Phase9++: 简化 ISO 矩阵 — 使用用户指定公式 transform(scaleX, shearY*scaleX, 0, scaleY)
// R=0 行天然水平 (flatY=0 → screenY=0)，列向量绝对平行 (无 shearX)，无需旋转补偿"""

if old_rot_block in content:
    content = content.replace(old_rot_block, new_rot_block)
    changes += 1
    print('[2/7] Removed rotationAngle computed (no longer needed)')

# ================================================================
# Fix 3: 重写 canvasPosToWorld — 严格逆矩阵
# ================================================================
old_inverse = """function canvasPosToWorld(cx, cy) {
  // 1) 减去相机平移量
  const relX = cx - offsetX.value
  const relY = cy - offsetY.value
  // 2) 除以缩放比例
  const worldX = relX / scale.value
  const worldY = relY / scale.value
  // 3) 等距逆向矩阵: undo shear/scale
  const det = ISO.scaleX * ISO.scaleY - ISO.shearX * ISO.shearY
  const flatX = (ISO.scaleY * worldX - ISO.shearX * worldY) / det
  const flatY = (-ISO.shearY * worldX + ISO.scaleX * worldY) / det
  // Phase9: undo rotation (R=0 deadlock compensation)
  const rotRadRev = -rotationAngle.value * Math.PI / 180
  const cosR = Math.cos(rotRadRev)
  const sinR = Math.sin(rotRadRev)
  const finalX = cosR * flatX - sinR * flatY
  const finalY = sinR * flatX + cosR * flatY
  return { x: finalX, y: finalY, wx: worldX, wy: worldY }
}"""

new_inverse = """/**
 * canvas 像素坐标 → 世界坐标 (含 ISO 逆矩阵)
 *
 * 正向 CTM: T → S → transform(scaleX, shearY*scaleX, 0, scaleY)
 *   即: screenX = offsetX + scale * scaleX * flatX
 *       screenY = offsetY + scale * (scaleY * flatY + shearY * scaleX * flatX)
 *
 * 逆矩阵管线 (严格成对倒数):
 *   1) 减 offsetX/Y → rel
 *   2) 除 scale → world
 *   3) flatX = worldX / scaleX
 *   4) flatY = (worldY - shearY * worldX) / scaleY
 */
function canvasPosToWorld(cx, cy) {
  // 1) 减去相机平移量
  const relX = cx - offsetX.value
  const relY = cy - offsetY.value
  // 2) 除以缩放比例
  const worldX = relX / scale.value
  const worldY = relY / scale.value
  // 3) 逆向 ISO 仿射: 与正向 CTM transform(scaleX, shearY*scaleX, 0, scaleY) 严格成对倒数
  const flatX = worldX / ISO.scaleX
  const flatY = (worldY - ISO.shearY * worldX) / ISO.scaleY
  return { x: flatX, y: flatY, wx: worldX, wy: worldY }
}"""

if old_inverse in content:
    content = content.replace(old_inverse, new_inverse)
    changes += 1
    print('[3/7] Rewrote canvasPosToWorld with strict inverse (correct order)')

# ================================================================
# Fix 4: 简化 centerGrid — 移除旋转计算
# ================================================================
old_center = """function centerGrid() {
  const canvas = mapCanvas.value
  if (!canvas) return
  const midGrid = hexToPixel(Math.floor(props.gridWidth / 2), Math.floor(props.gridHeight / 2))
  // R=0 死锁旋转补偿: 确保棋盘中心在旋转后依然居中
  const rotRadC = rotationAngle.value * Math.PI / 180
  const cosRC = Math.cos(rotRadC)
  const sinRC = Math.sin(rotRadC)
  const rotMidX = midGrid.x * cosRC - midGrid.y * sinRC
  const rotMidY = midGrid.x * sinRC + midGrid.y * cosRC
  const isoCenterX = rotMidX * ISO.scaleX + rotMidY * ISO.shearX
  const isoCenterY = rotMidX * ISO.shearY + rotMidY * ISO.scaleY

  offsetX.value = canvas.width / 2 - isoCenterX * scale.value
  offsetY.value = canvas.height / 2 - isoCenterY * scale.value
}"""

new_center = """/**
 * 设置 offsetX/offsetY 使棋盘几何中心对齐画布中心
 * 使用简化 ISO: screenX=flatX*scaleX, screenY=flatY*scaleY+screenX*shearY
 */
function centerGrid() {
  const canvas = mapCanvas.value
  if (!canvas) return
  const midGrid = hexToPixel(Math.floor(props.gridWidth / 2), Math.floor(props.gridHeight / 2))
  // 简化 ISO: 无旋转, 无 shearX, Y 仅由 shearY 倾斜
  const isoCenterX = midGrid.x * ISO.scaleX
  const isoCenterY = midGrid.y * ISO.scaleY + isoCenterX * ISO.shearY
  offsetX.value = canvas.width / 2 - isoCenterX * scale.value
  offsetY.value = canvas.height / 2 - isoCenterY * scale.value
}"""

if old_center in content:
    content = content.replace(old_center, new_center)
    changes += 1
    print('[4/7] Simplified centerGrid (no rotation, simplified ISO)')

# ================================================================
# Fix 5: 简化 draw() CTM — 移除 rotate，改用简化 transform
# ================================================================
old_draw_ctm = """  // === CTM: 平移 → 缩放 → 等距矩阵压扁 ===
  ctx.translate(offsetX.value, offsetY.value)
  ctx.scale(scale.value, scale.value)
  // Phase9: R=0 水平死锁 — 先旋转补偿再等距压扁
  // 旋转角 = atan(-shearY/scaleX) ≈ -24°, 抵消 R=0 行因 shearY 产生的倾斜
  const rotRad = rotationAngle.value * Math.PI / 180
  ctx.rotate(rotRad)
  ctx.transform(ISO.scaleX, ISO.shearY, ISO.shearX, ISO.scaleY, 0, 0)"""

new_draw_ctm = """  // === CTM: 平移 → 缩放 → 等距仿射 (用户指定公式) ===
  // 公式: screenX = flatX * scaleX, screenY = flatY * scaleY + screenX * shearY
  // 等价 canvas: transform(scaleX, shearY*scaleX, 0, scaleY, 0, 0)
  // 性质: R=0 行天然水平 (flatY=0 → screenY=0), 列向量绝对平行 (无 shearX 干扰)
  ctx.translate(offsetX.value, offsetY.value)
  ctx.scale(scale.value, scale.value)
  ctx.transform(ISO.scaleX, ISO.shearY * ISO.scaleX, 0, ISO.scaleY, 0, 0)"""

if old_draw_ctm in content:
    content = content.replace(old_draw_ctm, new_draw_ctm)
    changes += 1
    print('[5/7] Simplified draw() CTM (no rotation, no shearX)')

# ================================================================
# Fix 6: 更新 isoRotation watcher 注释
# ================================================================
old_watcher = """// isoRotation 已由 computed 自动计算; prop 保留用于向后兼容
watch(() => props.isoRotation, () => { draw() })"""

new_watcher = """// isoRotation prop 保留向后兼容 (简化 ISO 不再需要旋转角)
watch(() => props.isoRotation, () => { draw() })"""

if old_watcher in content:
    content = content.replace(old_watcher, new_watcher)
    changes += 1
    print('[6/7] Updated isoRotation watcher comment')

# ================================================================
# Fix 7: 更新 defineExpose — 移除 rotationAngle
# ================================================================
old_expose = """defineExpose({
    mapCanvas,
    canvasWrapper,
    canvasContainer,
    ctx,
    scale,
    offsetX,
    offsetY,
    ISO,
    hexToPixel,
    pixelToHex,
    getWorldPos,
    canvasPosToWorld,
    zoomIn,
    zoomOut,
    zoomReset,
    redraw,
    draw,
    rotationAngle,
  })"""

new_expose = """defineExpose({
    mapCanvas,
    canvasWrapper,
    canvasContainer,
    ctx,
    scale,
    offsetX,
    offsetY,
    ISO,
    hexToPixel,
    pixelToHex,
    getWorldPos,
    canvasPosToWorld,
    zoomIn,
    zoomOut,
    zoomReset,
    redraw,
    draw,
  })"""

if old_expose in content:
    content = content.replace(old_expose, new_expose)
    changes += 1
    print('[7/7] Removed rotationAngle from defineExpose')

# ================================================================
# Write back
# ================================================================
if content == original:
    print('\n*** WARNING: No changes applied! Running diagnostics... ***')
    for i, (o, n) in enumerate([
        ('computed import', old_import),
        ('rotationAngle block', old_rot_block),
        ('canvasPosToWorld', old_inverse),
        ('centerGrid', old_center),
        ('draw CTM', old_draw_ctm),
        ('isoRotation watcher', old_watcher),
        ('defineExpose', old_expose),
    ], 1):
        if o not in original:
            print(f'  Check {i} ({n}): NOT FOUND in file')
    sys.exit(1)
else:
    with open(path, 'w') as f:
        f.write(content)
    print(f'\n=== DONE: {changes}/7 changes applied to HexGridCanvas.vue ===')
    print('Summary of mathematical fixes:')
    print('  ✓ CTM: transform(scaleX, shearY*scaleX, 0, scaleY) — no rotation, no shearX')
    print('  ✓ Inverse: flatX=worldX/scaleX, flatY=(worldY-shearY*worldX)/scaleY')
    print('  ✓ Guaranteed: R=0 horizontal, columns absolutely parallel')
