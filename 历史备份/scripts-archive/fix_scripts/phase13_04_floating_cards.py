#!/usr/bin/env python3
"""
Phase 13 Task 3: NewBattleView.vue — 悬浮可拖拽折叠 UI 卡片改造

将右侧行动栏与下方角色栏改造为可交互悬浮卡片面板:
1. 独立拖拽 (mousedown/mousemove/mouseup)
2. 展开/折叠 (动画 collapse)
"""
import re

BATTLEVIEW_VUE = "/root/original-project/frontend/src/views/NewBattleView.vue"

def patch():
    with open(BATTLEVIEW_VUE, 'r') as f:
        content = f.read()

    # ============================================================
    # PATCH 1: 将右侧 <aside class="dm-action-panel"> 包装为悬浮卡片
    # ============================================================
    old_action_panel_start = """    <!-- ===== RIGHT: Action Panel ===== -->
    <aside class="dm-action-panel">"""
    
    new_action_panel_start = """    <!-- ===== RIGHT: Action Panel (Floating Draggable Collapsible) ===== -->
    <div
      class="floating-card floating-action-panel"
      :class="{ collapsed: actionPanelCollapsed }"
      :style="{ left: actionPanelPos.left + 'px', top: actionPanelPos.top + 'px' }"
      ref="actionPanelRef"
    >
      <!-- Phase 13: 抓取条 (Drag Bar) -->
      <div class="floating-card-dragbar" @mousedown.stop="startDrag($event, 'actionPanel')">
        <span class="floating-card-title">⚔ 行动面板</span>
        <button class="floating-card-collapse-btn" @click.stop="toggleActionPanel" :title="actionPanelCollapsed ? '展开' : '折叠'">
          {{ actionPanelCollapsed ? '▶' : '◀' }}
        </button>
      </div>
      <!-- Phase 13: 卡片内容 (折叠时隐藏) -->
      <div class="floating-card-body" v-show="!actionPanelCollapsed">"""

    if old_action_panel_start in content:
        content = content.replace(old_action_panel_start, new_action_panel_start)
        print("[Phase13-Task3] ✓ Action panel floating wrapper added (start)")
    else:
        print("[Phase13-Task3] ⚠ Could not find dm-action-panel opening tag")

    # ============================================================
    # PATCH 2: 关闭 dm-action-panel → 关闭 floating-card
    # ============================================================
    old_action_panel_end = """    </aside>
  </div>
</template>"""
    
    new_action_panel_end = """      </div><!-- end floating-card-body -->
    </div><!-- end floating-card -->
  </div>
</template>"""

    if old_action_panel_end in content:
        content = content.replace(old_action_panel_end, new_action_panel_end)
        print("[Phase13-Task3] ✓ Action panel floating wrapper added (end)")
    else:
        # Try alternative end pattern
        alt_end = """      </div>
    </aside>
  </div>
</template>"""
        if alt_end in content:
            content = content.replace(alt_end, new_action_panel_end)
            print("[Phase13-Task3] ✓ Action panel floating wrapper added (alt end)")
        else:
            print("[Phase13-Task3] ⚠ Could not find dm-action-panel closing tag")

    # ============================================================
    # PATCH 3: 将底部 faction-boxes 包装为悬浮卡片
    # ============================================================
    old_faction_start = """      <!-- Faction Boxes (bottom) -->
      <div class="faction-boxes">"""
    
    new_faction_start = """      <!-- ===== Phase 13: Faction Panel (Floating Draggable Collapsible) ===== -->
      <div
        class="floating-card floating-faction-panel"
        :class="{ collapsed: factionPanelCollapsed }"
        :style="{ left: factionPanelPos.left + 'px', top: factionPanelPos.top + 'px' }"
        ref="factionPanelRef"
      >
        <div class="floating-card-dragbar" @mousedown.stop="startDrag($event, 'factionPanel')">
          <span class="floating-card-title">🗂️ 阵营单位</span>
          <button class="floating-card-collapse-btn" @click.stop="toggleFactionPanel" :title="factionPanelCollapsed ? '展开' : '折叠'">
            {{ factionPanelCollapsed ? '▶' : '◀' }}
          </button>
        </div>
        <div class="floating-card-body" v-show="!factionPanelCollapsed">
      <!-- Faction Boxes (bottom) -->
      <div class="faction-boxes">"""

    if old_faction_start in content:
        content = content.replace(old_faction_start, new_faction_start)
        print("[Phase13-Task3] ✓ Faction panel floating wrapper added (start)")
    else:
        print("[Phase13-Task3] ⚠ Could not find faction-boxes opening")

    # ============================================================
    # PATCH 4: 关闭 faction-boxes → 关闭 floating-card
    # ============================================================
    old_faction_end = """      </div>
    </main>"""
    
    new_faction_end = """      </div>
        </div><!-- end floating-card-body -->
      </div><!-- end floating-card -->
    </main>"""

    if old_faction_end in content:
        content = content.replace(old_faction_end, new_faction_end)
        print("[Phase13-Task3] ✓ Faction panel floating wrapper added (end)")
    else:
        print("[Phase13-Task3] ⚠ Could not find faction-boxes closing / </main>")

    # ============================================================
    # PATCH 5: 在 script setup 中添加拖拽/折叠响应式状态和方法
    # ============================================================
    # 在 terrainMap 声明后插入悬浮卡片状态管理
    old_terrain_map = """const terrainMap = reactive({})  // Phase 13: 地形数据容器的值现已为标准化对象 { terrain_id, terrain_hp, is_destructible, max_hp, destroyed_transform_to }"""
    
    floating_state = """
// ================================================================
//  Phase 13: 悬浮可拖拽折叠卡片状态管理
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

    if old_terrain_map in content:
        content = content.replace(old_terrain_map, old_terrain_map + floating_state)
        print("[Phase13-Task3] ✓ Floating card state management added")
    else:
        # Fallback: insert after "const terrainMap = reactive({})" without annotation
        fallback_terrain = "const terrainMap = reactive({})"
        if fallback_terrain in content:
            content = content.replace(fallback_terrain, fallback_terrain + floating_state)
            print("[Phase13-Task3] ✓ Floating card state added (fallback)")
        else:
            print("[Phase13-Task3] ⚠ Could not find terrainMap declaration for floating state")

    # ============================================================
    # PATCH 6: 在 onMounted 中初始化卡片位置 + onUnmounted 清理
    # ============================================================
    old_init = "    // Canvas 初始化已迁移至 HexGridCanvas 组件内部"

    new_init = """    // Phase 13: 初始化悬浮卡片位置 & 窗口 resize 监听
    initFloatingCardPositions()
    window.addEventListener('resize', initFloatingCardPositions)

    // Canvas 初始化已迁移至 HexGridCanvas 组件内部"""

    if old_init in content:
        content = content.replace(old_init, new_init)
        print("[Phase13-Task3] ✓ Floating card init in onMounted")
    else:
        # Try to find near sanitize call
        old_sanitizer_call = "  sanitizeBattlefieldTerrain()"
        if old_sanitizer_call in content:
            content = content.replace(
                old_sanitizer_call,
                old_sanitizer_call + "\n  initFloatingCardPositions()\n  window.addEventListener('resize', initFloatingCardPositions)"
            )
            print("[Phase13-Task3] ✓ Floating card init added (sanitizer location)")

    # onUnmounted 添加清理
    old_unmount = """onUnmounted(() => {
  document.removeEventListener('keydown', onDiceKeyDown)
})"""
    
    new_unmount = """onUnmounted(() => {
  document.removeEventListener('keydown', onDiceKeyDown)
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragEnd)
  window.removeEventListener('resize', initFloatingCardPositions)
})"""

    if old_unmount in content:
        content = content.replace(old_unmount, new_unmount)
        print("[Phase13-Task3] ✓ Floating card cleanup in onUnmounted")
    else:
        print("[Phase13-Task3] ⚠ Could not find onUnmounted")

    # ============================================================
    # PATCH 7: CSS — 替换 dm-action-panel 和 faction-boxes 的定位
    # 将固定布局改为 absolute 定位的悬浮卡片
    # ============================================================
    
    # 7a: 替换 dm-action-panel CSS 为 floating-card CSS
    old_action_css_start = """/* ===== RIGHT ACTION PANEL ===== */
.dm-action-panel {
  flex-shrink: 0;
  width: 200px;
  min-width: 200px;
  background: rgba(8,51,68,0.95);
  border-left: 1px solid rgba(255,176,0,0.1);
  display: flex;
  flex-direction: column;
  padding: 16px 10px;
  gap: 12px;
  overflow-y: auto;
  min-height: 0;
  max-height: 100vh;
  transition: all 0.3s;
}

.dm-action-panel.hidden {
  opacity: 0.4;
}"""
    
    new_action_css = """/* ===== Phase 13: FLOATING CARD OVERRIDE (replaces old dm-action-panel) ===== */
/* 老版 dm-action-panel 被悬浮卡片替代，保留样式仅作回退引用 */
.dm-action-panel {
  display: none !important; /* 已被 floating-card 替代 */
}

/* ===== Phase 13: Floating Card System ===== */
.floating-card {
  position: fixed;
  z-index: 100;
  background: rgba(8,51,68,0.96);
  border: 1px solid rgba(255,176,0,0.25);
  border-radius: 6px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.5), 0 0 60px rgba(255,176,0,0.05);
  transition: height 0.3s ease, border-color 0.2s;
  min-width: 200px;
  max-width: 420px;
  user-select: none;
  overflow: hidden;
}

.floating-card:hover {
  border-color: rgba(255,176,0,0.4);
}

.floating-card.collapsed {
  min-width: auto;
  width: auto !important;
}

.floating-card-dragbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: rgba(0,0,0,0.3);
  border-bottom: 1px solid rgba(255,176,0,0.12);
  cursor: grab;
  font-size: 10px;
  font-family: 'Fira Code', monospace;
  letter-spacing: 1px;
}

.floating-card-dragbar:active {
  cursor: grabbing;
}

.floating-card-title {
  color: #ffb000;
  font-weight: 700;
  text-transform: uppercase;
  font-size: 10px;
}

.floating-card-collapse-btn {
  width: 24px;
  height: 24px;
  padding: 0;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.12);
  color: #9f8e78;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
  transition: all 0.15s;
}

.floating-card-collapse-btn:hover {
  background: rgba(255,176,0,0.15);
  color: #ffb000;
  border-color: rgba(255,176,0,0.3);
}

.floating-card-body {
  overflow-y: auto;
  max-height: 70vh;
  transition: max-height 0.3s ease, opacity 0.2s;
  padding: 0;
}

/* 行动面板特定样式 */
.floating-action-panel {
  width: 220px;
}

.floating-action-panel .floating-card-body {
  padding: 12px 10px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* 阵营面板特定样式 */
.floating-faction-panel {
  width: auto;
  max-width: 95vw;
}

.floating-faction-panel .floating-card-body {
  padding: 8px;
  max-height: 50vh;
}"""

    if old_action_css_start in content:
        content = content.replace(old_action_css_start, new_action_css)
        print("[Phase13-Task3] ✓ Floating card CSS added")
    else:
        print("[Phase13-Task3] ⚠ Could not find dm-action-panel CSS")

    # ============================================================
    # PATCH 8: 移除非悬浮卡片的 faction-boxes 的位置限制（让其在卡片内自由排列）
    # ============================================================
    # faction-boxes CSS 中移除 fixed bottom 定位相关, 保持 flex 布局
    old_faction_css = """.faction-boxes {
  display: flex;
  gap: 12px;
  padding: 10px 0 12px;
  flex-shrink: 0;
  overflow-x: auto;
  min-height: 140px;
  border-top: 1px solid rgba(255,176,0,0.12);
  margin-top: 6px;
}"""

    # 在浮动面板中，不需要 margin-top 和 border-top
    new_faction_css = """.faction-boxes {
  display: flex;
  gap: 12px;
  padding: 6px 0;
  flex-shrink: 0;
  overflow-x: auto;
  min-height: 100px;
}"""

    if old_faction_css in content:
        content = content.replace(old_faction_css, new_faction_css)
        print("[Phase13-Task3] ✓ Faction boxes CSS updated for floating mode")
    else:
        print("[Phase13-Task3] ⚠ Could not find faction-boxes CSS")
        # Try alternative patterns
        pattern2 = re.search(r'(\.faction-boxes\s*\{[^}]*\})', content)
        if pattern2:
            print("[Phase13-Task3] ! faction-boxes CSS found but format differs, skipping")

    with open(BATTLEVIEW_VUE, 'w') as f:
        f.write(content)

    print("[Phase13-Task3] ✓ All floating card patches applied to NewBattleView.vue")

if __name__ == '__main__':
    patch()
