#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
NewBattleView 完整重构: 从原始 .bak 一步到 HexGridCanvas 架构。
"""
import re
from pathlib import Path

BAK = Path('/root/original-project/frontend/src/views/NewBattleView.vue.bak')
OUT = Path('/root/original-project/frontend/src/views/NewBattleView.vue')

with open(BAK, 'r', encoding='utf-8') as f:
    text = f.read()

# ================================================================
# 1. TEMPLATE: 替换 Canvas 区域为 HexGridCanvas 组件
# ================================================================

# 1a. 替换 Canvas HTML 块 (game-canvas-sandbox 区域)
old_canvas_block = r'''      <!-- Canvas Area -->
      <div class="game-canvas-sandbox" ref="canvasWrapper">
        <div class="canvas-container" ref="canvasContainer">
          <canvas ref="mapCanvas"></canvas>
        </div>
        <!-- Legend -->
        <div class="map-legend">'''

new_canvas_block = r'''      <!-- Canvas Area: HexGridCanvas 通用战棋渲染组件 -->
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
          <div class="map-legend">'''

text = text.replace(old_canvas_block, new_canvas_block)

# 1b. 替换 Canvas 区域结束标记
old_canvas_end = r'''      </div> <!-- end game-canvas-sandbox -->
'''
new_canvas_end = r'''        </template>
      </HexGridCanvas>
'''
text = text.replace(old_canvas_end, new_canvas_end)

# 1c. 替换缩放百分比显示
text = text.replace(
    '{{ Math.round(scale * 100) }}%',
    '{{ Math.round((hexGrid?.scale || 1) * 100) }}%'
)

# 1d. 替换缩放按钮调用
text = text.replace('@click="zoomIn()"', '@click="hexGrid?.zoomIn()"')
text = text.replace('@click="zoomOut()"', '@click="hexGrid?.zoomOut()"')
text = text.replace('@click="zoomReset()"', '@click="hexGrid?.zoomReset()"')

# ================================================================
# 2. SCRIPT: 导入、状态、函数转换
# ================================================================

# 2a. 添加 HexGridCanvas 导入
import_line = "\nimport HexGridCanvas from '../components/HexGridCanvas.vue'\n"
# 在 hexUtils 导入后添加
text = text.replace(
    "from '../utils/hexUtils.js'\n",
    "from '../utils/hexUtils.js'\n" + "import HexGridCanvas from '../components/HexGridCanvas.vue'\n"
)

# 2b. 移除旧的 ref 声明 (canvasWrapper, canvasContainer, mapCanvas, scale, offsetX, offsetY)
text = re.sub(r"const canvasWrapper = ref\(null\)\n", "", text)
text = re.sub(r"const canvasContainer = ref\(null\)\n", "", text)
text = re.sub(r"const mapCanvas = ref\(null\)\n", "", text)

# 匹配各种形式的 scale/offset 声明
for old_ref in [
    r"const scale = ref\([\d.]*\)\n",
    r"const offsetX = ref\([\d.-]*\)\n",
    r"const offsetY = ref\([\d.-]*\)\n",
]:
    text = re.sub(old_ref, "", text)

# 2c. 添加 hexGrid ref (在 battleState 之后)
text = text.replace(
    "const battleState = ref(null)\n",
    "const battleState = ref(null)\nconst hexGrid = ref(null)\n"
)

# 2d. 移除 initCanvas 函数
init_pattern = r'// ===== Canvas Init =====\nfunction initCanvas\(\) \{[^}]*?\n\}\n'
text = re.sub(init_pattern, '', text, flags=re.DOTALL)

# 尝试另一种 initCanvas 形式
init_pattern2 = r'function initCanvas\(\) \{[^}]*?\n\}'
text = re.sub(init_pattern2, '', text, flags=re.DOTALL)

# 2e. 移除 setupEvents 函数到 getWorldPos 前
# setupEvents 从 "function setupEvents() {" 到 "function getWorldPos(" 之前
setup_pattern = r'function setupEvents\(\) \{.*?(?=function getWorldPos\()'
text = re.sub(setup_pattern, '', text, flags=re.DOTALL)

# 2f. 移除 getWorldPos, canvasPosToWorld, zoomIn, zoomOut, zoomReset, navigateTo
for func in ['getWorldPos', 'canvasPosToWorld', 'zoomIn', 'zoomOut', 'zoomReset', 'navigateTo']:
    pattern = rf'// =====.*?=====\nfunction {func}\(.*?(?=// ====|function selectUnit|// ===== Unit|\n\n// =====)'
    text = re.sub(pattern, '', text, flags=re.DOTALL)
    # 更简单的模式
    pattern2 = rf'function {func}\(.*?(?=\n\nfunction [a-z]|\n\n// =====)'
    text = re.sub(pattern2, '', text, flags=re.DOTALL)

# 2g. 转换 draw 函数为 drawBattleScene
# 原 draw 函数签名: function draw(hlQ = -1, hlR = -1) {
text = re.sub(
    r'function draw\(hlQ\s*=\s*-1,\s*hlR\s*=\s*-1\)\s*\{',
    'function drawBattleScene(ctx, { hlQ = -1, hlR = -1 }) {',
    text
)

# 2h. 添加 computeDrawData、drawTerrain、drawUnits 包装说明
# (draw 函数体内容已足够，不需要拆分——保持原样但添加注释)

# 2i. 替换 onMounted 中的 initCanvas/setupEvents 调用
text = text.replace('  await nextTick()\n  initCanvas()', '  // initCanvas() 已迁移至 HexGridCanvas 组件内部')
text = text.replace('\n  initCanvas()\n', '\n  // initCanvas() 已迁移至 HexGridCanvas 组件内部\n')
text = text.replace('  await nextTick()\n  setupEvents()', '')
text = text.replace('\n  setupEvents()\n', '\n  // setupEvents() 已迁移至 HexGridCanvas 组件内部\n')

# 2j. 添加事件处理器函数 (在 // ===== Unit Selection ===== 之前)
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

text = text.replace('\n// ===== Unit Selection =====', handlers + '// ===== Unit Selection =====')

# 2k. 替换所有剩余的 draw() 调用为 hexGrid.value?.redraw()
text = re.sub(r'\bdraw\(\)', 'hexGrid.value?.redraw()', text)
text = re.sub(r'\bdraw\(hlQ,\s*hlR\)', 'hexGrid.value?.redraw()', text)

# ================================================================
# 3. CSS: 移除旧 canvas 相关样式
# ================================================================

# 移除 game-canvas-sandbox 的样式块
text = re.sub(
    r'/\* Canvas Sandbox [^*]*\*/\n\.game-canvas-sandbox \{[^}]*\}\n',
    '',
    text
)

# 移除 canvas-container 样式
text = re.sub(
    r'\.canvas-container \{[^}]*\}\n',
    '',
    text
)

# 移除 canvas 标签选择器样式
text = re.sub(
    r'canvas \{[\s\S]*?\}\n',
    '',
    text
)

# ================================================================
# 4. 清理多余空行
# ================================================================
text = re.sub(r'\n{4,}', '\n\n\n', text)

with open(OUT, 'w', encoding='utf-8') as f:
    f.write(text)

print(f"完整重构完成: {len(text.splitlines())} 行")
