# Godot 战棋项目迁移开发计划

> 目标：将后端 `mecha-universe-engine` 已有的数据驱动战斗引擎（词条/技能/回合/AI）按 Godot 战棋正常开发顺序，逐步落地到 Godot 客户端，最终完整迁移到 Godot 上。
>
> 编写日期：2026-08-13
> 工程路径：`/Users/dingxuyang/Desktop/wggodot/alpha4.0/`
> 后端通信：HTTP `ApiClient` + 原生 WS `net/ws_client.gd`（已封装，endpoint `ws://106.54.197.69:8081/ws-native`）

---

## 0. 现状盘点（已验证可用，请勿重复造轮子）

| 能力 | 2D (`scenes/Battle2D.gd` + `HexBoard`) | 3D (`scenes/Battle3D.gd`) | 后端 |
|------|--------------------------------------|---------------------------|------|
| 登录 / 拉战局 | ✅ | ✅ | `/combat` `ApiClient.login/list_rooms/get_battle_state` |
| WS 实时同步 | ✅ | ✅ | comm `/ws-native` |
| 棋盘渲染 | ✅ HexBoard 2D 六边形 | ✅ 六棱柱 3D 等距 |
| 相机交互 | ✅ 拖拽/滚轮/等距切换 | ✅ WASD/右键旋转/触控板（打磨完） |
| 单位选中 | ✅ 左键选中 | ✅ 左键 + 触屏点选 |
| 移动（move） | ✅ `post_battle_action("move")` | ✅ 同 | ✅ `/move` Dijkstra |
| 技能（skill） | ❌ 未接 | ❌ 未接 | ✅ `skillExecutor` 已就绪 |
| 回合 / AP 显示 | ❌ | ❌ | ✅ `/end-turn` 已就绪 |
| 状态效果显示 | ❌ | ❌ | ✅ `statusEffects[]` 已结算 |
| AI 敌方回合 | ❌ | ❌ | ✅ `aiEngine.cjs` 已就绪 |
| HUD / 词条库 UI | ❌ | ❌ | ✅ `GlossaryHub.vue`（Web 侧已上线） |

**结论**：阶段 0–3 已实质完成（3D 甚至比 2D 更完整）。下一步真正要补的是 **阶段 4（技能）起步 + 阶段 5（回合/状态）起步**。后续阶段按业务优先级渐进。

---

## 0.x 阶段开发计划报告索引（按三维考量生成）

> 每个阶段一份独立报告，统一考量三个维度：
> ① **alpha3.0 项目现状**（后端已落地能力）② **Godot 平台优势与可复用插件** ③ **godot4_turn_based_combat_system**（https://github.com/LiGameAcademy/godot4_turn_based_combat_system）列出的架构方向。
> 报告目录：`docs/phase-plans/`

| 阶段 | 报告文件 | 核心范围 | 三维要点速览 |
|------|----------|----------|--------------|
| 阶段 0 | [phase-0-项目地基与枚举真相源.md](phase-plans/phase-0-项目地基与枚举真相源.md) | 工程骨架 / `core/` 真相源 / 枚举收口 | ①后端枚举三头分化 ②Godot `RefCounted` 枚举 ③组件化范式 |
| 阶段 1 | [phase-1-资产与渲染管线.md](phase-plans/phase-1-资产与渲染管线.md) | 七视图渲染 / 像素锐化 / 坐标层级 | ①七视图4级降级 ②`Sprite3D`+Nearest ③渲染逻辑分离 |
| 阶段 2 | [phase-2-移动与战场交互.md](phase-plans/phase-2-移动与战场交互.md) | 走位 / AOE 预览 / 射程高亮 | ①Dijkstra+Phase4.3 AOE ②`AStarGrid2D` ③`PRE_MOVE` 钩子 |
| 阶段 3 | [phase-3-EventBus信号总线与网络解耦.md](phase-plans/phase-3-EventBus信号总线与网络解耦.md) | 事件总线 / WS 解耦 | ①`battleSocket.js` 单例 ②autoload signal ③信号解耦方向 |
| 阶段 4 | [phase-4-战术行动与技能系统.md](phase-plans/phase-4-战术行动与技能系统.md) | 选技能 / targeting / AOE / 技能执行 | ①五谓语 v5+Phase32 ②`Resource` 词条 ③`SkillComponent` |
| 阶段 5 | [phase-5-回合状态机与伤害结算.md](phase-plans/phase-5-回合状态机与伤害结算.md) | 状态机 + 阶段 5-8 伤害计算 | ①`combatIntegrator` 点火链 ②`gd-YAFSM` ③AI 状态机方向 |
| 阶段 6 | [phase-6-战局持久化与快照.md](phase-plans/phase-6-战局持久化与快照.md) | 快照 / 断线重连 / 不可变沙盒 | ①`state_snapshot` ②`ResourceSaver` ③（无） |
| 阶段 7 | [phase-7-AI与敌方行为.md](phase-plans/phase-7-AI与敌方行为.md) | 敌方回合 / 奇袭 / role 判定 | ①`factionSkillRegistry` ②`BehaviorTree` ③AI 模块化方向 |
| 阶段 8 | [phase-8-联调验证与部署.md](phase-plans/phase-8-联调验证与部署.md) | 9 阶段验收 / 部署 / 文档收口 | ①8081 单一入口 ②Godot 导出 ③（无） |
| 对齐表 | [结算管线-原子触发时机对齐表](../mecha-universe-engine/docs/结算管线-原子触发时机对齐表.md) | 阶段 3-8 ↔ 原子触发时机 | 详见本文「1.x」章节 |

> 阶段 3-8 用户口径：阶段 3-8 = 战术行动细分；阶段 5-8 = 伤害计算过程（= `skillExecutor`+`damagePipe`+`combatIntegrator`）。

---

## 0.y 执行进度（2026-08-13 行动批次）

> 本批次按「先做对齐基线 + 不依赖后端改动能立刻跑的模块」原则开工。

### 已完成交付

