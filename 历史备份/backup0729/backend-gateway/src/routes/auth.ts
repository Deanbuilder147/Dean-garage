/**
 * Phase 29-X — 认证路由 (sql.js)
 *
 * 大一统登录/注册管线，使用 bcrypt + JWT。
 */

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config.js';
import { run, get, all, persistChanges } from '../db/sqlite.js';
import { pgGetOne, pgQuery } from '../db/postgres.js';
import { authenticate, requireAuth } from '../middleware/auth.js';
import { ErrorCode, UserRole } from '@mecha/shared-kernel';
import type { LoginRequest, RegisterRequest, AuthResponse, UserProfile } from '@mecha/shared-kernel';

const router = Router();

router.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body as RegisterRequest;

    if (!username || !email || !password) {
      res.status(400).json({ error: ErrorCode.VALIDATION_ERROR, message: '用户名、邮箱和密码为必填项' });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: ErrorCode.VALIDATION_ERROR, message: '密码至少 6 位' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: ErrorCode.VALIDATION_ERROR, message: '邮箱格式不正确' });
      return;
    }

    const existing = get('SELECT id FROM users WHERE username = ? OR email = ?', [username, email]);
    if (existing) {
      res.status(409).json({ error: 'DUPLICATE', message: '用户名或邮箱已存在' });
      return;
    }

    const id = uuidv4();
    const passwordHash = await bcrypt.hash(password, config.bcryptRounds);

    run('INSERT INTO users (id, username, email, password_hash, faction, permission, role, credits) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, username, email, passwordHash, 'earth', 1, UserRole.USER, 10]);
    persistChanges();

    const user: UserProfile = {
      id, username, email, faction: 'earth',
      permission: 1, role: UserRole.USER, credits: 10,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const token = jwt.sign(
      { userId: id, username, permission: 1, role: UserRole.USER, credits: 10 },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn as any }
    );

    console.log(`[Auth] 新用户注册: ${username}`);
    res.status(201).json({ token, user } satisfies AuthResponse);
  } catch (err) {
    console.error('[Auth] 注册错误:', err);
    res.status(500).json({ error: ErrorCode.INTERNAL_ERROR, message: '注册失败' });
  }
});

router.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body as LoginRequest;

    if (!username || !password) {
      res.status(400).json({ error: ErrorCode.VALIDATION_ERROR, message: '用户名和密码为必填项' });
      return;
    }

    // ============================================
    // Phase 29-DataSecurity: 双源对账管线
    // 第一源：SQLite 大一统主库
    // ============================================
    let row = get(
      'SELECT id, username, email, password_hash, faction, permission, role, credits, created_at, updated_at FROM users WHERE username = ?',
      [username]
    ) as any;

    let migratedFromPg = false;

    // ============================================
    // 第二源：PostgreSQL 旧库（SQLite 未命中时触发）
    // ============================================
    if (!row) {
      console.log(`[Auth] SQLite 未命中 ${username}，检索 PostgreSQL 旧库...`);
      const pgRow = await pgGetOne(
        'SELECT id, username, email, password_hash, faction, role, credits, created_at, updated_at FROM users WHERE username = $1',
        [username]
      );

      if (pgRow) {
        // 验证旧库 Bcrypt 哈希
        const valid = await bcrypt.compare(password, pgRow.password_hash);
        if (valid) {
          console.log(`[Auth] PostgreSQL 旧库命中 ${username}，执行资产平移...`);

          // 无损平移用户到 SQLite
          const id = pgRow.id || uuidv4();
          const email = pgRow.email || `${username}@legacy.local`;
          const faction = pgRow.faction || 'earth';
          const role = pgRow.role || UserRole.USER;
          const credits = typeof pgRow.credits === 'number' ? pgRow.credits : 10;
          const createdAt = pgRow.created_at || new Date().toISOString();
          const updatedAt = pgRow.updated_at || new Date().toISOString();

          // 检查是否已有同 ID 用户（防止冲突）
          const existing = get('SELECT id FROM users WHERE id = ? OR username = ?', [id, username]);
          if (!existing) {
            run(
              'INSERT INTO users (id, username, email, password_hash, faction, permission, role, credits, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
              [id, username, email, pgRow.password_hash, faction, 1, role, credits, createdAt, updatedAt]
            );

            // Phase 29-DataSecurity: 自动平移旧资产（单位 + 地图）
            await migrateLegacyAssets(id, username);
            persistChanges();
            console.log(`[Auth] 老账号 ${username} 资产平移完成`);
          }

          row = { id, username, email, password_hash: pgRow.password_hash, faction, permission: 1, role, credits, created_at: createdAt, updated_at: updatedAt };
          migratedFromPg = true;
        }
      }
    }

    // 双源均未命中 → 401
    if (!row) {
      res.status(401).json({ error: ErrorCode.AUTH_CREDENTIALS_INVALID, message: '用户名或密码错误' });
      return;
    }

    // 密码验证（非 PG 迁移路径需要再次验证）
    if (!migratedFromPg) {
      const valid = await bcrypt.compare(password, row.password_hash);
      if (!valid) {
        res.status(401).json({ error: ErrorCode.AUTH_CREDENTIALS_INVALID, message: '用户名或密码错误' });
        return;
      }
    }

    const userRole = (row.role || UserRole.USER) as UserRole;
    const userCredits = typeof row.credits === 'number' ? row.credits : 10;

    const user: UserProfile = {
      id: row.id, username: row.username, email: row.email,
      faction: row.faction, permission: row.permission,
      role: userRole, credits: userCredits,
      createdAt: row.created_at, updatedAt: row.updated_at,
    };

    const token = jwt.sign(
      { userId: row.id, username: row.username, permission: row.permission, role: userRole, credits: userCredits },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn as any }
    );

    console.log(`[Auth] 用户登录: ${username} (role=${userRole}, pg_migrated=${migratedFromPg})`);
    res.json({ token, user } satisfies AuthResponse);
  } catch (err) {
    console.error('[Auth] 登录错误:', err);
    res.status(500).json({ error: ErrorCode.INTERNAL_ERROR, message: '登录失败' });
  }
});

