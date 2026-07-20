/**
 * Phase 29-X — SQLite 持久化模块 (sql.js 实现)
 *
 * 使用纯 JavaScript 的 sql.js，无原生编译依赖，构建速度快。
 * 统一执政所有房间、用户、战斗数据。
 */

import initSqlJs, { type Database, type Statement } from 'sql.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from '../config.js';
import { RoomStatus } from '@mecha/shared-kernel';

let db: Database;

// 辅助函数：包装 sql.js 的 run/get/all 为更友好的接口
function run(sql: string, params: any[] = []): void {
  db.run(sql, params);
}

function get<T = Record<string, any>>(sql: string, params: any[] = []): T | undefined {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const cols: string[] = stmt.getColumnNames();
    const vals: any[] = stmt.get();
    stmt.free();
    const row: Record<string, any> = {};
    cols.forEach((col: string, i: number) => { row[col] = vals[i]; });
    return row as T;
  }
  stmt.free();
  return undefined;
}

function all<T = Record<string, any>>(sql: string, params: any[] = []): T[] {
  const results: T[] = [];
  const stmt = db.prepare(sql);
  stmt.bind(params);
  while (stmt.step()) {
    const cols: string[] = stmt.getColumnNames();
    const vals: any[] = stmt.get();
    const row: Record<string, any> = {};
    cols.forEach((col: string, i: number) => { row[col] = vals[i]; });
    results.push(row as T);
  }
  stmt.free();
  return results;
}

// 持久化到磁盘
function saveToDisk(): void {
  const data = db.export();
  const buffer = Buffer.from(data);
  const dbDir = dirname(config.dbPath);
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }
  writeFileSync(config.dbPath, buffer);
}

// 从磁盘加载
function loadFromDisk(): Uint8Array | null {
  if (existsSync(config.dbPath)) {
    return readFileSync(config.dbPath);
  }
  return null;
}

export async function initDatabase(): Promise<Database> {
  const SQL = await initSqlJs();

  const existingData = loadFromDisk();
  if (existingData) {
    db = new SQL.Database(existingData);
  } else {
    db = new SQL.Database();
  }

  // 启用外键
  db.run('PRAGMA foreign_keys = ON');

  createTables();
  saveToDisk();

  console.log('[DB] SQLite (sql.js) 数据库初始化完成:', config.dbPath);
  return db;
}

