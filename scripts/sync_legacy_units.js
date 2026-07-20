#!/usr/bin/env node
/**
 * Phase 29-Rescure — PG → SQLite 历史单位全量同步脚本
 *
 * 功能：
 *   1. 从 PostgreSQL (mecha-battle-db:5432) 拉取 dean147 的历史 AI 单位
 *   2. 字段映射转换：stats/skills/action_points → 大一统 SQLite 结构
 *   3. INSERT OR IGNORE 批量灌入 gateway SQLite (/data/mecha-universe.db)
 *
 * 用法（在 gateway 容器内）：
 *   node scripts/sync_legacy_units.js --dry-run    # 干跑预览
 *   node scripts/sync_legacy_units.js              # 正式执行
 *
 * 依赖：pg（node-postgres）、sql.js
 */

const { Pool } = require('pg');
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ============================================================
// 零、配置
// ============================================================

const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose') || DRY_RUN;

// PostgreSQL 连接配置（从环境变量读取，与 gateway config 一致）
const PG_CONFIG = {
  host: process.env.PG_HOST || 'mecha-battle-db',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  database: process.env.PG_DATABASE || 'mecha_battle',
  user: process.env.PG_USER || 'mecha_user',
  password: process.env.PG_PASSWORD || 'mecha_user_password',
};

// SQLite 目标路径
const TARGET_DB = process.env.TARGET_DB || '/data/mecha-universe.db';

// 目标用户（dean147 的 userId）
const DEAN147_OWNER_ID = 'dominator-dean147';

// ============================================================
// 一、字段映射：PG 旧结构 → SQLite 新结构
// ============================================================

/**
 * 将 PG 中的旧单位行映射为 SQLite 插入对象
 *
 * PG 可能的列名（旧架构）:
 *   id, name, owner_id, faction, category, tier, sprite_key,
 *   stats (JSON string or object), skills (JSON string or array),
 *   hp, attack, defense, speed, action_points, attributes,
 *   created_at, updated_at
 *
 * SQLite units 表结构:
 *   id, owner_id, name, faction, category, tier, sprite_key,
 *   stats TEXT, skills TEXT, is_public_copy INTEGER, is_public INTEGER,
 *   review_status TEXT, original_author_id TEXT,
 *   generation_status TEXT DEFAULT 'completed',
 *   attributes TEXT, created_at TEXT, updated_at TEXT
 */
function mapPgUnitToSqlite(pgRow) {
  // 解析 stats
  let stats = pgRow.stats;
  if (typeof stats === 'string') {
    try { stats = JSON.parse(stats); } catch { stats = {}; }
  }
  if (!stats || typeof stats !== 'object') stats = {};

  // 如果 PG 有独立 hp/attack/defense/speed 列，合并进 stats
  const flatFields = ['hp', 'attack', 'defense', 'speed', 'action_points'];
  for (const f of flatFields) {
    if (pgRow[f] !== undefined && pgRow[f] !== null) {
      if (stats[f] === undefined) stats[f] = pgRow[f];
    }
  }

  // 解析 skills
  let skills = pgRow.skills;
  if (typeof skills === 'string') {
    try { skills = JSON.parse(skills); } catch { skills = []; }
  }
  if (!Array.isArray(skills)) skills = [];

  // 解析 attributes
  let attributes = pgRow.attributes || pgRow.attrs;
  if (typeof attributes === 'string') {
    try { attributes = JSON.parse(attributes); } catch { attributes = {}; }
  }
  if (!attributes || typeof attributes !== 'object') attributes = {};

  return {
    id: pgRow.id || crypto.randomUUID(),
    owner_id: pgRow.owner_id || DEAN147_OWNER_ID,
    name: pgRow.name || '未命名机体',
    faction: pgRow.faction || 'earth',
    category: pgRow.category || 'melee',
    tier: pgRow.tier || 1,
    sprite_key: pgRow.sprite_key || null,
    stats: JSON.stringify(stats),
    skills: JSON.stringify(skills),
    is_public_copy: 0,
    is_public: 1,                          // dominator 级别，直接 public
    review_status: 'approved',
    original_author_id: pgRow.owner_id || DEAN147_OWNER_ID,
    generation_status: pgRow.generation_status || 'completed',
    attributes: JSON.stringify(attributes),
    created_at: pgRow.created_at || new Date().toISOString(),
    updated_at: pgRow.updated_at || new Date().toISOString(),
  };
}

