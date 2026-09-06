#!/bin/bash
# 机甲战棋游戏 - 主机运行脚本 (Host Runner)
# 不需要 Docker - 直接在系统上运行服务

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "======================================"
echo "🚀 机甲战棋游戏 - 启动服务"
echo "======================================"

# Load environment variables
if [ -f .env ]; then
    set -a
    source <(grep -v '^#' .env | grep -v '^\s*$')
    set +a
    echo "✅ .env loaded"
fi

# Kill existing services safely
echo "📋 Stopping existing services..."
for port in 3001 3002 3003 3004 3005 3006; do
    pid=$(lsof -t -i:$port 2>/dev/null || true)
    if [ -n "$pid" ]; then
        echo "  Stopping process on port $port (PID: $pid)"
        kill $pid 2>/dev/null || true
        sleep 1
    fi
done

# Also stop frontend
pid=$(lsof -t -i:8081 2>/dev/null || true)
if [ -n "$pid" ]; then
    echo "  Stopping frontend (PID: $pid)"
    kill $pid 2>/dev/null || true
    sleep 1
fi

echo ""
echo "======================================"
echo "📦 Installing dependencies..."
echo "======================================"

# Install service dependencies
for service in auth-service hangar-service map-service combat-service comm-service online-battle-service; do
    if [ -f "services/$service/package.json" ]; then
        echo "Installing $service dependencies..."
        npm install --prefix "services/$service" 2>/dev/null || true
    fi
done

# Install frontend dependencies
echo "Installing frontend dependencies..."
npm install --prefix frontend 2>/dev/null || true

echo ""
echo "======================================"
echo "🎯 Starting Services..."
echo "======================================"

# Function to start a service
start_service() {
    local name=$1
    local path=$2
    local port=$3
    
    echo "Starting $name on port $port..."
    cd "$SCRIPT_DIR/$path"
    NODE_ENV=production PORT=$port node src/index.js > /tmp/$name.log 2>&1 &
    echo $! > /tmp/$name.pid
    echo "  ✅ $name started (PID: $(cat /tmp/$name.pid))"
}

# Start all services
start_service "auth-service" "services/auth-service" 3001
sleep 2
start_service "hangar-service" "services/hangar-service" 3002
sleep 2
start_service "map-service" "services/map-service" 3003
sleep 2
start_service "combat-service" "services/combat-service" 3004
sleep 2
start_service "comm-service" "services/comm-service" 3005
sleep 2

if [ -f "services/online-battle-service/package.json" ]; then
    start_service "online-battle-service" "services/online-battle-service" 3006
    sleep 2
fi

echo ""
echo "======================================"
echo "🌐 Starting Frontend..."
echo "======================================"

cd "$SCRIPT_DIR/frontend"
NODE_ENV=production npm run preview > /tmp/frontend.log 2>&1 &
echo $! > /tmp/frontend.pid
echo "  ✅ Frontend started (PID: $(cat /tmp/frontend.pid))"

sleep 3

echo ""
echo "======================================"
echo "✅ ALL SERVICES STARTED!"
echo "======================================"
echo ""
echo "Service Status:"
echo "  Auth Service:           http://localhost:3001"
echo "  Hangar Service:         http://localhost:3002"
echo "  Map Service:            http://localhost:3003"
echo "  Combat Service:         http://localhost:3004"
echo "  Comm Service:           http://localhost:3005"
echo "  Online Battle Service:  http://localhost:3006"
echo "  Frontend:               http://localhost:8081"
echo ""
echo "PIDs saved to /tmp/*.pid"
echo "Logs at /tmp/*.log"
echo ""
echo "To stop services: $SCRIPT_DIR/stop-services.sh"
