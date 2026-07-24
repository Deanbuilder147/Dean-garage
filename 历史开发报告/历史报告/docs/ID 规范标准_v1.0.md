# Dean-garage 项目 ID 规范标准 v1.0

**文档版本:** 1.0  
**创建日期:** 2026-04-21  
**适用范围:** 所有微服务 (auth, hangar, map, combat, comm, online-battle)  
**状态:** 📋 草案 (待审核)

---

## 📋 目录

1. [设计原则](#设计原则)
2. [ID 类型定义](#id 类型定义)
3. [各服务 ID 规范](#各服务 id 规范)
4. [跨服务引用规范](#跨服务引用规范)
5. [数据库表设计规范](#数据库表设计规范)
6. [API 响应规范](#api 响应规范)
7. [错误处理规范](#错误处理规范)
8. [迁移计划](#迁移计划)

---

## 🎯 设计原则

### 1. 全局唯一性 (Global Uniqueness)

跨服务引用的 ID 必须在整个系统中唯一，避免冲突。

```
✅ 正确：UUID v4 - `550e8400-e29b-41d4-a716-446655440000`
❌ 错误：自增 ID - `123` (不同服务可能重复)
```

### 2. 不可预测性 (Unpredictability)

对外暴露的 ID 不应被轻易猜测，防止枚举攻击。

```
✅ 正确：UUID - 无法猜测下一个 ID
❌ 错误：自增 ID - `/api/users/123` → `/api/users/124`
```

### 3. 服务自治 (Service Autonomy)

每个服务内部可以使用最适合的 ID 格式，但对外引用必须统一。

```
服务内部：AUTOINCREMENT (简单、高效)
跨服务：UUID v4 (唯一、安全)
```

### 4. 向后兼容 (Backward Compatibility)

修改 ID 格式时，必须考虑现有数据和 API 的兼容性。

---

## 🏷️ ID 类型定义

### 类型 1: 跨服务引用 ID (Cross-Service ID)

| 属性 | 规范 |
|------|------|
| **格式** | UUID v4 |
| **长度** | 36 字符 (含连字符) |
| **示例** | `550e8400-e29b-41d4-a716-446655440000` |
| **生成方式** | `crypto.randomUUID()` 或 `uuid.v4()` |
| **使用场景** | battle_id, room_id, user_id (跨服务时) |

**代码示例:**
```javascript
// Node.js 原生 (推荐)
const { randomUUID } = await import('crypto');
const battleId = randomUUID();

// 或使用 uuid 包
import { v4 as uuidv4 } from 'uuid';
const roomId = uuidv4();
```

---

### 类型 2: 内部主键 ID (Internal Primary Key)

| 属性 | 规范 |
|------|------|
| **格式** | INTEGER AUTOINCREMENT (SQLite) / SERIAL (PostgreSQL) |
| **长度** | 可变 (1, 2, 3... 递增) |
| **示例** | `1`, `42`, `10086` |
| **生成方式** | 数据库自增 |
| **使用场景** | 服务内部表主键，不跨服务引用 |

**代码示例:**
```sql
-- SQLite
CREATE TABLE units (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
);

-- PostgreSQL
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL
);
```

---

### 类型 3: 临时会话 ID (Ephemeral Session ID)

| 属性 | 规范 |
|------|------|
| **格式** | `{prefix}-{timestamp}-{random}` |
| **长度** | 可变 (建议 < 50 字符) |
| **示例** | `room-1682345678-abc123def`, `socket-1682345678-xyz789` |
| **生成方式** | `Date.now()` + `Math.random()` |
| **使用场景** | WebSocket 会话、内存房间、临时缓存键 |
| **有效期** | 会话结束后即可丢弃 |

**代码示例:**
```javascript
// 临时房间 ID (内存中，不持久化)
const roomId = `room-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// WebSocket 客户端 ID
const clientId = `ws-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
```

---

## 📊 各服务 ID 规范

### Auth-Service (认证服务)

| 表/字段 | ID 类型 | 格式 | 是否跨服务 |
|--------|--------|------|-----------|
| `users.id` | 内部主键 | AUTOINCREMENT | ❌ 否 |
| `users.uuid` | 跨服务 ID | UUID v4 | ✅ 是 |
| `sessions.id` | 临时会话 | `sess-{timestamp}-{random}` | ❌ 否 |

**表结构:**
```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,      -- 内部使用
    uuid TEXT UNIQUE NOT NULL,                  -- 跨服务引用 (UUID v4)
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_uuid ON users(uuid);
```

**代码示例:**
```javascript
// 创建用户时生成 UUID
const { randomUUID } = await import('crypto');
const userUuid = randomUUID();

db.run(
  'INSERT INTO users (uuid, username, email, password_hash) VALUES (?, ?, ?, ?)',
  [userUuid, username, email, passwordHash]
);
```

---

### Hangar-Service (机库服务)

| 表/字段 | ID 类型 | 格式 | 是否跨服务 |
|--------|--------|------|-----------|
| `units.id` | 内部主键 | AUTOINCREMENT | ❌ 否 |
| `units.uuid` | 跨服务 ID | UUID v4 | ✅ 是 |
| `loadouts.id` | 内部主键 | AUTOINCREMENT | ❌ 否 |

**表结构:**
```sql
CREATE TABLE units (
    id INTEGER PRIMARY KEY AUTOINCREMENT,      -- 内部使用
    uuid TEXT UNIQUE NOT NULL,                  -- 跨服务引用
    owner_user_id INTEGER NOT NULL,             -- 引用 users.id (内部)
    unit_type VARCHAR(50) NOT NULL,
    name VARCHAR(100),
    config JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

### Map-Service (地图服务)

| 表/字段 | ID 类型 | 格式 | 是否跨服务 |
|--------|--------|------|-----------|
| `battlefields.id` | 内部主键 | AUTOINCREMENT | ✅ 是 (整数) |
| `maps.id` | 内部主键 | AUTOINCREMENT | ❌ 否 |

**特殊说明:**
- `battlefields.id` 使用整数，因为：
  1. 战场数量有限 (< 1000)
  2. 仅被 Combat-Service 引用 (单向)
  3. 战场是静态配置，不会频繁变更

**表结构:**
```sql
CREATE TABLE battlefields (
    id INTEGER PRIMARY KEY AUTOINCREMENT,      -- 跨服务引用 (整数)
    name VARCHAR(100) NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    terrain_config JSON,
    spawn_points JSON
);
```

---

### Combat-Service (战斗服务)

| 表/字段 | ID 类型 | 格式 | 是否跨服务 |
|--------|--------|------|-----------|
| `battle_sessions.id` | 跨服务 ID | UUID v4 | ✅ 是 |
| `battle_units.id` | 内部主键 | AUTOINCREMENT | ❌ 否 |
| `battle_units.battle_id` | 外键 | UUID v4 | ✅ 引用 battle_sessions |
| `battle_logs.id` | 内部主键 | AUTOINCREMENT | ❌ 否 |
| `battle_logs.battle_id` | 外键 | UUID v4 | ✅ 引用 battle_sessions |

**表结构:**
```sql
CREATE TABLE battle_sessions (
    id TEXT PRIMARY KEY,                        -- UUID v4
    battlefield_id INTEGER NOT NULL,            -- 引用 map-service
    room_id TEXT,                               -- UUID v4 (可选)
    units_state TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    phase TEXT DEFAULT 'deployment',
    current_faction TEXT DEFAULT 'earth',
    current_turn INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE battle_units (
    id INTEGER PRIMARY KEY AUTOINCREMENT,       -- 内部使用
    battle_id TEXT NOT NULL,                    -- UUID v4
    unit_id INTEGER NOT NULL,                   -- 引用 hangar-service units.id
    player_id INTEGER NOT NULL,                 -- 引用 auth-service users.id
    faction TEXT NOT NULL,
    q INTEGER NOT NULL,
    r INTEGER NOT NULL,
    hp INTEGER NOT NULL,
    FOREIGN KEY (battle_id) REFERENCES battle_sessions(id)
);

CREATE INDEX idx_battle_units_battle ON battle_units(battle_id);
```

---

### Comm-Service (通讯服务)

| 字段 | ID 类型 | 格式 | 说明 |
|------|--------|------|------|
| `roomStates.roomId` | 临时会话 | `room-{time}-{random}` | 内存中，WebSocket 房间 |
| `roomStates.battleId` | 跨服务 ID | UUID v4 | **必须与 Combat-Service 一致** |
| `socket.clientId` | 临时会话 | `ws-{time}-{random}` | WebSocket 客户端标识 |

**重要:**
- Comm-Service **不存储** battle_id，仅从 Combat-Service 获取
- Comm-Service 的房间是临时的，游戏结束后清理

**代码示例:**
```javascript
// ✅ 正确：创建房间时调用 Combat-Service
const combatRes = await fetch(`${COMBAT_SERVICE_URL}/api/combat/battles`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: JSON.stringify({ battlefield_id, room_id: null })
});
const battleData = await combatRes.json();
const battleId = battleData.battle.id;  // UUID v4

// 临时房间 ID (仅用于 WebSocket)
const roomId = `room-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

roomStates.set(`room-${roomId}`, {
  battleId: battleId,  // ✅ 真实 UUID
  // ...
});
```

---

### Online-Battle-Service (在线对战服务)

| 表/字段 | ID 类型 | 格式 | 是否跨服务 |
|--------|--------|------|-----------|
| `players.id` | 内部主键 | AUTOINCREMENT | ❌ 否 |
| `players.uuid` | 跨服务 ID | UUID v4 | ✅ 是 |
| `rooms.id` | 跨服务 ID | UUID v4 | ✅ 是 |
| `battles.id` | 跨服务 ID | UUID v4 | ✅ 是 |

**表结构:**
```sql
CREATE TABLE players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,      -- 内部使用
    uuid TEXT UNIQUE NOT NULL,                  -- 跨服务引用
    user_id INTEGER NOT NULL,                   -- 引用 auth-service
    username VARCHAR(100) NOT NULL,
    elo INTEGER DEFAULT 1500
);

CREATE TABLE rooms (
    id TEXT PRIMARY KEY,                        -- UUID v4
    host_id INTEGER NOT NULL,                   -- 引用 players.id
    name VARCHAR(100) NOT NULL,
    max_players INTEGER DEFAULT 10,
    status TEXT DEFAULT 'waiting',
    battle_id TEXT,                             -- UUID v4 (可选)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE battles (
    id TEXT PRIMARY KEY,                        -- UUID v4
    room_id TEXT,                               -- UUID v4
    battle_type TEXT NOT NULL,
    map_id INTEGER NOT NULL,                    -- 引用 map-service
    status TEXT DEFAULT 'pending',
    winner_faction TEXT,
    started_at DATETIME,
    ended_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 🔗 跨服务引用规范

### 引用关系图

```
┌─────────────────────────────────────────────────────────────────┐
│                      Dean-garage 服务架构                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐   │
│  │ Auth-Service │     │Hangar-Service│     │ Map-Service  │   │
│  │   (端口 3001) │     │   (端口 3002)│     │   (端口 3003)│   │
│  │              │     │              │     │              │   │
│  │ users.uuid   │────▶│ units.uuid   │     │battlefields.id│  │
│  │ (UUID v4)    │     │ (UUID v4)    │     │ (INTEGER)   │  │
│  └──────┬───────┘     └──────┬───────┘     └──────┬───────┘  │
│         │                    │                     │          │
│         │                    │                     │          │
│         ▼                    ▼                     ▼          │
│  ┌──────────────────────────────────────────────────────┐     │
│  │              Combat-Service (端口 3004)              │     │
│  │                                                      │     │
│  │  battle_sessions.id (UUID v4) ◀───────────────────── │     │
│  │       │           │           │                      │     │
│  │       ▼           ▼           ▼                      │     │
│  │  battle_units  battle_logs  socket                  │     │
│  └──────────────────────────────────────────────────────┘     │
│                            │                                   │
│                            ▼                                   │
│  ┌──────────────────────────────────────────────────────┐     │
│  │               Comm-Service (端口 3005)               │     │
│  │                                                      │     │
│  │  roomStates.battleId (UUID v4) ◀──────────────────── │     │
│  │  (从 Combat-Service 获取，不自行生成)                   │     │
│  └──────────────────────────────────────────────────────┘     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 引用规则

| 引用方向 | 使用字段 | ID 类型 | 示例 |
|---------|---------|--------|------|
| Auth → Hangar | `units.owner_user_id` | INTEGER | `users.id` |
| Hangar → Auth | `units.owner_user_id` | INTEGER | `users.id` |
| Combat → Auth | `battle_units.player_id` | INTEGER | `users.id` |
| Combat → Hangar | `battle_units.unit_id` | INTEGER | `units.id` |
| Combat → Map | `battle_sessions.battlefield_id` | INTEGER | `battlefields.id` |
| Comm → Combat | `roomStates.battleId` | UUID v4 | `battle_sessions.id` |
| Online-Battle → Auth | `players.user_id` | INTEGER | `users.id` |
| Online-Battle → Combat | `battles.room_id` | UUID v4 | `battle_sessions.id` |

### API 调用规范

**请求其他服务时必须使用正确的 ID 格式:**

```javascript
// ✅ 正确：使用 UUID 查询 Combat-Service
const battleRes = await fetch(`${COMBAT_SERVICE_URL}/api/combat/battles/${battleId}`, {
  headers: { 'Authorization': `Bearer ${token}` }
});

// ❌ 错误：使用整数查询 (会返回 404)
const battleRes = await fetch(`${COMBAT_SERVICE_URL}/api/combat/battles/123`, {
  headers: { 'Authorization': `Bearer ${token}` }
});

// ✅ 正确：使用整数查询 Map-Service
const battlefieldRes = await fetch(`${MAP_SERVICE_URL}/api/map/battlefields/${battlefieldId}`, {
  headers: { 'Authorization': `Bearer ${token}` }
});
```

---

## 🗄️ 数据库表设计规范

### 必须包含的字段

所有跨服务引用的表必须包含：

```sql
-- 主键 (根据类型选择)
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),  -- PostgreSQL
id TEXT PRIMARY KEY,                             -- SQLite (UUID 字符串)
id INTEGER PRIMARY KEY AUTOINCREMENT,            -- SQLite (内部 ID)

-- 审计字段
created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
updated_at DATETIME DEFAULT CURRENT_TIMESTAMP

-- 外键约束 (如适用)
FOREIGN KEY (battle_id) REFERENCES battle_sessions(id) ON DELETE CASCADE
```

### 索引规范

```sql
-- 外键必须建索引
CREATE INDEX idx_battle_units_battle ON battle_units(battle_id);
CREATE INDEX idx_battle_logs_battle ON battle_logs(battle_id);

-- UUID 字段建索引 (查询优化)
CREATE INDEX idx_users_uuid ON users(uuid);
CREATE INDEX idx_rooms_id ON rooms(id);
```

---

## 📡 API 响应规范

### 成功响应

```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "battlefield_id": 1,
    "room_id": "550e8400-e29b-41d4-a716-446655440001",
    "status": "active",
    "created_at": "2026-04-21T10:00:00.000Z"
  }
}
```

### 错误响应

```json
{
  "success": false,
  "error": {
    "code": "BATTLE_NOT_FOUND",
    "message": "战斗不存在",
    "details": {
      "battle_id": "550e8400-e29b-41d4-a716-446655440000"
    }
  }
}
```

### ID 验证中间件

```javascript
// UUID v4 验证
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validateUUID(id, fieldName = 'id') {
  if (!UUID_REGEX.test(id)) {
    return {
      valid: false,
      error: `${fieldName} 必须是有效的 UUID v4 格式`
    };
  }
  return { valid: true };
}

// Express 中间件
function validateBattleId(req, res, next) {
  const { id } = req.params;
  const validation = validateUUID(id, 'battle_id');
  
  if (!validation.valid) {
    return res.status(400).json({
      error: validation.error
    });
  }
  
  next();
}
```

---

## ⚠️ 错误处理规范

### ID 格式错误

```javascript
// 400 Bad Request
{
  "error": "无效的 battle_id 格式",
  "details": {
    "provided": "battle-1682345678-abc123",
    "expected": "UUID v4 (如：550e8400-e29b-41d4-a716-446655440000)"
  }
}
```

### ID 不存在

```javascript
// 404 Not Found
{
  "error": "战斗不存在",
  "details": {
    "battle_id": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

### 服务不可达

```javascript
// 503 Service Unavailable
{
  "error": "战斗服务暂时不可用",
  "retry_after": 30
}
```

---

## 🔄 迁移计划

### 阶段 1: 文档与规范 (当前)

- [x] 制定 ID 规范文档
- [ ] 团队审核 (Dean 确认)
- [ ] 更新项目 README

### 阶段 2: 紧急修复 (P0)

- [ ] Comm-Service battle_id 集成问题
- [ ] Comm-Service 硬编码 URL

### 阶段 3: 服务改造 (P1-P2)

- [ ] Auth-Service: 添加 users.uuid 字段
- [ ] Hangar-Service: 添加 units.uuid 字段
- [ ] Online-Battle-Service: 统一 UUID 生成

### 阶段 4: 验证测试

- [ ] 单元测试覆盖 ID 验证
- [ ] 集成测试覆盖跨服务调用
- [ ] 性能测试 (UUID vs 整数)

### 阶段 5: 文档更新

- [ ] API 文档更新
- [ ] 部署指南更新
- [ ] 开发者指南更新

---

## 📚 参考资料

- [UUID v4 RFC 4122](https://tools.ietf.org/html/rfc4122)
- [Node.js crypto.randomUUID](https://nodejs.org/api/crypto.html#cryptorandomuuidoptions)
- [PostgreSQL UUID](https://www.postgresql.org/docs/current/datatype-uuid.html)
- [SQLite 数据类型](https://www.sqlite.org/datatype3.html)

---

## 📝 变更记录

| 版本 | 日期 | 变更内容 | 作者 |
|------|------|---------|------|
| 1.0 | 2026-04-21 | 初始版本 | Hermes Agent |

---

**审核状态:** ⏳ 待 Dean 审核  
**下一步:** 审核通过后开始 P0 修复
