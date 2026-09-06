# Phase 29-A：全栈核心路径与网络拦截管线深度审计报告

> **审计时间**: 2026-06-22 20:17 CST  
> **审计类型**: 事前静态代码审计（零代码修改，纯侦查）  
> **审计范围**: 7 微服务 × 前端 × PostgreSQL × Nginx，6 维度穿透  
> **服务器**: 腾讯云轻量 (ap-shanghai, lhins-2fs1rzs8, 106.54.197.69:8081)

---

## 审计维度 1：网络代理骨格与 PVP 在线对战通道

### 1.1 Vite 代理死角清查

**文件**: `frontend/vite.config.js` (第 24-60 行)

**当前已配置代理**:
| 前缀 | 目标服务 | 端口 | 状态 |
|------|---------|------|:--:|
| `/api/auth` | auth-service | 3001 | ✅ |
| `/api/hangar` | hangar-service | 3002 | ✅ |
| `/api/map` | map-service | 3003 | ✅ |
| `/api/combat` | combat-service | 3004 | ✅ |
| `/api/campaign` | combat-service (共用) | 3004 | ✅ |
| `/api/comm` | comm-service | 3005 | ✅ |
| `/socket.io` | comm-service (WS) | 3005 | ✅ |

**🔴 严重缺失：online-battle-service (3006) 零代理配置**

以下 4 个路径前缀由 `mecha-online-battle` (3006) 提供，但 `vite.config.js` 中**完全不存在**任何代理条目：

| 缺失的路径前缀 | 已实现的后端端点 | 影响 |
|---------------|-----------------|------|
| `/api/matchmaking` | `POST /queue` (匹配队列) | 🔴 PVP 配对的唯一入口被切断 |
| `/api/rooms` | `GET /` (房间列表) / `POST /` (创建房间) / `PUT /:id/join` (加入) 等 | 🔴 在线房间管理完全不可达 |
| `/api/leaderboard` | `GET /global` (全球排行) / `GET /faction/:name` (阵营排行) | 🔴 排行榜数据无法获取 |
| `/api/battles` | `GET /history` (战斗历史) / `GET /:id/results` (战斗详报) | 🔴 对战历史与复盘不可用 |

**更底层的根因**：`vite.config.js` 第 6-12 行的 `SERVICE_HOSTS` 对象中，根本没有 `online` 键：
```javascript
const SERVICE_HOSTS = {
  auth: process.env.AUTH_SERVICE_HOST || 'localhost',
  hangar: process.env.HANGAR_SERVICE_HOST || 'localhost',
  map: process.env.MAP_SERVICE_HOST || 'localhost',
  combat: process.env.COMBAT_SERVICE_HOST || 'localhost',
  comm: process.env.COMM_SERVICE_HOST || 'localhost',
  // ❌ 缺 online: process.env.ONLINE_SERVICE_HOST || 'localhost',
};
```

### 1.2 前端客户端失联检查

**文件**: `frontend/src/api/client.js` (第 1-124 行)

**已存在的 API 封装对象**: `authAPI`, `hangarAPI`, `mapAPI`, `combatAPI`, `glossaryAPI`, `commAPI`

**🔴 零存在对象**: `onlineBattleAPI`

完全不存在任何对接 3006 端口 online-battle-service 的 API 封装。前端如果要调用匹配队列、房间管理、排行榜、战斗历史，将面临以下情形：
- 无统一的 `baseURL` 前缀配置
- 无 Token 自动注入
- 无 401 拦截器保护
- 只能退化到裸 `fetch()` / `axios`

