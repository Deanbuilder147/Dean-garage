# 机甲战棋游戏 - 架构分析报告

**生成时间**: 2026-04-21
**分析范围**: comm-service、combat-service 及其与 auth、map、hangar 服务的集成
**问题状态**: 🔴 关键Bug持续数周未解决

---

## 一、项目架构概览

### 1.1 服务架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                         前端 (Vue3 + PixiJS)                         │
│                    端口: 80/8081 | PreparationRoom.vue              │
└─────────────────────────────────────────────────────────────────────┘
                                    │
            ┌───────────────────────┼───────────────────────┐
            ▼                       ▼                       ▼
    ┌───────────────┐       ┌───────────────┐       ┌───────────────┐
    │ auth-service  │       │ hangar-service│       │  map-service  │
    │   端口: 3001   │       │   端口: 3002   │       │   端口: 3003   │
    │  用户认证/JWT  │       │   棋子CRUD    │       │  战场地图管理  │
    └───────────────┘       └───────────────┘       └───────────────┘
                                    │                       │
                                    │                       │
                                    └───────────┬───────────┘
                                                ▼
                    ┌───────────────────────────────────────────────┐
                    │            comm-service 端口: 3005            │
                    │  ⚠️ 无数据库 | 内存Map存储 | 房间状态管理        │
                    └───────────────────────────────────────────────┘
                                                │
                                                ▼
                    ┌───────────────────────────────────────────────┐
                    │           combat-service 端口: 3004            │
                    │  ❌ TODO未完成 | 硬编码数据 | battleId格式冲突  │
                    └───────────────────────────────────────────────┘
```

### 1.2 端口配置规范

| 服务 | 端口 | API前缀 | 数据库 | 状态 |
|------|------|---------|--------|------|
| auth-service | 3001 | /api/auth | PostgreSQL | ✅ 正常 |
| hangar-service | 3002 | /api/hangar | PostgreSQL | ✅ 正常 |
| map-service | 3003 | /api/map | PostgreSQL | ✅ 正常 |
| combat-service | 3004 | /api/combat | PostgreSQL | ⚠️ TODO未完成 |
| comm-service | 3005 | /api/comm | **无** | ❌ 数据不持久化 |
| frontend | 8081 | - | - | ✅ 正常 |

---

## 二、服务间依赖分析

### 2.1 数据依赖矩阵

```
服务          依赖数据                    需调用服务              当前状态
─────────────────────────────────────────────────────────────────────────
auth          users表                    -                        ✅

hangar        users表                    auth (验证userId)        ✅
              units表 (棋子数据)          -                        ✅

map           users表                    auth (验证userId)        ✅
              battlefields表              -                        ✅

combat        battle_sessions表          map (获取battlefield)    ⚠️ TODO
              battle_units表              hangar (获取unit数据)    ⚠️ TODO
              battle_actions表            -                        ✅

comm          ❌ 无数据库                 auth (验证userId)        ⚠️ 无持久化
                                        map (获取battlefield)    ⚠️ 无调用
                                        hangar (获取unit数据)    ⚠️ 无调用
```

### 2.2 完整数据流转（有Bug版本）

```
用户操作                    数据流向                    问题
────────────────────────────────────────────────────────────────────
1. 创建房间
   └─> comm.createRoom()    生成 roomId="room-xxx"      ✅
                            生成 battleId="battle-xxx"  ❌ 字符串格式

2. 玩家加入
   └─> comm.joinRoom()      更新 players[] Map          ❌ 内存存储

3. 选择棋子
   └─> hangar.getUnits()    返回 units[]                ✅

4. 选择战场
   └─> map.getBattlefields() 返回 battlefields[]        ✅

5. 开始战斗
   └─> POST /api/comm/...   返回 battleId="battle-xxx"  ❌ 字符串

6. 跳转战场
   └─> GET /battle/battle-xxx
                            前端使用字符串battleId      ❌

7. 获取战场
   └─> GET /api/combat/xxx  查询 WHERE id="battle-xxx"  ❌ 整数主键
                            结果: 404 Not Found         导致500
```

---

## 三、数据库结构分析

### 3.1 combat-service 数据库 (battles.js)

```sql
-- battle_sessions 表
CREATE TABLE battle_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,    -- ⚠️ 整数自增
  battlefield_id INTEGER,
  room_id INTEGER,                          -- ⚠️ 与comm的roomId不匹配
  units_state TEXT NOT NULL,                -- JSON
  status TEXT DEFAULT 'active',
  phase TEXT DEFAULT 'deployment',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- battle_units 表
CREATE TABLE battle_units (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER REFERENCES battle_sessions(id),
  player_id INTEGER,
  unit_id INTEGER REFERENCES units(id),    -- ⚠️ 需关联hangar
  position_x INTEGER,
  position_y INTEGER,
  hp INTEGER,
  current_action_points INTEGER,
  status TEXT DEFAULT 'active'
);

