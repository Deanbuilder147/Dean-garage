/**
 * Phase 29-P2 — 战斗状态工厂：动态行动点计数池初始化
 *
 * 核心使命：
 * 1. 创建 BattleUnit 时自动注入默认 action_points = { MOVE: 1, ATTACK: 1 }
 * 2. 开战初始化 BattleState 快盒
 * 3. 彻底废除 hasMoved/hasAttacked 硬编码布尔值
 *
 * @module battleStateFactory
 */

import type {
  BattleUnit,
  BattleState,
  BattlefieldMap,
  BattleLogEntry,
  EntityId,
  HexCoord,
  UnitStats,
  UnitSkill,
  StatusEffect,
  RoyroyState,
} from '@mecha/shared-kernel';
import { BattlePhase } from '@mecha/shared-kernel';
import { applySizeMobility, applySizeHp, normSize } from './unitSize.js';

// ============================================
// 默认行动点积木
// ============================================

/** 默认机战规则积木：每回合 MOVE=1, ATTACK=1, DEFEND=1（三类独立行动点） */
export const DEFAULT_ACTION_POINTS: Record<string, number> = {
  MOVE: 1,
  ATTACK: 1,
  DEFEND: 1,
};

// ============================================
// 阵营角色（阶段二规则）：轮转以「角色」为单位，不以势力为依据
// 顺序固定：攻击(attack) → 防守(defense) → 偷袭(ambush)
// ============================================

/** 三个行动角色，轮转顺序固定 */
export const TURN_ROLES = ['attack', 'defense', 'ambush'] as const;

/** 旧版势力键 → 角色的向后兼容映射（仅用于迁移旧战局/兜底，须与 DEFAULT_ROLE_FACTIONS 一致） */
export const LEGACY_FACTION_TO_ROLE: Record<string, string> = {
  earth: 'attack',
  maxion: 'defense',
  balon: 'ambush',
};

/**
 * 解析某棋子的行动角色。
 * 优先级：battleState.factionRoles 显式映射 > 旧版势力兼容映射 > 默认 attack。
 * 这保证了未在准备室分配角色的势力（含 'unknow' 等异常值）也能归入 attack 行动，避免无法行动。
 */
export function resolveRole(
  factionRoles: Record<string, string> | undefined,
  faction: string | undefined,
): string {
  if (factionRoles && faction != null && factionRoles[faction]) return factionRoles[faction];
  if (faction != null && LEGACY_FACTION_TO_ROLE[faction]) return LEGACY_FACTION_TO_ROLE[faction];
  return 'attack';
}

/** 棋子是否仍存活且已部署（参与轮转） */
export function isUnitAlive(u: BattleUnit): boolean {
  if (!u) return false;
  if ((u as unknown as { dead?: boolean }).dead) return false;
  const hp = u.currentStats?.hp;
  if (hp !== undefined && hp <= 0) return false;
  return !!(u.position || (u as unknown as { q?: number }).q !== undefined);
}

/** 取某角色下所有存活棋子 */
export function getRoleUnits(battle: BattleState, role: string): BattleUnit[] {
  const res: BattleUnit[] = [];
  if (!battle || !battle.units) return res;
  for (const u of battle.units.values()) {
    if (resolveRole(battle.factionRoles, u.faction) === role && isUnitAlive(u)) res.push(u);
  }
  return res;
}

/**
 * 将当前行动角色定位到首个「有存活棋子」的角色（跳过空角色）。
 * 用于开战初始化与部署结束，避免直接进入一个无人阵营的回合。
 */
export function setFirstActiveRole(battle: BattleState): void {
  const order = battle.factionTurnOrder && battle.factionTurnOrder.length
    ? battle.factionTurnOrder
    : ([...TURN_ROLES] as string[]);
  for (let i = 0; i < order.length; i++) {
    if (getRoleUnits(battle, order[i]).length > 0) {
      battle.activeFactionIndex = i;
      battle.activeFaction = order[i];
      for (const u of getRoleUnits(battle, order[i])) {
        (u as unknown as { standby?: boolean }).standby = false;
      }
      return;
    }
  }
}

