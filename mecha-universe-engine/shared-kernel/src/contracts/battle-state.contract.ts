/**
 * battle-state.contract.ts — 战斗运行时聚合契约（B-4 Macro 边界）
 *
 * BattleStateContract 聚合 map / units / phase / victory，仅挂在「Macro 边界」
 * （房间创建 / 地图加载 / pending-units / end-deployment / 路由入参），
 * 严禁在结算热路径（每帧/每技能）全量调用，性能边界由 B-4 双层校验纪律保证。
 *
 * 注意：BattleUnitContract 的 attributes 为 Map 类型（combat.ts:754），
 * 契约用 z.record 宽松放行，不强行 z.record 化 Map（避免 Macro 边界误 400）。
 *
 * @module @mecha/shared-kernel/contracts/battle-state
 */

import { z } from 'zod';
import { BattlefieldMapContract } from './map.contract.js';
import { BattleUnitContract } from './battle.contract.js';
import { BattlePhaseEnum } from './primitives.js';
import { BattlePhase } from '../tokens.js';

export const VictoryContract = z.object({
  status: z.enum(['pending', 'earth_win', 'maxion_win', 'draw']).default('pending'),
  reason: z.string().optional(),
}).passthrough().default({ status: 'pending' });

/**
 * ★ B-4：Macro 边界聚合契约。units 为 BattleUnit 数组（运行时由内存 BattleState 投影），
 * 此处只做形状兜底，不深入逐字段校验（性能边界）。
 */
export const BattleStateContract = z.object({
  battleId: z.string().min(1),
  map: BattlefieldMapContract,
  units: z.array(BattleUnitContract).default([]),
  phase: BattlePhaseEnum.default(BattlePhase.DEPLOYMENT),
  victory: VictoryContract.default({ status: 'pending' }),
}).passthrough();

export type BattleState = z.infer<typeof BattleStateContract>;
export type Victory = z.infer<typeof VictoryContract>;
