import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 数据目录
const dataDir = join(__dirname, '..', 'data');
mkdirSync(dataDir, { recursive: true });

const dbPath = join(dataDir, 'auth.db');

let db = null;

// 初始化数据库
async function initDatabase() {
  const SQL = await initSqlJs();
  
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
  
  // 创建用户表
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  saveDatabase();
  console.log('✓ 认证数据库初始化完成:', dbPath);
  
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

// 数据库操作封装
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
      const rowid = db.exec("SELECT last_insert_rowid()")[0].values[0][0];
      saveDatabase();
      return { lastInsertRowid: rowid };
    } catch (e) {
      console.error('db.run error:', e);
      throw e;
    }
  },
  
  save: saveDatabase
};

export { initDatabase, saveDatabase };
export default dbWrapper;
