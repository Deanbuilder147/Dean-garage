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
    // FormData 请求：删除实例默认的 application/json，让浏览器自动补带 boundary 的 multipart/form-data
    // 手动写 'multipart/form-data'（无 boundary）或保留 json 都会让 multer 收不到文件
    if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Phase 29-I: 鹦鹉螺号置换 — 游客/观战白名单，绝杀登录死锁
// Phase 29-P1: 追加试玩战役 / 房间浏览白名单
// 公开路径：无需 Token 的游客层、观战流、鉴权入口
const PUBLIC_PATH_PREFIXES = [
  '/auth/login',
  '/auth/register',
  '/auth/health',
  '/comm/health',
  '/combat-glossary/config',
  '/map/list',
  '/comm/watch-feed',
  '/comm/watch-buffer-status',
  '/campaign/trial',       // P1: 试玩战役（游客免登录）
  '/rooms',                // P1: 房间列表（游客观战入口）
  '/leaderboard',          // P1: 天梯排行榜（公开）
];

// 响应拦截器：429 退避重试 + 白名单柔性放行，严禁无差别踢回登录
const RATE_LIMIT_MAX_RETRY = 2;

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    // 429 限流：指数退避自动重试，缓解偶发触顶
    const cfg = error.config;
    if (error.response?.status === 429 && cfg) {
      cfg.__retryCount = cfg.__retryCount || 0;
      if (cfg.__retryCount < RATE_LIMIT_MAX_RETRY) {
        cfg.__retryCount += 1;
        // 优先遵循后端 Retry-After（秒），否则指数退避 1s / 2s
        const retryAfter = parseInt(error.response.headers?.['retry-after'] || '0', 10);
        const delay = retryAfter > 0
          ? retryAfter * 1000
          : Math.pow(2, cfg.__retryCount - 1) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
        return apiClient(cfg);
      }
      // 重试耗尽：附加友好提示，供调用方展示
      error.friendlyMessage = '请求过于频繁，服务器繁忙，请稍候片刻再试';
    }

    if (error.response?.status === 401) {
      const url = error.config?.url || '';
      const isPublic = PUBLIC_PATH_PREFIXES.some(p => url.startsWith(p));
      const hadToken = !!localStorage.getItem('token');

      // 仅当曾经持有 Token（Token 真过期）且非公开路径时才清除并跳转
      if (hadToken && !isPublic) {
        localStorage.removeItem('token');
        window.location.href = '/login';
      }
      // 游客/观战流/公开路径：柔性拒绝，不踢回登录页
    }
    return Promise.reject(error);
  }
);

// 各服务 API 导出
export const authAPI = {
  login: (data) => apiClient.post('/auth/login', data),
  register: (data) => apiClient.post('/auth/register', data),
  getProfile: () => apiClient.get('/auth/profile'),
  updateProfile: (data) => apiClient.put('/auth/profile', data),
  changePassword: (data) => apiClient.post('/auth/change-password', data)
};

export const hangarAPI = {
  // Phase 29-Debug: 路径大归一 — 全部收归 3006 网关 /api/units 前缀
  getUnits: () => apiClient.get('/units'),
  getUnit: (id) => apiClient.get(`/units/${id}`),
  createUnit: (data) => apiClient.post('/units', data),
  updateUnit: (id, data) => apiClient.put(`/units/${id}`, data),
  deleteUnit: (id) => apiClient.delete(`/units/${id}`),
  // Phase 28: 阵营管理 → Phase 29-Debug: 路径纠偏 /units/factions
  getFactions: () => apiClient.get('/units/factions'),
  createFaction: (data) => apiClient.post('/units/factions', data),
  // Phase 29: 编辑器上传/解析归一化（FormData / JSON 均走拦截器管线）
  // Phase 30-Fix: FormData 请求必须覆盖全局 application/json 头，否则 multer 收不到文件
  // 注：FormData 请求不要手动设 Content-Type，否则缺少 boundary 导致 multer 收不到文件
  uploadUnitView: (data) => apiClient.post('/units/upload-view', data),
  uploadFactionLogo: (data) => apiClient.post('/units/factions/upload', data),
  parseExcel: (data) => apiClient.post('/units/parse-excel', data),
  createFromJson: (data) => apiClient.post('/units/create-from-json', data),
};

