# 项目长期记忆（精简版）

## 服务器与部署（运维核心）
- 地址 `106.54.197.69`，用户 `root`，密钥 `/Users/dingxuyang/Desktop/watson.pem`
- 服务器项目路径 `/root/mecha-universe-engine/`，**非 git 仓库**，靠 rsync 整目录同步：
  `rsync -az --delete --exclude node_modules --exclude .git --exclude dist --exclude '*.db' --exclude /data --exclude '*.log' -e "ssh -i ~/Desktop/watson.pem" /本地/mecha-universe-engine/ root@106.54.197.69:/root/mecha-universe-engine/`
- **4 容器**：`mecha-gateway`(3006) / `mecha-frontend`(8081→80) / `mecha-comm`(3005) / `mecha-battle-db`(5432)。**无独立 combat/hangar 容器**——战斗逻辑打包进 gateway 镜像（Dockerfile:65 `COPY services/combat-service`，`combatBridge.ts` 经 `createRequire` 加载 `.cjs`）。
- 前端 nginx+Vue3 SPA 反代 `/api/*`→gateway:3006；DB = postgres:14(5432) + 网关 SQLite(`/data/mecha-universe.db`)。**用户硬性要求：绝不动 mecha-battle-db 容器**。
- 前端改码必重建：`cd /root/mecha-universe-engine/frontend && npm run build` → `docker compose build --no-cache mecha-gateway mecha-frontend` → `up -d --no-deps mecha-gateway mecha-frontend`。
- **镜像名陷阱**：`docker compose build mecha-gateway` 产出 `mecha-universe-engine-mecha-gateway`（非 `mecha-gateway:latest`）。只 restart 复用旧镜像，须 `build --no-cache` 后 `up -d --no-deps`。
- **compose 孤儿坑**：旧容器标签名(postgres/frontend)与 compose 服务名(mecha-battle-db/mecha-frontend)不一致，直接 `up -d` 会把 db 当孤儿冲突。**重建应用容器务必 `up -d --no-deps <服务>` 避开 db**。
- 失效清理(2026-07-23)：删除旧容器 `nginx-ssl`(Exited 4周)、删除旧命名/时间戳镜像(`mecha-gateway:latest`、`mecha-universe-engine-frontend:latest`、`mecha-universe-engine_20260623*`)，仅留 3 个 mecha 镜像+基础镜像。

## 战棋开发宪法 v2.0（红线）
1. Canvas 单向数据管道终点，禁读 Vue ref/reactive/Store。
2. `hexUtils.js` 唯一数学真理（HEX_WIDTH=64, HEX_HEIGHT=72 从此导入，禁硬编码）。
3. 禁无上下文幽灵函数，依赖初始化时显式传入。

## 等距视角基准
iso=ON, shearX=0.38, shearY=0, scaleX=1.00, scaleY=0.39, rot=-24；单元64×72，间距H103% V79% O51%。CTM:`ctx.transform(scaleX,shearY,shearX,scaleY,0,0)`。（注：另有记忆记 shearX=0.25，以战场端实际为准。）

## 前端渲染架构（2026-07-22 改造后）
- `frontend/src/utils/hexUtils.js` = 纯数学（坐标/邻居/ISO变换/地形表 `UNIVERSAL_TERRAIN_MAP` 含 `cost`/`height` + `PLANAR_CONFIG` 恒等 + `getHexNeighborsFlatTop`）。**绘制函数全部在 `frontend/src/utils/hexDraw.js`**（`drawHexPath/drawHexPathDeformed/drawIsoHexPath/drawIsoHexPathDeformed/drawIsoHexColumn`），引擎与战斗视图均从 `../utils/hexDraw.js` 导入。
- `HexGridCanvasEngine.vue`：Camera 收拢为 reactive `camera`（`offsetX/offsetY/scale/ISO` 访问器，defineExpose 额外暴露 `camera`）。props：`mode`(planar/iso)、`extrude`(Boolean)、`terrainMaterials`({terrainId:url})。挤出走 `drawIsoHexColumn`，材质 `createPattern` 平铺顶面+纯色回退。
- 编辑器 `NewBattlefieldView.vue` 传 `:mode="'planar'"`，**planar 必须标准正六边形、无等距变形**：绘制/坐标反算均走 `drawHexPath`+`worldOf()` 恒等，**严禁** planar 残留 `drawIsoHexPath*`/`isoInverseTransformPoint`（会导致整张空白+拾取错位，2026-07-23 已回填两坑）。画布固定 50×50，中心 2×2 块=y25:z26 区；`showCenterMarker` 画金框+十字。旧地图加载后 bbox 重定位到中心区（幂等）。
- 地形素材：`routes/terrain.ts` `POST /api/terrain/upload`（鉴权+multer→`/data/images/terrains/`，复用 gateway_data volume）+ `GET /api/terrain/materials/:filename`；前端 `client.js terrainAPI.uploadMaterial`；编辑器写 glossary `terrains[].material_url`→战场 `loadGlossaryConfig`→`terrainMaterials`。
- 略缩图 `BattleMinimap.vue`（地形色+单位点+视口框+`engine.centerOn` 跳转）。

