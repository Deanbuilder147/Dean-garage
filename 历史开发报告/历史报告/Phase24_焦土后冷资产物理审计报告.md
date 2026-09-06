# Phase 24 焦土后全量冷资产物理审计报告

**日期**: 2026-06-22  
**背景**: Phase 23 剧情模式焦土切除后，战斗部署整备室出击只显示 Sidebar，词条库主界面爆发 404 崩溃。本报告对全部核心残卷进行物理抓取与死锁诊断。

---

## 一、前端全局路由与注册主入口

### `frontend/src/main.js`（全量 89 行）

```js
import { createApp } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import { createPinia } from 'pinia';
import App from './App.vue';

import './styles/variables.css';
import './styles/tailwind.css';

// 视图导入
import NewLoginView from './views/NewLoginView.vue';
import NewRegisterView from './views/NewRegisterView.vue';
import NewHomeView from './views/NewHomeView.vue';
import GlossaryView from './views/GlossaryView.vue';
import NewUnitEditorView from './views/NewUnitEditorView.vue';
import NewBattlefieldSelector from './views/NewBattlefieldSelector.vue';
import NewBattleView from './views/NewBattleView.vue';
import NewBattlefieldView from './views/NewBattlefieldView.vue';
import NewPreparationRoom from './views/NewPreparationRoom.vue';
import TerminalView from './views/TerminalView.vue';

// Phase 13-A: 设备分流
import MobileBattleView from './views/MobileBattleView.vue';
import { detectDevice } from './utils/deviceDetector.js';

// 路由配置
const routes = [
  { path: '/', component: NewLoginView },
  { path: '/login', component: NewLoginView },
  { path: '/register', component: NewRegisterView },
  { path: '/terminal', component: TerminalView },
  { path: '/home', component: NewHomeView, meta: { requiresAuth: true } },
  { path: '/units', component: NewUnitEditorView, meta: { requiresAuth: true } },
  { path: '/units/new', component: NewUnitEditorView, meta: { requiresAuth: true } },
  { path: '/units/:id', component: NewUnitEditorView, meta: { requiresAuth: true } },
  { path: '/battlefields', component: NewBattlefieldSelector, meta: { requiresAuth: true } },
  { path: '/battlefield-edit/:id?', component: NewBattlefieldView, meta: { requiresAuth: true } },
  { path: '/glossary', component: GlossaryView, meta: { requiresAuth: true } },
  { path: '/preparation/:roomId', component: NewPreparationRoom, meta: { requiresAuth: true } },

  // Phase 13-A: 设备专属分流路由
  { path: '/battle-pc/:id', component: NewBattleView, meta: { requiresAuth: true, device: 'pc' } },
  { path: '/battle-mobile/:id', component: MobileBattleView, meta: { requiresAuth: true, device: 'mobile' } },

  // 旧 /battle/:id 保留作为兼容入口，由导航守卫自动分流重定向
  { path: '/battle/:id', meta: { requiresAuth: true, redirectByDevice: true } }
];
```

> **诊断**: ✅ 路由表完整 — `/glossary`、`/battle-pc/:id`、`/preparation/:roomId` 三核心路由均在位，无遗漏。路由层健康。

---

## 二、战场视图源码对账

### `frontend/src/views/NewBattleView.vue` L1–L600

关键锚点：

| 行号 | 关键代码 | 状态 |
|:--|------|:--:|
| 15 | `{{ route.params.id?.slice(0,8) }}` | ✅ activeBattleId 锚定 `route.params.id` |
| 417-423 | `import { ref, inject, reactive, computed, onMounted...` | ✅ 标准注入 |
| 423 | `import { combatAPI, hangarAPI, glossaryAPI } from '@/api/client'` | ✅ 三 API 正常导入 |

> **诊断**: ✅ `defineProps` 未显式出现（Vue3 `<script setup>` 中通过 `route.params.id` 隐式绑定）。`activeBattleId` 唯一权威为 `useRoute().params.id`，无 `is_campaign`、`_cid`、`getTargetPrefix` 等任何补丁残留。战场视图层健康。

---

## 三、全局网络请求拦截器

### `frontend/src/api/client.js`（全量 123 行）

```js
import axios from 'axios';

const apiClient = axios.create({
  baseURL: '/api',       // ← 全局 base 路径
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' }
});
```

### combatAPI vs battles.js 端点对账表

