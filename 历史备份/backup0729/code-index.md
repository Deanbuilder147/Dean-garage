# Mechaverse Unified Engine — 代码索引

> Phase 29-TrueFinal 大一统 Compose 网络强并线 (2026-06-25)

## 部署架构

```
docker compose up -d  (核心三件套)
├── postgres:5432      (持久层)
├── mecha-gateway:3006 (大一统网关: 认证/机库/地图/词条/房间/管理)
└── frontend:8081      (Nginx → 反代 /api/* → gateway:3006)
    └─ 网络: mecha-universe-engine_mecha-net (全容器同网格，杜绝 502)
```

> 最后更新: 2026-06-25 Phase 29-TrueFinal Compose 大并线

## 认证服务 (`/api/auth/*`)

| 端点 | 方法 | 认证 | 描述 |
|:---|:---|:---|:---|
| `/api/auth/register` | POST | 否 | 用户注册 |
| `/api/auth/login` | POST | 否 | 用户登录 |
| `/api/auth/profile` | GET | 是 | 获取当前用户信息 |
| `/api/auth/profile` | PUT | 是 | 更新用户信息 |

## 房间服务 (`/api/rooms/*`)

| 端点 | 方法 | 认证 | 描述 |
|:---|:---|:---|:---|
| `/api/rooms` | GET | 否 | 列出公开房间 |
| `/api/rooms` | POST | 是 | 创建房间 |
| `/api/rooms/:id` | GET | 否 | 获取房间详情 |
| `/api/rooms/:id/join` | POST | 是 | 加入房间 |
| `/api/rooms/:id/leave` | POST | 是 | 离开房间 |
| `/api/rooms/:id/start` | POST | 是 | 开始战斗 |

## 单位管理 (`/api/units/*`)

| 端点 | 方法 | 认证 | 描述 |
|:---|:---|:---|:---|
| `/api/units` | GET | 是 | 获取当前用户的单位列表 |
| `/api/units` | POST | 是 | 创建单位（普通保存） |
| `/api/units/:unitId` | PUT | 是 | 更新单位 |
| `/api/units/:unitId` | DELETE | 是 | 删除单位 |
| `/api/units/generate` | POST | 是 | AI 形象生成（前置积分扣减锁） |
| `/api/units/factions` | GET | 是 | 阵营静态字典 |
| `/api/units/parse-excel` | POST | 是 | **Phase 29-HR**: Excel 文件解析（multer 文件上传） |
| `/api/units/create-from-json` | POST | 是 | **Phase 29-HR**: 事务化批量导入归一化单位数据 |

## 战斗服务 (`/api/combat/*`) — Phase 29-Rescure 终极收官全线贯通

### ★ 战局创建与战前设置（自 3004 移植）

| 端点 | 方法 | 认证 | 描述 |
|:---|:---|:---|:---|
| `/api/combat` | POST | 是 | **战局发令枪** — 创建新战局，生成 UUID battleId |
| `/api/combat` | GET | 否 | 列出所有活跃战局 |
| `/api/combat/:battleId/victory-conditions` | POST | 是 | 绑定胜利条件（annihilate/assassinate/...）|
| `/api/combat/:battleId/victory-conditions` | **GET** | **是** | **★拉取胜利断言条件（29-Rescure 补齐）** |
| `/api/combat/:battleId/ace-unit` | POST | 是 | 绑定阵营 ACE 专属机体 |
| `/api/combat/:battleId/pending-units` | POST | 是 | 注入整备室待部署单位池 |
| `/api/combat/:battleId/deploy-pool` | **GET** | **是** | **★拉取待部署机甲池镜像（29-Rescure 补齐）** |
| `/api/combat/:battleId/faction-cooldowns` | **GET** | **是** | **★阵营战术CD字典（29-Rescure 补齐）** |
| `/api/combat/:battleId/faction-cooldowns/tick` | **POST** | **是** | **★回合结束时递减全阵营冷却（29-Rescure 补齐）** |

### 战斗状态与行动点

