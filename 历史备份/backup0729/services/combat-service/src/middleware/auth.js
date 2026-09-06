/**
 * auth.js - JWT 认证中间件
 * 从 Authorization header 提取token，验证用户身份
 */
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'mecha-wargame-secret-key';

function authenticate(req, res, next) {
  // 开发模式下跳过认证
  if (process.env.NODE_ENV === 'development' || process.env.SKIP_AUTH === 'true') {
    req.user = { id: 1, name: 'Commander', faction: 'earth' };
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未提供认证令牌' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: '认证令牌无效或已过期' });
  }
}

export { authenticate };