**Phase 29 联机对接时需要创建的 `onlineBattleAPI` 骨架**:
```javascript
export const onlineBattleAPI = {
  // 匹配队列
  joinQueue: (data) => apiClient.post('/matchmaking/queue', data),
  leaveQueue: () => apiClient.delete('/matchmaking/queue'),
  getQueueStatus: () => apiClient.get('/matchmaking/queue'),

  // 房间
  getRooms: () => apiClient.get('/rooms'),
  createRoom: (data) => apiClient.post('/rooms', data),
  getRoom: (id) => apiClient.get(`/rooms/${id}`),
  joinRoom: (id, data) => apiClient.put(`/rooms/${id}/join`, data),
  leaveRoom: (id) => apiClient.delete(`/rooms/${id}/leave`),

  // 排行榜
  getGlobalLeaderboard: (params) => apiClient.get('/leaderboard/global', { params }),
  getFactionLeaderboard: (faction) => apiClient.get(`/leaderboard/faction/${faction}`),

  // 对战历史
  getBattleHistory: (params) => apiClient.get('/battles/history', { params }),
  getBattleResults: (id) => apiClient.get(`/battles/${id}/results`),
};
```

---

## 审计维度 2：数据通信管线归一化与 Token 自动拦截

### 2.1 裸写 fetch() 与 axios 违规点精确定位

#### 文件 1：`frontend/src/views/NewPreparationRoom.vue` — 1 处

**行 300-307**：`/api/combat/:id/pending-units` 部署池上传
```javascript
// L300: 裸 fetch，手动拼 Authorization
await fetch(`/api/combat/${battleId}/pending-units`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': token ? `Bearer ${token}` : ''
  },
  body: JSON.stringify({ units: selectedUnits })
})
```
| 维度 | 分析 |
|------|------|
| 绕过 apiClient | ✅ — `combatAPI` 中无 `pendingUnits` 方法 |
| Token 注入 | ⚠️ 手动从 localStorage 取，`token ? ... : ''` 可能发送空字符串 |
| 401 拦截 | ❌ 绕过拦截器，401 不会清除 Token / 跳转登录 |
| 错误处理 | ❌ 仅 `console.warn`，后续代码继续执行 |

#### 文件 2：`frontend/src/views/NewUnitEditorView.vue` — 5 处

| 行号 | 端点 | 说明 |
|------|------|------|
| **397** | `/api/hangar/units/upload-view` | 七视图上传（FormData, Phase 28 新增） |
| **527** | `/api/hangar/factions/upload` | 阵营 Logo 上传（FormData） |
| **582** | `/api/hangar/units/upload-image` | 棋子图片上传（FormData） |
| **594** | `/api/hangar/units/parse-excel` | Excel 解析预览（FormData） |
| **607** | `/api/hangar/units/create-from-json` | JSON 批量创建（JSON body） |

所有 5 处均：
- 手动从 `localStorage.getItem('token')` 取 Token
- 手动构造 `headers: { 'Authorization': \`Bearer ${token}\` }`
- 对 FormData 不使用 `Content-Type`（正确，浏览器自动设置 multipart boundary），但写法不统一
- 零 401 拦截保护

#### 文件 3：`frontend/src/views/NewBattlefieldView.vue` — 5 处

| 行号 | 端点 | 方法 | Authorization |
|------|------|------|:--:|
| **295** | `/api/combat/glossary-config` | GET | 🔴 **无** — 但后端 `battles.js:65` 有 `authenticate` 中间件 |
| **330** | `/api/combat/glossary-config` | GET | 🔴 **无** |
| **334** | `/api/combat/glossary-config` | POST | 🔴 **无** — 只有 `Content-Type` |
| **526** | `/api/map/list` | GET | 🔴 **无** |
| **543** | `/api/map/list?id=...` | GET | 🔴 **无** |

**🔴 严重发现**: `NewBattlefieldView.vue` 的 `/api/combat/glossary-config` GET/POST 调用**完全没有附带 Authorization header**。但后端 `battles.js:65` 中此路由使用了 `authenticate` 中间件：
```javascript
router.get('/glossary-config', authenticate, (req, res) => {
```
这意味着这些调用在生产环境中会直接返回 **401 Unauthorized**，导致地形定义加载失败，但错误被 `catch (e) { console.warn('加载地形定义失败, 使用默认值', e) }`（行 304）静默吃掉。

