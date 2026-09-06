# 阶段 5 开发计划报告：回合状态机与伤害结算（伤害计算过程核心）

> 范围：显式回合状态机 + 结算表阶段 5-8（伤害值/机动差值/额外值/结算1-2）的完整落地。
> 用户口径：阶段 5-8 = 我们现在计算伤害的整个过程。
> 详见 `mecha-universe-engine/docs/结算管线-原子触发时机对齐表.md` 与迁移计划「1.x」章节。

---

## 1. 维度一：alpha3.0 现状（伤害计算过程真相）

**阶段 5-8 已落地在 `combatIntegrator.executeAttack` 点火链**：
```
pre_damage → damagePipe.calculate → on_damage → post_damage → on_kill/on_death → on_damage_taken → post_attack
```
- **阶段 5 伤害值**：`damagePipe.calculate`（武器惩罚+装备/技能/地形减伤，`_calcDefense`）。
- **阶段 7 额外值**：`diceService.checkCrit` + `branchEvaluator` + `tagProcessor`（暴击/加成/分支）。
- **阶段 8 结算**：`post_damage`→`on_kill`/`on_death`→`on_damage_taken`→`post_attack`。
- **⚠️ 阶段 6 机动/姿态差值：缺口**——掩护/ZOC/姿态修正未进伤害公式。
- **⚠️ 阶段 8 反击链/三路分流：未完整**。
- **三头分化待治理**：`TIMING` 枚举 / `combatIntegrator` 点火 / `reactionHandlers` 注册三套命名（见阶段 0）。

## 2. 维度二：Godot 平台优势与可复用插件

- **状态机插件 `gd-YAFSM`**（嵌套 FSM，Resource 驱动，MIT，2025-08）：可直接用做 `BattleStateMachine`，支持嵌套（回合内子状态如 `SKILL_TARGETING`）。
- **或 `OmniState`**（可视化 FSM 编辑器，Godot 4.x）：可视化编排阶段 5 状态流转，便于调试结算顺序。
- **原生 signal 驱动结算时机**：`combatIntegrator` 的每个 `triggerPhase` 对应一个 `EventBus` 信号，Godot 侧可订阅特定时机做表现层反馈（伤害飘字、击杀特效）。

## 3. 维度三：godot4_turn_based_combat_system 启示

- **AI 行为树/状态机方向**：其计划用状态机驱动敌人行动——我们的 `BattleStateMachine` 须同时覆盖玩家回合与 AI 回合（`ENEMY_TURN` 状态）。
- **事件驱动结算**：结算各时机经信号解耦，渲染层只订阅 `on_damage`/`on_kill` 做表现，不介入计算。

## 4. Godot 落地动作

1. **`BattleStateMachine`**（建议用 `gd-YAFSM` 或自写 `Node`）：`IDLE→UNIT_SELECTED→SKILL_TARGETING→RESOLVING→ENEMY_TURN`，嵌套子状态管理结算时机。
2. **伤害计算不重建**：Godot 消费后端 `skill_cast_result` payload（含 `damage`/`crit`/`kill`），仅做表现；但**本地需能校验阶段 6 差值字段**（后端补完后）。
3. **时机信号订阅**：`EventBus` 暴露 `pre_damage`/`on_damage`/`post_damage`/`on_kill`/`on_damage_taken`/`post_attack`，渲染层订阅做飘字/特效。
4. **阶段 6 补完（后端 Phase C）**：后端 `damagePipe` 注入掩护/ZOC 修正后，Godot HUD 展示修正值（目前无字段，待补）。
5. **枚举收口（依赖阶段 0）**：`EventBus` 时机信号名必须 ∈ `core/enums.gd` 的 `TIMING` 值。

## 5. 验收标准

- [x] `BattleStateMachine` 轻量 FSM 落地（`core/battle_state_machine.gd`，自研拒绝 gd-YAFSM），覆盖 IDLE/UNIT_SELECTED/SKILL_TARGETING/ACTION_ANIMATING/ENEMY_TURN/ROUND_SETTLING；Battle3D 散落布尔逻辑收敛为 `battle_sm.*` 状态判定 + 输入锁。AI 回合态（ENEMY_TURN）已就绪，待阶段 6 填充 AI 驱动。
- [x] 伤害飘字经 `/attack` 响应 `combat_result.final_damage` 即时驱动（**非 EventBus 时机信号**，因 WS 推送为纯全量快照、无增量 events）；飘字为纯表现、不介入计算。
- [ ] 后端补完阶段 6 后，Godot HUD 能显示机动/姿态差值修正（前端已预留，不阻塞）。
- [x] `EventBus` 严格使用 `core/enums.gd` 的 `TIMING` 枚举常量（FSM 独立 State 枚举不与之冲突）。

### 6. 后端 Payload 核查结论（2026-08-14，第一步产出）

经核查 `mecha-universe-engine/backend-gateway/src/routes/combat.ts`：

`POST /api/combat/:battleId/attack` 200 响应（2712-2742 行）：
```json
{
  "success": true,
  "attacker_id": "...", "target_id": "...",
  "combat_result": {
    "triggered": true, "final_damage": 123, "dodged": false,
    "counter_triggered": false, "counter_damage": 0,
    "attack_type": "...", "attack_stat": "...", "damage_kind": "...",
    "dice": {...}, "message": "...", "formula": {...},
    "sizeBanner": null, "sizeTactic": null
  },
  "reaction_events": [...], "reaction_log": [...], "victory": {...}
}
```

**关键事实**：
1. ✅ **`is_crit` 已透传（2026-08-14 补齐并部署）**：`combat.ts` 组装 `combat_result` 处加 `is_crit: !!result?.is_crit`，tsc 干净 → `docker compose build mecha-gateway && up -d` 已热更上线（容器内 dist 已含 `is_crit`）。Godot 端 `_spawn_damage_float_from_result` 读 `combat_result.is_crit`，暴击走 `CRIT! -N` + 字号×1.4 + 亮橙红(#ff3b30) + TRANS_BACK 弹性冲顶回弹。
2. ⚠️ **`killed` 无显式字段**：击杀由 WS 全量 `battle_state` 推送中目标 `currentStats.hp` 归零（+ 可能从 units 移除）推断，前端按前后帧差值 + hp<=0 判定。
3. ✅ **WS 推送为纯全量快照**：`combatSnap.toPlainState` 仅导 `PLAIN_TOP_KEYS`+`units`+`map`，**无增量 events[]/damageLog[]** → 伤害飘字必须以前后端 `combat_result.final_damage`（HTTP 响应即时）为唯一驱动源，不能靠 WS 差值。

### 7. 待补（不阻塞阶段 5 闭环）
- 后端 `/attack` 透传 `is_crit` 进 `combat_result`（暴击闪红增强）。
- 击杀特效（当前仅飘字，无击杀专属表现）。
- statusEffects 图标剩余回合数字角标（P2）。
- 阶段 6 机动/掩护/ZOC 差值（后端未注入）。
