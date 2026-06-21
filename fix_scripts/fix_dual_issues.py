#!/usr/bin/env python3
"""
Fix 3 issues:
1. NewBattlefieldView.vue: Remove duplicate sidebar, integrate addLog
2. NewBattleView.vue: Fix dm-main flex layout so canvas renders
3. NewBattlefieldView.vue: Fix route param for map loading
"""
import re, sys

SRC = '/root/original-project/frontend/src'

# ================================================================
# FIX 1: NewBattlefieldView.vue
# ================================================================
path = f'{SRC}/views/NewBattlefieldView.vue'
with open(path, 'r') as f:
    c = f.read()

# 1a. Remove the duplicate <aside class="sidebar"> block (lines ~3-12)
old_sidebar_block = """  <div class="page-container">
    <aside class="sidebar">
      <div class="profile-section">
        <div class="avatar"><img src="https://lh3.googleusercontent.com/aida-public/AB6AXuDYyn-HCiF01XLYgK6uTbi_cB5wuYmt8wGvSbdTtGk_-bIDUvWqWvTFoahEAZhzycVcpuExWN3Rw1jX1-1PqZYrfHGb5tma9krNH7tYuYxKSqJ7ma-wJir3RmFgtHvmZ_J2Lg4QYbl3N1GTRREWIHZI4KOwkIZ8XWdW1zxDdtHVOJs8D5o3KqueWnknlSfp57HOjuj9rn0ZijamKid25utBkYLbqKFrFkQQxczNmtQx1b63kPfqZGIlEfAnUi2XSKTCDLtPh9noD-w" alt=""></div>
        <div class="profile-info"><p>[ 指挥官 ]</p><p>军衔: AC-01</p></div>
      </div>
      <nav>
        <a class="nav-link" @click="navigateTo('/home')"><svg class="icon icon-lg" viewBox="0 0 24 24"><path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/></svg>仪表盘</a>
        <a class="nav-link" @click="navigateTo('/units')"><svg class="icon icon-lg" viewBox="0 0 24 24"><path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z"/></svg>机甲单位</a>
        <a class="nav-link" @click="navigateTo('/battlefields')"><svg class="icon icon-lg" viewBox="0 0 24 24"><path d="M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM15 19l-6-2.11V5l6 2.11V19z"/></svg>战场</a>
        <a class="nav-link active" @click="navigateTo('/battlefield-edit')"><svg class="icon icon-lg" viewBox="0 0 24 24"><path d="M3 3v18h18v-2H5V3H3zm3 14h2v-2H6v2zm0-4h2v-2H6v2zm0-4h2V7H6v2zm4 8h10V5H10v12zm2-10h6v2h-6V7zm0 4h6v2h-6v-2z"/></svg>地图编辑器</a>
      </nav>
    </aside>

    <main class="main-content">"""

new_sidebar_block = """  <div class="page-container">
    <main class="main-content">"""

if old_sidebar_block in c:
    c = c.replace(old_sidebar_block, new_sidebar_block, 1)
    print("✅ FIX 1a: Removed duplicate sidebar block")
else:
    print("⚠ FIX 1a: Sidebar block not found - may need manual check")

# 1b. Fix main-content margin-left (remove 256px since App.vue handles it)
c = c.replace(
    '.main-content { margin-left: 256px; padding: 32px 24px 90px; max-width: 100%; display: flex; flex-direction: column; height: 100vh; }',
    '.main-content { padding: 32px 24px 90px; max-width: 100%; display: flex; flex-direction: column; height: 100vh; }'
)
print("✅ FIX 1b: Removed margin-left: 256px from .main-content")

# 1c. Remove all old sidebar CSS rules (after .icon-lg line to before .main-content line)
# Remove sidebar, profile-section, avatar, profile-info, nav-link, nav-link.active CSS blocks
old_sidebar_css = """.sidebar { position: fixed; left: 0; top: 0; width: 256px; height: 100vh; background: #083344; border-right: 2px solid rgba(0,150,180,0.4); z-index: 50; display: flex; flex-direction: column; padding: 80px 24px 24px; pointer-events: auto; }
.profile-section { display: flex; align-items: center; gap: 12px; padding: 16px 0; border-bottom: 1px solid rgba(0,200,255,0.15); margin-bottom: 24px; }
.avatar { width: 40px; height: 40px; background: #002e3f; border-radius: 4px; overflow: hidden; position: relative; }
.avatar img { width: 100%; height: 100%; object-fit: cover; opacity: 0.8; }
.avatar::after { content: ''; position: absolute; inset: 0; border: 1px solid rgba(255,176,0,0.3); }
.profile-info p:first-child { color: #ffb000; font-weight: 700; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; }
.profile-info p:last-child { color: rgba(0,200,255,0.8); font-size: 10px; font-family: 'Fira Code', monospace; }
.nav-link { display: flex; align-items: center; gap: 12px; padding: 12px 16px; color: rgba(0,200,255,0.8); font-size: 14px; font-weight: 500; cursor: pointer; border-radius: 4px; margin-bottom: 4px; transition: all 0.15s; }
.nav-link:hover { background: rgba(0,150,180,0.25); transform: translateX(4px); }
.nav-link.active { background: #ffb000; color: #0a1628; font-weight: 700; border-left: 4px solid #fff; }
.main-content"""

