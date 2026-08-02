<template>
  <div class="reactivate-banner" @click="$emit('close')">
    <span class="ico">🔄</span>
    <span class="txt"><b>{{ name }}</b> 再动！行动点已重置，本回合可再次行动</span>
    <span class="close">✕</span>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  payload: { type: Object, default: () => ({}) }
})
defineEmits(['close'])

const name = computed(() => props.payload?.name || '单位')
</script>

<style scoped>
.reactivate-banner {
  position: fixed; top: 84px; left: 50%; transform: translateX(-50%);
  z-index: 9997; cursor: pointer;
  display: flex; align-items: center; gap: 10px;
  padding: 12px 22px; border-radius: 10px;
  background: linear-gradient(120deg, #1b3a5e, #0d1f33);
  border: 1px solid #29b6f6;
  box-shadow: 0 0 24px rgba(41, 182, 246, 0.45);
  color: #e3f2fd; font-family: 'Fira Code', monospace; font-size: 14px;
  animation: pulse 1.2s ease-in-out infinite;
}
.ico { font-size: 20px; }
.txt b { color: #4dd0e1; }
.close { margin-left: 6px; color: #90caf9; opacity: 0.7; }
@keyframes pulse {
  0%, 100% { box-shadow: 0 0 18px rgba(41, 182, 246, 0.35); }
  50% { box-shadow: 0 0 30px rgba(41, 182, 246, 0.65); }
}
</style>
