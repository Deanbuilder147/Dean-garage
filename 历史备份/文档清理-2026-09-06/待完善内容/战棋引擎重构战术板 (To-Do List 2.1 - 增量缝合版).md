# 战棋引擎重构战术板 (To-Do List 2.1 - 增量缝合版)

> 基于 `战棋引擎重构战术板 (To-Do List 2.0)` + `冲突与风险评估报告` + 架构拍板（裁决1-6 与 P0/P1/P2/P4/P7 决议）整合。
> 策略：**复用优先 + 增量补齐**，严禁重写已存在底层机制。
> 状态图例：✅ 已定稿 / ⚠️ 已定调但需补实现细则 / 🔴 仍有疏漏待拍板
> 代码事实依据见各任务「修改细则」。

## 🔒 验收门槛红线（2026-07-29 复盘新增，防再次带病上线）
> **根因**：原计划只定义了"造什么 / 按什么依赖顺序造"，没定义"怎样算真通"。后端任务被标 done 的验收标准是"路由存在 + curl 返回正确 JSON"（接口层），而三个致命 bug（units Map 序列化丢失 / nginx 代理指错服务 / 伏击拦截漏触发推送）全在"前后端交界带"，单独测任一侧都发现不了，直到前端接线才暴露。依赖倒置拓扑又把后端整段排在前面，使其空置许久无真实消费者。
>
> **新红线（每个任务标 ✅ 前必须通过）**：
> 1. **禁止"接口级 done"**：路由通 ≠ 功能通。任何涉及前后端交互的任务，必须走通"前端真实消费"或"双端联调"才算 done。
> 2. **边界 bug 必须显式 checklist**：序列化（Map/Set→数组）、网络出口（代理/端口指向真实服务）、跨服务推送触发点（battleStore.set 等广播点）三处列为每任务的强制自查项。
> 3. **鉴权默认从严**：写操作路由（尤其响应类 / 代投类）必须在路由层挂 `authenticate`，且身份绑定（userId→ownerId）取 token 而非 body。
> 4. **每个 Batch 收尾必须留 E2E 证据**（curl 脚本或浏览器录屏），无证据不得进下一 Batch。

---

## 🚀 执行流水线计划（Batches — 依赖倒置拓扑）

> 执行原则：严格遵循依赖倒置拓扑，前置未通，后置不启。图例：✅ 已落地并部署 / ⏳ 待执行 / 🔴 阻塞。
> **2026-07-29 进度（终态）**：A / B-2.2 / B-4.1 / B-2.1 / C-1 / C-2 / C-3 / C-4 / D-4.2 / D-4.3 全部已落地并部署。剩余唯一未闭环：**完整战斗 E2E（隐身→移动伏击→QTE→结算）需浏览器双端联调**——curl 已验证 auth plumbing（无 token→401 / 有 token→409 到达决策）与 rooms.roster_locked 迁移生效，但奇袭完整链路需真实双端会话。

**Batch A：底层数据流闭环（阶段零 + 阶段一）** ✅ 已部署
- ✅ 任务 1.0：Gateway→Comm 内部推送端点 `POST /internal/sync-state`（`commPush.ts` fire-and-forget，密钥 `mecha-internal-sync`），保留 `GET /state` 作初始加载。
- ✅ 任务 1.1 & 1.2：推送流实装 P1（join-battle 服务端 Faction 鉴权 + `applyFog` 迷雾拦截）与 P8（`combatLog[]` 战报缓冲）。

**Batch B：权限、大厅与核心前置（阶段二 + 任务 4.1）** ✅ 已部署
- ✅ 任务 2.1：名册锁定（`NewPreparationRoom.vue` + `rooms.ts` 锁状态）——后端 `rooms` 表加 `roster_locked` 列（含存量迁移）+ join/leave 拒绝 + 房主 `lock-roster` 端点 + 开战自动锁；前端 `NewPreparationRoom.vue` 归一化 room 取值并加房主锁定/解锁按钮。已部署，迁移列已验证存在。
- ✅ 任务 2.2：GM Override Bypass 特权（集中 `canIssueCommand`：neutral 可行动 + REFEREE/DOMINATOR 越权放行）——已落地。
- ✅ 任务 4.1（隐匿主动技能）：后端 `POST /api/combat/:id/stealth`（enter/exit，耗 1 MOVE AP，复用 `effectExecutor.handleEnterStealth`）——后端已竣工；前端按钮待 Batch C/D 接线。

**Batch C：前端重组与队列基建（阶段三 + D7 铺路）** ✅ 已部署
- ✅ C-1 实时推送消费：前端经 nginx `/socket.io/` → comm 连接，消费 `battle-state` 事件叠加在 `refreshState` 之上（修复 `commPush` 的 `units` Map 序列化丢失 bug + nginx 代理从 gateway 改指 comm:3005；`/attack`、`/move` 伏击拦截补齐 `battleStore.set` 触发推送）。已部署并验证 socket 握手成功。
- ✅ 任务 3.1 / C-2 Pinia 抽离：`stores/apStore.js`/`moveStore.js`/`logStore.js` 落地，`refreshState` 同步行动点/战报/移动模式；`NewBattleView.vue` 实例化并接线。
- ✅ D7 / C-3 Animation Queue：`utils/animationQueue.js` 串行化 + 去重合并 + 冻结/解冻，socket 推送经 `enqueueState` 消费，伏击红警期间 `freezeQueue` 防撕裂；已部署 lint 通过。
- ✅ 任务 3.2 依赖的 P1 Faction 映射（后端）已通；✅ C-4 Visitor View：`isVisitor`（不在 factionRoles 且非 GM）隐藏操作栏（`ap-actions` 加 `v-if="!isVisitor"`）。（任务 3.3 骰子工坊已上线，跳过）

**Batch D：高阶玩法收尾与落地（阶段四修正版）**
- ✅ 任务 4.3（反应奇袭）后端：双段中断状态机 `pendingSurprise` + 10s 超时清算 + `surpriseDebtLock` 锁死 + `tactical_overwatch` 词条 + `ambushMultiplier` + D9-1~12 全落地；`GET /state` 暴露 `surprise` 字段——已部署。
- ✅ 任务 4.3 前端：10s QTE 面板（替换/反击/放弃 + 倒计时自动放弃）+ 暗绿 Screen Tone 滤镜 + `surprise-choice` 提交（`combatAPI.surpriseChoice`）已接线并部署；✅ Animation Queue 接入（C-3）已做；✅ **D-4.3 服务端鉴权加固**：`surprise-choice` 的 GET/POST 挂 `authenticate`，并改取 token 的 `userId`/`role` 绑定 `lockedUnit.ownerId`（取代原 body.referee 信任），防冒充代投——curl 验证：无 token→401、有 token→409 到达决策。
- ✅ 任务 4.2（移动伏击）后端：依托 4.1 隐匿前置，移动路径拦截 + `overwatch-triggered` + RNG 命中/暴击 + 破隐——后端已落。
- ✅ 任务 4.2 前端：移动伏击红屏警报（`ambushAlert` 叠加层）已接线并部署（基于 `/move` 响应 `ambushed`）；⏳ 监听独立 `overwatch-triggered` 事件 + 攻击动画未做（reactor 经 socket 推送收到 QTE，mover 端红警已覆盖）。