// ============================================
// BattleUnit 构建器
// ============================================

export interface CreateBattleUnitParams {
  unitId: EntityId;
  matrixId: EntityId;
  ownerId: EntityId;
  position: HexCoord;
  currentStats: UnitStats;
  skills?: UnitSkill[];
  statusEffects?: StatusEffect[];
  /** 自定义行动点配置，不传则使用默认 { MOVE: 1, ATTACK: 1 } */
  actionPoints?: Record<string, number>;
  // Phase 30-Cover: 战场端渲染补全字段
  faction?: string;
  /** 方案A：轮转角色(attack/defense/ambush)，逻辑判定(敌我/可见/胜负)唯一依据。缺省由 resolveRole 从 factionRoles 推导。 */
  role?: string;
  /** 房/战斗级角色映射(faction -> role)，与 battle.factionRoles 同源，用于推导 role。 */
  factionRoles?: Record<string, string>;
  name?: string;
  codename?: string;
  unitCode?: string;
  type?: string;
  viewUrls?: Record<string, string> | string;
  /** 归一化部件（attributes.parts），用于构建装备耐久/HP 状态 */
  parts?: any;
  /** A1 射程二次断层回归守卫：顶层射程（与 currentStats.range 双向同步） */
  range?: number;
  /** 单位体型（体积）：s / m / l / xl，影响 HP/机动/渲染缩放/战斗尺寸修正 */
  size?: string;
}

/**
 * 创建一个带有动态行动点计数池的 BattleUnit。
 *
 * action_points 默认注入 { MOVE: 1, ATTACK: 1 }，
 * 天然兼容一切 TRPG 规则的多动/残余行动点/特殊行动机制。
 */
/**
 * 唯一的「移动力」权威函数（系统性修复 · 2026-07-24 链路级修正）。
 *
 * 规则（与前端 calcMobilityBreakdown / resolveUnitMobility / BFS / 后端 /move 全链路一致）：
 *   1. 机体（机体 / 主机体）：移动力 = 机动值 / 2，向上取整；机体基础移动力最低 = 5。
 *   2. 装备（载具 / 背包）：移动力 = 机动值 / 3，向上取整。
 *   3. 武器 / 防具 / 跟随(Royroy) 等不计入移动力。
 *
 * 返回的「移动力」既是行动面板展示值，也是 moveRange 与后端寻路的预算（三者同源唯一）。
 */
function computeMobility(parts: any, size?: string): number {
  if (!parts || typeof parts !== 'object') return 0
  const TYPE_ALIAS: Record<string, string> = {
    '机体': '机体', '主机体': '机体',
    '载具': '载具', '背包': '背包',
    '武器': '武器', '防具': '防具', '跟随': '跟随',
  }
  const norm = (t: any) => TYPE_ALIAS[String(t || '').trim()] || String(t || '')
  let total = 0
  for (const p of Object.values(parts)) {
    if (!p || typeof p !== 'object') continue
    const part = p as any
    const t = norm(part.normalizedType || part.type)
    const raw = typeof part['机动'] === 'number' ? part['机动']
      : (typeof part.mobility === 'number' ? part.mobility : 0)
    if (t === '机体') {
      // 机体：2:1，基础移动力最低 5
      total += Math.max(5, Math.ceil(raw / 2))
    } else if (t === '载具' || t === '背包') {
      // 装备：3:1
      total += Math.ceil(raw / 3)
    }
    // 武器 / 防具 / 跟随(Royroy) 不计入移动力
  }
  // 体型机动修正：s +10% / m 0 / l -5% / xl -10%（上调 ceil / 下调 floor）
  return applySizeMobility(total, size)
}

