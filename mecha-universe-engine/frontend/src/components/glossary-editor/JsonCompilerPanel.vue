<template>
  <div class="compiler-panel">
    <div class="cp-header">
      <div class="cp-status">
        <span v-if="status.ok" class="cp-light ok">🟢 PASS</span>
        <span v-else class="cp-light err">🔴 ERROR</span>
        <span class="cp-msg" v-if="!status.ok">{{ status.message }}</span>
      </div>
      <div class="cp-actions">
        <button class="btn" @click="copyJson" :disabled="!status.ok">复制</button>
        <button class="btn btn-save" @click="commit" :disabled="!status.ok || committing">
          {{ committing ? '落库中…' : '一键落库' }}
        </button>
      </div>
    </div>

    <div class="cp-body">
      <!-- JSON 生成模式：原始编译 JSON 为主显示 -->
      <div class="cp-raw-main">
        <div class="cp-raw-title">⛁ 已生成词条 JSON</div>
        <pre class="cp-json" v-html="highlighted"></pre>
      </div>

      <!-- 新数据维度划分：折叠为辅助视图 -->
      <details class="cp-dims">
        <summary>📐 数据维度划分（辅助预览）</summary>
        <div class="cp-dim">
          <div class="cp-dim-title">① 词条身份</div>
          <div class="cp-dim-body">
            <div class="cp-row"><span class="cp-k">类型</span><span class="cp-v">{{ dimView.entryLabel }}</span></div>
            <div class="cp-row"><span class="cp-k">名称</span><span class="cp-v">{{ dimView.name }}</span></div>
            <div class="cp-row"><span class="cp-k">AP</span><span class="cp-v">{{ dimView.ap }}</span></div>
            <div class="cp-row"><span class="cp-k">描述</span><span class="cp-v">{{ dimView.desc }}</span></div>
            <div class="cp-row" v-if="dimView.prerequisite"><span class="cp-k">前置</span><span class="cp-v">{{ dimView.prerequisite }}</span></div>
          </div>
        </div>

        <div class="cp-dim">
          <div class="cp-dim-title">② 目标维度 (Target)</div>
          <div class="cp-dim-body">
            <div class="cp-row"><span class="cp-k">目标类型</span><span class="cp-v">{{ dimView.targetType }}</span></div>
            <div class="cp-row" v-if="dimView.targetFilter"><span class="cp-k">约束</span><span class="cp-v">{{ dimView.targetFilter }}</span></div>
          </div>
        </div>

        <div class="cp-dim">
          <div class="cp-dim-title">③ 射程维度 (Range)</div>
          <div class="cp-dim-body">
            <div class="cp-row"><span class="cp-k">分类</span><span class="cp-v">{{ dimView.rangeCat }}</span></div>
            <div class="cp-row" v-if="dimView.bonusRange"><span class="cp-k">bonus_range</span><span class="cp-v">{{ dimView.bonusRange }}</span></div>
            <div class="cp-row" v-if="dimView.minRange"><span class="cp-k">min_range</span><span class="cp-v">{{ dimView.minRange }}</span></div>
            <div class="cp-row"><span class="cp-k">起→终环</span><span class="cp-v">{{ dimView.rangeRings }}</span></div>
          </div>
        </div>

        <div class="cp-dim">
          <div class="cp-dim-title">④ 打击维度 (Hit Area)</div>
          <div class="cp-dim-body">
            <div class="cp-row" v-if="dimView.hitKind === 'mapcannon'"><span class="cp-k">地图炮</span><span class="cp-v">{{ dimView.mcSummary }}</span></div>
            <div class="cp-row" v-if="dimView.hitKind === 'aoe'"><span class="cp-k">AOE</span><span class="cp-v">{{ dimView.aoeSummary }}</span></div>
          </div>
        </div>

        <div class="cp-dim">
          <div class="cp-dim-title">⑤ 效果维度 (Effects)</div>
          <div class="cp-dim-body">
            <div class="cp-eff" v-for="(e, i) in dimView.effects" :key="i">
              <span class="cp-eff-tag">{{ e.tag }}</span>
              <span class="cp-eff-detail">{{ e.detail }}</span>
            </div>
          </div>
        </div>

        <div class="cp-dim" v-if="dimView.faction">
          <div class="cp-dim-title">⑥ 阵营维度 (Faction)</div>
          <div class="cp-dim-body">
            <div class="cp-row"><span class="cp-k">限定</span><span class="cp-v">{{ dimView.faction.limited }}</span></div>
            <div class="cp-row"><span class="cp-k">次数</span><span class="cp-v">{{ dimView.faction.count }}</span></div>
            <div class="cp-row"><span class="cp-k">立场</span><span class="cp-v">{{ dimView.faction.stance }}</span></div>
          </div>
        </div>
      </details>
    </div>

    <div class="cp-key-row" v-if="!status.ok || true">
      <label>词条 KEY（检索代号）</label>
      <input v-model="skillKey" type="text" class="cp-key-input" placeholder="自动从名称生成，可手动覆盖" />
      <span class="cp-key-hint">仅 admin 可落库；普通用户改动将被忽略</span>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { glossaryAPI } from '../../api/client.js';

