/**
 * PostgreSQL Database Adapter for Combat Service
 * 
 * Usage:
 *   - Development: Uses PostgreSQL if available, falls back to sql.js
 *   - Production: Requires PostgreSQL connection
 * 
 * Environment Variables:
 *   - DATABASE_URL: PostgreSQL connection string (optional)
 *   - POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD
 *   - DB_ADAPTER: 'postgres' or 'sqlite' (default: 'postgres' in production)
 */

let Pool = null;
try {
  const pkg = await import('pg');
  Pool = pkg.default ? pkg.default.Pool : pkg.Pool;
} catch (e) {
// PG module not available - using SQLite mode
}

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Determine which adapter to use
const isProduction = process.env.NODE_ENV === 'production';
const usePostgres = process.env.DB_ADAPTER === 'postgres' || 
                    isProduction || 
                    process.env.DATABASE_URL ||
                    process.env.POSTGRES_HOST;

class CombatDatabase {
  constructor() {
    this.adapter = null;
    this._initializing = false;
    this.adapterType = null;
    this.initializeDatabase();
  }

  async initializeDatabase() {
    if (this.adapter) return;
    if (this._initializing) return;
    
    this._initializing = true;
    if (usePostgres) {
      await this.initPostgres();
    } else {
      await this.initSqlite();
    }
  }

  async initPostgres() {
    try {
      // PostgreSQL connection pool
      this.adapter = new Pool({
        connectionString: process.env.DATABASE_URL,
        host: process.env.POSTGRES_HOST || 'localhost',
        port: process.env.POSTGRES_PORT || 5432,
        database: process.env.POSTGRES_DB || 'mecha_battle',
        user: process.env.POSTGRES_USER || 'agentuser',
        password: process.env.POSTGRES_PASSWORD || 'mecha_battle_2026',
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000
      });

      // Test connection
      const client = await this.adapter.connect();
      await client.query('SELECT NOW()');
      client.release();

      this.adapterType = 'postgres';
      console.log(`✅ PostgreSQL 数据库已连接：${process.env.POSTGRES_DB || 'mecha_battle'}@${process.env.POSTGRES_HOST || 'localhost'}`);
      
      // Verify tables exist
      await this.verifyTables();
    } catch (error) {
console.log("PG not available, using SQLite");
      await this.initSqlite();
    }
  }

  async initSqlite() {
    try {
      const sql = (await import('sql.js')).default;
      const fs = await import('fs');
      
      const DB_DIR = process.env.DB_PATH || path.join(__dirname, '../../data');
      const DB_PATH = path.join(DB_DIR, 'combat.db');

      // Ensure data directory exists
      if (!fs.default.existsSync(DB_DIR)) {
        fs.default.mkdirSync(DB_DIR, { recursive: true, mode: 0o700 });
      }

      // Load or create database
      let dbData;
      if (fs.default.existsSync(DB_PATH)) {
        try {
          const dbBuffer = fs.default.readFileSync(DB_PATH);
          if (dbBuffer.length > 0) {
            dbData = new Uint8Array(dbBuffer);
          }
        } catch (e) {
          console.log('无法加载 SQLite 数据库文件，创建新数据库');
        }
      }

      const SQL = await sql();
      this.adapter = dbData ? new SQL.Database(dbData) : new SQL.Database();
      this.adapterType = 'sqlite';
      this.dbPath = DB_PATH;

      // Create tables if new database
      if (!dbData) {
        this.createTablesSqlite();
        await this.saveToFile();
      }

      console.log(`✅ SQLite 数据库已初始化：${DB_PATH}`);
    } catch (error) {
      console.error('❌ SQLite 初始化失败:', error);
      throw error;
    }
  }

  async verifyTables() {
    if (this.adapterType !== 'postgres') return;

    try {
      const result = await this.adapter.query(`
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN ('battle_sessions', 'battle_units', 'battle_logs')
        ORDER BY table_name
      `);

      if (result.rows.length === 0) {
        console.log('⚠️  数据库表不存在，请先运行迁移脚本');
        console.log('   运行：node src/database/migrations/001-initial-schema.mjs');
      } else {
        console.log('✅ 数据库表验证通过:', result.rows.map(r => r.table_name).join(', '));
      }
    } catch (error) {
      console.error('⚠️  表验证失败:', error.message);
    }
  }

