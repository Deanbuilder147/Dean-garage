<template>
  <div class="edit-block">
    <div class="eb-title">③ 掷骰 Roll</div>
    <div class="block-body">
      <div class="param-row">
        <span class="param-key">模式 (roll.mode)</span>
        <select class="param-select" v-model="mode">
          <option v-for="[val, label] in modeOptions" :key="val" :value="val">{{ label }}</option>
        </select>
      </div>
      <div class="param-row">
        <span class="param-key">数值生成 (generator.method)</span>
        <select class="param-select" v-model="method">
          <option v-for="[val, label] in methodOptions" :key="val" :value="val">{{ label }}</option>
        </select>
      </div>
      <div class="cond-adv">
        <button class="btn-ghost" @click="showSegments = !showSegments">
          {{ showSegments ? '收起分支区间 ▲' : '展开分支区间 ▼' }}
        </button>
        <!-- ★ 阶段一 B5：all_or_nothing 顶层开关 -->
        <label class="aon-toggle">
          <input type="checkbox" v-model="allOrNothing" />
          <span>全失效模式 (all_or_nothing)：掷骰未落入任何区间则整技能 0 伤害</span>
        </label>
        <div v-if="showSegments" class="seg-list">
          <div v-for="(seg, i) in segments" :key="i" class="seg-card">
            <div class="seg-row">
              <input class="param-input" type="number" v-model.number="seg.lower" placeholder="下限" />
              <span class="seg-sep">~</span>
              <input class="param-input" type="number" v-model.number="seg.upper" placeholder="上限" />
              <input class="seg-label" v-model="seg.label" placeholder="结果标签" />
              <button class="btn-delete" @click="segments.splice(i, 1)">✕</button>
            </div>
            <!-- ★ 阶段一 A/B：离散点数匹配（与区间并存，有 points 优先） -->
            <div class="seg-row">
              <span class="seg-sep">离散点 points（逗号分隔，如 1,3,5；留空则用区间）</span>
              <input class="seg-points" v-model="seg.pointsText" placeholder="1,3,5" @change="syncPoints(seg)" />
            </div>
            <!-- S4：每个骰点区间内嵌独立 EffectStackBuilder（按点数触发不同 effects[]） -->
            <div class="seg-effects">
              <EffectStackBuilder
                :modelValue="seg.effects || (seg.effects = [])"
                @update:modelValue="v => seg.effects = v"
                label="本区间效果"
                compact
              />
            </div>
          </div>
          <button class="btn-add" @click="segments.push({ lower: 1, upper: 1, label: '', points: null, pointsText: '', effects: [] })">+ 添加分支</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { ROLL_MODE, VALUE_METHOD } from '../../contracts/enums.mirror.js'
import EffectStackBuilder from '../glossary-editor/EffectStackBuilder.vue'

const props = defineProps({ draft: { type: Object, required: true } })

const MODE_LABELS = { none: '无', dice: '掷骰', spinner: '转盘', card_draw: '抽卡', rps: '猜拳' }
const METHOD_LABELS = { dice: '骰子', spinner: '转盘', card: '卡牌', rps: '猜拳' }
const modeOptions = computed(() => Object.values(ROLL_MODE).map(v => [v, MODE_LABELS[v] || v]))
const methodOptions = computed(() => Object.values(VALUE_METHOD).map(v => [v, METHOD_LABELS[v] || v]))

function ensure () {
  if (!props.draft.roll) props.draft.roll = { mode: 'none', generator: { method: 'dice' }, segments: [] }
  if (!props.draft.roll.generator) props.draft.roll.generator = { method: 'dice' }
  if (!Array.isArray(props.draft.roll.segments)) props.draft.roll.segments = []
  if (props.draft.roll.all_or_nothing == null) props.draft.roll.all_or_nothing = false
  return props.draft.roll
}
const mode = computed({ get: () => ensure().mode || 'none', set: v => { ensure().mode = v } })
const method = computed({ get: () => ensure().generator.method || 'dice', set: v => { ensure().generator.method = v } })
const segments = computed({ get: () => ensure().segments, set: v => { ensure().segments = v } })
const allOrNothing = computed({
  get: () => ensure().all_or_nothing === true,
  set: v => { ensure().all_or_nothing = v === true }
})
const showSegments = ref(false)

