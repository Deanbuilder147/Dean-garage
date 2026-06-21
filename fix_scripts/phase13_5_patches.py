#!/usr/bin/env python3
"""
Phase 13.5 纯增量补丁: Sidebar 指挥官鉴权联动 + 新建地图 10-200 动态尺寸解锁

两项任务:
  A. TheSidebar.vue - 指挥官区域注入当前登录 ID + 退出登录按钮
  B. NewBattlefieldView.vue - 新建地图弹窗 (10-200 动态尺寸)
  C. NewLoginView.vue - 登录成功时持久化 user 对象到 localStorage

设计红线: 不改动 CTM 管线/逆矩阵拾取/伤害管道/后端 API
"""

import os
import sys

BASE = '/root/original-project/frontend/src'

def patch_a_thesidebar():
    """A. TheSidebar.vue: 指挥官鉴权联动 + 退出按钮"""
    fp = os.path.join(BASE, 'components/layout/TheSidebar.vue')
    with open(fp, 'r') as f:
        lines = f.readlines()

    # --- 1. Template: 在 profile-info 的 [ username ] 下方注入退出按钮 ---
    # 策略: 找到 `军衔` 所在行 → 下一行即为 `</div>` (profile-info closing)
    # → 再下一行即为 `</div>` (sidebar-profile closing) → 在它之前插入
    logout_tpl = """      <button class="logout-btn" @click="handleLogout" title="退出登录">↩ 退出</button>
"""
    inserted_tpl = False
    for i, line in enumerate(lines):
        if '军衔' in line and 'userRank' in line:
            # line i: <p>军衔: {{ userRank }}</p>
            # line i+1: </div> (closes profile-info)
            # line i+2: </div> (closes sidebar-profile)
            # Insert before line i+2
            j = i + 1
            # Find the next </div> that closes sidebar-profile
            # It's the outer </div> after profile-info's </div>
            found_first_div = False
            while j < len(lines):
                stripped = lines[j].strip()
                if stripped == '</div>':
                    if not found_first_div:
                        found_first_div = True  # profile-info closing
                        j += 1
                        continue
                    else:
                        # This is the sidebar-profile closing
                        lines.insert(j, logout_tpl)
                        print(f'[OK] TheSidebar: 退出按钮注入到 line {j+1} (军衔行={i+1})')
                        inserted_tpl = True
                        break
                j += 1
            break

    if not inserted_tpl:
        print('[FAIL] TheSidebar: 未找到模板注入点 (军衔行)')
        return False

    with open(fp, 'w') as f:
        f.writelines(lines)

    # --- 2. Script: 添加 useRouter, handleLogout, username fallback ---
    with open(fp, 'r') as f:
        lines = f.readlines()

    # 2a. Add useRouter import
    for i, line in enumerate(lines):
        if "import { useRoute } from 'vue-router'" in line:
            lines.insert(i + 1, "import { useRouter } from 'vue-router'\n")
            print(f'[OK] TheSidebar: useRouter import 注入到 line {i+2}')
            break
    else:
        print('[FAIL] TheSidebar: 未找到 useRoute import')
        return False

    # 2b. Add router instance after userStore
    for i, line in enumerate(lines):
        if line.strip() == "const sidebarCollapsed = ref(false)":
            lines.insert(i, "const router = useRouter()\n")
            print(f'[OK] TheSidebar: router ref 注入到 line {i+1}')
            break
    else:
        print('[FAIL] TheSidebar: 未找到 sidebarCollapsed')
        return False

    # 2c. Add handleLogout function (before </script>)
    logout_fn = """
function handleLogout() {
  // 清除所有本地鉴权数据
  localStorage.clear()
  userStore.clearUser()
  // 重定向回登录页
  router.push('/login')
}
"""

    for i in range(len(lines) - 1, -1, -1):
        if '</script>' in lines[i]:
            lines.insert(i, logout_fn)
            print(f'[OK] TheSidebar: handleLogout 函数注入到 line {i+1}')
            break
    else:
        print('[FAIL] TheSidebar: 未找到 </script>')
        return False

    with open(fp, 'w') as f:
        f.writelines(lines)

    # --- 3. CSS: 退出按钮样式 ---
    with open(fp, 'r') as f:
        lines = f.readlines()

    logout_css = """
.logout-btn {
  margin-top: 6px;
  padding: 4px 10px;
  background: rgba(255,77,77,0.08);
  border: 1px solid rgba(255,77,77,0.2);
  color: rgba(255,77,77,0.7);
  font-size: 10px;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.15s;
  font-family: inherit;
  letter-spacing: 1px;
}

.logout-btn:hover {
  background: rgba(255,77,77,0.2);
  color: #ff6b6b;
  border-color: rgba(255,77,77,0.4);
}
"""
    for i in range(len(lines) - 1, -1, -1):
        if '</style>' in lines[i]:
            lines.insert(i, logout_css)
            print(f'[OK] TheSidebar: logout-btn 样式注入到 line {i+1}')
            break

    with open(fp, 'w') as f:
        f.writelines(lines)

    return True