| 端点 | 方法 | 认证 | 描述 |
|:---|:---|:---|:---|
| `/api/combat/:battleId/state` | GET | 否 | 拉取完整战局状态快照 |
| `/api/combat/:battleId/initialize` | POST | 是 | 初始化战局沙盒（注入地图+单位）|
| `/api/combat/:battleId/action-points/consume` | POST | 是 | 消耗单位行动点 |
| `/api/combat/:battleId/action-points/:unitId` | GET | 否 | 查询单位行动点状态 |
| `/api/combat/:battleId/end-turn` | POST | 是 | 结束回合，重置所有行动点 |
| `/api/combat/:battleId/damage` | POST | 是 | 伤害计算管道 |

## Nginx 代理与安全头 (`frontend/nginx.conf`) — Phase 29-Rescure 全量下沉

### CSP 安全策略（17 个 location 全量显式注入）
- **根因修复**: `location /assets/` 原仅 `Cache-Control` → 断绝 server 级继承 → JS 文件无 CSP → Canvas 熔断
- **统一规则**: `script-src 'self' 'unsafe-inline' 'unsafe-eval'`（Vue 动态编译双豁免）
- **Nginx 法则**: `add_header` 不继承 — 每个 location 必须自给自足

### 路由代理表

| 前缀 | 代理目标 | CSP |
|:---|:---|:---|
| `/` (SPA) | try_files → index.html | ✅ |
| `/assets/` | 静态文件 + 长缓存 | ✅ **29-Rescure 补齐** |
| `/api/auth/` | mecha-gateway:3006 | ✅ |
| `/api/hangar/` | mecha-gateway:3006 | ✅ |
| `/api/map/` | mecha-gateway:3006 | ✅ |
| `/api/combat` | mecha-gateway:3006 | ✅ |
| `/api/combat-glossary/` | mecha-gateway:3006 | ✅ |
| `/api/comm/` | mecha-gateway:3006 | ✅ |
| `/api/matchmaking` | mecha-gateway:3006 | ✅ |
| `/api/rooms` | mecha-gateway:3006 | ✅ |
| `/api/leaderboard` | mecha-gateway:3006 | ✅ |
| `/api/battles` | mecha-gateway:3006 | ✅ |
| `/api/campaign/` | mecha-gateway:3006 | ✅ |
| `/api/units` | mecha-gateway:3006 | ✅ |
| `/api/admin/` | mecha-gateway:3006 | ✅ |
| `/socket.io/` | mecha-gateway:3006 | ✅ |

> 最后更新: 2026-06-29 Phase 29-Rescure CSP 拔钉 + Combat 16端点全线贯通

## 地图服务 (`/api/maps/*`)

| 端点 | 方法 | 认证 | 描述 |
|:---|:---|:---|:---|
| `/api/maps` | GET | 否 | 列出公开地图 |
| `/api/maps` | POST | 是 | 创建地图 |
| `/api/maps/:id` | GET | 否 | 获取地图详情 |

## 词条库 (`/api/combat-glossary/*`)

| 端点 | 方法 | 认证 | 描述 |
|:---|:---|:---|:---|
| `/api/combat-glossary` | GET | 是 | 列出词条 |
| `/api/combat-glossary` | POST | 是 | 创建词条 |

## 管理后台 (`/api/admin/*`)

| 端点 | 方法 | 认证 | 描述 |
|:---|:---|:---|:---|
| `/api/admin/users` | GET | admin+ | 列出所有用户 |
| `/api/admin/credits/gift` | POST | admin+ | 赠送积分 |

## 试玩战役

| 端点 | 方法 | 认证 | 描述 |
|:---|:---|:---|:---|
| `/api/campaign/trial` | GET | 否 | 试玩战役数据 |

## 观战缓冲

| 端点 | 方法 | 认证 | 描述 |
|:---|:---|:---|:---|
| `/api/comm/watch-buffer-status` | GET | 是 | 观战缓冲队列状态 |
| `/api/comm/watch-feed` | POST | 是 | 提交观战事件 |

---

> 最后更新: 2026-06-24 Phase 29-HangarRestoration
