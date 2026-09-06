#!/usr/bin/env python3
"""
Phase 16 战场页面全面修复

问题1: /battle/:id 路由没有 component → 白屏
问题2: HexGridCanvas 初始化时 container.clientHeight 不稳定 → 画布过小(150px)
问题3: 浮动卡片在 dm-main 内消耗 flex 空间 → 画布只有 248px
"""

import sys

# ============================================================
# Fix 1: 路由修复 — 为 /battle/:id 添加 fallback component
# ============================================================
def fix_route(main_js_path):
    with open(main_js_path, 'r') as f:
        content = f.read()
    
    old = '  // 旧 /battle/:id 保留作为兼容入口，由导航守卫自动分流重定向\n  { path: \'/battle/:id\', meta: { requiresAuth: true, redirectByDevice: true } }'
    new = '  // /battle/:id 直接加载 NewBattleView（PC端默认），redirectByDevice 守卫自动分流移动端\n  { path: \'/battle/:id\', component: NewBattleView, meta: { requiresAuth: true, redirectByDevice: true } }'
    
    if old in content:
        content = content.replace(old, new)
        with open(main_js_path, 'w') as f:
            f.write(content)
        print("[Route] OK: /battle/:id now has NewBattleView component")
        return True
    else:
        print("[Route] WARN: pattern not found, checking...")
        idx = content.find('/battle/:id')
        if idx >= 0:
            print(f"[Route] Found at position {idx}: {repr(content[idx:idx+120])}")
        return False

# ============================================================
# Fix 2: HexGridCanvas 初始化时序修复
# 问题：onMounted → nextTick → initCanvas → container.clientHeight 还是 150px（布局未稳定）
# 修复：nextTick → requestAnimationFrame×2 → initCanvas（等待 CSS 布局完成）
# 追加：ResizeObserver 持续监控容器尺寸
# ============================================================
def fix_canvas_init(hexgrid_path):
    with open(hexgrid_path, 'r') as f:
        content = f.read()
    
    # Fix 2a: 替换 onMounted 中的 initCanvas 调用，加入 RAF 延迟
    old_onmounted = """onMounted(async () => {
  await nextTick()
  initCanvas()
  setupEvents()
  // debounce resize: 避免高频触发导致重绘风暴
  window.addEventListener('resize', () => {
    if (_resizeTimer) clearTimeout(_resizeTimer)
    _resizeTimer = setTimeout(handleWindowResize, 150)
  })
})"""
    
    new_onmounted = """onMounted(async () => {
  await nextTick()
  // Phase 16 Fix: 等待 CSS 布局完成后再读取容器尺寸
  // nextTick 只等待 Vue DOM 更新，不保证 CSS 布局完成
  await new Promise(resolve => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resolve()
      })
    })
  })
  initCanvas()
  setupEvents()
  // debounce resize: 避免高频触发导致重绘风暴
  window.addEventListener('resize', () => {
    if (_resizeTimer) clearTimeout(_resizeTimer)
    _resizeTimer = setTimeout(handleWindowResize, 150)
  })
  // Phase 16 Fix: ResizeObserver 持续监控容器尺寸变化
  setupResizeObserver()
})"""
    
    if old_onmounted in content:
        content = content.replace(old_onmounted, new_onmounted)
        print("[CanvasInit] OK: Added RAF delay + ResizeObserver to onMounted")
    else:
        print("[CanvasInit] WARN: onMounted pattern not found")
        # Try to find similar pattern
        idx = content.find('onMounted(async ()')
        if idx >= 0:
            print(f"[CanvasInit] Found at {idx}: {repr(content[idx:idx+200])}")
    
    # Fix 2b: 添加 setupResizeObserver 函数
    # 找到 onUnmounted 之前的合适位置插入
    setup_ro_func = """
// ================================================================
//  Phase 16 Fix: ResizeObserver — 容器尺寸变化时自动同步 Canvas
// ================================================================
let _resizeObserver = null

function setupResizeObserver() {
  if (_resizeObserver) _resizeObserver.disconnect()
  const container = canvasContainer.value
  if (!container) return
  
  _resizeObserver = new ResizeObserver(() => {
    const canvas = mapCanvas.value
    if (!canvas) return
    const w = container.clientWidth
    const h = container.clientHeight
    if (w === canvas.width && h === canvas.height) return
    canvas.width = w
    canvas.height = h
    centerGrid()
    draw()
  })
  _resizeObserver.observe(container)
  console.log('[ResizeObserver] 已激活，监控 canvas 容器尺寸')
}
"""
    
    # Insert before onUnmounted
    unmo_marker = 'onUnmounted(() => {'
    if unmo_marker in content:
        content = content.replace(unmo_marker, setup_ro_func + '\n' + unmo_marker)
        print("[CanvasInit] OK: Added setupResizeObserver function")
    else:
        print("[CanvasInit] WARN: onUnmounted marker not found")
    
    # Fix 2c: 在 onUnmounted 中清理 ResizeObserver
    old_unmount_cleanup = """  if (_resizeTimer) {
    clearTimeout(_resizeTimer)
    _resizeTimer = null
  }"""
    
    new_unmount_cleanup = """  if (_resizeTimer) {
    clearTimeout(_resizeTimer)
    _resizeTimer = null
  }
  if (_resizeObserver) {
    _resizeObserver.disconnect()
    _resizeObserver = null
  }"""
    
    if old_unmount_cleanup in content:
        content = content.replace(old_unmount_cleanup, new_unmount_cleanup)
        print("[CanvasInit] OK: Added ResizeObserver cleanup in onUnmounted")
    
    with open(hexgrid_path, 'w') as f:
        f.write(content)
    return True

