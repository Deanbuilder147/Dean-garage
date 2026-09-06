/**
 * skill.contract.ts — 技能强契约（治理 P0-4 中英键错位核心）
 *
 * Phase 33-Contract（2026-08-06）。
 *
 * @module @mecha/shared-kernel/contracts/skill
 */

import { z } from 'zod';
import { EnglishKey, DisplayLabel, SkillCategoryEnum, ActionTypeEnum } from './primitives.js';

/** 单个效果维度（伤害/减伤/状态等），具体语义由引擎各系统配置表消费 */
export const EffectContract = z.object({
  type: z.string().default('damage'),
  damage_kind: z.string().optional(),
  fixed_rate_multiplier: z.number().optional(),
  flat_value: z.number().optional(),
  status_key: z.string().optional(),
  value: z.union([z.number(), z.string()]).optional(),
  // ★ §8.9②：状态挂接结算相位（默认 turn_end；被动 on_turn_start Buff 建议 turn_start 避免「刚挂上就秒失效」）
  expiry_phase: z.enum(['turn_end', 'turn_start']).optional(),
  // §8.9①：L2/L6 谓语归属——子效果独立目标类型，二次子路由依据
  target_type: z.string().optional(),
}).passthrough();

/**
 * ★ P0-4 根治：业务外键 `skill_key` 强制英文 Key 且【非空】。
 *  旧链路里 skill_key 可为 null → 中文 effect/name 静默降级、下游 0 效果。
 *  阶段 4 硬拦截后，null 将直接 400；阶段 3 灰度期由 rooms.ts 的 effectiveKey
 *  运行时兜底 + 迁移脚本回填兜底。
 */
/** 被动技能触发条件阈值（行动开始时按此判定是否自动发动） */
export const TriggerConditionContract = z.object({
  /** 血量低于该百分比（0~100）时满足，例如 50 表示血量 < 50% */
  hp_below_pct: z.number().min(0).max(100).optional(),
  /** 与最近敌方距离 ≤ 该格数时满足 */
  distance_less_than: z.number().int().min(0).optional(),
  /** 与最近敌方距离 ≥ 该格数时满足 */
  distance_greater_than: z.number().int().min(0).optional(),
}).passthrough();

/** 触发时机：被动技能在行动开始(on_turn_start)等节点自动校验 condition 并发动 */
export const TriggerContract = z.object({
  type: z.enum([
    'on_turn_start',
    'on_damage_taken',
    'on_kill',
    'on_ally_down',
    'unconditional',
    'none',
  ]).optional(),
  condition: TriggerConditionContract.optional(),
}).passthrough();

export const SkillContract = z.object({
  /** 业务外键：英文键，非空 */
  skill_key: EnglishKey,

  /** 中文展示名 —— 仅用于 UI，严禁参与任何业务查表 */
  name: DisplayLabel,

  /** 原 effect 字段降级为纯展示文案，重命名以杜绝误用 */
  effect_label: DisplayLabel.optional(),

  /** 分类唯一真相源：落库前必须归一为 category 单字段。
   *  旧的 type / typeLabel / attack_type[] / action_type[] 五路兜底一律在入口消化 */
  category: SkillCategoryEnum,
  action_type: ActionTypeEnum,

  cast_range: z.number().int().min(0).nullable().default(null),
  min_cast_range: z.number().int().min(0).nullable().default(null),
  slot: z.string().nullable().default(null),
  effects: z.array(EffectContract).default([]),

  /** 触发配置：仅被动(passive)技能消费，主动技能忽略 */
  trigger: TriggerContract.optional(),
}).passthrough();

export type Skill = z.infer<typeof SkillContract>;
export type TriggerContractType = z.infer<typeof TriggerContract>;
export type TriggerConditionContractType = z.infer<typeof TriggerConditionContract>;