const props = defineProps({
  design: { type: Object, required: true },
  searchText: { type: String, default: '' }
});
const emit = defineEmits(['compiled']);

const skillKey = ref('');
const committing = ref(false);
const copied = ref(false);

// ---- 由 effects 堆栈编译为战斗引擎识别的结构（对齐第二章规范） ----
function compileEffects(effects) {
  return effects.map((ef) => {
    // 该效果的作用对象：优先用效果级 target_type，缺省回退词条级 obj.target.type
    const efTarget = ef.target_type || (compiled.value.obj.target && compiled.value.obj.target.type) || 'SINGLE_ENEMY';
    const withTarget = (o) => { o.target_type = efTarget; return o; };
    // 伤害类：绝不输出 damage_type
    if (ef.type === 'damage') {
      const o = { action: 'damage' };
      if (ef.fixed_rate_multiplier !== null && ef.fixed_rate_multiplier !== '' && !Number.isNaN(Number(ef.fixed_rate_multiplier))) {
        o.fixed_rate_multiplier = Number(ef.fixed_rate_multiplier);
      }
      o.flat_value = Number(ef.flat_value) || 0;
      o.armor_pen = Number(ef.armor_pen) || 0;
      if (ef.mobility_mode === 'fixed') {
        o.mobility_calc_modifier = { mode: 'fixed', fixed_mod: Number(ef.fixed_mod) || 0 };
      } else if (ef.mobility_mode === 'skip') {
        o.mobility_calc_modifier = { mode: 'SKIP_MOBILITY' };
      }
      return withTarget(o);
    }
    // 回复类：统一近战分类（编译时由 category 体现，effect 内标记）
    if (ef.type === 'recovery') {
      if (ef.mode === 'restore') {
        return withTarget({ action: 'restore', restore_n: Number(ef.restore_n) || 1 });
      }
      // supply：装备耐久补给
      const parts = [];
      if (ef.durability?.all) parts.push('ALL');
      const map = { roypoy: 'ROYROY', weapon: 'WEAPON', armor: 'ARMOR', vehicle: 'VEHICLE', backpack: 'BACKPACK' };
      for (const [k, on] of Object.entries(ef.durability || {})) if (on && k !== 'all') parts.push(map[k]);
      return withTarget({ action: 'supply', repair_durability: parts });
    }
    // 状态类：[TARGET_STAT]_UP / _DOWN
    if (ef.type === 'status') {
      const suffix = ef.polarity === 'debuff' ? 'DOWN' : 'UP';
      const statusId = ef.target_stat + '_' + suffix;
      let value = Number(ef.value) || 0;
      if (ef.preset === 'high_morale') { /* 士气高昂：暴击/投骰增益 由引擎解释 */ }
      if (ef.preset === 'low_morale') { /* 士气消沉：暴击/投骰减益 */ }
      return withTarget({
        action: ef.polarity === 'debuff' ? 'debuff' : 'buff',
        status: statusId,
        target_stat: ef.target_stat,
        value,
        duration: Number(ef.duration) || 3
      });
    }
    // 强制位移类
    if (ef.type === 'displacement') {
      return withTarget({ action: 'displacement', mode: ef.mode, value: Number(ef.value) || 1 });
    }
    return withTarget({ raw: ef });
  });
}

