<template>
  <div class="reaction-overlay" @click.self="$emit('close')">
    <div class="reaction-panel execute">
      <div class="reaction-icon">☠️</div>
      <div class="reaction-title">斩杀触发</div>
      <div class="reaction-body">
        <p>
          <b>{{ targetName }}</b> 生命值降至
          <span class="hp-low">{{ hp }}</span>，
          掷骰 <span class="roll">{{ roll }}</span> 超过剩余 HP，处决成功！
        </p>
        <p class="muted">目标已被当场击杀，无法进入濒死状态。</p>
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
  payload: { type: Object, default: () => ({}) }
})
defineEmits(['close'])

const targetName = computed(() => props.payload?.targetName || '目标')
const hp = computed(() => props.payload?.hp)
const roll = computed(() => props.payload?.roll)
</script>

<style scoped>
.reaction-overlay {
  position: fixed; inset: 0; z-index: 9998;
  background: rgba(0, 0, 0, 0.72);
  display: flex; align-items: center; justify-content: center;
}
.reaction-panel {
  min-width: 320px; max-width: 440px; padding: 22px 26px;
  background: linear-gradient(160deg, #1a1014, #0d0a0e);
  border: 1px solid #5a2a2a; border-radius: 12px;
  box-shadow: 0 0 28px rgba(220, 60, 60, 0.35);
  text-align: center; color: #f0e6e6;
  font-family: 'Fira Code', monospace;
}
.reaction-icon { font-size: 46px; line-height: 1; margin-bottom: 6px; }
.reaction-title { font-size: 18px; font-weight: bold; letter-spacing: 2px; color: #ff6b6b; }
.execute .reaction-title { text-shadow: 0 0 12px rgba(255, 80, 80, 0.6); }
.reaction-body { margin: 14px 0; font-size: 14px; line-height: 1.6; }
.muted { color: #9a8a8a; font-size: 12px; }
.hp-low { color: #ff5252; font-weight: bold; }
.roll { color: #ffd166; font-weight: bold; font-size: 16px; }
.reaction-actions { margin-top: 16px; }
.reaction-btn {
  padding: 8px 22px; border-radius: 8px; cursor: pointer;
  border: 1px solid #5a2a2a; background: #2a1414; color: #f0e6e6;
  font-family: inherit; font-size: 14px; transition: all 0.15s;
}
.reaction-btn.primary { background: #c0392b; border-color: #e74c3c; }
.reaction-btn.primary:hover { background: #e74c3c; }
</style>
