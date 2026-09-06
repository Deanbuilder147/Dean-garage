# 项目长期记忆（精简版）

## 部署与运维（强约束）
- 服务器 `106.54.197.69`/`root`/密钥 `~/Desktop/watson.pem`；项目 `/root/mecha-universe-engine/`（非 git，rsync exclude node_modules/.git/dist/*.db/data/*.log）。
- 容器：`mecha-gateway`(3006)/`mecha-frontend`(8081→80)/`mecha-comm`(3005)/`mecha-battle-db`(5432)。无独立 combat 容器（战斗逻辑打进 gateway）。**绝不动 battle-db**。
- **单一入口 8081**：所有前端改构建进 mecha-frontend，严禁新建子端口验证。验收=资产哈希匹配+新增文案在线。
- gateway 运行时 rsync 同步宿主机 `backend-gateway/dist`；改 `src/*.ts` 须先服务器 `npm run build`（tsc，禁隐式 any），否则不生效。shared-kernel 改动同理须先 `npm run build`。
- 重建：`docker compose build --no-cache mecha-gateway mecha-frontend [mecha-comm] && up -d --no-deps <svc>`。**勿用 `docker compose up -d`**（orphan conflict）；Exited(137) 直接 `docker start`。改 comm 后必 `up -d --no-deps mecha-comm`（硬依赖 JWT_SECRET）。
- 前端构建：rsync→服务器 `cd frontend && npm run build`→`compose build --no-cache mecha-frontend`。（注：`dist-dev/` 污染为**误报**——2026-09-06 核查全仓 grep `dist-dev` 0 命中，构建脚本实为 `node scripts/check-mirror.mjs && vite build`，无 dist-dev 引用，无需 `rm -rf`。）
- 部署通道=腾讯云 Lighthouse 集成（id `lighthouse`，实例 `lhins-2fs1rzs8`/`ap-shanghai`，**2026-09-06 重新授权后 Token 恢复可用**）。`deploy_project_preparation` 上传超时不可用；改用 `execute_command` 的 python3 heredoc 直接改服务器文件 + `npx vite build` + compose build。
- 磁盘满：`docker builder prune -f`；报 ENOSPC/缺模块先 `df -h /`。
- 测试号 `deantest/7654321`(referee)。前端 `user.id` 才是主键，凡取 `userId` 是潜在 bug。

## 战棋宪法 v2.0（红线）
- Canvas 单向数据管道终点，禁读 Vue ref/reactive/Store；尺寸由逻辑层控制，禁 CSS 拉伸。
- `hexUtils.js` 唯一数学真理（HEX_WIDTH=64/HEX_HEIGHT=72）；像素↔hex 标准倍率纯净，缩放/平移/等距在核心外做矩阵逆运算。
- 禁无上下文幽灵函数，依赖显式传入。

## 六段式与原子（真相源）
- 正确六段 = **WHEN→IF→ROLL→DO→AFTER→COST**（WHO 已并入 DO 段首原子）；`HEXSIX_LEGEND` 同此。
- **atomGroups 单一真相源**：`frontend/src/battle/glossary/atomGroups.js`。`GlossaryStudio.vue`/`GlossaryHubNew.vue` 已于 2026-09-06 改为 `import` 该源、删除内嵌副本（原"三副本同步地狱"已收口）；`GlossaryForge*` 亦 import 同一源。改原子只需改 `atomGroups.js` 一处。
- 新增原子必做 3 事：①三副本同步 ②登记 `ENGINE_HANDLERS` 白名单（否则 `unknownAtomTypes` 报错）③effectType 写后端 handlerKey，`semantic` 由 `/combat-glossary/atom-meta` 回填（冲突原子显式写 `semantic`）。
- **文档查找红线**：权威设计文档在工作区根 `docs/`，非仓库内 `mecha-universe-engine/docs/`；搜文档须两处都搜。
- 抽离/新建常量须从现有代码提取并注出处，严禁凭空编写。
- 路径 B 已全落地（真实实现非空壳）；90→97 原子已补齐。`frontend/src/contracts/enums.mirror.js` 自动生成禁手编（真相源 `shared-kernel/src/enums.ts`，跑 `scripts/sync-enums.mjs`）。

## 词条编辑器
- 主编辑器 `GlossaryForgePrismView.vue`（`/glossary-forge-prism`「词条锻造·棱柱工坊」）优先保留。
- 四栏：词条列表｜六段泳道｜语义原子面板（搜索 `atomKw`）｜射程+命中（`HexHitGrid`）。
- 数据链：Prism→`useGlossaryForge.js`→{`laneSkeleton.js`,`atomGroups.js`,`hitAreaModel.js`}。`GlossaryForgeBlueprintView.vue`（`/glossary-forge-blueprint`）共用内核的另一套皮肤。
- `atomGroups`/`LANE_SKELETON` 被 rollup 打进共享 chunk `HexHitGrid-*.js`，验证时 grep 共享 chunk 而非 Prism 自身 chunk。
- 旧单体页 `GlossaryStudio.vue`/`GlossaryHubNew.vue` 现通过 `import { atomGroups } from '../battle/glossary/atomGroups.js'` 复用单一源（2026-09-06 收口），不再内嵌副本。
- 词条库重设计以用户分镜 `~/Desktop/词条库分镜.svg` 为权威输入：SVG 内 `<g id>`（镜头1/2/3 及 when/if/roll/do/effect/cost、词条选择、射程地图、棱镜、宝石嵌入、词条明细、提示栏、详细排列等）**直接作为界面组件名映射**，实现时尽量不自行发明组件/命名。
- **关键概念：「镜头」≠「画面」**。整张 SVG = 一整张「词条库大页面」；镜头1/2/3 是三台**相机取景框**，分别对准大页面的 词条类型区/词条选择区/词条编辑区（横向平铺相邻）。**切换镜头=平移相机看同页不同部位，不是换独立页面**。红绿蓝框仅镜头标注、界面不显示。镜头1 选中方式=**拖拽吸附**（把类型六边形拖入红框目标位释放即选中，点击播放飞入吸附），非简单点击。原型 `prototype/glossary-prototype.html` 已落地（fetch 同目录 svg + viewBox 取景 + foreignObject 叠加交互）。

## 词条库分镜原型（glossary-prototype，交互验证用）
- 目的：落地真实 Vue 组件前，用纯前端原型确认三镜头 UX（用户偏好：先原型确认再替换组件）。
- 源文件：`prototype/glossary-prototype.html` + `prototype/词条库分镜.svg`（相对路径 fetch，HTTP 下正常）。
- **部署（与 mecha Docker 栈同机但独立，暂为独立静态站，最终应统一进 mecha-frontend 词条库页面）**：服务器 `106.54.197.69`（SSH 别名 `myserver`，密钥 `~/Desktop/watson.pem`）；以 `/var/www` 为根，`systemd` 服务 `glossary`（`python3 -m http.server 80 --directory /var/www`）对外；原型在 `/var/www/glossary2/`（`index.html`→`glossary-prototype.html` 软链），URL **http://106.54.197.69/glossary2/**（端口80，根路径 `/` 保留给 mecha-frontend；防火墙已放行，当前在线200）。
- 注：Lighthouse API 集成令牌**曾失效**（报 Token verification failed），**2026-09-06 用户重新授权后已恢复**，集成 API 现可正常调用（analyze/describe 实测通过）；此前部署改用 SSH/SCP+systemd，现已可选回 Lighthouse 通道。与 MEMORY 顶部「部署与运维」里的 mecha 引擎栈是不同服务、互不干扰。
- **已上线（2026-09-06）**：原型源迁入 `frontend/public/glossary2/`（`index.html` 由 `glossary-prototype.html` 拷贝 + 同目录 `词条库分镜.svg`），由 8081 同源 `/glossary2/` 提供；`TheSidebar.vue`「词条展示」外链改为 `/glossary2/`。已同批前端构建部署，8081 `/glossary2/` 与 svg 均返回 200、容器 healthy；80 端口 systemd `glossary` 服务已 `stop`+`disable`（端口 80 释放）。原 `scp` 到 `/var/www/glossary2/` 方式废弃。
- 镜头交互现状：①镜头1 四类型六边形=环形轮播+拖动旋转+点击选中→平移到镜头2；原始尺寸已归一化(`ns=TARGET/bw`)，景深按角度 `t=(sin φ+1)/2` 缩放 0.68~1.34 + 透明 0.5~1（底部6点最大）。②镜头2 白色六边形网格=该类型下词条列表（直接复用 SVG 组件，可点→镜头3）。③镜头3 暂为兜底说明，待改（关系到词条顺利制作）。

## 样式与视觉偏好（用户）
- 样式真相源 `frontend/src/styles/glossary-theme.css`(琥珀)+`variables.css`；`.tactical-*` **不是死代码**——是活跃的 UI 组件库样式（ui/Button·Card·Tag 的 `.tactical-btn/.tactical-card/.tactical-label` + 视图 `.tactical-header`/`.ap-tactical`），删除会破坏样式。TD-16 已复核为误报并关闭。
- 用户高度重视**六边形母题**（机甲/战术核心语言），拒矩形框；首页大六边形蜂巢错位+金色中文+光晕。倾向先原型确认再替换组件。
- 动效：以 `anime-demo/` 动效名（tilt-card/elastic-pop/stagger-fade 等）命名界面动作，从现有类取，缺失再补 demo。
- SVG 素材路线1：原样替换不改造，阴影程序二次加（`filter:drop-shadow`）；禁全内联 `v-html`。
- **「词条编辑」=六边形切面 3D 轴翻转 UI**（资源12.svg，6 片对应六段），原型 `mecha-universe-engine/glossary-edit-prototype.html` 已验收。分片组件通用陷阱：分片须 `inset:0` + `pointer-events:none`，由父容器 `atan2` 角度判定命中；背面绕高线轴预转 180°、内容 `rotate(180deg) scale(1/s)` 补偿。
- **ShapedCanvas**：`clip-path` 裁切+SVG overlay 描边+drop-shadow；`fill=true` 终态 `height:750px`（2026-09-01）。坑：`.shaped-canvas` 须 `width:auto` 覆盖、引擎父须 `flex column` 撑高、验收须硬刷新。

## 战斗架构
- `skillExecutor.cjs` v5.0 五谓语；HP 写回 `applyHpDelta(bu,delta)` 同步顶层+`currentStats`，公式 `next=before+delta`（负值扣血）；前端 `normalizeBattleState` 仅 `hp===undefined` 时回灌。
- `faction`(展示)/`role`(逻辑唯一) 双语义，比 `unit.role` 用 `unitRoleOf(u)=u.role||u.faction` 兜底，禁直接比 `faction`。
- 普通攻击已删除，攻击全由机体携带技能承载（`cast_range` 决定射程，远程真相值=3，源 `shared-kernel/src/hexMath.ts`，前端 `hexUtils.js` 逐字镜像）。
- 移动端 `MobileBattleView.vue` 真战斗界面；`BattleEntryView.vue` 手动选 PC/手机。

## 本机网络与协作
- `github.com` 443 超时；`raw/api.github.com` 可；`npm install` 正常，优先 npm 取库。
- 用户以 anime-demo 动效名命名界面动作，由我按同名实现接入 Vue。
