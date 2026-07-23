# 系统重构与 Royroy 机制方案报告（V2.0 终稿）

> 状态：**方案终稿，待用户确认后实施**。未改动任何代码。
> 日期：2026-07-22
> 代码根：mecha-universe-engine（gateway TS + combat-service `.cjs` + 前端 Vue）
> 配套文档：`royroy与阵营顺序修改报告.md`（前稿，已被本终稿取代）

---

## 0. 实现状态对照表（先读此表）

| 模块 | 关键规则 | 状态 |
|---|---|---|
| 数值净化（格斗/射击仅机体+武器） | 面板不被防具/载具污染 | ✅ 已实现（excel-schema-normalizer） |
| Speed = 机体+载具+背包机动(耐久>0) | 废除旧换算 | ✅ 已实现（mapToUnitStats） |
| Defense = 0，护甲=结构*0.25 | 防御力废弃 | ✅ 已实现（damagePipe/equipmentDurability） |
| 防具/背包独立 HP=结构*2、耐久=5；武器/载具耐久=结构 | 独立耐久 | ✅ 已实现（buildEquipmentFromParts） |
| 伤害分担每次 3 点 | 防具/背包吸收槽 | ✅ 已实现（equipmentDurability） |
| 机动差额封顶 +5、下限不限 | effective mobility | ✅ 已实现（damagePipe/combatResolver） |
| 路径逐段行走 + 终点保留朝向 | BFS path + lerp + computeDirection | ✅ 已实现（combat.ts /move + NewBattleView） |
| 历史数据迁移脚本 | DRY / --apply | ✅ 已实现（recomputeUnitStats.ts） |
| **Royroy 属性模型（Auto/Non-Auto、HP=0 销毁、冷却 round+2）** | 本报告 §2 | ❌ 待实施（上一轮独立单位实现方向错误，需回退重做） |
| **阵营轮转 攻击→防守→偷袭 + 空跳过** | 本报告 §3 | ❌ 待实施 |
| **全局 AP 仅在 Round+1 统一重置** | 本报告 §3 | ❌ 待实施 |

---

## 1. 修改概述与根因分析

### 1.1 为何重构
1. **Royroy 模型方向错误**：上一轮将 royroy 实现为「独立 BattleUnit + 开局部署阶段生成」，与前端既有属性模型（`unit.royroy` 属性 + `royroy_deployed` 标记 + `royroy_q/r` 坐标，黄色圆点绘制）冲突，且后端缺失 `/action` 路由（前端 `deployRoyroyAt` 调用 404）。须回退重做为属性模型。
2. **无阵营回合顺序**：`end-turn` 仅 `resetAllActionPoints` + `turn+=1`，无任何阵营轮转；`GET /state` 不返回 `faction_turn`，前端永远显示「准备中」。用户要求固定 攻击→防守→偷袭 顺序且空阵营跳过。
3. **AP 重置粒度错误**：原逻辑每回合重置所有单位；用户要求「仅当 Round 最后一个活跃阵营结束、进入下一 Round 时才统一重置」。
4. **数值/伤害/朝向已正确实现**（见 §0），本报告将其固化为设计基线，不再改动。

### 1.2 架构修正点
- Royroy 从「独立 BattleUnit」退化为「宿主单位的属性 + 场上圆点标记」，由 `/action` 路由在宿主行动环节驱动部署/回收。
- 战斗状态 `BattleState` 引入阵营轮转三件套（`factionTurnOrder` / `activeFactionIndex` / `round`）。
- 行动点重置时机从「每次 end-turn」改为「Round 边界」。

---

## 2. Royroy 详细逻辑与状态机

### 2.1 数据形态（属性，非独立单位）
`createBattleUnit`（`battleStateFactory.ts`）抽取 `跟随` 部件（归一 `type:'跟随'`，见 excel-schema-normalizer 别名表）写入宿主 `unit.royroy`：
```ts
unit.royroy = {
  name,
  attack, defense, hp, maxHp, mobility,
  skills,                         // 跟随部件自带技能
  isAuto,                         // skills 任一 category==='auto' → true（仅 'auto' 一种）
  deployed: false,
  destroyed: false,              // 场上 HP=0 击毁后置 true，本局不可再部署
  q: null, r: null,              // 场上坐标
  cooldownRound: 0,              // 回收后冷却，battle.round >= cooldownRound 才可再部署
}
unit.royroy_deployed = false
```
> 回退：删除上一轮 `createRoyroyUnit` / `extractRoyroyParts`（独立单位版）及 `combat.ts` deploy-unit 中的 royroy spawn、`/move` 中的独立单位约束。

