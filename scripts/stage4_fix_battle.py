#!/usr/bin/env python3
"""
Stage 4 Fix: NewBattleView.vue — UI Isolation & Event Binding
Fixes:
  A) map-legend pointer-events:none → click-through to hex cells
  B) Drag panning broken: offsetX/offsetY never updated in mousemove
  C) Duplicate `dx` variable in drag handler
"""
import sys

filepath = sys.argv[1] if len(sys.argv) > 1 else '/root/original-project/frontend/src/views/NewBattleView.vue'

with open(filepath, 'r') as f:
    content = f.read()

changes = 0

# ================================================================
# Fix A: map-legend → pointer-events:none
# ================================================================
old_a = """.map-legend {
  position: absolute;
  bottom: 6px;
  left: 6px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  background: rgba(0,0,0,0.78);
  padding: 5px 10px;
  font-size: 9px;
  color: rgba(255,255,255,0.5);
  font-family: 'Fira Code', monospace;
  z-index: 6;
  max-width: calc(100% - 12px);
}"""

new_a = """.map-legend {
  position: absolute;
  bottom: 6px;
  left: 6px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  background: rgba(0,0,0,0.78);
  padding: 5px 10px;
  font-size: 9px;
  color: rgba(255,255,255,0.5);
  font-family: 'Fira Code', monospace;
  z-index: 6;
  max-width: calc(100% - 12px);
  pointer-events: none;
}"""

if old_a in content:
    content = content.replace(old_a, new_a, 1)
    changes += 1
    print("[A] map-legend → pointer-events:none added")
else:
    # Try to find it with slightly different formatting
    if 'pointer-events: none' in content.split('.map-legend')[1].split('}')[0] if '.map-legend' in content else False:
        print("[A] map-legend already has pointer-events:none (SKIP)")
    else:
        print("[A] WARNING: map-legend block not found exactly, trying alt match...")
        import re
        match = re.search(r'(\.map-legend\s*\{[^}]*z-index:\s*6;[^}]*\})', content, re.DOTALL)
        if match:
            old_block = match.group(1)
            new_block = old_block.replace('z-index: 6;', 'z-index: 6;\n  pointer-events: none;')
            content = content.replace(old_block, new_block, 1)
            changes += 1
            print("[A] map-legend → pointer-events:none added (alt match)")

# ================================================================
# Fix B: Drag panning — offsetX/offsetY update
# ================================================================
old_b = """    if (e.buttons === 1) {
      const dx = Math.abs(e.clientX - dragStartX)
      const dy = Math.abs(e.clientY - dragStartY)
      if (dx > 5 || dy > 5) isDragging = true
      if (isDragging) {
        const rect = mapCanvas.value.getBoundingClientRect()
        const sx = mapCanvas.value.width / rect.width
        const sy = mapCanvas.value.height / rect.height
        const dx = (e.clientX - dragStartX) * sx
        draw()
      }
    }"""

new_b = """    if (e.buttons === 1) {
      const dragDistX = Math.abs(e.clientX - dragStartX)
      const dragDistY = Math.abs(e.clientY - dragStartY)
      if (dragDistX > 5 || dragDistY > 5) isDragging = true
      if (isDragging) {
        const rect = mapCanvas.value.getBoundingClientRect()
        const sx = mapCanvas.value.width / rect.width
        const sy = mapCanvas.value.height / rect.height
        offsetX.value = dragStartOX + (e.clientX - dragStartX) * sx
        offsetY.value = dragStartOY + (e.clientY - dragStartY) * sy
        draw()
      }
    }"""

if old_b in content:
    content = content.replace(old_b, new_b, 1)
    changes += 1
    print("[B] Drag panning: offsetX/offsetY now updated")
else:
    print("[B] WARNING: Drag handler block not found exactly, trying alt match...")
    # Try finding the pattern more flexibly
    import re
    pattern = r'if \(e\.buttons === 1\) \{\s*const dx = Math\.abs\(e\.clientX - dragStartX\)\s*const dy = Math\.abs\(e\.clientY - dragStartY\)\s*if \(dx > 5 \|\| dy > 5\) isDragging = true\s*if \(isDragging\) \{\s*const rect = mapCanvas\.value\.getBoundingClientRect\(\)\s*const sx = mapCanvas\.value\.width / rect\.width\s*const sy = mapCanvas\.value\.height / rect\.height\s*const dx = \(e\.clientX - dragStartX\) \* sx\s*draw\(\)\s*\}\s*\}'
    match = re.search(pattern, content, re.DOTALL)
    if match:
        old_block = match.group(0)
        content = content.replace(old_block, new_b, 1)
        changes += 1
        print("[B] Drag panning: offsetX/offsetY now updated (alt match)")
    else:
        print("[B] ERROR: Could not find drag handler to fix!")

# ================================================================
# Also ensure dragStartOX/dragStartOY are initialized in mousedown
# ================================================================
# Check if dragStartOX/dragStartOY exist
if 'dragStartOX' not in content or 'dragStartOY' not in content:
    old_onmousedown = """  canvas.onmousedown = (e) => {
    if (e.button === 0) {
      isDragging = false
      dragStartX = e.clientX
      dragStartY = e.clientY
      dragStartOX = offsetX.value
      dragStartOY = offsetY.value
      canvas.style.cursor = 'grabbing'
    }
  }"""
    # Check if we need to add the dragStartOX/dragStartOY variables
    old_onmousedown_alt = """  canvas.onmousedown = (e) => {
    if (e.button === 0) {
      isDragging = false
      dragStartX = e.clientX
      dragStartY = e.clientY
      canvas.style.cursor = 'grabbing'
    }
  }"""
    if old_onmousedown_alt in content:
        content = content.replace(old_onmousedown_alt, old_onmousedown, 1)
        changes += 1
        print("[B] mousedown: dragStartOX/dragStartOY init added")
    else:
        print("[B] mousedown: dragStartOX/dragStartOY already present or not found")

# Write back
with open(filepath, 'w') as f:
    f.write(content)

print(f"\nDone. {changes} changes applied to {filepath}")
