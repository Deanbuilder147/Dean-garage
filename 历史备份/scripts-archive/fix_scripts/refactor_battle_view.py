#!/usr/bin/env python3
"""
重构 NewBattleView.vue：集成 HexGridCanvas.vue 通用组件
- 剔除 Canvas 初始化、事件绑定、拖拽/缩放代码
- 拆分 draw() → drawBattleScene / drawTerrain / drawUnits / drawRoyRoys
- 所有 draw() 调用 → hexGrid.value?.redraw()
- 统一缩放步进委托给 HexGridCanvas 组件
"""
import re

ORIGINAL_PATH = '/root/original-project/frontend/src/views/NewBattleView.vue'
BACKUP_PATH = '/root/original-project/frontend/src/views/NewBattleView.vue.bak'

with open(ORIGINAL_PATH, 'r', encoding='utf-8') as f:
    content = f.read()

# 先备份
with open(BACKUP_PATH, 'w', encoding='utf-8') as f:
    f.write(content)

# ================================================================
# 1. 添加 HexGridCanvas import
# ================================================================
content = content.replace(
    "from '../utils/hexUtils.js'",
    "from '../utils/hexUtils.js'\nimport HexGridCanvas from '../components/HexGridCanvas.vue'",
    1  # 只替换第一次出现
)

# ================================================================
# 2. 模板：替换 Canvas 区域为 HexGridCanvas 组件
# ================================================================
old_canvas_area = '''      <!-- Canvas Area -->
      <div class="game-canvas-sandbox" ref="canvasWrapper">
        <div class="canvas-container" ref="canvasContainer">
          <canvas ref="mapCanvas"></canvas>
        </div>
        <!-- Legend -->
        <div class="map-legend">
          <span v-for="(info, key) in usedTerrains" :key="key" class="legend-item">
            <i class="legend-swatch" :style="{ background: info.color }"></i>{{ info.name }}
          </span>
        </div>
      </div>'''

new_canvas_area = '''      <!-- Canvas Area: HexGridCanvas 通用战棋渲染组件 -->
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
          <div class="map-legend">
            <span v-for="(info, key) in usedTerrains" :key="key" class="legend-item">
              <i class="legend-swatch" :style="{ background: info.color }"></i>{{ info.name }}
            </span>
          </div>
        </template>
      </HexGridCanvas>'''

content = content.replace(old_canvas_area, new_canvas_area)

# ================================================================
# 3. 模板 Toolbar：更新缩放按钮和比例显示
# ================================================================
content = content.replace(
    '<button class="toolbar-btn" @click="zoomIn">放大 +</button>',
    '<button class="toolbar-btn" @click="hexGrid?.zoomIn()">放大 +</button>'
)
content = content.replace(
    '<button class="toolbar-btn" @click="zoomOut">缩小 -</button>',
    '<button class="toolbar-btn" @click="hexGrid?.zoomOut()">缩小 -</button>'
)
content = content.replace(
    '<button class="toolbar-btn" @click="zoomReset">1:1</button>',
    '<button class="toolbar-btn" @click="hexGrid?.zoomReset()">1:1</button>'
)
content = content.replace(
    '<span class="toolbar-info">缩放: {{ Math.round(scale * 100) }}% | 悬停: {{ hoverCoord || \'-\' }}</span>',
    '<span class="toolbar-info">缩放: {{ Math.round((hexGrid?.scale || 1) * 100) }}% | 悬停: {{ hoverCoord || \'-\' }}</span>'
)

