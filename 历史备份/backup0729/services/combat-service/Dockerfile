FROM node:18-alpine

WORKDIR /app

# 复制依赖文件
COPY package*.json ./

# 安装依赖
RUN npm ci --only=production

# 复制源代码和 dicescript
COPY src/ ./src/
COPY vendor/ ./vendor/

# 暴露端口
EXPOSE ${PORT:-3004}

# 健康检查（动态端口）
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget -qO- http://localhost:${PORT:-3004}/health || exit 1

# 启动服务
CMD ["node", "src/index.js"]
