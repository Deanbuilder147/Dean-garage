#!/bin/bash
echo "=== node / npm 版本 ==="
node --version 2>&1; npm --version 2>&1
echo "=== 服务器 frontend 目录 ==="
ls -la /root/mecha-universe-engine/frontend/ 2>&1 | head
echo "=== dist 是否存在 ==="
ls /root/mecha-universe-engine/frontend/dist/ 2>&1 | head
echo "=== src/views/NewPreparationRoom.vue 当前 battlefield_id 行 ==="
grep -n "battlefield_id" /root/mecha-universe-engine/frontend/src/views/NewPreparationRoom.vue 2>&1
echo "=== compose 文件位置确认 ==="
ls -la /root/mecha-universe-engine/docker-compose.yml 2>&1
