/**
 * primitives.ts — 共享内核强契约：原子类型与枚举包装
 *
 * Phase 33-Contract（2026-08-06）：强契约地基。
 * 所有业务契约的底层积木都在此定义，确保「英文业务键」与「中文展示文本」
 * 在类型层就被强制分离，从根上杜绝 P0-4 的中英键错位静默降级。
 *
 * @module @mecha/shared-kernel/contracts/primitives
 */

import { z } from 'zod';
import { UserRole, RoomStatus, DamageType, BattlePhase, ReviewStatus } from '../tokens.js';

/** 实体唯一标识：非空字符串 */
export const EntityId = z.string().min(1, '实体 ID 不可为空');

/** ISO 8601 时间戳（含时区偏移） */
export const ISODate = z.string().datetime({ offset: true });

/**
 * ★ 英文业务键（强约束）：小写字母开头、字母/数字/下划线组成。
 * 业务查表、外键、谓语路由一律走此类型，严禁中文 Label 混入键位。
 */
export const EnglishKey = z
  .string()
  .regex(/^[a-z][a-z0-9_]*$/, '业务 Key 必须为英文小写 snake_case，禁止中文或大写');

/** 中文展示文本：仅允许出现在 label/name 类字段，绝不参与查表 */
export const DisplayLabel = z.string().min(1).max(64);

/** 六角格坐标（Even-R Offset） */
export const HexCoord = z.object({ q: z.number().int(), r: z.number().int() });

// ── 业务枚举（运行时值，可直接喂 z.nativeEnum）──
export const UserRoleEnum = z.nativeEnum(UserRole);
export const RoomStatusEnum = z.nativeEnum(RoomStatus);
export const DamageTypeEnum = z.nativeEnum(DamageType);
export const BattlePhaseEnum = z.nativeEnum(BattlePhase);
export const ReviewStatusEnum = z.nativeEnum(ReviewStatus);

// ── 领域枚举（纯字符串枚举，集中在此统一管理）──
export const UnitSizeEnum = z.enum(['s', 'm', 'l', 'xl']);
export const FactionEnum = z.enum(['earth', 'maxion', 'balon', 'neutral']);
export const RoleEnum = z.enum(['attack', 'defense', 'ambush']);
export const SkillCategoryEnum = z.enum(['melee', 'ranged', 'special', 'support', 'auto', 'automation']);
export const ActionTypeEnum = z.enum(['attack', 'heal', 'buff', 'debuff', 'passive']);
