#!/usr/bin/env python3
"""
交互复活补丁：
1. 接入 window resize 监听，同步 canvas 位图像素
2. 清查拖拽生命周期，确保 draw() 调用链完整
目标文件: frontend/src/components/HexGridCanvas.vue
"""

path = "frontend/src/components/HexGridCanvas.vue"
with open(path, "r") as f:
    content = f.read()

fixes = 0

# ============================================================
# FIX 1: 在内部状态区添加 debounce 工具函数 + _resizeTimer
# ============================================================
old_internal = """let isDragging = false
let dragStartX = 0, dragStartY = 0, dragStartOX = 0, dragStartOY = 0
let _windowDragMove = null
let _windowDragEnd = null
let hlQ = -1, hlR = -1
let isFirstDraw = true"""

new_internal = """let isDragging = false
let dragStartX = 0, dragStartY = 0, dragStartOX = 0, dragStartOY = 0
let _windowDragMove = null
let _windowDragEnd = null
let _resizeTimer = null
let hlQ = -1, hlR = -1
let isFirstDraw = true"""

if old_internal in content:
    content = content.replace(old_internal, new_internal)
    fixes += 1
    print("FIX 1: 内部状态区 -> 添加 _resizeTimer")
else:
    print("WARN: FIX 1 exact match not found")

# ============================================================
# FIX 2: 在 draw() 之后、setupEvents() 之前插入 handleWindowResize()
# ============================================================
old_draw_end = """  ctx.restore()
}

// ================================================================
//  事件绑定 — 全部统一使用 addEventListener (不再混用 onclick)
// ================================================================"""

new_draw_end = """  ctx.restore()
}

// ================================================================
//  Window Resize 事件驱动 — 补位已切除的 draw() 动态 resize
// ================================================================

/**
 * 浏览器窗口/侧边栏变化时，同步 canvas 位图像素与容器 CSS 物理尺寸。
 * 宪法红线: 仅 resize 事件触发时执行，绝不在 draw() 每帧执行。
 */
function handleWindowResize() {
  const canvas = mapCanvas.value
  const container = canvasContainer.value
  if (!canvas || !container) return
  canvas.width = container.clientWidth
  canvas.height = container.clientHeight
  centerGrid()
  draw()
}

// ================================================================
//  事件绑定 — 全部统一使用 addEventListener (不再混用 onclick)
// ================================================================"""

if old_draw_end in content:
    content = content.replace(old_draw_end, new_draw_end)
    fixes += 1
    print("FIX 2: draw() 后插入 handleWindowResize()")
else:
    print("WARN: FIX 2 exact match not found, trying fallback")
    # Fallback: find ctx.restore() followed by blank line and section comment
    if "ctx.restore()\n}\n\n// =====" in content:
        content = content.replace(
            "ctx.restore()\n}\n\n// ================================================================\n//  事件绑定",
            """ctx.restore()
}

// ================================================================
//  Window Resize 事件驱动 — 补位已切除的 draw() 动态 resize
// ================================================================

/**
 * 浏览器窗口/侧边栏变化时，同步 canvas 位图像素与容器 CSS 物理尺寸。
 * 宪法红线: 仅 resize 事件触发时执行，绝不在 draw() 每帧执行。
 */
function handleWindowResize() {
  const canvas = mapCanvas.value
  const container = canvasContainer.value
  if (!canvas || !container) return
  canvas.width = container.clientWidth
  canvas.height = container.clientHeight
  centerGrid()
  draw()
}

// ================================================================
//  事件绑定"""
        )
        fixes += 1
        print("  -> fallback applied")

# ============================================================
# FIX 3: onMounted 中添加 resize 监听
# ============================================================
old_mounted = """onMounted(async () => {
  await nextTick()
  initCanvas()
  setupEvents()
})"""

new_mounted = """onMounted(async () => {
  await nextTick()
  initCanvas()
  setupEvents()
  // debounce resize: 避免高频触发导致重绘风暴
  window.addEventListener('resize', () => {
    if (_resizeTimer) clearTimeout(_resizeTimer)
    _resizeTimer = setTimeout(handleWindowResize, 150)
  })
})"""

if old_mounted in content:
    content = content.replace(old_mounted, new_mounted)
    fixes += 1
    print("FIX 3: onMounted -> 添加 debounced resize 监听 (150ms)")
else:
    print("WARN: FIX 3 exact match not found")

# ============================================================
# FIX 4: onUnmounted 中添加 resize 清理
# ============================================================
old_unmounted = """onUnmounted(() => {
  // 彻底清理 window 级事件监听，消灭内存泄漏风险
  if (_windowDragMove) {
    window.removeEventListener('mousemove', _windowDragMove)
    _windowDragMove = null
  }
  if (_windowDragEnd) {
    window.removeEventListener('mouseup', _windowDragEnd)
    _windowDragEnd = null
  }
  isDragging = false
  ctx = null
})"""

new_unmounted = """onUnmounted(() => {
  // 彻底清理 window 级事件监听，消灭内存泄漏风险
  window.removeEventListener('resize', handleWindowResize)
  if (_resizeTimer) {
    clearTimeout(_resizeTimer)
    _resizeTimer = null
  }
  if (_windowDragMove) {
    window.removeEventListener('mousemove', _windowDragMove)
    _windowDragMove = null
  }
  if (_windowDragEnd) {
    window.removeEventListener('mouseup', _windowDragEnd)
    _windowDragEnd = null
  }
  isDragging = false
  ctx = null
})"""

if old_unmounted in content:
    content = content.replace(old_unmounted, new_unmounted)
    fixes += 1
    print("FIX 4: onUnmounted -> 添加 resize 清理 + timer 清理")
else:
    print("WARN: FIX 4 exact match not found")

with open(path, "w") as f:
    f.write(content)

# Final verification
with open(path) as f:
    c = f.read()

add_resize = "window.addEventListener('resize'"
rem_resize = "window.removeEventListener('resize'"
print(f"\n=== {fixes} 处补丁完成 ===")
print(f"handleWindowResize 出现次数: {c.count('handleWindowResize')}")
print(f"window.addEventListener(resize) 出现: {c.count(add_resize)}")
print(f"window.removeEventListener(resize) 出现: {c.count(rem_resize)}")
print(f"_resizeTimer 出现次数: {c.count('_resizeTimer')}")