> **执行顺序（依赖倒置）**：A✅ → B(2.2✅/4.1后端✅/2.1⏳) → C⏳(Pinia+Queue+Visitor) → D-4.3前端⏳ + D-4.2前端⏳。
> **当前推进策略**：Batch C + D 前端灰度。前端采用「推送消费叠加在 `GET /state` 轮询之上」策略（保留轮询作初始加载与兜底），避免整体替换 6000+ 文件的高风险；每一步均服务器 build + 部署 + 验证后再进下一步。

---

## 🏛️ 核心裁决（已拍板，宪法级定调）

1. 权限沿用 `USER/REFEREE/ADMIN/DOMINATOR`；GM=`REFEREE`，Dominator=`DOMINATOR`，Visitor=无阵营 `USER` 临时态。
2. 新"隐匿"即触发现有 `enter_stealth` 通道（`effectExecutor.cjs:279`），不搞第二套隐身。
3. 隐匿耗 1 `MOVE`，奇袭警戒耗 1 `ATTACK`；均走 `action_points` + `markStandbyIfDone`。
4. `fog_of_war` 房间开关保留；剔除动作在广播层做。
5. GM 调参复用 `DiceConfigView.vue`（骰子工坊），新增 `ambushMultiplier` 参数。
6. 战局状态以 **Gateway 内存态为唯一真相**，经 Comm 鉴权剔除后广播。

---

## 🔧 阶段零：Gateway→Comm 权威状态推送（方案 B，已采纳但需修正）

* **[ ] 任务 1.0：实装 Gateway→Comm 权威状态推送** ✅ **已采纳修正（接收端点建在 Comm）**
* **拍板**：采用方案 B。战局任一变动后，Gateway **主动**将全量 State 推给 Comm，由 Comm 鉴权剔除 + 广播。
* **✅ 修正点（已确认）**：接收端点必须建在 **Comm**（接收方），Gateway 是 HTTP 客户端去 POST 它。用户原话"Gateway 暴露端点"表述反了，已纠正。
* **修改细则**：
  - `mecha-comm`（`services/comm-service/src/index.js`，已是 Express）新增 `POST /internal/sync-state`，校验内部密钥头 `x-internal-token` 后写入 `roomState.battleState` 并 `emit('battle-state-synced')`（带 fog 过滤）。**该端点不得公网暴露**（仅 docker 内部网 + 密钥）。
  - `mecha-gateway` 新增 `src/services/commPush.ts`：用 axios（前端已用，gateway 复用同依赖）向 `process.env.COMM_SERVICE_URL`（默认 `http://mecha-comm:3005`）POST。在 `combat.ts` 的 `/attack`、`/move`、`/skill`、`/action`、`/end-turn`、`deploy/retrieve` 变动后调用。**必须 fire-and-forget（非阻塞、try/catch 吞错），绝不因 Comm 不可达而阻塞 REST 响应。**
  - 废弃 `backend-gateway/src/app.ts:141` 的 `/api/comm/watch-feed` 桩（改为 301/404 或内部调用入口）。
  - **P11 关键**：当前 `socketService.js:340` 由**前端客户端**经 `sync-battle-state` 事件写入 `battleState`。Gateway 推送上线后，客户端写入会覆盖权威态，必须**忽略/废弃**该客户端事件（保留为离线兜底可酌情，但生产路径以 Gateway 为准）。
  - 推送 payload 须携带 `combatLog[]`（见任务 1.2 / P8），保证观战者同步可见。

---

## 🧱 阶段一：现有基建扩展（数据流与迷雾拦截）

* **[ ] 任务 1.1：基于角色的 WS 迷雾拦截器** ⚠️ **faction 须服务端校验（P1 疏漏）**
* **拍板**：`fog_of_war=true` 时广播前过滤 `battle-state-synced`（`socketService.js`）：
  - `DOMINATOR`/`REFEREE` → 完整树；Visitor（无阵营）→ 剔除 `stealth===true`；Player → 剔除 `faction!==my.faction && stealth===true`。
* **字段依据**：`unit.stealth` 顶层布尔（`effectExecutor.cjs:286` 置 true，`combat.ts:911` 序列化输出），过滤直接读。
* **修改细则（P1）**：
  - `join-battle`（`socketService.js:134`）扩展接收 `faction`，按 `userId`（JWT）存入 `roomState.players`。role 已有（JWT `auth.ts:57` 含 `role`）。
  - **✅ 已采纳**：前端上报的 `faction` **绝对不可盲信**（否则可伪造敌方 faction 偷看敌方隐身单位）。Comm 须在 `join-battle` 时**服务端校验**——以 JWT `userId` 调 Gateway 内部接口（如 `GET /api/rooms/:id/members?userId=`）取权威 `faction`，覆盖客户端值。
* **P10**：过滤后 `emit` 全量已过滤 state（当前 `battle-state-synced` 即全量），客户端重渲染即无残留旧单位。

* **[ ] 任务 1.2：战报流 CombatLog** ⚠️ **需建 combatLog 缓冲（P8）**
* **拍板**：`/attack` 等回包含完整掷骰明细；前端 `CombatLog.vue`（左下角）订阅展示。
* **修改细则（P8）**：
  - Gateway `battleState` 新增 `combatLog: []` 缓冲；在 `DiceService.roll` 调用处（damagePipe/skillExecutor）追加 `{ts, type, expr, result, mods}` 条目。
  - 订阅源统一走 WS：`commPush` 推送的 state 携带 `combatLog[]`，前端 `CombatLog.vue` 监听 `battle-state-synced.combatLog` 滚动展示，保证观战者同步。

---

## 🚦 阶段二：大厅整备室增强

* **[ ] 任务 2.1：名册提交与锁定** ✅
* 在 `NewPreparationRoom.vue` + `pending-units` 基础上实装提交；后端 `rooms.ts` 新增"名册锁定"状态/端点，锁定后禁止改名册，UI 呈 Ready。

