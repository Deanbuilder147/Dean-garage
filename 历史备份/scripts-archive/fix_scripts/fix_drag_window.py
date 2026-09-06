#!/usr/bin/env python3
"""Fix drag: 将拖拽 mousemove/mouseup 移到 window 级别，用外部变量保存 handler 引用以便 removeEventListener"""
import os

path = "/root/original-project/frontend/src/views/NewBattleView.vue"
with open(path, "r") as f:
    content = f.read()

# ====== 1. Add window-level handler refs before initCanvas ======
# Find the drag-related variables declaration area
old_vars = """let isDragging = false
let dragStartX, dragStartY, dragStartOX, dragStartOY"""
new_vars = """let isDragging = false
let dragStartX, dragStartY, dragStartOX, dragStartOY
let _windowDragMove = null
let _windowDragEnd = null"""

if old_vars in content:
    content = content.replace(old_vars, new_vars)
    print("[OK] Added _windowDragMove/_windowDragEnd refs")

# ====== 2. Replace canvas.onmousedown ======
old_mousedown = """  canvas.onmousedown = (e) => {
    if (e.button === 0) {
      isDragging = false
      dragStartX = e.clientX
      dragStartY = e.clientY
      dragStartOX = offsetX.value
      dragStartOY = offsetY.value
      canvas.style.cursor = 'grabbing'
    }
  }"""

new_mousedown = """  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
      isDragging = false
      dragStartX = e.clientX
      dragStartY = e.clientY
      dragStartOX = offsetX.value
      dragStartOY = offsetY.value
      canvas.style.cursor = 'grabbing'

      // 拖拽 mousemove/mouseup 绑定到 window，防止鼠标移出 canvas 中断拖拽
      _windowDragMove = (ev) => {
        const dragDistX = Math.abs(ev.clientX - dragStartX)
        const dragDistY = Math.abs(ev.clientY - dragStartY)
        if (dragDistX > 5 || dragDistY > 5) isDragging = true
        if (isDragging) {
          const rect = mapCanvas.value.getBoundingClientRect()
          const sx = mapCanvas.value.width / rect.width
          const sy = mapCanvas.value.height / rect.height
          offsetX.value = dragStartOX + (ev.clientX - dragStartX) * sx
          offsetY.value = dragStartOY + (ev.clientY - dragStartY) * sy
          draw()
        }
      }
      _windowDragEnd = () => {
        canvas.style.cursor = 'grab'
        isDragging = false
        window.removeEventListener('mousemove', _windowDragMove)
        window.removeEventListener('mouseup', _windowDragEnd)
        _windowDragMove = null
        _windowDragEnd = null
      }
      window.addEventListener('mousemove', _windowDragMove)
      window.addEventListener('mouseup', _windowDragEnd)
    }
  })"""

if old_mousedown in content:
    content = content.replace(old_mousedown, new_mousedown)
    print("[OK] canvas.onmousedown → addEventListener + window drag handlers")

# ====== 3. Remove drag logic from canvas.onmousemove, keep hover only ======
old_mousemove = """  canvas.onmousemove = (e) => {
    const wp = getWorldPos(e)
    const hex = pixelToHex(wp.x, wp.y)
    if (hex.q >= 0 && hex.q < gridWidth.value && hex.r >= 0 && hex.r < gridHeight.value) {
      hoverCoord.value = formatCoord(hex.q, hex.r)
      draw(hex.q, hex.r)
    } else {
      hoverCoord.value = ''
      draw()
    }

    if (e.buttons === 1) {
      const dragDistX = Math.abs(e.clientX - dragStartX)
      const dragDistY = Math.abs(e.clientY - dragStartY)
      if (dragDistX > 5 || dragDistY > 5) isDragging = true
      if (isDragging) {
        const rect = mapCanvas.value.getBoundingClientRect()
        const sx = mapCanvas.value.width / rect.width
        const sy = mapCanvas.value.height / rect.height
        offsetX.value = dragStartOX + (e.clientX - dragStartX) * sx
        offsetY.value = dragStartOY + (e.clientY - dragStartY) * sy
        draw()
      }
    }
  }"""

new_mousemove = """  canvas.addEventListener('mousemove', (e) => {
    if (isDragging) return // 拖拽由 window handler 处理
    const wp = getWorldPos(e)
    const hex = pixelToHex(wp.x, wp.y)
    if (hex.q >= 0 && hex.q < gridWidth.value && hex.r >= 0 && hex.r < gridHeight.value) {
      hoverCoord.value = formatCoord(hex.q, hex.r)
      draw(hex.q, hex.r)
    } else {
      hoverCoord.value = ''
      draw()
    }
  })"""

if old_mousemove in content:
    content = content.replace(old_mousemove, new_mousemove)
    print("[OK] canvas.onmousemove → addEventListener (hover only)")

# ====== 4. Remove canvas.onmouseup ======
old_mouseup = "\n  canvas.onmouseup = () => { canvas.style.cursor = 'grab'; isDragging = false }"
if old_mouseup in content:
    content = content.replace(old_mouseup, "")
    print("[OK] canvas.onmouseup removed")

# ====== 5. Fix canvas.onmouseleave ======
old_mouseleave = "  canvas.onmouseleave = () => { isDragging = false; hoverCoord.value = ''; draw() }"
new_mouseleave = "  canvas.addEventListener('mouseleave', () => { hoverCoord.value = ''; draw() })"
if old_mouseleave in content:
    content = content.replace(old_mouseleave, new_mouseleave)
    print("[OK] canvas.onmouseleave: removed isDragging reset")

# ====== 6. Switch wheel to addEventListener ======
old_wheel = "  canvas.onwheel = (e) => {"
new_wheel = "  canvas.addEventListener('wheel', (e) => {"
if old_wheel in content:
    content = content.replace(old_wheel, new_wheel)
    # Fix closing: find draw()\n  }\n\n  canvas.style.cursor = 'grab'\n}
    old_wheel_end = """    draw()
  }

  canvas.style.cursor = 'grab'
}"""
    new_wheel_end = """    draw()
  })

  canvas.style.cursor = 'grab'
}"""
    if old_wheel_end in content:
        content = content.replace(old_wheel_end, new_wheel_end)
        print("[OK] canvas.onwheel → addEventListener('wheel')")

with open(path, "w") as f:
    f.write(content)

print("\nAll drag fixes applied.")
