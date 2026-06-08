# 机甲战棋游戏 - 战斗服务

## 概述

战斗服务（Combat Service）是机甲战棋游戏的核心战斗逻辑服务，负责处理战斗会话管理、回合系统、伤害计算、奇袭系统以及阵营技能等核心战斗逻辑。

## 服务特性

### 核心功能
1. **战斗会话管理** - 创建、获取、更新战斗状态
2. **回合管理系统** - 阵营轮次、阶段切换、回合逻辑
3. **伤害计算系统** - 基于属性、武器、防具的伤害结算
4. **奇袭系统** - 马克西翁阵营的特殊攻击机制
5. **阵营技能** - 地球联合火力覆盖、拜隆增援、马克西翁迷雾系统

### 技术栈
- **运行时**: Node.js (ES Modules)
- **Web框架**: Express.js
- **数据库**: SQLite (better-sqlite3)
- **实时通信**: WebSocket
- **认证**: JWT (JSON Web Token)

## 快速开始

### 环境要求
- Node.js 16+
- npm 或 yarn

### 安装依赖
```bash
cd services/combat-service
npm install
```

### 配置环境变量
复制 `.env.example` 到 `.env` 并修改配置：
```bash
cp .env.example .env
```

### 启动服务
```bash
npm start
# 或开发模式
npm run dev
```

服务将在 http://localhost:3004 启动。

## API文档

### 基本路径
```
http://localhost:3004/api/combat
```

### 健康检查
```
GET /health
```

### 战斗会话管理

#### 获取战斗列表
```
GET /api/combat
```
- 需要认证
- 返回所有战斗会话

#### 创建战斗
```
POST /api/combat
```
```json
{
  "battlefield_id": 1,
  "room_id": 123  // 可选，从房间创建
}
```

#### 获取战斗详情
```
GET /api/combat/:id
```

#### 单位移动
```
POST /api/combat/:id/move
```
```json
{
  "unit_id": 1,
  "target_q": 3,
  "target_r": 4
}
```

#### 单位攻击
```
POST /api/combat/:id/attack
```
```json
{
  "attacker_id": 1,
  "target_id": 2,
  "attack_type": "melee"  // 或 "ranged"
}
```

#### 奇袭选择
```
POST /api/combat/:id/surprise-choice
```
```json
{
  "choice": "replace",  // replace/counter/giveup
  "surprise_unit_id": 3,
  "original_attacker_id": 1,
  "target_id": 2,
  "attack_type": "melee"
}
```

#### 结束回合
```
POST /api/combat/:id/end-turn
```

### 阵营技能

#### 地球联合 - 火力覆盖
```
POST /api/combat/:id/artillery
```
```json
{
  "center_q": 5,
  "center_r": 5
}
```

#### 马克西翁 - 迷雾系统
```
POST /api/combat/:id/fog-system
```

## 战斗系统详解

### 回合流程
1. **出生点选择阶段** - 玩家选择母舰/基地作为初始位置
2. **出生点部署阶段** - 在出生点部署单位
3. **战术阶段** - 部署Royroy等战术单位
4. **移动阶段** - 单位移动
5. **行动阶段** - 单位攻击或使用技能
6. **结束阶段** - 回合结束，进入下一阵营

### 阵营顺序
```
地球联合 → 拜隆 → 马克西翁
```

### 奇袭系统
- **触发条件**: 马克西翁阵营单位攻击时，50%几率触发
- **奇袭类型**: 
  - 顶替攻击 (replace): 奇袭单位取代原攻击
  - 先制攻击 (counter): 原攻击继续，奇袭单位额外攻击
  - 放弃 (giveup): 放弃奇袭机会
- **骰子系统**: 黑色骰子(1-5)=伤害+2，红色骰子(6-10)=移动-1

### 伤害计算
```
基础伤害 = (格斗/射击属性) + 机动差
武器加成 = 左手武器 + 右手武器
防御减免 = 左手防具(3) + 右手防具(3)
最终伤害 = 基础伤害 - 防御减免
```

### 阵营技能

#### 地球联合 - 火力覆盖
- **效果**: 对指定区域造成15点伤害
- **范围**: 半径2格
- **使用限制**: 每轮一次

#### 拜隆 - 增援系统
- **效果**: 附近拜隆单位分担伤害
- **范围**: 2格内
- **触发**: 拜隆单位被攻击时自动触发

#### 马克西翁 - 迷雾系统
- **效果**: 随机效果（掷骰子决定）
  - 1-2: 全体防御+2
  - 3-4: 全体移动+1
  - 5-6: 全体攻击+1
- **持续时间**: 2回合
- **使用限制**: 每轮一次

## 数据库结构

### battle_sessions (战斗会话)
- `id`: 主键
- `battlefield_id`: 战场ID
- `room_id`: 房间ID（可选）
- `units_state`: JSON格式的战斗状态
- `status`: 状态 (active/ended)
- `phase`: 当前阶段
- `current_faction`: 当前行动阵营
- `current_turn`: 当前回合数
- `spawn_phase_done`: 出生点选择是否完成
- `spawn_order`: JSON格式的出生点选择顺序

### battle_units (战斗单位)
- `id`: 主键
- `battle_id`: 战斗ID
- `unit_id`: 单位ID
- `player_id`: 玩家ID
- `faction`: 阵营
- 单位属性：位置、HP、装备等

### battle_logs (战斗日志)
- `id`: 主键
- `battle_id`: 战斗ID
- `log_type`: 日志类型
- `content`: 日志内容
- `timestamp`: 时间戳

## 实时通信

### WebSocket连接
```
ws://localhost:3004?token=<JWT_TOKEN>&battleId=<BATTLE_ID>
```

### 消息类型
- `join_battle`: 加入战斗
- `leave_battle`: 离开战斗
- `battle_update`: 战斗状态更新
- `unit_moved`: 单位移动
- `unit_attacked`: 单位攻击
- `turn_ended`: 回合结束
- `chat_message`: 聊天消息

## 部署

### Docker部署
```bash
docker build -t mecha-battle-combat .
docker run -p 3004:3004 mecha-battle-combat
```

### Docker Compose
```yaml
version: '3.8'
services:
  combat-service:
    build: ./services/combat-service
    ports:
      - "3004:3004"
    environment:
      - NODE_ENV=production
      - JWT_SECRET=${JWT_SECRET}
    volumes:
      - combat-data:/app/data
    depends_on:
      - auth-service
      - map-service
      - hangar-service
```

## 开发

### 项目结构
```
combat-service/
├── src/
│   ├── index.js              # 服务入口
│   ├── routes/              # API路由
│   │   └── battles.js       # 战斗路由
│   ├── services/            # 业务逻辑
│   │   ├── combatResolver.js # 战斗结算
│   │   ├── turnManager.js   # 回合管理
│   │   └── socketService.js # WebSocket服务
│   ├── middleware/          # 中间件
│   │   └── auth.js          # 认证中间件
│   ├── database/            # 数据库
│   │   └── db.js            # 数据库连接
│   └── utils/               # 工具函数
├── package.json
├── .env
├── Dockerfile
└── README.md
```

### 测试
```bash
npm test
```

## 与其他服务交互

### 依赖服务
- **Auth Service (3001)**: 用户认证、权限验证
- **Map Service (3003)**: 战场数据、地形信息
- **Hangar Service (3002)**: 单位数据、装备信息
- **Comm Service (3005)**: 房间管理、聊天

### 通信协议
- HTTP API调用
- WebSocket实时通信
- JWT令牌验证

## 许可证

MIT License