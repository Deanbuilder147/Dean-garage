#!/usr/bin/env python3
"""
Phase 11.3 v2: 万能槽位创建向导 (修复版)
"""
import re

BASE = '/root/original-project'

def patch_glossary_wizard():
    path = f'{BASE}/frontend/src/views/GlossaryView.vue'
    with open(path, 'r') as f:
        content = f.read()

    # === 1. 在 action-bar 中添加「向导模式」按钮 ===
    old_action_btn = """      <button
        v-if="editMode"
        class="btn btn-add"
        @click="addNewSkill"
      >
        [ + 添加新词条 ]
      </button>"""

    new_action_btn = """      <button
        v-if="editMode"
        class="btn btn-add"
        @click="addNewSkill"
      >
        [ + 添加新词条 ]
      </button>
      <button
        v-if="editMode"
        class="btn btn-add"
        :class="{ active: showWizard }"
        @click="toggleWizard"
      >
        [ 🧙 分步向导 ]
      </button>"""

    if old_action_btn in content:
        content = content.replace(old_action_btn, new_action_btn)
        print('[OK] 添加「分步向导」按钮')
    else:
        print('[ERROR] action-bar 按钮未找到')
        return

    # === 2. 在词条编辑面板之前插入向导面板 ===
    old_panel_start = '    <!-- 词条编辑面板 -->\n    <div v-else class="glossary-panels">'

    wizard_html = """    <!-- Phase 11: 万能槽位分步创建向导 -->
    <div v-if="showWizard" class="wizard-overlay" @click.self="toggleWizard">
      <div class="wizard-panel">
        <div class="wizard-header">
          <h2>🧙 万能槽位创建向导</h2>
          <span class="wizard-step-indicator">Step {{ wizardStep }}/6 — {{ wizardStepLabel }}</span>
          <button class="btn" @click="toggleWizard">✕ 关闭</button>
        </div>

        <!-- Step 1: 主语 -->
        <div v-if="wizardStep === 1" class="wizard-body">
          <p class="wizard-desc">主语决定技能的触发条件与限制</p>
          <div class="wiz-field"><label>动作类型 (action_type) *</label>
            <select v-model="wizardForm.action_type" class="param-select">
              <option value="attack">攻击 attack</option>
              <option value="heal">治疗 heal</option>
              <option value="buff">增益 buff</option>
              <option value="debuff">减益 debuff</option>
              <option value="passive">被动 passive</option>
            </select></div>
          <div class="wiz-field"><label>攻击属性 (attack_stat)</label>
            <select v-model="wizardForm.attack_stat" class="param-select">
              <option value="melee">近战 melee</option>
              <option value="ranged">远程 ranged</option>
              <option value="max">最高值 max</option>
            </select></div>
          <div class="wiz-check"><input type="checkbox" v-model="wizardForm.requires_unmoved" /> 需要本回合未移动</div>
          <div class="wiz-check"><input type="checkbox" v-model="wizardForm.requires_stealth" /> 需要潜行状态</div>
        </div>

        <!-- Step 2: 谓语 -->
        <div v-if="wizardStep === 2" class="wizard-body">
          <p class="wizard-desc">谓语决定技能的作用对象与范围</p>
          <div class="wiz-field"><label>施放对象 (target_filter) *</label>
            <select v-model="wizardForm.target_filter" class="param-select">
              <option value="enemy">敌方 enemy</option>
              <option value="ally">友方 ally</option>
              <option value="self">自身 self</option>
              <option value="all">全员 all</option>
            </select></div>
          <div class="wiz-field"><label>最大施放距离 (cast_range)</label>
            <input type="number" v-model.number="wizardForm.cast_range" min="0" max="20" class="wiz-input" /></div>
          <div class="wiz-field"><label>最小施放距离 (min_cast_range)</label>
            <input type="number" v-model.number="wizardForm.min_cast_range" min="0" max="20" class="wiz-input" /></div>
          <div class="wiz-field"><label>AOE 溅射半径 (aoe_radius)</label>
            <input type="number" v-model.number="wizardForm.aoe_radius" min="0" max="10" class="wiz-input" /></div>
        </div>

        <!-- Step 3: 定语 -->
        <div v-if="wizardStep === 3" class="wizard-body">
          <p class="wizard-desc">定语决定伤害类型与地形互动</p>
          <div class="wiz-field"><label>伤害类型 (damage_kind)</label>
            <select v-model="wizardForm.damage_kind" class="param-select">
              <option value="kinetic">动能 kinetic</option>
              <option value="beam">光束 beam</option>
              <option value="explosive">爆炸 explosive</option>
              <option value="corrosive">腐蚀 corrosive</option>
              <option value="thermal">热熔 thermal</option>
            </select><small class="wiz-hint">水域对光束×0.5，晶矿对光束×1.5</small></div>
          <div class="wiz-field"><label>分类 (category)</label>
            <select v-model="wizardForm.category" class="param-select">
              <option value="melee">近战 melee</option>
              <option value="ranged">远程 ranged</option>
              <option value="special">特殊 special</option>
              <option value="passive">被动 passive</option>
            </select></div>
          <div class="wiz-field"><label>描述</label>
            <input type="text" v-model="wizardForm.description" placeholder="技能描述..." class="wiz-input" /></div>
        </div>

        <!-- Step 4: 状语 -->
        <div v-if="wizardStep === 4" class="wizard-body">
          <p class="wizard-desc">状语决定环境的加成与随机干预</p>
          <div class="wiz-field"><label>高地加成 (height_bonus_per_diff)</label>
            <input type="number" v-model.number="wizardForm.height_bonus_per_diff" min="0" max="10" class="wiz-input" />
            <small class="wiz-hint">每高1格增加此数值伤害</small></div>
          <div class="wiz-field"><label>骰子类型 (dice_type)</label>
            <select v-model="wizardForm.dice_type" class="param-select">
              <option value="1d4">1d4</option><option value="1d6">1d6 (标准)</option>
              <option value="1d8">1d8</option><option value="2d6">2d6</option>
              <option value="1d10">1d10</option><option value="1d20">1d20</option>
            </select></div>
          <div class="wiz-field"><label>成功线 (success_line)</label>
            <input type="number" v-model.number="wizardForm.success_line" min="1" max="20" class="wiz-input" /></div>
          <div class="wiz-field"><label>成功追加伤害 (success_bonus_damage)</label>
            <input type="number" v-model.number="wizardForm.success_bonus_damage" min="0" max="50" class="wiz-input" /></div>
          <div class="wiz-check"><input type="checkbox" v-model="wizardForm.is_manual_roll" /> 启用手动摇骰</div>
          <div class="wiz-field"><label>命中修正 (accuracy_mod)</label>
            <input type="number" v-model.number="wizardForm.accuracy_mod" min="-10" max="10" class="wiz-input" /></div>
          <div class="wiz-field"><label>回避修正 (evasion_mod)</label>
            <input type="number" v-model.number="wizardForm.evasion_mod" min="-10" max="10" class="wiz-input" /></div>
        </div>

        <!-- Step 5: 补语 -->
        <div v-if="wizardStep === 5" class="wizard-body">
          <p class="wizard-desc">补语是技能的基础数值与效果</p>
          <div class="wiz-field"><label>基础伤害 (base_damage)</label>
            <input type="number" v-model.number="wizardForm.base_damage" min="0" max="100" class="wiz-input" /></div>
          <div class="wiz-field"><label>状态效果 (status_effects) - 逗号分隔</label>
            <input type="text" v-model="wizardForm.status_effects_str" placeholder="burn,stun,disable,slow,poison,freeze" class="wiz-input" />
            <small class="wiz-hint">可选: burn, stun, disable, slow, poison, freeze</small></div>
        </div>

        <!-- Step 6: 确认 -->
        <div v-if="wizardStep === 6" class="wizard-body">
          <p class="wizard-desc">确认以下万能语法槽位配置</p>
          <div class="wiz-preview">
            <div class="wiz-preview-line"><b>名称:</b> {{ wizardForm.label }}</div>
            <div class="wiz-preview-line"><b>动作:</b> {{ wizardForm.action_type }} | {{ wizardForm.attack_stat }} | {{ wizardForm.category }}</div>
            <div class="wiz-preview-line"><b>伤害类型:</b> {{ wizardForm.damage_kind }}</div>
            <div class="wiz-preview-line"><b>范围:</b> {{ wizardForm.min_cast_range }}~{{ wizardForm.cast_range }} | AOE {{ wizardForm.aoe_radius }}</div>
            <div class="wiz-preview-line"><b>对象:</b> {{ wizardForm.target_filter }}</div>
            <div class="wiz-preview-line"><b>高地:</b> ×{{ wizardForm.height_bonus_per_diff }} | 骰子: {{ wizardForm.dice_type }} ≥{{ wizardForm.success_line }}</div>
            <div class="wiz-preview-line"><b>基础伤害:</b> {{ wizardForm.base_damage }} | 手动掷骰: {{ wizardForm.is_manual_roll ? '是' : '否' }}</div>
            <div class="wiz-preview-line"><b>状态:</b> {{ wizardForm.status_effects_str || '无' }}</div>
            <div class="wiz-preview-line"><b>描述:</b> {{ wizardForm.description || '无' }}</div>
          </div>
        </div>

        <div class="wizard-footer">
          <button class="btn" @click="wizardStep > 1 ? wizardStep-- : toggleWizard()">{{ wizardStep === 1 ? '取消' : '← 上一步' }}</button>
          <button v-if="wizardStep < 6" class="btn btn-add" @click="wizardStep++">下一步 →</button>
          <button v-else class="btn btn-save" @click="commitWizardSkill">✓ 创建词条</button>
        </div>
      </div>
    </div>

    <!-- 词条编辑面板 -->"""

    if old_panel_start in content:
        content = content.replace(old_panel_start, wizard_html)
        print('[OK] 添加分步向导面板')
    else:
        print('[ERROR] 向导面板锚点未找到')
        return

    # === 3. 在 onMounted 之前注入向导脚本 ===
    old_onmounted = """onMounted(() => {
  loadConfig()
})"""

    wizard_script = """
// ===== Phase 11: 万能槽位分步创建向导 =====
const showWizard = ref(false)
const wizardStep = ref(1)
const wizardForm = reactive({
  _key: '',
  label: '新词条',
  action_type: 'attack',
  attack_stat: 'melee',
  category: 'melee',
  target_filter: 'enemy',
  cast_range: 1,
  min_cast_range: 0,
  aoe_radius: 0,
  damage_kind: 'kinetic',
  height_bonus_per_diff: 0,
  dice_type: '1d6',
  success_line: 4,
  success_bonus_damage: 0,
  is_manual_roll: false,
  accuracy_mod: 0,
  evasion_mod: 0,
  base_damage: 0,
  status_effects_str: '',
  requires_unmoved: false,
  requires_stealth: false,
  description: '',
  deterministic: true,
})

const wizardStepLabel = computed(() => {
  const labels = { 1: '主语 Subject', 2: '谓语 Predicate', 3: '定语 Attribute', 4: '状语 Adverbial', 5: '补语 Complement', 6: '确认 Review' }
  return labels[wizardStep.value] || ''
})

function toggleWizard() {
  showWizard.value = !showWizard.value
  wizardStep.value = 1
  const now = Date.now()
  Object.assign(wizardForm, {
    _key: 'new_skill_' + now,
    label: '新词条',
    action_type: 'attack',
    attack_stat: 'melee',
    category: 'melee',
    target_filter: 'enemy',
    cast_range: 1,
    min_cast_range: 0,
    aoe_radius: 0,
    damage_kind: 'kinetic',
    height_bonus_per_diff: 0,
    dice_type: '1d6',
    success_line: 4,
    success_bonus_damage: 0,
    is_manual_roll: false,
    accuracy_mod: 0,
    evasion_mod: 0,
    base_damage: 0,
    status_effects_str: '',
    requires_unmoved: false,
    requires_stealth: false,
    description: '',
    deterministic: true,
  })
}

function commitWizardSkill() {
  const key = wizardForm._key || 'new_skill_' + Date.now()
  const statusEffects = wizardForm.status_effects_str
    ? wizardForm.status_effects_str.split(',').map(s => s.trim()).filter(Boolean)
    : []
  editableConfig.skills[key] = {
    label: wizardForm.label || '新词条',
    category: wizardForm.category,
    description: wizardForm.description || '',
    target_filter: wizardForm.target_filter,
    cast_range: wizardForm.cast_range,
    aoe_radius: wizardForm.aoe_radius,
    base_damage: wizardForm.base_damage,
    status_effects: statusEffects,
    deterministic: wizardForm.deterministic,
    // Phase 10: 万能语法字段
    damage_kind: wizardForm.damage_kind,
    min_cast_range: wizardForm.min_cast_range,
    accuracy_mod: wizardForm.accuracy_mod,
    evasion_mod: wizardForm.evasion_mod,
    height_bonus_per_diff: wizardForm.height_bonus_per_diff,
    action_type: wizardForm.action_type,
    attack_stat: wizardForm.attack_stat,
    requires_unmoved: wizardForm.requires_unmoved,
    requires_stealth: wizardForm.requires_stealth,
    dice_type: wizardForm.dice_type,
    success_line: wizardForm.success_line,
    success_bonus_damage: wizardForm.success_bonus_damage,
    is_manual_roll: wizardForm.is_manual_roll,
  }
  skillKeyEdits[key] = key
  showWizard.value = false
  alert(`词条「${editableConfig.skills[key].label}」已创建！请保存以同步规则。`)
}

onMounted(() => {
  loadConfig()
})"""

    if old_onmounted in content:
        content = content.replace(old_onmounted, wizard_script)
        print('[OK] 注入向导脚本')
    else:
        # 尝试行内匹配
        if 'onMounted(() => {\n  loadConfig()\n})' not in content:
            print('[ERROR] onMounted 未找到')
        else:
            content = content.replace('onMounted(() => {\n  loadConfig()\n})', wizard_script)
            print('[OK] 注入向导脚本 (备用匹配)')

    # === 4. CSS ===
    old_css_end = '</style>'
    wizard_css = """
/* Phase 11: 万能槽位分步创建向导 */
.wizard-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.7);
  display: flex; align-items: center; justify-content: center;
  z-index: 9999; backdrop-filter: blur(4px);
}
.wizard-panel {
  background: #001620; border: 1px solid rgba(255,176,0,0.3);
  border-radius: 4px; width: 520px; max-height: 85vh;
  display: flex; flex-direction: column;
  box-shadow: 0 0 40px rgba(255,176,0,0.08);
}
.wizard-header {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 18px; border-bottom: 1px solid rgba(159,142,120,0.1);
}
.wizard-header h2 { margin: 0; font-size: 15px; color: #ffb000; letter-spacing: 2px; }
.wizard-step-indicator { font-size: 10px; color: rgba(0,180,220,0.7); margin-left: auto; }
.wizard-body { padding: 16px; overflow-y: auto; flex: 1; }
.wizard-desc { font-size: 11px; color: rgba(193,232,255,0.45); margin-bottom: 12px; }
.wiz-field { margin-bottom: 10px; }
.wiz-field label { display: block; font-size: 9px; color: rgba(255,176,0,0.55); margin-bottom: 3px; letter-spacing: 1px; text-transform: uppercase; }
.wiz-field select, .wiz-input {
  width: 100%; padding: 5px 8px; background: rgba(0,0,0,0.3);
  border: 1px solid rgba(159,142,120,0.18); color: #c1e8ff;
  font-family: inherit; font-size: 12px;
}
.wiz-field select:focus, .wiz-input:focus { border-color: rgba(255,176,0,0.35); outline: none; }
.wiz-hint { display: block; font-size: 9px; color: rgba(193,232,255,0.25); margin-top: 1px; }
.wiz-check { margin-bottom: 8px; color: #c1e8ff; font-size: 12px; }
.wiz-check input { margin-right: 5px; }
.wiz-preview { background: rgba(0,0,0,0.2); border: 1px solid rgba(159,142,120,0.1); padding: 10px; }
.wiz-preview-line { font-size: 11px; color: #c1e8ff; margin-bottom: 5px; }
.wizard-footer {
  display: flex; gap: 6px; padding: 10px 18px;
  border-top: 1px solid rgba(159,142,120,0.1); justify-content: space-between;
}
</style>"""

    content = content.replace(old_css_end, wizard_css)
    print('[OK] 向导 CSS 注入')

    with open(path, 'w') as f:
        f.write(content)
    print('[DONE] GlossaryView.vue: 向导全部完成')


if __name__ == '__main__':
    print('=== Phase 11.3 v2: 万能槽位创建向导 ===')
    patch_glossary_wizard()
    print('=== Phase 11.3 v2 完成 ===')