export const mapAPI = {
  getBattlefields: () => apiClient.get('/map/battlefields'),
  getBattlefield: (id) => apiClient.get(`/map/battlefields/${id}`),
  createBattlefield: (data) => apiClient.post('/map/battlefields', data),
  updateBattlefield: (id, data) => apiClient.put(`/map/battlefields/${id}`, data),
  deleteBattlefield: (id) => apiClient.delete(`/map/battlefields/${id}`),
  // Phase 13: 地图文件列表
  getMapList: () => apiClient.get('/map/list'),
  getMapFile: (filename) => apiClient.get(`/map/list?file=${encodeURIComponent(filename)}`),
  getMapById: (id) => apiClient.get(`/map/list?id=${encodeURIComponent(id)}`),
};

export const combatAPI = {
  get: (path) => apiClient.get(`/combat/${path}`),
  getBattles: () => apiClient.get('/combat'),
  getBattle: (id) => apiClient.get(`/combat/${id}/state`),
  createBattle: (data) => apiClient.post('/combat', data),
  getBattleState: (id) => apiClient.get(`/combat/${id}/state`),
  deployUnit: (id, data) => apiClient.post(`/combat/${id}/deploy-unit`, data),
  endDeployment: (id) => apiClient.post(`/combat/${id}/end-deployment`),
  move: (id, data) => apiClient.post(`/combat/${id}/move`, data),
  attack: (id, data) => apiClient.post(`/combat/${id}/attack`, data),
  action: (id, data) => apiClient.post(`/combat/${id}/action`, data),
  endTurn: (id) => apiClient.post(`/combat/${id}/end-turn`),
  skill: (id, data) => apiClient.post(`/combat/${id}/skill`, data),

  // ===== 特殊触发词条交互路由（斩杀/决斗/抢夺/援助/空投/幸运/再动）=====
  // H1 决斗预检：发起攻击前由前端调用，返回 { canDuel, reason }
  duelCheck: (id, data) => apiClient.post(`/combat/${id}/duel-check`, data),
  // 决斗结算：双方掷 1d6 比大小，替代普通攻击
  resolveDuel: (id, data) => apiClient.post(`/combat/${id}/resolve-duel`, data),
  // 抢夺结算（两段式第 2 段）：接受则伤害减半 + 获得目标主手武器
  resolveSnatch: (id, data) => apiClient.post(`/combat/${id}/resolve-snatch`, data),
  // 援助结算：瞬移分担 / 反击 / 放弃（10s 超时权威由后端判定）
  resolveCover: (id, data) => apiClient.post(`/combat/${id}/resolve-cover`, data),

  // 阵营能力
  fogSystem: (id, data) => apiClient.post(`/combat/${id}/fog-system`, data),
  support: (id, data) => apiClient.post(`/combat/${id}/support`, data),
  conceal: (id, data) => apiClient.post(`/combat/${id}/conceal`, data),

  // 坐标跳转
  jumpTo: (id, data) => apiClient.post(`/combat/${id}/jump-to`, data),

  // 胜利条件
  setVictoryConditions: (id, data) => apiClient.post(`/combat/${id}/victory-conditions`, data),
  getVictoryConditions: (id) => apiClient.get(`/combat/${id}/victory-conditions`),

  // ACE 单位
  setAceUnit: (id, data) => apiClient.post(`/combat/${id}/ace-unit`, data),
  getAceUnit: (id) => apiClient.get(`/combat/${id}/ace-unit`),

  // 阵营冷却
  getFactionCooldowns: (id) => apiClient.get(`/combat/${id}/faction-cooldowns`),

  // 部署池
  getDeployPool: (id) => apiClient.get(`/combat/${id}/deploy-pool`),
  // Phase 29: 整备室部署池上传
  setPendingUnits: (battleId, data) => apiClient.post(`/combat/${battleId}/pending-units`, data),

  // Batch D-4.3: 反应奇袭 QTE 提交（锁定反应者做出 replace/counter/giveup）
  surpriseChoice: (id, data) => apiClient.post(`/combat/${id}/surprise-choice`, data),
};

// Phase 30-DiceUnify: 骰子工坊参数读写（路径 /api/combat/dice-config）
export const diceAPI = {
  getConfig: () => apiClient.get('/combat/dice-config'),
  saveConfig: (data) => apiClient.put('/combat/dice-config', data),
};

// 体型工坊参数读写（路径 /api/combat/size-config）：尺寸/受击系数/七视图盒子
export const sizeAPI = {
  getConfig: () => apiClient.get('/combat/size-config'),
  saveConfig: (data) => apiClient.put('/combat/size-config', data),
};