export function createBattleUnit(params: CreateBattleUnitParams): BattleUnit {
  return {
    unitId: params.unitId,
    matrixId: params.matrixId,
    ownerId: params.ownerId,
    position: { ...params.position },
    // A5-hold_position 契约对齐：victoryChecker 读取顶层 u.q/u.r 判定坚守占位，
    // 故此处与 position 同源暴露顶层 q/r（部署/移动时同步更新，见 combat.ts）。
    q: params.position?.q,
    r: params.position?.r,
    // A1 射程二次断层回归守卫：顶层 range 与 currentStats.range 双向同步。
    // 优先用任一来源，缺失时回退另一来源（再兜底 1），杜绝「录入 range=3 仅打 1 格」。
    currentStats: {
      ...params.currentStats,
      // 体型 HP 修正：s -10% / m 0 / l +5% / xl +10%（上调 ceil / 下调 floor）
      hp: applySizeHp(params.currentStats?.hp ?? 100, params.size),
      maxHp: applySizeHp(params.currentStats?.hp ?? 100, params.size),
      mobility: params.currentStats?.mobility ?? (params.parts ? computeMobility(params.parts, params.size) : 0),
      range: params.currentStats?.range ?? (params.range ?? 1),
    },
    skills: params.skills ? [...params.skills] : [],
    statusEffects: params.statusEffects ? [...params.statusEffects] : [],
    action_points: params.actionPoints
      ? { ...DEFAULT_ACTION_POINTS, ...params.actionPoints }
      : { ...DEFAULT_ACTION_POINTS },
    // Phase 30-Cover: 战场端渲染补全字段
    faction: params.faction,
    // 方案A：固有阵营(faction)与轮转角色(role)硬解耦。role 优先用显式传入，
    // 否则由 factionRoles 还原（与 combat.ts 部署/回合门控同源），作为逻辑判定唯一依据。
    role: params.role ?? resolveRole(params.factionRoles, params.faction),
    name: params.name,
    codename: params.codename,
    unitCode: params.unitCode,
    type: params.type,
    viewUrls: params.viewUrls,
    // 单位体型（体积）：归一化后透传，缺省 m
    size: params.size ? normSize(params.size) : 'm',
    // 阶段二：从部件构建装备状态；移动范围与基准机动取自 stats
    equipState: buildEquipmentFromParts(params.parts),
    // 系统性修复（2026-07-24 链路级修正）：moveRange 与 mobility 同源唯一，均由 computeMobility 产出。
    // 规则：机体 2:1（基础最低 5）；装备(载具/背包) 3:1；Royroy 等不计入。
    // 无部件数据时回退 stats.mobility / stats.speed（旧语义，移动点即数值）。
    parts: params.parts || null,
    mobility: (params.parts ? computeMobility(params.parts, params.size) : 0) || (params.currentStats?.mobility ?? params.currentStats?.speed ?? 0),
    moveRange: (params.parts ? computeMobility(params.parts, params.size) : 0) || (params.currentStats?.mobility ?? params.currentStats?.speed ?? 0),
    // 攻击射程：与 mobility/moveRange 一致提升为顶层字段，供前端直接读取。
    // 原仅存在于 currentStats.range，导致前端 selectedUnit.range 为 undefined，
    // 普通攻击被压成距离 1（NewBattleView 的 getSkillRange / performPlainAttack 都读顶层 range）。
    range: params.range ?? params.currentStats?.range ?? 1,
    // 顶层 hp/maxHp 与 currentStats 同源（applySizeHp 修正后），供前端直接读取。
    // 否则前端 dead 判定 (unit.hp ?? 0) <= 0 会把所有单位误判为阵亡（标灰划掉无法部署）。
    hp: applySizeHp(params.currentStats?.hp ?? 100, params.size),
    maxHp: applySizeHp(params.currentStats?.hp ?? 100, params.size),
    // 阶段二规则6：从「跟随」部件抽取 Royroy 属性模型（非独立单位）
    royroy: buildRoyroyState(params.parts),
  };
}

