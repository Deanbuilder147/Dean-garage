#!/bin/bash
set -e
echo "=== 确认服务器源码已更新 ==="
grep -n "battlefield_id" /root/mecha-universe-engine/frontend/src/views/NewPreparationRoom.vue

echo ""
echo "=== 构建 frontend dist (npm run build) ==="
cd /root/mecha-universe-engine/frontend
npm run build 2>&1 | tail -20

echo ""
echo "=== 重建 frontend 镜像并重启 ==="
cd /root/mecha-universe-engine
docker compose build frontend 2>&1 | tail -15
docker compose up -d frontend 2>&1 | tail -10

echo ""
echo "=== 验证新 bundle 已包含 mapId 逻辑 ==="
sleep 3
JS=$(curl -s http://localhost:8081/ | grep -oE '/assets/index-[^"]+\.js' | head -1)
curl -s "http://localhost:8081$JS" | grep -oc "mapId" && echo "新 bundle 含 mapId 引用 ✓"
