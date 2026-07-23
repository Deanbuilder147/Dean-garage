# 机甲战棋 (Mecha Battle)

<div align="center">
  <img src="https://img.shields.io/badge/Unity-2022.3+-000?style=flat-square&logo=unity&logoColor=white" alt="Unity">
  <img src="https://img.shields.io/badge/Node.js-18+-339933?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/PostgreSQL-14+-336791?style=flat-square&logo=postgresql&logoColor=white" alt="PostgreSQL">
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License">
</div>

> 一款以未来科幻机甲为主题的回合制战棋游戏，支持多阵营对抗、词条系统、技能组合和 AI 对战。

## 🎮 游戏特色

- **三大阵营**：地球联合、拜隆、马克西翁，各有独特机甲和技能
- **词条系统**：10+ 可组合词条（联防、再动、斩杀、决斗等）
- **奇袭系统**：马克西翁专属隐身机制
- **AI 对战**：智能寻路与战斗决策
- **可视化编辑器**：棋子编辑器、战场编辑器
- **实时通信**：Socket.io 支持多人观战

## 🏗️ 技术架构

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend                              │
│                    Vue 3 + PixiJS                           │
│                     Port: 8081                              │
└─────────────────────────┬───────────────────────────────────┘
                          │ REST API / WebSocket
┌─────────────────────────┴───────────────────────────────────┐
│                      Backend Services                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │ auth-service │  │ hangar-svc   │  │ map-service  │         │
│  │   Port 3001  │  │   Port 3002  │  │   Port 3003  │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
│  ┌──────────────┐  ┌──────────────┐                          │
│  │combat-service│  │comm-service  │                          │
│  │   Port 3004  │  │   Port 3005  │                          │
│  └──────────────┘  └──────────────┘                          │
└─────────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────┴───────────────────────────────────┐
│                      PostgreSQL DB                           │
│                     Port: 5432                              │
└─────────────────────────────────────────────────────────────┘
```

## 🚀 快速开始

### 前置要求

- Node.js 18+
- PostgreSQL 14+
- npm 或 yarn

### 1. 克隆项目

```bash
git clone https://github.com/Deanbuilder147/Dean-garage.git
cd Dean-garage
```

### 2. 安装依赖

```bash
# 安装所有服务依赖
cd services
./manage-services.sh install

# 或者手动安装
cd services/auth-service && npm install
cd ../hangar-service && npm install
cd ../map-service && npm install
cd ../combat-service && npm install
cd ../comm-service && npm install
```

### 3. 配置数据库

```bash
# 创建 PostgreSQL 数据库
createdb mecha_battle

# 设置环境变量
export DATABASE_URL=postgresql://user:password@localhost:5432/mecha_battle
export JWT_SECRET=your-secret-key
export NODE_ENV=development
```

### 4. 启动服务

```bash
# 使用管理脚本启动所有服务
cd services
./manage-services.sh start

# 或分别启动
npm start  # 每个服务目录下
```

### 5. 访问游戏

打开浏览器访问: http://localhost:8081

## 📁 项目结构

```
mecha-battle/
├── frontend/                 # 前端 (Vue 3 + PixiJS)
│   ├── src/
│   │   ├── components/      # Vue 组件
│   │   ├── views/           # 页面视图
│   │   ├── stores/          # Pinia 状态管理
│   │   ├── services/        # API 服务
│   │   └── utils/           # 工具函数
│   └── vite.config.js       # Vite 配置
│
├── services/                 # 后端微服务
│   ├── auth-service/        # 认证服务 (JWT)
│   ├── hangar-service/       # 机库服务 (棋子管理)
│   ├── map-service/          # 地图服务 (战场管理)
│   ├── combat-service/       # 战斗服务 (核心逻辑)
│   ├── comm-service/         # 通信服务 (WebSocket)
│   └── manage-services.sh    # 服务管理脚本
│
├── PORT_CONFIG.md           # 端口配置文档
├── docker-compose.yml        # Docker 部署配置
└── README.md
```

## 🎯 阵营系统

| 阵营 | 特点 | 核心单位 |
|------|------|----------|
| 地球联合 | 均衡攻防，护甲优秀 | 重装机甲 |
| 拜隆 | 火力强大，远程优势 | 炮击机甲 |
| 马克西翁 | 奇袭系统，隐身突袭 | 隐形机甲 |

## ⚔️ 词条系统

| 词条 | 触发阶段 | 效果 |
|------|----------|------|
| 联防 | movement_check | 阻挡非同阵营穿越 |
| 再动 | on_kill | 击杀后额外回合 |
| 幸运 | turn_start | 额外行动判定 |
| 援助 | on_ally_attacked | 分担伤害/反击 |
| 斩杀 | post_damage | 掷骰≥血量斩杀 |
| 抢夺 | post_damage | 掷骰>3获得武器 |
| 专注射击 | pre_attack | 远程伤害+3~+5 |
| 抗性 | on_damage_taken | 伤害-2 |
| 决斗 | pre_attack | 双方掷骰比大小 |
| 空投 | round_start | 生成武器防具 |

## 🐳 Docker 部署

```bash
# 构建并启动所有服务
docker-compose up -d

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

## 📝 开发指南

### API 端点

| 服务 | 端口 | API 前缀 | 功能 |
|------|------|----------|------|
| auth | 3001 | /api/auth | 登录/注册 |
| hangar | 3002 | /api/hangar | 棋子 CRUD |
| map | 3003 | /api/map | 战场管理 |
| combat | 3004 | /api/combat | 战斗逻辑 |
| comm | 3005 | /api/comm | 实时通信 |

### 添加新词条

参考 `services/combat-service/src/core/tagDatabaseManager.cjs` 中的数据结构规范。

### 添加新阵营技能

使用 `skillToTagConverter.cjs` 将技能转换为词条格式。

## 📄 License

MIT License - 详见 [LICENSE](LICENSE) 文件

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

<div align="center">
  <sub>Built with ❤️ for mecha battle fans</sub>
</div>
