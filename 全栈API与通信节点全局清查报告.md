# 全栈 API 与通信节点全局清查报告

> 项目：Weird Nova / Mecha Universe Engine
> 范围：`frontend/src`（Vue3 消费方） × `backend-gateway/src`（Node/Express/WebSocket 提供方）
> 清查日期：2026-08-02
> 角色：首席系统架构师 · 接口层地毯式对账

---

## 一、全景资产总览表（服役中接口）

> 说明：以下接口经前后端双向对账确认「前端有调用 ↔ 后端有实现」，属健康服役资产。URL 已按 `/api` 前缀归一化（前端 `apiClient` baseURL=`/api`，故封装层内部 URL 不带前缀，对外即 `/api/...`）。

### 1. 认证与用户（auth / user / admin）
| 方法 | 路径 | 前端封装 / 调用方 | 功能 | 鉴权 |
|---|---|---|---|---|
| POST | `/api/auth/login` | `userAPI.login` → LoginView | 账号密码登录，签发 JWT | 否 |
| POST | `/api/auth/register` | `userAPI.register` → RegisterView | 注册账号 | 否 |
| GET | `/api/auth/me` | `userAPI.getMe` → 全局 main.js / 各页 | 返回当前用户（id/username/role/faction 等），覆盖本地占位 | 是 |
| PUT | `/api/auth/profile` | `userAPI.updateProfile` → UserCenter | 修改 username/email/faction | 是 |
| POST | `/api/auth/change-password` | `userAPI.changePassword` → UserCenter | 改密（验旧 + ≥6 位） | 是 |
| POST | `/api/auth/refresh` | `userAPI.refreshToken` | 刷新 token | 否 |
| GET | `/api/auth/check-username` | `userAPI.checkUsername` → RegisterView | 用户名可用性校验 | 否 |
| GET | `/api/users` | `userAPI.getUsers` → Admin/UserCenter | 用户列表（分页/搜索） | 是 |
| GET | `/api/users/:id` | `userAPI.getUser` | 单用户详情 | 是 |
| PUT | `/api/users/:id` | `userAPI.updateUser` | 更新用户资料 | 是(管理员) |
| DELETE | `/api/users/:id` | `userAPI.deleteUser` | 删除用户 | 是(管理员) |
| GET | `/api/admin/users` | `userAPI.getAdminUsers` → Admin | 管理后台用户列表 | 是(管理员) |
| PUT | `/api/admin/users/:id/role` | `userAPI.setAdminRole` → Admin | 改用户角色 | 是(管理员) |
| DELETE | `/api/admin/users/:id` | `userAPI.deleteAdminUser` → Admin | 后台删用户 | 是(管理员) |
| GET | `/api/admin/stats` | `userAPI.getAdminStats` → Admin | 后台统计 | 是(管理员) |
| PUT | `/api/admin/config` | `userAPI.setAdminConfig` → Admin | 写入 adjust_config | 是(管理员) |
| GET | `/api/admin/config` | `userAPI.getAdminConfig` → Admin | 读取 adjust_config | 是(管理员) |
| POST | `/api/admin/refresh-token` | `userAPI.adminRefreshToken` → Admin | 后台刷新凭证 | 是(管理员) |
| POST | `/api/admin/upload-image` | `userAPI.uploadImage` → Admin | 后台图床上传 | 是(管理员) |

