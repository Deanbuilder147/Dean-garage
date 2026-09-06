<template>
  <div class="reaction-overlay" @click.self="$emit('close')">
    <div class="reaction-panel lucky">
      <div class="reaction-icon">🎲</div>
      <div class="reaction-title">幸运掷骰</div>
      <div class="reaction-body">
        <div class="dice-face" :class="effectClass">{{ lucky.roll }}</div>
        <p class="effect-text" :class="effectClass">{{ effectText }}</p>
        <p class="muted">{{ detailText }}</p>
      </div>
      <div class="reaction-actions">
        <button class="reaction-btn primary" @click="$emit('close')">确认</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  lucky: { type: Object, default: () => ({ roll: 0, effect: '' }) }
})
defineEmits(['close'])

const effectText = computed(() => {
  switch (props.lucky.effect) {
    case 'skip_attack': return '跳过攻击'
    case 'allow_attack': return '可正常攻击'
    case 'extra_move_and_attack': return '额外移动并攻击'
    default: return '未知'
  }
})
const effectClass = computed(() => {
  switch (props.lucky.effect) {
    case 'skip_attack': return 'bad'
    case 'allow_attack': return 'neutral'
    case 'extra_move_and_attack': return 'good'
    default: return 'neutral'
  }
})
const detailText = computed(() => {
  switch (props.lucky.effect) {
    case 'skip_attack': return '本回合该单位无法发动攻击。'
    case 'allow_attack': return '该单位本回合行动不受限制。'
    case 'extra_move_and_attack': return '该单位可再次移动并攻击一次！'
    default: return ''
  }
})
</script>

<style scoped>
.reaction-overlay {
  position: fixed; inset: 0; z-index: 9998;
  background: rgba(0, 0, 0, 0.72);
  display: flex; align-items: center; justify-content: center;
}
.reaction-panel {
  min-width: 320px; max-width: 420px; padding: 22px 26px;
  background: linear-gradient(160deg, #14101a, #0a0810);
  border: 1px solid #5a2a6a; border-radius: 12px;
  box-shadow: 0 0 28px rgba(180, 90, 220, 0.3);
  text-align: center; color: #f0e6f5;
  font-family: 'Fira Code', monospace;
}
.reaction-icon { font-size: 46px; line-height: 1; margin-bottom: 6px; }
.reaction-title { font-size: 18px; font-weight: bold; letter-spacing: 2px; color: #ce93d8; }
.lucky .reaction-title { text-shadow: 0 0 12px rgba(210, 130, 240, 0.6); }
.reaction-body { margin: 14px 0; font-size: 14px; line-height: 1.6; }
.muted { color: #aa90aa; font-size: 12px; }
.dice-face {
  font-size: 54px; font-weight: bold; line-height: 1;
  margin: 8px auto; width: 80px; height: 80px; border-radius: 14px;
  display: flex; align-items: center; justify-content: center;
  border: 2px solid currentColor;
}
.dice-face.good { color: #69f0ae; box-shadow: 0 0 18px rgba(105, 240, 174, 0.4); }
.dice-face.neutral { color: #4dd0e1; box-shadow: 0 0 18px rgba(77, 208, 225, 0.4); }
.dice-face.bad { color: #ff8a80; box-shadow: 0 0 18px rgba(255, 138, 128, 0.4); }
.effect-text { font-size: 16px; font-weight: bold; margin: 6px 0; }
.effect-text.good { color: #69f0ae; }
.effect-text.neutral { color: #4dd0e1; }
.effect-text.bad { color: #ff8a80; }
.reaction-actions { margin-top: 16px; }
.reaction-btn {
  padding: 8px 22px; border-radius: 8px; cursor: pointer;
  border: 1px solid #5a2a6a; background: #1a101a; color: #f0e6f5;
  font-family: inherit; font-size: 14px; transition: all 0.15s;
}
.reaction-btn.primary { background: #7b1fa2; border-color: #ce93d8; }
.reaction-btn.primary:hover { background: #ce93d8; color: #1a101a; }
</style>
