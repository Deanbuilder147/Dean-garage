# 机甲战棋游戏 - 战斗服务Dockerfile

# 使用Node.js LTS作为基础镜像
FROM node:18-alpine

# 设置工作目录
WORKDIR /app

# 安装系统依赖
RUN apk add --no-cache python3 make g++

# 复制package.json和package-lock.json
COPY package*.json ./

# 安装依赖
RUN npm ci --only=production

# 复制源代码
COPY . .

# 创建数据目录
RUN mkdir -p /app/data

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=3004

# 暴露端口
EXPOSE 3004

# 启动命令
CMD ["node", "src/index.js"]