<template>
  <div class="skills-editor">
    <div class="skills-header">
      <span class="label">{{ title }}（剩余 {{ remainingSlots }} 槽）</span>
    </div>
    
    <div v-for="(skill, index) in modelValue" :key="index" class="skill-item">
      <div class="skill-row">
        <label :for="`skill-${index}-name`" class="sr-only">技能名</label>
        <input :id="`skill-${index}-name`" type="text" v-model="skill.name" class="skill-name-input" placeholder="技能名" name="skill-name">
        <select :id="`skill-${index}-bind`" class="skill-bind-select" :value="skill.skill_key || ''" @change="onGlossaryBind(skill, $event.target.value)">
          <option value="">绑定全局词条</option>
          <option v-for="g in glossarySkills" :key="g.key" :value="g.key">{{ g.key }} · {{ g.name }}</option>
        </select>
        <select :id="`skill-${index}-type`" v-model="skill.type" class="skill-type-select" @change="onTypeChange(skill)">
          <option value="">类型</option>
          <option value="近战">近战</option>
          <option value="远程">远程</option>
          <option value="自动化">自动化</option>
        </select>
        <select :id="`skill-${index}-attr`" v-model="skill.attribute" class="skill-attr-select">
          <option value="">属性</option>
          <option value="实体">实体</option>
          <option value="光束">光束</option>
        </select>
        <select :id="`skill-${index}-effect`" v-model="skill.effect" class="skill-effect-select" @change="onEffectChange(skill)">
          <option value="">效果</option>
          <template v-if="skill.type === '近战'">
            <option v-for="e in meleeEffects" :key="e" :value="e">{{ e }}</option>
          </template>
          <template v-else-if="skill.type === '远程'">
            <option v-for="e in rangedEffects" :key="e" :value="e">{{ e }}</option>
          </template>
          <template v-else-if="skill.type === '自动化'">
            <option v-for="e in autoEffects" :key="e" :value="e">{{ e }}</option>
          </template>
        </select>
        <button type="button" class="delete-btn" @click="removeSkill(index)">×</button>
      </div>
      <div class="skill-extra-row">
        <span v-if="skill.skill_key" class="skill-key-badge" :title="'已强引用全局词条：' + skill.skill_key">🔗 {{ skill.skill_key }}</span>
        <span class="skill-range-readonly" :title="'射程由类型基准 + 词条射程加成自动计算，无需手填'">
          射程：{{ skillRangeLabel(skill) }}
        </span>
        <span v-if="prereqLabel(skill)" class="skill-prereq-readonly" :title="'该词条可作为此前置类型的技能前置'">
          前置：{{ prereqLabel(skill) }}
        </span>
        <label :for="`skill-${index}-bonus`" class="bonus-label">词条射程加成</label>
        <el-input-number
          :id="`skill-${index}-bonus`"
          v-model.number="skill.bonus_range"
          :min="0"
          :max="10"
          :step="1"
          size="small"
          controls-position="right"
          class="skill-bonus-input"
          placeholder="0"
        />
        <label :for="`skill-${index}-special`" class="sr-only">特效说明</label>
        <input :id="`skill-${index}-special`" type="text" v-model="skill.special" class="skill-special-input" placeholder="特效说明" name="skill-special">
      </div>
      <div v-if="skill.effect" class="skill-desc">
        <strong>{{ skill.effect }}：</strong>{{ getEffectDescription(skill) }}
        <span v-if="skill.effect.includes('（双槽）')" class="double-slot">（占用2个技能槽）</span>
      </div>
    </div>
    
    <button type="button" class="add-skill-btn" @click="addSkill" :disabled="remainingSlots <= 0">
      + 添加技能
    </button>
  </div>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue'
import { getSkillRangeFields } from '../utils/hexUtils.js'
import { glossaryAPI } from '../api/client.js'

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  maxSlots: { type: Number, default: 3 },
  title: { type: String, default: '技能' }
})

// ★ 射程只读派生：类型基准(近战1/远程3/自动化0) + 词条显式数值额外定义(可为0)。
// 用户明确：射程是算法算出的展示值，不应手填；单位编辑器不再暴露射程录入框。
const skillRangeLabel = (skill) => {
  const { minRange, maxRange } = getSkillRangeFields(skill)
  if (minRange >= maxRange) return `${maxRange} 格`
  return `${minRange}~${maxRange} 格`
}