# ================================================================
# 4. 状态变量：移除 scale/offsetX/offsetY/canvasWrapper/canvasContainer/mapCanvas，添加 hexGrid
# ================================================================
# 移除 scale ref
content = content.replace("const scale = ref(1)\n", "")
# 移除 offsetX ref
content = content.replace("const offsetX = ref(60)\n", "")
# 移除 offsetY ref
content = content.replace("const offsetY = ref(60)\n", "")
# 移除 canvasWrapper ref
content = content.replace("const canvasWrapper = ref(null)\n", "")
# 移除 canvasContainer ref
content = content.replace("const canvasContainer = ref(null)\n", "")
# 移除 mapCanvas ref
content = content.replace("const mapCanvas = ref(null)\n", "")
# 添加 hexGrid ref（放在 hoverCoord 之后）
content = content.replace(
    "const hoverCoord = ref('')\n",
    "const hoverCoord = ref('')\nconst hexGrid = ref(null)\n"
)

# ================================================================
# 5. Hex Config：移除 offsetFactor
# ================================================================
content = content.replace("const offsetFactor = DEFAULT_OFFSET_FACTOR\n", "")

# ================================================================
# 6. 移除 initCanvas、centerGrid，替换 draw() 为子函数
# ================================================================
# 找到 "// ===== Canvas Rendering =====" 区块的起止位置
init_canvas_start = content.find('// ===== Canvas Rendering =====')
# 找到 "// ===== Event Handling =====" 区块开始
event_handling_start = content.find('// ===== Event Handling =====')
# 找到 event handling 区块结束（setupEvents 闭包 "}" 之后，getWorldPos、canvasPosToWorld 之后到 Zoom 前）
zoom_start = content.find('// ===== Zoom =====')

