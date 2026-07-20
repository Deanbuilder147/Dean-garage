# Phase 29-CombatStart 断流诊断报告

> 诊断时间: 2026-06-29 | 诊断模式: **纯只读，未修改任何代码**

---

## 故障现象

整备室 (`NewPreparationRoom.vue`) 点击【出击】按钮 → `createBattle failed: Network Error`

---

## 排查项一：前端出击按钮（createBattle）真实请求路径 ✅ 已定位

### 调用链路追踪

| 层级 | 文件 | 行号 | 内容 |
|------|------|------|------|
| 视图层 | `frontend/src/views/NewPreparationRoom.vue` | **267** | `combatAPI.createBattle({ battlefield_id: 1 })` |
| API客户端层 | `frontend/src/api/client.js` | **106** | `createBattle: (data) => apiClient.post('/combat', data)` |
| **实际 HTTP 请求** | — | — | **`POST /api/combat`** (body: `{ battlefield_id: 1 }`) |

### 结论
前端请求路径本身**符合大一统规则**（baseURL=`/api` + path=`/combat` = `/api/combat`），无旧服务废弃路径问题。

---

## 排查项二：网关开战握手链路 🔴 **根因 #1：路由缺失**

### 后端 combat.ts 路由注册表

文件: `mecha-universe-engine/backend-gateway/src/routes/combat.ts`

| 行号 | 方法 | 路由 | 说明 |
|------|------|------|------|
| 39 | GET | `/api/combat/:battleId/state` | 拉取战局快照 |
| 70 | POST | `/api/combat/:battleId/initialize` | 初始化战局（需预先生成 battleId）|
| 116 | POST | `/api/combat/:battleId/action-points/consume` | 消耗行动点 |
| 160 | GET | `/api/combat/:battleId/action-points/:unitId` | 查询行动点 |
| 187 | POST | `/api/combat/:battleId/end-turn` | 结束回合 |
| 212 | POST | `/api/combat/:battleId/damage` | 伤害计算 |

### 🔴 致命发现：`POST /api/combat` **根路由不存在！**

所有 combat.ts 路由均要求 `:battleId` 路径参数。前端调用的 `POST /api/combat` 是**创建新战局的入口**，但后端从未定义此路由。

### 在线实测验证

```bash
# TEST 1: 直连 gateway:3006
$ curl -X POST http://localhost:3006/api/combat -H 'Content-Type: application/json' -d '{"battlefield_id":1}'
→ HTTP 404 {"error":"NOT_FOUND","message":"端点不存在"}

# TEST 2: 通过 frontend:8081 代理
$ curl -X POST http://localhost:8081/api/combat ...
→ HTTP 301 (Nginx 重定向，见下文排查项三)
```

### 关于 Comm 服务依赖

- `combat.ts` 和 `rooms.ts` 内部**无任何向 `mecha-comm:3005` 发起 fetch/axios 的代码**
- `NewPreparationRoom.vue:309` 的 `commAPI.sendMessage()` 在 createBattle **之后**才调用，不是断流原因
- **Comm 服务离线不是 createBattle 失败的直接原因**

---

## 排查项三：Nginx `/api/combat/` 转发审计 🔴 **根因 #2：尾部斜杠不匹配**

### Nginx 配置

文件: `frontend/nginx.conf`

```
行 67-74: location /api/combat/ {
             proxy_pass http://mecha-gateway:3006;
           }
```

### 🔴 尾部斜杠不匹配问题

| 请求路径 | Nginx location 匹配? | 结果 |
|----------|---------------------|------|
| `POST /api/combat` (前端实际发出) | ❌ **不匹配** `/api/combat/` 要求以 `/` 结尾开头 | Fallback 到 `location /` → SPA try_files → **301 或 HTML** |
| `POST /api/combat/` (带尾部斜杠) | ✅ 命中 | 正确代理到 gateway:3006 → 但 gateway 返回 404 |

### 在线实测验证

```bash
# 无尾斜杠 → 301 重定向 (nginx 自动追加 /)
$ curl -X POST http://localhost:8081/api/combat ...
→ HTTP 301 <html>...Moved Permanently...</html>

# 有尾斜杠 → 正确代理但 gateway 404
$ curl -X POST http://localhost:8081/api/combat/ ...
→ HTTP 404 {"error":"NOT_FOUND","message":"端点不存在"}
```

### axios 行为分析

axios 收到 **301 重定向响应**时：
- 默认会跟随重定向，但 POST → 301→ GET 的重定向会导致 **方法变更 + body 丢失**
- 最终到达 gateway 的可能是 `GET /api/combat/`（无 body）→ 仍然 404
- 或者因跨协议/跨域重定向链断裂 → 浏览器层面报 **Network Error**

---

## 综合根因判定（双重故障）

```
┌─────────────────────────────────────────────────────────────┐
│                    Network Error 断流链路                     │
│                                                             │
│  前端                          Nginx              Gateway     │
│  ┌──────────┐    POST /api/combat   ┌─────────┐   ┌────────┐ │
│  │ 出击按钮  │ ──────────────────→ │ /api/combat/│   │  ???   │ │
│  │ :267     │   (无尾斜杠)         │ 未匹配!  │   │  无路由  │ │
│  └──────────┘                      │ ↓        │   └────────┘ │
│                                    │ 301      │              │
│                                    │ fallback │              │
│                                    └─────────┘              │
│                                                             │
│  🔴 根因A: nginx.conf location 需要同时匹配有/无尾斜杠       │
│  🔴 根因B: combat.ts 缺少 POST /api/combat 创建战局路由      │
└─────────────────────────────────────────────────────────────┘
```

| 优先级 | 根因 | 位置 | 修复方向 |
|--------|------|------|----------|
| **P0** | `POST /api/combat` 路由缺失 | `backend-gateway/src/routes/combat.ts` | 新增 `router.post('/api/combat', ...)` 接收 `{ battlefield_id }`，生成 battleId 并返回 `{ battle: { id, ... } }` |
| **P0** | Nginx 尾部斜杠不匹配 | `frontend/nginx.conf:67` | 将 `location /api/combat/` 改为兼容无尾斜杠的写法 |

### 附：其他 combat API 调用（出击流程中后续调用）

以下调用同样受 P0 影响，需要确认后端路由完整性：

| 前端调用 (client.js) | 实际路径 | 后端路由存在? |
|---------------------|---------|--------------|
| `setVictoryConditions(battleId, data)` | `POST /api/combat/{id}/victory-conditions` | ❌ combat.ts 中**不存在** |
| `setAceUnit(battleId, data)` | `POST /api/combat/{id}/ace-unit` | ❌ combat.ts 中**不存在** |
| `setPendingUnits(battleId, data)` | `POST /api/combat/{id}/pending-units` | ❌ combat.ts 中**不存在** |
| `getBattles()` | `GET /api/combat` | ❌ combat.ts 中**不存在**（只有 `GET /api/combat/:id/state`）|

> 这些路由在旧 mecha-combat:3004 服务中存在，迁移至 gateway:3006 时**未完全移植**。

---

## 修复建议（待总监口哨确认后执行）

1. **combat.ts 新增路由**:
   - `POST /api/combat` — 创建战局（接收 battlefield_id，生成 UUID battleId）
   - `POST /api/combat/:battleId/victory-conditions` — 设置胜利条件
   - `POST /api/combat/:battleId/ace-unit` — 设置 ACE 单位
   - `POST /api/combat/:battleId/pending-units` — 上传部署池

2. **nginx.conf 修复**: `location /api/combat/` → 兼容无尾斜杠写法
