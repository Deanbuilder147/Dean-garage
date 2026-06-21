<template>
  <main class="main-content">
    <header class="page-header">
      <h1>[ 词条库中枢 · 万能语法战斗中枢 v5.0 ]</h1>
      <div class="header-meta">
        <span class="meta-item"><span class="dot-live"></span> {{ syncStatus }}</span>
        <span class="sep">::</span>
        <span>词条数: {{ skillCount }}</span>
        <span class="sep">::</span>
        <span class="meta-version">v{{ configVersion }}</span>
      </div>
    </header>

    <!-- 操作栏 -->
    <div class="action-bar">
      <button class="btn btn-edit-mode" @click="editMode = !editMode" :class="{ active: editMode }">
        {{ editMode ? '[ 退出编辑 ]' : '[ 编辑模式 ]' }}
      </button>
      <button
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
      </button>
      <button
        v-if="editMode"
        class="btn btn-save"
        :disabled="saving"
        @click="saveConfig"
      >
        {{ saving ? '[ 保存中... ]' : '[ 保存并同步规则 ]' }}
      </button>
      <button
        v-if="editMode"
        class="btn btn-reload"
        @click="loadConfig"
      >
        [ 重新加载 ]
      </button>
      <span v-if="pendingDeletes.length > 0" class="delete-hint">
        ⚠ {{ pendingDeletes.length }} 个待删除
      </span>
      <span v-if="saveMsg" class="save-msg">{{ saveMsg }}</span>
    </div>

    <!-- 加载中 -->
    <div v-if="loading" class="loading-state">
      <p>[ 正在连接词条库中枢... ]</p>
      <p class="loading-hint">正在从 combat-service 获取最新配置</p>
    </div>

    <!-- 加载失败 -->
    <div v-else-if="loadError" class="error-state">
      <p class="error-msg">{{ loadError }}</p>
      <button class="btn btn-reload" @click="loadConfig">[ 重试 ]</button>
    </div>

    <!-- Phase 11: 万能槽位分步创建向导 -->
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

    <!-- 词条编辑面板 -->
      <!-- 技能参数面板 -->
      <section class="panel">
        <div class="panel-header">
          <h2>[ 技能词条 ]</h2>
          <span class="panel-badge">{{ skillCount }} 个词条</span>
        </div>
        <div class="panel-body">
          <!-- 空状态提示 -->
          <div v-if="skillCount === 0" class="empty-state">
            <p>暂无词条，点击「添加新词条」创建</p>
          </div>

          <!-- 词条卡片 -->
          <div
            v-for="(skill, key) in editableConfig.skills"
            :key="key"
            class="skill-card"
            :class="{ 'deleted-card': pendingDeletes.includes(key) }"
          >
            <!-- 卡片头部 -->
            <div class="skill-card-header">
              <div class="skill-id-group">
                <label class="skill-id-label">KEY</label>
                <input
                  v-if="editMode"
                  v-model="skillKeyEdits[key]"
                  type="text"
                  class="skill-id-input"
                  placeholder="skill_key"
                  @blur="onSkillKeyBlur(key)"
                />
                <span v-else class="skill-id-value">{{ key }}</span>
              </div>
              <div class="skill-label-group">
                <label class="skill-id-label">名称</label>
                <input
                  v-if="editMode"
                  v-model="skill.label"
                  type="text"
                  class="skill-label-input"
                  placeholder="技能名称"
                />
                <span v-else class="skill-label-value">{{ skill.label || key }}</span>
              </div>
              <div class="skill-category-group">
                <label class="skill-id-label">分类</label>
                <select v-if="editMode" v-model="skill.category" class="param-select">
                  <option value="melee">近战</option>
                  <option value="ranged">远程</option>
                  <option value="special">特殊</option>
                  <option value="passive">被动</option>
                </select>
                <span v-else class="skill-label-value">{{ skill.category || '-' }}</span>
              </div>
              <button
                v-if="editMode"
                class="btn btn-delete"
                @click="deleteSkill(key)"
              >
                ✕ 删除
              </button>
            </div>

            <!-- 描述 -->
            <div class="skill-desc-row">
              <label class="skill-id-label">描述</label>
              <textarea
                v-if="editMode"
                v-model="skill.description"
                class="skill-desc-input"
                rows="2"
                placeholder="技能描述..."
              ></textarea>
              <span v-else class="skill-desc-text">{{ skill.description || '-' }}</span>
            </div>

            <!-- 5 个通用结构字段 -->
            <div class="universal-fields">
              <div class="uf-row">
                <!-- target_filter -->
                <label class="param-row">
                  <span class="param-key">施放对象</span>
                  <select v-if="editMode" v-model="skill.target_filter" class="param-select">
                    <option value="enemy">敌方 enemy</option>
                    <option value="ally">友方 ally</option>
                    <option value="self">自身 self</option>
                    <option value="all">全员 all</option>
                  </select>
                  <span v-else class="param-value">{{ skill.target_filter || 'enemy' }}</span>
                </label>

                <!-- cast_range -->
                <label class="param-row">
                  <span class="param-key">施放距离</span>
                  <input
                    v-if="editMode"
                    v-model.number="skill.cast_range"
                    type="number" min="0" max="20" step="1"
                    class="param-input"
                  />
                  <span v-else class="param-value">{{ skill.cast_range ?? 0 }} 格</span>
                </label>

                <!-- aoe_radius -->
                <label class="param-row">
                  <span class="param-key">AOE 半径</span>
                  <input
                    v-if="editMode"
                    v-model.number="skill.aoe_radius"
                    type="number" min="0" max="10" step="1"
                    class="param-input"
                  />
                  <span v-else class="param-value">{{ skill.aoe_radius ?? 0 }} {{ (skill.aoe_radius ?? 0) === 0 ? '(单体)' : '格' }}</span>
                </label>
              </div>

              <div class="uf-row">
                <!-- base_damage -->
                <label class="param-row">
                  <span class="param-key">基础伤害</span>
                  <input
                    v-if="editMode"
                    v-model.number="skill.base_damage"
                    type="number" step="1"
                    class="param-input"
                  />
                  <span v-else class="param-value">{{ skill.base_damage ?? 0 }}</span>
                </label>

                <!-- status_effects -->
                <label class="param-row param-row-wide">
                  <span class="param-key">附加效果</span>
                  <span v-if="!editMode" class="param-value">
                    {{ (skill.status_effects || []).join(', ') || '无' }}
                  </span>
                  <div v-else class="status-effects-tags">
                    <label
                      v-for="eff in availableEffects"
                      :key="eff.value"
                      class="status-tag"
                      :class="{ active: (skill.status_effects || []).includes(eff.value) }"
                    >
                      <input
                        type="checkbox"
                        :checked="(skill.status_effects || []).includes(eff.value)"
                        @change="toggleEffect(skill, eff.value)"
                        class="status-checkbox"
                      />
                      {{ eff.label }}
                    </label>
                  </div>
                </label>
              </div>
            </div>

            <!-- 动作掷骰属性 (平铺) -->
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
            </div>

            <!-- Phase 10: 属性分流与干预插槽 -->
            <div class="phase10-fields">
              <div class="dice-section-label phase10-label">[ Phase 10 · 属性分流与干预插槽 ]</div>
              <div class="uf-row">
                <!-- damage_kind -->
                <label class="param-row">
                  <span class="param-key">伤害类型</span>
                  <select v-if="editMode" v-model="skill.damage_kind" class="param-select">
                    <option value="kinetic">动能 kinetic</option>
                    <option value="beam">光束 beam</option>
                    <option value="explosive">爆炸 explosive</option>
                    <option value="corrosive">腐蚀 corrosive</option>
                    <option value="thermal">热熔 thermal</option>
                  </select>
                  <span v-else class="param-value">{{ skill.damage_kind || 'kinetic' }}</span>
                </label>

                <!-- min_cast_range -->
                <label class="param-row">
                  <span class="param-key">最小距离</span>
                  <input
                    v-if="editMode"
                    v-model.number="skill.min_cast_range"
                    type="number" min="0" max="20" step="1"
                    class="param-input"
                  />
                  <span v-else class="param-value">{{ skill.min_cast_range ?? 0 }} 格</span>
                </label>

                <!-- accuracy_mod -->
                <label class="param-row">
                  <span class="param-key">命中修正</span>
                  <input
                    v-if="editMode"
                    v-model.number="skill.accuracy_mod"
                    type="number" min="-10" max="10" step="1"
                    class="param-input"
                  />
                  <span v-else class="param-value">{{ (skill.accuracy_mod ?? 0) > 0 ? '+' : '' }}{{ skill.accuracy_mod ?? 0 }}</span>
                </label>

                <!-- evasion_mod -->
                <label class="param-row">
                  <span class="param-key">闪避修正</span>
                  <input
                    v-if="editMode"
                    v-model.number="skill.evasion_mod"
                    type="number" min="-10" max="10" step="1"
                    class="param-input"
                  />
                  <span v-else class="param-value">{{ (skill.evasion_mod ?? 0) > 0 ? '+' : '' }}{{ skill.evasion_mod ?? 0 }}</span>
                </label>
              </div>

              <div class="uf-row">
                <!-- height_bonus_per_diff -->
                <label class="param-row">
                  <span class="param-key">高地格加成</span>
                  <input
                    v-if="editMode"
                    v-model.number="skill.height_bonus_per_diff"
                    type="number" min="0" max="10" step="1"
                    class="param-input"
                  />
                  <span v-else class="param-value">+{{ skill.height_bonus_per_diff ?? 0 }}/格</span>
                </label>

                <!-- action_type -->
                <label class="param-row">
                  <span class="param-key">动作类型</span>
                  <select v-if="editMode" v-model="skill.action_type" class="param-select">
                    <option value="attack">攻击 attack</option>
                    <option value="heal">治疗 heal</option>
                    <option value="buff">增益 buff</option>
                    <option value="debuff">减益 debuff</option>
                    <option value="passive">被动 passive</option>
                  </select>
                  <span v-else class="param-value">{{ skill.action_type || 'attack' }}</span>
                </label>

                <!-- attack_stat -->
                <label class="param-row">
                  <span class="param-key">攻击属性</span>
                  <select v-if="editMode" v-model="skill.attack_stat" class="param-select">
                    <option value="melee">格斗 melee</option>
                    <option value="ranged">射击 ranged</option>
                    <option value="max">取最高 max</option>
                  </select>
                  <span v-else class="param-value">{{ skill.attack_stat || 'melee' }}</span>
                </label>

                <!-- requires_unmoved -->
                <label class="param-row">
                  <span class="param-key">要求$不动</span>
                  <template v-if="editMode">
                    <input type="checkbox" v-model="skill.requires_unmoved" />
                    <span class="param-value">{{ skill.requires_unmoved ? '需要' : '不需要' }}</span>
                  </template>
                  <span v-else class="param-value">{{ skill.requires_unmoved ? '⚓ 需不动' : '-' }}</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 系统参数面板 (保留原有) -->
      <section class="panel" v-if="Object.keys(editableConfig.systems || {}).length > 0">
        <div class="panel-header">
          <h2>[ 系统参数 ]</h2>
          <span class="panel-badge">{{ Object.keys(editableConfig.systems || {}).length }} 项</span>
        </div>
        <div class="panel-body">
          <div v-for="(sys, key) in editableConfig.systems" :key="key" class="system-card">
            <div class="system-label">{{ sys.label || key }}</div>
            <div class="system-params">
              <div v-for="(val, pkey) in getSystemParams(sys)" :key="pkey" class="param-row">
                <span class="param-key">{{ pkey }}</span>
                <template v-if="editMode">
                  <select v-if="pkey === 'visibility'" v-model="sys[pkey]" class="param-select">
                    <option value="normal">正常</option>
                    <option value="reduced">降低</option>
                    <option value="blind">盲视</option>
                  </select>
                  <input v-else :type="typeof val === 'number' ? 'number' : 'text'"
                    v-model="sys[pkey]" class="param-input"
                    :class="{ 'param-text': typeof val === 'string' }"
                  />
                </template>
                <span v-else class="param-value">{{ formatSystemValue(pkey, val) }}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 配置元信息 -->
      <section class="panel panel-meta" v-if="editableConfig._meta">
        <div class="panel-header">
          <h2>[ 配置元信息 ]</h2>
        </div>
        <div class="panel-body meta-body">
          <div>版本: {{ editableConfig._meta.version }}</div>
          <div>更新: {{ editableConfig._meta.date }}</div>
          <div>原则: {{ editableConfig._meta.principle }}</div>
        </div>
      </section>
    </div>
  </main>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { glossaryAPI } from '@/api/client.js'

