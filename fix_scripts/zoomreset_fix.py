#!/usr/bin/env python3
"""修复 zoomReset() 中对已删除 computeCanvasSize 的引用"""
path = "frontend/src/components/HexGridCanvas.vue"
with open(path) as f:
    c = f.read()

old = """function zoomReset() {
  const wrapper = canvasWrapper.value
  if (!wrapper) { scale.value = 1; draw(); return }
  const canvas = mapCanvas.value
  const { cw, ch } = computeCanvasSize()
  const viewW = wrapper.clientWidth
  const viewH = wrapper.clientHeight
  const pad = 20
  const fitScale = Math.min((viewW - pad * 2) / cw, (viewH - pad * 2) / ch)"""

new = """function zoomReset() {
  const wrapper = canvasWrapper.value
  if (!wrapper) { scale.value = 1; draw(); return }
  const canvas = mapCanvas.value
  const lastCol = hexToPixel(props.gridWidth - 1, 0)
  const lastRow = hexToPixel(0, props.gridHeight - 1)
  const worldW = lastCol.x + HEX_RADIUS * 2
  const worldH = lastRow.y + HEX_RADIUS * 2
  const cw = worldW * ISO.scaleX + worldH * Math.abs(ISO.shearX) + 200
  const ch = worldW * Math.abs(ISO.shearY) + worldH * ISO.scaleY + 200
  const viewW = wrapper.clientWidth
  const viewH = wrapper.clientHeight
  const pad = 20
  const fitScale = Math.min((viewW - pad * 2) / cw, (viewH - pad * 2) / ch)"""

if old in c:
    c = c.replace(old, new)
    print("FIX 5: zoomReset() -> inline world extent, removed computeCanvasSize ref")
else:
    print("WARN: exact match not found, trying fallback")
    c = c.replace(
        "const { cw, ch } = computeCanvasSize()",
        "const lastCol = hexToPixel(props.gridWidth - 1, 0)\n  const lastRow = hexToPixel(0, props.gridHeight - 1)\n  const worldW = lastCol.x + HEX_RADIUS * 2\n  const worldH = lastRow.y + HEX_RADIUS * 2\n  const cw = worldW * ISO.scaleX + worldH * Math.abs(ISO.shearX) + 200\n  const ch = worldW * Math.abs(ISO.shearY) + worldH * ISO.scaleY + 200"
    )
    print("  -> fallback applied")

with open(path, "w") as f:
    f.write(c)

# Final verify
count = c.count("computeCanvasSize")
print(f"computeCanvasSize references remaining: {count}")
