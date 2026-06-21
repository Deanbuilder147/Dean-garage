#!/usr/bin/env python3
"""
宪法级修正：锁死 Canvas 容器 CSS 物理尺寸 + 切除 JS 动态尺寸污染
目标文件: frontend/src/components/HexGridCanvas.vue
"""

import sys

path = "frontend/src/components/HexGridCanvas.vue"
with open(path, "r") as f:
    content = f.read()

fixes = 0

# -------------------------------------------------------
# FIX 1: CSS — 三道死锁
# -------------------------------------------------------
old_css = """.game-canvas-sandbox {
  position: relative;
  overflow: hidden;
  flex: 1;
  min-height: 0;
  min-width: 0;
  background: #061218;
  border: 1px solid rgba(255, 176, 0, 0.08);
}

.canvas-container {
  position: relative;
  overflow: hidden;
}

.canvas-container canvas {
  display: block;
}"""

new_css = """.game-canvas-sandbox {
  position: relative;
  overflow: hidden;
  flex: 1;
  min-height: 0;
  min-width: 0;
  background: #061218;
  border: 1px solid rgba(255, 176, 0, 0.08);
}

.canvas-container {
  position: relative;
  overflow: hidden;
  width: 100%;
  height: 100%;
}

.canvas-container canvas {
  display: block;
  width: 100%;
  height: 100%;
}"""

if old_css in content:
    content = content.replace(old_css, new_css)
    fixes += 1
    print("FIX 1: CSS 三道死锁 -> .canvas-container width/height:100% + canvas width/height:100%")
else:
    print("WARN: FIX 1 old_css not found exactly, checking partial...")
    # Fallback: check key lines exist
    if ".canvas-container {" in content and "width: 100%;" not in content.split(".canvas-container {")[1].split("}")[0]:
        content = content.replace(
            ".canvas-container {\n  position: relative;\n  overflow: hidden;\n}",
            ".canvas-container {\n  position: relative;\n  overflow: hidden;\n  width: 100%;\n  height: 100%;\n}"
        )
        fixes += 1
        print("  -> fallback applied")
    if ".canvas-container canvas {" in content and "width: 100%" not in content.split(".canvas-container canvas {")[1].split("}")[0]:
        content = content.replace(
            ".canvas-container canvas {\n  display: block;\n}",
            ".canvas-container canvas {\n  display: block;\n  width: 100%;\n  height: 100%;\n}"
        )
        print("  -> canvas fallback applied")

# -------------------------------------------------------
# FIX 2: JS — 删除 computeCanvasSize() 函数
# -------------------------------------------------------
old_compute = """/**
 * 根据网格尺寸与 ISO 参数计算画布所需尺寸
 */
function computeCanvasSize() {
  const lastCol = hexToPixel(props.gridWidth - 1, 0)
  const lastRow = hexToPixel(0, props.gridHeight - 1)
  const worldW = lastCol.x + HEX_RADIUS * 2
  const worldH = lastRow.y + HEX_RADIUS * 2
  // 等距: 画布尺寸需考虑 shear 扩展 (X方向变宽) + Y 压缩
  const cw = worldW * ISO.scaleX + worldH * Math.abs(ISO.shearX) + 200
  const ch = worldW * Math.abs(ISO.shearY) + worldH * ISO.scaleY + 200
  return { cw, ch }
}"""

# Try with various comment styles
variants = [
    old_compute,
    old_compute.replace("/**\n * 根据网格尺寸与 ISO 参数计算画布所需尺寸\n */", "/** 根据网格尺寸与 ISO 参数计算画布所需尺寸 */"),
]

found = False
for variant in variants:
    if variant in content:
        content = content.replace(variant, "")
        fixes += 1
        print("FIX 2: 删除 computeCanvasSize()")
        found = True
        break

if not found and "function computeCanvasSize()" in content:
    # Last resort: find by function name
    start = content.index("function computeCanvasSize()")
    # Work backwards to find the comment
    block_start = content.rfind("/**", 0, start)
    if block_start == -1:
        block_start = content.rfind("//", 0, start)
        if block_start == -1:
            block_start = start
    # Find the closing brace
    depth = 0
    end = start
    for i in range(start, len(content)):
        if content[i] == "{":
            depth += 1
        elif content[i] == "}":
            depth -= 1
            if depth == 0:
                end = i + 1
                break
    old_block = content[block_start:end]
    content = content.replace(old_block, "")
    fixes += 1
    print("FIX 2: 删除 computeCanvasSize() (fallback)")