**说明**：此问题可能是因为生产环境 Nginx 层做了其他处理，但代码层面显然存在契约不一致。同时该文件**同时**从 `@/api/client` 导入了 `mapAPI` 和 `glossaryAPI`（后者内部已正确封装 `/combat/glossary-config`），说明是重构不彻底的遗留。

#### 文件 4：`frontend/src/views/TerminalView.vue` — 2 处

| 行号 | 端点 | 方式 |
|------|------|------|
| **343** | `POST /api/auth/login` | `import axios from 'axios'` → `axios.post(...)` |
| **364** | `POST /api/auth/register` | `import axios from 'axios'` → `axios.post(...)` |

- **行 101**: `import axios from 'axios';` — 完全绕过 `@/api/client`
- **行 102**: `import { useUserStore } from '../stores/user';` — 导入了 store 但未导入 API 层

**风险分析**: 
- 这两个接口本身不需要 Token（用户尚未登录），所以 `无 Authorization` 是可接受的
- 但绕过统一客户端导致：①超时配置不一致（可能默认无限制）；②无法享受统一的错误处理；③终端页与其他页面代码风格割裂

#### 文件 5：`frontend/src/views/NewBattleView.vue` — 1 处

**行 1300**: `/api/combat/:id/deploy-pool` GET
```javascript
const headers = token ? { 'Authorization': `Bearer ${token}` } : {}
const poolRes = await fetch(`/api/combat/${route.params.id}/deploy-pool`, { headers })
```
`combatAPI` 中有 `getDeployPool` 方法（行 104），但 `loadDeployPool` 函数仍使用裸 fetch。

### 2.2 拦截器熔断机制核验

**文件**: `frontend/src/api/client.js` (第 17-38 行)

✅ **Request 拦截器** (L17-26): 从 localStorage 读取 token → 拼接到 `Authorization: Bearer <token>` header。逻辑正确，没有多余的条件分支。

✅ **Response 拦截器** (L28-38): 正确拦截 401：
```javascript
if (error.response?.status === 401) {
  localStorage.removeItem('token');
  window.location.href = '/login';
}
```
| 检查项 | 状态 |
|--------|:--:|
| 401 状态码拦截 | ✅ 已实现 |
| Token 物理清除 (`localStorage.removeItem`) | ✅ 已实现 |
| 强制跳转登录 (`window.location.href`) | ✅ 已实现 |
| 403 (Forbidden) 处理 | ❌ 未处理 — 如果 Token 有效但权限不足，用户看不到任何反馈 |
| 500 (Server Error) 处理 | ❌ 未处理 — 静默 reject，依赖各调用方 try-catch |
| Network Error (无网络) | ❌ 未处理 — Axios 不会返回 response 对象 |
| 静默 catch 无处理 | ❌ 不存在 — `Promise.reject(error)` 正确向上冒泡 |

**结论**: 拦截器本身**实现正确且完整**。问题在于 5 个文件 14 处裸 HTTP 请求**完全绕过**了这套拦截机制，使得 401 自动清除 + 跳转登录的熔断保护对它们无效。

### 2.3 裸请求汇总

| 文件 | fetch() | axios() | 带 Token | 无 Token | 风险等级 |
|------|:--:|:--:|:--:|:--:|:--:|
| NewUnitEditorView.vue | 5 | 0 | 5 | 0 | 🟡 中 |
| NewBattlefieldView.vue | 5 | 0 | 0 | 5 | 🔴 高 |
| NewPreparationRoom.vue | 1 | 0 | 1 | 0 | 🟡 中 |
| NewBattleView.vue | 1 | 0 | 1 | 0 | 🟡 中 |
| TerminalView.vue | 0 | 2 | 0 | 2 | 🟢 低 |
| **合计** | **12** | **2** | **7** | **7** | — |

---

## 审计维度 3：前端页面三层弹性 DOM 骨架与局部滚动

### 3.1 全局宿主 App.vue 结构审计

