#!/usr/bin/env python3
"""
Phase 9 Feature 2: 打通自定义地形库 CRUD
1. 在 glossary-skill-config.json 扩展 terrains 节点
2. 在 NewBattlefieldView.vue 增加自定义地形管理弹窗
3. 后端 configLoader 支持 terrains 读写
"""
import json, os

CONFIG_PATH = '/root/original-project/services/combat-service/src/config/glossary-skill-config.json'
VUE_PATH = '/root/original-project/frontend/src/views/NewBattlefieldView.vue'
LOADER_PATH = '/root/original-project/services/combat-service/src/services/combatCore/configLoader.cjs'

changes = 0

# === 1. 扩展 config.json 增加 terrains 节点 ===
with open(CONFIG_PATH) as f:
    config = json.load(f)

if 'terrains' not in config:
    config['terrains'] = {
        "moon":      {"name": "月面",       "color": "#c0c0c0", "move_cost": 1, "defense_bonus": 0,  "is_destructible": False, "max_hp": 0, "destroyed_transform_to": "moon"},
        "plain":     {"name": "平原",       "color": "#7a9b4f", "move_cost": 1, "defense_bonus": 0,  "is_destructible": False, "max_hp": 0, "destroyed_transform_to": "plain"},
        "mountain":  {"name": "山地",       "color": "#8b7355", "move_cost": 3, "defense_bonus": 20, "is_destructible": False, "max_hp": 0, "destroyed_transform_to": "mountain"},
        "water":     {"name": "水域",       "color": "#4682b4", "move_cost": 99,"defense_bonus": -10,"is_destructible": False, "max_hp": 0, "destroyed_transform_to": "water"},
        "forest":    {"name": "森林",       "color": "#2d5a27", "move_cost": 2, "defense_bonus": 15, "is_destructible": True,  "max_hp": 3, "destroyed_transform_to": "plain"},
        "fortress":  {"name": "堡垒",       "color": "#4a4a6a", "move_cost": 1, "defense_bonus": 30, "is_destructible": True,  "max_hp": 5, "destroyed_transform_to": "plain"},
        "ruins":     {"name": "废墟",       "color": "#696969", "move_cost": 2, "defense_bonus": 10, "is_destructible": False, "max_hp": 0, "destroyed_transform_to": "ruins"},
        "crystal":   {"name": "晶矿",       "color": "#7b68ee", "move_cost": 2, "defense_bonus": 5,  "is_destructible": True,  "max_hp": 2, "destroyed_transform_to": "plain"},
    }
    config['_meta']['version'] = '4.0'
    config['_meta']['description'] = '机甲战棋词条库中枢配置 — 含技能 + 地形 + 可破坏环境'
    config['_meta']['date'] = '2026-06-20 19:20:00'
    
    with open(CONFIG_PATH, 'w') as f:
        json.dump(config, f, ensure_ascii=False, indent=2)
    changes += 1
    print('[1/5] terrains node added to glossary-skill-config.json')
else:
    print('[1/5] terrains node already exists - SKIP')

# === 2. 在 NewBattlefieldView.vue 添加自定义地形管理弹窗 ===
with open(VUE_PATH) as f:
    vue = f.read()

vue_lines = vue.split('\n')

# Find the template end
template_end = None
for i, line in enumerate(vue_lines):
    if '</template>' in line:
        template_end = i
        break

