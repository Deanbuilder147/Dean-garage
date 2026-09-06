# ============================================================
# core/hex_math.gd
# 六角格网格数学真相源（GDScript 移植版）
# 对齐 @mecha/shared-kernel/src/hexMath.ts
#
# 坐标系：Even-R Offset（尖顶，偶数行右移半格）
#   - 列 q、行 r；r % 2 == 0 为偶数行，整体右移半格
#   - 立方第三轴 s = -q - r（仅计算用，不存储）
#
# 这是全栈唯一物理真相源。GDScript 端不得另写副本，
# 任何距离/邻居/范围枚举/坐标 Key 都必须走本文件。
# 与前端 frontend/src/utils/hexUtils.js 必须逐字节一致。
# ============================================================
class_name HexMath
extends RefCounted

# ---- 坐标结构（用 Dictionary 模拟 {q, r}） ----
# 约定所有坐标返回 Dictionary: {"q": int, "r": int}

# 地形移动消耗表 —— 与后端 terrainCosts.ts / 前端 hexUtils.js 同源兜底表一致。
# blocked 判定：cost >= 99 视为不可通行（对应后端 wall/99、void/999）。
const TERRAIN_COST := {
	"space": 1, "moon": 1, "lunar": 1, "void": 999, "empty": 1,
	"fortress": 5, "base": 1, "mothership": 1, "forest": 2, "desert": 1.5,
	"water": 2.5, "mountain": 3, "wall": 99, "repair_station": 1,
	"spawn_earth": 0, "spawn_maxion": 0, "spawn": 0,
	"plain": 1, "ruins": 2, "crystal": 2, "rubble": 2, "city_building": 1,
}
const TERRAIN_BLOCKED := 99   # cost >= 此值视为不可通行

# 取地形移动消耗（与后端 terrainCost() 兜底口径一致；未知地形回退 1）
static func terrain_cost(tid: String) -> float:
	if tid == "" or tid == null:
		return 1.0
	if TERRAIN_COST.has(tid):
		return float(TERRAIN_COST[tid])
	return 1.0

# 地形加权可达性 BFS（对齐后端 tsFindPath / 前端 2107-2139 口径）
# 返回从 (start_q,start_r) 出发、累计消耗 <= budget 的所有可达格（含起点，Exclude 起点）。
# all_cells: 战场全部合法格 {"q","r","terrain"} 列表（用于 cost 查询与边界）；
# blocked_keys: 已占用/敌占格 key 集合（可选），这些格不可作为落点（但仍可路过费用计入）。
static func reachable_cells(start_q: int, start_r: int, budget: float, all_cells: Array, blocked_keys: Dictionary) -> Array:
	var cost_map := {HexMath.get_hex_key(start_q, start_r): 0.0}
	var result := []
	var frontier := [{"q": start_q, "r": start_r}]
	while frontier.size() > 0:
		var cur: Dictionary = frontier.pop_front()
		var cur_key: String = HexMath.get_hex_key(cur.q, cur.r)
		var cur_cost: float = cost_map[cur_key]
		for nb in HexMath.get_neighbors(cur.q, cur.r):
			var nk: String = HexMath.get_hex_key(nb.q, nb.r)
			# 找到该邻居的地形 cost
			var step_cost: float = 1.0
			for cell in all_cells:
				if int(cell.q) == int(nb.q) and int(cell.r) == int(nb.r):
					step_cost = HexMath.terrain_cost(str(cell.get("terrain", cell.get("type", ""))))
					break
			if step_cost >= TERRAIN_BLOCKED:
				continue   # 不可通行地形
			var new_cost: float = cur_cost + step_cost
			if new_cost > budget:
				continue
			if cost_map.has(nk) and cost_map[nk] <= new_cost:
				continue
			cost_map[nk] = new_cost
			frontier.append(nb)
			# 落点判定：排除起点、排除被占用格（除非允许路过——这里仅当落点才过滤）
			if not (int(nb.q) == start_q and int(nb.r) == start_r):
				if blocked_keys == null or not blocked_keys.has(nk):
					result.append({"q": nb.q, "r": nb.r, "cost": new_cost})
	return result

