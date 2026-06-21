#!/usr/bin/env python3
"""
Phase 9.6: 紧急修复 3D 倾斜 X 轴失效与首行倾斜的代数逻辑溃败

三项手术:
1. canvasPosToWorld 逆矩阵: flatY = worldY/scaleY, flatX = (worldX - shearX*flatY)/scaleX
2. centerGrid: isoCenterX += midGrid.y * shearX, 移除 isoCenterY 对 X 的依赖  
3. draw CTM: transform(scaleX, 0, shearX, scaleY, 0, 0) — shearX 重回矩阵, screenY 仅依赖 flatY
"""

import os

BASE = "/root/original-project/frontend/src/components"

filepath = os.path.join(BASE, "HexGridCanvas.vue")

with open(filepath, "r") as f:
    content = f.read()

changes = []

# ================================================================
# 手术 1: canvasPosToWorld 逆矩阵 — 必须与正向 CTM 严格成对倒数
# ================================================================

old_1 = """/**
 * canvas 像素坐标 → 世界坐标 (含 ISO 逆矩阵)
 * 四步管线: 像素 → -offset → ÷scale → ISO逆矩阵 → { x, y, wx, wy }
 */
/**
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

new_1 = """/**
 * canvas 像素坐标 → 世界坐标 (含 ISO 逆矩阵)
 *
 * 正向 CTM: translate → scale → transform(scaleX, 0, shearX, scaleY, 0, 0)
 *   即: screenX = offsetX + scale * (scaleX * flatX + shearX * flatY)
 *       screenY = offsetY + scale * (scaleY * flatY)
 *
 * 性质:
 *   - R=0 行: flatY=0 → screenY=offsetY (绝对水平地平线)
 *   - shearX 驱动 X 轴倾斜 (flatY 越大, X 偏移越多 → 标准等距纵深感)
 *
 * 逆矩阵管线 (严格成对倒数):
 *   1) relX = cx - offsetX, relY = cy - offsetY
 *   2) worldX = relX / scale, worldY = relY / scale
 *   3) flatY = worldY / scaleY
 *   4) flatX = (worldX - shearX * flatY) / scaleX
 *         = (worldX - shearX * worldY / scaleY) / scaleX
 */
function canvasPosToWorld(cx, cy) {
  // 1) 减去相机平移量
  const relX = cx - offsetX.value
  const relY = cy - offsetY.value
  // 2) 除以缩放比例
  const worldX = relX / scale.value
  const worldY = relY / scale.value
  // 3) 逆向 ISO 仿射: 与正向 CTM transform(scaleX, 0, shearX, scaleY, 0, 0) 严格成对倒数
  const flatY = worldY / ISO.scaleY
  const flatX = (worldX - ISO.shearX * flatY) / ISO.scaleX
  return { x: flatX, y: flatY, wx: worldX, wy: worldY }
}"""

if old_1 in content:
    content = content.replace(old_1, new_1)
    changes.append("✅ 手术1: canvasPosToWorld 逆矩阵 → 与正向 CTM 严格成对倒数")
else:
    changes.append("❌ 手术1: 未匹配到 canvasPosToWorld 目标文本!")

# ================================================================
# 手术 2: centerGrid — isoCenterX 纳入 shearX, isoCenterY 移除 X 依赖
# ================================================================

old_2 = """/** 设置 offsetX/offsetY 使棋盘几何中心对齐画布中心 (含等距变换) */
/**
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

new_2 = """/** 设置 offsetX/offsetY 使棋盘几何中心对齐画布中心 (含等距变换) */
/**
 * 设置 offsetX/offsetY 使棋盘几何中心对齐画布中心
 * 使用标准等距平行投影:
 *   screenX = scaleX * flatX + shearX * flatY
 *   screenY = scaleY * flatY  (仅依赖 flatY, R=0 行绝对水平)
 */
