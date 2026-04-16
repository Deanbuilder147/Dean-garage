#!/bin/bash

#!/bin/bash

# 机甲战棋游戏 - 战斗服务启动脚本
# 端口: 3004 (HTTP API), WebSocket通过HTTP服务器共用

echo "🚀 启动机甲战棋游戏战斗服务..."
echo "📡 端口配置:"
echo "   - HTTP API: 3004"
echo "   - WebSocket: 3004 (共用)"
echo ""

# 检查Node.js版本
NODE_VERSION=$(node -v)
echo "🔧 Node.js 版本: $NODE_VERSION"

# 检查依赖
echo "📦 检查依赖..."
if [ ! -d "node_modules" ]; then
    echo "📥 安装依赖..."
    npm install
fi

# 设置环境变量
export NODE_ENV=development
export PORT=3004
export JWT_SECRET=mecha-battle-auth-secret-key
export DB_PATH=./data/combat.db

# 创建数据目录
mkdir -p ./data

echo ""
echo "🔧 环境配置:"
echo "   - NODE_ENV: $NODE_ENV"
echo "   - PORT: $PORT"
echo "   - DB_PATH: $DB_PATH"
echo ""

# 启动服务
echo "🚀 启动战斗服务..."
echo "📊 健康检查: http://localhost:3004/health"
echo "📡 API端点: http://localhost:3004/api/combat"
echo "🔄 WebSocket: ws://localhost:3004"
echo ""
echo "按 Ctrl+C 停止服务"
echo "------------------------------------------------"

npm start