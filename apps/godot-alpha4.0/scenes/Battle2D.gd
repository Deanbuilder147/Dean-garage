# ============================================================
# scenes/Battle2D.gd
# 战斗场景驱动脚本（alpha4.0 2D 遗留版，待挪入地图编辑器）
#
# 责任：
#   - 启动后自动登录 deantest 账号（验证用），拉取战局态
#   - 订阅原生 WS 实时帧（comm-service /ws-native）
#   - 处理棋盘点击：选中己方单位 → 高亮移动范围 → 点目标格发起 move
#   - 收到 move 回包 / WS 推送后重绘棋盘
#
# 宪法红线：本脚本是「逻辑/通信层」，HexBoard 仍是渲染终点。
#   所有状态经 set_battle_state / set_selection push 给 HexBoard。
# ============================================================
extends Node2D

@onready var api: Node = $ApiClient
@onready var board: Node2D = $HexBoard
@onready var status_label: Label = $StatusLabel
@onready var cam: Camera2D = $Camera2D

var _ws: RefCounted = null           # WsClient 实例
var _battle_id: String = ""          # 当前战局
var _my_unit_ids: Array = []         # 我方单位 id 列表（用于交互权限）
var _current_user: Dictionary = {}

# 交互态
var _selected_unit: Dictionary = {}  # 选中单位 {id, q, r}
var _awaiting_move_target: bool = false
# ── 拖拽平移状态 ──
var _dragging: bool = false
var _drag_start: Vector2 = Vector2.ZERO
var _drag_offset_start: Vector2 = Vector2.ZERO

const TEST_USER := "deantest"
const TEST_PASS := "7654321"


func _ready():
	# 居中棋盘到视口（set_battle_state 内部会 _auto_center 覆盖此值）
	board.board_offset = Vector2(640, 360)
	status_label.text = "登录中…"
	api.login(TEST_USER, TEST_PASS, _on_login_ok, _on_login_err)


func _process(_delta: float):
	if _ws != null:
		_ws.poll()
		# 连接建立后补发订阅
		if _ws.has_method("flush_subscribe"):
			_ws.flush_subscribe()


# ---------------- 登录 / 拉战局 ----------------
func _on_login_ok(data: Dictionary):
	_current_user = data.get("user", {})
	var token: String = str(api.call("get_token"))
	print("[Battle] 登录成功 user=", _current_user.get("username", "?"), " token_len=", token.length())
	# 拉房间列表 → 取第一个有战局的房间（demo 用）
	api.list_rooms(_on_rooms_ok, _on_http_err)


func _on_login_err(msg: String, _code: int):
	status_label.text = "登录失败: " + msg


func _on_rooms_ok(data):
	var rooms = []
	if data is Dictionary:
		rooms = data.get("rooms", [])
	elif data is Array:
		rooms = data
	if rooms.is_empty():
		# 无房间 → 自动构造演示战局（创建 + 部署两单位 + 结束部署）
		_ensure_demo_battle()
		return
	# 取第一个房间，拉其战局态
	var room: Dictionary = rooms[0]
	var rid: String = str(room.get("id", room.get("roomId", "")))
	print("[Battle] 取房间 rid=", rid, " 房间数=", rooms.size())
	status_label.text = "加载战局…"
	api.get_battle_state(rid, _on_battle_ok, _on_http_err)
	# 注意：get_battle_state 用 room id 可能不直接是 battle id；
	# 若后端要求 battle id，需从 room.startedBattleId 取（demo 容错）


func _on_http_err(msg: String, _code: int):
	status_label.text = "请求错误: " + msg


# ---------------- 演示战局自动构造（rooms 为空时） ----------------
# 真实后端契约：
#   1. POST /combat {battlefield_id} → {battle:{id}}
#   2. POST /combat/{id}/deploy-unit {unitId,q,r,unit_data} ×2
#   3. POST /combat/{id}/end-deployment {} → phase=COMBAT
#   4. GET /combat/{id}/state → 拉取并订阅 WS
const DEMO_MAP_ID := "migrated-map-10-bb467942"  # 600 格完整网格地图
const DEMO_U1 := {
	"id": "u1", "name": "Alpha", "faction": "earth", "matrixId": "m1",
	"position": {"q": 15, "r": 20},
	"stats": {"attack": 10, "defense": 10, "mobility": 5, "hp": 100},
	"skills": [], "size": "M"
}
const DEMO_U2 := {
	"id": "u2", "name": "Beta", "faction": "maxion", "matrixId": "m2",
	"position": {"q": 25, "r": 25},
	"stats": {"attack": 10, "defense": 10, "mobility": 5, "hp": 100},
	"skills": [], "size": "M"
}

func _ensure_demo_battle():
	status_label.text = "构造演示战局…"
	api.create_battle(DEMO_MAP_ID, _on_create_ok, _on_http_err)

