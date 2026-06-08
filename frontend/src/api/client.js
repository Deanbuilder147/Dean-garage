/**
 * 统一 API 客户端配置
 * 各微服务通过 Vite proxy 转发
 */
import axios from 'axios';

// 创建 axios 实例
const apiClient = axios.create({
  baseURL: '/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// 请求拦截器：添加 Token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// 响应拦截器：处理错误
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token 过期，清除并跳转登录
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// 各服务 API 导出
export const authAPI = {
  login: (data) => apiClient.post('/auth/login', data),
  register: (data) => apiClient.post('/auth/register', data),
  getProfile: () => apiClient.get('/auth/profile'),
  updateProfile: (data) => apiClient.put('/auth/profile', data)
};

export const hangarAPI = {
  getUnits: () => apiClient.get('/hangar/units'),
  getUnit: (id) => apiClient.get(`/hangar/units/${id}`),
  createUnit: (data) => apiClient.post('/hangar/units', data),
  updateUnit: (id, data) => apiClient.put(`/hangar/units/${id}`, data),
  deleteUnit: (id) => apiClient.delete(`/hangar/units/${id}`)
};

export const mapAPI = {
  getBattlefields: () => apiClient.get('/map/battlefields'),
  getBattlefield: (id) => apiClient.get(`/map/battlefields/${id}`),
  createBattlefield: (data) => apiClient.post('/map/battlefields', data),
  updateBattlefield: (id, data) => apiClient.put(`/map/battlefields/${id}`, data),
  deleteBattlefield: (id) => apiClient.delete(`/map/battlefields/${id}`)
};

export const combatAPI = {
  getBattles: () => apiClient.get('/combat'),
  getBattle: (id) => apiClient.get(`/combat/${id}`),
  createBattle: (data) => apiClient.post('/combat', data),
  joinBattle: (id, data) => apiClient.post(`/combat/${id}/join`, data),
  getBattleState: (id) => apiClient.get(`/combat/${id}/state`)
};

export const commAPI = {
  getRooms: () => apiClient.get('/comm/rooms'),
  getRoom: (id) => apiClient.get(`/comm/rooms/${id}`),
  createRoom: (data) => apiClient.post('/comm/rooms', data),
  joinRoom: (id, data) => apiClient.post(`/comm/rooms/${id}/join`, data),
  leaveRoom: (id) => apiClient.post(`/comm/rooms/${id}/leave`),
  sendMessage: (id, data) => apiClient.post(`/comm/rooms/${id}/messages`, data)
};

export default apiClient;
