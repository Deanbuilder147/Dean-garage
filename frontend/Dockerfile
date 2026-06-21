# 机甲战棋游戏 - Frontend Dockerfile (直接使用已构建的dist)
FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY dist /usr/share/nginx/html

EXPOSE 8081

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8081/ || exit 1