# -------------------------------------------------------
# FIX 3: JS — 重写 initCanvas()
# -------------------------------------------------------
old_init = """function initCanvas() {
  const canvas = mapCanvas.value
  if (!canvas) return
  ctx = canvas.getContext('2d')

  const { cw, ch } = computeCanvasSize()
  canvas.width = cw
  canvas.height = ch
  canvas.style.display = 'block'

  if (props.gridWidth > 30 || props.gridHeight > 30) {
    scale.value = 0.5
  }

  centerGrid()
  isFirstDraw = false
  draw()
}"""

new_init = """function initCanvas() {
  const canvas = mapCanvas.value
  const container = canvasContainer.value
  if (!canvas || !container) return
  ctx = canvas.getContext('2d')

  // 宪法红线: canvas 物理尺寸严格等于容器 CSS 像素尺寸，绝不使用世界坐标
  canvas.width = container.clientWidth
  canvas.height = container.clientHeight
  canvas.style.display = 'block'

  if (props.gridWidth > 30 || props.gridHeight > 30) {
    scale.value = 0.5
  }

  centerGrid()
  isFirstDraw = false
  draw()
}"""

if old_init in content:
    content = content.replace(old_init, new_init)
    fixes += 1
    print("FIX 3: initCanvas() -> canvas.width/height = container.clientWidth/Height")
else:
    print("WARN: FIX 3 exact match not found, trying fallback...")
    # Fallback: replace individual lines
    if "const { cw, ch } = computeCanvasSize()" in content:
        content = content.replace(
            "const { cw, ch } = computeCanvasSize()\n  canvas.width = cw\n  canvas.height = ch",
            "const container = canvasContainer.value\n  // 宪法红线: canvas 物理尺寸严格等于容器 CSS 像素尺寸\n  canvas.width = container.clientWidth\n  canvas.height = container.clientHeight"
        )
        fixes += 1
        print("  -> fallback applied")
    if "if (!canvas) return" in content and "if (!canvas || !container) return" not in content:
        content = content.replace(
            "const canvas = mapCanvas.value\n  if (!canvas) return",
            "const canvas = mapCanvas.value\n  const container = canvasContainer.value\n  if (!canvas || !container) return"
        )
        print("  -> added container guard")

# -------------------------------------------------------
# FIX 4: JS — draw() 切除动态尺寸检查
# -------------------------------------------------------
old_draw_resize = """  // 动态调整画布尺寸 (间距变化时自动扩容)
  const { cw, ch } = computeCanvasSize()
  const resized = canvas.width !== cw || canvas.height !== ch
  if (resized) {
    canvas.width = cw
    canvas.height = ch
  }
  if (isFirstDraw || resized) {
    centerGrid()
    isFirstDraw = false
  }"""

new_draw_resize = """  // 宪法红线: canvas 物理尺寸永不改变，所有变换通过 CTM 实现
  if (isFirstDraw) {
    centerGrid()
    isFirstDraw = false
  }"""

if old_draw_resize in content:
    content = content.replace(old_draw_resize, new_draw_resize)
    fixes += 1
    print("FIX 4: draw() -> 删除动态 resize，仅保留 centerGrid")
else:
    print("WARN: FIX 4 exact match not found, trying fallback...")
    # Find and remove lines containing key patterns
    if "const { cw, ch } = computeCanvasSize()" in content:
        content = content.replace(
            "const { cw, ch } = computeCanvasSize()\n  const resized = canvas.width !== cw || canvas.height !== ch\n  if (resized) {\n    canvas.width = cw\n    canvas.height = ch\n  }\n  if (isFirstDraw || resized) {",
            "if (isFirstDraw) {"
        )
        fixes += 1
        print("  -> fallback applied")

with open(path, "w") as f:
    f.write(content)

print(f"\n=== HexGridCanvas.vue: {fixes} 处宪法修正完成 ===")
