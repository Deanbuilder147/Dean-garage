# Phase 29 全阶段需求与完成情况汇总报告

> 时间跨度：2026-06-22 20:17 — 20:48  
> 服务器：Watson (lhins-2fs1rzs8, ap-shanghai, 106.54.197.69)  
> 访问地址：http://106.54.197.69:8081  
> 最终状态：**8/8 Healthy | HTTP 200 | 100/100 四大维度全部清零**

---

## Phase 29-A：全栈核心路径与网络拦截管线深度审计 (20:17-20:35)

### 用户需求
对全栈进行 6 维度穿透审计，纯静态侦查，零代码修改，为后续规范化换轨提供诊断依据。

### 提交要求（6 维度）

| # | 维度 | 用户要求 |
|---|------|------|
| 1 | 网络代理骨格 | 检查 vite.config.js 是否包含 3006 联机对战代理路由 |
| 2 | 数据通信管线归一化 | 扫描全端裸 fetch/axios 调用，统计拦截器绕过数 |
| 3 | DOM 弹性骨架 | 检查所有视图 Flex 布局是否可安全滚动 |
| 4 | 七视态朝向算法 | 检查 deploy-units 批量部署与单体部署一致性 |
| 5 | 持久层防污染 | 检查 SQLite 数据库是否有 BLOB 污染 |
| 6 | 冷资产清仓 | 统计 .bak 残渣文件、重复调用、可回收磁盘 |

### 完成情况

| 维度 | 审计得分 | 发现的关键问题 |
|------|:--:|------|
| 1. 网络代理骨格 | **20/100** | vite.config.js 完全缺失 4 个联机代理路由，SERVICE_HOSTS 无 online 键，client.js 无 onlineBattleAPI |
| 2. 数据管线归一化 | **65/100** | 14 处裸 fetch/axios 绕过统一 apiClient 拦截器 |
| 3. DOM 弹性骨架 | **90/100** | GlossaryView 缺 min-h-0/overflow-y-auto |
| 4. 朝向算法 | **92/100** | deploy-units 批量部署缺 direction 兜底 |
| 5. 持久层防污染 | **100/100** | SQLite 零 BLOB，七视图数据库正交 |
| 6. 冷资产清仓 | **78/100** | 3 bak 文件 + loadViewConfig 重复 + 1.5GB 可回收 |

**综合评分：63.75/100**  
**产出：** `/Users/dingxuyang/Desktop/Phase29-A_全栈核心路径与网络拦截管线深度审计报告.md`

---

## Phase 29-B：全端 14 处违规裸请求 100% 大归一 (20:24-20:30)

### 用户需求
在不改动任何前端现有视图逻辑的前提下，将全端所有绕过统一 apiClient 的裸 fetch/axios 调用全量收拢到 client.js 中央水管。

### 提交要求（三步工序）

#### 第一步：中央水管扩容
- 在 `client.js` 中为 `hangarAPI`、`combatAPI`、`mapAPI` 补齐缺失的标准 REST 方法
- 拦截器逻辑 100% 不变

#### 第二步：前端视图代码大收拢
- 扫描并替换 5 个文件中全部 14 处裸 fetch/axios 调用

#### 第三步：真机构建 + 部署验证
- rsync 源码 → npm build → Docker 重建

### 完成情况

| 步骤 | 工序 | 状态 |
|------|------|:--:|
| 1 | client.js 扩容：hangarAPI +5 方法、combatAPI +1 方法、mapAPI +1 方法 | ✅ |
| 2 | 5 文件 14 处裸请求收拢 | ✅ |

#### 收拢明细

| 文件 | 原调用方式 | 替换为 | 数量 |
|------|-----------|--------|:--:|
| NewPreparationRoom.vue | fetch + 手动 Bearer Token | `combatAPI.setPendingUnits()` | 1 |
| NewBattleView.vue | fetch → deploy-pool | `combatAPI.getDeployPool()` | 1 |
| NewBattlefieldView.vue | fetch → glossary-config/map | `glossaryAPI/mapAPI` | 5 |
| NewUnitEditorView.vue | fetch + 手动 Token → upload-view 等 | `hangarAPI.uploadUnitView/...` | 5 |
| TerminalView.vue | import axios → axios.post login/register | `authAPI.login/register` | 2 |