if init_canvas_start != -1 and zoom_start != -1:
    # 保留 Action Log 部分和 hex math 包装函数不变
    # 替换从 initCanvas 开始到 Event Handling 结束 → 新 drawBattleScene + onHexClick
    new_canvas_section = '''// ===== Canvas Rendering (沙盒化: 由 HexGridCanvas 驱动 CTM，父层只提供 drawFn) =====

/**
 * drawBattleScene — 作为 drawFn prop 注入 HexGridCanvas
 * ctx 已应用 CTM (translate → scale → ISO shear)，直接绘制即可
 * { hlQ, hlR } 由 HexGridCanvas 内部 hover 逻辑提供
 */
function drawBattleScene(ctx, { hlQ, hlR }) {
  // 数据准备：创建 cellMap / unitMap / BFS 范围计算
  const data = computeDrawData()

  // 子函数：地形 & 六角格
  drawTerrain(ctx, hlQ, hlR, data)
  // 子函数：单位棋子 & RoyRoy 标记
  drawUnits(ctx, data)
}

/** 计算每一帧绘制所需的数据（闭包访问 Vue refs） */
function computeDrawData() {
  const cellMap = {}
  cells.value.forEach(c => { cellMap[`${c.q},${c.r}`] = c })

  const unitMap = {}
  allUnits.value.forEach(u => {
    if (u.q !== undefined) unitMap[`${u.q},${u.r}`] = u
  })

  // Movement range BFS
  const moveRangeHexes = new Set()
  if (actionMode.value === 'move' && selectedUnit.value) {
    const su = selectedUnit.value
    const rawMob = su.mobility || su['机动'] || 3
    const movePoints = Math.floor(rawMob / 2) || 1
    const startKey = `${su.q},${su.r}`
    const visited = new Set([startKey])
    const queue = [{ q: su.q, r: su.r, cost: 0 }]
    while (queue.length > 0) {
      const cur = queue.shift()
      for (const n of getHexNeighbors(cur.q, cur.r)) {
        const nKey = `${n.q},${n.r}`
        if (visited.has(nKey)) continue
        if (n.q < 0 || n.q >= gridWidth.value || n.r < 0 || n.r >= gridHeight.value) continue
        const cell = cellMap[nKey]
        const terrain = getTerrainDef(cell?.terrain || 'moon')
        const stepCost = terrain.cost || 1
        const newCost = cur.cost + stepCost
        if (newCost <= movePoints) {
          visited.add(nKey)
          queue.push({ q: n.q, r: n.r, cost: newCost })
          if (!unitMap[nKey]) {
            moveRangeHexes.add(nKey)
          }
        }
      }
    }
  }

  // RoyRoy deployable hexes
  const royroyHexes = new Set()
  if (royroyDeployMode.value && selectedUnit.value) {
    const su = selectedUnit.value
    const neighbors = getHexNeighbors(su.q, su.r)
    neighbors.forEach(n => {
      const nKey = `${n.q},${n.r}`
      if (n.q >= 0 && n.q < gridWidth.value && n.r >= 0 && n.r < gridHeight.value) {
        const cell = cellMap[nKey]
        const terrain = getTerrainDef(cell?.terrain || 'moon')
        if (terrain.cost < 99 && !unitMap[nKey]) {
          royroyHexes.add(nKey)
        }
      }
    })
  }

  // Skill/Tactical range preview
  const skillRangeHexes = new Set()
  const validTargets = new Set()
  if (actionMode.value === 'tactical' && selectedUnit.value && !royroyDeployMode.value) {
    const su = selectedUnit.value
    const range = getSkillRange(selectedAttackSkill.value)
    const startKey = `${su.q},${su.r}`
    const visited = new Set([startKey])
    const queue = [{ q: su.q, r: su.r, dist: 0 }]
    while (queue.length > 0) {
      const cur = queue.shift()
      if (cur.dist >= range) continue
      for (const n of getHexNeighbors(cur.q, cur.r)) {
        const nKey = `${n.q},${n.r}`
        if (visited.has(nKey)) continue
        if (n.q < 0 || n.q >= gridWidth.value || n.r < 0 || n.r >= gridHeight.value) continue
        visited.add(nKey)
        queue.push({ q: n.q, r: n.r, dist: cur.dist + 1 })
        if (cur.dist + 1 <= range) {
          skillRangeHexes.add(nKey)
        }
      }
    }
    // Valid targets (enemy units in range)
    allUnits.value.forEach(u => {
      if (u.q === undefined) return
      const tKey = `${u.q},${u.r}`
      if (skillRangeHexes.has(tKey)) {
        const skill = selectedAttackSkill.value
        if (!skill || skill.targetType === 'enemy' || !skill.targetType) {
          if (!skill && u.faction === su.faction) return
          if (skill && skill.targetType === 'ally' && u.faction !== su.faction) return
          if (skill && skill.targetType === 'enemy' && u.faction === su.faction) return
          validTargets.add(tKey)
        }
      }
    })
  }

  return { cellMap, unitMap, moveRangeHexes, royroyHexes, skillRangeHexes, validTargets }
}

/** drawTerrain — 绘制地形六角格网格、范围高亮、悬停高亮 */
function drawTerrain(ctx, hlQ, hlR, data) {
  const { cellMap, moveRangeHexes, royroyHexes, skillRangeHexes, validTargets } = data

  for (let r = 0; r < gridHeight.value; r++) {
    for (let q = 0; q < gridWidth.value; q++) {
      const { flatX, flatY } = pointyTopCenter(q, r, HEX_RADIUS, spacingH, spacingV)
      const cx = flatX
      const cy = flatY

      // Terrain fill
      const cell = cellMap[`${q},${r}`]
      const tid = cell?.terrain || 'moon'
      const terrain = getTerrainDef(tid)
      ctx.fillStyle = hexToRGBA(terrain.color, 0.3)
      drawHexPath(ctx, cx, cy)
      ctx.fill()

      // Border
      ctx.strokeStyle = 'rgba(255,255,255,0.15)'
      ctx.lineWidth = 1
      drawHexPath(ctx, cx, cy)
      ctx.stroke()

      // Coord label
      if (showCoords.value) {
        ctx.fillStyle = 'rgba(255,255,255,0.55)'
        ctx.font = 'bold 14px monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillText(formatCoord(q, r), cx, cy - 2)
      }

      // Move range highlight
      if (moveRangeHexes.has(`${q},${r}`)) {
        ctx.fillStyle = 'rgba(0,180,220,0.15)'
        drawHexPath(ctx, cx, cy)
        ctx.fill()
        ctx.strokeStyle = 'rgba(0,180,220,0.4)'
        ctx.lineWidth = 2
        drawHexPath(ctx, cx, cy)
        ctx.stroke()
      }

      // RoyRoy deploy highlight
      const hexKey = `${q},${r}`
      if (royroyHexes && royroyHexes.has(hexKey)) {
        ctx.fillStyle = 'rgba(156,39,176,0.2)'
        drawHexPath(ctx, cx, cy)
        ctx.fill()
        ctx.strokeStyle = 'rgba(156,39,176,0.6)'
        ctx.lineWidth = 2.5
        ctx.setLineDash([4, 3])
        drawHexPath(ctx, cx, cy)
        ctx.stroke()
        ctx.setLineDash([])
        // Diamond icon
        ctx.fillStyle = 'rgba(206,147,216,0.9)'
        ctx.font = '14px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('◇', cx, cy)
      }

      // Skill range highlight
      if (skillRangeHexes && skillRangeHexes.has(hexKey)) {
        const isTarget = typeof validTargets !== 'undefined' && validTargets && validTargets.has(hexKey)
        if (isTarget) {
          ctx.fillStyle = 'rgba(255,77,77,0.2)'
          drawHexPath(ctx, cx, cy)
          ctx.fill()
          ctx.strokeStyle = 'rgba(255,77,77,0.6)'
          ctx.lineWidth = 2.5
          drawHexPath(ctx, cx, cy)
          ctx.stroke()
          ctx.fillStyle = 'rgba(255,77,77,0.8)'
          ctx.font = '14px sans-serif'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText('⊕', cx, cy)
        } else {
          ctx.fillStyle = 'rgba(255,176,0,0.08)'
          drawHexPath(ctx, cx, cy)
          ctx.fill()
          ctx.strokeStyle = 'rgba(255,176,0,0.3)'
          ctx.lineWidth = 1.5
          drawHexPath(ctx, cx, cy)
          ctx.stroke()
        }
      }

      // Highlight hovered
      if (hlQ === q && hlR === r) {
        ctx.strokeStyle = isDeployPhase.value && selectedDeployUnit.value ? '#ffb000'
          : actionMode.value ? '#00b4dc' : '#ff9800'
        ctx.lineWidth = 3
        drawHexPath(ctx, cx, cy)
        ctx.stroke()
        if (actionMode.value && selectedUnit.value) {
          ctx.fillStyle = 'rgba(0,180,220,0.15)'
          drawHexPath(ctx, cx, cy)
          ctx.fill()
        }
      }
    }
  }
}

/** drawUnits — 绘制单位棋子（含 RoyRoy 标记），按 Y 轴排序保证 isometric 遮挡正确 */
function drawUnits(ctx, data) {
  const { unitMap } = data

  // Draw units (sorted by flatY for correct iso layering: back → front)
  const sortedUnits = [...allUnits.value]
    .filter(u => u.q !== undefined)
    .sort((a, b) => {
      const { flatY: ay } = pointyTopCenter(a.q, a.r, HEX_RADIUS, spacingH, spacingV)
      const { flatY: by } = pointyTopCenter(b.q, b.r, HEX_RADIUS, spacingH, spacingV)
      return ay - by
    })
  sortedUnits.forEach(unit => {
    if (unit.q === undefined) return
    const { flatX, flatY } = pointyTopCenter(unit.q, unit.r, HEX_RADIUS, spacingH, spacingV)
    const cx = flatX
    const cy = flatY
    const isSelected = selectedUnit.value?.id === unit.id
    const fc = getFactionColor(unit.faction)

    const isConcealed = unit.concealed === true

    const imgUrl = unit.main_image_url
    if (imgUrl && !unitImageCache[unit.id]) {
      const img = new Image()
      img.src = imgUrl
      unitImageCache[unit.id] = img
    }
    const unitImg = imgUrl ? unitImageCache[unit.id] : null
    const hasImage = unitImg && unitImg.complete && unitImg.naturalWidth > 0

    const tokenRadius = HEX_RADIUS * 0.4

    if (hasImage && !isConcealed) {
      ctx.save()
      ctx.beginPath()
      ctx.arc(cx, cy, tokenRadius, 0, Math.PI * 2)
      ctx.clip()
      const imgW = tokenRadius * 2
      ctx.drawImage(unitImg, cx - imgW/2, cy - imgW/2, imgW, imgW)
      ctx.restore()

      ctx.beginPath()
      ctx.arc(cx, cy, tokenRadius, 0, Math.PI * 2)
      ctx.strokeStyle = isSelected ? '#ffffff' : fc
      ctx.lineWidth = isSelected ? 3.5 : 2.5
      ctx.stroke()
    } else {
      ctx.beginPath()
      ctx.arc(cx, cy, tokenRadius, 0, Math.PI * 2)
      ctx.fillStyle = isConcealed ? hexToRGBA(fc, 0.15) : hexToRGBA(fc, 0.45)
      ctx.fill()
      ctx.strokeStyle = isConcealed && !isSelected ? hexToRGBA(fc, 0.3) : (isSelected ? '#ffffff' : fc)
      ctx.lineWidth = isSelected ? 3.5 : 2.5
      if (isConcealed && !isSelected) {
        ctx.setLineDash([3, 4])
      }
      ctx.stroke()
      ctx.setLineDash([])

      const letter = (unit.name || 'U')[0]
      ctx.fillStyle = fc
      ctx.font = 'bold 16px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(letter, cx, cy - 1)
    }

    if (isConcealed) {
      ctx.beginPath()
      ctx.arc(cx, cy - HEX_RADIUS * 0.33, 2.5, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(0,180,220,0.7)'
      ctx.fill()
    }

    if (isSelected) {
      ctx.beginPath()
      ctx.arc(cx, cy, HEX_RADIUS * 0.5, 0, Math.PI * 2)
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 2
      ctx.setLineDash([4, 3])
      ctx.stroke()
      ctx.setLineDash([])
    }

    // HP bar
    const hpPct = Math.max(0, (unit.hp || 100) / 100)
    const barW = HEX_RADIUS * 0.6
    const barH = 3
    const barY = cy + HEX_RADIUS * 0.3
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillRect(cx - barW/2, barY, barW, barH)
    ctx.fillStyle = hpPct > 0.5 ? '#13ff43' : hpPct > 0.25 ? '#ffb000' : '#ff4d4d'
    ctx.fillRect(cx - barW/2, barY, barW * hpPct, barH)
  })

  // Draw deployed RoyRoy markers (sorted by flatY for correct iso layering)
  const sortedRoyUnits = [...allUnits.value]
    .filter(u => u.royroy_deployed && u.royroy_q !== undefined && u.royroy_r !== undefined)
    .sort((a, b) => {
      const { flatY: ay } = pointyTopCenter(a.royroy_q, a.royroy_r, HEX_RADIUS, spacingH, spacingV)
      const { flatY: by } = pointyTopCenter(b.royroy_q, b.royroy_r, HEX_RADIUS, spacingH, spacingV)
      return ay - by
    })
  sortedRoyUnits.forEach(unit => {
    if (!unit.royroy_deployed || unit.royroy_q === undefined || unit.royroy_r === undefined) return
    const { flatX: rfx, flatY: rfy } = pointyTopCenter(unit.royroy_q, unit.royroy_r, HEX_RADIUS, spacingH, spacingV)
    const rcx = rfx
    const rcy = rfy

    ctx.beginPath()
    ctx.arc(rcx, rcy, HEX_RADIUS * 0.28, 0, Math.PI * 2)
    ctx.fillStyle = "rgba(255, 180, 0, 0.35)"
    ctx.fill()
    ctx.strokeStyle = "rgba(255, 180, 0, 0.8)"
    ctx.lineWidth = 2
    ctx.stroke()

    ctx.fillStyle = "#ffb000"
    ctx.font = "bold 14px monospace"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText("R", rcx, rcy)
  })
}

'''

    # 替换: Canvas Rendering 开始 → Event Handling 结束 → Zoom 之前
    content = content[:init_canvas_start] + new_canvas_section + '\n// ===== Zoom (委托给 HexGridCanvas) =====\n'

