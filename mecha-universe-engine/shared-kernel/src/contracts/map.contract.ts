/**
 * map.contract.ts — 战场地图强契约
 *
 * Phase 33-Contract（2026-08-06）。
 *
 * @module @mecha/shared-kernel/contracts/map
 */

import { z } from 'zod';
import { EntityId, EnglishKey, DisplayLabel, HexCoord } from './primitives.js';
import { TERRAIN_KEY } from '../enums.js';

export const TerrainCellContract = z.object({
  q: z.number().int(),
  r: z.number().int(),
  /**
   * ★ 英文地形键（规范枚举见 shared-kernel TERRAIN_KEY：plain/forest/mountain/water/ruin/crystal/moon）。
   * 保持 EnglishKey 宽松校验：存量地图含 ruins（非 ruin）、void、space 等枚举外值，
   * 强制 z.enum 会让存量地图加载即 400（B-4 渐进策略，待数据迁移后收紧）。
   */
  terrain_key: EnglishKey.describe('canonical: TERRAIN_KEY'),
  terrain_label: DisplayLabel.optional(),
  height: z.number().int().default(0),
  /** ★ I-6：地形高程（视线阻挡几何输入）。注意非 height（height 为地图尺寸）。 */
  elevation: z.number().int().default(0),
  /** ★ I-6：是否阻挡视线（与 defent_modifier/move_cost 同批 T2 字段） */
  blocks_sight: z.boolean().default(false),
}).passthrough();

export const BattlefieldMapContract = z.object({
  id: EntityId,
  name: DisplayLabel,
  width: z.number().int().min(1),
  height: z.number().int().min(1),
  cells: z.array(TerrainCellContract).default([]),
  spawn_points: z.array(HexCoord).default([]),
  is_public_copy: z.boolean().default(false),
  is_public: z.boolean().default(false),
}).passthrough();

export type TerrainCell = z.infer<typeof TerrainCellContract>;
export type BattlefieldMap = z.infer<typeof BattlefieldMapContract>;
