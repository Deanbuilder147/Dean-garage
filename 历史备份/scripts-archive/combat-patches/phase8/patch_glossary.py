#!/usr/bin/env python3
"""
Phase 8 — Patch 1/3: GlossaryView.vue 全字段平铺化
删除高级参数折叠，平铺10个全字段（6基础 + 4骰子），
移除 UNIVERSAL_FIELDS/advancedOpen/getAdvancedParams/toggleAdvanced
"""
import re

PATH = '/root/original-project/frontend/src/views/GlossaryView.vue'

with open(PATH, 'r') as f:
    content = f.read()

ch = 0

# 1. 删除 advancedOpen
content = content.replace("const advancedOpen = reactive({})\n", "")
ch += 1
print('[1/8] advancedOpen removed')

# 2. 删除 UNIVERSAL_FIELDS
m = re.search(r'// 5 个通用字段名.*?\nconst UNIVERSAL_FIELDS = new Set\(\[.*?\]\)\n', content, re.DOTALL)
if m:
    content = content.replace(m.group(0), "")
    ch += 1
    print('[2/8] UNIVERSAL_FIELDS removed')

# 3. 删除 getAdvancedParams
m = re.search(r'// 获取高级参数.*?\nfunction getAdvancedParams\(skill\) \{\n.*?\n\}\n', content, re.DOTALL)
if m:
    content = content.replace(m.group(0), "")
    ch += 1
    print('[3/8] getAdvancedParams removed')

# 4. 删除 toggleAdvanced
old = "// 折叠/展开高级参数\nfunction toggleAdvanced(key) {\n  advancedOpen[key] = !advancedOpen[key]\n}\n"
content = content.replace(old, "")
ch += 1
print('[4/8] toggleAdvanced removed')

# 5. 替换 addNewSkill
old = """function addNewSkill() {
  const timestamp = Date.now()
  const newKey = 'new_skill_' + timestamp
  editableConfig.skills[newKey] = {
    type: 'active',
    label: '新词条',
    category: 'melee',
    description: '',
    target_filter: 'enemy',
    cast_range: 1,
    aoe_radius: 0,
    base_damage: 0,
    status_effects: [],
    deterministic: true
  }
  skillKeyEdits[newKey] = newKey
  advancedOpen[newKey] = false
}"""
new = """function addNewSkill() {
  const timestamp = Date.now()
  const newKey = 'new_skill_' + timestamp
  editableConfig.skills[newKey] = {
    type: 'active',
    label: '新词条',
    category: 'melee',
    description: '',
    target_filter: 'enemy',
    cast_range: 1,
    aoe_radius: 0,
    base_damage: 0,
    status_effects: [],
    dice_type: '1d6',
    success_line: 4,
    success_bonus_damage: 0,
    is_manual_roll: false,
    deterministic: true
  }
  skillKeyEdits[newKey] = newKey
}"""
content = content.replace(old, new)
ch += 1
print('[5/8] addNewSkill updated')

# 6. 替换 deleteSkill
old = """function deleteSkill(key) {
  if (!confirm(`确认删除词条「${editableConfig.skills[key]?.label || key}」？此操作需保存后生效。`)) return
  pendingDeletes.value.push(key)
  delete editableConfig.skills[key]
  delete skillKeyEdits[key]
  delete advancedOpen[key]
}"""
new = """function deleteSkill(key) {
  if (!confirm(`确认删除词条「${editableConfig.skills[key]?.label || key}」？此操作需保存后生效。`)) return
  pendingDeletes.value.push(key)
  delete editableConfig.skills[key]
  delete skillKeyEdits[key]
}"""
content = content.replace(old, new)
ch += 1
print('[6/8] deleteSkill updated')

# 7. 替换模板：高级参数 → 骰子平铺
old = """            <!-- 高级参数 (可折叠) -->
            <div class="advanced-section">
              <button
                class="btn btn-toggle-advanced"
                @click="toggleAdvanced(key)"
              >
                {{ advancedOpen[key] ? '\u25bc' : '\u25b6' }} 高级参数 (类型专属)
              </button>
              <div v-if="advancedOpen[key]" class="advanced-body">
                <div class="advanced-params">
                  <div v-for="(val, pkey) in getAdvancedParams(skill)" :key="pkey" class="param-row">
                    <span class="param-key">{{ pkey }}</span>
                    <input
                      v-if="editMode && typeof val !== 'boolean'"
                      v-model="skill[pkey]"
                      :type="typeof val === 'number' ? 'number' : 'text'"
                      class="param-input"
                      :class="{ 'param-text': typeof val === 'string' }"
                    />
                    <span v-else-if="editMode && typeof val === 'boolean'" class="param-value">
                      <input type="checkbox" v-model="skill[pkey]" /> {{ skill[pkey] ? '是' : '否' }}
                    </span>
                    <span v-else class="param-value">{{ val }}</span>
                  </div>
                  <div v-if="Object.keys(getAdvancedParams(skill)).length === 0" class="advanced-empty">
                    无类型专属参数
                  </div>
                </div>
              </div>
            </div>"""
new = """            <!-- 动作掷骰属性 (平铺) -->
            <div class="dice-fields">
              <div class="dice-section-label">[ 动作掷骰属性 ]</div>
              <div class="uf-row">
                <!-- dice_type -->
                <label class="param-row">
                  <span class="param-key">骰子类型</span>
                  <input
                    v-if="editMode"
                    v-model="skill.dice_type"
                    type="text"
                    class="param-input param-text"
                    placeholder="1d6"
                  />
                  <span v-else class="param-value">{{ skill.dice_type || '1d6' }}</span>
                </label>

                <!-- success_line -->
                <label class="param-row">
                  <span class="param-key">成功线</span>
                  <input
                    v-if="editMode"
                    v-model.number="skill.success_line"
                    type="number" min="1" max="20" step="1"
                    class="param-input"
                  />
                  <span v-else class="param-value">{{ skill.success_line ?? 4 }}+</span>
                </label>

                <!-- success_bonus_damage -->
                <label class="param-row">
                  <span class="param-key">成功追加</span>
                  <input
                    v-if="editMode"
                    v-model.number="skill.success_bonus_damage"
                    type="number" step="1"
                    class="param-input"
                  />
                  <span v-else class="param-value">+{{ skill.success_bonus_damage ?? 0 }}</span>
                </label>

                <!-- is_manual_roll -->
                <label class="param-row">
                  <span class="param-key">手动摇骰</span>
                  <template v-if="editMode">
                    <input type="checkbox" v-model="skill.is_manual_roll" />
                    <span class="param-value">{{ skill.is_manual_roll ? 'ON' : 'OFF' }}</span>
                  </template>
                  <span v-else class="param-value">{{ skill.is_manual_roll ? '⚡ 手动' : '自动' }}</span>
                </label>
              </div>
            </div>"""
content = content.replace(old, new)
ch += 1
print('[7/8] Template replaced: advanced → dice fields')

# 8. 添加骰子 CSS
dice_css = """
/* 骰子属性区域 */
.dice-fields { margin-top: 8px; padding-top: 10px; border-top: 1px solid rgba(255,176,0,0.1); }
.dice-section-label {
  font-size: 9px; color: rgba(255,176,0,0.4); letter-spacing: 2px;
  margin-bottom: 6px; text-transform: uppercase;
}
"""
content = content.replace('.status-checkbox { display: none; }\n', '.status-checkbox { display: none; }\n' + dice_css)
ch += 1
print('[8/8] Dice CSS added')

with open(PATH, 'w') as f:
    f.write(content)

print(f'\n=== GlossaryView.vue: {ch}/8 patches applied ===')
