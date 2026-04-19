import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'vue': 'vue/dist/vue.esm-bundler.js'
    }
  },
  server: {
    host: '0.0.0.0',
    port: 8081,
    proxy: {
      // Auth 服务
      '/api/auth': {
        target: 'http://localhost:3001',
        changeOrigin: true
      },
      // Hangar 服务 (单位/棋子管理)
      '/api/hangar': {
        target: 'http://localhost:3002',
        changeOrigin: true
      },
      // Map 服务 (战场地图)
      '/api/map': {
        target: 'http://localhost:3003',
        changeOrigin: true
      },
      // Combat 服务 (战斗)
      '/api/combat': {
        target: 'http://localhost:3004',
        changeOrigin: true
      },
      // Comm 服务 (通信/房间)
      '/api/comm': {
        target: 'http://localhost:3005',
        changeOrigin: true
      },
      // Socket.io (Comm Service)
      '/socket.io': {
        target: 'http://localhost:3005',
        ws: true
      }
    }
  }
});
