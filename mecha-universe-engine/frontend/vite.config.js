import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

// 服务地址配置：Docker 内使用服务名，本地开发使用 localhost
const SERVICE_HOSTS = {
  auth: process.env.AUTH_SERVICE_HOST || 'localhost',
  hangar: process.env.HANGAR_SERVICE_HOST || 'localhost',
  map: process.env.MAP_SERVICE_HOST || 'localhost',
  combat: process.env.COMBAT_SERVICE_HOST || 'localhost',
  comm: process.env.COMM_SERVICE_HOST || 'localhost',
  // 默认 localhost 以便本地 dev 直接连本机网关(3006)；线上前端走 nginx 反代，不依赖此项
  online: process.env.ONLINE_SERVICE_HOST || 'localhost',
};

// 本地 E2E 联调覆盖：设置 PROXY_TARGET（host:port，如 106.54.197.69:8081）后，
// 所有 /api 与 /socket.io 代理统一指向该目标（与线上 nginx 入口一致），
// 绕过逐服务端口分流，方便本地 dev server 直连远程后端做全链路验证。
const PROXY_TARGET = process.env.PROXY_TARGET
  ? `http://${process.env.PROXY_TARGET}`
  : null

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    }
  },
  server: {
    host: '0.0.0.0',
    port: 8081,
    proxy: {
      // 大一统后端网关 (3006)：认证/房间/单位/地图/战斗/词条 全部收归此处
      // ⚠️ 旧微服务端口 3001~3004 已随 Phase 29 大一统被废除，本地 dev 无 PROXY_TARGET 时统一指向 3006，
      //    否则 /api/auth 等会被代理到不存在的 3001 导致 CONNECTION_REFUSED（端口漂移根因）。
      '/api/auth': {
        target: PROXY_TARGET || `http://${SERVICE_HOSTS.auth}:3006`,
        changeOrigin: true
      },
      '/api/hangar': {
        target: PROXY_TARGET || `http://${SERVICE_HOSTS.hangar}:3006`,
        changeOrigin: true
      },
      '/api/map': {
        target: PROXY_TARGET || `http://${SERVICE_HOSTS.map}:3006`,
        changeOrigin: true
      },
      '/api/combat': {
        target: PROXY_TARGET || `http://${SERVICE_HOSTS.combat}:3006`,
        changeOrigin: true
      },
      '/api/campaign': {
        target: PROXY_TARGET || `http://${SERVICE_HOSTS.combat}:3006`,
        changeOrigin: true
      },
      // Comm 服务 (通信/房间实时) — 仍为 3005
      '/api/comm': {
        target: PROXY_TARGET || `http://${SERVICE_HOSTS.comm}:3005`,
        changeOrigin: true
      },
      // Socket.io (Comm Service)
      '/socket.io': {
        target: PROXY_TARGET || `http://${SERVICE_HOSTS.comm}:3005`,
        ws: true
      },
      // Phase 29-C: Online Battle Service (多人联机对战, Port 3006)
      '/api/matchmaking': { target: PROXY_TARGET || `http://${SERVICE_HOSTS.online}:3006`, changeOrigin: true },
      '/api/rooms': { target: PROXY_TARGET || `http://${SERVICE_HOSTS.online}:3006`, changeOrigin: true },
      '/api/leaderboard': { target: PROXY_TARGET || `http://${SERVICE_HOSTS.online}:3006`, changeOrigin: true },
      '/api/battles': { target: PROXY_TARGET || `http://${SERVICE_HOSTS.online}:3006`, changeOrigin: true },
      // Phase 29-HangarRestoration: 单位/棋子管理 (大一统网关, Port 3006)
      '/api/units': { target: PROXY_TARGET || `http://${SERVICE_HOSTS.online}:3006`, changeOrigin: true }
    }
  },
  preview: {
    host: '0.0.0.0',
    port: 8081
  }
});
