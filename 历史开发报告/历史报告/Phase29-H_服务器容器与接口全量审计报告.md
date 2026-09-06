# Phase 29-H 服务器容器与接口全量审计报告

> **服务器**: 106.54.197.69 (ap-shanghai, lhins-2fs1rzs8)  
> **审计时间**: 2026-06-22 21:44  
> **登录入口**: http://106.54.197.69:8081/login  
> **域名入口 (SSL)**: https://deanheim.online → → → :8081

---

## 一、容器/端口拓扑总图

```
┌──────────────────────────────────────────────────────────────────┐
│                       公网入口                                    │
│                                                                  │
│  https://deanheim.online:443 ─┐    http://106.54.197.69:8081 ─┐ │
│          (SSL终结)            │         (直连入口)             │ │
└───────────────────────────────┼────────────────────────────────┼─┘
                                │                                │
                                ▼                                │
┌──────────────────────────────────────────────────────────────────┐
│  nginx-ssl (bridge: 172.17.0.3)             运行6天               │
│  listen 80/443  →  proxy_pass http://172.17.0.1:8081            │
│  SSL: deanheim.online 证书                                       │
└────────────────────────┬─────────────────────────────────────────┘
                         │ proxy_pass
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│  mecha-frontend (mecha-network: 172.18.0.9)   运行5分钟           │
│  listen 8081  •  安全头: CSP + HSTS + Referrer + X-Content + X-Frame │
│                                                                  │
│  /             → index.html (Vue SPA)                            │
│  /api/auth/*   → mecha-auth:3001        (认证)                   │
│  /api/hangar/* → mecha-hangar:3002      (格纳库)                 │
│  /api/map/*    → mecha-map:3003         (地图)                   │
│  /api/combat/* → mecha-combat:3004      (战斗)                   │
│  /api/comm/*   → mecha-comm:3005        (通信)                   │
│  /api/matchmaking → mecha-online-battle:3006  (匹配)             │
│  /api/rooms    → mecha-online-battle:3006      (房间)            │
│  /api/leaderboard → mecha-online-battle:3006   (排行榜)          │
│  /api/battles  → mecha-online-battle:3006      (战局历史)        │
│  /socket.io/*  → mecha-comm:3005/socket.io/   (WebSocket)       │
└────────────────┬───────┬───────┬───────┬───────┬───────┬────────┘
                 │       │       │       │       │       │
          ┌──────┘  ┌────┘  ┌────┘  ┌────┘  ┌────┘  └──────────────┐
          ▼         ▼       ▼       ▼       ▼                       ▼
┌──────────────────────────────────────────────────────────────────────┐
│              mecha-network (172.18.0.0/16) Docker内部网络              │
│                                                                      │
│  .2: mecha-battle-db     PostgreSQL 14        运行 2 个月              │
│  .3: mecha-combat        战斗引擎 (3004)       运行 ~1 小时            │
│  .4: mecha-auth          认证服务 (3001)       运行 ~1 小时            │
│  .5: mecha-map           地图服务 (3003)       运行 ~1 小时            │
│  .6: mecha-comm          Socket.io通信 (3005)  运行 ~1 小时            │
│  .7: mecha-hangar        格纳库服务 (3002)     运行 2 小时             │
│  .8: mecha-online-battle 联机对战 (3006)        运行 2 天              │
│  .9: mecha-frontend      前端Nginx (8081)      运行 5 分钟             │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 二、分层详细拆解

### 第1层：SSL 终止代理 — nginx-ssl (80/443)

| 属性 | 值 |
|------|-----|
| **镜像** | `nginx:stable-alpine` (62MB) |
| **运行时长** | 6 天 |
| **所属网络** | bridge (172.17.0.3)，**未加入** mecha-network |
| **挂载目录** | `/opt/nginx-docker/html/` → 空目录 (0文件) |
| | `/opt/nginx-docker/ssl/` → SSL证书 |
| | `/opt/nginx-docker/conf/nginx.conf` → 主配置 |
| **绑定的域名** | `deanheim.online` / `www.deanheim.online` |

**Nginx 配置行为**：
```
:80  → 301 重定向到 https://deanheim.online
:443 → SSL终止 → proxy_pass http://172.17.0.1:8081 (宿主机docker bridge网关)
```

**⚠️ 关键问题**：
- 这是一个独立的旧容器，**不在 mecha-network 内**
- 通过宿主机的 bridge 网关 `172.17.0.1:8081` 间接访问 mecha-frontend
- 自身**不返回** CSP/HSTS 等安全头（安全头只在 mecha-frontend 上）
- `/opt/nginx-docker/html/` 为空，**不做任何静态服务**，纯转发
- SSL 证书：`deanheim.online_bundle.crt` + `deanheim.online.key`

---

### 第2层：前端 + API 网关 — mecha-frontend (8081)

| 属性 | 值 |
|------|-----|
| **镜像** | `original-project-frontend:latest` (69MB) |
| **运行时长** | 5 分钟 (最新部署) |
| **所属网络** | mecha-network (172.18.0.9) |
| **监听端口** | 8081 |
| **静态文件** | `/usr/share/nginx/html/` (Vue 3 SPA build产物) |
| **client_max_body_size** | 50m |

**Nginx 完整配置**：

```nginx
server {
    listen 8081;
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html;

    # Phase 29-H 安全头
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; ..." always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;

    # Cache策略
    add_header Cache-Control "no-cache, no-store, must-revalidate" always;

    location / { try_files $uri $uri/ /index.html; }

    # 6条API反向代理 + WebSocket
    location /api/auth/       → mecha-auth:3001
    location /api/hangar/     → mecha-hangar:3002
    location /api/map/        → mecha-map:3003
    location /api/combat/     → mecha-combat:3004
    location /api/comm/       → mecha-comm:3005
    location /api/matchmaking → mecha-online-battle:3006
    location /api/rooms       → mecha-online-battle:3006
    location /api/leaderboard → mecha-online-battle:3006
    location /api/battles     → mecha-online-battle:3006
    location /socket.io/      → mecha-comm:3005/socket.io/
}
```

**Vue 路由表** (SPA 前端路由)：

| 路径 | 组件 | 认证要求 |
|------|------|---------|
| `/` | `NewLoginView.vue` | ❌ 无需 |
| `/login` | `NewLoginView.vue` | ❌ 无需 |
| `/register` | `NewRegisterView.vue` | ❌ 无需 |
| `/terminal` | `TerminalView.vue` | ❌ 无需 |
| `/home` | `NewHomeView.vue` | ✅ JWT |
| `/units/*` | `NewUnitEditorView.vue` | ✅ JWT |
| `/battlefields` | `NewBattlefieldSelector.vue` | ✅ JWT |
| `/glossary` | `GlossaryView.vue` | ✅ JWT |
| `/preparation/:roomId` | `NewPreparationRoom.vue` | ✅ JWT |
| `/battle/:id` | 设备分流 → PC/Mobile | ✅ JWT |

---

### 第3a层：认证服务 — mecha-auth (3001)

| 属性 | 值 |
|------|-----|
| **镜像** | `original-project-auth-service:latest` (168MB) |
| **运行时长** | ~1 小时 |
| **网络** | mecha-network (172.18.0.4) |
| **数据库** | **sql.js** (文件: `/app/data/auth.db`，进程内 SQLite) |
| **限流** | 全局: 100次/15min；登录: 10次/15min |
| **JWT** | 有效期 7 天，bcrypt rounds=10 |

**接口清单**：

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| POST | `/api/auth/register` | ❌ | 注册 (Zod校验: username 3-20字, password 6-100字) |
| POST | `/api/auth/login` | ❌ | 登录 → 返回 JWT token + 用户信息 |
| GET | `/api/auth/me` | ✅ Bearer | 获取当前用户信息 |
| GET | `/api/auth/verify` | ✅ Bearer | 验证 Token 有效性 |
| GET | `/health` | ❌ | 健康检查 |

**登录流程**：
```
用户输入 username + password
  → POST /api/auth/login (Zod 校验)
  → SQLite SELECT * FROM users WHERE username = ?
  → bcrypt.compare(password, password_hash)
  → jwt.sign({userId, username}, secret, 7d)
  → 返回 { token, user: { id, username } }
  → 前端 localStorage.setItem('token', token)
  → router.push('/home')
```

---

### 第3b层：格纳库服务 — mecha-hangar (3002)

| 属性 | 值 |
|------|-----|
| **镜像** | `original-project-hangar-service:latest` (192MB) |
| **运行时长** | 2 小时 |
| **网络** | mecha-network (172.18.0.7) |
| **数据库** | **sql.js** (文件: `/app/data/hangar.db`) |
| **功能** | 单位 CRUD、Excel 导入/解析、阵营管理、图片上传 |

**接口清单**：

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/api/hangar/unit-types` | ❌ | 获取单位类型列表 |
| GET | `/api/hangar/` | ✅ | 获取用户所有单位 |
| GET | `/api/hangar/:id` | ✅ | 获取单个单位详情 |
| POST | `/api/hangar/` | ✅ | 创建单位 |
| PUT | `/api/hangar/:id` | ✅ | 更新单位 (📋 Phase 29-H 添加了 id/name/for) |
| DELETE | `/api/hangar/:id` | ✅ | 删除单位 |
| POST | `/api/hangar/upload-image` | ❌ | 上传图片 |
| POST | `/api/hangar/upload-view` | ✅ | 上传视图文件 |
| POST | `/api/hangar/import-excel` | ✅ | Excel 导入单位 (旧版) |
| POST | `/api/hangar/import-excel-new` | ✅ | Excel 导入单位 (新版, 配置化) |
| POST | `/api/hangar/parse-excel` | ✅ | 解析 Excel (不导入) |
| POST | `/api/hangar/create-from-json` | ✅ | 从 JSON 创建单位 |

**阵营管理** (factions.js)：

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/api/hangar/factions/` | ❌ | 获取阵营列表 |
| POST | `/api/hangar/factions/upload` | ❌ | 上传阵营 Logo |

**数据模型** (`units` 表)：包含主机体 (main)、Royroy 跟随体、左手装备、右手装备、Extra 装备，每部分各有 格斗/射击/结构/机动 四维 + 技能槽。

---

### 第3c层：地图服务 — mecha-map (3003)

| 属性 | 值 |
|------|-----|
| **镜像** | `original-project-map-service:latest` (192MB) |
| **运行时长** | ~1 小时 |
| **网络** | mecha-network (172.18.0.5) |
| **数据库** | **sql.js** (文件: `/app/data/map.db`) |
| **功能** | 战场 CRUD、地形管理、出生点、A* 寻路、范围计算 |

**接口清单**：

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/api/map/list` | ❌ | 所有战场列表 (支持 ?id= 查询单个) |
| GET | `/api/map/battlefields` | ✅ | 获取战场列表 |
| GET | `/api/map/battlefields/all` | ✅ | 获取公共战场 |
| GET | `/api/map/battlefields/:id` | ✅ | 获取战场详情 |
| POST | `/api/map/battlefields` | ✅ | 创建战场 |
| PUT | `/api/map/battlefields/:id` | ✅ | 更新战场 |
| DELETE | `/api/map/battlefields/:id` | ✅ | 删除战场 |
| GET | `/api/map/battlefields/:id/spawn-points` | ✅ | 获取出生点 |
| GET | `/api/map/battlefields/terrain/types` | ✅ | 获取地形类型 |
| POST | `/api/map/battlefields/terrain/types` | ✅ | 创建地形类型 |
| PUT | `/api/map/battlefields/terrain/types/:terrainId` | ✅ | 更新地形类型 |
| DELETE | `/api/map/battlefields/terrain/types/:terrainId` | ✅ | 删除地形类型 |
| POST | `/api/map/battlefields/:id/terrain` | ✅ | 批量更新地形 |
| DELETE | `/api/map/battlefields/:id/terrain` | ✅ | 清除地形 |
| POST | `/api/map/battlefields/utils/path` | ✅ | **A\* 寻路计算** |
| POST | `/api/map/battlefields/utils/range` | ✅ | **范围格子计算** |
| GET | `/health` | ❌ | 健康检查 |
| GET | `/api/map` | ❌ | API 文档索引 |

---

### 第3d层：战斗引擎 — mecha-combat (3004)

| 属性 | 值 |
|------|-----|
| **镜像** | `original-project-combat-service:latest` (168MB) |
| **运行时长** | ~1 小时 |
| **网络** | mecha-network (172.18.0.3) |
| **数据库** | **PostgreSQL** (优先) → sql.js (fallback) |
| **功能** | 战斗会话管理、回合制战斗、部署/移动/攻击、迷雾/支援/隐藏系统 |

**接口清单**：

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/api/combat/` | ✅ | 获取战斗列表 |
| POST | `/api/combat/` | ✅ | 创建战斗会话 |
| GET | `/api/combat/:id/state` | ✅ | 获取战场状态 |
| GET | `/api/combat/glossary-config` | ✅ | 获取词条配置 |
| POST | `/api/combat/glossary-config` | ✅ | 保存词条配置 |
| POST | `/api/combat/:id/deploy-unit` | ✅ | 部署单个单位 |
| POST | `/api/combat/:id/deploy-units` | ✅ | 批量部署单位 |
| POST | `/api/combat/:id/move` | ✅ | 移动单位 |
| GET | `/api/combat/:id/move-range/:unit_id` | ✅ | 计算移动范围 |
| POST | `/api/combat/:id/attack` | ✅ | 攻击 |
| POST | `/api/combat/:id/end-turn` | ✅ | 结束回合 |
| POST | `/api/combat/:id/start-combat` | ✅ | 开始战斗 |
| GET | `/api/combat/:id/deploy-pool` | ✅ | 部署池 |
| POST | `/api/combat/:id/pending-units` | ✅ | 待部署单位 |
| POST | `/api/combat/:id/end-deployment` | ✅ | 结束部署阶段 |
| POST | `/api/combat/:id/action` | ✅ | 执行行动 (通用) |
| POST | `/api/combat/:id/fog-system` | ✅ | 迷雾系统 |
| POST | `/api/combat/:id/support` | ✅ | 支援 |
| POST | `/api/combat/:id/conceal` | ✅ | 隐藏 |
| POST | `/api/combat/:id/jump-to` | ✅ | 跳跃 |
| POST | `/api/combat/:id/victory-conditions` | ✅ | 设置胜利条件 |
| GET | `/api/combat/:id/victory-conditions` | ✅ | 获取胜利条件 |
| POST | `/api/combat/:id/ace-unit` | ✅ | 王牌单位 |
| GET | `/api/combat/:id/ace-unit` | ✅ | 获取王牌单位 |
| GET | `/api/combat/:id/faction-cooldowns` | ✅ | 阵营冷却 |
| POST | `/api/combat/:id/join` | ✅ | 加入战斗 |

> 🔄 Phase 29-H 修改：`NewBattleView.vue` onMounted 中合并了 `loadGlossaryConfigForDice()` → `loadGlossaryConfig()`，消除重复 `/api/combat/glossary-config` 请求。

---

### 第3e层：通信服务 — mecha-comm (3005)

| 属性 | 值 |
|------|-----|
| **镜像** | `original-project-comm-service:latest` (147MB) |
| **运行时长** | ~1 小时 |
| **网络** | mecha-network (172.18.0.6) |
| **数据库** | **内存 Map** (无持久化数据库) |
| **协议** | HTTP + **Socket.io** (WebSocket + polling fallback) |
| **依赖** | 跨服务调用 combat-service (创建战斗), map-service (获取战场详情) |

**REST 接口清单**：

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/api/comm/health` | ❌ | 健康检查 (含连接数) |
| GET | `/api/comm/stats/rooms` | ❌ | 房间连接统计 |
| GET | `/api/comm/ai-options` | ❌ | AI 设置选项 (阵营/难度) |
| POST | `/api/comm/rooms` | ✅ | **创建房间** → 调用 combat-service 创建 battle_id |
| POST | `/api/comm/rooms/:roomId/join` | ✅ | 加入房间 (选择阵营) |
| POST | `/api/comm/rooms/:roomId/ready` | ✅ | 准备/取消准备 |
| POST | `/api/comm/rooms/:roomId/start` | ✅ | 开始游戏 (房主) |
| POST | `/api/comm/rooms/:roomId/leave` | ✅ | 离开房间 |
| GET | `/api/comm/rooms/:roomId` | ✅ | 获取房间信息 (含战场详情) |
| POST | `/api/comm/rooms/:roomId/ai` | ✅ | 设置 AI 玩家 |
| DELETE | `/api/comm/rooms/:roomId/ai/:aiPlayerId` | ✅ | 移除 AI 玩家 |

**Socket.io 事件** (实时通信)：
- 房间管理: `create-room`, `join-room`, `leave-room`
- 游戏流程: `player-joined`, `player-left`, `player-ready`, `game-start`
- AI: `ai-player-joined`, `ai-player-left`
- 通过 `setupSocketHandlers(io)` 模块加载

**⚠️ 功能重复注意**：comm-service 与 online-battle-service 都有房间管理和准备/开始游戏功能。前者使用内存 Map (无持久化)，后者使用 better-sqlite3 持久化。

---

### 第3f层：联机对战服务 — mecha-online-battle (3006)

| 属性 | 值 |
|------|-----|
| **镜像** | `original-project-online-battle-service:latest` (442MB) 最大镜像 |
| **运行时长** | 2 天 (未与其余服务同步重启) |
| **网络** | mecha-network (172.18.0.8) |
| **数据库** | **better-sqlite3** (原生 C 绑定, 持久化) |
| **功能** | 匹配队列、房间管理、排行榜、战局历史 |

**四大路由模块**：

**A. 匹配系统** (matchmaking.js)：

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| POST | `/api/matchmaking/queue` | ✅ | 加入匹配队列 |
| DELETE | `/api/matchmaking/queue` | ✅ | 退出匹配队列 |
| GET | `/api/matchmaking/queue/status` | ✅ | 查询队列状态 |
| GET | `/api/matchmaking/stats` | ❌ | 匹配统计 |

**B. 房间管理** (rooms.js)：

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/api/rooms` | ✅ | 房间列表 |
| POST | `/api/rooms` | ✅ | 创建房间 |
| GET | `/api/rooms/:roomId` | ✅ | 房间详情 |
| POST | `/api/rooms/:roomId/join` | ✅ | 加入房间 |
| POST | `/api/rooms/:roomId/leave` | ✅ | 离开房间 |
| POST | `/api/rooms/:roomId/ready` | ✅ | 准备 |
| POST | `/api/rooms/:roomId/start` | ✅ | 开始游戏 (房主) |
| PUT | `/api/rooms/:roomId/settings` | ✅ | 修改房间设置 (房主) |
| DELETE | `/api/rooms/:roomId` | ✅ | 删除房间 (房主) |
| GET | `/api/rooms/:roomId/chat` | ✅ | 获取聊天记录 |
| POST | `/api/rooms/:roomId/chat` | ✅ | 发送聊天消息 |

**C. 排行榜** (leaderboard.js)：

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/api/leaderboard/global` | ❌ | 全球排行榜 |
| GET | `/api/leaderboard/faction/:faction` | ❌ | 阵营排行榜 |
| GET | `/api/leaderboard/season` | ❌ | 赛季排行榜 |
| GET | `/api/leaderboard/rank` | ✅ | 个人排名 |
| GET | `/api/leaderboard/stats` | ❌ | 排行榜统计 |
| GET | `/api/leaderboard/seasons` | ❌ | 赛季列表 |

**D. 战局历史** (battles.js)：

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/api/battles/history` | ✅ | 个人战局历史 |
| GET | `/api/battles/:battleId` | ✅ | 战局详情 |
| GET | `/api/battles/recent` | ❌ | 最近战局 |
| GET | `/api/battles/stats` | ✅ | 战局统计 |
| POST | `/api/battles/:battleId/complete` | ❌ | 标记战局完成 |

**⚠️ 功能重复注意**：online-battle 的 rooms 模块与 comm-service 的 rooms 路由功能高度重叠 (创建/加入/准备/开始)，但使用不同的数据库和认证中间件。

---

### 第3g层：数据库 — mecha-battle-db (5432)

| 属性 | 值 |
|------|-----|
| **镜像** | `postgres:14-alpine` (272MB) |
| **运行时长** | 2 个月 |
| **网络** | mecha-network (172.18.0.2) |
| **端口暴露** | 5432 → **公网可访问** |

**使用方分析**：

| 服务 | 数据库引擎 | 说明 |
|------|-----------|------|
| mecha-auth | **sql.js** (独立) | 用户认证数据自己管，不用 PG |
| mecha-hangar | **sql.js** (独立) | 单位数据自己管，不用 PG |
| mecha-map | **sql.js** (独立) | 地图数据自己管，不用 PG |
| mecha-combat | **PostgreSQL** (优先) | **唯一使用 PG 的服务**，战斗状态持久化 |
| mecha-comm | **内存 Map** | 无持久化，房间状态进程内 |
| mecha-online-battle | **better-sqlite3** (独立) | 自己的 SQLite 文件 |

**结论**：PostgreSQL 仅被 combat-service 使用。其余 4 个有状态服务各自使用独立的 SQLite 数据库文件。这是一种 **联邦式数据库架构**——每个服务有自己的数据存储。

---

## 三、功能重复分析（按严重程度排序）

### 🔴 高危：房间管理双重实现

| 功能 | comm-service (3005) | online-battle-service (3006) |
|------|---------------------|------------------------------|
| 创建房间 | `POST /api/comm/rooms` | `POST /api/rooms` |
| 加入房间 | `POST /api/comm/rooms/:id/join` | `POST /api/rooms/:id/join` |
| 准备 | `POST /api/comm/rooms/:id/ready` | `POST /api/rooms/:id/ready` |
| 开始游戏 | `POST /api/comm/rooms/:id/start` | `POST /api/rooms/:id/start` |
| 存储 | 内存 Map (重启丢失) | better-sqlite3 (持久化) |
| 特殊功能 | AI玩家、跨服务调用combat | 聊天系统、排行榜、匹配队列 |

**影响**：两套房间系统可能存在数据不一致。Nginx 中 `/api/comm/rooms` 和 `/api/rooms` 都会转发的不同的服务。

### 🟡 中危：双 Nginx 层串联

```
nginx-ssl (80/443) → mecha-frontend (8081) → 后端服务
```

- nginx-ssl 只做 SSL 终止 + 域名重定向，无安全头
- mecha-frontend 做应用路由 + 安全头 + API 代理
- 增加一层网络跳转延迟
- 安全头只在 8081 返回，80/443 没有

### 🟡 中危：后端端口全暴露

```
0.0.0.0:3001 → mecha-auth        (可直连绕过认证检查)
0.0.0.0:3002 → mecha-hangar      
0.0.0.0:3003 → mecha-map         
0.0.0.0:3004 → mecha-combat      
0.0.0.0:3005 → mecha-comm        
0.0.0.0:3006 → mecha-online-battle
0.0.0.0:5432 → PostgreSQL         (数据库端口公网暴露！)
```

所有 6 个后端端口和数据库端口都做了宿主机端口映射，**可以从公网直接访问**，绕过 Nginx 安全头和限流。

### 🟢 低危：运行时不一致

`mecha-online-battle` 已运行 2 天，其余服务约 1 小时前重启。可能缺少最新代码更新。

---

## 四、Phase 29-H 修改位置汇总

| # | 修改文件 | 所在容器 | 具体内容 |
|---|---------|---------|---------|
| 1 | `frontend/nginx.conf` | **mecha-frontend** /etc/nginx/conf.d/ | 注入 5 个安全头: CSP, HSTS, Referrer-Policy, X-Content-Type-Options, X-Frame-Options (全部带 always) |
| 2 | `frontend/src/views/NewUnitEditorView.vue` | **mecha-frontend** /usr/share/nginx/html/ | ~53 个表单节点补充 `id`/`name`/`for` 属性 (单位编辑器) |
| 3 | `frontend/src/views/GlossaryView.vue` | **mecha-frontend** /usr/share/nginx/html/ | ~35 个表单节点补充 `id`/`name`/`for` 属性 (词条/技能编辑器) 📋 含动态 `:id="skill-${key}-..."` 绑定 |
| 4 | `frontend/src/views/NewBattleView.vue` | **mecha-frontend** /usr/share/nginx/html/ | 合并 `loadGlossaryConfigForDice()` → `loadGlossaryConfig()`，消除重复 `/api/combat/glossary-config` 请求 |

> ⚠️ **登录页面 `NewLoginView.vue` 未被修改**。你的登录功能本身没有变化。

---

## 五、镜像体积一览

| 镜像 | 大小 |
|------|------|
| original-project-online-battle-service | 442 MB (最大) |
| original-project-hangar-service | 192 MB |
| original-project-map-service | 192 MB |
| original-project-auth-service | 168 MB |
| original-project-combat-service | 168 MB |
| original-project-comm-service | 147 MB |
| original-project-frontend | 69 MB |
| nginx:stable-alpine | 62 MB |
| postgres:14-alpine | 272 MB |

---

## 六、建议操作清单

| 优先级 | 操作 | 理由 |
|--------|------|------|
| 🔴 P0 | 后端端口 3001-3006 + 5432 取消 `0.0.0.0` 映射，仅暴露 8081 (和可选 443) | 安全收敛，防止绕过 Nginx 直连 |
| 🟡 P1 | 审计 comm-service 和 online-battle-service 的房间系统，决定合并或分工 | 消除功能重复和数据不一致风险 |
| 🟡 P1 | 评估是否可以下线 nginx-ssl，将 SSL 证书移至 mecha-frontend | 减少一层转发，SSL 证书与管理接口统一 |
| 🟢 P2 | 统一重启 mecha-online-battle，保持所有容器代码版本一致 | 避免新旧代码混跑 |
| 🟢 P2 | online-battle 镜像 442MB 过大，检查是否包含不必要的依赖 | 优化部署速度和存储 |

---

> **报告生成时间**: 2026-06-22 21:49  
> **数据来源**: 服务器实时 docker ps / docker exec / docker inspect / docker network inspect  
> **下次审计**: 建议在 Phase 30 部署后进行
