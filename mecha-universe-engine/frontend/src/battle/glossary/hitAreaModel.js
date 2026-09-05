// ================================================================
// battle/glossary/hitAreaModel.js
// ★「命中范围」统一模型：把原有的 AOE 与 地图炮(map_cannon) 两类编辑合并为单一结构
// 依据：
//   - 落库结构   GlossaryStudio.vue L532-540（syncRangeToSkill）
//   - 读回结构   GlossaryStudio.vue L482-518（buildRangeFromSkill，兼容对象/数组双形态）
//   - 画布原点   HexCanvasEditor.vue L109-112  UNIT_ORIGIN = {q:9, r:9}（19×19 网格正中心 = 施法者）
//   - 方向编码   services/combat-service/.../skillExecutor.cjs L174-176 DIR_MAP（1~6 顺时针）
// 纯函数、无状态。
// ================================================================

import { MC_DIR_KEYS } from './laneSkeleton.js'

/** 画布正中心 = 施法者所在格；落库时 AOE 中心需减掉它转成相对偏移 */
export const HIT_AREA_CANVAS_ORIGIN = { q: 9, r: 9 }

/** 命中范围模式：无 / 范围覆盖(AOE) / 地图炮(定向齐射) */
export const HIT_AREA_MODES = [
  { value: 'none',       label: '无',        enLabel: 'None',       desc: '单体，不产生范围 / Single target, no area' },
  { value: 'aoe',        label: '范围覆盖',   enLabel: 'Area',       desc: '在射程内选落点，按半径展开 / Pick a point in range, expand by radius' },
  { value: 'map_cannon', label: '定向地图炮', enLabel: 'Map Cannon', desc: '以自身为原点，按六向齐射 / Six-way volley from self' }
]

/** 方向字符串键 → 引擎数字键（顺时针：正右=1 … 右上=6） */
export const MC_DIR_TO_NUM = {
  right: 1, rightdown: 2, leftdown: 3, left: 4, leftup: 5, rightup: 6
}

/** 数字键 → 方向字符串键（反查） */
export const MC_NUM_TO_DIR = Object.fromEntries(
  Object.entries(MC_DIR_TO_NUM).map(([k, v]) => [v, k])
)

export const AOE_SHAPES = ['circle', 'ring', 'line', 'sector', 'cone', 'custom']
/** AOE 形状中文名（英文原值见 AOE_SHAPES；UI 双语：中文为主 + 英文 .en-sub 副标） */
export const AOE_SHAPES_ZH = { circle:'圆形', ring:'环形', line:'线形', sector:'扇形', cone:'锥形', custom:'自定义' }
export const MC_SHAPES  = ['line', 'sector', 'cone', 'custom']

/** 新建一个空的命中范围对象 */
export function createEmptyHitArea() {
  return {
    mode: 'none',
    aoe: {
      center: null,        // {q,r} 画布绝对坐标（含 origin）
      spread: 2,           // 覆盖半径（格）
      radius: 2,           // 兼容旧字段，与 spread 同义
      shape: 'circle',
      direction: 'none',
      inner_radius: 0,
      friendly_fire: false
    },
    mc: { directions: {} } // { right:[{q,r}], rightdown:[...], ... } 相对施法者的偏移格
  }
}

function num(v, d = 0) {
  const n = Number(v)
  return Number.isFinite(n) ? n : d
}

/**
 * 从词条对象读取命中范围，统一成 createEmptyHitArea() 的结构。
 * 兼容 directions 为「对象 {right:[...]}」或「数组 [{dir,cells}]」两种形态。
 */