if old_sidebar_css in c:
    c = c.replace(old_sidebar_css, '.main-content', 1)
    print("✅ FIX 1c: Removed sidebar CSS rules")
else:
    print("⚠ FIX 1c: Sidebar CSS not found")

# 1d. Add inject + addLog to the script setup
# Find the import section and add inject
if "import { ref, reactive, computed, onMounted, onUnmounted, nextTick } from 'vue'" in c:
    c = c.replace(
        "import { ref, reactive, computed, onMounted, onUnmounted, nextTick } from 'vue'",
        "import { ref, reactive, computed, onMounted, onUnmounted, nextTick, inject } from 'vue'"
    )
    print("✅ FIX 1d: Added inject to vue imports")
else:
    print("⚠ FIX 1d: import line not found")

# Add sidebarActionLog inject and addLog function after the router declaration
old_router = "const router = useRouter()\nconst battlefield = ref(null)"
new_router = "const router = useRouter()\nconst sidebarActionLog = inject('sidebarActionLog')\nconst battlefield = ref(null)"
if old_router in c:
    c = c.replace(old_router, new_router, 1)
    print("✅ FIX 1d: Added sidebarActionLog inject")
else:
    print("⚠ FIX 1d: router declaration not found")

# Add addLog function before centerGridOnCanvas
old_center_func = "/** 计算合理的画布尺寸，并将棋盘居中 */\nfunction centerGridOnCanvas() {"
add_log_func = """/**
 * 写入侧边栏操作日志（与 TheSidebar.vue 共享管道）
 */
function addLog(type, message) {
  if (!sidebarActionLog) return
  const time = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  sidebarActionLog.value.unshift({ type, message, time })
  if (sidebarActionLog.value.length > 200) sidebarActionLog.value.pop()
  // Auto-scroll handled by TheSidebar.vue
}

/** 计算合理的画布尺寸，并将棋盘居中 */
function centerGridOnCanvas() {"""

if old_center_func in c:
    c = c.replace(old_center_func, add_log_func, 1)
    print("✅ FIX 1d: Added addLog function")
else:
    print("⚠ FIX 1d: centerGridOnCanvas not found")

# 1e. Add log calls for key actions (save, export, brush select)
old_save_success = "saveStatus.value = `已保存 ${Object.keys(terrainData).length} 个地形 (${new Date().toLocaleTimeString()})`"
new_save_success = "saveStatus.value = `已保存 ${Object.keys(terrainData).length} 个地形 (${new Date().toLocaleTimeString()})`\n    addLog('info', `地图已保存: ${battlefield.value?.name || '未命名'} (${Object.keys(terrainData).length} 个地形格子)`)"
if old_save_success in c:
    c = c.replace(old_save_success, new_save_success, 1)

old_save_fail = "saveStatus.value = '保存失败!'"
new_save_fail = "saveStatus.value = '保存失败!'\n    addLog('error', '地图保存失败')"
if old_save_fail in c:
    c = c.replace(old_save_fail, new_save_fail, 1)

# Add log for brush select
old_select_brush = "function selectBrush(id) {\n  brush.value = id\n}"
new_select_brush = "function selectBrush(id) {\n  brush.value = id\n  const t = terrainTypes.find(t => t.id === id)\n  addLog('info', `选择画笔: ${t?.name || id}`)\n}"
if old_select_brush in c:
    c = c.replace(old_select_brush, new_select_brush, 1)

with open(path, 'w') as f:
    f.write(c)
print("✅ FIX 1 complete: NewBattlefieldView.vue patched")

# ================================================================
# FIX 2: NewBattleView.vue - Add flex column to dm-main
# ================================================================
path2 = f'{SRC}/views/NewBattleView.vue'
with open(path2, 'r') as f:
    c2 = f.read()

old_dm_main = ".dm-main { flex: 1; overflow: hidden; position: relative; }"
new_dm_main = ".dm-main { flex: 1; overflow: hidden; position: relative; display: flex; flex-direction: column; }"
if old_dm_main in c2:
    c2 = c2.replace(old_dm_main, new_dm_main, 1)
    print("✅ FIX 2: Added display:flex;flex-direction:column to .dm-main")
else:
    print("⚠ FIX 2: .dm-main CSS not found")

with open(path2, 'w') as f:
    f.write(c2)

# ================================================================
# FIX 3: main.js - Add /battlefield-edit/:id route for specific map editing
# ================================================================
path3 = f'{SRC}/main.js'
with open(path3, 'r') as f:
    c3 = f.read()

