#!/bin/bash
echo "=== docker 容器状态 ==="
docker ps --format "table {{.Names}}\t{{.Ports}}\t{{.Status}}"

echo ""
echo "=== host 上监听的端口 ==="
ss -tlnp 2>/dev/null | grep -E ":80 |:443 |:8081 |:3006 |:8080 " || netstat -tlnp 2>/dev/null | grep -E ":80 |:443 |:8081 |:3006 "

echo ""
echo "=== host 是否有 nginx 在跑 ==="
ps aux | grep -E "[n]ginx" | head
which nginx 2>/dev/null && echo "host nginx 存在"

echo ""
echo "=== host nginx 配置 (如有) ==="
if [ -f /etc/nginx/nginx.conf ]; then
  nginx -T 2>/dev/null | grep -n "location\|proxy_pass\|server_name\|listen" | head -40
fi

echo ""
echo "=== 测试 host:80 / host:443 对外入口 ==="
curl -s -o /dev/null -w "host:80 /api/combat -> HTTP %{http_code}\n" -X POST http://localhost:80/api/combat -H "Content-Type: application/json" -d '{"battlefield_id":1}' 2>/dev/null
curl -s -o /dev/null -w "host:443 /api/combat -> HTTP %{http_code}\n" -X POST https://localhost:443/api/combat -H "Content-Type: application/json" -d '{"battlefield_id":1}' 2>/dev/null -k
