/**
 * diagnostics.ts — 统一诊断通道（拒绝静默吞字段的核心机制）
 *
 * Phase 33-Contract（2026-08-06）：所有「降级 / 兜底 / 未知分支」不再静默，
 * 一律向结算结果 / 战报 / 响应体挂载 `diagnostics[]`，前端可渲染黄色警告条，
 * 服务端 logger 同步落盘，彻底消灭「字段悄悄丢失却零痕迹」类 P0 隐患。
 *
 * @module @mecha/shared-kernel/contracts/diagnostics
 */

import { z } from 'zod';

export const DiagnosticLevel = z.enum(['info', 'warn', 'error']);

/** 单条诊断记录 */
export const DiagnosticContract = z.object({
  level: DiagnosticLevel.default('warn'),
  /** 机器可读错误码，如 UNKNOWN_PREDICATE / SKILL_KEY_MISSING / ORPHAN_FOREIGN_KEY */
  code: z.string().min(1),
  message: z.string().min(1),
  /** 出问题的实体 id（单位 / 技能 / 词条），便于定位 */
  entity: z.string().optional(),
  /** 出问题的具体字段名 */
  field: z.string().optional(),
  /** 时间戳（ms） */
  at: z.number().int().default(() => Date.now()),
});

export type Diagnostic = z.infer<typeof DiagnosticContract>;

/**
 * 任意业务结果都可混入此形状，挂载 diagnostics 数组。
 * 用法：
 *   const r = WithDiagnostics.parse(result);
 *   r.diagnostics → Diagnostic[]
 */
export const WithDiagnostics = z.object({
  diagnostics: z.array(DiagnosticContract).default([]),
});

export type WithDiagnosticsType = z.infer<typeof WithDiagnostics>;

/**
 * 便捷构造器：在引擎 / 网关任意位置直接生成一条标准诊断。
 * 例：pushDiagnostic(arr, 'error', 'UNKNOWN_PREDICATE', '未知谓语 ...', { entity: skillId })
 */
export function makeDiagnostic(
  level: 'info' | 'warn' | 'error',
  code: string,
  message: string,
  extra?: { entity?: string; field?: string },
): Diagnostic {
  return DiagnosticContract.parse({
    level,
    code,
    message,
    entity: extra?.entity,
    field: extra?.field,
    at: Date.now(),
  });
}

/** 往诊断数组里推一条（就地修改传入数组） */
export function pushDiagnostic(
  arr: Diagnostic[],
  level: 'info' | 'warn' | 'error',
  code: string,
  message: string,
  extra?: { entity?: string; field?: string },
): void {
  arr.push(makeDiagnostic(level, code, message, extra));
}
