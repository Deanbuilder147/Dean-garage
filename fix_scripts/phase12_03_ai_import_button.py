#!/usr/bin/env python3
"""Phase 12.3: AI 技能一键导入按钮
- GlossaryView.vue: 添加"导入AI技能"按钮 + JSON 粘贴弹窗
"""

import re

BASE = '/root/original-project'
glossary_path = f'{BASE}/frontend/src/views/GlossaryView.vue'
with open(glossary_path, 'r') as f:
    content = f.read()

# 1. 在 Wizard toggle 按钮旁边添加 AI Import 按钮
old_wizard_btn = '''      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn" @click="toggleWizard">{{ showWizard ? '关闭向导' : '🧙 万能槽位创建向导' }}</button>
      </div>'''

new_wizard_btn = '''      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn" @click="toggleWizard">{{ showWizard ? '关闭向导' : '🧙 万能槽位创建向导' }}</button>
        <button class="btn btn-ai-import" @click="toggleAiImport">🤖 导入AI技能</button>
      </div>'''

if old_wizard_btn in content:
    content = content.replace(old_wizard_btn, new_wizard_btn)
else:
    # 尝试找到更灵活的模式
    print('[WARN] 未精确匹配 Wizard 按钮，尝试模糊匹配')
    # 直接搜索 toggleWizard 所有出现
    import re as re_mod
    pattern = r'(<button[^>]*@click="toggleWizard"[^>]*>.*?</button>)'
    matches = list(re_mod.finditer(pattern, content))
    if matches:
        m = matches[0]
        old_btn = m.group(0)
        new_btn = old_btn + '\n        <button class="btn btn-ai-import" @click="toggleAiImport">🤖 导入AI技能</button>'
        content = content.replace(old_btn, new_btn)
        print(f'  模糊匹配成功，位置 {m.start()}')

# 2. 在 Wizard overlay 之后添加 AI Import 弹窗
# 找 wizard-overlay 结束位置
wizard_end = content.rfind('</div>\n    <!-- Phase 11:')
if wizard_end == -1:
    wizard_end = content.rfind('</div>\n\n    <!-- 技能列表 -->')

if wizard_end == -1:
    # 尝试找 wizard 相关注释的结束
    wizard_end = content.rfind('<!-- Phase 11: 万能槽位分步创建向导 -->')
    # 在 wizard overlay 的 </div> 结束之后插入
    if wizard_end == -1:
        print('[WARN] 未找到 Wizard overlay 结束位置')
    else:
        # 找到包含 wizard-overlay 的整个 div 块结束
        pos = content.find('toggleWizard', wizard_end)
        pos = content.find('</div>', pos)
        # 这太复杂，换一个策略：直接追加在 </template> 前
        pass

# 更简单：在 </template> 前追加
template_end = content.rfind('</template>')
if template_end > 0:
    ai_import_html = '''
    <!-- Phase 12: AI 技能导入弹窗 -->
    <div v-if="showAiImport" class="wizard-overlay" @click.self="showAiImport=false">
      <div class="wizard-panel ai-import-panel">
        <div class="wizard-header">
          <h2>🤖 导入AI生成技能</h2>
          <button class="btn" @click="showAiImport=false">✕ 关闭</button>
        </div>
        <div class="wizard-body">
          <p class="wizard-desc">粘贴 AI 生成器输出的技能 JSON（支持单个对象或数组）</p>
          <textarea
            v-model="aiImportJson"
            class="ai-import-textarea"
            placeholder='粘贴技能 JSON，例如：
[
  {
    "id": "plasma_storm",
    "name": "等离子风暴",
    "action_type": "attack",
    "damage_kind": "thermal",
    "base_damage": 18,
    "cast_range": 5,
    "dice_type": "1d6",
    "success_line": 4,
    "is_manual_roll": true,
    ...
  }
]'
            rows="12"
          ></textarea>
          <div class="ai-import-actions">
            <button class="btn" @click="showAiImport=false">取消</button>
            <button class="btn btn-primary" @click="importAiSkills">导入技能</button>
          </div>
          <p v-if="aiImportResult" :class="aiImportSuccess ? 'import-success' : 'import-error'">{{ aiImportResult }}</p>
        </div>
      </div>
    </div>'''

    content = content[:template_end] + ai_import_html + '\n' + content[template_end:]

# 3. 添加 JS 响应式状态和方法
# 在 script 中找到 showWizard 变量定义
show_wizard_pos = content.find('const showWizard')
if show_wizard_pos > 0:
    # 在其后添加 AI import 变量
    old_show_wizard = 'const showWizard = ref(false)'
    new_show_wizard = '''const showWizard = ref(false)

// Phase 12: AI 技能导入
const showAiImport = ref(false)
const aiImportJson = ref('')
const aiImportResult = ref('')
const aiImportSuccess = ref(false)'''

    content = content.replace(old_show_wizard, new_show_wizard)