* **[ ] 任务 2.2：GM 发车与无主接管（Override Bypass）** ⚠️ **需集中化 authorizer + 文件修正（P7 疏漏）**
* **拍板**：废除"把 neutral 塞进轮转"。建立**异步特权通道**：REFEREE/DOMINATOR 操作 `neutral` 阵营目标时，绕过 `activeFaction` 归属校验，即时消耗 AP 执行动作。
* **✅ 已采纳修正**：真实门控是 `resolveRole(battle.factionRoles, u.faction) !== battle.activeFaction`（**轮转角色**判定，非 `req.faction !== activeFaction`），且**内联散落在 6+ 处**（combat.ts:1054/1798/1823/1874/1907/1956）。
* **修改细则（P7）**：
  - 新增集中函数 `canIssueCommand(state, unit, reqUser)`（combat.ts）：先判特权 `if ((reqUser.role==='REFEREE'||reqUser.role==='DOMINATOR') && unit.faction==='neutral') return true;`，再走原 `resolveRole(factionRoles, unit.faction)!==activeFaction` 判定。将 6 处内联判断统一替换为调用此函数（否则 bypass 会漏/不一致）。
  - `overwatch-triggered` 为**服务器内部直接函数调用**（不经 HTTP），天然绕过拦截器；上述 bypass 分支专供"人类 REFEREE/DOMINATOR 操控 neutral 单位"。
  - **✅ 已采纳修正**：`affix_dictionary.json` **项目不存在**（已确认）。占位词条 `system_berserk` 写入 `glossary-skill-config.json`（现有词条库）的 `systems`/`status_effects` 段。注意：仅加 JSON 不会让引擎真正处理，属"埋点占位"，后续需 `effectExecutor` 增加 `system_berserk` 分支才生效。

---

## 🖥️ 阶段三：前端无头化抽离

* **[ ] 任务 3.1：Pinia 抽离** ⚠️ **增量（P9）**
* 分模块增量建 `apStore`/`moveStore`/`logStore`；严守宪法 v2.0（Canvas 单向管道终点）+ `defineExpose` proxyRefs 拆箱陷阱。
* **[ ] 任务 3.2：Player vs Visitor 视图** ✅ **依赖 P1 faction 映射**
* 非参战隐藏底部操作栏与 AP 条，仅留 Canvas + CombatLog。
* **[ ] 任务 3.3：骰子工坊抽屉** ✅ **新增 ambushMultiplier**
* `DiceConfigView.vue` 组件化，侧栏抽屉仅 REFEREE/DOMINATOR 渲染；`glossary-skill-config.json` 顶层 `dice` 段新增 `ambushMultiplier`，`DiceService` 实时读取；`/api/combat/dice-config` PUT 已存在复用。

---

## ⚔️ 阶段四：高阶玩法（复用体系）

* **[ ] 任务 4.1：隐匿主动技能** ⚠️ **需接线 attack-break（P3）**
* 前端按钮 → 后端 `enter_stealth`（耗 1 `MOVE`）→ 注入 `stealth`。
* **修改细则（P3）**：`/attack` 处理中，若 `attacker.stealth` 为真，显式调用 `handleExitStealth`（`effectExecutor.cjs:298`，已存在）清除。

* **[ ] 任务 4.2：警戒伏击（overwatch-triggered，移动触发 + 隐身）** ⚠️ **多细则（P2/P4/P5/P6）**
* **P2 拍板**：本机制事件命名为 `overwatch-triggered`（移动触发伏击），与反应奇袭的 `surprise-attack` 事件是**两套不同触发**，天然不冲突。
* **P4 拍板公式（仅本机制）**：DiceService 骰子**仅判命中与暴击**；命中后先制伤害 = `基础伤害 × ambushMultiplier`（来自 3.3）。
* **⚠️ P4 修正——三套"奇袭"概念必须分清（原"重大冲突"误判已撤销）**：项目里名字相近但**触发完全不同**的有三套，用户最新定义的"反应奇袭"是**第③套**，与 4.2 并列而非冲突——
  - ① `resolveAmbush`（`combatResolver.js:156`）：**马克西翁阵营特质**，攻击时**去骰化、始终触发** 70% 攻击力额外伤害（`getSystemConfig('ambush').damage_percent`）。是"攻方自身阵营红利"，非第三方反应。
  - ② `stealth_ambush` 词条（`stealth-tags.cjs:56`，maxion 锁）：**隐身攻击 +50% 伤害**（pre_attack 钩子）。是"隐身攻击加成"，会被**任何一次隐身攻击**（含下述反应奇袭分支的攻击）自然叠加。
  - ③ **反应奇袭 = `surprise-attack` 事件**（`socketService.js:211`，README `POST /api/combat/:id/surprise-choice`）：即用户最新定义的"防守反击/战术截击（A 攻击 B 时第三方 C 反应，replace/counter/giveup）"。**事件脚手架已预留，但部署版 Gateway 无服务端结算逻辑**——属"已设计未实现"。详见【任务 4.3】。
  - **真正的交集（非冲突，只需排结算顺序）**：C 在反应分支发动攻击且隐身 → ② `stealth_ambush` +50% 自然叠加；A 是马克西翁 → ① `resolveAmbush` 70% 在 A 原攻击上触发。建议顺序：先结算 A 原攻击（若未被 nullify）→ 再结算反应 C 的攻击（其上叠 stealth_ambush）。
* **修改细则（P5 生命周期）**：`overwatch_zone` 为全新字段，须在 `/end-turn` 的 `resetAll`/`tickStatus` 区显式清空（全场 `unit.overwatch_zone=null` 或清除 `battleState.overwatchZones` 映射）；单位移动/触发后也清。
* **修改细则（P6 AP 顺序）**：设伏前置强校验 `unit.stealth===true && action_points.ATTACK>0`；耗 1 `ATTACK` 后 `markStandbyIfDone`（因已先隐匿 MOVE=0 + 此处 ATTACK=0 → 两类归零 → 待机）。
* **修改细则（核心触发）**：`/move` 处理中，遍历移动路径每格，比对全场 stealth 单位的 `overwatch_zone`；若敌方（非伏击方 faction）路径穿越 → **打断移动**（截断至入口格或取消），触发 `overwatch-triggered`：调用 DiceService 判命中/暴击 → 结算先制伤害（基础 × ambushMultiplier）→ 强制 `handleExitStealth` 解除 stealth → 清空该 overwatch_zone。前端监听 `overwatch-triggered` 播全屏红色警报 + 攻击动画。
* **✅ P4 公式已拍板（4.2 移动伏击）**：①**基础伤害来源** = 伏击方的 `unit.attack`（直接读，不另设 `overwatch_damage` 配置）；②**命中/暴击保留 RNG**：复用 DiceService 的 `check`/`rollDetails` 判命中与暴击，**命中率与暴击率受受击方体型（S/M/L/XL）的机动性修正**（大模型更难命中/被暴击）；③**最终伤害 = 基础伤害 × ambushMultiplier**（来自 3.3 配置，默认值待配）；④**打空（Miss）同样强制破隐**：即使未命中，也执行 `handleExitStealth` 暴露伏击方坐标（与 4.1/反应奇袭破隐逻辑一致）。⇒ 去骰化的整体设计不受影响——4.2 仅在此处 reintroduce 命中/暴击骰（已你确认放行），其余结算仍确定性。