### 2. 词条库 / 配置中枢（glossary）
| 方法 | 路径 | 前端封装 / 调用方 | 功能 | 鉴权 |
|---|---|---|---|---|
| GET | `/api/glossary` | `glossaryAPI.get` → 多页/NewBattleView | 拉取全量词条配置（含 size/dice 段、地形 material_url） | 否 |
| GET | `/api/glossary/export` | `glossaryAPI.export` → GlossaryEditor | 导出 JSON | 否 |
| GET | `/api/glossary/flat` | `glossaryAPI.getFlat` | 扁平化词条 | 否 |
| POST | `/api/glossary/import` | `glossaryAPI.import` → GlossaryEditor | 导入覆盖 | 是 |
| PUT | `/api/glossary` | `glossaryAPI.update` → GlossaryEditor | 全量更新 | 是 |
| POST | `/api/glossary/entry` | `glossaryAPI.addEntry` → GlossaryEditor | 新增词条 | 是 |
| PUT | `/api/glossary/entry` | `glossaryAPI.updateEntry` → GlossaryEditor | 改词条 | 是 |
| DELETE | `/api/glossary/entry` | `glossaryAPI.deleteEntry` → GlossaryEditor | 删词条 | 是 |
| GET | `/api/glossary/categories` | `glossaryAPI.getCategories` | 分类列表 | 否 |
| POST | `/api/glossary/upload-sprite` | `glossaryAPI.uploadSprite` → GlossaryEditor | 词条精灵图上传 | 是 |
| GET | `/api/glossary/sprite-url` | `glossaryAPI.getSpriteUrl` | 取精灵图 URL | 否 |
| GET | `/api/glossary/approve` | `glossaryAPI.getApprove` → GlossaryApproval | 审批列表 | 是 |
| PUT | `/api/glossary/approve/:id` | `glossaryAPI.approve` → GlossaryApproval | 通过词条 | 是(管理员) |
| DELETE | `/api/glossary/approve/:id` | `glossaryAPI.reject` → GlossaryApproval | 驳回词条 | 是(管理员) |
| GET | `/api/combat/dice-config` | `diceAPI.getDiceConfig` → DiceConfigView | 读全局骰子参数 | 否 |
| PUT | `/api/combat/dice-config` | `diceAPI.setDiceConfig` → DiceConfigView | 热更骰子参数 | 是 |
| GET | `/api/combat/size-config` | `sizeAPI.getSizeConfig` → SizeConfigView | 读体型工坊配置 | 否 |
| PUT | `/api/combat/size-config` | `sizeAPI.setSizeConfig` → SizeConfigView | 热更体型配置 | 是 |

### 3. 地图 / 单位 / 地形（maps / units / terrain / terrainCosts）
| 方法 | 路径 | 前端封装 / 调用方 | 功能 | 鉴权 |
|---|---|---|---|---|
| GET | `/api/maps/battlefields` | `mapAPI.getMapList` → NewBattleView/Selector | 战场地图列表 | 否 |
| GET | `/api/maps/:id/battlefield` | `mapAPI.getBattlefield` → 编辑/战场 | 单地图六角格数据 | 否 |
| GET | `/api/maps/:id/metadata` | `mapAPI.getMapMetadata` | 地图元数据 | 否 |
| POST | `/api/maps` | `mapAPI.createMap` → MapEditor | 创建地图 | 是 |
| PUT | `/api/maps/:id` | `mapAPI.updateMap` → MapEditor | 改地图 | 是 |
| DELETE | `/api/maps/:id` | `mapAPI.deleteMap` → MapEditor | 删地图 | 是 |
| GET | `/api/units` | `unitAPI.getUnits` → 多页 | 单位库列表（分页/筛选） | 否 |
| GET | `/api/units/:id` | `unitAPI.getUnit` | 单单位详情 | 否 |
| POST | `/api/units` | `unitAPI.createUnit` → UnitEditor | 创单位 | 是 |
| PUT | `/api/units/:id` | `unitAPI.updateUnit` → UnitEditor | 改单位 | 是 |
| DELETE | `/api/units/:id` | `unitAPI.deleteUnit` → UnitEditor | 删单位 | 是 |
| POST | `/api/units/import` | `unitAPI.importUnits` | 批量导入 | 是 |
| GET | `/api/units/my` | `unitAPI.getMyUnits` → UserCenter | 我的单位 | 是 |
| GET | `/api/terrain` | `terrainAPI.getTerrain` → 战场/编辑器 | 地形定义列表 | 否 |
| POST | `/api/terrain` | `terrainAPI.createTerrain` → TerrainEditor | 新建地形 | 是 |
| PUT | `/api/terrain/:key` | `terrainAPI.updateTerrain` → TerrainEditor | 改地形 | 是 |
| POST | `/api/terrain/:key/sprite` | `terrainAPI.uploadSprite` → TerrainEditor | 地形精灵图 | 是 |
| GET | `/api/terrainCosts` | `terrainCostAPI.getTerrainCosts` → 战场 | 地形移动/防御消耗配置 | 否 |
| PUT | `/api/terrainCosts` | `terrainCostAPI.updateTerrainCosts` → TerrainCostEdit | 改地形消耗 | 是(管理员) |
| POST | `/api/terrainCosts/save` | `terrainCostAPI.saveTerrainCosts` → TerrainCostEdit | 保存地形消耗 | 是(管理员) |

