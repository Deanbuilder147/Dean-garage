extends Control

@onready var api = Api

@onready var info: Label = $VBox/Info
@onready var start_btn: Button = $VBox/BtnRow/StartBtn
@onready var refresh_btn: Button = $VBox/BtnRow/RefreshBtn
@onready var back_btn: Button = $VBox/BtnRow/BackBtn
@onready var hint: Label = $VBox/Hint


func _ready():
	UITheme.apply_panel(self, 16, UITheme.c("panel"), UITheme.c("border"))
	UITheme.apply_label($VBox/Title, false, 26)
	UITheme.apply_label(info, false, 16)
	for b in [start_btn, refresh_btn, back_btn]:
		UITheme.apply_button(b, 8)
	UITheme.apply_label(hint, true, 14)

	start_btn.pressed.connect(_on_start)
	refresh_btn.pressed.connect(_refresh)
	back_btn.pressed.connect(_on_back)

	_refresh()


func _room_id() -> String:
	return str(SceneManager.get_ctx("room_id", ""))


func _refresh():
	var rid := _room_id()
	if rid.is_empty():
		hint.text = "未带房间 ID，请先创建/加入房间"
		return
	hint.text = "加载房间…"
	api.get_room(rid, _on_room_ok, _on_err)


func _on_room_ok(data: Dictionary):
	var room: Dictionary = data.get("room", data)
	var code: String = str(room.get("code", SceneManager.get_ctx("room_code", "")))
	var name: String = str(room.get("name", "?"))
	var map_id: String = str(room.get("mapId", SceneManager.get_ctx("map_id", "")))
	var players = room.get("players", [])
	info.text = "房间：%s\n房号：%s\n地图：%s\n成员：%d" % [name, code, map_id, int(players.size())]
	hint.text = "已就绪，点击「开始战斗」进入 3D 战场"


func _on_start():
	var rid := _room_id()
	if rid.is_empty():
		hint.text = "房间 ID 缺失"
		return
	hint.text = "开战中…"
	# GM/房主开战；返回 {success, battleId}
	api.start_room(rid, _on_start_ok, _on_err)


func _on_start_ok(data: Dictionary):
	var bid: String = str(data.get("battleId", data.get("battle_id", "")))
	if bid.is_empty():
		hint.text = "开战失败：未返回 battleId"
		return
	SceneManager.ctx["battle_id"] = bid
	SceneManager.to_battle3d()


func _on_back():
	SceneManager.back()


func _on_err(msg: String, _code: int):
	hint.text = "错误: " + msg
