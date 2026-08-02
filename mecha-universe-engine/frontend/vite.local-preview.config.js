import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

// 本地预览专用配置（临时）：
// 部署后的真实架构是「单统一网关」(3006) 提供全部 /api 路由，
// 而仓库默认的 vite.config.js 把 /api/* 拆到 3001~3004 微服务端口（线上已不存在）。
// 此配置将所有 /api 与 /socket.io 统一代理到远程网关 3006，便于本地直接预览线上战局。
// 预览结束后可删除本文件，不影响正常部署（部署用的是仓库默认 vite.config.js 仅作 COPY 参考，实际构建在服务器跑）。
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') }
  },
  server: {
    host: '0.0.0.0',
    port: 8081,
    proxy: {
      '/api': { target: 'http://106.54.197.69:3006', changeOrigin: true },
      '/socket.io': { target: 'http://106.54.197.69:3006', ws: true, changeOrigin: true }
    }
  }
})
