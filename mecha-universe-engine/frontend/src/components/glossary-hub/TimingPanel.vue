<template>
  <div class="edit-block">
    <div class="eb-title">① 时机 Timing</div>
    <div class="block-body">
      <div class="param-row">
        <span class="param-key">触发时机 (timing.trigger)</span>
        <select class="param-select" v-model="timingTrigger">
          <option v-for="[val, label] in timingOptions" :key="val" :value="val">{{ label }}</option>
        </select>
      </div>
      <div class="param-hint">
        统一对齐 shared-kernel · TIMING 枚举（前端镜像 enums.mirror.js），
        使 UI 配置的触发键可被反应总线 <code>fire</code> 捕获（修复旧 trigger 键错位）。
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { TIMING } from '../../contracts/enums.mirror.js'

const props = defineProps({ draft: { type: Object, required: true } })

const TIMING_LABELS = {
  on_attacked: '受击时',
  on_damage_dealt: '造成伤害时',
  post_melee_damage: '近战伤害后',
  on_kill: '击杀时',
  on_attack_start: '攻击开始时',
  on_target_selected: '选定目标时',
  on_turn_start: '回合开始',
  on_round_start: '整局回合开始',
  on_ally_attacked: '友方受击时',
  on_move_path: '移动路径',
  on_step_point: '移动落点',
  on_airdrop_received: '收到空投',
  none: '无（常驻/主动）'
}
const timingOptions = computed(() =>
  Object.values(TIMING).map(v => [v, TIMING_LABELS[v] || v])
)

// 六段式 timing.trigger 为真相；同时回写顶层 trigger.type（旧字段读兼容）
const timingTrigger = computed({
  get () {
    return (props.draft.timing && props.draft.timing.trigger) ||
           (props.draft.trigger && props.draft.trigger.type) || 'none'
  },
  set (v) {
    if (!props.draft.timing) props.draft.timing = {}
    props.draft.timing.trigger = v
    if (!props.draft.trigger) props.draft.trigger = {}
    props.draft.trigger.type = v
  }
})
</script>

<style scoped>
.edit-block { background: rgba(0,0,0,0.12); border: 1px solid rgba(159,142,120,0.12); border-radius: 8px; padding: 8px; margin-top: 8px; }
.eb-title { color: #ffb000; font-size: 12px; font-weight: 600; margin-bottom: 6px; padding: 4px 0 4px 8px; border-left: 3px solid #ffb000; background: rgba(255,176,0,0.06); border-radius: 4px; }
.block-body { background: rgba(0,0,0,0.28); border-radius: 6px; padding: 8px; display: flex; flex-direction: column; gap: 6px; }
.param-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.param-key { color: #9fb0c4; font-size: 12px; min-width: 120px; }
.param-select { background: rgba(0,0,0,0.35); color: #ffd597; border: 1px solid rgba(255,176,0,0.22); border-radius: 4px; padding: 6px 8px; font-size: 13px; min-width: 180px; }
.param-select:focus { outline: none; box-shadow: 0 0 0 2px rgba(255,176,0,0.15); }
.param-hint { color: #7fb3d5; font-size: 11px; line-height: 1.4; }
.param-hint code { color: #ffd597; background: rgba(0,0,0,0.3); padding: 0 4px; border-radius: 3px; }
</style>
