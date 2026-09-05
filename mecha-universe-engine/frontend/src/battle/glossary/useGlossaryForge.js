// ================================================================
// battle/glossary/useGlossaryForge.js
// 六段式词条编辑器内核（与界面皮肤解耦；两套视觉风格的页面共用这一份逻辑）
//
// 数据流：
//   glossaryAPI.getConfig()  →  skills{ key: Skill }
//         ↓ select(key)
//       draft（深拷贝副本，脱离响应式源）
//         ↓ 投影
//   lanes(六段泳道) + range(射程) + hitArea(命中范围)
//         ↓ save()
//   反写回 draft → glossaryAPI.saveConfig({ glossary:{ skills } })
//
// 红线遵守：
//   - 射程只用「分类基准 + bonus_range」加法模型（shared-kernel 口径），
//     绝不写 cast_range / max_range / range 等绝对字段。
//   - effectType 必须是引擎 handler 真名，不用 UI 分类名。
//   - 命中范围统一走 hitAreaModel（AOE 与地图炮合并）。
// ================================================================

import { ref, computed, reactive } from 'vue'
import { glossaryAPI } from '@/api/client.js'
import {
  LANE_SKELETON, createEmptyLanes, phaseOfEffect, MC_DIR_KEYS
} from './laneSkeleton.js'
import { atomGroups, ALL_ATOMS, atomByKey } from './atomGroups.js'
import {
  createEmptyHitArea, normalizeHitArea, serializeHitArea,
  hitAreaSummary, HIT_AREA_CANVAS_ORIGIN
} from './hitAreaModel.js'
import {
  getSkillRangeFields, resolveSkillCategory,
  DEFAULT_RANGE_BY_CATEGORY, DEFAULT_MIN_RANGE_BY_CATEGORY
} from '../../utils/hexUtils.js'

function deepClone(v) { return JSON.parse(JSON.stringify(v)) }
function uid() { return 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7) }

/** 按 atom_key → type(语义名) → effectType 顺序查找原子定义（对齐 GlossaryStudio findAtomDef L1150-1170） */
function findAtomDef(type, atomKey) {
  if (atomKey) { const a = atomByKey(atomKey); if (a) return a }
  if (type) {
    let a = atomByKey(type)
    if (a) return a
    a = ALL_ATOMS.find(x => x.effectType === type) || null
    if (a) return a
  }
  return null
}

/** 契约原子 { type, atom_key, ...params } → 编辑器原子实例（对齐 contractToAtom L1171-1189） */
function contractToAtom(e) {
  const def = findAtomDef(e.type, e.atom_key)
  const fields = (def && def.fields) || []
  const values = {}
  fields.forEach(f => { values[f.key] = (e && e[f.key] !== undefined) ? e[f.key] : f.default })
  // 伤害族回读：flat_value 反投影回 value（若该原子定义用的是 value）
  if (e && e.flat_value !== undefined && fields.some(f => f.key === 'value') && values.value === undefined) {
    values.value = e.flat_value
  }
  return {
    _uid: uid(),
    grp: (def && def.grp) || 'X',
    key: (def && def.key) || e.atom_key || e.type,
    label: (def && def.label) || e.type,
    effectType: (def && def.effectType) || e.type,
    fields,
    values
  }
}

/** 编辑器原子实例 → 契约原子（对齐 atomToContract L1460-1472）*/
function atomToContract(a) {
  const p = { ...(a.values || {}) }
  const t = a.effectType
  // 伤害族：编辑器 value 语义统一落到引擎认的 flat_value
  if ((t === 'direct_damage' || t === 'damage' || t === 'direct_damage_split')
      && p.value !== undefined && p.flat_value === undefined) {
    p.flat_value = p.value
    delete p.value
  }
  return { type: t, atom_key: a.key, ...p }
}

/** 后端硬编码的核心技能（glossary.ts CORE_SKILLS）：不可覆盖、不可删除 */
export const CORE_SKILL_KEYS = [
  'melee_strike', 'ranged_shot', 'shield_wall', 'repair', 'overdrive', 'beam_cannon'
]
function isCoreKey(k) { return CORE_SKILL_KEYS.includes(k) }

/** 空词条模板（字段对齐后端 normalizeSkillForSave 落库口径）*/
function blankSkill(key) {
  return {
    key: key || 'new_entry',
    name: key || '新词条',
    label: key || '新词条',
    entryType: 'skill',
    description: '',
    category: 'melee',          // melee / ranged / auto —— 射程基准来源
    type: 'melee',
    action_type: ['attack'],
    ap_cost: 1,
    target: { type: 'SINGLE_ENEMY', filter: { unit_types: [], status: 'none' } },
    timing: { trigger: 'manual' },
    roll: { mode: 'none' },
    cost: { ap: 1 },
    effects: [],
    tree: [],
    schema_version: 2,
    // 射程：加法模型（分类基准 + bonus_range），绝不写 cast_range/max_range
    min_range: 1,
    bonus_range: 0,
    // 命中范围（统一模型）
    aoe: { center: null, spread: 0, radius: 0 },
    map_cannon: { directions: {} }
  }
}

