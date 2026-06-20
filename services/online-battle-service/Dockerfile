# 机甲战棋游戏 - Online Battle Service Dockerfile
FROM node:18-alpine
RUN sed -i 's|dl-cdn.alpinelinux.org|mirrors.ustc.edu.cn|g' /etc/apk/repositories
RUN apk add --no-cache curl python3 make g++
RUN npm config set registry https://registry.npmmirror.com
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
ENV NODE_ENV=production
ENV PORT=3006
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 CMD curl -f http://localhost:${PORT:-3006}/health || exit 1
CMD ["node", "src/index.js"]
