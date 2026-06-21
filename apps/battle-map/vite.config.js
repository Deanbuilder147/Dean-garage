import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, '../shared-ui')
    }
  },
  server: {
    port: 5174,
    host: '0.0.0.0',
    proxy: {
      '/api/map': {
        target: 'http://localhost:3003',
        changeOrigin: true
      },
      '/api/combat': {
        target: 'http://localhost:3004',
        changeOrigin: true,
        ws: true
      },
      '/api/auth': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'static',
    rollupOptions: {
      output: {
        manualChunks: {
          'vue-vendor': ['vue', 'vue-router', 'pinia'],
          'pixi-vendor': ['pixi.js'],
          'http-client': ['axios']
        }
      }
    }
  }
})