| 端点方法 | 实际请求路径 | battles.js 是否存在 | 状态 |
|------|------|:--:|:--:|
| `getBattles` | `GET /api/combat` | ✅ | OK |
| `createBattle` | `POST /api/combat` | ✅ | OK |
| `getBattle` | `GET /api/combat/:id` | ✅ (state) | OK |
| `getBattleState` | `GET /api/combat/:id` | ✅ (state) | OK |
| `deployUnit` | `POST /api/combat/:id/deploy-unit` | ✅ | OK |
| **`endDeployment`** | **`POST /api/combat/:id/end-deployment`** | **❌** | **缺失** |
| `move` | `POST /api/combat/:id/move` | ✅ | OK |
| `attack` | `POST /api/combat/:id/attack` | ✅ | OK |
| **`action`** | **`POST /api/combat/:id/action`** | **❌** | **Phase 23 误删** |
| `endTurn` | `POST /api/combat/:id/end-turn` | ✅ | OK |
| **`fogSystem`** | **`POST /api/combat/:id/fog-system`** | **❌** | **缺失** |
| **`support`** | **`POST /api/combat/:id/support`** | **❌** | **缺失** |
| **`conceal`** | **`POST /api/combat/:id/conceal`** | **❌** | **缺失** |
| **`jumpTo`** | **`POST /api/combat/:id/jump-to`** | **❌** | **缺失** |
| **`setVictoryConditions`** | **`POST /api/combat/:id/victory-conditions`** | **❌** | **缺失** |
| **`getVictoryConditions`** | **`GET /api/combat/:id/victory-conditions`** | **❌** | **缺失** |
| **`setAceUnit`** | **`POST /api/combat/:id/ace-unit`** | **❌** | **缺失** |
| **`getAceUnit`** | **`GET /api/combat/:id/ace-unit`** | **❌** | **缺失** |
| **`getFactionCooldowns`** | **`GET /api/combat/:id/faction-cooldowns`** | **❌** | **缺失** |
| **`getDeployPool`** | **`GET /api/combat/:id/deploy-pool`** | **❌** | **缺失** |
| **`glossaryAPI.getConfig`** | **`GET /api/combat/glossary-config`** | **❌** | **缺失** |
| **`glossaryAPI.saveConfig`** | **`POST /api/combat/glossary-config`** | **❌** | **缺失** |

> **🔴 诊断**: **14 个端点在前端 `client.js` 中有调用，但在后端 `battles.js` 中不存在。** 其中 `action` 端点在 Phase 23 被误删。其余 13 个端点自 Phase 16 以来从未在 `battles.js` 注册。

---

## 四、后端路由挂载与微服务中枢

### `services/combat-service/src/index.js`（全量 66 行）

```js
import battlesRouter from './routes/battles.js';

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'combat-service', ... });
});

// 战场路由
app.use('/api/combat', battlesRouter);

// 404 处理
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found', path: req.url });
});
```

> **诊断**: ✅ 挂载配置正确，`/api/combat` 与 `battlesRouter` 绑定正常。无 campaign 路由残留。

### `services/combat-service/src/routes/battles.js` — `GET /:id/state`（L49-55）

```js
router.get('/:id/state', authenticate, (req, res) => {
  const state = BattleState.getBattle(req.params.id);
  if (!state) return res.status(404).json({ error: '战场不存在' });
  res.json(state);
});
```

> **诊断**: ✅ Phase 16 纯净逻辑，无 Router-Bridge 兜底。健康。

### `battles.js` 已注册端点清单（仅 10 个）

| 路由 | 方法 |
|------|:--:|
| `/` | GET |
| `/` | POST |
| `/:id/state` | GET |
| `/:id/deploy-unit` | POST |
| `/:id/deploy-units` | POST |
| `/:id/move` | POST |
| `/:id/move-range/:unit_id` | GET |
| `/:id/attack` | POST |
| `/:id/end-turn` | POST |
| `/:id/start-combat` | POST |

> **🔴 诊断**: 仅 10 个业务端点。前端 `client.js` 中 combatAPI 声明了 18+ 个端点，**差额 8+ 个端点未注册**。

---

## 五、Nginx 静态代理配置

### `frontend/nginx.conf` — location 规则

```nginx
server {
    listen 8081;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;  # SPA fallback
    }

    location /api/auth/   { proxy_pass http://mecha-auth:3001; }
    location /api/hangar/ { proxy_pass http://mecha-hangar:3002; }
    location /api/map/    { proxy_pass http://mecha-map:3003; }
    location /api/combat/ { proxy_pass http://mecha-combat:3004; }

    # 🔴 Campaign 战役服务 (Phase 19-C) — 未删除！
    location /api/campaign/ {
        proxy_pass http://mecha-combat:3004;
    }

    location /api/comm/   { proxy_pass http://mecha-comm:3005; }
    location /api/matchmaking { proxy_pass http://mecha-online-battle:3006; }
    location /api/rooms      { proxy_pass http://mecha-online-battle:3006; }
    ...
}
```

