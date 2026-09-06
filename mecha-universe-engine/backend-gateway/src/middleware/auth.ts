/**
 * Phase 29-P1 — JWT 认证中间件
 *
 * 柔性放行：游客/观战流（无 Token）不拒绝，仅标记 auth 上下文。
 * 白名单路径不强制要求 Token。
 * 四级角色中间件：referee/admin/dominator 等高权限操作卡死。
 */

import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { ErrorCode, UserRole } from '@mecha/shared-kernel';
import type { AuthPayload } from '@mecha/shared-kernel';
import { resolveRoleFeatures } from '../services/featurePermissions.js';

// 扩展 Express Request 类型
declare global {
  namespace Express {
    interface Request {
      auth?: AuthPayload;
      user?: AuthPayload;
      isAuthenticated: boolean;
    }
  }
}

// 公开路径：无需 Token 的游客层、观战流、鉴权入口
// Phase 29-P1: 追加试玩战役、房间列表（供观战）白名单
const PUBLIC_PATHS = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/health',
  '/api/comm/watch-feed',
  '/api/comm/watch-buffer-status',
  '/api/campaign/trial',
  '/health',
  // Phase 29-DataSecurity: glossary GET 路由无中间件，无需白名单；
  // POST /config 需 authenticate 后再做角色卡口
];

// 柔性白名单前缀：以这些前缀开头的 GET 请求也放行游客
const PUBLIC_GET_PREFIXES = [
  '/api/rooms',          // 允许游客浏览房间列表（观战入口）
  '/api/leaderboard',    // 允许游客查看天梯排行
  '/api/map/list',          // 游客浏览公开地图列表
  '/api/map/battlefields',  // 游客浏览战场地图（含 /:id 详情）
  // 注意：/api/map/review-queue 等管理类接口【不在】白名单，
  // 否则 authenticate 会柔性放行导致 requireRole 误判 401（地图审核台跳登录问题）。
  // Phase 29-DataSecurity: glossary GET 路由由无中间件体系直接放行，无需白名单
];

function isPublicPath(path: string, method: string): boolean {
  // 精确匹配
  if (PUBLIC_PATHS.some(p => path === p || path.startsWith(p + '?'))) return true;
  // 前缀匹配（仅 GET）
  if (method === 'GET' && PUBLIC_GET_PREFIXES.some(p => path.startsWith(p))) return true;
  return false;
}

/**
 * 柔性认证中间件
 * - 有有效 Token：解析并挂载 auth 上下文
 * - 无 Token 且为公开路径：放行，isAuthenticated = false
 * - 无 Token 且为私有路径：返回 401
 * - Token 过期/无效：返回 401
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  req.isAuthenticated = false;

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  // 无 Token 的分支
  if (!token) {
    // 使用 originalUrl 防止 router.use() 剥离路径前缀导致误判
    const effectivePath = req.originalUrl || req.path;
    if (isPublicPath(effectivePath, req.method)) {
      return next(); // 公开路径：柔性放行
    }
    res.status(401).json({
      error: ErrorCode.AUTH_TOKEN_MISSING,
      message: '请先登录',
    });
    return;
  }

  // 验证 Token
  try {
    const payload = jwt.verify(token, config.jwt.secret) as AuthPayload;
    req.auth = payload;
    req.user = payload;
    req.isAuthenticated = true;
    next();
  } catch (err: unknown) {
    const code = err instanceof jwt.TokenExpiredError
      ? ErrorCode.AUTH_TOKEN_EXPIRED
      : ErrorCode.AUTH_TOKEN_INVALID;

    res.status(401).json({
      error: code,
      message: code === ErrorCode.AUTH_TOKEN_EXPIRED ? '登录已过期，请重新登录' : '无效的认证凭据',
    });
  }
}

/**
 * 强制认证中间件：非已认证用户直接拒绝
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.isAuthenticated || !req.auth) {
    res.status(401).json({
      error: ErrorCode.AUTH_TOKEN_MISSING,
      message: '此操作需要登录',
    });
    return;
  }
  next();
}

/**
 * Phase 29-P1: 角色权限中间件 — 仅允许指定角色访问
 * @param roles 允许访问的角色列表
 */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({
        error: ErrorCode.AUTH_TOKEN_MISSING,
        message: '请先登录',
      });
      return;
    }

    const userRole = (req.auth.role || UserRole.USER) as UserRole;
    if (!roles.includes(userRole)) {
      const roleNames = roles.join(' / ');
      res.status(403).json({
        error: ErrorCode.ROLE_FORBIDDEN,
        message: `权限不足：仅限 ${roleNames} 级别执行此操作`,
      });
      return;
    }
    next();
  };
}

/**
 * 管理员权限中间件（兼容旧版数值级 permission）
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.auth || req.auth.permission < 3) {
    res.status(403).json({
      error: 'FORBIDDEN',
      message: '需要管理员权限',
    });
    return;
  }
  next();
}

/**
 * Phase 30-Perm — 等级-功能权限矩阵中间件。
 * 网关内置 dominator 硬编码逃生通道：永远放行全部功能。
 * 其余等级按 feature_permissions 矩阵查该 featureKey 是否启用，未启用 → 403。
 * 取代原先「仅 admin 可改」的粗放控制，实现 referee 勾选 glossary.edit 即可越权编辑。
 */
export function requireFeature(featureKey: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({ error: ErrorCode.AUTH_TOKEN_MISSING, message: '请先登录' });
      return;
    }
    const role = req.auth.role as UserRole;
    if (role === UserRole.DOMINATOR) return next(); // 逃生通道，硬编码永远放行
    const enabled = resolveRoleFeatures(role || '');
    // 管理员(referee)与主宰(dominator)放行全部功能；旧 admin 角色保留兼容
    if (enabled.includes(featureKey) || role === UserRole.REFEREE || role === UserRole.ADMIN) return next();
    res.status(403).json({
      error: ErrorCode.ROLE_FORBIDDEN,
      message: `权限不足：等级 ${role || 'unknown'} 未启用功能 ${featureKey}`,
    });
  };
}