def patch_b_newlogin():
    """C. NewLoginView.vue: 登录时持久化 user 对象 + 注册后也存储"""
    fp = os.path.join(BASE, 'views/NewLoginView.vue')
    with open(fp, 'r') as f:
        lines = f.readlines()

    # Fix 1: Add useUserStore import
    for i, line in enumerate(lines):
        if "import { authAPI } from '@/api/client'" in line:
            lines.insert(i + 1, "import { useUserStore } from '@/stores/user'\n")
            print(f'[OK] NewLoginView: useUserStore import 注入到 line {i+2}')
            break

    # Fix 2: Add userStore instance
    for i, line in enumerate(lines):
        if 'const router = useRouter()' in line:
            lines.insert(i + 1, "const userStore = useUserStore()\n")
            print(f'[OK] NewLoginView: userStore 实例注入到 line {i+2}')
            break

    # Fix 3: After localStorage.setItem('token', data.token), add user storage
    for i, line in enumerate(lines):
        if "localStorage.setItem('token', data.token)" in line and 'handleLogin' in '\n'.join(lines[max(0,i-15):i+1]):
            indent = '    '
            lines.insert(i + 1, f'{indent}if (data.user) {{\n')
            lines.insert(i + 2, f'{indent}  localStorage.setItem(\'user\', JSON.stringify(data.user))\n')
            lines.insert(i + 3, f'{indent}  userStore.setUser(data.user)\n')
            lines.insert(i + 4, f'{indent}}}\n')
            print(f'[OK] NewLoginView: user 持久化注入到 handleLogin 中 (line {i+1})')
            break

    # Fix 4: After register's localStorage.setItem('token', data.token)
    for i, line in enumerate(lines):
        if "localStorage.setItem('token', data.token)" in line and 'handleRegister' in '\n'.join(lines[max(0,i-15):i+1]):
            indent = '    '
            lines.insert(i + 1, f'{indent}if (data.user) {{\n')
            lines.insert(i + 2, f'{indent}  localStorage.setItem(\'user\', JSON.stringify(data.user))\n')
            lines.insert(i + 3, f'{indent}  userStore.setUser(data.user)\n')
            lines.insert(i + 4, f'{indent}}}\n')
            print(f'[OK] NewLoginView: user 持久化注入到 handleRegister 中 (line {i+1})')
            break

    with open(fp, 'w') as f:
        f.writelines(lines)

    return True


