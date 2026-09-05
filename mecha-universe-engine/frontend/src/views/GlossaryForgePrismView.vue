<template>
  <div class="prism-page">
    <!-- 顶栏 -->
    <header class="pz-head">
      <div class="pz-title">
        <span class="pz-gem"></span>
        <h1>词条锻造 · 棱柱工坊<span class="en-sub">Glossary Forge · Prism Workshop</span></h1>
        <span class="pz-sub">六段式编排 / 射程 / 命中范围<span class="en-sub">Six-phase / Range / Hit Area</span></span>
      </div>
      <div class="pz-actions">
        <button class="pz-btn" @click="forge.createSkill()">＋ 新建词条<span class="en-sub">New</span></button>
        <button class="pz-btn" :disabled="!forge.selectedKey.value" @click="forge.deleteSkill()">✕ 删除<span class="en-sub">Delete</span></button>
        <button class="pz-btn" :disabled="!forge.dirty.value" @click="forge.revert()">↺ 还原<span class="en-sub">Revert</span></button>
        <button class="pz-btn primary" :disabled="forge.saving.value" @click="forge.save()">
          {{ forge.saving.value ? '保存中… Saving…' : '⚙ 保存 Save' }}
          <i v-if="forge.dirty.value" class="dot"></i>
        </button>
      </div>
    </header>

    <!-- 提示条 -->
    <transition name="fade">
      <div v-if="forge.message.value.text" class="pz-toast" :class="forge.message.value.type">
        {{ forge.message.value.text }}
      </div>
    </transition>

    <div class="pz-body">
      <!-- 左：词条列表 -->
      <aside class="pz-col pz-list">
        <h3>词条库<span class="en-sub">Glossary</span> <em>{{ forge.skillKeys.value.length }}</em></h3>
        <div class="pz-search">
          <input v-model="kw" placeholder="搜索词条名 / Name / key" />
        </div>
        <div class="pz-entries">
          <button
            v-for="k in filteredKeys" :key="k"
            class="pz-entry"
            :class="{ on: k === forge.selectedKey.value }"
            @click="forge.select(k)"
          >
            <span class="pe-gem"></span>
            <span class="pe-name">{{ skills[k]?.name || skills[k]?.label || k }}</span>
            <span class="pe-key">{{ k }}</span>
          </button>
          <p v-if="!filteredKeys.length" class="pz-empty">暂无词条，点「新建词条」开始<span class="en-sub">No entries yet — click “New” to start</span></p>
        </div>
      </aside>

      <!-- 中：六段泳道 -->
      <section class="pz-col pz-lanes">
        <h3>六段编排<span class="en-sub">Six-Phase</span> <em v-if="forge.isCore.value" class="core-tip">⚠ 核心技能只读（后端禁止覆盖），请新建词条编辑<span class="en-sub">Core skill is read-only</span></em>
          <em v-else>点选泳道后，从右侧原子面板添加<span class="en-sub">Select a lane, then add atoms from the right panel</span></em></h3>
        <div class="pz-lane-wrap">
          <div
            v-for="lane in forge.lanes.value" :key="lane.key"
            class="pz-lane"
            :class="{ on: activeLane === lane.key }"
            @click="activeLane = lane.key"
          >
            <div class="pl-head">
              <span class="pl-key">{{ lane.key }}</span>
              <span class="pl-name">{{ lane.name }}</span>
              <span class="pl-count">{{ lane.atoms.length }}</span>
            </div>
            <div class="pl-body">
              <div v-for="(a, i) in lane.atoms" :key="a._uid" class="pz-atom">
                <div class="pa-head">
                  <b>{{ a.label }}</b>
                  <button class="pa-del" @click.stop="forge.removeAtom(lane.key, i)">✕</button>
                </div>
                <div v-for="f in a.fields" :key="f.key" class="pa-field">
                  <label :title="f.key">{{ f.label }}</label>
                  <select
                    v-if="f.type === 'select'"
                    :value="a.values[f.key]"
                    @change="forge.setAtomValue(lane.key, i, f.key, $event.target.value)"
                  >
                    <option v-for="o in f.options" :key="optVal(o)" :value="optVal(o)">{{ optLabel(o) }}</option>
                  </select>
                  <input
                    v-else-if="f.type === 'bool'"
                    type="checkbox"
                    :checked="!!a.values[f.key]"
                    @change="forge.setAtomValue(lane.key, i, f.key, $event.target.checked)"
                  />
                  <input
                    v-else-if="f.type === 'number'"
                    type="number"
                    :value="a.values[f.key]"
                    @input="forge.setAtomValue(lane.key, i, f.key, Number($event.target.value))"
                  />
                  <input
                    v-else
                    type="text"
                    :value="a.values[f.key]"
                    @input="forge.setAtomValue(lane.key, i, f.key, $event.target.value)"
                  />
                </div>
                <p v-if="!a.fields.length" class="pa-nofield">（无参数）<span class="en-sub">No params</span></p>
              </div>
              <p v-if="!lane.atoms.length" class="pl-empty">空 · 点此选中后从右侧添加<span class="en-sub">Empty · select this lane to add from the right</span></p>
            </div>
          </div>
        </div>
      </section>

      <!-- 右：原子面板 + 射程 + 命中范围 -->
      <aside class="pz-col pz-side">
        <h3>语义原子<span class="en-sub">Semantic Atoms</span> <em>{{ activeLane ? '→ ' + activeLane : '先选泳道<span class="en-sub">Pick a lane first</span>' }}</em></h3>
        <input v-model="atomKw" class="pz-asearch" placeholder="搜索原子" />
        <div class="pz-atoms">
          <div v-for="g in filteredGroups" :key="g.grp" class="pz-agroup">
            <div class="pz-agtitle">{{ g.title }}<span class="en-sub" v-if="g.enTitle">{{ g.enTitle }}</span></div>
            <button
              v-for="a in g.atoms" :key="a.key"
              class="pz-achip"
              :class="'st-' + a.st"
              :disabled="!activeLane"
              :title="a.effectType"
              @click="forge.addAtom(activeLane, a)"
            >{{ a.label }}<span class="en-sub" v-if="a.enLabel">{{ a.enLabel }}</span></button>
          </div>
        </div>
      </aside>

      <!-- 最右：射程 + 命中范围 -->
      <aside class="pz-col pz-range">
        <!-- 射程 -->
        <h3>射程<span class="en-sub">Range</span> <em>分类基准 + 增量<span class="en-sub">Category base + bonus</span></em></h3>
        <div class="pr-block">
          <div class="pr-row">
            <label>分类<span class="en-sub">Category</span></label>
            <span class="pr-val cat">{{ forge.category.value }}</span>
          </div>
          <div class="pr-row">
            <label>基准射程<span class="en-sub">Base Range</span></label>
            <span class="pr-val">{{ forge.rangeBase.value.max }} 格</span>
          </div>
          <div class="pr-row">
            <label>射程增量 bonus_range</label>
            <input
              type="number" step="1" :value="draft?.bonus_range ?? 0"
              @input="forge.setBonusRange($event.target.value)"
            />
          </div>
          <div class="pr-row">
            <label>最小射程 min_range</label>
            <input
              type="number" step="1" min="0" :value="draft?.min_range ?? 0"
              @input="forge.setMinRange($event.target.value)"
            />
          </div>
          <div class="pr-summary">
            最终射程<span class="en-sub">Final Range</span> <b>{{ forge.rangeFields.value.minRange }} ~ {{ forge.rangeFields.value.maxRange }}</b> 格
          </div>
        </div>

        <!-- 命中范围（AOE + 地图炮 统一） -->
        <h3>命中范围<span class="en-sub">Hit Area</span> <em>{{ forge.hitAreaInfo.value.text }}</em></h3>
        <div class="pr-block">
          <div class="pr-modes">
            <button
              v-for="m in HIT_AREA_MODES" :key="m.value"
              class="pr-mode"
              :class="{ on: forge.hitArea.value.mode === m.value }"
              :title="m.desc"
              @click="forge.setHitAreaMode(m.value)"
            >{{ m.label }}<span class="en-sub">{{ m.enLabel }}</span></button>
          </div>

          <!-- AOE -->
          <template v-if="forge.hitArea.value.mode === 'aoe'">
            <div class="pr-row">
              <label>覆盖半径（格）<span class="en-sub">Spread</span></label>
              <input type="number" min="0" :value="forge.hitArea.value.aoe.spread"
                     @input="forge.setAoeSpread($event.target.value)" />
            </div>
            <div class="pr-row">
              <label>形状<span class="en-sub">Shape</span></label>
              <select :value="forge.hitArea.value.aoe.shape" @change="forge.setAoeShape($event.target.value)">
                <option v-for="s in AOE_SHAPES" :key="s" :value="s">{{ AOE_SHAPES_ZH[s] || s }}<span class="en-sub">{{ s }}</span></option>
              </select>
            </div>
            <div class="pr-row">
              <label>内圈盲区（格）<span class="en-sub">Inner Blind</span></label>
              <input type="number" min="0" :value="forge.hitArea.value.aoe.inner_radius"
                     @input="forge.setAoeInner($event.target.value)" />
            </div>
            <label class="pr-chk">
              <input type="checkbox" :checked="forge.hitArea.value.aoe.friendly_fire"
                     @change="forge.setAoeFriendly($event.target.checked)" />
              波及友军<span class="en-sub">Friendly Fire</span>
            </label>
            <p class="pr-tip">在下方网格点选<b>落点</b>（青色=射程内可选，金色=命中范围）<span class="en-sub">Click a cell to set the impact point (cyan = in range, gold = hit area)</span></p>
          </template>

          <!-- 地图炮 -->
          <template v-else-if="forge.hitArea.value.mode === 'map_cannon'">
            <div class="pr-row">
              <label>编辑方向<span class="en-sub">Direction</span></label>
              <select v-model="activeDir">
                <option v-for="d in MC_DIR_KEYS" :key="d" :value="d">{{ dirLabel(d) }}<span class="en-sub">{{ dirEn(d) }}</span></option>
              </select>
            </div>
            <div class="pr-row">
              <label>快速铺形<span class="en-sub">Quick Fill</span></label>
              <span class="pr-btns">
                <button @click="forge.fillMcShape(activeDir, 'line', 3)">直线<span class="en-sub">Line</span></button>
                <button @click="forge.fillMcShape(activeDir, 'sector', 3, 2)">扇形<span class="en-sub">Sector</span></button>
                <button @click="forge.fillMcShape(activeDir, 'cone', 3)">锥形<span class="en-sub">Cone</span></button>
                <button @click="forge.clearMcDir(activeDir)">清空<span class="en-sub">Clear</span></button>
              </span>
            </div>
            <div class="pr-dirlist">
              <span v-for="d in MC_DIR_KEYS" :key="d" class="pr-dir"
                    :class="{ on: d === activeDir, has: (forge.hitArea.value.mc.directions[d] || []).length }">
                {{ dirLabel(d) }}<span class="en-sub">{{ dirEn(d) }}</span><i v-if="(forge.hitArea.value.mc.directions[d] || []).length">{{ forge.hitArea.value.mc.directions[d].length }}</i>
              </span>
            </div>
            <p class="pr-tip">在下方网格<b>点格</b>增删（金色=已覆盖，高亮=当前方向）<span class="en-sub">Click cells to add/remove (gold = covered, highlight = current direction)</span></p>
          </template>

          <p v-else class="pr-tip">单体命中，不产生范围。切到「范围覆盖」或「定向地图炮」开始编辑。<span class="en-sub">Single-target hit, no area. Switch to “Area” or “Map Cannon” to edit.</span></p>

          <!-- 网格 -->
          <div class="pr-grid">
            <HexHitGrid
              skin="prism"
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
import { HIT_AREA_MODES, AOE_SHAPES, AOE_SHAPES_ZH } from '../battle/glossary/hitAreaModel.js'
import HexHitGrid from '../components/glossary-forge/HexHitGrid.vue'

