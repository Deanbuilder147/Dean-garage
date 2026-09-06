# ============================================================
# render/unit_renderer.gd
# 单位渲染沙盒（纯渲染，单向消费状态）。
#
# 【阶段 4·单位渲染收口】职责：
#   - 收口 Battle3D._rebuild_units / _make_unit_texture 内联实现，
#     统一到本文件（单一渲染出口），控制器只持有本实例。
#   - 高度真相：HexMath.UNIT_FLOAT_Y（宪法 §2 几何真相一致）。
#   - 坐标真相：HexMath.pointy_top_center（宪法 §2，禁硬编码）。
#   - 依赖显式传入：units / center_offset 经 update() 注入（宪法 §3）。
#   - 不订阅 EventBus：订阅在 Battle3D 桥接层，本节点仅提供 update()。
#
# 接口（与 Battle3D 既有行为对齐，保证视觉不回退）：
#   - update(units, center_offset)：重建全部单位 Sprite3D。
#   - get_unit_node(unit_id)：返回该单位 Sprite3D，供选中着色 / Tween 动画。
#   - find_unit_at(q, r)：返回该格单位 id，供点击拾取（替代旧 _unit_sprites 反查）。
#   - set_unit_selected(unit_id, on)：选中态描边（复用纹理绘制）。
# ============================================================
class_name UnitRenderer
extends Node3D

# 单位贴图（七视图优先）+ 降级链资源路径（与 Battle3D 原逻辑一致）
const UNIT_TEX := {
	"seven_view": "res://assets/units/7view/%s.png",
	"sprite":     "res://assets/units/sprites/%s.png",
	"logo":       "res://assets/units/logos/%s.png",
}

# 阵营色（矢量圆降级用）
const FACTION_COLOR := {
	"earth":  Color(0.20, 0.55, 0.95),
	"maxion": Color(0.95, 0.55, 0.20),
	"balon":  Color(0.85, 0.30, 0.45),
}
const FALLBACK_COLOR := Color(0.70, 0.70, 0.75)

# 体型 → 世界高度（S/M/L/XL，对齐 Battle3D 原 _rebuild_units 的 world_h）
const SIZE_WORLD_H := {
	"S": 22.0,
	"M": 28.0,
	"L": 34.0,
	"XL": 42.0,
}
const DEFAULT_WORLD_H := 28.0
# 体型 → 矢量圆降级半径（对齐 Battle3D 原 _make_unit_texture 的 R）
const SIZE_VEC_R := {
	"S": 18,
	"M": 24,
	"L": 30,
	"XL": 38,
}
const DEFAULT_VEC_R := 24

# 方向扇区标签（用于七视图命名 / 调试）
const DIRS := ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]

# 状态效果着色（Phase 5.4）：buff=绿 / debuff=红 / neutral=蓝
# type 命中关键字判断，未命中按 neutral 处理。
const STATUS_COLOR_BUFF := Color(0.30, 0.85, 0.40)
const STATUS_COLOR_DEBUFF := Color(0.95, 0.35, 0.35)
const STATUS_COLOR_NEUTRAL := Color(0.45, 0.65, 0.95)
const STATUS_DEBUFF_HINTS := ["slow", "debuff", "poison", "burn", "stun", "weak", "blind", "root", "freeze"]
const STATUS_BUFF_HINTS := ["haste", "buff", "shield", "regen", "bless", "guard", "swift"]

var _unit_nodes: Dictionary = {}   # unit_id(String) -> Sprite3D
var _unit_hex: Dictionary = {}     # Vector2i(q,r) -> unit_id(String)
var _unit_data: Dictionary = {}    # unit_id(String) -> unit Dictionary（供选中重绘底图）
var _tex_cache: Dictionary = {}    # tex_key -> Texture2D
var _dying_nodes: Dictionary = {}  # ★ Phase 7.1：unit_id -> 正在播放离场动画的 Node3D（update 全清时跳过）
var _animating_nodes: Dictionary = {}  # ★ Phase 7.2：unit_id -> 正在播放施法位移的 Node3D（update 全清时跳过）