**文件**: `frontend/src/App.vue` (第 1-54 行)

```html
<div id="app" class="h-screen w-screen overflow-hidden">
  <div class="app-container flex h-full w-full">
    <aside v-if="showSidebar" class="app-sidebar w-64 flex-shrink-0 h-full">
    <main class="main-content flex-1 h-full relative overflow-hidden">
      <router-view />
    </main>
```

| 检查项 | 状态 | 说明 |
|--------|:--:|------|
| 使用 `h-screen w-screen overflow-hidden` | ✅ | 全局视口锁定，防止 body 滚动条 |
| 使用 Flexbox (`flex h-full w-full`) | ✅ | 无 margin-left 等旧时代 hack |
| `<main>` 标签唯一 | ✅ | 全局唯一，子视图已全部归化为 `<div>` |
| `main-content` 使用 `flex-1 h-full relative overflow-hidden` | ✅ | 弹性抢占剩余空间，overflow-hidden 防止子元素溢出 |
| Sidebar 使用 `flex-shrink-0` | ✅ | sidebar 不会被子内容挤压 |
| 无绝对定位或硬编码尺寸 | ✅ | 全量 Tailwind CSS 弹性流 |

**结论**: App.vue DOM 骨架 **完全符合 Phase 25 大一统法案规范**，零排异。

### 3.2 高密度页面局部滚动清查

#### GlossaryView.vue（词条库）

**文件**: `frontend/src/views/GlossaryView.vue` (第 2 行)
```html
<div class="page-container w-full h-full flex flex-col">
```

| 检查项 | 状态 | 说明 |
|--------|:--:|------|
| 根节点 Tailwind | ✅ | `w-full h-full flex flex-col` |
| `overflow-y-auto` | ⚠️ **缺失** | 当前无 `overflow-y-auto` 或 `min-h-0` |
| `height: 100vh` 抢夺全屏 | ✅ 未发现 | 无此类硬编码 |

**排异分析**: 缺少 `overflow-y-auto` 意味着如果词条列表超过视口高度，内容将被裁剪而非出现滚动条。由于 `<main>` 已设置 `overflow-hidden`，溢出部分会直接被切除。

**修复建议**:
```html
<div class="page-container w-full h-full flex flex-col min-h-0">
  <header class="page-header shrink-0">...</header>
  <div class="action-bar shrink-0">...</div>
  <div class="flex-1 min-h-0 overflow-y-auto">
    <!-- 词条列表内容 -->
  </div>
</div>
```

#### NewPreparationRoom.vue（整备室）

**文件**: `frontend/src/views/NewPreparationRoom.vue` (第 3 行)
```html
<div class="page-container w-full h-full flex flex-col overflow-y-auto">
```

| 检查项 | 状态 | 说明 |
|--------|:--:|------|
| Tailwind | ✅ | `w-full h-full flex flex-col overflow-y-auto` |
| Scoped CSS 冲突 | ⚠️ | `.page-container { display: flex; flex-direction: column; ... }` 冗余重复 |
| `height: 100vh` | ✅ 未发现 | Phase 26 已修复 |
| `overflow: hidden` | ✅ 未发现 | Phase 26 已修复 |

**排异分析**: Scoped CSS 第 329 行重新定义了 `.page-container` 的 `display: flex; flex-direction: column;`，与 Tailwind class 功能重复。虽然不造成功能问题，但增加了维护复杂度。`overflow-y-auto` 仅在 Tailwind 中定义，Scoped CSS 未重复。

#### NewUnitEditorView.vue（单位编辑器）

**文件**: `frontend/src/views/NewUnitEditorView.vue` (第 3 行)
```html
<div class="page-container w-full h-full flex flex-col overflow-y-auto">
```

| 检查项 | 状态 | 说明 |
|--------|:--:|------|
| Tailwind | ✅ | `w-full h-full flex flex-col overflow-y-auto` |
| 滚动容器 | ✅ | `overflow-y-auto` 正确配置 |
| `height: 100vh` | ✅ 未发现 | |

