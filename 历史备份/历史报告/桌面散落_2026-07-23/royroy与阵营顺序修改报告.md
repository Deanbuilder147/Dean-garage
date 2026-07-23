# Royroy 行动阶段部署机制 + 阵营行动顺序 修改报告

> 状态：方案待确认，**未实施任何代码改动**。
> 日期：2026-07-22
> 范围：mecha-universe-engine（gateway TS + combat-service `.cjs` + 前端 Vue）

---

## 0. 现状核查结论（为什么要改）

| 检查项 | 当前状态 | 是否符合新规 |
|---|---|---|
| Royroy 部署触发点 | 前端已有一套模型：`unit.royroy`（属性）、`royroy_deployed`、`royroy_q/r`，按钮仅在 `!royroy_deployed` 的**行动阶段**显示，调用 `combatAPI.action(id,{actionType:'deploy_royroy'})` | 前端意图正确，但**后端无 `/action` 路由** → 调用 404，royroy 实际无法部署 |
| Royroy 后端落点 | 上一轮误做成「独立 BattleUnit + deploy-unit 阶段生成」，**与前端属性模型冲突**，需回退 | ❌ 需重做 |
| 阵营行动顺序 | `end-turn` 仅 `resetAllActionPoints` + `battle.turn += 1`，**无任何阵营轮换**；`GET /state` 不返回 `faction_turn` → 前端永远显示「准备中」 | ❌ 完全未实现 |
| 阵营角色来源 | `FACTION_CONFIG` 用阵营**名称**（earth/maxion/balon…）仅做显示排序，无攻击/防守/偷袭角色概念 | ❌ 需在整备室确定 |

**结论**：Royroy 与阵营顺序两项均未正确实现。上一轮的 royroy 独立单位实现方向错误，须回退后按本报告的属性模型重做。

---

## 1. Royroy 部署机制（按你的 6 条规则）

### 1.0 模型定位（关键修正）
Royroy **不是独立 BattleUnit**，而是主单位上的一个属性 `unit.royroy`（前端 `factionUnits` 仅列出主机，royroy 以黄色圆点标记绘制，见 `NewBattleView.vue:1929-1937`）。
- 回退：`battleStateFactory.ts` 的 `createRoyroyUnit` / `extractRoyroyParts`（独立单位版）+ `combat.ts` deploy-unit 里的 royroy spawn + `/move` 里 royroy 独立单位约束。
- 改为在 `createBattleUnit` 中抽取 `跟随` 部件，写入：
  ```ts
  unit.royroy = {
    name, attack, defense, hp, maxHp, mobility,
    skills,                       // 跟随部件自带的技能数组
    isAuto,                       // skills 中存在 category==='auto' 即视为自动化技能
    deployed: false,
    q: null, r: null,             // 场上坐标
    cooldownRound: 0,             // 回收后需过的回合数，>当前 round 时不可再部署
  }
  unit.royroy_deployed = false
  ```

### 1.1 规则映射与实现要点

**规则1：Royroy 的行动消耗携带者的战术行动（用户修正）**
- **部署 royroy（deploy_royroy）：不消耗主机任何行动点。**
- **Royroy 移动：不消耗主机 MOVE 行动点。**
- **Royroy 使用技能/攻击：消耗主机 `action_points.ATTACK`（即「战术行动」）。**
- 实现：仅 royroy 攻击前校验主机 `ATTACK > 0`，执行后 `consumeActionPoint(host,'ATTACK')`；部署与移动不做行动点校验/消耗。

**规则2：Royroy 的技能只有在部署时才能使用**
- 前端 `getFactionSkills` 已有 `order=['main','left','right','extra','royroy']`（`NewBattleView.vue:2208`），royroy 技能槽已存在。
- 实现：royroy 技能按钮仅在 `unit.royroy_deployed === true` 时可用；未部署时置灰/隐藏。

**规则3：自动化技能 → 始终跟随主机 1 格内；可部署/可回收**
- 判定：`unit.royroy.isAuto === true`（skills 任一 `category==='auto'`，前端 `NewBattleView.vue:2271` 同逻辑）。
- 实现：
  - 主机移动后，自动将场上 royroy 重定位到主机新位置相邻、且为空的合法格（跟随）。
  - 玩家可主动 `deploy_royroy` / `retrieve_royroy`。

