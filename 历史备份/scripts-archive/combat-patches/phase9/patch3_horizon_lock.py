#!/usr/bin/env python3
"""
Phase 9 Feature 3: 视口死锁 — 确保 R=0 永远水平平行于画布
在 HexGridCanvas.vue 的 CTM 链中加入旋转补偿
"""
import re

PATH = '/root/original-project/frontend/src/components/HexGridCanvas.vue'
with open(PATH) as f:
    c = f.read()

changes = 0
lines = c.split('\n')

# === 1. Add rotation to ISO reactive (add isoRotation prop & internal state) ===
# Find ISO_DEFAULTS import and ISO reactive
iso_defaults_idx = None
iso_reactive_idx = None
for i, line in enumerate(lines):
    if 'ISO_DEFAULTS' in line and 'import' not in line:
        iso_defaults_idx = i
    if 'const ISO = reactive' in line:
        iso_reactive_idx = i
        break

if iso_reactive_idx:
    # Add isoRotation prop to props definition
    # Find props definition
    for i, line in enumerate(lines):
        if 'props.isoShearY' in line and 'type:' in lines[i-1]:
            # Insert after isoShearY prop
            insert_at = i + 1  # after the line declaring isoShearY default
            # Need to find the actual location
            pass
    
    # Simpler approach: find the props section and add isoRotation
    props_section_start = None
    for i, line in enumerate(lines):
        if 'const props = defineProps(' in line:
            props_section_start = i
            break
    
    # Find the closing of defineProps
    props_end = None
    for i in range(props_section_start, min(props_section_start+50, len(lines))):
        if lines[i].strip() == '})':
            props_end = i
            break

    if props_end:
        iso_rotation_prop = """  /** Phase9: ISO 旋转角 (用于 R=0 水平死锁, 默认 -24°) */
  isoRotation: { type: Number, default: ISO_DEFAULTS.rotation ?? -24 },
"""
        lines = lines[:props_end] + iso_rotation_prop.split('\n') + lines[props_end:]
        changes += 1
        print('[1/6] isoRotation prop added')

# === 2. Add rotationAngle ref to internal state ===
# Find: const ISO = reactive({ ...ISO_DEFAULTS })
iso_reactive_idx = None
for i, line in enumerate(lines):
    if 'const ISO = reactive(' in line:
        iso_reactive_idx = i
        break

if iso_reactive_idx:
    # Add rotationAngle after ISO declaration
    rot_state = """// Phase9: R=0 水平死锁 — 旋转角度补偿
const rotationAngle = ref(ISO_DEFAULTS.rotation ?? -24)
"""
    lines = lines[:iso_reactive_idx+1] + [''] + rot_state.split('\n') + lines[iso_reactive_idx+1:]
    changes += 1
    print('[2/6] rotationAngle ref added')

# === 3. Modify the CTM pipeline in draw() to include rotation ===
# Find: ctx.transform(ISO.scaleX, ISO.shearY, ISO.shearX, ISO.scaleY, 0, 0)
draw_ctm_idx = None
for i, line in enumerate(lines):
    if 'ctx.transform(ISO.scaleX, ISO.shearY, ISO.shearX, ISO.scaleY' in line:
        draw_ctm_idx = i
        break

if draw_ctm_idx:
    # Replace the single transform line with rotation-aware version
    old_ctm = lines[draw_ctm_idx]
    new_ctm = """  // Phase9: R=0 水平死锁 — 先旋转补偿再等距压扁
  // 旋转角 = atan(-shearY/scaleX) ≈ -24°, 抵消 R=0 行因 shearY 产生的倾斜
  const rotRad = rotationAngle.value * Math.PI / 180
  ctx.rotate(rotRad)
  ctx.transform(ISO.scaleX, ISO.shearY, ISO.shearX, ISO.scaleY, 0, 0)"""
    lines[draw_ctm_idx] = new_ctm
    changes += 1
    print('[3/6] CTM rotation inserted in draw()')

# === 4. Modify canvasPosToWorld to undo rotation ===
# Find the inverse calculation
inverse_idx = None
for i, line in enumerate(lines):
    if 'const det = ISO.scaleX * ISO.scaleY - ISO.shearX * ISO.shearY' in line:
        inverse_idx = i
        break

