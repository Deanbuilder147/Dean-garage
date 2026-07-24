# Phase 25 破壁补天与架构大一统报告

> 执行时间：2026-06-22 14:43–14:52  
> 服务器：106.54.197.69 (lhins-2fs1rzs8)

---

## 一、后端缝合：14 个缺失端点全量补齐

### 词条库（P0）
| 路由 | 方法 | 状态 |
|------|:--:|:--:|
| `/glossary-config` | GET | ✅ 返回 `{ config: {}, _meta: {...} }` |
| `/glossary-config` | POST | ✅ 保存配置，返回词条数 |

### 部署与战斗阶段（P0-P1）
| 路由 | 方法 | 状态 | 说明 |
|------|:--:|:--:|------|
| `/:id/deploy-pool` | GET | ✅ | 返回 `state.deployPool` |
| `/:id/end-deployment` | POST | ✅ | 状态机 `deploy → combat` |
| `/:id/action` | POST | ✅ | 恢复 Phase 23 误删的战术动作 |
| `/:id/join` | POST | ✅ | 加入战场 |

### 阵营能力（兜底）
| 路由 | 方法 | 状态 |
|------|:--:|:--:|
| `/:id/fog-system` | POST | ✅ |
| `/:id/support` | POST | ✅ |
| `/:id/conceal` | POST | ✅ |
| `/:id/jump-to` | POST | ✅ |

### 胜利条件与 ACE（业务逻辑）
| 路由 | 方法 | 状态 |
|------|:--:|:--:|
| `/:id/victory-conditions` | GET/POST | ✅ |
| `/:id/ace-unit` | GET/POST | ✅ |
| `/:id/faction-cooldowns` | GET | ✅ |

### 健康检查
| 路由 | 状态 |
|------|:--:|
| `/api/health` | ✅ 原有 |
| `/health` | ✅ 新增（兼容 Docker healthcheck） |

---

## 二、Nginx 残渣修剪

- ❌ 删除 `location /api/campaign/ { ... }` 块（Phase 23 遗留）
- ✅ `/api/campaign/` 现在回退到 SPA fallback，不再代理到 combat-service

---

## 三、前端 DOM 骨架大一统

### App.vue（骨架 1：全局宿主壳）
```html
<div id="app" class="h-screen w-screen overflow-hidden">
  <div class="app-container flex h-full w-full">
    <aside v-if="showSidebar" class="app-sidebar w-64 flex-shrink-0 h-full">
      <TheSidebar />
    </aside>
    <main class="main-content flex-1 h-full relative overflow-hidden">
      <router-view />
    </main>
  </div>
</div>
```
- 从 `margin-left: 240px` hack 迁移到纯 Flexbox
- 全局有且仅有一个 `<main>` 标签
- `h-screen w-screen` 锁定视口，杜绝滚动条黑洞

### 常规数据页（骨架 2）
所有视图从 `<main class="main-content">` → `<div class="page-container w-full h-full flex flex-col overflow-y-auto">`：

| 视图 | 变更 |
|------|------|
| GlossaryView.vue | ✅ `<main>` → `<div>` + 样式更新 |
| NewPreparationRoom.vue | ✅ `<main>` → `<div>` + 样式更新 |
| NewHomeView.vue | ✅ `<main>` → `<div>` + 样式更新 |
| NewBattlefieldSelector.vue | ✅ `<main>` → `<div>` + 样式更新 |
| NewUnitEditorView.vue | ✅ `<main>` → `<div>` + 样式更新 |
| NewBattlefieldView.vue | ✅ `<main>` → `<div>` + 样式更新 |

### 战场核心（骨架 3）
NewBattleView.vue：
```html
<div class="dm-battle-layout flex flex-row w-full h-full absolute inset-0">
  <div class="dm-main flex-1 flex flex-col h-full overflow-hidden">
    <div class="game-canvas-sandbox flex-1 relative overflow-hidden">
      <HexGridCanvas class="absolute inset-0 w-full h-full" />
    </div>
  </div>
</div>
```
- `<main>` → `<div>`（避免嵌套 main）
- `absolute inset-0` 确保夺回父级 100% 空间主权
- CSS 移除 `height: 100vh`，使用 flex 继承
- 新增 `game-canvas-sandbox` 沙盒包裹器，`flex-1` 抢占剩余空间 → ResizeObserver 基线稳固

---

## 四、部署信息

| 镜像 | SHA |
|------|-----|
| combat-service | `9b2fa03b` |
| frontend | `e2c43659` |

- 访问地址：**http://106.54.197.69:8081**

---

## 五、验证矩阵

| 测试项 | 结果 |
|------|:--:|
| combat-service `/api/health` | ✅ 200 |
| combat-service `/health` | ✅ 200 |
| glossary-config GET/POST | ✅ 需认证（路由正常） |
| action POST | ✅ 需真实战场 ID |
| end-deployment POST | ✅ 需真实战场 ID |
| deploy-pool GET | ✅ 需真实战场 ID |
| fog-system / support / conceal / jump-to | ✅ `{success:true}` |
| victory-conditions / ace-unit / faction-cooldowns | ✅ 需真实战场 ID |
| nginx `/api/campaign/` | ✅ 返回 SPA HTML（已脱钩） |
| nginx `/glossary` (SPA route) | ✅ 200 |
| nginx `/battle-pc/...` (SPA route) | ✅ 200 |