**规则4：非自动化技能 → 不强制跟随，但回收时须回到主机 1 格内**
- 实现：非 auto royroy 可自由在场上移动（消耗主单位 MOVE）；`retrieve_royroy` 校验 `hexDistance(royroy_q/r, host) <= 1`，否则拒绝。

**规则5：回收条件与效果**
- 仅当 `unit.royroy.hp > 0` 可回收；须在主机行动环节；**回收不消耗**主单位战术行动。
- 回收后 `royroy.hp` 恢复至 `maxHp`，`deployed=false`，`q/r=null`，`cooldownRound = battle.round + 1`。

**规则6：回收后冷却**
- `cooldownRound > battle.round` 期间不可再部署，且技能不可用。
- 冷却语义（用户确认）：若 royroy 在其阵营 **round N** 被回收，则须到 **round N+2** 才可再部署（跳过下一整回合）。实现：`cooldownRound = battle.round + 2`。
- `deploy_royroy` 校验 `battle.round >= cooldownRound` 且 `hp>0`。

### 1.2 新增后端动作（统一走新路由 `/api/combat/:battleId/action`）
- `actionType: 'deploy_royroy'`：`params:{unit_id,q,r}`。校验：主机行动阶段、royroy 未部署、cooldown 已过（`battle.round >= cooldownRound`）、hp>0、目标格与主机相邻且空 → 设 `deployed=true, q/r`。**不消耗主机任何行动点**（规则1 修正）。
- `actionType: 'retrieve_royroy'`：`params:{unit_id}`。校验：主机行动阶段、royroy 已部署、hp>0、位置邻接主机（规则4）→ 回收、回血（`hp=maxHp`）、设 `cooldownRound=battle.round+2`、不消耗 action point。
- 复用前端既有 `deployRoyroyAt(q,r)` 调用形态（`client.js:139` `action:`）。

### 1.3 战斗结算对接（机动差额不互通）
- `combatResolver.js` / `skillExecutor` 需支持 royroy 作为独立攻击方：以 `unit.royroy`（attack/mobility/skills）构建 executor，其机动只取自自身，**不并入主机**（自然满足「不互通」）。
- 受影响文件：`services/combat-service/src/services/combatResolver.js`、`skillExecutor.ts`（`toExecutorUnit` 扩展 royroy 分支）、`routes/combat.ts` 的攻击/技能入口需能携带 `royroy` 上下文。

### 1.4 前端改动
- `NewBattleView.vue`：
  - 部署/回收按钮已存在雏形，补全调用 `action(deploy_royroy/retrieve_royroy)`、冷却显示、`hp>0` 校验。
  - 主机移动后触发 royroy 跟随重定位（auto 时；royroy 移动不消耗主机 MOVE，规则1 修正）。
  - royroy 技能按钮按 `deployed`/`cooldown` 启用禁用；royroy 攻击消耗主机 ATTACK。
  - 行动网关（move/攻击/技能）增加「仅当前 activeFaction 单位可操作」（见第 2 节联动）。

---

## 2. 阵营行动顺序（攻击 → 防守 → 偷袭，可空跳过）

### 2.1 角色在整备室确定
- `NewPreparationRoom.vue` 增加每个阵营的「角色」选择：攻击 / 防守 / 偷袭 / 无。
- 建战时随战斗配置传给后端（新增字段 `factionRoles: { [factionCode]: 'attack'|'defense'|'ambush'|null }`）。

### 2.2 后端回合管理
- `shared-kernel/types.ts` 的 `BattleState` 新增：
  ```ts
  factionTurnOrder: string[]   // 例: ['factionA','factionB']（按 attack→defense→ambush 排列，跳过空角色）
  activeFactionIndex: number
  round: number                // 回合数（一轮=三个阵营各行动一次）
  ```
- `battleStateFactory.ts` 初始化：依 `factionRoles` 生成 `factionTurnOrder`（attack→defense→ambush，空则剔除），`activeFactionIndex=0`。
- `end-turn` 改写：当前 activeFaction 的单位行动点不清空（或按其自身 round 重置）；推进 `activeFactionIndex`；若回到 0 则 `round += 1`。**取代**原来「重置所有单位 + turn+=1」的全局逻辑。
- 行动网关（move / action / deploy_royroy / retrieve_royroy / 技能）增加校验：`unit.faction === factionTurnOrder[activeFactionIndex]`，否则返回 `403 NOT_YOUR_TURN`。
- `GET /state` 补回 `factionTurnOrder`、`activeFaction`、`round`（前端 `faction_turn` 当前永远「准备中」即因缺失此字段）。

