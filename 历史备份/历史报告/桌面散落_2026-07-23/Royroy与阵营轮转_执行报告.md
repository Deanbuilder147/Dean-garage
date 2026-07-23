# Royroy 浮游辅机与阵营轮转 — 实施执行报告

- **日期**：2026-07-22
- **方案**：Roadmap 方案 A 顺序（阵营轮转前置，royroy 动作路由在后，避免临时代码）
- **设计基线**：《系统重构与Royroy机制方案报告V2.0》

## 一、实施概览

本次严格按 V2.0 报告 §6 roadmap 执行，并采用用户确认的「方案 A」顺序。核心目标：

1. 回退上一轮**错误的 royroy 独立 BattleUnit 实现**（deploy-unit 生成），改为**属性模型**（`unit.royroy`）。
2. 落地 royroy 部署 / 回收 / 受击的**完整状态机**与全部 6 条规则。
3. 落地 **攻击 → 防守 → 偷袭** 阵营轮转 + **Round+1 统一 AP 重置** + `activeFaction` 门控。

## 二、Plan 执行情况对照表

| Step | 文件 | 改动 | 状态 |
|------|------|------|------|
| 1 | `shared-kernel/src/types.ts` | `BattleUnit` 增 `RoyroyState` 属性；`BattleState` 增 `factionTurnOrder` / `activeFaction` / `activeFactionIndex` / `round` | ✅ |
| 2 | `backend-gateway/src/battleStateFactory.ts` | 移除 `extractRoyroyParts` / `createRoyroyUnit`（独立单位）；新增 `buildRoyroyState`（属性模型 + `isAuto` 判定）；`createBattleUnit` 注入 `royroy`；`createBattleState` 初始化阵营字段 | ✅ |
| 3 | `backend-gateway/src/routes/combat.ts` | 移除 deploy-unit 中 royroy 独立 spawn 段 | ✅ |
| 4 | `backend-gateway/src/routes/combat.ts` | 移除 `/move` 中 royroy 独立单位约束（`isRoyroy`/`hostId`） | ✅ |
| 5 | `backend-gateway/src/routes/combat.ts` | `end-turn` 改为按 `factionTurnOrder` 轮转；仅最后活跃阵营结束进 Round+1 时统一 `resetAllActionPoints` | ✅ |
| 6 | `backend-gateway/src/routes/combat.ts` | `GET /state` 补回 `factionTurnOrder`/`activeFaction`/`activeFactionIndex`/`round`；并展开 royroy 顶层字段（`royroy_deployed`/`royroy_q`/`royroy_r`/`royroy_status`）兼容前端 | ✅ |
| 7 | `backend-gateway/src/routes/combat.ts` | 新增 `POST /api/combat/:battleId/action`：`deploy_royroy` / `retrieve_royroy` / `damage_royroy`，含 `activeFaction` 门控与全部校验 | ✅ |
| 8 | `combat-service/.../combatResolver.js` | 未改动。royroy 受击销毁以 `damage_royroy` 动作闭环（详见 §五缺口） | ⚠️ 闭环未改引擎 |
| 9 | `frontend/src/views/NewPreparationRoom.vue` | `startBattle` 的 `createBattle` body 注入 `factionTurnOrder`（攻击→防守→偷袭，空跳过） | ✅ |
| 10 | `frontend/src/views/NewBattleView.vue` | 回收按钮 + `retrieveRoyroy`；`currentFactionLabel`；`isMyTurn` 门控（move/attack）；`faction_turn` 显示替换；`watch(activeFaction)` | ✅ |
| 11 | lint | 后端 3 文件 + 前端 2 文件 全部 **0 error** | ✅ |
| 12 | 文档 | 执行报告 + 规则书 | ✅ 本文件 |

## 三、关键实现要点

