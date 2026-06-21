/**
 * PostgreSQL Migration Script
 * Creates all required tables for combat-service
 * Run with: node src/database/migrations/001-initial-schema.mjs
 */

let Pool;
try {
  const pkg = await import("pg");
  Pool = pkg.default ? pkg.default.Pool : pkg.Pool;
} catch (e) {
  console.error("pg not available, cannot run PG migration");
  process.exit(1);
}
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// PostgreSQL connection pool
const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: process.env.POSTGRES_PORT || 5432,
  database: process.env.POSTGRES_DB || 'mecha_battle',
  user: process.env.POSTGRES_USER || 'agentuser',
  password: process.env.POSTGRES_PASSWORD || 'mecha_battle_2026',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});

async function migrate() {
  const client = await pool.connect();
  
  try {
    console.log('=== PostgreSQL 数据库迁移 ===\n');
    console.log(`连接到数据库：${process.env.POSTGRES_DB || 'mecha_battle'}@${process.env.POSTGRES_HOST || 'localhost'}\n`);
    
    // Test connection
    await client.query('SELECT NOW()');
    console.log('✅ 数据库连接成功\n');
    
    // Start transaction
    await client.query('BEGIN');
    
    // Create battle_sessions table
    console.log('创建 battle_sessions 表...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS battle_sessions (
        id SERIAL PRIMARY KEY,
        battlefield_id INTEGER NOT NULL,
        room_id INTEGER,
        units_state JSONB NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'active',
        phase VARCHAR(50) NOT NULL DEFAULT 'deployment',
        current_faction VARCHAR(50) NOT NULL DEFAULT 'earth',
        current_turn INTEGER NOT NULL DEFAULT 1,
        spawn_phase_done BOOLEAN NOT NULL DEFAULT false,
        spawn_order JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('  ✅ battle_sessions');
    
    // Create battle_units table with all equipment columns
    console.log('\n创建 battle_units 表...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS battle_units (
        id SERIAL PRIMARY KEY,
        battle_id INTEGER NOT NULL REFERENCES battle_sessions(id) ON DELETE CASCADE,
        unit_id INTEGER NOT NULL,
        player_id INTEGER NOT NULL,
        faction VARCHAR(50) NOT NULL,
        name VARCHAR(255) NOT NULL,
        q INTEGER NOT NULL,
        r INTEGER NOT NULL,
        hp INTEGER NOT NULL,
        ge_dou INTEGER DEFAULT 0,
        she_ji INTEGER DEFAULT 0,
        ji_dong INTEGER DEFAULT 3,
        
        -- Left hand equipment
        left_hand_type VARCHAR(50),
        left_hand_name VARCHAR(255),
        left_hand_melee INTEGER DEFAULT 0,
        left_hand_ranged INTEGER DEFAULT 0,
        left_hand_defense INTEGER DEFAULT 0,
        left_hand_durability INTEGER DEFAULT 0,
        left_hand_resistance TEXT,
        
        -- Right hand equipment
        right_hand_type VARCHAR(50),
        right_hand_name VARCHAR(255),
        right_hand_melee INTEGER DEFAULT 0,
        right_hand_ranged INTEGER DEFAULT 0,
        right_hand_defense INTEGER DEFAULT 0,
        right_hand_durability INTEGER DEFAULT 0,
        right_hand_resistance TEXT,
        
        -- Extra equipment slot
        extra_type VARCHAR(50),
        extra_name VARCHAR(255),
        extra_melee INTEGER DEFAULT 0,
        extra_ranged INTEGER DEFAULT 0,
        extra_defense INTEGER DEFAULT 0,
        extra_durability INTEGER DEFAULT 0,
        extra_resistance TEXT,
        
        -- State flags
        has_moved BOOLEAN NOT NULL DEFAULT false,
        has_acted BOOLEAN NOT NULL DEFAULT false,
        royroy_deployed BOOLEAN NOT NULL DEFAULT false,
        royroy_q INTEGER,
        royroy_r INTEGER,
        
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('  ✅ battle_units');
    
    // Create battle_logs table
    console.log('\n创建 battle_logs 表...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS battle_logs (
        id SERIAL PRIMARY KEY,
        battle_id INTEGER NOT NULL REFERENCES battle_sessions(id) ON DELETE CASCADE,
        log_type VARCHAR(50) NOT NULL,
        content TEXT NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('  ✅ battle_logs');
    
    // Create indexes
    console.log('\n创建索引...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_battle_sessions_status 
      ON battle_sessions(status)
    `);
    console.log('  ✅ idx_battle_sessions_status');
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_battle_sessions_battlefield 
      ON battle_sessions(battlefield_id)
    `);
    console.log('  ✅ idx_battle_sessions_battlefield');
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_battle_units_battle 
      ON battle_units(battle_id)
    `);
    console.log('  ✅ idx_battle_units_battle');
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_battle_logs_battle 
      ON battle_logs(battle_id)
    `);
    console.log('  ✅ idx_battle_logs_battle');
    
    // Create trigger for updated_at
    console.log('\n创建自动更新时间触发器...');
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql'
    `);
    console.log('  ✅ update_updated_at_column function');
    
    await client.query(`
      DROP TRIGGER IF EXISTS update_battle_sessions_updated_at ON battle_sessions
    `);
    await client.query(`
      CREATE TRIGGER update_battle_sessions_updated_at
        BEFORE UPDATE ON battle_sessions
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column()
    `);
    console.log('  ✅ battle_sessions trigger');
    
    await client.query(`
      DROP TRIGGER IF EXISTS update_battle_units_updated_at ON battle_units
    `);
    await client.query(`
      CREATE TRIGGER update_battle_units_updated_at
        BEFORE UPDATE ON battle_units
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column()
    `);
    console.log('  ✅ battle_units trigger');
    
    // Commit transaction
    await client.query('COMMIT');
    
    console.log('\n=== 迁移完成 ===\n');
    console.log('✅ 所有表创建成功');
    console.log('✅ 索引已创建');
    console.log('✅ 触发器已配置');
    console.log('\n表结构:');
    console.log('  - battle_sessions: 战斗会话管理');
    console.log('  - battle_units: 战斗单位 (含完整装备系统)');
    console.log('  - battle_logs: 战斗日志');
    
    // Verify tables
    console.log('\n验证表结构...');
    const tables = await client.query(`
      SELECT table_name, 
             (SELECT count(*) FROM information_schema.columns c 
              WHERE c.table_name = t.table_name) as column_count
      FROM information_schema.tables t
      WHERE t.table_schema = 'public' 
        AND t.table_type = 'BASE TABLE'
        AND t.table_name IN ('battle_sessions', 'battle_units', 'battle_logs')
      ORDER BY table_name
    `);
    
    tables.rows.forEach(table => {
      console.log(`  ✅ ${table.table_name}: ${table.column_count} 列`);
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ 迁移失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run migration
migrate()
  .then(() => {
    console.log('\n✅ 迁移成功完成');
    process.exit(0);
  })
  .catch(err => {
    console.error('\n❌ 迁移失败:', err);
    process.exit(1);
  });
