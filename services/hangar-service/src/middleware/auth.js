/**
 * 用户认证中间件
 * 在微服务架构中，认证由 auth-service (端口3000) 负责。
 * hangar-service 通过转发请求头中的用户信息来识别用户。
 * 
 * 支持两种模式：
 * 1. 内嵌JWT验证（开发/独立运行时使用）
 * 2. 信任 X-User-Id 头（通过API网关/auth-service转发时使用）
 */
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'mecha-battle-auth-secret-key';

function authMiddleware(req, res, next) {
  // 模式1：信任上游服务转发的用户信息
  const userIdHeader = req.headers['x-user-id'];
  if (userIdHeader) {
    req.user = { id: parseInt(userIdHeader), userId: parseInt(userIdHeader) };
    return next();
  }

  // 模式2：内嵌JWT验证（独立运行时）
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: '未提供认证信息' });
  }

  const token = authHeader.replace('Bearer ', '');
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    // 统一处理 userId/id/user_id 字段名
    req.user.id = decoded.userId || decoded.user_id || decoded.id;
    next();
  } catch (error) {
    res.status(401).json({ error: '认证失败' });
  }
}

export default authMiddleware;
