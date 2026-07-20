#!/bin/bash
echo "=== frontend 容器最新 25 条访问日志 (全 IP) ==="
docker logs mecha-frontend --since 20m 2>&1 | grep -E "POST|/api/combat\"|404" | tail -25

echo ""
echo "=== 精确匹配 POST /api/combat (无后缀) 的所有历史记录 ==="
docker logs mecha-frontend --since 6h 2>&1 | grep -F 'POST /api/combat HTTP' | tail -20

echo ""
echo "=== 用户 IP 最近 15 条任意请求 ==="
docker logs mecha-frontend --since 6h 2>&1 | grep "114.88.99.157" | tail -15
