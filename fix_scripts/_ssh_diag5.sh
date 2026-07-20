#!/bin/bash
echo "=== gateway 最近日志 (含 404 / combat / error) ==="
docker logs mecha-gateway --since 30m 2>&1 | grep -iE "404|combat|notfound|not_found|error|warn" | tail -40

echo ""
echo "=== gateway 健康检查 ==="
curl -s -o /dev/null -w "/health -> HTTP %{http_code}\n" http://localhost:3006/health
docker inspect mecha-gateway --format '{{json .State.Health}}' 2>/dev/null | head -c 500

echo ""
echo "=== frontend nginx access 日志是否开启 ==="
docker exec mecha-frontend sh -c "nginx -T 2>/dev/null | grep -i 'access_log' | head"
docker exec mecha-frontend sh -c "ls -la /var/log/nginx/ 2>/dev/null"