# ★ Phase 7.1：将死亡单位节点从常规模板字典摘除并托管给 Battle3D 播离场动效。
# 返回被摘除的 Node3D；若该单位节点不存在则返回 null。
func detach_for_death(unit_id: String) -> Node3D:
	var node = _unit_nodes.get(unit_id)
	if node == null:
		return null
	_unit_nodes.erase(unit_id)
	_unit_hex.erase(_unit_hex.find_key(unit_id) if _unit_hex.has(unit_id) else Vector2i.ZERO)
	_dying_nodes[unit_id] = node
	return node


# ★ Phase 7.2：将施法位移中的单位节点从常规模板字典摘除并托管给 Battle3D 播位移动效。
# 与 detach_for_death 对称：动画结束由 Battle3D 调 queue_free（下次 update 自然在正确位置重建）。
func detach_for_anim(unit_id: String) -> Node3D:
	var node = _unit_nodes.get(unit_id)
	if node == null:
		return null
	_unit_nodes.erase(unit_id)
	_unit_hex.erase(_unit_hex.find_key(unit_id) if _unit_hex.has(unit_id) else Vector2i.ZERO)
	_animating_nodes[unit_id] = node
	return node


# ★ Phase 7.1：离场动画结束回调，彻底释放节点并从托管表移除。
func _release_dying(unit_id: String) -> void:
	var node = _dying_nodes.get(unit_id)
	if node != null and is_instance_valid(node):
		node.queue_free()
	_dying_nodes.erase(unit_id)



func _ready() -> void:
	pass


# 由桥接层显式传入单位列表与居中偏移（禁读全局）
func update(units: Array, center_offset: Vector3) -> void:
	_clear_children()
	for u in units:
		if not (u is Dictionary):
			continue
		var uid = str(u.get("id", ""))
		if uid == "":
			continue
		var sp := _build_unit_sprite(u, center_offset)
		if sp != null:
			add_child(sp)
			_unit_nodes[uid] = sp
			_unit_data[uid] = u
			var pos: Dictionary = u.get("position", {})
			var q: int = int(pos.get("q", 0))
			var r: int = int(pos.get("r", 0))
			_unit_hex[Vector2i(q, r)] = uid
			# Phase 5.4：状态效果头顶图标（纯渲染，消费 unit.statusEffects）
			_attach_status_icons(u, sp, SIZE_WORLD_H.get(str(u.get("size", "M")).to_upper(), DEFAULT_WORLD_H))


# 构建单个单位 Sprite3D（对齐 Battle3D._rebuild_unit / _make_unit_texture 视觉）
func _build_unit_sprite(u: Dictionary, center_offset: Vector3) -> Sprite3D:
	var uid = str(u.get("id", ""))
	var pos: Dictionary = u.get("position", {})
	var q: int = int(pos.get("q", 0))
	var r: int = int(pos.get("r", 0))

	var pos2: Vector2 = HexMath.pointy_top_center(q, r)
	# 高度统一用几何真相 HexMath.UNIT_FLOAT_Y（替代旧 elevation*10+6 的散落实现）
	var world := Vector3(pos2.x, HexMath.UNIT_FLOAT_Y, pos2.y) + center_offset

	var sp := Sprite3D.new()
	sp.texture = _make_unit_texture(u)
	sp.position = world
	sp.billboard = BaseMaterial3D.BILLBOARD_ENABLED

	var size_key: String = str(u.get("size", "M")).to_upper()
	var world_h: float = SIZE_WORLD_H.get(size_key, DEFAULT_WORLD_H)
	# Sprite3D.pixel_size = 每个像素对应的世界单位；让贴图高度 ≈ world_h（对齐 Battle3D 原实现）
	sp.pixel_size = world_h / float(sp.texture.get_height())
	sp.name = "Unit_" + uid
	return sp


