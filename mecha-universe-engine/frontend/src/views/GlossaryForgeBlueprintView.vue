<template>
  <div class="bp-page">
    <!-- 顶栏：终端风格 -->
    <header class="bp-head">
      <div class="bp-brand">
        <span class="bp-mark">▚</span>
        <h1>GLOSSARY_FORGE // BLUEPRINT<span class="en-sub">词条锻造·蓝图</span></h1>
        <span class="bp-path">/combat-glossary/config<span class="en-sub">配置路径</span></span>
      </div>
      <div class="bp-ops">
        <button class="bp-btn" @click="forge.createSkill()">[+ NEW]<span class="en-sub">新建</span></button>
        <button class="bp-btn" :disabled="!forge.selectedKey.value" @click="forge.deleteSkill()">[x DEL]<span class="en-sub">删除</span></button>
        <button class="bp-btn" :disabled="!forge.dirty.value" @click="forge.revert()">[&lt; REVERT]<span class="en-sub">还原</span></button>
        <button class="bp-btn go" :disabled="forge.saving.value" @click="forge.save()">
          {{ forge.saving.value ? '[ SAVING.. ]' : '[ SAVE ]' }}<span class="en-sub">{{ forge.saving.value ? '保存中' : '保存' }}</span>
          <i v-if="forge.dirty.value" class="bp-dirty">●</i>
        </button>
      </div>
    </header>

    <div v-if="forge.message.value.text" class="bp-log" :class="forge.message.value.type">
      <span class="bp-logk">SYS<span class="en-sub">系统</span></span> {{ forge.message.value.text }}
    </div>

    <div class="bp-body">
      <!-- 左：词条索引 -->
      <aside class="bp-pane bp-index">
        <div class="bp-ph">INDEX<span class="en-sub">索引</span> <i>{{ forge.skillKeys.value.length }}</i></div>
        <input v-model="kw" class="bp-inp" placeholder="> filter key/name · 筛选键/名" />
        <div class="bp-list">
          <button
            v-for="k in filteredKeys" :key="k"
            class="bp-item" :class="{ on: k === forge.selectedKey.value }"
            @click="forge.select(k)"
          >
            <span class="bp-idx">{{ String(filteredKeys.indexOf(k) + 1).padStart(2, '0') }}</span>
            <span class="bp-nm">{{ skills[k]?.name || skills[k]?.label || k }}</span>
            <span class="bp-kk">{{ k }}</span>
          </button>
          <p v-if="!filteredKeys.length" class="bp-mute">-- NO ENTRY --<span class="en-sub">无条目</span></p>
        </div>
      </aside>

      <!-- 中：六段横向示意 + 原子 -->
      <section class="bp-pane bp-main">
        <div class="bp-ph">SIX-PHASE LADDER<span class="en-sub">六段阶梯</span>
          <i v-if="forge.isCore.value" class="bp-core">!! CORE SKILL — READ ONLY (backend protected)<span class="en-sub">核心技能·只读（后端保护）</span></i>
          <i v-else>select a phase, then click atoms →<span class="en-sub">选一段，再点原子 →</span></i>
        </div>

        <div class="bp-ladder">
          <div
            v-for="(lane, li) in forge.lanes.value" :key="lane.key"
            class="bp-rung" :class="{ on: activeLane === lane.key }"
            @click="activeLane = lane.key"
          >
            <div class="br-tag">
              <b>{{ String(li + 1).padStart(2, '0') }}</b>
              <span>{{ lane.key }}</span>
            </div>
            <div class="br-track">
              <div v-for="(a, i) in lane.atoms" :key="a._uid" class="bp-node">
                <div class="bn-top">
                  <b>{{ a.label }}</b>
                  <button class="bn-x" @click.stop="forge.removeAtom(lane.key, i)">x<span class="en-sub">删</span></button>
                </div>
                <div class="bn-fields">
                  <div v-for="f in a.fields" :key="f.key" class="bn-f">
                    <label>{{ f.label }}</label>
                    <select
                      v-if="f.type === 'select'"
                      :value="a.values[f.key]"
                      @change="forge.setAtomValue(lane.key, i, f.key, $event.target.value)"
                    >
                      <option v-for="o in f.options" :key="optVal(o)" :value="optVal(o)">{{ optLabel(o) }}</option>
                    </select>
                    <input
                      v-else-if="f.type === 'bool'" type="checkbox"
                      :checked="!!a.values[f.key]"
                      @change="forge.setAtomValue(lane.key, i, f.key, $event.target.checked)" />
                    <input
                      v-else-if="f.type === 'number'" type="number"
                      :value="a.values[f.key]"
                      @input="forge.setAtomValue(lane.key, i, f.key, Number($event.target.value))" />
                    <input
                      v-else type="text"
                      :value="a.values[f.key]"
                      @input="forge.setAtomValue(lane.key, i, f.key, $event.target.value)" />
                  </div>
                  <span v-if="!a.fields.length" class="bn-none">// no params<span class="en-sub">无参数</span></span>
                </div>
              </div>
              <span v-if="!lane.atoms.length" class="br-empty">// empty phase<span class="en-sub">空阶段</span></span>
            </div>
            <div class="br-n">{{ lane.atoms.length }}</div>
          </div>
        </div>

        <!-- 原子面板 -->
        <div class="bp-ph" style="margin-top:14px">
          ATOM BUS<span class="en-sub">原子总线</span> <i>{{ activeLane ? '→ ' + activeLane : 'no phase selected' }}<span class="en-sub">未选阶段</span></i>
        </div>
        <input v-model="atomKw" class="bp-inp" placeholder="> search atom · 搜索原子" />
        <div class="bp-atoms">
          <div v-for="g in filteredGroups" :key="g.grp" class="bp-ag">
            <div class="bp-agt">{{ g.title }}</div>
            <button
              v-for="a in g.atoms" :key="a.key"
              class="bp-chip" :class="'k-' + a.st"
              :disabled="!activeLane"
              :title="a.effectType"
              @click="forge.addAtom(activeLane, a)"
            >{{ a.label }}</button>
          </div>
        </div>
      </section>

      <!-- 右：射程 + 命中范围 -->
      <aside class="bp-pane bp-scope">
        <!-- 射程 -->
        <div class="bp-ph">RANGE<span class="en-sub">射程</span> <i>base + bonus<span class="en-sub">基础+加成</span></i></div>
        <div class="bp-box">
          <div class="bp-r"><label>category<span class="en-sub">类别</span></label><span class="bp-v tag">{{ forge.category.value }}</span></div>
          <div class="bp-r"><label>base_range<span class="en-sub">基础射程</span></label><span class="bp-v">{{ forge.rangeBase.value.max }}</span></div>
          <div class="bp-r">
            <label>bonus_range<span class="en-sub">加成射程</span></label>
            <input class="bp-inp2" type="number" step="1" :value="draft?.bonus_range ?? 0"
                   @input="forge.setBonusRange($event.target.value)" />
          </div>
          <div class="bp-r">
            <label>min_range<span class="en-sub">最小射程</span></label>
            <input class="bp-inp2" type="number" step="1" min="0" :value="draft?.min_range ?? 0"
                   @input="forge.setMinRange($event.target.value)" />
          </div>
          <div class="bp-out">
            &gt; effective_range =<span class="en-sub">有效射程=</span> <b>{{ forge.rangeFields.value.minRange }} .. {{ forge.rangeFields.value.maxRange }}</b>
          </div>
        </div>

        <!-- 命中范围 -->
        <div class="bp-ph">HIT AREA<span class="en-sub">命中范围</span> <i>{{ forge.hitAreaInfo.value.text }}</i></div>
        <div class="bp-box">
          <div class="bp-modes">
            <button
              v-for="m in HIT_AREA_MODES" :key="m.value"
              class="bp-md" :class="{ on: forge.hitArea.value.mode === m.value }"
              :title="m.desc"
              @click="forge.setHitAreaMode(m.value)"
            >{{ m.label }}</button>
          </div>

          <template v-if="forge.hitArea.value.mode === 'aoe'">
            <div class="bp-r">
              <label>spread<span class="en-sub">扩散</span></label>
              <input class="bp-inp2" type="number" min="0" :value="forge.hitArea.value.aoe.spread"
                     @input="forge.setAoeSpread($event.target.value)" />
            </div>
            <div class="bp-r">
              <label>shape<span class="en-sub">形状</span></label>
              <select class="bp-inp2" :value="forge.hitArea.value.aoe.shape"
                      @change="forge.setAoeShape($event.target.value)">
                <option v-for="s in AOE_SHAPES" :key="s" :value="s">{{ s }}</option>
              </select>
            </div>
            <div class="bp-r">
              <label>inner_blind<span class="en-sub">内盲区</span></label>
              <input class="bp-inp2" type="number" min="0" :value="forge.hitArea.value.aoe.inner_radius"
                     @input="forge.setAoeInner($event.target.value)" />
            </div>
            <label class="bp-ck">
              <input type="checkbox" :checked="forge.hitArea.value.aoe.friendly_fire"
                     @change="forge.setAoeFriendly($event.target.checked)" />
              friendly_fire<span class="en-sub">误伤友军</span>
            </label>
            <p class="bp-note">// click grid to set IMPACT POINT<span class="en-sub">点网格设冲击点</span></p>
          </template>

          <template v-else-if="forge.hitArea.value.mode === 'map_cannon'">
            <div class="bp-r">
              <label>dir<span class="en-sub">方向</span></label>
              <select class="bp-inp2" v-model="activeDir">
                <option v-for="d in MC_DIR_KEYS" :key="d" :value="d">{{ d }}</option>
              </select>
            </div>
            <div class="bp-r">
              <label>preset<span class="en-sub">预设</span></label>
              <span class="bp-btns">
                <button @click="forge.fillMcShape(activeDir, 'line', 3)">line<span class="en-sub">线</span></button>
                <button @click="forge.fillMcShape(activeDir, 'sector', 3, 2)">sector<span class="en-sub">扇形</span></button>
                <button @click="forge.fillMcShape(activeDir, 'cone', 3)">cone<span class="en-sub">锥形</span></button>
                <button @click="forge.clearMcDir(activeDir)">clr<span class="en-sub">清除</span></button>
              </span>
            </div>
            <div class="bp-dirs">
              <span v-for="d in MC_DIR_KEYS" :key="d" class="bp-d"
                    :class="{ on: d === activeDir, has: (forge.hitArea.value.mc.directions[d] || []).length }">
                {{ d.slice(0, 4) }}<i v-if="(forge.hitArea.value.mc.directions[d] || []).length">
                  {{ forge.hitArea.value.mc.directions[d].length }}</i>
              </span>
            </div>
            <p class="bp-note">// click grid cells to toggle<span class="en-sub">点网格格切换</span></p>
          </template>

          <p v-else class="bp-note">// single target — no area<span class="en-sub">单体·无范围</span></p>

          <div class="bp-grid">
            <HexHitGrid
              skin="blueprint"
              :mode="forge.hitArea.value.mode"
              :aoe-center="forge.hitArea.value.aoe.center"
              :aoe-spread="forge.hitArea.value.aoe.spread"
              :aoe-inner="forge.hitArea.value.aoe.inner_radius"
              :mc-directions="forge.hitArea.value.mc.directions"
              :active-dir="activeDir"
              :range-max="forge.rangeFields.value.maxRange"
              :reachable="forge.hitArea.value.mode === 'aoe'"
              @pick="onPick"
            />
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useGlossaryForge } from '../battle/glossary/useGlossaryForge.js'
import { HIT_AREA_MODES, AOE_SHAPES } from '../battle/glossary/hitAreaModel.js'
import HexHitGrid from '../components/glossary-forge/HexHitGrid.vue'

