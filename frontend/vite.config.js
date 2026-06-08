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
};

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
      // Auth 服务
      '/api/auth': {
        target: `http://${SERVICE_HOSTS.auth}:3001`,
        changeOrigin: true
      },
      // Hangar 服务 (单位/棋子管理)
      '/api/hangar': {
        target: `http://${SERVICE_HOSTS.hangar}:3002`,
        changeOrigin: true
      },
      // Map 服务 (战场地图)
      '/api/map': {
        target: `http://${SERVICE_HOSTS.map}:3003`,
        changeOrigin: true
      },
      // Combat 服务 (战斗)
      '/api/combat': {
        target: `http://${SERVICE_HOSTS.combat}:3004`,
        changeOrigin: true
      },
      // Comm 服务 (通信/房间)
      '/api/comm': {
        target: `http://${SERVICE_HOSTS.comm}:3005`,
        changeOrigin: true
      },
      // Socket.io (Comm Service)
      '/socket.io': {
        target: `http://${SERVICE_HOSTS.comm}:3005`,
        ws: true
      }
    }
  },
  preview: {
    host: '0.0.0.0',
    port: 8081
  }
});
