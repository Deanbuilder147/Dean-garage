#!/usr/bin/env python3
"""
修复1: NewBattleView.vue - canvasPosToWorld 返回值错误
  根因: 返回 { x: worldX, y: worldY }（ISO逆向前的值），
  但后续 pixelToHex(wp.x, wp.y) 将 worldX/worldY 错当 flatX/flatY 传入 pointyTopToHex，
  导致缩放/平移后鼠标高亮与棋盘错位。
  
  修复: 返回 flatX/flatY 作为 x/y，新增 wx/wy 供 zoom 使用。

修复2: NewBattlefieldView.vue - 编辑器无法拖拽/缩放
  根因: 使用 canvas.onmousemove/onmouseleave/onmouseup 旧模式，
  鼠标移出 canvas 时 onmouseleave 重置 isDragging → 拖拽中断，
  且 canvas 的 mouseup 不触发 → cursor 卡在 grabbing。
  
  修复: 改为 window.addEventListener 模式，与 NewBattleView 一致。
"""

import re

FILES = {
    'bv': '/root/original-project/frontend/src/views/NewBattleView.vue',
    'bf': '/root/original-project/frontend/src/views/NewBattlefieldView.vue',
}

# ==================== Fix 1: NewBattleView canvasPosToWorld ====================
with open(FILES['bv'], 'r') as f:
    bv = f.read()

# 1a - canvasPosToWorld return line
old_ret = '  return { x: worldX, y: worldY, q, r };'
new_ret = '  return { x: flatX, y: flatY, q, r, wx: worldX, wy: worldY };'
bv = bv.replace(old_ret, new_ret)
print(f'[bv] canvasPosToWorld return: {old_ret} → {new_ret}')

# 1b - wheel handler zoom (in setupEvents)
old_wheel = '''    offsetX.value += (scale.value - ns) * worldPos.x
    offsetY.value += (scale.value - ns) * worldPos.y'''
new_wheel = '''    offsetX.value += (scale.value - ns) * worldPos.wx
    offsetY.value += (scale.value - ns) * worldPos.wy'''
bv = bv.replace(old_wheel, new_wheel)
print(f'[bv] wheelHandler zoom: .x/.y → .wx/.wy')

# 1c - zoomIn
old_zi = '''  offsetX.value += (scale.value - ns) * worldCenter.x
  offsetY.value += (scale.value - ns) * worldCenter.y
  scale.value = ns
  draw()
}
function zoomOut() {
  const ns = Math.max(0.2, scale.value / 1.2)
  const canvas = mapCanvas.value
  const worldCenter = canvasPosToWorld(canvas.width / 2, canvas.height / 2)
  offsetX.value += (scale.value - ns) * worldCenter.x
  offsetY.value += (scale.value - ns) * worldCenter.y'''
new_zi = '''  offsetX.value += (scale.value - ns) * worldCenter.wx
  offsetY.value += (scale.value - ns) * worldCenter.wy
  scale.value = ns
  draw()
}
function zoomOut() {
  const ns = Math.max(0.2, scale.value / 1.2)
  const canvas = mapCanvas.value
  const worldCenter = canvasPosToWorld(canvas.width / 2, canvas.height / 2)
  offsetX.value += (scale.value - ns) * worldCenter.wx
  offsetY.value += (scale.value - ns) * worldCenter.wy'''
bv = bv.replace(old_zi, new_zi)
print(f'[bv] zoomIn/zoomOut: .x/.y → .wx/.wy')

with open(FILES['bv'], 'w') as f:
    f.write(bv)

# ==================== Fix 2: NewBattlefieldView window-level drag ====================
with open(FILES['bf'], 'r') as f:
    bf = f.read()

# 2a - Add _windowDragMove / _windowDragEnd variables
old_vars = 'let isDragging = false, dragStartX, dragStartY, dragStartOffsetX, dragStartOffsetY'
new_vars = '''let isDragging = false, dragStartX, dragStartY, dragStartOffsetX, dragStartOffsetY
let _windowDragMove = null, _windowDragEnd = null'''
bf = bf.replace(old_vars, new_vars)
print(f'[bf] Added _windowDragMove/_windowDragEnd vars')