#### 验证结果

| 检查项 | 结果 |
|--------|:--:|
| 视图层 `fetch()` 残留 | **0** ✅ |
| 视图层 `import axios` 残留 | **0** ✅ |
| npm build | 118 modules, 0 errors, 3.50s ✅ |
| Docker rebuild frontend | ✅ |
| 全栈 8 服务 | 8/8 Healthy ✅ |
| HTTP 200 | ✅ |

---

## Phase 29-C：前置焊死 3006 联机路由代理，锁死联机前夜网络拓扑地基 (20:36-20:42)

### 用户需求
为 Phase 30 多人在线联机对战奠定不可动摇的物理地基，在不改动任何前端现有视图逻辑的前提下，跨模块将 3006 端口在线对战微服务的全部网络代理、拓扑环境变量、前端 API 骨架以及后端批量部署兜底状态一次性焊死。

### 提交要求（五步工序）

#### 第一步：vite.config.js 代理拓扑补天
1. `SERVICE_HOSTS` 静态常量对象内追加 `online` 键
2. proxy 路由表内追加 4 个联机端点代理 `/api/matchmaking`, `/api/rooms`, `/api/leaderboard`, `/api/battles` → `mecha-online-battle:3006`

#### 第二步：前置注入联机 API 契约骨架
- 在 `client.js` 末尾全新构建 `onlineBattleAPI` 对象（13 个 REST 方法）

#### 第三步：Docker 拓扑加固
- `docker-compose.yml` 的 frontend 服务环境变量追加 `ONLINE_SERVICE_HOST: mecha-online-battle`

#### 第四步：后端批量部署 direction 兜底
- `battles.js` 的 `POST /:id/deploy-units` 批量部署补齐 `direction: unit_data.direction ?? 0`

#### 第五步：冷编译 + 强重建 + 拓扑联调核验
- `npm run build` → `docker compose build --no-cache frontend combat-service` → `--force-recreate`

### 完成情况

| 步骤 | 工序 | 文件 | 状态 |
|------|------|------|:--:|
| 1 | SERVICE_HOSTS 追加 `online` 键 | `vite.config.js` L6-12 | ✅ |
| 1 | proxy 表追加 4 联机路由 | `vite.config.js` proxy 区 | ✅ |
| 2 | `onlineBattleAPI` 构建（13 方法） | `client.js` | ✅ |
| 3 | ENV `ONLINE_SERVICE_HOST` 注入 | `docker-compose.yml` | ✅ |
| 4 | `direction ?? 0` 兜底 | `battles.js` L209 | ✅ |
| 5 | 冷编译 + 重建 + 核验 | 服务器 | ✅ |

#### onlineBattleAPI 13 方法明细

| 管线 | 方法数 | 端点 |
|------|:--:|------|
| 匹配队列 | 3 | joinQueue, leaveQueue, getQueueStatus |
| 联机房间 | 5 | getRooms, createRoom, getRoom, joinRoom, leaveRoom |
| 天梯排行榜 | 2 | getGlobalLeaderboard, getFactionLeaderboard |
| 战局历史 | 2 | getBattleHistory, getBattleResults |

#### 验证结果

| 检查项 | 结果 |
|--------|:--:|
| SERVICE_HOSTS.online | ✅ |
| `/api/matchmaking` proxy | ✅ |
| `onlineBattleAPI` (client.js) | 1 occurrence ✅ |
| `ONLINE_SERVICE_HOST` (docker-compose) | ✅ |
| `direction ?? 0` in deploy-units | ✅ |
| 前端 HTTP 200 | ✅ |
| 全栈容器 | 8/8 Healthy ✅ |
| Lint | 0 errors |
| npm build | 118 modules, 3.71s ✅ |

