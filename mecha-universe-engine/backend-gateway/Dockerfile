# Phase 29-X — 大一统后端网关 Dockerfile (sql.js, 纯 JS, 快速构建)
# 策略：builder 仅负责 tsc 编译，运行阶段自己安装生产依赖
FROM node:20-alpine AS builder

WORKDIR /build

# 复制 monorepo 根配置
COPY package.json tsconfig.base.json ./

# 复制共享内核源码（编译时需要类型）
COPY shared-kernel/ ./shared-kernel/

# 复制后端网关源码
COPY backend-gateway/ ./backend-gateway/

# 安装 shared-kernel 依赖
WORKDIR /build/shared-kernel
RUN npm install --legacy-peer-deps --install-links=false

# 安装 backend-gateway 依赖并编译
WORKDIR /build/backend-gateway
RUN sed -i 's|"@mecha/shared-kernel": "\\*"|"@mecha/shared-kernel": "file:../shared-kernel"|' package.json && \
    npm install --legacy-peer-deps && \
    npx tsc

# ========================================
# 运行阶段：独立安装生产依赖，避免跨阶段 node_modules 复制
# ========================================
FROM node:20-alpine

# Phase 29-DataSecurity: libpq 支持 pg 连接 PostgreSQL
RUN apk add --no-cache dumb-init wget libpq

WORKDIR /app

# 复制 shared-kernel 源码 + 编译产物（供 file: 依赖解析 + 运行时 JS 加载）
COPY --from=builder /build/shared-kernel/package.json ./shared-kernel/
COPY --from=builder /build/shared-kernel/tsconfig.json ./shared-kernel/
COPY --from=builder /build/shared-kernel/src/ ./shared-kernel/src/
COPY --from=builder /build/shared-kernel/dist/ ./shared-kernel/dist/
# 打补丁：让 main/exports 指向编译后的 .js 文件（生产环境 Node 不识别 .ts）
RUN cd shared-kernel && \
    node -e "const p=require('./package.json');p.main='./dist/index.js';p.exports={'.':'./dist/index.js','./tokens':'./dist/tokens.js','./types':'./dist/types.js'};require('fs').writeFileSync('./package.json',JSON.stringify(p,null,2))"

# 复制 package.json 并安装生产依赖
# 策略：先用 sed 移除 @mecha/shared-kernel 依赖（避免 npm 查 registry），
# npm install 安装其余包，再手动创建符号链接
COPY --from=builder /build/backend-gateway/package.json ./
RUN cp package.json package.json.bak && \
    sed -i '/"@mecha\/shared-kernel"/d' package.json && \
    npm config set registry https://registry.npmmirror.com && \
    npm install --legacy-peer-deps --production && \
    mv package.json.bak package.json && \
    mkdir -p node_modules/@mecha && \
    ln -s ../../shared-kernel node_modules/@mecha/shared-kernel

# 复制编译产物
COPY --from=builder /build/backend-gateway/dist ./dist

RUN mkdir -p /data

ENV NODE_ENV=production
ENV PORT=3006
ENV DB_PATH=/data/mecha-universe.db

EXPOSE 3006

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