# ================================================================
# 7. 移除 setupEvents / getWorldPos / canvasPosToWorld，替换为 onHexClick + onHexHover
# ================================================================

# 找到 "// ===== Event Handling =====" 到 "// ===== Zoom =====" 之间的内容并删除
evt_start = content.find('// ===== Event Handling =====')
# 找到 // ===== Zoom ===== (委托给 HexGridCanvas) 之后的部分
zoom_delegated = content.find('// ===== Zoom (委托给 HexGridCanvas) =====')

if evt_start != -1 and zoom_delegated != -1:
    # 构建新的点击处理代码
    new_event_code = '''
// ===== 六角格交互事件（来自 HexGridCanvas 组件 emit）=====

function findUnitAt(q, r) {
  return allUnits.value.find(u => u.q === q && u.r === r)
}

/** hex-click: HexGridCanvas 左键点击事件 */
function onHexClick({ q, r, event }) {
  // Deploy mode
  if (isDeployPhase.value && selectedDeployUnit.value) {
    deployToHex(q, r)
    return
  }

  // RoyRoy deploy mode
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

  // Action mode: move
  if (actionMode.value === 'move' && selectedUnit.value) {
    executeMove(q, r)
    return
  }

  // Check if clicked on a unit
  const clickedUnit = findUnitAt(q, r)
  if (clickedUnit) {
    if (actionMode.value === 'tactical' && selectedUnit.value) {
      if (clickedUnit.id !== selectedUnit.value.id) {
        if (selectedAttackSkill.value) {
          executeSkillAttack(clickedUnit, selectedAttackSkill.value)
        } else {
          executeAttack(clickedUnit)
        }
        return
      }
    }
    selectUnit(clickedUnit)
    return
  }

  // Clicked empty hex - show info
  if (!actionMode.value) {
    const cell = cells.value.find(c => c.q === q && c.r === r)
    const t = cell?.terrain || 'moon'
    const def = getTerrainDef(t)
    terminalLogs.value.unshift(`// HEX ${formatCoord(q, r)} [${def.name}]`)
    if (terminalLogs.value.length > 5) terminalLogs.value.pop()
  }
}

/** hex-hover: HexGridCanvas 鼠标悬停事件 */
function onHexHover({ q, r }) {
  hoverCoord.value = formatCoord(q, r)
}

/** hex-contextmenu: HexGridCanvas 右键点击事件 */
function onHexContextMenu({ q, r, event }) {
  // 预留扩展：右键菜单
}

'''

    # 删除旧的 event handling 代码（setupEvents 到 canvasPosToWorld 结束）
    content = content[:evt_start] + new_event_code + content[zoom_delegated:]

