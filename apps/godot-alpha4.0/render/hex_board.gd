# ============================================================
# render/hex_board.gd
# 六角格棋盘渲染（GDScript 移植版）
# 对齐 frontend/src/utils/hexDraw.js + Godot 战棋宪法 v2.0
#
# 红线（继承自前端宪法）：
#   1. 单向数据管道终点：本节点只从外部注入的 battle_state 读取绘制，
#      绝不主动读全局单例 / 反向写逻辑。
#   2. 坐标唯一真相源：所有格子坐标变换走 HexMath（Even-R offset）。
#   3. 坐标唯一真相源：所有格子坐标走 pointyTopCenter（Even-R offset），
#      2.5D 等距为可选装饰层，不进入核心坐标链（见总结文档第六节）。
#
# 调用方：Battle 场景把 battle_state（Dictionary）set 进来，调用 redraw()。
# ============================================================
class_name HexBoard
extends Node2D

# ---- 几何常量（与 hexUtils.js 一致，禁止硬编码散落） ----
const HEX_WIDTH := 64.0
const HEX_HEIGHT := 72.0
const HEX_RADIUS := 36.0   # = HEX_HEIGHT/2，原项目外接圆半径
const SQRT3 := 1.7320508

# ---- 视图参数（可由外部设置） ----
var board_offset := Vector2(0, 0)
var zoom := 1.0
# 2.5D 等距（可选装饰层，默认关闭；开启时仅在投影层叠加，不污染核心坐标链）
# 真相源 ISO_DEFAULTS：shearX=0.38, shearY=0, scaleX=1.00, scaleY=0.39, rot=-24
var iso_enabled := false
const ISO_SHEAR_X := 0.38
const ISO_SHEAR_Y := 0.0
const ISO_SCALE_X := 1.0
const ISO_SCALE_Y := 0.39
const ISO_ROT := -24.0   # 度
var _centered_once: bool = false   # 首次自动居中后不再覆盖（用户可拖拽）

# ---- 地图精灵贴图（res://assets/map，80x96 透明 PNG，中心对齐格子中心） ----
var _tex_terrain: Dictionary = {}   # terrain_key -> Texture2D
var _tex_overlay: Dictionary = {}   # overlay_key -> Texture2D

# 注入的战斗状态（只读副本）
var battle_state: Dictionary = {}

# ---- 交互态（仍由外部 push，本节点不主动拉） ----
var selected_unit_id: String = ""          # 当前选中单位
var movable_cells: Array = []              # 可移动范围 [{q,r}]（由 Battle2D.gd 注入）
var attackable_cells: Array = []           # 可攻击范围 [{q,r}]（预留，攻击阶段用）
var hover_cell: Dictionary = {}            # 鼠标悬停格 {q,r}

func _ready():
	_load_textures()

# 加载 res://assets/map 下的 6 地形 + 4 覆盖层精灵
func _load_textures():
	var base := "res://assets/map/"
	# 后端 terrain_types 表（11种）+ 实际地图用到的值 → Figma 瓦片映射
	# crystal/fortress/lunar/mothership/repair_station/spawn/spawn_earth/spawn_maxion
	var terrain_map := {
		# ── Figma 原生命名（直接匹配）──
		"space_void": "T-01_space_void.png", "void": "T-01_space_void.png",
		"planet_surface": "T-02_planet_surface.png", "surface": "T-02_planet_surface.png",
		"debris": "T-03_debris.png",
		"repair_station": "T-04_repair_station.png", "repair": "T-04_repair_station.png",
		"base_plain": "T-05_base_plain.png", "plain": "T-05_base_plain.png", "flat": "T-05_base_plain.png",
		"coolant": "T-06_coolant.png",
		# ── 后端 terrain_types 实际值映射 ──
		# lunar(月面)→太空虚空风格 T-01
		"lunar": "T-01_space_void.png",
		# mothership(母舰)→基地平原 T-05（出生点，开阔）
		"mothership": "T-05_base_plain.png",
		# spawn/spawn_earth/spawn_maxion(出生点)→基地平原 T-05
		"spawn": "T-05_base_plain.png",
		"spawn_earth": "T-05_base_plain.png",
		"spawn_maxion": "T-05_base_plain.png",
		# crystal(晶体)→冷却液 T-06（蓝绿色调接近晶体感）
		"crystal": "T-06_coolant.png",
		# fortress(要塞)→废墟 T-03（战场遗迹风格）
		"fortress": "T-03_debris.png",
	}
	for k in terrain_map:
		var tex := load(base + terrain_map[k])
		if tex != null:
			_tex_terrain[k] = tex
	var overlay_map := {
		"move": "OL-01_move.png", "attack": "OL-02_attack.png",
		"aoe": "OL-03_aoe.png", "selected": "OL-04_selected.png",
	}
	for k in overlay_map:
		var tex := load(base + overlay_map[k])
		if tex != null:
			_tex_overlay[k] = tex

