#!/bin/bash
# ============================================================
# 机甲战棋阵 - 统一服务管理脚本
# 使用方法: ./manage-services.sh [start|stop|restart|status]
# ============================================================

set -e

BASE_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="/tmp/mecha-services"
PID_DIR="/tmp/mecha-services-pids"

# 创建目录
mkdir -p "$LOG_DIR"
mkdir -p "$PID_DIR"

# 统一配置
JWT_SECRET="mecha-battle-auth-secret-key"
NODE_ENV="development"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[$(date '+%H:%M:%S')]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[$(date '+%H:%M:%S')]${NC} ⚠️  $1"
}

error() {
    echo -e "${RED}[$(date '+%H:%M:%S')]${NC} ❌ $1"
}

# 检查端口是否被占用
check_port() {
    local port=$1
    if lsof -i :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# 杀掉占用端口的进程
kill_port() {
    local port=$1
    local pid=$(lsof -ti :$port 2>/dev/null)
    if [ -n "$pid" ]; then
        log "杀掉端口 $port 上的进程 (PID: $pid)"
        kill $pid 2>/dev/null || true
        sleep 1
    fi
}

# 启动单个服务
start_service() {
    local name=$1
    local port=$2

    if check_port $port; then
        warn "$name (端口 $port) 已在运行，跳过"
        return 0
    fi

    local service_dir="$BASE_DIR/$name"
    if [ ! -d "$service_dir" ]; then
        error "服务目录不存在: $service_dir"
        return 1
    fi

    cd "$service_dir"

    PORT=$port \
    JWT_SECRET="$JWT_SECRET" \
    NODE_ENV="$NODE_ENV" \
    nohup node src/index.js > "$LOG_DIR/$name.log" 2>&1 &

    local pid=$!
    echo $pid > "$PID_DIR/$name.pid"

    sleep 2

    if check_port $port; then
        log "✅ $name 启动成功 (PID: $pid, 端口: $port)"
    else
        error "❌ $name 启动失败"
        return 1
    fi
}

# 停止单个服务
stop_service() {
    local name=$1
    local port=$2

    local pid_file="$PID_DIR/$name.pid"
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if ps -p $pid > /dev/null 2>&1; then
            log "停止 $name (PID: $pid)"
            kill $pid 2>/dev/null || true
        fi
        rm -f "$pid_file"
    fi

    kill_port $port
}

# 服务列表
SERVICES="auth-service:3001 hangar-service:3002 map-service:3003 combat-service:3004 comm-service:3005"

# 启动所有服务
start_all() {
    log "🚀 启动所有服务..."
    echo ""

    for entry in $SERVICES; do
        name="${entry%%:*}"
        port="${entry##*:}"
        start_service "$name" "$port"
    done

    echo ""
    show_status
}

# 停止所有服务
stop_all() {
    log "🛑 停止所有服务..."
    echo ""

    for entry in $SERVICES; do
        name="${entry%%:*}"
        port="${entry##*:}"
        stop_service "$name" "$port"
    done

    log "所有服务已停止"
}

# 重启所有服务
restart_all() {
    stop_all
    sleep 2
    start_all
}

# 显示状态
show_status() {
    echo "┌─────────────────┬───────┬────────────┐"
    printf "│ %-15s │ %-5s │ %-10s │\n" "服务" "端口" "状态"
    echo "├─────────────────┼───────┼────────────┤"

    all_ok=true
    for entry in $SERVICES; do
        name="${entry%%:*}"
        port="${entry##*:}"

        if check_port $port; then
            printf "│ %-15s │ %-5s │ ✅ 运行中  │\n" "$name" "$port"
        else
            printf "│ %-15s │ %-5s │ ❌ 停止    │\n" "$name" "$port"
            all_ok=false
        fi
    done

    echo "└─────────────────┴───────┴────────────┘"
    echo ""

    if $all_ok; then
        log "所有服务运行正常！"
    else
        warn "部分服务未运行"
    fi
}

# 清理僵尸进程
cleanup() {
    log "🧹 清理僵尸进程..."

    pkill -f "node --watch" 2>/dev/null || true
    pkill -f nodemon 2>/dev/null || true

    log "清理完成"
}

# 主入口
case "${1:-status}" in
    start)
        start_all
        ;;
    stop)
        stop_all
        ;;
    restart)
        restart_all
        ;;
    status)
        show_status
        ;;
    cleanup)
        cleanup
        ;;
    *)
        echo "使用方法: $0 [start|stop|restart|status|cleanup]"
        echo ""
        echo "  start   - 启动所有服务"
        echo "  stop    - 停止所有服务"
        echo "  restart - 重启所有服务"
        echo "  status  - 查看服务状态"
        echo "  cleanup - 清理僵尸进程"
        exit 1
        ;;
esac