### 2.2 坐标定位（Auto / Non-Auto）
- **Non-Auto（`isAuto:false`）**：部署后固定在地图**绝对坐标**（定点炮台/地雷），**绝对不可移动**。
- **Auto（`isAuto:true`）**：部署后坐标**绑定主机**。主机移动后自动重定位至主机周围 1 格内的合法空格（跟随）；royroy 自身不主动移动。

### 2.3 战损与击毁（HP=0）
- 若场上 royroy `hp` 降至 0：立刻移除（`q/r=null`、`deployed=false`），并置 `destroyed=true`。
- `destroyed=true` 后：本局战斗内**绝对不可再拾取、重置或部署**（deploy_royroy 校验 `!destroyed && hp>0`）。
- 该销毁逻辑接入伤害管线（`equipmentDurability` / `damage` 结算 royroy 受击时）。

### 2.4 部署 / 回收 触发条件
- 均须在**宿主的行动环节**（宿主为当前 activeFaction 且未被门控拒绝）。
- **部署（deploy_royroy）**：`!deployed && !destroyed && hp>0 && battle.round >= cooldownRound && 目标格与主机相邻且为空`。
- **回收（retrieve_royroy）**：`deployed && hp>0 && （Auto 任意 / Non-Auto 须 hexDistance(royroy,host)<=1）`。

### 2.5 技能与 AP 消耗关系表
| 行为 | AP 消耗 | 说明 |
|---|---|---|
| 部署 royroy（deploy_royroy） | **无** | 不消耗主机任何行动点 |
| 回收 royroy（retrieve_royroy） | **无** | 不消耗主机任何行动点 |
| Royroy 移动（仅 Auto 随动） | **无** | 不消耗主机 MOVE |
| Royroy 释放技能 / 攻击 | **主机 ATTACK ×1** | 即「战术行动」；校验主机 `ATTACK>0` 后 `consumeActionPoint(host,'ATTACK')` |

- Royroy 技能**仅部署后可调用**（前端 `unit.royroy_deployed` 控制按钮启用）。
- 回收后 `hp = maxHp`，不消耗 AP。

### 2.6 冷却（Cooldown）
- 回收时 `cooldownRound = battle.round + 2`。
- 例：royroy 在所在阵营 **round 2** 被回收 → 仅 **round 4** 起可再次部署。
- `cooldownRound > battle.round` 期间不可部署、技能不可用。

### 2.7 状态机（ASCII）
```
                 [初始] unit.royroy{deployed:false, destroyed:false, cooldownRound:0}
                          │  宿主行动环节 + 校验通过
                          ▼
                 ┌──────────────┐  deploy_royroy (free)
                 │  已部署 DEPLOYED │──────────────────────────┐
                 └──────────────┘                              │
                  │ 场上                                        │  HP→0 (受击)
        ┌─────────┴──────────┐                                 │
   Auto │ 绑定主机, 主机移动    │ Non-Auto │ 绝对坐标, 不可移动    │
        │ 自动重定位 1 格内      │            │                    │
        └─────────┬──────────┘            └─────────┬──────────┘
                  │ royroy 攻击 → 消耗主机 ATTACK      │
                  │ skills 仅部署后可用                │
                  ▼                                    ▼
           retrieve_royroy (free, 需 hp>0 + 邻接[非auto])
                  │ → hp=maxHp, q/r=null, cooldownRound=round+2
                  ▼
            ┌──────────────┐  round >= cooldownRound 且 hp>0
            │  冷却 COOLDOWN  │─────────► 回到 [已部署] (再次 deploy)
            └──────────────┘
                  │ round < cooldownRound
                  ▼  不可部署 / 技能禁用

   [HP→0 任意状态] ──► destroyed=true, deployed=false, q/r=null ──► 本局终结（不可再部署）
```

---

## 3. 阵营轮转与全局 AP 重置流转图

### 3.1 角色确定（整备室）
- `NewPreparationRoom.vue` 增加每个阵营「角色」选择：攻击 / 防守 / 偷袭 / 无。
- 建战时传入 `factionRoles: { [factionCode]: 'attack'|'defense'|'ambush'|null }`。