### 4. 战斗（combat）★系统核心
| 方法 | 路径 | 前端封装 / 调用方 | 功能 | 鉴权 |
|---|---|---|---|---|
| POST | `/api/combat` | `combatAPI.createBattle` → NewBattleView | 凭 `battlefield_id` 建局 | 是 |
| GET | `/api/combat/:id` | `combatAPI.getBattleState` → NewBattleView | 拉取战局状态 | 是 |
| POST | `/api/combat/:battleId/initialize` | `combatAPI.initialize` → NewBattleView | 初始化单位/阵营/轮转 | 是 |
| POST | `/api/combat/:battleId/action-points/consume` | `combatAPI.consumeActionPoint` → NewBattleView | 强制消耗行动点 | 是 |
| GET | `/api/combat/:battleId/action-points/:unitId` | `combatAPI.getActionPoints` → NewBattleView | 查行动点 | 是 |
| POST | `/api/combat/:battleId/move` | `combatAPI.move` → NewBattleView | Dijkstra 地形加权移动 | 是 |
| POST | `/api/combat/:battleId/attack` | `combatAPI.attack` → NewBattleView | 内联攻击（executeUniversalSkill） | 是 |
| POST | `/api/combat/:battleId/skill` | `combatAPI.skill` → NewBattleView | 词条技能结算 | 是 |
| POST | `/api/combat/:battleId/end-turn` | `combatAPI.endTurn` → NewBattleView | 结束回合（新轮重置 AP） | 是 |
| POST | `/api/combat/:battleId/deploy-unit` | `combatAPI.deployUnit` → NewBattleView | 部署单位（期望 `unit_id`） | 是 |
| POST | `/api/combat/:battleId/end-deployment` | `combatAPI.endDeployment` → NewBattleView | 结束部署阶段 | 是 |
| POST | `/api/combat/:battleId/pending-units` | `combatAPI.setPendingUnits` → NewBattleView | 写入部署池（期望 `{units:[...]}`） | 是 |
| GET | `/api/combat/:battleId/deploy-pool` | `combatAPI.getDeployPool` → NewBattleView | 读部署池 | 是 |
| POST | `/api/combat/:battleId/victory-conditions` | `combatAPI.setVictoryConditions` → NewBattleView | 写胜利条件 | 是 |
| GET | `/api/combat/:battleId/victory-conditions` | `combatAPI.getVictoryConditions` → NewBattleView | 读胜利条件 | 是 |
| POST | `/api/combat/:battleId/ace-unit` | `combatAPI.setAceUnit` → NewBattleView | 绑 ACE 机体（期望 `unit_id`） | 是 |
| GET | `/api/combat/:battleId/ace-unit` | `combatAPI.getAceUnit` → NewBattleView | 读 ACE | 是 |
| POST | `/api/combat/:battleId/damage` | `combatAPI.applyDamage` → NewBattleView | 直传单位对象结算伤害 | 是 |
| POST | `/api/combat/:battleId/duel-check` | `combatAPI.duelCheck` → NewBattleView | 抢攻判定请求 | 是 |
| POST | `/api/combat/:battleId/resolve-duel` | `combatAPI.resolveDuel` → NewBattleView | 抢攻结算 | 是 |
| POST | `/api/combat/:battleId/resolve-snatch` | `combatAPI.resolveSnatch` → NewBattleView | 夺还结算 | 是 |
| POST | `/api/combat/:battleId/resolve-cover` | `combatAPI.resolveCover` → NewBattleView | 掩护结算 | 是 |
| POST | `/api/combat/:battleId/fog-system` | `combatAPI.fogSystem` → NewBattleView | 战争迷雾 | 是 |
| POST | `/api/combat/:battleId/support` | `combatAPI.support` → NewBattleView | 支援 | 是 |
| POST | `/api/combat/:battleId/conceal` | `combatAPI.conceal` → NewBattleView | 隐匿 | 是 |
| POST | `/api/combat/:battleId/jump-to` | `combatAPI.jumpTo` → NewBattleView | 跳跃 | 是 |
| POST | `/api/combat/:battleId/surprise-choice` | `combatAPI.surpriseChoice` → NewBattleView | 奇袭选择 | 是 |
| POST | `/api/combat/:battleId/set-pending-units` | `combatAPI.setPendingUnits`（别名路由） | 同上部署池写入 | 是 |
| GET | `/api/combat/:battleId/faction-cooldowns` | `combatAPI.getFactionCooldowns` → NewBattleView | 阵营冷却 | 是 |
| GET | `/api/combat/:battleId/trigger-reactor` | `combatAPI.triggerReactor` → NewBattleView | 反应触发 | 是 |
| POST | `/api/combat/:battleId/save` | `combatAPI.saveBattle` → NewBattleView | 持久化战局 | 是 |
| GET | `/api/combat/:battleId/load` | `combatAPI.loadBattle` → NewBattleView | 载入战局 | 是 |
| POST | `/api/combat/:battleId/delete` | `combatAPI.deleteBattle` → NewBattleView | 删战局 | 是 |
| GET | `/api/combat/:battleId/debug-state` | `combatAPI.getDebugState` → NewBattleView | 调试态 | 是 |