function createTables(): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      faction TEXT DEFAULT 'earth',
      permission INTEGER DEFAULT 1,
      role TEXT DEFAULT 'user',
      credits INTEGER DEFAULT 10,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT '${RoomStatus.WAITING}',
      host_id TEXT NOT NULL REFERENCES users(id),
      map_id TEXT NOT NULL,
      max_players INTEGER DEFAULT 4,
      turn_time_limit INTEGER DEFAULT 60,
      is_private INTEGER DEFAULT 0,
      password_hash TEXT,
      rules TEXT DEFAULT '{}',
      battle_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS room_players (
      room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id),
      username TEXT NOT NULL,
      faction TEXT DEFAULT 'earth',
      team INTEGER DEFAULT 0,
      ready INTEGER DEFAULT 0,
      joined_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (room_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS room_chats (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id),
      username TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS battles (
      id TEXT PRIMARY KEY,
      room_id TEXT REFERENCES rooms(id),
      map_id TEXT,
      winner_id TEXT,
      status TEXT DEFAULT 'pending',
      log_data TEXT DEFAULT '[]',
      started_at TEXT,
      finished_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS units (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      faction TEXT DEFAULT 'earth',
      category TEXT DEFAULT 'melee',
      tier INTEGER DEFAULT 1,
      sprite_key TEXT,
      stats TEXT NOT NULL DEFAULT '{}',
      skills TEXT DEFAULT '[]',
      is_public_copy INTEGER DEFAULT 0,
      is_public INTEGER DEFAULT 0,
      review_status TEXT DEFAULT 'pending',
      original_author_id TEXT,
      generation_status TEXT DEFAULT 'completed',
      attributes TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status);
    CREATE INDEX IF NOT EXISTS idx_rooms_host ON rooms(host_id);
    CREATE INDEX IF NOT EXISTS idx_room_players_user ON room_players(user_id);
    CREATE INDEX IF NOT EXISTS idx_room_chats_room ON room_chats(room_id);
    CREATE INDEX IF NOT EXISTS idx_units_owner ON units(owner_id);
    CREATE INDEX IF NOT EXISTS idx_battles_room ON battles(room_id);
  `);

  // Phase 29-P1: 存量数据库迁移 — 为旧版 users/units 表追加新列
  migrateExistingTables();
}

/** Phase 29-P1: 安全迁移存量表结构 */
function migrateExistingTables(): void {
  try {
    _migrateExistingTablesInner();
  } catch (e: any) {
    const msg = e?.message || String(e);
    // 已存在的列导致的 duplicate 错误可以安全忽略
    if (msg.includes('duplicate column') || msg.includes('already exists')) {
      console.log(`[DB] 迁移信息（已存在，跳过）: ${msg}`);
      return;
    }
    // 其他错误继续抛出
    console.error('[DB] 迁移失败:', msg);
    throw e;
  }
}

function _migrateExistingTablesInner(): void {
  const userCols = all('PRAGMA table_info(users)') as any[];
  const colNames = userCols.map((c: any) => c.name);

  if (!colNames.includes('role')) {
    db.run("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'");
    console.log('[DB] 迁移：users 表添加 role 列');
  }
  if (!colNames.includes('credits')) {
    db.run('ALTER TABLE users ADD COLUMN credits INTEGER DEFAULT 10');
    console.log('[DB] 迁移：users 表添加 credits 列');
  }

  const unitCols = all('PRAGMA table_info(units)') as any[];
  const unitColNames = unitCols.map((c: any) => c.name);

  if (!unitColNames.includes('original_author_id')) {
    db.run('ALTER TABLE units ADD COLUMN original_author_id TEXT');
    console.log('[DB] 迁移：units 表添加 original_author_id 列');
  }

  // Phase 29-DataSecurity: is_public / review_status 审核卡口
  // 防御性迁移: sql.js 的 PRAGMA table_info 对已持久化 DB 可能不准确，用 try-catch 兜底
  const safeAlter = (table: string, col: string, sql: string, label: string) => {
    try {
      db.run(sql);
      console.log(`[DB] 迁移：${label}`);
    } catch (e: any) {
      if (e?.message?.includes('duplicate column')) {
        console.log(`[DB] 迁移跳过：${label} (列已存在)`);
      } else {
        throw e;
      }
    }
  };

  if (!unitColNames.includes('is_public')) {
    safeAlter('units', 'is_public', 'ALTER TABLE units ADD COLUMN is_public INTEGER DEFAULT 0', 'units 表添加 is_public 列');
  }
  if (!unitColNames.includes('review_status')) {
    safeAlter('units', 'review_status', "ALTER TABLE units ADD COLUMN review_status TEXT DEFAULT 'pending'", 'units 表添加 review_status 列');
  }

  // Phase 29-DataSecurity: maps 表审核卡口
  const mapCols = all('PRAGMA table_info(maps)') as any[];
  const mapColNames = mapCols.map((c: any) => c.name);

  // 确保 maps 表存在
  db.run(`
    CREATE TABLE IF NOT EXISTS maps (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      width INTEGER DEFAULT 20,
      height INTEGER DEFAULT 30,
      cells TEXT DEFAULT '[]',
      spawn_points TEXT DEFAULT '[]',
      is_public_copy INTEGER DEFAULT 0,
      is_public INTEGER DEFAULT 0,
      review_status TEXT DEFAULT 'pending',
      original_author_id TEXT,
      generation_status TEXT DEFAULT 'completed',
      attributes TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  if (!mapColNames.includes('is_public')) {
    db.run('ALTER TABLE maps ADD COLUMN is_public INTEGER DEFAULT 0');
    console.log('[DB] 迁移：maps 表添加 is_public 列');
  }
  if (!mapColNames.includes('review_status')) {
    db.run("ALTER TABLE maps ADD COLUMN review_status TEXT DEFAULT 'pending'");
    console.log('[DB] 迁移：maps 表添加 review_status 列');
  }
  if (!mapColNames.includes('original_author_id')) {
    db.run('ALTER TABLE maps ADD COLUMN original_author_id TEXT');
    console.log('[DB] 迁移：maps 表添加 original_author_id 列');
  }
}

// 数据持久化中间件：每次写操作后自动保存
export function persistChanges(): void {
  saveToDisk();
}

export function getDatabase(): Database {
  if (!db) {
    throw new Error('[DB] 数据库未初始化，请先调用 initDatabase()');
  }
  return db;
}

// 导出封装方法供路由使用
export { run, get, all, saveToDisk };
