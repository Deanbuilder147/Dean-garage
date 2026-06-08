import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import db from '../database/db.js';
import config from '../config/index.js';

const router = express.Router();

// Zod validation schemas
const registerSchema = z.object({
  username: z.string().min(3, "用户名长度至少 3 个字符").max(20, "用户名长度不能超过 20 个字符"),
  password: z.string().min(6, "密码长度至少 6 个字符").max(100, "密码长度不能超过 100 个字符")
});

const loginSchema = z.object({
  username: z.string().min(1, "用户名必填"),
  password: z.string().min(1, "密码必填")
});

// 注册
router.post('/register', async (req, res) => {
  try {
    // Validate input with Zod
    const validated = registerSchema.parse(req.body);
    const { username, password } = validated;
    
    // Check if user exists
    const existing = db.get('SELECT id FROM users WHERE username = ?', [username]);
    
    if (existing) {
      return res.status(400).json({ error: '用户名已存在' });
    }
    
    // 加密密码
    const passwordHash = await bcrypt.hash(password, config.bcryptRounds);
    
    // 创建用户
    const result = db.run(
      'INSERT INTO users (username, password_hash) VALUES (?, ?)',
      [username, passwordHash]
    );
    
    res.status(201).json({ 
      message: '注册成功',
      user: {
        id: result.lastInsertRowid,
        username
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: '验证失败',
        details: error.errors.map(e => ({ field: e.path[0], message: e.message }))
      });
    }
    console.error('Register error:', error);
    res.status(500).json({ error: '注册失败' });
  }
});

// 登录
router.post('/login', async (req, res) => {
  try {
    // Validate input with Zod
    const validated = loginSchema.parse(req.body);
    const { username, password } = validated;
    
    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码必填' });
    }
    
    // 查找用户
    const user = db.get('SELECT * FROM users WHERE username = ?', [username]);
    
    if (!user) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }
    
    // 验证密码
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }
    
    // 生成JWT
    const token = jwt.sign(
      { userId: user.id, username: user.username },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn }
    );
    
    res.json({
      message: '登录成功',
      token,
      user: {
        id: user.id,
        username: user.username
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: '登录失败' });
  }
});

// 获取当前用户信息
router.get('/me', (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: '未授权' });
    }
    
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, config.jwtSecret);
    
    const user = db.get(
      'SELECT id, username, created_at FROM users WHERE id = ?',
      [decoded.userId]
    );
    
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }
    
    res.json({ user });
  } catch (error) {
    console.error('Auth check error:', error);
    res.status(401).json({ error: 'Token 无效或已过期' });
  }
});

// 验证Token
router.get('/verify', (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ valid: false, error: '未授权' });
    }
    
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, config.jwtSecret);
    
    res.json({ valid: true, userId: decoded.userId, username: decoded.username });
  } catch (error) {
    res.status(401).json({ valid: false, error: 'Token无效或已过期' });
  }
});

export default router;