* **[ ] 任务 4.3：反应奇袭（surprise-attack，攻击触发 + 两阶段中断）** 🔴 **核心新增，服务端未实现**
* **对应**：用户最新定义的"防守反击/战术截击"。复用现有 `surprise-attack` / `surprise-choice` 事件名（`socketService.js:211/233`），**不另起名字**（P2 的 `overwatch-triggered` 留给 4.2 移动伏击）。
* **事件现状（致命）**：`surprise-attack` / `surprise-choice` 目前**只是前端广播桩**——`socketService.js` 仅把 `surprise-attack-triggered` + `surprise-timer-start`(10s) + `surprise-choice-made` 原样回弹，**没有任何服务端结算**；README 里的 `POST /api/combat/:id/surprise-choice` 只在**独立遗留 combat-service** 里，部署版 **Gateway 无此路由**。⇒ 必须**在 Gateway 新建两阶段中断状态机**。
* **✅ C 资格规则（已拍板）**：此处"阵营"指**战场分属 attack/defense/ambush**（由 `resolveRole(battle.factionRoles, unit.faction)` 解析，`battleStateFactory.ts:58`），**不是棋子本身的队伍（earth/balon/maxion）**。判定：**C 的战场分属 ≠ A 的战场分属 且 ≠ B 的战场分属**（C 不可与 A 或 B 同属一方）；**A 与 B 可同属一个战场分属**（如补给：同方单位互相补给），此时仍可被异分属的 C 奇袭。C 还需拥有"奇袭"反应技能且在 A 或 B 攻击范围内。
* **ℹ️ 真实代码锚点（草案据此落位）**：
  - 现有 `/attack`：`routes/combat.ts:1147`，核心结算 `executor.executeUniversalSkill(...)`(:1291) → 写回 HP(:1307) → `consumeActionPoint(casterUnit,'ATTACK',1)`(:1328) → `markStandbyIfDone`(:1330)。**拦截点须插在 `executeUniversalSkill` 之前**（拿到 `attacker_id`/`target_id` 之后、校验 `casterUnit`/`target` 之后）。
  - AP 真相：`DEFAULT_ACTION_POINTS={MOVE:1,ATTACK:1,DEFEND:1}`(`battleStateFactory.ts:32`)；消费 `consumeActionPoint`(:398)；重置 `resetAllActionPoints`(:423)；待机兜底 `markStandbyIfDone`(:434)。`/end-turn`(:787) 角色制轮转 `advanceTurn` 内已统一重置 AP，回合末对 `endedFaction` 单位调 `BuffManager.tickBuffs/tickStatus`(:823)。
  - 广播通道：网关现有 `broadcast = (evt, payload) => reactionEvents.push(...)`（:1335），经 P0 推 Comm；**奇袭窗口广播复用同一条 P0 通道**（不要在 socketService 里造第二套定时器）。