# Even-R offset → axial 转换
static func offset_to_axial(q: int, r: int) -> Dictionary:
	var aq: int = q - (r + (r & 1)) / 2
	return {"q": aq, "r": r}

# axial → offset（Even-R）反变换
static func axial_to_offset(q: int, r: int) -> Dictionary:
	var oq: int = q + (r + (r & 1)) / 2
	return {"q": oq, "r": r}

# 六边形网格距离（Even-R offset → axial → cube 距离）
static func hex_distance(q1: int, r1: int, q2: int, r2: int) -> int:
	var a := offset_to_axial(q1, r1)
	var b := offset_to_axial(q2, r2)
	var dq := absi(a.q - b.q)
	var dr := absi(a.r - b.r)
	var ds := absi(a.q + a.r - b.q - b.r)
	return maxi(dq, maxi(dr, ds))

# 便捷重载：直接传坐标对象 {"q":, "r":}
static func hex_distance_coord(a: Dictionary, b: Dictionary) -> int:
	return hex_distance(a["q"], a["r"], b["q"], b["r"])

# 获取某格的六个邻居（Even-R，奇偶行分支）
static func get_neighbors(q: int, r: int) -> Array:
	var dirs: Array
	if r % 2 == 0:
		dirs = [
			{"q": 1, "r": 0},
			{"q": 1, "r": -1},
			{"q": 0, "r": -1},
			{"q": -1, "r": 0},
			{"q": 0, "r": 1},
			{"q": 1, "r": 1},
		]
	else:
		dirs = [
			{"q": 1, "r": 0},
			{"q": 0, "r": -1},
			{"q": -1, "r": -1},
			{"q": -1, "r": 0},
			{"q": -1, "r": 1},
			{"q": 0, "r": 1},
		]
	var out := []
	for d in dirs:
		out.append({"q": q + d["q"], "r": r + d["r"]})
	return out

# 枚举以 (centerQ, centerR) 为中心、半径 range 内的所有格（含中心）
# ⚠️ 输入/输出均为 Even-R offset 坐标；内部必须转到 axial 空间枚举，
#    否则 offset 网格的奇偶行半格偏移会让范围变成椭圆/错位。
static func get_hexes_in_range(center_q: int, center_r: int, range: int) -> Array:
	var c := offset_to_axial(center_q, center_r)
	var results := []
	for q in range(-range, range + 1):
		var r_min := maxi(-range, -q - range)
		var r_max := mini(range, -q + range)
		for r in range(r_min, r_max + 1):
			var ax := axial_to_offset(c.q + q, c.r + r)
			results.append({"q": ax["q"], "r": ax["r"]})
	return results

# 坐标唯一 Key（前后端同构，禁止混用其他写法）
static func get_hex_key(q: int, r: int) -> String:
	return str(q) + "," + str(r)

# ---- 尖顶六角格平面坐标（Even-R Offset）----
# 宪法红线 §2：hex_math.gd 是唯一数学真理。平面坐标由本函数统一产出，
# 渲染器不得内联 pointy_top_center / hex_to_world 副本。
# 尺寸常量统一从本文件导入，禁止硬编码。
const HEX_RADIUS := 32.0          # 外接圆半径（= 半宽）
const HEX_WIDTH := 64.0           # = 2 * HEX_RADIUS
const HEX_HEIGHT := 72.0          # 尖顶六角格总高（= sqrt(3) * HEX_RADIUS 近似）
const HEX_HORIZONTAL_SPACING := HEX_WIDTH          # 同奇偶行列间距
const HEX_VERTICAL_SPACING := HEX_HEIGHT * 0.75    # 行间垂直距（尖顶六角格 3/4 高）

