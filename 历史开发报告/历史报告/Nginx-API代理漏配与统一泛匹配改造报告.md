# Nginx API 代理漏配与统一泛匹配改造报告

> 生成日期：2026-07-27
> 背景：地形素材上传 `POST /api/terrain/upload` 线上报 `405 Method Not Allowed`，根因为 nginx 缺 `/api/terrain/` location 块。本报告在用户洞察（两类同源问题）基础上，对全站 nginx 配置与后端 `app.ts` 路由挂载做了逐一核对，并评估"统一泛匹配"方案的可行性。

---

## 一、结论先行

**你的理解 100% 正确，且统一泛匹配方案完全可行。**

我额外发现：除已报的 `terrain` 外，还存在**第二个真实漏配模块 `/api/asset-gen/`**（AI 素材生成，前端 `AssetGenPanel.vue` 实际调用）。它现在线上同样处于"POST 报 405 / GET 返回 HTML 崩溃"的状态，只是因为功能入口较深尚未被用户踩到。

把十几个零碎的 `/api/xxx/` location 块替换成**单个 `location /api/` 泛匹配块**，是彻底消除此类同源问题的正确解法。

---

## 二、两类同源问题的机制（与你的描述一致）

### 问题①：伪装成 200 OK 的"前端 JSON 解析崩溃"（GET 漏配）

- nginx 对 `/api/xxx`（无对应 location 块）走 `location /` 兜底：`try_files $uri $uri/ /index.html`。
- GET 请求找不到静态文件 → 回退返回 **`index.html` 的 HTML 源码**，**HTTP 状态码是 200 OK**。
- 前端 axios 按 `responseType:'json'` 解析 → 撞上 `<!DOCTYPE html>` → 控制台爆红：
  `Uncaught SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON`
- `<img>` 标签若指向漏配的图片接口，会显示裂图（试图把 HTML 当图片解析）。

### 问题②：新模块"全军覆没"（POST 漏配 + GET 漏配并存）

- nginx `location` 是**手动枚举**的（当前有 `/api/auth/ /api/hangar/ /api/map/ /api/combat /api/comm/ /api/matchmaking /api/rooms /api/leaderboard /api/battles /api/campaign/ /api/units /api/admin/ /api/combat-glossary/`）。
- 只要后端 `app.ts` 挂载了新前缀（如 `terrain`、`asset-gen`，或未来的 `achievements`/`guilds`/`inventory`），而写 nginx 的人**忘了补 location 块**，该模块线上即整体失效：POST 走静态文件 → 405；GET 走兜底 → 200 + HTML。
- 本质：维护成本随模块数线性增长，且**错误静默**（GET 甚至不报错，只是功能悄悄坏掉）。

---

## 三、实测核对：nginx 配置 vs 后端 `app.ts` 路由挂载

我对比了 `frontend/nginx.conf`（279 行）与 `backend-gateway/src/app.ts`（190 行）及所有 `routes/*.ts` 的真实路径前缀。

### 后端实际挂载的路由前缀（`app.ts`）

| 后端前缀 | 挂载方式 | nginx 是否有块 | 状态 |
|---|---|---|---|
| `/api/auth/` | `app.use(authRoutes)` | `/api/auth/` | ✅ 已配 |
| `/api/rooms` | `app.use(roomRoutes)` | `/api/rooms` | ✅ 已配 |
| `/api/units` | `app.use(unitRoutes)` | `/api/units` | ✅ 已配 |
| `/api/admin/` | `app.use(adminRoutes)` | `/api/admin/` | ✅ 已配 |
| `/api/combat` | `app.use(combatRoutes)` | `/api/combat` | ✅ 已配（注：无尾斜杠，前缀匹配仍覆盖） |
| `/api/map/` | `app.use(mapRoutes)` | `/api/map/` | ✅ 已配 |
| `/api/combat-glossary/` | `app.use('/api/combat-glossary', glossaryRoutes)` | `/api/combat-glossary/` | ✅ 已配 |
| `/api/comm/` | `app.use('/api/comm', authenticate)` + 内联 | `/api/comm/` | ✅ 已配 |
| `/api/campaign/` | 内联 `GET /api/campaign/trial` | `/api/campaign/` | ✅ 已配 |
| **`/api/terrain/`** | `app.use('/api/terrain', terrainRoutes)` | ❌ **无** | 🔴 **漏配（已报 405）** |
| **`/api/asset-gen/`** | `app.use('/api/asset-gen', assetGenRoutes)` | ❌ **无** | 🔴 **漏配（新发现）** |
| **`/api/debug/`** | 内联 `POST /api/debug/skill-test` | ❌ **无** | 🟡 漏配但仅调试用（见 §五 安全提醒） |

### nginx 中存在但后端未挂载的"死配置"（无害，可删）

`/api/hangar/`、`/api/matchmaking`、`/api/leaderboard`、`/api/battles` —— 后端 `app.ts` 当前**完全没有**挂载这些路由（无对应 `app.use`/导入）。它们只是冗余配置，不影响功能，但在统一改造时一并清理更干净。

---

## 四、发现的真实漏配清单（需修复）

