# 机甲战棋游戏 - Frontend Dockerfile

FROM node:18-alpine

RUN apk add --no-cache curl

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

ENV NODE_ENV=production
ENV PORT=8081

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:8081/health || exit 1

CMD ["npm", "run", "preview"]
