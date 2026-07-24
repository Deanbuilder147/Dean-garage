# Comm-Service 与 Combat-Service 集成问题报告

**日期:** 2026-04-21  
**服务:** Comm-Service (端口 3005) + Combat-Service (端口 3004)  
**状态:** ⚠️ 需要修复  

---

## 📋 问题摘要

Comm-Service 生成的 `battle_id` 与 Combat-Service 数据库中的 ID **不匹配**，导致 BattleView 无法加载战斗数据。

---

## 🔍 问题详情

### 当前 Comm-Service 实现

**文件:** `/home/agentuser/Dean-garage/services/comm-service/src/index.js`

```javascript
// 第 104-105 行：创建房间时生成 battle_id
const roomId = `room-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
const battleId = `battle-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;  // ❌ 问题所在
```

**问题:**
- `battleId` 是随机生成的字符串（格式：`battle-1682345678-abc123def`）
- 这个 ID **没有**同步到 Combat-Service
- Combat-Service 的数据库中不存在这个 ID

### Combat-Service 数据库设计

**文件:** `/home/agentuser/Dean-garage/services/combat-service/src/database/db.js`

```javascript
// SQLite 架构（第 154-167 行）
CREATE TABLE IF NOT EXISTS battle_sessions (
  id TEXT PRIMARY KEY,    // ✅ 使用 UUID 字符串
  battlefield_id INTEGER NOT NULL,
  room_id TEXT,
  units_state TEXT NOT NULL,
  ...
)
```

**ID 生成方式:**
```javascript
// 第 163 行：使用 uuidv4() 生成
const battleId = uuidv4();  // ✅ 格式：550e8400-e29b-41d4-a716-446655440000
```

---

## 🔗 服务间关系

```
┌─────────────────┐     ┌──────────────────┐
│  Comm-Service   │     │ Combat-Service   │
│  (WebSocket)    │     │   (Database)     │
├─────────────────┤     ├──────────────────┤
│ 生成 battle_id  │     │ 存储 battle_id   │
│ ❌ 随机字符串   │     │ ✅ UUID v4       │
│ ──────────────> │     │                  │
│   不匹配！      │     │                  │
└─────────────────┘     └──────────────────┘
```

---

## 💥 影响范围

### 1. 战斗详情加载失败

当前端调用 `GET /api/comm/rooms/:roomId` 时：
- 返回的 `battle_id` 是 `battle-1682345678-abc123def`
- Combat-Service 查询：`SELECT * FROM battle_sessions WHERE id = 'battle-1682345678-abc123def'`
- 结果：**找不到记录**（数据库中是 UUID 格式）

### 2. BattleView 无法初始化

前端跳转到 `/battle/{battleId}` 后：
- 调用 `GET /api/combat/battles/:id`
- Combat-Service 返回 404：战斗不存在
- BattleView 无法获取战场状态、单位数据

### 3. 数据不一致

| 服务 | battle_id 格式 | 是否持久化 |
|------|---------------|-----------|
| Comm-Service | `battle-{timestamp}-{random}` | ❌ 内存中 |
| Combat-Service | `{uuid-v4}` | ✅ PostgreSQL/SQLite |

---

## ✅ 解决方案

### 方案 A：Comm-Service 调用 Combat-Service 创建战斗（推荐）

**修改流程:**

```
1. 用户创建房间
   ↓
2. Comm-Service 调用 POST /api/combat/battles
   ↓
3. Combat-Service 创建记录，返回真实 battle_id (UUID)
   ↓
4. Comm-Service 保存真实 battle_id 到 roomState
   ↓
5. 前端获取真实的 battle_id
```

**代码修改:**

```javascript
// comm-service/src/index.js 第 96-133 行
app.post('/api/comm/rooms', authenticate, async (req, res) => {
  const { battlefield_id, max_players = 6 } = req.body;
  
  // 1. 调用 Combat-Service 创建战斗会话
  const combatRes = await fetch('http://localhost:3004/api/combat/battles', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${req.headers.authorization?.split(' ')[1]}`
    },
    body: JSON.stringify({
      battlefield_id,
      room_id: null // 先创建，后续再关联
    })
  });
  
  const combatData = await combatRes.json();
  const realBattleId = combatData.battle.id; // ✅ UUID 格式
  
  // 2. 生成房间 ID（保持不变）
  const roomId = `room-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  // 3. 使用真实的 battle_id 初始化房间状态
  roomStates.set(`room-${roomId}`, {
    players: new Map(),
    battleId: realBattleId, // ✅ 保存真实 ID
    battlefieldId: battlefield_id,
    maxPlayers: max_players,
    status: 'waiting',
    createdAt: new Date().toISOString(),
    createdBy: req.user.userId,
    host_user_id: req.user.userId
  });
  
  res.json({
    room: {
      id: roomId,
      battle_id: realBattleId, // ✅ 返回真实 ID
      battlefield_id,
      max_players: max_players,
      status: 'waiting',
      created_at: new Date().toISOString(),
      host_user_id: req.user.userId
    },
    ws_room: `room-${roomId}`,
    ws_battle: `battle-${realBattleId}`
  });
});
```