### 5. 房间 / 备战（rooms）★WebSocket 实时名册
| 方法 | 路径 | 前端封装 / 调用方 | 功能 | 鉴权 |
|---|---|---|---|---|
| GET | `/api/rooms` | `onlineBattleAPI.getRooms` → NewBattlefieldSelector | 房间列表 | 否 |
| POST | `/api/rooms` | `onlineBattleAPI.createRoom` → Selector | 建房 | 是 |
| GET | `/api/rooms/:roomId` | `onlineBattleAPI.getRoom` → Selector/PrepRoom | 房间详情 | 否 |
| GET | `/api/rooms/code/:code` | `onlineBattleAPI.getRoomByCode` → Selector | 房间码查询 | 否 |
| POST | `/api/rooms/:roomId/join` | `onlineBattleAPI.joinRoom` → Selector | 加入房间 | 是 |
| POST | `/api/rooms/:roomId/leave` | `onlineBattleAPI.leaveRoom` → PrepRoom | 离开房间 | 是 |
| DELETE | `/api/rooms/:roomId` | `onlineBattleAPI.deleteRoom` → Selector/PrepRoom | 删房 | 是(房主) |
| PUT | `/api/rooms/:roomId/settings` | `onlineBattleAPI.updateSettings` → PrepRoom | 改房间设置（maxPlayers/victoryConditions 等） | 是 |
| POST | `/api/rooms/:roomId/players/:userId/units` | `onlineBattleAPI.setPlayerUnits` → PrepRoom | 设玩家单位 | 是 |
| POST | `/api/rooms/:roomId/players/:userId/faction` | `onlineBattleAPI.setPlayerFaction` → PrepRoom | 设玩家阵营 | 是 |
| POST | `/api/rooms/:roomId/lock-roster` | `onlineBattleAPI.lockRoster` → PrepRoom | 锁定名单 | 是(房主) |
| POST | `/api/rooms/:roomId/start` | `onlineBattleAPI.startBattle` → PrepRoom | 开战（仅房主） | 是(房主) |
| GET | `/api/rooms/:roomId/chat` | `onlineBattleAPI.getChatHistory` → PrepRoom | 聊天历史 | 否 |
| POST | `/api/rooms/:roomId/chat` | `onlineBattleAPI.sendChat` → PrepRoom | 发聊天 | 是 |

### 6. 资产生成 / 图床（assetGen）
| 方法 | 路径 | 前端封装 / 调用方 | 功能 | 鉴权 |
|---|---|---|---|---|
| POST | `/api/asset-gen/upload` | `assetAPI.uploadImage` → 多编辑器 | 通用图床上传 | 是 |
| POST | `/api/asset-gen/generate` | `assetAPI.generateAsset` | AI 资产生成 | 是 |

> **WebSocket 节点**：经审计，网关 `backend-gateway` **自身不持有 Socket.IO 服务端**。WebSocket 实时层由独立 `mecha-comm`（3005）容器承载。网关仅在房间写操作后通过内部 HTTP `POST /internal/room-update`（携带 `x-internal-token: mecha-internal-sync`）推送给 comm，由 comm 向 `prep-<roomId>` 房间广播 `room-update` 事件。前端 `NewPreparationRoom.vue` 订阅的 socket 事件实际来自 comm（非网关），属跨服务边界，不在本仓库网关代码内，故未列入本表。

---

## 二、异常诊断清单

### A. 幽灵调用（Ghost Calls）——前端调用，后端无实现

