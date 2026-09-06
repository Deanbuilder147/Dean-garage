# ============================================================
# core/event_bus.gd
# 全局事件总线（autoload 单例，注册名 EventBus）
#
# 【阶段 3·EventBus 信号总线与网络解耦】
# 所有跨系统通信经本总线信号，禁止模块间直接 get_node 硬引用。
# 信号参数强类型，对应结算表阶段时机：
#   - battle_state_updated / turn_changed / skill_cast_result 对应阶段 1-5
#   - pre_damage / on_damage / post_damage / on_kill / on_damage_taken / post_attack
#     对应阶段 5-8 伤害计算过程（与 Enums.TIMING 值一致）
#
# 命名约定：时机信号名 == Enums.TIMING 值（见阶段 0 收口决议）。
# ============================================================
extends Node
# 注：不声明 class_name。autoload 注册名已为 "EventBus"（project.godot [autoload]），
# 再声明 class_name EventBus 会在 4.7.1 触发 "Class hides an autoload singleton" 解析失败，
# 导致本脚本编译失败、全局 EventBus 单例无法建立、所有引用方（Battle3D 等）报
# "Cannot find member battle_state_updated"。保留 autoload 注册即可满足全局访问。

# —— 战斗状态/回合 ——
signal battle_state_updated(payload: Dictionary)
signal turn_changed(round: int, side: String)
signal unit_selected(unit_id: String)
signal aoe_preview_updated(cells: Array)

# —— 技能执行（阶段 5 语义时机）——
signal skill_cast_requested(skill_key: String, target_coord: Dictionary)
signal skill_cast_result(result: Dictionary)

# —— 伤害结算时机（阶段 5-8，信号名 == Enums.TIMING 值）——
signal pre_damage(context: Dictionary)
signal on_damage(context: Dictionary)
signal post_damage(context: Dictionary)
signal on_kill(context: Dictionary)
signal on_death(context: Dictionary)
signal on_damage_taken(context: Dictionary)
signal post_attack(context: Dictionary)

# —— 移动（阶段 2）——
signal movement_check(context: Dictionary)


# 工具：把 Enums.TIMING 字符串映射到本总线对应信号（供 ws_client 转发用）
func emit_timing(timing: String, context: Dictionary) -> void:
	match timing:
		Enums.TIMING.PRE_DAMAGE: pre_damage.emit(context)
		Enums.TIMING.ON_DAMAGE: on_damage.emit(context)
		Enums.TIMING.POST_DAMAGE: post_damage.emit(context)
		Enums.TIMING.ON_KILL: on_kill.emit(context)
		Enums.TIMING.ON_DEATH: on_death.emit(context)
		Enums.TIMING.ON_DAMAGE_TAKEN: on_damage_taken.emit(context)
		Enums.TIMING.POST_ATTACK: post_attack.emit(context)
		Enums.TIMING.MOVEMENT_CHECK: movement_check.emit(context)
		_: push_warning("EventBus.emit_timing: 未知时机 %s，已忽略" % timing)
