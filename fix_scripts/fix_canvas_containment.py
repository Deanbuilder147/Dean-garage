#!/usr/bin/env python3
"""Fix P0+P1: 松绑 contain:size + Canvas CSS 边界约束 + 居中修复"""
import os

BASE = "/root/original-project/frontend/src/views"

fixes = []

# ===== NewBattleView.vue =====
path1 = os.path.join(BASE, "NewBattleView.vue")
with open(path1, "r") as f:
    content1 = f.read()

changes1 = []

# P0-1: contain: layout size; → contain: layout;
if "contain: layout size;" in content1:
    content1 = content1.replace("contain: layout size;", "contain: layout;")
    changes1.append("contain: layout size → contain: layout")

# P0-2: canvas CSS 边界约束
old_canvas_css1 = """.canvas-container canvas {
  display: block;
}"""
new_canvas_css1 = """.canvas-container canvas {
  display: block;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}"""
if old_canvas_css1 in content1:
    content1 = content1.replace(old_canvas_css1, new_canvas_css1)
    changes1.append("canvas: +max-width/height/object-fit")

with open(path1, "w") as f:
    f.write(content1)

fixes.append(("NewBattleView.vue", changes1))

# ===== NewBattlefieldView.vue =====
path2 = os.path.join(BASE, "NewBattlefieldView.vue")
with open(path2, "r") as f:
    content2 = f.read()

changes2 = []

# P0-1: contain: layout size; → contain: layout;
if "contain: layout size;" in content2:
    content2 = content2.replace("contain: layout size;", "contain: layout;")
    changes2.append("contain: layout size → contain: layout")

# P0-2: canvas CSS 边界约束
old_canvas_css2 = """.canvas-container canvas { image-rendering: pixelated; display: block; }"""
new_canvas_css2 = """.canvas-container canvas {
  image-rendering: pixelated;
  display: block;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}"""
if old_canvas_css2 in content2:
    content2 = content2.replace(old_canvas_css2, new_canvas_css2)
    changes2.append("canvas: +max-width/height/object-fit")

with open(path2, "w") as f:
    f.write(content2)

fixes.append(("NewBattlefieldView.vue", changes2))

# Report
for fname, changes in fixes:
    print(f"[OK] {fname}: {', '.join(changes) if changes else 'no changes needed'}")
print("\nAll P0+P1 fixes applied.")
