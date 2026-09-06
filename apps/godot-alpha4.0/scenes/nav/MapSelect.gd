extends Control

@onready var api = Api

@onready var map_list: ItemList = $VBox/ListPanel/MapList
@onready var name_edit: LineEdit = $VBox/NameRow/NameEdit
@onready var create_btn: Button = $VBox/BtnRow/CreateBtn
@onready var back_btn: Button = $VBox/BtnRow/BackBtn
@onready var hint: Label = $VBox/Hint

var _maps: Array = []


func _ready():
	UITheme.apply_panel(self, 16, UITheme.c("panel"), UITheme.c("border"))
	UITheme.apply_panel($VBox/ListPanel, 10, UITheme.c("panel2"), UITheme.c("border"))
	UITheme.apply_label($VBox/Title, false, 26)
	name_edit.add_theme_stylebox_override("normal", UITheme.panel(6, UITheme.c("panel2"), UITheme.c("border")))
	name_edit.add_theme_color_override("font_color", UITheme.c("text"))
	UITheme.apply_label($VBox/NameRow/NameLabel, true, 13)
	for b in [create_btn, back_btn]:
		UITheme.apply_button(b, 8)
	UITheme.apply_label(hint, true, 14)

	create_btn.pressed.connect(_on_create)
	back_btn.pressed.connect(_on_back)
	map_list.item_selected.connect(_on_select)

	_load_maps()


func _load_maps():
	hint.text = "加载地图列表…"
	api.list_maps(_on_maps_ok, _on_err)


func _on_maps_ok(data):
	_maps = []
	if data is Dictionary:
		_maps = data.get("maps", [])
	elif data is Array:
		_maps = data
	map_list.clear()
	for m in _maps:
		if not (m is Dictionary):
			continue
		map_list.add_item("%s  (%d 格)" % [m.get("name", m.get("id", "?")), int(m.get("terrainCount", 0))])
		map_list.set_item_metadata(map_list.item_count - 1, m.get("id", ""))
	if not _maps.is_empty() and name_edit.text.is_empty():
		name_edit.text = "对战房"
	hint.text = "地图数: %d · 选中后填写房间名并创建" % _maps.size()


func _on_select(idx: int):
	var mid: String = map_list.get_item_metadata(idx)
	hint.text = "已选地图 id=%s" % mid


func _on_create():
	var sel := map_list.get_selected_items()
	if sel.is_empty():
		hint.text = "请先选择一张地图"
		return
	var map_id: String = map_list.get_item_metadata(sel[0])
	var name := name_edit.text.strip_edges()
	if name.is_empty():
		name = "对战房"
	hint.text = "创建房间中…"
	api.create_room({"name": name, "mapId": map_id}, _on_create_ok, _on_err)


func _on_create_ok(data: Dictionary):
	var room: Dictionary = data.get("room", {})
	var rid: String = str(room.get("id", ""))
	if rid.is_empty():
		hint.text = "创建失败：未返回房间 ID"
		return
	SceneManager.ctx["room_id"] = rid
	SceneManager.ctx["map_id"] = str(room.get("mapId", ""))
	SceneManager.ctx["room_code"] = str(room.get("code", ""))
	hint.text = "房间已创建：%s，进入整备室" % room.get("code", "")
	# 关键：用 SceneManager 跳转（目标场景存在），避免 change_scene 失败导致退出
	SceneManager.to_preparation()


func _on_back():
	SceneManager.back()


func _on_err(msg: String, _code: int):
	hint.text = "错误: " + msg
