#!/usr/bin/env node

/**
 * 创建测试用户
 * 用于调试和测试
 */

import fetch from 'node-fetch';

const API_URL = 'http://localhost:3001';

async function createUser(username, password) {
  try {
    const response = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      console.log(`✓ 用户创建成功：${username}`);
      return data;
    } else {
      console.log(`✗ 创建失败：${username} - ${data.error}`);
      return null;
    }
  } catch (err) {
    console.error(`✗ 请求失败：${username}`, err.message);
    return null;
  }
}

async function login(username, password) {
  try {
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      console.log(`✓ 登录成功：${username}`);
      console.log(`  Token: ${data.token.substring(0, 50)}...`);
      return data.token;
    } else {
      console.log(`✗ 登录失败：${username} - ${data.error}`);
      return null;
    }
  } catch (err) {
    console.error(`✗ 请求失败：${username}`, err.message);
    return null;
  }
}

async function main() {
  console.log('创建测试用户...\n');
  
  // 创建测试用户
  const users = [
    ['test', 'test123'],
    ['player1', 'password123'],
    ['player2', 'password123']
  ];
  
  for (const [username, password] of users) {
    await createUser(username, password);
  }
  
  console.log('\n测试登录...\n');
  
  // 测试登录
  const token = await login('test', 'test123');
  
  if (token) {
    console.log('\n✓ 所有操作完成！');
    console.log(`\n使用此 Token 测试战斗创建:`);
    console.log(`curl -X POST http://localhost:3004/api/battles \\`);
    console.log(`  -H "Content-Type: application/json" \\`);
    console.log(`  -H "Authorization: Bearer ${token}" \\`);
    console.log(`  -d '{"battlefield_id":1}'`);
  }
}

main();
