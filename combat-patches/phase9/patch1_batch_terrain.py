#!/usr/bin/env python3
"""
Phase 9 Feature 1: 地图编辑器 — 坐标区间批量地形修改器
在 NewBattlefieldView.vue 的地形调色板下方插入批量操作面板
"""
import re

PATH = '/root/original-project/frontend/src/views/NewBattlefieldView.vue'
with open(PATH) as f:
    c = f.read()

changes = 0
lines = c.split('\n')

# === 1. 在 terrain-palette 闭合后、spacing-bar 前插入批量面板模板 ===
batch_panel_tpl = '''
    <!-- Phase9: 区间批量地形修改器 -->
    <div class="batch-panel">
      <div class="batch-title">[ 区间批量修改 ]</div>
      <div class="batch-row">
        <label class="batch-label">起点</label>
        <input v-model.number="batchStartQ" type="number" min="0" class="batch-input" placeholder="Q" />
        <input v-model.number="batchStartR" type="number" min="0" class="batch-input" placeholder="R" />
        <label class="batch-label">终点</label>
        <input v-model.number="batchEndQ" type="number" min="0" class="batch-input" placeholder="Q" />
        <input v-model.number="batchEndR" type="number" min="0" class="batch-input" placeholder="R" />
      </div>
      <div class="batch-row">
        <select v-model="batchTerrain" class="batch-select">
          <option v-for="t in allTerrainTypes" :key="t.id" :value="t.id">{{ t.name }}</option>
        </select>
        <button class="btn-batch" @click="applyBatchTerrain">批量修改</button>
        <span v-if="batchResult" class="batch-result">{{ batchResult }}</span>
      </div>
    </div>
'''

# Find the </div> that closes terrain-palette
terrain_palette_end_idx = None
for i, line in enumerate(lines):
    if 'terrain-palette' in line and line.strip().startswith('</div>'):
        # This is likely the closing div after the palette items
        terrain_palette_end_idx = i
        # But we need the closing of the outer terrain-palette div
        break

# Better approach: find the spacing-bar section and insert before it
spacing_bar_idx = None
for i, line in enumerate(lines):
    if 'class="spacing-bar"' in line:
        spacing_bar_idx = i
        break

if spacing_bar_idx:
    # Insert before spacing-bar (go back to find the div before it)
    insert_at = spacing_bar_idx - 1
    lines = lines[:insert_at] + batch_panel_tpl.split('\n') + lines[insert_at:]
    changes += 1
    print('[1/4] Batch panel template inserted')

# === 2. Add reactive state variables for batch operation ===
# Find the section after brush state variables
brush_section_end = None
for i, line in enumerate(lines):
    if "const brush = ref('moon')" in line:
        for j in range(i, min(i+30, len(lines))):
            if 'const saving' in lines[j] or 'const saveStatus' in lines[j]:
                brush_section_end = j
                break
        break

if brush_section_end:
    batch_state = """// Phase9: 批量地形修改器状态
const batchStartQ = ref(0)
const batchStartR = ref(0)
const batchEndQ = ref(0)
const batchEndR = ref(0)
const batchTerrain = ref('moon')
const batchResult = ref('')
"""
    lines = lines[:brush_section_end] + batch_state.split('\n') + lines[brush_section_end:]
    changes += 1
    print('[2/4] Batch state variables inserted')

# === 3. Add applyBatchTerrain function ===
# Find the selectBrush function
select_brush_idx = None
for i, line in enumerate(lines):
    if 'function selectBrush' in line:
        select_brush_idx = i
        break

if select_brush_idx:
    batch_fn = """// Phase9: 批量应用地形
function applyBatchTerrain() {
  const sq = Math.min(batchStartQ.value, batchEndQ.value)
  const eq = Math.max(batchStartQ.value, batchEndQ.value)
  const sr = Math.min(batchStartR.value, batchEndR.value)
  const er = Math.max(batchStartR.value, batchEndR.value)
  let count = 0
  for (let r = sr; r <= er; r++) {
    for (let q = sq; q <= eq; q++) {
      if (q >= 0 && q < gridW.value && r >= 0 && r < gridH.value) {
        terrainMap[`${q},${r}`] = batchTerrain.value
        count++
      }
    }
  }
  batchResult.value = `已修改 ${count} 个格子为 ${batchTerrain.value}`
  hexGrid.value?.redraw()
  addLog('batch', `区间[${sq},${sr}]→[${eq},${er}] 地形 → ${batchTerrain.value} (${count}格)`)
  setTimeout(() => { batchResult.value = '' }, 3000)
}
"""
    # Insert before selectBrush
    lines = lines[:select_brush_idx] + batch_fn.split('\n') + lines[select_brush_idx:]
    changes += 1
    print('[3/4] applyBatchTerrain function inserted')

# === 4. Add CSS styles for batch panel ===
# Find the closing </style> tag
style_close_idx = None
for i in range(len(lines)-1, -1, -1):
    if '</style>' in lines[i]:
        style_close_idx = i
        break

if style_close_idx:
    batch_css = """/* ===== Phase9: 批量地形修改器 ===== */
.batch-panel {
  padding: 10px 0;
  border-top: 1px solid rgba(159,142,120,0.15);
  border-bottom: 1px solid rgba(159,142,120,0.15);
  margin: 6px 0;
  flex-shrink: 0;
  pointer-events: auto;
}
.batch-title {
  font-size: 11px;
  color: #ffd597;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 6px;
}
.batch-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}
.batch-label {
  font-size: 9px;
  color: #9f8e78;
  text-transform: uppercase;
  min-width: 24px;
}
.batch-input {
  width: 48px;
  padding: 3px 4px;
  background: rgba(0,0,0,0.5);
  color: #c1e8ff;
  border: 1px solid rgba(159,142,120,0.4);
  font-size: 11px;
  font-family: 'Fira Code', monospace;
  text-align: center;
}
.batch-input:focus {
  border-color: #ffb000;
  outline: none;
}
.batch-select {
  padding: 4px 8px;
  background: rgba(0,0,0,0.5);
  color: #c1e8ff;
  border: 1px solid rgba(159,142,120,0.4);
  font-size: 11px;
  font-family: 'Fira Code', monospace;
}
.batch-select:focus {
  border-color: #ffb000;
  outline: none;
}
.btn-batch {
  padding: 4px 14px;
  background: rgba(255,176,0,0.2);
  color: #ffb000;
  border: 1px solid rgba(255,176,0,0.4);
  font-size: 11px;
  cursor: pointer;
  font-family: monospace;
}
.btn-batch:hover {
  background: rgba(255,176,0,0.4);
}
.batch-result {
  font-size: 10px;
  color: #00ff41;
  font-family: 'Fira Code', monospace;
  margin-left: 8px;
}
"""
    lines = lines[:style_close_idx] + batch_css.split('\n') + lines[style_close_idx:]
    changes += 1
    print('[4/4] Batch panel CSS inserted')

# Write back
c = '\n'.join(lines)
with open(PATH, 'w') as f:
    f.write(c)
print(f'DONE: {changes}/4 changes applied to NewBattlefieldView.vue')
