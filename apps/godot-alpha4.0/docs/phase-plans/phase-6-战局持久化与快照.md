# 阶段 6 开发计划报告：战局持久化与快照

> 范围：战局状态快照、断线重连、WS 重连强刷、不可变地图沙盒。
> 映射：结算表回合外持久层（支撑阶段 1-8 的中断恢复）。

---

## 1. 维度一：alpha3.0 现状

- **快照系统全上线（2026-08-01）**：`battles` 表加 `state_snapshot`；`combatSnap` 序列化/反序列化/reconcile；44 处 `battleStore.get` → `requireBattle` rehydrate；终局清快照防 SQLite 膨胀；WS 重连强刷。
- **不可变地图沙盒（愿景）**：地图存为服务器不可变资产，开战注入 `battle_id` 深拷贝，战局销毁不污染原始 JSON。
- **返回上次战斗指向错误已修**：resume 真相源改后端 `/me` 下发的 `lastRoomId`（DB 权威）。
- **⚠️ recall-unit 独立路由**：计划列有但全代码库无独立路由，待确认是否补 `POST /recall-unit`。

## 2. 维度二：Godot 平台优势与可复用插件

- **Godot `Resource` 序列化**：战局快照可用 Godot `Resource` 的 `to_dict()`/`from_dict()` 或 `PackedDataContainer` 本地缓存，断线时秒级恢复。
- **原生 `FileAccess`/`ConfigFile`**：本地存 `lastBattleId` 替代 localStorage（更符合 Godot 习惯）。
- **无专用插件需求**：快照逻辑以后端 `state_snapshot` 为权威，Godot 侧只做本地缓存镜像。

## 3. 维度三：godot4_turn_based_combat_system 启示

- 该项目未涉及持久化（教学框架单局），我们的快照系统是超越其能力的生产级特性，无需借鉴。

## 4. Godot 落地动作

1. **本地快照镜像**：`ws_client` 收到 `battle_state_updated` 时，`ResourceSaver` 存本地 `user://battle_<id>.tres` 作断线缓存。
2. **重连强刷**：WS 重连 → 拉后端 `state_snapshot` → `EventBus.battle_state_updated.emit(reconciled)`。
3. **`lastRoomId` 权威**：Godot 启动读后端 `/me` 的 `lastRoomId`，不依赖本地残留。
4. **recall-unit**：等用户确认是否补后端路由，Godot 侧预留 `recall_unit(unit_id)` 调用桩。

## 5. 验收标准

- [ ] 断线 5 秒内重连，战局状态经快照 reconcile 无回退。
- [ ] 本地 `user://battle_<id>.tres` 缓存与后端 `state_snapshot` 一致。
- [ ] 重连用后端 `lastRoomId` 而非本地残留。