// 词条前置（来自关联 skill 词条的 prerequisite 字段，单位编辑器按只读展示）
const PRE_LABELS = { melee: '近战', ranged: '远程', auto: '自动化', other: '其它' }
const prereqLabel = (skill) => {
  const p = skill && skill.prerequisite
  if (!p) return ''
  const st = (p.skill_type || '').trim()
  const note = (p.note || '').trim()
  if (!st && !note) return ''
  return (st ? PRE_LABELS[st] || st : '') + (note ? (st ? '（' + note + '）' : note) : '')
}

const emit = defineEmits(['update:modelValue'])

// ── Phase 30-Perm / T5：强引用下拉（按全局词条 skill_key 绑定）──
// 全局词条类别(melee/ranged/auto) → 单位技能中文 type（近战/远程/自动化）
const CATEGORY_TO_CN = { melee: '近战', ranged: '远程', auto: '自动化' }
const glossarySkills = ref([])        // [{key, name, category}]
const glossaryMap = ref({})           // key -> entry 便于回查

const loadGlossary = async () => {
  try {
    const res = await glossaryAPI.getConfig()
    const cfg = res && res.data ? res.data : res
    const list = (cfg && Array.isArray(cfg.skills) ? cfg.skills : [])
    glossarySkills.value = list.map((s) => ({ key: s.key || '', name: s.name || '', category: s.category || 'melee' }))
    glossaryMap.value = Object.fromEntries(glossarySkills.value.map((s) => [s.key, s]))
  } catch (e) {
    glossarySkills.value = []
    glossaryMap.value = {}
  }
}

// 选中全局词条 → 灌入 name / skill_key / 中文 type（选中即灌入，契合 C 文档决策）
const onGlossaryBind = (skill, key) => {
  if (!key) { skill.skill_key = ''; return }
  const entry = glossaryMap.value[key]
  if (!entry) return
  skill.name = entry.name
  skill.skill_key = entry.key
  skill.type = CATEGORY_TO_CN[entry.category] || skill.type || ''
  emit('update:modelValue', [...props.modelValue])
}

// 旧单位技能（仅 name 无 skill_key）→ 按 name 精确匹配全局词条补全 skill_key（匹配不上留空降级）
const backfillSkillKeys = () => {
  if (!glossarySkills.value.length) return
  const byName = Object.fromEntries(glossarySkills.value.map((s) => [s.name, s]))
  let changed = false
  props.modelValue.forEach((sk) => {
    if (!sk.skill_key && sk.name && byName[sk.name]) {
      sk.skill_key = byName[sk.name].key
      changed = true
    }
  })
  if (changed) emit('update:modelValue', [...props.modelValue])
}

// ★ 方案C·前端源头修复：切换中文 effect 下拉时，自动补全对应的英文 skill_key 并落库。
//   反查来源：动态加载的词条库（name → key 索引，可覆盖词条库新增条目），
//   仅当词条库未命中时回退到静态映射（覆盖「effect 与词条 name 不完全对齐」的 3 个历史重叠项）。
const EFFECT_TO_KEY_FALLBACK = {
  '格挡': 'block',
  '扫射': 'sweep',
  '投掷': 'throw',
}
const onEffectChange = (skill) => {
  const effect = skill.effect || ''
  if (!effect) return
  // 优先在动态词条库中按 name 反查 key，未命中再走静态兜底
  const byName = Object.fromEntries(glossarySkills.value.map((s) => [s.name, s.key]))
  const resolvedKey = byName[effect] || EFFECT_TO_KEY_FALLBACK[effect] || ''
  // ★ 只在反查命中时才写入：effect 12 项中仅 3 项有对应词条，
  //   未命中时必须保留已由词条下拉绑定的 skill_key，否则会把有效外键擦成空串。
  if (resolvedKey) {
    skill.skill_key = resolvedKey
    emit('update:modelValue', [...props.modelValue])
  }
}

onMounted(async () => {
  await loadGlossary()
  backfillSkillKeys()
})

const meleeEffects = ['反击', '格挡', '长柄', '补给（双槽）']
const rangedEffects = ['扫射', '投掷', '稳定', '狙击']
const autoEffects = ['助攻', '守护', '阻碍', '侦察（双槽）']

