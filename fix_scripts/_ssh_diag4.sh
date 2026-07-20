#!/bin/bash
echo "=== 测试 nginx 对 /combat (无 /api 前缀) ==="
curl -s -o /dev/null -w "POST /combat -> HTTP %{http_code}\n" -X POST http://localhost:8081/combat -H "Content-Type: application/json" -d '{"battlefield_id":1}'

echo ""
echo "=== 线上 bundle 中的 URL 构造片段 ==="
curl -s "http://localhost:8081/assets/index-sM7REH2z.js" > /tmp/bundle.js
echo "bundle 大小: $(wc -c < /tmp/bundle.js) bytes"
echo "--- 搜索 createBattle / /combat / baseURL ---"
grep -oE "createBattle[^,;]{0,40}" /tmp/bundle.js | head -5
grep -oE "baseURL[^,;}]{0,40}" /tmp/bundle.js | head -5
grep -oE "VITE_API_BASE" /tmp/bundle.js | head -3
echo "--- 统计 /api 出现次数 ---"
grep -oc "/api" /tmp/bundle.js
echo "--- 统计 /combat 出现次数 ---"
grep -oc "/combat" /tmp/bundle.js
