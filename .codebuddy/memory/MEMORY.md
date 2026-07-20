# 项目长期记忆（精简版）

## 服务器与部署（运维核心）
- 地址 `106.54.197.69`，用户 `root`，密钥 `/Users/dingxuyang/Desktop/watson.pem`
- 项目路径 `/root/mecha-universe-engine/`（docker compose 统一管理）
- 前端 `mecha-frontend`：port **8081→80**（nginx + Vue3 SPA，反代 `/api/*` → gateway:3006）
- 网关 `mecha-gateway`：port **3006**（Express 大一统：auth/units/map/glossary/rooms/combat）
- 数据库 `mecha-battle-db`：postgres:14，port 5432；网关同时用 SQLite `/data/mecha-universe.db`
- 网络 `mecha-universe-engine_mecha-net`（bridge）永久焊死，严禁 docker run 临时操作

**部署命令（标准流程）**
```bash
cd ~/mecha-universe-engine
# 前端源码改动 → 需先构建 dist，再重建镜像：
cd frontend && npm run build && cd ..
docker compose build frontend && docker compose up -d frontend
# 网关 TS 改动 → 必须 --no-cache 重建：
docker compose build --no-cache mecha-gateway && docker compose up -d mecha-gateway
```
- Gateway Dockerfile build context = `.`（项目根）
- 前端 Dockerfile 仅 `COPY dist`，故必须先本地/服务器 `npm run build` 生成 dist
- 注意：gateway / frontend 健康检查用 `curl`，若容器无 curl 会显示 unhealthy（实际服务正常，cosmetic）

## 战棋开发终极宪法 v2.0（三条红线）
1. Canvas 是单向数据管道终点，严禁读取 Vue ref/reactive 或全局 Store
2. `hexUtils.js` 是唯一数学真理，坐标转换纯净化（HEX_WIDTH=64, HEX_HEIGHT=72 统一从此导入，严禁硬编码）
3. 禁止无上下文幽灵函数，依赖必须初始化时显式传入

## 等距视角基准（2026-07-20 校准）
- iso=ON, shearX=**0.38**, shearY=0, scaleX=1.00, scaleY=0.39, rot=-24
- 单元=64×72，间距=H103% V79% O51%
- CTM 正向：`ctx.transform(scaleX, shearY, shearX, scaleY, 0, 0)`
- 逆向拾取（2×2 仿射逆矩阵）：det = scaleX*scaleY - shearX*shearY
  - flatX = (worldX*scaleY - shearX*worldY) / det
  - flatY = (scaleX*worldY - shearY*worldX) / det
  - 再按 Even-R 公式推 q,r
- 3D 锁定：编辑器(NewBattlefieldView)保留滑块+保存；战场端(NewBattleView)无滑块，静默拉取 _view

## 前端 DOM 骨架宪法（Phase 25）
- App.vue 全局唯一 `<main>`，Sidebar `flex-shrink-0 w-64`
- 子视图根用 `<div class="page-container w-full h-full flex flex-col overflow-y-auto">`，禁嵌套 `<main>`
- 战场端：`dm-battle-layout flex flex-row w-full h-full absolute inset-0` + `game-canvas-sandbox relative` + `HexGridCanvas absolute inset-0`
- 受归化视图：GlossaryView/NewPreparationRoom/NewHomeView/NewBattlefieldSelector/NewUnitEditorView/NewBattlefieldView

## 词条库（glossary-skill-config.json v5.1）
- 中枢位置：容器内 `/app/data/glossary-skill-config.json`
- Skills(14) / Terrains(10) / DamageKinds(5) / ActionTypes(5) / Systems(3: ambush,fog_of_war,crit)
- range_type: radial(默认) / directional_beam(地图炮,带 beam_width) / cone(扇形)
- CRUD：saveConfig 深度合并；删除用 `_delete_skills:["key"]`；合并按 label 大小写不敏感去重

## Agent 操作规则
- 改代码前先读 `code-index.md` / `战棋策划文档.md`（服务器 `/root/mecha-universe-engine/docs/`）
- 改后同步更新 code-index.md 与 MEMORY.md，写当日 .codebuddy/memory/YYYY-MM-DD.md
- TS 严格模式、CSS 变量优先、命名约定（kebab-case 文件 / PascalCase 组件 / camelCase 函数）

## 已知高频坑（防复发）
- **createBattle 404 BATTLEFIELD_NOT_FOUND**：`NewPreparationRoom.vue` 的 `startBattle` 曾硬编码 `battlefield_id: 1`，而数据库 maps 表用 UUID（如 `a4eba9f1-...`）。修复：改用房间真实 `mapId`（`room.value?.room?.mapId || room.value?.mapId`）。诊断要点：无 token 的 curl 被 authenticate 拦在 401，带 token 才走到 DB 查询暴露 404，勿被 401 误导。
- Canvas 白屏：多因 CSS 孤儿选择器 / 路由守卫竞争 / drawBattleScene 静默异常 → safeDrawBattleScene 错误边界
- 地图编辑器缺 `/api/map/list` → 404（已修，见 maps.ts）
- 网关 `router.use('/api/x', authenticate)` 会剥离前缀，`req.path` 变 `/` → middleware 用 `req.originalUrl` 判断公开路径
