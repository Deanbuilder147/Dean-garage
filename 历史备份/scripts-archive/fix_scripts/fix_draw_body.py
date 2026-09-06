#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""修复 drawBattleScene 函数体: 移除 CTM 初始化和残留变量。"""
import re

CUR = '/root/original-project/frontend/src/views/NewBattleView.vue'

with open(CUR, 'r', encoding='utf-8') as f:
    text = f.read()

# ---- 1. 修复 drawBattleScene 函数体: 移除 Canvas 初始化和 CTM 设置 ----
# 旧: const canvas = mapCanvas.value\n  if (!canvas) return\n  const ctx = canvas.getContext('2d')\n  ctx.clearRect(...)\n  ctx.save()\n  ctx.translate(...)\n  ctx.scale(...)\n  ctx.transform(...)
# 新: 直接使用传入的 ctx 参数

old_draw_body = """  const canvas = mapCanvas.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.save()

  // === 等距 3D 变换：平移 → 缩放 → 等距矩阵压扁 ===
  ctx.translate(offsetX.value, offsetY.value)
  ctx.scale(scale.value, scale.value)
  ctx.transform(ISO.scaleX, ISO.shearY, ISO.shearX, ISO.scaleY, 0, 0)  // 等距 shear+scaleY

  // Cell lookup"""

new_draw_body = """  // ctx 已由 HexGridCanvas 应用完整 CTM (translate→scale→ISO shear)，直接绘制即可

  // Cell lookup"""

text = text.replace(old_draw_body, new_draw_body)

# ---- 2. 移除 drawBattleScene 末尾的 ctx.restore() ----
# 旧:   ctx.restore()\n}\n
# HexGridCanvas 已经在 drawFn 外部管理 save/restore
text = text.replace('  ctx.restore()\n}\n\n// ===== Event Handling =====', '}\n\n// ===== HexGridCanvas 事件处理器 =====')
# 如果有不同空白
text = text.replace('  ctx.restore()\n}\n\n// ===== HexGridCanvas', '}\n\n// ===== HexGridCanvas')

# ---- 3. 移除残留的拖拽变量声明 ----
text = re.sub(
    r'let isDragging = false\nlet dragStartX, dragStartY, dragStartOX, dragStartOY\nlet _windowDragMove = null\nlet _windowDragEnd = null\n\n',
    '',
    text
)

# ---- 4. 移除重复的 findUnitAt (原函数位置的) ----
text = re.sub(
    r'\nfunction findUnitAt\(q, r\) \{\n  return allUnits\.value\.find\(u => u\.q === q && u\.r === r\)\n\}\n\n',
    '\n',
    text
)

# ---- 5. 移除可能残留的原始 findUnitAt 之间的空行问题 ----
# 将多个连续空行压缩为两个
text = re.sub(r'\n{4,}', '\n\n\n', text)

with open(CUR, 'w', encoding='utf-8') as f:
    f.write(text)

print(f'修复完成: {len(text.splitlines())} 行')
