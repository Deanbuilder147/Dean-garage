#!/usr/bin/env node
/**
 * Comm-Service 与 Combat-Service 集成测试
 * 测试流程：
 * 1. 调用 Comm-Service 创建房间
 * 2. 验证返回的 battle_id 是 UUID v4 格式
 * 3. 验证 Combat-Service 中创建了相应的战斗会话
 */

import fetch from 'node-fetch';

const COMM_SERVICE_URL = 'http://localhost:3005';
const COMBAT_SERVICE_URL = 'http://localhost:3004';
const AUTH_SERVICE_URL = 'http://localhost:3001';

// UUID v4 验证正则
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function testIntegration() {
  console.log('🧪 开始集成测试...\n');
  
  try {
    // 步骤 1: 登录获取 token
    console.log('📝 步骤 1: 登录获取 token...');
    const loginRes = await fetch(`${AUTH_SERVICE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'testuser',
        password: 'test123'
      })
    });
    
    if (!loginRes.ok) {
      console.log('⚠️  登录失败，尝试注册...');
      const registerRes = await fetch(`${AUTH_SERVICE_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'testuser',
          password: 'test123',
          email: 'test@example.com'
        })
      });
      
      if (!registerRes.ok) {
        throw new Error('注册失败');
      }
      
      const loginRes2 = await fetch(`${AUTH_SERVICE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'testuser',
          password: 'test123'
        })
      });
      
      if (!loginRes2.ok) {
        throw new Error('登录后获取 token 失败');
      }
      
      const loginData = await loginRes2.json();
      var token = loginData.token;
      console.log('✅ 注册并登录成功\n');
    } else {
      const loginData = await loginRes.json();
      var token = loginData.token;
      console.log('✅ 登录成功\n');
    }
    
    // 步骤 2: 调用 Comm-Service 创建房间
    console.log('🏠 步骤 2: 调用 Comm-Service 创建房间...');
    const roomRes = await fetch(`${COMM_SERVICE_URL}/api/comm/rooms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        battlefield_id: 1,
        max_players: 2
      })
    });
    
    if (!roomRes.ok) {
      const errorData = await roomRes.text();
      throw new Error(`创建房间失败：${errorData}`);
    }
    
    const roomData = await roomRes.json();
    console.log('✅ 房间创建成功');
    console.log(`   房间 ID: ${roomData.room.id}`);
    console.log(`   Battle ID: ${roomData.room.battle_id}`);
    console.log(`   战场 ID: ${roomData.room.battlefield_id}\n`);
    
    // 步骤 3: 验证 battle_id 是 UUID v4 格式
    console.log('✓ 步骤 3: 验证 battle_id 格式...');
    const isUUID = UUID_REGEX.test(roomData.room.battle_id);
    
    if (!isUUID) {
      throw new Error(`❌ battle_id 不是 UUID v4 格式：${roomData.room.battle_id}`);
    }
    console.log('✅ battle_id 是正确的 UUID v4 格式\n');
    
    // 步骤 4: 验证 Combat-Service 中存在该战斗会话
    console.log('⚔️  步骤 4: 验证 Combat-Service 中的战斗会话...');
    const battleRes = await fetch(`${COMBAT_SERVICE_URL}/api/combat/battles/${roomData.room.battle_id}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!battleRes.ok) {
      throw new Error(`Combat-Service 中未找到战斗会话：${roomData.room.battle_id}`);
    }
    
    const battleData = await battleRes.json();
    console.log('✅ Combat-Service 中存在该战斗会话');
    console.log(`   战斗 ID: ${battleData.battle.id}`);
    console.log(`   战场 ID: ${battleData.battle.battlefield_id}`);
    console.log(`   状态：${battleData.battle.status}`);
    console.log(`   阶段：${battleData.battle.phase}\n`);
    
    // 步骤 5: 验证数据一致性
    console.log('🔗 步骤 5: 验证数据一致性...');
    
    if (battleData.battle.id !== roomData.room.battle_id) {
      throw new Error('Comm-Service 和 Combat-Service 的 battle_id 不一致');
    }
    
    if (battleData.battle.battlefield_id !== roomData.room.battlefield_id) {
      throw new Error('战场 ID 不一致');
    }
    
    console.log('✅ 数据一致性验证通过\n');
    
    // 测试成功
    console.log('🎉 所有测试通过！');
    console.log('\n📊 测试结果汇总:');
    console.log('   ✓ Comm-Service 成功调用 Combat-Service 创建战斗');
    console.log('   ✓ battle_id 使用 UUID v4 格式');
    console.log('   ✓ Combat-Service 正确存储战斗会话');
    console.log('   ✓ 跨服务数据一致性良好');
    console.log('\n✨ Comm-Service 与 Combat-Service 集成正常！\n');
    
    return true;
    
  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    console.error('   错误详情:', error.stack);
    return false;
  }
}

// 运行测试
testIntegration().then(success => {
  process.exit(success ? 0 : 1);
});
