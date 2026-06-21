#!/usr/bin/env python3
"""
HexGridCanvas.vue 补丁: 新增 isoShearX / isoShearY props，支持父层动态调节 3D 视角。
"""
import re

PATH = '/root/original-project/frontend/src/components/HexGridCanvas.vue'

with open(PATH, 'r', encoding='utf-8') as f:
    text = f.read()

# ======== 1. 添加 reactive 到 import ========
old_import = "import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue'"
new_import = "import { ref, reactive, onMounted, onUnmounted, nextTick, watch } from 'vue'"
text = text.replace(old_import, new_import)

# ======== 2. 在 defineProps 中添加 isoShearX / isoShearY ========
old_props_end = "  drawFn: { type: Function, default: null },\n})"
new_props_insert = """  drawFn: { type: Function, default: null },
  /** 等距矩阵 shearX (3D 视角 X 轴倾斜) — 父层可动态绑定滑块 */
  isoShearX: { type: Number, default: ISO_DEFAULTS.shearX },
  /** 等距矩阵 shearY (3D 视角 Y 轴倾斜) — 父层可动态绑定滑块 */
  isoShearY: { type: Number, default: ISO_DEFAULTS.shearY },
})"""
text = text.replace(old_props_end, new_props_insert)

# ======== 3. 将 const ISO = ISO_DEFAULTS 改为 reactive ========
old_iso = "const ISO = ISO_DEFAULTS"
new_iso = """// ISO 矩阵参数 — 使用 reactive 以支持父层通过 props 动态调节 3D 视角
const ISO = reactive({ ...ISO_DEFAULTS })"""
text = text.replace(old_iso, new_iso)

# ======== 4. 在 spacing watch 后添加 isoShearX/isoShearY watch ========
old_spacing_watch_end = "watch(() => props.spacingV, () => { isFirstDraw = true; draw() })"
new_iso_watches = """watch(() => props.spacingV, () => { isFirstDraw = true; draw() })

// ---- 3D 视角参数变化监听 ----
// 父层滑块拖动时实时同步 ISO 矩阵并触发重绘
watch(() => props.isoShearX, (v) => {
  if (v !== undefined && v !== null) ISO.shearX = v
  draw()
})
watch(() => props.isoShearY, (v) => {
  if (v !== undefined && v !== null) ISO.shearY = v
  draw()
})"""
text = text.replace(old_spacing_watch_end, new_iso_watches)

with open(PATH, 'w', encoding='utf-8') as f:
    f.write(text)

# 验证
checks = [
    ("import { ref, reactive,", "reactive import 添加"),
    ("isoShearX: { type: Number", "isoShearX prop"),
    ("isoShearY: { type: Number", "isoShearY prop"),
    ("const ISO = reactive({ ...ISO_DEFAULTS })", "ISO reactive 转换"),
    ("watch(() => props.isoShearX", "isoShearX watch"),
    ("watch(() => props.isoShearY", "isoShearY watch"),
]

print(f"Patched: {PATH}")
for pattern, desc in checks:
    assert pattern in text, f"FAIL: {desc}"
    print(f"  ✓ {desc}")
print(f"  Lines: {len(text.splitlines())}")