-- battle_actions 表
CREATE TABLE battle_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER REFERENCES battle_sessions(id),
  unit_id INTEGER,
  action_type TEXT,
  target_x INTEGER,
  target_y INTEGER,
  result TEXT,
  turn_number INTEGER
);
```

### 3.2 hangar-service 数据库 (units表关键字段)

```sql
-- units 表
CREATE TABLE units (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,                -- 关联auth.users
  name TEXT,
  faction TEXT,                             -- earth | mars | ...
  main_type TEXT,                           -- 格斗 | 射击 | 支援

  -- 核心属性
  main_格斗 INTEGER DEFAULT 0,
  main_射击 INTEGER DEFAULT 0,
  main_结构 INTEGER DEFAULT 0,
  main_机动 INTEGER DEFAULT 0,

  -- 装备槽位 (示例)
  left_hand TEXT,                           -- 左手装备JSON
  right_hand TEXT,                          -- 右手装备JSON
  extra_1 TEXT,
  extra_2 TEXT,
  extra_3 TEXT
);
```

### 3.3 map-service 数据库 (battlefields表)

```sql
CREATE TABLE battlefields (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  width INTEGER DEFAULT 20,
  height INTEGER DEFAULT 30,
  terrain TEXT DEFAULT '{}',               -- JSON: { "0,0": "mothership" }
  type TEXT                                -- standard | siege | ...
);
```

### 3.4 ID格式冲突详解

| 服务 | ID类型 | 格式示例 | 存储位置 |
|------|--------|----------|----------|
| comm-service | roomId | `room-1745234567890-abc123` | 内存Map |
| comm-service | battleId | `battle-1745234567890-xyz789` | 内存Map |
| combat-service | session.id | `1, 2, 3...` | PostgreSQL AUTOINCREMENT |
| 前端路由 | battleId | `battle-xxx` | URL参数 |

**冲突后果**:
- comm返回 `battle-xxx` → 前端跳转 `/battle/battle-xxx` → combat查询 `WHERE id='battle-xxx'` → 类型不匹配 → 500错误

---

## 四、关键问题汇总

### 4.1 🔴 P0 - battleId格式冲突 (导致500错误)

**问题**: comm生成字符串battleId，combat使用整数主键

**影响**: 所有"开始战斗"操作返回500

**根因**: 开发过程中两条启动流程并存，未统一ID策略

---

### 4.2 🔴 P0 - comm-service无持久化

**当前实现**:
```javascript
// comm-service/roomManager.js
const roomStates = new Map();  // 内存存储

function createRoom() {
  const roomId = `room-${Date.now()}-${generateRandom()}`;
  roomStates.set(roomId, {
    players: new Map(),
    battleId: `battle-${Date.now()}-${generateRandom()}`,
    battlefieldId: null,
    status: 'waiting'
  });
  return roomId;
}
```

**影响**:
- 服务器重启 = 所有房间消失
- 多实例部署不可行
- 断线重连丢失状态

---

### 4.3 🟡 P1 - combat-service TODO未完成

**位置**: battles.js 第100-115行

**当前代码**:
```javascript
// ⚠️ 硬编码数据 - 未从其他服务获取
const battlefield = { id: battlefield_id, width: 10, height: 10, terrain: '{}' };
roomPlayers = [
  { user_id: req.user.userId, faction: 'earth', position: {x: 0, y: 0} },
  { user_id: 'player2', faction: 'mars', position: {x: 9, y: 0} }  // ❌ 假数据
];
```

**缺失功能**:
- ❌ 未从 map-service 获取真实战场数据
- ❌ 未从 hangar-service 获取玩家棋子数据
- ❌ 未验证玩家是否有权限使用所选棋子
- ❌ 未从 comm-service 获取房间状态

---

### 4.4 🟡 P1 - API URL错误

**位置**: BattlefieldView.vue 第1059行

**错误代码**:
```javascript
// ❌ 此路由不存在
await fetch('/api/combat/battles', { method: 'POST', ... });

