#!/usr/bin/env python3
"""
Phase 13 Task 1-B: NewBattlefieldView.vue — 添加【🗺️ 加载旧地图】下拉框
在工具栏顶部添加地图列表下拉选择，动态异步拉取列表，选中后加载
"""
import re

BATTLEFIELD_VUE = "/root/original-project/frontend/src/views/NewBattlefieldView.vue"

def patch():
    with open(BATTLEFIELD_VUE, 'r') as f:
        content = f.read()

    # === PATCH 1: 在 map-info-bar 末尾 (地形管理按钮之后) 添加地图加载下拉 ===
    old_bar_end = """        <button class="btn-export" @click="showTerrainMgr=true;loadTerrainDefinitions()">[ 地形管理 ]</button>
      </div>"""

    new_bar_end = """        <button class="btn-export" @click="showTerrainMgr=true;loadTerrainDefinitions()">[ 地形管理 ]</button>
        <div class="map-load-group">
          <select v-model="selectedMapFile" @change="onSelectMapFile" class="map-load-select">
            <option value="">🗺️ 加载旧地图...</option>
            <option v-for="m in mapFileList" :key="m.filename" :value="m.filename">
              {{ m.name }} ({{ m.width }}×{{ m.height }})
            </option>
          </select>
          <span v-if="mapLoadStatus" class="map-load-status">{{ mapLoadStatus }}</span>
        </div>
      </div>"""

    if old_bar_end in content:
        content = content.replace(old_bar_end, new_bar_end)
        print("[Phase13-Task1B] ✓ Map load dropdown added to template")
    else:
        print("[Phase13-Task1B] ⚠ Could not find terrain-manager btn, trying alternate match...")
        # 备选: 匹配 map-info-bar 的末尾 </div>
        alt_pattern = '        <button class="btn-export" @click="exportJSON">📤 导出 JSON</button>\n      </div>'
        if alt_pattern in content:
            # 在第一个 btn-export 后面插入, 放在第二个按钮之间
            alt_new = '        <button class="btn-export" @click="exportJSON">📤 导出 JSON</button>\n        <div class="map-load-group">\n          <select v-model="selectedMapFile" @change="onSelectMapFile" class="map-load-select">\n            <option value="">🗺️ 加载旧地图...</option>\n            <option v-for="m in mapFileList" :key="m.filename" :value="m.filename">\n              {{ m.name }} ({{ m.width }}×{{ m.height }})\n            </option>\n          </select>\n          <span v-if="mapLoadStatus" class="map-load-status">{{ mapLoadStatus }}</span>\n        </div>\n      </div>'
            content = content.replace(alt_pattern, alt_new)
            print("[Phase13-Task1B] ✓ Map load dropdown added (alt match)")
        else:
            print("[Phase13-Task1B] ✗ ALL MATCHES FAILED - template may have changed")

    # === PATCH 2: 添加响应式状态 ===
    old_refs = """const saveStatus = ref('就绪')"""
    new_refs = """const saveStatus = ref('就绪')

// Phase 13: 地图文件列表 & 选中状态
const mapFileList = ref([])
const selectedMapFile = ref('')
const mapLoadStatus = ref('')"""

    if old_refs in content:
        content = content.replace(old_refs, new_refs)
        print("[Phase13-Task1B] ✓ Map list refs added")
    else:
        print("[Phase13-Task1B] ⚠ Could not find saveStatus ref")

    # === PATCH 3: 添加加载函数 (在 onMounted 之前) ===
    old_onmount = """//  数据加载 / 保存 / 导出
// ================================================================

onMounted(async () => {"""

    new_onmount = """//  数据加载 / 保存 / 导出
// ================================================================

// Phase 13: 从后端拉取地图文件列表
async function fetchMapFileList() {
  try {
    const res = await fetch('/api/map/list')
    const data = await res.json()
    mapFileList.value = data.maps || []
    if (mapFileList.value.length > 0) {
      addLog('info', `发现 ${mapFileList.value.length} 个已保存的地图文件`)
    }
  } catch (e) {
    console.warn('[MapList] 拉取地图列表失败:', e.message)
  }
}

// Phase 13: 选中地图后加载
async function onSelectMapFile() {
  const filename = selectedMapFile.value
  if (!filename) return
  mapLoadStatus.value = '加载中...'
  try {
    const res = await fetch(`/api/map/list?file=${encodeURIComponent(filename)}`)
    if (!res.ok && res.status === 404) {
      // 回退: 使用原有 getBattlefields 加载
      const { data } = await mapAPI.getBattlefields()
      const maps = data?.battlefields || data?.maps || []
      const found = maps.find(m => m.filename === filename || m.name === filename.replace('.json', ''))
      if (found) {
        await loadMapData(found)
        mapLoadStatus.value = `✓ 已加载: ${found.name || filename}`
        setTimeout(() => { mapLoadStatus.value = '' }, 3000)
        return
      }
      mapLoadStatus.value = '✗ 地图未找到'
      setTimeout(() => { mapLoadStatus.value = '' }, 3000)
      return
    }
    const data = await res.json()
    if (data.battlefield || data.map) {
      await loadMapData(data.battlefield || data.map)
      mapLoadStatus.value = `✓ 已加载: ${(data.battlefield || data.map).name || filename}`
      setTimeout(() => { mapLoadStatus.value = '' }, 3000)
    }
  } catch (e) {
    mapLoadStatus.value = '✗ 加载失败'
    console.error('[MapList] 加载地图失败:', e)
    setTimeout(() => { mapLoadStatus.value = '' }, 3000)
  }
}

// Phase 13: 加载地图数据到编辑器
async function loadMapData(mapData) {
  battlefield.value = mapData
  // 清空现有地形
  Object.keys(terrainMap).forEach(k => delete terrainMap[k])
  // 加载地形数据
  const rawTerrain = mapData.terrain || mapData.terrainData
  if (rawTerrain) {
    const t = typeof rawTerrain === 'string' ? JSON.parse(rawTerrain) : rawTerrain
    if (t && typeof t === 'object') {
      Object.entries(t).forEach(([key, val]) => { terrainMap[key] = val })
    }
  }
  // 恢复 hex 配置
  if (mapData.hexConfig || mapData.hex_config) {
    const hc = mapData.hexConfig || mapData.hex_config
    if (hc.spacingH !== undefined) spacingH.value = hc.spacingH
    if (hc.spacingV !== undefined) spacingV.value = hc.spacingV
    if (hc.offsetFactor !== undefined) offsetFactor.value = hc.offsetFactor
  }
  hexGrid.value?.redraw()
  addLog('system', `加载地图: ${mapData.name || '未命名'} (${Object.keys(terrainMap).filter(k => terrainMap[k] && terrainMap[k] !== 'moon').length} 个地形格子)`)
}

onMounted(async () => {"""

    if old_onmount in content:
        content = content.replace(old_onmount, new_onmount)
        print("[Phase13-Task1B] ✓ Map load functions added")
    else:
        print("[Phase13-Task1B] ⚠ Could not find onMounted section")

    # === PATCH 4: 在 onMounted 中追加 fetchMapFileList() ===
    old_nexttick = """  await nextTick()
  // HexGridCanvas 在 onMounted 中自行初始化 Canvas + 事件绑定"""

    new_nexttick = """  await nextTick()
  // Phase 13: 异步拉取地图文件列表
  fetchMapFileList().catch(() => {})
  // HexGridCanvas 在 onMounted 中自行初始化 Canvas + 事件绑定"""

    if old_nexttick in content:
        content = content.replace(old_nexttick, new_nexttick)
        print("[Phase13-Task1B] ✓ fetchMapFileList() call added to onMounted")
    else:
        print("[Phase13-Task1B] ⚠ Could not find nextTick in onMounted")

    # === PATCH 5: 添加 map-load 组件的 CSS ===
    old_css_end = """.btn-export:hover { background: rgba(255,176,0,0.3); }"""
    new_css_end = """.btn-export:hover { background: rgba(255,176,0,0.3); }

/* Phase 13: 地图加载下拉框 */
.map-load-group {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}
.map-load-select {
  padding: 5px 10px;
  background: rgba(0,0,0,0.4);
  color: #c1e8ff;
  border: 1px solid rgba(255,176,0,0.3);
  font-size: 11px;
  font-family: 'Fira Code', monospace;
  cursor: pointer;
  min-width: 200px;
}
.map-load-select:hover {
  border-color: #ffb000;
}
.map-load-select option {
  background: #001620;
  color: #c1e8ff;
}
.map-load-status {
  font-size: 10px;
  font-family: 'Fira Code', monospace;
  color: #ffb000;
  white-space: nowrap;
}"""

    if old_css_end in content:
        content = content.replace(old_css_end, new_css_end)
        print("[Phase13-Task1B] ✓ Map load CSS added")
    else:
        print("[Phase13-Task1B] ⚠ Could not find btn-export CSS")

    with open(BATTLEFIELD_VUE, 'w') as f:
        f.write(content)

    print("[Phase13-Task1B] ✓ All patches applied to NewBattlefieldView.vue")

if __name__ == '__main__':
    patch()
