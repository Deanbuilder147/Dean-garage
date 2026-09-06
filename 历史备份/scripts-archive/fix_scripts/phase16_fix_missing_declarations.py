#!/usr/bin/env python3
"""
Phase 16 Hotfix: 补全 NewBattleView.vue 缺失的 terrainMap 声明 + 浮动卡片状态管理

问题诊断:
1. const terrainMap = reactive({}) 从未声明 → terrainMap is not defined
2. Phase 13.5 浮动卡片补丁依赖 terrainMap 作为注入锚点，锚点不存在 → 所有浮动卡片变量未声明
3. factionPanelPos, actionPanelPos, initFloatingCardPositions, startDrag 等 17 处引用全部未定义

修复: 补全缺失的 terrainMap 声明 + 浮动卡片完整状态管理代码块
"""
import sys

BATTLEVIEW_VUE = "/root/original-project/frontend/src/views/NewBattleView.vue"

def patch():
    with open(BATTLEVIEW_VUE, 'r') as f:
        content = f.read()

    # ============================================================
    # PATCH 1: 在 const ISO = reactive({ ...ISO_DEFAULTS }) 之后
    # 插入 terrainMap 声明 + 浮动卡片全套状态管理
    # ============================================================
    anchor = "const ISO = reactive({ ...ISO_DEFAULTS })"
    
    injection = """
// ================================================================
//  Phase 13: 地形数据容器 (Phase 16 补全声明)
//  存储 "q,r" → { terrain_id, terrain_hp, is_destructible, max_hp, destroyed_transform_to }
// ================================================================
const terrainMap = reactive({})

// ================================================================
//  Phase 13: 悬浮可拖拽折叠卡片状态管理 (Phase 16 补全声明)
// ================================================================

// 行动面板状态
const actionPanelRef = ref(null)
const actionPanelCollapsed = ref(false)
const actionPanelPos = reactive({ left: 0, top: 60 })

// 阵营面板状态
const factionPanelRef = ref(null)
const factionPanelCollapsed = ref(false)
const factionPanelPos = reactive({ left: 0, top: 0 })

// 拖拽状态 (共享)
const dragState = reactive({
  active: false,
  target: '',       // 'actionPanel' | 'factionPanel'
  startMouseX: 0,
  startMouseY: 0,
  startLeft: 0,
  startTop: 0,
})

// 拖拽初始化函数
function initFloatingCardPositions() {
  const vw = window.innerWidth
  const vh = window.innerHeight
  
  // 行动面板: 右上区域
  actionPanelPos.left = vw - 250
  actionPanelPos.top = 60
  
  // 阵营面板: 底部区域
  factionPanelPos.left = Math.max(0, (vw - 600) / 2)
  factionPanelPos.top = vh - 240
}

// 开始拖拽
function startDrag(event, panelId) {
  dragState.active = true
  dragState.target = panelId
  dragState.startMouseX = event.clientX
  dragState.startMouseY = event.clientY
  
  const pos = panelId === 'actionPanel' ? actionPanelPos : factionPanelPos
  dragState.startLeft = pos.left
  dragState.startTop = pos.top
  
  document.addEventListener('mousemove', onDragMove)
  document.addEventListener('mouseup', onDragEnd)
  event.preventDefault()
}

// 拖拽移动
function onDragMove(event) {
  if (!dragState.active) return
  const dx = event.clientX - dragState.startMouseX
  const dy = event.clientY - dragState.startMouseY
  
  const pos = dragState.target === 'actionPanel' ? actionPanelPos : factionPanelPos
  pos.left = Math.max(0, Math.min(window.innerWidth - 220, dragState.startLeft + dx))
  pos.top = Math.max(0, Math.min(window.innerHeight - 40, dragState.startTop + dy))
}

// 拖拽结束
function onDragEnd() {
  dragState.active = false
  dragState.target = ''
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragEnd)
}

// 切换行动面板折叠状态
function toggleActionPanel() {
  actionPanelCollapsed.value = !actionPanelCollapsed.value
}

// 切换阵营面板折叠状态
function toggleFactionPanel() {
  factionPanelCollapsed.value = !factionPanelCollapsed.value
}

"""
    
    if anchor in content:
        content = content.replace(anchor, anchor + injection)
        print("[Phase16-Fix] ✓ terrainMap + floating card state injected after ISO declaration")
    else:
        print("[Phase16-Fix] ✗ Anchor 'const ISO = reactive({ ...ISO_DEFAULTS })' not found")
        # Try alternative anchor
        alt = 'const ISO = reactive({ ...ISO_DEFAULTS })'
        # Try with different spacing
        lines = content.split('\n')
        for i, line in enumerate(lines):
            if 'const ISO = reactive' in line:
                print(f"[Phase16-Fix] Found ISO at line {i+1}: {line.strip()}")
                lines[i] = line + injection
                content = '\n'.join(lines)
                print("[Phase16-Fix] ✓ terrainMap + floating state injected (alt method)")
                break

    # ============================================================
    # PATCH 2: 确保 onMounted 中 initFloatingCardPositions 被调用
    # ============================================================
    # Check if it's already there
    if 'initFloatingCardPositions()' not in content.split('onMounted')[1].split('\n})')[0] if 'onMounted' in content else True:
        old_mounted = "  initFloatingCardPositions()"
        if old_mounted not in content:
            # Try to add after sanitizeBattlefieldTerrain()
            sanitizer_call = "  sanitizeBattlefieldTerrain()"
            if sanitizer_call in content:
                content = content.replace(
                    sanitizer_call,
                    sanitizer_call + "\n  initFloatingCardPositions()\n  window.addEventListener('resize', initFloatingCardPositions)"
                )
                print("[Phase16-Fix] ✓ initFloatingCardPositions added after sanitizeBattlefieldTerrain()")
            else:
                # Try after onMounted opening
                old_onmount = "onMounted(async () => {"
                if old_onmount in content:
                    content = content.replace(
                        old_onmount,
                        old_onmount + "\n  initFloatingCardPositions()\n  window.addEventListener('resize', initFloatingCardPositions)"
                    )
                    print("[Phase16-Fix] ✓ initFloatingCardPositions added at onMounted start")

    # ============================================================
    # PATCH 3: 确保 onUnmounted 中清理拖拽监听器
    # ============================================================
    old_unmount = """  document.removeEventListener('keydown', onDiceKeyDown)
})"""
    new_unmount = """  document.removeEventListener('keydown', onDiceKeyDown)
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragEnd)
  window.removeEventListener('resize', initFloatingCardPositions)
})"""
    
    if old_unmount in content and 'onDragMove' not in content:
        content = content.replace(old_unmount, new_unmount)
        print("[Phase16-Fix] ✓ onUnmounted cleanup added")

    with open(BATTLEVIEW_VUE, 'w') as f:
        f.write(content)
    
    print("[Phase16-Fix] All patches applied to NewBattleView.vue")

if __name__ == '__main__':
    patch()