# ============================================================
# Fix 3: 浮动卡片移出 dm-main flex 容器
# 问题：floating-faction-panel 在 dm-main 内，虽然 position:fixed 但可能影响布局
# 修复：将其移到 dm-main 外部（和 action-panel 同级）
# ============================================================
def fix_floating_panels(battle_vue_path):
    with open(battle_vue_path, 'r') as f:
        content = f.read()
    
    # 当前结构: </HexGridCanvas> ... </main> ... <floating-action-panel>
    # 目标结构: </HexGridCanvas> ... <floating-faction-panel> </main> <floating-action-panel>
    # 将 floating-faction-panel 移到 </main> 之后
    
    # 策略：找到 dm-main 的结束标签，将 faction panel 移到外面
    # 先定位 floating-faction-panel 块
    
    marker_fp_start = 'class="floating-card floating-faction-panel"'
    marker_main_close = '    </main>'
    
    fp_start = content.find(marker_fp_start)
    if fp_start < 0:
        print("[Panels] WARN: floating-faction-panel not found")
        return False
    
    # 找到 floating-faction-panel 的结束 (下一个同级 </div> after the content)
    # 简单策略：找到 floating-faction-panel 开始后的 '      </div><!-- end floating-card -->'
    fp_end_marker = '      </div><!-- end floating-card -->'
    fp_end = content.find(fp_end_marker, fp_start)
    if fp_end < 0:
        print("[Panels] WARN: floating-card end marker not found")
        return False
    fp_end += len(fp_end_marker)
    
    # 提取整个 faction panel 块
    fp_block = content[fp_start - content[:fp_start].rfind('\n', 0, fp_start) : fp_end]
    
    # 找到 </main> 位置
    main_close = content.find(marker_main_close)
    if main_close < 0:
        print("[Panels] WARN: </main> not found")
        return False
    
    # 检查 faction panel 是否已经在 </main> 之前
    if fp_start < main_close:
        # faction panel 在 dm-main 内 → 需要移出
        # 移除原位置的 faction panel
        content_before = content[:fp_start - 6]  # remove leading spaces before the div
        # 找到 faction panel 前一行开始
        line_start = content_before.rfind('\n')
        content_no_fp = content[:line_start + 1] + content[fp_end + 1:]
        
        # 重新定位 </main> (因为内容变化了)
        main_close_new = content_no_fp.find(marker_main_close)
        if main_close_new < 0:
            print("[Panels] WARN: </main> not found after removal")
            return False
        
        # 在 </main> 之后插入 faction panel
        insert_pos = main_close_new + len(marker_main_close)
        content_final = content_no_fp[:insert_pos] + '\n' + fp_block.strip() + '\n' + content_no_fp[insert_pos:]
        
        with open(battle_vue_path, 'w') as f:
            f.write(content_final)
        print("[Panels] OK: Moved floating-faction-panel outside dm-main")
        return True
    else:
        print("[Panels] INFO: floating-faction-panel already outside dm-main")
        return True

# ============================================================
# Main
# ============================================================
if __name__ == '__main__':
    base = '/root/original-project'
    
    results = []
    results.append(('Route', fix_route(f'{base}/frontend/src/main.js')))
    results.append(('CanvasInit', fix_canvas_init(f'{base}/frontend/src/components/HexGridCanvas.vue')))
    results.append(('Panels', fix_floating_panels(f'{base}/frontend/src/views/NewBattleView.vue')))
    
    print("\n=== Summary ===")
    for name, ok in results:
        print(f"  [{name}] {'✅' if ok else '❌'}")
