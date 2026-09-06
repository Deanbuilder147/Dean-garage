# 阶段 2 开发计划报告：移动与战场交互

> 范围：走位（对应结算表阶段 2）、地形加权寻路、AOE 形状预览、用户输入事件绑定。
> 映射：结算表阶段 2「移动」+ 阶段 4「选定目标」的 AOE 预览部分。

---

## 1. 维度一：alpha3.0 现状

- **移动已实现**：`/move` 用 Dijkstra 地形加权全单位占位阻塞；AP `MOVE:1` 用满即 standby。
- **AOE 高亮已通（Phase 4.3）**：`hex_math.aoe_cells_from_skill` 支持 `circle` 形状 + `aoe_radius`；`Battle3D.gd` 有 `_update_aoe_preview`/`_draw_aoe_highlight`（暗红），demo 注入 `sk-aoe-1`。
- **射程单一真相源（Phase 31）**：远程=3，`getSkillRangeFields` 支持数字/`"a~b"`/`{min,max}`，字段优先级 `cast_range ?? max_range ?? range_max ?? range`。
- **事件穿透规范**：外层 UI 浮动层 `pointer-events:none` 穿透空白区。

## 2. 维度二：Godot 平台优势与可复用插件

- **寻路可直接用 Godot `AStarGrid2D`/`AStar2D`**：地形加权通过 `AStar` 的 `_compute_cost`/`_estimate_cost` 覆盖，比后端自写 Dijkstra 更省；但**阻塞逻辑（全单位占位）须与后端一致**，以后端结算为准。
- **Hex 插件**：`Hex Strategy Map` 自带 step-based 寻路层，可作对照，但数学仍用 `hex_math.gd`。
- **输入事件**：Godot `InputEventMouseMotion` 天然支持（我们 `Battle3D.gd` 已用），hover 预览比前端 canvas 事件更干净。

## 3. 维度三：godot4_turn_based_combat_system 启示

- 其 `PRE_MOVE`/`POST_MOVE` 时机枚举与我们的 `TIMING.PRE_MOVE`/`POST_MOVE` 一致——**移动前后钩子应保留**，供阶段 5-8 的 buff/地形修正接入。
- 组件化中 `TurnActionComponent` 专注战斗行为流程，移动是其实例之一。

## 4. Godot 落地动作

1. **移动消费后端结果**：Godot 不发独立结算，调用后端 `/move` 返回路径后由 `Battle3D` 播放动画；寻路预览可用 `AStarGrid2D` 本地算（仅展示），落子以后端为准。
2. **AOE 预览固化**：把 Phase 4.3 的 `_update_aoe_preview` 提升为 `render/` 下独立 `AoePreview` 节点，支持 `circle`/未来 `line`/`cone`。
3. **射程环**：用 `getSkillRangeFields` 镜像函数画合法格高亮。
4. **事件绑定**：外层 UI（`Control` 浮动层）`mouse_filter=MOUSE_FILTER_IGNORE` 穿透，仅交互控件接收。

## 5. 验收标准

- [ ] 移动路径预览与后端 `/move` 返回一致。
- [ ] AOE 形状（circle+radius）预览与 Phase 4.3 demo 一致。
- [ ] 射程高亮遵循 `cast_range ?? max_range ?? range_max ?? range` 优先级。
- [ ] 浮动 UI 空白区点击穿透到战场。
