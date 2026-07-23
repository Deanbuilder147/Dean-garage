# Royroy 浮游辅机与阵营轮转 规则书 V1.0

> 本文档为最终设计权威规范，配套《系统重构与Royroy机制方案报告V2.0》与《实施执行报告》。
> 生效日期：2026-07-22

---

## 1. Royroy 浮游辅机

### 1.1 概念
- Royroy（浮游辅机）随「携带它的棋子（主机）」行动，**是主机的属性而非独立单位**。
- 单主机对应单 Royroy（取部件中首个「跟随 / royroy / 浮游 / 辅机」部件）。
- 主机经 `createBattleUnit` 自动注入 `royroy: RoyroyState`；未含跟随部件则无 `royroy` 字段。

### 1.2 数据模型 `RoyroyState`
| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | string | 名称 |
| `attack` | number | 攻击力（来自部件格斗/射击） |
| `defense` | number | **固定为 0**（数值净化，废弃防御力） |
| `hp` / `maxHp` | number | 当前/最大耐久 |
| `isAuto` | boolean | 技能 `category==='auto'` 即随动 |
| `deployMode` | 'follow' \| 'fixed' | 随动 / 定点 |
| `status` | 'inactive' \| 'deployed' \| 'destroyed' | 生命周期 |
| `deployed` | boolean | 是否在场上 |
| `q` / `r` | number? | 场上坐标（部署后有效） |
| `cooldownRound` | number? | 回收后冷却回合阈值 |

### 1.3 生命周期状态机
```
        deploy_royroy (不耗AP, 相邻空格)
   inactive ───────────────────────────────► deployed
      ▲                                        │
      │ retrieve_royroy (不耗AP, 回血至满)      │ damage_royroy (HP<=0)
      │ cooldownRound=round+2                  ▼
      └─────────────────────────────────── destroyed (终态, 本局不可再部署/回收)
```
- `destroyed`：绝对终态，deploy_royroy 直接拒绝。
- `inactive` 且 `cooldownRound <= round` 且未 `destroyed`：可再次部署。

### 1.4 部署（规则 1–2）
- **时机**：宿主的**行动环节**（宿主必须为当前 `activeFaction`）。
- **AP 消耗**：部署**不消耗**主机任何行动点。
- **落点**：必须与宿主相邻、为合法且未占用的格子。
- **前置约束**：未部署前技能不可用；仅部署后技能可用；`destroyed` 不可部署。

### 1.5 技能与攻击
- Royroy 技能**仅在部署后**可被使用。
- **Royroy 攻击 / 释放技能**：消耗主机 `ATTACK` 行动点。
- **Royroy 移动**（仅 Auto 随动）：**不消耗**主机 `MOVE`。

### 1.6 跟随与定点（Auto / Non-Auto）
- **Auto（`isAuto=true`，跟随）**：部署后坐标绑定主机。主机移动后由服务端自动重定位至其邻域空格（**不消耗主机 MOVE**）。
- **Non-Auto（`isAuto=false`，定点）**：部署后固定在地图绝对坐标，**绝对不可移动**。

### 1.7 回收（规则 4–5）
- **时机**：宿主行动环节（`activeFaction` 门控）。
- **条件**：royroy 已部署、`hp>0`、位置与宿主相邻（规则 4：非 auto 需回到边上才能回收）。
- **AP 消耗**：回收**不消耗**主机任何行动点。
- **效果**：`hp` 恢复至 `maxHp`；`status='inactive'`；`cooldownRound = round + 2`；坐标清空。

### 1.8 冷却（规则 6）
- 冷却语义：round **N** 回收 → round **N+2** 方可再部署（跳过下一整回合）。
- 冷却期间：不可再部署，技能不可用。

### 1.9 战损与销毁
- 场上 `hp` 降至 0 → 立即移除（`q/r=null`、`deployed=false`），标记 `destroyed`。
- `destroyed` 为本局终态：**绝对不可再拾取 / 重置 / 部署**。

