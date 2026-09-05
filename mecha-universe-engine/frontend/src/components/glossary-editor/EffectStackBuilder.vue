<template>
  <div class="effect-stack-builder" :class="{ compact }">
    <div v-if="label" class="esb-header">
      <span class="esb-title">{{ label }}</span>
      <button class="esb-add" @click="addEffect">＋ 添加效果</button>
    </div>

    <div v-for="(effect, i) in effects" :key="i" class="effect-card">
      <div class="effect-card-head">
        <select v-model="effect.type" class="ef-type" @change="onTypeChange(effect)">
          <option v-for="k in EFFECT_TYPE_KEYS" :key="k" :value="k">{{ typeLabel(k) }}</option>
        </select>
        <button class="ef-del" @click="removeEffect(i)" title="删除效果">✕</button>
      </div>

      <!-- S3：按 effect.type 渲染对应子字段（数据驱动，来自 EFFECT_FIELD_SCHEMA） -->
      <div class="ef-fields">
        <div v-for="f in effectFields(effect)" :key="f.key" class="ef-field">
          <label :title="f.key">{{ f.label }}</label>
          <select v-if="f.kind === 'select'" v-model="effect[f.key]" class="ef-input">
            <option v-for="o in f.options" :key="o" :value="o">{{ optionLabel(o) }}</option>
          </select>
          <template v-else-if="f.kind === 'select-custom'">
            <select
              class="ef-input"
              :value="f.options.includes(effect[f.key]) ? effect[f.key] : '__custom__'"
              @change="onSelectCustom(effect, f, $event.target.value)"
            >
              <option v-for="o in f.options" :key="o" :value="o">{{ statusKeyLabel(o) }}</option>
              <option value="__custom__">{{ f.customLabel || '➕ 自定义状态键…' }}</option>
            </select>
            <input
              v-if="!f.options.includes(effect[f.key])"
              v-model="effect[f.key]"
              class="ef-input"
              placeholder="输入自定义状态键"
            />
          </template>
          <input v-else-if="f.kind === 'number'" type="number" v-model.number="effect[f.key]" class="ef-input" />
          <input v-else type="text" v-model="effect[f.key]" class="ef-input" :placeholder="f.key" />
        </div>
        <!-- ★ 阶段一 D/E/F：DAMAGE 类型额外暴露 Segment 重定向字段（target_scope / split_mode / damage_mode） -->
        <template v-if="effect.type === 'DAMAGE'">
          <div class="ef-field">
            <label title="target_scope">作用范围(状语重定向)</label>
            <select v-model="effect.target_scope" class="ef-input">
              <option value="SINGLE_ENEMY">单体敌方 / Single</option>
              <option value="AREA_ENEMY">区域敌方全体 / Area Enemy</option>
              <option value="ALL_UNITS">全场单位 / All Units</option>
            </select>
          </div>
          <div class="ef-field ef-check">
            <label><input type="checkbox" :checked="effect.split_mode === 'equal'" @change="effect.split_mode = $event.target.checked ? 'equal' : 'none'" /> 伤害均摊 (split_mode: equal)</label>
          </div>
          <div class="ef-field">
            <label title="damage_mode">伤害模式</label>
            <select v-model="effect.damage_mode" class="ef-input">
              <option value="bonus">追加 / Bonus</option>
              <option value="override">覆盖 / Override</option>
            </select>
          </div>
        </template>
        <div v-if="!effectFields(effect).length && effect.type !== 'DAMAGE'" class="ef-field ef-empty">
          该效果类型暂无结构化子字段（自由配置）。
        </div>
      </div>
    </div>

    <div v-if="!effects.length" class="esb-empty">暂无效果，点击「添加效果」开始堆叠。</div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { EFFECT_TYPE, EFFECT_TYPE_KEYS } from '../../contracts/enums.mirror.js'

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  label: { type: String, default: '' },
  compact: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])

// 直接使用 props.modelValue（数组，父组件持有引用）
const effects = computed(() => props.modelValue)

// ★ 状态键候选（常用约定状态键，来自引擎标签/状态系统；datalist 同时允许自由输入自定义新状态键）
//   必须定义在 EFFECT_FIELD_SCHEMA 之前，否则 STATUS.status_key 引用会触发 const TDZ 导致整组件崩溃。
const STATUS_KEY_OPTIONS = [
  'stun', 'burn', 'freeze', 'poison', 'slow', 'root', 'blind', 'mark', 'expose',
  'shield', 'guard', 'blockade', 'assist', 'sniper', 'stable', 'regen', 'taunt',
  'disarm', 'silence', 'smoke', 'stealth_initiate', 'stealth_ambush', 'stealth_camouflage', 'stealth_break',
]

