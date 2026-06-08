#!/bin/bash

# Mecha-Battle Service Manager (Safe Version - Fixed)
# 安全版本 - 不会杀死 Hermes Agent

SERVICES=(
    "auth:3001"
    "hangar:3002"
    "map:3003"
    "combat:3004"
    "comm:3005"
    "online-battle:3006"
)

FRONTEND_PORT=8081

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check if PID belongs to Hermes Agent
is_hermes_agent() {
    local pid=$1
    local cmdline=$(cat /proc/$pid/cmdline 2>/dev/null | tr '\0' ' ')
    if [[ "$cmdline" == *"hermes"* ]] || [[ "$cmdline" == *"Web3Hermes"* ]] || [[ "$cmdline" == *"script.py"* ]]; then
        return 0
    else
        return 1
    fi
}

# Safely kill service by port
kill_by_port() {
    local port=$1
    local service_name=$2
    
    log_info "Checking port $port for $service_name..."
    
    local pids=$(lsof -ti:$port 2>/dev/null || true)
    
    if [ -z "$pids" ]; then
        log_warn "No process found on port $port"
        return 0
    fi
    
    for pid in $pids; do
        if is_hermes_agent $pid; then
            log_error "⚠️  PROTECTED: PID $pid is Hermes Agent - SKIPPING"
        else
            log_info "Killing PID $pid on port $port"
            kill -9 $pid 2>/dev/null || true
        fi
    done
    
    sleep 2
    return 0
}

# Start a service
start_service() {
    local name=$1
    local service_dir="/home/agentuser/Dean-garage/services/${name}-service"
    
    if [ ! -d "$service_dir" ]; then
        log_error "Service directory not found: $service_dir"
        return 1
    fi
    
    log_info "Starting $name service..."
    cd "$service_dir"
    node src/index.js > /tmp/${name}.log 2>&1 &
    local new_pid=$!
    sleep 3
    
    if ps -p $new_pid > /dev/null 2>&1; then
        log_info "✅ $name service started (PID: $new_pid)"
        return 0
    else
        log_error "❌ Failed to start $name service"
        return 1
    fi
}

# Show status
show_status() {
    echo "================================"
    echo "  Mecha-Battle Service Status"
    echo "================================"
    echo ""
    
    for entry in "${SERVICES[@]}"; do
        name=$(echo $entry | cut -d: -f1)
        port=$(echo $entry | cut -d: -f2)
        pid=$(lsof -ti:$port 2>/dev/null || true)
        
        if [ -n "$pid" ]; then
            echo -e "✅ $name (port $port): ${GREEN}RUNNING${NC} (PID: $pid)"
        else
            echo -e "❌ $name (port $port): ${RED}STOPPED${NC}"
        fi
    done
    
    local fe_pid=$(lsof -ti:$FRONTEND_PORT 2>/dev/null || true)
    if [ -n "$fe_pid" ]; then
        echo -e "✅ frontend (port $FRONTEND_PORT): ${GREEN}RUNNING${NC} (PID: $fe_pid)"
    else
        echo -e "❌ frontend (port $FRONTEND_PORT): ${RED}STOPPED${NC}"
    fi
    echo ""
}

# Stop a service
stop_service() {
    local name=$1
    local port=""
    
    for entry in "${SERVICES[@]}"; do
        s_name=$(echo $entry | cut -d: -f1)
        if [ "$s_name" == "$name" ]; then
            port=$(echo $entry | cut -d: -f2)
            break
        fi
    done
    
    if [ -z "$port" ]; then
        if [ "$name" == "frontend" ]; then
            port=$FRONTEND_PORT
        else
            log_error "Unknown service: $name"
            return 1
        fi
    fi
    
    kill_by_port $port $name
}

# Restart a service
restart_service() {
    local name=$1
    stop_service $name
    sleep 2
    if [ "$name" == "frontend" ]; then
        log_info "Starting frontend..."
        cd /home/agentuser/Dean-garage/frontend
        npm run dev > /tmp/frontend.log 2>&1 &
        sleep 5
        log_info "Frontend started"
    else
        start_service $name
    fi
}

# Restart all
restart_all() {
    log_info "=== Restarting ALL services safely ==="
    for entry in "${SERVICES[@]}"; do
        s_name=$(echo $entry | cut -d: -f1)
        stop_service $s_name
        sleep 2
        start_service $s_name
    done
    log_info "=== All services restarted ==="
}

# Main
case "${1:-status}" in
    status) show_status ;;
    stop) stop_service "$2" ;;
    start) start_service "$2" ;;
    restart) restart_service "$2" ;;
    restart-all) restart_all ;;
    *)
        echo "Usage: $0 {status|stop|start|restart|restart-all} [service-name]"
        echo "Services: auth, hangar, map, combat, comm, online-battle, frontend"
        ;;
esac
