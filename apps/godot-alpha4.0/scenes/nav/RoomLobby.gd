extends Control

@onready var api = Api

@onready var room_list: ItemList = $VBox/ListPanel/RoomList
@onready var create_btn: Button = $VBox/BtnRow/CreateBtn
@onready var refresh_btn: Button = $VBox/BtnRow/RefreshBtn
@onready var join_btn: Button = $VBox/BtnRow/JoinBtn
@onready var code_edit: LineEdit = $VBox/CodeRow/CodeEdit
@onready var hint: Label = $VBox/Hint


func _ready():
	UITheme.apply_panel(self, 16, UITheme.c("panel"), UITheme.c("border"))
	UITheme.apply_panel($VBox/ListPanel, 10, UITheme.c("panel2"), UITheme.c("border"))
	UITheme.apply_label($VBox/Title, false, 26)
	for b in [create_btn, refresh_btn, join_btn]:
		UITheme.apply_button(b, 8)
	code_edit.add_theme_stylebox_override("normal", UITheme.panel(6, UITheme.c("panel2"), UITheme.c("border")))
	code_edit.add_theme_color_override("font_color", UITheme.c("text"))
	UITheme.apply_label(hint, true, 14)
	UITheme.apply_label($VBox/CodeRow/CodeLabel, true, 13)

	create_btn.pressed.connect(_on_create)
	refresh_btn.pressed.connect(_on_refresh)
	join_btn.pressed.connect(_on_join)
	room_list.item_activated.connect(_on_item_activated)

	_on_refresh()


func _on_refresh():
	hint.text = "加载房间列表…"
	api.list_rooms(_on_rooms_ok, _on_err)


func _on_rooms_ok(data):
	var rooms := []
	if data is Dictionary:
		rooms = data.get("rooms", [])
	elif data is Array:
		rooms = data
	room_list.clear()
	for r in rooms:
		if not (r is Dictionary):
			continue
		var label := "%s   [%s]  房号:%s   人数:%d/%d" % [
			r.get("name", "?"), r.get("status", ""), r.get("code", ""),
			int(r.get("players", []).size()), int(r.get("maxPlayers", 4))
		]
		room_list.add_item(label)
		room_list.set_item_metadata(room_list.item_count - 1, r.get("id", ""))
	hint.text = "房间数: %d" % rooms.size()


func _on_create():
	# 先选地图，再创建房间
	SceneManager.to_map_select()


func _on_join():
	var code := code_edit.text.strip_edges()
	if code.is_empty():
		# 尝试用选中的列表项
		var sel := room_list.get_selected_items()
		if sel.is_empty():
			hint.text = "请输入房号或选择房间"
			return
		var rid: String = room_list.get_item_metadata(sel[0])
		SceneManager.ctx["room_id"] = rid
		SceneManager.to_preparation()
		return
	api.get_room_by_code(code, _on_code_ok, _on_err)


func _on_code_ok(data: Dictionary):
	var room: Dictionary = data.get("room", data)
	var rid: String = str(room.get("id", ""))
	if rid.is_empty():
		hint.text = "未找到该房号"
		return
	SceneManager.ctx["room_id"] = rid
	SceneManager.to_preparation()


func _on_item_activated(_idx: int):
	_on_join()


func _on_err(msg: String, _code: int):
	hint.text = "错误: " + msg