### 3.2 顺序与跳过
- `factionTurnOrder` = 依 `攻击→防守→偷袭` 排列、剔除空角色的阵营 code 数组。
- 例：仅攻击+偷袭有角色 → `['attackFaction','ambushFaction']`，防守跳过。

### 3.3 轮转 + AP 重置（核心修正）
- **单个阵营回合结束（end-turn）不重置 AP**。
- 仅当**当前 Round 的最后一个活跃阵营**结束回合、推进到下一 Round（`round + 1`）时，**统一重置场上所有单位 AP**（`resetAllActionPoints`）。
- `end-turn` 伪逻辑：
  ```
  activeFactionIndex++
  if (activeFactionIndex >= factionTurnOrder.length) {
      activeFactionIndex = 0
      battle.round += 1
      resetAllActionPoints(battle)   // 仅 Round 边界统一重置
  }
  ```

### 3.4 流转图（ASCII）
```
 Round R
   │ activeFaction = order[0] (攻击)
   │   攻击阵营单位自由行动（各自 AP，不被中途重置）
   │   点击 end-turn ──► 不重置 AP
   ▼
   │ activeFaction = order[1] (防守)   [若空则跳过该步]
   │   点击 end-turn ──► 不重置 AP
   ▼
   │ activeFaction = order[2] (偷袭)   [最后活跃阵营]
   │   点击 end-turn
   ▼
 ┌─────────────────────────────────────────────┐
 │ activeFactionIndex 回到 0                      │
 │ battle.round += 1  ★ 统一 resetAllActionPoints │
 └─────────────────────────────────────────────┘
   ▼
 Round R+1 ...（循环）
```
- 行动门控：move / action（deploy_royroy/retrieve_royroy）/ 技能 / 攻击 仅当 `unit.faction === factionTurnOrder[activeFactionIndex]`，否则返回 `403 NOT_YOUR_TURN`。
- `GET /state` 补回 `factionTurnOrder` / `activeFaction` / `round`（修复前端 `faction_turn` 永远「准备中」）。

---

## 4. 数值与伤害分担管线计算逻辑

### 4.1 攻击面板净化（已实现，固化）
- 格斗值：`sumPartStat(parsed.units, '格斗', ['机体','武器'])` —— **不含**防具/载具/背包/royroy。
- 射击值：`sumPartStat(parsed.units, '射击', ['机体','武器'])`。
- 即面板攻击力仅由机体与武器贡献。

### 4.2 移动力 Speed（已实现）
```
Speed = 机体机动
      + (载具机动  若 载具耐久 > 0)
      + (背包机动  若 背包耐久 > 0)
```
- 废除旧换算公式；`moveRange = Speed`，逐格 BFS 以 `moveRange` 为步数上限。

### 4.3 防御力 Defense（已实现，废弃）
- `Defense` 硬性设为 **0**，完全由以下接管：
  - **护甲（armor）** = `floor(机体结构 * 0.25)` → 并入减伤（`damagePipe._calcDefense` 的 `armorValue`）。
  - **防具/背包独立伤害分担**：每次受击各吸最多 3 点，HP=结构*2，耐久=5（见 4.5）。
- 武器/载具：耐久 = 结构（不计入防御，仅技能可用次数）。

### 4.4 机动差额（已实现）
```
effective_atk_mobility = 机体机动 + (使用武器技能时 ? 武器机动 : 0)
effective_def_mobility = 机体机动 + (防守方时 ? 防具机动 : 0)
mobility_diff = effective_atk_mobility - effective_def_mobility
mobility_diff = min(mobility_diff, +5)   // 上限封顶 +5，下限不设限制
attack_with_mobility = base_attack + mobility_diff
```
- Royroy 作为独立攻击方：其机动取自 `unit.royroy.mobility`，**不并入主机**（机动差额不互通）。

### 4.5 伤害分担公式（已实现，equipmentDurability）
- 受击结算时，所有 `type==='armor'` 且未破损的装备槽各吸收 `absorb = min(remaining, 3)` 点：
  - `remaining -= absorb`；`absorbed += absorb`
  - `durability -= 1`；`hp -= absorb`
  - `hp<=0 || durability<=0` → `broken`，并回写 `unit.equipState[idx].destroyed/hp/durability`。
