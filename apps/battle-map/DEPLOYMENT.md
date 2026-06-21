# 战斗地图应用部署指南

## 项目结构

```
apps/battle-map/
├── src/
│   ├── assets/
│   ├── components/          # 可复用组件
│   │   ├── TerrainPicker.vue
│   │   └── UnitPanel.vue
│   ├── router/
│   │   └── index.js        # 路由配置
│   ├── stores/
│   │   └── battle.js       # Pinia 状态管理
│   ├── views/
│   │   ├── HomeView.vue
│   │   ├── BattlefieldListView.vue    # 战场列表
│   │   ├── BattlefieldEditorView.vue  # 战场编辑器
│   │   ├── BattlefieldDetailView.vue  # 详细编辑器
│   │   └── BattleView.vue             # 战斗界面
│   ├── App.vue
│   └── main.js
├── index.html
├── package.json
├── vite.config.js
└── README.md
```

## 功能特性

### 战场管理
- ✅ 创建/编辑/删除战场
- ✅ 战场列表展示 (分页)
- ✅ 战场数据导出 (JSON 格式)
- ✅ 公开/私有战场标记
- ✅ 地形系统 (10+ 种地形类型)
- ✅ 格子编辑 (地形、HP、障碍物)

### 战斗系统
- ✅ 创建战斗实例
- ✅ 回合制战斗流程
- ✅ WebSocket 实时通信
- ✅ 单位部署和移动
- ✅ 战斗记录保存

## 安装和运行

### 1. 安装依赖

```bash
cd apps/battle-map
npm install
```

### 2. 配置环境变量

创建 `.env` 文件:

```env
VITE_API_BASE_URL=http://localhost:3003
VITE_WS_URL=ws://localhost:3003
```

### 3. 开发模式

```bash
npm run dev
```

访问 http://localhost:5173

### 4. 生产构建

```bash
npm run build
npm run preview
```

## API 端点

### 战场 API

| 方法 | 端点 | 描述 |
|------|------|------|
| GET | `/api/battlefields` | 获取战场列表 |
| GET | `/api/battlefields/:id` | 获取单个战场 |
| POST | `/api/battlefields` | 创建战场 |
| PUT | `/api/battlefields/:id` | 更新战场 |
| DELETE | `/api/battlefields/:id` | 删除战场 |
| GET | `/api/battlefields/:id/export` | 导出 JSON |
| GET | `/api/terrains` | 获取地形类型 |

### 战斗 API

| 方法 | 端点 | 描述 |
|------|------|------|
| GET | `/api/battles` | 获取战斗列表 |
| GET | `/api/battles/:id` | 获取战斗详情 |
| POST | `/api/battles` | 创建战斗 |
| POST | `/api/battles/:id/start` | 开始战斗 |
| POST | `/api/battles/:id/end` | 结束战斗 |
| GET | `/api/battles/:id/export` | 导出 JSON |

### WebSocket 端点

```
ws://localhost:3003/ws/battle/:id
```

**消息格式:**

```javascript
// 加入战斗
{
  type: 'join',
  payload: {
    playerId: 'player_1',
    team: 'red'
  }
}

// 单位移动
{
  type: 'move',
  payload: {
    unitId: 'unit_123',
    toX: 5,
    toY: 3
  }
}

// 单位攻击
{
  type: 'attack',
  payload: {
    attackerId: 'unit_123',
    targetId: 'unit_456'
  }
}

// 结束回合
{
  type: 'end_turn',
  payload: {}
}
```

## 数据模型

### 战场 (Battlefield)

```json
{
  "id": "uuid",
  "name": "战场名称",
  "width": 20,
  "height": 15,
  "cells": [
    {
      "x": 0,
      "y": 0,
      "terrain_id": 1,
      "hp": 0,
      "occupied": false
    }
  ],
  "is_public": false,
  "created_at": "2026-04-17T00:00:00Z"
}
```

### 战斗 (Battle)

```json
{
  "id": "uuid",
  "battlefield_id": "uuid",
  "status": "waiting|active|finished",
  "current_turn": 1,
  "teams": ["red", "blue"],
  "units": [
    {
      "id": "unit_123",
      "type": "mech",
      "team": "red",
      "x": 5,
      "y": 3,
      "hp": 100,
      "max_hp": 100
    }
  ],
  "created_at": "2026-04-17T00:00:00Z",
  "started_at": null,
  "ended_at": null
}
```

### 地形 (Terrain)

```json
{
  "id": 1,
  "name": "平原",
  "movement_cost": 1,
  "defense_bonus": 0,
  "color": "#84cc16"
}
```

## 路由配置

