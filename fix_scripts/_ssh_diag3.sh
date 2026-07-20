#!/bin/bash
echo "=== 已部署 index.html 引用的 JS ==="
JS=$(curl -s http://localhost:8081/ | grep -oE '/assets/index-[^"]+\.js' | head -1)
echo "JS bundle: $JS"

echo ""
echo "=== 前端产物中的 API base 配置 (baseURL / VITE_API / /api) ==="
curl -s "http://localhost:8081$JS" | grep -oE "(baseURL:\"[^\"]*\"|VITE_API_BASE[^\"\x27 ]*|/api/combat|/api/|\"http://[^\"\x27 ]+))" | head -20

echo ""
echo "=== 直接抓 frontend 容器内 nginx 实际 location /api/combat 块上下文 ==="
docker exec mecha-frontend sh -c "nginx -T 2>/dev/null" | sed -n '218,235p'
