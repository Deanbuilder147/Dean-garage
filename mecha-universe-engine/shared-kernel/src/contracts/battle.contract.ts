/**
 * battle.contract.ts — 战斗运行时强契约
 *
 * Phase 33-Contract（2026-08-06）。
 * 聚合 BattleUnit / StatusEffect / SkillExecutionResult，并挂载统一 diagnostics 通道。
 *
 * @module @mecha/shared-kernel/contracts/battle
 */

import { z } from 'zod';
import { EntityId, DisplayLabel, HexCoord } from './primitives.js';
import { SkillContract } from './skill.contract.js';
import { DiagnosticContract, WithDiagnostics } from './diagnostics.js';

export const StatusEffectContract = z.object({
  id: EntityId,
  type: z.string(),
  duration: z.number().int().default(0),
  remainingTurns: z.number().int().default(0),
  params: z.record(z.string(), z.unknown()).default({}),
}).passthrough();

/**
 * ★ C-6：装备耐久状态锁契约。装备损毁/耐久归零时，其 slotKey 登记进 lockedDurability，
 * 作为"活路径"拦截信号；维修/替换技能命中该槽位时显式返回 EQUIPMENT_LOCKED。
 */
export const EquipmentLockMetaContract = z.object({
  lockedDurability: z.record(z.string(), z.boolean()).default({}),
}).passthrough();

export const BattleUnitContract = z.object({
  unitId: EntityId,
  matrixId: EntityId,
  ownerId: EntityId,
  position: HexCoord,
  currentStats: z.record(z.string(), z.unknown()).default({}),
  skills: z.array(SkillContract).default([]),
  statusEffects: z.array(StatusEffectContract).default([]),
  action_points: z.record(z.string(), z.number()).default({}),
  faction: z.string().optional(),
  role: z.string().optional(),
  name: DisplayLabel.optional(),
  /** ★ C-6：活路径元信息。含 lockedDurability[slotKey] 状态锁，供 equipState 拦截登记。 */
  _meta: EquipmentLockMetaContract.optional(),
}).passthrough();

export const SkillExecutionResultContract = WithDiagnostics.extend({
  success: z.boolean(),
  damage: z.number().default(0),
  damageType: z.string().optional(),
  effects: z.array(StatusEffectContract).default([]),
  log: z.array(z.string()).default([]),
  error: z.string().optional(),
});

export type BattleUnit = z.infer<typeof BattleUnitContract>;
export type SkillExecutionResult = z.infer<typeof SkillExecutionResultContract>;
