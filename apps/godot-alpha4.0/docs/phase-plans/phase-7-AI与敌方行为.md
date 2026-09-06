# 阶段 7 开发计划报告：AI 与敌方行为

> 范围：敌方回合驱动（对应结算表 ENEMY_TURN）、AI 行为树/状态机、奇袭反应。
> 映射：结算表阶段 1-8 的敌方侧执行（阶段 5-8 伤害过程同样适用于 AI）。

---

## 1. 维度一：alpha3.0 现状

- **faction × role 双语义**：`role`（attack/defense/ambush）是逻辑判定唯一依据；`factionSkillRegistry` 按角色发"攻击/防守/偷袭"技能。
- **奇袭（反应奇袭）**：前后端完整实现（QTE 弹窗 + 暗绿滤镜 + 轮询 `pendingSurprise`）；用户反馈"没提示"待构造对局实测。
- **隐匿拨乱反正**：隐匿资格属 ambush（偷袭方），`resolveRole()==='ambush'` 判定。
- **AI 逻辑**：后端 `skillExecutor` 五谓语对敌方单位同等执行，但"敌方如何选技能/目标"的决策层未在前端/Godot 侧实现。

## 2. 维度二：Godot 平台优势与可复用插件

- **AI 状态机插件**：`gd-YAFSM` 同样可驱动敌方 `ENEMY_TURN` 子状态（选技能→选目标→执行）。
- **行为树**：Godot 社区有 `BehaviorTree` 类插件；若敌方逻辑复杂可引入，简单情形用状态机足够。
- **信号解耦**：敌方决策结果经 `EventBus.skill_cast_result` 推送，与玩家侧表现层共用。

## 3. 维度三：godot4_turn_based_combat_system 启示

- **明确方向**：「AI 逻辑的模块化：设计更灵活的 AI 行为树或状态机来驱动敌人行动」——这是其四大演进方向之一，直接对应阶段 7。
- 其当前 AI 可能内置在战斗系统，计划模块化——我们应在 Godot 侧**一开始就模块化**，不重蹈"内置→拆分"覆辙。

## 4. Godot 落地动作

1. **敌方决策模块化**：`ai/` 目录独立，`EnemyAI` 组件读 `BattleStatePayload` → 产出自走决策（选技能/目标）→ 经 `ws_client` 发后端执行。
2. **`BattleStateMachine` 的 `ENEMY_TURN`**：进入后激活 `EnemyAI`，决策完成触发 `RESOLVING`。
3. **奇袭 QTE**：`EventBus` 收到 `pendingSurprise` → Godot 弹 QTE + 暗绿滤镜（`Color(0.1,0.4,0.1,0.5)` 全屏 overlay），轮询 resolved。
4. **role 判定**：敌方技能发放/敌我判定一律走 `unitRoleOf(u)=u.role||u.faction`，禁比 `u.faction`（宪法红线）。

## 5. 验收标准

- [ ] 敌方回合经 `EnemyAI` 模块决策，与玩家共用阶段 5-8 结算链路。
- [ ] 奇袭 QTE 在 `pendingSurprise` 时正确弹出并联动后端。
- [ ] 所有敌我/掩护/ZOC 判定基于 `role`，无 `faction` 直接比较。
