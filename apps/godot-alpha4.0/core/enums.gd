# ============================================================
# core/enums.gd
# 枚举真相源（GDScript 移植版）
# 对齐 @mecha/shared-kernel/src/enums.ts
#
# GDScript 无 as const + 字面量类型，用 Dictionary 常量 + 字符串值模拟。
# 所有子包从前向后端通信一律用这些字符串值。修改需与后端同步。
# ============================================================
class_name Enums
extends RefCounted

# 时机类型
# 【Phase A 收口·2026-08-13】以 combatIntegrator.cjs 运行时点火名为唯一真相源。
# 运行时真相（后端实际 triggerPhase 调用）：
#   round_start / turn_start / turn_end / pre_attack / pre_damage / on_damage /
#   post_damage / on_kill / on_death / on_damage_taken / post_attack / movement_check
# 其余为 Godot 侧预留（非后端点火）。枚举值必须 == 后端 shared-kernel/enums.ts TIMING。
const TIMING = {
	# —— 回合/轮次生命周期（运行时）——
	"PHASE_START": "phase_start",
	"PHASE_END": "phase_end",
	"TURN_START": "turn_start",
	"TURN_END": "turn_end",
	"ROUND_START": "round_start",
	"ROUND_END": "round_end",
	# —— 移动（运行时）——
	"PRE_MOVE": "pre_move",
	"POST_MOVE": "post_move",
	"MOVEMENT_CHECK": "movement_check",
	# —— 攻击/伤害结算流程（运行时，combatIntegrator.executeAttack）——
	"PRE_ATTACK": "pre_attack",
	"POST_ATTACK": "post_attack",
	"PRE_DAMAGE": "pre_damage",
	"ON_DAMAGE": "on_damage",
	"POST_DAMAGE": "post_damage",
	"ON_KILL": "on_kill",
	"ON_DEATH": "on_death",
	"ON_DAMAGE_TAKEN": "on_damage_taken",
	# —— 技能/治疗/命中（Godot 预留，非后端点火）——
	"PRE_SKILL": "pre_skill",
	"POST_SKILL": "post_skill",
	"PRE_HEAL": "pre_heal",
	"POST_HEAL": "post_heal",
	"ON_HIT": "on_hit",
	"CONDITIONAL": "conditional",
}

# 效果类型
const EFFECT_TYPE = {
	"BUFF": "buff",
	"DEBUFF": "debuff",
	"DAMAGE": "damage",
	"HEAL": "heal",
	"SHIELD": "shield",
	"DOT": "dot",
	"HOT": "hot",
	"PULL": "pull",
	"PUSH": "push",
	"TELEPORT": "teleport",
	"STATUS": "status",
}

# 掷骰模式
const ROLL_MODE = {
	"NONE": "none",
	"ATTACK": "attack",
	"DAMAGE": "damage",
	"EVADE": "evade",
	"CRIT": "crit",
	"INITIATIVE": "initiative",
}

# 限制作用域
const LIMIT_SCOPE = {
	"SELF": "self",
	"ALLY": "ally",
	"ENEMY": "enemy",
	"ALL": "all",
	"AREA": "area",
}

# 数值方法
const VALUE_METHOD = {
	"FLAT": "flat",
	"PERCENT": "percent",
	"MULTIPLY": "multiply",
	"SCALE": "scale",
}

# 条件类型
const CONDITION_TYPE = {
	"HP_BELOW": "hp_below",
	"HP_ABOVE": "hp_above",
	"ROUND": "round",
	"TURN_COUNT": "turn_count",
	"HAS_STATUS": "has_status",
	"DISTANCE": "distance",
	"TERRAIN": "terrain",
	"FACTION": "faction",
	"ROLE": "role",
}

# 词条入口类型（解题器分派 key）
const ENTRY_TYPE = {
	"ATTACK": "attack",
	"HEAL": "heal",
	"BUFF": "buff",
	"DEBUFF": "debuff",
	"PASSIVE": "passive",
}

# 校验：给定枚举表 + 值，是否合法
static func is_valid(enum_table: Dictionary, value: String) -> bool:
	return enum_table.values().has(value)
