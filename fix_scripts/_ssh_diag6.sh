#!/bin/bash
echo "=== frontend 容器访问日志 (含 combat / 404) ==="
docker logs mecha-frontend --since 60m 2>&1 | grep -iE "combat|404|/api" | tail -50

echo ""
echo "=== frontend 容器最近全部访问日志 (最后 30 行) ==="
docker logs mecha-frontend --since 60m 2>&1 | tail -30