function centerGrid() {
  const canvas = mapCanvas.value
  if (!canvas) return
  const midGrid = hexToPixel(Math.floor(props.gridWidth / 2), Math.floor(props.gridHeight / 2))
  // 标准等距: X 由 flatX 和 flatY (通过 shearX) 共同决定, Y 仅由 flatY 决定
  const isoCenterX = midGrid.x * ISO.scaleX + midGrid.y * ISO.shearX
  const isoCenterY = midGrid.y * ISO.scaleY
  offsetX.value = canvas.width / 2 - isoCenterX * scale.value
  offsetY.value = canvas.height / 2 - isoCenterY * scale.value
}"""

if old_2 in content:
    content = content.replace(old_2, new_2)
    changes.append("✅ 手术2: centerGrid → shearX 纳入 X, Y 仅依赖 flatY")
else:
    changes.append("❌ 手术2: 未匹配到 centerGrid 目标文本!")

# ================================================================
# 手术 3: draw CTM — transform(scaleX, 0, shearX, scaleY) 替代错误公式
# ================================================================

old_3 = """  // === CTM: 平移 → 缩放 → 等距仿射 (用户指定公式) ===
  // 公式: screenX = flatX * scaleX, screenY = flatY * scaleY + screenX * shearY
  // 等价 canvas: transform(scaleX, shearY*scaleX, 0, scaleY, 0, 0)
  // 性质: R=0 行天然水平 (flatY=0 → screenY=0), 列向量绝对平行 (无 shearX 干扰)
  ctx.translate(offsetX.value, offsetY.value)
  ctx.scale(scale.value, scale.value)
  ctx.transform(ISO.scaleX, ISO.shearY * ISO.scaleX, 0, ISO.scaleY, 0, 0)"""

new_3 = """  // === CTM: 平移 → 缩放 → 标准等距平行投影 ===
  // 公式:
  //   screenX = scaleX * flatX + shearX * flatY  (shearX 驱动 X 轴纵深感)
  //   screenY = scaleY * flatY                    (Y 仅依赖 flatY, 绝对水平)
  // 等价 canvas: transform(scaleX, 0, shearX, scaleY, 0, 0)
  // 性质:
  //   - R=0 行 screenY=0 → 画布上绝对水平地平线
  //   - shearX 滑块拉动 → 整列平行推移 (等距纵深感)
  //   - 列斜率恒定 = shearX * scaleY / (scaleX * sqrt(3)), 首尾列绝对平行
  ctx.translate(offsetX.value, offsetY.value)
  ctx.scale(scale.value, scale.value)
  ctx.transform(ISO.scaleX, 0, ISO.shearX, ISO.scaleY, 0, 0)"""

if old_3 in content:
    content = content.replace(old_3, new_3)
    changes.append("✅ 手术3: draw CTM → transform(scaleX, 0, shearX, scaleY) 标准等距投影")
else:
    changes.append("❌ 手术3: 未匹配到 draw CTM 目标文本!")

# ================================================================
# 手术 4: 修改 Phase9++ 错误注释
# ================================================================

old_4 = """// Phase9++: 简化 ISO 矩阵 — 使用用户指定公式 transform(scaleX, shearY*scaleX, 0, scaleY)
// R=0 行天然水平 (flatY=0 → screenY=0)，列向量绝对平行 (无 shearX)，无需旋转补偿"""

new_4 = """// Phase9.6: 标准等距平行投影 — transform(scaleX, 0, shearX, scaleY, 0, 0)
// 性质: R=0 行 screenY=offsetY (绝对水平地平线), shearX 驱动 X 轴等距倾斜, 列向量绝对平行"""

if old_4 in content:
    content = content.replace(old_4, new_4)
    changes.append("✅ 手术4: Phase9.6 注释更新")
else:
    changes.append("⚠️ 手术4: Phase9++ 注释未找到 (可能已不存在)")

# ================================================================
# 手术 5: zoomReset — ch 计算移除 shearY 依赖 (screenY=scaleY*flatY, 不含 shearY)
# ================================================================

old_5 = "  const ch = worldW * Math.abs(ISO.shearY) + worldH * ISO.scaleY + 200"
new_5 = "  const ch = worldH * ISO.scaleY + 200  // 新公式: screenY=scaleY*flatY, 无 shearY 分量"

if old_5 in content:
    content = content.replace(old_5, new_5)
    changes.append("✅ 手术5: zoomReset ch → 移除 shearY 依赖")
else:
    changes.append("⚠️ 手术5: zoomReset ch 目标文本未找到")

# ================================================================
# 写入文件
# ================================================================

with open(filepath, "w") as f:
    f.write(content)

for c in changes:
    print(c)