// ============================================================
// 二、PostgreSQL 查询
// ============================================================

async function fetchPgUnits(pool) {
  // 尝试多种可能的 PG 表结构
  const queries = [
    // 标准表结构
    `SELECT * FROM units WHERE owner_id = $1 OR owner_id LIKE $2`,
    // 如果有旧 owner_id 格式
    `SELECT * FROM units WHERE owner_id ILIKE $1`,
    // 查看所有表结构
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
  ];

  const client = await pool.connect();
  try {
    // 先查表结构
    console.log('[PG] 检查 PostgreSQL 表结构...');
    const tables = await client.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
    );
    console.log(`[PG] 现有表: ${tables.rows.map(r => r.table_name).join(', ')}`);

    // 检查 units 表的列
    try {
      const cols = await client.query(
        `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'units' AND table_schema = 'public'`
      );
      console.log(`[PG] units 表列: ${cols.rows.map(r => `${r.column_name}(${r.data_type})`).join(', ')}`);
    } catch {
      console.log('[PG] units 表不存在或无权限读取列信息');
    }

    // 查询 dean147 的单位（多种匹配模式）
    console.log(`\n[PG] 搜索 owner_id 匹配 'dean' 或 'dominator-dean147' 的单位...`);
    const result = await client.query(
      `SELECT * FROM units WHERE owner_id = $1 OR owner_id LIKE $2 OR owner_id ILIKE $3`,
      [DEAN147_OWNER_ID, '%dean%', '%dean147%']
    );
    console.log(`[PG] 找到 ${result.rows.length} 个单位`);
    return result.rows;
  } finally {
    client.release();
  }
}

// ============================================================
// 三、SQLite 写入
// ============================================================