# ---- 立体几何真相（棋盘柱 / 单位浮空） ----
# 地形为薄六棱柱地砖（与 phase-1 已验证的 Battle3D 视觉一致）
const TILE_THICKNESS := 8.0        # 六棱柱厚度（世界单位）
const COLUMN_HEIGHT := 10.0        # 地形柱抬升高度（elevation 乘子）
# 单位浮在柱子上方（= COLUMN_HEIGHT + 14，Battle3D 既有语义）
const UNIT_FLOAT_Y := COLUMN_HEIGHT + 14.0

# 尖顶六角格中心平面坐标（Even-R：偶数行 r%2==0 右移半格）
# 返回以 (0,0) 为原点的 Vector2，渲染器再做 scale/offset 矩阵变换。
static func pointy_top_center(q: int, r: int) -> Vector2:
	var x: float = float(q) * HEX_HORIZONTAL_SPACING
	if r % 2 == 0:
		x += HEX_RADIUS  # 偶数行右移半格
	var y: float = float(r) * HEX_VERTICAL_SPACING
	return Vector2(x, y)

# AOE 形状描述
# handDrawn: cells 为相对原点的偏移 [{dq, dr}]
# radius: 以原点为圆心的六边形全覆盖（半径独立 maxRange）
# mapcannon: base_shadow_east 为正右基准阴影偏移，dir 为顺时针旋转步数（每步 60°）

# 由技能对象直接推导 AOE 受击格（P1 便捷入口）
# 兼容后端 skillExecutor v5.0 词条的 shape（circle/line/cone/cross）+ aoe_radius 双向键名。
# 返回绝对坐标格数组；若技能无 shape 或 aoe_radius<=0 则返回空数组（单体技能）。
static func aoe_cells_from_skill(caster_coord: Dictionary, target_coord: Dictionary, skill: Dictionary) -> Array:
	if skill == null or skill.is_empty():
		return []
	var shape = skill.get("shape", null)
	if shape == null or shape == "":
		return []
	var radius: int = int(skill.get("aoe_radius", skill.get("aoeRadius", 0)))
	if radius <= 0:
		return []
	var shape_str: String = str(shape).to_lower()
	if shape_str == "circle":
		return compute_aoe_cells(caster_coord, target_coord, {"kind": "radius", "radius": radius})
	# line/cone/cross 等方向性形状在 P1 先用半径环兜底（含目标格），
	# P2 接入 hex_line_draw + 锥形展开做精确方向命中（见 phase4-skill-system-2.md）
	return get_hexes_in_range(int(target_coord["q"]), int(target_coord["r"]), radius)

# 计算 AOE 最终命中的六角格集合（绝对坐标，已去重）
static func compute_aoe_cells(_caster_coord: Dictionary, target_coord: Dictionary, aoe_shape: Dictionary) -> Array:
	var t_q: int = target_coord["q"]
	var t_r: int = target_coord["r"]
	var rel: Array = []

	if aoe_shape["kind"] == "radius":
		return get_hexes_in_range(t_q, t_r, int(aoe_shape["radius"]))
	elif aoe_shape["kind"] == "handDrawn":
		rel = aoe_shape.get("cells", [])
	else: # mapcannon
		rel = rotate_shadow_east(aoe_shape.get("base_shadow_east", []), int(aoe_shape.get("dir", 0)))

	var seen := {}
	var out := []
	for off in rel:
		var q: int = t_q + int(off.get("dq", 0))
		var r: int = t_r + int(off.get("dr", 0))
		var key: String = get_hex_key(q, r)
		if seen.has(key):
			continue
		seen[key] = true
		out.append({"q": q, "r": r})
	return out

