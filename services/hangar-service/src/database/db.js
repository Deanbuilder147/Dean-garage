import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 确保data目录存在
const dataDir = join(__dirname, '..', 'data');
mkdirSync(dataDir, { recursive: true });

const dbPath = join(dataDir, 'hangar.db');

let db = null;

// 初始化数据库
async function initDatabase() {
  const SQL = await initSqlJs();

  // 尝试读取现有数据库
  if (existsSync(dbPath)) {
    try {
      const buffer = readFileSync(dbPath);
      db = new SQL.Database(buffer);
      console.log('✓ 已加载现有数据库:', dbPath);
    } catch (e) {
      console.log('数据库文件损坏，创建新数据库');
      db = new SQL.Database();
    }
  } else {
    db = new SQL.Database();
    console.log('✓ 创建新数据库:', dbPath);
  }

  // 棋子/单位表 - 支持新版WeirdNova设计
  db.run(`
    CREATE TABLE IF NOT EXISTS units (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      codename TEXT,
      faction TEXT NOT NULL DEFAULT 'earth',
      main_image_url TEXT,

      -- 主机体属性
      main_type TEXT DEFAULT '机体',
      main_格斗 INTEGER DEFAULT 0,
      main_射击 INTEGER DEFAULT 0,
      main_结构 INTEGER DEFAULT 0,
      main_机动 INTEGER DEFAULT 0,
      main_skills TEXT DEFAULT '[]',

      -- 跟随(Royroy)
      has_royroy INTEGER DEFAULT 0,
      royroy_image_url TEXT,
      royroy_name TEXT,
      royroy_格斗 INTEGER DEFAULT 0,
      royroy_射击 INTEGER DEFAULT 0,
      royroy_结构 INTEGER DEFAULT 0,
      royroy_机动 INTEGER DEFAULT 0,
      royroy_skills TEXT DEFAULT '[]',

      -- 左手装备
      left_type TEXT DEFAULT 'none',
      left_image_url TEXT,
      left_格斗 INTEGER DEFAULT 0,
      left_射击 INTEGER DEFAULT 0,
      left_结构 INTEGER DEFAULT 0,
      left_机动 INTEGER DEFAULT 0,
      left_skills TEXT DEFAULT '[]',

      -- 右手装备
      right_type TEXT DEFAULT 'none',
      right_image_url TEXT,
      right_格斗 INTEGER DEFAULT 0,
      right_射击 INTEGER DEFAULT 0,
      right_结构 INTEGER DEFAULT 0,
      right_机动 INTEGER DEFAULT 0,
      right_skills TEXT DEFAULT '[]',

      -- 其它装备
      extra_type TEXT DEFAULT 'none',
      extra_image_url TEXT,
      extra_格斗 INTEGER DEFAULT 0,
      extra_射击 INTEGER DEFAULT 0,
      extra_结构 INTEGER DEFAULT 0,
      extra_机动 INTEGER DEFAULT 0,
      extra_skills TEXT DEFAULT '[]',

      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 创建索引
  db.run('CREATE INDEX IF NOT EXISTS idx_units_user_id ON units(user_id)');

  // 保存数据库
  saveDatabase();

  console.log('✓ 数据库初始化完成:', dbPath);

  return db;
}

// 保存数据库到文件
function saveDatabase() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    writeFileSync(dbPath, buffer);
  }
}

// 封装数据库操作
const dbWrapper = {
  exec: (sql, params = []) => {
    if (params.length > 0) {
      db.run(sql, params);
    } else {
      db.run(sql);
    }
    saveDatabase();
    return { changes: db.getRowsModified() };
  },

  all: (sql, params = []) => {
    const stmt = db.prepare(sql);
    if (params.length > 0) {
      stmt.bind(params);
    }
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  },

  get: (sql, params = []) => {
    const stmt = db.prepare(sql);
    if (params.length > 0) {
      stmt.bind(params);
    }
    let result = null;
    if (stmt.step()) {
      result = stmt.getAsObject();
    }
    stmt.free();
    return result;
  },

  run: (sql, params = []) => {
    try {
      if (params.length > 0) {
        db.run(sql, params);
      } else {
        db.run(sql);
      }
      // 重要：在 saveDatabase() 之前获取 lastInsertRowid
      const rowid = db.exec("SELECT last_insert_rowid()")[0].values[0][0];
      saveDatabase();
      return { lastInsertRowid: rowid };
    } catch (e) {
      console.error('db.run error:', e);
      throw e;
    }
  },

  save: saveDatabase,
};

export { initDatabase, saveDatabase };
export default dbWrapper;
