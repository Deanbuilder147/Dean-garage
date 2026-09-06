"""
NewBattleView.vue — 坐标核心片段重构 (Phase 1: 移除伪3D耦合)
严格按照《战棋开发终极宪法 v2.0》恢复纯 2D 尖顶 Even-R 状态。
在与 NewBattlefieldView 完全对齐后，后续再统一进行伪3D全局矩阵压扁。

改动清单（仅坐标相关核心函数）：
A. draw()         — 删除 ctx.scale(1, 0.5) 伪3D压缩
B. initCanvas()   — 画布高度计算去掉 * 0.5
C. canvasPosToWorld() — 删除 flatY = screenY * 2 补偿
D. setupEvents() onwheel — 删除 offsetY * 0.5 补偿
E. zoomIn()       — 删除 offsetY * 0.5 补偿
"""

REFACTORED_NEWBATTLEVIEW_COORD_CHANGES = """

========== A. draw() 函数 CTM 段 ==========

【修改前】L730-738:
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.save()

  // === 等距伪 3D 变换：平移 → 缩放 → 2:1 纵向压扁 ===
  ctx.translate(offsetX.value, offsetY.value)
  ctx.scale(scale.value, scale.value)
  ctx.scale(1, 0.5)                            // ← 删除此行

【修改后】:
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.save()

  // === 标准 2D 变换：平移 → 缩放（纯 2D，无 Y 压缩）===
  ctx.translate(offsetX.value, offsetY.value)
  ctx.scale(scale.value, scale.value)
  // Phase 1 结束，后续 Phase 4 将在此外部添加等距矩阵


========== B. initCanvas() 画布尺寸 ==========

【修改前】L698-706:
  const cw = lastCol.x + HEX_RADIUS * 2 + 200
  const ch = lastRow.y * 0.5 + HEX_RADIUS * 2 + 200   // ← * 0.5

【修改后】:
  // 纯 2D 状态：画布高度 = 世界坐标 Y 最大值 + 边距
  const cw = lastCol.x + HEX_RADIUS * 2 + 200
  const ch = lastRow.y + HEX_RADIUS * 2 + 200


========== C. canvasPosToWorld() 逆推函数 ==========

【修改前】L1221-1237:
  function canvasPosToWorld(cx, cy) {
    // 1) 减去相机平移量
    const relX = cx - offsetX.value
    const relY = cy - offsetY.value
    // 2) 除以缩放比例，还原到 1.0 倍率下的渲染空间
    const screenX = relX / scale.value
    const screenY = relY / scale.value
    // 3) CTM 的 ctx.scale(1,0.5) 将 hex-space Y 压缩了 1/2，还原之
    const flatX = screenX
    const flatY = screenY * 2                          // ← 删除此行
    // 4) 带入尖顶六边形逆推函数
    const { q, r } = pointyTopToHex(flatX, flatY, ...)
    return { x: flatX, y: flatY, q, r }
  }

【修改后】:
  function canvasPosToWorld(cx, cy) {
    // 标准 2D 逆运算（宪法 v2.0）
    // Step 1: 减去相机平移
    const relX = cx - offsetX.value
    const relY = cy - offsetY.value
    // Step 2: 除以缩放
    const worldX = relX / scale.value
    const worldY = relY / scale.value
    // Step 3: 标准尖顶六边形逆推（纯 2D，无 Y 补偿）
    const { q, r } = pointyTopToHex(worldX, worldY, HEX_RADIUS, spacingH, spacingV)
    return { x: worldX, y: worldY, q, r }
  }


========== D. setupEvents() onwheel 缩放 ==========

【修改前】L1196-1211:
  canvas.onwheel = (e) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    const ns = Math.max(0.2, Math.min(3, scale.value * delta))
    const worldPos = getWorldPos(e)
    offsetX.value += (scale.value - ns) * worldPos.x
    offsetY.value += (scale.value - ns) * worldPos.y * 0.5    // ← 删除 * 0.5
    scale.value = ns
    draw()
  }

【修改后】:
  canvas.onwheel = (e) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    const ns = Math.max(0.2, Math.min(3, scale.value * delta))
    const worldPos = getWorldPos(e)
    // 标准 2D 缩放：以鼠标下世界坐标为锚点，补偿平移量
    offsetX.value += (scale.value - ns) * worldPos.x
    offsetY.value += (scale.value - ns) * worldPos.y
    scale.value = ns
    draw()
  }


========== E. zoomIn() / zoomOut() 缩放按钮 ==========

【修改前】L1242-1254:
  function zoomIn() {
    const ns = Math.min(3, scale.value * 1.2)
    const canvas = mapCanvas.value
    const worldCenter = canvasPosToWorld(canvas.width / 2, canvas.height / 2)
    offsetX.value += (scale.value - ns) * worldCenter.x
    offsetY.value += (scale.value - ns) * worldCenter.y * 0.5   // ← 删除 * 0.5
    scale.value = ns
    draw()
  }
  function zoomOut() { ... }  // 同理

【修改后】:
  function zoomIn() {
    const ns = Math.min(3, scale.value * 1.2)
    const canvas = mapCanvas.value
    const worldCenter = canvasPosToWorld(canvas.width / 2, canvas.height / 2)
    offsetX.value += (scale.value - ns) * worldCenter.x
    offsetY.value += (scale.value - ns) * worldCenter.y
    scale.value = ns
    draw()
  }
  function zoomOut() {
    const ns = Math.max(0.2, scale.value / 1.2)
    const canvas = mapCanvas.value
    const worldCenter = canvasPosToWorld(canvas.width / 2, canvas.height / 2)
    offsetX.value += (scale.value - ns) * worldCenter.x
    offsetY.value += (scale.value - ns) * worldCenter.y
    scale.value = ns
    draw()
  }
"""

print(REFACTORED_NEWBATTLEVIEW_COORD_CHANGES)
