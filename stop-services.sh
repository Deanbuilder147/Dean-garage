#!/bin/bash
# 机甲战棋游戏 - 停止服务脚本

echo "🛑 Stopping all services..."

for pidfile in /tmp/auth-service.pid /tmp/hangar-service.pid /tmp/map-service.pid /tmp/combat-service.pid /tmp/comm-service.pid /tmp/online-battle-service.pid /tmp/frontend.pid; do
    if [ -f "$pidfile" ]; then
        pid=$(cat $pidfile)
        name=$(basename $pidfile .pid)
        echo "  Stopping $name (PID: $pid)"
        kill $pid 2>/dev/null || true
        rm $pidfile
    fi
done

# Also kill by port as backup
for port in 3001 3002 3003 3004 3005 3006 8081; do
    pid=$(lsof -t -i:$port 2>/dev/null || true)
    if [ -n "$pid" ]; then
        echo "  Force stopping port $port (PID: $pid)"
        kill $pid 2>/dev/null || true
    fi
done

echo "✅ All services stopped"