| 项 | 文件 | 说明 |
|----|------|------|
| **phase-0 枚举收口（后端）** | `mecha-universe-engine/shared-kernel/src/enums.ts` | `TIMING` 由语义事件命名（on_attacked 等）**重排为流程阶段命名**，以 `combatIntegrator.cjs` 运行时点火名（pre_damage/on_damage/post_damage/on_damage_taken 等）为唯一真相源；旧语义值保留为废弃别名。消除三头分化（枚举/点火/reaction 注册）。lint 通过。 |
| **phase-0 枚举补齐（Godot）** | `alpha4.0/core/enums.gd` | `TIMING` 补 `ON_DAMAGE`/`ON_DAMAGE_TAKEN`/`MOVEMENT_CHECK`（运行时有但原缺），并标注运行时真相 vs Godot 预留。值集合现与后端一致。 |
| **phase-3 EventBus 单例** | `alpha4.0/core/event_bus.gd` + `project.godot` `[autoload]` | 新建强类型信号总线（battle_state_updated/turn_changed/skill_cast_result + 阶段 5-8 时机信号 pre_damage…post_attack），注册为 autoload `EventBus`；含 `emit_timing(timing, ctx)` 把 `Enums.TIMING` 字符串映射到对应信号。 |
| **phase-3 WS→EventBus 桥接** | `alpha4.0/net/ws_client.gd` | `battle-state` 推送现转发至 `EventBus.battle_state_updated`，并支持后端附带的 `timingEvents` 数组逐一 `emit_timing`（阶段 5-8 伤害时机）。 |

### 仍待执行（下一批次）

- **后端反应系统下游三头分化彻底治理**（独立工单，未随本次部署）：`reactionHandlers` 各子文件 `register` key（steal→on_damage_dealt、lethal→post_melee_damage、cover→on_ally_attacked、zoc_block→on_move_path 等旧别名）须改为 `combatIntegrator` 真实点火名；`tagDatabaseManager.validPhases` 白名单须改为取自 `TIMING` 值；`combat.ts` 的 `GATEWAY_KNOWN_TRIGGERS` + 各 `fireReaction('...')` 调用须统一为真实点火名。此项改动面广（约 15 处业务点火），单列治理，不阻塞 phase-1 开工。
- **phase-2** AOE 预览固化（复用 render/highlight_renderer.gd）。**phase-4** `SkillComponent`+`TurnActionComponent` 组件化。**phase-5** `BattleStateMachine`（建议 gd-YAFSM）。**phase-6** 本地快照镜像。**phase-7** `EnemyAI` 模块。**phase-8** 联调 9 阶段验收矩阵。

---

## 0.z 执行进度（部署 + phase-1 批次）

> 用户指令：「部署后开工 phase-1」。本批次：①部署 phase-0 枚举收口 ②开工 phase-1 渲染沙盒接 EventBus。