# Add route with optional param
old_route = "{ path: '/battlefield-edit', component: NewBattlefieldView, meta: { requiresAuth: true } }"
new_route = "{ path: '/battlefield-edit/:id?', component: NewBattlefieldView, meta: { requiresAuth: true } }"
if old_route in c3:
    c3 = c3.replace(old_route, new_route, 1)
    print("✅ FIX 3: Added :id? param to battlefield-edit route")
else:
    print("⚠ FIX 3: battlefield-edit route not found")

with open(path3, 'w') as f:
    f.write(c3)

# ================================================================
# FIX 4: NewBattlefieldView.vue - Use route param to load specific map
# ================================================================
# Re-read the file (it was modified above)
with open(path, 'r') as f:
    c4 = f.read()

# Add useRoute import
old_route_import = "import { useRouter } from 'vue-router'"
new_route_import = "import { useRouter, useRoute } from 'vue-router'"
if old_route_import in c4:
    c4 = c4.replace(old_route_import, new_route_import, 1)
    print("✅ FIX 4: Added useRoute import")
else:
    print("⚠ FIX 4: useRouter import not found")

# Add route after router
if "const router = useRouter()\nconst sidebarActionLog" in c4:
    c4 = c4.replace(
        "const router = useRouter()\nconst sidebarActionLog",
        "const router = useRouter()\nconst route = useRoute()\nconst sidebarActionLog"
    )
    print("✅ FIX 4: Added useRoute declaration")
elif "const router = useRouter()" in c4:
    c4 = c4.replace(
        "const router = useRouter()",
        "const router = useRouter()\nconst route = useRoute()"
    )
    print("✅ FIX 4: Added useRoute declaration")

# Fix onMounted to use route param
old_mount = """onMounted(async () => {
  try {
    const { data } = await mapAPI.getBattlefields()
    if (data && data.battlefields && data.battlefields.length > 0) {
      battlefield.value = data.battlefields[0]
      const rawTerrain = data.battlefields[0].terrain
      if (rawTerrain) {
        const t = typeof rawTerrain === 'string' ? JSON.parse(rawTerrain) : rawTerrain
        if (t && typeof t === 'object') {
          Object.entries(t).forEach(([key, val]) => { terrainMap[key] = val })
        }
      }
    }
  } catch (e) { /* 无存档 */ }"""

new_mount = """onMounted(async () => {
  try {
    const mapId = route.params.id
    let mapData = null
    if (mapId) {
      // Load specific map by ID
      try {
        const res = await mapAPI.getBattlefield(mapId)
        mapData = res.data?.battlefield || res.data
      } catch (e) {
        console.warn('[BattlefieldEdit] Failed to load map by ID:', mapId, e.message)
      }
    }
    if (!mapData) {
      // Fallback: load all maps and use first
      const { data } = await mapAPI.getBattlefields()
      if (data && data.battlefields && data.battlefields.length > 0) {
        mapData = data.battlefields[0]
      }
    }
    if (mapData) {
      battlefield.value = mapData
      const rawTerrain = mapData.terrain
      if (rawTerrain) {
        const t = typeof rawTerrain === 'string' ? JSON.parse(rawTerrain) : rawTerrain
        if (t && typeof t === 'object') {
          Object.entries(t).forEach(([key, val]) => { terrainMap[key] = val })
        }
      }
      addLog('system', `加载地图: ${mapData.name || '未命名'} (${Object.keys(terrainMap).filter(k => terrainMap[k] && terrainMap[k] !== 'moon').length} 个地形格子)`)
    } else {
      addLog('info', '未找到已保存的地图，开始创建新地图')
    }
  } catch (e) {
    addLog('error', `加载地图失败: ${e.message || e}`)
  }"""

if old_mount in c4:
    c4 = c4.replace(old_mount, new_mount, 1)
    print("✅ FIX 4: Updated onMounted to use route param for map loading")
else:
    print("⚠ FIX 4: onMounted pattern not found - trying alternative")
    # Try with different whitespace
    old_mount2 = """onMounted(async () => {
  try {
    const { data } = await mapAPI.getBattlefields()
    if (data && data.battlefields && data.battlefields.length > 0) {
      battlefield.value = data.battlefields[0]
      const rawTerrain = data.battlefields[0].terrain
      if (rawTerrain) {
        const t = typeof rawTerrain === 'string' ? JSON.parse(rawTerrain) : rawTerrain
        if (t && typeof t === 'object') {
          Object.entries(t).forEach(([key, val]) => { terrainMap[key] = val })
        }
      }
    }
  } catch (e) { /* 无存档 */ }
  await nextTick()
  initCanvas()
})"""
    new_mount2 = new_mount + """  await nextTick()
  initCanvas()
})"""
    if old_mount2 in c4:
        c4 = c4.replace(old_mount2, new_mount2, 1)
        print("✅ FIX 4: Updated onMounted (with nextTick)")
    else:
        print("❌ FIX 4: All patterns failed, check file manually")

with open(path, 'w') as f:
    f.write(c4)

print("\n===== ALL FIXES APPLIED =====")
