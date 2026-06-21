#!/usr/bin/env python3
"""Fix: 恢复 canvas 自然尺寸，沙盒 overflow:hidden 裁剪 + 程序化平移"""
import os

BASE = "/root/original-project/frontend/src/views"

# ===== NewBattleView.vue =====
path1 = os.path.join(BASE, "NewBattleView.vue")
with open(path1, "r") as f:
    content1 = f.read()

changes1 = []

# 1. 沙盒 overflow: auto → overflow: hidden（程序化平移，不需要 CSS 滚动条）
old_sandbox1 = """  overflow: auto;
  flex: 1;"""
new_sandbox1 = """  overflow: hidden;
  flex: 1;"""
if old_sandbox1 in content1:
    content1 = content1.replace(old_sandbox1, new_sandbox1)
    changes1.append("sandbox overflow: auto → hidden")

# 2. canvas-container: min-width/min-height 100% 改回由内容撑开
old_container1 = """.canvas-container {
  position: relative;
  min-width: 100%;
  min-height: 100%;
}"""
new_container1 = """.canvas-container {
  position: relative;
}"""
if old_container1 in content1:
    content1 = content1.replace(old_container1, new_container1)
    changes1.append("canvas-container: 移除 min-width/min-height 100%")

# 3. canvas: 移除 max-width/max-height/object-fit，让 canvas 以原生尺寸渲染
old_canvas1 = """.canvas-container canvas {
  display: block;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}"""
new_canvas1 = """.canvas-container canvas {
  display: block;
}"""
if old_canvas1 in content1:
    content1 = content1.replace(old_canvas1, new_canvas1)
    changes1.append("canvas: 移除 max-width/height/object-fit")

with open(path1, "w") as f:
    f.write(content1)

print(f"[OK] NewBattleView.vue: {', '.join(changes1)}")

# ===== NewBattlefieldView.vue =====
path2 = os.path.join(BASE, "NewBattlefieldView.vue")
with open(path2, "r") as f:
    content2 = f.read()

changes2 = []

# 1. 沙盒 overflow: hidden → 保持不变，但移除 contain: layout → contain: layout 保留即可
#    NewBattlefieldView 已经是 overflow: hidden

# 2. canvas: 移除 max-width/max-height/object-fit
old_canvas2 = """.canvas-container canvas {
  image-rendering: pixelated;
  display: block;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}"""
new_canvas2 = """.canvas-container canvas {
  image-rendering: pixelated;
  display: block;
}"""
if old_canvas2 in content2:
    content2 = content2.replace(old_canvas2, new_canvas2)
    changes2.append("canvas: 移除 max-width/height/object-fit")

# 3. canvas-container: 改回由内容撑开
old_container2 = """.canvas-container { width: 100%; height: 100%; overflow: auto; }"""
new_container2 = """.canvas-container { position: relative; }"""
if old_container2 in content2:
    content2 = content2.replace(old_container2, new_container2)
    changes2.append("canvas-container: width/height 100% → relative")

with open(path2, "w") as f:
    f.write(content2)

print(f"[OK] NewBattlefieldView.vue: {', '.join(changes2) if changes2 else 'no changes needed'}")
print("\nDone.")