func _on_create_ok(data: Dictionary):
	var battle: Dictionary = data.get("battle", data)
	_battle_id = str(battle.get("id", ""))
	if _battle_id.is_empty():
		status_label.text = "演示战局创建失败"
		return
	print("[Battle] 演示战局已创建 battle_id=", _battle_id)
	# 部署两单位（坐标须落在地图 cells 范围内）
	api.post_battle_action(_battle_id, "deploy-unit", {
		"unitId": "u1", "q": DEMO_U1.position.q, "r": DEMO_U1.position.r, "unit_data": DEMO_U1
	}, _on_deploy1_ok, _on_http_err)
	api.post_battle_action(_battle_id, "deploy-unit", {
		"unitId": "u2", "q": DEMO_U2.position.q, "r": DEMO_U2.position.r, "unit_data": DEMO_U2
	}, _on_deploy2_ok, _on_http_err)

func _on_deploy1_ok(_data: Dictionary):
	print("[Battle] u1 部署完成")

func _on_deploy2_ok(_data: Dictionary):
	print("[Battle] u2 部署完成，结束部署阶段")
	api.post_battle_action(_battle_id, "end-deployment", {}, _on_enddeploy_ok, _on_http_err)

func _on_enddeploy_ok(data: Dictionary):
	print("[Battle] 结束部署 phase=", data.get("phase", "?"))
	api.get_battle_state(_battle_id, _on_battle_ok, _on_http_err)


func _on_battle_ok(data: Dictionary):
	# 兼容 {battle:{...}} 或直接战场对象
	var state: Dictionary = data
	if data.has("battle"):
		state = data["battle"]
	if state.is_empty():
		status_label.text = "战局态为空"
		return
	_battle_id = str(state.get("id", state.get("battleId", _battle_id)))
	board.call("set_battle_state", state)
	print("[Battle] 战局加载成功 battle_id=", _battle_id, " 单位数=", state.get("units", []).size())
	status_label.text = "已连接 · 单位数: %d" % state.get("units", []).size()
	_setup_my_units(state)
	_connect_ws(state)


# ---------------- 原生 WS ----------------
func _connect_ws(_state: Dictionary):
	if _battle_id.is_empty():
		return
	var token: String = str(api.call("get_token"))
	_ws = load("res://net/ws_client.gd").new()
	_ws.battle_state_received.connect(_on_ws_battle_state)
	_ws.subscribed.connect(_on_ws_subscribed)
	_ws.connection_error.connect(_on_ws_error)
	_ws.connect_and_subscribe(_battle_id, token)
	print("[Battle] WS 连接中 battle_id=", _battle_id)
	status_label.text += " · WS订阅中"


func _on_ws_subscribed(battle_id: String):
	print("[Battle] WS 已订阅 battle=", battle_id)
	status_label.text = "WS已订阅 battle=%s" % battle_id


func _on_ws_battle_state(battle_id: String, battle_state: Dictionary):
	print("[Battle] 收到 WS 推送 battle=", battle_id, " 单位数=", battle_state.get("units", []).size())
	if battle_id != _battle_id:
		return
	board.call("set_battle_state", battle_state)
	_refresh_my_units(battle_state)
	# 若正在等待移动结果，收到新态后清除选中
	if _awaiting_move_target:
		_clear_selection()


func _on_ws_error(msg: String):
	status_label.text = "WS错误: " + msg


# ---------------- 交互：选中 / 移动 ----------------
func _setup_my_units(state: Dictionary):
	_my_unit_ids.clear()
	var units = state.get("units", {})
	var unit_list: Array = units.values() if units is Dictionary else units
	var my_id: String = str(_current_user.get("id", ""))
	for u in unit_list:
		if not (u is Dictionary):
			continue
		if str(u.get("ownerId", u.get("playerId", ""))) == my_id or u.get("isMine", false):
			_my_unit_ids.append(str(u.get("id", "")))
	# demo 容错：若无法按 owner 区分，把所有 earth 单位视为己方可控
	if _my_unit_ids.is_empty():
		for u in unit_list:
			if not (u is Dictionary):
				continue
			if str(u.get("faction", "")) == "earth":
				_my_unit_ids.append(str(u.get("id", "")))


func _refresh_my_units(state: Dictionary):
	_setup_my_units(state)


# 找单位所在格
func _find_unit_at(q: int, r: int) -> Dictionary:
	var units = board.battle_state.get("units", {})
	# 后端 units 可能为 dict（{id: unit}）或 array；统一取 values
	var unit_list: Array = units.values() if units is Dictionary else units
	for u in unit_list:
		if not (u is Dictionary):
			continue
		var p: Dictionary = u.get("position", {})
		if int(p.get("q", -999)) == q and int(p.get("r", -999)) == r:
			return u
	return {}


