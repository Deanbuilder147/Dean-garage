/**
 * 统一结构化日志（阶段二基建）
 * 替代散落各处的 console.*，防止生产环境泄露 battleId / username / 部署池等敏感上下文。
 * - 开发环境：pino-pretty 美化输出
 * - 生产环境：纯 JSON 结构化 + 脱敏高危字段
 */
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport:
    process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  // 脱敏：JWT 与任何潜在的密码字段不落日志
  redact: ['req.headers.authorization', 'req.body.password', 'req.body.factionPasswords'],
});

export default logger;
