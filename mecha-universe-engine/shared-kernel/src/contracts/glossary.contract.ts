/**
 * glossary.contract.ts — 词条库强契约
 *
 * Phase 33-Contract（2026-08-06）。
 * 词条库是「中文 Label → 英文 Key」的唯一真相源，本契约确保 key 与 name 分离。
 *
 * @module @mecha/shared-kernel/contracts/glossary
 */

import { z } from 'zod';
import { EnglishKey, DisplayLabel, SkillCategoryEnum, ActionTypeEnum } from './primitives.js';
import { EffectContract } from './skill.contract.js';
import { TIMING, EFFECT_TYPE, CONDITION_TYPE, ROLL_MODE, LIMIT_SCOPE, ENTRY_TYPE } from '../enums.js';

export const GlossaryEntryContract = z.object({
  /** 英文主键 */
  key: EnglishKey,
  /** 中文展示名 */
  name: DisplayLabel,
  category: SkillCategoryEnum,
  action_type: ActionTypeEnum,
  base_damage: z.number().default(0),
  effects: z.array(EffectContract).default([]),
}).passthrough();

/**
 * 中文 Label → 英文 Key 反查字典：由词条库运行时派生，唯一真相源。
 * ★ 严禁任何组件内硬编码静态映射表（现存 EFFECT_TO_KEY_FALLBACK 属过渡兜底，须删除）。
 */
export function buildLabelToKeyDict(entries: Array<{ name?: string; key: string }>): Map<string, string> {
  const m = new Map<string, string>();
  for (const e of entries) {
    if (e.name) m.set(e.name, e.key);
  }
  return m;
}

export type GlossaryEntry = z.infer<typeof GlossaryEntryContract>;

// ───────────────────────────────────────────────────────────
// Phase A：六段式（Six-Segment）强契约 + 防御性校验
// 六段：timing / conditions / target / roll / effects / cost
// 设计原则（对齐报告第七章）：旧扁平字段（reduction/aoe_mode 等）
// 一律 passthrough 保留，仅校验已落地的六段字段，绝不阻断装载。
// ───────────────────────────────────────────────────────────

/** 时机段：统一事件总线名（trigger 对齐 TIMING） */
export const TimingSegment = z.object({
  trigger: z.string().optional(),
  on: z.record(z.string(), z.any()).optional(),
}).passthrough();

/** 条件段：when.conditions[] 复数谓词数组（B 组条件门槛） */
export const ConditionSegment = z.object({
  type: z.string().optional(),
  params: z.record(z.string(), z.any()).optional(),
}).passthrough();

/** 目标段：作用对象 / 形状 / 范围 */
export const TargetSegment = z.object({
  shape: z.string().optional(),
  range: z.union([z.number(), z.string()]).optional(),
  count: z.number().optional(),
}).passthrough();

/** 判定段：roll 内嵌 generator.method（3.3 可插拔数值生成） */
export const RollSegment = z.object({
  mode: z.string().optional(),
  generator: z.object({ method: z.string().optional() }).passthrough().optional(),
  segments: z.array(z.any()).optional(),
}).passthrough();

/** 约束段：charges/durability/cooldown/limit_scope（Phase C/D 实装） */
// charges / durability 支持两种写法：
//   数字        —— 直接作为初始充能/耐久值
//   对象 { initial, slots } —— 显式初始值 + 占用槽位数
export const CostValue = z.union([
  z.number(),
  z.object({ initial: z.number().optional(), slots: z.number().optional() }).passthrough(),
]).optional();

export const CostSegment = z.object({
  ap: z.number().optional(),
  slots: z.number().optional(),
  charges: CostValue,
  durability: CostValue,
  cooldown: z.number().optional(),
  limit_scope: z.string().optional(),
}).passthrough();

/** 六段式词条契约：entry_type + 六段，旧扁平字段 passthrough 兼容 */
export const GlossarySixSegmentEntry = z.object({
  entry_type: z.string().optional(),
  timing: TimingSegment.optional(),
  conditions: z.array(ConditionSegment).optional(),
  target: TargetSegment.optional(),
  roll: RollSegment.optional(),
  effects: z.array(EffectContract).optional(),
  cost: CostSegment.optional(),
}).passthrough();

export type GlossarySixSegmentEntryType = z.infer<typeof GlossarySixSegmentEntry>;

/**
 * 防御性校验（Phase A 地基）：仅收集 warnings，绝不抛错，避免阻断线上装载。
 * - 结构问题 → errors（当前几乎不会触发，因全 passthrough）
 * - 六段字段值是非已知枚举 → warnings（提示需收口到 Phase A 枚举）
 * 返回 { valid, errors, warnings }。
 */
export function validateGlossaryConfig(config: any): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!config || typeof config !== 'object') {
    return { valid: false, errors: ['顶层配置不是对象'], warnings };
  }
  const skills = (config && config.skills) || {};
  if (!config.skills || typeof config.skills !== 'object') {
    warnings.push('缺少 skills 对象');
  }
  // field -> [枚举对象, 取值函数(从 entry 抽取待校验值数组)]
  const enumChecks: Record<string, [Record<string, string>, (e: any) => string[]]> = {
    'timing.trigger': [TIMING, (e) => (e.timing && e.timing.trigger ? [e.timing.trigger] : [])],
    'effects[].type': [EFFECT_TYPE, (e) => (Array.isArray(e.effects) ? e.effects : []).map((x: any) => x && x.type).filter(Boolean)],
    'conditions[].type': [CONDITION_TYPE, (e) => (Array.isArray(e.conditions) ? e.conditions : []).map((x: any) => x && x.type).filter(Boolean)],
    'roll.mode': [ROLL_MODE, (e) => (e.roll && e.roll.mode ? [e.roll.mode] : [])],
    'cost.limit_scope': [LIMIT_SCOPE, (e) => (e.cost && e.cost.limit_scope ? [e.cost.limit_scope] : [])],
    'entry_type': [ENTRY_TYPE, (e) => (e.entry_type ? [e.entry_type] : [])],
  };
  for (const [key, raw] of Object.entries(skills)) {
    const entry: any = raw || {};
    for (const [field, [enumObj, getter]] of Object.entries(enumChecks)) {
      const allowed = Object.values(enumObj);
      for (const v of getter(entry)) {
        if (!allowed.includes(v)) {
          warnings.push(`[${key}] ${field} 非已知枚举值: ${v}`);
        }
      }
    }
  }
  return { valid: errors.length === 0, errors, warnings };
}