```javascript
// src/router/index.js
import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import BattlefieldListView from '../views/BattlefieldListView.vue'
import BattlefieldEditorView from '../views/BattlefieldEditorView.vue'
import BattlefieldDetailView from '../views/BattlefieldDetailView.vue'
import BattleView from '../views/BattleView.vue'

const routes = [
  {
    path: '/',
    name: 'Home',
    component: HomeView
  },
  {
    path: '/battlefields',
    name: 'BattlefieldList',
    component: BattlefieldListView
  },
  {
    path: '/battlefields/new',
    name: 'BattlefieldNew',
    component: BattlefieldEditorView
  },
  {
    path: '/battlefields/:id',
    name: 'BattlefieldEdit',
    component: BattlefieldEditorView
  },
  {
    path: '/battlefields/:id/detail',
    name: 'BattlefieldDetail',
    component: BattlefieldDetailView
  },
  {
    path: '/battle/:id',
    name: 'Battle',
    component: BattleView
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
```

## Pinia Store

### battle.js

```javascript
import { defineStore } from 'pinia'

export const useBattlefieldStore = defineStore('battlefield', {
  state: () => ({
    battlefields: [],
    terrains: [],
    loading: false,
    error: null
  }),
  
  actions: {
    async fetchBattlefields() {
      this.loading = true
      try {
        const response = await fetch('/api/battlefields')
        this.battlefields = await response.json()
      } finally {
        this.loading = false
      }
    },
    
    async createBattlefield(data) {
      const response = await fetch('/api/battlefields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
      return response.json()
    },
    
    async exportBattlefieldToJSON(id) {
      const response = await fetch(`/api/battlefields/${id}/export`)
      const data = await response.json()
      
      const jsonString = JSON.stringify(data, null, 2)
      const blob = new Blob([jsonString], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `battlefield_${id}.json`
      a.click()
    }
  }
})

export const useBattleStore = defineStore('battle', {
  state: () => ({
    currentBattle: null,
    ws: null,
    loading: false,
    error: null
  }),
  
  actions: {
    async createBattle(data) {
      const response = await fetch('/api/battles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
      this.currentBattle = await response.json()
      return this.currentBattle
    },
    
    connectWebSocket(battleId) {
      this.ws = new WebSocket(`ws://localhost:3003/ws/battle/${battleId}`)
      
      this.ws.onmessage = (event) => {
        const message = JSON.parse(event.data)
        this.handleWebSocketMessage(message)
      }
    },
    
    handleWebSocketMessage(message) {
      switch (message.type) {
        case 'battle_state':
          this.currentBattle = message.payload
          break
        case 'unit_moved':
          // Update unit position
          break
        case 'unit_attacked':
          // Update unit HP
          break
      }
    },
    
    disconnectWebSocket() {
      if (this.ws) {
        this.ws.close()
        this.ws = null
      }
    }
  }
})
```

## 环境变量

| 变量 | 描述 | 默认值 |
|------|------|--------|
| VITE_API_BASE_URL | API 服务器地址 | http://localhost:3003 |
| VITE_WS_URL | WebSocket 服务器地址 | ws://localhost:3003 |
| VITE_APP_TITLE | 应用标题 | 战斗地图系统 |

## 构建和部署

### 开发环境

```bash
npm install
npm run dev
```

### 生产环境

```bash
npm run build
# 输出到 dist/ 目录
# 部署到 Nginx/Apache/Netlify/Vercel
```

### Docker 部署

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

RUN npm run build

FROM nginx:alpine
COPY --from=0 /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

## 安全考虑

1. **CORS 配置**: 确保 API 服务器允许前端域名
2. **输入验证**: 所有用户输入需要前后端双重验证
3. **速率限制**: API 端点应实施速率限制
4. **认证授权**: 生产环境需要 JWT/OAuth 认证
5. **数据导出**: 限制导出频率和数量

## 性能优化

1. **懒加载**: 路由级别代码分割
2. **缓存**: 使用 IndexedDB 缓存战场数据
3. **虚拟化**: 大地图使用虚拟滚动
4. **WebSocket 重连**: 指数退避重连策略
5. **图片优化**: 地形图片使用雪碧图

## 测试

```bash
# 单元测试
npm run test:unit

# E2E 测试
npm run test:e2e
```

## 故障排除

### 常见问题

**问题**: WebSocket 连接失败  
**解决**: 检查后端服务是否运行，CORS 配置是否正确

**问题**: 地图渲染缓慢  
**解决**: 减少地图尺寸或使用 PixiJS WebGL 渲染

**问题**: 数据导出失败  
**解决**: 检查浏览器弹窗阻止设置

## 扩展开发

### 添加新地形类型

1. 在数据库添加地形记录
2. 在 `stores/battle.js` 更新地形颜色映射
3. 在 `TerrainPicker.vue` 添加新选项

### 添加新战斗模式

1. 创建新的战斗模式组件
2. 在 `BattleView.vue` 添加模式切换
3. 后端添加对应的战斗逻辑

## 许可证

MIT License