**结论**: NewUnitEditorView.vue DOM 骨架符合规范。

### 3.3 战场主 Canvas 空间锁定

**文件**: `frontend/src/views/NewBattleView.vue` (第 43 行)
```html
<div class="game-canvas-sandbox flex-1 relative overflow-hidden">
  <HexGridCanvas ... class="absolute inset-0 w-full h-full" />
</div>
```

| 检查项 | 状态 | 说明 |
|--------|:--:|------|
| `game-canvas-sandbox` 包裹器 | ✅ | `flex-1 relative overflow-hidden` |
| 为 ResizeObserver 提供纯净锚点 | ✅ | 外层 `dm-main` 为 `flex-1 flex flex-col h-full overflow-hidden` |
| HexGridCanvas 定位 | ✅ | `absolute inset-0 w-full h-full` |
| 无高度坍塌风险 | ✅ | `flex-1` 抢占 dm-main 剩余空间 |
| 外层 dm-battle-layout | ✅ | `flex flex-row w-full h-full absolute inset-0` |

**结论**: Canvas 沙盒空间锁定 **完全符合 Phase 25 DOM 大一统法案**。柔性容器链 `app → main-content → router-view → dm-battle-layout → dm-main → game-canvas-sandbox` 每一级都有正确的 `flex-1` / `overflow-hidden` 传递，无坍塌风险。

---

## 审计维度 4：尖顶六角格七视态（0-6）朝向算法与 UI 矩阵防撞

### 4.1 运行时状态机 Schema 核验

#### 后端部署初始化

**文件**: `services/combat-service/src/routes/battles.js`

| 位置 | 代码 | 说明 |
|------|------|------|
| L122 | `direction: unit_data.direction ?? 0` | deploy-unit 路由，优先使用前端传入值，回退 0 |
| L166 | `direction: 0` | 回退占位单位，硬编码 0 |

**文件**: `services/combat-service/src/state/battleState.js`

| 位置 | 代码 | 说明 |
|------|------|------|
| L185-188 | `if (unitData.direction === undefined) { unitData.direction = 0; }` | deployUnit 状态层二次保护 |

**结论**: ✅ 3 层防护保证了 `direction` 字段在部署时一定存在且不为 `undefined`。前端首次渲染不会因缺失字段而抛 `undefined` 死锁。

#### 批量部署路径

**文件**: `battles.js` L204-215 (`deploy-units` 批量部署) — **⚠️ 缺失 direction 初始化**

```javascript
combatUnit = {
  ...unit_data,
  id: unit_id,
  unit_id: unit_id,
  q, r,
  player_id: req.user?.id || 0,
  hp: unit_data.hp || unit_data.max_hp || 100,
  max_hp: unit_data.max_hp || unit_data.hp || 100,
  has_acted: false,
  has_moved: false,
  buffs: []
  // ❌ 缺 direction: unit_data.direction ?? 0
};
```

对比 `deploy-unit` (L112-124)，`deploy-units` 批量部署分支 **遗漏了** `direction` 字段的显式初始化。虽然 `unit_data` spread 可能包含 direction，但缺乏硬性兜底。

### 4.2 角度量化计算器防撞

#### 移动朝向推导

**文件**: `services/combat-service/src/state/battleState.js` (L245-253)

```javascript
if (fromQ !== targetQ || fromR !== targetR) {
  const dx = targetQ - fromQ;
  const dy = targetR - fromR;
  let angle = Math.atan2(dy, dx) * (180 / Math.PI);
  if (angle < 0) angle += 360;
  const sector = Math.floor(((angle + 30) % 360) / 60);
  unit.direction = sector + 1;  // 1-6
}
```

