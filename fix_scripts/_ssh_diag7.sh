#!/bin/bash
echo "=== 用户 114.88.99.157 的所有 combat 相关请求 ==="
docker logs mecha-frontend --since 120m 2>&1 | grep "114.88.99.157" | grep -iE "combat" 

echo ""
echo "=== 用户所有请求的状态码分布 (只看 /api) ==="
docker logs mecha-frontend --since 120m 2>&1 | grep "114.88.99.157" | grep "POST\|/api/combat" | grep -oE "\"(POST|GET|PUT|DELETE) /[^ ]* HTTP/1.1\" [0-9]+" | sort | uniq -c | sort -rn

echo ""
echo "=== 用户最近 20 条请求 (任意) ==="
docker logs mecha-frontend --since 120m 2>&1 | grep "114.88.99.157" | tail -20
