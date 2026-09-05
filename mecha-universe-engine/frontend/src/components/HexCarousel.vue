<template>
  <div class="hc-root">
    <div class="hc-stage" :style="stageStyle" ref="stage">
      <div class="hc-carousel">
        <div
          v-for="(it, i) in items"
          :key="i"
          class="hc-card"
          :class="{ active: i === active }"
          :style="cardStyle(i)"
          @click="onClick(i)"
        >
          <div class="hc-inner">
            <div class="hc-title">{{ it.title }}</div>
            <div class="hc-loc" v-if="it.loc">{{ it.loc }}</div>
            <div class="hc-idx" v-if="showIdx">{{ pad(i + 1) }} / {{ pad(items.length) }}</div>
          </div>
        </div>
      </div>
    </div>
    <div class="hc-controls" v-if="showControls">
      <button class="hc-btn" @click="go(-1)">‹ 上一个<span class="en-sub">Prev</span></button>
      <span class="hc-counter">{{ pad(active + 1) }} / {{ pad(items.length) }}</span>
      <button class="hc-btn" @click="go(1)">下一个<span class="en-sub">Next</span> ›</button>
      <button class="hc-btn" @click="toggleAuto">{{ autoOn ? '停止轮播' : '自动轮播' }}<span class="en-sub">{{ autoOn ? 'Stop' : 'Auto' }}</span></button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({
  items: { type: Array, default: () => [] },
  modelValue: { type: Number, default: 0 },
  tilt: { type: Number, default: -27 },
  xStep: { type: Number, default: 59 },
  yStep: { type: Number, default: -29 },
  zStep: { type: Number, default: 0 },
  scaleStep: { type: Number, default: 1.0 },
  selScale: { type: Number, default: 1.0 },
  opDecay: { type: Number, default: 0.13 },
  persp: { type: Number, default: 500 },
  originX: { type: Number, default: 32 },
  originY: { type: Number, default: 8 },
  showIdx: { type: Boolean, default: true },
  showControls: { type: Boolean, default: true },
  auto: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue', 'select'])

const active = ref(props.modelValue)
const stage = ref(null)
const autoOn = ref(false)
let autoTimer = null
let startX = null

const stageStyle = computed(() => ({
  perspective: props.persp + 'px',
  perspectiveOrigin: props.originX + '% ' + props.originY + '%',
}))

function pad(n) { return String(n).padStart(2, '0') }

function cardStyle(i) {
  const CENTER = (props.items.length - 1) / 2
  const off = i - CENTER
  const abs = Math.abs(off)
  const isActive = i === active.value
  const x = off * props.xStep
  const y = off * props.yStep
  const z = -abs * props.zStep + (isActive ? 25 : 0)
  const op = abs > 5 ? 0 : 1 - abs * props.opDecay
  return {
    transform: `translate(-50%, -50%) translate(${x}px, ${y}px) translateZ(${z}px) rotateY(${props.tilt}deg) scale(${isActive ? props.selScale : props.scaleStep})`,
    opacity: op,
    zIndex: isActive ? 200 : 100 - abs,
    filter: isActive ? 'none' : 'brightness(0.7)',
    pointerEvents: abs > 5 ? 'none' : 'auto',
  }
}

function setActive(i) {
  const n = props.items.length
  if (!n) return
  active.value = ((i % n) + n) % n
  emit('update:modelValue', active.value)
  emit('select', active.value)
}
function onClick(i) { if (i !== active.value) setActive(i) }
function go(d) { setActive(active.value + d) }

function toggleAuto() {
  if (autoTimer) { clearInterval(autoTimer); autoTimer = null; autoOn.value = false }
  else { autoTimer = setInterval(() => go(1), 1800); autoOn.value = true }
}

function onKey(e) {
  if (e.key === 'ArrowLeft') go(-1)
  else if (e.key === 'ArrowRight') go(1)
}
function onDown(e) { startX = e.clientX }
function onUp(e) {
  if (startX === null) return
  const dx = e.clientX - startX
  if (dx < -40) go(1)
  else if (dx > 40) go(-1)
  startX = null
}

watch(() => props.modelValue, (v) => { if (v !== active.value) active.value = v })

onMounted(() => {
  window.addEventListener('keydown', onKey)
  if (stage.value) {
    stage.value.addEventListener('pointerdown', onDown)
    stage.value.addEventListener('pointerup', onUp)
  }
  if (props.auto) toggleAuto()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  if (autoTimer) clearInterval(autoTimer)
})
</script>

<style scoped>
.hc-root { display: flex; flex-direction: column; align-items: center; }
.hc-stage {
  position: relative; width: 100%; max-width: 900px; height: 340px; margin: 10px auto;
}
.hc-carousel { position: relative; width: 100%; height: 100%; transform-style: preserve-3d; }
.hc-card {
  position: absolute; top: 50%; left: 50%; width: 180px; height: 205px; cursor: pointer;
  transform-style: preserve-3d;
  transition: transform .55s cubic-bezier(.22,.61,.36,1), opacity .55s ease, filter .55s ease;
  will-change: transform, opacity;
}
.hc-inner {
  width: 100%; height: 100%;
  clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  text-align: center; padding: 0 18px;
  background: rgba(40,54,82,0.55);
  border: 1px solid rgba(120,140,180,0.25);
  backdrop-filter: blur(2px);
}
.hc-card.active .hc-inner {
  background: linear-gradient(155deg, #1b3a63 0%, #0e223c 100%);
  border: 1px solid #ffb000;
  box-shadow: 0 0 38px rgba(255,176,0,0.35), inset 0 0 18px rgba(54,197,240,0.18);
}
.hc-title { font-size: 17px; font-weight: 700; letter-spacing: 1px; color: #cdd8ec; }
.hc-card.active .hc-title { color: #fff; text-shadow: 0 0 10px rgba(255,176,0,0.5); }
.hc-loc { margin-top: 10px; font-size: 11px; line-height: 1.5; color: #6f86ad; }
.hc-card.active .hc-loc { color: #9fd6ee; }
.hc-idx { margin-top: 8px; font-size: 10px; color: #4d608a; letter-spacing: 2px; }
.hc-controls { display: flex; gap: 14px; align-items: center; margin-top: 6px; }
.hc-btn {
  background: rgba(54,197,240,0.08); border: 1px solid rgba(54,197,240,0.35);
  color: #bfe9f7; padding: 9px 18px; border-radius: 8px; font-size: 13px; cursor: pointer;
}
.hc-btn:hover { background: rgba(54,197,240,0.18); }
.hc-counter { font-size: 13px; color: #8aa0c4; letter-spacing: 1px; min-width: 70px; text-align: center; }
</style>