const effectDescriptions = {
  '反击': '被动：受到敌人攻击且对方处于该技能攻击辐射范围内时触发，对其发动一次反击，并且伤害+2',
  '格挡': '被动：被攻击时伤害-3',
  '长柄': '攻击辐射范围扩大至周围两圈',
  '补给（双槽）': '只能对友军单位使用，跳过移动环节，对辐射范围1内的友军回复格斗值*1的HP',
  '扫射': '扇形射程2格攻击，不进行机动值判定。精准命中单体造成伤害-2，射程内所有目标伤害由所有目标均摊',
  '投掷': '射程1~3格攻击',
  '稳定': '射程1~4格攻击，伤害稳定',
  '狙击': '射程4~6格攻击，拥有该特性的技能需要舍弃本回合的移动后才能使用，机动值差计算中目标的机动值-2',
  '助攻': '友军攻击时触发，使其伤害+2',
  '守护': '被动：受到攻击时代替友军承受伤害',
  '阻碍': '敌军攻击时触发，降低其伤害-2',
  '侦察（双槽）': '跳过移动环节，对射击值*1射程内的区域进行侦察，暴露敌方单位3*3的辐射范围'
}

const getEffectDescription = (skill) => effectDescriptions[skill.effect] || ''

const usedSlots = computed(() => props.modelValue.reduce((sum, skill) => sum + (skill.effect?.includes('（双槽）') ? 2 : 1), 0))
const remainingSlots = computed(() => props.maxSlots - usedSlots.value)

const addSkill = () => {
  if (remainingSlots.value > 0) {
    emit('update:modelValue', [...props.modelValue, { name: '', type: '', attribute: '', effect: '', range: '', special: '', skill_key: '' }])
  }
}

const removeSkill = (index) => {
  emit('update:modelValue', props.modelValue.filter((_, i) => i !== index))
}

const onTypeChange = (skill) => {
  skill.effect = ''
  emit('update:modelValue', [...props.modelValue])
}
</script>

<style scoped>
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
.skills-editor { margin-top: 12px; }
.skills-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.label { font-size: 12px; color: rgba(193,232,255,0.45); font-family: 'Fira Code', monospace; }

.skill-item { background: #083344; border: 1px solid rgba(255,176,0,0.08); padding: 10px; margin-bottom: 8px; }

.skill-row { display: flex; gap: 7px; align-items: center; }
.skill-type-select, .skill-attr-select, .skill-effect-select {
  padding: 6px 8px; border: 1px solid rgba(159,142,120,0.25); font-size: 12px;
  background: #001e2b; color: #c1e8ff; font-family: 'Fira Code', monospace;
}
.skill-type-select { width: 90px; }
.skill-attr-select { width: 70px; }
.skill-effect-select { flex: 1; }

.skill-name-input, .skill-range-input, .skill-special-input {
  padding: 6px 8px; border: 1px solid rgba(159,142,120,0.25); font-size: 12px;
  background: #001e2b; color: #c1e8ff; font-family: 'Fira Code', monospace;
}
.skill-name-input::placeholder, .skill-range-input::placeholder, .skill-special-input::placeholder { color: rgba(193,232,255,0.2); }
.skill-name-input { width: 130px; }
.skill-bind-select {
  padding: 6px 8px; border: 1px solid rgba(159,142,120,0.25); font-size: 12px;
  background: #001e2b; color: #c1e8ff; font-family: 'Fira Code', monospace; width: 150px;
}
.skill-key-badge {
  font-size: 11px; color: #ffb000; background: rgba(255,176,0,0.1);
  border: 1px solid rgba(255,176,0,0.3); padding: 2px 6px; border-radius: 3px;
  font-family: 'Fira Code', monospace; white-space: nowrap;
}
.skill-extra-row { display: flex; gap: 7px; margin-top: 7px; }
.skill-range-input { width: 70px; }
.skill-special-input { flex: 1; min-width: 180px; }

.delete-btn {
  width: 26px; height: 26px; border: none;
  background: #b92902; color: #ffd2c8; font-size: 16px; font-weight: 700;
  cursor: pointer; transition: all .15s;
}
.delete-btn:hover { background: #ff7351; }

.skill-desc {
  margin-top: 7px; font-size: 11px; color: rgba(193,232,255,0.5);
  background: #001e2b; padding: 7px; line-height: 1.5; font-family: 'Fira Code', monospace;
}
.double-slot { color: #ffb000; font-weight: 700; }

.add-skill-btn {
  width: 100%; padding: 8px; border: 2px dashed rgba(159,142,120,0.25);
  background: transparent; color: rgba(193,232,255,0.35);
  font-family: 'Fira Code', monospace; font-size: 12px; cursor: pointer;
  text-transform: uppercase; letter-spacing: 0.05em; transition: all .15s;
}
.add-skill-btn:hover:not(:disabled) { border-color: #ffb000; color: #ffb000; }
.add-skill-btn:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