const loading = ref(true)
const loadError = ref('')
const saving = ref(false)
const saveMsg = ref('')
const saveMsgTimeout = ref(null)
const editMode = ref(false)
const pendingDeletes = ref([])
const skillKeyEdits = reactive({})

const editableConfig = reactive({
  _meta: {},
  skills: {},
  systems: {}
})


// 获取系统参数 (过滤 label/description/deterministic)
function getSystemParams(sys) {
  const params = {}
  for (const [key, val] of Object.entries(sys)) {
    if (!['label', 'description', 'deterministic', 'deterministic_probability'].includes(key)) {
      params[key] = val
    }
  }
  return params
}

// 格式化系统参数值
function formatSystemValue(key, val) {
  if (key === 'chance') return Math.round(val * 100) + '%'
  if (key === 'damage_percent') return Math.round(val * 100) + '%'
  return val
}

// 切换效果标签
function toggleEffect(skill, effectValue) {
  if (!skill.status_effects) skill.status_effects = []
  const idx = skill.status_effects.indexOf(effectValue)
  if (idx >= 0) {
    skill.status_effects.splice(idx, 1)
  } else {
    skill.status_effects.push(effectValue)
  }
}


// 技能 KEY 编辑失焦时同步
function onSkillKeyBlur(oldKey) {
  const newKey = skillKeyEdits[oldKey]
  if (!newKey || newKey === oldKey || !editableConfig.skills[oldKey]) return
  if (editableConfig.skills[newKey] && newKey !== oldKey) {
    // key 冲突：回退
    skillKeyEdits[oldKey] = oldKey
    return
  }
  // 重命名 key
  editableConfig.skills[newKey] = editableConfig.skills[oldKey]
  delete editableConfig.skills[oldKey]
  delete skillKeyEdits[oldKey]
  skillKeyEdits[newKey] = newKey
}