| # | 前端 API 封装 / 调用方 | 目标 URL | 后端现状 | 定位 | 严重度 |
|---|---|---|---|---|---|
| G1 | `onlineBattleAPI.joinQueue` / `leaveQueue` / `getQueueStatus` | `/api/matchmaking/*` | **后端完全无 matchmaking 路由**（0 匹配） | `frontend/src/api/client.js` 定义，未被任何 .vue 调用 | 中（死代码，误导） |
| G2 | `onlineBattleAPI.getGlobalLeaderboard` / `getFactionLeaderboard` | `/api/leaderboard/*` | **后端无 leaderboard 路由** | `client.js` 定义，无调用方 | 中 |
| G3 | `onlineBattleAPI.getBattleHistory` / `getBattleResults` | `/api/battles/history`、`/api/battles/:id/results` | **后端无 battles 路由** | `client.js` 定义，无调用方 | 中 |
| G4 | `onlineBattleAPI.sendChat`/`getChat` 的 **comm 变体** | `/api/comm/rooms/:id/messages`、`/api/comm/rooms/:id/chat` | **后端无 `/comm/rooms` 路由**（正确路径是 `/api/rooms/:roomId/chat`） | `client.js`（与 G5 同源） | 高（URL 路径完全错位） |
| G5 | `commAPI.sendMessage` / `getWatchBufferStatus` | `/api/comm/rooms/:id/messages`、`/api/comm/rooms/:id/watch-buffer` | **后端无 comm 路由** | `client.js` 定义，无调用方 | 高 |
| G6 | `combatAPI.joinBattle` | `/api/combat/:battleId/join` | **后端无此路由**（房间加入走 `/api/rooms/:roomId/join`，二者语义混淆） | `client.js` 定义，无调用方 | 低 |

> **诊断结论**：G1–G3、G5–G6 均为 `client.js` 中定义但**前端页面从未调用**的"悬挂 API"，属历史功能（排位赛/排行榜/观战缓冲）残留，应整体删除。G4 的 comm 聊天变体虽也未被调用，但 URL 设计错误（误用 `/comm/rooms` 前缀），一旦被误启用将 404。

#### 🔎 A 节根因归因（反查资料库）

| # | 根因类型 | 判定依据（资料库证据） |
|---|---|---|
| G1–G3 | **功能预设 / 技术迭代（废弃微服务残留）** | `backup0729/services/online-battle-service/README.md` 与 `routes/{matchmaking,leaderboard,battles}.js` 证实曾存在独立微服务（端口 3006），提供 matchmaking/leaderboard/battles 全套路由；`历史报告/Phase28_全链路审计与项目节点汇总报告.md` §4.1 明确记录"online-battle-service 前端无代理、client.js 无封装"，属**规划但未接入前端**的功能预设；当前生产架构已将该服务废弃（网关仅保留 `/api/rooms`，chat 走 `/api/rooms/:roomId/chat`），前端封装成为**架构重构后的僵尸残留**。 |
| G4 | **技术迭代 + 认知偏差** | `mecha-comm`（3005）为独立通信容器（见 `backup0729/services/comm-service/` 及 Phase28 服务拓扑），但房间聊天实际由网关 `routes/rooms.ts` 以 `/api/rooms/:roomId/chat` 承载，并非 `/comm/rooms`。前端错用 `/comm/rooms` 前缀是**对 comm 容器命名的位置误判**叠加废弃微服务路径习惯。 |
| G5 | **功能预设（观战缓冲预设，从未落地）** | `commAPI.sendMessage`/`getWatchBufferStatus` 对应的"观战缓冲 / comm 直连"能力在 `online-battle-service/README.md` 的 WebSocket 设计中有雏形，但网关从未实现 `/api/comm/*` 路由——属**预想能力，未进入实现阶段**。 |
| G6 | **编程错误 / 语义混淆** | `combatAPI.joinBattle` 误将"加入房间"当作战斗接口，而真实加入入口是 `POST /api/rooms/:roomId/join`（房间系统）。属接口语义混淆的**编程错误**（非架构演进），且同文件已正确存在 `onlineBattleAPI.joinRoom`，纯属冗余误封装。 |

### B. 孤儿接口（Orphan APIs）——后端提供，前端无调用

| # | 后端路由 | 定位 | 说明 | 建议 |
|---|---|---|---|---|
| O1 | `GET /api/glossary/flat` | `routes/glossary.ts` | 前端无调用 | 评估是否内部工具，否则删 |
| O2 | `GET /api/glossary/categories` | `routes/glossary.ts` | 前端无直接调用 | 同上 |
| O3 | `POST /api/glossary/entry` / `PUT` / `DELETE` | `routes/glossary.ts` | NewBattleView 中"一次局部更新"可能绕过，需二次确认是否经 `glossaryAPI` 走 | 保留（编辑器核心） |
| O4 | `GET /api/combat/:battleId/debug-state` | `routes/combat.ts` | 仅调试用 | 加 NODE_ENV 门控 |
| O5 | `GET /api/maps/:id/metadata` | `routes/maps.ts` | 前端多取 `battlefield` 全量，metadata 单独接口未用 | 合并或删 |
| O6 | `POST /api/combat/:battleId/set-pending-units` | `routes/combat.ts` | 与 `POST /api/combat/:battleId/pending-units` 功能重复（别名路由） | 删冗余别名 |
| O7 | `POST /api/glossary/upload-sprite` / `GET sprite-url` | `routes/glossary.ts` | 精灵图走 `asset-gen/upload`，词条 sprite 接口疑似双通道 | 统一通道 |
| O8 | `POST /api/admin/upload-image` 与 `POST /api/asset-gen/upload` | 跨文件 | 两个上传入口并存 | 二选一 |

