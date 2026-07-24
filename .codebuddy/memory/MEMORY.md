# 项目长期记忆（精简版）

## 服务器与部署（运维核心）
- 地址 `106.54.197.69`，用户 `root`，密钥 `/Users/dingxuyang/Desktop/watson.pem`；服务器项目 `/root/mecha-universe-engine/`（非 git，rsync 整目录同步，exclude node_modules/.git/dist/*.db//data/*.log）。
- **4 容器**：`mecha-gateway`(3006) / `mecha-frontend`(8081→80) / `mecha-comm`(3005) / `mecha-battle-db`(5432)。**无独立 combat 容器**——战斗逻辑打包进 gateway 镜像（`combatBridge.ts` 经 `createRequire` 加载 `.cjs`）。**绝不动 mecha-battle-db**。
- 改码重建：`frontend && npm run build` → `docker compose build --no-cache mecha-gateway mecha-frontend` → `up -d --no-deps <服务>`（避开 db 孤儿冲突；只 restart 会复用旧镜像）。

## 战棋开发宪法 v2.0（红线）
1. Canvas 单向数据管道终点，禁读 Vue ref/reactive/Store。2. `hexUtils.js` 唯一数学真理（HEX_WIDTH=64/HEX_HEIGHT=72 从此导入）。3. 禁无上下文幽灵函数，依赖显式传入。
- 等距基准：iso=ON, shearX=0.38(另有0.25记录), shearY=0, scaleX=1.00, scaleY=0.39, rot=-24；CTM `ctx.transform(scaleX,shearY,shearX,scaleY,0,0)`。
- 前端绘制全在 `frontend/src/utils/hexDraw.js`；编辑器 `NewBattlefieldView.vue` 必须 planar 恒等变换（严禁 planar 残留 iso 反算）。

## 战斗引擎架构（combat-service .cjs 为唯一真实结算路径）
- `skillExecutor.cjs` v5.0 万能语法：只认 `action_type` 5 谓语(attack/heal/buff/debuff/passive) switch，不认技能名；词条=JSON 配置驱动。未知 action_type 落 default **静默失效**（只返回 bonus_value 无副作用）。
- **`trigger` 字段是死字段**（2026-07-24 确认）：仅被 `_getUniversalFields` 读出，无任何调度。`executeExecute/executeSnatch/executeDuel` 全项目零调用（斩杀/抢夺/决斗配了但打不出）；`canReactivate/executeLucky` 同样无调用。真接线的反应钩子只有 `counter`（`_executeAttackSkill:284` 硬编码+词条门控）与 assist/guard/blockade（`skillRegistry.cjs` 注册表+`combatResolver.initSkillCounters`）。
- 网关真实路径：`combat.ts /attack`(L803) 内联 melee/ranged 定义→`executeUniversalSkill`→回写 `currentStats.hp`（L915-930）；`/end-turn`(L486) `isNewRound` 时 round+1+重置AP；`/move`(L1393) `tsFindPath`(L92) 地形加权 Dijkstra，**所有单位格（不分敌我）均视为占位阻塞**。
- `ConditionEvaluator` 白名单仅 4 键：requires_hp_below/requires_unmoved/requires_stealth/target_on_terrain（`hp_threshold_percent` 不在内）。
- `damagePipe.cjs`：`_calcWeaponPenalty`（damageKind==defender.resistance→惩罚）+ 装备/技能 `damage_kind_modifiers` 泛化减伤已存在；地形 `damage_kind_modifiers` 倍率已接入。

## glossary-skill-config.json（v5.0）
- 本地 `services/combat-service/src/config/`；容器 `/app/data/`。段：damage_kinds(5)/action_types(5)/skills(18)/systems(3)/terrains(10)。
- skills 18：block/sweep/throw/execute/duel/snatch/focused_fire/lucky/reactivate + 后补 9(counter/supply/stable/sniper/assist/guard/blockade/scout/polearm)。counter 门控已开。
- category 用容错值 `auto`/`special`（`battleStateFactory.ts:195` isAuto 硬依赖 `auto`，勿硬改）；`cast_range` 必须标量；supply 回血硬编码不读 heal 字段。
- CORE_SKILLS 6 运行时 Object.assign 合并（glossary.ts）；阵营技能 7 独立注册表（factionSkillRegistry.cjs）。
- **词条 key 冲突预警**：现有 `assist`=自动加伤(counter 适用)，与用户新设计的"援助"(替友军分担伤害)同名不同义。

## 六边形/移动/坐标（全链路已统一）
- Even-R 偏移→轴向 `q-(r+(r&1))/2`，立方距离 max(|dx|,|dy|,|dz|)；7 处实现已统一（demo 文件除外）。严禁偏移坐标直接套轴向公式。
- 移动值=总预算不/10；Dijkstra 地形加权（前后端 TERRAIN_COST 对齐，wall=99）。机动换算唯一函数 `computeMobility(parts)`：机体 `max(5,ceil(机动/2))`，载具/背包 `ceil(机动/3)`。

## 高频坑（防复发）
- Vue `<script setup>` 内普通函数用 `xxx.value`；defineExpose 的 ref 跨组件访问被 proxyRefs 拆箱（父组件禁写 `.value`）。
- `createBattle` 用 DB maps 表 UUID，勿硬编码 battlefield_id:1；无 token curl 被 401 拦。
- axios 拦截器对 FormData 删 Content-Type；七视图 view_urls=JSON 对象键 0~6，列表接口返回字符串需 JSON.parse。
- 本地 vite proxy `SERVICE_HOSTS.online` 用 `'localhost'`。
- 战场单位渲染：`createBattleUnit` 须注入 faction/name/codename/unitCode/type/viewUrls；坐标 `position.{q,r}`。

## Royroy 与阵营轮转（2026-07-22 已部署）
- Royroy=unit.royroy 属性模型；/action 路由 deploy/retrieve/damage_royroy；阵营轮转 攻击→防守→偷袭，仅末阵营结束 round+1 重置 AP；activeFaction 门控 move/action。

## Excel 导入 v2.1（现行）
A 列内容驱动（A4~A8 单位名→resolveUnitKey 别名命中）。`ExcelValidator.required=['主机体']`；解析器在网关 excel-parser.ts。

## 文档与待办
- 报告索引：桌面《技能词条完整性审计报告.md》《Royroy与阵营轮转_执行报告.md》；工作区《攻击范围全链路修复报告.md》。
- 未解决：WeirdNova 战局 41abdb30/cce39656 单位状态待用户确认 patch；victory conditions 未接网关实时结算；掩体系统未实装。
- 进行中：特殊触发词条（斩杀/决斗/抢夺/专注射击/幸运/再动/援助/空投/联防/抗性）实现路径报告（2026-07-24，桌面）。
