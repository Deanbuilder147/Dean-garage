#!/bin/bash
echo "=== 容器内 nginx 配置 (nginx -T) ==="
docker exec mecha-frontend sh -c "nginx -T 2>/dev/null" | grep -n "location\|api/combat\|proxy_pass" | head -60

echo ""
echo "=== 测试 8081 -> gateway 链路 (POST /api/combat) ==="
curl -s -o /dev/null -w "HTTP %{http_code}\n" -X POST http://localhost:8081/api/combat \
  -H "Content-Type: application/json" \
  -d '{"battlefield_id":1}'

echo ""
echo "=== 直接测试 gateway:3006 (绕过 nginx) ==="
curl -s -o /dev/null -w "HTTP %{http_code}\n" -X POST http://localhost:3006/api/combat \
  -H "Content-Type: application/json" \
  -d '{"battlefield_id":1}'