> **说明**：部分"孤儿"因前端可能经统一 `glossaryAPI` 封装间接调用，已标记为"需二次确认"。真正可清理的是 O4（调试态）、O6（别名路由）。

#### 🔎 B 节根因归因（反查资料库）

| # | 根因类型 | 判定依据（资料库证据） |
|---|---|---|
| O1–O2 | **功能预设（规划工具接口未接）** | `glossary/flat`、`/categories` 在 `client.js` 无封装与调用，属词条编辑器早期规划的辅助工具接口（扁平化/分类树），前端走 `GET /api/glossary` 全量即可满足，两端**预设与实现错位**导致孤儿。 |
| O3 | **编程边界（待二次确认）** | `glossary/entry` 的 POST/PUT/DELETE 在 GlossaryEditor 经 `glossaryAPI` 调用，但 NewBattleView 的"一次局部更新"可能绕过 entry 直走 `PUT /api/glossary`。属**封装边界不清**的潜在编程问题，非架构演进。 |
| O4 | **功能预设（调试接口）** | `debug-state` 仅服务于开发期调试，前端无生产调用，属**预设的调试后门**，应加 `NODE_ENV` 门控而非删除。 |
| O5 | **功能预设 / 冗余** | `maps/:id/metadata` 返回的元数据已包含在 `maps/:id/battlefield` 全量响应中（见 `routes/maps.ts`），前端统一取 battlefield，metadata 接口属**早期拆分粒度的冗余预设**。 |
| O6 | **编程错误（冗余别名路由）** | `set-pending-units` 与 `pending-units` 在 `routes/combat.ts` 功能完全重复，属重构时**遗留的别名路由**，纯编程疏漏。 |
| O7 | **技术迭代（双通道未清理）** | `glossary/upload-sprite` 与 `asset-gen/upload` 并存；`asset-gen` 统一图床是后期技术迭代产物，词条精灵图通道**未随迭代收敛**，形成双上传入口。 |
| O8 | **技术迭代（双图床并存）** | `admin/upload-image` 与 `asset-gen/upload` 同理，后台图床与通用图床**两套入口并存**，迭代中未做二选一合并。 |

### C. 货不对板（Misaligned Payloads）——参数结构 / 命名分歧 ⚠️

#### C1 【高亮】同一路由多处调用、参数名分歧：`combatAPI.createBattle`
- 后端预期（`routes/combat.ts:477`）：`req.body.battlefield_id`（必填）、可选 `factionTurnOrder`、`factionRoles`。
- 调用点：
  - `NewBattleView.vue:3859` `combatAPI.createBattle({ battlefield_id: fallbackMapId })` ✅ 正确。
  - 但 `client.js` 封装层 `createBattle(data)` 直接透传；若其它页面（如 Room 开战）传入 `{ mapId }` 或 `{ id }` 而非 `battlefield_id`，后端会因缺 `battlefield_id` 返回 400。**约束：全栈必须统一用 `battlefield_id`**。

#### C2 【高亮】`deploy-unit` 的 unit 标识命名：后端 `unit_id` vs 前端传参
- 后端（`routes/combat.ts:2279`）：`{ unit_id, q, r, unit_data }`，校验 `unit_id`。
- 前端封装 `combatAPI.deployUnit(battleId, { unit_id, q, r })` ✅ **一致**（封装层已正确用 snake_case）。
- ⚠️ **风险点**：战斗内其它接口（如 `action-points/consume`、`/skill` 的 `casterUnitId`）均用 camelCase `unitId`；唯独 `deploy-unit` 与 `ace-unit`、`pending-units` 的单元标识用 `unit_id`。**同一语义（单位 ID）在系统内有两套命名 convention**，极易在新增接口时写错。建议后端统一 camelCase 或在网关层做一次性归一化适配。