// ============================================
// 装备状态构建（阶段二数值底层）
// ============================================
function buildEquipmentFromParts(parts: Record<string, any>): any[] {
  if (!parts || typeof parts !== 'object') return [];
  const TYPE_ALIAS: Record<string, string> = {
    '机体': '机体', '主机体': '机体', '武器': '武器', '防具': '防具',
    '载具': '载具', '背包': '背包', '跟随': '跟随',
  };
  const norm = (t: any) => TYPE_ALIAS[String(t || '').trim()] || String(t || '');
  const eq: any[] = [];
  for (const p of Object.values(parts)) {
    if (!p || typeof p !== 'object') continue;
    const t = norm(p.normalizedType || p.type);
    if (!['武器', '防具', '载具', '背包'].includes(t)) continue;
    eq.push({
      name: p.slot || p.name || t,
      type: t,
      slot: p.slot,
      mobility: p.机动 || 0,
      hp: p.hp ?? 0,
      maxHp: p.maxHp ?? (p.hp ?? 0),
      durability: p.durability ?? 0,
      maxDurability: p.maxDurability ?? (p.durability ?? 0),
      destroyed: false,
      isShield: !!p.isShield,
    });
  }
  return eq;
}

// ============================================
// Royroy 浮游辅机（阶段二规则6，属性模型，非独立单位）
// ============================================

const ROYROY_KEYWORDS = ['跟随', 'royroy', '浮游', '辅机'];

/**
 * 从部件对象中抽取「跟随」(royroy / 浮游) 部件，构建 RoyroyState 属性。
 * 仅取首个匹配的跟随部件（单主机对应单 Royroy）。
 * - isAuto：部件技能含 category==='auto' 则随动（主机移动后自动重定位）；否则定点不可动。
 * - 防御力：彻底废弃设为 0（报告 §4 数值净化）。
 */
export function buildRoyroyState(parts: Record<string, any>): RoyroyState | undefined {
  if (!parts || typeof parts !== 'object') return undefined;
  let part: any = null;
  for (const p of Object.values(parts)) {
    if (!p || typeof p !== 'object') continue;
    const t = String(p.normalizedType || p.type || '').trim();
    if (ROYROY_KEYWORDS.some((k) => t.includes(k))) { part = p; break; }
  }
  if (!part) return undefined;

  const structure = part.结构 ?? part.structure ?? 5;
  const hp = part.hp ?? structure;
  const attack = part.格斗 ?? part.射击 ?? part.attack ?? 0;
  const skills = Array.isArray(part.skills)
    ? part.skills
    : (typeof part.skills === 'string' ? safeParseArr(part.skills) : []);
  const isAuto = skills.some((s: any) => (s?.category || s?.type) === 'auto');

  return {
    name: part.name || '浮游辅机',
    attack,
    defense: 0,
    hp,
    maxHp: hp,
    isAuto,
    deployMode: isAuto ? 'follow' : 'fixed',
    status: 'inactive',
    deployed: false,
  };
}

/** 局部安全解析数组：字符串则 JSON.parse，否则原样返回 */
function safeParseArr(v: any): any[] {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') {
    try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; }
  }
  return [];
}

// ============================================
// BattleState 快盒初始化
// ============================================

export interface InitBattleStateParams {
  id: EntityId;
  map: BattlefieldMap;
  units: BattleUnit[];
  startedAt?: string;
  /**
   * 阶段二规则：阵营行动顺序（攻击→防守→偷袭，空角色跳过）。
   * 元素应为角色键（'attack' | 'defense' | 'ambush'）；若传入旧版势力键（earth/balon/maxion）
   * 会自动迁移为角色键。
   */
  factionTurnOrder?: string[];
  /** faction 键 → 角色键 映射（准备室设定）。缺省时按 unit.faction 推导默认角色。 */
  factionRoles?: Record<string, string>;
}

/**
 * 开战初始化战局快盒。
 * 所有 BattleUnit 必须在调用前通过 createBattleUnit() 创建，
 * 确保每个单位都携带 action_points 计数池。
 */
