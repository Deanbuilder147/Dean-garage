#!/usr/bin/env node

/**
 * 战斗服务检查脚本
 * 验证服务结构和配置
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function checkServiceStructure() {
  console.log('🔍 检查战斗服务结构...\n');
  
  const requiredFiles = [
    'package.json',
    'src/index.js',
    'src/routes/battles.js',
    'src/services/combatResolver.js',
    'src/services/turnManager.js',
    'src/services/socketService.js',
    'src/database/db.js',
    'src/middleware/auth.js',
    'README.md',
    'Dockerfile'
  ];
  
  let allFilesExist = true;
  
  requiredFiles.forEach(file => {
    const filePath = path.join(__dirname, file);
    const exists = fs.existsSync(filePath);
    const status = exists ? '✅' : '❌';
    console.log(`${status} ${file}`);
    
    if (!exists) {
      allFilesExist = false;
    }
  });
  
  console.log();
  return allFilesExist;
}

function checkPackageJSON() {
  console.log('📦 检查package.json配置...\n');
  
  try {
    const packagePath = path.join(__dirname, 'package.json');
    const packageData = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    
    console.log(`✅ 名称: ${packageData.name}`);
    console.log(`✅ 版本: ${packageData.version}`);
    console.log(`✅ 主入口: ${packageData.main}`);
    console.log(`✅ 类型: ${packageData.type || 'commonjs'}`);
    
    // 检查依赖
    const deps = packageData.dependencies || {};
    console.log('\n📦 依赖检查:');
    console.log(`✅ express: ${deps.express || '未找到'}`);
    console.log(`✅ cors: ${deps.cors || '未找到'}`);
    console.log(`✅ dotenv: ${deps.dotenv || '未找到'}`);
    console.log(`✅ jsonwebtoken: ${deps['jsonwebtoken'] || '未找到'}`);
    console.log(`✅ sql.js: ${deps['sql.js'] || '未找到'}`);
    console.log(`✅ ws: ${deps.ws || '未找到'}`);
    
    // 检查脚本
    const scripts = packageData.scripts || {};
    console.log('\n🚀 脚本检查:');
    console.log(`✅ start: ${scripts.start || '未找到'}`);
    console.log(`✅ dev: ${scripts.dev || '未找到'}`);
    console.log(`✅ test: ${scripts.test || '未找到'}`);
    
    return true;
  } catch (error) {
    console.error(`❌ 读取package.json失败: ${error.message}`);
    return false;
  }
}

function checkEnvFile() {
  console.log('⚙️ 检查环境配置...\n');
  
  const envPath = path.join(__dirname, '.env');
  
  if (!fs.existsSync(envPath)) {
    console.log('⚠️  .env文件不存在，正在创建示例文件...');
    
    const exampleEnv = `# 战斗服务配置
PORT=3004
JWT_SECRET=mecha-battle-combat-secret

# 数据库配置
DB_PATH=./data/combat.db

# 其他服务地址
AUTH_SERVICE_URL=http://localhost:3001
MAP_SERVICE_URL=http://localhost:3003
HANGAR_SERVICE_URL=http://localhost:3002
COMM_SERVICE_URL=http://localhost:3005

# WebSocket配置
WS_HOST=localhost`;
    
    fs.writeFileSync('.env.example', exampleEnv);
    console.log('✅ 已创建.env.example文件');
    console.log('ℹ️  请复制.env.example为.env并修改配置');
    return false;
  }
  
  console.log('✅ .env文件存在');
  
  try {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const lines = envContent.split('\n').filter(line => line.trim() && !line.trim().startsWith('#'));
    
    console.log(`✅ 找到 ${lines.length} 个配置项`);
    
    // 检查关键配置
    const requiredConfigs = ['PORT', 'JWT_SECRET', 'DB_PATH'];
    requiredConfigs.forEach(config => {
      if (envContent.includes(config)) {
        console.log(`✅ ${config}: 已配置`);
      } else {
        console.log(`⚠️  ${config}: 未配置`);
      }
    });
    
    return true;
  } catch (error) {
    console.error(`❌ 读取.env文件失败: ${error.message}`);
    return false;
  }
}

function checkDatabaseConfig() {
  console.log('\n🗄️ 检查数据库配置...\n');
  
  try {
    const dbPath = path.join(__dirname, 'src/database/db.js');
    const dbContent = fs.readFileSync(dbPath, 'utf8');
    
    // 检查关键方法
    const requiredMethods = ['initializeDatabase', 'createTables', 'run', 'get', 'all'];
    requiredMethods.forEach(method => {
      if (dbContent.includes(method)) {
        console.log(`✅ 数据库方法 ${method}: 存在`);
      } else {
        console.log(`❌ 数据库方法 ${method}: 缺失`);
      }
    });
    
    // 检查表结构
    const requiredTables = ['battle_sessions', 'battle_units', 'battle_logs'];
    requiredTables.forEach(table => {
      if (dbContent.includes(`CREATE TABLE.*${table}`)) {
        console.log(`✅ 数据库表 ${table}: 存在`);
      } else {
        console.log(`❌ 数据库表 ${table}: 缺失`);
      }
    });
    
    return true;
  } catch (error) {
    console.error(`❌ 检查数据库配置失败: ${error.message}`);
    return false;
  }
}

function checkAPIRoutes() {
  console.log('\n📡 检查API路由...\n');
  
  try {
    const routesPath = path.join(__dirname, 'src/routes/battles.js');
    const routesContent = fs.readFileSync(routesPath, 'utf8');
    
    const requiredRoutes = [
      'router.get.*battles',
      'router.post.*battles',
      'router.get.*battles/:id',
      'router.post.*battles/:id/move',
      'router.post.*battles/:id/attack',
      'router.post.*battles/:id/end-turn'
    ];
    
    requiredRoutes.forEach(routePattern => {
      if (new RegExp(routePattern).test(routesContent)) {
        console.log(`✅ API路由 ${routePattern.replace('router.', '')}: 存在`);
      } else {
        console.log(`❌ API路由 ${routePattern.replace('router.', '')}: 缺失`);
      }
    });
    
    return true;
  } catch (error) {
    console.error(`❌ 检查API路由失败: ${error.message}`);
    return false;
  }
}

function checkCombatSystem() {
  console.log('\n⚔️ 检查战斗系统...\n');
  
  try {
    const combatPath = path.join(__dirname, 'src/services/combatResolver.js');
    const combatContent = fs.readFileSync(combatPath, 'utf8');
    
    const requiredFeatures = [
      'resolveAttack',
      'checkSurpriseAttack',
      'resolveSurpriseAttack',
      'resolveEarthArtillery',
      'resolveFogSystem',
      'getSupportUnits'
    ];
    
    requiredFeatures.forEach(feature => {
      if (combatContent.includes(feature)) {
        console.log(`✅ 战斗功能 ${feature}: 存在`);
      } else {
        console.log(`❌ 战斗功能 ${feature}: 缺失`);
      }
    });
    
    return true;
  } catch (error) {
    console.error(`❌ 检查战斗系统失败: ${error.message}`);
    return false;
  }
}

function checkTurnManager() {
  console.log('\n🔄 检查回合管理系统...\n');
  
  try {
    const turnPath = path.join(__dirname, 'src/services/turnManager.js');
    const turnContent = fs.readFileSync(turnPath, 'utf8');
    
    const requiredFeatures = [
      'getNextFaction',
      'initSpawnSelection',
      'nextTurn',
      'checkVictory',
      'calculateDistance'
    ];
    
    requiredFeatures.forEach(feature => {
      if (turnContent.includes(feature)) {
        console.log(`✅ 回合管理功能 ${feature}: 存在`);
      } else {
        console.log(`❌ 回合管理功能 ${feature}: 缺失`);
      }
    });
    
    return true;
  } catch (error) {
    console.error(`❌ 检查回合管理系统失败: ${error.message}`);
    return false;
  }
}

function main() {
  console.log('========================================');
  console.log('机甲战棋游戏 - 战斗服务完整性检查');
  console.log('========================================\n');
  
  const checks = [
    { name: '服务结构', fn: checkServiceStructure },
    { name: '包配置', fn: checkPackageJSON },
    { name: '环境配置', fn: checkEnvFile },
    { name: '数据库配置', fn: checkDatabaseConfig },
    { name: 'API路由', fn: checkAPIRoutes },
    { name: '战斗系统', fn: checkCombatSystem },
    { name: '回合管理', fn: checkTurnManager }
  ];
  
  let allPassed = true;
  
  checks.forEach(check => {
    console.log(`\n🔍 检查: ${check.name}`);
    console.log('─'.repeat(40));
    const passed = check.fn();
    if (!passed) {
      allPassed = false;
    }
  });
  
  console.log('\n' + '='.repeat(40));
  console.log('检查完成!');
  console.log('='.repeat(40));
  
  if (allPassed) {
    console.log('🎉 所有检查通过！战斗服务结构完整。');
    console.log('\n🚀 启动命令:');
    console.log('   npm start');
    console.log('   node src/index.js');
    console.log('   ./start.sh');
  } else {
    console.log('⚠️  部分检查未通过，请修复上述问题。');
  }
  
  console.log('\n📊 服务信息:');
  console.log('   - 端口: 3004 (HTTP API)');
  console.log('   - WebSocket: 3004 (共用)');
  console.log('   - 健康检查: http://localhost:3004/health');
  console.log('   - API文档: 查看README.md');
}

main();