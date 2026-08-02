<template>
  <div class="airdrop-bubble" @click.stop="$emit('close')">
    <div class="airdrop-head">🪂 空投补给</div>
    <div class="airdrop-kind">{{ kindLabel }}</div>
    <div class="airdrop-desc">{{ descText }}</div>
    <div class="airdrop-hint">每回合开始的补给箱，拾取后获得增益（由服务端结算）</div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  item: { type: Object, default: () => ({}) }
})
defineEmits(['close'])

const kindLabel = computed(() => {
  switch (props.item.kind) {
    case 'buff': return '增益箱'
    case 'ammo': return '弹药箱'
    case 'repair': return '维修包'
    default: return props.item.label || '补给箱'
  }
})
const descText = computed(() => {
  switch (props.item.kind) {
    case 'buff': return '拾取后获得「空投增益」：配合幸运词条解锁额外行动。'
    case 'ammo': return '补给弹药，恢复射击能力。'
    case 'repair': return '维修受损机体，恢复结构值。'
    default: return '未知补给类型。'
  }
})
</script>

<style scoped>
.airdrop-bubble {
  position: fixed; left: 50%; bottom: 96px; transform: translateX(-50%);
  z-index: 9996; min-width: 220px; max-width: 280px;
  padding: 12px 16px; border-radius: 10px; cursor: pointer;
  background: linear-gradient(160deg, #2a2410, #15110a);
  border: 1px solid #ffd166;
  box-shadow: 0 0 20px rgba(255, 209, 102, 0.35);
  color: #f5efe0; font-family: 'Fira Code', monospace; font-size: 13px;
}
.airdrop-head { font-weight: bold; color: #ffd166; letter-spacing: 1px; }
.airdrop-kind { font-size: 15px; margin: 4px 0; color: #ffe082; }
.airdrop-desc { font-size: 12px; line-height: 1.5; color: #e8dfc8; }
.airdrop-hint { font-size: 11px; color: #aa9a78; margin-top: 6px; }
</style>
