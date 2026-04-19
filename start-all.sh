#!/bin/bash

# 机甲战棋项目 - 一键启动所有服务
# 使用: ./start-all.sh

PROJECT_DIR="/home/agentuser/Dean-garage"

echo "🎮 启动机甲战棋项目..."
echo "========================"

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 启动后端服务
cd "$PROJECT_DIR/services/auth-service"
echo -e "${YELLOW}启动 auth-service (端口 3001)...${NC}"
nohup npm run dev > /tmp/auth-service.log 2>&1 &
sleep 2

cd "$PROJECT_DIR/services/hangar-service"
echo -e "${YELLOW}启动 hangar-service (端口 3002)...${NC}"
nohup npm run dev > /tmp/hangar-service.log 2>&1 &
sleep 2

cd "$PROJECT_DIR/services/map-service"
echo -e "${YELLOW}启动 map-service (端口 3003)...${NC}"
nohup npm run dev > /tmp/map-service.log 2>&1 &
sleep 2

cd "$PROJECT_DIR/services/combat-service"
echo -e "${YELLOW}启动 combat-service (端口 3004)...${NC}"
nohup npm run dev > /tmp/combat-service.log 2>&1 &
sleep 2

cd "$PROJECT_DIR/services/comm-service"
echo -e "${YELLOW}启动 comm-service (端口 3005)...${NC}"
nohup npm run dev > /tmp/comm-service.log 2>&1 &
sleep 2

# 启动前端
cd "$PROJECT_DIR/frontend"
echo -e "${YELLOW}启动 frontend (端口 8081)...${NC}"
nohup npm run dev > /tmp/frontend.log 2>&1 &
sleep 3

echo ""
echo -e "${GREEN}✅ 所有服务已启动！${NC}"
echo "========================"
echo ""
echo "访问地址:"
echo "  🌐 前端页面：http://<your-server-IP>:8081"
echo ""
echo "后端服务:"
echo "  • auth-service:   http://localhost:3001/api/auth"
echo "  • hangar-service: http://localhost:3002/api/hangar"
echo "  • map-service:    http://localhost:3003/api/map"
echo "  • combat-service: http://localhost:3004/api/combat"
echo "  • comm-service:   http://localhost:3005/api/comm"
echo ""
echo "查看日志:"
echo "  tail -f /tmp/auth-service.log"
echo "  tail -f /tmp/hangar-service.log"
echo "  tail -f /tmp/map-service.log"
echo "  tail -f /tmp/combat-service.log"
echo "  tail -f /tmp/comm-service.log"
echo "  tail -f /tmp/frontend.log"
echo ""
echo "⚠️  提示：从外部访问请使用你的云服务器公网 IP 替换 localhost"
