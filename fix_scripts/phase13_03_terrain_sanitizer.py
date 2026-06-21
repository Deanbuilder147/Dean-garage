#!/usr/bin/env python3
"""
Phase 13 Task 2: NewBattleView.vue — 旧地图地形向后兼容层 (Simplified)

安全方案：
1. 添加 extractTerrainId() / sanitizeTerrainCell() 工具函数
2. 更新 getTerrainDef() 兼容结构化对象
3. 在 onMounted 中添加 cells 数据清洗（自动将旧版字符串升级为结构化对象）
4. 更新所有 terrain 读取点使用 extractTerrainId()
"""
import re

BATTLEVIEW_VUE = "/root/original-project/frontend/src/views/NewBattleView.vue"

def patch():
    with open(BATTLEVIEW_VUE, 'r') as f:
        content = f.read()

    # ================================================================
    # PATCH 1: 添加 terrain sanitizer 工具函数
    # 在 hexUtils imports 之后，在第一个函数定义之前
    # ================================================================
    import_marker = "import { combatAPI, hangarAPI, glossaryAPI } from '@/api/client'"
    insert_pos = content.find(import_marker)

    if insert_pos > 0:
        line_end = content.index('\n', insert_pos)
        tool_code = """
// ================================================================
//  Phase 13: 地形向后兼容工具 (Backward Compat Sanitizer)
//  自动将旧版纯文本 terrain_id 包装为 Phase 9.5 结构化对象
//  同时提供 extractTerrainId() 兼容两种格式
// ================================================================

const TERRAIN_DEFAULTS = {
  forest:          { terrain_hp: 3,  is_destructible: true,  max_hp: 3,  destroyed_transform_to: 'plain' },
  mountain:        { terrain_hp: 5,  is_destructible: true,  max_hp: 5,  destroyed_transform_to: 'plain' },
  fortress:        { terrain_hp: 10, is_destructible: true,  max_hp: 10, destroyed_transform_to: 'plain' },
  wall:            { terrain_hp: 20, is_destructible: true,  max_hp: 20, destroyed_transform_to: 'plain' },
  base:            { terrain_hp: 5,  is_destructible: true,  max_hp: 5,  destroyed_transform_to: 'plain' },
  mothership:      { terrain_hp: 15, is_destructible: true,  max_hp: 15, destroyed_transform_to: 'plain' },
  repair_station:  { terrain_hp: 3,  is_destructible: true,  max_hp: 3,  destroyed_transform_to: 'plain' },
  ruin:            { terrain_hp: 2,  is_destructible: true,  max_hp: 2,  destroyed_transform_to: 'plain' },
}

/** 从 terrain 值中提取 terrain_id (兼容字符串和结构化对象) */
function extractTerrainId(terrainVal) {
  if (!terrainVal) return 'moon'
  if (typeof terrainVal === 'string') return terrainVal
  if (typeof terrainVal === 'object') {
    return terrainVal.terrain_id || terrainVal.terrain || terrainVal.type || 'moon'
  }
  return 'moon'
}

/** 清洗单个地形格子: 旧版字符串 → 结构化对象, 已结构化对象保持不变 */
function sanitizeTerrainCell(cellValue) {
  if (!cellValue) return { terrain_id: 'moon', terrain_hp: 0, is_destructible: false, max_hp: 0, destroyed_transform_to: 'moon' }

  // 已是结构化对象
  if (typeof cellValue === 'object' && !Array.isArray(cellValue)) {
    if (cellValue.terrain_id || cellValue.terrain_hp !== undefined) return cellValue
    // 可能是旧版 { terrain: 'forest' } 格式
    const tid = cellValue.terrain || cellValue.type || 'moon'
    if (typeof tid === 'string') {
      const defaults = TERRAIN_DEFAULTS[tid] || {}
      return {
        terrain_id: tid,
        terrain_hp: cellValue.terrain_hp ?? defaults.terrain_hp ?? 0,
        is_destructible: cellValue.is_destructible ?? defaults.is_destructible ?? false,
        max_hp: cellValue.max_hp ?? defaults.max_hp ?? 0,
        destroyed_transform_to: cellValue.destroyed_transform_to ?? defaults.destroyed_transform_to ?? 'plain',
      }
    }
    return cellValue
  }

  // 旧版字符串 (如 "forest")
  if (typeof cellValue === 'string') {
    const tid = cellValue
    const defaults = TERRAIN_DEFAULTS[tid] || {}
    return {
      terrain_id: tid,
      terrain_hp: defaults.terrain_hp || 0,
      is_destructible: defaults.is_destructible || false,
      max_hp: defaults.max_hp || 0,
      destroyed_transform_to: defaults.destroyed_transform_to || 'plain',
    }
  }

  return { terrain_id: 'moon', terrain_hp: 0, is_destructible: false, max_hp: 0, destroyed_transform_to: 'moon' }
}

/** 清洗整个 cells 数组: 升级所有旧版字符串 terrain 字段 */
function sanitizeBattlefieldCells(cells) {
  if (!cells || !Array.isArray(cells)) return cells
  let converted = 0
  const result = cells.map(cell => {
    if (!cell) return cell
    const oldTerrain = cell.terrain
    if (typeof oldTerrain === 'string' && oldTerrain) {
      converted++
      return { ...cell, terrain: sanitizeTerrainCell(oldTerrain) }
    }
    return cell
  })
  if (converted > 0) {
    console.log(`[TerrainSanitizer] Upgraded ${converted} old string terrain cells to Phase 9.5 objects`)
  }
  return result
}
"""
        content = content[:line_end+1] + tool_code + content[line_end+1:]
        print("[Phase13-Task2] ✓ Terrain tools added")
    else:
        print("[Phase13-Task2] ✗ Could not find import marker")

    # ================================================================
    # PATCH 2: 更新 getTerrainDef 兼容结构化对象
    # ================================================================
    old_getdef = """function getTerrainDef(id) {"""
    new_getdef = """function getTerrainDef(id) {
  // Phase 13: 兼容结构化 terrain 对象
  const tid = extractTerrainId(id)"""

    if old_getdef in content:
        content = content.replace(old_getdef, new_getdef)
        print("[Phase13-Task2] ✓ getTerrainDef updated")
    else:
        print("[Phase13-Task2] ⚠ Could not find getTerrainDef")

    # ================================================================
    # PATCH 3: 在 onMounted 中添加 cells 清洗调用
    # ================================================================
    old_cells_load = """  try {
    const { data } = await combatAPI.getBattleState(route.params.id)
    battleState.value = data.battle || data"""

    new_cells_load = """  try {
    const { data } = await combatAPI.getBattleState(route.params.id)
    battleState.value = data.battle || data
    // Phase 13: 清洗旧版 terrain cells 数据
    if (battleState.value?.cells) {
      battleState.value.cells = sanitizeBattlefieldCells(battleState.value.cells)
    }"""

    if old_cells_load in content:
        content = content.replace(old_cells_load, new_cells_load)
        print("[Phase13-Task2] ✓ Sanitizer call added in onMounted")
    else:
        print("[Phase13-Task2] ⚠ Could not find getBattleState in onMounted")

    # ================================================================
    # PATCH 4: 更新 cells 中使用 cell?.terrain 的地方
    # ================================================================
    # Line 967-968: cells.value.forEach(c => { const t = c.terrain || 'moon'
    old_cell_for = """  cells.value.forEach(c => {
    const t = c.terrain || 'moon'"""
    new_cell_for = """  cells.value.forEach(c => {
    const t = extractTerrainId(c.terrain)"""
    if old_cell_for in content:
        content = content.replace(old_cell_for, new_cell_for)
        print("[Phase13-Task2] ✓ cells.forEach terrain read updated")
    else:
        print("[Phase13-Task2] ⚠ Could not find cells.forEach terrain read")

    # Line 1126: const tid = cell?.terrain || 'moon' (in draw function)
    old_draw_tid = "      const tid = cell?.terrain || 'moon'"
    new_draw_tid = "      const tid = extractTerrainId(cell?.terrain)"
    if old_draw_tid in content:
        content = content.replace(old_draw_tid, new_draw_tid)
        print("[Phase13-Task2] ✓ draw terrain read updated")
    else:
        print("[Phase13-Task2] ⚠ Could not find draw terrain read")

    # Line 1412-1413: const cell = cells.value.find... + const terrain = getTerrainDef(cell?.terrain...
    old_cell_find = "    const terrain = getTerrainDef(cell?.terrain || 'moon')"
    new_cell_find = "    const terrain = getTerrainDef(extractTerrainId(cell?.terrain))"
    if old_cell_find in content:
        content = content.replace(old_cell_find, new_cell_find)
        print("[Phase13-Task2] ✓ cell find terrain read updated")
    else:
        print("[Phase13-Task2] ⚠ Could not find cell find terrain read")

    # Line 1041/1064/1091: BFS terrain cost reads
    # Pattern: const terrain = getTerrainDef(cell?.terrain || 'moon')
    # Let's replace all remaining occurrences
    remaining = re.findall(r'getTerrainDef\(cell\?\.terrain \|\| \'moon\'\)', content)
    if remaining:
        for r in set(remaining):
            content = content.replace(r, "getTerrainDef(extractTerrainId(cell?.terrain))")
        print(f"[Phase13-Task2] ✓ Replaced {len(remaining)} remaining terrain reads in BFS/range code")

    with open(BATTLEVIEW_VUE, 'w') as f:
        f.write(content)

    print("[Phase13-Task2] ✓ All terrain sanitizer patches applied to NewBattleView.vue")

if __name__ == '__main__':
    patch()
