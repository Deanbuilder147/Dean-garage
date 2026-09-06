# 阶段 0 开发计划报告：项目地基与枚举真相源

> 范围：Godot 工程骨架、`core/` 真相源、前后端通信契约基线。
> 三维考量：①alpha3.0 现状 ②Godot 平台优势/可复用插件 ③godot4_turn_based_combat_system 启示。

---

## 1. 维度一：alpha3.0 现状

- **后端枚举真相源已成熟**：`shared-kernel/src/enums.ts` 集中了 `TIMING` / `EFFECT_TYPE` / `ROLL_MODE` / `LIMIT_SCOPE` / `VALUE_METHOD` / `CONDITION_TYPE` / `ENTRY_TYPE`（均 `as const` + 字面量类型），由 `index.ts` 统一导出，所有子包从 `@mecha/shared-kernel` 导入。
- **但存在三头分化（阻塞项）**：`TIMING` 枚举（`on_attacked`/`on_damage_dealt`/`post_melee_damage`）与 `combatIntegrator.cjs` 实际点火（`pre_damage`/`on_damage`/`post_damage`/`on_damage_taken`）及 `reactionHandlers` 注册 key 三套命名并存。
- **Godot 侧反超**：`alpha4.0/core/enums.gd` 的 `TIMING` **已收口为流程阶段命名**（`PRE_DAMAGE`/`ON_DAMAGE`/`POST_DAMAGE`/`ON_DAMAGE_TAKEN` 等），且比后端更全——**Godot 侧已是更优真相源候选**。
- **通信契约已对齐**：前端 `battleSocket.js` 单例 + Pinia store（`apStore`/`moveStore`/`logStore`）派生，后端经 comm 3005 推送。

## 2. 维度二：Godot 平台优势与可复用插件

- **原生能力**：Godot 4 `class_name` + `RefCounted` 适合做枚举真相源（`Enums` 类已是 `extends RefCounted`）；`Resource` 适合做词条数据资产（见阶段 4）。
- **无需插件**：事件总线用 Godot 原生 `signal` + autoload 单例即可（GitHub 项目也指向此方向）。
- **参考验证用**：`HugoEnzo/HexGrid_Godot_4.0`（纯 GDScript，基于 redblobgames）可对照校验我们的 `hex_math.gd` 坐标公式，但**不能替换**——宪法红线规定 `hex_math.gd` 是唯一数学真理。

## 3. 维度三：godot4_turn_based_combat_system 启示

- 项目采用**组件化设计思想**（属性/技能/战斗行为拆独立组件），印证我们 `core/` 与 `scenes/` 分离的合理性。
- 其 `SkillEffectData` 演进方向（基类派生伤害/治疗/状态具体资源）可直接映射到我们的 `Resource` 词条资产设计（阶段 4）。
- 它是**教学框架**，无现成完整结算实现，只能借鉴架构范式，不能复制代码。

## 4. Godot 落地动作

1. **锁定 `core/enums.gd` 为 Godot 侧枚举真相源**，并**反向同步修复后端**：把 `shared-kernel/enums.ts` 的 `TIMING` 对齐到 Godot 版（删 `on_attacked` 等语义漂移别名，补齐 `pre_damage`/`on_damage`/`post_damage`/`on_damage_taken`）。
2. **建立枚举同步纪律**：修改任一端枚举须同步另一端 + `combatIntegrator` 点火名，纳入 PR 检查。
3. **core/ 保持零运行时依赖**：`enums.gd`/`hex_math.gd`/`types.gd` 不引用任何 Godot 节点树，纯数据/数学。
4. **通信契约基线**：定义 `BattleStatePayload` 结构（Godot `Dictionary` ↔ 后端 JSON），沿用 alpha3.0 `safeHp`/`isUnitDead` 的 0/NaN 兜底约定。

## 5. 验收标准

- [ ] Godot `core/enums.gd` 与后端 `shared-kernel/enums.ts` 的 `TIMING` 值集合完全一致（以 Godot 版为准）。
- [ ] `combatIntegrator` 全部点火名 ∈ `TIMING` 值集合（启动自检 `_gatewayKnownTriggers` 通过）。
- [ ] `core/` 三个文件无任何 Node/Scene 引用。