// 添加新词条
function addNewSkill() {
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
    deterministic: true,
    // Phase 10: 万能语法字段
    damage_kind: 'kinetic',
    min_cast_range: 0,
    accuracy_mod: 0,
    evasion_mod: 0,
    height_bonus_per_diff: 0,
    action_type: 'attack',
    attack_stat: 'melee',
    requires_unmoved: false,
    requires_stealth: false
  }
  skillKeyEdits[newKey] = newKey
}

// 删除词条
function deleteSkill(key) {
  if (!confirm(`确认删除词条「${editableConfig.skills[key]?.label || key}」？此操作需保存后生效。`)) return
  pendingDeletes.value.push(key)
  delete editableConfig.skills[key]
  delete skillKeyEdits[key]
}

// 加载配置
async function loadConfig() {
  loading.value = true
  loadError.value = ''
  try {
    const config = (await glossaryAPI.getConfig()).data
    editableConfig._meta = { ...config._meta }
    editableConfig.skills = { ...config.skills }
    editableConfig.systems = { ...config.systems }

    // 初始化 key 编辑缓存
    for (const key of Object.keys(config.skills || {})) {
      skillKeyEdits[key] = key
    }
    // 清空删除列表
    pendingDeletes.value = []
    loading.value = false
  } catch (e) {
    console.error('加载词条配置失败:', e)
    loadError.value = e.response?.data?.error || '无法连接到 combat-service，请检查服务状态'
    loading.value = false
  }
}