// ★ 阶段一 A/B：离散点数文本（"1,3,5"）→ 数字数组写入 seg.points
function syncPoints (seg) {
  const txt = (seg.pointsText || '').trim()
  if (!txt) { seg.points = null; return }
  const nums = txt.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !Number.isNaN(n))
  seg.points = nums.length ? nums : null
}
</script>

<style scoped>
.edit-block { background: rgba(0,0,0,0.12); border: 1px solid rgba(159,142,120,0.12); border-radius: 8px; padding: 8px; margin-top: 8px; }
.eb-title { color: #ffb000; font-size: 12px; font-weight: 600; margin-bottom: 6px; padding: 4px 0 4px 8px; border-left: 3px solid #ffb000; background: rgba(255,176,0,0.06); border-radius: 4px; }
.block-body { background: rgba(0,0,0,0.28); border-radius: 6px; padding: 8px; display: flex; flex-direction: column; gap: 6px; }
.param-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.param-key { color: #9fb0c4; font-size: 12px; min-width: 120px; }
.param-input { width: 64px; background: rgba(0,0,0,0.35); color: #ffd597; border: 1px solid rgba(255,176,0,0.22); border-radius: 4px; padding: 4px 6px; font-family: inherit; }
.param-input:focus { outline: none; box-shadow: 0 0 0 2px rgba(255,176,0,0.15); }
.param-select { background: rgba(0,0,0,0.35); color: #ffd597; border: 1px solid rgba(255,176,0,0.22); border-radius: 4px; padding: 6px 8px; font-size: 13px; }
.param-select:focus { outline: none; box-shadow: 0 0 0 2px rgba(255,176,0,0.15); }
.cond-adv { display: flex; flex-direction: column; gap: 6px; }
.btn-ghost { align-self: flex-start; background: rgba(0,0,0,0.2); color: #9fb3c8; border: 1px solid rgba(159,142,120,0.25); border-radius: 6px; padding: 4px 10px; cursor: pointer; font-size: 12px; }
.btn-ghost:hover { border-color: #ffb000; color: #ffd597; }
.seg-list { display: flex; flex-direction: column; gap: 6px; background: rgba(0,0,0,0.18); border-radius: 6px; padding: 8px; }
.seg-card { border: 1px solid rgba(56,189,248,0.18); border-radius: 6px; padding: 6px; background: rgba(10,18,28,0.4); }
.seg-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.seg-effects { margin-top: 6px; border-top: 1px dashed rgba(56,189,248,0.18); padding-top: 6px; }
.seg-sep { color: #9fb0c4; }
.seg-label { background: rgba(0,0,0,0.35); color: #ffd597; border: 1px solid rgba(255,176,0,0.22); border-radius: 4px; padding: 4px 6px; font-size: 12px; min-width: 90px; }
.btn-add { align-self: flex-start; background: rgba(0,180,220,0.12); color: #38bdf8; border: 1px solid rgba(0,180,220,0.4); border-radius: 6px; padding: 4px 10px; cursor: pointer; font-size: 12px; }
.btn-add:hover { background: rgba(0,180,220,0.22); }
.btn-delete { background: rgba(214,69,60,0.12); color: #ff8a80; border: 1px solid rgba(214,69,60,0.4); border-radius: 4px; padding: 2px 8px; cursor: pointer; font-size: 12px; }
.btn-delete:hover { background: rgba(214,69,60,0.25); }
.seg-points { background: rgba(0,0,0,0.35); color: #ffd597; border: 1px solid rgba(255,176,0,0.22); border-radius: 4px; padding: 4px 6px; font-size: 12px; min-width: 120px; }
.seg-points:focus { outline: none; box-shadow: 0 0 0 2px rgba(255,176,0,0.15); }
.aon-toggle { display: flex; align-items: center; gap: 6px; color: #9fb3c8; font-size: 12px; cursor: pointer; }
.aon-toggle input { accent-color: #ffb000; }
</style>
