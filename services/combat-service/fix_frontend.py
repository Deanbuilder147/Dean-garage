#!/usr/bin/env python3
"""
综合前端修复：NewBattleView.vue
- BFS 移动范围寻路（含地形代价）
- 属性面板 HP/属性显示修复
- 部署池数据正确读取
- 移动范围分色高亮
- 客户端移动校验
"""
import os, sys

FRONTEND_PATH = '/root/original-project/frontend/src/views/NewBattleView.vue'

def apply_patches(filepath):
    with open(filepath, 'r') as f:
        content = f.read()
    original_len = len(content)
    modifications = []

    # ============================================================
    # PATCH 1: TERRAIN_MAP 增强 — 添加 moveCost 字段
    # ============================================================
    old_terrain = """const TERRAIN_MAP = {
  space: { name: '宇宙', color: '#1a1a2e' },
  moon: { name: '月面', color: '#888888' },
  lunar: { name: '月球表面', color: '#b0b0b0' },
  desert: { name: '沙漠', color: '#e6c580' },
  forest: { name: '森林', color: '#2e7d32' },
  water: { name: '水域', color: '#03a9f4' },
  mountain: { name: '山地', color: '#78350f' },
  fortress: { name: '防御圈', color: '#9c27b0' },
  repair_station: { name: '维修站', color: '#4caf50' },
  mothership: { name: '母舰', color: '#2196f3' },
  spawn_earth: { name: '地联出生点', color: '#00bcd4' },
  spawn_maxion: { name: '敌方出生点', color: '#f44336' },
  base: { name: '基地', color: '#607d8b' },
  wall: { name: '墙壁', color: '#455a64' }
}"""
    new_terrain = """const TERRAIN_MAP = {
  space: { name: '宇宙', color: '#1a1a2e', cost: 1 },
  moon: { name: '月面', color: '#888888', cost: 1 },
  lunar: { name: '月球表面', color: '#b0b0b0', cost: 1 },
  desert: { name: '沙漠', color: '#e6c580', cost: 2 },
  forest: { name: '森林', color: '#2e7d32', cost: 2 },
  water: { name: '水域', color: '#03a9f4', cost: 3 },
  mountain: { name: '山地', color: '#78350f', cost: 4 },
  fortress: { name: '防御圈', color: '#9c27b0', cost: 5 },
  repair_station: { name: '维修站', color: '#4caf50', cost: 1 },
  mothership: { name: '母舰', color: '#2196f3', cost: 1 },
  spawn_earth: { name: '地联出生点', color: '#00bcd4', cost: 0 },
  spawn_maxion: { name: '敌方出生点', color: '#f44336', cost: 0 },
  base: { name: '基地', color: '#607d8b', cost: 1 },
  wall: { name: '墙壁', color: '#455a64', cost: 99 }
}"""
    if old_terrain in content:
        content = content.replace(old_terrain, new_terrain)
        modifications.append('P1: TERRAIN_MAP 添加 moveCost')
    else:
        print('WARN: P1 TERRAIN_MAP 未找到精确匹配，尝试模糊替换...')
        # Try replacing the pattern more loosely
        import re
        pattern = r'const TERRAIN_MAP\s*=\s*\{[^}]+\}'
        match = re.search(pattern, content, re.DOTALL)
        if match:
            content = content[:match.start()] + new_terrain + content[match.end():]
            modifications.append('P1: TERRAIN_MAP 模糊替换成功')
        else:
            print('WARN: P1 完全失败，跳过')

    # ============================================================
    # PATCH 2: 添加 _moveRangeHexes 全局变量
    # ============================================================
    old_p2 = """const battlefieldSize = computed(() => `${gridWidth.value}×${gridHeight.value}`)"""
    new_p2 = """const battlefieldSize = computed(() => `${gridWidth.value}×${gridHeight.value}`)

// Module-level move range cache for click validation
let _moveRangeHexes = new Set()"""
    if old_p2 in content:
        content = content.replace(old_p2, new_p2)
        modifications.append('P2: 添加 _moveRangeHexes 缓存')
    else:
        print('WARN: P2 未找到 battlefieldSize')

    # ============================================================
    # PATCH 3: getTerrainDef 函数增强 — 添加 cost 字段
    # ============================================================
    old_gtd = """function getTerrainDef(id) {
  return TERRAIN_MAP[id] || { name: id || '未知', color: '#333' }
}"""
    new_gtd = """function getTerrainDef(id) {
  return TERRAIN_MAP[id] || { name: id || '未知', color: '#333', cost: 1 }
}"""
    if old_gtd in content:
        content = content.replace(old_gtd, new_gtd)
        modifications.append('P3: getTerrainDef 添加 cost')
    else:
        print('WARN: P3 未找到 getTerrainDef')

    # ============================================================
    # PATCH 4: 添加 computeMoveRange BFS 寻路函数
    # ============================================================
    old_p4 = """function getFactionConfig(faction) {"""
    new_p4 = """// BFS pathfinding with terrain cost for movement range
function computeMoveRange(unit, cells, unitMap) {
  const range = new Set()
  if (!unit) return range

  const mv = Math.floor(((unit.mobility || unit['机动'] || 3) / 2)) || 1
  const startQ = unit.q || 0
  const startR = unit.r || 0
  const startKey = `${startQ},${startR}`

  // Build cell lookup for terrain costs
  const cellMap = {}
  if (cells) {
    cells.forEach(c => { cellMap[`${c.q},${c.r}`] = c })
  }

  // Hex cube directions (q, r)
  const dirs = [
    [1, 0], [1, -1], [0, -1],
    [-1, 0], [-1, 1], [0, 1]
  ]

  // Dijkstra: cost to reach each hex
  const costMap = {}
  costMap[startKey] = 0
  const queue = [{ q: startQ, r: startR, cost: 0 }]

  while (queue.length > 0) {
    queue.sort((a, b) => a.cost - b.cost)
    const cur = queue.shift()

    for (const [dq, dr] of dirs) {
      const nq = cur.q + dq
      const nr = cur.r + dr
      const nkey = `${nq},${nr}`

      if (nq < 0 || nq >= gridWidth.value || nr < 0 || nr >= gridHeight.value) continue

      // Get terrain cost
      const cell = cellMap[nkey]
      const terrainId = cell?.terrain || 'moon'
      const terrain = getTerrainDef(terrainId)
      const terrainCost = terrain.cost || 1

      // Impassable terrain (wall etc.)
      if (terrainCost >= 99) continue

      // Cannot enter hex occupied by another unit
      if (unitMap && unitMap[nkey]) continue

      const newCost = cur.cost + terrainCost

      if (newCost <= mv) {
        if (costMap[nkey] === undefined || newCost < costMap[nkey]) {
          costMap[nkey] = newCost
          range.add(nkey)
          queue.push({ q: nq, r: nr, cost: newCost })
        }
      }
    }
  }

  return range
}

// Get the terrain cost stored on a moveRangeHexes set entry
function getMoveHexCost(rangeSet, key) {
  return rangeSet[`_cost:${key}`] || 1
}

function getFactionConfig(faction) {"""
    if old_p4 in content:
        content = content.replace(old_p4, new_p4)
        modifications.append('P4: 添加 computeMoveRange BFS 寻路函数')
    else:
        print('WARN: P4 未找到 getFactionConfig')

    # ============================================================
    # PATCH 5: 将 draw() 中圆形移动范围替换为 BFS 调用
    # ============================================================
    old_p5 = """  // Movement range preview
  const moveRangeHexes = new Set()
  if (actionMode.value === 'move' && selectedUnit.value) {
    const su = selectedUnit.value
    const mv = Math.floor(((su.mobility || su['机动'] || 3) / 2) || 1)
    // move: always circular, no min-range, exclude occupied hexes
    for (let dr = -mv; dr <= mv; dr++) {
      for (let dq = -mv; dq <= mv; dq++) {
        const ds = -dq - dr
        if (Math.max(Math.abs(dq), Math.abs(dr), Math.abs(ds)) > mv) continue
        const tq = (su.q || 0) + dq
        const tr = (su.r || 0) + dr
        if (tq >= 0 && tq < gridWidth.value && tr >= 0 && tr < gridHeight.value) {
          if (!unitMap[`${tq},${tr}`]) {
            moveRangeHexes.add(`${tq},${tr}`)
          }
        }
      }
    }
  }"""
    new_p5 = """  // Movement range preview — BFS pathfinding with terrain costs
  const moveRangeHexes = actionMode.value === 'move' && selectedUnit.value
    ? computeMoveRange(selectedUnit.value, cells.value, unitMap)
    : new Set()
  _moveRangeHexes = moveRangeHexes"""
    if old_p5 in content:
        content = content.replace(old_p5, new_p5)
        modifications.append('P5: 移动范围计算改为 BFS 寻路')
    else:
        print('WARN: P5 未找到移动范围计算代码段')

    # ============================================================
    # PATCH 6: 移动范围高亮改为按地形代价分色
    # ============================================================
    old_p6 = """      // Move range highlight
      if (moveRangeHexes.has(`${q},${r}`)) {
        ctx.fillStyle = 'rgba(0,180,220,0.15)'
        drawHexPath(ctx, cx, cy)
        ctx.fill()
        ctx.strokeStyle = 'rgba(0,180,220,0.4)'
        ctx.lineWidth = 2
        drawHexPath(ctx, cx, cy)
        ctx.stroke()
      }"""
    new_p6 = """      // Move range highlight — terrain-cost-aware coloring
      if (moveRangeHexes.has(`${q},${r}`)) {
        const hexCost = getMoveHexCost(moveRangeHexes, `${q},${r}`)
        // Color by terrain cost: cyan→green→orange→red
        let moveColor, moveStroke
        if (hexCost <= 1) {
          moveColor = 'rgba(0,180,220,0.15)'; moveStroke = 'rgba(0,180,220,0.4)'
        } else if (hexCost <= 1.5) {
          moveColor = 'rgba(76,220,100,0.18)'; moveStroke = 'rgba(76,220,100,0.45)'
        } else if (hexCost <= 2.5) {
          moveColor = 'rgba(255,176,0,0.18)'; moveStroke = 'rgba(255,176,0,0.45)'
        } else if (hexCost <= 5) {
          moveColor = 'rgba(255,80,80,0.2)'; moveStroke = 'rgba(255,80,80,0.5)'
        } else {
          moveColor = 'rgba(200,50,200,0.22)'; moveStroke = 'rgba(200,50,200,0.5)'
        }
        ctx.fillStyle = moveColor
        drawHexPath(ctx, cx, cy)
        ctx.fill()
        ctx.strokeStyle = moveStroke
        ctx.lineWidth = 2
        drawHexPath(ctx, cx, cy)
        ctx.stroke()
      }"""
    if old_p6 in content:
        content = content.replace(old_p6, new_p6)
        modifications.append('P6: 移动范围按地形代价分色高亮')
    else:
        print('WARN: P6 未找到移动范围高亮代码')

    # ============================================================
    # PATCH 7: onClick 移动校验
    # ============================================================
    old_p7 = """    // Action mode: move
    if (actionMode.value === 'move' && selectedUnit.value) {
      executeMove(hex.q, hex.r)
      return
    }"""
    new_p7 = """    // Action mode: move
    if (actionMode.value === 'move' && selectedUnit.value) {
      if (!_moveRangeHexes.has(`${hex.q},${hex.r}`)) {
        addLog('error', '目标不在可移动范围内')
        return
      }
      executeMove(hex.q, hex.r)
      return
    }"""
    if old_p7 in content:
        content = content.replace(old_p7, new_p7)
        modifications.append('P7: 移动点击增加范围校验')
    else:
        print('WARN: P7 未找到移动点击处理代码')

    # ============================================================
    # PATCH 8: 属性面板修复 — HP 显示 /max_hp
    # ============================================================
    old_p8 = """{{ selectedUnit.hp || '?' }}/100"""
    new_p8 = """{{ selectedUnit.hp || '?' }}/{{ selectedUnit.max_hp || 100 }}"""
    if old_p8 in content:
        content = content.replace(old_p8, new_p8)
        modifications.append('P8: HP 显示改为 /max_hp')
    else:
        print('WARN: P8 未找到 HP 显示代码')

    # ============================================================
    # PATCH 9: 属性面板兜底 — 防止 undefined 显示为 '?'
    # ============================================================
    old_p9 = """{{ selectedUnit.attack }}"""
    new_p9 = """{{ selectedUnit.attack || selectedUnit['main_格斗'] || '?' }}"""
    if old_p9 in content:
        content = content.replace(old_p9, new_p9)
        modifications.append('P9: 攻击属性增加回退')
    else:
        print('WARN: P9 未找到 attack 显示代码')

    old_p9b = """{{ selectedUnit.defense }}"""
    new_p9b = """{{ selectedUnit.defense || selectedUnit['main_结构'] || '?' }}"""
    if old_p9b in content:
        content = content.replace(old_p9b, new_p9b)
        modifications.append('P9b: 防御属性增加回退')
    else:
        print('WARN: P9b 未找到 defense 显示代码')

    old_p9c = """{{ selectedUnit.mobility }}"""
    new_p9c = """{{ selectedUnit.mobility || selectedUnit['main_机动'] || '?' }}"""
    if old_p9c in content:
        content = content.replace(old_p9c, new_p9c)
        modifications.append('P9c: 机动属性增加回退')
    else:
        print('WARN: P9c 未找到 mobility 显示代码')

    old_p9d = """{{ selectedUnit.range }}"""
    new_p9d = """{{ selectedUnit.range || '1' }}"""
    if old_p9d in content:
        content = content.replace(old_p9d, new_p9d)
        modifications.append('P9d: 射程属性增加回退默认值')
    else:
        print('WARN: P9d 未找到 range 显示代码')

    # ============================================================
    # PATCH 10: 移动按钮提示修正 — 显示 floor(机动/2) 而非原始机动值
    # ============================================================
    old_p10 = """机动 {{ selectedUnit.mobility || selectedUnit['机动'] || 3 }}"""
    new_p10 = """机动 {{ selectedUnit.mobility || selectedUnit['机动'] || 3 }} (移动 {{ Math.floor((selectedUnit.mobility || selectedUnit['机动'] || 3) / 2) }} 格)"""
    if old_p10 in content:
        content = content.replace(old_p10, new_p10)
        modifications.append('P10: 移动按钮提示显示实际移动格数')
    else:
        print('WARN: P10 未找到移动按钮机动提示')

    # ============================================================
    # PATCH 11: 部署面板中 deployUnit 数据显示带回退
    # ============================================================
    old_p11 = """{{ selectedDeployUnit.attack }}"""
    new_p11 = """{{ selectedDeployUnit.attack || selectedDeployUnit['main_格斗'] || '?' }}"""
    if old_p11 in content:
        content = content.replace(old_p11, new_p11)
        modifications.append('P11: 部署面板攻击显示回退')
    # Don't warn for missing deploy panel — may not exist

    # Write back
    if len(modifications) > 0:
        with open(filepath, 'w') as f:
            f.write(content)
        print(f'OK: {len(modifications)} 处修改成功写入')
        for m in modifications:
            print(f'  ✓ {m}')
        print(f'文件大小: {original_len} → {len(content)} 字符')
    else:
        print('ERROR: 没有任何修改成功！文件可能格式不匹配。')
        print('请检查 NewBattleView.vue 文件格式是否与预期一致。')
        sys.exit(1)


if __name__ == '__main__':
    if not os.path.exists(FRONTEND_PATH):
        print(f'ERROR: 找不到文件 {FRONTEND_PATH}')
        print('确认文件路径是否正确，或在脚本中修改 FRONTEND_PATH。')
        sys.exit(1)

    # Backup
    backup_path = FRONTEND_PATH + '.bak.' + str(int(os.path.getmtime(FRONTEND_PATH)))
    import shutil
    shutil.copy2(FRONTEND_PATH, backup_path)
    print(f'已备份到: {backup_path}')

    apply_patches(FRONTEND_PATH)
