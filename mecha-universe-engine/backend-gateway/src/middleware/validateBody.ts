/**
 * Phase B-4 — 跨信任边界 Zod 校验中间件（Macro 边界全量 safeParse）
 *
 * 设计纪律（B-4 双层校验）：
 * - Macro 边界（房间创建 / 地图加载 / pending-units / end-deployment / 路由入参）
 *   用聚合契约（BattleStateContract 等）全量 safeParse，拦截脏数据进入系统。
 * - Micro 循环（A-5 applyPatch 的逐条 patch）只 parse PatchContract，不重复全量校验，
 *   保证结算热路径性能（B-4 性能边界：热路径不得引入聚合契约全量调用）。
 *
 * 用法：
 *   router.post('/x', authenticate, validateBody(BattleStateContract), handler)
 * 失败返回 400 { error:'VALIDATION_ERROR', message, issues }，issues 含字段级明细。
 */

import type { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

/**
 * 生成「按指定 schema 校验 req.body」的中间件工厂。
 * @param schema Zod schema（建议传聚合契约，如 BattleStateContract）
 * @param target 校验目标，默认 'body'（可扩展为 'query'/'params'）
 */
export function validateBody<T extends ZodSchema>(
  schema: T,
  target: 'body' | 'query' | 'params' = 'body',
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const data = (req as unknown as Record<string, unknown>)[target];
    const result = schema.safeParse(data);
    if (!result.success) {
      const issues = (result.error as ZodError).issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      }));
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: '请求数据未通过契约校验',
        issues,
      });
      return;
    }
    // 用解析后的安全数据覆盖原对象，下游 handler 拿到的即是合规形状
    (req as unknown as Record<string, unknown>)[target] = result.data;
    next();
  };
}

export { validateBody as default };