### 1.10 AP 消耗关系表
| 动作 | 消耗主机 AP |
|------|------------|
| 部署 Royroy | 无 |
| Royroy 移动（Auto 随动） | 无（主机 MOVE 亦不耗） |
| Royroy 攻击 / 释放技能 | 主机 `ATTACK` |
| 回收 Royroy | 无 |

### 1.11 受击结算
- 攻击命中 Royroy 坐标 → 调用 `damage_royroy` 扣减 `hp` → `hp<=0` 标记 `destroyed`。
- （接入口依赖攻击系统；当前以 `damage_royroy` 动作闭环，详细见执行报告 §五缺口。）

---

## 2. 三方阵营轮转

### 2.1 角色定义
- **攻击阵营 / 防守阵营 / 偷袭阵营** 三角色。
- 角色在**整备室环节**由玩家为每个阵营分配（下拉选择）：`factionRoles`。
- `createBattle` 时由前端生成：
  `factionTurnOrder = ['attack','defense','ambush'].map(role => 分配了该角色的faction).filter(Boolean)`
  —— 即按 攻击→防守→偷袭 顺序收集 faction，**未分配角色的阵营自动跳过**。

### 2.2 行动顺序
- 战斗中严格按 **攻击 → 防守 → 偷袭** 顺序进行。
- 空角色（未分配）**跳过**该阵营回合（已在 `factionTurnOrder` 构建时剔除）。

### 2.3 回合与 AP 重置
- **单阵营回合结束**：**不重置**任何单位 AP。
- 当**最后一个活跃阵营**（如偷袭方）结束回合、进入下一 Round 时（`Round+1`）：**统一重置场上所有单位 AP**（`resetAllActionPoints`）。
- `round` 从 1 开始；`end-deployment` 进入战斗时 `activeFaction = factionTurnOrder[0]`、`activeFactionIndex=0`。

### 2.4 activeFaction 门控
- 仅当前 `activeFaction` 的单位可执行：移动、`deploy_royroy`、`retrieve_royroy`、攻击。
- 违例：服务端返回 `400 NOT_YOUR_TURN`；前端 `isMyTurn` 同步禁用非当前阵营操作并高亮当前阵营。

---

## 3. 数值与伤害管线（摘要，详见 V2.0 报告 §4）
- **面板净化**：格斗/射击仅提取自「机体」和「武器」；防具/载具不污染攻击面板。
- **移动力 Speed** = 机体机动 + 载具机动(耐久>0) + 背包机动(耐久>0)，废除旧换算公式。
- **防御力 Defense** 彻底废弃 = 0；由护甲（机体结构 × 0.25）与防具/背包独立伤害分担（每次受击各吸 3 点，HP=结构×2，耐久=5）接管。
- **机动差额** `M_atk − M_def` 上限封顶 +5，下限不设限制。
- **路径逐段行走**：后端透传 BFS 完整 `path`，前端逐段 `lerp` 平滑移动并实时计算六方向切片；终点保留最后一步朝向，不重置为 0。

---

## 4. 接口契约

### 4.1 建战
```
POST /api/combat
{ "battlefield_id": <uuid>, "factionTurnOrder": ["earth", "maxion", ...] }
```

### 4.2 Royroy 动作
```
POST /api/combat/:battleId/action
{ "actionType": "deploy_royroy",  "params": { "unit_id": "U1", "q": 3, "r": 4 } }
{ "actionType": "retrieve_royroy","params": { "unit_id": "U1" } }
{ "actionType": "damage_royroy",  "params": { "unit_id": "U1", "dmg": 5 } }
```

### 4.3 阵营
```
POST /api/combat/:battleId/end-turn   → 推进 activeFaction / round（Round+1 时统一重置 AP）
GET  /api/combat/:battleId/state      → 含 factionTurnOrder / activeFaction / activeFactionIndex / round
                                         及 units（展开 royroy_deployed / royroy_q / royroy_r / royroy_status）
```

---

## 5. 实施状态
- 后端（`types.ts` / `battleStateFactory.ts` / `routes/combat.ts`）+ 前端（`NewBattleView.vue` / `NewPreparationRoom.vue`）代码已全部落地，`lint` **0 error**（详见《实施执行报告》）。
- 部署：按用户「先不」指令，待确认后执行标准部署流程。
