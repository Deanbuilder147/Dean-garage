import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import config from '../config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 确保data目录存在
const dataDir = join(__dirname, '..', '..', config.dataDir);
mkdirSync(dataDir, { recursive: true });

const dbPath = join(dataDir, config.dbName);

let db = null;

// 初始化数据库
async function initDatabase() {
  const SQL = await initSqlJs();
  
  // 尝试读取现有数据库
  if (existsSync(dbPath)) {
    try {
      const buffer = readFileSync(dbPath);
      db = new SQL.Database(buffer);
      console.log('[Map-DB] 已加载现有数据库:', dbPath);
    } catch (e) {
      console.log('[Map-DB] 数据库文件损坏，创建新数据库');
      db = new SQL.Database();
    }
  } else {
    db = new SQL.Database();
    console.log('[Map-DB] 创建新数据库:', dbPath);
  }
  
  // 创建战场表
  db.run(`
    CREATE TABLE IF NOT EXISTS battlefields (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      width INTEGER NOT NULL DEFAULT 20,
      height INTEGER NOT NULL DEFAULT 30,
      terrain TEXT DEFAULT '{}',
      type TEXT DEFAULT 'standard',
      is_public INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 创建地形类型表
  db.run(`
    CREATE TABLE IF NOT EXISTS terrain_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      terrain_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      movement_cost INTEGER DEFAULT 1,
      defense_bonus INTEGER DEFAULT 0,
      can_spawn INTEGER DEFAULT 1,
      color TEXT DEFAULT '#888888',
      description TEXT
    )
  `);

  // 初始化默认地形类型
  const defaultTerrains = [
    { terrain_id: 'empty', name: '空地', movement_cost: 1, defense_bonus: 0, can_spawn: 1, color: '#88CC88', description: '普通地形' },
    { terrain_id: 'mountain', name: '山地', movement_cost: 3, defense_bonus: 20, can_spawn: 0, color: '#886644', description: '高机动消耗，高防御加成' },
    { terrain_id: 'forest', name: '森林', movement_cost: 2, defense_bonus: 10, can_spawn: 1, color: '#228822', description: '中等机动消耗，中等防御' },
    { terrain_id: 'water', name: '水域', movement_cost: 99, defense_bonus: 0, can_spawn: 0, color: '#4488FF', description: '不可通行' },
    { terrain_id: 'mothership', name: '母舰', movement_cost: 1, defense_bonus: 0, can_spawn: 1, color: '#FFD700', description: '出生点-地球联邦' },
    { terrain_id: 'base', name: '基地', movement_cost: 1, defense_bonus: 0, can_spawn: 1, color: '#FF4444', description: '出生点-拜火教' }
  ];

  for (const t of defaultTerrains) {
    try {
      db.run(
        'INSERT OR IGNORE INTO terrain_types (terrain_id, name, movement_cost, defense_bonus, can_spawn, color, description) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [t.terrain_id, t.name, t.movement_cost, t.defense_bonus, t.can_spawn, t.color, t.description]
      );
    } catch (e) {}
  }

  saveDatabase();
  console.log('[Map-DB] 数据库初始化完成:', dbPath);
  
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
  // 执行查询
  exec: (sql, params = []) => {
    if (params.length > 0) {
      db.run(sql, params);
    } else {
      db.run(sql);
    }
    saveDatabase();
    return { changes: db.getRowsModified() };
  },
  
  // 查询所有
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
  
  // 查询一条
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
  
  // 插入并返回lastInsertRowid
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
      console.error('[Map-DB] db.run error:', e);
      throw e;
    }
  },
  
  // 保存
  save: saveDatabase,
  
  // 支持 db.prepare().get() 链式调用
  prepare: (sql) => ({
    get: (...params) => {
      const stmt = db.prepare(sql);
      let bindParams = params;
      if (params.length === 1) {
        if (Array.isArray(params[0])) {
          bindParams = params[0];
        } else if (typeof params[0] === 'object' && params[0] !== null) {
          bindParams = Object.values(params[0]);
        } else {
          bindParams = [params[0]];
        }
      }
      if (bindParams.length > 0) {
        stmt.bind(bindParams);
      }
      let result = null;
      if (stmt.step()) {
        result = stmt.getAsObject();
      }
      stmt.free();
      return result;
    },
    all: (params = []) => {
      const stmt = db.prepare(sql);
      if (Array.isArray(params) && params.length > 0) {
        stmt.bind(params);
      } else if (params && typeof params === 'object' && !Array.isArray(params)) {
        stmt.bind(Object.values(params));
      } else if (typeof params === 'number' || typeof params === 'string') {
        stmt.bind([params]);
      }
      const results = [];
      while (stmt.step()) {
        results.push(stmt.getAsObject());
      }
      stmt.free();
      return results;
    },
    run: (...params) => {
      const stmt = db.prepare(sql);
      let bindParams = params;
      if (params.length === 1) {
        if (Array.isArray(params[0])) {
          bindParams = params[0];
        } else if (typeof params[0] === 'object' && params[0] !== null) {
          bindParams = Object.values(params[0]);
        } else {
          bindParams = [params[0]];
        }
      }
      if (bindParams.length > 0) {
        stmt.bind(bindParams);
      }
      stmt.step();
      stmt.free();
      const rowid = db.exec("SELECT last_insert_rowid()")[0].values[0][0];
      saveDatabase();
      return { lastInsertRowid: rowid };
    }
  })
};

export { initDatabase, saveDatabase };
export default dbWrapper;