| 检查项 | 状态 | 说明 |
|--------|:--:|------|
| 使用 `Math.atan2(dy, dx)` | ✅ | 标准反正切，自动处理象限 |
| 归一化到 `[0, 360)` | ✅ | `if (angle < 0) angle += 360` |
| 60° 扇区划分 | ✅ | `(angle + 30) % 360 / 60` — 0° 落在扇区 0 |
| 映射到 1-6 | ✅ | `sector + 1` |
| 处理原地移动 | ✅ | `fromQ !== targetQ \|\| fromR !== targetR` 守卫 |
| 无死板 Delta 硬编码 | ✅ | 通用 `atan2`，适用于任意六角格间距 |

#### 攻击朝向推导

**文件**: `services/combat-service/src/routes/battles.js` (L343-351)

```javascript
if (attacker.q !== undefined && defender.q !== undefined) {
  const dx = defender.q - attacker.q;
  const dy = defender.r - attacker.r;
  let angle = Math.atan2(dy, dx) * (180 / Math.PI);
  if (angle < 0) angle += 360;
  const sector = Math.floor(((angle + 30) % 360) / 60);
  attacker.direction = sector + 1;
}
```

**结论**: ✅ 移动与攻击两端朝向计算使用**完全相同的 `atan2` 60° 扇区算法**，无重复实现分歧。唯一需要注意的是移动在 `battleState.js` 实现，攻击在 `battles.js` 实现，未来修改需要双端同步，建议抽取为 `resolveDirection(fromQ, fromR, toQ, toR)` 工具函数。

### 4.3 UI 文字层绝对正立审计

**文件**: `frontend/src/views/NewBattleView.vue` (L1730-1836)

渲染顺序：
```
1. ctx.save() ← 外层的 ISO CTM
2.   (绘制精灵图)
3.   ctx.save() ← 阵营 Logo 旋转 scope
4.     ctx.rotate(rotAngle)
5.     (绘制阵营 Logo + 首字母)
6.   ctx.restore() ← L1765: 恢复旋转，"后续 HP/选中环绝对正立"
7.   (绘制选中环) ← L1806-1815
8.   (绘制隐蔽指示器)
9.   (绘制 HP 血条) ← L1825-1833
10. ctx.restore() ← L1836: 恢复外层 ISO CTM
```

| 检查项 | 状态 | 说明 |
|--------|:--:|------|
| Logo 底座旋转 scope 隔离 | ✅ | L1750 `ctx.save()` → L1751 `ctx.rotate(rotAngle)` → L1765 `ctx.restore()` |
| HP 血条在 restore 后绘制 | ✅ | L1825-1833 在 L1765 restore 之后，绝对正立 |
| EN 条单独绘制 | ✅ | 同上 |
| 选中环在 restore 后绘制 | ✅ | L1806-1815 在 L1765 restore 之后，不随底座旋转 |
| 隐蔽指示器在 restore 后 | ✅ | L1818-1823 |
| 代码注释明确意图 | ✅ | L1765: "← 恢复旋转，后续 HP/选中环绝对正立" |
| rotAngle 计算正确 | ✅ | L1740-1742: `(facingDir - 1) * 60 * Math.PI / 180` |

**结论**: ✅ UI 文字层与底座旋转已通过 `ctx.save()/ctx.restore()` 严格隔离。HP 条、选中环、隐蔽指示器均保持在旋转作用域外部，100% 绝对正立（0°）。

---

## 审计维度 5：持久层防污染与 Excel 导入安全隔离

### 5.1 Excel 解析 Key 映射安全隔离性

**数据库表结构审计** — `services/hangar-service/src/database/db.js` (L37-93)

`units` 表字段完整列表：

