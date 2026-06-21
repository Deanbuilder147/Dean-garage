<template>
  <div class="skills-editor">
    <div class="skills-header">
      <span class="label">{{ title }}（剩余 {{ remainingSlots }} 槽）</span>
    </div>
    
    <div v-for="(skill, index) in modelValue" :key="index" class="skill-item">
      <div class="skill-row">
        <input type="text" v-model="skill.name" class="skill-name-input" placeholder="技能名">
        <select v-model="skill.type" class="skill-type-select" @change="onTypeChange(skill)">
          <option value="">类型</option>
          <option value="近战">近战</option>
          <option value="远程">远程</option>
          <option value="自动化">自动化</option>
        </select>
        <select v-model="skill.attribute" class="skill-attr-select">
          <option value="">属性</option>
          <option value="实体">实体</option>
          <option value="光束">光束</option>
        </select>
        <select v-model="skill.effect" class="skill-effect-select">
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
        <input type="text" v-model="skill.range" class="skill-range-input" placeholder="距离">
        <input type="text" v-model="skill.special" class="skill-special-input" placeholder="特效说明">
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
import { computed } from 'vue'

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  maxSlots: { type: Number, default: 3 },
  title: { type: String, default: '技能' }
})

const emit = defineEmits(['update:modelValue'])

const meleeEffects = ['反击', '格挡', '长柄', '补给（双槽）']
const rangedEffects = ['扫射', '投掷', '稳定', '狙击']
const autoEffects = ['助攻', '守护', '阻碍', '侦察（双槽）']

const effectDescriptions = {
  '反击': '被动：受到敌人攻击且对方处于该技能攻击范围内时触发，对其发动一次反击，并且伤害+2',
  '格挡': '被动：被攻击时伤害-3',
  '长柄': '攻击范围扩大至周围两圈',
  '补给（双槽）': '只能对友军单位使用，跳过移动环节，对范围1内的友军回复格斗值*1的HP',
  '扫射': '扇形2格范围攻击，不进行机动值判定。精准命中单体造成伤害-2，范围攻击伤害由所有目标均摊',
  '投掷': '1~3格范围攻击',
  '稳定': '1~4格范围攻击，伤害稳定',
  '狙击': '4~6格范围攻击，拥有该特性的技能需要舍弃本回合的移动后才能使用，机动值差计算中目标的机动值-2',
  '助攻': '友军攻击时触发，使其伤害+2',
  '守护': '被动：受到攻击时代替友军承受伤害',
  '阻碍': '敌军攻击时触发，降低其伤害-2',
  '侦察（双槽）': '跳过移动环节，对射击值*1范围内的区域进行侦察，暴露敌方单位3*3的范围'
}

const getEffectDescription = (skill) => effectDescriptions[skill.effect] || ''

const usedSlots = computed(() => props.modelValue.reduce((sum, skill) => sum + (skill.effect?.includes('（双槽）') ? 2 : 1), 0))
const remainingSlots = computed(() => props.maxSlots - usedSlots.value)

const addSkill = () => {
  if (remainingSlots.value > 0) {
    emit('update:modelValue', [...props.modelValue, { name: '', type: '', attribute: '', effect: '', range: '', special: '' }])
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