// 保存配置
async function saveConfig() {
  saving.value = true
  saveMsg.value = ''
  try {
    const config = {
      _meta: {
        ...editableConfig._meta,
        date: new Date().toISOString().replace('T', ' ').substring(0, 19),
        generated_from: 'GlossaryView.vue 结构化 CRUD 编辑界面'
      },
      skills: { ...editableConfig.skills },
      systems: { ...editableConfig.systems }
    }

    // 附加待删除列表
    if (pendingDeletes.value.length > 0) {
      config._delete_skills = [...pendingDeletes.value]
    }

    const res = (await glossaryAPI.saveConfig(config)).data
    saveMsg.value = '✓ ' + res.message

    // 清空待删除列表
    pendingDeletes.value = []

    // 保存成功后重新拉取确认同步
    await loadConfig()

    if (saveMsgTimeout.value) clearTimeout(saveMsgTimeout.value)
    saveMsgTimeout.value = setTimeout(() => { saveMsg.value = '' }, 5000)
  } catch (e) {
    console.error('保存配置失败:', e)
    saveMsg.value = '✗ 保存失败: ' + (e.response?.data?.error || e.message)
  } finally {
    saving.value = false
  }
}


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
})
</script>

<style scoped>
* { box-sizing: border-box; }
.main-content {
  display: flex; flex-direction: column; height: 100vh;
  background: #001620; font-family: 'Fira Code', 'Courier New', monospace;
  color: #c1e8ff; overflow-y: auto;
}