# 2b - Replace entire setupEvents() function
old_setup = '''function setupEvents() {
  if (!canvas) return

  canvas.onclick = (e) => {
    if (isDragging) return
    const wp = getWorldPos(e)
    const hex = pixelToHex(wp.x, wp.y)
    if (hex.q >= 0 && hex.q < gridW.value && hex.r >= 0 && hex.r < gridH.value) {
      terrainMap[`${hex.q},${hex.r}`] = brush.value
      draw(hex.q, hex.r)
    }
  }

  canvas.oncontextmenu = (e) => {
    e.preventDefault()
    const wp = getWorldPos(e)
    const hex = pixelToHex(wp.x, wp.y)
    if (hex.q >= 0 && hex.q < gridW.value && hex.r >= 0 && hex.r < gridH.value) {
      delete terrainMap[`${hex.q},${hex.r}`]
      draw(hex.q, hex.r)
    }
  }

  canvas.onmousedown = (e) => {
    if (e.button === 0) {
      isDragging = false
      dragStartX = e.clientX
      dragStartY = e.clientY
      dragStartOffsetX = offsetX.value
      dragStartOffsetY = offsetY.value
    }
  }

  canvas.onmousemove = (e) => {
    const wp = getWorldPos(e)
    const hex = pixelToHex(wp.x, wp.y)
    if (hex.q >= 0 && hex.q < gridW.value && hex.r >= 0 && hex.r < gridH.value) {
      hoveredQ = hex.q
      hoveredR = hex.r
      hoverCoord.value = formatCoord(hex.q, hex.r)
      draw(hex.q, hex.r)
    } else {
      hoveredQ = hoveredR = -1
      hoverCoord.value = ''
      draw()
    }

    if (e.buttons === 1) {
      const dx = Math.abs(e.clientX - dragStartX)
      const dy = Math.abs(e.clientY - dragStartY)
      if (dx > 3 || dy > 3) isDragging = true
      if (isDragging) {
        const rect = canvas.getBoundingClientRect()
        const sx = canvas.width / rect.width
        const sy = canvas.height / rect.height
        offsetX.value = dragStartOffsetX + (e.clientX - dragStartX) * sx
        offsetY.value = dragStartOffsetY + (e.clientY - dragStartY) * sy
        draw()
      }
    }
  }

  canvas.onmouseleave = () => {
    hoveredQ = hoveredR = -1
    hoverCoord.value = ''
    isDragging = false
    draw()
  }

  canvas.onwheel = (e) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.92 : 1.08
    const ns = Math.max(0.2, Math.min(3, scale.value * delta))
    const rect = canvas.getBoundingClientRect()
    const sx = canvas.width / rect.width
    const sy = canvas.height / rect.height
    const mx = (e.clientX - rect.left) * sx
    const my = (e.clientY - rect.top) * sy
    // 标准 2D 缩放：以鼠标为中心，纯 2D 无 Y 压缩
    offsetX.value = mx - (mx - offsetX.value) * (ns / scale.value)
    offsetY.value = my - (my - offsetY.value) * (ns / scale.value)
    scale.value = ns
    draw()
  }
}'''

new_setup = '''function setupEvents() {
  if (!canvas) return
  const c = canvas

  // ---- click (paint terrain) ----
  c.addEventListener('click', (e) => {
    if (isDragging) return
    const wp = getWorldPos(e)
    const hex = pixelToHex(wp.x, wp.y)
    if (hex.q >= 0 && hex.q < gridW.value && hex.r >= 0 && hex.r < gridH.value) {
      terrainMap[`${hex.q},${hex.r}`] = brush.value
      draw(hex.q, hex.r)
    }
  })

  // ---- contextmenu (erase terrain) ----
  c.addEventListener('contextmenu', (e) => {
    e.preventDefault()
    const wp = getWorldPos(e)
    const hex = pixelToHex(wp.x, wp.y)
    if (hex.q >= 0 && hex.q < gridW.value && hex.r >= 0 && hex.r < gridH.value) {
      delete terrainMap[`${hex.q},${hex.r}`]
      draw(hex.q, hex.r)
    }
  })

  // ---- mousedown (drag start) → bind window handlers ----
  c.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return
    isDragging = false
    dragStartX = e.clientX
    dragStartY = e.clientY
    dragStartOffsetX = offsetX.value
    dragStartOffsetY = offsetY.value
    c.style.cursor = 'grabbing'

    _windowDragMove = (ev) => {
      const dragDistX = Math.abs(ev.clientX - dragStartX)
      const dragDistY = Math.abs(ev.clientY - dragStartY)
      if (dragDistX > 5 || dragDistY > 5) isDragging = true
      if (isDragging) {
        const rect = c.getBoundingClientRect()
        const sx = c.width / rect.width
        const sy = c.height / rect.height
        offsetX.value = dragStartOffsetX + (ev.clientX - dragStartX) * sx
        offsetY.value = dragStartOffsetY + (ev.clientY - dragStartY) * sy
        draw()
      }
    }
    _windowDragEnd = () => {
      c.style.cursor = 'crosshair'
      isDragging = false
      window.removeEventListener('mousemove', _windowDragMove)
      window.removeEventListener('mouseup', _windowDragEnd)
      _windowDragMove = null
      _windowDragEnd = null
    }
    window.addEventListener('mousemove', _windowDragMove)
    window.addEventListener('mouseup', _windowDragEnd)
  })

  // ---- mousemove (hover only; drag handled by window) ----
  c.addEventListener('mousemove', (e) => {
    if (isDragging) return
    const wp = getWorldPos(e)
    const hex = pixelToHex(wp.x, wp.y)
    if (hex.q >= 0 && hex.q < gridW.value && hex.r >= 0 && hex.r < gridH.value) {
      hoveredQ = hex.q
      hoveredR = hex.r
      hoverCoord.value = formatCoord(hex.q, hex.r)
      draw(hex.q, hex.r)
    } else {
      hoveredQ = hoveredR = -1
      hoverCoord.value = ''
      draw()
    }
  })

  // ---- mouseleave (only clear hover; don't reset isDragging) ----
  c.addEventListener('mouseleave', () => {
    hoveredQ = hoveredR = -1
    hoverCoord.value = ''
    draw()
  })

  // ---- wheel (zoom centered on mouse) ----
  c.addEventListener('wheel', (e) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.92 : 1.08
    const ns = Math.max(0.2, Math.min(3, scale.value * delta))
    const rect = c.getBoundingClientRect()
    const sx = c.width / rect.width
    const sy = c.height / rect.height
    const mx = (e.clientX - rect.left) * sx
    const my = (e.clientY - rect.top) * sy
    // 标准 2D 缩放：以鼠标为中心
    offsetX.value = mx - (mx - offsetX.value) * (ns / scale.value)
    offsetY.value = my - (my - offsetY.value) * (ns / scale.value)
    scale.value = ns
    draw()
  })

  c.style.cursor = 'crosshair'
}'''

bf = bf.replace(old_setup, new_setup)
print(f'[bf] Replaced setupEvents() with window-level drag pattern')

with open(FILES['bf'], 'w') as f:
    f.write(bf)

print('\n=== All fixes applied ===')