1. **`/api/terrain/`（已确认）** —— `terrain.ts` 暴露 `POST /upload`（素材上传）与 `GET /materials/:filename`（素材下载）。线上上传报 405，下载会拿到 HTML 导致裂图。
2. **`/api/asset-gen/`（新发现）** —— `assetGen.ts` 暴露 `POST /generate`（上传参考图 → Meowa AI 生成）与 `GET /credits`（积分查询）。前端 `AssetGenPanel.vue` 已接入侧边栏。线上：上传参考图会 405，积分查询会拿到 200+HTML 并在前端 JSON 解析崩溃。功能尚未被用户广泛踩到，但属于真实潜伏缺陷。
3. **`/api/debug/`（安全提醒）** —— 内联 `POST /api/debug/skill-test`，**无 `authenticate` 中间件**（公开可调用）。当前因无 nginx 块而"意外不可达"；统一改造后会被公开暴露，需在后端禁用或加鉴权（见 §五）。

---

## 五、统一泛匹配方案：可行性评估与关键陷阱

### 方案（推荐最终形态）

删除全部零碎 `/api/xxx/` 块，保留 `location /`（SPA 兜底）与 `location /assets/`（静态缓存）与 `location /socket.io/`（WebSocket，独立上游），新增：

```nginx
    # 统一代理所有 /api/ 请求到网关（消除逐模块手动枚举的根因）
    location /api/ {
        add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: wss:; font-src 'self'; worker-src 'self' blob:; frame-ancestors 'self';" always;
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-Frame-Options "SAMEORIGIN" always;
        proxy_pass http://mecha-gateway:3006;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
```

### 可行性：✅ 完全可行，并附带 4 个必须注意的陷阱

| # | 陷阱 | 说明 | 处置 |
|---|---|---|---|
| 1 | **`proxy_pass` 绝不能带尾斜杠** | 必须写 `proxy_pass http://mecha-gateway:3006;`（无 `/`）。若写成 `...:3006/`，nginx 会**剥离 `/api/` 前缀**，把 `/api/terrain/upload` 转发成 `/terrain/upload` → 后端 404。现有各块均为无尾斜杠，保持一致即可。 | 严格照上面片段 |
| 2 | **CSP 等 `add_header` 必须写在块内** | nginx `add_header` 不继承：只要某 location 出现任一 `add_header`，server 级继承链即断绝。统一块内必须显式注入完整 CSP/安全头（片段已含）。 | 已含 |
| 3 | **`/socket.io/` 必须保留独立块** | 它代理到 `http://mecha-gateway:3006/socket.io/`（带尾斜杠 + 路径保持），属于 WebSocket 上行，不应被 `/api/` 泛匹配吞掉。`/socket.io/` 不在 `/api/` 前缀下，本身不会被误匹配，但改造时不要删它。 | 保留 |
| 4 | **`/api/debug/` 暴露风险** | 统一后 `/api/debug/skill-test`（无鉴权）将对公网开放，属安全隐患。后端代码注释已标注"调试用，生产环境应禁用"。 | 建议在后端 `app.ts` 将该路由改为 `if (config.nodeEnv === 'development')` 包裹，或在统一块内加 `location /api/debug/ { deny all; }` 子块（前缀更长优先匹配）。 |

### 额外收益

- **消除前缀/尾斜杠不一致的雷**：原配置 `/api/combat`、`/api/rooms`、`/api/units` 用无尾斜杠前缀，其余用尾斜杠，语义微妙（无尾斜杠的前缀会误匹配 `/api/commerce` 之类未来路由）。统一为 `/api/` 后语义唯一、可预期。
- **新增模块零配置**：今后后端加任何 `/api/xxx`，nginx 自动转发，不再有"忘加块→全军覆没"的可能。
- **删除 4 个死配置块**（hangar/matchmaking/leaderboard/battles），配置更瘦。

---

## 六、部署注意（与地形 405 完全相同的坑）

`nginx.conf` 在 `frontend/Dockerfile` 第 4 行 **构建期 COPY 进容器**（`COPY nginx.conf /etc/nginx/conf.d/default.conf`），不在 `dist/` 内。因此：

1. 改完 `frontend/nginx.conf` 后，**必须重建前端镜像**，光 `npm run build` 不会更新 nginx 配置。
2. 服务器路径：`/root/mecha-universe-engine/frontend/nginx.conf`。
3. 重建：`docker compose build --no-cache mecha-frontend` → `docker compose up -d --no-deps mecha-frontend`。
4. 验证：
   - `curl -X POST http://localhost:8081/api/terrain/upload -F "file=@某图.png" -F "terrain=forest"` → 应返回后端 JSON（不再 405）。
   - `curl http://localhost:8081/api/asset-gen/credits` → 应返回 JSON（不再 HTML）。
   - `curl http://localhost:8081/api/map/list` → 仍正常 200（回归验证既有模块未被破坏）。

---

## 七、总结

- 你的两类同源问题判断精准：GET 漏配 = 200+HTML 静默崩溃；POST 漏配 = 响亮 405。
- 实测漏配：`terrain`（已报）+ `asset-gen`（新发现，真实在用模块）+ `debug`（仅安全提醒）。
- 统一 `location /api/` 泛匹配方案**可行且是根治之法**，落地时注意 §五 的 4 个陷阱（尤其 `proxy_pass` 禁带尾斜杠、CSP 块内化、保留 socket.io、收敛 debug 暴露）。
- 实施需重建前端镜像，非热更新。

> 本报告仅作分析，未改动任何文件。如需我直接改写 `nginx.conf` 并走部署，请确认（建议在 Craft 模式下执行 rsync + 重建镜像 + 验证）。