* **📐 可落地 Implementation 草案（v1，待确认后再写码）**：

  **D1. 状态载体（挂在 `battleState` 上，内存态，随 `battleStore` 存活）**
  ```
  battleState.pendingSurprise = {
    attackerId, defenderId,           // A, B
    reactors: [{ unitId, role, mobility }], // 合格 C 候选（含战场分属 + 机动值，用于并发仲裁）
    lockedReactorId: <unitId>,        // ★并发仲裁胜出者（机动最高），唯一可响应方
    phase: 'awaiting' | 'settling',   // 防重入：进入响应结算后置 settling
    timerId: <NodeJS.Timeout>,        // 服务端 10s 句柄，必须可 clearTimeout
    deadline: <epoch ms>,             // 超时清算的绝对时刻
    createdAt,
  } | null
  ```
  同时给单位挂债务+锁：`unit.nextTurnApPenalty`（`{ ATTACK: 0 }` 起步）+ `unit.surpriseDebtLock: false`（本回合已挂债则锁死，禁止再次触发，详见 D5），二者均**不塞进 `statusEffects`**，作为战斗单位顶层独立字段，跨回合由 `/end-turn` 显式扣减/解锁。

  **D2. 拦截 + ★并发仲裁（插入 `/attack` 校验之后、结算之前）**
  - `const A = resolveRole(battle.factionRoles, casterUnit.faction);`
  - `const B = resolveRole(battle.factionRoles, writeBackTarget.faction);`
  - **技能检索（具象化）**：C 合格的前提是 `C.skills.map(s=>s.key||s.skill_key).includes('tactical_overwatch')`（新增词条，见 D8），不再依赖旧 `stealth_ambush` 的 maxion 锁。
  - **★射程错位防护（盲区 B，最致命）**：C 能否选某分支，取决于**它实际够得到谁**。`aInRange = inAttackRange(C, A)`（C 的攻击距离覆盖 A）、`bInRange = inAttackRange(C, B)`（覆盖 B）。**至少够到一个**才合格（`aInRange || bInRange`），但每个候选的**可用分支必须按射程裁剪**：
    - `aInRange && bInRange` → `available_choices = ['replace','counter','giveup']`（两都可打）
    - `aInRange only`（只够得到 A）→ `available_choices = ['counter','giveup']`（够不到 B，禁止 replace）
    - `bInRange only`（只够得到 B）→ `available_choices = ['replace','giveup']`（够不到 A，禁止 counter）
  - 遍历 `battle.units`，收集全部合格候选 C：C 合格 ⇔ `含 tactical_overwatch` ∧ **`C.stealth === true`（D9-4 硬门槛）** ∧ `resolveRole(factionRoles, C.faction) !== A` ∧ `!== B` ∧ `(aInRange || bInRange)` ∧ **`C.surpriseDebtLock === false`（未带未清偿债务，禁止本回合二次触发，见 D5）**。`reactors` 每项结构：`{ unitId, role, mobility, aInRange, bInRange, available_choices }`。
  - **★并发仲裁规则（采纳"单一最高优先级锁定"，最稳健）**：若合格候选 ≥ 2（如 C1/C2 两台高机动实验机甲同时满足条件），**不弹多个 QTE、不抢答**，而是按 `computeMobility(C.currentStats/parts)` 取**机动值最高者**作为唯一 `lockedReactorId`；其余候选**直接落选、不广播窗口**。`pendingSurprise.reactors` 仍记录全部候选（便于审计），但只有 `lockedReactorId` 能提交 `surprise-choice`。⇒ 从根本上杜绝 `pendingSurprise` 被多次覆写导致状态机崩溃。
  - 若合格候选 = 1：该候选即 `lockedReactorId`。
  - 若 0 合格：走原 `/attack` 正常结算路径（零改动）。
  - 若 ≥ 1 合格：原 A→B **不结算**，写 `pendingSurprise`（含 `lockedReactorId`、`reactors`（带 `available_choices`）、`deadline = Date.now()+10000`、`timerId = setTimeout(forceSettleOnTimeout, 10000)`），**立即返回** `{ success:false, interrupted:true, surprise:{ lockedReactorId, reactors, deadline } }`；仅对 `lockedReactorId` 的 owner 推送 `surprise-attack-triggered` + `surprise-timer-start(10)`（P0 同通道），**payload 必须携带 `reactors[locked].available_choices`** 供前端灰置选项。

  **D3. ★服务端 10s 倒计时挂起与超时强制清算（重点①）**
  - **挂起期间**：原 A→B 请求已返回 `interrupted`，战斗状态处于 `pendingSurprise` 不变；任何后续的 `/attack`/`/move`（非 C 的奇袭分支）应被拒（`409 CONFLICT`，因 `pendingSurprise` 未清），避免并发破坏挂起态。
  - **强制清算 `forceSettleOnTimeout(battleId)`**：定时器到点且无任何 `surprise-choice` 到达 → 视为全员 `giveup` → 调 `resumeNormalAttack(battle)`：清 `pendingSurprise`、`clearTimeout`、按原 A→B 参数**完整重放** `executeUniversalSkill` + 写回 + 消费 A 的 ATTACK AP（注意：超时兜底仍按"正常结算A→B"处理，C 不获债务、A 正常消耗 AP）。
  - **提前响应**：`POST /surprise-choice` 一旦到达（无论 replace/counter/giveup），**先 `clearTimeout(pendingSurprise.timerId)`** 取消服务端倒计时，再进入 D4 分支；分支结束清 `pendingSurprise`。
  - **★防内存泄漏（10s Timer Trap，重点加固）**：凡是 `pendingSurprise` 消失的路径，**必须成对 `clearTimeout`**，否则 7 秒后僵尸定时器回调强行执行 `giveup` 逻辑会把最新权威战局炸毁。强制 `clearTimeout` 的触发点：
    1. 提前响应（上条）；2. 超时清算 `forceSettleOnTimeout` 自身入口先 `clearTimeout` 再结算；3. **战局异常终止**：在 `battleStore.delete(battleId)` / 房间销毁 / 玩家掉线导致 `disconnect` 的清理钩子里调用 `disposePendingSurprise(battleId)` = `if (b.pendingSurprise?.timerId) clearTimeout(b.pendingSurprise.timerId); b.pendingSurprise = null;`（在 socketService 的 `disconnect` 事件与 Gateway 战局销毁入口都挂接）。⇒ 保证**房间没了定时器也跟着没**，绝不回调一个已不存在的战局。
  - **防重入**：`phase==='settling'` 时再收到 choice 直接忽略（`409`）；定时器与 HTTP 两条路径唯一汇合点是 `clearTimeout` + 清 `pendingSurprise`，保证"要么超时清算一次、要么响应清算一次"，绝不双重结算。
  - ⚠️ **进程级健壮性**：`setTimeout` 句柄存内存，服务器重启/`battleStore` 丢失会漏清算。兜底：`/attack` 入口与 `/end-turn` 入口都做一次 `reapStalePending(battle)`——若 `pendingSurprise.deadline < Date.now()` 则先强制清算再继续，避免僵尸 pending 卡死整局。

  **D4. 响应分支（`POST /surprise-choice`）**
  - **入口守卫**：`surprise-choice` 只接受 `req.body.unitId === pendingSurprise.lockedReactorId` 的提交；非锁定者（落选候选 / 旁观者）一律 `409 NOT_REACTOR` 忽略。⇒ 与 D2 仲裁联动，杜绝多 C 抢答覆写。
  - **★射程二次守卫（盲区 B 兜底）**：`choice` 必须 ∈ `pendingSurprise.reactors.find(r=>r.unitId===lockedReactorId).available_choices`；若玩家绕过前端灰置提交了 `replace` 但 `!bInRange`（或 `counter` 但 `!aInRange`），后端**必须 `400 INVALID_CHOICE` 拒绝并保留 pendingSurprise**（不结算、不 clearTimeout），而非让 `runAttackInternal` 因射程不足抛错把状态机卡死。⇒ 前后端双保险。
  - `giveup`（含超时）：`resumeNormalAttack(battle)`（见 D3）。
  - `replace`（顶替）：① 剥夺 A 的本次 ATTACK AP：`consumeActionPoint(casterUnit,'ATTACK',1)` + `markStandbyIfDone(casterUnit)`（A 攻击作废，**不调 `executeUniversalSkill`**）；② 给 C 记债务并锁死 `cUnit.nextTurnApPenalty.ATTACK = 1; cUnit.surpriseDebtLock = true;`（**赋值+锁**，见 D5，禁止 += 堆叠）；③ 以 C 为 `attacker_id`、C 自选 `skill_id`、目标仍为 B，**完整重放一次 `/attack` 内部结算逻辑**（可抽成 `runAttackInternal(battle, cId, bId, skill)` 供原 `/attack` 与奇袭复用）→ 写回 B 伤害、消费 C 的 ATTACK AP；④ 清 `pendingSurprise`。
  - `counter`（先行截击）：① 剥夺 A 的 ATTACK AP（A 攻击作废）；② 以 C 攻 A 跑 `runAttackInternal`，**伤害结果乘 1.5**（在写回前 `final_damage = Math.floor(final_damage*1.5)`）；③ 击坠判定：`if (aUnit.currentStats.hp <= 0)` → **A→B 整体 nullify**：仅清 `pendingSurprise`、不重放 A→B（A 已坠，原攻击消失）；④ 未击坠：清 `pendingSurprise` 后 `resumeNormalAttack(battle)`（恢复 A→B 结算，A 已消耗 ATTACK AP 但仍可被打——注意此时 A 的 ATTACK AP 已在①扣掉，重放时**必须跳过再次消费**，故 `resumeNormalAttack` 要带 `skipConsume=true` 标志）；⑤ C 记债务并锁死 `cUnit.nextTurnApPenalty.ATTACK = 1; cUnit.surpriseDebtLock = true;`。
  - 每次分支后：P0 广播最新 state 给 Comm；返回 `{ success:true, surprise:{choice, results:[...]} }`。

  **D5. ★`next_turn_ap_penalty` 跨回合准确扣减（重点②）**
  - **★债务不叠加，采用"锁死"而非"堆叠"（采纳用户方案）**：C 一旦发动奇袭挂债，立即置 `unit.surpriseDebtLock = true`。D2 资格判定已含 `surpriseDebtLock === false`，**本回合内带债机体禁止再次触发奇袭**（彻底杜绝"反击狂魔"单回合多次截击把债务堆到 2、下回合直接罚站瘫痪）。⇒ `nextTurnApPenalty.ATTACK` 恒为 0 或 1，**永不 >1**。D4 的 replace/counter 在记债时须 `cUnit.nextTurnApPenalty.ATTACK = 1; cUnit.surpriseDebtLock = true;`（赋值而非 +=）。
  - **触发点**：`/end-turn`（:787）角色制轮转中，对**刚结束阵营**的单位 `BuffManager.tickBuffs/tickStatus`(:823) 处**追加债务清算 + 解锁**。
  - **精确语义（关键）**：C 在"自己当回合"发动奇袭，债务是"**下一回合** AP-1"——即债务归属 C 的**下一个本阵营回合**，不是下一个任意阵营回合。因此扣减时机必须落在 **C 所属战场分属的回合结束** 时（而非 A/B 的回合结束）。实现：在 `/end-turn` 轮转后，对 `battle.activeFaction`（即将进入的旧 activeFaction=`endedFaction`）下的所有单位，若 `unit.nextTurnApPenalty.ATTACK>0` → `unit.action_points.ATTACK = max(0, ATTACK - penalty)` 然后 `penalty=0` **且 `surpriseDebtLock = false`（解锁，下一回合可再奇袭）**。
  - **与 AP 重置的顺序（致命细节）**：`advanceTurn` 已在回合切换时把新 activeFaction 单位 AP 重置为 `{MOVE:1,ATTACK:1,DEFEND:1}`（:416）。若该重置发生在债务扣减**之前**，则扣减能正确反映到新回合；若重置在后则被覆盖。⇒ **必须：先 `advanceTurn`（含重置）→ 再对刚结束阵营单位的 `nextTurnApPenalty` 执行扣减 + 解锁**，顺序写死。
  - **防止漏扣/重复扣**：债务清零 (`penalty=0`) + 解锁 (`surpriseDebtLock=false`) + 扣减 (`action_points.ATTACK -= penalty`) 必须在**同一处原子执行**；`markStandbyIfDone` 的"用满两类即清零"可能把扣减后的 AP 进一步清零——此行为正确（扣到 0 自然待机）。**绝不**把债务写进 `statusEffects` 让 duration 模型代为清理（会跨错回合且被 `tickStatus` 误清）。
  - **边界**：若 C 在债务生效回合**已被击坠/未部署**，债务随单位死亡自然失效（扣减循环扫不到死亡单位，不需特殊处理）；其 `surpriseDebtLock` 随之消失，无残留。

  **D6. 复用清单（避免重复造轮子）**
  - 射程/距离判定：复用 `/attack` 已用的距离与 `cast_range` 校验函数（不要新建）。
  - 结算：抽 `runAttackInternal(battle, attackerId, targetId, skill, {skipConsume, damageMultiplier})` 供原 `/attack` 与 D4 三个分支共用，确保"伤害管道/写回/AP消费"三处行为完全一致。
  - 广播：`surprise-attack-triggered` / `surprise-timer-start` / `surprise-choice-made` 沿用 socketService 现有事件名，经 P0 同通道推送；**删除 socketService 里无结算的 choice 回弹**（改由 Gateway 结算后主动推 `surprise-choice-made`）。

  **D7. ★前端动画队列 + 10s 挂起分端视觉统合（State vs. Animation 防撕裂，P9 抽离 Pinia 时必须遵守）**
  - **问题盲区**：阶段零 Gateway 权威推送后，前端收到全新过滤版 State JSON——纯数字血量没问题，但一旦实装 2D 像素机甲开火动画、或奇袭时六边形网格高对比荧光爆闪特效，**状态突变会直接切断正在播放的动画**。
  - **强制约束**：Pinia Store 收到 Comm 广播的过滤版 State 时，**禁止直接粗暴覆写**底层数值。必须引入 **Animation Queue（动画队列）**：
    1. 收到 state 更新 → 先 diff 出"待变数值"（HP/AP 增量、奇袭标记）；
    2. 把对应视觉事件（`mechFiring` / `surpriseFlash` / `hpTween`）**入队**；
    3. 播放完 QTE 爆闪 + 机甲开火/受击动画/HP 平滑跳数后，再把底层数值同步到 UI（store 的"显示值"滞后于"权威值"，动画期间显示值由缓动驱动）；
    4. 队列空了才接受下一次硬覆写。⇒ 保证"数值真相"与"视觉表现"解耦，奇袭中断期间动画不被 state 重推打断。
  - **★10s 挂起分端视觉统合（补完 ③，照顾所有端，含观战者）**：侦听到 `pendingSurprise !== null` 时，**全端**渲染视觉反馈，按角色分两种处理：
    - **触发方 C（lockedReactorId 的 owner）**：冻结底层数值覆写（入队 `surpriseFlash`），呼出 **10 秒 QTE 面板**（显示 `available_choices` 灰置态 + 本地倒计时，倒计时源用 `surprise-timer-start(10)` 或 `deadline` 时间戳，不依赖服务端回推）。
    - **A、B 玩家及 Visitor（观战者）**：绝不能面对"卡死"无反馈屏幕——在纯六边形网格地表叠加 **全屏半透明暗绿色 Screen Tone**（赛博朋克"系统被骇入/时间暂停"氛围），并在网格上叠加**高对比度荧光线条闪烁特效**（覆盖这长达 10 秒的后台等待）。⇒ 既强调氛围、又优雅掩盖等待，三端体验一致。
  - 与后端 `pendingSurprise` 的协同：`surprise-attack-triggered` → C 端入队 `surpriseFlash`+弹 QTE，A/B/Visitor 端入队 `screenTone`+`gridFluorescent`；`surprise-choice-made` / `attack-resolved` 到达 → 撤掉 Screen Tone/面板，再入队结算动画，期间冻结该格硬数值覆写。

  **D8. ★实体技能词条定义（补完 ①，解 stealth_ambush 阵营锁）**
  - **解除 maxion 锁**：`stealth-tags.cjs:56` 的 `stealth_ambush`（隐身 +50% 伤害）原强绑马克西翁阵营，改造为**通用属性**——移除其 faction 限定，任何阵营隐身攻击都可叠 +50%（反应奇袭的 C 若隐身，其截击/顶替伤害自然叠此加成）。
  - **新增反应技能词条**：在 `glossary-skill-config.json` 的 `skills`（或 `traits`）节点下，严格按以下范式新增：
    ```json
    {
      "id": "tactical_overwatch",
      "name": "战术奇袭",
      "type": "reaction",
      "trigger": "enemy_attack",
      "desc": "处于隐匿状态时，可对射程内发动攻击的敌方进行顶替或先行截击。"
    }
    ```
  - **Gateway 校验（D2 已引用）**：资格检索直接用 `C.skills.map(s=>s.key||s.skill_key).includes('tactical_overwatch')`，不再读 `stealth_ambush` 的 maxion 锁（该锁仅管"隐身 +50%"伤害加成，与"是否拥有反应技能"解耦）。
  - ⚠️ 该词条 `type:'reaction'` 是新增语义，需确认 `conditionEvaluator` / `skillExecutor` 不会误把它当成主动 `action_type` 去调度（反应技能**只由 D2 拦截逻辑触发**，不进普通 `/skill` 施放流程）。

  **D9. 🔍 草案 double-check 待明确清单（全局复查发现的疏漏，待你拍板/补细则）**
  - **[✅ 已落地] D9-1 嵌套奇袭（递归触发）**：`runAttackInternal` 已加 `isSurpriseResolution=true` 标志；`/attack` 在 `__surpriseResolution` 路径下跳过 `maybeInterceptSurprise`，奇袭结算链内绝对禁止套娃触发 D2 拦截（单层反应）。
  - **[✅ 已落地] D9-2 重放载荷缺失**：`pendingSurprise.originalRequest` 挂载完整载荷（attacker_id/target_id/attack_type/skill_id/skill_key/skill_name/context + 已算好的 skillKey/inlineDef），`forceSettleOnTimeout` 与 `counter` 非击坠恢复按原参数无损重放 A→B。
  - **[✅ 已落地] D9-3 射程裁剪依赖"技能无关距离"，与 C 自选技能冲突**：`resolveSelectedSkill` 拿到 C 自选 `skill_id` 后按该技能真实 `cast_range` 二次校验，不符 `400 INVALID_CHOICE` 并保持 pending（与 D4 射程二次守卫合并）。
  - **[✅ 已裁决] D9-4 隐匿前置与技能描述矛盾**：**强制要求 `C.stealth===true` 硬门槛**（采纳贴合"战术奇袭"语义的方案）。D2 资格检索已加 `if ((u as any).stealth !== true) continue;`；逻辑闭环——C 须先付出 1 点 MOVE AP 进入隐匿，本回合才有资格触发奇袭，防无成本滥用；`tactical_overwatch` 词条 `requires_stealth:true` 与 `desc` 同步。**⚠️ 阻塞依赖见文末"遗留 ⚠️"①——当前仍缺单位进入隐匿的机制（无 skill/路由把 `unit.stealth` 置 true），须先实现，否则奇袭永不触发**。
  - **[✅ 已裁决] D9-5 触发范围仅 `/attack`**：严格限制仅 `/attack` 路由触发（伤害结算管道），**不含 `/skill`**（Buff/Debuff/Control 管道保持独立）。`maybeInterceptSurprise` 只在 `/attack` 调用；`/skill` 绕行。词条 `desc` 已注明"仅 /attack 触发"。
  - **[✅ 已裁决+落地] D9-6 击坠后的待机门控穿透**：非击坠恢复 A→B 时 `runAttackInternal` 传 `skipConsume:true + force:true`，跳过 `hasActionPoints`/待机门控，暴力结算原攻击（A 的 ATTACK 已在 `counter` 步骤①扣除）。
  - **[✅ 已落地] D9-7 倍率叠加顺序**：`counter` 伤害在写回前 `result.final_damage = Math.floor(final_damage × 1.5)`（`getAmbushMultiplier()`）；C 隐身时 `stealth_ambush` 引擎 hook 再叠 +50% → 等效 `floor(base × 1.5 × 1.5)`。`tactical_overwatch` 发动后 `C.stealth=false`（D9-4/D9-10）。⚠️ 待验证：引擎 `attacker_is_stealth` 是否读取 `unit.stealth` 顶层字段（当前状态机读写该字段）。
  - **[✅ 已裁决] D9-8 无人类 owner 的响应者**：AI / 无主锁定者默认走 `giveup`（`forceSettleOnTimeout` 超时即 giveup，不挂起等待）；REFEREE 可在 10s 窗口内通过 `POST /surprise-choice` 带 `referee:true` 代投 AI/neutral 锁定者（人类锁定者仍由本人投）。⚠️ 待补：`referee` 特权鉴权（当前未做角色网关校验，后续接 REFEREE 角色）。
  - **[✅ 已落地] D9-9 `ambushMultiplier` 默认值**：已写入 `glossary-skill-config.json` 顶层 `dice` 段 `"ambushMultiplier": 1.5`，`getAmbushMultiplier()` 实时读取，防空值/除零。
  - **[✅ 已落地·部分] D9-10 socketService 的 `surprise-timer-start` 发射须删除**：计时权威已在 Gateway（`setTimeout` 挂起 + `forceSettleOnTimeout`）。当前 Gateway 无 WS 推送通道（commPush 未接线），客户端经 `GET /state` 轮询 `surprise.deadline` 驱动倒计时，不存在双计时。⚠️ 待补（前端阶段）：前端/推送层接通后须删除 `socketService.js` 里原 `surprise-timer-start` 的 legacy emit（避免与 Gateway 计时打架）。
  - **[✅ 已落地·部分] D9-11 `surprise-choice` 鉴权映射**：路由已强制 `req.body.unitId === pendingSurprise.lockedReactorId` 否则 `409 NOT_LOCKED_REACTOR`（杜绝冒投/抢答）。⚠️ 待补：提交者 `userId → owner` 映射鉴权（房间成员表）未接，当前只校验 unitId 相等；REFEREE 代投走 `referee:true` 旁路。
  - **[✅ 已落地] D9-12 D5 措辞 + pending 暴露**：`/end-turn` 直接对**刚结束的 `endedFaction` 角色**下单位扣债+解锁（代码注释已按此直述）。`GET /state` 返回 `surprise` 字段（`serializePending` 含 `lockedReactorId`/`reactors`/`deadline`/`available_choices`），并新增 `GET /api/combat/:battleId/surprise-choice` 拉取、`POST /surprise-choice` 响应，供前端轮询驱动 10s QTE。

