/**
 * Phase 29-Final 工序一 — 至尊统帅账号双库注入脚本
 * 
 * 执行方式：
 *   docker exec mecha-gateway node /tmp/force_create_admin.js
 * 
 * 将 dean147 / 123456 (role=dominator, credits=999) 
 * 同时焊死入 SQLite (mecha-gateway:/data/mecha-universe.db) 
 * 与 PostgreSQL (mecha-battle-db:5432 -> mecha_battle)
 */

const bcrypt = require('bcryptjs');
const initSqlJs = require('sql.js');
const fs = require('fs');
const { Pool } = require('pg');

const CRED = {
  username: 'dean147',
  password: '123456',
  email:    'dean147',
  role:     'dominator',
  credits:  999,
  faction:  'earth',
};

async function main() {
  const { username, password, email, role, credits, faction } = CRED;

  // 1. bcrypt 哈希生成（与网关 bcryptRounds=10 严格对齐）
  const hash = bcrypt.hashSync(password, 10);
  const userId = `dominator-${username}`;
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  console.log('==========================================');
  console.log(' Phase 29-Final 至尊统帅双库注入');
  console.log('==========================================');
  console.log(` 账号: ${username}`);
  console.log(` 角色: ${role}`);
  console.log(` 积分: ${credits}`);
  console.log(` Bcrypt: ${hash.substring(0, 20)}...`);
  console.log('==========================================\n');

  // ====================================================
  // 源一：SQLite（mecha-gateway 本地持久化）
  // ====================================================
  console.log('[SQLite] 连接 /data/mecha-universe.db ...');
  const SQL = await initSqlJs();
  const dbPath = '/data/mecha-universe.db';

  if (!fs.existsSync(dbPath)) {
    console.error('[SQLite] ❌ 数据库文件不存在:', dbPath);
    process.exit(1);
  }

  const buf = fs.readFileSync(dbPath);
  const db = new SQL.Database(buf);

  // 检测是否已存在
  const stmt = db.prepare('SELECT id, role, credits FROM users WHERE username = ?');
  stmt.bind([username]);
  let existing = null;
  if (stmt.step()) {
    const cols = stmt.getColumnNames();
    const vals = stmt.get();
    existing = {};
    cols.forEach((c, i) => { existing[c] = vals[i]; });
  }
  stmt.free();

  if (existing) {
    console.log(`[SQLite] 账号 ${username} 已存在 → UPDATE 覆盖`);
    console.log(`         旧值: role=${existing.role}, credits=${existing.credits}`);
    db.run(
      `UPDATE users SET password_hash=?, email=?, role=?, credits=?, updated_at=? WHERE username=?`,
      [hash, email, role, credits, now, username]
    );
  } else {
    console.log(`[SQLite] 创建新账号 ${username}`);
    db.run(
      `INSERT INTO users (id, username, email, password_hash, faction, role, credits, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, username, email, hash, faction, role, credits, now, now]
    );
  }

  // 持久化回磁盘
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
  db.close();

  // 二次验证
  const vBuf = fs.readFileSync(dbPath);
  const vDb = new SQL.Database(vBuf);
  const vStmt = vDb.prepare('SELECT username, role, credits FROM users WHERE username = ?');
  vStmt.bind([username]);
  let verified = false;
  if (vStmt.step()) {
    const cols = vStmt.getColumnNames();
    const vals = vStmt.get();
    const row = {};
    cols.forEach((c, i) => { row[c] = vals[i]; });
    console.log(`[SQLite] ✅ 验证: username=${row.username}, role=${row.role}, credits=${row.credits}`);
    verified = true;
  }
  vStmt.free();
  vDb.close();

  // ====================================================
  // 源二：PostgreSQL（mecha-battle-db:5432 旧库桥接）
  // ====================================================
  console.log('\n[PostgreSQL] 连接 mecha-battle-db:5432 ...');
  const pool = new Pool({
    host: 'mecha-battle-db',
    port: 5432,
    database: 'mecha_battle',
    user: 'mecha_user',
    password: 'mecha_user_password',
    connectionTimeoutMillis: 5000,
  });

  let pgOk = false;
  try {
    // 确保 users 表存在
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        faction TEXT DEFAULT 'earth',
        permission INTEGER DEFAULT 1,
        role TEXT DEFAULT 'user',
        credits INTEGER DEFAULT 10,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    // 检查是否已存在
    const pgRes = await pool.query('SELECT id, role, credits FROM users WHERE username = $1', [username]);
    if (pgRes.rows.length > 0) {
      const old = pgRes.rows[0];
      console.log(`[PG] 账号 ${username} 已存在 → UPDATE 覆盖`);
      console.log(`     旧值: role=${old.role}, credits=${old.credits}`);
      await pool.query(
        `UPDATE users SET password_hash=$1, email=$2, role=$3, credits=$4, updated_at=$5 WHERE username=$6`,
        [hash, email, role, credits, now, username]
      );
    } else {
      console.log(`[PG] 创建新账号 ${username}`);
      await pool.query(
        `INSERT INTO users (id, username, email, password_hash, faction, role, credits, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [userId, username, email, hash, faction, role, credits, now, now]
      );
    }

    // 验证
    const vRes = await pool.query('SELECT username, role, credits FROM users WHERE username = $1', [username]);
    if (vRes.rows.length > 0) {
      const v = vRes.rows[0];
      console.log(`[PG] ✅ 验证: username=${v.username}, role=${v.role}, credits=${v.credits}`);
    }
    pgOk = true;
  } catch (err) {
    console.error(`[PG] ❌ 操作失败: ${err.message}`);
  } finally {
    await pool.end();
  }

  // ====================================================
  // Phase 29-HangarRestoration: 工序三 — 注入初始作战单位
  // 如果 dominator-dean147 单位数为 0，自动 INSERT 2 个演示单位
  // ====================================================
  console.log('\n==========================================');
  console.log(' 工序三：注入初始作战单位');
  console.log('==========================================');

  // 重新打开 SQLite 数据库（之前已关闭）
  const unitBuf = fs.readFileSync(dbPath);
  const unitDb = new SQL.Database(unitBuf);

  const countStmt = unitDb.prepare('SELECT COUNT(*) as cnt FROM units WHERE owner_id = ?');
  countStmt.bind([userId]);
  let unitCount = 0;
  if (countStmt.step()) {
    const vals = countStmt.get();
    // sql.js returns array of values
    unitCount = Array.isArray(vals) ? vals[0] : vals;
  }
  countStmt.free();

  console.log(`[Units] dominator-dean147 现有单位数: ${unitCount}`);

  if (unitCount === 0) {
    console.log('[Units] 单位数为 0 — 开始注入初始演示单位...');

    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

    // 单位1：统帅机甲 (CommanderMech) — 格斗特化
    const c1Stats = JSON.stringify({
      hp: 320, maxHp: 320, armor: 18, shield: 5,
      attack: 85, defense: 12, speed: 4, range: 1,
    });
    const c1Skills = JSON.stringify([
      { id: 'skill-cm-001', name: '烈焰斩', description: '近战单体攻击，造成 1.5 倍攻击伤害', script: '', cooldown: 2, currentCooldown: 0, energyCost: 10, damageType: 'PHYSICAL' },
      { id: 'skill-cm-002', name: '铁壁防御', description: '本回合提升防御 50%', script: '', cooldown: 3, currentCooldown: 0, energyCost: 5, damageType: 'HEAL' },
      { id: 'skill-cm-003', name: '统帅号令', description: '全体友军攻击+10，持续2回合', script: '', cooldown: 5, currentCooldown: 0, energyCost: 20, damageType: 'HEAL' },
    ]);
    const c1Attrs = JSON.stringify({
      action_points: { MOVE: 1, ATTACK: 1 },
      raw_stats: { 格斗: 40, 射击: 5, 结构: 60, 机动: 20 },
      import_source: 'system_inject',
      description: '近战特化型统帅机甲，装备重型装甲和热能战斧',
    });

    unitDb.run(
      `INSERT INTO units (id, owner_id, name, faction, category, tier, sprite_key, stats, skills, is_public_copy, is_public, review_status, original_author_id, generation_status, attributes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['unit-inject-commander', userId, 'CommanderMech-炎龙', 'earth', 'melee', 3, null, c1Stats, c1Skills, 0, 0, 'approved', null, 'completed', c1Attrs, now, now]
    );

    console.log('[Units] ✅ CommanderMech-炎龙 (近战特化) 注入成功');

    // 单位2：侦察机甲 (ScoutMech) — 射击/机动特化
    const c2Stats = JSON.stringify({
      hp: 180, maxHp: 180, armor: 8, shield: 3,
      attack: 45, defense: 8, speed: 7, range: 4,
    });
    const c2Skills = JSON.stringify([
      { id: 'skill-sm-001', name: '精准射击', description: '远程单体攻击，无视 20% 防御', script: '', cooldown: 1, currentCooldown: 0, energyCost: 8, damageType: 'PHYSICAL' },
      { id: 'skill-sm-002', name: '侦察标记', description: '标记目标，全体友军对其攻击+5，持续1回合', script: '', cooldown: 4, currentCooldown: 0, energyCost: 15, damageType: 'ENERGY' },
    ]);
    const c2Attrs = JSON.stringify({
      action_points: { MOVE: 2, ATTACK: 1 },
      raw_stats: { 格斗: 10, 射击: 40, 结构: 32, 机动: 50 },
      import_source: 'system_inject',
      description: '高机动侦察型机甲，装备长程光束步枪和推进背包',
    });

    unitDb.run(
      `INSERT INTO units (id, owner_id, name, faction, category, tier, sprite_key, stats, skills, is_public_copy, is_public, review_status, original_author_id, generation_status, attributes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['unit-inject-scout', userId, 'ScoutMech-隼鹰', 'earth', 'ranged', 2, null, c2Stats, c2Skills, 0, 0, 'approved', null, 'completed', c2Attrs, now, now]
    );

    console.log('[Units] ✅ ScoutMech-隼鹰 (高机动侦察) 注入成功');

    // 持久化
    const unitData = unitDb.export();
    fs.writeFileSync(dbPath, Buffer.from(unitData));
    console.log('[Units] 单位注入持久化完成');

    // 验证
    const v2Buf = fs.readFileSync(dbPath);
    const v2Db = new SQL.Database(v2Buf);
    const v2Stmt = v2Db.prepare('SELECT name, category FROM units WHERE owner_id = ?');
    v2Stmt.bind([userId]);
    const injectedUnits = [];
    while (v2Stmt.step()) {
      const cols = v2Stmt.getColumnNames();
      const vals = v2Stmt.get();
      const row = {};
      cols.forEach((c, i) => { row[c] = vals[i]; });
      injectedUnits.push(row);
    }
    v2Stmt.free();
    v2Db.close();
    console.log(`[Units] ✅ 验证: ${injectedUnits.length} 个单位已就绪`);
    for (const u of injectedUnits) {
      console.log(`       - ${u.name} (${u.category})`);
    }
  } else {
    console.log(`[Units] 已有 ${unitCount} 个单位，跳过注入`);
  }

  unitDb.close();

  // ====================================================
  // 最终对账
  // ====================================================
  console.log('\n==========================================');
  console.log(' 双库注入 + 初始单位 结果');
  console.log('==========================================');
  console.log(` SQLite : ${verified ? '✅ CONNECTED' : '❌ FAILED'}`);
  console.log(` PG     : ${pgOk ? '✅ CONNECTED' : '❌ FAILED / SKIPPED'}`);
  console.log(` 账号   : ${username}`);
  console.log(` 密码   : ${password}`);
  console.log(` 角色   : ${role}`);
  console.log(` 积分   : ${credits}`);
  console.log(` 初始机甲: ${unitCount === 0 ? '✅ 已注入 CommanderMech + ScoutMech' : '跳过（已有单位）'}`);
  console.log('==========================================');
}

main().catch(err => {
  console.error('\n❌ 注入脚本严重异常:', err);
  process.exit(1);
});