// ---- 由 stance / 效果 推导 action_type ----
function deriveActionType(design) {
  const hasDamage = design.effects.some((e) => e.type === 'damage' || e.type === 'displacement');
  const hasRecovery = design.effects.some((e) => e.type === 'recovery');
  const hasStatus = design.effects.some((e) => e.type === 'status');
  if (hasDamage) return 'attack';
  if (hasRecovery) return 'heal';
  if (hasStatus) return 'buff';
  return 'passive';
}

// ---- 编译 + 校验 ----
const compiled = computed(() => {
  const d = props.design;
  const r = d.range;
  const derived = r.derived || {};
  const errors = [];

  if (!d.meta.name || !d.meta.name.trim()) errors.push('词条名称不能为空');
  if (d.meta.entryType !== 'skill' && d.meta.entryType !== 'special' && d.meta.entryType !== 'faction' && d.meta.entryType !== 'other') {
    errors.push('未选择词条类型');
  }

  const category = derived.category;
  if (!['melee', 'ranged', 'auto'].includes(category)) errors.push('派生 category 非法：' + category);

  // 射程：射程图层必须选起点/终点
  if (r.rangeStart === undefined || r.rangeEnd === undefined) {
    errors.push('射程图层未设置起点/终点格');
  }

  // 打击范围图层校验
  if (r.layer === 'hit') {
    if (r.hitKind === 'mapcannon') {
      const shapes = r.mcShapes || {};
      const painted = Object.values(shapes).some(arr => Array.isArray(arr) && arr.length > 0);
      if (!painted) errors.push('地图炮：请在画布上点击绘制至少一个方向（再点「六向补全」镜像到全向）');
    } else if (r.hitKind === 'aoe') {
      if (!r.aoeCenter) errors.push('AOE：请在射程范围内点选 1 个落点');
    }
  }

  const effects = compileEffects(d.effects);
  if (!effects.length) errors.push('效果堆栈为空，至少需要 1 个效果');

  // 维度按需展开（对齐三分法；other 类型也可承载特殊/阵营用途）
  const isSpecial = d.meta.entryType === 'special' || d.meta.entryType === 'faction' || d.meta.entryType === 'other';
  const isFaction = d.meta.entryType === 'faction' || d.meta.entryType === 'other';

  const obj = {
    entryType: d.meta.entryType,
    name: d.meta.name.trim(),
    description: d.meta.description || '',
    category,
    action_type: deriveActionType(d),
    ap_cost: Number(d.meta.ap_cost) || 0,
    effects
  };
  // 前置：可作为某类技能的前置（仅在有选择或说明时输出）
  {
    const pre = d.meta.prerequisite || {};
    const st = (pre.skill_type || '').trim();
    const note = (pre.note || '').trim();
    if (st || note) {
      obj.prerequisite = { skill_type: st };
      if (note) obj.prerequisite.note = note;
    }
  }
  // 特殊/阵营：触发条件
  if (isSpecial) {
    obj.trigger = d.meta.trigger.type === 'none' ? null : { type: d.meta.trigger.type, value: d.meta.trigger.value || '' };
  }
  // 阵营：限定人员/次数/立场
  if (isFaction) {
    obj.faction = {
      limited_to: d.meta.faction.limited_to,
      limit_count: d.meta.faction.limit_count,
      stance: d.meta.faction.stance
    };
  }
  // 射程（加法模型：绝不输出 cast_range / max_range / range）
  if (category !== 'auto') {
    obj.bonus_range = Number(derived.bonus_range) || 0;
    if (derived.min_range && derived.min_range > 1) obj.min_range = Number(derived.min_range);
  }
  // 打击范围图层
  if (r.layer === 'hit') {
    if (r.hitKind === 'mapcannon') {
      // 新结构：每个方向是绘制的绝对坐标格数组 { dir: [ {q,r}, ... ] }
      const plain = {};
      const shapes = r.mcShapes || {};
      for (const dir in shapes) {
        const arr = shapes[dir] || [];
        plain[dir] = arr.map(c => ({ q: c.q, r: c.r }));
      }
      obj.map_cannon = { directions: plain }; // 六向叠影 = 射程范围
    } else if (r.hitKind === 'aoe') {
      obj.aoe = { center: r.aoeCenter, spread: Number(r.aoeSpread) || 0 };
    }
  }
  // 目标维度（Target Configuration）：目标类型 + 可选筛选约束
  {
    const t = d.meta.target || {};
    const filter = t.filter || {};
    const target = {
      type: t.type || 'SINGLE_ENEMY'
    };
    const unitTypes = Array.isArray(filter.unit_types) ? filter.unit_types : [];
    const status = filter.status || 'none';
    if (unitTypes.length || status !== 'none') {
      target.filter = { unit_types: unitTypes };
      if (status !== 'none') target.filter.status = status;
    }
    obj.target = target;
  }
  // 红线：强制剔除任何绝对射程字段
  delete obj.cast_range; delete obj.max_range; delete obj.range; delete obj.damage_type;

  const ok = errors.length === 0;
  return { ok, obj, errors };
});