# 注入战斗状态并重绘（单向：调用方 push，本节点不拉）
func set_battle_state(state: Dictionary):
	battle_state = state
	queue_redraw()

# 根据地图 cells 包围盒自动居中棋盘到视口中心
# 算法对齐文档第七节 fit：四角 pointyTopCenter 包围盒 + 1 格边距，
# 取 fit-scale 让网格居中，并自动计算初始 zoom（与地图编辑器一致）
func _auto_center():
	var raw_cells = battle_state.get("cells", [])
	if raw_cells is Array and raw_cells.is_empty():
		var m = battle_state.get("map", {})
		if m is Dictionary:
			raw_cells = m.get("cells", [])
	var cells: Array = raw_cells if raw_cells is Array else []
	if cells.is_empty():
		return
	# 1) 算包围盒：ISO 关闭用纯 2D 平面；ISO 开启用投影后坐标（临时清零 offset/zoom）
	var saved_off := board_offset
	var saved_zoom := zoom
	board_offset = Vector2.ZERO
	zoom = 1.0
	var min_x := 1e9
	var max_x := -1e9
	var min_y := 1e9
	var max_y := -1e9
	for c in cells:
		var q: int = int(c["q"])
		var r: int = int(c["r"])
		var p := hex_to_screen(q, r)
		min_x = min(min_x, p.x)
		max_x = max(max_x, p.x)
		min_y = min(min_y, p.y)
		max_y = max(max_y, p.y)
	board_offset = saved_off
	zoom = saved_zoom
	# 2) 加 1 格边距（HEX_WIDTH/HEX_HEIGHT，对齐文档）
	min_x -= HEX_WIDTH; max_x += HEX_WIDTH
	min_y -= HEX_HEIGHT; max_y += HEX_HEIGHT
	var region_w: float = max_x - min_x
	var region_h: float = max_y - min_y
	# 3) fit-scale（文档第七节）：让整个地图塞进视口
	var vp: Vector2 = get_viewport_rect().size
	var fit_zoom: float = min(vp.x / region_w, vp.y / region_h)
	fit_zoom = clamp(fit_zoom, 0.3, 3.0)
	zoom = fit_zoom
	# 4) 居中：地图平面中心对齐视口中心
	var map_cx := (min_x + max_x) / 2.0
	var map_cy := (min_y + max_y) / 2.0
	board_offset = vp / 2.0 - Vector2(map_cx, map_cy) * zoom
	print("[HexBoard] _auto_center: vp=", vp, " map_center=(", map_cx, ",", map_cy,
		") offset=", board_offset, " zoom=", zoom, " cells=", cells.size())

# 注入选中/范围态（交互高亮，仍走 push）
func set_selection(unit_id: String, movable: Array, attackable: Array = []):
	selected_unit_id = unit_id
	movable_cells = movable
	attackable_cells = attackable
	queue_redraw()

func set_hover(cell: Dictionary):
	if cell == hover_cell:
		return
	hover_cell = cell
	queue_redraw()

# 纯 2D 尖顶 Even-R 平面中心（= hexUtils.pointyTopCenter，坐标唯一真理源）
# 1) x = size*√3*q；偶数行 + size*√3/2（右移半格）
# 2) y = size*1.5*r（行步长刚性）
func pointy_top_center(q: int, r: int) -> Vector2:
	var size: float = HEX_RADIUS
	var x: float = size * SQRT3 * float(q)
	if int(r) % 2 == 0:
		x += size * SQRT3 * 0.5
	var y: float = size * 1.5 * float(r)
	return Vector2(x, y)

