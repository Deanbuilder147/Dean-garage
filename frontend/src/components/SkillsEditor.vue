<template>
  <div class="skills-editor">
    <div class="skills-header">
      <span class="label">技能（剩余 {{ remainingSlots }} 槽）</span>
    </div>
    
    <div v-for="(skill, index) in modelValue" :key="index" class="skill-item">
      <div class="skill-row">
        <!-- 技能名称 -->
        <input type="text" v-model="skill.name" class="skill-name-input" placeholder="技能名" />
        
        <!-- 技能类型 -->
        <select v-model="skill.type" class="skill-type-select" @change="onTypeChange(skill)">
          <option value="">类型</option>
          <option value="近战">近战</option>
          <option value="远程">远程</option>
          <option value="自动化">自动化</option>
        </select>
        
        <!-- 属性 -->
        <select v-model="skill.attribute" class="skill-attr-select">
          <option value="">属性</option>
          <option value="实体">实体</option>
          <option value="光束">光束</option>
        </select>
        
        <!-- 效果 -->
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
        
        <!-- 删除按钮 -->
        <button type="button" class="delete-btn" @click="removeSkill(index)">×</button>
      </div>
      
      <!-- 距离和特效 -->
      <div class="skill-extra-row">
        <input type="text" v-model="skill.range" class="skill-range-input" placeholder="距离" />
        <input type="text" v-model="skill.special" class="skill-special-input" placeholder="特效说明" />
      </div>
      
      <!-- 效果说明 -->
      <div v-if="skill.effect" class="skill-desc">
        <strong>{{ skill.effect }}：</strong>{{ getEffectDescription(skill) }}
        <span v-if="skill.effect.includes('（双槽）')" class="double-slot">（占用2个技能槽）</span>
      </div>
    </div>
    
    <!-- 添加按钮 -->
    <button type="button" class="add-skill-btn" @click="addSkill" :disabled="remainingSlots <= 0">
      + 添加技能
    </button>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  modelValue: {
    type: Array,
    default: () => []
  },
  maxSlots: {
    type: Number,
    default: 3
  }
})

const emit = defineEmits(['update:modelValue'])

// 技能效果列表
const meleeEffects = ['反击', '格挡', '长柄', '补给（双槽）']
const rangedEffects = ['扫射', '投掷', '稳定', '狙击']
const autoEffects = ['助攻', '守护', '阻碍', '侦察（双槽）']

// 效果说明
const effectDescriptions = {
  '反击': '被动：受到敌人攻击且对方处于该技能攻击范围内时触发，对其发动一次反击，并且伤害+2',
  '格挡': '被动：被攻击时伤害-3',
  '长柄': '攻击范围扩大至周围两圈',
  '补给（双槽）': '只能对友军单位使用，跳过移动环节，对范围1内的友军回复格斗值*1的HP',
  '扫射': '不进行机动值判定，掷骰决定效果: 1~3：精准命中，单体攻击，但造成伤害-2。4~6：对范围内的所有目标进行攻击，伤害由所有目标均摊',
  '投掷': '1~3格范围攻击',
  '稳定': '1~4格范围攻击，伤害稳定',
  '狙击': '4~6格范围攻击，拥有该特性的技能需要舍弃本回合的移动后才能使用，机动值差计算中目标的机动值-2',
  '助攻': '友军攻击时触发，使其伤害+2',
  '守护': '被动：受到攻击时代替友军承受伤害',
  '阻碍': '敌军攻击时触发，降低其伤害-2',
  '侦察（双槽）': '跳过移动环节，对射击值*1范围内的区域进行侦察，暴露敌方单位3*3的范围'
}

const getEffectDescription = (skill) => {
  return effectDescriptions[skill.effect] || ''
}

// 计算剩余槽位（考虑双槽技能）
const usedSlots = computed(() => {
  return props.modelValue.reduce((sum, skill) => {
    return sum + (skill.effect?.includes('（双槽）') ? 2 : 1)
  }, 0)
})

const remainingSlots = computed(() => {
  return props.maxSlots - usedSlots.value
})

const addSkill = () => {
  if (remainingSlots.value > 0) {
    const newSkills = [...props.modelValue, { name: '', type: '', attribute: '', effect: '', range: '', special: '' }]
    emit('update:modelValue', newSkills)
  }
}

const removeSkill = (index) => {
  const newSkills = props.modelValue.filter((_, i) => i !== index)
  emit('update:modelValue', newSkills)
}

const onTypeChange = (skill) => {
  skill.effect = ''  // 清空效果选择
  emit('update:modelValue', [...props.modelValue])
}

const onAttrChange = (skill) => {
  emit('update:modelValue', [...props.modelValue])
}
</script>

<style scoped>
.skills-editor {
  margin-top: 12px;
}

.skills-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.label {
  font-size: 13px;
  color: #9aa0a6;
}

.skill-item {
  background: #161616;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0px;
  padding: 10px;
  margin-bottom: 8px;
}

.skill-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.skill-type-select,
.skill-attr-select,
.skill-effect-select {
  padding: 6px 8px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 0px;
  font-size: 13px;
  background: #20262f;
  color: #e6e8eb;
}

.skill-type-select {
  width: 100px;
}

.skill-attr-select {
  width: 80px;
}

.skill-effect-select {
  flex: 1;
}

.skill-name-input,
.skill-range-input,
.skill-special-input {
  padding: 6px 8px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 0px;
  font-size: 13px;
  background: #20262f;
  color: #e6e8eb;
}

.skill-name-input::placeholder,
.skill-range-input::placeholder,
.skill-special-input::placeholder {
  color: #72757d;
}

.skill-name-input {
  width: 140px;
}

.skill-extra-row {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.skill-range-input {
  width: 80px;
}

.skill-special-input {
  flex: 1;
  min-width: 200px;
}

.delete-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: #b92902;
  color: #ffd2c8;
  border-radius: 0px;
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
}

.delete-btn:hover {
  background: #ff7351;
}

.skill-desc {
  margin-top: 8px;
  font-size: 12px;
  color: #9aa0a6;
  background: #0d0d0d;
  padding: 8px;
  border-radius: 0px;
  line-height: 1.5;
}

.double-slot {
  color: #ff9800;
  font-weight: bold;
}

.add-skill-btn {
  width: 100%;
  padding: 8px;
  border: 2px dashed rgba(255, 255, 255, 0.2);
  background: transparent;
  color: #9aa0a6;
  border-radius: 0px;
  cursor: pointer;
  font-size: 13px;
}

.add-skill-btn:hover:not(:disabled) {
  border-color: #00FF41;
  color: #00FF41;
}

.add-skill-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