const status = computed(() => {
  if (compiled.value.ok) return { ok: true, message: '' };
  return { ok: false, message: compiled.value.errors[0] };
});

const jsonStr = computed(() => JSON.stringify(compiled.value.obj, null, 2));

// 维度划分视图（供新数据维度详情展示）
const ENTRY_LABELS = { skill: '技能 Skill', special: '特殊 Special', faction: '阵营 Faction', other: '其它 Other' };
const TARGET_LABELS = {
  SELF: 'SELF · 仅自身', SINGLE_ENEMY: 'SINGLE_ENEMY · 敌方单体', AREA_ENEMY: 'AREA_ENEMY · 敌方AOE',
  SINGLE_ALLY: 'SINGLE_ALLY · 友方单体', AREA_ALLY: 'AREA_ALLY · 友方AOE', ALL_UNITS: 'ALL_UNITS · 无差别全场'
};
const DIR_LABELS = { right: '右', rightup: '右上', leftup: '左上', left: '左', leftdown: '左下', rightdown: '右下' };
const UNIT_LABELS = { mech: '机甲', vehicle: '载具', structure: '建筑/设施', air: '飞行单位' };
const STATUS_LABELS = { hp_lt_50: 'HP<50%', disabled: '瘫痪' };
const PRE_LABELS = { melee: '近战', ranged: '远程', auto: '自动化', other: '其它' };

const dimView = computed(() => {
  const d = props.design;
  const r = d.range;
  const derived = r.derived || {};
  const o = compiled.value.obj;
  const mcShapes = r.mcShapes || {};
  const mcDirs = Object.keys(mcShapes).filter(k => Array.isArray(mcShapes[k]) && mcShapes[k].length);
  const t = d.meta.target || {};
  const tf = t.filter || {};

  const effTags = {
    damage: '伤害', recovery: '回复', status: '状态', displacement: '位移'
  };
  const effects = (d.effects || []).map(e => {
    let detail = '';
    if (e.type === 'damage') detail = `倍率${e.fixed_rate_multiplier ?? '-'} / 定值${e.flat_value ?? 0} / 穿甲${e.armor_pen ?? 0}`;
    else if (e.type === 'recovery') detail = e.mode === 'restore' ? `归零×${e.restore_n ?? 1}` : `补给 ${Object.keys(e.durability || {}).filter(k => e.durability[k]).join(',') || 'ALL'}`;
    else if (e.type === 'status') detail = `${e.target_stat}_${e.polarity === 'debuff' ? 'DOWN' : 'UP'} 值${e.value ?? 0} 持续${e.duration ?? 3}`;
    else if (e.type === 'displacement') detail = `${e.mode === 'knockback' ? '击退' : '牵引'} ${e.value ?? 1} 格`;
    return { tag: effTags[e.type] || e.type, detail };
  });

  const unitTypes = Array.isArray(tf.unit_types) ? tf.unit_types.map(u => UNIT_LABELS[u] || u) : [];
  const filterParts = [];
  if (unitTypes.length) filterParts.push('单位:' + unitTypes.join('/'));
  if (tf.status && tf.status !== 'none') filterParts.push(STATUS_LABELS[tf.status] || tf.status);

  return {
    entryLabel: ENTRY_LABELS[d.meta.entryType] || d.meta.entryType,
    name: d.meta.name || '—',
    ap: o.ap_cost,
    desc: d.meta.description || '—',
    targetType: TARGET_LABELS[t.type] || t.type || '—',
    targetFilter: filterParts.length ? filterParts.join('；') : '',
    rangeCat: derived.category,
    bonusRange: derived.bonus_range ? String(derived.bonus_range) : '',
    minRange: derived.min_range > 1 ? String(derived.min_range) : '',
    rangeRings: `${r.rangeStart ?? 1} → ${r.rangeEnd ?? 1}（中心为0）`,
    hitKind: r.layer === 'hit' ? r.hitKind : '',
    mcSummary: mcDirs.length ? mcDirs.map(k => `${DIR_LABELS[k] || k}×${mcShapes[k].length}`).join('，') : '',
    aoeSummary: r.aoeCenter ? `落点(${r.aoeCenter.q},${r.aoeCenter.r}) 扩散${r.aoeSpread ?? 1}` : '',
    effects,
    prerequisite: (() => {
      const pre = d.meta.prerequisite || {};
      const st = (pre.skill_type || '').trim();
      const note = (pre.note || '').trim();
      if (!st && !note) return '';
      return (st ? '前置:' + (PRE_LABELS[st] || st) : '') + (note ? (st ? '；' : '') + note : '');
    })(),
    faction: d.meta.entryType === 'faction' || d.meta.entryType === 'other' ? {
      limited: d.meta.faction.limited_to === 'ace' ? '仅ACE' : '全员',
      count: d.meta.faction.limit_count === 'personal_once' ? '个人一次' : '阵营一次',
      stance: { attack: '攻', defense: '防', ambush: '偷袭' }[d.meta.faction.stance] || d.meta.faction.stance
    } : null
  };
});

