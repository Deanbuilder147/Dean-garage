import sql from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

// ES module 中获取 __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 使用数据目录（避免/tmp 被清空）
const DB_DIR = process.env.DB_PATH || path.join(__dirname, '../../data');
const DB_PATH = path.join(DB_DIR, 'combat.db');

class CombatDatabase {
  constructor() {
    this.db = null;
    this.SQL = null;
    this.initializeDatabase();
  }

  async initializeDatabase() {
    // 确保数据目录存在并设置正确权限
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true, mode: 0o700 });
    }
    try {
      // 加载SQL.js库
      this.SQL = await sql();
      
      // 检查数据库文件是否存在
      let dbData;
      if (fs.existsSync(DB_PATH)) {
        try {
          const dbBuffer = fs.readFileSync(DB_PATH);
          if (dbBuffer.length > 0) {
            dbData = new Uint8Array(dbBuffer);
            this.db = new this.SQL.Database(dbData);
            console.log(`已加载现有战斗数据库: ${DB_PATH}`);
          } else {
            throw new Error('数据库文件为空');
          }
        } catch (e) {
          console.log(`无法加载数据库文件(${e.message})，创建新数据库`);
          this.db = new this.SQL.Database();
          this.createTables();
          this.saveToFile();
          console.log(`已创建新战斗数据库: ${DB_PATH}`);
        }
      } else {
        this.db = new this.SQL.Database();
        this.createTables();
        this.saveToFile();
        console.log(`已创建新战斗数据库: ${DB_PATH}`);
      }
    } catch (error) {
      console.error('数据库初始化失败:', error);
      // 如果文件加载失败，创建新的内存数据库
      this.db = new this.SQL.Database();
      this.createTables();
      this.saveToFile();
      console.log('已创建内存数据库');
    }
  }

  // 保存数据库到文件
  saveToFile() {
    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(DB_PATH, buffer);
      console.log(`数据库已保存到: ${DB_PATH} (${buffer.length} bytes)`);
    } catch (error) {
      console.error('保存数据库失败:', error);
    }
  }

  createTables() {
    // 战斗会话表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS battle_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        battlefield_id INTEGER NOT NULL,
        room_id INTEGER,
        units_state TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        phase TEXT NOT NULL DEFAULT 'deployment',
        current_faction TEXT NOT NULL DEFAULT 'earth',
        current_turn INTEGER NOT NULL DEFAULT 1,
        spawn_phase_done BOOLEAN NOT NULL DEFAULT 0,
        spawn_order TEXT,
        created_at DATETIME DEFAULT (datetime('now')),
        updated_at DATETIME DEFAULT (datetime('now'))
      )
    `);

    // 战斗单位表（缓存单位数据）
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS battle_units (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        battle_id INTEGER NOT NULL,
        unit_id INTEGER NOT NULL,
        player_id INTEGER NOT NULL,
        faction TEXT NOT NULL,
        name TEXT NOT NULL,
        q INTEGER NOT NULL,
        r INTEGER NOT NULL,
        hp INTEGER NOT NULL,
        格斗 INTEGER DEFAULT 0,
        射击 INTEGER DEFAULT 0,
        机动 INTEGER DEFAULT 3,
        left_hand_type TEXT,
        left_hand_melee INTEGER DEFAULT 0,
        left_hand_ranged INTEGER DEFAULT 0,
        left_hand_durability INTEGER DEFAULT 0,
        right_hand_type TEXT,
        right_hand_melee INTEGER DEFAULT 0,
        right_hand_ranged INTEGER DEFAULT 0,
        right_hand_durability INTEGER DEFAULT 0,
        has_moved BOOLEAN NOT NULL DEFAULT 0,
        has_acted BOOLEAN NOT NULL DEFAULT 0,
        royroy_deployed BOOLEAN NOT NULL DEFAULT 0,
        royroy_q INTEGER,
        royroy_r INTEGER,
        created_at DATETIME DEFAULT (datetime('now')),
        updated_at DATETIME DEFAULT (datetime('now')),
        FOREIGN KEY (battle_id) REFERENCES battle_sessions(id) ON DELETE CASCADE
      )
    `);

    // 战斗日志表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS battle_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        battle_id INTEGER NOT NULL,
        log_type TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp DATETIME DEFAULT (datetime('now')),
        FOREIGN KEY (battle_id) REFERENCES battle_sessions(id) ON DELETE CASCADE
      )
    `);

    // 创建索引
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_battle_sessions_status 
      ON battle_sessions(status);
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_battle_sessions_battlefield 
      ON battle_sessions(battlefield_id);
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_battle_units_battle 
      ON battle_units(battle_id);
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_battle_logs_battle 
      ON battle_logs(battle_id);
    `);
  }

  prepare(sql) {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }
    return this.db.prepare(sql);
  }

  run(sql, params = []) {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }
    const stmt = this.db.prepare(sql);
    stmt.run(params);
    
    // SQL.js 不返回 lastInsertRowid，需要手动获取
    if (sql.trim().toUpperCase().startsWith('INSERT')) {
      const result = this.db.exec('SELECT last_insert_rowid() as lastInsertRowid');
      if (result && result.length > 0 && result[0].values.length > 0) {
        return { lastInsertRowid: result[0].values[0][0] };
      }
    }
    
    return { changes: this.db.getRowsModified() };
  }

  get(sql, params = []) {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }
    const stmt = this.db.prepare(sql);
    stmt.bind(params);
    const result = stmt.getAsObject();
    return Object.keys(result).length > 0 ? result : null;
  }

  all(sql, params = []) {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }
    const stmt = this.db.prepare(sql);
    stmt.bind(params);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    return results;
  }

  close() {
    if (this.db) {
      // 保存数据库到文件
      try {
        const data = this.db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(DB_PATH, buffer);
        console.log(`战斗数据库已保存到: ${DB_PATH}`);
      } catch (error) {
        console.error('保存数据库失败:', error);
      }
      
      this.db.close();
      console.log('战斗数据库已关闭');
    }
  }

  // 战斗会话相关方法
  createBattle(battlefieldId, roomId, initialState) {
    const stateStr = JSON.stringify(initialState);
    const spawnOrder = initialState.spawn_order ? JSON.stringify(initialState.spawn_order) : null;
    
    const result = this.run(
      `INSERT INTO battle_sessions 
       (battlefield_id, room_id, units_state, status, phase, current_faction, current_turn, spawn_phase_done, spawn_order) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        battlefieldId,
        roomId || null,
        stateStr,
        'active',
        roomId ? 'spawn_selection' : 'deployment',
        'earth',
        1,
        0,
        spawnOrder
      ]
    );

    return this.getBattleById(result.lastInsertRowid);
  }

  getBattleById(id) {
    return this.get('SELECT * FROM battle_sessions WHERE id = ?', [id]);
  }

  getAllBattles(limit = 50) {
    return this.all(
      'SELECT * FROM battle_sessions ORDER BY created_at DESC LIMIT ?',
      [limit]
    );
  }

  getBattlesByStatus(status) {
    return this.all(
      'SELECT * FROM battle_sessions WHERE status = ? ORDER BY created_at DESC',
      [status]
    );
  }

  updateBattleState(battleId, state) {
    const stateStr = JSON.stringify(state);
    this.run(
      'UPDATE battle_sessions SET units_state = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [stateStr, battleId]
    );
    return this.getBattleById(battleId);
  }

  updateBattlePhase(battleId, phase) {
    this.run(
      'UPDATE battle_sessions SET phase = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [phase, battleId]
    );
    return this.getBattleById(battleId);
  }

  updateBattleCurrentFaction(battleId, faction) {
    this.run(
      'UPDATE battle_sessions SET current_faction = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [faction, battleId]
    );
    return this.getBattleById(battleId);
  }

  endBattle(battleId, winner) {
    this.run(
      'UPDATE battle_sessions SET status = ?, current_faction = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      ['ended', winner || 'draw', battleId]
    );
    return this.getBattleById(battleId);
  }

  // 战斗单位相关方法
  addBattleUnit(battleId, unitData) {
    const result = this.run(
      `INSERT INTO battle_units 
       (battle_id, unit_id, player_id, faction, name, q, r, hp, 格斗, 射击, 机动,
        left_hand_type, left_hand_melee, left_hand_ranged, left_hand_durability,
        right_hand_type, right_hand_melee, right_hand_ranged, right_hand_durability,
        has_moved, has_acted, royroy_deployed, royroy_q, royroy_r)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        battleId,
        unitData.id,
        unitData.player_id,
        unitData.faction,
        unitData.name,
        unitData.q,
        unitData.r,
        unitData.hp,
        unitData.格斗 || 0,
        unitData.射击 || 0,
        unitData.机动 || 3,
        unitData.left_hand_type || null,
        unitData.left_hand_melee || 0,
        unitData.left_hand_ranged || 0,
        unitData.left_hand_durability || 0,
        unitData.right_hand_type || null,
        unitData.right_hand_melee || 0,
        unitData.right_hand_ranged || 0,
        unitData.right_hand_durability || 0,
        unitData.has_moved ? 1 : 0,
        unitData.has_acted ? 1 : 0,
        unitData.royroy_deployed ? 1 : 0,
        unitData.royroy_q || null,
        unitData.royroy_r || null
      ]
    );

    return this.getBattleUnitById(result.lastInsertRowid);
  }

  getBattleUnitById(id) {
    return this.get('SELECT * FROM battle_units WHERE id = ?', [id]);
  }

  getBattleUnits(battleId) {
    return this.all('SELECT * FROM battle_units WHERE battle_id = ?', [battleId]);
  }

  updateBattleUnitPosition(unitId, q, r) {
    this.run(
      'UPDATE battle_units SET q = ?, r = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [q, r, unitId]
    );
    return this.getBattleUnitById(unitId);
  }

  updateBattleUnitHP(unitId, hp) {
    this.run(
      'UPDATE battle_units SET hp = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [hp, unitId]
    );
    return this.getBattleUnitById(unitId);
  }

  removeBattleUnit(unitId) {
    this.run('DELETE FROM battle_units WHERE id = ?', [unitId]);
  }

  // 战斗日志相关方法
  addBattleLog(battleId, logType, content) {
    const result = this.run(
      'INSERT INTO battle_logs (battle_id, log_type, content) VALUES (?, ?, ?)',
      [battleId, logType, content]
    );
    return this.getBattleLogById(result.lastInsertRowid);
  }

  getBattleLogById(id) {
    return this.get('SELECT * FROM battle_logs WHERE id = ?', [id]);
  }

  getBattleLogs(battleId, limit = 100) {
    return this.all(
      'SELECT * FROM battle_logs WHERE battle_id = ? ORDER BY timestamp DESC LIMIT ?',
      [battleId, limit]
    );
  }

  // 清理旧数据
  cleanupOldBattles(days = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    // 删除关联的日志
    this.run(
      'DELETE FROM battle_logs WHERE battle_id IN (SELECT id FROM battle_sessions WHERE created_at < ?)',
      [cutoffDate.toISOString()]
    );
    
    // 删除关联的单位
    this.run(
      'DELETE FROM battle_units WHERE battle_id IN (SELECT id FROM battle_sessions WHERE created_at < ?)',
      [cutoffDate.toISOString()]
    );
    
    // 删除旧的战斗会话
    const result = this.run(
      'DELETE FROM battle_sessions WHERE created_at < ?',
      [cutoffDate.toISOString()]
    );
    
    console.log(`已清理 ${result.changes} 个旧的战斗会话`);
    return result.changes;
  }
}

const combatDB = new CombatDatabase();

// 导出数据库实例
export default combatDB;