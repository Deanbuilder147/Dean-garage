// ================================================================
// battle/normalizeBattle.js
// 战场状态规范化 + 单位能力解析（PC 版 NewBattleView 与移动端 MobileBattleView 共享）
// 抽出于 2026-08-20：消除两端重复维护，保证同一套坐标/HP/机动契约。
// ================================================================
import { applySizeMobility } from '../utils/unitSize.js'

export function safeParseJson(v) { try { return JSON.parse(v) } catch { return v } }

// === 唯一的「机动 → 移动力」权威解析（系统性修复 · 2026-07-24 链路级修正） ===
// 与后端 computeMobility 完全一致：机体 2:1（基础最低 5）；装备(载具/背包) 3:1；Royroy 等不计入。
// 无部件时回退 stats.mobility / stats.speed / 顶层（旧语义，移动点即数值）。
export function resolveUnitMobility(raw) {
  if (!raw || typeof raw !== 'object') return 0
  const stats = (raw.stats && typeof raw.stats === 'object') ? raw.stats : {}
  const toNum = (x) => (typeof x === 'number' && !isNaN(x) ? x : null)
  const normType = (t) => String(t || '').trim()
  // 分部位移动力（按规则换算）
  let partsSum = 0
  const parts = raw.attributes?.parts || (raw.parts && typeof raw.parts === 'object' ? raw.parts : null)
  if (parts && typeof parts === 'object') {
    for (const p of Object.values(parts)) {
      if (p && typeof p === 'object') {
        const type = normType(p.normalizedType || p.type)
        const m = toNum(p['机动']) ?? toNum(p.mobility)
        if (m == null) continue
        if (type === '机体') partsSum += Math.max(5, Math.ceil(m / 2))
        else if (type === '载具' || type === '背包') partsSum += Math.ceil(m / 3)
        // 武器 / 防具 / 跟随(Royroy) 不计入
      }
    }
  }
  // 体型机动修正：s +10% / m 0 / l -5% / xl -10%（与后端 computeMobility 同源）
  if (partsSum > 0) return applySizeMobility(partsSum, raw.size)
  const candidates = [
    toNum(stats.mobility),
    toNum(stats.speed),
    toNum(raw.mobility),
    toNum(raw['机动']),
    toNum(raw.main_机动),
  ]
  for (const c of candidates) if (c != null) return c
  return 0
}

// 阵亡判定（稳健版）：显式 dead 标记为真才判死；hp 字段缺失/0 一律视为存活。
// 仅当 hp 是有效正数且 <= 0 时才判死（真打死的场面由战斗结算写回 currentStats.hp，并经 applyHpDelta 同步顶层 hp）。
export function isUnitDead(unit) {
  if (!unit || typeof unit !== 'object') return false
  if (unit.dead === true) return true
  const h = Number(unit.hp)
  if (!isNaN(h) && h > 0) return false
  if (!isNaN(h) && h <= 0) return true
  return false
}

// 战场状态规范化（前端从 position 取坐标；补全渲染所需字段）
export function normalizeBattleState(state) {
  if (!state || !state.units) return state
  const units = Array.isArray(state.units) ? state.units : Object.values(state.units)
  for (const u of units) {
    if (!u) continue
    // 坐标契约：position 是真理源，同步出顶层 q/r（棋盘其余读取 unit.q/unit.r 处无需改动）
    if (u.position && u.q === undefined) { u.q = u.position.q; u.r = u.position.r }
    // id 别名：战斗逻辑用 unitId，前端多处用 unit.id
    if (u.unitId !== undefined && u.id === undefined) u.id = u.unitId
    // HP 条
    if (u.currentStats && u.hp === undefined) u.hp = u.currentStats.hp
    // 四维/护盾/护甲：后端 createBattleUnit 把它们放在 currentStats 内，
    // 而行动面板读的是顶层 attack/defense/range/shield/armor/maxHp。
    // 仅当顶层缺失时从 currentStats 提上来（不覆盖已有顶层值）。
    if (u.currentStats) {
      const cs = u.currentStats
      if (u.attack === undefined && cs.attack !== undefined) u.attack = cs.attack
      if (u.defense === undefined && cs.defense !== undefined) u.defense = cs.defense
      if (u.range === undefined && cs.range !== undefined) u.range = cs.range
      if (u.shield === undefined && cs.shield !== undefined) u.shield = cs.shield
      if (u.armor === undefined && cs.armor !== undefined) u.armor = cs.armor
      // maxHp 兜底：currentStats 未携带时回退到当前 hp（载入时多为满血），避免 HP 条按 /100 误显为残血
      if (u.maxHp === undefined) u.maxHp = cs.maxHp ?? u.hp
    }
    // 阶段修复：统一解析「机动」，消除 ? 与错误的 0
    if (u.mobility === undefined) u.mobility = resolveUnitMobility(u)
    if (u.moveRange === undefined || u.moveRange === 0) u.moveRange = u.mobility
    // 七视图兼容（view_urls 字符串 → viewUrls 对象）
    if (u.view_urls !== undefined && u.viewUrls === undefined) {
      u.viewUrls = typeof u.view_urls === 'string' ? safeParseJson(u.view_urls) : u.view_urls
    }
    // 行动点 → 旧布尔按钮字段（保持模板 :disabled 逻辑不变）：移动/战术/防御三类点用尽即置灰
    if (u.has_moved === undefined) u.has_moved = (u.action_points?.MOVE ?? 1) <= 0
    if (u.has_acted === undefined) u.has_acted = (u.action_points?.ATTACK ?? 1) <= 0
    if (u.has_defended === undefined) u.has_defended = (u.action_points?.DEFEND ?? 1) <= 0
    // 体型机动补偿 Buff：被更大机体攻击后下回合移动 +N（由后端 BuffManager 写入）
    if (u.mobility_buff === undefined) u.mobility_buff = 0
    if (u.mobility_buff_turns === undefined) u.mobility_buff_turns = 0
  }
  return state
}
