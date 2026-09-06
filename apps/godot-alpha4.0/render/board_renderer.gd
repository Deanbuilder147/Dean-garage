# ============================================================
# render/board_renderer.gd
# 棋盘渲染沙盒（纯渲染，单向消费状态）。
#
# 【阶段 3·战场状态与渲染桥接】真实棋盘渲染器：
#   - 收口 Battle3D._rebuild_board 内联实现，统一到本文件（单一渲染出口）。
#   - 几何真相：HexMath.TILE_THICKNESS（薄地砖）/ COLUMN_HEIGHT / UNIT_FLOAT_Y。
#   - 坐标真相：HexMath.pointy_top_center（宪法 §2，禁硬编码）。
#   - 依赖显式传入：board_state / center_offset 经 update() 注入（宪法 §3）。
#   - 不订阅 EventBus：订阅在 Battle3D 桥接层，本节点仅提供 update() 方法。
#
# 接口与 Battle3D 既有行为对齐（保证视觉不回退）：
#   - 六棱柱为薄地砖（height = TILE_THICKNESS），柱心 y = COLUMN_HEIGHT/2。
#   - 柱顶平躺六边形美术贴图（assets/map/T-01_*.png），俯视可见。
#   - get_tile(q, r) 返回该格 MeshInstance3D，供选中着色复用（替代旧 _tile_map）。
# ============================================================
class_name BoardRenderer
extends Node3D

const PRISM_SIDES := 6
const PRISM_FRAGMENTS := 1
# 顶面抬升：柱顶世界 y = COLUMN_HEIGHT/2 + TILE_THICKNESS/2，贴图再抬 1.0 防被柱体包住
var TEX_LIFT: float = HexMath.TILE_THICKNESS / 2.0 + 1.0

# 地形 key → 2D 美术贴图路径（与 Battle3D 已验证路径一致）
const TERRAIN_TEX_PATH := {
	"space_void": "res://assets/map/T-01_space_void.png",
	"void": "res://assets/map/T-01_space_void.png",
	"lunar": "res://assets/map/T-01_space_void.png",
	"planet_surface": "res://assets/map/T-02_planet_surface.png",
	"surface": "res://assets/map/T-02_planet_surface.png",
	"debris": "res://assets/map/T-03_debris.png",
	"fortress": "res://assets/map/T-03_debris.png",
	"repair_station": "res://assets/map/T-04_repair_station.png",
	"repair": "res://assets/map/T-04_repair_station.png",
	"base_plain": "res://assets/map/T-05_base_plain.png",
	"plain": "res://assets/map/T-05_base_plain.png",
	"flat": "res://assets/map/T-05_base_plain.png",
	"mothership": "res://assets/map/T-05_base_plain.png",
	"spawn": "res://assets/map/T-05_base_plain.png",
	"spawn_earth": "res://assets/map/T-05_base_plain.png",
	"spawn_maxion": "res://assets/map/T-05_base_plain.png",
	"coolant": "res://assets/map/T-06_coolant.png",
	"crystal": "res://assets/map/T-06_coolant.png",
}

var _prism_mesh: CylinderMesh = null
var _tiles: Dictionary = {}   # Vector2i(q,r) -> MeshInstance3D
var _tex_cache: Dictionary = {}
var _center_offset: Vector3 = Vector3.ZERO


func _ready() -> void:
	_prism_mesh = CylinderMesh.new()
	_prism_mesh.top_radius = HexMath.HEX_RADIUS
	_prism_mesh.bottom_radius = HexMath.HEX_RADIUS
	_prism_mesh.height = HexMath.TILE_THICKNESS
	_prism_mesh.radial_segments = PRISM_SIDES
	_prism_mesh.rings = PRISM_FRAGMENTS


# 由桥接层显式传入棋盘状态与居中偏移（禁读全局）
func update(board_state: Dictionary, center_offset: Vector3) -> void:
	_center_offset = center_offset
	_clear_children()
	var cells: Array = board_state.get("cells", [])
	if cells is Array and cells.is_empty():
		var m = board_state.get("map", {})
		if m is Dictionary:
			cells = m.get("cells", [])
	if not (cells is Array):
		return
	for cell in cells:
		_add_hex_prism(cell, center_offset)


func _add_hex_prism(cell: Dictionary, center_offset: Vector3) -> void:
	var q: int = int(cell.get("q", 0))
	var r: int = int(cell.get("r", 0))
	var terrain: String = ""
	if cell.has("terrain"):
		terrain = str(cell["terrain"])
	elif cell.has("type"):
		terrain = str(cell["type"])
	var elevation: int = int(cell.get("elevation", 0))

	var pos2: Vector2 = HexMath.pointy_top_center(q, r)
	var world := Vector3(pos2.x, HexMath.COLUMN_HEIGHT / 2.0, pos2.y) + center_offset
	world.y += float(elevation) * HexMath.COLUMN_HEIGHT

	var mi := MeshInstance3D.new()
	mi.mesh = _prism_mesh
	mi.position = world
	var mat := StandardMaterial3D.new()
	mat.albedo_color = _terrain_color(terrain)
	mat.roughness = 0.85
	mat.metallic = 0.1
	mat.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
	mi.material_override = mat
	add_child(mi)
	_tiles[Vector2i(q, r)] = mi

	# 柱顶平躺贴图（俯视可见）
	var ts := Sprite3D.new()
	ts.texture = _get_terrain_texture(terrain)
	ts.position = Vector3(world.x, world.y + TEX_LIFT, world.z)
	ts.rotation_degrees.x = -90.0
	ts.billboard = BaseMaterial3D.BILLBOARD_DISABLED
	var tw: float = float(ts.texture.get_width())
	ts.pixel_size = (HexMath.HEX_RADIUS * 2.0) / tw
	add_child(ts)


func _terrain_color(terrain: String) -> Color:
	match terrain:
		"space_void", "void", "lunar":
			return Color(0.18, 0.22, 0.35)
		"planet_surface", "surface":
			return Color(0.35, 0.30, 0.25)
		"debris", "fortress":
			return Color(0.30, 0.30, 0.33)
		"repair_station", "repair":
			return Color(0.20, 0.45, 0.45)
		"base_plain", "plain", "flat", "mothership", "spawn", "spawn_earth", "spawn_maxion":
			return Color(0.30, 0.45, 0.55)
		"coolant", "crystal":
			return Color(0.20, 0.50, 0.45)
		_:
			return Color(0.30, 0.45, 0.55)


func _get_terrain_texture(tkey: String) -> Texture2D:
	if _tex_cache.has(tkey):
		return _tex_cache[tkey]
	var path: String = TERRAIN_TEX_PATH.get(tkey, "")
	if path == "":
		path = TERRAIN_TEX_PATH["base_plain"]
	var tex: Texture2D = load(path) as Texture2D
	if tex == null:
		tex = load(TERRAIN_TEX_PATH["base_plain"]) as Texture2D
	_tex_cache[tkey] = tex
	return tex


func _clear_children() -> void:
	for c in get_children():
		c.queue_free()
	_tiles.clear()


# 选中格子着色：返回该格 MeshInstance3D（供 Battle3D 桥接层填色/描边）
func get_tile(q: int, r: int) -> MeshInstance3D:
	return _tiles.get(Vector2i(q, r), null)
