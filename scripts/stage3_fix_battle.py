#!/usr/bin/env python3
"""
Stage 3: NewBattleView.vue — clean up dead imports
- Remove hexToPixel as hexToPixelCore, pixelToHex as pixelToHexCore (shadowed by local wrappers)
"""
import sys

filepath = sys.argv[1]
with open(filepath, 'r') as f:
    content = f.read()

# ====== Fix 1: Remove dead shadow imports ======
old_import = 'import { HEX_WIDTH, HEX_HEIGHT, HEX_APOTHEM, HEX_RADIUS, DEFAULT_SPACING_H, DEFAULT_SPACING_V, DEFAULT_OFFSET_FACTOR, hexToPixel as hexToPixelCore, pixelToHex as pixelToHexCore, drawHexPath, getHexNeighbors, TERRAIN_COLORS, UNIVERSAL_TERRAIN_MAP, convertMapFormat, pointyTopCenter, pointyTopToHex } from \'../utils/hexUtils.js\''

new_import = 'import { HEX_WIDTH, HEX_HEIGHT, HEX_APOTHEM, HEX_RADIUS, DEFAULT_SPACING_H, DEFAULT_SPACING_V, DEFAULT_OFFSET_FACTOR, drawHexPath, getHexNeighbors, TERRAIN_COLORS, UNIVERSAL_TERRAIN_MAP, convertMapFormat, pointyTopCenter, pointyTopToHex } from \'../utils/hexUtils.js\''

if old_import in content:
    content = content.replace(old_import, new_import)
    print("[OK] Removed dead imports: hexToPixelCore, pixelToHexCore")
else:
    print("[WARN] Import line not found, check format")

with open(filepath, 'w') as f:
    f.write(content)

print("[DONE] NewBattleView.vue patched")