export function createBattleState(params: InitBattleStateParams): BattleState {
  const unitsMap = new Map<EntityId, BattleUnit>();
  for (const unit of params.units) {
    unitsMap.set(unit.unitId, unit);
  }

  // ---- 归一化轮转模型：factionTurnOrder 必须为角色键，并推导 factionRoles ----
  const factionRoles: Record<string, string> = params.factionRoles ? { ...params.factionRoles } : {};
  let order: string[] = params.factionTurnOrder && params.factionTurnOrder.length
    ? [...params.factionTurnOrder]
    : [];

  const isLegacy = order.length > 0 && order.some(o => !TURN_ROLES.includes(o as typeof TURN_ROLES[number]));
  if (isLegacy) {
    // 旧战局：factionTurnOrder 是势力键，按单位实际势力推导角色
    for (const u of params.units) {
      const f = u.faction;
      if (f == null) continue;
      if (!(f in factionRoles)) factionRoles[f] = LEGACY_FACTION_TO_ROLE[f] || 'attack';
    }
    const presentRoles = TURN_ROLES.filter(r => Object.values(factionRoles).includes(r));
    order = presentRoles.length ? [...presentRoles] : [...TURN_ROLES];
  }
  // 确保每位势力都有角色（含 'unknow' 等异常值），默认归入 attack
  for (const u of params.units) {
    const f = u.faction;
    if (f == null) continue;
    if (!(f in factionRoles)) factionRoles[f] = LEGACY_FACTION_TO_ROLE[f] || 'attack';
    const bu = u as unknown as { standby?: boolean };
    if (bu.standby === undefined) bu.standby = false;
  }

  const battle: BattleState = {
    id: params.id,
    phase: BattlePhase.DEPLOYMENT,
    turn: 0,
    activeUnitId: params.units[0]?.unitId ?? '',
    units: unitsMap,
    map: params.map,
    log: [] as BattleLogEntry[],
    startedAt: params.startedAt ?? new Date().toISOString(),
    // 阶段二规则：阵营轮转（攻击→防守→偷袭，空角色跳过），以角色为单位
    factionTurnOrder: order,
    factionRoles,
    activeFaction: order[0] || '',
    activeFactionIndex: 0,
    round: 1,
  };
  // 将当前行动角色定位到首个有存活棋子的角色（跳过空角色）
  setFirstActiveRole(battle);
  return battle;
}

// ============================================
// 行动点操作辅助
// ============================================

/**
 * 消耗一个单位的指定行动点。
 * @returns true = 扣除成功, false = 行动点不足
 */
export function consumeActionPoint(unit: BattleUnit, action: string, amount: number = 1): boolean {
  if (!unit.action_points || (unit.action_points[action] ?? 0) < amount) {
    return false;
  }
  unit.action_points[action] -= amount;
  return true;
}

/**
 * 检查单位是否有足够的指定行动点。
 */
export function hasActionPoints(unit: BattleUnit, action: string, amount: number = 1): boolean {
  return (unit.action_points?.[action] ?? 0) >= amount;
}

/**
 * 回合结束时重置所有行动点至默认值。
 */
export function resetActionPoints(unit: BattleUnit, defaults?: Record<string, number>): void {
  unit.action_points = { ...(defaults ?? DEFAULT_ACTION_POINTS) };
}

/**
 * 批量重置战局中所有单位的行动点（回合结束时调用）。
 */
export function resetAllActionPoints(state: BattleState): void {
  for (const unit of state.units.values()) {
    resetActionPoints(unit);
  }
}

/**
 * 系统级兜底：检查单位是否在「移动 / 战术(攻击+技能) / 防御」三类行动中用满了任意两类。
 * 一旦用满两类，立即进入待机(standby)并清零所有行动点，避免任何路径遗漏待机判定。
 * 返回 true 表示本次触发了待机。
 */
export function markStandbyIfDone(unit: BattleUnit): boolean {
  if (!unit) return false;
  const ap: Record<string, number> = unit.action_points || (DEFAULT_ACTION_POINTS as Record<string, number>);
  const used =
    (ap.MOVE <= 0 ? 1 : 0) +
    (ap.ATTACK <= 0 ? 1 : 0) +
    (ap.DEFEND <= 0 ? 1 : 0);
  if (used >= 2) {
    (unit as any).standby = true;
    unit.action_points = { MOVE: 0, ATTACK: 0, DEFEND: 0 };
    return true;
  }
  return false;
}