# ================================================================
# 8. 移除旧的 Zoom 函数（被 HexGridCanvas 替代）
# ================================================================
# 删除从 "// ===== Zoom (委托给 HexGridCanvas) =====" 到 zoomIn/Out/Reset 函数结束
# 这些函数本身已经不在了（已被替换），但还需要清理残留的 getWorldPos / canvasPosToWorld

# 删除任何残留的 zoomIn/zoomOut/zoomReset 定义
content = re.sub(
    r'function zoomIn\(\) \{[\s\S]*?^function selectUnit\(',
    'function selectUnit(',
    content,
    flags=re.MULTILINE
)

# 如果上面没匹配到，尝试匹配到 navigateTo
content = re.sub(
    r'function zoomIn\(\) \{[\s\S]*?^function navigateTo\(',
    'function navigateTo(',
    content,
    flags=re.MULTILINE
)

# ================================================================
# 9. 移除 getWorldPos / canvasPosToWorld 残留
# ================================================================
content = re.sub(
    r'function getWorldPos\(e\) \{[\s\S]*?\n\}\n',
    '',
    content
)
content = re.sub(
    r'\/\*\* canvas 像素坐标 → 世界坐标 \*\/\nfunction canvasPosToWorld\(cx, cy\) \{[\s\S]*?\n\}\n',
    '',
    content
)