# 4. 添加 importAiSkills 和 toggleAiImport 方法
# 找到 commitWizardSkill 方法定义
wizard_skill_pos = content.find('function commitWizardSkill')
if wizard_skill_pos > 0:
    # 在其后添加 AI import 方法
    # 先找到这个函数的结束位置
    commit_end = content.find('}\n\n', wizard_skill_pos + 50)
    if commit_end > 0:
        ai_import_methods = '''
function toggleAiImport() {
  showAiImport.value = !showAiImport.value
  aiImportResult.value = ''
  aiImportJson.value = ''
}

async function importAiSkills() {
  aiImportResult.value = ''
  if (!aiImportJson.value.trim()) {
    aiImportResult.value = '请粘贴技能 JSON'
    aiImportSuccess.value = false
    return
  }
  try {
    let skills = JSON.parse(aiImportJson.value)
    if (!Array.isArray(skills)) skills = [skills]

    const config = JSON.parse(JSON.stringify(skillsData.value))
    let imported = 0
    let skipped = 0

    for (const skill of skills) {
      if (!skill.id || !skill.name) {
        skipped++
        continue
      }
      // 标准化万能语法字段
      const normalized = {
        id: skill.id,
        name: skill.name,
        label: skill.label || skill.name,
        description: skill.description || '',
        category: skill.category || skill.action_type || 'attack',
        base_damage: skill.base_damage ?? 0,
        cast_range: skill.cast_range ?? 1,
        min_cast_range: skill.min_cast_range ?? 0,
        aoe_radius: skill.aoe_radius ?? 0,
        target_filter: skill.target_filter || 'enemy',
        action_type: skill.action_type || 'attack',
        attack_stat: skill.attack_stat || 'melee',
        damage_kind: skill.damage_kind || 'kinetic',
        dice_type: skill.dice_type || '1d6',
        success_line: skill.success_line ?? 4,
        success_bonus_damage: skill.success_bonus_damage ?? 0,
        is_manual_roll: skill.is_manual_roll ?? false,
        height_bonus_per_diff: skill.height_bonus_per_diff ?? 0,
        accuracy_mod: skill.accuracy_mod ?? 0,
        evasion_mod: skill.evasion_mod ?? 0,
        requires_unmoved: skill.requires_unmoved ?? false,
        requires_stealth: skill.requires_stealth ?? false,
        status_effects: skill.status_effects || [],
        bonuses: skill.bonuses || [],
        damage_kind_modifiers: skill.damage_kind_modifiers || {}
      }

      if (config.skills[skill.id]) {
        // 已有同名技能，询问是否覆盖
        if (!confirm(`技能 "${skill.name}" (${skill.id}) 已存在，是否覆盖？`)) {
          skipped++
          continue
        }
      }
      config.skills[skill.id] = normalized
      imported++
    }

    if (imported > 0) {
      await saveConfig(config)
      skillsData.value = config
      aiImportResult.value = `成功导入 ${imported} 个技能${skipped > 0 ? '，跳过 ' + skipped + ' 个' : ''}`
      aiImportSuccess.value = true
      aiImportJson.value = ''
      setTimeout(() => { aiImportResult.value = ''; showAiImport.value = false }, 2000)
    } else {
      aiImportResult.value = '没有可导入的技能（' + skipped + ' 个被跳过）'
      aiImportSuccess.value = false
    }
  } catch (e) {
    aiImportResult.value = 'JSON 解析失败: ' + e.message
    aiImportSuccess.value = false
  }
}'''

        content = content[:commit_end] + ai_import_methods + content[commit_end:]

# 5. 添加 CSS 样式
style_end = content.rfind('</style>')
if style_end > 0:
    ai_css = '''
/* Phase 12: AI 导入样式 */
.btn-ai-import {
  background: rgba(147, 112, 219, 0.15);
  border: 1px solid rgba(147, 112, 219, 0.25);
  color: #d4b8ff;
}
.btn-ai-import:hover {
  background: rgba(147, 112, 219, 0.25);
  border-color: rgba(147, 112, 219, 0.4);
}
.ai-import-panel { max-width: 540px; }
.ai-import-textarea {
  width: 100%;
  padding: 10px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(159, 142, 120, 0.15);
  color: #c1e8ff;
  font-family: 'Courier New', monospace;
  font-size: 11px;
  line-height: 1.5;
  resize: vertical;
  margin-bottom: 12px;
  border-radius: 4px;
}
.ai-import-textarea:focus {
  border-color: rgba(147, 112, 219, 0.4);
  outline: none;
}
.ai-import-textarea::placeholder { color: rgba(193, 232, 255, 0.25); }
.ai-import-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
.import-success { color: #4caf50; font-size: 12px; margin-top: 8px; }
.import-error { color: #f44336; font-size: 12px; margin-top: 8px; }'''

    content = content[:style_end] + ai_css + '\n' + content[style_end:]

with open(glossary_path, 'w') as f:
    f.write(content)
print('[OK] GlossaryView.vue: AI 技能导入按钮 + 弹窗 + 方法 + CSS 完成')
