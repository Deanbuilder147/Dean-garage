<template>
  <div class="detail-panel">
    <div class="dp-head">
      <h3>{{ draft.name || draft.skill_key || '-' }}</h3>
      <span class="vg-badge" :class="'entry-' + (draft.entryType || 'skill')">{{ entryLabel }}</span>
      <button class="dp-edit-btn" @click="$emit('toggle-edit')">{{ editing ? '✓ 完成' : '✎ 编辑' }}</button>
    </div>

    <!-- 只读模式：参数摘要 -->
    <div v-if="!editing" class="dp-readonly">
      <div class="dp-row"><span class="dp-k">key (skill_key)</span><span class="dp-v">{{ draft.skill_key || '-' }}</span></div>
      <div class="dp-row"><span class="dp-k">分类</span><span class="dp-v">{{ draft.category || '-' }}</span></div>
      <div class="dp-row"><span class="dp-k">行动点</span><span class="dp-v">{{ draft.ap_cost ?? '-' }}</span></div>
      <div class="dp-row"><span class="dp-k">射程加成</span><span class="dp-v">{{ draft.bonus_range ?? 0 }}（最小 {{ draft.min_range ?? 1 }}）</span></div>
      <div class="dp-row"><span class="dp-k">目标</span><span class="dp-v">{{ targetLabel }}</span></div>
      <div class="dp-row" v-if="draft.timing && draft.timing.trigger && draft.timing.trigger !== 'none'">
        <span class="dp-k">触发时机</span><span class="dp-v">{{ draft.timing.trigger }}</span></div>
      <div class="dp-row" v-if="draft.roll && draft.roll.mode && draft.roll.mode !== 'none'">
        <span class="dp-k">掷骰</span><span class="dp-v">{{ draft.roll.mode }} / {{ (draft.roll.generator && draft.roll.generator.method) || '-' }}</span></div>
      <div class="dp-row" v-if="draft.cost">
        <span class="dp-k">寿命管制</span><span class="dp-v">{{ draft.cost.enforce ? '启用' : '关闭' }}<template v-if="draft.cost.enforce === true"> · charges {{ draft.cost.charges || 0 }} · durability {{ draft.cost.durability || 0 }} · {{ draft.cost.limit_scope || 'match' }}</template></span></div>
      <div class="dp-row" v-if="draft.conditions && draft.conditions.length">
        <span class="dp-k">条件</span><span class="dp-v">{{ draft.conditions.length }} 项（详见条件图层）</span></div>
      <div class="dp-row" v-if="draft.aoe && draft.aoe.spread">
        <span class="dp-k">AOE</span><span class="dp-v">扩散 {{ draft.aoe.spread }}</span></div>
      <div class="dp-row" v-if="draft.map_cannon && draft.map_cannon.directions && draft.map_cannon.directions.length">
        <span class="dp-k">地图炮</span><span class="dp-v">{{ draft.map_cannon.directions.length }} 向</span></div>
      <div class="dp-desc">{{ draft.description || '（无描述）' }}</div>
      <div class="dp-effects">
        <div class="dp-sub">效果堆栈（{{ (draft.effects || []).length }}）</div>
        <div v-for="(ef, i) in (draft.effects || [])" :key="i" class="dp-eff">
          #{{ i + 1 }} · {{ ef.type || '?' }}
          <span v-if="ef.type === 'damage'">伤害 {{ ef.flat_value ?? 0 }}</span>
          <span v-else-if="ef.type === 'status'">{{ ef.polarity === 'debuff' ? '减益' : '增益' }} {{ ef.target_stat }} {{ ef.value }}</span>
          <span v-else-if="ef.type === 'recovery'">恢复</span>
          <span v-else-if="ef.type === 'displacement'">位移</span>
        </div>
      </div>
    </div>

    <!-- 编辑模式：沿用现有编辑器组件 -->
    <div v-else class="dp-edit">
      <div class="dp-field">
        <label>词条类型</label>
        <div class="dp-type-row">
          <label class="dp-radio"><input type="radio" value="skill" v-model="draft.entryType" /> 技能词条</label>
          <label class="dp-radio"><input type="radio" value="special" v-model="draft.entryType" /> 特殊词条</label>
          <label class="dp-radio"><input type="radio" value="faction" v-model="draft.entryType" /> 阵营词条</label>
          <label class="dp-radio"><input type="radio" value="other" v-model="draft.entryType" /> 其它词条</label>
        </div>
      </div>
      <div class="dp-field">
        <label>动作类型 (action_type)</label>
        <select v-model="draft.action_type">
          <option value="attack">attack（攻击）</option>
          <option value="heal">heal（治疗）</option>
          <option value="buff">buff（增益）</option>
          <option value="debuff">debuff（减益）</option>
          <option value="passive">passive（被动·行动时自动发动）</option>
        </select>
      </div>
      <div class="dp-field">
        <label>主目标范围 (target_scope · L3 意图)</label>
        <select v-model="draft.target_scope">
          <option value="SINGLE_ENEMY">单体敌方（SINGLE_ENEMY）</option>
          <option value="AREA_ENEMY">区域敌方（AREA_ENEMY）</option>
          <option value="SINGLE_ALLY">单体友方（SINGLE_ALLY）</option>
          <option value="ALL_UNITS">全体单位（ALL_UNITS）</option>
          <option value="SELF">自身（SELF）</option>
          <option value="both">both（兼容·双阵营，效果按 target_type 分头命中）</option>
          <option value="all">all（兼容·全体，按 target_type 命中）</option>
        </select>
        <small class="dp-note">L3 主目标意图；子效果实际命中由 effects[].target_type（L6）二次路由，二者独立（§8.9①）。</small>
      </div>
      <div class="dp-field">
        <label>名称</label>
        <input v-model="draft.name" />
      </div>
      <div class="dp-field">
        <label>描述</label>
        <textarea v-model="draft.description" rows="2"></textarea>
      </div>
      <div class="dp-field">
        <label>分类 (category)</label>
        <select v-model="draft.category">
          <option value="melee">melee（近战）</option>
          <option value="ranged">ranged（远程）</option>
          <option value="auto">auto（自动）</option>
        </select>
      </div>
      <div class="dp-field dp-inline">
        <label>射程加成</label>
        <input type="number" v-model.number="draft.bonus_range" @input="onRangeChange" />
        <label>最小射程</label>
        <input type="number" v-model.number="draft.min_range" @input="onRangeChange" />
        <label>行动点</label>
        <input type="number" v-model.number="draft.ap_cost" />
      </div>


      <!-- 阵营维度：限定与立场（faction/other 类型显示） -->
      <template v-if="draft.entryType === 'faction' || draft.entryType === 'other'">
        <div class="dp-sub">③ 阵营维度（限定与立场）</div>
        <div class="dp-field">
          <label>限定人员</label>
          <select v-model="draft.faction.limited_to">
            <option value="all">全员 / All</option>
            <option value="ace">仅 ACE / ACE Only</option>
          </select>
        </div>
        <div class="dp-field">
          <label>使用次数</label>
          <select v-model="draft.faction.limit_count">
            <option value="faction_once">阵营一次 / Faction Once</option>
            <option value="personal_once">个人一次 / Personal Once</option>
          </select>
        </div>
        <div class="dp-field">
          <label>立场</label>
          <select v-model="draft.faction.stance">
            <option value="attack">攻 / Attack</option>
            <option value="defense">防 / Defense</option>
            <option value="ambush">偷袭 / Ambush</option>
          </select>
        </div>
      </template>

      <TimingPanel :draft="draft" />
      <ConditionsEditor :draft="draft" />
      <RollPanel :draft="draft" />
      <CostPanel :draft="draft" />

      <div class="dp-sub">效果堆栈</div>
      <EffectStackBuilder v-model="draft.effects" />
    </div>
  </div>
