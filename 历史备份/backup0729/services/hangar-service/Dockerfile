# 机甲战棋游戏 - Hangar Service Dockerfile

FROM node:18-alpine

RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.ustc.edu.cn/g' /etc/apk/repositories && \
    apk add --no-cache curl

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

RUN mkdir -p /app/data /app/uploads

ENV NODE_ENV=production
ENV PORT=3002

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:${PORT:-3002}/api/health || exit 1

CMD ["node", "src/index.js"]
