<template>
  <div class="battle-test-panel">
    <div class="btp-bar">
      <span class="btp-title">🎯 靶场测试</span>
      <span class="btp-skill">技能：{{ skillName || skillKey || '—' }}</span>
    </div>
    <div class="btp-target-config">
      <label class="btp-field">
        <span>靶子 HP</span>
        <input type="number" v-model.number="targetHp" min="1" max="9999" />
      </label>
      <label class="btp-field">
        <span>靶子护甲</span>
        <input type="number" v-model.number="targetArmor" min="0" max="999" />
      </label>
      <button class="btp-fire" :disabled="!skillKey || testing" @click="fire">🎯 触发测试（真实引擎）</button>
    </div>
    <div class="btp-body">
      <div v-if="summary" class="btp-summary">
        <span class="btp-engine">引擎：{{ summary.engine }}</span>
        <span class="btp-dmg">总伤害：<b>{{ summary.final_damage }}</b></span>
        <span class="btp-count">命中目标：{{ summary.targets.length }}</span>
      </div>
      <div v-for="(t, i) in perTargets" :key="i" class="btp-target">
        <div class="btp-t-coord">目标 ({{ t.target.q }}, {{ t.target.r }})</div>
        <div v-if="t.error" class="btp-t-err">⚠️ {{ t.error }}</div>
        <template v-else>
          <div class="btp-t-hp">
            剩余 HP：<b>{{ t.result?.survivor?.hp ?? '—' }}</b>
            <span class="btp-t-hp-base">/ {{ t.result?.survivor?.maxHp ?? targetHp }}</span>
            <span v-if="t.result?.survivor?.armor != null" class="btp-t-armor">护甲 {{ t.result.survivor.armor }}</span>
          </div>
          <div class="btp-t-dmg">finalDamage：<b>{{ t.result?.finalDamage ?? 0 }}</b></div>
          <div v-if="t.result?.survivor?.statusEffects?.length" class="btp-t-status">
            状态：{{ t.result.survivor.statusEffects.map(s => s.type || s.label || JSON.stringify(s)).join('、') }}
          </div>
          <div v-if="t.result?.survivor?.currentStats && Object.keys(t.result.survivor.currentStats).length" class="btp-t-stats">
            属性变更：{{ statSummary(t.result.survivor.currentStats) }}
          </div>
          <div v-if="t.result?.message" class="btp-t-msg">{{ t.result.message }}</div>
          <div v-if="t.result?.effect_routes" class="btp-t-routes">路由：{{ JSON.stringify(t.result.effect_routes) }}</div>
          <details v-if="t.result" class="btp-t-raw">
            <summary>原始结算对象</summary>
            <pre>{{ pretty(t.result) }}</pre>
          </details>
        </template>
      </div>
      <div v-if="logs.length" class="btp-log">
        <div v-for="(line, i) in logs" :key="'l'+i" class="btp-line">{{ line }}</div>
      </div>
      <div v-if="!summary && !testing && !logs.length" class="btp-hint">选择区域1中的词条后，点击「触发测试」运行真实战斗引擎单回合结算。</div>
      <div v-if="testing" class="btp-hint">结算中…</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import axios from 'axios'

const props = defineProps({
  skillKey: { type: String, default: '' },
  skillName: { type: String, default: '' }
})

const logs = ref([])
const testing = ref(false)
const summary = ref(null)
const perTargets = ref([])
// ★ 靶子可调参数（默认 HP100 / 护甲0，与后端桩位约定一致）
const targetHp = ref(100)
const targetArmor = ref(0)

async function fire() {
  if (!props.skillKey) return
  testing.value = true
  logs.value = []
  summary.value = null
  perTargets.value = []
  try {
    // ★ 分歧D：调用真实战斗引擎结算（/test-skill 不再返回伪代码日志）
    const { data } = await axios.post('/api/combat-glossary/test-skill', {
      key: props.skillKey,
      hp: Number(targetHp.value) || 100,
      armor: Number(targetArmor.value) || 0,
    })
    if (data.success) {
      summary.value = { engine: data.engine, final_damage: data.final_damage, targets: data.targets || [] }
      perTargets.value = data.targets || []
    } else {
      logs.value = ['> ❌ ' + (data.message || '测试失败')]
    }
  } catch (e) {
    logs.value = ['> ❌ 请求失败：' + (e?.response?.data?.message || e.message)]
  } finally {
    testing.value = false
  }
}

function statSummary(stats) {
  try {
    return Object.entries(stats)
      .map(([k, v]) => `${k}:${JSON.stringify(v)}`)
      .join('，')
  } catch {
    return String(stats)
  }
}

function pretty(obj) {
  try { return JSON.stringify(obj, null, 2) } catch { return String(obj) }
}
</script>

<style scoped>
.battle-test-panel { display: flex; flex-direction: column; gap: 8px; height: 100%; }
.btp-bar { display: flex; align-items: center; gap: 12px; }
.btp-title { font-weight: 600; color: #ffb000; }
.btp-skill { font-size: 13px; color: #9fb0c4; flex: 1; }
.btp-target-config { display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap; background: rgba(0,0,0,0.22); border: 1px solid rgba(159,142,120,0.18); border-radius: 6px; padding: 8px 10px; }
.btp-field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #9fb0c4; }
.btp-field input { width: 84px; background: #0f131c; border: 1px solid rgba(159,142,120,0.3); border-radius: 5px; color: #c1e8ff; padding: 5px 7px; font-size: 13px; }
.btp-fire { background: #ff3b30; color: #fff; border: none; border-radius: 6px; padding: 6px 14px; cursor: pointer; font-weight: 600; }
.btp-fire:disabled { opacity: 0.4; cursor: not-allowed; }
.btp-body { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
.btp-t-hp { font-size: 13px; color: #cfe8d6; }
.btp-t-hp b { color: #6bff9b; font-size: 15px; }
.btp-t-hp-base { color: #6b7a8f; }
.btp-t-armor { margin-left: 10px; color: #9fb0c4; }
.btp-t-status { color: #ffd597; font-size: 12px; margin-top: 2px; }
.btp-t-stats { color: #9fe8ff; font-size: 12px; margin-top: 2px; }
.btp-summary { display: flex; gap: 14px; flex-wrap: wrap; background: rgba(255,176,0,0.08); border: 1px solid rgba(255,176,0,0.25); border-radius: 6px; padding: 8px 10px; font-size: 13px; color: #ffd597; }
.btp-summary b { color: #ff6b6b; }
.btp-target { border: 1px solid rgba(159,142,120,0.18); border-radius: 6px; background: rgba(0,0,0,0.18); padding: 8px 10px; font-size: 12px; color: #c1e8ff; }
.btp-t-coord { font-weight: 600; color: #9fe8ff; margin-bottom: 4px; }
.btp-t-dmg b { color: #ff6b6b; }
.btp-t-msg { color: #cfe8d6; }
.btp-t-routes { color: #9fb0c4; font-family: ui-monospace, Menlo, monospace; }
.btp-t-err { color: #ff8b8b; }
.btp-t-raw { margin-top: 6px; }
.btp-t-raw pre { max-height: 240px; overflow: auto; background: #0f131c; border-radius: 5px; padding: 8px; font-size: 11px; color: #9fe8ff; white-space: pre-wrap; }
.btp-log { background: #0f131c; border: 1px solid rgba(159,142,120,0.2); border-radius: 6px; padding: 10px; font-family: ui-monospace, Menlo, monospace; font-size: 12px; line-height: 1.7; color: #c1e8ff; }
.btp-line { white-space: pre-wrap; }
.btp-hint { color: #6b7a8f; }
</style>