# 2.5D 等距变换矩阵（仅 iso_enabled 时使用）
# 关键：用 draw_set_transform_matrix 把【整个绘图坐标系】设成 ISO 仿射+旋转，
# 之后所有 draw_* 仍用【纯 2D 平面坐标】，Godot 自动把每个轴对齐精灵映射成
# 等距形状，相邻格子自然贴合（对齐前端 ctx.transform 的 Godot 等价物）。
# Godot Transform2D 是列主序：Transform2D(xx, xy, yx, yy, x, y)
#   列0 = (xx, xy)，列1 = (yx, yy)，平移 = (x, y)
# 仿射矩阵 [[scaleX, shearX],[shearY, scaleY]] → xx=scaleX, xy=shearY, yx=shearX, yy=scaleY
func _make_iso_xform() -> Transform2D:
	var sx: float = ISO_SCALE_X
	var sy: float = ISO_SCALE_Y
	var shx: float = ISO_SHEAR_X
	var shy: float = ISO_SHEAR_Y
	var th := deg_to_rad(ISO_ROT)
	var c := cos(th)
	var s := sin(th)
	# 仿射 [[sx,shx],[shy,sy]]，先叠 zoom，再叠旋转 -24°
	# 列0（x 轴）、列1（y 轴）手工计算，避免 4.7 已移除的 Transform2D 旧构造器
	var ax0 := Vector2(sx * zoom, shy * zoom)
	var ay0 := Vector2(shx * zoom, sy * zoom)
	var ax := Vector2(c * ax0.x - s * ax0.y, s * ax0.x + c * ax0.y)
	var ay := Vector2(c * ay0.x - s * ay0.y, s * ay0.x + c * ay0.y)
	# Godot 4.2+ 构造器：Transform2D(x_axis, y_axis, origin)
	return Transform2D(ax, ay, board_offset)

# 像素中心（渲染层）：纯 2D 平面坐标（ISO 模式由 draw_set_transform_matrix 自动变换）
func hex_to_screen(q: int, r: int) -> Vector2:
	return pointy_top_center(q, r)

# 屏幕像素 → 六角格坐标（逆运算链）
# ISO 模式：先用 iso 矩阵逆变换把屏幕点转回 2D 平面，再逆推 pointyTopCenter
func screen_to_hex(screen: Vector2) -> Dictionary:
	var p: Vector2 = screen
	if iso_enabled and _iso_xform != null:
		p = _iso_xform.affine_inverse() * screen
	# 逆推 pointyTopCenter（注意 zoom 已在矩阵逆变换中抵消）
	var size: float = HEX_RADIUS
	var qf: float = p.x / (size * SQRT3)
	var q_round: int = roundi(qf)
	# parity 偏移：偶数行 x 多了 size*√3/2 → 逆推时先减去再 round
	if int(q_round) % 2 == 0:
		qf = (p.x - size * SQRT3 * 0.5) / (size * SQRT3)
		q_round = roundi(qf)
	var r_round: int = roundi(p.y / (size * 1.5))
	return {"q": q_round, "r": r_round}

# 缓存当前 iso 矩阵（_draw 设置、screen_to_hex 复用）
var _iso_xform: Transform2D = Transform2D()

func _draw():
	if battle_state.is_empty():
		return
	# 首次绘制时自动居中到视口（用户拖拽后不再覆盖）
	if not _centered_once:
		_auto_center()
	# 设置绘图变换：2.5D 模式用 ISO 矩阵，否则单位矩阵（纯 2D）
	if iso_enabled:
		_iso_xform = _make_iso_xform()
		draw_set_transform_matrix(_iso_xform)
	else:
		_iso_xform = Transform2D()
		draw_set_transform_matrix(Transform2D())

		_centered_once = true
	# 绘制地形格（后端 state.cells 为空，真实数据在 state.map.cells）
	var raw_cells = battle_state.get("cells", [])
	if raw_cells is Array and raw_cells.is_empty():
		var m = battle_state.get("map", {})
		if m is Dictionary:
			raw_cells = m.get("cells", [])
	var cells: Array = raw_cells if raw_cells is Array else []
	for c in cells:
		var q: int = int(c["q"])
		var r: int = int(c["r"])
		# 地形键：优先 c.terrain，其次 c.type，再回落默认 plain
		var tkey: String = ""
		if c.has("terrain"):
			tkey = str(c["terrain"])
		elif c.has("type"):
			tkey = str(c["type"])
		if _tex_terrain.has(tkey):
			_draw_hex_tile(q, r, _tex_terrain[tkey])
		else:
			# 兜底：未知地形用矢量绘制（默认 base_plain 蓝灰）
			_draw_hex(q, r, Color(0.25, 0.45, 0.55, 0.85), Color(0.6, 0.8, 0.9, 0.6))
	# 高亮：可移动范围（覆盖层 OL-01_move 贴图 + 矢量兜底）
	for c in movable_cells:
		_draw_hex_overlay(int(c["q"]), int(c["r"]), "move", Color(0.2, 0.7, 0.3, 0.25), Color(0.4, 1.0, 0.5, 0.8))
	# 高亮：可攻击范围（覆盖层 OL-02_attack 贴图 + 矢量兜底）
	for c in attackable_cells:
		_draw_hex_overlay(int(c["q"]), int(c["r"]), "attack", Color(0.8, 0.2, 0.2, 0.25), Color(1.0, 0.4, 0.4, 0.8))
	# 悬停格描边（矢量，始终绘制）
	if not hover_cell.is_empty():
		_draw_hex(int(hover_cell["q"]), int(hover_cell["r"]), Color(0,0,0,0), Color(1, 1, 0.6, 0.9))
	# 绘制单位
	var units = battle_state.get("units", {})
	var unit_list: Array = units.values() if units is Dictionary else (units if units is Array else [])
	for u in unit_list:
		if not (u is Dictionary):
			continue
		var pos: Dictionary = u.get("position", {})
		if pos.is_empty():
			continue
		_draw_unit(u, str(u.get("id", "")) == selected_unit_id)

