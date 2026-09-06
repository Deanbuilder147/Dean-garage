# 机甲战棋游戏 - Map Service Dockerfile

FROM node:18-alpine

RUN apk add --no-cache curl

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=3003

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:${PORT:-3003}/health || exit 1

CMD ["node", "src/index.js"]
