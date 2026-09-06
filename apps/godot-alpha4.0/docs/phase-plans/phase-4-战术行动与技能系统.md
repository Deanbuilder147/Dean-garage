# 阶段 4 开发计划报告：战术行动与技能系统（含 Phase 4.3 AOE）

> 范围：选技能（声明战术）、进入 targeting、选目标格、AOE 形状预览、技能执行入口。
> 映射：结算表阶段 3「声明战术」+ 阶段 4「选定目标」+ 阶段 5 前半「伤害值计算前」。
> 用户口径：阶段 3-8 = 战术行动细分；阶段 5-8 = 伤害计算过程。

---

## 1. 维度一：alpha3.0 现状

- **五谓语技能已落地（skillExecutor v5）**：attack/heal/buff/debuff/passive 统一 switch，词条 JSON 驱动。
- **普通攻击已删除（Phase 32）**：攻击由机体真实携带技能承载；无 `skill_id` 的 `/attack` 返回 400 `SKILL_REQUIRED`。
- **AP 行动点**：`{MOVE:1,ATTACK:1,DEFEND:1}`，用满任意两类即 standby；行动画板四按钮（移动机动/战术行动/防御/待机）。
- **AOE 已通（Phase 4.3）**：`types.gd` 的 `unit_skill` 含 `shape`/`aoe_radius`；`Battle3D.gd` 有 AOE hover 预览。
- **词条库中枢（v1.1）**：四区域（SkillListPanel/DetailPanel/BattleTestPanel + HexCanvasEditor），`skill_key` 外键强引用。

## 2. 维度二：Godot 平台优势与可复用插件

- **Resource 做词条资产**：Godot `Resource` 子类（`SkillEffectData` 思路）天然适合存技能词条，编辑器内可视化编辑——比前端 JSON 表单体验更好。
- **状态机驱动 targeting**：阶段 5 的 `BattleStateMachine` 可管理 `IDLE→UNIT_SELECTED→SKILL_TARGETING→RESOLVING`。
- **Hex 插件**：AOE 范围计算可参考 `Hex Strategy Map` 的 area 工具，但形状逻辑以 `hex_math.aoe_cells_from_skill` 为准。

## 3. 维度三：godot4_turn_based_combat_system 启示

- **`SkillEffectData` 基类派生**：「为伤害/治疗/状态施加派生具体 EffectData 资源」——直接映射到我们的五谓语枚举（`ENTRY_TYPE`）。
- **`CombatComponent` 拆分为 `SkillComponent` + `TurnActionComponent`**：`SkillComponent` 管属性/技能/状态，`TurnActionComponent` 管战斗行为流程——建议 Godot 侧照搬此拆分。
- **组件化**：技能处理逻辑独立成 `SkillComponent`，与渲染解耦。

## 4. Godot 落地动作

1. **战斗单位组件化**：`BattleUnit` 节点挂 `SkillComponent`（属性/技能/状态）+ `TurnActionComponent`（行为流程），对应 GitHub 拆分方向。
2. **技能词条 Resource**：`SkillData extends Resource`，字段对齐 `unit_skill`（含 `skill_key`/`cast_range`/`shape`/`aoe_radius`），从后端 JSON 反序列化。
3. **targeting 流程**：`BattleStateMachine` 进入 `SKILL_TARGETING` → 监听 `EventBus.unit_selected` → 调用 `aoe_cells_from_skill` 预览 → 发起 `/skill`。
4. **四按钮画板**：移动机动/战术行动/防御/待机，AP 消耗经 `EventBus` 反映到 HUD。

## 5. 验收标准

- [ ] 选技能→targeting→AOE 预览→`/skill` 全链路与 Phase 4.3 demo 一致。
- [ ] 无 `skill_id` 发起攻击被前端拦截（提示"请选择技能"），对应后端 400。
- [ ] `BattleUnit` 含 `SkillComponent` + `TurnActionComponent` 两独立组件。