| 字段类别 | 字段 | 类型 | 说明 |
|----------|------|------|------|
| 主键 | `id` | INTEGER | 自增 ID |
| 归属 | `user_id` | INTEGER | 用户 ID |
| 标识 | `name`, `codename` | TEXT | 名称 / 代号 |
| 阵营 | `faction` | TEXT | 阵营标识字符串 |
| 主图 | `main_image_url` | TEXT | 图片 URL/路径 |
| 主属性 | `main_格斗`, `main_射击`, `main_结构`, `main_机动` | INTEGER | 四维属性 |
| 主技能 | `main_skills` | TEXT | JSON 字符串 `'[]'` |
| Royroy | `has_royroy`, `royroy_*` (8 列) | INTEGER + TEXT | 跟随单元 |
| 左/右/额外装备 | `left_*`, `right_*`, `extra_*` (各 6 列) | INTEGER + TEXT | 装备槽属性 + 技能 JSON |

| 检查项 | 状态 | 说明 |
|--------|:--:|------|
| 表中无 BLOB 字段 | ✅ | 所有字段均为 INTEGER / TEXT |
| 表中无嵌套多维数组字段 | ✅ | 技能存储为 TEXT (JSON 字符串) |
| 七视图资源存储方式 | ✅ | **不在数据库中**，通过文件系统 `${unitCode}_${direction}_idle.png` 映射 |
| 七视图不影响 Excel 导入 | ✅ | Excel 导入字段 (名称/代号/阵营/属性/技能) 与七视图字段完全正交 |
| Excel 导入 Schema 稳定 | ✅ | 即使后续追加"手动配置六视图"或"API 图生多视角"，只需在文件系统添加 PNG，无需 `ALTER TABLE` |

**结论**: ✅ 数据库 Schema 绝对安全。七视图资源的追加绑定纯凭 `unitCode` 做文件系统动态二级映射（`/uploads/sprites/{unitCode}_{0-6}_idle.png`），与 SQLite `units` 表零耦合。老资产 Excel 批量导入功能可 **100% 零修改通过**。

### 5.2 Excel 导入流程审计

**路由**: `services/hangar-service/src/routes/units.js`
- L294: `POST /import-excel` (旧版)
- L529: `POST /import-excel-new` (新版，配置化解析器)
- 两个端点均使用 `upload.single('file')` + `multer` 中间件
- 解析器 `ExcelParser` 按配置字段映射，不在数据库层新增字段

**结论**: ✅ Excel 导入管线稳定，不受 Phase 28-D 七视图引擎影响。

---

## 审计维度 6：冷资产清仓、冗余副本与 Docker 降维剪枝

### 6.1 物理残渣搜寻

| 序号 | 完整路径 | 大小 | 说明 |
|:--:|------|------|------|
| 1 | `frontend/src/views/GlossaryView.vue.bak-phase14` | 47.4 KB | Phase 14 词条库旧版备份 |
| 2 | `services/combat-service/src/services/combatCore/conditionEvaluator.cjs.bak-phase14` | 7.95 KB | Phase 14 条件评估器备份 |
| 3 | `services/combat-service/src/services/combatCore/skillExecutor.cjs.bak-phase14` | 36.44 KB | Phase 14 技能执行器备份 |

**注意**: 服务器端同步检查确认这些文件在 Git 仓库和 Docker 容器内均存在。`.bak-phase14` 文件不会被 Node.js 加载（非 `.cjs`/`.js`/`.vue`），但可能在 Docker 构建 `COPY . .` 时被打包进镜像，增加镜像体积。

### 6.2 冗余开销审计

#### loadViewConfig() 重复调用

**文件**: `frontend/src/views/NewBattleView.vue` (L2543-2545)

```javascript
loadGlossaryConfig().catch(() => {})
loadViewConfig().catch(() => {})  // ← 第一次调用
loadViewConfig().catch(() => {})  // ← 🔴 第二次重复调用
```

| 影响 | 说明 |
|------|------|
| 网络开销 | 每次 `refreshState()` 触发时额外发送 1 次 HTTP 请求 |
| API 压力 | 在高频刷新场景（每回合结束）下，浪费 50% 的 view 配置请求 |
| 功能影响 | 无（两次调用结果相同，后者覆盖前者） |
| 修复 | 删除第 2545 行 `loadViewConfig().catch(() => {})` |

#### api/upload.js 空文件