---

### 方案 B：统一使用字符串 ID（备选）

如果不想在创建房间时就创建战斗记录，可以：

1. **修改 Comm-Service** 使用 UUID 格式：
```javascript
import { v4 as uuidv4 } from 'uuid';
const battleId = uuidv4(); // 改为 UUID
```

2. **修改 Combat-Service** 接受外部传入的 battle_id：
```javascript
// routes/battles.js
router.post('/', authenticate, async (req, res) => {
  const { battlefield_id, room_id, battle_id } = req.body;
  
  // 如果外部传入 battle_id，直接使用
  const realBattleId = battle_id || uuidv4();
  
  // 创建战斗记录...
});
```

**缺点:**
- 战斗记录创建延迟，可能导致状态不一致
- 需要处理并发冲突（两个服务同时创建相同 ID）

---

## 📝 其他服务检查

### Online-Battle-Service

**文件:** `/home/agentuser/Dean-garage/services/online-battle-service/migrations/001_initial_schema.sql`

```sql
-- 第 117-128 行：battles 表
CREATE TABLE IF NOT EXISTS battles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), -- ✅ 使用 UUID
    room_id UUID REFERENCES rooms(id),
    ...
)
```

**状态:** ✅ 正确 - 使用 PostgreSQL UUID，与 Combat-Service 设计一致

### Map-Service

未发现 `battle_id` 相关问题。

---

## 🎯 建议操作步骤

### 第一步：修复 Comm-Service（方案 A）

1. 修改 `comm-service/src/index.js`:
   - 导入 `uuid` 模块
   - 移除随机字符串生成逻辑
   - 调用 Combat-Service API 创建战斗

2. 添加错误处理:
   - Combat-Service 不可用时的降级方案
   - 超时重试机制

3. 更新房间状态管理:
   - 保存真实 `battle_id` 到 `roomStates`

### 第二步：测试集成流程

```bash
# 1. 创建房间
curl -X POST http://localhost:3005/api/comm/rooms \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"battlefield_id": 1}'

# 2. 验证返回的 battle_id 是 UUID 格式
# 期望：550e8400-e29b-41d4-a716-446655440000

# 3. 用 battle_id 查询 Combat-Service
curl http://localhost:3004/api/combat/battles/<battle_id> \
  -H "Authorization: Bearer <token>"

# 4. 验证能获取战斗详情
```

### 第三步：前端验证

1. 创建房间后，检查返回的 `battle_id`
2. 开始游戏后，验证能跳转到 `/battle/{battleId}`
3. 验证 BattleView 能加载战场数据

---

## 📊 修复前后对比

| 指标 | 修复前 | 修复后 |
|------|--------|--------|
| battle_id 来源 | Comm-Service 随机生成 | Combat-Service 创建 |
| battle_id 格式 | `battle-{time}-{random}` | UUID v4 |
| 数据库记录 | ❌ 不存在 | ✅ 存在 |
| BattleView 加载 | ❌ 404 错误 | ✅ 成功 |
| 数据一致性 | ❌ 不一致 | ✅ 一致 |

---

## ⚠️ 注意事项

1. **环境变量配置:**
   - 确保 Comm-Service 知道 Combat-Service 的 URL
   - 建议添加 `COMBAT_SERVICE_URL=http://localhost:3004`

2. **认证 Token 传递:**
   - Comm-Service 调用 Combat-Service 时需要传递用户 Token
   - 或者使用服务间认证（Service-to-Service auth）

3. **错误处理:**
   - Combat-Service 不可用时的降级策略
   - 超时重试机制

4. **数据清理:**
   - 房间删除时，是否同步删除战斗记录？
   - 需要定义清理策略

---

## 📈 下一步行动

1. **[ ]** 修改 Comm-Service 调用 Combat-Service API
2. **[ ]** 添加环境变量 `COMBAT_SERVICE_URL`
3. **[ ]** 实现错误处理和重试逻辑
4. **[ ]** 测试完整流程：创建房间 → 开始游戏 → 加载 BattleView
5. **[ ]** 更新文档和 API 规范

---

**报告人:** Hermes Agent  
**审核状态:** ⏳ 待处理  
**优先级:** 高（影响核心游戏流程）
