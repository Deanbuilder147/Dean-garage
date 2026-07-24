# 机甲战棋 - 端口配置文档

## 服务端口配置

| 服务名称 | 端口号 | API 前缀 | 健康检查端点 | 功能说明 |
|----------|--------|----------|--------------|----------|
| auth-service | 3001 | /api/auth | /health | 用户认证、JWT 签发 |
| hangar-service | 3002 | /api/hangar | /api/health | 机甲管理、棋子 CRUD |
| map-service | 3003 | /api/map | /health | 战场地图、地形编辑 |
| combat-service | 3004 | /api/combat | /health | 战斗逻辑、WebSocket |
| comm-service | 3005 | /api/comm | /api/comm/health | 实时通信 |
| frontend | 8081 | - | http://localhost:8081 | Vue3 前端 |

## 前端代理配置 (vite.config.js)

```javascript
server: {
  proxy: {
    '/api/auth': 'http://localhost:3001',
    '/api/hangar': 'http://localhost:3002',
    '/api/map': 'http://localhost:3003',
    '/api/combat': 'http://localhost:3004',
    '/api/comm': 'http://localhost:3005',
    '/socket.io': {
      target: 'http://localhost:3004',
      ws: true
    }
  }
}
```

## 环境变量

### auth-service
```
PORT=3001
JWT_SECRET=your-secret-key
DATABASE_URL=postgresql://user:pass@localhost:5432/mecha_battle
NODE_ENV=development
```

### hangar-service
```
PORT=3002
DATABASE_URL=postgresql://user:pass@localhost:5432/mecha_battle
NODE_ENV=development
```

### map-service
```
PORT=3003
DATABASE_URL=postgresql://user:pass@localhost:5432/mecha_battle
NODE_ENV=development
```

### combat-service
```
PORT=3004
JWT_SECRET=your-secret-key
DATABASE_URL=postgresql://user:pass@localhost:5432/mecha_battle
NODE_ENV=development
```

### comm-service
```
PORT=3005
JWT_SECRET=your-secret-key
NODE_ENV=development
```

## 数据库

- PostgreSQL: 端口 5432
- 数据库名: mecha_battle

## 开发环境启动顺序

1. 启动 PostgreSQL (5432)
2. 启动 auth-service (3001)
3. 启动 hangar-service (3002)
4. 启动 map-service (3003)
5. 启动 combat-service (3004)
6. 启动 comm-service (3005)
7. 启动 frontend (8081)

## 快捷命令

使用 `services/manage-services.sh` 管理所有服务：

```bash
cd services
./manage-services.sh start    # 启动所有服务
./manage-services.sh stop     # 停止所有服务
./manage-services.sh restart  # 重启所有服务
./manage-services.sh status   # 查看状态
./manage-services.sh cleanup  # 清理僵尸进程
```