export function normalizeHitArea(skill) {
  const out = createEmptyHitArea()
  if (!skill) return out

  const aoeSrc = skill.aoe || {}
  const mcSrc = (skill.map_cannon && skill.map_cannon.directions)
    || (skill.range && skill.range.mcShapes)
    || null

  // ---- AOE ----
  const hasAoe = aoeSrc && (aoeSrc.center || num(aoeSrc.spread) > 0 || num(aoeSrc.radius) > 0)
  if (hasAoe) {
    out.aoe.spread = num(aoeSrc.spread, num(aoeSrc.radius, 0))
    out.aoe.radius = out.aoe.spread
    out.aoe.shape = aoeSrc.shape || 'circle'
    out.aoe.direction = aoeSrc.direction || 'none'
    out.aoe.inner_radius = num(aoeSrc.inner_radius, 0)
    out.aoe.friendly_fire = !!aoeSrc.friendly_fire
    if (aoeSrc.center) {
      // ★ aoe.center 落库为「画布绝对坐标」（实测：block 词条存 {q:8,r:8} 即施法者(9,9)左上邻格）。
      //   转相对偏移是后端 skillExecutor.cjs L212 的事：aoe_center = center - 9。
      //   故此处原样读取，不做 +9 还原。
      out.aoe.center = { q: num(aoeSrc.center.q), r: num(aoeSrc.center.r) }
    }
  }

  // ---- 地图炮 ----
  const dirs = {}
  if (mcSrc && !Array.isArray(mcSrc)) {
    MC_DIR_KEYS.forEach(k => {
      const cells = mcSrc[k]
      if (Array.isArray(cells) && cells.length) dirs[k] = cells.map(c => ({ q: num(c.q), r: num(c.r) }))
      // 兼容数字键形态
      const byNum = mcSrc[MC_DIR_TO_NUM[k]]
      if (!dirs[k] && Array.isArray(byNum) && byNum.length) dirs[k] = byNum.map(c => ({ q: num(c.q), r: num(c.r) }))
    })
  } else if (Array.isArray(mcSrc)) {
    mcSrc.forEach(entry => {
      const key = MC_NUM_TO_DIR[entry.dir] || entry.dir
      if (key && Array.isArray(entry.cells) && entry.cells.length) {
        dirs[key] = entry.cells.map(c => ({ q: num(c.q), r: num(c.r) }))
      }
    })
  }
  out.mc.directions = dirs

  // ---- 模式推断 ----
  const mcCount = Object.keys(dirs).length
  if (mcCount > 0) out.mode = 'map_cannon'
  else if (hasAoe) out.mode = 'aoe'
  else out.mode = 'none'

  return out
}

/**
 * 把命中范围反写回词条字段（可直接 Object.assign 到 draft 上）。
 * 注意：AOE 中心落库时减 HIT_AREA_CANVAS_ORIGIN 转相对偏移（与后端 L212 口径一致）。
 */
export function serializeHitArea(hitArea) {
  const ha = hitArea || createEmptyHitArea()
  const patch = {}

  if (ha.mode === 'aoe') {
    const c = ha.aoe.center
    patch.aoe = {
      // 原样落库为画布绝对坐标（相对偏移由后端转）
      center: c ? { q: num(c.q), r: num(c.r) } : null,
      radius: num(ha.aoe.spread, num(ha.aoe.radius, 0)),
      spread: num(ha.aoe.spread, num(ha.aoe.radius, 0)),
      shape: ha.aoe.shape || 'circle',
      direction: ha.aoe.direction || 'none',
      inner_radius: num(ha.aoe.inner_radius, 0),
      friendly_fire: !!ha.aoe.friendly_fire
    }
  }

  if (ha.mode === 'map_cannon') {
    const out = {}
    MC_DIR_KEYS.forEach(k => {
      const cells = (ha.mc && ha.mc.directions && ha.mc.directions[k]) || []
      if (cells.length) out[k] = cells.map(c => ({ q: num(c.q), r: num(c.r) }))
    })
    patch.map_cannon = { directions: out }
    // 同步一份数字键形态，供后端 skillExecutor 的 native mcShapes 分支直读
    const numShape = {}
    Object.entries(out).forEach(([k, cells]) => { numShape[MC_DIR_TO_NUM[k]] = cells })
    patch.range = { mcShapes: numShape }
  }

  if (ha.mode === 'none') {
    patch.aoe = { center: null, radius: 0, spread: 0 }
    patch.map_cannon = { directions: {} }
  }

  return patch
}

/** 统计当前命中范围信息，用于 UI 摘要 */
export function hitAreaSummary(hitArea) {
  const ha = hitArea || createEmptyHitArea()
  if (ha.mode === 'none') return { text: '单体', cells: 0 }
  if (ha.mode === 'aoe') {
    return {
      text: `AOE 半径 ${num(ha.aoe.spread)} 格${ha.aoe.center ? '' : '（未设落点）'}`,
      cells: ha.aoe.center ? 1 : 0
    }
  }
  const dirs = (ha.mc && ha.mc.directions) || {}
  const keys = Object.keys(dirs)
  const total = keys.reduce((s, k) => s + (dirs[k] ? dirs[k].length : 0), 0)
  return { text: `地图炮 ${keys.length} 向 / ${total} 格`, cells: total }
}