func _input(event):
	# ── 拖拽平移：右键按住拖动 ──
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_RIGHT:
		if event.pressed:
			_dragging = true
			_drag_start = cam.get_global_mouse_position()
			_drag_offset_start = board.board_offset
		else:
			_dragging = false
		return
	if event is InputEventMouseMotion and _dragging:
		var cur: Vector2 = cam.get_global_mouse_position()
		board.board_offset = _drag_offset_start + (cur - _drag_start)
		board.queue_redraw()
		return
	# ── 滚轮缩放 ──
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_WHEEL_UP:
		board.zoom = min(board.zoom * 1.12, 3.0)
		board.queue_redraw()
		return
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
		board.zoom = max(board.zoom / 1.12, 0.3)
		board.queue_redraw()
		return
	# ── 键盘缩放（滚轮不可用时的后备）：=/- 或 +/_ ──
	if event is InputEventKey and event.pressed:
		if event.keycode == KEY_EQUAL or event.keycode == KEY_KP_ADD:
			board.zoom = min(board.zoom * 1.12, 3.0)
			board.queue_redraw()
			return
		if event.keycode == KEY_MINUS or event.keycode == KEY_KP_SUBTRACT:
			board.zoom = max(board.zoom / 1.12, 0.3)
			board.queue_redraw()
			return
		# I 键：切换 2.5D 等距装饰层（默认关闭，方便对比）
		if event.keycode == KEY_I:
			board.iso_enabled = not board.iso_enabled
			board._centered_once = false   # 重新 fit 居中（投影变了）
			board.queue_redraw()
			status_label.text = "2.5D等距: " + ("开" if board.iso_enabled else "关")
			return
		# F3 键：切换到真 3D 战斗场景（与 Battle3D.tscn 双向切换，互不影响）
		if event.keycode == KEY_F3:
			get_tree().change_scene_to_file("res://scenes/Battle3D.tscn")
			return

	# ── 左键：选中/移动（原有逻辑）──
	if not (event is InputEventMouseButton):
		return
	if not event.pressed:
		return
	if event.button_index != MOUSE_BUTTON_LEFT:
		return
	if board.battle_state.is_empty():
		return
	var mp: Vector2 = cam.get_global_mouse_position()
	var cell: Dictionary = board.call("screen_to_hex", mp)
	var clicked_unit: Dictionary = _find_unit_at(int(cell["q"]), int(cell["r"]))

	# 已选中单位且点空白/目标格 → 尝试移动
	if _awaiting_move_target:
		if not clicked_unit.is_empty() and str(clicked_unit.get("id","")) == str(_selected_unit.get("id","")):
			# 点自己：取消选中
			_clear_selection()
			return
		_try_move(int(cell["q"]), int(cell["r"]))
		return

	# 未选中：点己方单位 → 选中并高亮移动范围
	if not clicked_unit.is_empty() and _my_unit_ids.has(str(clicked_unit.get("id",""))):
		_select_unit(clicked_unit)
	else:
		_clear_selection()


func _select_unit(unit: Dictionary):
	_selected_unit = unit
	_awaiting_move_target = true
	var pos: Dictionary = unit.get("position", {})
	var sq: int = int(pos.get("q", 0))
	var sr: int = int(pos.get("r", 0))
	# 移动范围：复用 HexMath 枚举（半径默认 3，可按 unit.moveRange 调整）
	var move_range: int = int(unit.get("moveRange", 3))
	if move_range <= 0:
		move_range = 3
	var movable: Array = HexMath.get_hexes_in_range(sq, sr, move_range)
	# 过滤掉被占用的格（可选：保留以便后端校验）
	var occupied = {}
	var _us = board.battle_state.get("units", {})
	var _ulist: Array = _us.values() if _us is Dictionary else _us
	for u in _ulist:
		if not (u is Dictionary):
			continue
		var p: Dictionary = u.get("position", {})
		occupied[HexMath.get_hex_key(int(p.get("q",0)), int(p.get("r",0)))] = true
	var filtered := []
	for c in movable:
		if not occupied.has(HexMath.get_hex_key(int(c["q"]), int(c["r"]))):
			filtered.append(c)
	board.call("set_selection", str(unit.get("id","")), filtered, [])
	status_label.text = "已选单位 %s · 点目标格移动" % str(unit.get("name", unit.get("id","")))


func _clear_selection():
	_selected_unit = {}
	_awaiting_move_target = false
	board.call("set_selection", "", [], [])
	status_label.text = "已取消选中"


func _try_move(tq: int, tr: int):
	if _selected_unit.is_empty() or _battle_id.is_empty():
		return
	var uid: String = str(_selected_unit.get("id", ""))
	status_label.text = "移动中…"
	_awaiting_move_target = true  # 保持，待 WS 推送清除
	print("[Battle] 发送 move unit=", uid, " -> (", tq, ",", tr, ")")
	# 后端 /move 真实契约：unitId + target_q + target_r
	api.post_battle_action(_battle_id, "move", {
		"unitId": uid,
		"target_q": tq,
		"target_r": tr
	}, _on_move_ok, _on_move_err)


func _on_move_ok(_data: Dictionary):
	status_label.text = "移动指令已发送，等待服务端同步…"
	# 实际重绘由 WS 推送触发；此处不清选中


func _on_move_err(msg: String, _code: int):
	status_label.text = "移动失败: " + msg
	_awaiting_move_target = false
