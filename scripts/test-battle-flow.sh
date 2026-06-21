#!/bin/bash

# 测试战斗创建完整流程

set -e

API_URL="http://localhost:3001"
COMM_URL="http://localhost:3005"
COMBAT_URL="http://localhost:3004"

echo "======================================"
echo "机甲战棋 - 战斗创建流程测试"
echo "======================================"
echo ""

# 1. 登录获取 token
echo "1. 登录获取 token..."
TOKEN=$(curl -s -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"test123"}' | jq -r '.token')

if [ "$TOKEN" == "null" ] || [ -z "$TOKEN" ]; then
  echo "✗ 登录失败"
  exit 1
fi
echo "✓ 登录成功，Token: ${TOKEN:0:50}..."
echo ""

# 2. 创建房间（会自动创建战斗）
echo "2. 创建房间（应自动创建战斗）..."
ROOM_RESPONSE=$(curl -s -X POST "$COMM_URL/api/comm/rooms" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"battlefield_id":1}')

echo "$ROOM_RESPONSE" | jq '.'

ROOM_ID=$(echo "$ROOM_RESPONSE" | jq -r '.room.id')
BATTLE_ID=$(echo "$ROOM_RESPONSE" | jq -r '.room.battle_id')

if [ "$ROOM_ID" == "null" ] || [ -z "$ROOM_ID" ]; then
  echo "✗ 房间创建失败"
  exit 1
fi

echo ""
echo "✓ 房间创建成功"
echo "  Room ID: $ROOM_ID"
echo "  Battle ID: $BATTLE_ID"
echo ""

# 3. 验证战斗已创建
echo "3. 验证战斗数据..."
BATTLE_RESPONSE=$(curl -s -X GET "$COMBAT_URL/api/combat/battles/$BATTLE_ID" \
  -H "Authorization: Bearer $TOKEN")

echo "$BATTLE_RESPONSE" | jq '.'

BATTLEFIELD_STATE=$(echo "$BATTLE_RESPONSE" | jq -r '.battle.battlefield_state')

if [ "$BATTLEFIELD_STATE" == "null" ] || [ -z "$BATTLEFIELD_STATE" ]; then
  echo "✗ 战斗状态为空"
  exit 1
fi

echo ""
echo "✓ 战斗数据获取成功"
echo ""

# 4. 检查战场状态
echo "4. 检查战场状态详情..."
echo "$BATTLE_RESPONSE" | jq '.battle.battlefield_state' | jq '.'

CELLS_COUNT=$(echo "$BATTLE_RESPONSE" | jq '.battle.battlefield_state.cells | length')
PHASE=$(echo "$BATTLE_RESPONSE" | jq -r '.battle.battlefield_state.phase')
WIDTH=$(echo "$BATTLE_RESPONSE" | jq -r '.battle.battlefield_state.width')
HEIGHT=$(echo "$BATTLE_RESPONSE" | jq -r '.battle.battlefield_state.height')

echo ""
echo "======================================"
echo "测试结果:"
echo "======================================"
echo "  战场大小：${WIDTH} x ${HEIGHT}"
echo "  格子数量：$CELLS_COUNT"
echo "  当前阶段：$PHASE"
echo "======================================"

if [ "$CELLS_COUNT" -gt 0 ]; then
  echo "✓ 测试通过！战场数据完整"
else
  echo "✗ 测试失败：格子数量为 0"
  exit 1
fi
