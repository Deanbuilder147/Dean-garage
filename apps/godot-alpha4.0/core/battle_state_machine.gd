class_name BattleStateMachine
extends Node

# ============================================================
# Phase 5.0 轻量战斗状态机（自研 FSM，拒绝第三方插件 gd-YAFSM）
# 唯一真相源：Battle3D 的"当前交互态"由本机持有，输入拦截由 current_state 严格判定。
# 信号经 EventBus 对外广播（若 EventBus 不可用则仅本地信号）。
# 仅持有状态，不持有任何 Mesh/Sprite/UI 引用（纯逻辑，符合单向数据管道宪法）。
# ============================================================

enum State {
	IDLE,              # 空闲（等待玩家点击）
	UNIT_SELECTED,     # 选中单位（高亮移动、弹技能菜单）
	SKILL_TARGETING,   # 技能目标选择（射程环、AOE 投影预览）
	ACTION_ANIMATING,  # 正在播放移动/攻击/飘字动画（锁定一切用户输入）
	ENEMY_TURN,        # 敌方/AI 回合（UI 禁用，显示"敌方行动中…"）
	ROUND_SETTLING,    # 回合交替结算中
}

signal state_changed(from: int, to: int)

var current_state: int = State.IDLE
# 进入各态时的附带上下文（技能数据 / 动画锁原因），供 UI 与日志读取
var context: Dictionary = {}


func _ready() -> void:
	# 初始态统一由 Battle3D 显式 enter，避免 autoload 时序歧义
	pass


# 严格转移：合法的 From→To 表，非法转移记录告警但不崩溃（开发期可观测）
const ALLOWED := {
	State.IDLE: [State.UNIT_SELECTED, State.ENEMY_TURN, State.ROUND_SETTLING],
	State.UNIT_SELECTED: [State.IDLE, State.SKILL_TARGETING, State.ACTION_ANIMATING, State.ENEMY_TURN, State.ROUND_SETTLING],
	State.SKILL_TARGETING: [State.UNIT_SELECTED, State.ACTION_ANIMATING, State.IDLE, State.ENEMY_TURN],
	State.ACTION_ANIMATING: [State.UNIT_SELECTED, State.IDLE, State.ENEMY_TURN, State.ROUND_SETTLING],
	State.ENEMY_TURN: [State.ROUND_SETTLING, State.IDLE, State.UNIT_SELECTED],
	State.ROUND_SETTLING: [State.UNIT_SELECTED, State.IDLE, State.ENEMY_TURN],
}


func transition(to: int, ctx: Dictionary = {}) -> bool:
	if to == current_state:
		context = ctx if not ctx.is_empty() else context
		return true
	var allowed_from: Array = ALLOWED.get(current_state, [])
	if not (to in allowed_from):
		push_warning("BattleStateMachine: 非法转移 %d→%d 被拒绝（当前允许的: %s）" % [current_state, to, allowed_from])
		return false
	var f: int = current_state
	current_state = to
	context = ctx
	state_changed.emit(f, to)
	return true


func enter_idle() -> void:
	transition(State.IDLE)


func enter_unit_selected(unit_id: String) -> void:
	transition(State.UNIT_SELECTED, {"unit_id": unit_id})


func enter_skill_targeting(sk: Dictionary) -> void:
	transition(State.SKILL_TARGETING, {"skill": sk})


func enter_animating(reason: String = "") -> void:
	transition(State.ACTION_ANIMATING, {"reason": reason})


func enter_enemy_turn() -> void:
	transition(State.ENEMY_TURN)


func enter_round_settling() -> void:
	transition(State.ROUND_SETTLING)


# 输入拦截谓词：供 Battle3D 在 _input_event 中判定是否消费事件
func accepts_unit_pick() -> bool:
	return current_state == State.IDLE or current_state == State.UNIT_SELECTED


func accepts_skill_targeting() -> bool:
	return current_state == State.SKILL_TARGETING


func input_locked() -> bool:
	return current_state == State.ACTION_ANIMATING or current_state == State.ENEMY_TURN or current_state == State.ROUND_SETTLING


func is_enemy_turn() -> bool:
	return current_state == State.ENEMY_TURN


func state_name() -> String:
	return State.keys()[current_state] if current_state < State.size() else "UNKNOWN"
