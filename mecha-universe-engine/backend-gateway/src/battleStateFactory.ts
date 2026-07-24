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

// ============================================
// 默认行动点积木
// ============================================

/** 默认机战规则积木：每回合 MOVE=1, ATTACK=1 */
export const DEFAULT_ACTION_POINTS: Record<string, number> = {
  MOVE: 1,
  ATTACK: 1,
};

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
  name?: string;
  codename?: string;
  unitCode?: string;
  type?: string;
  viewUrls?: Record<string, string> | string;
  /** 归一化部件（attributes.parts），用于构建装备耐久/HP 状态 */
  parts?: any;
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
function computeMobility(parts: any): number {
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
  return total
}

export function createBattleUnit(params: CreateBattleUnitParams): BattleUnit {
  return {
    unitId: params.unitId,
    matrixId: params.matrixId,
    ownerId: params.ownerId,
    position: { ...params.position },
    currentStats: { ...params.currentStats },
    skills: params.skills ? [...params.skills] : [],
    statusEffects: params.statusEffects ? [...params.statusEffects] : [],
    action_points: params.actionPoints
      ? { ...DEFAULT_ACTION_POINTS, ...params.actionPoints }
      : { ...DEFAULT_ACTION_POINTS },
    // Phase 30-Cover: 战场端渲染补全字段
    faction: params.faction,
    name: params.name,
    codename: params.codename,
    unitCode: params.unitCode,
    type: params.type,
    viewUrls: params.viewUrls,
    // 阶段二：从部件构建装备状态；移动范围与基准机动取自 stats
    equipState: buildEquipmentFromParts(params.parts),
    // 系统性修复（2026-07-24 链路级修正）：moveRange 与 mobility 同源唯一，均由 computeMobility 产出。
    // 规则：机体 2:1（基础最低 5）；装备(载具/背包) 3:1；Royroy 等不计入。
    // 无部件数据时回退 stats.mobility / stats.speed（旧语义，移动点即数值）。
    parts: params.parts || null,
    mobility: (params.parts ? computeMobility(params.parts) : 0) || (params.currentStats?.mobility ?? params.currentStats?.speed ?? 0),
    moveRange: (params.parts ? computeMobility(params.parts) : 0) || (params.currentStats?.mobility ?? params.currentStats?.speed ?? 0),
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
  /** 阶段二规则：阵营行动顺序（攻击→防守→偷袭，空角色跳过） */
  factionTurnOrder?: string[];
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

  return {
    id: params.id,
    phase: BattlePhase.DEPLOYMENT,
    turn: 0,
    activeUnitId: params.units[0]?.unitId ?? '',
    units: unitsMap,
    map: params.map,
    log: [] as BattleLogEntry[],
    startedAt: params.startedAt ?? new Date().toISOString(),
    // 阶段二规则：阵营轮转（攻击→防守→偷袭，空角色跳过）
    factionTurnOrder: params.factionTurnOrder ?? [],
    activeFaction: (params.factionTurnOrder && params.factionTurnOrder[0]) || '',
    activeFactionIndex: 0,
    round: 1,
  };
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