const forge = useGlossaryForge()
const { skills, draft } = forge

const kw = ref('')
const atomKw = ref('')
const activeLane = ref('DO')
const activeDir  = ref('right')

const filteredKeys = computed(() => {
  const k = kw.value.trim().toLowerCase()
  if (!k) return forge.skillKeys.value
  return forge.skillKeys.value.filter(key => {
    const s = skills.value[key] || {}
    return key.toLowerCase().includes(k) || String(s.name || s.label || '').toLowerCase().includes(k)
  })
})

const filteredGroups = computed(() => {
  const k = atomKw.value.trim().toLowerCase()
  if (!k) return forge.atomGroups
  return forge.atomGroups
    .map(g => ({ ...g, atoms: g.atoms.filter(a =>
      a.label.toLowerCase().includes(k) || a.key.toLowerCase().includes(k) || a.effectType.toLowerCase().includes(k)) }))
    .filter(g => g.atoms.length)
})

function optVal(o)  { return typeof o === 'object' && o ? o.value : o }
function optLabel(o){ return typeof o === 'object' && o ? o.label : o }

function onPick({ q, r }) {
  if (forge.hitArea.value.mode === 'aoe') {
    const c = forge.hitArea.value.aoe.center
    if (c && c.q === q && c.r === r) forge.setAoeCenter(null, null)
    else forge.setAoeCenter(q, r)
  } else if (forge.hitArea.value.mode === 'map_cannon') {
    forge.toggleMcCell(activeDir.value, q, r)
  }
}

