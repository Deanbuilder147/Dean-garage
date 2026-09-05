<template>
  <div class="edit-block">
    <div class="eb-title">④ 寿命管制 Cost</div>
    <div class="block-body">
      <div class="param-row">
        <label class="param-switch">
          <input type="checkbox" v-model="enforce" />
          <span>启用寿命管制 (cost.enforce)</span>
        </label>
        <span class="param-hint">默认关闭：关闭时本面板仅记录、不实际拦截（opt-in）。</span>
      </div>
      <div class="param-row">
        <span class="param-key">行动点 (cost.ap)</span>
        <input type="number" class="param-input" min="0" v-model.number="apCost" />
        <span class="param-hint">与基础区「行动点」双向映射。</span>
      </div>
      <div class="param-row">
        <span class="param-key">充能 (charges)</span>
        <input type="number" class="param-input" min="0" v-model.number="charges" />
        <span class="param-key">耐久 (durability)</span>
        <input type="number" class="param-input" min="0" v-model.number="durability" />
      </div>
      <div class="param-row">
        <span class="param-key">冷却 (cooldown)</span>
        <input type="number" class="param-input" min="0" v-model.number="cooldown" />
        <span class="param-key">作用域</span>
        <select class="param-select" v-model="limitScope">
          <option v-for="[val, label] in scopeOptions" :key="val" :value="val">{{ label }}</option>
        </select>
      </div>
      <div class="param-hint">cooldown（时间轴）与 limit_scope（作用域）正交，可叠加。</div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { LIMIT_SCOPE } from '../../contracts/enums.mirror.js'

const props = defineProps({ draft: { type: Object, required: true } })

const SCOPE_LABELS = { match: '整局', faction: '阵营', personal: '个人', per_turn: '每回合' }
const scopeOptions = computed(() => Object.values(LIMIT_SCOPE).map(v => [v, SCOPE_LABELS[v] || v]))

function ensure () {
  if (!props.draft.cost) props.draft.cost = {}
  return props.draft.cost
}
const enforce = computed({ get: () => ensure().enforce === true, set: v => { ensure().enforce = v } })
// P3：填入 charges/durability/cooldown 任一 >0 时自动激活 enforce，避免资源闭环静默失效
function autoEnforce () {
  const c = ensure()
  if ((Number(c.charges) || 0) > 0 || (Number(c.durability) || 0) > 0 || (Number(c.cooldown) || 0) > 0) {
    c.enforce = true
  }
}
const charges = computed({ get: () => ensure().charges ?? 0, set: v => { ensure().charges = v; autoEnforce() } })
const durability = computed({ get: () => ensure().durability ?? 0, set: v => { ensure().durability = v; autoEnforce() } })
const cooldown = computed({ get: () => ensure().cooldown ?? 0, set: v => { ensure().cooldown = v; autoEnforce() } })
const limitScope = computed({ get: () => ensure().limit_scope || 'match', set: v => { ensure().limit_scope = v } })
// 双向映射：cost.ap ⇄ 顶层 ap_cost（基础区共用同一字段）
const apCost = computed({
  get: () => Number(props.draft.ap_cost) || 0,
  set: v => { props.draft.ap_cost = v; ensure().ap = v }
})
</script>

<style scoped>
.edit-block { background: rgba(0,0,0,0.12); border: 1px solid rgba(159,142,120,0.12); border-radius: 8px; padding: 8px; margin-top: 8px; }
.eb-title { color: #ffb000; font-size: 12px; font-weight: 600; margin-bottom: 6px; padding: 4px 0 4px 8px; border-left: 3px solid #ffb000; background: rgba(255,176,0,0.06); border-radius: 4px; }
.block-body { background: rgba(0,0,0,0.28); border-radius: 6px; padding: 8px; display: flex; flex-direction: column; gap: 6px; }
.param-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.param-key { color: #9fb0c4; font-size: 12px; min-width: 84px; }
.param-input { width: 64px; background: rgba(0,0,0,0.35); color: #ffd597; border: 1px solid rgba(255,176,0,0.22); border-radius: 4px; padding: 4px 6px; font-family: inherit; }
.param-input:focus { outline: none; box-shadow: 0 0 0 2px rgba(255,176,0,0.15); }
.param-select { background: rgba(0,0,0,0.35); color: #ffd597; border: 1px solid rgba(255,176,0,0.22); border-radius: 4px; padding: 6px 8px; font-size: 13px; }
.param-select:focus { outline: none; box-shadow: 0 0 0 2px rgba(255,176,0,0.15); }
.param-switch { color: #9fb0c4; font-size: 12px; display: inline-flex; gap: 6px; align-items: center; cursor: pointer; }
.param-hint { color: #7fb3d5; font-size: 11px; line-height: 1.4; }
</style>