// ★ S3：全量 26 种 EFFECT_TYPE 的子字段 schema（数据驱动渲染，消除「4 种局限类型」硬编码）
// 与原 4 种（damage/recovery/status/displacement）字段保持完全一致，确保旧数据向后兼容。
const EFFECT_FIELD_SCHEMA = {
  DAMAGE: [
    { key: 'method', label: '数值方式', kind: 'select', options: ['flat', 'percent', 'true', 'armor_pen'], default: 'flat' },
    { key: 'value', label: '数值', kind: 'number', default: 0 },
    { key: 'target', label: '目标', kind: 'select', options: ['enemy', 'self', 'ally', 'all'], default: 'enemy' },
  ],
  RECOVERY: [
    { key: 'target', label: '目标', kind: 'select', options: ['self', 'ally', 'all'], default: 'self' },
    { key: 'value', label: '数值', kind: 'number', default: 0 },
    { key: 'recovery_type', label: '恢复类型', kind: 'select', options: ['hp', 'ammo', 'charge'], default: 'hp' },
  ],
  STATUS: [
    { key: 'status_key', label: '状态键', kind: 'select-custom', customLabel: '➕ 自定义状态键…', options: STATUS_KEY_OPTIONS, default: '' },
    { key: 'duration', label: '持续(回合)', kind: 'number', default: 3 },
    { key: 'stacks', label: '层数', kind: 'number', default: 1 },
    { key: 'target', label: '目标', kind: 'select', options: ['enemy', 'self', 'ally'], default: 'enemy' },
  ],
  DISPLACEMENT: [
    { key: 'mode', label: '模式', kind: 'select', options: ['push', 'pull', 'teleport'], default: 'push' },
    { key: 'direction', label: '方向', kind: 'number', default: 0 },
    { key: 'distance', label: '距离', kind: 'number', default: 1 },
    { key: 'target', label: '目标', kind: 'select', options: ['self', 'enemy', 'ally'], default: 'self' },
  ],
  INSTANT_KILL: [
    { key: 'chance', label: '概率(0-1)', kind: 'number', default: 1 },
    { key: 'target', label: '目标', kind: 'select', options: ['enemy'], default: 'enemy' },
  ],
  MUTUAL_DESTRUCTION: [
    { key: 'target', label: '目标', kind: 'select', options: ['enemy'], default: 'enemy' },
  ],
  DUEL_RESOLUTION: [
    { key: 'target', label: '目标', kind: 'select', options: ['enemy'], default: 'enemy' },
  ],
  PLUNDER: [
    { key: 'target', label: '目标', kind: 'select', options: ['enemy'], default: 'enemy' },
    { key: 'item_type', label: '掠夺物类型', kind: 'text', default: '' },
  ],
  GRANT_TURN: [
    { key: 'target', label: '目标', kind: 'select', options: ['self', 'ally'], default: 'self' },
    { key: 'count', label: '回合数', kind: 'number', default: 1 },
  ],
  ASSIST_CHOICE: [
    { key: 'options', label: '选项(逗号分隔)', kind: 'text', default: '' },
  ],
  SPAWN_ITEMS: [
    { key: 'item', label: '物品键', kind: 'text', default: '' },
    { key: 'count', label: '数量', kind: 'number', default: 1 },
  ],
  ENTER_STEALTH: [
    { key: 'duration', label: '持续(回合)', kind: 'number', default: 3 },
  ],
  REVEAL: [
    { key: 'target', label: '目标', kind: 'select', options: ['enemy', 'all'], default: 'enemy' },
  ],
  SCAN: [
    { key: 'radius', label: '半径', kind: 'number', default: 3 },
  ],
  VISIBILITY: [
    { key: 'mode', label: '模式', kind: 'select', options: ['show', 'hide'], default: 'show' },
  ],
  NEUTRAL_OPTION: [
    { key: 'note', label: '说明', kind: 'text', default: '' },
  ],
  BLOCKADE: [
    { key: 'duration', label: '持续(回合)', kind: 'number', default: 3 },
    { key: 'target', label: '目标', kind: 'select', options: ['enemy', 'tile'], default: 'enemy' },
  ],
  REWRITE_ORDER: [
    { key: 'order', label: '新顺序', kind: 'text', default: '' },
  ],
  TAKEOVER_TURN: [
    { key: 'target', label: '目标', kind: 'select', options: ['enemy'], default: 'enemy' },
  ],
  PREPAY: [
    { key: 'cost', label: '预支(AP)', kind: 'number', default: 1 },
  ],
  PREPAY_TURN: [
    { key: 'turns', label: '预支回合', kind: 'number', default: 1 },
  ],
  GRANT_ACTION: [
    { key: 'action', label: '行动类型', kind: 'text', default: '' },
    { key: 'count', label: '次数', kind: 'number', default: 1 },
  ],
  REVOKE_ACTION: [
    { key: 'action', label: '行动类型', kind: 'text', default: '' },
  ],
  CHARGE: [
    { key: 'layer', label: '充能层', kind: 'number', default: 1 },
    { key: 'amount', label: '增量', kind: 'number', default: 1 },
  ],
  MUTEX_STATUS: [
    { key: 'mutex_group', label: '互斥组', kind: 'text', default: '' },
  ],
  PERMANENT_DISABLE: [
    { key: 'target', label: '目标', kind: 'select', options: ['enemy', 'self'], default: 'enemy' },
  ],
  MODIFY_STAT: [
    { key: 'stat_type', label: '属性', kind: 'select', options: ['MELEE', 'SHOOTING', 'MOBILITY', 'RANGE', 'HP', 'DEFENSE'], default: 'MELEE' },
    { key: 'value', label: '数值(正负)', kind: 'number', default: 0 },
    { key: 'duration', label: '持续(0=瞬时/永久)', kind: 'number', default: 0 },
    { key: 'target', label: '作用对象', kind: 'select', options: ['self', 'target'], default: 'self' },
  ],
}