.page-header { padding: 24px 32px 16px; border-bottom: 1px solid rgba(159,142,120,0.15); }
.page-header h1 { margin: 0 0 8px; font-size: 18px; font-weight: 700; color: #ffb000; letter-spacing: 2px; }
.header-meta { font-size: 10px; color: rgba(193,232,255,0.4); display: flex; align-items: center; gap: 8px; }
.sep { color: rgba(255,176,0,0.2); }
.dot-live { width: 6px; height: 6px; background: #13ff43; border-radius: 50%; display: inline-block; margin-right: 4px; }
.meta-version { color: rgba(255,176,0,0.5); }

.action-bar { display: flex; align-items: center; gap: 12px; padding: 16px 32px; border-bottom: 1px solid rgba(159,142,120,0.1); flex-wrap: wrap; }
.btn {
  padding: 8px 16px; font-size: 11px; font-weight: 700; letter-spacing: 1px;
  border: 1px solid rgba(159,142,120,0.25); background: rgba(0,0,0,0.2);
  color: #c1e8ff; cursor: pointer; transition: all 0.2s; font-family: inherit;
}
.btn:hover { border-color: rgba(255,176,0,0.4); color: #ffd597; }
.btn.active { background: rgba(255,176,0,0.1); border-color: #ffb000; color: #ffb000; }
.btn-add { border-color: rgba(0,180,220,0.3); color: #00b4dc; }
.btn-add:hover { border-color: #00b4dc; background: rgba(0,180,220,0.1); }
.btn-save { background: rgba(19,255,67,0.08); border-color: rgba(19,255,67,0.3); color: #13ff43; }
.btn-save:hover { background: rgba(19,255,67,0.15); border-color: #13ff43; }
.btn-save:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-delete { border-color: rgba(255,82,82,0.3); color: #ff5252; padding: 4px 12px; font-size: 11px; }
.btn-delete:hover { border-color: #ff5252; background: rgba(255,82,82,0.15); }
.btn-reload { border-color: rgba(0,180,220,0.25); }
.save-msg { font-size: 11px; color: #13ff43; letter-spacing: 1px; }
.delete-hint { font-size: 10px; color: #ff5252; letter-spacing: 1px; }

.loading-state, .error-state { text-align: center; padding: 80px 20px; }
.loading-state p { color: rgba(193,232,255,0.5); font-size: 14px; margin: 8px 0; }
.loading-hint { font-size: 11px; color: rgba(193,232,255,0.2); }
.error-msg { color: #ff5252; font-size: 14px; }
.error-state .btn { margin-top: 16px; }

.glossary-panels { flex: 1; overflow-y: auto; padding: 24px 32px; }
.panel { border: 1px solid rgba(159,142,120,0.12); margin-bottom: 24px; background: rgba(0,0,0,0.1); }
.panel-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid rgba(159,142,120,0.1); }
.panel-header h2 { margin: 0; font-size: 14px; font-weight: 700; color: #ffb000; letter-spacing: 1px; }
.panel-badge { font-size: 9px; padding: 2px 10px; background: rgba(19,255,67,0.06); border: 1px solid rgba(19,255,67,0.2); color: rgba(19,255,67,0.6); letter-spacing: 1px; }
.panel-body { padding: 12px 20px 20px; }

.empty-state { text-align: center; padding: 40px; color: rgba(193,232,255,0.3); font-size: 12px; }

/* 词条卡片 */
.skill-card { border: 1px solid rgba(159,142,120,0.1); margin-bottom: 16px; padding: 16px; background: rgba(0,0,0,0.15); transition: all 0.2s; }
.skill-card:hover { border-color: rgba(255,176,0,0.15); }
.skill-card.deleted-card { opacity: 0.35; border-color: rgba(255,82,82,0.2); }
.skill-card-header { display: flex; align-items: flex-end; gap: 12px; margin-bottom: 10px; flex-wrap: wrap; }
.skill-id-group, .skill-label-group, .skill-category-group { display: flex; flex-direction: column; gap: 2px; }
.skill-id-label { font-size: 9px; color: rgba(193,232,255,0.35); letter-spacing: 1px; text-transform: uppercase; }
.skill-id-input { width: 140px; padding: 4px 8px; font-size: 12px; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,176,0,0.3); color: #ffd597; font-family: inherit; outline: none; }
.skill-id-input:focus { border-color: #ffb000; }
.skill-id-value { font-size: 13px; font-weight: 700; color: #ffb000; letter-spacing: 1px; }
.skill-label-input { width: 160px; padding: 4px 8px; font-size: 12px; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,176,0,0.3); color: #ffd597; font-family: inherit; outline: none; }
.skill-label-value { font-size: 13px; color: #ffd597; }

/* 描述 */
.skill-desc-row { margin-bottom: 12px; display: flex; flex-direction: column; gap: 4px; }
.skill-desc-input { width: 100%; padding: 6px 8px; font-size: 11px; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,176,0,0.2); color: #c1e8ff; font-family: inherit; resize: vertical; outline: none; }
.skill-desc-input:focus { border-color: #ffb000; }
.skill-desc-text { font-size: 11px; color: rgba(193,232,255,0.5); font-style: italic; }

/* 通用字段 */
.universal-fields { margin-bottom: 8px; }
.uf-row { display: flex; gap: 12px; margin-bottom: 6px; flex-wrap: wrap; }

/* 参数组件 */
.param-row { display: flex; align-items: center; gap: 8px; padding: 6px 12px; border: 1px solid rgba(159,142,120,0.12); background: rgba(0,0,0,0.1); }
.param-row-wide { min-width: 300px; flex: 1; }
.param-key { font-size: 10px; color: rgba(193,232,255,0.5); letter-spacing: 1px; white-space: nowrap; min-width: 55px; }
.param-value { font-size: 12px; font-weight: 700; color: #ffb000; min-width: 40px; text-align: right; }
.param-input { width: 70px; padding: 4px 8px; font-size: 12px; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,176,0,0.3); color: #ffb000; text-align: right; font-family: inherit; outline: none; }
.param-input:focus { border-color: #ffb000; box-shadow: 0 0 4px rgba(255,176,0,0.15); }
.param-input.param-text { width: 140px; text-align: left; }
.param-select { padding: 4px 8px; font-size: 12px; min-width: 80px; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,176,0,0.3); color: #ffb000; font-family: inherit; outline: none; }

/* 状态效果标签 */
.status-effects-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.status-tag {
  padding: 3px 10px; font-size: 10px; border: 1px solid rgba(159,142,120,0.2);
  color: rgba(193,232,255,0.5); cursor: pointer; transition: all 0.15s;
  display: flex; align-items: center; gap: 4px; user-select: none;
}
.status-tag:hover { border-color: rgba(255,176,0,0.3); color: #ffb000; }
.status-tag.active { border-color: #ffb000; background: rgba(255,176,0,0.1); color: #ffb000; }
.status-checkbox { display: none; }

/* 骰子属性区域 */
.dice-fields { margin-top: 8px; padding-top: 10px; border-top: 1px solid rgba(255,176,0,0.1); }
.dice-section-label {
  font-size: 9px; color: rgba(255,176,0,0.4); letter-spacing: 2px;
  margin-bottom: 6px; text-transform: uppercase;
}

/* Phase 10 属性分流插槽 */
.phase10-fields { margin-top: 8px; padding-top: 10px; border-top: 1px solid rgba(0,180,220,0.15); }
.phase10-label { color: rgba(0,180,220,0.5) !important; }

/* 系统参数 */
.system-card { border: 1px solid rgba(159,142,120,0.08); margin-bottom: 10px; padding: 12px; background: rgba(0,0,0,0.1); }
.system-label { font-size: 12px; font-weight: 700; color: #ffd597; margin-bottom: 8px; letter-spacing: 1px; }
.system-params { display: flex; flex-wrap: wrap; gap: 8px; }

.panel-meta .meta-body { font-size: 10px; color: rgba(193,232,255,0.35); display: flex; flex-wrap: wrap; gap: 24px; line-height: 1.8; }

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
</style>