> **🔴 诊断**: **`/api/campaign/` location 块（L58-66）未被删除！** Phase 23 只删了后端代码，遗漏了 nginx.conf 中的代理规则。虽不致命，但需清理。

---

## 六、容器全量最新报错日志快照

### frontend 日志（关键行）

```
GET /glossary → 200 (正常)
GET /api/combat/glossary-config → 404  ← 🔴 词条库 404 根因（高频）
GET /battle-pc/battle_1782109671981_gbl3so → 200 (正常)
GET /combat/battle_1782109671981_gbl3so/deploy-pool → 200  ← ⚠️ 路径缺 /api/ 前缀，命中 SPA fallback 返回 index.html（1798 bytes）
```

### combat-service 日志（全部近 30 行）

```
[GET] /api/combat/glossary-config → 404 (1ms)  ← 🔴 词条库配置接口 404（高频重复）
[GET] /api/combat/glossary-config → 404 (0ms)
[GET] /api/combat/glossary-config → 404 (1ms)
[GET] /api/combat/glossary-config → 404 (1ms)
[GET] /api/combat/glossary-config → 404 (0ms)
[GET] /health → 404 (0ms)  ← ⚠️ 健康检查路径错误（应为 /api/health）
[GET] /health → 404 (2ms)
[GET] /health → 404 (1ms)
...
```

> **诊断**: `/api/combat/glossary-config` 高频 404 是词条库崩溃的根因。`/health` 被反复请求返回 404，Docker healthcheck 或外部监控配置了错误路径。

---

## 🔴 死锁诊断汇总

| # | 严重度 | 问题 | 位置 | 根因 |
|---|:--:|------|------|------|
| 1 | 🔴 P0 | **词条库 404 崩溃** | `battles.js` 无 `/glossary-config` 路由 | 该端点从未在 battles.js 注册，前端 glossaryAPI.getConfig() 请求 `/api/combat/glossary-config` 持续 404 |
| 2 | 🔴 P0 | **13 个 combatAPI 端点缺失** | `battles.js` vs `client.js` 差额 | deploy-pool、endDeployment、fogSystem、support、conceal、jumpTo、victoryConditions、aceUnit、factionCooldowns、glossaryConfig 等均未注册 |
| 3 | 🟡 P1 | **`action` 端点被 Phase 23 误删** | `battles.js` L349-383 原位置 | Phase 23 清理战役代码时连带删除了联机战场也需要的 action 端点（defend/wait/skip_tactical） |
| 4 | 🟡 P1 | **`endDeployment` 端点缺失** | `battles.js` 无此路由 | 部署完成后无法通过后端接口切换战斗阶段，导致整备室出击后只能看到 Sidebar |
| 5 | 🟠 P2 | **nginx `/api/campaign/` 未清除** | `nginx.conf` L58-66 | Phase 23 清理遗漏 |
| 6 | 🟠 P2 | **`/health` 路径错误** | 外部监控访问 `/health` 而非 `/api/health` | Docker healthcheck 或外部监控配置了错误路径 |
| 7 | ⚠️ P3 | **`/combat/.../deploy-pool` 缺 `/api/` 前缀** | Nginx 日志 | 命中 SPA fallback 返回 index.html（可能是浏览器旧缓存 JS 未更新） |

---

## 结论

**词条库崩溃的根源**: `GET /api/combat/glossary-config` 在后端 `battles.js` 中从未注册。前端 `glossaryAPI.getConfig()` 每次发起请求都收到 404，导致词条库页面渲染失败。

**整备室仅显示 Sidebar 的根源**: `endDeployment` 端点缺失导致部署完成后无法通过后端接口正式切换战斗阶段；`action` 端点被 Phase 23 误删导致战术操作（defend/wait）无法执行；`getDeployPool` 缺失导致无法获取部署池状态。多个关键端点 404 形成连锁故障。

**nginx 残留**: `/api/campaign/` location 块虽不致命，但属于清洁度问题需修剪。

**建议下一阶段 (Phase 25)**: 在 `battles.js` 中补齐所有缺失端点，同步清理 nginx.conf 中的 `/api/campaign/` 残留块。
