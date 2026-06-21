#!/usr/bin/env python3
"""
Phase 13 Task 2-B: 地形渲染适配器

当 terrainMap 值从纯文本字符串升级为 Phase 9.5 结构化对象后，
所有使用 terrainMap[key] 作为 terrain_id 的代码必须适配提取 .terrain_id 字段。

此补丁修改:
1. NewBattlefieldView.vue 的 editorDrawFn — 提取 terrain_id
2. 确保老版字符串值和新版结构化对象均能正确渲染
"""
import re

BATTLEFIELD_VUE = "/root/original-project/frontend/src/views/NewBattlefieldView.vue"

def patch():
    with open(BATTLEFIELD_VUE, 'r') as f:
        content = f.read()

    # ============================================================
    # PATCH 1: 在 script 中添加地形ID提取辅助函数
    # ============================================================
    helper_insert = """
// Phase 13: 地形ID提取 — 兼容旧版字符串和新版结构化对象
function extractTerrainId(cellValue) {
  if (!cellValue) return 'moon'
  if (typeof cellValue === 'string') return cellValue
  if (typeof cellValue === 'object' && cellValue.terrain_id) return cellValue.terrain_id
  if (typeof cellValue === 'object' && cellValue.terrain) return cellValue.terrain
  if (typeof cellValue === 'object' && cellValue.type) return cellValue.type
  return 'moon'
}

// Phase 13: 地形名称提取 — 兼容新版结构化对象
function extractTerrainName(cellValue, terrainTypes) {
  const tid = extractTerrainId(cellValue)
  const def = terrainTypes.find(t => t.id === tid)
  return def ? def.name : tid
}
"""
    
    # 在 getTerrainColor 函数之前插入
    old_get_color = """function getTerrainColor(id) {
  const def = UNIVERSAL_TERRAIN_MAP[id]
  return def ? def.color : '#888888'
}"""

    if old_get_color in content:
        content = content.replace(old_get_color, helper_insert + "\n" + old_get_color)
        print("[Phase13-Task2B] ✓ Terrain helper functions added to NewBattlefieldView")
    else:
        print("[Phase13-Task2B] ⚠ Could not find getTerrainColor function")

    # ============================================================
    # PATCH 2: 修改 editorDrawFn 中 terrainMap 的读取方式
    # ============================================================
    old_tid_read = """      // 地形填充
      const tid = terrainMap[`${q},${r}`] || 'moon'
      const terrainDef = terrainTypes.find(t => t.id === tid) || terrainTypes[0]"""

    new_tid_read = """      // 地形填充 (Phase 13: 兼容旧版字符串和新版结构化对象)
      const rawCell = terrainMap[`${q},${r}`]
      const tid = extractTerrainId(rawCell)
      const terrainDef = terrainTypes.find(t => t.id === tid) || terrainTypes[0]"""

    if old_tid_read in content:
        content = content.replace(old_tid_read, new_tid_read)
        print("[Phase13-Task2B] ✓ editorDrawFn terrain read updated")
    else:
        print("[Phase13-Task2B] ⚠ Could not find terrain reading in editorDrawFn")

    # ============================================================
    # PATCH 3: 修改 nonEmptyCellCount 的计算方式
    # ============================================================
    old_cell_count = """const nonEmptyCellCount = computed(() =>
  Object.values(terrainMap).filter(v => v && v !== 'moon').length
)"""

    new_cell_count = """const nonEmptyCellCount = computed(() =>
  Object.values(terrainMap).filter(v => v && extractTerrainId(v) !== 'moon').length
)"""

    if old_cell_count in content:
        content = content.replace(old_cell_count, new_cell_count)
        print("[Phase13-Task2B] ✓ nonEmptyCellCount updated")
    else:
        print("[Phase13-Task2B] ⚠ Could not find nonEmptyCellCount")

    # ============================================================
    # PATCH 4: 修改 saveMap 中 terrainData 过滤
    # ============================================================
    old_save_filter = """    Object.entries(terrainMap).forEach(([key, val]) => {
      if (val && val !== 'moon') terrainData[key] = val
    })"""

    new_save_filter = """    Object.entries(terrainMap).forEach(([key, val]) => {
      if (val && extractTerrainId(val) !== 'moon') terrainData[key] = val
    })"""

    if old_save_filter in content:
        content = content.replace(old_save_filter, new_save_filter)
        print("[Phase13-Task2B] ✓ saveMap terrain filter updated")
    else:
        print("[Phase13-Task2B] ⚠ Could not find saveMap terrain filter")

    with open(BATTLEFIELD_VUE, 'w') as f:
        f.write(content)

    print("[Phase13-Task2B] ✓ All draw adapter patches applied to NewBattlefieldView.vue")

if __name__ == '__main__':
    patch()
