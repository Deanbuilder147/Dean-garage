// ================================================================
// battle/glossary/laneSkeleton.js
// 六段式词条骨架常量 + 归段映射（从单体页 GlossaryStudio.vue 抽出的共享内核）
// 来源：frontend/src/views/GlossaryStudio.vue
//   - LANE_SKELETON   L1055-1065  六段固定骨架 WHEN→IF→ROLL→DO→AFTER→COST
//   - GRP_TO_PHASE    L1480       原子分组 A~K → 六段相位（旧数据兜底归段）
//   - MC_DIR_KEYS     L454        地图炮六向
//   - phaseOfEffect   L1502-1505  按 effectType 判段（优先于 grp 归段）
// 纯数据 + 纯函数，不 import vue、无状态（渲染内核禁读状态机）。
// ================================================================

// 六段固定骨架（对齐设计稿 / 2026-08-23 规范）
// WHO(主语/目标解析) 已并入 DO 段内首原子，不再作为独立主段。
export const LANE_SKELETON = [
  { key: 'WHEN',  name: 'WHEN 时机',  desc: '触发闸门',          grp: 'A' },
  { key: 'IF',    name: 'IF 条件',    desc: '前置判定',          grp: 'B' },
  { key: 'ROLL',  name: 'ROLL 掷骰',  desc: '随机/分支',         grp: 'D' },
  { key: 'DO',    name: 'DO 执行',    desc: '效果堆叠/目标解析', grp: 'F' },
  { key: 'AFTER', name: 'AFTER 后效', desc: '延时生效/回合末结算', grp: 'G' },
  { key: 'COST',  name: 'COST 代价',  desc: 'AP/冷却',           grp: 'E' }
]

export const PHASE_KEYS = LANE_SKELETON.map(l => l.key)

// 分组 → 六段相位（源 L1480 逐字复制；旧数据无 subLanes 时按 grp 归段）
export const GRP_TO_PHASE = {
  A: 'WHEN', B: 'IF', C: 'DO', D: 'DO', E: 'COST', F: 'DO',
  G: 'AFTER', H: 'DO', I: 'DO', J: 'DO', K: 'COST'
}

// 地图炮六向（源 L454 逐字复制，顺时针屏幕序）
export const MC_DIR_KEYS = ['right', 'rightup', 'leftup', 'left', 'leftdown', 'rightdown']

// 按 effectType 判段（源 L1502-1505）
export function phaseOfEffect(effectType, grp) {
  if (effectType === 'trigger') return 'WHEN'
  if (effectType === 'condition') return 'IF'
  if (effectType === 'roll_segment') return 'ROLL'
  return (grp && GRP_TO_PHASE[grp]) || 'DO'
}

// 生成一个空的六段泳道（每段 atoms 为空数组）
export function createEmptyLanes() {
  return LANE_SKELETON.map(l => ({ key: l.key, name: l.name, grp: l.grp, atoms: [] }))
}

// 按 key 取泳道（找不到返回 undefined）
export function laneOf(lanes, key) {
  return (lanes || []).find(l => l.key === key)
}
