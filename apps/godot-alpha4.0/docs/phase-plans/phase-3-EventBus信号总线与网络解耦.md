# 阶段 3 开发计划报告：EventBus 信号总线与网络解耦

> 范围：建立 Godot 侧事件总线（autoload 单例），解耦战斗系统各模块；对接后端 WebSocket 推送。
> 映射：结算表阶段 1-3 的「回合开始/移动/声明战术」前置事件层。

---

## 1. 维度一：alpha3.0 现状

- **前端单例模式已验证**：`battleSocket.js` 是单例 socket，`apStore`/`moveStore`/`logStore` 经 `computed` 派生，是 EventBus 在 Vue 侧的对应物。
- **后端推送经 comm 3005**：`/internal/room-update`（`x-internal-token: mecha-internal-sync`）→ `io.to('prep-'+id)`；战斗中经 WS 推 `battle_state_updated`。
- **快照系统**已上线：`state_snapshot` 序列化/反序列化/reconcile，WS 重连强刷。

## 2. 维度二：Godot 平台优势与可复用插件

- **原生 autoload + signal**：Godot 4 的 `autoload` 单例 + `signal` 是**一等公民**事件总线，无需任何插件——比前端手写单例更简洁。
- **强类型信号**：Godot 4 信号支持带类型参数（`signal battle_state_updated(payload: Dictionary)`），编译期校验，优于前端 JS 弱类型。
- **不照搬离线资源**：Godot 项目用 `.tres`/`.tscn` 是场景描述，我们的战斗数据来自后端 JSON，不照搬 `.tres` 离线资源模式。

## 3. 维度三：godot4_turn_based_combat_system 启示

- **明确方向**：「更多地利用信号和事件总线来解耦各个系统之间的直接依赖」——这是其四大演进方向之一，与我们阶段 3 目标完全重合。
- 其组件化（`SkillComponent`/`TurnActionComponent`）依赖事件总线通信，印证 autoload EventBus 的必要性。

## 4. Godot 落地动作

1. **建 `EventBus` autoload 单例**（`res://core/event_bus.gd`，`extends Node`），定义强类型信号：
   - `signal battle_state_updated(payload: Dictionary)`
   - `signal turn_changed(round: int, side: String)`
   - `signal skill_cast_result(result: Dictionary)`（对应结算表阶段 5 语义时机）
   - `signal unit_selected(unit_id: String)`（对应阶段 3 声明战术）
   - `signal aoe_preview_updated(cells: Array)`
2. **`ws_client.gd` 接后端 3005**：`on_message` → 解析 → `EventBus.battle_state_updated.emit(payload)`。
3. **各系统只连 EventBus，不直接持有彼此引用**：`render/` 连 `battle_state_updated`；`Battle3D` 连 `unit_selected`/`aoe_preview_updated`。
4. **断线重连**：沿用快照 reconcile 逻辑，WS 重连后 `EventBus` 强刷。

## 5. 验收标准

- [ ] 所有跨系统通信经 `EventBus` 信号，无直接 `get_node` 跨模块硬引用。
- [ ] `ws_client` 收到后端推送 → 触发对应 `EventBus` 信号 → 渲染层更新。
- [ ] 信号参数强类型，编辑器内无警告。