# ================================================================
# 10. 修复 selectUnitById（不再直接操作 offsetX/offsetY）
# ================================================================
content = content.replace(
    '''function selectUnitById(unit) {
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
  draw()
}''',
    '''function selectUnitById(unit) {
  if (unit.q !== undefined) {
    selectUnit(unit)
    // Center view on unit via HexGridCanvas zoom/offset
    if (hexGrid.value) {
      const { x, y } = hexToPixel(unit.q, unit.r)
      const isoCenterX = x * ISO.scaleX + y * ISO.shearX
      const isoCenterY = x * ISO.shearY + y * ISO.scaleY
      const canvas = hexGrid.value.mapCanvas
      if (canvas) {
        hexGrid.value.offsetX = canvas.width / 2 - isoCenterX * hexGrid.value.scale
        hexGrid.value.offsetY = canvas.height / 2 - isoCenterY * hexGrid.value.scale
      }
    }
  }
  if (hexGrid.value) hexGrid.value.redraw()
}'''
)

# ================================================================
# 11. 替换所有单独的 draw(...) 和 draw() 调用为 hexGrid.value?.redraw()
# ================================================================
# 替换 draw(hlQ, hlR) 模式
content = re.sub(r'\bdraw\((\w+),\s*(\w+)\)', r'hexGrid.value?.redraw()', content)
# 替换 draw() 模式
content = re.sub(r'\bdraw\(\)', 'hexGrid.value?.redraw()', content)

