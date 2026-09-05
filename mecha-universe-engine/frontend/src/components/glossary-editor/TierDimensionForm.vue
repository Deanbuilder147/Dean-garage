<template>
  <div class="tier-form">
    <!-- 词条类型选择（决定维度层级） -->
    <fieldset class="tier-block">
      <legend>词条类型</legend>
      <div class="tf-type-row">
        <label class="tf-radio"><input type="radio" value="skill" v-model="meta.entryType" /> 技能词条 / Skill</label>
        <label class="tf-radio"><input type="radio" value="special" v-model="meta.entryType" /> 特殊词条 / Special</label>
        <label class="tf-radio"><input type="radio" value="faction" v-model="meta.entryType" /> 阵营词条 / Faction</label>
        <label class="tf-radio"><input type="radio" value="other" v-model="meta.entryType" /> 其它词条 / Other</label>
      </div>
    </fieldset>

    <!-- 所有词条通用：名称 / 描述 / AP -->
    <fieldset class="tier-block">
      <legend>① 通用维度（所有词条）</legend>
      <div class="tf-row">
        <label>词条名称</label>
        <input v-model="meta.name" type="text" placeholder="技能名称（中文）" class="tf-input" />
      </div>
      <div class="tf-row">
        <label>描述</label>
        <textarea v-model="meta.description" rows="2" placeholder="技能描述…" class="tf-input"></textarea>
      </div>
      <div class="tf-row">
        <label>AP 消耗</label>
        <input v-model.number="meta.ap_cost" type="number" min="0" max="5" class="tf-input tf-num" />
      </div>
      <div class="tf-row">
        <label>前置</label>
        <select v-model="meta.prerequisite.skill_type" class="tf-input" style="width:140px;">
          <option value="">（无 / None）</option>
          <option value="melee">近战 / Melee</option>
          <option value="ranged">远程 / Ranged</option>
          <option value="auto">自动化 / Auto</option>
          <option value="other">其它 / Other</option>
        </select>
        <input v-model="meta.prerequisite.note" type="text" placeholder="前置说明（可选，如适用条件 / 关联词条）" class="tf-input" style="flex:1 1 auto;" />
      </div>
    </fieldset>

    <!-- 特殊词条：触发条件（skill/special/faction 之外，选「其它」类型的词条也可承载特殊用途） -->
    <fieldset v-if="meta.entryType === 'special' || meta.entryType === 'faction' || meta.entryType === 'other'" class="tier-block">
      <legend>② 特殊维度（触发条件）</legend>
      <div class="tf-row">
        <label>触发条件</label>
        <select v-model="meta.trigger.type" class="tf-input">
          <option value="none">无（主动释放）/ None</option>
          <option value="on_attack">受击时 on_attack</option>
          <option value="on_hit">命中时 on_hit</option>
          <option value="round_start">回合开始 round_start</option>
          <option value="round_end">回合结束 round_end</option>
          <option value="low_hp">低血量 low_hp</option>
        </select>
      </div>
      <div class="tf-row" v-if="meta.trigger.type !== 'none'">
        <label>触发参数</label>
        <input v-model="meta.trigger.value" type="text" placeholder="如阈值 / 目标" class="tf-input" />
      </div>
      <small class="tf-hint">触发条件为双向判定：满足条件才激活，并参与规则缺失校验。</small>
    </fieldset>

    <!-- 阵营维度：faction 与 other 类型可承载阵营用途 -->
    <fieldset v-if="meta.entryType === 'faction' || meta.entryType === 'other'" class="tier-block">
      <legend>③ 阵营维度（限定与立场）</legend>
      <div class="tf-row">
        <label>限定人员</label>
        <select v-model="meta.faction.limited_to" class="tf-input">
          <option value="all">通用（全体）/ All</option>
          <option value="ace">ACE（王牌专属）/ ACE Only</option>
        </select>
      </div>
      <div class="tf-row">
        <label>限定次数</label>
        <select v-model="meta.faction.limit_count" class="tf-input">
          <option value="faction_once">阵营 1 次 / Faction Once</option>
          <option value="personal_once">个人 1 次 / Personal Once</option>
        </select>
      </div>
      <div class="tf-row">
        <label>战术立场</label>
        <select v-model="meta.faction.stance" class="tf-input">
          <option value="attack">攻 / Attack</option>
          <option value="defense">防 / Defense</option>
          <option value="ambush">偷袭 / Ambush</option>
        </select>
      </div>
    </fieldset>

    <!-- 目标维度（所有词条必填：目标类型 + 可选筛选约束） -->
    <fieldset class="tier-block">
      <legend>④ 目标维度（Target Configuration）</legend>
      <div class="tf-row">
        <label>目标类型</label>
        <select v-model="meta.target.type" class="tf-input">
          <option value="SELF">SELF（仅自身）</option>
          <option value="SINGLE_ENEMY">SINGLE_ENEMY（敌方单体）</option>
          <option value="AREA_ENEMY">AREA_ENEMY（敌方 AOE）</option>
          <option value="SINGLE_ALLY">SINGLE_ALLY（友方单体）</option>
          <option value="AREA_ALLY">AREA_ALLY（友方 AOE）</option>
          <option value="ALL_UNITS">ALL_UNITS（无差别全场）</option>
        </select>
      </div>

      <div class="tf-subblock">
        <div class="tf-subtitle">目标特殊约束（target_filter，可选）</div>

        <div class="tf-row">
          <label>单位类型</label>
          <div class="tf-checks">
            <label class="tf-check"><input type="checkbox" value="mech" v-model="meta.target.filter.unit_types" /> 机甲</label>
            <label class="tf-check"><input type="checkbox" value="vehicle" v-model="meta.target.filter.unit_types" /> 载具</label>
            <label class="tf-check"><input type="checkbox" value="structure" v-model="meta.target.filter.unit_types" /> 建筑/设施</label>
            <label class="tf-check"><input type="checkbox" value="air" v-model="meta.target.filter.unit_types" /> 飞行单位</label>
          </div>
        </div>

        <div class="tf-row">
        <label>状态条件</label>
        <select v-model="meta.target.filter.status" class="tf-input">
          <option value="none">无（不限状态）/ None</option>
          <option value="hp_lt_50">仅 HP &lt; 50%</option>
          <option value="disabled">仅处于瘫痪状态 / Disabled</option>
        </select>
        </div>
      </div>
      <small class="tf-hint">SELF 表示仅作用于自身（如超频/自身修补）；ALL_UNITS 不分敌我一律结算；其余按敌/友方与单体/AOE 区分。</small>
    </fieldset>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({ modelValue: { type: Object, required: true } });