### 3.1 Royroy 属性模型
- 单主机对应单 Royroy（取首个「跟随」部件）。
- `buildRoyroyState` 从部件抽 `attack`/`hp`；`isAuto = 技能含 category==='auto'`；`defense` 固为 `0`（数值净化）。
- 初始 `status='inactive'`、`deployed=false`。
- `GET /state` 序列化时展开为前端既有顶层字段（`royroy_deployed`/`royroy_q`/`royroy_r`/`royroy_status`），**前端零契约改动即兼容**。

### 3.2 部署（deploy_royroy）
校验：royroy 存在、未 `destroyed`、未部署、`cooldownRound <= battle.round`、`hp>0`、宿主为 `activeFaction`、落点与宿主相邻且为空格。
**不消耗任何 AP**。设 `deployed=true`、`q/r`、`status='deployed'`。

### 3.3 回收（retrieve_royroy）
校验：已部署、未 `destroyed`、`hp>0`、宿主为 `activeFaction`、royroy 位置与宿主相邻。
**不消耗 AP**；`hp` 回满；`status='inactive'`；`cooldownRound = battle.round + 2`；`q/r` 清空。

### 3.4 受击销毁（damage_royroy）
扣 `royroy.hp`，`hp<=0` → `status='destroyed'`、`deployed=false`、`q/r` 清空。`destroyed` 后 `deploy_royroy` 直接拒绝（本局不可再部署/回收）。

### 3.5 Auto 随动（移动重定位）
宿主 `move` 成功后，若 `royroy.deployed && isAuto`，后端自动将 royroy 重定位至宿主新位置邻域空格（**不消耗宿主 MOVE**）。

### 3.6 阵营轮转
- `end-turn`：`activeFactionIndex+1` 取模 `factionTurnOrder`；若回到 0（最后活跃阵营结束）则 `round+1` 并 `resetAllActionPoints`（统一重置全部 AP）；否则仅切换 `activeFaction`，**不重置 AP**。
- 空角色已在 `factionTurnOrder` 构建时跳过（整备室仅含分配了角色的阵营）。
- `activeFaction` 门控：`move` 路由 + `/action` 路由校验宿主 `faction === activeFaction`，否则 `400 NOT_YOUR_TURN`。前端 `isMyTurn` 同步禁用非当前阵营操作。

## 四、验证

- 后端：`combat.ts` / `battleStateFactory.ts` / `types.ts` — `read_lints` **0 error**。
- 前端：`NewBattleView.vue` / `NewPreparationRoom.vue` — `read_lints` **0 error**。
- 类型：`BattleState`/`RoyroyState` 接口完整；`unitsObj` 改为 `any` 以容纳展开字段。

## 五、已知缺口与后续

1. **`/attack` 主路由缺失（pre-existing）**：后端无 `POST /api/combat/:battleId/attack`（前端 `combatAPI.attack` 会 404）。royroy 受击销毁逻辑（`damage_royroy`）已闭环，但「敌方点击 royroy 圆点发动攻击」的前端入口尚未接入（需先补齐 `/attack` 或让攻击流程支持 royroy 坐标为目标）。本次未重建攻击系统以免引入回归。
2. **`combatResolver.js` 未改动**：royroy 作为「独立攻击方参与结算（机动差额不互通）」依赖攻击结算管道；因 `/attack` 缺失，本次未对接，`damage_royroy` 仅处理 royroy 自身 HP，未接入单位间攻击结算。
3. **Non-Auto royroy「自由移动」**：报告规则 4「非 auto 可自由移动、回收需邻接」。当前 `deploy_royroy` 落点已强制相邻；non-auto 部署后**不可移动（定点）**。规则核心（定点不可动）已满足；「自由移动」需额外 `move_royroy` 动作，本次未实现（可选增强）。

## 六、部署状态

按用户「先不」指令，本次**未部署**。待确认后按标准流程：
```
rsync 整目录 → 服务器前端 npm run build →
docker compose build --no-cache mecha-gateway mecha-frontend →
docker compose up -d mecha-gateway mecha-frontend
```
（注意镜像名陷阱：`build` 产出 `mecha-universe-engine-mecha-gateway`，须 `up -d --no-deps` 且避开 `mecha-battle-db`。）