### 2.3 前端改动
- `NewPreparationRoom.vue`：阵营角色选择器。
- `NewBattleView.vue`：
  - `faction_turn` 显示改为读后端 `activeFaction` 角色名（攻击/防守/偷袭）。
  - 非 activeFaction 的单位禁用操作（移动/攻击/部署/回收）。
  - 阵营分组/高亮按 `factionTurnOrder` 当前项。

---

## 3. 需改动的文件 / 容器 / 功能清单

| 层 | 文件 | 改动 |
|---|---|---|
| 类型 | `shared-kernel/src/types.ts` | `BattleUnit` 增 `royroy`/`royroy_deployed`；`BattleState` 增 `factionTurnOrder`/`activeFactionIndex`/`round` |
| 工厂 | `backend-gateway/src/battleStateFactory.ts` | 抽 `跟随`→`unit.royroy`（含 isAuto/cooldown）；**回退**独立单位版 `createRoyroyUnit`；初始化 `factionTurnOrder` |
| 路由 | `backend-gateway/src/routes/combat.ts` | 新增 `/action`（deploy_royroy/retrieve_royroy）；`end-turn` 改阵营轮转；行动网关加 activeFaction 校验；`GET /state` 补字段；**回退** deploy-unit royroy spawn 与 `/move` 独立单位约束 |
| 战斗 | `services/combat-service/src/services/combatResolver.js` + `backend-gateway/src/skillExecutor.ts` | 支持 royroy 作为独立攻击方（机动不互通） |
| 前端 | `frontend/src/views/NewBattleView.vue` | royroy 部署/回收/跟随/冷却/技能启用；activeFaction 门控；`faction_turn` 显示 |
| 前端 | `frontend/src/views/NewPreparationRoom.vue` | 阵营角色（攻击/防守/偷袭/无）选择器，建战传入 |
| API | `frontend/src/api/client.js` | `action()` 已存在，可加 `retrieveRoyroy` 便捷方法（可选） |

容器：`mecha-gateway`（含 combat-service）、`mecha-frontend`。按标准流程 rsync → build → up（你上次「先不」，待你确认后一并部署）。

---

## 4. 设计假设确认状态

1. **「战术行动」映射** ✅ 已确认：royroy **部署不消耗**主机 ATTACK；royroy **攻击消耗**主机 ATTACK；royroy **移动不消耗**主机 MOVE。即仅 royroy 攻击消耗主机 ATTACK 行动点。
2. **自动化技能判定** ✅ 已确认：仅 `skill.category === 'auto'`（与前端 `NewBattleView.vue:2271` 一致），无其他标识。
3. **阵营角色配置** ✅ 已确认：在 `NewPreparationRoom` 下拉选择每个阵营角色；不足三个阵营时空角色正常跳过。
4. **回收冷却** ✅ 已确认：`cooldownRound = battle.round + 2`（如 round2 回收 → round4 方可再部署）。
5. **end-turn 语义变更** ✅ 已确认接受：原全重置改为按 activeFaction 仅重置该阵营、轮转推进 `round`。

> 5 项假设全部确认，无遗留待定点。

---

## 5. 建议实施顺序（确认后执行）

1. 回退上一轮 royroy 独立单位实现（types/battleStateFactory/combat.ts）。
2. `createBattleUnit` 抽取 `unit.royroy`（属性模型）。
3. 新增 `/action` 路由：deploy_royroy / retrieve_royroy（含全部校验）。
4. `combatResolver`/`skillExecutor` 接 royroy 独立攻击方。
5. `BattleState` 加阵营轮转字段；`battleStateFactory` 初始化 `factionTurnOrder`；`end-turn` 改写。
6. 行动网关加 activeFaction 门控；`GET /state` 补字段。
7. 前端 `NewPreparationRoom` 角色选择 + `NewBattleView` 门控/显示/royroy 交互补全。
8. lint → 部署（rsync + build + up）+ 迁移脚本（无数据结构迁移，royroy 由部件实时抽取，无需历史数据迁移）。
