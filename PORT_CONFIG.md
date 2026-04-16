# 机甲战棋游戏 - 端口配置文档

## 统一端口规范

### 后端服务端口 (固定)

| 服务 | 端口 | API前缀 | 说明 |
|------|------|---------|------|
| auth-service | 3001 | /api/auth | 用户认证、登录注册 |
| hangar-service | 3002 | /api/hangar | 棋子/格纳库管理 |
| map-service | 3003 | /api/map | 战场地图管理 |
| combat-service | 3004 | /api/combat | 战斗逻辑、WebSocket |
| comm-service | 3005 | /api/comm | 实时通信、房间管理 |

### 前端端口

| 服务 | 端口 | 说明 |
|------|------|------|
| frontend | 8081 | Vue3 + Vite 开发服务器 |

### WebSocket 配置

- **路径**: `/socket.io`
- **代理到**: combat-service (端口3004)
- **前端连接**: `io()` (自动通过代理)

## Vite 代理配置

```javascript
// vite.config.js
server: {
  port: 8081,
  proxy: {
    '/api/auth': { target: 'http://localhost:3001' },
    '/api/hangar': { target: 'http://localhost:3002' },
    '/api/map': { target: 'http://localhost:3003' },
    '/api/combat': { target: 'http://localhost:3004' },
    '/api/comm': { target: 'http://localhost:3005' },
    '/socket.io': { target: 'http://localhost:3004', ws: true },
  }
}
```

## 前端 API 调用规范

**正确方式** (使用代理)：
```javascript
const API_BASE = '/api/hangar';  // ✅ 通过 Vite 代理
```

**错误方式** (直接访问端口)：
```javascript
const API_BASE = 'http://localhost:3001/api/hangar';  // ❌ 不要这样写
```

## 配置文件位置

- **前端配置**: `frontend/src/config/ports.js`
- **后端配置**: `services/config/ports.js`
- **本文档**: `PORT_CONFIG.md`

## 团队成员注意

1. **所有新页面**必须使用统一的 API_BASE 配置
2. **不要**在代码中硬编码 `localhost:300x` 端口
3. **统一使用** Vite 代理进行 API 调用
4. **修改端口**时需同步更新所有配置文件

---
最后更新: 2026-04-14
