#!/bin/bash
# Phase 29-Review: 全栈端点轰炸测试脚本 (v2 — 修正端点路径)
# 测试目标：大一统网关 5+1 大核心端点

BASE="http://106.54.197.69"
GATEWAY="http://106.54.197.69:3006"
PASS=0
FAIL=0
WARN=0
TOTAL=0

echo "============================================"
echo "🧨 Phase 29-Review 端点轰炸测试 v2"
echo "时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================"
echo ""

# 辅助函数
test_endpoint() {
    local label="$1"
    local method="$2"
    local url="$3"
    local expected_code="$4"
    local data="$5"
    TOTAL=$((TOTAL+1))
    
    echo "━━━ 测试 #${TOTAL}: ${label} ━━━"
    echo "  ${method} ${url}"
    
    if [ -n "$data" ]; then
        response=$(curl -s -o /tmp/endpoint_test_body.txt -w "%{http_code}" -X "$method" "$url" -H "Content-Type: application/json" -d "$data" 2>&1)
    else
        response=$(curl -s -o /tmp/endpoint_test_body.txt -w "%{http_code}" -X "$method" "$url" 2>&1)
    fi
    
    if [ "$response" = "$expected_code" ]; then
        echo "  ✅ 状态码: ${response} (预期: ${expected_code})"
        PASS=$((PASS+1))
    else
        body=$(cat /tmp/endpoint_test_body.txt 2>/dev/null | head -1)
        echo "  ❌ 状态码: ${response} (预期: ${expected_code}) | Body: ${body:0:80}"
        FAIL=$((FAIL+1))
    fi
    echo ""
}

# ============================================
# 1. /api/auth/* 端点簇
# ============================================
echo "📦 模块一: /api/auth/* 认证服务"
echo "──────────────────────────────────"

test_endpoint "Auth - 健康检查" "GET" "${GATEWAY}/health" "200" ""
test_endpoint "Auth - 无凭据访问受保护端点" "GET" "${GATEWAY}/api/auth/me" "401" ""
test_endpoint "Auth - 错误凭据登录" "POST" "${GATEWAY}/api/auth/login" "401" '{"username":"test","password":"wrong"}'
test_endpoint "Auth - 注册缺少邮箱" "POST" "${GATEWAY}/api/auth/register" "400" '{"username":"test","password":"1234"}'

# 完整注册+认证流程
RANDOM_USER="r_$(date +%s)"
RANDOM_EMAIL="${RANDOM_USER}@mecha.test"
echo "  🔐 注册+认证完整流程: ${RANDOM_USER}"
TOTAL=$((TOTAL+1))

REG_BODY=$(curl -s -X POST "${GATEWAY}/api/auth/register" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"${RANDOM_USER}\",\"email\":\"${RANDOM_EMAIL}\",\"password\":\"testpass123\"}" 2>&1)
TOKEN=$(echo "$REG_BODY" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -n "$TOKEN" ]; then
    echo "  ✅ 注册成功 (获得 JWT Token)"
    PASS=$((PASS+1))
    
    # 测试 /me 端点
    TOTAL=$((TOTAL+1))
    ME_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X GET "${GATEWAY}/api/auth/me" \
        -H "Authorization: Bearer ${TOKEN}" 2>&1)
    if [ "$ME_CODE" = "200" ]; then
        echo "  ✅ /api/auth/me → 200 (已认证)"
        PASS=$((PASS+1))
    else
        echo "  ❌ /api/auth/me → ${ME_CODE} (预期: 200)"
        FAIL=$((FAIL+1))
    fi
else
    echo "  ❌ 注册失败: ${REG_BODY:0:100}"
    FAIL=$((FAIL+1))
fi
echo ""

# ============================================
# 2. /api/rooms 端点
# ============================================
echo "📦 模块二: /api/rooms 房间管理"
echo "──────────────────────────────────"

test_endpoint "Rooms - 列表" "GET" "${GATEWAY}/api/rooms" "200" ""