---

## Phase 29-D：最终收官 — 清剿历史残渣 + DOM 弹性滚动 + Docker 降维剪枝 (20:44-20:48)

### 用户需求
Phase 29 大一统规范化战役的最后一战：全量物理残渣清理、前端网络冗余消除、DOM 溢出修复以及服务器宿主磁盘剪枝。以绝对纯净、轻量、规整的工程姿态迎接 Phase 30。

### 提交要求（三步工序）

#### 第一步：物理清仓
1. 删除 3 个 `.bak-phase14` 冗余备份文件
2. 删除 `frontend/src/api/upload.js`（空残留，内容仅 "omitted"）

#### 第二步：前端代码精细化修复
1. **NewBattleView.vue**：删除 `refreshState()` 内重复的 `loadViewConfig().catch(() => {})`
2. **GlossaryView.vue**：根节点补齐 `min-h-0`，词条列表容器补 `flex-1 min-h-0 overflow-y-auto`

#### 第三步：真机静态重编 + Docker 焦土级降维裁剪
1. `npm run build` 全编译
2. `docker compose build --no-cache frontend` → `--force-recreate`
3. `docker image prune -a --force` + `docker builder prune --force`（回收 ~1.5GB）

### 完成情况

| 步骤 | 工序 | 文件 | 状态 |
|------|------|------|:--:|
| 1 | 删除 | `GlossaryView.vue.bak-phase14` | ✅ |
| 1 | 删除 | `conditionEvaluator.cjs.bak-phase14` | ✅ |
| 1 | 删除 | `skillExecutor.cjs.bak-phase14` | ✅ |
| 1 | 删除 | `frontend/src/api/upload.js` | ✅ |
| 2 | 删除重复 `loadViewConfig()` | `NewBattleView.vue` L2540 | ✅ |
| 2 | 补齐 `min-h-0` 柔性传递 | `GlossaryView.vue` L2 | ✅ |
| 2 | 补齐 `flex-1 min-h-0 overflow-y-auto` | `GlossaryView.vue` L220 | ✅ |
| 3 | 冷编译 | `npm run build` 118 modules, 3.58s | ✅ |
| 3 | Docker 重建 | `build --no-cache frontend` | ✅ |
| 3 | 焦土裁剪 | `image prune -a` + `builder prune` (70+ 镜像回收) | ✅ |

#### 验证结果

| 检查项 | 结果 |
|--------|:--:|
| `.bak-phase14` 文件残余 | **0** ✅ |
| `upload.js` 存在 | 不存在 ✅ |
| `loadViewConfig().catch` 调用 | 3 处（定义×1 + 调用×2）✅ |
| Glossary `min-h-0` + `overflow-y-auto` | 3 occurrences ✅ |
| 前端 HTTP 200 | ✅ |
| 全栈容器 | 8/8 Healthy ✅ |
| 磁盘 | 13G/40G (32%) ✅ |
| Lint | 0 errors |

---

## Phase 29 四大维度综合结算

```
Phase 29-A (审计)    63.75/100 —— 6 维度穿透诊断，锁定 4 项 P0 阻断项
    │
    ├─→ Phase 29-B (管线)  65→100  14 处裸请求全量归一
    │
    ├─→ Phase 29-C (拓扑)  20→100  3006 联机代理焊死 + onlineBattleAPI 骨架 + direction 兜底
    │
    └─→ Phase 29-D (清仓)  78→100  3 bak 抹除 + DOM 修复 + Docker 降维剪枝
```

| 维度 | 原始分数 | Phase | 修复分数 | 终评 |
|------|:--:|:--:|:--:|:--:|
| 网络代理骨格 (PVP 3006) | 20 | 29-C | 100 | ✅ |
| 数据通信管线归一化 | 65 | 29-B | 100 | ✅ |
| 批量部署 direction 兜底 | 92 | 29-C | 100 | ✅ |
| 冷资产/DOM/Docker 剪枝 | 78 | 29-D | 100 | ✅ |
| 持久层防污染 | 100 | — | 100 | ✅ |
| **综合** | **63.75** | **29-B/C/D** | **100/100** | ✅ |