- 穿透剩余伤害继续作用于单位 `currentStats.hp`。

### 4.6 Royroy 受击（待接入 4.3/4.5 框架）
- Royroy 场上 `hp` 由 `unit.royroy.hp` 承载；受击按 4.5 同等分担逻辑扣减；归零触发 §2.3 销毁。

---

## 5. 受影响文件与容器清单

| 层 | 文件 | 改动 |
|---|---|---|
| 类型 | `shared-kernel/src/types.ts` | `BattleUnit` 增 `royroy` / `royroy_deployed`；`BattleState` 增 `factionTurnOrder` / `activeFactionIndex` / `round` |
| 工厂 | `backend-gateway/src/battleStateFactory.ts` | 抽 `跟随`→`unit.royroy`（含 isAuto/destroyed/cooldownRound/deployed/q/r）；**删除**独立单位版 `createRoyroyUnit`；按 `factionRoles` 初始化 `factionTurnOrder` |
| 路由 | `backend-gateway/src/routes/combat.ts` | 新增 `/action`（deploy_royroy/retrieve_royroy，含全部校验 + HP=0 销毁）；`end-turn` 改阵营轮转 + Round+1 统一重置；行动网关加 activeFaction 门控；`GET /state` 补 `factionTurnOrder/activeFaction/round`；**删除** deploy-unit royroy spawn 与 `/move` 独立单位约束 |
| 战斗 | `services/combat-service/src/services/combatResolver.js` + `backend-gateway/src/skillExecutor.ts` | 支持 royroy 作为独立攻击方（主机 ATTACK 消耗、机动不互通）；royroy 受击接入销毁逻辑 |
| 前端 | `frontend/src/views/NewBattleView.vue` | royroy 部署/回收/跟随重定位/冷却/销毁渲染；royroy 攻击消耗主机 ATTACK；activeFaction 门控；`faction_turn` 显示改为读 `activeFaction` 角色名 |
| 前端 | `frontend/src/views/NewPreparationRoom.vue` | 阵营角色（攻击/防守/偷袭/无）选择器，建战传入 `factionRoles` |
| API | `frontend/src/api/client.js` | `action()` 已存在；可加 `retrieveRoyroy` 便捷方法（可选） |
| 容器 | `mecha-gateway`（内嵌 combat-service）、`mecha-frontend` | 标准流程 rsync → build → up（用户此前「先不」，待确认后部署） |

> 无历史旧战斗数据负担（用户确认忽略兼容）；Royroy/阵营为实时计算与状态字段，**无需数据迁移**。数值迁移脚本 `recomputeUnitStats.ts` 仍保留用于既有数值刷新（独立任务）。

---

## 6. 实施步骤 Roadmap（确认后执行）

1. **回退错误实现**：删除 `battleStateFactory` 独立单位版 `createRoyroyUnit`/`extractRoyroyParts`；删除 `combat.ts` deploy-unit royroy spawn 与 `/move` 独立单位约束。
2. **类型与工厂**：`types.ts` 增字段；`battleStateFactory` 抽 `unit.royroy` 属性模型 + 初始化 `factionTurnOrder`。
3. **Royroy 动作路由**：`combat.ts` 新增 `/action`（deploy_royroy / retrieve_royroy），落实 §2 全部校验、冷却、HP=0 销毁。
4. **战斗结算对接**：`combatResolver`/`skillExecutor` 支持 royroy 独立攻击方（主机 ATTACK 消耗、机动不互通），royroy 受击销毁回写。
5. **阵营轮转 + AP 重置**：`BattleState` 增字段；`end-turn` 改轮转 + Round+1 统一重置；行动网关加 activeFaction 门控；`GET /state` 补字段。
6. **前端整备室**：`NewPreparationRoom` 阵营角色选择器，建战传 `factionRoles`。
7. **前端战场**：`NewBattleView` royroy 部署/回收/跟随/冷却/销毁交互、royroy 攻击消耗主机 ATTACK、activeFaction 门控与 `faction_turn` 显示。
8. **校验与部署**：TS/CJS lint 通过 → rsync 同步 → `frontend npm run build` → `docker compose build --no-cache mecha-gateway mecha-frontend` → `up -d --no-deps` 两容器。

---

*待用户确认本 V2.0 终稿后，将依 §6 roadmap 依次实施；部署保持「先不」状态直到另行指令。*
