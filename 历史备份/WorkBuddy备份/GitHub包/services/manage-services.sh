#!/bin/bash

# ============================================
# 机甲战棋 - 服务管理脚本
# ============================================

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 项目根目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# 服务配置
SERVICES=(
  "auth-service:3001"
  "hangar-service:3002"
  "map-service:3003"
  "combat-service:3004"
  "comm-service:3005"
)

FRONTEND_PORT=8081

# 日志目录
LOG_DIR="$PROJECT_ROOT/logs"
mkdir -p "$LOG_DIR"

# ============================================
# 函数定义
# ============================================

log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
  echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

check_node() {
  if ! command -v node &> /dev/null; then
    log_error "Node.js 未安装，请先安装 Node.js 18+"
    exit 1
  fi
  log_info "Node.js 版本: $(node --version)"
}

install_dependencies() {
  log_info "安装所有服务依赖..."
  
  for service_config in "${SERVICES[@]}"; do
    service_name="${service_config%%:*}"
    cd "$SCRIPT_DIR/$service_name"
    
    if [ -f "package.json" ]; then
      log_info "安装 $service_name 依赖..."
      npm install
    fi
  done
  
  # 安装前端依赖
  if [ -f "$PROJECT_ROOT/frontend/package.json" ]; then
    cd "$PROJECT_ROOT/frontend"
    log_info "安装 frontend 依赖..."
    npm install
  fi
  
  log_success "所有依赖安装完成"
}

start_service() {
  local service_name=$1
  local service_path="$SCRIPT_DIR/$service_name"
  
  if [ -f "$service_path/package.json" ]; then
    cd "$service_path"
    
    # 检查是否已运行
    if pgrep -f "node.*$service_name" > /dev/null; then
      log_warning "$service_name 已在运行"
      return 0
    fi
    
    log_info "启动 $service_name..."
    nohup npm start > "$LOG_DIR/$service_name.log" 2>&1 &
    sleep 2
    
    if pgrep -f "node.*$service_name" > /dev/null; then
      log_success "$service_name 启动成功 (PID: $(pgrep -f "node.*$service_name"))"
    else
      log_error "$service_name 启动失败，查看日志: $LOG_DIR/$service_name.log"
    fi
  fi
}

start_frontend() {
  if [ -f "$PROJECT_ROOT/frontend/package.json" ]; then
    cd "$PROJECT_ROOT/frontend"
    
    if pgrep -f "vite" > /dev/null; then
      log_warning "Frontend 已在运行"
      return 0
    fi
    
    log_info "启动 Frontend..."
    nohup npm run dev > "$LOG_DIR/frontend.log" 2>&1 &
    sleep 3
    
    if pgrep -f "vite" > /dev/null; then
      log_success "Frontend 启动成功 (PID: $(pgrep -f "vite"))"
    else
      log_error "Frontend 启动失败，查看日志: $LOG_DIR/frontend.log"
    fi
  fi
}

stop_service() {
  local service_name=$1
  local pid=$(pgrep -f "node.*$service_name" 2>/dev/null || true)
  
  if [ -n "$pid" ]; then
    log_info "停止 $service_name (PID: $pid)..."
    pkill -f "node.*$service_name" 2>/dev/null || true
    sleep 1
    log_success "$service_name 已停止"
  else
    log_warning "$service_name 未运行"
  fi
}

stop_frontend() {
  local pid=$(pgrep -f "vite" 2>/dev/null || true)
  
  if [ -n "$pid" ]; then
    log_info "停止 Frontend (PID: $pid)..."
    pkill -f "vite" 2>/dev/null || true
    sleep 1
    log_success "Frontend 已停止"
  else
    log_warning "Frontend 未运行"
  fi
}

show_status() {
  echo ""
  echo "========================================"
  echo "         服务状态列表"
  echo "========================================"
  echo ""
  
  for service_config in "${SERVICES[@]}"; do
    service_name="${service_config%%:*}"
    service_port="${service_config##*:}"
    
    if pgrep -f "node.*$service_name" > /dev/null; then
      echo -e "${GREEN}●${NC} $service_name (端口 $service_port) - 运行中"
    else
      echo -e "${RED}○${NC} $service_name (端口 $service_port) - 已停止"
    fi
  done
  
  if pgrep -f "vite" > /dev/null; then
    echo -e "${GREEN}●${NC} Frontend (端口 $FRONTEND_PORT) - 运行中"
  else
    echo -e "${RED}○${NC} Frontend (端口 $FRONTEND_PORT) - 已停止"
  fi
  
  echo ""
}

cleanup_zombie() {
  log_info "清理僵尸进程..."
  
  for service_config in "${SERVICES[@]}"; do
    service_name="${service_config%%:*}"
    
    # 查找并清理
    local pids=$(pgrep -f "node.*$service_name" 2>/dev/null || true)
    for pid in $pids; do
      if ! kill -0 "$pid" 2>/dev/null; then
        log_warning "清理僵尸进程: $pid ($service_name)"
        pkill -9 -f "node.*$service_name" 2>/dev/null || true
      fi
    done
  done
  
  log_success "僵尸进程清理完成"
}

# ============================================
# 主程序
# ============================================

case "$1" in
  start)
    echo "🚀 启动所有服务..."
    check_node
    install_dependencies
    
    for service_config in "${SERVICES[@]}"; do
      service_name="${service_config%%:*}"
      start_service "$service_name"
    done
    
    start_frontend
    echo ""
    log_success "所有服务启动完成！"
    echo ""
    show_status
    ;;
    
  stop)
    echo "🛑 停止所有服务..."
    
    for service_config in "${SERVICES[@]}"; do
      service_name="${service_config%%:*}"
      stop_service "$service_name"
    done
    
    stop_frontend
    log_success "所有服务已停止"
    ;;
    
  restart)
    echo "🔄 重启所有服务..."
    $0 stop
    sleep 2
    $0 start
    ;;
    
  status)
    show_status
    ;;
    
  cleanup)
    cleanup_zombie
    ;;
    
  logs)
    if [ -n "$2" ]; then
      tail -f "$LOG_DIR/$2.log"
    else
      log_info "可用日志文件:"
      ls -la "$LOG_DIR"
    fi
    ;;
    
  install)
    check_node
    install_dependencies
    ;;
    
  *)
    echo ""
    echo "========================================"
    echo "     机甲战棋 - 服务管理脚本"
    echo "========================================"
    echo ""
    echo "用法: $0 <command>"
    echo ""
    echo "Commands:"
    echo "  start    - 启动所有服务"
    echo "  stop     - 停止所有服务"
    echo "  restart  - 重启所有服务"
    echo "  status   - 查看服务状态"
    echo "  cleanup  - 清理僵尸进程"
    echo "  logs     - 查看日志"
    echo "  install  - 安装依赖"
    echo ""
    echo "示例:"
    echo "  $0 start          # 启动所有服务"
    echo "  $0 stop           # 停止所有服务"
    echo "  $0 status         # 查看状态"
    echo "  $0 logs auth      # 查看 auth-service 日志"
    echo ""
    exit 1
    ;;
esac

exit 0
