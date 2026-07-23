# Comm-Service 与 Combat-Service 集成修复报告

**报告日期:** 2026-04-21  
**修复类型:** 服务集成问题  
**严重程度:** 🔴 P0 (阻塞性问题)  
**修复状态:** ✅ 已完成

---

## 📋 问题描述

### 原始问题

Comm-Service 在创建房间时，使用了临时生成的 fake battle_id，而不是调用 Combat-Service 获取真实的 UUID battle_id。这导致：

1. **BattleView 加载失败** - 前端尝试用 fake battle_id 查询 Combat-Service，返回 404
2. **跨服务数据不一致** - Comm-Service 和 Combat-Service 的 battle_id 不匹配
3. **WebSocket 房间与战斗会话脱节** - 两个服务之间没有关联

### 问题代码

**Comm-Service (修复前):**
```javascript
// ❌ 错误：生成 fake battle_id
const battleId = `battle-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

roomStates.set(roomName, {
  battleId,  // fake ID，Combat-Service 中不存在
  // ...
});
```

**Combat-Service:**
```javascript
// ✅ 正确：使用 UUID v4
import { v4 as uuidv4 } from 'uuid';
const battleId = uuidv4();  // 例如：550e8400-e29b-41d4-a716-446655440000
```

---

## 🔧 修复方案

### 修复 1: Comm-Service 调用 Combat-Service 创建战斗

**修改文件:** `services/comm-service/src/index.js`

**修复后代码:**
```javascript
app.post('/api/comm/rooms', authenticate, async (req, res) => {
  const { battlefield_id, max_players = 6 } = req.body;

  if (!battlefield_id) {
    return res.status(400).json({ error: 'battlefield_id 是必填项' });
  }

  try {
    // ✅ 调用 Combat-Service 创建战斗会话，获取真实的 UUID battle_id
    const combatRes = await fetch(`${COMBAT_SERVICE_URL}/api/combat/battles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${req.headers.authorization.split(' ')[1]}`
      },
      body: JSON.stringify({
        battlefield_id,
        room_id: null  // 此时还没有 room_id，先创建战斗
      })
    });

    if (!combatRes.ok) {
      const errorData = await combatRes.text();
      throw new Error(`创建战斗会话失败：${errorData}`);
    }

    const combatData = await combatRes.json();
    const battleId = combatData.battle.id;  // ✅ UUID v4 格式

    // 生成房间 ID（临时会话 ID 格式）
    const roomId = `room-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // 初始化房间状态
    roomStates.set(`room-${roomId}`, {
      players: new Map(),
      battleId,  // ✅ 真实 UUID，与 Combat-Service 一致
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
        battle_id: battleId,  // ✅ UUID v4
        battlefield_id,
        max_players: max_players,
        status: 'waiting',
        created_at: new Date().toISOString(),
        host_user_id: req.user.userId
      },
      ws_room: `room-${roomId}`,
      ws_battle: `battle-${battleId}`
    });
  } catch (error) {
    console.error('创建房间失败:', error);
    res.status(500).json({ error: '创建房间失败', message: error.message });
  }
});
```

---

### 修复 2: 移除硬编码 URL，使用环境变量

**问题:** Comm-Service 中硬编码了其他服务的 URL

**修复前:**
```javascript
const combatRes = await fetch(`http://localhost:3004/api/combat/battles`, { ... });
const mapRes = await fetch(`http://localhost:3003/api/map/battlefields/${id}`, { ... });
```

**修复后:**
```javascript
// 服务 URL 配置（从环境变量读取）
const COMBAT_SERVICE_URL = process.env.COMBAT_SERVICE_URL || 'http://localhost:3004';
const MAP_SERVICE_URL = process.env.MAP_SERVICE_URL || 'http://localhost:3003';

// 使用环境变量
const combatRes = await fetch(`${COMBAT_SERVICE_URL}/api/combat/battles`, { ... });
const mapRes = await fetch(`${MAP_SERVICE_URL}/api/map/battlefields/${id}`, { ... });
```

**环境变量配置:**
```bash
# services/comm-service/.env
COMBAT_SERVICE_URL=http://localhost:3004
MAP_SERVICE_URL=http://localhost:3003
```

---

## 📊 修复验证

### 测试流程

1. **启动所有服务**
   ```bash
   # 启动 Auth-Service
   cd services/auth-service && npm start &
   
   # 启动 Combat-Service
   cd services/combat-service && npm start &
   
   # 启动 Comm-Service
   cd services/comm-service && npm start &
   ```

2. **运行集成测试**
   ```bash
   node services/comm-service/test-integration.js
   ```

3. **验证步骤**
   - ✅ 调用 Comm-Service 创建房间
   - ✅ 验证返回的 `battle_id` 是 UUID v4 格式
   - ✅ 验证 Combat-Service 中存在相应的战斗会话
   - ✅ 验证两个服务的 `battle_id` 一致

### 预期输出

```
🧪 开始集成测试...

📝 步骤 1: 登录获取 token...
✅ 登录成功

🏠 步骤 2: 调用 Comm-Service 创建房间...
✅ 房间创建成功
   房间 ID: room-1682345678-abc123def
   Battle ID: 550e8400-e29b-41d4-a716-446655440000
   战场 ID: 1

✓ 步骤 3: 验证 battle_id 格式...
✅ battle_id 是正确的 UUID v4 格式

⚔️  步骤 4: 验证 Combat-Service 中的战斗会话...
✅ Combat-Service 中存在该战斗会话
   战斗 ID: 550e8400-e29b-41d4-a716-446655440000
   战场 ID: 1
   状态：active
   阶段：deployment

🔗 步骤 5: 验证数据一致性...
✅ 数据一致性验证通过

🎉 所有测试通过！

📊 测试结果汇总:
   ✓ Comm-Service 成功调用 Combat-Service 创建战斗
   ✓ battle_id 使用 UUID v4 格式
   ✓ Combat-Service 正确存储战斗会话
   ✓ 跨服务数据一致性良好

✨ Comm-Service 与 Combat-Service 集成正常！
```

---

## 📝 修改文件清单

| 文件路径 | 修改类型 | 修改内容 |
|---------|---------|---------|
| `services/comm-service/src/index.js` | 修改 | 1. 创建房间时调用 Combat-Service<br>2. 添加环境变量配置<br>3. 移除硬编码 URL |
| `services/comm-service/.env` | 修改 | 添加 `COMBAT_SERVICE_URL` 和 `MAP_SERVICE_URL` |
| `services/comm-service/.env.example` | 修改 | 添加环境变量示例 |
| `services/comm-service/test-integration.js` | 新增 | 集成测试脚本 |
| `docs/ID 规范标准_v1.0.md` | 新增 | ID 规范文档 |

---

## 🎯 符合 ID 规范

根据《ID 规范标准_v1.0.md》：

### battle_id 类型定义

| 属性 | 规范 | 实际使用 |
|------|------|---------|
| **格式** | UUID v4 | ✅ `550e8400-e29b-41d4-a716-446655440000` |
| **长度** | 36 字符 (含连字符) | ✅ 符合 |
| **生成方式** | `crypto.randomUUID()` 或 `uuid.v4()` | ✅ Combat-Service 使用 `uuid.v4()` |
| **使用场景** | 跨服务引用 | ✅ Comm-Service → Combat-Service |

### 跨服务引用关系

```
Comm-Service.roomStates.battleId (UUID v4)
    ↓
Combat-Service.battle_sessions.id (UUID v4)
```

**验证通过** ✅

---

## ⚠️ 注意事项

### 1. 服务启动顺序

Comm-Service 依赖 Combat-Service，必须按以下顺序启动：

```bash
# 1. 先启动 Combat-Service
cd services/combat-service && npm start

# 2. 再启动 Comm-Service
cd services/comm-service && npm start
```

### 2. 环境变量配置

每个服务的 `.env` 文件必须配置正确的服务 URL：

```bash
# services/comm-service/.env
COMBAT_SERVICE_URL=http://localhost:3004
MAP_SERVICE_URL=http://localhost:3003
```

### 3. Token 传递

Comm-Service 调用 Combat-Service 时，必须传递用户的 JWT token：

```javascript
headers: {
  'Authorization': `Bearer ${token}`
}
```

---

## 🚀 后续工作

### P1 - 高优先级

- [ ] 更新前端代码，使用新的 UUID battle_id
- [ ] 更新 API 文档，标注 battle_id 格式
- [ ] 添加错误处理：Combat-Service 不可用时的降级方案

### P2 - 中优先级

- [ ] 为所有服务添加健康检查端点
- [ ] 实现服务发现机制（替代硬编码 URL）
- [ ] 添加服务间调用的重试机制

### P3 - 低优先级

- [ ] 优化数据库查询性能
- [ ] 添加服务间调用的监控指标
- [ ] 实现 Circuit Breaker 模式

---

## 📚 参考资料

- [ID 规范标准_v1.0.md](../docs/ID 规范标准_v1.0.md)
- [UUID v4 RFC 4122](https://tools.ietf.org/html/rfc4122)
- [Node.js crypto.randomUUID](https://nodejs.org/api/crypto.html#cryptorandomuuidoptions)

---

**修复完成时间:** 2026-04-21  
**修复人员:** Hermes Agent  
**审核状态:** ⏳ 待 Dean 审核
