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
}

/**
 * 创建一个带有动态行动点计数池的 BattleUnit。
 *
 * action_points 默认注入 { MOVE: 1, ATTACK: 1 }，
 * 天然兼容一切 TRPG 规则的多动/残余行动点/特殊行动机制。
 */
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
  };
}

// ============================================
// BattleState 快盒初始化
// ============================================

export interface InitBattleStateParams {
  id: EntityId;
  map: BattlefieldMap;
  units: BattleUnit[];
  startedAt?: string;
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
