#!/bin/bash

# 创建测试用户脚本

API_URL="http://localhost:3001"

echo "创建测试用户..."
echo ""

# 创建用户
create_user() {
  local username=$1
  local password=$2
  
  echo "创建用户：$username"
  curl -s -X POST "$API_URL/api/auth/register" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$username\",\"password\":\"$password\"}" | jq '.'
  echo ""
}

# 登录
login() {
  local username=$1
  local password=$2
  
  echo "登录：$username"
  local result=$(curl -s -X POST "$API_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$username\",\"password\":\"$password\"}")
  
  echo "$result" | jq '.'
  
  local token=$(echo "$result" | jq -r '.token')
  if [ "$token" != "null" ] && [ -n "$token" ]; then
    echo ""
    echo "✓ 登录成功！Token: ${token:0:50}..."
    echo "$token" > /tmp/test_token.txt
    echo "Token 已保存到 /tmp/test_token.txt"
  fi
}

# 主程序
create_user "test" "test123"
create_user "player1" "password123"
create_user "player2" "password123"

echo ""
echo "测试登录..."
echo ""
login "test" "test123"