// 简单语法高亮
const highlighted = computed(() => {
  const esc = jsonStr.value
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let html = esc
    .replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
      (m) => {
        let cls = 'cp-num';
        if (/^"/.test(m)) cls = /:$/.test(m) ? 'cp-key' : 'cp-str';
        else if (/true|false|null/.test(m)) cls = 'cp-bool';
        return '<span class="' + cls + '">' + m + '</span>';
      });
  // 全局搜索框关键字实时高亮（纯展示，不影响落库）
  const kw = props.searchText && props.searchText.trim();
  if (kw) {
    const re = new RegExp('(' + kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
    html = html.replace(re, '<mark class="cp-mark">$1</mark>');
  }
  return html;
});

function autoKey() {
  const name = props.design.meta.name || '';
  const slug = name.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^\w一-龥]/g, '') || 'new_skill';
  return slug;
}

watch(
  () => props.design.meta.name,
  () => { if (!skillKey.value) skillKey.value = autoKey(); },
  { immediate: true }
);

// 实时编译（16ms 节流）
let raf = null;
watch(
  () => JSON.stringify(props.design),
  () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = null;
      emit('compiled', { ok: compiled.value.ok, json: jsonStr.value });
    });
  },
  { deep: true }
);

function copyJson() {
  navigator.clipboard?.writeText(jsonStr.value);
  copied.value = true;
  setTimeout(() => (copied.value = false), 1200);
}

async function commit() {
  if (!compiled.value.ok) return;
  const key = (skillKey.value || autoKey()).trim();
  if (!key) { alert('请填写词条 KEY'); return; }
  committing.value = true;
  try {
    const payload = { skills: { [key]: compiled.value.obj } };
    const res = await glossaryAPI.saveConfig(payload);
    if (res.data && res.data.ok === false) {
      alert('落库失败：' + (res.data.error || '未知错误'));
    } else {
      alert('✅ 已落库：' + key);
      skillKey.value = '';
    }
  } catch (e) {
    const msg = e.response?.data?.error || e.message || '网络错误';
    alert('落库失败：' + msg + '\n（普通用户改动会被忽略，请使用 admin 账号）');
  } finally {
    committing.value = false;
  }
}

// 支持词条库编辑器顶栏「保存」按钮触发落库（原 VisualGlossaryView 已废弃删除）
function onCommitEvent() { commit(); }
onMounted(() => {
  window.addEventListener('vg-commit-skill', onCommitEvent);
});
onBeforeUnmount(() => {
  window.removeEventListener('vg-commit-skill', onCommitEvent);
});

// 暴露编译结果供父层
watch(compiled, (v) => emit('compiled', { ok: v.ok, json: jsonStr.value }), { immediate: true });
</script>