# 地图炮阴影旋转：以正右(dir=0)基准阴影，顺时针按 60°×dir 步长旋转
static func rotate_shadow_east(base_shadow_east: Array, dir: int) -> Array:
	var steps: int = ((dir % 6) + 6) % 6
	var out := []
	for cell in base_shadow_east:
		var dq: int = int(cell.get("dq", 0))
		var dr: int = int(cell.get("dr", 0))
		# offset → axial
		var ax: int = dq - (dr + (dr & 1)) / 2
		var ar: int = dr
		# cube
		var cq: int = ax
		var cr: int = ar
		var cs: int = -ax - ar
		# 每步 60° 顺时针旋转：(q,r,s) → (-s,-q,-r)
		for i in range(steps):
			var nq: int = -cs
			var nr: int = -cq
			var ns: int = -cr
			cq = nq
			cr = nr
			cs = ns
		# cube → axial → offset
		var off_q: int = cq + (cr + (cr & 1)) / 2
		var off_r: int = cr
		out.append({"dq": off_q, "dr": off_r})
	return out

# ---- 射程归一化（Phase 31-RangeNormalize 三端真相源） ----
# 默认最大射程：远程唯一真相值 = 3
static var DEFAULT_RANGE_BY_CATEGORY := {
	"melee": 1,
	"ranged": 3,
	"auto": 0,
}
# 默认最小射程
static var DEFAULT_MIN_RANGE_BY_CATEGORY := {
	"melee": 1,
	"ranged": 1,
	"auto": 0,
}

# 统一推导技能分类（兼容 category/type/typeLabel/attack_type/action_type）
static func resolve_skill_category(skill: Dictionary) -> String:
	if skill == null or skill.is_empty():
		return "melee"
	var type: String = str(skill.get("type", "")).to_lower()
	var type_label: String = str(skill.get("typeLabel", "")).to_lower()
	if type == "ranged" or type == "远程" or type_label == "远程":
		return "ranged"
	if type == "auto" or type == "自动化" or type_label == "自动化":
		return "auto"
	var at_list: Array = []
	var push_at = func(v):
		if v == null:
			return
		if v is Array:
			at_list.append_array(v)
		elif v is String:
			at_list.append(v)
	push_at.call(skill.get("attack_type"))
	push_at.call(skill.get("action_type"))
	if at_list.has("ranged"):
		return "ranged"
	if at_list.has("auto") or at_list.has("automation") or at_list.has("support"):
		return "auto"
	var cat: String = str(skill.get("category", ""))
	if cat == "ranged" or cat == "auto" or cat == "melee":
		return cat
	return "melee"

# 由技能对象推导归一化射程字段 {minRange, maxRange}
# 强兜底：优先读归属技能自身 cast_range/castRange（Snake/Camel 双写兼容），
# 其次按类型基准，避免前端高亮范围与后端校验范围错位。
static func get_skill_range_fields(skill: Dictionary) -> Dictionary:
	var cat: String = resolve_skill_category(skill)
	var base_range: int = int(DEFAULT_RANGE_BY_CATEGORY.get(cat, 1))
	var base_min: int = int(DEFAULT_MIN_RANGE_BY_CATEGORY.get(cat, 1))
	if skill == null or skill.is_empty():
		return {"minRange": base_min, "maxRange": base_range}
	# 显式射程优先（双键名兜底）
	var raw_max = skill.get("cast_range", skill.get("castRange", null))
	var raw_min = skill.get("min_cast_range", skill.get("minCastRange", null))
	var max_range: int = int(raw_max) if raw_max != null else base_range
	var min_range: int = int(raw_min) if raw_min != null else base_min
	# 兼容旧字段（bonus_range / min_range）作加成
	var bonus_raw = skill.get("bonus_range", skill.get("extra_range", null))
	var bonus_range: int = int(bonus_raw) if bonus_raw != null else 0
	max_range += bonus_range
	return {"minRange": min_range, "maxRange": max_range}