# 七视图降级链（七视图 > 精灵 > Logo > 矢量圆），对齐 Battle3D._make_unit_texture
func _make_unit_texture(u: Dictionary) -> Texture2D:
	var uid = str(u.get("id", ""))
	var faction: String = str(u.get("faction", ""))

	for kind in ["seven_view", "sprite", "logo"]:
		var tmpl: String = UNIT_TEX[kind]
		var path: String = tmpl % uid
		if ResourceLoader.exists(path):
			if not _tex_cache.has(path):
				_tex_cache[path] = load(path) as Texture2D
			var tex: Texture2D = _tex_cache[path]
			if tex != null:
				return tex

	# 降级：矢量圆（阵营色填充），对齐 Battle3D 原实现
	var fill: Color = FACTION_COLOR.get(faction, FALLBACK_COLOR)
	var size_key: String = str(u.get("size", "M")).to_upper()
	var vec_r: int = SIZE_VEC_R.get(size_key, DEFAULT_VEC_R)
	return _vector_circle_texture(fill, vec_r)


# 运行时生成阵营色矢量圆（与 Battle3D._make_unit_texture 降级档一致）
func _vector_circle_texture(fill: Color, R: int) -> Texture2D:
	var cache_key: String = "vec_%s_%d" % [fill.to_html(false), R]
	if _tex_cache.has(cache_key):
		return _tex_cache[cache_key]
	var img := Image.create(R*2, R*2, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	for yy in range(R*2):
		for xx in range(R*2):
			var d: float = Vector2(xx - R, yy - R).length()
			if d <= R:
				var a: float = 1.0
				if d > R - 3:
					a = 0.6
				img.set_pixel(xx, yy, Color(fill.r, fill.g, fill.b, a))
	for yy in range(R*2):
		for xx in range(R*2):
			var d: float = Vector2(xx - R, yy - R).length()
			if d > R - 3 and d <= R:
				img.set_pixel(xx, yy, Color(1, 1, 1, 0.9))
	var tex := ImageTexture.create_from_image(img)
	_tex_cache[cache_key] = tex
	return tex


func _clear_children() -> void:
	for c in get_children():
		# ★ Phase 7.1/7.2：跳过正在播放离场/施法位移动画的节点（由 Battle3D 托管释放）
		if c in _dying_nodes.values() or c in _animating_nodes.values():
			continue
		c.queue_free()
	_unit_nodes.clear()
	_unit_hex.clear()
	_unit_data.clear()


# 选中态描边：在底图基础上叠加金色环（on）；取消时重绘底图（off）。
# 底图经 _make_unit_texture(u) 重新生成，避免对不可变贴图做破坏式修改。
func set_unit_selected(unit_id: String, on: bool) -> void:
	var sp: Sprite3D = _unit_nodes.get(unit_id, null)
	if sp == null:
		return
	if on:
		var base: Texture2D = sp.texture
		var img: Image = base.get_image() if (base != null and base.has_method("get_image")) else null
		if img == null:
			img = Image.create(72, 72, false, Image.FORMAT_RGBA8)
			img.fill(Color(0, 0, 0, 0))
		var ring := Image.create(img.get_width(), img.get_height(), false, Image.FORMAT_RGBA8)
		ring.blit_rect(img, Rect2(0, 0, img.get_width(), img.get_height()), Vector2.ZERO)
		var c := Vector2(img.get_width() / 2, img.get_height() / 2)
		for y in range(img.get_height()):
			for x in range(img.get_width()):
				var d: float = Vector2(x, y).distance_to(c)
				var rr: float = float(min(img.get_width(), img.get_height())) * 0.42
				if d > rr - 2.0 and d <= rr:
					ring.set_pixel(x, y, Color(1.0, 0.9, 0.3, 1.0))
		sp.texture = ImageTexture.create_from_image(ring)
	else:
		var u: Dictionary = _unit_data.get(unit_id, {})
		if not u.is_empty():
			sp.texture = _make_unit_texture(u)


# 返回单位 Sprite3D（供选中着色 / Tween 平滑过渡 / 射线拾取父节点）
func get_unit_node(unit_id: String) -> Sprite3D:
	return _unit_nodes.get(unit_id, null)


# 返回该格单位 id（点击拾取反查，替代旧 Battle3D._unit_sprites 遍历）
func find_unit_at(q: int, r: int) -> String:
	return _unit_hex.get(Vector2i(q, r), "")


# ============================================================
# Phase 5.4 状态效果（Buff/Debuff）头顶图标
# 消费 unit.statusEffects: Array[Dictionary]，元素含 type / remainingTurns。
# 在每个单位 Sprite3D 头顶横向排布小图标，作为 sp 子节点（billboard 始终面向相机）。
# 不订阅 EventBus，纯渲染；数据由 update() 显式注入。
# ============================================================
func _attach_status_icons(u: Dictionary, sp: Sprite3D, world_h: float) -> void:
	var effects: Array = u.get("statusEffects", [])
	if effects == null or effects.size() == 0:
		return
	var n: int = effects.size()
	var icon_r: int = 9  # 图标纹理半径（像素）
	var spacing: float = (icon_r * 2 + 4) * sp.pixel_size  # 世界间距
	var base_x: float = -(float(n - 1) / 2.0) * spacing
	var top_y: float = world_h * 0.6 + icon_r * sp.pixel_size  # 头顶上方
	for i in range(n):
		var eff: Dictionary = effects[i] if effects[i] is Dictionary else {}
		var tex: Texture2D = _status_icon_texture(_status_color_of(str(eff.get("type", ""))), icon_r)
		var icon := Sprite3D.new()
		icon.texture = tex
		icon.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		icon.pixel_size = sp.pixel_size
		icon.position = Vector3(base_x + i * spacing, top_y, 0)
		sp.add_child(icon)
		# ★ Phase 7.2：剩余回合数字角标（Label3D，带白色底衬描边，billboard 面向相机）
		var turns: int = int(eff.get("duration", eff.get("remainingTurns", eff.get("turns", 0))))
		if turns > 0:
			var lbl := Label3D.new()
			lbl.text = str(turns)
			lbl.font_size = 22
			lbl.pixel_size = sp.pixel_size * 0.9
			lbl.billboard = BaseMaterial3D.BILLBOARD_ENABLED
			lbl.outline_size = 3
			lbl.outline_modulate = Color(0, 0, 0, 1)  # 黑色底衬描边，提升战术清晰度
			lbl.modulate = Color(1, 1, 1, 1)
			lbl.position = Vector3(0, -icon_r * sp.pixel_size * 1.3, 1)  # 图标正下方
			icon.add_child(lbl)  # 随图标 billboard 一起朝向相机


# 按 type 关键字归类着色：debuff > buff > neutral
func _status_color_of(type_str: String) -> Color:
	var t: String = type_str.to_lower()
	for h in STATUS_DEBUFF_HINTS:
		if t.contains(h):
			return STATUS_COLOR_DEBUFF
	for h in STATUS_BUFF_HINTS:
		if t.contains(h):
			return STATUS_COLOR_BUFF
	return STATUS_COLOR_NEUTRAL


# 生成状态图标纹理：着色的圆 + 白色描边 + 剩余回合数字（若有）
func _status_icon_texture(color: Color, R: int) -> Texture2D:
	var cache_key: String = "se_%s_%d" % [color.to_html(false), R]
	if _tex_cache.has(cache_key):
		return _tex_cache[cache_key]
	var img := Image.create(R*2, R*2, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	for yy in range(R*2):
		for xx in range(R*2):
			var d: float = Vector2(xx - R, yy - R).length()
			if d <= R:
				var a: float = 1.0 if d <= R - 2 else 0.6
				img.set_pixel(xx, yy, Color(color.r, color.g, color.b, a))
	# 白色描边
	for yy in range(R*2):
		for xx in range(R*2):
			var d: float = Vector2(xx - R, yy - R).length()
			if d > R - 2 and d <= R:
				img.set_pixel(xx, yy, Color(1, 1, 1, 0.9))
	var tex := ImageTexture.create_from_image(img)
	_tex_cache[cache_key] = tex
	return tex