* **✅ D9 全部 12 项已裁决/落地（2026-07-29 代码已写入 combat.ts + glossary + stealth-tags）**：① `type:'reaction'` 新语义——`tactical_overwatch` 仅由 D2 拦截逻辑触发，不进普通 `/skill` 施放（D9-5 已限定仅 `/attack`），故 `conditionEvaluator`/`skillExecutor` 不会误调度（⚠️ 仍建议加一道白名单兜底，见遗留④）；② 并发多 C 已**拍板"单一最高机动锁定"**（D2，已落地 `pickLockedReactor`）；③ **前端 D7（10s QTE + 暗绿 Screen Tone + 动画队列）尚未实现**（本次仅落地后端状态机 + 配置 + 路由 + `/state` 轮询暴露）；④ D9-1~12 全部按最终裁决落地（见各条 ✅）。

## 遗留 ⚠️（阻塞 / 待办，按优先级）

1. **[✅ 已解决] 单位进入隐匿的机制缺失**：D9-4 强校验 `C.stealth===true`，已由 Batch B 4.1 `POST /api/combat/:battleId/stealth` 路由置 `unit.stealth=true` 满足（手测通过）（glossary 现有 `scout` 仅预留"偷袭阵营隐匿技"文案、不设置 stealth；4.1 隐匿若已实现也需确认其写回 `unit.stealth`）。即使用户在 4.1 实现了隐匿，本状态机也无法触发。⇒ 须先落地"进入隐匿"途径（建议新增 `stealth_initiate` 动作：消耗 1 点 MOVE AP 将 `unit.stealth=true`，并配结束隐匿/被破隐规则），否则奇袭永远不触发。
2. **[⚠️ 待办] 前端 D7（10s QTE + 暗绿 Screen Tone + 动画队列）**：本次仅落地后端（`pendingSurprise` 经 `GET /state` 轮询暴露 `surprise` 字段）。前端须：① C 端弹出 10s QTE 面板（按 `available_choices` 灰置 replace/counter/giveup）；② A/B/Visitor 端暗绿 Screen Tone + 高对比荧光线条；③ Animation Queue 防状态突变撕裂。
3. **[✅ 已解决] `referee` / `owner` 鉴权**：`surprise-choice` 已接 `userId→owner` 映射——`resolveSurpriseChoice` 校验 token 的 `role`（REFEREE/DOMINATOR 代投）与 `userId===lockedOwner`，`OWNER_MISMATCH` 返回 403，冒投/越权风险已闭环。
4. **[🟡 待验证] 引擎 `attacker_is_stealth` 字段**：`stealth_ambush` 的 +50% 依赖引擎读取 `unit.stealth`；当前状态机读写该顶层字段，需确认引擎 hook 读取同一字段（否则隐匿 +1.5 不生效）。
5. **[🟢 文案] D8 `type:'reaction'` 白名单兜底**：建议 `skillExecutor`/`conditionEvaluator` 显式拒绝 `type:'reaction'` 进入普通调度，避免未来误触发。

