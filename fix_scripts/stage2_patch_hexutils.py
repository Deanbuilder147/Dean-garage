#!/usr/bin/env python3
"""Stage 2: Add UNIVERSAL_TERRAIN_MAP and convertMapFormat to hexUtils.js"""

import re

with open('/root/original-project/frontend/src/utils/hexUtils.js', 'r') as f:
    content = f.read()

# Marker: the closing of TERRAIN_COLORS followed by the deformation section header
old_block = """  spawn:        { name: '出生点',   color: '#ffb000' }
}

// ---- 单元格变形绘制 ----"""

new_block = """  spawn:        { name: '出生点',   color: '#ffb000' }
}

// ================================================================
//  UNIVERSAL_TERRAIN_MAP — 全项目唯一地形真理（16 种）
//  规则：TERRAIN_COLORS 提供颜色/名称，此处统一追加 cost
//  新增或修改地形时，只需改此处与 TERRAIN_COLORS 即可。
// ================================================================
export const UNIVERSAL_TERRAIN_MAP = {
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
  spawn:        { ...TERRAIN_COLORS.spawn, cost: 0 }
}

/**
 * 纯静态格式转换器：在编辑器 {"q,r": id} 键值对与战场端数组之间无缝互转
 *
 * @param {Object|Array} data   输入数据
 * @param {string} direction
 *   'to-array':  {"q,r": id} → [{q, r, terrain: id}]
 *   'to-map':    [{q, r, terrain: id}] → {"q,r": id}
 * @returns {Object|Array}
 *
 * 示例:
 *   convertMapFormat({'0,0':'moon','1,2':'forest'}, 'to-array')
 *   // → [{q:0, r:0, terrain:'moon'}, {q:1, r:2, terrain:'forest'}]
 *
 *   convertMapFormat([{q:0,r:0,terrain:'moon'}], 'to-map')
 *   // → {'0,0': 'moon'}
 */
export function convertMapFormat(data, direction) {
  if (!data) return direction === 'to-array' ? [] : {}

  if (direction === 'to-array') {
    if (Array.isArray(data)) return data  // 已经是数组
    return Object.entries(data)
      .filter(([_, val]) => val !== undefined && val !== null)
      .map(([key, val]) => {
        const [qs, rs] = key.split(',')
        return { q: parseInt(qs, 10), r: parseInt(rs, 10), terrain: val }
      })
  }

  if (direction === 'to-map') {
    if (!Array.isArray(data)) return data  // 已经是 map
    const map = {}
    for (const cell of data) {
      if (cell && cell.q !== undefined && cell.r !== undefined) {
        map[cell.q + ',' + cell.r] = cell.terrain || 'moon'
      }
    }
    return map
  }

  throw new Error('convertMapFormat: unknown direction "' + direction + '", use "to-array" or "to-map"')
}

// ---- 单元格变形绘制 ----"""

if old_block in content:
    content = content.replace(old_block, new_block)
    with open('/root/original-project/frontend/src/utils/hexUtils.js', 'w') as f:
        f.write(content)
    print('SUCCESS: Added UNIVERSAL_TERRAIN_MAP and convertMapFormat')
else:
    print('ERROR: marker block not found')
    # Find context around 出生点
    idx = content.find('出生点')
    if idx >= 0:
        snippet = content[idx-30:idx+80]
        print('Context:', repr(snippet))
    else:
        print('出生点 not found at all')