const emit = defineEmits(['update:modelValue']);

const meta = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
});
</script>

<style scoped>
.tier-form { display: flex; flex-direction: column; gap: 12px; font-family: 'Fira Code','Courier New',monospace; }
.tier-block { border: 1px solid rgba(159,142,120,0.12); border-radius: 8px; padding: 10px 12px 12px; background: rgba(0,0,0,0.12); }
.tier-block legend { color: #ffb000; font-size: 13px; font-weight: 600; padding: 0 6px; letter-spacing: 1px; }
.tf-type-row { display: flex; gap: 16px; }
.tf-radio { font-size: 13px; color: #c1e8ff; cursor: pointer; display: flex; align-items: center; gap: 5px; }
.tf-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.tf-row label { flex: 0 0 88px; font-size: 13px; color: #9f8e78; text-align: right; }
.tf-input {
  flex: 1 1 auto; padding: 6px 9px; border-radius: 6px;
  border: 1px solid rgba(255,176,0,0.22); background: rgba(0,0,0,0.35); color: #ffd597; font-size: 13px; font-family: inherit;
}
.tf-input:focus { outline: none; border-color: #ffb000; box-shadow: 0 0 0 2px rgba(255,176,0,0.15); }
.tf-num { max-width: 90px; }
.tf-hint { color: #7fb3d5; font-size: 12px; }
.tf-subblock { margin-top: 8px; border-top: 1px dashed rgba(255,176,0,0.2); padding-top: 8px; }
.tf-subtitle { color: #ffb000; font-size: 12px; margin-bottom: 6px; }
.tf-checks { display: flex; gap: 12px; flex-wrap: wrap; }
.tf-check { font-size: 12px; color: #c1e8ff; display: flex; align-items: center; gap: 4px; cursor: pointer; }
textarea.tf-input { resize: vertical; font-family: inherit; }
</style>
