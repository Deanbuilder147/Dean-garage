# ============================================================
# core/types.gd
# 数据结构真相源（GDScript 移植版）
# 对齐 @mecha/shared-kernel/src/types.ts
#
# GDScript 无 interface，用工厂函数返回 Dictionary，字段名逐字节对齐后端。
# 所有与后端 HTTP/WS 通信的解析结果都用这里的工厂构造，禁止散写字面量字段。
# ============================================================
class_name Types
extends RefCounted

# ---- 基础坐标 ----
static func hex_coord(q: int, r: int) -> Dictionary:
	return {"q": q, "r": r}

static func pixel_coord(x: float, y: float) -> Dictionary:
	return {"x": x, "y": y}

# ---- 单位基础 ----
static func unit_stats(hp: int, max_hp: int, armor: int, shield: int, attack: int, defense: int, speed: int, mobility: int, range: int, min_range: int = 1) -> Dictionary:
	return {
		"hp": hp, "maxHp": max_hp, "armor": armor, "shield": shield,
		"attack": attack, "defense": defense, "speed": speed, "mobility": mobility,
		"range": range, "min_range": min_range,
	}

static func unit_skill(id: String, name: String, description: String, script: String, cooldown: int, current_cooldown: int, energy_cost: int, damage_type: String, skill_key: String = "", cast_range = 1, min_cast_range = 1, target_filter: String = "enemy", category: String = "ranged", shape = null, aoe_radius = 0) -> Dictionary:
	return {
		# 双向保留 id / skill_id（后端词条库真实 key 可能是 skill_id，demo 构造体用 id）
		"id": id, "skill_id": id, "name": name, "description": description, "script": script,
		"cooldown": cooldown, "currentCooldown": current_cooldown,
		"energyCost": energy_cost, "damageType": damage_type, "skill_key": skill_key,
		# 双向保留键名，兼容 CamelCase 与 Snake_case（避免前端回退默认值错位）
		"cast_range": cast_range, "castRange": cast_range,
		"min_cast_range": min_cast_range, "minCastRange": min_cast_range,
		"target_filter": target_filter, "targetFilter": target_filter,
		"category": category,
		# AOE / 形状契约：后端 skillExecutor v5.0 词条驱动的 shape（line/cone/cross/circle）
		# 与 aoe_radius；前端只读并据此绘制范围高亮，不反向计算语义
		"shape": shape, "aoe_radius": aoe_radius, "aoeRadius": aoe_radius,
	}

# ---- 战场 ----
static func terrain_cell(q: int, r: int, terrain: String, elevation: int, passable: bool) -> Dictionary:
	return {"q": q, "r": r, "terrain": terrain, "elevation": elevation, "passable": passable}

# ---- 房间 / 联机 ----
static func room_player(user_id: String, username: String, faction: String, team: int, ready: bool, identity_role: String = "player", tactical_slot = null) -> Dictionary:
	return {
		"userId": user_id, "username": username, "faction": faction, "team": team,
		"ready": ready, "joinedAt": "", "identityRole": identity_role,
		"tacticalSlot": tactical_slot, "role": identity_role, "isSpectator": false,
		"selectedUnits": [],
	}

# ---- 战斗单位 ----
static func battle_unit(unit_id: String, matrix_id: String, owner_id: String, position: Dictionary, current_stats: Dictionary, skills: Array, status_effects: Array, action_points: Dictionary) -> Dictionary:
	return {
		"unitId": unit_id, "matrixId": matrix_id, "ownerId": owner_id,
		"position": position, "currentStats": current_stats, "skills": skills,
		"statusEffects": status_effects, "action_points": action_points,
		"faction": "", "role": "", "name": "", "codename": "", "unitCode": "",
		"type": "", "viewUrls": {}, "equipState": [], "moveRange": 0, "mobility": 0,
	}

# ---- 状态效果 ----
static func status_effect(effect_id: String, name: String, effect_type: String, duration: int, magnitude: float, source_id: String = "") -> Dictionary:
	return {
		"id": effect_id, "name": name, "effectType": effect_type,
		"duration": duration, "magnitude": magnitude, "sourceId": source_id,
	}