const forge = useGlossaryForge()
const { skills, draft } = forge

const kw      = ref('')
const atomKw  = ref('')
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

const DIR_CN = { right:'正右', rightdown:'右下', leftdown:'左下', left:'正左', leftup:'左上', rightup:'右上' }
const DIR_EN = { right:'Right', rightdown:'Down-Right', leftdown:'Down-Left', left:'Left', leftup:'Up-Left', rightup:'Up-Right' }
function dirLabel(d) { return DIR_CN[d] || d }
function dirEn(d) { return DIR_EN[d] || d }

function onPick({ q, r }) {
  if (forge.hitArea.value.mode === 'aoe') {
    const c = forge.hitArea.value.aoe.center
    if (c && c.q === q && c.r === r) forge.setAoeCenter(null, null)  // 再点取消
    else forge.setAoeCenter(q, r)
  } else if (forge.hitArea.value.mode === 'map_cannon') {
    forge.toggleMcCell(activeDir.value, q, r)
  }
}

onMounted(() => forge.load())
</script>

<style scoped>
.prism-page {
  --gold: #ffb000; --gold-2: #ffd597; --deep: #0a1628;
  min-height: 100vh; padding: 18px 20px 40px; color: #cfe6ff;
  background: radial-gradient(1200px 620px at 78% -12%, #1d2a44 0%, #0a1628 55%), #0a1628;
  font-family: -apple-system, "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
}

/* 顶栏 */
.pz-head { display:flex; align-items:center; justify-content:space-between; gap:16px;
  padding: 12px 18px; border-radius: 14px; margin-bottom: 14px;
  background: linear-gradient(180deg, rgba(255,176,0,.10), rgba(10,22,40,.6));
  border: 1px solid rgba(255,176,0,.32); }
.pz-title { display:flex; align-items:center; gap:12px; }
.pz-gem { width:20px; height:23px; background: linear-gradient(150deg, var(--gold), #8a5e00);
  clip-path: polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%); }
.pz-title h1 { font-size:18px; margin:0; letter-spacing:1px; color:#fff; }
.pz-sub { font-size:11.5px; color: var(--gold-2); opacity:.85; }
.pz-actions { display:flex; gap:8px; }
.pz-btn { position:relative; background: rgba(54,197,240,.1); border:1px solid rgba(54,197,240,.4);
  color:#cdeefb; padding:7px 13px; border-radius:9px; font-size:12.5px; cursor:pointer; transition:.15s; }
.pz-btn:hover:not(:disabled) { background: rgba(54,197,240,.22); }
.pz-btn:disabled { opacity:.4; cursor:not-allowed; }
.pz-btn.primary { background: linear-gradient(180deg, var(--gold), #c48400); border-color: var(--gold-2);
  color:#1a1020; font-weight:700; }
.pz-btn.primary:hover:not(:disabled) { filter: brightness(1.12); }
.pz-btn .dot { position:absolute; top:4px; right:5px; width:6px; height:6px; border-radius:50%; background:#ff3b7c; }

/* 提示 */
.pz-toast { position:fixed; top:16px; left:50%; transform:translateX(-50%); z-index:99;
  padding:9px 18px; border-radius:9px; font-size:12.5px; box-shadow:0 6px 20px rgba(0,0,0,.5); }
.pz-toast.ok  { background: rgba(19,255,67,.16);  border:1px solid rgba(19,255,67,.5);  color:#9bffb4; }
.pz-toast.err { background: rgba(255,59,124,.16); border:1px solid rgba(255,59,124,.5); color:#ffb0c8; }
.fade-enter-from, .fade-leave-to { opacity:0; transform:translate(-50%,-8px); }
.fade-enter-active, .fade-leave-active { transition:.25s; }

/* 主体四栏 */
.pz-body { display:grid; grid-template-columns: 210px minmax(330px,1fr) 260px 320px; gap:12px; align-items:start; }
.pz-col { background: rgba(14,22,34,.72); border:1px solid rgba(255,176,0,.20);
  border-radius:13px; padding:12px; }
.pz-col h3 { font-size:12px; color: var(--gold); margin:0 0 9px; letter-spacing:.6px;
  border-bottom:1px solid rgba(255,176,0,.22); padding-bottom:7px; display:flex; gap:6px; align-items:baseline; }
.pz-col h3 em { font-style:normal; font-size:10px; color: var(--gold-2); opacity:.7; font-weight:400; }
.core-tip { color:#ffb0c8 !important; opacity:1 !important; }

/* 词条列表 */
.pz-search input, .pz-asearch { width:100%; background:#0c1322; border:1px solid rgba(255,176,0,.22);
  color:#cfe6ff; border-radius:7px; padding:5px 8px; font-size:11.5px; margin-bottom:8px; }
.pz-entries { display:flex; flex-direction:column; gap:5px; max-height:62vh; overflow:auto; }
.pz-entry { display:flex; align-items:center; gap:7px; padding:6px 8px; border-radius:8px; cursor:pointer;
  background: rgba(255,255,255,.03); border:1px solid transparent; text-align:left; transition:.15s; }
.pz-entry:hover { background: rgba(255,176,0,.12); }
.pz-entry.on { background: rgba(255,176,0,.20); border-color: var(--gold); }
.pe-gem { width:11px; height:13px; flex:none; background: linear-gradient(150deg, var(--gold), #8a5e00);
  clip-path: polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%); }
.pe-name { font-size:11.5px; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.pe-key  { font-size:9.5px; color: var(--gold-2); opacity:.65; }
.pz-empty { font-size:11px; color:#7fa8c8; text-align:center; padding:14px 0; }

/* 泳道 */
.pz-lane-wrap { display:flex; flex-direction:column; gap:8px; max-height:72vh; overflow:auto; }
.pz-lane { border:1px solid rgba(255,176,0,.18); border-radius:10px; overflow:hidden; cursor:pointer; transition:.15s; }
.pz-lane.on { border-color: var(--gold); box-shadow:0 0 0 1px rgba(255,176,0,.35); }
.pl-head { display:flex; align-items:center; gap:8px; padding:6px 10px;
  background: linear-gradient(90deg, rgba(255,176,0,.16), rgba(255,176,0,.04)); }
.pl-key { font-size:10.5px; font-weight:800; color:#1a1020; background: var(--gold);
  padding:1px 6px; border-radius:4px; letter-spacing:.5px; }
.pl-name { font-size:11px; color: var(--gold-2); flex:1; }
.pl-count { font-size:10px; color:#fff; background: rgba(0,0,0,.35); padding:1px 6px; border-radius:9px; }
.pl-body { padding:7px; display:flex; flex-direction:column; gap:6px; min-height:34px; }
.pl-empty { font-size:10.5px; color:#6b7a8f; font-style:italic; padding:4px 2px; margin:0; }

.pz-atom { background:#0e1824; border:1px solid #2b3a4a; border-left:3px solid var(--gold);
  border-radius:7px; padding:6px 8px; }
.pa-head { display:flex; align-items:center; justify-content:space-between; gap:6px; margin-bottom:4px; }
.pa-head b { font-size:11px; color: var(--gold-2); }
.pa-del { background:none; border:none; color:#ff8a80; cursor:pointer; font-size:11px; padding:0 2px; }
.pa-field { display:flex; align-items:center; justify-content:space-between; gap:6px; margin-top:3px; }
.pa-field label { font-size:10px; color:#9fb0c4; flex:1; }
.pa-field select, .pa-field input[type=text], .pa-field input[type=number] {
  background:#0f131c; color:#c1e8ff; border:1px solid rgba(255,176,0,.25);
  border-radius:4px; padding:2px 4px; font-size:10px; max-width:130px; }
.pa-field input[type=checkbox] { accent-color: var(--gold); }
.pa-nofield { font-size:10px; color:#6b7a8f; margin:2px 0 0; }

/* 原子面板 */
.pz-atoms { max-height:66vh; overflow:auto; }
.pz-agroup { margin-bottom:9px; }
.pz-agtitle { font-size:10px; color: var(--gold-2); opacity:.8; margin-bottom:4px; }
.pz-achip { display:inline-block; font-size:10.5px; padding:3px 7px; margin:0 4px 4px 0;
  border-radius:6px; cursor:pointer; border:1px solid #2b3a4a; background:#0e1824; color:#cfe6ff; }
.pz-achip:hover:not(:disabled) { background: rgba(255,176,0,.2); border-color: var(--gold); }
.pz-achip:disabled { opacity:.4; cursor:not-allowed; }
.pz-achip.st-alias { border-style:dashed; color:#9fd6ee; }

/* 射程 / 命中范围 */
.pr-block { display:flex; flex-direction:column; gap:7px; }
.pr-row { display:flex; align-items:center; justify-content:space-between; gap:8px; font-size:11px; }
.pr-row label { color:#9fb0c4; }
.pr-row input, .pr-row select { background:#0f131c; color:#c1e8ff; border:1px solid rgba(255,176,0,.25);
  border-radius:4px; padding:2px 5px; font-size:10.5px; width:110px; }
.pr-val { color: var(--gold-2); font-weight:600; }
.pr-val.cat { background: rgba(255,176,0,.18); padding:1px 7px; border-radius:5px; font-size:10.5px; }
.pr-summary { font-size:11px; color:#9fb0c4; background: rgba(255,176,0,.08);
  border:1px dashed rgba(255,176,0,.3); border-radius:7px; padding:6px 8px; text-align:center; }
.pr-summary b { color: var(--gold); font-size:13px; }
.pr-chk { display:flex; align-items:center; gap:6px; font-size:11px; color:#9fb0c4; cursor:pointer; }
.pr-chk input { accent-color: var(--gold); }
.pr-tip { font-size:10.5px; color:#7fa8c8; line-height:1.6; margin:2px 0 0; }
.pr-tip b { color: var(--gold-2); }

.pr-modes { display:flex; gap:5px; }
.pr-mode { flex:1; font-size:10.5px; padding:5px 4px; border-radius:7px; cursor:pointer;
  background: rgba(255,255,255,.04); border:1px solid rgba(255,176,0,.22); color:#cfe6ff; }
.pr-mode.on { background: var(--gold); border-color: var(--gold-2); color:#1a1020; font-weight:700; }
.pr-btns { display:flex; gap:4px; }
.pr-btns button { font-size:10px; padding:3px 6px; border-radius:5px; cursor:pointer;
  background: rgba(255,176,0,.14); border:1px solid rgba(255,176,0,.4); color: var(--gold-2); }
.pr-btns button:hover { background: rgba(255,176,0,.28); }
.pr-dirlist { display:flex; flex-wrap:wrap; gap:4px; }
.pr-dir { font-size:9.5px; padding:2px 6px; border-radius:5px; background: rgba(255,255,255,.04);
  border:1px solid rgba(255,255,255,.1); color:#8fa4bc; }
.pr-dir.on { border-color: var(--gold); color: var(--gold-2); }
.pr-dir.has { background: rgba(255,176,0,.2); color:#fff; }
.pr-dir i { font-style:normal; margin-left:3px; opacity:.8; }
.pr-grid { border:1px solid rgba(255,176,0,.2); border-radius:9px; padding:6px; background:#080f1c; }

@media (max-width: 1500px) {
  .pz-body { grid-template-columns: 190px minmax(280px,1fr) 230px 300px; }
}
</style>