<style scoped>
.compiler-panel { display: flex; flex-direction: column; height: 100%; background: #001620; border: 1px solid rgba(159,142,120,0.18); border-radius: 8px; overflow: hidden; font-family: 'Fira Code','Courier New',monospace; }
.cp-header { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; border-bottom: 1px solid rgba(159,142,120,0.1); flex: 0 0 auto; }
.cp-status { display: flex; align-items: center; gap: 10px; }
.cp-light { font-size: 14px; font-weight: 700; }
.cp-light.ok { color: #13ff43; }
.cp-light.err { color: #ff5252; }
.cp-msg { color: #7fb3d5; font-size: 12px; }
.cp-actions { display: flex; gap: 8px; }
.cp-body { flex: 1 1 auto; overflow: auto; padding: 10px 12px; margin: 0; }

/* 新数据维度卡片（现为折叠辅助视图） */
.cp-dims { display: flex; flex-direction: column; gap: 10px; margin-top: 12px; border: 1px solid rgba(159,142,120,0.12); border-radius: 6px; padding: 8px; background: rgba(0,0,0,0.1); }
.cp-dims > summary { color: #7fb3d5; font-size: 12px; cursor: pointer; letter-spacing: 1px; }
.cp-dims > summary:hover { color: #ffb000; }
.cp-dim { border: 1px solid rgba(159,142,120,0.12); border-radius: 6px; overflow: hidden; background: rgba(0,0,0,0.12); }
.cp-dim-title { background: rgba(255,176,0,0.06); color: #ffb000; font-size: 12px; letter-spacing: 1px; padding: 6px 10px; border-bottom: 1px solid rgba(159,142,120,0.12); }
.cp-dim-body { padding: 8px 10px; display: flex; flex-direction: column; gap: 4px; }
.cp-row { display: grid; grid-template-columns: 1.1fr 1fr; gap: 8px; font-size: 12px; border-bottom: 1px solid rgba(159,142,120,0.08); padding-bottom: 3px; }
.cp-k { color: #9f8e78; background: rgba(0,0,0,0.22); padding: 1px 6px; border-radius: 3px; }
.cp-v { color: #c1e8ff; }
.cp-eff { display: flex; gap: 8px; font-size: 12px; align-items: baseline; }
.cp-eff-tag { color: #1a1a1a; background: linear-gradient(90deg,#ffb000,#ff8c00); border-radius: 3px; padding: 1px 8px; font-weight: 700; flex: 0 0 auto; }
.cp-eff-detail { color: #ffd597; }

/* JSON 生成模式：原始编译 JSON 主显示 */
.cp-raw-main { flex: 1 1 auto; }
.cp-raw-title { color: #ffb000; font-size: 13px; letter-spacing: 1px; margin-bottom: 6px; font-weight: 600; }
.cp-json {
  font-family: 'Fira Code','Courier New',monospace; font-size: 12.5px; line-height: 1.5;
  color: #c9d1d9; white-space: pre; margin: 0; background: rgba(0,0,0,0.28); padding: 10px; border-radius: 6px; max-height: 46vh; overflow: auto;
}
.cp-key { color: #ffd597; }
.cp-str { color: #7fb3d5; }
.cp-num { color: #ff8c00; }
.cp-bool { color: #9370db; }
.cp-mark { background: #ffd33d; color: #1a1a00; border-radius: 2px; padding: 0 1px; }
.cp-key-row { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-top: 1px solid rgba(159,142,120,0.1); flex: 0 0 auto; }
.cp-key-row label { font-size: 12px; color: #9f8e78; }
.cp-key-input { flex: 0 0 240px; padding: 5px 8px; border-radius: 5px; border: 1px solid rgba(255,176,0,0.22); background: rgba(0,0,0,0.35); color: #ffd597; font-size: 12px; font-family: inherit; }
.cp-key-hint { font-size: 11px; color: #6b7f93; }
.btn { padding: 6px 14px; border: 1px solid rgba(159,142,120,0.25); border-radius: 6px; background: rgba(0,0,0,0.2); color: #c1e8ff; cursor: pointer; font-size: 12px; letter-spacing: 1px; font-weight: 700; font-family: inherit; }
.btn:hover { border-color: #ffb000; color: #ffd597; }
.btn-save { background: linear-gradient(90deg,#ffb000,#ff8c00); color: #1a1a1a; border-color: #ffb000; }
.btn-save:hover { background: linear-gradient(90deg,#ff8c00,#ffb000); color: #1a1a1a; }
.btn:disabled { opacity: .4; filter: grayscale(0.3); cursor: not-allowed; }
</style>
