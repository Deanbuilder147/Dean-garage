<template>
  <main class="main-content">
    <header class="page-header">
      <h1>[ 词条库中枢 · 结构化 CRUD ]</h1>
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

    <!-- 词条编辑面板 -->
    <div v-else class="glossary-panels">
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

            <!-- 高级参数 (可折叠) -->
            <div class="advanced-section">
              <button
                class="btn btn-toggle-advanced"
                @click="toggleAdvanced(key)"
              >
                {{ advancedOpen[key] ? '▼' : '▶' }} 高级参数 (类型专属)
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
const advancedOpen = reactive({})
const skillKeyEdits = reactive({})

const editableConfig = reactive({
  _meta: {},
  skills: {},
  systems: {}
})

// 可用状态效果列表
const availableEffects = [
  { value: 'burn', label: '灼烧 burn' },
  { value: 'stun', label: '眩晕 stun' },
  { value: 'disable', label: '断腿 disable' },
  { value: 'slow', label: '减速 slow' },
  { value: 'poison', label: '中毒 poison' },
  { value: 'freeze', label: '冰冻 freeze' },
]

// 5 个通用字段名 (用于过滤高级参数)
const UNIVERSAL_FIELDS = new Set([
  'type', 'label', 'category', 'description',
  'target_filter', 'cast_range', 'aoe_radius', 'base_damage', 'status_effects',
  'deterministic', 'trigger'
])

const syncStatus = computed(() => {
  if (loading.value) return '加载中...'
  if (loadError.value) return '离线'
  return '在线'
})

const configVersion = computed(() => editableConfig._meta?.version || '?')
const skillCount = computed(() => Object.keys(editableConfig.skills || {}).length)

// 获取高级参数 (过滤掉通用字段)
function getAdvancedParams(skill) {
  const params = {}
  for (const [key, val] of Object.entries(skill)) {
    if (!UNIVERSAL_FIELDS.has(key)) {
      params[key] = val
    }
  }
  return params
}

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

// 折叠/展开高级参数
function toggleAdvanced(key) {
  advancedOpen[key] = !advancedOpen[key]
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
    deterministic: true
  }
  skillKeyEdits[newKey] = newKey
  advancedOpen[newKey] = false
}

// 删除词条
function deleteSkill(key) {
  if (!confirm(`确认删除词条「${editableConfig.skills[key]?.label || key}」？此操作需保存后生效。`)) return
  pendingDeletes.value.push(key)
  delete editableConfig.skills[key]
  delete skillKeyEdits[key]
  delete advancedOpen[key]
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
.btn-toggle-advanced {
  padding: 4px 12px; font-size: 10px; background: transparent;
  border: 1px solid rgba(159,142,120,0.15); color: rgba(193,232,255,0.5);
  cursor: pointer; font-family: inherit; letter-spacing: 1px;
  transition: all 0.15s;
}
.btn-toggle-advanced:hover { border-color: rgba(255,176,0,0.3); color: #ffd597; }
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

/* 高级参数 */
.advanced-section { margin-top: 8px; }
.advanced-body { margin-top: 6px; padding: 8px 12px; border: 1px dashed rgba(159,142,120,0.1); background: rgba(0,0,0,0.1); }
.advanced-params { display: flex; flex-wrap: wrap; gap: 8px; }
.advanced-empty { font-size: 10px; color: rgba(193,232,255,0.2); padding: 8px; }

/* 系统参数 */
.system-card { border: 1px solid rgba(159,142,120,0.08); margin-bottom: 10px; padding: 12px; background: rgba(0,0,0,0.1); }
.system-label { font-size: 12px; font-weight: 700; color: #ffd597; margin-bottom: 8px; letter-spacing: 1px; }
.system-params { display: flex; flex-wrap: wrap; gap: 8px; }

.panel-meta .meta-body { font-size: 10px; color: rgba(193,232,255,0.35); display: flex; flex-wrap: wrap; gap: 24px; line-height: 1.8; }
</style>
