/**
 * PostgreSQL Connection Test
 * Run with: node test/db-connection.test.cjs
 */

import db from '../src/database/db.js';
import dotenv from 'dotenv';

dotenv.config();

async function testConnection() {
  console.log('=== 数据库连接测试 ===\n');
  console.log(`NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
  console.log(`DB_ADAPTER: ${process.env.DB_ADAPTER || 'auto'}`);
  console.log(`POSTGRES_HOST: ${process.env.POSTGRES_HOST || 'not set'}`);
  console.log(`DATABASE_URL: ${process.env.DATABASE_URL ? 'set' : 'not set'}\n`);
  
  try {
    // Wait for database initialization
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log(`数据库适配器：${db.adapterType}`);
    console.log(`连接状态：${db.adapter ? '✅ 已连接' : '❌ 未连接'}\n`);
    
    if (db.adapterType === 'postgres') {
      // Test PostgreSQL connection
      console.log('测试 PostgreSQL 查询...');
      const result = await db.query('SELECT NOW() as now, version() as version');
      console.log('✅ PostgreSQL 版本:', result[0].version?.substring(0, 50));
      console.log('✅ 当前时间:', result[0].now);
      
      // Check if tables exist
      console.log('\n检查表结构...');
      const tables = await db.query(`
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN ('battle_sessions', 'battle_units', 'battle_logs')
      `);
      
      if (tables.length > 0) {
        console.log('✅ 已有表:', tables.map(t => t.table_name).join(', '));
      } else {
        console.log('⚠️  表不存在，需要运行迁移脚本');
        console.log('   运行：node src/database/migrations/001-initial-schema.mjs');
      }
    } else {
      // Test SQLite connection
      console.log('测试 SQLite 查询...');
      const result = await db.query('SELECT sqlite_version() as version');
      console.log('✅ SQLite 版本:', result[0]?.version);
      console.log('✅ 数据库路径:', db.dbPath);
    }
    
    // Test basic operations
    console.log('\n测试基本操作...');
    
    // Create a test battle
    const testBattle = await db.createBattle(
      999, // battlefield_id
      null, // room_id
      { test: true, timestamp: new Date().toISOString() }
    );
    console.log('✅ 创建测试战斗:', testBattle?.id);
    
    // Get battle by ID
    const retrieved = await db.getBattleById(testBattle.id);
    console.log('✅ 查询战斗:', retrieved?.id === testBattle.id ? '成功' : '失败');
    
    // Update battle state
    await db.updateBattleState(testBattle.id, { test: true, updated: true });
    console.log('✅ 更新战斗状态');
    
    // Clean up test battle
    await db.execute(
      db.adapterType === 'postgres' 
        ? 'DELETE FROM battle_sessions WHERE id = $1' 
        : 'DELETE FROM battle_sessions WHERE id = ?',
      [testBattle.id]
    );
    console.log('✅ 清理测试数据');
    
    console.log('\n=== 测试完成 ===');
    console.log('✅ 所有测试通过！数据库工作正常。\n');
    
    // Close connection
    await db.close();
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    console.error(error.stack);
    
    if (db.adapter) {
      await db.close();
    }
    
    process.exit(1);
  }
}

testConnection();