def patch_c_newbattlefield():
    """B. NewBattlefieldView.vue: 新建地图弹窗 (10-200 动态尺寸)"""
    fp = os.path.join(BASE, 'views/NewBattlefieldView.vue')
    with open(fp, 'r') as f:
        lines = f.readlines()

    # --- 1. Template: 在 btn-export "[ 地形管理 ]" 后添加 "新建地图" 按钮 ---
    newmap_btn = '        <button class="btn-export" @click="showNewMapModal = true">[ 新建地图 ]</button>\n'
    for i, line in enumerate(lines):
        if 'showTerrainMgr=true;loadTerrainDefinitions()' in line:
            lines.insert(i + 1, newmap_btn)
            print(f'[OK] NewBattlefieldView: 新建地图按钮注入到 line {i+2}')
            break

    # --- 2. Template: 在 <!-- 地形管理弹窗 --> 前注入新建地图弹窗 ---
    newmap_modal = """
    <!-- Phase 13.5: 新建地图弹窗 -->
    <div v-if="showNewMapModal" class="terrain-mgr-overlay" @click.self="showNewMapModal=false">
      <div class="terrain-mgr-panel" style="max-width: 420px;">
        <div class="terrain-mgr-header">
          <span>[ 新建地图 ]</span>
          <button class="tm-close" @click="showNewMapModal=false">✕</button>
        </div>
        <div class="terrain-mgr-body" style="display:flex;flex-direction:column;gap:16px;padding:20px;">
          <div style="display:flex;gap:20px;align-items:center;">
            <div style="flex:1;">
              <label style="display:block;color:#c1e8ff;font-size:11px;margin-bottom:6px;">宽度 (列) · 10–200</label>
              <input v-model.number="newMapWidth" type="number" min="10" max="200"
                style="width:100%;background:rgba(0,0,0,0.3);border:1px solid rgba(255,176,0,0.3);color:#f1f3fc;padding:8px 10px;border-radius:4px;font-size:15px;font-family:'Fira Code',monospace;" />
            </div>
            <span style="color:rgba(255,176,0,0.4);font-size:18px;margin-top:20px;">×</span>
            <div style="flex:1;">
              <label style="display:block;color:#c1e8ff;font-size:11px;margin-bottom:6px;">高度 (行) · 10–200</label>
              <input v-model.number="newMapHeight" type="number" min="10" max="200"
                style="width:100%;background:rgba(0,0,0,0.3);border:1px solid rgba(255,176,0,0.3);color:#f1f3fc;padding:8px 10px;border-radius:4px;font-size:15px;font-family:'Fira Code',monospace;" />
            </div>
          </div>
          <div style="color:rgba(241,243,252,0.4);font-size:10px;text-align:center;">
            总计 {{ newMapWidth * newMapHeight }} 格 · 最小 100 格 · 最大 40,000 格
          </div>
          <div v-if="newMapError" style="color:#ff4d4d;font-size:11px;text-align:center;">{{ newMapError }}</div>
        </div>
        <div class="terrain-mgr-footer">
          <button class="btn-save" @click="createNewMap" style="width:100%;">确认创建</button>
        </div>
      </div>
    </div>
"""
    inserted_modal = False
    for i, line in enumerate(lines):
        if '<!-- 地形管理弹窗 -->' in line or '地形管理弹窗' in line:
            lines.insert(i, newmap_modal)
            print(f'[OK] NewBattlefieldView: 新建地图弹窗注入到 line {i+1}')
            inserted_modal = True
            break

    if not inserted_modal:
        # Fallback: find terrain-mgr-overlay and insert before it
        for i, line in enumerate(lines):
            if 'terrain-mgr-overlay' in line and 'showTerrainMgr' in line:
                lines.insert(i, newmap_modal)
                print(f'[OK] NewBattlefieldView: 新建地图弹窗注入到 line {i+1}')
                inserted_modal = True
                break

    if not inserted_modal:
        print('[FAIL] NewBattlefieldView: 未找到弹窗注入点')
        return False

    with open(fp, 'w') as f:
        f.writelines(lines)

    # --- 3. Script: 添加 newMapWidth/newMapHeight/showNewMapModal ---
    with open(fp, 'r') as f:
        lines = f.readlines()

    # Inject refs after mapLoadStatus
    newmap_refs = """// Phase 13.5: 新建地图弹窗状态
const showNewMapModal = ref(false)
const newMapWidth = ref(15)
const newMapHeight = ref(10)
const newMapError = ref('')
"""
    for i, line in enumerate(lines):
        if "const mapLoadStatus = ref('')" in line:
            lines.insert(i + 1, newmap_refs)
            print(f'[OK] NewBattlefieldView: newMap refs 注入到 line {i+2}')
            break

    # --- 4. Script: 注入 createNewMap 函数 (在 saveMap 前) ---
    create_newmap_fn = """
// Phase 13.5: 根据输入的 width/height 创建新地图
function createNewMap() {
  newMapError.value = ''
  const w = newMapWidth.value
  const h = newMapHeight.value

  // 刚性约束
  if (w < 10 || w > 200 || h < 10 || h > 200) {
    newMapError.value = '尺寸必须在 10–200 范围内'
    return
  }
  if (!Number.isInteger(w) || !Number.isInteger(h)) {
    newMapError.value = '尺寸必须为整数'
    return
  }

  // 清空旧地形
  Object.keys(terrainMap).forEach(k => delete terrainMap[k])

  // 动态设置 battlefield 的 width/height
  battlefield.value = {
    id: null,
    name: `新战场 ${w}x${h}`,
    width: w,
    height: h,
    terrainData: {},
  }

  showNewMapModal.value = false
  saveStatus.value = `已创建 ${w}×${h} 地图`

  // 触发 HexGridCanvas 重绘 + 滑槽边界重算
  nextTick(() => {
    hexGrid.value?.redraw()
  })

  addLog('system', `新建地图: ${w}×${h} (${w * h} 格)`)
}
"""
    for i, line in enumerate(lines):
        if 'async function saveMap()' in line or 'function saveMap()' in line or 'function saveMap' in line:
            lines.insert(i, create_newmap_fn)
            print(f'[OK] NewBattlefieldView: createNewMap 函数注入到 line {i+1}')
            break

    with open(fp, 'w') as f:
        f.writelines(lines)

    return True


def main():
    print("=== Phase 13.5 补丁开始 ===")
    errors = []

    if not patch_a_thesidebar():
        errors.append('A: TheSidebar 失败')

    if not patch_b_newlogin():
        errors.append('C: NewLoginView 失败')

    if not patch_c_newbattlefield():
        errors.append('B: NewBattlefieldView 失败')

    if errors:
        print(f'\n[!] 部分失败: {", ".join(errors)}')
    else:
        print('\n=== Phase 13.5 补丁全部成功 ===')

    return 0 if not errors else 1


if __name__ == '__main__':
    sys.exit(main())
