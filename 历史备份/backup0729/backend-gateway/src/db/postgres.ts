/**
 * Phase 29-DataSecurity — PostgreSQL 持久层双源桥接
 *
 * 连接旧架构 mecha-battle-db:5432，用于复活老账号。
 * 查询旧表 users，执行 Bcrypt 哈希对账，成功后自动迁移资产至 SQLite。
 */

import pg from 'pg';
import { config } from '../config.js';

const { Pool } = pg;

let pool: pg.Pool | null = null;

/** 延迟初始化 PostgreSQL 连接池 */
export function getPgPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({
      host: config.postgres.host,
      port: config.postgres.port,
      database: config.postgres.database,
      user: config.postgres.user,
      password: config.postgres.password,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    pool.on('error', (err) => {
      console.error('[PG] 连接池异常:', err.message);
    });
  }
  return pool;
}

/** 安全查询 PostgreSQL（带连接失败熔断） */
export async function pgQuery<T = Record<string, any>>(
  text: string,
  params: any[] = []
): Promise<T[]> {
  try {
    const client = await getPgPool().connect();
    try {
      const result = await client.query(text, params);
      return result.rows as T[];
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error(`[PG] 查询失败: ${err.message}`);
    return [];
  }
}

/** 查询单行 */
export async function pgGetOne<T = Record<string, any>>(
  text: string,
  params: any[] = []
): Promise<T | null> {
  const rows = await pgQuery<T>(text, params);
  return rows.length > 0 ? rows[0] : null;
}

/** 写入 PostgreSQL */
export async function pgExecute(
  text: string,
  params: any[] = []
): Promise<void> {
  try {
    const client = await getPgPool().connect();
    try {
      await client.query(text, params);
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error(`[PG] 写入失败: ${err.message}`);
    throw err;
  }
}

/** 测试 PostgreSQL 连通性 */
export async function pgHealthCheck(): Promise<boolean> {
  try {
    const row = await pgGetOne('SELECT 1 AS ok');
    return row !== null;
  } catch {
    return false;
  }
}

/** 关闭连接池 */
export async function closePgPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
