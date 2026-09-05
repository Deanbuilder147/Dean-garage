<template>
  <div class="edit-block">
    <div class="eb-title">② 条件 Conditions</div>
    <div class="block-body">
      <div v-if="!conditions.length" class="param-hint">暂无条件。添加后将在「条件图层」中可视化空间约束。</div>
      <div v-for="(cond, i) in conditions" :key="i" class="branch-card">
        <div class="branch-head">
          <span class="branch-idx">#{{ i + 1 }}</span>
          <select class="param-select" v-model="cond.type">
            <option v-for="[val, label] in condOptions" :key="val" :value="val">{{ label }}</option>
          </select>
          <button class="btn-delete" @click="conditions.splice(i, 1)">✕</button>
        </div>
        <div class="param-row" v-if="hasParams(cond.type)">
          <span class="param-key">参数</span>
          <div class="kv-list cond-fields">
            <!-- hp_compare：target / op / value / unit -->
            <template v-if="cond.type === 'hp_compare'">
              <span class="kv-k">对象</span>
              <select class="param-select" v-model="cond.params.target">
                <option value="enemy">敌方 / Enemy</option><option value="self">自身 / Self</option>
              </select>
              <span class="kv-k">比较</span>
              <select class="param-select" v-model="cond.params.op">
                <option v-for="o in OPS" :key="o" :value="o">{{ o }}</option>
              </select>
              <span class="kv-k">数值</span>
              <input class="param-input" type="number" v-model.number="cond.params.value" />
              <span class="kv-k">单位</span>
              <select class="param-select" v-model="cond.params.unit">
                <option value="absolute">绝对值 / Absolute</option><option value="percent">百分比 / Percent</option>
              </select>
            </template>
            <!-- stat_compare：stat / op / compare_to -->
            <template v-else-if="cond.type === 'stat_compare'">
              <span class="kv-k">属性</span>
              <select class="param-select" v-model="cond.params.stat">
                <option v-for="s in STAT_TYPES" :key="s" :value="s">{{ s }}</option>
              </select>
              <span class="kv-k">比较</span>
              <select class="param-select" v-model="cond.params.op">
                <option v-for="o in OPS" :key="o" :value="o">{{ o }}</option>
              </select>
              <span class="kv-k">比较对象</span>
              <select class="param-select" v-model="cond.params.compare_to">
                <option value="self">自身 / Self</option><option value="enemy">敌方 / Enemy</option>
              </select>
            </template>
            <!-- terrain_match：terrain_type -->
            <template v-else-if="cond.type === 'terrain_match'">
              <span class="kv-k">地形</span>
              <select class="param-select" v-model="cond.params.terrain_type">
                <option v-for="t in TERRAIN_TYPES" :key="t" :value="t">{{ t }}</option>
              </select>
            </template>
            <!-- 其他带参条件：保留结构化最小字段（in_range / mutual_in_range 等仅类型选择即可，但提供数值输入） -->
            <template v-else>
              <span class="kv-k">数值</span>
              <input class="param-input" type="number" v-model.number="cond.params.value" />
            </template>
          </div>
        </div>
      </div>
      <button class="btn-add" @click="addCondition">+ 添加条件</button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { CONDITION_TYPE } from '../../contracts/enums.mirror.js'

const props = defineProps({ draft: { type: Object, required: true } })

const COND_LABELS = {
  in_range: '在射程内 / In Range',
  mutual_in_range: '互在射程内 / Mutual In Range',
  hp_compare: '血量比较 / HP Compare',
  stat_compare: '属性比较 / Stat Compare',
  collinear_adjacent: '共线相邻 / Collinear Adjacent',
  terrain_match: '地形匹配 / Terrain Match',
  damage_kind_match: '伤害类型匹配 / Damage Kind Match',
  has_not_acted: '未行动 / Has Not Acted',
  not_in_scan: '未被扫描 / Not In Scan'
}
const condOptions = computed(() => Object.values(CONDITION_TYPE).map(v => [v, COND_LABELS[v] || v]))

