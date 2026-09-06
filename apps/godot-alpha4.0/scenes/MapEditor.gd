extends Control

# 地图编辑器（复刻 8081 /battlefield-edit）
# 画布 100×100 网格，左键刷地形，保存走 POST/PUT /api/map/battlefields。
# cells 以 {"q,r": terrainId} dict 提交（对齐后端 resolveCellsFromBody）。

const GRID := 100
const CELL := 8
# 地形调色板（terrainId -> 颜色/名称）
const TERRAIN := {
	0: {"name": "平原", "color": Color(0.55, 0.75, 0.45)},
	1: {"name": "森林", "color": Color(0.25, 0.5, 0.25)},
	2: {"name": "山地", "color": Color(0.6, 0.55, 0.4)},
	3: {"name": "水域", "color": Color(0.3, 0.55, 0.85)},
	4: {"name": "建筑", "color": Color(0.7, 0.6, 0.55)},
	5: {"name": "废墟", "color": Color(0.45, 0.4, 0.4)},
}

var canvas: Control
var status_label: Label
var name_input: LineEdit
var terrain_label: Label

var _cells := {}          # {"q,r": terrainId}
var _current_terrain := 0
var _edit_id := ""        # 编辑中的地图 id（空=新建）
var _painting := false

func _ready() -> void:
	_build_ui()
	_apply_theme()
	canvas.gui_input.connect(_on_canvas_input)
	canvas.draw.connect(_on_draw)
	_update_terrain_label()

func _build_ui() -> void:
	var v := VBoxContainer.new()
	v.name = "VBox"
	v.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(v)

	var title := Label.new()
	title.text = "🗺 地图编辑器"
	title.add_theme_font_size_override("font_size", 20)
	v.add_child(title)

	var top := HBoxContainer.new()
	top.name = "Top"
	top.add_theme_constant_override("separation", 8)
	var nlab := Label.new()
	nlab.text = "名称"
	top.add_child(nlab)
	var ninp := LineEdit.new()
	ninp.name = "NameInput"
	ninp.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	ninp.placeholder_text = "战场名称"
	top.add_child(ninp)
	var tlabel := Label.new()
	tlabel.name = "TerrainLabel"
	top.add_child(tlabel)
	top.add_child(_mk_btn("← 返回首页", _on_back))
	v.add_child(top)

	# 地形选择栏
	var tbar := HBoxContainer.new()
	tbar.add_theme_constant_override("separation", 6)
	for tid in TERRAIN.keys():
		tbar.add_child(_mk_btn(TERRAIN[tid].name, _on_pick_terrain.bind(tid)))
	v.add_child(tbar)

	var area := HBoxContainer.new()
	area.name = "EditArea"
	area.size_flags_vertical = Control.SIZE_EXPAND_FILL
	area.add_theme_constant_override("separation", 10)
	v.add_child(area)

	var cv := Control.new()
	cv.name = "Canvas"
	cv.custom_minimum_size = Vector2(GRID * CELL, GRID * CELL)
	cv.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	cv.size_flags_vertical = Control.SIZE_EXPAND_FILL
	cv.mouse_filter = Control.MOUSE_FILTER_STOP
	area.add_child(cv)
	UITheme.apply_panel(cv, 2, Color(0, 0, 0, 0), UITheme.c("border"))

	var rbar := VBoxContainer.new()
	rbar.custom_minimum_size = Vector2(160, 0)
	area.add_child(rbar)
	rbar.add_child(_mk_btn("💾 保存", _on_save))
	rbar.add_child(_mk_btn("🗑 清空", _on_clear))
	rbar.add_child(_mk_btn("📋 我的投稿", _on_my))

	var slabel := Label.new()
	slabel.name = "StatusLabel"
	slabel.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	v.add_child(slabel)

	canvas = cv
	status_label = slabel
	name_input = $VBox/Top/NameInput
	terrain_label = $VBox/Top/TerrainLabel

func _apply_theme() -> void:
	UITheme.apply_panel(self, 16, UITheme.c("panel"), UITheme.c("border"))
	UITheme.apply_label(status_label, true, 13)
	_update_terrain_label()

func _update_terrain_label() -> void:
	terrain_label.text = "当前地形：%s" % TERRAIN[_current_terrain].name

func _on_pick_terrain(tid: int) -> void:
	_current_terrain = tid
	_update_terrain_label()

func _on_canvas_input(ev: InputEvent) -> void:
	if ev is InputEventMouseButton:
		if ev.button_index == MOUSE_BUTTON_LEFT:
			_painting = ev.pressed
			if ev.pressed:
				_paint_at(ev.position)
	elif ev is InputEventMouseMotion and _painting:
		_paint_at(ev.position)

func _paint_at(pos: Vector2) -> void:
	var q := int(pos.x / CELL)
	var r := int(pos.y / CELL)
	if q < 0 or q >= GRID or r < 0 or r >= GRID:
		return
	_cells["%d,%d" % [q, r]] = _current_terrain
	canvas.queue_redraw()

func _on_draw() -> void:
	for key in _cells.keys():
		var parts := key.split(",")
		var q := int(parts[0])
		var r := int(parts[1])
		var tid := _cells[key]
		var col: Color = TERRAIN.get(tid, TERRAIN[0]).color
		canvas.draw_rect(Rect2(q * CELL, r * CELL, CELL, CELL), col, true)
	# 网格线
	for i in range(GRID + 1):
		canvas.draw_line(Vector2(i * CELL, 0), Vector2(i * CELL, GRID * CELL), Color(0.2, 0.2, 0.2, 0.4))
		canvas.draw_line(Vector2(0, i * CELL), Vector2(GRID * CELL, i * CELL), Color(0.2, 0.2, 0.2, 0.4))

func _on_save() -> void:
	var nm := name_input.text.strip_edges()
	if nm == "":
		status_label.text = "❌ 请填写战场名称"
		return
	var payload := {
		"name": nm,
		"cells": _cells,
		"spawn_points": [],
		"attributes": {},
		"is_public": false,
	}
	status_label.text = "保存中…"
	if _edit_id == "":
		Api.create_battlefield(payload, _on_saved, _on_err.bind("保存失败"))
	else:
		Api.update_battlefield(_edit_id, payload, _on_saved, _on_err.bind("更新失败"))

func _on_saved(d: Dictionary) -> void:
	if _edit_id == "" and d.has("id"):
		_edit_id = str(d["id"])
	status_label.text = "✅ 已保存（id=%s）" % _edit_id

func _on_clear() -> void:
	_cells.clear()
	canvas.queue_redraw()

func _on_my() -> void:
	SceneManager.to_scene("res://scenes/MySubmissions.gd")

func _on_back() -> void:
	SceneManager.to_home()

func _mk_btn(text: String, cb: Callable) -> Button:
	var b := Button.new()
	b.text = text
	b.connect("pressed", cb)
	return b

func _on_err(msg: String, _c: int, _b: String) -> void:
	status_label.text = "❌ %s" % msg