// 中英文对照：效果类型（key 与 EFFECT_TYPE_KEYS 的大写常量名对齐）
const EFFECT_TYPE_LABELS = {
  DAMAGE: '伤害 / Damage',
  RECOVERY: '恢复 / Recovery',
  STATUS: '状态 / Status',
  DISPLACEMENT: '位移 / Displacement',
  INSTANT_KILL: '即死 / Instant Kill',
  MUTUAL_DESTRUCTION: '同归于尽 / Mutual Destruction',
  DUEL_RESOLUTION: '决斗裁决 / Duel Resolution',
  PLUNDER: '掠夺 / Plunder',
  GRANT_TURN: '赋予回合 / Grant Turn',
  ASSIST_CHOICE: '援助抉择 / Assist Choice',
  SPAWN_ITEMS: '生成物品 / Spawn Items',
  ENTER_STEALTH: '进入隐身 / Enter Stealth',
  REVEAL: '揭示 / Reveal',
  SCAN: '扫描 / Scan',
  VISIBILITY: '可见性 / Visibility',
  NEUTRAL_OPTION: '中立选项 / Neutral Option',
  BLOCKADE: '封锁 / Blockade',
  REWRITE_ORDER: '改写顺序 / Rewrite Order',
  TAKEOVER_TURN: '接管回合 / Takeover Turn',
  PREPAY: '预支 / Prepay',
  PREPAY_TURN: '预支回合 / Prepay Turn',
  GRANT_ACTION: '赋予行动 / Grant Action',
  REVOKE_ACTION: '撤销行动 / Revoke Action',
  CHARGE: '充能 / Charge',
  MUTEX_STATUS: '互斥状态 / Mutex Status',
  PERMANENT_DISABLE: '永久禁用 / Permanent Disable',
  MODIFY_STAT: '属性修正 / Modify Stat',
}
function typeLabel(k) { return EFFECT_TYPE_LABELS[k] || k }

// 中英文对照：子字段可选项（引擎枚举值 → 显示标签）
const OPTION_LABELS = {
  flat: '固定值 / Flat', percent: '百分比 / Percent', true: '真实伤害 / True', armor_pen: '破甲 / Armor Pen',
  enemy: '敌方 / Enemy', self: '自身 / Self', ally: '友方 / Ally', all: '全体 / All', tile: '地块 / Tile', target: '目标 / Target',
  hp: '生命 / HP', ammo: '弹药 / Ammo', charge: '充能 / Charge',
  push: '推开 / Push', pull: '拉回 / Pull', teleport: '传送 / Teleport',
  show: '显示 / Show', hide: '隐藏 / Hide',
  MELEE: '近战 / Melee', SHOOTING: '射击 / Shooting', MOBILITY: '机动 / Mobility',
  RANGE: '射程 / Range', HP: '生命 / HP', DEFENSE: '防御 / Defense',
}
function optionLabel(o) { return OPTION_LABELS[o] || o }