# 特殊处理: selectUnit 函数体内的 draw()
# 这些已被上面正则处理

# ================================================================
# 12. 更新 onMounted：移除 initCanvas() 和 setupEvents() 调用
# ================================================================
content = content.replace(
    "  await nextTick()\n  initCanvas()\n  await nextTick()\n  setupEvents()",
    "  // HexGridCanvas 组件自动初始化 Canvas + 事件绑定"
)

# ================================================================
# 13. 移除 _windowDragMove/_windowDragEnd 引用（如果有残留）
# ================================================================
content = content.replace('let _windowDragMove = null\n', '')
content = content.replace('let _windowDragEnd = null\n', '')
content = content.replace('let isDragging = false\n', '')
content = content.replace('let dragStartX, dragStartY, dragStartOX, dragStartOY\n', '')

# ================================================================
# 14. 移除 import 中的 DEFAULT_OFFSET_FACTOR（不再使用）
# ================================================================
content = content.replace(
    'HEX_APOTHEM, HEX_RADIUS, DEFAULT_SPACING_H, DEFAULT_SPACING_V, DEFAULT_OFFSET_FACTOR',
    'HEX_APOTHEM, HEX_RADIUS, DEFAULT_SPACING_H, DEFAULT_SPACING_V'
)

# ================================================================
# 15. 移除 CSS 中 .game-canvas-sandbox 和 .canvas-container 样式（已移入 HexGridCanvas）
# ================================================================
content = re.sub(
    r'\/\* Canvas — 沙盒隔离容器[\s\S]*?\.canvas-container canvas \{\s*display: block;\s*\}',
    '/* Canvas styles now in HexGridCanvas.vue */',
    content
)

# ================================================================
# 写入
# ================================================================
with open(ORIGINAL_PATH, 'w', encoding='utf-8') as f:
    f.write(content)

print(f'Transformation complete. Original backed up to {BACKUP_PATH}')
print(f'Output: {ORIGINAL_PATH}')