</template>

<script setup>
import { computed, provide } from 'vue'
import EffectStackBuilder from '../glossary-editor/EffectStackBuilder.vue'
import TimingPanel from './TimingPanel.vue'
import ConditionsEditor from './ConditionsEditor.vue'
import RollPanel from './RollPanel.vue'
import CostPanel from './CostPanel.vue'

const props = defineProps({
  draft: { type: Object, required: true },   // 共享 reactive(draftSkill)
  editing: { type: Boolean, default: false }
})
defineEmits(['toggle-edit'])

// 向 EffectStackBuilder 注入词条级 meta（draft 本身即含 target.type 默认值）
provide('glossaryMeta', computed(() => props.draft))

const entryLabel = computed(() => {
  const m = { skill: '技能', special: '特殊', faction: '阵营' }
  return m[props.draft.entryType] || '技能'
})
const targetLabel = computed(() => {
  const t = props.draft.target && props.draft.target.type
  const m = { SELF: '自身', SINGLE_ENEMY: '单体敌方', AREA_ENEMY: '范围敌方', SINGLE_ALLY: '单体友方', ALL_UNITS: '全体' }
  return m[t] || t || '-'
})
// 双向响应式：表单改 bonus_range → 通知父级（区域2 画布重绘）
function onRangeChange() {
  // draft 是响应式对象，父级 watch 会驱动区域2 重绘，无需额外 emit
}
</script>

<style scoped>
.detail-panel { display: flex; flex-direction: column; height: 100%; gap: 10px; overflow-y: auto; padding-right: 4px; }
.dp-head { display: flex; align-items: center; gap: 8px; }
.dp-head h3 { margin: 0; font-size: 16px; color: #c1e8ff; flex: 1; }
.dp-edit-btn { background: #ffb000; color: #1a1300; border: none; border-radius: 6px; padding: 5px 12px; cursor: pointer; font-weight: 600; }
.dp-readonly { display: flex; flex-direction: column; gap: 6px; }
.dp-row { display: flex; gap: 10px; font-size: 13px; }
.dp-k { color: #6b7a8f; min-width: 64px; }
.dp-v { color: #c1e8ff; }
.dp-desc { font-size: 12px; color: #9fb0c4; background: rgba(255,255,255,0.03); border-radius: 6px; padding: 8px; margin-top: 4px; }
.dp-sub { color: #ffb000; font-size: 12px; font-weight: 600; margin: 8px 0 4px; }
.dp-eff { font-size: 12px; color: #c1e8ff; padding: 4px 8px; background: rgba(0,180,220,0.06); border-radius: 4px; margin-bottom: 4px; }
.dp-edit { display: flex; flex-direction: column; gap: 8px; }
.dp-field { display: flex; flex-direction: column; gap: 4px; }
.dp-field.dp-inline { flex-direction: row; flex-wrap: wrap; align-items: center; gap: 8px; }
.dp-field label { font-size: 12px; color: #9fb0c4; }
.dp-field input, .dp-field select, .dp-field textarea {
  background: #0f131c; border: 1px solid rgba(159,142,120,0.3); border-radius: 6px; color: #c1e8ff; padding: 6px 8px; font-size: 13px; }
.dp-field.dp-inline input { width: 64px; }
.vg-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
.entry-skill { background: rgba(0,180,220,0.15); color: #00b4dc; }
.entry-special { background: rgba(255,176,0,0.15); color: #ffb000; }
.entry-faction { background: rgba(120,200,120,0.15); color: #78c878; }
</style>