**文件**: `frontend/src/api/upload.js` — 7 字节，内容为 `omitted`

| 影响 | 说明 |
|------|------|
| 直接引用风险 | 如果有任何文件 `import ... from '@/api/upload'`，将抛出运行时错误 |
| 当前引用情况 | **零引用** — 无视图导入此文件 |
| 建议 | 删除此文件，或写入完整的上传 API 封装代码 |

#### Docker 镜像膨胀

| 指标 | 数值 |
|------|------|
| 总镜像数 | 101 个 |
| 活跃镜像 | 9 个 |
| 总占用 | 2.33 GB |
| 可回收 (dangling + unused) | 1.513 GB (64%) |
| Build Cache | 56.11 MB (291 条) |

**建议清理命令**:
```bash
docker image prune -a --force    # 清除所有未使用镜像 (~1.5GB)
docker builder prune --force     # 清除构建缓存 (~56MB)
```

---

## 综合审计评分卡

| 维度 | 得分 | 评级 | 关键风险 |
|------|:--:|:--:|------|
| 1. 网络代理骨格 | **20/100** | 🔴 高危 | PVP 联机 4 个路由前缀完全无代理，前端无 onlineBattleAPI |
| 2. 数据通信管线 | **65/100** | 🟡 中等 | 14 处裸请求绕过拦截器，NewBattlefieldView 5 处无 Token |
| 3. DOM 弹性骨架 | **90/100** | 🟢 良好 | GlossaryView 缺 min-h-0/overflow-y-auto，其余达标 |
| 4. 七视态朝向 | **92/100** | 🟢 良好 | deploy-units 批量分支缺 direction 兜底，其余无懈可击 |
| 5. 持久层防污染 | **100/100** | 🟢 完美 | 零 BLOB，零嵌套数组，七视图与数据库完全正交 |
| 6. 冷资产清仓 | **78/100** | 🟡 中等 | 3 个 bak 文件 + loadViewConfig 重复 + 1.5GB 可回收 |

### Phase 29 PVP 联机接入前必须完成的阻断项

| 优先级 | 项目 | 文件 | 操作 |
|:--:|------|------|------|
| **P0-1** | vite.config.js 添加 4 个 PVP 代理 | `frontend/vite.config.js` | 添加 `/api/matchmaking`, `/api/rooms`, `/api/leaderboard`, `/api/battles` → `http://online:3006` |
| **P0-2** | client.js 创建 onlineBattleAPI | `frontend/src/api/client.js` | 按本文第 1.2 节骨架添加完整 API 封装 |
| **P0-3** | docker-compose 添加环境变量 | `docker-compose.yml` | frontend 添加 `ONLINE_SERVICE_HOST: online-battle-service` |
| **P1-1** | NewBattlefieldView glossary 修复 | `NewBattlefieldView.vue` | 将 5 处裸 fetch 改为 `glossaryAPI.getConfig()` / `mapAPI.getMapList()` |
| **P1-2** | NewUnitEditorView 迁移到 apiClient | `NewUnitEditorView.vue` + `client.js` | 在 hangarAPI 中新增 `uploadView`, `uploadFaction`, `uploadImage`, `parseExcel`, `createFromJson` 方法 |
| **P1-3** | deploy-units 批量部署补 direction | `battles.js:204-215` | 添加 `direction: unit_data.direction ?? 0` |
| **P2-1** | 删除 loadViewConfig 重复行 | `NewBattleView.vue:L2545` | 删除第二次调用 |
| **P2-2** | GlossaryView 添加滚动支持 | `GlossaryView.vue:L2` | 添加 `min-h-0`，内容区 `overflow-y-auto` |
| **P3** | 清理冷资产 | 全项目 | 删除 3 个 .bak-phase14 文件 + `api/upload.js` + docker image prune |

---

*报告结束。所有文件路径、行号、代码片段均精确引用自 `/Users/dingxuyang/CodeBuddy/20260604120036/` 真机源码，未经任何代码修改。*