# 用精灵贴图绘制一个地形格（纯 2D 坐标，ISO 投影由 _draw 的 draw_set_transform_matrix 自动处理）
func _draw_hex_tile(q: int, r: int, tex: Texture2D):
	var center := hex_to_screen(q, r)
	var tex_size := tex.get_size() * zoom
	var top_left := center - tex_size / 2.0
	draw_texture(tex, top_left, Color(1, 1, 1, 1))

# 用覆盖层贴图绘制高亮格（纯 2D 坐标）
func _draw_hex_overlay(q: int, r: int, key: String, fill: Color, line: Color):
	if _tex_overlay.has(key):
		var center := hex_to_screen(q, r)
		var tex: Texture2D = _tex_overlay[key]
		var tex_size := tex.get_size() * zoom
		var top_left := center - tex_size / 2.0
		draw_texture(tex, top_left, Color(1, 1, 1, 1))
	# 矢量描边兜底（贴图缺失时）
	_draw_hex(q, r, fill, line)

func _draw_hex(q: int, r: int, fill: Color, line: Color):
	var center := hex_to_screen(q, r)
	# 尖顶六边形顶点（以中心 + 半宽/半高）
	var hw := HEX_WIDTH * 0.5 * zoom
	var hh := HEX_HEIGHT * 0.5 * zoom
	var pts := PackedVector2Array()
	# 尖顶：角在上下，顶点角度 30° 间隔，从 -90° 起
	for i in range(6):
		var ang := deg_to_rad(60.0 * i - 90.0)
		# 尖顶六角：x = hw*cos, y = hh*sin（宽高比 64:72 ≈ 0.89）
		pts.append(center + Vector2(cos(ang) * hw, sin(ang) * hh))
	draw_polygon(pts, [fill])
	draw_polyline(pts, line, 1.5)

# 绘制一个单位（矢量版，无贴图时）：按 faction 着色、按 size 缩放、选中光环 + 名称
func _draw_unit(u: Dictionary, is_selected: bool):
	var pos: Dictionary = u.get("position", {})
	var p := hex_to_screen(int(pos["q"]), int(pos["r"]))
	# 阵营色（faction 仅展示着色，符合战斗宪法）
	var faction: String = str(u.get("faction", ""))
	var col := Color(0.9, 0.4, 0.3, 1.0)   # 默认 maxion 红橙
	if faction == "earth":
		col = Color(0.3, 0.6, 0.95, 1.0)   # earth 蓝
	elif faction == "balon":
		col = Color(0.6, 0.4, 0.85, 1.0)   # balon 紫
	# 体型缩放（S/M/L/XL，对齐七视图 SIZE_SEVEN_BOX 基础半径）
	var size_key: String = str(u.get("size", "M")).to_upper()
	var radius: float = 14.0
	if size_key == "S":
		radius = 11.0
	elif size_key == "L":
		radius = 17.0
	elif size_key == "XL":
		radius = 21.0
	radius *= zoom
	# 选中光环
	if is_selected:
		draw_circle(p, radius + 6.0 * zoom, Color(1.0, 0.9, 0.2, 0.35))
		draw_arc(p, radius + 6.0 * zoom, 0.0, TAU, 32, Color(1.0, 0.9, 0.2, 0.9), 2.0 * zoom)
	# 单位主体（圆 + 描边）
	draw_circle(p, radius, col)
	draw_arc(p, radius, 0.0, TAU, 32, Color(1, 1, 1, 0.9), 2.0 * zoom)
	# 名称
	if u.has("name"):
		draw_string(ThemeDB.fallback_font, p + Vector2(-radius, radius + 4.0 * zoom),
			str(u["name"]), HORIZONTAL_ALIGNMENT_CENTER, int(80 * zoom), int(13 * zoom),
			Color(1, 1, 1, 0.95))