router.get('/api/auth/me', authenticate, requireAuth, (req, res) => {
  const row = get('SELECT id, username, email, faction, permission, role, credits, created_at, updated_at FROM users WHERE id = ?', [req.auth!.userId]);

  if (!row) {
    res.status(404).json({ error: 'USER_NOT_FOUND', message: '用户不存在' });
    return;
  }

  res.json({
    id: row.id, username: row.username, email: row.email,
    faction: row.faction, permission: row.permission,
    role: (row.role || UserRole.USER) as UserRole,
    credits: typeof row.credits === 'number' ? row.credits : 10,
    createdAt: row.created_at, updatedAt: row.updated_at,
  } satisfies UserProfile);
});

router.get('/api/auth/health', (_req, res) => {
  res.json({ status: 'ok', service: 'auth', engine: 'mecha-universe' });
});

// ========================================
// Phase 29-DataSecurity: 老账号资产自动平移
// 从 PostgreSQL 迁移旧用户的单位/地图到 SQLite
// ========================================
async function migrateLegacyAssets(userId: string, username: string): Promise<void> {
  try {
    // 平移旧单位（PG schema: owner_id，无 created_by 列）
    const oldUnits = await pgQuery(
      'SELECT * FROM units WHERE owner_id = $1',
      [userId]
    ) as any[];

    let unitCount = 0;
    for (const u of oldUnits) {
      const existing = get('SELECT id FROM units WHERE id = ?', [u.id || uuidv4()]);
      if (!existing) {
        run(
          `INSERT INTO units (id, owner_id, name, faction, category, tier, sprite_key, stats, skills, is_public_copy, is_public, review_status, original_author_id, attributes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            u.id || uuidv4(),
            userId,
            u.name || 'Legacy Unit',
            u.faction || 'earth',
            u.category || 'melee',
            u.tier || 1,
            u.sprite_key || null,
            u.stats || '{}',
            u.skills || '[]',
            u.is_public_copy ? 1 : 0,
            u.is_public ? 1 : 0,
            u.review_status || 'pending',
            u.original_author_id || null,
            u.attributes || '{}',
          ]
        );
        unitCount++;
      }
    }

    // 平移旧地图（PG schema: original_author_id，无 owner_id 列）
    const oldMaps = await pgQuery(
      'SELECT * FROM maps WHERE original_author_id = $1',
      [userId]
    ) as any[];

    let mapCount = 0;
    for (const m of oldMaps) {
      const existing = get('SELECT id FROM maps WHERE id = ?', [m.id || uuidv4()]);
      if (!existing) {
        run(
          `INSERT INTO maps (id, name, width, height, cells, spawn_points, is_public_copy, is_public, review_status, original_author_id, attributes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            m.id || uuidv4(),
            m.name || 'Legacy Map',
            m.width || 20,
            m.height || 30,
            m.cells || '[]',
            m.spawn_points || '[]',
            m.is_public_copy ? 1 : 0,
            m.is_public ? 1 : 0,
            m.review_status || 'pending',
            userId,
            m.attributes || '{}',
          ]
        );
        mapCount++;
      }
    }

    if (unitCount > 0 || mapCount > 0) {
      console.log(`[Auth] 资产平移: ${username} → ${unitCount} 单位 + ${mapCount} 地图`);
    }
  } catch (err: any) {
    console.error(`[Auth] 资产平移失败 (${username}):`, err.message);
  }
}

export default router;
