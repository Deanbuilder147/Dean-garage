# 机甲战棋游戏 - Service Dockerfile

FROM node:18-alpine

# Install minimal build dependencies (faster than Debian)
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
    && apk add --no-cache curl

WORKDIR /app

COPY package*.json ./

# Install dependencies (will compile bcrypt)
RUN npm ci --only=production

# Remove build dependencies after install (saves space)
RUN apk del .build-deps

COPY . .

RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:${PORT}/health || exit 1

CMD ["node", "src/index.js"]
