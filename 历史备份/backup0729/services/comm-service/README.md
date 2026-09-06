# 通讯服务 (Comm Service)

机甲战棋游戏微服务架构中的实时通讯服务，负责 WebSocket 连接管理和实时消息广播。

## 端口
- HTTP: 3005
- WebSocket: ws://localhost:3005

## 技术栈
- Node.js + Express
- Socket.io
- JWT 认证

## 核心功能

### 1. WebSocket 连接管理
- JWT Token 认证
- 连接状态监控
- 断线重连支持

### 2. 房间管理
- 加入/离开房间
- 房间玩家列表同步
- 房间状态管理

### 3. 实时战斗消息转发
- 单位移动
- 攻击事件
- 奇袭系统
- 回合切换
- 阶段变更

### 4. 玩家状态同步
- 准备状态
- 配置更新
- 在线状态

### 5. 聊天系统
- 房间聊天
- 系统消息广播

## 事件列表

### 客户端 → 服务器
| 事件 | 描述 | 参数 |
|------|------|------|
| `join-room` | 加入房间 | `{ roomId, roomType }` |
| `leave-room` | 离开房间 | `{ roomId }` |
| `join-battle` | 加入战斗 | `battleId` |
| `leave-battle` | 离开战斗 | `battleId` |
| `move-unit` | 移动单位 | `{ battleId, unitId, targetQ, targetR }` |
| `attack` | 发起攻击 | `{ battleId, attackerId, targetId, attackType }` |
| `attack-result` | 攻击结果 | `{ battleId, result }` |
| `surprise-attack` | 奇袭请求 | `{ battleId, surpriseUnitId, targetId, type }` |
| `surprise-choice` | 奇袭选择 | `{ battleId, choice }` |
| `end-turn` | 结束回合 | `{ battleId, currentFaction }` |
| `phase-change` | 阶段变更 | `{ battleId, phase, metadata }` |
| `player-ready` | 准备状态 | `{ roomId, isReady }` |
| `player-config` | 配置更新 | `{ roomId, config }` |
| `chat-message` | 聊天消息 | `{ roomId, message }` |
| `sync-battle-state` | 同步战斗状态 | `{ battleId, state }` |
| `request-battle-state` | 请求战斗状态 | `{ battleId }` |

### 服务器 → 客户端
| 事件 | 描述 | 参数 |
|------|------|------|
| `player-joined` | 玩家加入 | `{ username, userId }` |
| `player-left` | 玩家离开 | `{ username, userId }` |
| `player-disconnected` | 玩家断开 | `{ username, userId }` |
| `room-players` | 房间玩家列表 | `{ roomId, players }` |
| `unit-moved` | 单位移动 | `{ unitId, targetQ, targetR, movedBy }` |
| `attack-started` | 攻击开始 | `{ attackerId, targetId, attackType, attackedBy }` |
| `attack-resolved` | 攻击结果 | `result` |
| `surprise-attack-triggered` | 奇袭触发 | `{ surpriseUnitId, targetId, type, triggeredBy }` |
| `surprise-timer-start` | 奇袭倒计时 | `{ duration }` |
| `surprise-choice-made` | 奇袭选择 | `{ username, choice }` |
| `turn-ended` | 回合结束 | `{ endedBy, currentFaction, nextFaction }` |
| `phase-changed` | 阶段变更 | `{ phase, changedBy, ...metadata }` |
| `player-ready-changed` | 准备状态变更 | `{ username, isReady }` |
| `player-config-updated` | 配置更新 | `{ username, config }` |
| `chat-message` | 聊天消息 | `{ username, message, timestamp }` |
| `system-message` | 系统消息 | `{ message, type }` |
| `battle-state-synced` | 战斗状态同步 | `{ state, syncedBy }` |

## 安装和运行

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 生产模式
npm start
```

## API 端点

### 健康检查
```
GET /api/comm/health
```

### 房间统计
```
GET /api/comm/stats/rooms
```

## 环境变量

| 变量名 | 默认值 | 描述 |
|--------|--------|------|
| `PORT` | 3005 | 服务端口 |
| `JWT_SECRET` | mecha-battle-secret | JWT 密钥 |
| `FRONTEND_URL` | http://localhost:8081 | 前端地址 |
