#!/usr/bin/env python3
"""Stage 2: Patch NewBattleView.vue to use UNIVERSAL_TERRAIN_MAP"""

filepath = '/root/original-project/frontend/src/views/NewBattleView.vue'

with open(filepath, 'r') as f:
    content = f.read()

changes = 0

# === Patch 1: Add UNIVERSAL_TERRAIN_MAP to import ===
old_import = """import { HEX_WIDTH, HEX_HEIGHT, HEX_APOTHEM, HEX_RADIUS, DEFAULT_SPACING_H, DEFAULT_SPACING_V, DEFAULT_OFFSET_FACTOR, hexToPixel as hexToPixelCore, pixelToHex as pixelToHexCore, drawHexPath, getHexNeighbors, TERRAIN_COLORS, pointyTopCenter, pointyTopToHex } from '../utils/hexUtils.js'"""

new_import = """import { HEX_WIDTH, HEX_HEIGHT, HEX_APOTHEM, HEX_RADIUS, DEFAULT_SPACING_H, DEFAULT_SPACING_V, DEFAULT_OFFSET_FACTOR, hexToPixel as hexToPixelCore, pixelToHex as pixelToHexCore, drawHexPath, getHexNeighbors, TERRAIN_COLORS, UNIVERSAL_TERRAIN_MAP, convertMapFormat, pointyTopCenter, pointyTopToHex } from '../utils/hexUtils.js'"""

if old_import in content:
    content = content.replace(old_import, new_import)
    changes += 1
    print("[1] Added UNIVERSAL_TERRAIN_MAP, convertMapFormat to NewBattleView import")
else:
    print("[1] WARNING: import line not found, checking alternative...")
    # Try with different formatting
    if 'TERRAIN_COLORS' in content:
        # Find the import line
        for i, line in enumerate(content.split('\n')):
            if 'TERRAIN_COLORS' in line and 'import' in line:
                print(f"  Found at line {i+1}: {line.strip()}")
                break

# === Patch 2: Remove local TERRAIN_MAP, replace getTerrainDef ===
# The TERRAIN_MAP is followed by a blank line and FACTION_CONFIG
old_terrain_map = """const TERRAIN_MAP = {
  space:       { ...TERRAIN_COLORS.space, cost: 1 },
  moon:        { ...TERRAIN_COLORS.moon, cost: 1 },
  lunar:       { ...TERRAIN_COLORS.lunar, cost: 1 },
  empty:       { ...TERRAIN_COLORS.empty, cost: 1 },
  fortress:    { ...TERRAIN_COLORS.fortress, cost: 5 },
  base:        { ...TERRAIN_COLORS.base, cost: 1 },
  mothership:  { ...TERRAIN_COLORS.mothership, cost: 1 },
  forest:      { ...TERRAIN_COLORS.forest, cost: 2 },
  desert:      { ...TERRAIN_COLORS.desert, cost: 1.5 },
  water:       { ...TERRAIN_COLORS.water, cost: 2.5 },
  mountain:    { ...TERRAIN_COLORS.mountain, cost: 3 },
  wall:        { ...TERRAIN_COLORS.wall, cost: 99 },
  repair_station: { ...TERRAIN_COLORS.repair_station, cost: 1 },
  spawn_earth:  { ...TERRAIN_COLORS.spawn_earth, cost: 0 },
  spawn_maxion: { ...TERRAIN_COLORS.spawn_maxion, cost: 0 },
  spawn:        { ...TERRAIN_COLORS.spawn, cost: 0 },
}

const FACTION_CONFIG = {"""

new_terrain_block = """// TERRAIN_MAP — 已迁移至 hexUtils.js 的 UNIVERSAL_TERRAIN_MAP
// 直接使用 UNIVERSAL_TERRAIN_MAP 作为全项目唯一地形真理

const FACTION_CONFIG = {"""

if old_terrain_map in content:
    content = content.replace(old_terrain_map, new_terrain_block)
    changes += 1
    print("[2] Removed local TERRAIN_MAP, now using UNIVERSAL_TERRAIN_MAP from hexUtils.js")
else:
    print("[2] WARNING: TERRAIN_MAP block not found")

# === Patch 3: Update getTerrainDef ===
old_getTerrain = """function getTerrainDef(id) {
  return TERRAIN_MAP[id] || { name: id || '未知', color: '#333', cost: 1 }
}"""

new_getTerrain = """function getTerrainDef(id) {
  // 从全项目唯一地形真理查询（宪法 v2.0：显式依赖）
  return UNIVERSAL_TERRAIN_MAP[id] || { name: id || '未知', color: '#333', cost: 1 }
}"""

if old_getTerrain in content:
    content = content.replace(old_getTerrain, new_getTerrain)
    changes += 1
    print("[3] Updated getTerrainDef to use UNIVERSAL_TERRAIN_MAP")
else:
    print("[3] WARNING: getTerrainDef not found")

with open(filepath, 'w') as f:
    f.write(content)

print(f"\nTotal changes: {changes}")
