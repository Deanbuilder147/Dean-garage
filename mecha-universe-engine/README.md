# 机甲战棋 (Mecha Battle)

> **单体架构入口（Monorepo Root）**：本目录是项目的唯一构建与部署入口。
> 运行时 `docker compose up -d` 与 host 运行脚本 `./run-services.sh`、`./stop-services.sh` 均以此目录为根。
> 顶层 `../` 仅保留独立工具/补丁目录（apps、scripts、fix_scripts、combat-patches、dicescript），不再包含可部署代码副本。

基于微服务架构的机甲战棋游戏，采用 Node.js + Vue3 技术栈。

## 架构概览

```
┌─────────────────────────────────────────────┐
│              Frontend (Vue3 + PixiJS)        │
│              http://localhost:8081            │
└──────────────────┬──────────────────────────┘
                   │ HTTP API + WebSocket
┌──────────────────▼──────────────────────────┐
│  Auth (3001)  │ Hangar (3002) │ Map (3003)   │
│  认证服务      │ 格纳库服务    │ 地图服务      │
├───────────────┼──────────────┼───────────────┤
│  Combat (3004)│ Comm (3005)  │ Online (3006) │
│  战斗服务      │ 通信服务      │ 在线对战服务   │
└───────────────┴──────────────┴───────────────┘
                   │
          ┌────────▼────────┐
          │  PostgreSQL 14   │
          │  (Docker 可选)   │
          └─────────────────┘
```

## 技术栈

- **前端**: Vue 3 + Vite + Pinia + Vue Router + PixiJS + Socket.io
- **后端**: Node.js + Express (ES Modules)
- **数据库**: SQLite (默认) / PostgreSQL (Docker)
- **实时通信**: WebSocket (ws + Socket.io)
- **认证**: JWT
- **部署**: Docker Compose

## 快速开始

### 环境要求

- Node.js 18+
- Docker & Docker Compose (可选)

### 方式一：Docker Compose（推荐）

```bash
# 配置环境变量
cp .env.example .env
# 编辑 .env 填入实际值

# 启动所有服务
docker compose up -d

# 查看状态
docker compose ps
```

### 方式二：本地直接运行

```bash
# 配置环境变量
cp .env.example .env

# 启动所有服务
./run-services.sh

# 停止所有服务
./stop-services.sh
```

## 服务说明

| 服务 | 端口 | 说明 |
|------|:----:|------|
| Frontend | 8081 | 主前端界面 |
| Auth Service | 3001 | 用户认证、JWT |
| Hangar Service | 3002 | 机库/棋子/装备管理，Excel 导入 |
| Map Service | 3003 | 战场地图、六角格管理 |
| Combat Service | 3004 | 战斗核心引擎、回合制、AI、阵营技能 |
| Comm Service | 3005 | Socket.io 实时通信、房间管理 |
| Online Battle Service | 3006 | ELO 匹配、排行榜、在线对战 |
| PostgreSQL | 5432 | 关系型数据库（Docker 可选） |

## 数据库配置

项目支持两种数据库模式，通过 `.env` 中的 `DB_ADAPTER` 切换：

- **SQLite**（默认）: 零配置，数据存储在各服务 `data/` 目录
- **PostgreSQL**: 通过 Docker Compose 启动，适合生产环境

## 目录结构

```
original-project/
├── frontend/                  # 主前端 (Vue3)
├── services/
│   ├── auth-service/          # 认证服务
│   ├── hangar-service/        # 格纳库服务
│   ├── map-service/           # 地图服务
│   ├── combat-service/        # 战斗服务
│   ├── comm-service/          # 通信服务
│   ├── online-battle-service/ # 在线对战服务
│   └── config/                # 共享端口配置
├── apps/                      # 子应用
│   ├── battle-map/            # 战斗地图编辑器
│   ├── chess-system/          # 棋盘系统
│   ├── unit-editor/           # 单位编辑器
│   └── shared-ui/             # 共享 UI 组件
├── scripts/                   # 工具脚本
├── docker-compose.yml
├── .env.example
└── run-services.sh / stop-services.sh
```

## 开发

```bash
# 启动单个服务（开发模式）
cd services/auth-service
npm install
npm run dev

# 启动前端开发
cd frontend
npm install
npm run dev
```

## 许可证

MIT License
