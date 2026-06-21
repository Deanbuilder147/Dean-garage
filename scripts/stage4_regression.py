#!/usr/bin/env python3
"""Stage 4 Regression Test — verifies Stage 1-3 integrity + Stage 4 fixes"""
import re, sys

errors = []

def check(name, condition):
    status = "OK" if condition else "FAIL"
    if not condition:
        errors.append(name)
    print(f"  [{status}] {name}")

# ================================================================
# File 1: hexUtils.js — Stage 1-3 regression
# ================================================================
with open('/root/original-project/frontend/src/utils/hexUtils.js') as f:
    hu = f.read()

print("=== Stage 1-3 Regression: hexUtils.js ===")

# Stage 1: constants
for c in ['HEX_WIDTH', 'HEX_HEIGHT', 'HEX_APOTHEM', 'HEX_RADIUS',
          'DEFAULT_SPACING_H', 'DEFAULT_SPACING_V', 'DEFAULT_OFFSET_FACTOR']:
    check(f"const {c} present", f"const {c}" in hu or f"export const {c}" in hu)

# Stage 1: functions
for fname in ['pointyTopCenter', 'pointyTopToHex', 'flatTopCenter', 'flatTopToHex',
              'getHexNeighbors', 'drawHexPath', 'drawHexPathDeformed',
              'flatToIso', 'isoToFlat', 'cellToScreen', 'screenToWorld',
              'colToLetter', 'letterToCol', 'formatCoord', 'parseCoord', 'parseCoordRange']:
    check(f"function {fname}", f"function {fname}" in hu or f"export function {fname}" in hu)

# Stage 2: terrain
check("UNIVERSAL_TERRAIN_MAP present", "UNIVERSAL_TERRAIN_MAP" in hu)
check("TERRAIN_COLORS present", "TERRAIN_COLORS" in hu)
check("convertMapFormat present", "convertMapFormat" in hu)
terrain_count = hu.count("cost:")
check(f"terrain types ({terrain_count})", terrain_count >= 14)

# Stage 3: ISO_DEFAULTS aligned with baseline
m_iso = re.search(r'ISO_DEFAULTS\s*=\s*\{([^}]+)\}', hu, re.DOTALL)
m_bl = re.search(r'baseline:\s*\{([^}]+)\}', hu, re.DOTALL)
if m_iso and m_bl:
    iso_body = m_iso.group(1)
    bl_body = m_bl.group(1)
    for key in ['shearX', 'shearY', 'scaleX', 'scaleY', 'rotation']:
        iso_v = re.search(rf'{key}:\s*([-\d.]+)', iso_body)
        bl_v = re.search(rf'{key}:\s*([-\d.]+)', bl_body)
        if iso_v and bl_v:
            check(f"ISO_DEFAULTS.{key} == baseline.{key}", iso_v.group(1) == bl_v.group(1))

# Stage 3: hexToPixel uses pointyTopCenter
check("hexToPixel → pointyTopCenter", "pointyTopCenter" in hu.split("function hexToPixel")[1].split("function")[0] if "function hexToPixel" in hu else False)

# Stage 3: pixelToHex uses pointyTopToHex
check("pixelToHex → pointyTopToHex", "pointyTopToHex" in hu.split("function pixelToHex")[1].split("function")[0] if "function pixelToHex" in hu else False)

# Braces balance
opens = hu.count('{'); closes = hu.count('}')
check(f"braces balanced ({opens}/{closes})", opens == closes)

# ================================================================
# File 2: NewBattlefieldView.vue — Stage 2-3 regression
# ================================================================
with open('/root/original-project/frontend/src/views/NewBattlefieldView.vue') as f:
    bf = f.read()

print("\n=== Stage 2-3 Regression: NewBattlefieldView.vue ===")

check("imports drawHexPath from hexUtils", "drawHexPath" in bf.split("<script")[1].split("</script>")[0])
check("no local drawHexPath function", "function drawHexPath(cx, cy)" not in bf)
check("imports hexUtils constants", "HEX_WIDTH" in bf.split("<script")[1].split("</script>")[0])
check("imports terrain map", "UNIVERSAL_TERRAIN_MAP" in bf.split("<script")[1].split("</script>")[0])
check("cursor-hint pointer-events:none", "pointer-events: none" in bf.split(".cursor-hint")[1].split("}")[0] if ".cursor-hint" in bf else False)

# ================================================================
# File 3: NewBattleView.vue — Stage 2-3 + Stage 4 regression
# ================================================================
with open('/root/original-project/frontend/src/views/NewBattleView.vue') as f:
    bv = f.read()

print("\n=== Stage 2-3 + Stage 4 Regression: NewBattleView.vue ===")

# Stage 2-3 integrity
check("imports hexUtils functions", "pointyTopCenter" in bv.split("<script")[1].split("</script>")[0])
check("imports terrain map", "UNIVERSAL_TERRAIN_MAP" in bv.split("<script")[1].split("</script>")[0])
check("no dead imports (hexToPixelCore)", "hexToPixelCore" not in bv)
check("no dead imports (pixelToHexCore)", "pixelToHexCore" not in bv)

# Stage 4: pointer-events on map-legend
check("map-legend pointer-events:none", "pointer-events: none" in bv.split(".map-legend")[1].split("}")[0] if ".map-legend" in bv else False)

# Stage 4: drag panning offset update
check("drag panning: offsetX updated", "offsetX.value = dragStartOX + (e.clientX - dragStartX) * sx" in bv)
check("drag panning: offsetY updated", "offsetY.value = dragStartOY + (e.clientY - dragStartY) * sy" in bv)
check("drag panning: no duplicate dx var", "const dragDistX" in bv and "const dragDistY" in bv)

# Stage 4: dragStartOX/dragStartOY initialized
check("dragStartOX/oy in mousedown", "dragStartOX = offsetX.value" in bv and "dragStartOY = offsetY.value" in bv)

# Canvas size by JS
check("canvas.width set by JS", "canvas.width = " in bv)
check("canvas.height set by JS", "canvas.height = " in bv)

# CSS: no canvas stretching
canvas_css_section = bv.split(".canvas-container canvas")[1].split("}")[0] if ".canvas-container canvas" in bv else ""
check("canvas CSS: no width/height stretching", "width:" not in canvas_css_section and "height:" not in canvas_css_section)

# Template structure checks
check("dm-battle-layout flex structure", "class=\"dm-battle-layout\"" in bv and "class=\"dm-main\"" in bv)
check("dm-action-panel aside", "class=\"dm-action-panel\"" in bv)

# No stray console.log
script_part = bv.split("<script")[1].split("</script>")[0]
stray_logs = script_part.count("console.log")
check(f"no extra console.log ({stray_logs})", stray_logs <= 3)  # allow a few for error handling

# ================================================================
# Summary
# ================================================================
print(f"\n{'='*60}")
if errors:
    print(f"FAILED: {len(errors)} check(s)")
    for e in errors:
        print(f"  ✗ {e}")
    sys.exit(1)
else:
    print("ALL CHECKS PASSED")
