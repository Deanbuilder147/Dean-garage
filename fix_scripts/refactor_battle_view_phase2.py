#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
NewBattleView Phase 2: 从 .bak 提取业务逻辑，合并到重构后的文件。
"""
import re

CUR = '/root/original-project/frontend/src/views/NewBattleView.vue'
BAK = '/root/original-project/frontend/src/views/NewBattleView.vue.bak'

# 读 .bak
with open(BAK, 'r', encoding='utf-8') as f:
    bak_lines = f.readlines()

# 读当前文件
with open(CUR, 'r', encoding='utf-8') as f:
    cur_lines = f.readlines()

# 1. 当前文件有效内容: 去掉最后一行 ("// ===== Zoom (委托给 HexGridCanvas) =====")
#    找到最后一个非空非注释行
trim_idx = len(cur_lines)
for i in range(len(cur_lines) - 1, -1, -1):
    stripped = cur_lines[i].strip()
    if stripped and not stripped.startswith('// ===== Zoom'):
        trim_idx = i + 1
        break

print(f"当前文件: 移除末尾 {len(cur_lines) - trim_idx} 行空注释")

# 2. 从 .bak 提取业务逻辑 (line 1292-1777, 即 selectUnit 到 onMounted 之前)
#    注意: 0-indexed, 所以取 bak_lines[1291:1777]
business = ''.join(bak_lines[1291:1777])

# 3. 从 .bak 提取 onMounted + watch (line 1778-1842)
onmounted = ''.join(bak_lines[1777:1842])

# 4. 从 .bak 提取 CSS (line 1844-2801)
css = ''.join(bak_lines[1843:2801])

# 5. 替换所有 draw() → hexGrid.value?.redraw()
business = re.sub(r'\bdraw\b', 'hexGrid.value?.redraw', business)
onmounted = re.sub(r'\bdraw\b', 'hexGrid.value?.redraw', onmounted)

# 6. 注释掉 initCanvas 和 setupEvents 调用行
onmounted = onmounted.replace('  initCanvas()\n', '  // initCanvas() 已迁移至 HexGridCanvas 组件内部\n')
onmounted = onmounted.replace('  setupEvents()\n', '  // setupEvents() 已迁移至 HexGridCanvas 组件内部\n')

# 7. 构建 HexGridCanvas 事件处理器
handlers = '''

// ===== HexGridCanvas 事件处理器 =====
function findUnitAt(q, r) {
  return allUnits.value.find(u => u.q === q && u.r === r)
}

function onHexClick({ q, r }) {
  if (q < 0 || q >= gridWidth.value || r < 0 || r >= gridHeight.value) return
  if (isDeployPhase.value && selectedDeployUnit.value) { deployToHex(q, r); return }
  if (royroyDeployMode.value && selectedUnit.value) {
    const nKey = `${q},${r}`
    const neighbors = getHexNeighbors(selectedUnit.value.q, selectedUnit.value.r)
    const isAdjacent = neighbors.some(n => n.q === q && n.r === r)
    const isOccupied = allUnits.value.some(u => u.q === q && u.r === r)
    const cell = cells.value.find(c => c.q === q && c.r === r)
    const terrain = getTerrainDef(cell?.terrain || 'moon')
    if (isAdjacent && !isOccupied && terrain.cost < 99) {
      deployRoyroyAt(q, r)
    } else {
      addLog('error', isOccupied ? '该格已有单位' : '只能部署在相邻空格')
    }
    return
  }
  if (actionMode.value === 'move' && selectedUnit.value) { executeMove(q, r); return }
  const clickedUnit = findUnitAt(q, r)
  if (clickedUnit) {
    if (actionMode.value === 'tactical' && selectedUnit.value) {
      if (clickedUnit.id !== selectedUnit.value.id) {
        if (selectedAttackSkill.value) { executeSkillAttack(clickedUnit, selectedAttackSkill.value) }
        else { executeAttack(clickedUnit) }
        return
      }
    }
    selectUnit(clickedUnit)
    return
  }
  if (!actionMode.value) {
    const cell = cells.value.find(c => c.q === q && c.r === r)
    const t = cell?.terrain || 'moon'
    const def = getTerrainDef(t)
    terminalLogs.value.unshift(`// HEX ${formatCoord(q, r)} [${def.name}]`)
    if (terminalLogs.value.length > 5) terminalLogs.value.pop()
  }
}

function onHexHover({ q, r }) {
  if (q >= 0 && q < gridWidth.value && r >= 0 && r < gridHeight.value) {
    hoverCoord.value = formatCoord(q, r)
  } else {
    hoverCoord.value = ''
  }
}

function onHexContextMenu({ q, r }) {
  // 保留接口
}
'''

# 8. 组合
final = (
    ''.join(cur_lines[:trim_idx])
    + handlers
    + business
    + onmounted
    + css
)

# 9. 写回
with open(CUR, 'w', encoding='utf-8') as f:
    f.write(final)

print(f"Phase 2 完成: {len(final.splitlines())} 行 (原 {len(cur_lines)} 行)")