---

## 📋 风险登记（更新版）

| 编号 | 严重度 | 状态 | 问题 / 处理 |
|---|---|---|---|
| P0 | ✅ | 已采纳修正 | 端点建在 **Comm**；Gateway 新增 axios 客户端 + `COMM_SERVICE_URL`；推送 fire-and-forget 非阻塞；`/internal` 内网+密钥 |
| P1 | ✅ | 已采纳修正 | `join-battle` 服务端以 JWT userId 取权威 faction 覆盖客户端值，防伪造偷看隐身 |
| P2 | ✅ | 已解决 | 4.2 移动伏击=`overwatch-triggered`；反应奇袭复用 `surprise-attack` 事件名；两套不同触发，不撞 |
| P3 | ⚠️ | 已委派实现 | `/attack` 显式调 `handleExitStealth`（注：破隐改为直接置位 `stealth=false`，等价实现） |
| P4 | ✅ | 已拍板（去误判+公式定稿） | 三套机制分清：①`resolveAmbush`(maxion 70%特质) ②`stealth_ambush`(+50%隐身，见 4.3 D8 已解 maxion 锁) ③反应奇袭=`surprise-attack`事件(已设计未实现)。4.2 公式已定稿：保留 DiceService RNG 命中/暴击(受体型S/M/L/XL机动修正)、基础伤=伏击方`unit.attack`、最终=`基础×ambushMultiplier`、Miss 强制破隐；反应奇袭确定性×1.5 符合去骰化 |
| P13 | 🔴 | 新增 | `surprise-attack`/`surprise-choice` 仅是前端广播桩，部署版 Gateway 无服务端结算；需在 Gateway 新建两阶段中断状态机 + `POST /surprise-choice` 路由 + 服务端 10s 超时 + `next_turn_ap_penalty` Debuff；且当前无独立"反应奇袭"技能（需新增/解 maxion 锁） |
| P5 | ✅ | 已采纳修正（设计变更） | 已改为实时探测 `stealth===true` 及技能判定，无持久化 zone，无需回合末清理 |
| P6 | ⚠️ | 已委派实现 | 设伏强校验 `stealth && ATTACK>0` |
| P7 | ✅ | 已采纳修正 | 抽离集中 `canIssueCommand()` 加特权分支；`affix_dictionary.json` 不存在，占位写入 `glossary-skill-config.json` |
| P8 | ⚠️ | 已委派实现 | Gateway 建 `combatLog[]` 缓冲并随 state 推送 |
| P9 | ⚠️ | 已委派实现 | Pinia 增量抽离 |
| P10 | ⚠️ | 已委派实现 | 全量已过滤 state 下发防残留 |
| P11 | ✅ | 已采纳修正 | 废弃客户端 `sync-battle-state` 写入，防覆盖权威态 |
| P12 | ✅ | 已采纳修正 | `/internal/sync-state` 内网+密钥；推送非阻塞防级联故障 |
| R1 | ✅ 已缓解 | 通知丢失导致双端不同步 | 已由"实时名册 `room-update`" + "combatLog 缓冲随推送携带" 大幅缓解（2026-07-30 逆向同步：冲突-10 复核降级） |

---

## ✅ 已定稿方向（直接采纳，无需再议）

- 裁决 1-6 全部采纳。
- P0 方案 B、P1 join-battle 带 faction、P2 重命名、P4 奇袭公式、P7 Override Bypass 主体思路均采纳（仅实现层有上表修正项）。
- P3/P5/P6/P8/P9/P10 全权交由 Agent 按上述细则补齐代码。
