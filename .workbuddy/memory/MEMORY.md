# 机甲战棋游戏 - 项目记忆

## 项目概况
- **游戏类型**: 策略战棋 + 六角格战斗
- **阵营设定**: 地球联合 (earth)、拜隆 (balon)、马克西翁 (maxion)
- **开发模式**: 微服务架构

## 服务架构
- **前端服务**: Vue.js + PixiJS (端口8081)
- **认证服务**: auth-service (端口3000)
- **地图服务**: map-service (端口3002)
- **机库服务**: hangar-service (端口3001)
- **战斗服务**: combat-service (端口3003, WebSocket 3005)
- **通信服务**: comm-service (端口3004)

## 技术栈偏好
1. **后端**: Node.js + Express (ES Modules)
2. **数据库**: SQLite (sql.js/better-sqlite3)
3. **认证**: JWT (JSON Web Tokens)
4. **实时通信**: WebSocket
5. **容器化**: Docker + Docker Compose
6. **API风格**: RESTful + WebSocket实时通信

## 开发约定
1. **端口分配**:
   - 3000-3009: 后端微服务
   - 3005: WebSocket专用端口
   - 8080-8089: 前端开发服务器

2. **目录结构**:
   ```
   services/[service-name]/
   ├── src/
   │   ├── index.js (主入口)
   │   ├── config/
   │   ├── database/
   │   ├── middleware/
   │   ├── routes/
   │   ├── services/
   │   └── utils/
   ├── test/
   ├── data/ (本地数据存储)
   ├── Dockerfile
   └── docker-compose.yml
   ```

3. **命名规范**:
   - 数据库表: 小写_snake_case
   - API端点: kebab-case
   - 服务文件: camelCase
   - 环境变量: UPPER_SNAKE_CASE

## 战斗系统设计
- **回合结构**: 选择→部署→战术→移动→行动→结束
- **奇袭系统**: 马克西翁阵营特有，骰子机制决定效果
- **阵营技能**:
  - 地球联合: 火力覆盖 (范围伤害)
  - 拜隆: 增援系统 (伤害分担)
  - 马克西翁: 迷雾系统 (随机增益)
- **伤害计算**: 属性 + 机动差 + 武器加成 - 防具防御

## 数据持久化
1. **战斗数据**: SQLite存储战斗会话、单位状态
2. **地图数据**: 六角格地形、坐标系统
3. **单位数据**: 机甲属性、装备配置
4. **战斗日志**: JSON格式存储关键事件

## 部署策略
1. **开发环境**: 本地Docker Compose
2. **测试环境**: CI/CD自动部署
3. **生产环境**: 容器编排 (Kubernetes备选)

## 已知依赖
- 地图服务 ↔ 战斗服务 (战场数据)
- 机库服务 ↔ 战斗服务 (单位数据)
- 认证服务 ↔ 所有服务 (用户认证)
- 通信服务 ↔ 战斗服务 (实时通信)

## 更新记录
- **2026-04-14**: 完成战斗服务开发，包含完整API、数据库、实时通信
- **2026-04-14**: 完成地图服务开发，包含六角格坐标计算和地形编辑器
- **2026-04-16**: 完成词条系统Phase 4-7（钩子链、词条数据库、迁移兼容、奇袭系统）
- **2026-04-16**: 完成人机AI系统Phase 8（决策引擎、行为树、策略、难度分级）

## Phase 8: 人机AI系统（2026-04-16）

### 新增文件
| 文件 | 功能 |
|------|------|
| `aiEngine.cjs` | AI决策引擎（单位管理、回合调度、决策执行） |
| `behaviorTree.cjs` | 行为树系统（Selector/Sequence/Condition/Action） |
| `aiStrategies.cjs` | AI策略（攻击型/防守型/平衡型） |
| `aiDifficulty.cjs` | 难度分级系统（简单/普通/困难，含伤害修正） |
| `aiIntegration.cjs` | AI战斗控制器（与CombatIntegrator集成） |
| `phase8-ai-system.test.cjs` | Phase 8 测试（31个测试全部通过）|

### AI系统架构
```
AICombatController
    ↓
AIEngine (决策引擎)
    ↓
┌─────────────────────────────────────┐
│  行为树 (BehaviorTree)              │
│  ├── Selector (选择器)             │
│  ├── Sequence (序列器)               │
│  ├── Condition (条件)                │
│  └── Action (动作)                   │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│  策略 (AIStrategies)                 │
│  ├── AggressiveStrategy (攻击型)    │
│  ├── DefensiveStrategy (防守型)     │
│  └── BalancedStrategy (平衡型)       │
└─────────────────────────────────────┘
```

### 难度分级配置
| 难度 | 思考延迟 | 随机性 | 准确率 | 伤害倍率 | 承受伤害 |
|------|----------|--------|--------|----------|----------|
| 简单 | 500ms | 30% | 70% | 0.8x | 1.2x |
| 普通 | 1000ms | 15% | 85% | 1.0x | 1.0x |
| 困难 | 1500ms | 0% | 95% | 1.1x | 0.9x |

---
*最后更新: 2026-04-16*