if template_end:
    terrain_mgr_modal = '''
    <!-- Phase9: 自定义地形管理弹窗 -->
    <div v-if="showTerrainMgr" class="terrain-mgr-overlay" @click.self="showTerrainMgr=false">
      <div class="terrain-mgr-panel">
        <div class="terrain-mgr-header">
          <span>[ 自定义地形管理 ]</span>
          <button class="tm-close" @click="showTerrainMgr=false">✕</button>
        </div>
        <div class="terrain-mgr-body">
          <div v-for="(def, key) in editableTerrains" :key="key" class="tm-item">
            <div class="tm-item-header">
              <input v-model="editableTerrains[key].name" class="tm-input-name" placeholder="地形名" />
              <span class="tm-swatch" :style="{background: editableTerrains[key].color||'#888'}"></span>
              <input v-model="editableTerrains[key].color" class="tm-input-color" placeholder="#hex" />
            </div>
            <div class="tm-row">
              <label>移动消耗<input v-model.number="editableTerrains[key].move_cost" type="number" min="0" class="tm-input-num" /></label>
              <label>防御修正<input v-model.number="editableTerrains[key].defense_bonus" type="number" class="tm-input-num" /></label>
              <label>可破坏<input type="checkbox" v-model="editableTerrains[key].is_destructible" /></label>
            </div>
            <div v-if="editableTerrains[key].is_destructible" class="tm-row">
              <label>最大HP<input v-model.number="editableTerrains[key].max_hp" type="number" min="1" class="tm-input-num" /></label>
              <label>破坏后→
                <select v-model="editableTerrains[key].destroyed_transform_to" class="tm-select">
                  <option v-for="k in Object.keys(editableTerrains)" :key="k" :value="k">{{ editableTerrains[k]?.name || k }}</option>
                </select>
              </label>
            </div>
            <button class="tm-delete" @click="deleteTerrainType(key)">删除</button>
          </div>
          <div class="tm-add-row">
            <input v-model="newTerrainKey" class="tm-input-name" placeholder="新地形KEY" />
            <button class="btn-batch" @click="addTerrainType">添加地形</button>
          </div>
        </div>
        <div class="terrain-mgr-footer">
          <button class="btn-save" @click="saveTerrainConfig">保存地形库</button>
          <span v-if="terrainSaveMsg" class="batch-result">{{ terrainSaveMsg }}</span>
        </div>
      </div>
    </div>
'''
    vue_lines = vue_lines[:template_end] + terrain_mgr_modal.split('\n') + vue_lines[template_end:]
    changes += 1
    print('[2/5] Terrain management modal added to template')

# === 3. Add script state & methods ===
# Find the terrainTypes definition
terrain_types_idx = None
for i, line in enumerate(vue_lines):
    if 'const terrainTypes = Object.entries(UNIVERSAL_TERRAIN_MAP)' in line:
        terrain_types_idx = i
        break

if terrain_types_idx:
    # Find the end of this block
    for j in range(terrain_types_idx, min(terrain_types_idx+15, len(vue_lines))):
        if vue_lines[j].strip() == '})':
            terrain_types_end = j + 1
            break
    
    terrain_mgr_state = """
// Phase9: 自定义地形库管理
const showTerrainMgr = ref(false)
const editableTerrains = reactive({})
const newTerrainKey = ref('')
const terrainSaveMsg = ref('')

// 从 glossary API 加载全量地形定义
async function loadTerrainDefinitions() {
  try {
    const res = await fetch('/api/combat/glossary-config')
    const data = await res.json()
    if (data.terrains) {
      Object.keys(editableTerrains).forEach(k => delete editableTerrains[k])
      Object.entries(data.terrains).forEach(([k, v]) => {
        editableTerrains[k] = { ...v }
      })
    }
  } catch (e) {
    console.warn('加载地形定义失败, 使用默认值', e)
  }
}

function addTerrainType() {
  const key = newTerrainKey.value.trim()
  if (!key) return
  if (editableTerrains[key]) { terrainSaveMsg.value = 'KEY 已存在!'; return }
  editableTerrains[key] = {
    name: key, color: '#888888', move_cost: 1, defense_bonus: 0,
    is_destructible: false, max_hp: 0, destroyed_transform_to: 'moon'
  }
  newTerrainKey.value = ''
  terrainSaveMsg.value = `已添加: ${key}`
  setTimeout(() => { terrainSaveMsg.value = '' }, 2000)
}

function deleteTerrainType(key) {
  if (!confirm(`确认删除地形 "${key}"?`)) return
  delete editableTerrains[key]
  terrainSaveMsg.value = `已删除: ${key}`
  setTimeout(() => { terrainSaveMsg.value = '' }, 2000)
}

async function saveTerrainConfig() {
  try {
    const current = await fetch('/api/combat/glossary-config').then(r => r.json())
    current.terrains = JSON.parse(JSON.stringify(editableTerrains))
    current._meta = current._meta || {}
    current._meta.date = new Date().toISOString().replace('T',' ').substring(0,19)
    const res = await fetch('/api/combat/glossary-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(current)
    })
    if (res.ok) {
      terrainSaveMsg.value = '地形库保存成功!'
      addLog('terrain', '地形库配置已保存')
    } else {
      terrainSaveMsg.value = '保存失败: ' + (await res.json()).error
    }
  } catch (e) {
    terrainSaveMsg.value = '网络错误: ' + e.message
  }
  setTimeout(() => { terrainSaveMsg.value = '' }, 3000)
}

// 初始化加载
loadTerrainDefinitions()
"""
    vue_lines = vue_lines[:terrain_types_end] + [''] + terrain_mgr_state.split('\n') + vue_lines[terrain_types_end:]
    changes += 1
    print('[3/5] Terrain mgr state & methods added')