  createTablesSqlite() {
    if (this.adapterType !== 'sqlite') return;

    this.adapter.exec(`
      CREATE TABLE IF NOT EXISTS battle_sessions (
        id TEXT PRIMARY KEY,
        battlefield_id INTEGER NOT NULL,
        room_id TEXT,
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

    this.adapter.exec(`
      CREATE TABLE IF NOT EXISTS battle_units (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        battle_id TEXT NOT NULL,
        unit_id INTEGER NOT NULL,
        player_id INTEGER NOT NULL,
        faction TEXT NOT NULL,
        name TEXT NOT NULL,
        q INTEGER NOT NULL,
        r INTEGER NOT NULL,
        hp INTEGER NOT NULL,
        ge_dou INTEGER DEFAULT 0,
        she_ji INTEGER DEFAULT 0,
        ji_dong INTEGER DEFAULT 3,
        left_hand_type TEXT,
        left_hand_name TEXT,
        left_hand_melee INTEGER DEFAULT 0,
        left_hand_ranged INTEGER DEFAULT 0,
        left_hand_defense INTEGER DEFAULT 0,
        left_hand_durability INTEGER DEFAULT 0,
        left_hand_resistance TEXT,
        right_hand_type TEXT,
        right_hand_name TEXT,
        right_hand_melee INTEGER DEFAULT 0,
        right_hand_ranged INTEGER DEFAULT 0,
        right_hand_defense INTEGER DEFAULT 0,
        right_hand_durability INTEGER DEFAULT 0,
        right_hand_resistance TEXT,
        extra_type TEXT,
        extra_name TEXT,
        extra_melee INTEGER DEFAULT 0,
        extra_ranged INTEGER DEFAULT 0,
        extra_defense INTEGER DEFAULT 0,
        extra_durability INTEGER DEFAULT 0,
        extra_resistance TEXT,
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

    this.adapter.exec(`
      CREATE TABLE IF NOT EXISTS battle_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        battle_id TEXT NOT NULL,
        log_type TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp DATETIME DEFAULT (datetime('now')),
        FOREIGN KEY (battle_id) REFERENCES battle_sessions(id) ON DELETE CASCADE
      )
    `);

    this.adapter.exec(`CREATE INDEX IF NOT EXISTS idx_battle_sessions_status ON battle_sessions(status)`);
    this.adapter.exec(`CREATE INDEX IF NOT EXISTS idx_battle_sessions_battlefield ON battle_sessions(battlefield_id)`);
    this.adapter.exec(`CREATE INDEX IF NOT EXISTS idx_battle_units_battle ON battle_units(battle_id)`);
    this.adapter.exec(`CREATE INDEX IF NOT EXISTS idx_battle_logs_battle ON battle_logs(battle_id)`);
  }

  async saveToFile() {
    if (this.adapterType !== 'sqlite') return;
    
    const fs = await import('fs');
    try {
      const data = this.adapter.export();
      const buffer = Buffer.from(data);
      fs.default.writeFileSync(this.dbPath, buffer);
    } catch (error) {
      console.error('保存数据库失败:', error);
    }
  }

  // Universal query method
  async query(sql, params = []) {
    if (!this.adapter) {
      throw new Error('数据库未初始化');
    }

    if (this.adapterType === 'postgres') {
      const result = await this.adapter.query(sql, params);
      return result.rows;
    } else {
      const stmt = this.adapter.prepare(sql);
      if (params.length > 0) {
        stmt.bind(params);
      }
      
      const results = [];
      while (stmt.step()) {
        results.push(stmt.getAsObject());
      }
      stmt.free();
      
      return results;
    }
  }

  // Insert with returning ID
  async insert(sql, params = []) {
    if (!this.adapter) {
      throw new Error('数据库未初始化');
    }

    if (this.adapterType === 'postgres') {
      const result = await this.adapter.query(sql, params);
      return result.rows[0]?.id || null;
    } else {
      const stmt = this.adapter.prepare(sql);
      stmt.run(params);
      stmt.free();
      
      const result = this.adapter.exec('SELECT last_insert_rowid() as id');
      return result[0]?.values[0]?.[0] || null;
    }
  }

  // Update/Delete with changes count
  async execute(sql, params = []) {
    if (!this.adapter) {
      throw new Error('数据库未初始化');
    }

    if (this.adapterType === 'postgres') {
      const result = await this.adapter.query(sql, params);
      return result.rowCount;
    } else {
      const stmt = this.adapter.prepare(sql);
      stmt.run(params);
      const changes = this.adapter.getRowsModified();
      stmt.free();
      return changes;
    }
  }

  // Get single record
  async get(sql, params = []) {
    const results = await this.query(sql, params);
    return results[0] || null;
  }

  // Get all records
  async all(sql, params = []) {
    return await this.query(sql, params);
  }

  // Transaction support
  async transaction(callback) {
    if (this.adapterType === 'postgres') {
      const client = await this.adapter.connect();
      try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } else {
      // SQLite transactions
      try {
        this.adapter.exec('BEGIN TRANSACTION');
        const result = await callback(this.adapter);
        this.adapter.exec('COMMIT');
        return result;
      } catch (error) {
        this.adapter.exec('ROLLBACK');
        throw error;
      }
    }
  }

  // Close connection
  async close() {
    if (this.adapterType === 'postgres') {
      await this.adapter.end();
      console.log('PostgreSQL 连接已关闭');
    } else {
      await this.saveToFile();
      this.adapter.close();
      console.log('SQLite 数据库已关闭');
    }
  }

  // ========== Battle Sessions Methods ==========
  
  async createBattle(battlefieldId, roomId, initialState) {
    const stateStr = this.adapterType === 'postgres' 
      ? JSON.stringify(initialState) 
      : JSON.stringify(initialState);
    const spawnOrder = initialState.spawn_order ? JSON.stringify(initialState.spawn_order) : null;
    
    // Generate UUID for battle session
    const { v4: uuidv4 } = await import('uuid');
    const battleId = uuidv4();
    
    const sql = this.adapterType === 'postgres'
      ? `INSERT INTO battle_sessions 
         (id, battlefield_id, room_id, units_state, status, phase, current_faction, current_turn, spawn_phase_done, spawn_order) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id`
      : `INSERT INTO battle_sessions 
         (id, battlefield_id, room_id, units_state, status, phase, current_faction, current_turn, spawn_phase_done, spawn_order) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    
    const params = [
      battleId,
      battlefieldId,
      roomId || null,
      stateStr,
      'active',
      roomId ? 'spawn_selection' : 'deployment',
      'earth',
      1,
      this.adapterType === 'postgres' ? false : 0,
      spawnOrder
    ];
    
    const id = await this.insert(sql, params);
    return await this.getBattleById(id);
  }

  async getBattleById(id) {
    if (this.adapterType === 'postgres') {
      return await this.get('SELECT * FROM battle_sessions WHERE id = $1', [id]);
    } else {
      return await this.get('SELECT * FROM battle_sessions WHERE id = ?', [id]);
    }
  }

  async getAllBattles(limit = 50) {
    if (this.adapterType === 'postgres') {
      return await this.all('SELECT * FROM battle_sessions ORDER BY created_at DESC LIMIT $1', [limit]);
    } else {
      return await this.all('SELECT * FROM battle_sessions ORDER BY created_at DESC LIMIT ?', [limit]);
    }
  }

  async getBattlesByStatus(status) {
    if (this.adapterType === 'postgres') {
      return await this.all('SELECT * FROM battle_sessions WHERE status = $1 ORDER BY created_at DESC', [status]);
    } else {
      return await this.all('SELECT * FROM battle_sessions WHERE status = ? ORDER BY created_at DESC', [status]);
    }
  }

  async updateBattleState(battleId, state) {
    const stateStr = JSON.stringify(state);
    if (this.adapterType === 'postgres') {
      await this.execute(
        'UPDATE battle_sessions SET units_state = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [stateStr, battleId]
      );
    } else {
      await this.execute(
        'UPDATE battle_sessions SET units_state = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [stateStr, battleId]
      );
    }
    return await this.getBattleById(battleId);
  }

  async updateBattlePhase(battleId, phase) {
    if (this.adapterType === 'postgres') {
      await this.execute(
        'UPDATE battle_sessions SET phase = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [phase, battleId]
      );
    } else {
      await this.execute(
        'UPDATE battle_sessions SET phase = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [phase, battleId]
      );
    }
    return await this.getBattleById(battleId);
  }

  async updateBattleCurrentFaction(battleId, faction) {
    if (this.adapterType === 'postgres') {
      await this.execute(
        'UPDATE battle_sessions SET current_faction = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [faction, battleId]
      );
    } else {
      await this.execute(
        'UPDATE battle_sessions SET current_faction = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [faction, battleId]
      );
    }
    return await this.getBattleById(battleId);
  }

  async endBattle(battleId, winner) {
    if (this.adapterType === 'postgres') {
      await this.execute(
        'UPDATE battle_sessions SET status = $1, current_faction = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
        ['ended', winner || 'draw', battleId]
      );
    } else {
      await this.execute(
        'UPDATE battle_sessions SET status = ?, current_faction = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        ['ended', winner || 'draw', battleId]
      );
    }
    return await this.getBattleById(battleId);
  }

  // ========== Battle Units Methods ==========
  
  async addBattleUnit(battleId, unitData) {
    const sql = this.adapterType === 'postgres'
      ? `INSERT INTO battle_units 
         (battle_id, unit_id, player_id, faction, name, q, r, hp, ge_dou, she_ji, ji_dong,
          left_hand_type, left_hand_name, left_hand_melee, left_hand_ranged, left_hand_defense, left_hand_durability, left_hand_resistance,
          right_hand_type, right_hand_name, right_hand_melee, right_hand_ranged, right_hand_defense, right_hand_durability, right_hand_resistance,
          extra_type, extra_name, extra_melee, extra_ranged, extra_defense, extra_durability, extra_resistance,
          has_moved, has_acted, royroy_deployed, royroy_q, royroy_r)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
                 $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32,
                 $33, $34, $35, $36, $37)
         RETURNING id`
      : `INSERT INTO battle_units 
         (battle_id, unit_id, player_id, faction, name, q, r, hp, ge_dou, she_ji, ji_dong,
          left_hand_type, left_hand_name, left_hand_melee, left_hand_ranged, left_hand_defense, left_hand_durability, left_hand_resistance,
          right_hand_type, right_hand_name, right_hand_melee, right_hand_ranged, right_hand_defense, right_hand_durability, right_hand_resistance,
          extra_type, extra_name, extra_melee, extra_ranged, extra_defense, extra_durability, extra_resistance,
          has_moved, has_acted, royroy_deployed, royroy_q, royroy_r)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                 ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    
    const params = [
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
      unitData.left_hand_name || null,
      unitData.left_hand_melee || 0,
      unitData.left_hand_ranged || 0,
      unitData.left_hand_defense || 0,
      unitData.left_hand_durability || 0,
      unitData.left_hand_resistance || null,
      unitData.right_hand_type || null,
      unitData.right_hand_name || null,
      unitData.right_hand_melee || 0,
      unitData.right_hand_ranged || 0,
      unitData.right_hand_defense || 0,
      unitData.right_hand_durability || 0,
      unitData.right_hand_resistance || null,
      unitData.extra_type || null,
      unitData.extra_name || null,
      unitData.extra_melee || 0,
      unitData.extra_ranged || 0,
      unitData.extra_defense || 0,
      unitData.extra_durability || 0,
      unitData.extra_resistance || null,
      unitData.has_moved ? 1 : false,
      unitData.has_acted ? 1 : false,
      unitData.royroy_deployed ? 1 : false,
      unitData.royroy_q || null,
      unitData.royroy_r || null
    ];
    
    const id = await this.insert(sql, params);
    return await this.getBattleUnitById(id);
  }

  async getBattleUnitById(id) {
    if (this.adapterType === 'postgres') {
      return await this.get('SELECT * FROM battle_units WHERE id = $1', [id]);
    } else {
      return await this.get('SELECT * FROM battle_units WHERE id = ?', [id]);
    }
  }

  async getBattleUnits(battleId) {
    if (this.adapterType === 'postgres') {
      return await this.all('SELECT * FROM battle_units WHERE battle_id = $1', [battleId]);
    } else {
      return await this.all('SELECT * FROM battle_units WHERE battle_id = ?', [battleId]);
    }
  }

  async updateBattleUnitPosition(unitId, q, r) {
    if (this.adapterType === 'postgres') {
      await this.execute(
        'UPDATE battle_units SET q = $1, r = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
        [q, r, unitId]
      );
    } else {
      await this.execute(
        'UPDATE battle_units SET q = ?, r = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [q, r, unitId]
      );
    }
    return await this.getBattleUnitById(unitId);
  }

  async updateBattleUnitHP(unitId, hp) {
    if (this.adapterType === 'postgres') {
      await this.execute(
        'UPDATE battle_units SET hp = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [hp, unitId]
      );
    } else {
      await this.execute(
        'UPDATE battle_units SET hp = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [hp, unitId]
      );
    }
    return await this.getBattleUnitById(unitId);
  }

  async removeBattleUnit(unitId) {
    if (this.adapterType === 'postgres') {
      await this.execute('DELETE FROM battle_units WHERE id = $1', [unitId]);
    } else {
      await this.execute('DELETE FROM battle_units WHERE id = ?', [unitId]);
    }
  }

  // ========== Battle Logs Methods ==========
  
  async addBattleLog(battleId, logType, content) {
    const sql = this.adapterType === 'postgres'
      ? 'INSERT INTO battle_logs (battle_id, log_type, content) VALUES ($1, $2, $3) RETURNING id'
      : 'INSERT INTO battle_logs (battle_id, log_type, content) VALUES (?, ?, ?)';
    
    const id = await this.insert(sql, [battleId, logType, content]);
    return await this.getBattleLogById(id);
  }

  async getBattleLogById(id) {
    if (this.adapterType === 'postgres') {
      return await this.get('SELECT * FROM battle_logs WHERE id = $1', [id]);
    } else {
      return await this.get('SELECT * FROM battle_logs WHERE id = ?', [id]);
    }
  }

  async getBattleLogs(battleId, limit = 100) {
    if (this.adapterType === 'postgres') {
      return await this.all(
        'SELECT * FROM battle_logs WHERE battle_id = $1 ORDER BY timestamp DESC LIMIT $2',
        [battleId, limit]
      );
    } else {
      return await this.all(
        'SELECT * FROM battle_logs WHERE battle_id = ? ORDER BY timestamp DESC LIMIT ?',
        [battleId, limit]
      );
    }
  }

  // ========== Cleanup Methods ==========
  
  async cleanupOldBattles(days = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    // Delete related logs
    await this.execute(
      'DELETE FROM battle_logs WHERE battle_id IN (SELECT id FROM battle_sessions WHERE created_at < $1)',
      [cutoffDate]
    );
    
    // Delete related units
    await this.execute(
      'DELETE FROM battle_units WHERE battle_id IN (SELECT id FROM battle_sessions WHERE created_at < $1)',
      [cutoffDate]
    );
    
    // Delete old battle sessions
    const changes = await this.execute(
      'DELETE FROM battle_sessions WHERE created_at < $1',
      [cutoffDate]
    );
    
    console.log(`已清理 ${changes} 个旧的战斗会话`);
    return changes;
  }
}

// Create singleton instance
const combatDB = new CombatDatabase();

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n正在关闭数据库连接...');
  await combatDB.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await combatDB.close();
  process.exit(0);
});

// Export instance
export default combatDB;