// ★ 状态键候选（常用约定状态键，来自引擎标签/状态系统；datalist 同时允许自由输入自定义新状态键）
//   定义已前移至 EFFECT_FIELD_SCHEMA 之前，避免 STATUS.status_key 引用触发 const TDZ 导致整组件崩溃。
const STATUS_KEY_LABELS = {
  stun: '眩晕', burn: '灼烧', freeze: '冰冻', poison: '中毒', slow: '减速', root: '定身',
  blind: '致盲', mark: '标记', expose: '暴露', shield: '护盾', guard: '守护', blockade: '封锁',
  assist: '援助', sniper: '狙击', stable: '稳定', regen: '再生', taunt: '嘲讽',
  disarm: '缴械', silence: '沉默', smoke: '烟幕',
  stealth_initiate: '隐身·起始', stealth_ambush: '隐身·伏击', stealth_camouflage: '隐身·伪装', stealth_break: '隐身·破隐',
}
function statusKeyLabel(k) { return STATUS_KEY_LABELS[k] ? `${STATUS_KEY_LABELS[k]} (${k})` : k }

function defaultFor(type) {
  const schema = EFFECT_FIELD_SCHEMA[type] || []
  const o = {}
  for (const f of schema) o[f.key] = f.default
  return o
}

function effectFields(effect) {
  return EFFECT_FIELD_SCHEMA[effect.type] || []
}

function addEffect() {
  effects.value.push({ type: 'damage', ...defaultFor('damage') })
  emit('update:modelValue', effects.value)
}

// ★ 状态键下拉「自定义」联动：选中已有键则取值；选「自定义」则清空让 text input 出现
function onSelectCustom(effect, f, val) {
  effect[f.key] = val === '__custom__' ? '' : val
  emit('update:modelValue', effects.value)
}

function onTypeChange(effect) {
  // 切换类型时按新 schema 重置子字段，避免残留旧类型的脏字段
  const fresh = { type: effect.type, ...defaultFor(effect.type) }
  // ★ 阶段一 D/E/F：DAMAGE 切换时补 Segment 重定向字段默认值（不影响其它类型）
  if (effect.type === 'DAMAGE') {
    fresh.target_scope = effect.target_scope || 'SINGLE_ENEMY'
    fresh.split_mode = effect.split_mode || 'none'
    fresh.damage_mode = effect.damage_mode || 'bonus'
  }
  // 清掉不属于当前类型的 Segment 字段，避免脏数据
  if (effect.type !== 'DAMAGE') {
    delete effect.target_scope; delete effect.split_mode; delete effect.damage_mode
  }
  Object.assign(effect, fresh)
  emit('update:modelValue', effects.value)
}

function removeEffect(i) {
  effects.value.splice(i, 1)
  emit('update:modelValue', effects.value)
}
</script>

<style scoped>
.effect-stack-builder { border: 1px solid rgba(0, 206, 209, 0.25); border-radius: 8px; padding: 10px; background: rgba(0, 206, 209, 0.04); }
.esb-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.esb-title { font-size: 13px; font-weight: 600; color: #7fe7ff; }
.esb-add { background: rgba(255, 176, 0, 0.16); border: 1px solid rgba(255, 176, 0, 0.55); color: #ffb000; border-radius: 6px; padding: 4px 10px; font-size: 12px; cursor: pointer; }
.esb-add:hover { background: rgba(255, 176, 0, 0.28); }
.effect-card { border: 1px solid rgba(0, 206, 209, 0.18); border-radius: 6px; padding: 8px; margin-bottom: 8px; background: rgba(10, 18, 28, 0.6); }
.effect-card-head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.ef-type { flex: 1; background: #0e1824; border: 1px solid #2b3a4a; color: #cfe9ff; border-radius: 4px; padding: 4px 6px; font-size: 12px; font-family: monospace; }
.ef-del { background: transparent; border: 1px solid #5a2b2b; color: #ff8a8a; border-radius: 4px; padding: 2px 7px; cursor: pointer; font-size: 12px; }
.ef-fields { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 6px; }
.ef-field { display: flex; flex-direction: column; gap: 2px; }
.ef-field label { font-size: 11px; color: #8fb4cc; }
.ef-input { background: #0e1824; border: 1px solid #2b3a4a; color: #cfe9ff; border-radius: 4px; padding: 3px 6px; font-size: 12px; }
.ef-empty { color: #6b8299; font-size: 11px; grid-column: 1 / -1; }
.esb-empty { color: #6b8299; font-size: 12px; padding: 6px 0; }
.compact .ef-fields { grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); }
</style>