# === 4. Add terrain mgr button in toolbar ===
# Find the map-info-bar section with export button
export_btn_idx = None
for i, line in enumerate(vue_lines):
    if 'btn-export' in line and '<button' in line:
        export_btn_idx = i
        break

if export_btn_idx:
    # Insert terrain mgr button after export
    mgr_btn = """        <button class="btn-export" @click="showTerrainMgr=true;loadTerrainDefinitions()">[ 地形管理 ]</button>"""
    vue_lines = vue_lines[:export_btn_idx+1] + [mgr_btn] + vue_lines[export_btn_idx+1:]
    changes += 1
    print('[4/5] Terrain mgr button added to toolbar')

# === 5. Add CSS styles for terrain manager modal ===
style_close = None
for i in range(len(vue_lines)-1, -1, -1):
    if '</style>' in vue_lines[i]:
        style_close = i
        break

if style_close:
    terrain_css = """
/* ===== Phase9: 地形管理弹窗 ===== */
.terrain-mgr-overlay {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.75);
  z-index: 1000;
  display: flex; align-items: center; justify-content: center;
}
.terrain-mgr-panel {
  background: #0a1628;
  border: 1px solid #ffb000;
  border-radius: 4px;
  width: 580px;
  max-height: 80vh;
  display: flex; flex-direction: column;
  box-shadow: 0 0 40px rgba(255,176,0,0.15);
}
.terrain-mgr-header {
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255,176,0,0.2);
  display: flex; justify-content: space-between; align-items: center;
  font-size: 14px; color: #ffb000; font-weight: 700; letter-spacing: 2px;
}
.tm-close {
  background: none; border: none; color: #ffb000; font-size: 18px; cursor: pointer;
}
.tm-close:hover { color: #ff4444; }
.terrain-mgr-body {
  padding: 12px 16px;
  overflow-y: auto;
  flex: 1;
}
.tm-item {
  background: rgba(0,0,0,0.3);
  border: 1px solid rgba(159,142,120,0.2);
  padding: 8px;
  margin-bottom: 8px;
}
.tm-item-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.tm-input-name {
  width: 100px; padding: 3px 6px;
  background: rgba(0,0,0,0.5); color: #c1e8ff;
  border: 1px solid rgba(159,142,120,0.4); font-size: 11px; font-family: monospace;
}
.tm-input-color {
  width: 72px; padding: 3px 6px;
  background: rgba(0,0,0,0.5); color: #c1e8ff;
  border: 1px solid rgba(159,142,120,0.4); font-size: 11px; font-family: monospace;
}
.tm-swatch { width: 16px; height: 16px; border: 1px solid rgba(255,255,255,0.3); flex-shrink: 0; }
.tm-row { display: flex; gap: 16px; align-items: center; margin: 4px 0; font-size: 10px; color: #9f8e78; }
.tm-row label { display: flex; align-items: center; gap: 4px; }
.tm-input-num {
  width: 48px; padding: 2px 4px;
  background: rgba(0,0,0,0.5); color: #c1e8ff;
  border: 1px solid rgba(159,142,120,0.4); font-size: 11px; font-family: monospace; text-align: center;
}
.tm-select {
  padding: 2px 4px;
  background: rgba(0,0,0,0.5); color: #c1e8ff;
  border: 1px solid rgba(159,142,120,0.4); font-size: 10px; font-family: monospace;
}
.tm-delete {
  margin-top: 4px; padding: 2px 8px;
  background: rgba(255,0,0,0.15); color: #ff6666;
  border: 1px solid rgba(255,0,0,0.3); font-size: 10px; cursor: pointer;
}
.tm-delete:hover { background: rgba(255,0,0,0.3); }
.tm-add-row { display: flex; gap: 8px; align-items: center; margin-top: 12px; }
.terrain-mgr-footer {
  padding: 10px 16px; border-top: 1px solid rgba(255,176,0,0.2);
  display: flex; align-items: center; gap: 12px;
}
"""
    vue_lines = vue_lines[:style_close] + terrain_css.split('\n') + vue_lines[style_close:]
    changes += 1
    print('[5/5] Terrain mgr CSS added')

# Write back
with open(VUE_PATH, 'w') as f:
    f.write('\n'.join(vue_lines))
print(f'DONE: {changes}/5 changes applied for terrain CRUD')
