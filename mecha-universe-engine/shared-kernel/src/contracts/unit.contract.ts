/**
 * unit.contract.ts — 单位（机甲）强契约
 *
 * Phase 33-Contract（2026-08-06）。
 *
 * @module @mecha/shared-kernel/contracts/unit
 */

import { z } from 'zod';
import {
  EntityId, DisplayLabel, UnitSizeEnum, FactionEnum, SkillCategoryEnum,
} from './primitives.js';
import { SkillContract } from './skill.contract.js';

/**
 * ★ P0-3：armor 必须在契约中显式存在（否则中间层透传缺失 → 护甲属性全程无效）。
 * 字段统一 snake_case，禁止 hpMax / maxHp 等 camel 变体进入契约。
 */
export const UnitStatsContract = z.object({
  hp: z.number().int().min(1).default(100),
  max_hp: z.number().int().min(1).optional(),
  attack: z.number().int().min(0).default(0),
  defense: z.number().int().min(0).default(0),
  armor: z.number().int().min(0).default(0),
  shield: z.number().int().min(0).default(0),
  mobility: z.number().int().min(0).default(0),
  evasion: z.number().int().default(0),
  accuracy: z.number().int().default(0),
}).passthrough();

/**
 * ★ P0-1：唯一命名法 snake_case。camelCase 变体（skillsByOwner）一律在入口归一，
 * 不进契约。attributes 内的动态字段过渡期 passthrough 放行，但配合 strictLog 记录。
 */
export const SkillsByOwnerContract = z.record(z.string(), z.array(SkillContract));

export const UnitAttributesContract = z.object({
  skills_by_owner: SkillsByOwnerContract.default({}),
  parts: z.record(z.string(), z.any()).default({}),
}).partial().passthrough();

export const UnitContract = z.object({
  id: EntityId,
  owner_id: EntityId,
  name: DisplayLabel,
  codename: z.string().default(''),
  faction: FactionEnum.default('earth'),
  /** 单位分类（机甲定位），与技能 category 区分 */
  category: SkillCategoryEnum.default('melee'),
  tier: z.number().int().min(1).default(1),
  size: UnitSizeEnum.default('m'),
  stats: UnitStatsContract,
  skills: z.array(SkillContract).default([]),
  attributes: UnitAttributesContract.default({}),
  /** ★ I-6：视野距离（LoS 第 1 步距离判定消费）。默认 6。 */
  sight_range: z.number().int().min(0).default(6),
  // ★ P0-2：equipment 已停用，契约中【故意不定义】。
  //   如未来恢复，须同时补 DB 列 + 写入端，再在此追加。
}).passthrough();

export type Unit = z.infer<typeof UnitContract>;