export function useGlossaryForge() {
  const skills      = ref({})
  const selectedKey = ref('')
  const draft       = ref(null)
  const lanes       = ref(createEmptyLanes())
  const hitArea     = ref(createEmptyHitArea())
  const loading     = ref(false)
  const saving      = ref(false)
  const dirty       = ref(false)
  const message     = ref({ type: '', text: '' })

  const skillKeys = computed(() => Object.keys(skills.value || {}))

  /** 当前词条分类（melee / ranged / auto） */
  const category = computed(() => resolveSkillCategory(draft.value || {}) || 'melee')

  /** 射程字段（共享内核加法模型：base + bonus） */
  const rangeFields = computed(() => getSkillRangeFields(draft.value || {}))

  /** 分类基准值（只读展示用） */
  const rangeBase = computed(() => ({
    max: Number(DEFAULT_RANGE_BY_CATEGORY[category.value] ?? 1),
    min: Number(DEFAULT_MIN_RANGE_BY_CATEGORY[category.value] ?? 1)
  }))

  const hitAreaInfo = computed(() => hitAreaSummary(hitArea.value))

  // ---------- 通知 ----------
  let msgTimer = null
  function notify(type, text) {
    message.value = { type, text }
    clearTimeout(msgTimer)
    msgTimer = setTimeout(() => { message.value = { type: '', text: '' } }, 2600)
  }

  // ---------- 载入 ----------
  async function load() {
    loading.value = true
    try {
      const { data } = await glossaryAPI.getConfig()
      // 后端返回 { success, glossary: { version, is_public, review_status, skills }, ... }
      const raw = data?.glossary?.skills || data?.config?.glossary?.skills || data?.skills || {}
      skills.value = raw || {}
      if (!selectedKey.value && skillKeys.value.length) select(skillKeys.value[0])
      notify('ok', `已载入 ${skillKeys.value.length} 个词条`)
    } catch (e) {
      notify('err', '载入失败：' + (e?.message || e))
    } finally {
      loading.value = false
    }
  }

  // ---------- 选中：把词条投影成 泳道 / 射程 / 命中范围 ----------
  function select(key) {
    if (!key || !skills.value[key]) return
    selectedKey.value = key
    const d = deepClone(skills.value[key])
    d.skill_key = key
    if (!d.effects) d.effects = []
    if (!d.target) d.target = { type: 'SINGLE_ENEMY', filter: { unit_types: [], status: [] } }
    draft.value = d
    projectToLanes()
    hitArea.value = normalizeHitArea(d)
    dirty.value = false
  }

  /**
   * 词条 → 六段泳道。
   * 双形态兼容（对齐 GlossaryStudio initLanesFromDraft L1219-1258）：
   *   A) schema_version=2 + tree[]：段树回读（保真往返，含分支子链）
   *   B) 旧式扁平：effects[] + timing/conditions/roll/target 派生
   */
  function projectToLanes() {
    const ls = createEmptyLanes()
    const d = draft.value
    if (!d) { lanes.value = ls; return }

    const isV2 = Number(d.schema_version) === 2 && Array.isArray(d.tree) && d.tree.length

    if (isV2) {
      d.tree.forEach(n => {
        if (!n || !n.phase) return
        const lane = ls.find(l => l.key === n.phase) || ls.find(l => l.key === 'DO')
        ;(n.atoms || []).forEach(e => lane.atoms.push(contractToAtom(e)))
        // 分支：分支自身 atoms + 分支内六段子链（subLanes / children 两种形态）
        ;(n.branches || []).forEach(b => {
          (b.atoms || []).forEach(e => lane.atoms.push(contractToAtom(e)))
          const subs = b.subLanes || b.children || []
          subs.forEach(sl => {
            const sub = ls.find(l => l.key === (sl.key || sl.phase)) || lane
            ;(sl.atoms || []).forEach(e => sub.atoms.push(contractToAtom(e)))
          })
        })
        // 嵌套子链（nest/children）
        ;(n.children || n.nest?.atoms ? [n.nest || n] : []).forEach(() => {})
        if (n.nest && Array.isArray(n.nest.atoms)) {
          n.nest.atoms.forEach(e => lane.atoms.push(contractToAtom(e)))
        }
      })
    } else {
      // 旧式扁平：effects 归段
      ;(d.effects || []).forEach(e => {
        const def = findAtomDef(e.type, e.atom_key || e.key)
        const ph = def ? phaseOfEffect(def.effectType, def.grp) : 'DO'
        const lane = ls.find(l => l.key === ph) || ls.find(l => l.key === 'DO')
        lane.atoms.push(contractToAtom(e))
      })
      // WHO：d.target.type → DO 段首原子（对齐「WHO 并入 DO」规范）
      if (d.target && d.target.type) {
        const doLane = ls.find(l => l.key === 'DO')
        const want = 'target_' + String(d.target.type).toLowerCase()
        const whoDef = atomByKey(want)
          || ALL_ATOMS.find(a => a.effectType === 'target_selection'
               && String(a.fields?.[0]?.default || '') === d.target.type)
        if (whoDef && doLane) {
          doLane.atoms.unshift(contractToAtom({ type: whoDef.effectType, atom_key: whoDef.key, target_type: d.target.type }))
        }
      }
    }
    lanes.value = ls
  }

  // ---------- 新建 / 删除 ----------
  function createSkill() {
    let key = 'new_entry'
    let n = 1
    while (skills.value[key]) key = `new_entry_${n++}`
    skills.value = { ...skills.value, [key]: blankSkill(key) }
    select(key)
    dirty.value = true
    notify('ok', `已新建词条「${key}」（可直接编辑并保存）`)
  }

  function deleteSkill() {
    const key = selectedKey.value
    if (!key || !skills.value[key]) return
    if (isCoreKey(key)) { notify('err', `「${key}」是核心技能，后端禁止删除`); return }
    const rest = { ...skills.value }
    delete rest[key]
    skills.value = rest
    selectedKey.value = ''
    draft.value = null
    lanes.value = createEmptyLanes()
    hitArea.value = createEmptyHitArea()
    dirty.value = true
    notify('ok', `已删除「${key}」（记得保存）`)
  }

  // ---------- 原子增删 ----------
  function addAtom(phaseKey, atomDef) {
    const lane = lanes.value.find(l => l.key === phaseKey)
    if (!lane || !atomDef) return
    const values = {}
    ;(atomDef.fields || []).forEach(f => { values[f.key] = f.default })
    lane.atoms.push({
      _uid: `a${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      grp: atomDef.grp,
      key: atomDef.key,
      label: atomDef.label,
      effectType: atomDef.effectType,
      fields: atomDef.fields || [],
      values
    })
    dirty.value = true
  }

  function removeAtom(phaseKey, idx) {
    const lane = lanes.value.find(l => l.key === phaseKey)
    if (!lane) return
    lane.atoms.splice(idx, 1)
    dirty.value = true
  }

  function setAtomValue(phaseKey, idx, fieldKey, val) {
    const lane = lanes.value.find(l => l.key === phaseKey)
    if (!lane || !lane.atoms[idx]) return
    lane.atoms[idx].values[fieldKey] = val
    dirty.value = true
  }

  // ---------- 射程编辑（加法模型）----------
  function setBonusRange(v) {
    if (!draft.value) return
    draft.value.bonus_range = Number(v) || 0
    dirty.value = true
  }
  function setMinRange(v) {
    if (!draft.value) return
    draft.value.min_range = Number(v) || 0
    dirty.value = true
  }

  // ---------- 命中范围编辑 ----------
  function setHitAreaMode(mode) {
    hitArea.value.mode = mode
    dirty.value = true
  }
  function setAoeSpread(v) {
    hitArea.value.aoe.spread = Number(v) || 0
    hitArea.value.aoe.radius = hitArea.value.aoe.spread
    dirty.value = true
  }
  function setAoeShape(v) { hitArea.value.aoe.shape = v; dirty.value = true }
  function setAoeInner(v) { hitArea.value.aoe.inner_radius = Number(v) || 0; dirty.value = true }
  function setAoeFriendly(v) { hitArea.value.aoe.friendly_fire = !!v; dirty.value = true }
  function setAoeCenter(q, r) {
    hitArea.value.aoe.center = (q === null || q === undefined)
      ? null
      : { q: Number(q), r: Number(r) }
    dirty.value = true
  }
  /** 切换地图炮某一向的格子（点击画布格时调用，自动去重） */
  function toggleMcCell(dir, q, r) {
    if (!hitArea.value.mc.directions[dir]) hitArea.value.mc.directions[dir] = []
    const list = hitArea.value.mc.directions[dir]
    const i = list.findIndex(c => c.q === Number(q) && c.r === Number(r))
    if (i >= 0) list.splice(i, 1)
    else list.push({ q: Number(q), r: Number(r) })
    if (!list.length) delete hitArea.value.mc.directions[dir]
    dirty.value = true
  }
  function clearMcDir(dir) {
    delete hitArea.value.mc.directions[dir]
    dirty.value = true
  }
  /** 用预设形状快速铺满某一向（line / sector / cone） */
  function fillMcShape(dir, shape, length = 3, width = 1) {
    const cells = []
    const STEP = {
      right:     [1, 0],  rightdown: [0, 1],  leftdown: [-1, 1],
      left:      [-1, 0], leftup:    [0, -1], rightup:  [1, -1]
    }[dir] || [1, 0]
    if (shape === 'line') {
      for (let i = 1; i <= length; i++) cells.push({ q: STEP[0] * i, r: STEP[1] * i })
    } else if (shape === 'sector') {
      for (let i = 1; i <= length; i++) {
        for (let w = 0; w < width; w++) cells.push({ q: STEP[0] * i + w, r: STEP[1] * i })
      }
    } else if (shape === 'cone') {
      for (let i = 1; i <= length; i++) {
        for (let w = -i; w <= i; w++) cells.push({ q: STEP[0] * i, r: STEP[1] * i + w })
      }
    }
    hitArea.value.mc.directions[dir] = cells
    dirty.value = true
  }

  // ---------- 保存 ----------
  /**
   * 泳道 + 命中范围 → 反写回 draft。
   * 双写（对齐 GlossaryStudio syncLanesToDraft，产物为「双形」）：
   *   1) d.tree + d.schema_version=2 —— 递归段树，供 skillExecutor._walkPhaseTree 消费
   *   2) d.effects —— v1 扁平投影，保持存量引擎路径与旧读端不破坏
   */
  function collectToDraft() {
    if (!draft.value) return
    const effs = []
    const tree = []
    lanes.value.forEach(lane => {
      // 过滤未识别原子与 target_selection（WHO 单独落到 d.target.type）
      const atoms = lane.atoms
        .filter(a => a.effectType && a.effectType !== 'unknown' && a.effectType !== 'target_selection')
        .map(atomToContract)
      tree.push({ phase: lane.key, atoms, branches: [] })
      atoms.forEach(a => effs.push(a))
    })
    draft.value.effects = effs
    draft.value.tree = tree
    draft.value.schema_version = 2

    // WHO：DO 段第一个 target_selection 原子 → draft.target.type
    const doLane = lanes.value.find(l => l.key === 'DO')
    const who = doLane?.atoms.find(a => a.effectType === 'target_selection')
    if (who?.values?.target_type) {
      draft.value.target = { ...(draft.value.target || {}), type: who.values.target_type }
    }
    // 命中范围（统一模型反写）
    Object.assign(draft.value, serializeHitArea(hitArea.value))
  }

  async function save() {
    if (!draft.value || !selectedKey.value) return
    if (isCoreKey(selectedKey.value)) {
      notify('err', `「${selectedKey.value}」是核心技能，后端禁止覆盖；请新建词条后再保存`)
      return
    }
    saving.value = true
    try {
      collectToDraft()
      const key = selectedKey.value
      const payload = deepClone(draft.value)
      delete payload.skill_key
      skills.value = { ...skills.value, [key]: payload }
      // ★ 后端 POST /config 读的是 req.body.skills（见 glossary.ts L288），
      //   不是 { glossary: { skills } }，写错会静默不落库。
      const { data } = await glossaryAPI.saveConfig({ skills: skills.value })
      if (data && data.success === false) throw new Error(data.error || '保存失败')
      dirty.value = false
      notify('ok', `「${key}」已保存`)
    } catch (e) {
      notify('err', '保存失败：' + (e?.message || e))
    } finally {
      saving.value = false
    }
  }

  /** 放弃修改，重新从 skills 投影 */
  function revert() {
    if (selectedKey.value) select(selectedKey.value)
    notify('ok', '已还原为上次保存的内容')
  }

  return {
    // 数据
    skills, selectedKey, draft, lanes, hitArea,
    loading, saving, dirty, message,
    skillKeys, category, rangeFields, rangeBase, hitAreaInfo,
    // 常量（供模板使用）
    LANE_SKELETON, atomGroups, ALL_ATOMS, MC_DIR_KEYS, HIT_AREA_CANVAS_ORIGIN,
    CORE_SKILL_KEYS, isCoreKey,
    isCore: computed(() => isCoreKey(selectedKey.value)),
    // 行为
    load, select, createSkill, deleteSkill,
    addAtom, removeAtom, setAtomValue,
    setBonusRange, setMinRange,
    setHitAreaMode, setAoeSpread, setAoeShape, setAoeInner,
    setAoeFriendly, setAoeCenter, toggleMcCell, clearMcDir, fillMcShape,
    save, revert, collectToDraft
  }
}