#### C3 `pending-units` 载荷结构
- 后端（`routes/combat.ts:745`）：`req.body.units`（数组）。
- 前端 `combatAPI.setPendingUnits(battleId, { units: [...] })` ✅ 一致。但数组元素内部字段（id / matrixId / ownerId）与 `initialize` 期望的 `unitId/matrixId/ownerId` 混用——`deploy-unit` 用 `String(u.id)` 匹配 pending 池，而 `initialize` 用 `u.unitId`，**pending 池元素字段约定未对齐**，存在部署时"不在部署池"回退风险（见 `routes/combat.ts:2296`）。

#### C4 WebSocket 跨服务语义错位（架构级货不对板）
- 前端 `NewPreparationRoom.vue` 监听 `room-update` 事件，期望 payload 含房间全量状态。
- 该事件由 `mecha-comm` 广播，网关通过 `POST /internal/room-update`（`x-internal-token: mecha-internal-sync`）触发。
- ⚠️ **契约风险**：网关 `pushRoomUpdate` 构造的 payload 结构与 comm 广播结构、前端消费结构三者无共享类型定义（仓库内仅网关侧可见）。任一端改字段名将静默失效。建议抽取跨服务 `RoomUpdate` 契约。

#### C5 `onlineBattleAPI.updateSettings` 载荷歧义
- 后端 `PUT /api/rooms/:roomId/settings` 接受任意 `req.body` 透写 `settings` 字段（maxPlayers / victoryConditions / isPrivate 等）。
- 前端多处调用传参结构不统一：
  - `NewPreparationRoom.vue:311` `{ maxPlayers, victoryConditions, isPrivate }`
  - `:512` `{ maxPlayers: Number(...) }`
  - `:542` `{ victoryConditions: JSON.parse(...) }`
  - `:587` `{ isPrivate: ... }`
  - ⚠️ 无统一 settings schema，后端为开放透写，**缺字段校验**，存在脏数据入库风险。

#### 🔎 C 节根因归因（反查资料库）

| # | 根因类型 | 判定依据（资料库证据） |
|---|---|---|
| C1 | **编程错误风险（封装透传无校验）** | `client.js` 的 `createBattle(data)` 直接透传，无任何字段白名单/重命名；后端 `routes/combat.ts:477` 强依赖 `battlefield_id`。若 Room 开战页传入 `{mapId}` 即 400。属**封装层缺防御性适配**的编程短板（非架构演进）。 |
| C2 | **技术迭代 / 规范未落地** | `历史报告/docs/ID 规范标准_v1.0.md`（2026-04-21，状态：草案待审核）第 386 行明确规定 `Combat → Hangar` 引用使用 `battle_units.unit_id`（snake_case，源自 DB 列名）；而战斗主链路 `unitId` 是后期 TypeScript 重构引入的驼峰风格。规范本身是**草案未强制落地**，两套命名各有"合理出处"，形成双命名 convention——属**规范演进未收敛的技术债**，非单纯笔误。 |
| C3 | **技术迭代 / 规范未落地（C2 的衍生）** | `pending-units` 数组元素字段（`id`/`matrixId`/`ownerId`）与 `initialize` 期望的（`unitId`/`matrixId`/`ownerId`）分歧，根源同 C2：pending 池沿用 snake_case `id`，initialize 用 camelCase `unitId`，且 `deploy-unit` 用 `String(u.id)` 匹配。属**同一规范未落地问题的链式衍生**。 |
| C4 | **架构级技术迭代（跨服务缺共享契约）** | `mecha-comm`（3005）为独立容器（见 `backup0729/services/comm-service/`），网关经 `POST /internal/room-update`（`x-internal-token`）触发其向 `prep-<id>` 广播 `room-update`；`历史报告/Phase28_全链路审计与项目节点汇总报告.md` §4.2 已记录 "comm-service 与 online-battle-service WebSocket 协议重复、房间状态不共享"。三者（网关 payload / comm 广播 / 前端监听）**无共享 TypeScript 契约**，是微服务拆分技术迭代中**契约治理缺位**的架构级隐患。 |
| C5 | **编程错误（缺 schema 校验）** | `routes/rooms.ts` 的 `PUT /settings` 为 `req.body` 直写 `settings` 列，无字段白名单/类型校验；前端四处调用结构各异（maxPlayers / victoryConditions / isPrivate 分别传入）。属**后端开放透写**的编程欠严谨，恶意/错误载荷可污染 `rooms` 表。 |

---

