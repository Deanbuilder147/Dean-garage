<template>
  <div class="reaction-overlay">
    <div class="reaction-panel cover">
      <div class="reaction-icon">🛡️</div>
      <div class="reaction-title">援助反应窗口</div>
      <div class="reaction-body">
        <p>
          友军 <b class="v">{{ pending.victimName }}</b> 正被
          <b class="a">{{ pending.attackerName }}</b> 攻击，<br />
          援助者 <b class="h">{{ pending.helperName }}</b> 可发动「援助」！
        </p>
        <div class="countdown-bar">
          <div class="countdown-fill" :style="{ width: countdownPct + '%' }"></div>
        </div>
        <p class="timer">剩余 {{ remaining }}s（超时自动放弃）</p>
      </div>
      <div class="reaction-actions">
        <button class="reaction-btn share" :disabled="!canMoveShare" @click="emit('resolve', 'move_share')">
          瞬移分担 (5)
        </button>
        <button class="reaction-btn counter" :disabled="!canCounter" @click="emit('resolve', 'attack_counter')">
          反击 (5)
        </button>
        <button class="reaction-btn giveup" @click="emit('resolve', 'give_up')">
          放弃
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  pending: { type: Object, default: () => ({}) }
})
const emit = defineEmits(['resolve'])

const options = computed(() => props.pending.options || ['move_share', 'attack_counter', 'give_up'])
const canMoveShare = computed(() => options.value.includes('move_share'))
const canCounter = computed(() => options.value.includes('attack_counter'))

const remaining = ref(10)
const countdownPct = ref(100)
let timer = null

function tick() {
  const expire = props.pending.expireAt || (Date.now() + 10000)
  const left = Math.max(0, expire - Date.now())
  remaining.value = Math.ceil(left / 1000)
  countdownPct.value = Math.max(0, Math.min(100, (left / 10000) * 100))
  if (left <= 0 && timer) {
    clearInterval(timer)
    timer = null
    emit('resolve', 'give_up')
  }
}

onMounted(() => {
  tick()
  timer = setInterval(tick, 200)
})
onUnmounted(() => { if (timer) clearInterval(timer) })
</script>

<style scoped>
.reaction-overlay {
  position: fixed; inset: 0; z-index: 9998;
  background: rgba(0, 0, 0, 0.72);
  display: flex; align-items: center; justify-content: center;
}
.reaction-panel {
  min-width: 380px; max-width: 500px; padding: 22px 26px;
  background: linear-gradient(160deg, #101a14, #0a100c);
  border: 1px solid #2a6a4a; border-radius: 12px;
  box-shadow: 0 0 28px rgba(60, 220, 140, 0.3);
  text-align: center; color: #e6f5ec;
  font-family: 'Fira Code', monospace;
}
.reaction-icon { font-size: 46px; line-height: 1; margin-bottom: 6px; }
.reaction-title { font-size: 18px; font-weight: bold; letter-spacing: 2px; color: #69f0ae; }
.cover .reaction-title { text-shadow: 0 0 12px rgba(105, 240, 174, 0.6); }
.reaction-body { margin: 14px 0; font-size: 14px; line-height: 1.6; }
.v { color: #ff8a80; }
.a { color: #ff5252; }
.h { color: #69f0ae; }
.countdown-bar {
  width: 100%; height: 8px; border-radius: 4px; margin: 12px 0 4px;
  background: #1a2a20; overflow: hidden; border: 1px solid #2a6a4a;
}
.countdown-fill {
  height: 100%; background: linear-gradient(90deg, #69f0ae, #ffd166, #ff5252);
  transition: width 0.2s linear;
}
.timer { color: #9ac0aa; font-size: 12px; margin: 4px 0 0; }
.reaction-actions { margin-top: 16px; display: flex; gap: 10px; justify-content: center; }
.reaction-btn {
  padding: 8px 14px; border-radius: 8px; cursor: pointer;
  border: 1px solid #2a6a4a; background: #0e1a12; color: #e6f5ec;
  font-family: inherit; font-size: 13px; transition: all 0.15s;
}
.reaction-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.reaction-btn.share { background: #1b5e4a; border-color: #69f0ae; }
.reaction-btn.share:not(:disabled):hover { background: #69f0ae; color: #0a100c; }
.reaction-btn.counter { background: #5e4a1b; border-color: #ffd166; }
.reaction-btn.counter:not(:disabled):hover { background: #ffd166; color: #0a100c; }
.reaction-btn.giveup { background: #37474f; border-color: #546e7a; }
.reaction-btn.giveup:hover { background: #546e7a; }
</style>
