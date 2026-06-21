#!/usr/bin/env python3
"""Stage 2: Patch NewBattlefieldView.vue to use UNIVERSAL_TERRAIN_MAP"""

filepath = '/root/original-project/frontend/src/views/NewBattlefieldView.vue'

with open(filepath, 'r') as f:
    content = f.read()

changes = 0

# === Patch 1: Add UNIVERSAL_TERRAIN_MAP, convertMapFormat to import ===
old_import = """import {
  HEX_WIDTH, HEX_HEIGHT, HEX_APOTHEM, HEX_RADIUS,
  DEFAULT_SPACING_H, DEFAULT_SPACING_V, DEFAULT_OFFSET_FACTOR,
  pointyTopCenter, pointyTopToHex,
  drawHexPath as drawHexPathCore, colToLetter, formatCoord,
} from '../utils/hexUtils.js'"""

new_import = """import {
  HEX_WIDTH, HEX_HEIGHT, HEX_APOTHEM, HEX_RADIUS,
  DEFAULT_SPACING_H, DEFAULT_SPACING_V, DEFAULT_OFFSET_FACTOR,
  pointyTopCenter, pointyTopToHex,
  drawHexPath as drawHexPathCore, colToLetter, formatCoord,
  UNIVERSAL_TERRAIN_MAP, convertMapFormat,
} from '../utils/hexUtils.js'"""

if old_import in content:
    content = content.replace(old_import, new_import)
    changes += 1
    print("[1] Added UNIVERSAL_TERRAIN_MAP, convertMapFormat to import")
else:
    print("[1] WARNING: import block not found")

# === Patch 2: Replace terrainTypes array with derived from UNIVERSAL_TERRAIN_MAP ===
old_terrain_types = """const terrainTypes = [
  { id: 'moon',    name: '月面',     color: '#888888', moveCost: 1 },
  { id: 'space',   name: '宇宙',     color: '#1a1a2e', moveCost: 1 },
  { id: 'fortress',name: '防御圈',   color: '#9c27b0', moveCost: 5 },
  { id: 'repair_station', name: '维修站', color: '#4caf50', moveCost: 1 },
  { id: 'mothership',name: '母舰',   color: '#2196f3', moveCost: 1 },
  { id: 'forest',  name: '森林',     color: '#2e7d32', moveCost: 2 },
  { id: 'water',   name: '水域',     color: '#03a9f4', moveCost: 2.5 },
  { id: 'mountain',name: '山地',     color: '#78350f', moveCost: 3 },
  { id: 'lunar',   name: '月球表面', color: '#b0b0b0', moveCost: 1.5 },
]"""

new_terrain_types = """// terrainTypes — 编辑器地形调色板，从全项目唯一真理 UNIVERSAL_TERRAIN_MAP 派生
// 全部 16 种地形均可用，无需手动维护
const terrainTypes = Object.entries(UNIVERSAL_TERRAIN_MAP).map(([id, def]) => ({
  id,
  name: def.name,
  color: def.color,
  moveCost: def.cost,
}))"""

if old_terrain_types in content:
    content = content.replace(old_terrain_types, new_terrain_types)
    changes += 1
    print("[2] Replaced terrainTypes with UNIVERSAL_TERRAIN_MAP derivation")
else:
    print("[2] WARNING: terrainTypes block not found (may have been already patched)")

# === Patch 3: Update getTerrainColor to use UNIVERSAL_TERRAIN_MAP ===
old_getTerrainColor = """function getTerrainColor(id) {
  const t = terrainTypes.find(t => t.id === id)
  return t ? t.color : '#888888'
}"""

new_getTerrainColor = """function getTerrainColor(id) {
  // 从统一地形字典查询，编辑器端也无需自建颜色映射
  const def = UNIVERSAL_TERRAIN_MAP[id]
  return def ? def.color : '#888888'
}"""

if old_getTerrainColor in content:
    content = content.replace(old_getTerrainColor, new_getTerrainColor)
    changes += 1
    print("[3] Updated getTerrainColor to use UNIVERSAL_TERRAIN_MAP")
else:
    print("[3] WARNING: getTerrainColor not found")

# === Patch 4: Update exportJSON terrainTypes reference ===
old_export_types = "      terrainTypes: terrainTypes,"
new_export_types = "      terrainTypes: Object.entries(UNIVERSAL_TERRAIN_MAP).map(([id, d]) => ({ id, ...d })),"
if old_export_types in content:
    content = content.replace(old_export_types, new_export_types)
    changes += 1
    print("[4] Updated exportJSON terrainTypes")
else:
    print("[4] WARNING: exportJSON terrainTypes not found (may be already patched)")

with open(filepath, 'w') as f:
    f.write(content)

print(f"\nTotal changes: {changes}")