## 三、架构健康度自然语言评估

### 总体健康度：**B-（可用但有显著技术债，接口层处于"半契约化"状态）**

经全量扫描，系统目前 **97 个后端 HTTP 路由 + 约 60 个前端 API 封装 + 1 条跨服务 WebSocket 实时链路**在役。核心战斗链路（`/api/combat/*`）前后端字段映射**整体对齐良好**——`move/attack/skill/end-turn/deploy-unit/pending-units` 等高频接口经多轮重构已校正，后端甚至对 `/skill` 做了 `attacker_id`/`target_id` 兼容兜底（见 `routes/combat.ts:1228`），说明团队已意识到历史命名混乱并做了防御。

### 主要隐患

1. **双命名 convention（最危险的隐性债）**：单位标识在系统内同时存在 `unitId`（camelCase，战斗主链路）与 `unit_id`（snake_case，deploy-unit / ace-unit / pending-units）。这不是单纯风格问题——`deploy-unit` 用 `String(u.id)` 匹配 pending 池，而 `initialize` 用 `u.unitId`，**一旦新增接口混淆两者，会在运行时静默回退或 404**，且不会在前端编译期暴露。这是本次清查最该优先治理的点。

2. **悬挂 API 与重复路由的"僵尸层"**：`client.js` 中存在整组未被任何页面调用的"幽灵 API"（matchmaking / leaderboard / battles / comm 聊天变体 / joinBattle），它们伪装成"可用能力"，实则后端根本无实现（G1–G6）。另有 `set-pending-units` 与 `pending-units` 别名重复（O6）、`upload-image` 双图床入口（O8）。这些不会崩溃系统，但严重干扰新人的接口认知，属于典型"看起来能用、点了 404"的陷阱。

3. **聊天/房间实时链路跨服务但无共享契约**：房间实时名册依赖网关→comm 的内部 HTTP + comm→前端的 WebSocket，三者（网关 payload / comm 广播 / 前端监听）**无共享 TypeScript 契约**。当前能跑，是因为三者靠人工口头约定字段名。这是**架构级货不对板风险点**（C4），一旦 comm 侧或前端任一方改 `room-update` 字段，问题只在运行时暴露。

4. **settings 开放透写缺校验**：房间设置 `PUT /settings` 为 `req.body` 直写，无 schema 校验（C5），恶意/错误载荷可污染 `rooms` 表 `settings` 列。

5. **弱 JWT 密钥**：记忆库已记录 `JWT_SECRET=mecha-universe-jwt-secret-change-in-production` 仍为默认弱密钥，属安全红线（虽非接口对账范畴，但审计必提）。

### 下一步具体行动建议（按优先级）

| 优先级 | 行动 | 范围 | 预期收益 |
|---|---|---|---|
| P0 | **统一单位 ID 命名**：后端 `deploy-unit`/`ace-unit`/`pending-units` 的 `unit_id` 改为 `unitId`，或在前端封装层做唯一转换出口，禁止业务页直传 snake_case | gateway `routes/combat.ts` + `client.js` 封装 | 消除静默回退/404 隐患 |
| P0 | **抽取跨服务 `RoomUpdate` 契约**（gateway→comm→前端共享 interface） | 新建 `shared/contracts/RoomUpdate.ts` | 实时链路强类型保障 |
| P1 | **删除幽灵 API**（G1–G6 共 6 组 client.js 封装）+ 删除别名路由 O6 | `client.js` / `routes/combat.ts` | 清掉"点了 404"陷阱 |
| P1 | **房间 settings 加 schema 校验**（白名单字段 + 类型校验） | `routes/rooms.ts` | 防脏数据 |
| P2 | 合并双图床入口（O8）、清理孤儿 O1/O2/O4/O5 | `routes/*` | 减冗余 |
| P2 | 更换强 JWT 密钥（择机随下次部署一并执行，会使全量 token 失效需重登） | 部署配置 | 安全红线闭环 |
| P3 | 引入 OpenAPI / 接口契约测试，将前后端对账自动化，避免债务复发 | CI | 长期可维护性 |

---

> 附：本次清查采用「网关真相源 vs 前端消费方」双向扫描 + URL 归一化（补 `/api` 前缀、展开 `${}` 变量、参数名归一）方法。WebSocket 实时层因 `mecha-comm` 不在本仓库内，仅审计到网关侧触发节点（`routes/rooms.ts` 的 `pushRoomUpdate` → `POST /internal/room-update`），comm 侧广播结构建议后续跨仓补充审计。
