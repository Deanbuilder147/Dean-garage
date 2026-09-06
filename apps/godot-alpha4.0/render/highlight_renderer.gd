# ============================================================
# render/highlight_renderer.gd
# 高亮层渲染（移动范围 / 技能射程 / AOE 预览）。
#
# 【阶段 2·AOE 固化】单一高亮渲染出口，纯本地坐标（不感知居中偏移）。
# 宪法红线 §2：坐标走 HexMath.pointy_top_center，禁止内联副本。
# 宪法红线 §1：单向数据管道终点，仅消费调用方传入的 cells/color/y_level。
#
# 用法：调用方持有一个 Node3D layer（已通过 position 设好居中偏移），
#       调 draw_cells / draw_aoe 等把薄圆柱高亮牌加进该 layer。
# ============================================================
class_name HighlightRenderer
extends RefCounted

const CELL_RADIUS := HexMath.HEX_RADIUS


# 单层高亮牌（薄圆柱，六边=尖顶六角格外形）
func make_tile(color: Color, pos: Vector3, height: float = 0.4, alpha: float = 0.45) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	var m := CylinderMesh.new()
	m.top_radius = CELL_RADIUS * 0.92
	m.bottom_radius = CELL_RADIUS * 0.92
	m.height = height
	m.radial_segments = 6
	m.rings = 1
	mi.mesh = m
	mi.position = pos
	var mat := StandardMaterial3D.new()
	mat.albedo_color = color
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.albedo_color.a = alpha
	mat.emission = color
	mat.emission_enabled = true
	mat.emission_energy_multiplier = 0.4
	mat.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
	mi.material_override = mat
	return mi


# 通用绘制：清空 layer 后用 cells 重建高亮
# cells: Array[{"q","r"}]; layer: Node3D（其 position 已是居中偏移）;
# y_level: 高亮牌所在世界 Y（相对 layer 本地坐标）; color / height / alpha 可调。
func draw_cells(cells: Array, layer: Node3D, y_level: float, color: Color, height: float = 0.4, alpha: float = 0.45) -> void:
	for c in layer.get_children():
		c.queue_free()
	for cell in cells:
		var q: int = int(cell.get("q", 0))
		var r: int = int(cell.get("r", 0))
		var pos2: Vector2 = HexMath.pointy_top_center(q, r)
		var world := Vector3(pos2.x, y_level, pos2.y)
		layer.add_child(make_tile(color, world, height, alpha))


# AOE 受击范围预览（暗红，叠在最上层）
func draw_aoe(cells: Array, layer: Node3D, y_level: float) -> void:
	draw_cells(cells, layer, y_level, Color(0.8, 0.15, 0.1), 0.4, 0.5)


# 移动范围高亮（青绿）
func draw_move(cells: Array, layer: Node3D, y_level: float) -> void:
	draw_cells(cells, layer, y_level, Color(0.2, 0.8, 0.4), 0.4, 0.4)


# 技能合法目标高亮（琥珀）
func draw_skill(cells: Array, layer: Node3D, y_level: float) -> void:
	draw_cells(cells, layer, y_level, Color(1.0, 0.85, 0.2), 0.4, 0.45)