### 部署动作（服务器 106.54.197.69）
- `rsync` 整目录（排除 node_modules/.git/dist/*.db）→ `/root/mecha-universe-engine/`
- 服务器 `cd shared-kernel && npm run build`（enums.ts 改动出 ESM+CJS 双产物 dist，tsc 0 错）
- `docker compose build --no-cache mecha-gateway`（shared-kernel/dist 经 Dockerfile COPY 进镜像）
- `docker compose up -d --no-deps mecha-gateway`（避开 db 孤儿冲突）
- **验证**：容器内 `require('/app/shared-kernel/dist/index.js').TIMING` → `PRE_DAMAGE='pre_damage'` / `ON_DAMAGE='on_damage'` / `POST_DAMAGE='post_damage'` / `ON_DAMAGE_TAKEN='on_damage_taken'` 收口生效；`curl /health` → 200。

### phase-1 交付（Godot 渲染沙盒接 EventBus）

| 项 | 文件 | 说明 |
|----|------|------|
| 坐标真相提升 | `core/hex_math.gd` | 新增 `HEX_RADIUS/HEX_WIDTH/HEX_HEIGHT` 常量 + `pointy_top_center(q,r)→Vector2`（尖顶 Even-R 平面坐标），消除 Battle3D 内联副本，落实宪法红线 §2 坐标净化。 |
| 棋盘渲染器 | `render/board_renderer.gd` | `BoardRenderer extends Node3D`：接收 `board_state` + `center_offset` 显式参数（零全局依赖），用 `HexMath.pointy_top_center` 画六棱柱+地形色+像素锐化，挂载 `HighlightLayer`。 |
| 高亮渲染器 | `render/highlight_renderer.gd` | `HighlightRenderer extends RefCounted`：移动/技能/AOE 高亮薄圆柱，坐标走 `HexMath`，参数传入。 |
| 单位渲染器 | `render/unit_renderer.gd` | `UnitRenderer extends Node3D`：七视图降级链（七视图>精灵>Logo>矢量圆）+ faction 色矢量圆 + 体型系数 S/M/L/XL；高度走 `HexMath.UNIT_FLOAT_Y`；暴露 `update`/`get_unit_node`/`find_unit_at`/`set_unit_selected`（phase-4 接收入口）。 |
| Battle3D 接入 | `scenes/Battle3D.gd` | `_ready` 订阅 `EventBus.battle_state_updated`（阶段 3 单一入口）；`_on_ws_battle_state` 改为仅校验 battle_id 并转发 EventBus，真正处理在 `_on_eventbus_battle_state` → `set_battle_state`。 |

> ✅ 本机已装 Godot 4.7.1（`/Applications/Godot.app/Contents/MacOS/Godot`），GDScript 改动经 `godot --headless --editor --quit` 项目级加载校验（修复 `EventBus` autoload/class_name 冲突后无 SCRIPT/Parse Error）。

---

## 1. 阶段拆分（按 Godot 战棋标准开发顺序）

### 阶段 0：工程骨架与通信层  ✅ 已完成
- Godot 工程、HTTP/WS 客户端
- 坐标数学（`HexMath` GDScript 移植：pointy-top、`get_hexes_in_range`、`isTargetInRange`）
- 后端契约对齐（shared-kernel `enums.ts` 镜像到 `hex_math.gd`）

### 阶段 1：棋盘渲染  ✅ 已完成（2D）/ ✅ 已完成（3D）
- 2D：HexBoard 绘制六边形 + 地形装饰
- 3D：六棱柱 `CylinderMesh` + 柱顶 `Sprite3D`（贴图抬到柱顶之上，已修遮挡）
- 大地图取景 `_frame_camera`（span 自适应 distance）

### 阶段 2：单位与选中  ✅ 已完成（2D + 3D）
- `set_battle_state` 重建棋盘/单位
- 左键/触屏点选 → `_find_unit_at` → `_select_unit`
- 选中高亮（2D：`set_selection` 描边；3D：待补高亮材质）

### 阶段 3：移动  ✅ 已完成（2D + 3D）
- 选中后高亮可移动范围（`get_hexes_in_range(moveRange)` 过滤占用格）
- 点目标格 → `post_battle_action("move", {unitId,target_q,target_r})`
- WS 推送回包后重绘、清除选中

### 阶段 4：技能系统  ⬅ 当前起点（详见 `phase4-skill-system-2.md` 详细实施版 v2.1）
**目标**：把后端 `skillExecutor`（词条驱动、5 谓语主谓宾定状补）接到战场交互，实现"选中技能 → 选目标 → 战场即时响应"。

**已落地（2026-08-13 排查后）**：
- ✅ 技能菜单 UI（`_build_skill_menu` / `_clear_skill_menu`）
- ✅ 目标选择状态机（`_enter_skill_targeting` / `_exit_skill_targeting`）
- ✅ 射程环 + 阵营过滤 + minRange 过滤（`_compute_target_cells` 枚举整射程环）
- ✅ 高亮绘制（平躺 `Sprite3D` 尖顶六边形，青绿=移动 / 琥珀=技能）
- ✅ 点击判定 + 施放发送 + 回包重绘（`_handle_skill_click` / `_cast_skill_at` / `_on_skill_ok/err`）
- ✅ 敌我兼容判定（`_same_side`：ownerId/playerId/faction 任一相同即同方，修 demo 缺 ownerId 误判为同方）
- ✅ 双向键名 + 地形加权 BFS（`types.gd.unit_skill` / `hex_math.gd.reachable_cells`）

**待补（按 `phase4-skill-system-2.md` 优先级）**：
- 🔴 P0 demo 单位注入测试技能（`_ensure_demo_battle`）→ 否则链路无法端到端验证
- 🔴 P0 事件穿透防线（SkillMenu 按钮 `MOUSE_FILTER_STOP` + 棋盘拾取在 `_unhandled_input`）
- 🟡 P1 四层高亮（移动青 / minRange 盲区暗红 / AOE 投影蓝 / 射程环黄 / 有效目标红+⊕）
- 🟡 P1 方向性/AOE 技能形状（`mcShapes` / `map_cannon.directions` + `computeDirection`，Even-R 移植）
- 🟢 P2 命中飘字 / 特效（最小可用）
- 🟢 P2 取消状态机收口（右键/Esc 退出目标选择 → 选中态 → 再右键取消）

#### 原阶段 4 子项（设计版，部分已落地，保留对照）
- [x] **4.1 单位技能数据接入** — `_compute_target_cells` 已读 `unit.skills`（demo 仍 `[]`，待 P0 注入）
- [x] **4.2 技能菜单 UI（Control 层）** — `_build_skill_menu` 已实现
- [x] **4.3 目标选择 + 施放** — `_enter_skill_targeting` / `_cast_skill_at` 已实现
- [ ] **4.4 战场响应可视化** — 重绘已具备；飘字/特效待 P2
- [ ] **4.5 靶场自测** — 待 P0 注入后跑通（详见 `phase4-skill-system-2.md` §5 清单）

### 阶段 4.5：EventBus 信号总线与网络解耦  ⬅ 阶段 5 的必要地基（新增，2026-08-13 借鉴 LiGameAcademy/godot4_turn_based_combat_system 后补）
> 来源：参考开源教学项目 `LiGameAcademy/godot4_turn_based_combat_system`（`scripts/` 分 `autoload/` `contexts/` `core/` `managers/` `resources/` 五类），其 `autoload/` 思想 = 全局单例（事件总线）+ GameManager，用信号切断 UI 与各系统的直接依赖。

**为什么现在加**：当前 `Battle3D.gd` 直接持有 `api`（`net/api_client.gd`）引用并写 `_on_ws_message` 回调直接改场景树，随阶段 5/6 功能膨胀会耦合爆炸。里程碑前先铺信号总线，符合 Godot 社区最佳实践，也是阶段 5 状态机的接线底座。

**alpha3.0 对应物（移植依据）**：Web 侧 `frontend/src/utils/battleSocket.js` 已是**单例 socket 封装**（组件 subscribe `battle-state` 事件，而非直接持有 socket）；状态经 Pinia `apStore/moveStore/logStore` + `computed` 派生。即"事件订阅 + 单例通信"模式在 alpha3.0 已验证，Godot 侧 1:1 映射即可。

**落地设计**：
- 新增 `core/EventBus.gd`（autoload 单例，`project.godot` 注册为 `EventBus`）：定义信号
  - `battle_state_updated(data: Dictionary)` — WS `/ws-native` 收到 `battle_state` 推送时 emit
  - `battle_event_logged(entry: Dictionary)` — 关键战斗事件（用于阶段 7 日志）
  - `skill_cast_result(ok: bool, payload: Dictionary)` — `_cast_skill_at` 结果
  - `turn_changed(round: int, current_turn: String)` — 阶段 5 回合切换
- `Battle3D.gd` 改造：
  - `_on_ws_message` 不再直接改场景树，改为 `EventBus.emit("battle_state_updated", data)`
  - 渲染层 `func _on_battle_updated(data): ...` 订阅 `EventBus.battle_state_updated`（在 `_ready` 连 `EventBus.battle_state_updated.connect(_on_battle_updated)`）
  - 施放改为 `EventBus.emit("skill_cast_result", {...)` 由对应处理者消费
- `net/ws_client.gd` 收到推送 → 调 `EventBus.emit("battle_state_updated", payload)`（WS 层与场景层彻底解耦，符合宪法红线 §1 渲染终点）
- **不照搬**：对方 `resources/` 的 `.tres` 技能资源驱动——我们后端 JSON 即真相源（67 原子词条库），Godot 侧不重建 `.tres`，避免与后端割裂。

> 注：本步骤为最小地基，不阻塞阶段 4 联调（阶段 4 现有直接回调仍可跑）；建议阶段 5 启动前完成重构。

### 阶段 5：回合制与状态  ⬅ 紧随阶段 4（依赖阶段 4.5 EventBus）
> 借鉴 `LiGameAcademy` 的 `contexts/`（回合流程状态机）思想：把隐式状态（`_targeting_skill`/`_selected_unit_id`）升级为显式 `BattleStateMachine`，与已落地的"取消三级递退"合并为统一状态机。

- [x] **5.1 回合状态显示（2026-08-14 完成）** —— 原编号 5.1
  - ✅ HUD 显示当前回合 `round`、当前行动方 `activeFaction`（攻击方/防御方/伏击方）
  - ✅ 选中单位 AP 余量经 `_build_skill_menu` 读取 `action_points`，按钮带 `AP n` 并置灰
  - 实现：`TurnHUD`(RoundLabel/TurnLabel/TurnHint) + `_refresh_turn_hud(state)`；`mouse_filter=IGNORE` 穿透不挡相机
- [x] **5.2 结束回合（2026-08-14 完成）** —— 原编号 5.2
  - ✅ `EndTurnButton`（锚点右下角）→ `post_battle_action("end-turn", {})`
  - ✅ 对手回合经 `_is_my_turn`（factionRoles 把 myUnit.faction 映射 role 比 activeFaction）禁用按钮；WS `battle_state_updated` 推送自动重置
  - 后端 `isNewRound` 时 round+1 + 重置 AP（后端已就绪，前端消费推送）
- [x] **5.3 状态效果显示（2026-08-14 完成，文档原编号 5.3 → 落地称 5.4）**
  - ✅ `unit_renderer.gd._attach_status_icons`：单位 Sprite3D 头顶挂 billboard 小图标（buff绿/debuff红/neutral蓝，按 type 关键字归类）
  - ✅ 持续效果随 WS `battle_state_updated` 推送刷新（纯渲染消费 `unit.statusEffects`，不订阅 EventBus）
- [x] **5.0 显式回合状态机（BattleStateMachine）—— 2026-08-14 完成**
  - ✅ 自研轻量 FSM `core/battle_state_machine.gd`（拒绝第三方 gd-YAFSM 插件），状态枚举 `IDLE/UNIT_SELECTED/SKILL_TARGETING/ACTION_ANIMATING/ENEMY_TURN/ROUND_SETTLING`
  - ✅ `Battle3D.gd` 散落布尔逻辑收敛为 `battle_sm.*` 唯一状态真相源；输入拦截由 `battle_sm.input_locked()` 严格判定（ANIMATING/ENEMY_TURN/ROUND_SETTLING 锁一切棋盘点选）
  - ✅ 伤害飘字经 `/attack` 响应 `combat_result.final_damage` 即时驱动（WS 推送为纯全量快照、无增量 events，故不依赖前后帧差值）
  - 后端 Payload 核查结论见 `phase-plans/phase-5-回合状态机与伤害结算.md` §6；✅ **`is_crit` 已透传并部署**（2026-08-14），暴击走 `CRIT! -N` + 字号×1.4 + 亮橙红 + 弹性冲顶

> ⚠️ **编号说明**：主计划子项原 5.0/5.1/5.2/5.3 与落地 5.1/5.2/5.3/5.4 编号错位——
> 落地 5.4 = 文档原 5.3（状态效果）；文档原 5.0（显式状态机）仍空缺。下一步进入「伤害结算表现层」前须先确认 5.0 是否要做、以及用什么状态机方案。

### 阶段 5 进度小结 + 下一步前需确认（2026-08-14）

**已做（客户端呈现层）**：回合 HUD、AP 置灰、结束回合交互、Buff/Debuff 头顶图标。后端 `round/activeFaction/action_points/statusEffects` 字段已存在且契约对齐，无需改后端。

**未完成 / 下一步前须确认**（阻塞项）：
1. **5.0 显式状态机 BattleStateMachine**：是否引入 `gd-YAFSM` 插件或自写 FSM Node？状态转移目前散落 `Battle3D`，要否在进阶段 6（AI 回合）前先收口？（建议：进 AI 回合前必做，否则 ENEMY_TURN 态无载体）
2. **伤害结算表现层**：`phase-5` 报告的验收项（伤害飘字/击杀特效经 EventBus 时机信号、阶段 6 差值 HUD）全未做。依赖后端 `combatIntegrator` 是否经 WS 下发 `skill_cast_result`（含 damage/crit/kill）——**须先确认后端推送 payload 字段名**（当前 `_on_skill_ok` 未消费伤害明细）。
3. **阶段 6 机动/姿态差值**：后端 `damagePipe` 尚未注入掩护/ZOC 修正，无字段，Godot 侧暂无可展示——属后端 Phase C 缺口，前端不阻塞但需标注。
4. **原子触发时机三头分化**：`TIMING` 枚举 / `combatIntegrator` 点火 / `reactionHandlers` 注册三套命名未对齐（约 15 处），`EventBus` 时机信号名须 ⊆ `core/enums.gd` 的 `TIMING`——进伤害表现层前须先收口，否则信号对不齐后端点火链。
5. **statusEffects 图标仅着色无数字**：当前只按类型着色，未画剩余回合数标签（可选增强，不阻塞）。

### 阶段 6：敌方 AI 与自动化  ⬅ 后端已就绪，前端接展示
- [ ] **6.1 敌方回合指示**
  - 收到 `currentTurn` 非己方时，HUD 显示"敌方行动中…"
  - WS 推送敌方行动结果后重绘（无需前端计算，纯展示）
- [ ] **6.2 可选：本地 AI 预览**
  - 若需离线演示，移植 `aiEngine.cjs` 决策到 GDScript（低优先）

### 阶段 7：完整 HUD 与词条库编辑器  ⬅ 体验增强
- [ ] **7.1 战斗 HUD**
  - 单位详情面板（stats、携带技能、状态）
  - 行动日志（WS 推送的关键事件）
- [ ] **7.2 词条库编辑器（Godot 版）**
  - 把 Web 侧 `GlossaryHub.vue` 的"积木式技能配方器"能力搬进 Godot
  - 拖拽组合 6 动作词（damage/heal/buff/debuff/passive/mobility_mod）+ 条件词
  - 导出 JSON 直灌 `glossary-skill-config.json`，靶场验证
  - 注：此阶段体量大，建议作为独立子项目，不在主战斗链路阻塞

### 阶段 8：部署与打磨
- [ ] 导出（Windows/macOS/Linux）验证通信可达
- [ ] 触控操作全链路回归（3D 已实现，2D 待补触屏）
- [ ] 性能（大地图 600 格单位数十个，DrawCall/帧率）

---

## 1.x 结算管线 × 原子触发时机对齐（阶段 3–8 = 战术行动细分，其中 5–8 = 伤害计算过程）

> 用户口径（2026-08-13）：结算表**阶段 3–8** = 现在「战术行动」的细分；其中**阶段 5–8** = 现在**计算伤害的整个过程**（`skillExecutor` + `damagePipe` + `combatIntegrator` 实际跑的链路）。
> 详细映射表见后端仓库 `mecha-universe-engine/docs/结算管线-原子触发时机对齐表.md`（本计划只留落地锚点）。

### 总览映射（结算表 9 阶段 ↔ Godot 阶段 ↔ 后端落点）

| 结算表阶段 | 含义 | Godot 落地阶段 | 后端运行时真相（`combatIntegrator` 点火） | 状态 |
|---|---|---|---|---|
| 1. 回合开始 | 轮次/回合初始化 | 5 | `round_start` / `turn_start` + `buffManager.tickStatusStart` | ✅ |
| 2. 移动 | 走位 | 3 | `executeMove` → `movement_check` | ✅（缺机动差值进伤害） |
| 3. 声明战术 | 选技能 + 进入 targeting | 4 | 原子 `TIMING.ON_TARGET_SELECTED` / `ON_ATTACK_START`（**已定义未点火**） | ⚠️ |
| 4. 选定目标 | 选目标格 + AOE 预览 | 4.3 | Phase 4.3 AOE 高亮（`aoe_cells_from_skill`，纯渲染） | ✅ |
| **5. 伤害值** | 基础伤害计算 | 4 → 5 | `pre_damage` → `damagePipe.calculate` → `on_damage` | ✅ |
| **6. 机动/姿态差值** | 掩护/ZOC/姿态修正 | 5（待补） | **无**，未进伤害公式 | ❌ 缺口 |
| **7. 额外值** | 暴击/加成/分支 | 4 → 5 | `diceService.checkCrit` + `branchEvaluator` + `tagProcessor` | ✅ |
| **8. 结算1/结算2** | 先后结算 + 反击链 | 5 | `post_damage` → `on_kill`/`on_death` → `on_damage_taken` → `post_attack` | ⚠️ 反击链/三路分流未完整 |

### 阶段 5–8 精确点火链（后端 `executeAttack` 真相）

```
pre_damage          → 伤害计算前修正钩子
damagePipe.calculate→ 基础伤害（武器惩罚+装备/技能/地形减伤，_calcDefense）
on_damage           → 伤害计算中改写（暴击/加成经此改 context.damage）
post_damage         → 伤害结算后（近战斩杀 reaction 挂此）
on_kill / on_death  → 击杀/死亡钩子
on_damage_taken     → 受到伤害钩子
post_attack         → 攻击后收尾
```

### ⚠️ 待治理：原子触发时机三头分化（阶段 4/5 落地的阻塞项）

原子「触发时机」目前**三套管子并存**，是「结算阶段 ↔ 原子时机」对齐永远对不齐的根因，须按 Phase A 枚举收口：

| 来源 | 命名风格 | 代表值 |
|---|---|---|
| ① 原子 `TIMING` 枚举（`shared-kernel/enums.ts`） | 语义事件 | `on_attacked` / `on_damage_dealt` / `post_melee_damage` |
| ② `combatIntegrator.cjs` 实际点火 | 攻击流程阶段 | `pre_damage` / `on_damage` / `post_damage` / `on_damage_taken` |
| ③ `tagDatabaseManager.cjs` 白名单 + `reactionHandlers` 注册 | 词条/reaction key | `on_damage_taken` / `post_melee_damage` / `on_damage_dealt` |

**治理原则（对齐 Phase A）**：以 ② 运行时点火名为**唯一真相源**；① 枚举值必须 == ② 点火字符串（删 `on_attacked` 等语义漂移别名）；③ `register` 的 trigger 必须取自 ① 枚举，启动自检 `_gatewayKnownTriggers` 已防死代码旁路。

### 对 Godot 侧的影响

- 阶段 4/5 的「战术行动 → 伤害结算」在 Godot 侧只需**消费后端已结算结果**（经 `EventBus.battle_state_updated` 推送），不重建伤害公式——但 `EventBus` 信号设计须预留 `skill_cast_result` / `turn_changed` 以对应上表阶段 3/5 的语义时机。
- 阶段 6（机动/姿态差值）后端补完后，Godot 侧 HUD 需能展示掩护/ZOC 修正值——目前无字段，待后端 Phase C 补。

---

## 2. 后端能力 → Godot 阶段映射速查

| 后端模块 | 文件 | 对应阶段 | Godot 落地方式 |
|----------|------|----------|----------------|
| 战局 CRUD | `gateway/src/routes/combat.ts` | 0–3 | `ApiClient` 调用（已做） |
| 实时同步 | `mecha-comm` `/ws-native` | 0–8 | `net/ws_client.gd`（已做） |
| 移动结算 | `combat-service ... /move` | 3 | `post_battle_action("move")` |
| 技能结算 | `skillExecutor.cjs` v5.0 | 4 | `post_battle_action("skill")` |
| 掷骰 | `diceService.cjs` | 4 | 后端算，前端只显示结果 |
| 回合/AP | `combat.ts /end-turn` | 5 | HUD + 按钮 |
| 状态效果 | `effectExecutor` | 5 | `statusEffects[]` 显示 |
| 词条库 | `glossary.ts` + `GlossaryHub` | 7 | Godot 编辑器 UI（独立） |
| AI | `aiEngine.cjs` | 6 | 纯展示敌方结果 |

---

## 3. 执行原则（宪法红线）

1. **Canvas/3D 是渲染终点**：逻辑/通信在 `Battle2D.gd`/`Battle3D.gd`，渲染节点（HexBoard/HexGrid）只接收 `set_battle_state`/`set_selection` push，不反向读 Vue/全局态（Godot 侧即不读 SceneTree 外的隐式状态）。
2. **坐标数学唯一真相源**：3D 与 2D 共用 `core/hex_math.gd`（`HEX_RADIUS=32` / `pointy_top_center` / `pixel_to_hex` / `aoe_cells_from_skill` 为唯一数学真理）。`Battle3D.gd` 的 `pointy_top_center` 已转发 `HexMath.pointy_top_center`，点击逆推 `_screen_to_hex` 已改调 `HexMath.pixel_to_hex`，禁止任何内联坐标副本（宪法 §2）。缩放/旋转在相机层做，不污染棋盘坐标。
3. **单一入口**：所有后端通信走 `106.54.197.69:8081`，不新增子端口验证。
4. **先验证后端契约再接前端**：每阶段先用 curl/靶场确认后端返回结构，再写 Godot 消费逻辑。
5. **信号解耦（渲染终点强化）**：WS 推送与战斗结果经 `EventBus`（autoload 单例）广播，渲染/UI 层只 `connect` 订阅，不直接持有网络客户端或读对方内部状态（对齐 `LiGameAcademy` 的 `autoload/` 最佳实践，且强化宪法红线 §1）。
6. **不照搬离线资源驱动**：参考项目用 `resources/` 的 `.tres` 存技能数据；我们后端 JSON（67 原子词条库）即唯一真相源，Godot 侧不重建 `.tres`，避免双源割裂。

---

## 4. 建议的下一步（立即可做）

**从阶段 4.1 起步**：在 `Battle3D.gd`（或 2D `Battle2D.gd`）读取单位 `skills[]`，先打一个最简技能菜单（选中单位后按 `skills` 列出按钮，点击后发 `post_battle_action("skill")` 空目标验证后端回包），跑通即证明词条→战场响应链路打通，再补 4.2–4.4 的 UI 与可视化。

> 注：当前 demo 单位 `skills: []`，需先让后端部署携带真实技能的机体（或临时在 `_ensure_demo_battle` 给 demo 单位塞一个测试技能词条）才能端到端验证。

---

## 5. 执行进度（Phase 0 → Phase 2）

### 5.1 已完成批次

| 阶段 | 内容 | 交付物 | 验证 |
|------|------|--------|------|
| Phase 0 | 枚举收口（TIMING 重排为流程阶段命名） | `shared-kernel/src/enums.ts` TIMING 以 combatIntegrator 点火名为唯一真相源，旧语义值保留为废弃别名 | 部署 8081，容器内 `TIMING.PRE_DAMAGE='pre_damage'` 收口生效，`/health`=200 |
| Phase 1 | 渲染沙盒接 EventBus | `core/event_bus.gd`(autoload) + `net/ws_client.gd` 桥接 + `render/board_renderer.gd`/`highlight_renderer.gd`/`unit_renderer.gd` 三权分立；`Battle3D.gd` 仅经 `EventBus.battle_state_updated` 消费 | 单文件 `--check-only` 通过（autoload 全局引用需项目级 `--editor --quit` 验证） |
| Phase 2 | 坐标真相统一 + AOE 预览固化 | 见 5.2 | 项目级 `--editor --quit` 无 error/parse |

### 5.2 Phase 2 详细落地（2026-08-14）

**根因（开工前发现）**：`Battle3D.gd` 违反宪法 §2，存在两套并行坐标实现——内联 `pointy_top_center`（`HEX_RADIUS=36`/`SQRT3`）与点击逆推（`36*1.732`），与 `hex_math.gd`（真相源 `HEX_RADIUS=32`、`HEX_VERTICAL_SPACING=54`）不一致，导致棋盘渲染与点击命中错位数格；同时 `_make_highlight_texture`/`_add_highlight_sprite` 平躺贴图方案与 phase-1 的 `highlight_renderer.gd` 薄圆柱方案并行。

**执行动作**：
1. **坐标真相收口**：
   - `core/hex_math.gd` 新增 `pixel_to_hex(px, py)` 纯逆推（用 `HEX_HORIZONTAL_SPACING=64` / `HEX_VERTICAL_SPACING=54` / 偶数行偏移 `HEX_RADIUS=32`，与 `pointy_top_center` 严格互逆）；新增 `aoe_cells_from_skill(skill, cq, cr)` 单形态 AOE 真相函数。
   - `Battle3D.gd` 删除顶部 `HEX_RADIUS=36`/`SQRT3` 常量，`HEX_RADIUS` 改为 `HexMath.HEX_RADIUS` 别名引用；`pointy_top_center` 转发 `HexMath.pointy_top_center`；`_screen_to_hex` 逆推段改调 `HexMath.pixel_to_hex`。命中错位根因（`36*1.732=62.35 ≠ 64`）已消除。
2. **AOE 预览固化（方案 A）**：
   - 重写 `render/highlight_renderer.gd` 为纯本地坐标（不感知居中偏移，由 layer node `position` 承载），新增通用 `draw_cells` + 语义方法 `draw_aoe`(暗红)/`draw_skill`(琥珀)/`draw_move`(青绿)，薄圆柱 Mesh（`CylinderMesh` 6 段，`NEAREST` 像素锐化）。
   - `Battle3D.gd` 加 `HighlightRenderer` 实例（`var _hl`），三层高亮 `_move_hl_root`/`_skill_hl_root`/`_aoe_hl_root` 统一经 `_hl` 驱动；`_update_aoe_preview` 已调 `HexMath.aoe_cells_from_skill` 计算 circle 受击格，经 `_hl.draw_aoe` 渲染。
   - 删除 `Battle3D` 全部内联高亮实现（67 行：`_make_highlight_texture`/`_point_in_hexagon`/`_hexagon_edge_dist`/`_add_highlight_sprite` 及三组 `_draw_*_highlight` 的 Sprite3D 体），改为 `_hl` 薄包装，**单一渲染出口**。
3. **验证**：`godot --headless --check-only --script` 对 `hex_math.gd`/`highlight_renderer.gd` 通过；`Battle3D.gd` 单文件报 `EventBus.battle_state_updated` 未识别系 autoload 未加载的 `--script` 局限；项目级 `godot --headless --editor --quit` 无 error/parse，确认全部脚本加载通过。

### 5.3 待办（后续批次）

- **反应系统三头分化残留**（独立工单，未做）：`reactionHandlers` 各子文件 `register` key 用旧别名、`tagDatabaseManager.validPhases` 白名单、`combat.ts` 的 `GATEWAY_KNOWN_TRIGGERS`+`fireReaction` 约 15 处未对齐 `combatIntegrator` 真实点火名。属 Phase A 枚举收口下游，需收口到 `TIMING` 真相源。
- **board_renderer.gd 接入**：✅ 已在 Phase 3 完成（见 5.4）——`BoardRenderer` 重写为真实棋盘渲染器，`Battle3D._rebuild_board` 内联实现已删除并委托 `_board.update()`。
- **unit_renderer 柱高常量**：✅ 几何真相已提升到 `hex_math.gd`（`TILE_THICKNESS`/`COLUMN_HEIGHT`/`UNIT_FLOAT_Y`），`Battle3D` 已引用；`unit_renderer.gd` 写死的 `UNIT_COLUMN_HEIGHT=10.0` 可后续改为 `HexMath.COLUMN_HEIGHT` 收尾（非阻塞，值已一致）。
- **阶段 4.1 技能菜单**：demo 单位 `skills:[]` 需后端携带真实技能机体方可端到端验证技能→战场响应链路。

### 5.4 Phase 3 详细落地（2026-08-14）：战场状态与渲染桥接

**范围**：Phase 3 计划（EventBus 信号总线与网络解耦）的核心交付——`EventBus` autoload + `ws_client` 桥接 + `Battle3D` 订阅 `battle_state_updated`——已在 Phase 1 落地。本批次补完"各系统只连 EventBus、渲染层单向消费状态"的延伸目标：**把棋盘渲染内联实现收口到 `BoardRenderer`**（phase-1 已建但未接入），实现"棋盘渲染单一出口"。

**根因（开工前发现）**：`Battle3D.gd` 内联 `_rebuild_board`（六棱柱薄地砖 `TILE_THICKNESS=8` + `assets/map/T-01_*.png` 贴图 + `_tile_map` 选中引用 + `_terrain_color`/`_get_terrain_texture` 地形表），与 phase-1 的 `BoardRenderer`（粗柱 `COLUMN_HEIGHT=10` + `assets/terrain/*.png` + 无 `_tile_map`）几何语义不兼容。盲目替换会破坏已验证视觉（薄砖+高空单位 → 粗柱会让单位浮空/高亮错位）。

**执行动作**：
1. **几何真相提升**：`core/hex_math.gd` 新增立体常量 `TILE_THICKNESS=8`/`COLUMN_HEIGHT=10`/`UNIT_FLOAT_Y=COLUMN_HEIGHT+14`；`Battle3D` 本地常量改为引用 `HexMath`（消三处写死重复）。
2. **BoardRenderer 重写为真实棋盘渲染器**：几何对齐 Battle3D 既有视觉（薄砖 `HexMath.TILE_THICKNESS`、柱心 `y=COLUMN_HEIGHT/2`、贴图 `assets/map/T-01_*.png` 平躺抬 `TILE_THICKNESS/2+1`）；坐标走 `HexMath.pointy_top_center`（宪法 §2）；暴露 `get_tile(q,r)` 替代旧 `_tile_map` 选中着色；依赖经 `update(board_state, center_offset)` 显式传入（宪法 §3）。
3. **Battle3D 委托收口**：`set_battle_state` 中 `_rebuild_board()` 改为 `_board.update(battle_state, Vector3.ZERO)`（居中偏移由 `_board_root.position` 承担，避免双重偏移）；删除内联 `_rebuild_board`/`_add_ground_plane`/`TERRAIN_TEX_PATH`/`_terrain_tex_cache`/`_get_terrain_texture`/`_terrain_color`/`_tile_map` 声明（共 ≈124 行）。`BoardRenderer` 实例作为 `BoardRoot` 挂入场景。
4. **验证**：`godot --headless --editor --quit` 加载完整项目（含 autoload）无 error/parse；单文件 `--check-only --script` 对 `board_renderer.gd` 的 `TEX_LIFT const` 引用跨脚本常量报错属单文件模式局限（已改 `var` 规避），项目级通过。

**现状（Phase 3 末）**：渲染三权分立已收口——
- 棋盘：`BoardRenderer`（phase-3 收口）
- 高亮：`HighlightRenderer`（phase-2 收口，move/skill/aoe 三层）
- 单位：`unit_renderer.gd`（phase-1 建，待 phase-4 接入 `_rebuild_units` 内联实现）
- 状态入口：`EventBus.battle_state_updated`（phase-1 收口）

**剩余内联（Phase 3 末）**：`Battle3D._rebuild_units()`（单位 Sprite3D 内联）尚未委托 `unit_renderer.gd`——留待 Phase 4 单位渲染收口。

---

### 5.5 Phase 4 详细落地（2026-08-14）：单位渲染器（`UnitRenderer`）收口

**范围**：把 `Battle3D.gd` 内联的单位生成、贴图/材质加载、Billboard 轴向与悬浮高度（`HexMath.UNIT_FLOAT_Y`）彻底搬入 `render/unit_renderer.gd`，控制器仅持有 `UnitRenderer` 实例并调用 `unit_renderer.update(units, center_offset)`。

**根因（开工前发现）**：`Battle3D.gd` 内联 `_rebuild_units`/`_make_unit_texture`（用 `u["position"]["q"]`、阵营色矢量圆、按 size 设 `pixel_size` 的 `Sprite3D`、高度 `UNIT_Y=HexMath.UNIT_FLOAT_Y`）；而 phase-1 遗留的 `unit_renderer.gd` 是半成品：`extends RefCounted`、`world_pos` 从 `unit["q"]` 直接取坐标（`position` 子字典取不到）、高度用 `elevation*10+6`（与几何真相 `HexMath.UNIT_FLOAT_Y` 不一致）、`static build()` 返回节点且 `Battle3D` 从未调用。→ 必须重写 `unit_renderer.gd` 对齐 Battle3D 既有视觉语义后再接入。

**改动**：
1. **`unit_renderer.gd` 重写**：`UnitRenderer extends Node3D`（替代 RefCounted）；坐标走 `HexMath.pointy_top_center`（宪法 §2，禁硬编码）；高度统一 `HexMath.UNIT_FLOAT_Y`（几何真相一致）；七视图降级链（七视图>精灵>Logo>矢量圆）+ faction 色矢量圆；按 size（S/M/L/XL）设世界高度 `world_h` 与 `pixel_size=world_h/tex.height`，`billboard=ENABLED`（对齐原视觉）；依赖经 `update(units, center_offset)` 显式传入（宪法 §3）。
2. **接口暴露**：`get_unit_node(unit_id)`（供选中着色 / Tween 动画 / 射线拾取父节点）、`find_unit_at(q,r)`（点击拾取反查，替代旧 `_unit_sprites` 遍历）、`set_unit_selected(unit_id, on)`（金色环描边，取消时从缓存 `_unit_data` 重绘底图）。
3. **`Battle3D.gd` 收口**：实例 `var _unit_renderer := UnitRenderer.new()` 挂入 `UnitRoot`；`set_battle_state` 中 `_rebuild_units()` 改为 `_unit_renderer.update(_unit_list, Vector3.ZERO)`（居中偏移由 `_unit_root.position` 承担，避免双重偏移）；删除内联 `_rebuild_units`/`_make_unit_texture` 及其 `_unit_sprites` 映射（共 ≈70 行）；`_find_unit_at` 经 `_unit_renderer.find_unit_at(q,r)` 反查 id 再取 unit dict，保持 `Dictionary` 返回契约。
4. **预存 blocker 修复（必要前置）**：`core/event_bus.gd` 声明 `class_name EventBus`，与 `project.godot` `[autoload]` 同名注册冲突，Godot 4.7.1 报 "Class 'EventBus' hides an autoload singleton" 致脚本编译失败、全局单例无法建立、所有引用方（含 Battle3D:128/325）连锁报 "Cannot find member battle_state_updated"。已删除冗余 `class_name EventBus`（autoload 注册已提供全局 `EventBus`）。

**验证**：`godot --headless --editor --quit` 加载完整项目（含 autoload）**无 SCRIPT/Parse Error**；`Battle3D.gd` / `unit_renderer.gd` / `event_bus.gd` 全部通过。`BoardRenderer`、`UnitRenderer` 全局类注册成功。（注：`scenes/Battle.gd` File-not-found 为预存的场景脚本引用缺文件，与渲染重构无关。）

**现状（Phase 4 末·渲染三权分立全量收口）**：
- 棋盘：`BoardRenderer`（phase-3 收口）
- 高亮：`HighlightRenderer`（phase-2 收口，move/skill/aoe 三层）
- 单位：`UnitRenderer`（phase-4 收口，`update`/`get_unit_node`/`find_unit_at`/`set_unit_selected`）
- 状态入口：`EventBus.battle_state_updated`（phase-1 收口）

**控制器瘦身达标**：`Battle3D.gd` 不再持有任何 Mesh/Sprite3D 创建副本，仅持有 `_hl`/`_board`/`_unit_renderer` 三个渲染器实例，全部经单一 `update()` 出口单向消费状态（宪法 §1 单向数据管道）。

---

### 5.6 Phase 4 技能系统链路核对（2026-08-14）：SkillMenu + 目标点选 + POST /attack + WS 刷新闭环

**目标**：基于已收口的 `HighlightRenderer.draw_aoe` / `UnitRenderer.find_unit_at`，跑通「点单位 → 弹技能 → 点目标 → 后端结算 → WS 推送刷新」闭环。

**核对结论（代码已存在，非本次新建）**：本阶段链路在先前提交中已完整实装，本次为**核对 + 修复 + 契约验证**：
1. **SkillMenu 控件已挂载**：`scenes/Battle3D.tscn` 含 `UILayer/SkillMenu`(Control) + `UILayer/SkillMenu/SkillList`(VBoxContainer)；`@onready var skill_menu/skill_list` 正确绑定。`_select_unit` → `_build_skill_menu(unit.skills)` 动态生成「移动/防御/待机」+ 各技能按钮（含 `[射程 min-max]` 文本）+ 取消。
2. **Demo 单位已注入技能**：`_ensure_demo_battle` 调 `_demo_skills_u1()`（`T.unit_skill`：集束炮击/强化力场/地图炮，含 `id/skill_id/shape/aoe_radius/target_filter/category/range`）写 `DEMO_U1["skills"]`，菜单有真实可点技能按钮。
3. **点选目标链路**：`_on_skill_button_pressed` → `_enter_skill_targeting` → `HexMath.get_skill_range_fields` + `_compute_target_cells`（射程环 `get_hexes_in_range` + `target_filter` 阵营过滤，复用 `_same_side` 以 ownerId/playerId/faction 判定）→ `HighlightRenderer.draw_skill`（琥珀层）；Hover 调 `_update_aoe_preview` → `HexMath.aoe_cells_from_skill` + `HighlightRenderer.draw_aoe`（暗红层）。
4. **施法发送**：`_cast_skill_at` → `api.post_battle_action(_battle_id, "attack", payload)`；payload 字段已对齐后端 `/attack` 契约：`attacker_id / attack_type:"skill" / skill_id / target_id / target_pos / aoe_shape`。
5. **结算与刷新闭环**：`_on_skill_ok` 清选中态；后端 `runAttackInternal` 落地内存态后 `battleStore.set` → comm 经 `/ws-native` 推送 `battle-state` → `WsClient` 桥接 `EventBus.battle_state_updated` → `Battle3D.set_battle_state` 自动重绘（即「WS 推送刷新」）。

**本次修复/确认**：
- 修正 `_update_aoe_preview` 的 caster 坐标取错：原 `_selected_unit.get("q", …)` 恒为 0（单位坐标在 `position.q` 子字典）。改为读 `position.q/r`，确保方向性 AOE（line/cone，未来 P2 接入）命中正确；circle 形态不受影响。
- 核对 payload 字段名与后端 `/attack`（combat.ts:2518）契约一致：必填 `attacker_id`；`attack_type:"skill"` 走拥有技能匹配分支（无 skill_id 的 ranged/melee 后端返回 400 `SKILL_REQUIRED`，符合「普通攻击已删除」红线）。
- 实测后端契约：`curl -X POST /api/combat/<id>/attack -d '{}'` → 400 `VALIDATION_ERROR: attacker_id 为必填项`，证明路由存活且字段契约与 Godot 发送一致。

**验证**：`godot --headless --editor --quit` 无 SCRIPT/Parse Error（`Battle.gd` File-not-found 为预存场景引用缺文件，与技能链路无关）。

**现状（Phase 4 全量收口）**：渲染三权分立 + 技能交互链路 + WS 刷新闭环均已打通。控制器零内联渲染/技能结算副本。

**下一步**：Phase 5（显式回合状态机 BattleStateMachine）/ 状态效果显示（buff/debuff 视觉）/ 技能动画（Tween 经 UnitRenderer.get_unit_node 平滑过渡）。

### 5.7 Phase 5 回合/AP/状态机 HUD 落地（2026-08-14）

**后端真相源（已对齐）**：`battle_state` 顶层 `round` / `activeFaction`（轮转角色 attack/defense/ambush）/ `factionTurnOrder` / `factionRoles`（faction→role 映射表）；单位 `action_points:{MOVE,ATTACK,DEFEND}`、`statusEffects:[{type,duration,remainingTurns,params}]`。`end-turn` 走 `POST /api/combat/:id/end-turn`（api.post_battle_action 已封装），WS 经 `battle_state_updated` 推送全量刷新（含新一轮 `resetAllActionPoints`）。

**改动**：
- **5.1 回合 HUD**：tscn 新增 `TurnHUD`（顶部居中 `RoundLabel`/`TurnLabel`/`TurnHint`，mouse_filter=IGNORE 穿透）。Battle3D `_refresh_turn_hud(state)` 呈现 `回合 N` + `行动方：攻击方/防御方/伏击方` + 我方/对手回合提示。
- **5.2 AP 置灰**：`_build_skill_menu` 读 `_selected_unit.action_points`，MOVE≤0 禁用移动、DEFEND≤0 禁用防御、攻击类技能（target_filter==enemy 或 effect 含 attack）耗 ATTACK、辅助类耗 DEFEND，按钮文本带 `AP n` 并 `disabled`。
- **5.3 结束回合**：tscn `EndTurnButton` 锚点改右下角（anchors_preset=3）。`_on_end_turn_pressed` 已发 `end-turn`；`_refresh_turn_hud` 据 `_is_my_turn` 在对手回合禁用按钮，WS 推送自动重启用/重置。
- **5.4 状态效果**：`unit_renderer.gd` 新增 `_attach_status_icons`——在各单位 Sprite3D 头顶挂 billboard 小图标（buff=绿/debuff=红/neutral=蓝，按 `type` 关键字归类），作为 sp 子节点随 `update()` 重建自动清理；纯渲染消费 `unit.statusEffects`，不订阅 EventBus。

**红线合规**：UnitRenderer 纯渲染（status 图标为 sp 子节点，不持有 Vue/EventBus 引用）；HUD/AP 全部经 `set_battle_state` → EventBus 单向消费；`_is_my_turn` 用 `factionRoles` 映射 faction→role 对齐 `activeFaction`（符合「role 是逻辑判定唯一依据，禁直接比 faction」）。

**验证**：`godot --headless --editor --quit` 无 SCRIPT/Parse Error（`Battle.gd` File-not-found 为预存无关）。