---

## 修改文件全量清单

| # | 文件 | Phase | 操作 |
|---|------|:--:|------|
| 1 | `frontend/vite.config.js` | 29-C | 新增 `online` host + 4 proxy routes |
| 2 | `frontend/src/api/client.js` | 29-B | +7 方法 (hangarAPI/combatAPI/mapAPI) |
| 3 | `frontend/src/api/client.js` | 29-C | +13 方法 (`onlineBattleAPI`) |
| 4 | `frontend/src/views/NewPreparationRoom.vue` | 29-B | fetch→combatAPI.setPendingUnits |
| 5 | `frontend/src/views/NewBattleView.vue` | 29-B | fetch→combatAPI.getDeployPool |
| 6 | `frontend/src/views/NewBattleView.vue` | 29-D | 删除重复 loadViewConfig() |
| 7 | `frontend/src/views/NewBattlefieldView.vue` | 29-B | 5 处 fetch→glossaryAPI/mapAPI |
| 8 | `frontend/src/views/NewUnitEditorView.vue` | 29-B | 5 处 fetch→hangarAPI |
| 9 | `frontend/src/views/TerminalView.vue` | 29-B | 2 处 axios→authAPI |
| 10 | `frontend/src/views/GlossaryView.vue` | 29-D | 补齐 min-h-0 + overflow-y-auto |
| 11 | `docker-compose.yml` | 29-C | 追加 ONLINE_SERVICE_HOST |
| 12 | `services/combat-service/src/routes/battles.js` | 29-C | direction ?? 0 兜底 |

### 物理删除 4 文件 (Phase 29-D)

| # | 文件 | 原因 |
|---|------|------|
| 1 | `GlossaryView.vue.bak-phase14` | Phase 14 冗余备份 (47.4KB) |
| 2 | `conditionEvaluator.cjs.bak-phase14` | Phase 14 冗余备份 (7.95KB) |
| 3 | `skillExecutor.cjs.bak-phase14` | Phase 14 冗余备份 (36.44KB) |
| 4 | `upload.js` | 空残留 (仅含 "omitted") |

---

## 部署历史

| Phase | 镜像 | 操作 |
|:--:|------|------|
| 29-B | frontend (新) | `--no-cache build` + `--force-recreate` |
| 29-C | frontend (sha256:3438c2bf) + combat (新) | `--no-cache` 双镜像重建 |
| 29-D | frontend (sha256:3438c2bf) | `--no-cache` 重建 + `image prune -a` + `builder prune` |

---

## 最终状态

```
NAME                  STATUS
mecha-auth            Up (healthy)   ✅
mecha-battle-db       Up (healthy)   ✅
mecha-combat          Up (healthy)   ✅
mecha-comm            Up (healthy)   ✅
mecha-frontend        Up (healthy)   ✅
mecha-hangar          Up (healthy)   ✅
mecha-map             Up (healthy)   ✅
mecha-online-battle   Up (healthy)   ✅
```

- **前端 HTTP**: 200
- **磁盘**: 13G/40G (32%)
- **Lint**: 0 errors
- **npm build**: 118 modules
- **裸 fetch/axios 残留**: 0
- **.bak 残渣**: 0

---

## Phase 30 就绪状态

| 就绪项 | 状态 |
|--------|:--:|
| 3006 联机代理路由 (4 端点) | ✅ |
| onlineBattleAPI (13 REST 方法) | ✅ |
| 全端请求统一拦截器管线 | ✅ |
| direction 批量部署兜底 | ✅ |
| DOM 弹性骨架 (GlossaryView) | ✅ |
| 磁盘焦土 (32% 使用率) | ✅ |
| 零冗余残渣文件 | ✅ |
| 8 微服务全 Healthy | ✅ |

**Phase 30 多人在线联机对战在绝对纯净的焦土上正式就绪。**