// 带参数编辑的条件（其余仅类型选择）
const PARAMED = new Set([
  'in_range', 'mutual_in_range', 'hp_compare', 'stat_compare',
  'collinear_adjacent', 'terrain_match', 'damage_kind_match'
])
function hasParams (t) { return PARAMED.has(t) }

// 结构化下拉选项（与引擎 condition 字段对齐，供后续 checkConditions 收口直读）
const OPS = ['<', '<=', '>', '>=']
const STAT_TYPES = ['MELEE', 'SHOOTING', 'MOBILITY', 'RANGE', 'HP', 'DEFENSE']
const TERRAIN_TYPES = ['plain', 'forest', 'hill', 'water', 'urban', 'mountain', 'ruins']

const conditions = computed({
  get: () => {
    if (!Array.isArray(props.draft.conditions)) props.draft.conditions = []
    return props.draft.conditions
  },
  set: v => { props.draft.conditions = v }
})

function defaultParams (type) {
  switch (type) {
    case 'hp_compare': return { target: 'enemy', op: '<=', value: 30, unit: 'percent' }
    case 'stat_compare': return { stat: 'MOBILITY', op: '>=', compare_to: 'self' }
    case 'terrain_match': return { terrain_type: 'forest' }
    default: return { value: 1 }
  }
}
function addCondition () { conditions.value.push({ type: 'in_range', params: defaultParams('in_range') }) }
</script>

<style scoped>
.edit-block { background: rgba(0,0,0,0.12); border: 1px solid rgba(159,142,120,0.12); border-radius: 8px; padding: 8px; margin-top: 8px; }
.eb-title { color: #ffb000; font-size: 12px; font-weight: 600; margin-bottom: 6px; padding: 4px 0 4px 8px; border-left: 3px solid #ffb000; background: rgba(255,176,0,0.06); border-radius: 4px; }
.block-body { background: rgba(0,0,0,0.28); border-radius: 6px; padding: 8px; display: flex; flex-direction: column; gap: 6px; }
.param-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.param-key { color: #9fb0c4; font-size: 12px; min-width: 48px; }
.param-input { width: 64px; background: rgba(0,0,0,0.35); color: #ffd597; border: 1px solid rgba(255,176,0,0.22); border-radius: 4px; padding: 4px 6px; font-family: inherit; }
.param-input:focus { outline: none; box-shadow: 0 0 0 2px rgba(255,176,0,0.15); }
.param-select { background: rgba(0,0,0,0.35); color: #ffd597; border: 1px solid rgba(255,176,0,0.22); border-radius: 4px; padding: 6px 8px; font-size: 13px; }
.param-select:focus { outline: none; box-shadow: 0 0 0 2px rgba(255,176,0,0.15); }
.param-hint { color: #7fb3d5; font-size: 11px; line-height: 1.4; }
.branch-card { background: rgba(255,176,0,0.04); border: 1px dashed rgba(255,176,0,0.35); border-radius: 6px; padding: 8px; display: flex; flex-direction: column; gap: 6px; }
.branch-head { display: flex; align-items: center; gap: 8px; }
.branch-idx { color: #ffb000; font-size: 12px; font-weight: 600; }
.kv-list { display: flex; flex-direction: column; gap: 4px; flex: 1; }
.kv-row { display: flex; align-items: center; gap: 6px; }
.kv-k { color: #9fb0c4; font-size: 12px; min-width: 70px; }
.kv-v { flex: 1; min-width: 60px; }
.kv-add { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.btn-add { align-self: flex-start; background: rgba(0,180,220,0.12); color: #38bdf8; border: 1px solid rgba(0,180,220,0.4); border-radius: 6px; padding: 4px 10px; cursor: pointer; font-size: 12px; }
.btn-add:hover { background: rgba(0,180,220,0.22); }
.btn-delete { background: rgba(214,69,60,0.12); color: #ff8a80; border: 1px solid rgba(214,69,60,0.4); border-radius: 4px; padding: 2px 8px; cursor: pointer; font-size: 12px; }
.btn-delete.sm { padding: 1px 6px; }
.btn-delete:hover { background: rgba(214,69,60,0.25); }
</style>
