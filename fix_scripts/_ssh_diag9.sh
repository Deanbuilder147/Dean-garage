#!/bin/bash
echo "=== 可用战场列表 (GET /api/map/battlefields, 游客可读) ==="
curl -s http://localhost:8081/api/map/battlefields -H "Content-Type: application/json" | head -c 2000
echo ""
echo "=== 网关使用哪个 DB? ==="
docker exec mecha-gateway sh -c "cat /app/dist/config.js 2>/dev/null | grep -iE 'sqlite|postgres|dbPath|database' | head" 2>/dev/null
echo "--- 查找 sqlite 文件 ---"
docker exec mecha-gateway sh -c "find / -name '*.db' -o -name '*.sqlite' 2>/dev/null | head" 2>/dev/null