onMounted(() => forge.load())
</script>

<style scoped>
.bp-page {
  --cy: #36c5f0; --cy2: #7fe7ff; --dim: #5d7f96;
  min-height: 100vh; padding: 16px 18px 40px; color: #bfdcec;
  font-family: "SF Mono", Menlo, Consolas, "Courier New", monospace;
  background-color: #061019;
  background-image:
    linear-gradient(rgba(54,197,240,.055) 1px, transparent 1px),
    linear-gradient(90deg, rgba(54,197,240,.055) 1px, transparent 1px),
    linear-gradient(rgba(54,197,240,.028) 1px, transparent 1px),
    linear-gradient(90deg, rgba(54,197,240,.028) 1px, transparent 1px);
  background-size: 80px 80px, 80px 80px, 16px 16px, 16px 16px;
}

.bp-head { display:flex; align-items:center; justify-content:space-between; gap:14px;
  padding:10px 14px; margin-bottom:10px; border:1px solid rgba(54,197,240,.35);
  background: rgba(6,20,32,.9); }
.bp-brand { display:flex; align-items:center; gap:10px; }
.bp-mark { color: var(--cy); font-size:16px; }
.bp-brand h1 { font-size:14px; margin:0; letter-spacing:1.5px; color: var(--cy2); font-weight:600; }
.bp-path { font-size:10px; color: var(--dim); }
.bp-ops { display:flex; gap:6px; }
.bp-btn { position:relative; font-family:inherit; font-size:11px; padding:6px 10px; cursor:pointer;
  background: rgba(54,197,240,.08); border:1px solid rgba(54,197,240,.4); color: var(--cy2); }