async function insertIntoSQLite(db, units) {
  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO units
      (id, owner_id, name, faction, category, tier, sprite_key,
       stats, skills, is_public_copy, is_public, review_status,
       original_author_id, generation_status, attributes, created_at, updated_at)
    VALUES
      (:id, :owner_id, :name, :faction, :category, :tier, :sprite_key,
       :stats, :skills, :is_public_copy, :is_public, :review_status,
       :original_author_id, :generation_status, :attributes, :created_at, :updated_at)
  `);

  for (const unit of units) {
    try {
      insertStmt.bind(unit);
      const hasRow = insertStmt.step();
      insertStmt.reset();

      // 检查是否插入成功（通过查询确认）
      const existing = db.exec(`SELECT id FROM units WHERE id = '${unit.id}'`);
      if (existing.length > 0 && existing[0].values.length > 0) {
        inserted++;
        if (VERBOSE) console.log(`  ✓ ${unit.name} (${unit.id})`);
      } else {
        // 可能是 IGNORE 跳过的重复
        const check = db.exec(`SELECT id FROM units WHERE owner_id = '${unit.owner_id}' AND name = '${unit.name}'`);
        if (check.length > 0 && check[0].values.length > 0) {
          skipped++;
          if (VERBOSE) console.log(`  - ${unit.name} 已存在，跳过`);
        } else {
          inserted++;
        }
      }
    } catch (err) {
      errors++;
      console.error(`  ✗ ${unit.name}: ${err.message}`);
    }
  }

  insertStmt.free();
  return { inserted, skipped, errors };
}

// ============================================================
// 四、主流程
// ============================================================

async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║ Phase 29-Rescure: PG → SQLite 历史单位同步脚本    ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`  模式: ${DRY_RUN ? '🔍 DRY-RUN (仅预览)' : '🚀 正式执行'}`);
  console.log(`  PG 主机: ${PG_CONFIG.host}:${PG_CONFIG.port}/${PG_CONFIG.database}`);
  console.log(`  SQLite 目标: ${TARGET_DB}`);
  console.log(`  目标用户: ${DEAN147_OWNER_ID}`);
  console.log('');

  // 1. 连接 PostgreSQL
  const pool = new Pool({
    host: PG_CONFIG.host,
    port: PG_CONFIG.port,
    database: PG_CONFIG.database,
    user: PG_CONFIG.user,
    password: PG_CONFIG.password,
    max: 2,
    connectionTimeoutMillis: 10000,
  });

  let pgUnits;
  try {
    console.log('[PG] 连接 PostgreSQL...');
    const testResult = await pool.query('SELECT 1 AS ok');
    console.log(`[PG] 连接成功: ${testResult.rows[0].ok === 1 ? '✓' : '?'}`);
    pgUnits = await fetchPgUnits(pool);
  } catch (err) {
    console.error(`[PG] 连接失败: ${err.message}`);
    console.error('[PG] 请检查 PG_HOST/PG_PORT 环境变量是否正确设置');
    await pool.end();
    process.exit(1);
  } finally {
    // 保持 pool 用于后续查询
  }

  if (pgUnits.length === 0) {
    console.log('\n[结果] PostgreSQL 中未找到 dean147 的单位，无需同步。');
    await pool.end();
    process.exit(0);
  }

  console.log(`\n[PG] 找到 ${pgUnits.length} 个单位：`);
  pgUnits.forEach((u, i) => {
    console.log(`  ${i + 1}. ${u.name} | cat=${u.category || '?'} tier=${u.tier || '?'} | id=${u.id}`);
  });

  // 2. 字段映射
  const mapped = pgUnits.map(mapPgUnitToSqlite);
  console.log(`\n[映射] ${mapped.length} 个单位已完成字段转换`);

  if (DRY_RUN) {
    console.log('\n[Dry-Run] 转换预览（前 5 个）：');
    mapped.slice(0, 5).forEach((u, i) => {
      console.log(`\n  --- ${u.name} ---`);
      console.log(`  id: ${u.id}`);
      console.log(`  faction: ${u.faction}  category: ${u.category}  tier: ${u.tier}`);
      console.log(`  stats: ${u.stats}`);
      console.log(`  skills: ${u.skills}`);
      console.log(`  created_at: ${u.created_at}`);
    });
    console.log('\n[Dry-Run] 干跑完成，未写入数据库。去掉 --dry-run 参数以正式执行。');
    await pool.end();
    return;
  }

  // 3. 写入 SQLite
  console.log('\n[SQLite] 加载目标数据库...');
  if (!fs.existsSync(TARGET_DB)) {
    console.error(`[SQLite] 目标数据库不存在: ${TARGET_DB}`);
    console.error('[SQLite] 请确认 gateway 容器已启动并初始化数据库');
    await pool.end();
    process.exit(1);
  }

  const SQL = await initSqlJs();
  const buf = fs.readFileSync(TARGET_DB);
  const db = new SQL.Database(buf);

  console.log('[SQLite] 数据库加载成功，开始写入...');
  const { inserted, skipped, errors } = await insertIntoSQLite(db, mapped);

  // 持久化到磁盘
  const data = db.export();
  fs.writeFileSync(TARGET_DB, Buffer.from(data));
  console.log('[SQLite] 已持久化到磁盘');

  db.close();

  // 4. 输出报告
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║       同步完成 — 执行报告           ║');
  console.log('╠══════════════════════════════════════╣');
  console.log(`║  PG 来源单位:  ${String(pgUnits.length).padStart(6)}               ║`);
  console.log(`║  成功插入:     ${String(inserted).padStart(6)}               ║`);
  console.log(`║  跳过(重复):   ${String(skipped).padStart(6)}               ║`);
  console.log(`║  错误:         ${String(errors).padStart(6)}               ║`);
  console.log('╚══════════════════════════════════════╝');

  await pool.end();

  if (errors > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('[致命错误]', err);
  process.exit(1);
});