# 判定目标是否在技能射程内
static func is_target_in_range(source_q: int, source_r: int, target_q: int, target_r: int, fields: Dictionary) -> bool:
	var dist: int = hex_distance(source_q, source_r, target_q, target_r)
	return dist >= int(fields["minRange"]) and dist <= int(fields["maxRange"])

# ---- 视线阻挡 LoS（I-6 几何真相源） ----
static var LOS_TOLERANCE: int = 1

static func _cube_round(x: float, y: float, z: float) -> Dictionary:
	var rx: int = roundi(x)
	var ry: int = roundi(y)
	var rz: int = roundi(z)
	var dx: float = absf(rx - x)
	var dy: float = absf(ry - y)
	var dz: float = absf(rz - z)
	if dx > dy and dx > dz:
		rx = -ry - rz
	elif dy > dz:
		ry = -rx - rz
	else:
		rz = -rx - ry
	return {"q": rx, "r": ry, "s": rz}

# 六角格直线插值（cube lerp + cube round），含两端
static func hex_line_draw(from_q: int, from_r: int, to_q: int, to_r: int) -> Array:
	var a := offset_to_axial(from_q, from_r)
	var b := offset_to_axial(to_q, to_r)
	var a_cube := {"q": a.q, "r": a.r, "s": -a.q - a.r}
	var b_cube := {"q": b.q, "r": b.r, "s": -b.q - b.r}
	var n: int = hex_distance(from_q, from_r, to_q, to_r)
	if n == 0:
		return [{"q": from_q, "r": from_r}]
	var result := []
	for i in range(n + 1):
		var t: float = float(i) / float(n)
		var c := _cube_round(
			a_cube.q + (b_cube.q - a_cube.q) * t,
			a_cube.r + (b_cube.r - a_cube.r) * t,
			a_cube.s + (b_cube.s - a_cube.s) * t
		)
		var off := axial_to_offset(c.q, c.r)
		result.append(off)
	return result

# ---- 像素 → 六边形逆推（1.0 标准倍率，宪法 §2 单一数学真理）----
# 与 pointy_top_center 严格互逆：
#   正向  x = q*HEX_HORIZONTAL_SPACING + (r偶 ? HEX_RADIUS : 0),  y = r*HEX_VERTICAL_SPACING
#   逆推  r = round(y / HEX_VERTICAL_SPACING); q = round((x - (r偶 ? HEX_RADIUS : 0)) / HEX_HORIZONTAL_SPACING)
# 渲染层只负责减去居中偏移/缩放后再传入，本函数不感知相机/世界变换。
static func pixel_to_hex(px: float, py: float) -> Dictionary:
	var r_round: int = roundi(py / HEX_VERTICAL_SPACING)
	var offset_x: float = HEX_RADIUS if (r_round % 2 == 0) else 0.0
	var q_round: int = roundi((px - offset_x) / HEX_HORIZONTAL_SPACING)
	return {"q": q_round, "r": r_round}


# 服务端权威视线判定
# grid: Dictionary{ get_hex_key -> {"elevation": int, "blocks_sight": bool} }
static func compute_los(from_q: int, from_r: int, to_q: int, to_r: int, grid: Dictionary, opts: Dictionary = {}) -> bool:
	var dist: int = hex_distance(from_q, from_r, to_q, to_r)
	if opts.has("sightRange") and dist > int(opts["sightRange"]):
		return false
	var line := hex_line_draw(from_q, from_r, to_q, to_r)
	var viewer_eye: int = int(opts.get("viewerEye", grid.get(get_hex_key(from_q, from_r), {}).get("elevation", 0)))
	for i in range(1, line.size() - 1):
		var cell: Dictionary = grid.get(get_hex_key(line[i].q, line[i].r), {})
		if cell.is_empty():
			continue
		if bool(cell.get("blocks_sight", false)):
			return false
		if int(cell.get("elevation", 0)) - viewer_eye > LOS_TOLERANCE:
			return false
	return true