if inverse_idx:
    # We need to add rotation undo after the shear inverse
    # Find the line with "const flatY = ..." and the return line after it
    flat_y_idx = None
    for i in range(inverse_idx, min(inverse_idx+10, len(lines))):
        if 'const flatY = ' in lines[i]:
            flat_y_idx = i
            break
    
    return_idx = None
    for i in range(inverse_idx, min(inverse_idx+10, len(lines))):
        if 'return { x: flatX' in lines[i]:
            return_idx = i
            break

    if return_idx:
        # Replace the return line with rotation-uncompensated version
        old_return = lines[return_idx]
        new_return = """  // Phase9: undo rotation (R=0 deadlock compensation)
  const rotRadRev = -rotationAngle.value * Math.PI / 180
  const cosR = Math.cos(rotRadRev)
  const sinR = Math.sin(rotRadRev)
  const finalX = cosR * flatX - sinR * flatY
  const finalY = sinR * flatX + cosR * flatY
  return { x: finalX, y: finalY, wx: worldX, wy: worldY }"""
        lines[return_idx] = new_return
        changes += 1
        print('[4/6] Rotation undo added in canvasPosToWorld')

# === 5. Add rotation slider in centerGrid() ===
# Modifying centerGrid to account for rotation in centering
center_idx = None
for i, line in enumerate(lines):
    if 'function centerGrid()' in line:
        center_idx = i
        break

if center_idx:
    # Find the offset calculation in centerGrid
    for i in range(center_idx, min(center_idx+20, len(lines))):
        if 'const isoCenterX = midGrid.x * ISO.scaleX + midGrid.y * ISO.shearX' in lines[i]:
            # Rotation affects centering - the center point after rotation
            # Replace the centering calculation
            old_center_x = lines[i]
            # Add rotation compensation to centering
            new_center_x = """  const rotRadC = rotationAngle.value * Math.PI / 180
  const cosRC = Math.cos(rotRadC)
  const sinRC = Math.sin(rotRadC)
  const rotMidX = midGrid.x * cosRC - midGrid.y * sinRC
  const rotMidY = midGrid.x * sinRC + midGrid.y * cosRC
  const isoCenterX = rotMidX * ISO.scaleX + rotMidY * ISO.shearX
  const isoCenterY = rotMidX * ISO.shearY + rotMidY * ISO.scaleY"""
            lines[i] = new_center_x
            # Remove the old isoCenterY line
            for j in range(i+1, min(i+5, len(lines))):
                if 'const isoCenterY' in lines[j]:
                    lines[j] = ''  # will be cleaned up
                    break
            changes += 1
            print('[5/6] centerGrid rotation compensation added')
            break

# === 6. Add watch for isoRotation prop + expose rotationAngle ===
# Find the isoShearY watch
shear_watch_idx = None
for i, line in enumerate(lines):
    if "watch(() => props.isoShearY" in line:
        shear_watch_idx = i
        break

if shear_watch_idx:
    # Find the closing of this watch block
    watch_end = None
    for i in range(shear_watch_idx, min(shear_watch_idx+10, len(lines))):
        if lines[i].strip() == '})':
            watch_end = i
            break
    
    if watch_end:
        rotation_watch = """// Phase9: isoRotation prop 监听
watch(() => props.isoRotation, (v) => {
  if (v !== undefined && v !== null) rotationAngle.value = v
  draw()
})
"""
        lines = lines[:watch_end+1] + [''] + rotation_watch.split('\n') + lines[watch_end+1:]
        changes += 1
        print('[6/6] isoRotation watch added')

# Also add rotationAngle to defineExpose
expose_idx = None
for i, line in enumerate(lines):
    if 'defineExpose(' in line and '//' not in line and not line.strip().startswith('//'):
        expose_idx = i
        break

if expose_idx:
    for i in range(expose_idx, min(expose_idx+30, len(lines))):
        if 'redraw,' in lines[i] or 'draw,' in lines[i]:
            # Insert rotationAngle after this
            lines.insert(i+2 if i+2 < len(lines) else i+1, '  rotationAngle,')
            changes += 1
            print('[6a] rotationAngle exposed')
            break

# Write back
c = '\n'.join(lines)
# Clean up empty lines that might cause issues (but keep them reasonable)
with open(PATH, 'w') as f:
    f.write(c)
print(f'DONE: {changes} changes applied to HexGridCanvas.vue')