## 前端 DOM 骨架（Phase 25）
App.vue 唯一 `<main>`；子视图根 `.page-container w-full h-full flex flex-col overflow-y-auto`（禁嵌套`<main>`）；战场端 `dm-battle-layout flex flex-row absolute inset-0` + `game-canvas-sandbox relative` + `HexGridCanvas absolute inset-0`。

## glossary-skill-config.json v5.1
容器内 `/app/data/glossary-skill-config.json`；Skills(14)/Terrains(10)/DamageKinds(5)/ActionTypes(5)/Systems(3:ambush,fog_of_war,crit)。range_type: radial/directional_beam(beam_width)/cone。CRUD 深度合并，删用 `_delete_skills`。

## Agent 规则
改码前读 `code-index.md`/`战棋策划文档.md`（服务器 docs/）；改后更新二者+MEMORY+当日 memory。TS 严格、CSS 变量优先。

## 高频坑（防复发）
- Vue 普通函数不在 `<script setup>` 闭包内：用 `xxx.value` 非 `props.xxx`；ref 传参前必 `.value`，否则 NaN→棋子不绘制。
- `createBattle` 404 BATTLEFIELD_NOT_FOUND：DB maps 表用 UUID，勿硬编码 `battlefield_id:1`。无 token curl 被 authenticate 拦 401，勿被误导。
- 本地 vite proxy：`SERVICE_HOSTS.online` 默认容器名 `mecha-online-battle` 本地解析失败→已改 `'localhost'`。
- axios 吞 FormData Content-Type：拦截器对 `instanceof FormData` 删 `Content-Type`。影响 `upload-view`/`factions/upload`/`parse-excel`。
- 七视图：`view_urls` 是 JSON 对象键 0~6 各方向 PNG；上传字段名 `image`。列表接口返回字符串需 JSON.parse，单单位返回对象。
- 战场单位渲染：`createBattleUnit` 须注入 faction/name/codename/unitCode/type/viewUrls；坐标 `position.{q,r}`，前端 `normalizeBattleState` 同步 q/r/id。

## Excel 导入 v2.1（现行）
A 列内容驱动（`A4`~`A8` 填单位名，`resolveUnitKey` 命中别名→标准 key）。`ExcelValidator.required=['主机体']`。400 根因：A4 未精确填"主机体"或 C2 空。解析器在网关 `excel-parser.ts`。旧版 v1 已退役。

## Royroy 与阵营轮转（2026-07-22 已部署）
- Royroy=属性模型 `unit.royroy`（**非独立 BattleUnit**）。`/action` 路由 deploy/retrieve/damage_royroy，activeFaction 门控+6规则（不耗AP、仅攻击耗ATTACK、auto随动重定位、回收回血冷却=round+2、HP=0→destroyed）。
- 阵营整备室定 攻击→防守→偷袭 角色；仅最后活跃阵营结束进 Round+1 统一重置 AP；activeFaction 门控 move/action。
- 文档：桌面 `Royroy与阵营轮转_执行报告.md`/`Royroy与阵营轮转规则书.md`/`机甲战棋完整规则书.md`。
- 构建坑：shared-kernel 新增类型须加进 `src/index.ts` 桶导出；改类型后 `npx tsc --noEmit` 验证否则 `docker compose build` 的 tsc 失败。

## 审计报告 #1~#4（2026-07-23 全修复并部署）
- #1(P0) 新增 `POST /api/combat/:battleId/attack`（`combat.ts:795`），复用 `.cjs` 引擎+距离校验，基础攻击内联定义/技能攻击 UUID→glossary key，响应对齐前端 `combat_result.final_damage`。
- #2/#3(P0/P1) `POST /skill` 新增 `hexDistanceOffset` 距离+`min_cast_range` 最小距离校验（`resolveSkillRange` 三方解析），`OUT_OF_RANGE`/`BELOW_MIN_RANGE`；前端 `skillRangeHexes` 排除 `min_range`(#4)。
- 验证：引擎级近战距离1→`final_damage=12`、远程距离2→`8`、超距→引擎自拦（路由+引擎双层）。
- **运行态残留缺口**：①胜利条件 `checkVictoryConditions` 未接入网关实时结算；②掩体系统仅标签未实装；③装备独立耐久类型已定义但结算未全面接入。

## 移动范围公式（2026-07-23 修正）
移动值=移动力**总预算**（= `currentStats.speed`/`moveRange`），**不再 `/10`**。后端 `/move` 改地形加权 Dijkstra（`backend-gateway/src/routes/terrainCosts.ts` `TERRAIN_COST`，与前端 `UNIVERSAL_TERRAIN_MAP.cost` 对齐，`wall=99`）；前端 `moveRangeHexes` 加权 BFS。combat-service `battleState.js` `movementRange` 同步。⚠️ 旧 `/10` 与 `mobility` 优先均废弃。

## 坐标语义统一红线（2026-07-23）
- 前端 (q,r)=**Even-R Offset**；后端 `tsFindPath`/Royroy 重定位/`getReachableHexes` 统一用**偶数行 offset 方向表**（迁就前端），**禁止**把前端 `getHexNeighbors` 改成 axial 向量（会让高亮与渲染错位）。真正全 axial 需大迁移不排期。
- 旧地图 `maps.cells` 是 `{q,r,terrain}` 对象数组（非 dict），combat.ts `cells.map(c=>`${c.q},${c.r}`)》建 cellSet`；兼容补丁放 maps.ts GET，判空数组补 'moon'。