.bp-btn:hover:not(:disabled) { background: rgba(54,197,240,.22); }
.bp-btn:disabled { opacity:.35; cursor:not-allowed; }
.bp-btn.go { background: rgba(54,197,240,.22); font-weight:700; }
.bp-dirty { position:absolute; top:2px; right:3px; font-size:8px; color:#ff3b7c; font-style:normal; }

.bp-log { padding:6px 12px; margin-bottom:10px; font-size:11.5px;
  border-left:3px solid var(--cy); background: rgba(54,197,240,.1); }
.bp-log.err { border-left-color:#ff3b7c; background: rgba(255,59,124,.1); color:#ffb0c8; }
.bp-logk { color: var(--cy); font-weight:700; margin-right:6px; }

.bp-body { display:grid; grid-template-columns: 200px minmax(340px,1fr) 310px; gap:10px; align-items:start; }
.bp-pane { border:1px solid rgba(54,197,240,.28); background: rgba(6,20,32,.86); padding:10px; }
.bp-ph { font-size:11px; color: var(--cy); letter-spacing:1.2px; margin-bottom:8px;
  border-bottom:1px dashed rgba(54,197,240,.3); padding-bottom:5px; display:flex; gap:6px; align-items:baseline; }
.bp-ph i { font-style:normal; font-size:9.5px; color: var(--dim); font-weight:400; }
.bp-core { color:#ff7a9c !important; }

.bp-inp { width:100%; background:#04101c; border:1px solid rgba(54,197,240,.3); color: var(--cy2);
  padding:4px 7px; font-size:11px; font-family:inherit; margin-bottom:7px; }
.bp-inp2 { background:#04101c; border:1px solid rgba(54,197,240,.3); color: var(--cy2);
  padding:2px 5px; font-size:10.5px; font-family:inherit; width:100px; }

.bp-list { display:flex; flex-direction:column; gap:2px; max-height:56vh; overflow:auto; }
.bp-item { display:flex; align-items:center; gap:7px; padding:4px 6px; cursor:pointer; text-align:left;
  background:none; border:none; border-left:2px solid transparent; color:#bfdcec; font-family:inherit; font-size:11px; }
.bp-item:hover { background: rgba(54,197,240,.12); }
.bp-item.on { background: rgba(54,197,240,.2); border-left-color: var(--cy); }
.bp-idx { font-size:9px; color: var(--dim); }
.bp-nm { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.bp-kk { font-size:9px; color: var(--dim); }
.bp-mute { font-size:10.5px; color: var(--dim); text-align:center; padding:12px 0; }

/* 六段横向阶梯 */
.bp-ladder { display:flex; flex-direction:column; gap:4px; }
.bp-rung { display:flex; align-items:stretch; gap:0; cursor:pointer;
  border:1px solid rgba(54,197,240,.18); background: rgba(54,197,240,.03); }
.bp-rung.on { border-color: var(--cy); background: rgba(54,197,240,.12); box-shadow: inset 2px 0 0 var(--cy); }
.br-tag { flex:none; width:52px; display:flex; flex-direction:column; align-items:center; justify-content:center;
  background: rgba(54,197,240,.14); border-right:1px solid rgba(54,197,240,.2); padding:5px 2px; }
.br-tag b { font-size:12px; color: var(--cy); }
.br-tag span { font-size:8.5px; color: var(--cy2); letter-spacing:.5px; }
.br-track { flex:1; padding:5px 6px; display:flex; flex-wrap:wrap; gap:5px; align-items:flex-start; min-height:32px; }
.br-empty { font-size:10px; color: var(--dim); }
.br-n { flex:none; width:22px; display:flex; align-items:center; justify-content:center;
  font-size:10px; color: var(--cy2); background: rgba(0,0,0,.3); }

.bp-node { background:#04101c; border:1px solid rgba(54,197,240,.32); border-left:2px solid var(--cy); padding:4px 6px; min-width:150px; }
.bn-top { display:flex; align-items:center; justify-content:space-between; gap:5px; margin-bottom:3px; }
.bn-top b { font-size:10.5px; color: var(--cy2); }
.bn-x { background:none; border:none; color:#ff7a7a; cursor:pointer; font-size:10px; font-family:inherit; padding:0; }
.bn-fields { display:flex; flex-direction:column; gap:2px; }
.bn-f { display:flex; align-items:center; justify-content:space-between; gap:5px; }
.bn-f label { font-size:9px; color: var(--dim); }
.bn-f select, .bn-f input[type=text], .bn-f input[type=number] {
  background:#061626; color: var(--cy2); border:1px solid rgba(54,197,240,.25);
  font-size:9.5px; font-family:inherit; padding:1px 3px; max-width:88px; }
.bn-f input[type=checkbox] { accent-color: var(--cy); }
.bn-none { font-size:9px; color: var(--dim); }

.bp-atoms { max-height:34vh; overflow:auto; }
.bp-ag { margin-bottom:7px; }
.bp-agt { font-size:9.5px; color: var(--dim); margin-bottom:3px; }
.bp-chip { font-family:inherit; font-size:10px; padding:2px 6px; margin:0 3px 3px 0; cursor:pointer;
  background: rgba(54,197,240,.06); border:1px solid rgba(54,197,240,.25); color:#bfdcec; }
.bp-chip:hover:not(:disabled) { background: rgba(54,197,240,.24); border-color: var(--cy); }
.bp-chip:disabled { opacity:.35; cursor:not-allowed; }
.bp-chip.k-alias { border-style:dashed; color: var(--dim); }

.bp-box { display:flex; flex-direction:column; gap:6px; }
.bp-r { display:flex; align-items:center; justify-content:space-between; gap:7px; font-size:10.5px; }
.bp-r label { color: var(--dim); }
.bp-v { color: var(--cy2); font-weight:700; }
.bp-v.tag { background: rgba(54,197,240,.18); padding:1px 6px; font-size:10px; }
.bp-out { font-size:10.5px; color: var(--dim); border:1px dashed rgba(54,197,240,.3);
  padding:5px 7px; background: rgba(54,197,240,.05); }
.bp-out b { color: var(--cy); font-size:12px; }
.bp-ck { display:flex; align-items:center; gap:5px; font-size:10.5px; color: var(--dim); cursor:pointer; }
.bp-ck input { accent-color: var(--cy); }
.bp-note { font-size:9.5px; color: var(--dim); margin:2px 0 0; }

.bp-modes { display:flex; gap:3px; }
.bp-md { flex:1; font-family:inherit; font-size:10px; padding:4px 2px; cursor:pointer;
  background: rgba(54,197,240,.05); border:1px solid rgba(54,197,240,.25); color:#bfdcec; }
.bp-md.on { background: var(--cy); border-color: var(--cy2); color:#04101c; font-weight:700; }
.bp-btns { display:flex; gap:3px; }
.bp-btns button { font-family:inherit; font-size:9.5px; padding:2px 5px; cursor:pointer;
  background: rgba(54,197,240,.14); border:1px solid rgba(54,197,240,.4); color: var(--cy2); }
.bp-btns button:hover { background: rgba(54,197,240,.3); }
.bp-dirs { display:flex; flex-wrap:wrap; gap:3px; }
.bp-d { font-size:9px; padding:1px 5px; background: rgba(255,255,255,.04);
  border:1px solid rgba(255,255,255,.1); color: var(--dim); }
.bp-d.on { border-color: var(--cy); color: var(--cy2); }
.bp-d.has { background: rgba(54,197,240,.24); color:#fff; }
.bp-d i { font-style:normal; margin-left:3px; }
.bp-grid { border:1px solid rgba(54,197,240,.25); padding:5px; background:#040d16; }
</style>