// ✅ 应为
await fetch('/api/combat/', { method: 'POST', ... });
```

---

### 4.5 🟡 P1 - 字段命名不统一

| 位置 | userId格式 | ready状态 | roomId |
|------|------------|-----------|--------|
| comm-service | `userId` | `isReady` | `roomId` |
| 前端检查 | `user_id \|\| userId` | `is_ready \|\| isReady` | - |
| 数据库 | `user_id` | `is_ready` | - |
| API响应 | 混合使用 | 混合使用 | - |

---

### 4.6 🟢 P2 - 两条战斗启动流程并存

**流程A**: BattlefieldView → 直接创建战斗
- 绕过房间系统
- 使用自己生成的battleId

**流程B**: PreparationRoom → comm房间 → 开始战斗
- 使用房间系统
- comm生成battleId
- 最终调用combat-service

**问题**: 两套逻辑可能产生冲突，用户体验不一致

---

## 五、修复方案

### 5.1 方案A: 最小修复 (2-3小时)

适合场景: 快速止血，保持现有架构

**修复清单**:

1. **修复API URL**
   ```javascript
   // BattlefieldView.vue
   - await fetch('/api/combat/battles', ...)
   + await fetch('/api/combat/', { method: 'POST', ... })
   ```

2. **统一battleId生成策略**
   ```javascript
   // combat-service/battles.js - 让combat生成ID
   const battleId = `battle_${Date.now()}_${uuidv4().slice(0,8)}`;
   ```

3. **添加comm-service持久化** (JSON文件)
   ```javascript
   // 定时保存到 /data/rooms.json
   setInterval(() => saveRoomsToFile(), 30000);
   ```

**优点**: 快速见效，最小改动
**缺点**: 技术债未清除，可能再次出问题

---

### 5.2 方案B: 完整重构 (1-2周) ⭐推荐

#### 5.2.1 架构重构

```
┌──────────────────────────────────────────────────────────────┐
│                     前端 (Vue3)                               │
│  PreparationRoom → comm-service → combat-service → BattleView│
└──────────────────────────────────────────────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    ▼                       ▼
          ┌─────────────────┐     ┌─────────────────┐
          │  PostgreSQL     │     │  Redis          │
          │  (持久化数据)     │     │  (实时状态)       │
          └─────────────────┘     └─────────────────┘
                    │                       │
                    └───────────┬───────────┘
                                ▼
                    ┌─────────────────────────┐
                    │     统一数据访问层        │
                    │  (combat-service作为核心) │
                    └─────────────────────────┘
```

#### 5.2.2 ID策略统一

```javascript
// 所有ID由combat-service生成，使用UUID
const battleId = uuidv4();  // e.g., "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
```

#### 5.2.3 服务职责划分

| 服务 | 职责 | 数据库 |
|------|------|--------|
| auth-service | 用户认证、JWT | users |
| hangar-service | 棋子管理、装备 | users, units |
| map-service | 战场管理、地形 | battlefields |
| combat-service | ⭐ 战斗核心、房间协调 | battle_sessions, battle_units, battle_actions |
| comm-service | 实时通信(WebSocket) | 无（使用Redis pub/sub） |

#### 5.2.4 标准化API契约

```javascript
// 战斗创建请求
POST /api/combat/battles
{
  "roomId": "uuid",
  "players": [
    { "userId": 1, "faction": "earth", "unitIds": [1, 2, 3] },
    { "userId": 2, "faction": "mars", "unitIds": [4, 5, 6] }
  ],
  "battlefieldId": 1
}

// 响应
{
  "battleId": "uuid",
  "status": "deployment",
  "battlefield": { ... },
  "initialUnits": [ ... ]
}
```

---

## 六、重构优先级

| 优先级 | 任务 | 工时 | 风险 |
|--------|------|------|------|
| P0 | 修复500错误（battleId冲突） | 1小时 | 低 |
| P0 | 统一battleId生成策略 | 2小时 | 中 |
| P1 | 完成combat-service TODO | 4小时 | 中 |
| P1 | 字段命名统一 | 2小时 | 低 |
| P2 | comm-service持久化/Redis | 4小时 | 中 |
| P2 | 重构战斗流程 | 1天 | 高 |

**总工时**: 约1-2周（视范围而定）

---

## 七、测试验证清单

修复后必须验证:

- [ ] 创建房间 → 加入房间 → 开始战斗 → 进入战场 全流程
- [ ] 战场地图正确加载（六角格、阵营颜色）
- [ ] 双方棋子正确部署在各自 Mothership 旁
- [ ] 棋子可移动（点击、拖拽）
- [ ] 服务器重启后房间状态保持
- [ ] 多玩家同时操作无冲突

---

## 八、附录

### A. 服务健康检查命令

```bash
# 检查所有服务状态
curl http://localhost:3001/health  # auth
curl http://localhost:3002/health  # hangar
curl http://localhost:3003/health  # map
curl http://localhost:3004/health  # combat
curl http://localhost:3005/health  # comm

# 检查PM2进程
pm2 list

# 查看combat日志
pm2 logs combat-service --lines 50
```

### B. 数据库连接信息

```javascript
// combat-service使用
DATABASE_URL=postgresql://agentuser:password@localhost:5432/combat_db

// 其他服务类似
// auth_db, hangar_db, map_db
```

### C. 关键文件位置

| 文件 | 服务器路径 |
|------|-----------|
| battles.js | /home/agentuser/Dean-garage/services/combat-service/routes/battles.js |
| roomManager.js | /home/agentuser/Dean-garage/services/comm-service/roomManager.js |
| BattlefieldView.vue | /home/agentuser/Dean-garage/frontend/src/views/BattlefieldView.vue |
| PreparationRoom.vue | /home/agentuser/Dean-garage/frontend/src/views/PreparationRoom.vue |

---

**报告生成**: 机甲战棋AI助手 ⚔️
**如有问题，请提供完整的错误日志和操作步骤**
