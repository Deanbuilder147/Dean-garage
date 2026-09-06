#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
NewBattleView v3: 精确逐行重构，在行级别定位并替换。
策略: 用行号精确索引替换关键块，不依赖模糊的正则。
"""

CUR = '/root/original-project/frontend/src/views/NewBattleView.vue'
BAK = '/root/original-project/frontend/src/views/NewBattleView.vue.bak'

with open(BAK, 'r', encoding='utf-8') as f:
    bak = f.read()
    bak_lines = bak.split('\n')

# 用行号标记哪些行需要跳过（旧 Canvas DOM 元素）
# 已知结构 (行号来自之前 grep):
#   ~67: <!-- Canvas Area -->
#   ~68: <div class="game-canvas-sandbox" ref="canvasWrapper">
#   ~69: <div class="canvas-container" ref="canvasContainer">
#   ~70: <canvas ref="mapCanvas"></canvas>
#   ~71: </div>  (canvas-container)
#   ... map-legend ...
#   ~XX: </div>  <!-- end game-canvas-sandbox -->

# 更稳健的方法: 用 str.replace 做精确替换

# ===== 1. 模板: 替换 Canvas HTML 块 =====
old_template_block = '''      <!-- Canvas Area -->
      <div class="game-canvas-sandbox" ref="canvasWrapper">
        <div class="canvas-container" ref="canvasContainer">
          <canvas ref="mapCanvas"></canvas>
        </div>
        <!-- Legend -->
'''

new_template_block = '''      <!-- Canvas Area: HexGridCanvas 通用战棋渲染组件 -->
      <HexGridCanvas
        ref="hexGrid"
        mode="battle"
        :grid-width="gridWidth"
        :grid-height="gridHeight"
        :draw-fn="drawBattleScene"
        :show-coords="showCoords"
        @hex-click="onHexClick"
        @hex-hover="onHexHover"
        @hex-contextmenu="onHexContextMenu"
      >
        <template #overlay>
          <!-- Legend -->
'''

bak = bak.replace(old_template_block, new_template_block)

# Canvas 区域结束
old_template_end = '      </div> <!-- end game-canvas-sandbox -->'
new_template_end = '''        </template>
      </HexGridCanvas>'''
bak = bak.replace(old_template_end, new_template_end)

# ===== 2. 模板: 缩放按钮和百分比 =====
bak = bak.replace('@click="zoomIn()"', '@click="hexGrid?.zoomIn()"')
bak = bak.replace('@click="zoomOut()"', '@click="hexGrid?.zoomOut()"')
bak = bak.replace('@click="zoomReset()"', '@click="hexGrid?.zoomReset()"')

# 缩放百分比 - 可能有两种写法
bak = bak.replace('{{ Math.round(scale * 100) }}%', '{{ Math.round((hexGrid?.scale || 1) * 100) }}%')
bak = bak.replace('{{Math.round(scale*100)}}%', '{{ Math.round((hexGrid?.scale || 1) * 100) }}%')

# ===== 3. Script: 添加导入 =====
old_import = "from '../utils/hexUtils.js'\n"
new_import = "from '../utils/hexUtils.js'\nimport HexGridCanvas from '../components/HexGridCanvas.vue'\n"
bak = bak.replace(old_import, new_import)

# ===== 4. Script: ref 声明 =====
# 添加 hexGrid ref
bak = bak.replace('const battleState = ref(null)\n', 'const battleState = ref(null)\nconst hexGrid = ref(null)\n')

# 移除旧的 refs (精确文本)
bak = bak.replace('const canvasWrapper = ref(null)\n', '')
bak = bak.replace('const canvasContainer = ref(null)\n', '')
bak = bak.replace('const mapCanvas = ref(null)\n', '')

# ===== 5. Script: 替换 draw 函数签名为 drawBattleScene =====
old_draw_sig = 'function draw(hlQ = -1, hlR = -1) {'
new_draw_sig = 'function drawBattleScene(ctx, { hlQ = -1, hlR = -1 }) {'
bak = bak.replace(old_draw_sig, new_draw_sig)

# ===== 6. Script: 替换所有裸 draw() 调用 =====
import re
bak = re.sub(r'\bdraw\(\)', 'hexGrid.value?.redraw()', bak)
bak = re.sub(r'\bdraw\(hlQ,\s*hlR\)', 'hexGrid.value?.redraw()', bak)

# ===== 7. Script: 替换 canvas 事件绑定为 HexGridCanvas 处理器 =====
# 找到 setupEvents 函数并完全替换为事件处理器
# setupEvents 从 "function setupEvents() {" 到下一个 "}" 匹配的大括号

# 因为 setupEvents 是一个包含嵌套函数的大函数，我需要找到它的完整范围
# 策略: 找到 "function setupEvents() {" 行，然后找到该函数结束的行（通过缩进匹配），替换整个块

lines = bak.split('\n')
new_lines = []
i = 0
skip_until_outdent = False
skip_depth = 0

while i < len(lines):
    line = lines[i]
    
    # 检测 setupEvents 函数开始
    if line.strip() == 'function setupEvents() {' and not skip_until_outdent:
        # 找到这个函数结束
        depth = 0
        j = i + 1
        while j < len(lines):
            l = lines[j]
            depth += l.count('{') - l.count('}')
            if depth == 0:
                break
            j += 1
        # 插入 HexGridCanvas 事件处理器
        new_lines.extend([
            '',
            '// ===== HexGridCanvas 事件处理器 (替代原 setupEvents + 原始 Canvas 事件) =====',
            '',
            'function findUnitAt(q, r) {',
            '  return allUnits.value.find(u => u.q === q && u.r === r)',
            '}',
            '',
            'function onHexClick({ q, r }) {',
            '  if (q < 0 || q >= gridWidth.value || r < 0 || r >= gridHeight.value) return',
            '',
            '  // Deploy mode',
            '  if (isDeployPhase.value && selectedDeployUnit.value) { deployToHex(q, r); return }',
            '',
            '  // RoyRoy deploy mode',
            '  if (royroyDeployMode.value && selectedUnit.value) {',
            '    const nKey = `${q},${r}`',
            '    const neighbors = getHexNeighbors(selectedUnit.value.q, selectedUnit.value.r)',
            '    const isAdjacent = neighbors.some(n => n.q === q && n.r === r)',
            '    const isOccupied = allUnits.value.some(u => u.q === q && u.r === r)',
            '    const cell = cells.value.find(c => c.q === q && c.r === r)',
            '    const terrain = getTerrainDef(cell?.terrain || \'moon\')',
            '    if (isAdjacent && !isOccupied && terrain.cost < 99) {',
            '      deployRoyroyAt(q, r)',
            '    } else {',
            '      addLog(\'error\', isOccupied ? \'该格已有单位\' : \'只能部署在相邻空格\')',
            '    }',
            '    return',
            '  }',
            '',
            '  // Action mode: move',
            '  if (actionMode.value === \'move\' && selectedUnit.value) { executeMove(q, r); return }',
            '',
            '  // Check if clicked on a unit',
            '  const clickedUnit = findUnitAt(q, r)',
            '  if (clickedUnit) {',
            '    if (actionMode.value === \'tactical\' && selectedUnit.value) {',
            '      if (clickedUnit.id !== selectedUnit.value.id) {',
            '        if (selectedAttackSkill.value) { executeSkillAttack(clickedUnit, selectedAttackSkill.value) }',
            '        else { executeAttack(clickedUnit) }',
            '        return',
            '      }',
            '    }',
            '    selectUnit(clickedUnit)',
            '    return',
            '  }',
            '',
            '  // Clicked empty hex - show info',
            '  if (!actionMode.value) {',
            '    const cell = cells.value.find(c => c.q === q && c.r === r)',
            '    const t = cell?.terrain || \'moon\'',
            '    const def = getTerrainDef(t)',
            '    terminalLogs.value.unshift(`// HEX ${formatCoord(q, r)} [${def.name}]`)',
            '    if (terminalLogs.value.length > 5) terminalLogs.value.pop()',
            '  }',
            '}',
            '',
            'function onHexHover({ q, r }) {',
            '  if (q >= 0 && q < gridWidth.value && r >= 0 && r < gridHeight.value) {',
            '    hoverCoord.value = formatCoord(q, r)',
            '  } else {',
            '    hoverCoord.value = \'\'',
            '  }',
            '}',
            '',
            'function onHexContextMenu({ q, r }) {',
            '  // 保留接口',
            '}',
            '',
        ])
        i = j + 1
        continue

    new_lines.append(line)
    i += 1

bak = '\n'.join(new_lines)

# ===== 8. Script: 移除 initCanvas 函数 =====
# 找到 "function initCanvas() {" 并移除整个函数体
lines = bak.split('\n')
new_lines = []
i = 0
while i < len(lines):
    line = lines[i]
    if line.strip() == 'function initCanvas() {':
        depth = 0
        j = i + 1
        while j < len(lines):
            l = lines[j]
            depth += l.count('{') - l.count('}')
            if depth == 0:
                break
            j += 1
        i = j + 1
        continue
    new_lines.append(line)
    i += 1
bak = '\n'.join(new_lines)

# ===== 9. Script: 移除 getWorldPos + canvasPosToWorld + zoom 函数 + navigateTo =====
# 逐一精确删除
for func_name in ['getWorldPos', 'canvasPosToWorld', 'zoomIn', 'zoomOut', 'zoomReset', 'navigateTo']:
    lines = bak.split('\n')
    new_lines = []
    i = 0
    while i < len(lines):
        line = lines[i]
        # 匹配 "function funcName(" 
        if f'function {func_name}(' in line:
            depth = 0
            j = i + 1
            while j < len(lines):
                l = lines[j]
                depth += l.count('{') - l.count('}')
                if depth == 0:
                    break
                j += 1
            i = j + 1
            continue
        new_lines.append(line)
        i += 1
    bak = '\n'.join(new_lines)

# ===== 10. Script: 注释掉 onMounted 中的 initCanvas/setupEvents 调用 =====
bak = bak.replace(
    '  await nextTick()\n  initCanvas()',
    '  // Canvas 初始化已迁移至 HexGridCanvas 组件内部\n  // initCanvas()'
)
bak = bak.replace(
    '  await nextTick()\n  setupEvents()',
    '  // 事件处理已迁移至 HexGridCanvas 组件 (hex-click/hex-hover emit)'
)

# ===== 11. Script: 修复 selectUnitById 中的 mapCanvas/offsetX/offsetY/scale 引用 =====
# 使用 hexGrid 的 expose 属性
old_select_by_id = '''function selectUnitById(unit) {
  if (unit.q !== undefined) {
    selectUnit(unit)
    // Center view on unit
    const { x, y } = hexToPixel(unit.q, unit.r)
    const canvas = mapCanvas.value
    if (canvas) {
      const rect = canvas.getBoundingClientRect()
      offsetX.value = rect.width / 2 - (x + HEX_APOTHEM) * scale.value
      offsetY.value = rect.height / 2 - (y + HEX_RADIUS) * scale.value
    }
  }
  hexGrid.value?.redraw()
}'''

new_select_by_id = '''function selectUnitById(unit) {
  if (unit.q !== undefined) {
    selectUnit(unit)
    // Center view on unit (via HexGridCanvas)
    const hg = hexGrid.value
    if (hg?.mapCanvas) {
      const { x, y } = hexToPixel(unit.q, unit.r)
      const canvas = hg.mapCanvas
      const rect = canvas.getBoundingClientRect()
      hg.offsetX.value = rect.width / 2 - (x + HEX_APOTHEM) * hg.scale.value
      hg.offsetY.value = rect.height / 2 - (y + HEX_RADIUS) * hg.scale.value
    }
  }
  hexGrid.value?.redraw()
}'''

bak = bak.replace(old_select_by_id, new_select_by_id)

# ===== 12. 写入结果 =====
with open(CUR, 'w', encoding='utf-8') as f:
    f.write(bak)

print(f'v3 重构完成: {len(bak.splitlines())} 行')