// Phase 29-Debug: 词条库解耦 — 独立 /combat-glossary 端点，脱离 battleId 沙盒
export const glossaryAPI = {
  getConfig: () => apiClient.get('/combat-glossary/config'),
  saveConfig: (data) => apiClient.post('/combat-glossary/config', data),
  // Excel 导入（两步法）：步骤一预览 / 步骤二落盘
  importExcel: (formData) =>
    apiClient.post('/combat-glossary/import-excel', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  importApply: (data) => apiClient.post('/combat-glossary/import-apply', data),
};

// 需求④ 地图素材上传（全局地形素材库）
export const terrainAPI = {
  uploadMaterial: (terrainId, file) => {
    const fd = new FormData()
    fd.append('file', file)
    return apiClient
      .post(`/terrain/upload?terrain=${encodeURIComponent(terrainId)}`, fd)
      .then((r) => r.data)
  },
};

// Phase AssetGen: AI 素材生成（玩家上传参考图 + prompt → Meowa → 落盘服务器）
export const assetAPI = {
  // 查询当前用户积分与定价
  getCredits: () => apiClient.get('/asset-gen/credits').then((r) => r.data),
  // 生成素材：type='unit'|'terrain'，payload 含 prompt/style/unitCode/terrainId/可选 reference 文件
  generate: (payload) => {
    const fd = new FormData()
    fd.append('type', payload.type)
    fd.append('prompt', payload.prompt)
    if (payload.style) fd.append('style', payload.style)
    if (payload.type === 'unit') {
      if (payload.unitCode) fd.append('unitCode', payload.unitCode)
      if (payload.unitId) fd.append('unitId', payload.unitId)
    } else if (payload.terrainId) {
      fd.append('terrainId', payload.terrainId)
    }
    if (payload.reference) fd.append('reference', payload.reference)
    // FormData 走拦截器自动去 Content-Type（保证 multer 收文件）
    return apiClient.post('/asset-gen/generate', fd).then((r) => r.data)
  },
};

// Phase 29-C: 联机对战 API 骨架 (→ mecha-online-battle:3006)
// Phase 29-I: 鹦鹉螺号置换 — 房间数据主权移交，SQLite 统一执政
export const onlineBattleAPI = {
  // 房间管线 (3006 SQLite 持久化，POST/PUT 与后端严格对齐)
  getRooms: () => apiClient.get('/rooms'),
  createRoom: (data) => apiClient.post('/rooms', data),
  getRoom: (id) => apiClient.get(`/rooms/${id}`),
  joinRoom: (id, data) => apiClient.post(`/rooms/${id}/join`, data),  // 29-I: POST 对齐 3006 端点
  getRoomByCode: (code) => apiClient.get(`/rooms/by-code/${code}`),
  leaveRoom: (id) => apiClient.post(`/rooms/${id}/leave`),
  setReady: (id, data) => apiClient.post(`/rooms/${id}/ready`, data),
  startBattle: (id) => apiClient.post(`/rooms/${id}/start`),
  lockRoster: (id, data) => apiClient.post(`/rooms/${id}/lock-roster`, data || {}),
  updateSettings: (id, data) => apiClient.put(`/rooms/${id}/settings`, data),
  setPlayerFaction: (roomId, userId, data) => apiClient.put(`/rooms/${roomId}/players/${userId}`, data),
  setPlayerUnits: (roomId, userId, unitIds) => apiClient.put(`/rooms/${roomId}/players/${userId}/units`, { unitIds }),
  deleteRoom: (id) => apiClient.delete(`/rooms/${id}`),
};

// 后台管理 API（仅 dominator 可调用）
// ① 等级-功能权限矩阵；② 搜索账号并修改账号权限
export const adminAPI = {
  // 功能目录 + 受管等级
  getFeatures: () => apiClient.get('/admin/features').then((r) => r.data),
  // 当前权限矩阵
  getPermissions: () => apiClient.get('/admin/permissions').then((r) => r.data),
  // 更新某等级的功能权限
  updatePermissions: (role, features) =>
    apiClient.put('/admin/permissions', { role, features }).then((r) => r.data),
  // 搜索账号（用户名 / 邮箱）
  searchUsers: (q) => apiClient.get('/admin/search-users', { params: { q } }).then((r) => r.data),
  // 修改账号权限（role / permission / credits）
  updateUser: (userId, payload) =>
    apiClient.put(`/admin/users/${userId}`, payload).then((r) => r.data),
};

export default apiClient;