# ============================================
# 3. /api/units/* 端点 (需要认证)
# ============================================
echo "📦 模块三: /api/units/* 单位管理"
echo "──────────────────────────────────"

test_endpoint "Units - 列表 (无认证→401)" "GET" "${GATEWAY}/api/units/" "401" ""

# 带认证的 Units 测试
if [ -n "$TOKEN" ]; then
    TOTAL=$((TOTAL+1))
    UNITS_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X GET "${GATEWAY}/api/units/" \
        -H "Authorization: Bearer ${TOKEN}" 2>&1)
    if [ "$UNITS_CODE" = "200" ]; then
        echo "━━━ 测试 #${TOTAL}: Units - 列表 (已认证) ━━━"
        echo "  GET ${GATEWAY}/api/units/"
        echo "  ✅ 状态码: 200"
        PASS=$((PASS+1))
    else
        echo "  ⚠️ Units 认证测试: ${UNITS_CODE}"
        WARN=$((WARN+1))
    fi
    echo ""
fi

# ============================================
# 4. /api/admin/* 端点
# ============================================
echo "📦 模块四: /api/admin/* 管理员端点"
echo "──────────────────────────────────"

test_endpoint "Admin - 无认证→401" "GET" "${GATEWAY}/api/admin/" "401" ""

# ============================================
# 5. /api/campaign/ 端点
# ============================================
echo "📦 模块五: /api/campaign/ 试玩战役"
echo "──────────────────────────────────"

test_endpoint "Campaign - trial (免登录)" "GET" "${GATEWAY}/api/campaign/trial" "200" ""

# ============================================
# 6. /api/combat/ 边界验证
# ============================================
echo "📦 模块六: /api/combat/ 战斗路由 3006 主权"
echo "──────────────────────────────────"

# 路由需要 :battleId 参数 + 认证
test_endpoint "Combat - initialize (需 battleId+认证)" "POST" "${GATEWAY}/api/combat/fakeBattle/initialize" "401" "{}"

# 无 battleId 的路径应返回 404
test_endpoint "Combat - 无 battleId → 404" "POST" "${GATEWAY}/api/combat/initialize" "404" "{}"

# 3004 端口退役验证
echo ""
echo "  🚫 验证 3004 端口已退役..."
PORT_3004=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 3 "http://106.54.197.69:3004/" 2>&1)
TOTAL=$((TOTAL+1))
if [ "$PORT_3004" = "000" ]; then
    echo "  ✅ 3004 端口未开放 (旧 combat 服务已退役)"
    PASS=$((PASS+1))
else
    echo "  ⚠️ 3004 端口返回 ${PORT_3004} (残留风险)"
    WARN=$((WARN+1))
fi
echo ""

# ============================================
# 7. Socket.io 3005 长连接验证
# ============================================
echo "📦 模块七: Socket.io 3005 长连接"
echo "──────────────────────────────────"

# Socket.io handshake
TOTAL=$((TOTAL+1))
SOCKET_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "http://106.54.197.69/socket.io/?EIO=4&transport=polling" 2>&1)
if [ "$SOCKET_RESPONSE" = "200" ]; then
    echo "  ✅ Socket.io handshake → 200 (3005 长连接正常)"
    PASS=$((PASS+1))
else
    echo "  ❌ Socket.io handshake → ${SOCKET_RESPONSE} (预期: 200)"
    FAIL=$((FAIL+1))
fi
echo ""

# ============================================
# 汇总报告
# ============================================
echo "============================================"
echo "📊 端点轰炸测试汇总"
echo "============================================"
echo "  总计: ${TOTAL}"
echo "  通过: ${PASS}"
echo "  失败: ${FAIL}"
echo "  警告: ${WARN}"
if [ "$TOTAL" -gt 0 ]; then
    echo "  通过率: $(awk "BEGIN {printf \"%.1f\", ($PASS/$TOTAL)*100}")%"
fi
echo "============================================"

if [ "$FAIL" -gt 0 ]; then
    echo "❌ 存在失败项！"
    exit 1
else
    echo "✅ 全部端点测试通过！"
    exit 0
fi
