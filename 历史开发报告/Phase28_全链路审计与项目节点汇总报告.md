# Phase 28 全链路审计与项目节点汇总报告

> **生成时间**: 2026-06-22 19:52 CST  
> **审计范围**: 全部 7 个微服务 + 前端 + 数据库 + Nginx  
> **服务器**: 腾讯云轻量服务器 (ap-shanghai, lhins-2fs1rzs8)  
> **访问地址**: http://106.54.197.69:8081

---

## 一、服务运行状态总表

| 容器名称 | 服务 | 端口 | 状态 | 运行时长 | 镜像构建时间 |
|----------|------|------|------|----------|-------------|
| mecha-battle-db | PostgreSQL 14 | 5432 | ✅ Healthy | 2 months | N/A (官方镜像) |
| mecha-auth | auth-service | 3001 | ✅ Healthy | 13 days | 2026-06-09 |
| mecha-hangar | hangar-service | 3002 | ✅ Healthy | 24 min | 2026-06-22 19:30 |
| mecha-map | map-service | 3003 | ✅ Healthy | 30 hours | 2026-06-21 |
| mecha-combat | combat-service | 3004 | ✅ Healthy | 28 min | 2026-06-22 19:20 |
| mecha-comm | comm-service | 3005 | ✅ Healthy | 10 days | 2026-06-09 |
| mecha-online-battle | online-battle-service | 3006 | ✅ Healthy | 2 days | 2026-06-18 |
| mecha-frontend | frontend (Vue/Vite) | 8081 | ✅ Healthy | 28 min | 2026-06-22 19:25 |
| nginx-ssl | Nginx 反向代理 | 80/443 | ✅ Running | 6 days | N/A |

**结论: 9/9 容器全部健康运行，零故障。**

---

## 二、端口与服务拓扑图

```
公网入口 (106.54.197.69)
│
├─ :80/443 → nginx-ssl (反向代理)
│   └─ 301 → HTTPS
│
├─ :8081 → mecha-frontend (Vue + Vite 开发服务器)
│   │         └─ Vite Proxy 内部路由:
│   │              /api/auth    → auth-service:3001
│   │              /api/hangar  → hangar-service:3002
│   │              /api/map     → map-service:3003
│   │              /api/combat  → combat-service:3004
│   │              /api/campaign→ combat-service:3004 (共用)
│   │              /api/comm    → comm-service:3005
│   │              /socket.io   → comm-service:3005 (WebSocket)
│
├─ :3001 → auth-service (认证) ──── 依赖 → postgres:5432
├─ :3002 → hangar-service (棋子库) ─ 依赖 → postgres:5432
├─ :3003 → map-service (地图) ────── 依赖 → postgres:5432
├─ :3004 → combat-service (战斗) ─── 依赖 → auth, hangar, map, comm
├─ :3005 → comm-service (通信/房间) ─ 依赖 → combat, map
├─ :3006 → online-battle-service ─── 依赖 → auth, combat, map, comm
└─ :5432 → PostgreSQL (数据库)
```

---

## 三、微服务间数据回传检查

### 3.1 服务间连通性测试结果

