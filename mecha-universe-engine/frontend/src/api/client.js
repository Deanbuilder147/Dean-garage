/**
 * Phase 29-X — 大一统 API 客户端
 *
 * 单网关多路复用：所有请求统一发往 3006 大一统网关。
 * 白名单柔性放行：游客/观战流 401 不踢回登录页。
 */

import axios from 'axios'

const apiClient = axios.create({
  baseURL: '/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
})

// ============================================
// 请求拦截器：自动附加 Bearer Token
// ============================================
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// ============================================
// 响应拦截器：白名单柔性放行
// ============================================
const PUBLIC_PATHS = [
  '/auth/login',
  '/auth/register',
  '/auth/health',
  '/comm/watch-feed',
  '/comm/watch-buffer-status',
  '/comm/health',
]

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const url = error.config?.url || ''
      const isPublic = PUBLIC_PATHS.some(p => url.startsWith(p))
      const hadToken = !!localStorage.getItem('token')

      // 仅当曾经持有 Token（Token 真过期）且非公开路径时才清除并跳转
      if (hadToken && !isPublic) {
        localStorage.removeItem('token')
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

// ============================================
// 认证 API → 3006 /api/auth/*
// ============================================
export const authAPI = {
  login: (data) => apiClient.post('/auth/login', data),
  register: (data) => apiClient.post('/auth/register', data),
  me: () => apiClient.get('/auth/me'),
  health: () => apiClient.get('/auth/health'),
}

// ============================================
// 房间 API → 3006 /api/rooms/* (SQLite 执政)
// ============================================
export const roomAPI = {
  getRooms: () => apiClient.get('/rooms'),
  createRoom: (data) => apiClient.post('/rooms', data),
  getRoom: (id) => apiClient.get(`/rooms/${id}`),
  joinRoom: (id, data) => apiClient.post(`/rooms/${id}/join`, data),
  leaveRoom: (id) => apiClient.post(`/rooms/${id}/leave`),
  setReady: (id, data) => apiClient.post(`/rooms/${id}/ready`, data),
  startBattle: (id) => apiClient.post(`/rooms/${id}/start`),
  updateSettings: (id, data) => apiClient.put(`/rooms/${id}/settings`, data),
  deleteRoom: (id) => apiClient.delete(`/rooms/${id}`),
  getChat: (id, params) => apiClient.get(`/rooms/${id}/chat`, { params }),
  sendChat: (id, data) => apiClient.post(`/rooms/${id}/chat`, data),
}

// ============================================
// 观战 API → 3005 /api/comm/watch-*
// ============================================
export const watchAPI = {
  feedBattleStream: (data) => apiClient.post('/comm/watch-feed', data),
  getBufferStatus: () => apiClient.get('/comm/watch-buffer-status'),
}

export default apiClient