| 调用方 → 目标 | 结果 | 响应 |
|---------------|------|------|
| combat → auth (http://auth-service:3001) | ✅ | `{"status":"ok"}` |
| combat → hangar (http://hangar-service:3002) | ✅ | `{"status":"ok"}` |
| combat → map (http://mecha-map:3003) | ✅ | `{"status":"ok"}` |
| combat → comm (http://mecha-comm:3005) | ✅ | `{"status":"ok"}` |
| online-battle → combat (http://mecha-combat:3004) | ✅ | `{"status":"ok"}` |
| online-battle → comm (http://mecha-comm:3005) | ✅ | `{"status":"ok"}` |

**结论: 所有服务间通信通道全部畅通。**

### 3.2 健康检查端点汇总

| 服务 | 健康检查路径 | 状态 |
|------|-------------|------|
| auth | `GET /health` | ✅ |
| hangar | `GET /api/health` | ✅ |
| map | `GET /health` | ✅ |
| combat | `GET /health` | ✅ |
| comm | `GET /api/comm/health` | ✅ |
| online-battle | `GET /health` | ✅ |
| frontend | `GET /` (HTML 200) | ✅ |

---

## 四、数据契约冲突检查

### 🔴 严重问题

#### 4.1 online-battle-service (3006) 前端无代理配置

**问题**: `vite.config.js` 中没有为 `/api/matchmaking`, `/api/rooms`, `/api/leaderboard`, `/api/battles` 配置代理，这些端点由 online-battle-service (3006) 提供，但前端无法通过 Vite 代理访问。

- online-battle-service 提供的路由:
  - `GET/POST /api/matchmaking/*`
  - `GET/POST /api/rooms/*`
  - `GET /api/leaderboard/*`
  - `GET/POST /api/battles/*`
- **vite.config.js 中没有这些前缀的代理配置**
- 前端 `api/client.js` 中也没有对应的 API 封装

**影响**: 在线对战功能的匹配、房间、排行榜、在线对战等无法从前端直接使用。

**建议**: 在 `vite.config.js` 中添加 `/api/matchmaking`, `/api/rooms`, `/api/leaderboard`, `/api/battles` 的代理，指向 `http://${SERVICE_HOSTS.online}:3006`。

#### 4.2 comm-service WebSocket 协议重复

**问题**: comm-service (3005) 使用 Socket.io (`/socket.io`)，而 online-battle-service (3006) 使用原始 WebSocket (`ws`)。两个服务各自维护独立的 WebSocket 连接管理。

- comm-service: Socket.io (有房间、消息、动作广播)
- online-battle-service: 原始 ws (也有房间、消息、动作广播)

**影响**: 功能重复，房间状态不共享，可能导致聊天和在线对战使用不同通道。

**建议**: 明确 comm-service 用于聊天/通知，online-battle-service 用于对战匹配。或统一到一个 WebSocket 服务。

### 🟡 中等问题

#### 4.3 api/upload.js 文件为空

**文件**: `frontend/src/api/upload.js` — 内容仅为 `omitted`，无任何导出。

**影响**: 如果有代码尝试 `import ... from '@/api/upload'`，将导致运行时错误。目前无视图引用此文件，但存在潜在风险。

**建议**: 删除该文件，或填充完整实现。

#### 4.4 多处 fetch() 绕过统一 apiClient

以下文件直接使用 `fetch()` 而非 `api/client.js` 中的统一封装：

| 文件 | 调用端点 | 行号 | 风险 |
|------|---------|------|------|
| NewPreparationRoom.vue | `/api/combat/:id/pending-units` | 300 | 无 Token 自动注入 |
| NewUnitEditorView.vue | `/api/hangar/units/upload-view` | 397 | 手动添加 Token |
| NewUnitEditorView.vue | `/api/hangar/factions/upload` | 527 | 手动添加 Token |
| NewUnitEditorView.vue | `/api/hangar/units/upload-image` | 582 | 手动添加 Token |
| NewUnitEditorView.vue | `/api/hangar/units/parse-excel` | 594 | 手动添加 Token |
| NewUnitEditorView.vue | `/api/hangar/units/create-from-json` | 607 | 手动添加 Token |
| NewBattlefieldView.vue | `/api/combat/glossary-config` | 295 | **无 Token** |
| NewBattlefieldView.vue | `/api/map/list` | 526 | 手动添加 Token |
| TerminalView.vue | `/api/auth/login` | 101 | 直接使用 axios |

**影响**: 
- Token 刷新机制无法统一处理
- 401 拦截逻辑不一致
- NewBattlefieldView.vue 的 glossary-config 调用无 Token，如果该端点需要认证将失败

**建议**: 将所有这些调用迁移到 `api/client.js` 中的统一方法。

#### 4.5 NewRegisterView.vue 缺少 useUserStore

**文件**: `frontend/src/views/NewRegisterView.vue` 第 47-57 行

注册成功后仅保存 token 到 localStorage，未调用 `userStore.setUser()`。对比 `NewLoginView.vue` 正确使用了 userStore。

**影响**: 如果其他页面依赖 userStore.user 判断登录状态，从注册页登录后可能状态不一致。

---

## 五、前端显示问题检查

### 🔴 严重

#### 5.1 NewBattleView.vue 重复调用 loadViewConfig()

**文件**: `NewBattleView.vue` 第 2543-2545 行

```js
loadGlossaryConfig().catch(() => {})
loadViewConfig().catch(() => {})
loadViewConfig().catch(() => {})  // ← 重复调用
```

**影响**: 视图配置被加载两次，浪费网络请求。

### 🟡 中等

#### 5.2 硬编码 battlefield_id: 1

- `NewPreparationRoom.vue` 第 265 行: `await combatAPI.createBattle({ battlefield_id: 1 })`
- `NewBattleView.vue` 第 2740 行: 同样硬编码 1

**影响**: 如果 ID=1 的战场不存在，创建战斗会失败。

#### 5.3 硬编码路由跳过设备检测

`NewPreparationRoom.vue` 第 320 行: `router.push('/battle-pc/' + battleId)` 绕过 `redirectByDevice` 中间件。

**影响**: 移动端用户从整备室出击也会进入 PC 战斗视图。

#### 5.4 GlossaryView.vue 存在备份文件

`frontend/src/views/GlossaryView.vue.bak-phase14` 仍在 views 目录中。

**影响**: 虽不会被 `.vue` 匹配器导入，但可能造成维护混淆。

### 🟢 轻微

#### 5.5 Import 路径风格不一致

`NewBattleView.vue` 中混用 `@/` 别名（`@/api/client`）和相对路径（`../utils/hexUtils.js`）。

#### 5.6 大量静默 catch 块

多个文件中存在空 `catch (e) {}` 或 `catch (_) {}`，可能隐藏真实错误。

---

## 六、旧数据留存情况检查

### 6.1 备份文件（5个）

| 文件路径 | 说明 |
|---------|------|
| `services/combat-service/src/services/combatCore/damagePipe.cjs.bak` | Phase 前备份 |
| `services/combat-service/src/services/combatCore/conditionEvaluator.cjs.bak-phase14` | Phase 14 备份 |
| `services/combat-service/src/services/combatCore/skillExecutor.cjs.bak-phase14` | Phase 14 备份 |
| `services/map-service/src/index.js.bak` | map 服务旧备份 |
| `frontend/src/views/GlossaryView.vue.bak-phase14` | Phase 14 旧视图备份 |

**状态**: `.bak` 文件不会被 Git 跟踪，不会被 Node.js 加载，不会影响运行。但建议清理。

### 6.2 Docker 镜像膨胀

- **总镜像数**: 101 个
- **活跃镜像**: 9 个
- **总大小**: 2.33 GB
- **可回收**: 1.513 GB (64%)
- **构建缓存**: 56 MB

**状态**: 存在大量旧构建镜像。不影响运行功能，但占用磁盘。

**建议**: 执行 `docker image prune -a` 清理无标签旧镜像。

### 6.3 数据库文件状态

| 数据卷 | 文件 | 大小 | 最后修改 | 状态 |
|--------|------|------|----------|------|
| hangar_data | hangar.db | 16 KB | 2026-06-22 11:30 | ✅ 当前使用中 |
| hangar_data | factions.json | 227 B | 2026-06-22 11:30 | ✅ 当前使用中 |
| auth_data | (空) | 0 B | 2026-06-09 | ⚠️ 无数据文件 |
| combat_data | combat.db | 40 KB | 2026-06-08 | ⚠️ 14天未更新 |
| map_data | map.db | 68 KB | 2026-06-21 | ✅ 仍在使用中 |

**auth_data 为空分析**: auth-service 使用 PostgreSQL 作为主数据库（`DB_ADAPTER` 环境变量），SQLite 数据卷仅作为回退，所以 auth_data 为空是正常的。

**combat.db 未更新分析**: combat.db 最后修改是 6月8日，但 combat 容器是今天刚重建的。说明 combat-service 也主要使用 PostgreSQL，SQLite 仅为回退。

### 6.4 上传文件留存

hangar_uploads 卷中有 5 个文件：
- 2 个 `.xlsx` Excel 导入文件
- 2 个 `.JPG` 图片
- 1 个 `.png` 上传（可能是棋子图片或七视图）

**状态**: 正常运行产生的数据，无问题。

---

## 七、Phase 28 项目节点汇总

### Phase 28 概述

Phase 28 为 **七视图方向系统（7-View Direction System）重构**，目标是让棋子在战场上根据 atan2 角度自动切换 7 个方向的精灵图（0-6），替代旧的单一朝向渲染。

### Phase 28 关键里程碑

| 阶段 | 内容 | 状态 |
|------|------|------|
| **Stage 1** | 数据契约修复：新增 `/api/hangar/units/upload-view` 端点，支持 PNG 精灵图上传 | ✅ 完成 |
| **Stage 2** | 三路并行开发 | ✅ 完成 |
| 2-A | 前端 unitSpriteResolver 实现七方向裁剪逻辑 | ✅ |
| 2-B | 后端 combat-service 方向追踪 (atan2 计算) | ✅ |
| 2-C | hangar-service 上传与存储视图管理 | ✅ |
| **Stage 3** | 冷编译 + Docker 部署 | ✅ 完成 |

### Phase 28 涉及的关键代码文件

| 文件 | 变更 |
|------|------|
| `frontend/src/resolvers/unitSpriteResolver.js` | 新增七视角裁剪算法 |
| `frontend/src/components/HexGridCanvas.vue` | 集成方向精灵渲染 |
| `frontend/src/views/NewUnitEditorView.vue` | 新增七视图上传 UI |
| `services/hangar-service/src/routes/units.js` | 新增 `/upload-view` 端点 + 数据路径修正 |
| `services/hangar-service/src/database/db.js` | 修正 DB 持久化路径（`DATA_DIR` 环境变量） |
| `services/hangar-service/src/routes/factions.js` | 修正 factions 数据与上传路径 |
| `services/combat-service/src/index.js` | 方向追踪逻辑集成 |
| `services/combat-service/src/routes/battles.js` | 战斗中方向数据回传 |
| `docker-compose.yml` | 新增 `DATA_DIR=/app/data` 环境变量 |
| `services/hangar-service/Dockerfile` | 添加 USTC 镜像加速 |

### Phase 28 部署中解决的问题

1. **Alpine 包下载缓慢** → 添加 USTC 镜像源 (`mirrors.ustc.edu.cn`)
2. **棋子数据每次部署丢失** → hangar.db 路径从 `src/data/` 修正为 Docker 数据卷 `/app/data/`
3. **并发构建冲突** → 清理陈旧构建进程后串行构建

### Phase 28 未完成事项

- online-battle-service (3006) 前端代理未配置
- 多处 fetch() 调用未迁移到统一 apiClient
- NewRegisterView.vue 缺少 useUserStore
- 旧备份文件未清理

---

## 八、综合评估

### 系统健康度评分: 85/100

| 维度 | 得分 | 说明 |
|------|------|------|
| 容器健康 | 100/100 | 9/9 全部 Healthy |
| 服务间通信 | 100/100 | 全部畅通 |
| 数据契约一致性 | 75/100 | online-battle 代理缺失；多处 fetch 绕过统一 Client |
| 前端代码质量 | 70/100 | 重复调用、硬编码 ID、风格不一致、静默 catch |
| 旧数据清理 | 80/100 | 5个备份文件、大量旧镜像堆积 |
| 数据持久化 | 90/100 | hangar.db 已修正；auth/combat 依赖 PostgreSQL 为主 |

### 优先修复建议（按优先级排序）

| 优先级 | 问题 | 修复方式 |
|--------|------|---------|
| **P0** | online-battle-service 无前端代理 | vite.config.js 添加 `/api/matchmaking` 等代理 |
| **P1** | NewRegisterView.vue 无 useUserStore | 添加 import + handleLogin 中调用 setUser |
| **P1** | 多处 fetch() 绕过 apiClient | 迁移到 api/client.js 统一方法 |
| **P2** | 硬编码 battlefield_id: 1 | 改为动态获取可用战场 ID |
| **P2** | NewBattleView.vue 重复 loadViewConfig | 删除重复行 |
| **P2** | NewBattlefieldView.vue fetch 无 Token | 改用 glossaryAPI 封装 |
| **P3** | 删除 api/upload.js 空文件 | 删除或填充 |
| **P3** | 清理 .bak 备份文件 | 删除 5 个备份文件 |
| **P3** | Docker 镜像清理 | `docker image prune -a` |

---

## 附录 A: 完整 API 端点表

### auth-service (3001)
| 方法 | 路径 | 认证 |
|------|------|------|
| GET | `/health` | 无 |
| POST | `/api/auth/register` | 无 |
| POST | `/api/auth/login` | 无 |
| GET | `/api/auth/me` | Bearer Token |
| GET | `/api/auth/verify` | Bearer Token |

### hangar-service (3002)
| 方法 | 路径 | 认证 |
|------|------|------|
| GET | `/api/health` | 无 |
| GET | `/api/hangar/units/unit-types` | 无 |
| GET | `/api/hangar/units` | JWT |
| GET | `/api/hangar/units/:id` | JWT |
| POST | `/api/hangar/units` | JWT |
| PUT | `/api/hangar/units/:id` | JWT |
| DELETE | `/api/hangar/units/:id` | JWT |
| POST | `/api/hangar/units/upload-image` | JWT |
| POST | `/api/hangar/units/upload-view` | JWT (Phase 28 新增) |
| POST | `/api/hangar/units/import-excel` | JWT |
| POST | `/api/hangar/units/import-excel-new` | JWT |
| POST | `/api/hangar/units/parse-excel` | JWT |
| POST | `/api/hangar/units/create-from-json` | JWT |
| GET | `/api/hangar/factions` | 无 |
| POST | `/api/hangar/factions/upload` | JWT |

### map-service (3003)
| 方法 | 路径 | 认证 |
|------|------|------|
| GET | `/health` | 无 |
| GET | `/api/map` | 无 |
| GET | `/api/map/list` | 无 |
| GET | `/api/map/battlefields` | JWT |
| GET | `/api/map/battlefields/all` | JWT |
| GET | `/api/map/battlefields/:id` | JWT |
| GET | `/api/map/battlefields/:id/spawn-points` | JWT |
| POST | `/api/map/battlefields` | JWT |
| PUT | `/api/map/battlefields/:id` | JWT |
| DELETE | `/api/map/battlefields/:id` | JWT |
| POST | `/api/map/battlefields/:id/terrain` | JWT |
| DELETE | `/api/map/battlefields/:id/terrain` | JWT |
| GET | `/api/map/battlefields/terrain/types` | JWT |
| POST | `/api/map/battlefields/terrain/types` | JWT |
| PUT | `/api/map/battlefields/terrain/types/:id` | JWT |
| DELETE | `/api/map/battlefields/terrain/types/:id` | JWT |

### combat-service (3004)
| 方法 | 路径 | 认证 |
|------|------|------|
| GET | `/health` | 无 |
| GET/POST | `/api/combat/*` | JWT |
| GET/POST | `/api/campaign/*` | JWT |

### comm-service (3005)
| 方法 | 路径 | 认证 |
|------|------|------|
| GET | `/api/comm/health` | 无 |
| WebSocket | `/socket.io` | - |

### online-battle-service (3006) ⚠️ 无前端代理
| 方法 | 路径 | 认证 |
|------|------|------|
| GET | `/health` | 无 |
| GET/POST | `/api/matchmaking/*` | - |
| GET/POST | `/api/rooms/*` | - |
| GET | `/api/leaderboard/*` | - |
| GET/POST | `/api/battles/*` | - |
| WebSocket | (ws://) | - |

---

*报告结束*
