# ============================================================
# scenes/Battle3D.gd
# 战斗场景驱动脚本（真 3D 等距视角版，alpha4.0）
#
# 与现有 2D Battle2D.gd / HexBoard 完全独立并存：
#   - 同样消费 battle_state（cells / units），坐标真相源仍是
#     pointyTopCenter（Even-R offset）的纯 2D 平面 (x,y)，
#     但在此处映射为 3D 世界：worldX = planeX，worldZ = planeY，
#     Y 轴作为「高度」抬升地形/单位，得到真正的 2.5D 立体效果。
#   - 地形用六棱柱 MeshInstance3D（CylinderMesh，6 边=六边形），
#     单位用 Sprite3D（始终面向相机，billboard）。
#   - 用 Camera3D 摆成等距机位（正交投影最稳，无透视畸变）。
#
# 切换方式：在主菜单/2D 页按【F3】或调用切换，本场景不依赖 2D 页。
# ============================================================
extends Node3D

@onready var api = Api
@onready var status_label: Label = $UILayer/StatusLabel
@onready var turn_hud: Control = $UILayer/TurnHUD
@onready var round_label: Label = $UILayer/TurnHUD/RoundLabel
@onready var turn_label: Label = $UILayer/TurnHUD/TurnLabel
@onready var turn_hint: Label = $UILayer/TurnHUD/TurnHint
@onready var end_turn_btn: Button = $UILayer/EndTurnButton
@onready var glossary_btn: Button = $UILayer/GlossaryButton
@onready var cam: Camera3D = $Camera3D

# ---- 轨道相机状态（围绕地图中心旋转/缩放） ----
var _cam_target := Vector3.ZERO      # 看向的中心点（地图平面中心）
var _cam_distance := 1400.0          # 正交相机距离（世界单位，决定 size 基准）
var _cam_yaw := deg_to_rad(90.0)     # 水平角（原30°+左旋60°=90°：相机从地图右侧正交方向看去）
var _cam_pitch := deg_to_rad(55.0)   # 俯仰角（等距感）
var _cam_zoom := 1.0                 # 缩放系数（影响正交 size）
const CAM_MIN_DIST := 200.0
const CAM_MAX_DIST := 12000.0
var _camera_initialized: bool = false   # 是否已做过首次取景（之后不再重置用户视角）
# 缩放步进：滚轮每 tick 距离变化比例（>1 拉远，<1 推近）
const ZOOM_WHEEL_STEP := 1.1           # 每次滚轮 ±10% 距离
# 触控板捏合增益：factor 偏离 1.0 的放大倍数
const ZOOM_MAGIFY_GAIN := 1.8

# 拖拽交互态
var _dragging_rot: bool = false
var _dragging_pan: bool = false
var _drag_last: Vector2 = Vector2.ZERO
const PAN_SPEED := 4.0

# ── 触屏（多点触控）交互态 ──
# index -> 当前屏幕坐标，用于跟踪在屏手指
var _touch_points: Dictionary = {}
# 双指上一帧：两指中点、两指间距（用于平移/捏合缩放）
var _touch_last_mid: Vector2 = Vector2.ZERO
var _touch_last_dist: float = 0.0
# 单指：起始坐标 + 是否发生过明显移动（用于区分"拖拽旋转"与"点按选中"）
var _touch_start: Vector2 = Vector2.ZERO
var _touch_moved: bool = false
const TAP_SLOP := 8.0          # 像素阈值，超过算拖拽
const PINCH_ZOOM_RATE := 0.0025 # 捏合缩放灵敏度（每像素间距变化的比例）

# ---- 几何常量（坐标数学唯一真相源 = HexMath，禁止在此重写副本） ----
# 渲染层只负责标量常量；平面坐标一律调 HexMath.pointy_top_center / pixel_to_hex。
# 立体参数（真相源 = HexMath，禁止本地重写副本）
const TILE_THICKNESS := HexMath.TILE_THICKNESS
const COLUMN_HEIGHT := HexMath.COLUMN_HEIGHT
const UNIT_Y := HexMath.UNIT_FLOAT_Y   # 单位浮在柱子上方

# 坐标平面映射别名（转发真相源，禁止在此内联实现）
const HEX_RADIUS := HexMath.HEX_RADIUS   # 仅作向后兼容引用，值=32（真相源）

# ---- 注入的战斗状态（只读副本） ----
var battle_state: Dictionary = {}

# 交互态
var _battle_id: String = ""
var _selected_unit: Dictionary = {}
var _awaiting_move_target: bool = false
var _my_unit_ids: Array = []
var _current_user: Dictionary = {}
var _ws: RefCounted = null

# ── 阶段4 技能系统交互态 ──
var _selected_skills: Array = []        # 当前选中单位的技能列表
var _targeting_skill: Dictionary = {}   # 正在选择目标的技能（空=未进入目标选择）
var _skill_target_cells: Array = []     # 合法目标格 [{q,r,unit}]（含 unit=null 表示空格）
# ★ Phase 7.2：施法位移动效上下文（在 _cast_skill_at 记录，_on_skill_ok 消费）
var _cast_attacker_id: String = ""
var _cast_from_pos: Vector3 = Vector3.ZERO
var _cast_to_pos: Vector3 = Vector3.ZERO
var _cast_is_ranged: bool = true

# Phase 5.0 轻量状态机（自研 FSM，唯一交互态真相源）；_targeting_skill 仅存技能数据，状态判定改由 FSM 承担
var battle_sm: BattleStateMachine = BattleStateMachine.new()
@onready var skill_menu: Control = $UILayer/SkillMenu
@onready var skill_list: VBoxContainer = $UILayer/SkillMenu/SkillList

# 场景内的 Mesh/Sprite 容器引用（用于重绘时清理）
var _board_root: Node3D
var _board := BoardRenderer.new()   # 阶段 3·真实棋盘渲染器（收口 _rebuild_board 内联实现）
var _unit_root: Node3D
# 技能目标高亮容器（独立根，重绘棋盘时不清理）
var _skill_hl_root: Node3D
# 移动范围高亮容器（独立根，3D 青色圆盘）
var _move_hl_root: Node3D
# AOE 受击范围预览容器（暗红层，置于技能高亮之上，Hover 目标格时实时计算）
var _aoe_hl_root: Node3D

# 阶段 2·单一高亮渲染出口（纯本地坐标，layer.position 已含居中偏移）
var _hl := HighlightRenderer.new()
# 高亮层级（相对 layer 本地 Y）：移动 < 技能 < AOE，避免视觉重叠
const HL_Y_MOVE := 6.0
const HL_Y_SKILL := 7.0
const HL_Y_AOE := 8.0

# 阶段 4·单位渲染收口到 UnitRenderer（单一渲染出口）；居中偏移由 _unit_root.position 承担
var _unit_renderer := UnitRenderer.new()
# Phase 6：敌方回合指示层（呼吸提示控件，由 tscn 提供）
@onready var _enemy_banner: Control = $UILayer/EnemyTurnBanner
@onready var _banner_label: Label = $UILayer/EnemyTurnBanner/BannerLabel
# Phase 7.1：单位详情面板（选中单位 stats/技能/状态，由 tscn 提供）
@onready var _unit_panel: PanelContainer = $UILayer/UnitPanel
@onready var _unit_title: Label = $UILayer/UnitPanel/UnitVBox/UnitTitle
@onready var _unit_stats: Label = $UILayer/UnitPanel/UnitVBox/UnitStats
@onready var _unit_skills: Label = $UILayer/UnitPanel/UnitVBox/UnitSkills
# Phase 7.1：右侧正式战斗日志面板（由 tscn 提供 LogPanel 容器，日志 RichTextLabel 动态挂入）
@onready var _log_panel: PanelContainer = $UILayer/LogPanel
@onready var _log_box: VBoxContainer = $UILayer/LogPanel/LogVBox
# Phase 8：战斗日志（反击链/三路分流/reaction_log 文本流，动态创建挂 LogPanel）
var _battle_log: RichTextLabel = null
var _battle_log_lines: Array = []
const BATTLE_LOG_MAX := 12

const TEST_USER := "deantest"
const TEST_PASS := "7654321"

# Phase 6：上一帧单位快照（unitId -> {q,r,hp}），供敌方移动补间与受击飘字比对
var _prev_units: Dictionary = {}
# Phase 6：已消费的 aiActions 索引（避免多次全量快照重复播飘字）；服务端每 AI 回合会清空重建数组
var _ai_actions_consumed: int = 0
# Phase 6：敌方呼吸提示的无限循环 Tween 引用，隐藏时 kill 避免与新 tween 抢 alpha
var _enemy_breathe_tween: Tween = null


func _ready():
	status_label.text = "3D视角 · 登录中…"
	_board = BoardRenderer.new(); _board.name = "BoardRoot"; _board_root = _board
	_unit_root = Node3D.new(); _unit_root.name = "UnitRoot"
	_unit_renderer.name = "UnitRenderer"; _unit_root.add_child(_unit_renderer)
	_skill_hl_root = Node3D.new(); _skill_hl_root.name = "SkillHLRoot"
	add_child(_board_root)
	add_child(_unit_root)
	add_child(_skill_hl_root)
	_move_hl_root = Node3D.new(); _move_hl_root.name = "MoveHLRoot"
	add_child(_move_hl_root)
	_aoe_hl_root = Node3D.new(); _aoe_hl_root.name = "AoeHLRoot"
	add_child(_aoe_hl_root)
	# Phase 5.0：实例化轻量状态机（纯逻辑 Node，作为交互态唯一真相源）
	battle_sm.name = "BattleStateMachine"
	add_child(battle_sm)
	battle_sm.state_changed.connect(_on_bsm_changed)
	# 确保相机是当前相机（编辑器播放模式下尤为重要）
	cam.make_current()
	# 确保 UI 层不拦截鼠标/滚轮事件
	status_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	turn_hud.mouse_filter = Control.MOUSE_FILTER_IGNORE
	round_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	turn_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	turn_hint.mouse_filter = Control.MOUSE_FILTER_IGNORE
	# Phase 6：敌方回合指示层初始化（默认隐藏 + 鼠标穿透 + 呼吸脉动）
	_enemy_banner.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_banner_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_enemy_banner.visible = false
	_banner_label.modulate = Color(1, 1, 1, 1)
	# ── 套用统一 UI 主题（脱离 prototype 裸控件态） ──
	UITheme.apply_panel(turn_hud)
	UITheme.apply_label(round_label, false, 20)
	UITheme.apply_label(turn_label, false, 20)
	UITheme.apply_label(turn_hint, true, 14)
	UITheme.apply_label(status_label, true, 14)
	UITheme.apply_button(end_turn_btn)
	UITheme.apply_button(glossary_btn)
	glossary_btn.pressed.connect(_on_open_glossary)
	var unit_studio_btn := Button.new()
	unit_studio_btn.text = "🔧 机体库"
	unit_studio_btn.position = Vector2(16, 150)
	$UILayer.add_child(unit_studio_btn)
	UITheme.apply_button(unit_studio_btn)
	unit_studio_btn.pressed.connect(_on_open_unit_studio)
	UITheme.apply_panel(_enemy_banner)
	UITheme.apply_label(_banner_label, false, 22)
	UITheme.apply_panel(skill_menu, 12, UITheme.c("panel2"), UITheme.c("accent2"))
	UITheme.apply_button(end_turn_btn, 8)
	end_turn_btn.pressed.connect(_on_end_turn_pressed)
	_update_camera()
	status_label.text = "3D · 滚轮缩放 / WASD移动 / 右键旋转"
	# 阶段 3·单向消费 EventBus：战斗状态仅经 EventBus 入口，禁止 WS 直连绕过
	EventBus.battle_state_updated.connect(_on_eventbus_battle_state)
	# Phase 7.1：单位详情面板 + 日志面板套主题（之前动态创建日志挂入 LogPanel）
	UITheme.apply_panel(_unit_panel, 12, UITheme.c("panel2"), UITheme.c("accent2"))
	UITheme.apply_label(_unit_title, false, 18)
	UITheme.apply_label(_unit_stats, true, 14)
	UITheme.apply_label(_unit_skills, true, 14)
	UITheme.apply_panel(_log_panel, 12, UITheme.c("panel2"), UITheme.c("accent2"))
	UITheme.apply_label($UILayer/LogPanel/LogVBox/LogTitle, false, 18)
	_unit_panel.visible = false
	_log_panel.visible = true
	# Phase 8：动态创建战斗日志 RichTextLabel（鼠标穿透，挂入 LogPanel 容器）
	_battle_log = RichTextLabel.new()
	_battle_log.name = "BattleLog"
	_battle_log.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_battle_log.size = Vector2(280, 320)
	_battle_log.bbcode_enabled = true
	_battle_log.scroll_following = true
	_battle_log.focus_mode = Control.FOCUS_NONE
	_battle_log.add_theme_color_override("default_color", Color(0.88, 0.94, 1.0))
	_battle_log.add_theme_font_size_override("normal_font_size", 14)
	_log_box.add_child(_battle_log)
	api.login(TEST_USER, TEST_PASS, _on_login_ok, _on_login_err)


# 根据当前 yaw/pitch/distance 重新摆放相机并 look_at 地图中心
func _update_camera():
	var offset := Vector3.ZERO
	offset.y = _cam_distance * cos(_cam_pitch)
	var horiz := _cam_distance * sin(_cam_pitch)
	offset.x = horiz * cos(_cam_yaw)
	offset.z = horiz * sin(_cam_yaw)
	cam.position = _cam_target + offset
	cam.look_at(_cam_target, Vector3.UP)
	# 正交相机：size 控制视野，随 zoom 变化
	cam.size = _cam_distance * 0.8 / _cam_zoom


# 战局加载后取景：根节点已平移，几何中心在世界原点，相机 target 用原点
func _frame_camera():
	_cam_target = Vector3.ZERO
	var span: float = max(_board_span_x(), _board_span_y())
	# 对超大地图(5000+格)用较紧的 distance，避免正交 size 过大
	_cam_distance = clamp(span * 0.9, CAM_MIN_DIST, CAM_MAX_DIST)
	_cam_zoom = 1.0
	_update_camera()
	# 调试日志：打印相机参数便于排查
	print("[Battle3D] frame_camera: span=%.1f dist=%.1f size=%.1f target=%s" % [span, _cam_distance, cam.size, _cam_target])


func _board_span_x() -> float:
	var cells = _all_cells()
	if cells.is_empty():
		return 800.0
	var min_x := 1e9; var max_x := -1e9
	for c in cells:
		var p := pointy_top_center(int(c["q"]), int(c["r"]))
		min_x = min(min_x, p.x); max_x = max(max_x, p.x)
	return max_x - min_x

func _board_span_y() -> float:
	var cells = _all_cells()
	if cells.is_empty():
		return 800.0
	var min_y := 1e9; var max_y := -1e9
	for c in cells:
		var p := pointy_top_center(int(c["q"]), int(c["r"]))
		min_y = min(min_y, p.y); max_y = max(max_y, p.y)
	return max_y - min_y

func _all_cells() -> Array:
	var raw = battle_state.get("cells", [])
	if raw is Array and raw.is_empty():
		var m = battle_state.get("map", {})
		if m is Dictionary:
			raw = m.get("cells", [])
	return raw if raw is Array else []


func _process(_delta: float):
	if _ws != null:
		_ws.poll()
		if _ws.has_method("flush_subscribe"):
			_ws.flush_subscribe()
	# 键盘 WASD / 方向键平移相机目标（编辑器不会吞键盘，最可靠）
	# 用相机右/前向量投影到地面，确保移动方向与屏幕一致
	var right: Vector3 = cam.global_transform.basis.x
	var fwd: Vector3 = -cam.global_transform.basis.z
	right.y = 0.0; fwd.y = 0.0
	if right.length_squared() > 1e-6: right = right.normalized()
	if fwd.length_squared() > 1e-6: fwd = fwd.normalized()
	var move := Vector3.ZERO
	if Input.is_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT):  move -= right
	if Input.is_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT): move += right
	if Input.is_key_pressed(KEY_W) or Input.is_key_pressed(KEY_UP):    move -= fwd
	if Input.is_key_pressed(KEY_S) or Input.is_key_pressed(KEY_DOWN):  move += fwd
	if move.length_squared() > 1e-6:
		_cam_target += move * PAN_SPEED * _delta * (_cam_distance / 400.0)
		_update_camera()


# ---------------- 登录 / 拉战局 ----------------
func _on_login_ok(data: Dictionary):
	_current_user = data.get("user", {})
	# 优先用导航层传入的 battle_id（来自整备室「开始战斗」）
	var ctx_battle: String = str(SceneManager.get_ctx("battle_id", ""))
	if not ctx_battle.is_empty():
		status_label.text = "3D视角 · 加载战局 %s…" % ctx_battle
		_battle_id = ctx_battle
		api.get_battle_state(_battle_id, _on_battle_ok, _on_http_err)
		return
	status_label.text = "3D视角 · 加载战局…"
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
		_ensure_demo_battle()
		return
	var room: Dictionary = rooms[0]
	var rid: String = str(room.get("id", room.get("roomId", "")))
	api.get_battle_state(rid, _on_battle_ok, _on_http_err)


func _on_http_err(msg: String, _code: int):
	status_label.text = "请求错误: " + msg


# ---------------- 演示战局（rooms 为空时） ----------------
const DEMO_MAP_ID := "migrated-map-10-bb467942"
var DEMO_U1 := {
	"id": "u1", "name": "Alpha", "faction": "earth", "ownerId": "o1", "matrixId": "m1",
	"position": {"q": 15, "r": 20},
	"stats": {"attack": 10, "defense": 10, "mobility": 5, "hp": 100},
	"skills": [], "size": "M"
}
var DEMO_U2 := {
	"id": "u2", "name": "Beta", "faction": "maxion", "ownerId": "o2", "matrixId": "m2",
	"position": {"q": 25, "r": 25},
	"stats": {"attack": 10, "defense": 10, "mobility": 5, "hp": 100},
	"skills": [], "size": "M"
}

# demo 单位 u1 携带的测试技能（打通阶段4链路用；真实机体上线后移除）
func _demo_skills_u1() -> Array:
	var T = load("res://core/types.gd")
	return [
		T.unit_skill("sk-atk-1", "集束炮击", "远程能量打击", "", 0, 0, 0, "ENERGY",
			"cluster_artillery", 3, 1, "enemy", "ranged"),
		T.unit_skill("sk-buff-1", "强化力场", "给友军上攻击 buff", "", 1, 0, 0, "KINETIC",
			"reinforce_field", 1, 0, "ally", "melee"),
		T.unit_skill("sk-aoe-1", "地图炮", "指定格落点 AOE", "", 2, 0, 0, "ENERGY",
			"map_cannon", 4, 2, "tile", "ranged", "circle", 1),
	]

func _ensure_demo_battle():
	# 注入 demo 技能（打通阶段4链路；真实机体上线后移除本行）
	DEMO_U1["skills"] = _demo_skills_u1()
	api.create_battle(DEMO_MAP_ID, _on_create_ok, _on_http_err)

func _on_create_ok(data: Dictionary):
	var battle: Dictionary = data.get("battle", data)
	_battle_id = str(battle.get("id", ""))
	if _battle_id.is_empty():
		status_label.text = "演示战局创建失败"
		return
	api.post_battle_action(_battle_id, "deploy-unit", {
		"unitId": "u1", "q": DEMO_U1.position.q, "r": DEMO_U1.position.r, "unit_data": DEMO_U1
	}, _on_deploy1_ok, _on_http_err)
	api.post_battle_action(_battle_id, "deploy-unit", {
		"unitId": "u2", "q": DEMO_U2.position.q, "r": DEMO_U2.position.r, "unit_data": DEMO_U2
	}, _on_deploy2_ok, _on_http_err)

func _on_deploy1_ok(_data: Dictionary):
	pass

func _on_deploy2_ok(_data: Dictionary):
	api.post_battle_action(_battle_id, "end-deployment", {}, _on_enddeploy_ok, _on_http_err)

func _on_enddeploy_ok(data: Dictionary):
	api.get_battle_state(_battle_id, _on_battle_ok, _on_http_err)


func _on_battle_ok(data: Dictionary):
	var state: Dictionary = data
	if data.has("battle"):
		state = data["battle"]
	if state.is_empty():
		status_label.text = "战局态为空"
		return
	_battle_id = str(state.get("id", state.get("battleId", _battle_id)))
	set_battle_state(state)
	status_label.text = "3D已连接 · 单位数: %d" % state.get("units", []).size()
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

func _on_ws_subscribed(battle_id: String):
	status_label.text = "WS已订阅 battle=%s" % battle_id

# WS 推送已由 net/ws_client.gd 桥接至 EventBus.battle_state_updated，
# 此处仅做 battle_id 校验转发，避免双重 set（阶段 3 单一入口）。
func _on_ws_battle_state(battle_id: String, battle_state: Dictionary):
	if battle_id != _battle_id:
		return
	EventBus.battle_state_updated.emit(battle_state)


# EventBus 单一入口：所有战斗状态变更（WS / 本地快照重放）统一经此
func _on_eventbus_battle_state(battle_state: Dictionary):
	set_battle_state(battle_state)
	_refresh_my_units(battle_state)
	if _awaiting_move_target:
		_clear_selection()

func _on_ws_error(msg: String):
	status_label.text = "WS错误: " + msg


# ---------------- 状态注入 / 重绘 ----------------
# 单向数据管道：与 2D 版 set_battle_state 同名接口，Battle2D.gd 切换逻辑可复用
func set_battle_state(state: Dictionary):
	battle_state = state
	# 根节点统一平移，使地图几何中心落在世界原点（相机 target=原点，点击反推一致）
	var cx := _board_center_x()
	var cy := _board_center_y()
	_board_root.position = Vector3(-cx, 0.0, -cy)
	_unit_root.position = Vector3(-cx, 0.0, -cy)
	# 高亮根节点必须跟随棋盘居中偏移，否则 hex_to_world 算出的坐标与棋盘格子错位
	_move_hl_root.position = Vector3(-cx, 0.0, -cy)
	_skill_hl_root.position = Vector3(-cx, 0.0, -cy)
	_aoe_hl_root.position = Vector3(-cx, 0.0, -cy)
	# 阶段 3·棋盘渲染收口到 BoardRenderer（单一渲染出口）；居中偏移由 _board_root.position 承担
	_board.update(battle_state, Vector3.ZERO)
	# 阶段 4·单位渲染收口到 UnitRenderer（单一渲染出口）；居中偏移由 _unit_root.position 承担
	var _units_raw = battle_state.get("units", {})
	var _unit_list: Array = _units_raw.values() if _units_raw is Dictionary else (_units_raw if _units_raw is Array else [])
	# Phase 6：AI 回合平滑位移前置——记录敌方单位（update 前）当前世界坐标，供 update 后补间
	var _enemy_old_world: Dictionary = {}
	for _u in _unit_list:
		if not (_u is Dictionary):
			continue
		var _uid: String = str(_u.get("unitId", _u.get("id", "")))
		if _my_unit_ids.has(_uid):
			continue
		var _sp: Node3D = _unit_renderer.get_unit_node(_uid)
		if _sp != null:
			_enemy_old_world[_uid] = _sp.position
	_unit_renderer.update(_unit_list, Vector3.ZERO)
	# Phase 6：敌方单位位置变化 → 平滑补间（瞬移回旧位再 Tween 到新位，避免瞬移突兀）
	for _u in _unit_list:
		if not (_u is Dictionary):
			continue
		var _uid2: String = str(_u.get("unitId", _u.get("id", "")))
		if _my_unit_ids.has(_uid2):
			continue
		if not _enemy_old_world.has(_uid2):
			continue
		var _nw: Node3D = _unit_renderer.get_unit_node(_uid2)
		if _nw == null:
			continue
		var _pos: Dictionary = _u.get("position", {})
		var _target_world: Vector3 = hex_to_world(int(_pos.get("q", 0)), int(_pos.get("r", 0)), UNIT_Y)
		if _enemy_old_world[_uid2].distance_to(_target_world) < 0.01:
			continue
		_nw.position = _enemy_old_world[_uid2]          # 先落回旧位
		var _tw := create_tween()
		_tw.tween_property(_nw, "position", _target_world, 0.45).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN_OUT)
	# 仅首次（或显式重置）取景：设距离/缩放。之后 WS 同步只刷新相机，
	# 不再把用户的旋转/缩放/平移重置回默认（否则捏合缩放会被瞬间覆盖）。
	if not _camera_initialized:
		_frame_camera()
		_camera_initialized = true
	else:
		_update_camera()
	# WS 同步后刷新选中单位引用（旧 dict 已被重建替换），保留技能菜单/目标选择状态
	if not _selected_unit.is_empty():
		var sid: String = str(_selected_unit.get("unitId", _selected_unit.get("id", "")))
		var units = state.get("units", {})
		var ul: Array = units.values() if units is Dictionary else units
		for u in ul:
			if not (u is Dictionary):
				continue
			if str(u.get("unitId", u.get("id", ""))) == sid:
				_selected_unit = u
				# 若在目标选择态，按最新单位位置刷新合法目标格
				if not _targeting_skill.is_empty():
					var rf: Dictionary = HexMath.get_skill_range_fields(_targeting_skill)
					_skill_target_cells = _compute_target_cells(_targeting_skill, rf)
					_draw_skill_highlight(_skill_target_cells)
				break
	# Phase 5.1：回合 HUD（round / activeFaction）
	_refresh_turn_hud(state)
	# Phase 5.2：选中单位 AP 变化后，刷新技能菜单置灰（若已打开）
	if skill_menu.visible and not _selected_unit.is_empty():
		_build_skill_menu(_selected_unit.get("skills", []))
	# Phase 6：消费 AI 增量行动（服务端每步全量快照都带累积 aiActions，仅播本次新增）
	_consume_ai_actions(state)

# Phase 6：增量消费服务端 AI 行动序列（aiActions）。
# 服务端每个 AI 步骤都通过 battleStore.set 推送全量快照，aiActions 为累积数组；
# 仅播放 [已消费索引, 当前长度) 区间内新增的攻击动作，避免每帧重复飘字。
# 当数组长度回退（服务端清空重建新 AI 回合）时，自动重置消费游标。
func _consume_ai_actions(state: Dictionary) -> void:
	var ai_actions: Array = state.get("aiActions", [])
	if not (ai_actions is Array):
		return
	if ai_actions.size() < _ai_actions_consumed:
		_ai_actions_consumed = 0   # 新 AI 回合：服务端已清空重建数组
	for i in range(_ai_actions_consumed, ai_actions.size()):
		var act: Dictionary = ai_actions[i] if ai_actions[i] is Dictionary else {}
		var atype: String = str(act.get("type", ""))
		if atype == "attack":
			# combat_result 含 final_damage / dodged / is_crit，target_id 为受击单位
			_spawn_damage_float_from_result(act)
			# ★ Phase 7.2：AI 施法位移动效（攻击者向目标突进/后座回弹）
			var aid: String = str(act.get("unitId", ""))
			var from_d: Dictionary = act.get("from", {})
			var tgt_id: String = str(act.get("targetId", ""))
			var tgt_u: Dictionary = {}
			var units_d: Dictionary = state.get("units", {})
			if units_d is Dictionary and units_d.has(tgt_id):
				tgt_u = units_d[tgt_id] if units_d[tgt_id] is Dictionary else {}
			var from_w: Vector3 = hex_to_world(int(from_d.get("q", 0)), int(from_d.get("r", 0)), UNIT_Y)
			var tpos: Dictionary = tgt_u.get("position", {})
			var to_w: Vector3 = hex_to_world(int(tpos.get("q", 0)), int(tpos.get("r", 0)), UNIT_Y)
			# AI 攻击多为近战突进（无 category 信息则默认近战突进）
			_play_cast_dash(aid, from_w, to_w, false)
	_ai_actions_consumed = ai_actions.size()


func _setup_my_units(state: Dictionary):
	_my_unit_ids.clear()
	var units = state.get("units", {})
	var unit_list: Array = units.values() if units is Dictionary else units
	var my_id: String = str(_current_user.get("id", ""))
	for u in unit_list:
		if not (u is Dictionary):
			continue
		if str(u.get("ownerId", u.get("playerId", ""))) == my_id or u.get("isMine", false):
			_my_unit_ids.append(str(u.get("unitId", u.get("id", ""))))
	if _my_unit_ids.is_empty():
		for u in unit_list:
			if not (u is Dictionary):
				continue
			if str(u.get("faction", "")) == "earth":
				_my_unit_ids.append(str(u.get("unitId", u.get("id", ""))))

func _refresh_my_units(state: Dictionary):
	_setup_my_units(state)


# Phase 5.1 回合 HUD：呈现 round / 当前行动方（activeFaction），并据我方回合禁用 EndTurn 按钮
func _refresh_turn_hud(state: Dictionary):
	var round_no: int = int(state.get("round", 1))
	round_label.text = "回合 %d" % round_no
	var af: String = str(state.get("activeFaction", "")).to_lower()
	var af_label: String = {"attack": "攻击方", "defense": "防御方", "ambush": "伏击方"}.get(af, af if af != "" else "--")
	turn_label.text = "行动方：%s" % af_label
	var my_turn: bool = _is_my_turn(state)
	if my_turn:
		turn_hint.text = "我方回合"
		end_turn_btn.disabled = false
		_hide_enemy_banner()
		# Phase 5.0：WS 推送校正态（不在 ANIMATING 时才切回选择/空闲，避免打断飘字动画）
		if not battle_sm.input_locked():
			if not _selected_unit.is_empty():
				battle_sm.enter_unit_selected(str(_selected_unit.get("unitId", _selected_unit.get("id", ""))))
			else:
				battle_sm.enter_idle()
	else:
		turn_hint.text = "对手回合（等待）"
		end_turn_btn.disabled = true
		_show_enemy_banner()
		# Phase 5.0：对手回合 → ENEMY_TURN（在 ANIMATING 外才切换）
		if not battle_sm.input_locked():
			battle_sm.enter_enemy_turn()


# Phase 6：敌方回合指示层（屏幕正上方呼吸提示）
# 进入敌方回合显示，回到我方回合隐藏；用 Tween 做 alpha 脉动（呼吸感），不阻塞输入层。
func _show_enemy_banner() -> void:
	if _enemy_banner == null or _banner_label == null:
		return
	_enemy_banner.visible = true
	_banner_label.modulate = Color(1, 1, 1, 1)
	# 平滑淡入
	var fade_in := create_tween()
	fade_in.tween_property(_banner_label, "modulate:a", 1.0, 0.25)
	# 呼吸脉动（无限循环）：0.55 ↔ 1.0
	var breathe := create_tween()
	breathe.set_loops(-1)
	breathe.tween_property(_banner_label, "modulate:a", 0.55, 0.7)
	breathe.tween_property(_banner_label, "modulate:a", 1.0, 0.7)
	_enemy_breathe_tween = breathe


func _hide_enemy_banner() -> void:
	if _enemy_banner == null or _banner_label == null:
		return
	if _enemy_breathe_tween != null and _enemy_breathe_tween.is_valid():
		_enemy_breathe_tween.kill()
		_enemy_breathe_tween = null
	var t := create_tween()
	t.tween_property(_banner_label, "modulate:a", 0.0, 0.2)
	t.tween_callback(func(): _enemy_banner.visible = false)


# 是否我方回合：activeFaction（轮转角色）经 factionRoles 把我的单位 faction 映射为角色后比较
# 符合宪法：role 是逻辑判定唯一依据，禁止直接比 faction
func _is_my_turn(state: Dictionary) -> bool:
	var af: String = str(state.get("activeFaction", "")).to_lower()
	if af.is_empty():
		return true
	var fr: Dictionary = state.get("factionRoles", {})
	var units = state.get("units", {})
	var ul: Array = units.values() if units is Dictionary else units
	var my_ids: Array = _my_unit_ids
	for u in ul:
		if not (u is Dictionary):
			continue
		var uid: String = str(u.get("unitId", u.get("id", "")))
		if my_ids.has(uid):
			var f: String = str(u.get("faction", ""))
			var role: String = str(fr.get(f, f)).to_lower()
			if role == af:
				return true
	return my_ids.is_empty()  # demo 无归属单位时默认放行


# 纯 2D 平面坐标（坐标唯一真相源，与 hex_board.gd 完全一致）
func pointy_top_center(q: int, r: int) -> Vector2:
	return HexMath.pointy_top_center(q, r)

# 平面坐标 -> 3D 世界坐标（Y 设为高度）
func hex_to_world(q: int, r: int, height: float = 0.0) -> Vector3:
	var p := pointy_top_center(q, r)
	return Vector3(p.x, height, p.y)


# ---------------- 棋盘（六棱柱地形） ----------------
# 阶段 3·棋盘渲染已收口到 BoardRenderer（render/board_renderer.gd），
# 经 set_battle_state → _board.update(cells, Vector3.ZERO) 单向消费，禁内联副本。

# ---------------- 单位（Sprite3D billboard） ----------------
# 阶段 4·单位渲染已收口到 UnitRenderer（render/unit_renderer.gd），
# 经 set_battle_state → _unit_renderer.update(units, Vector3.ZERO) 单向消费，
# 禁内联 Mesh/Sprite3D 创建副本（高度真相 = HexMath.UNIT_FLOAT_Y）。
# 选中/拾取节点经 _unit_renderer.get_unit_node(id) / find_unit_at(q,r) 取得。

# ---------------- 交互：点击选中/移动 ----------------
func _find_unit_at(q: int, r: int) -> Dictionary:
	# 拾取 id 反查交给 UnitRenderer（单一真相源，避免两处遍历单位列表）
	var uid: String = _unit_renderer.find_unit_at(q, r)
	if uid == "":
		return {}
	var units = battle_state.get("units", {})
	var unit_list: Array = units.values() if units is Dictionary else units
	for u in unit_list:
		if not (u is Dictionary):
			continue
		if str(u.get("unitId", u.get("id", ""))) == uid:
			return u
	return {}


func _unproject_to_hex(event: InputEventMouseButton) -> Dictionary:
	return _screen_to_hex(event.position)


# 屏幕坐标 → 六边形（鼠标/触屏共用）
func _screen_to_hex(screen_pos: Vector2) -> Dictionary:
	# 屏幕点 → 射线 → 与 Y=UNIT_Y 平面求交 → 反推平面 (x,y) → pointyTopCenter 逆推
	var ray_from := cam.project_ray_origin(screen_pos)
	var ray_dir := cam.project_ray_normal(screen_pos)
	var plane_y := UNIT_Y
	# 射线与平面 y=plane_y 交点
	var denom := ray_dir.y
	if abs(denom) < 1e-6:
		return {"q": -999, "r": -999}
	var t := (plane_y - ray_from.y) / denom
	var hit := ray_from + ray_dir * t
	# 反居中（与重建时减掉的中心一致）
	var cx := _board_center_x()
	var cy := _board_center_y()
	var px := hit.x + cx
	var py := hit.z + cy
	# 逆推统一走 HexMath.pixel_to_hex（与 pointy_top_center 严格互逆，宪法 §2 单一数学真理）
	return HexMath.pixel_to_hex(px, py)


func _board_center_x() -> float:
	var cells = battle_state.get("cells", [])
	if cells is Array and cells.is_empty():
		var m = battle_state.get("map", {})
		if m is Dictionary:
			cells = m.get("cells", [])
	if cells.is_empty():
		return 0.0
	var min_x := 1e9; var max_x := -1e9
	for c in cells:
		var p := pointy_top_center(int(c["q"]), int(c["r"]))
		min_x = min(min_x, p.x); max_x = max(max_x, p.x)
	return (min_x + max_x) / 2.0

func _board_center_y() -> float:
	var cells = battle_state.get("cells", [])
	if cells is Array and cells.is_empty():
		var m = battle_state.get("map", {})
		if m is Dictionary:
			cells = m.get("cells", [])
	if cells.is_empty():
		return 0.0
	var min_y := 1e9; var max_y := -1e9
	for c in cells:
		var p := pointy_top_center(int(c["q"]), int(c["r"]))
		min_y = min(min_y, p.y); max_y = max(max_y, p.y)
	return (min_y + max_y) / 2.0


func _input(event):
	# ── 触屏（多点触控）优先处理：单指旋转/点选，双指捏合缩放+平移 ──
	if event is InputEventScreenTouch or event is InputEventScreenDrag:
		_handle_touch(event)
		return

	# ── 触控板 / 精密触摸板手势：捏合缩放 + 双指平移 ──
	# 注意：Mac/Windows 触控板的"双指捏合"在 Godot 里产生的是
	# InputEventMagnifyGesture（缩放）与 InputEventPanGesture（平移），
	# 而非 InputEventScreenDrag（后者仅真多点触控屏/手机才有）。
	if event is InputEventMagnifyGesture:
		# factor 是"帧间相对增量"（1.0=无变化），本身变化很小，乘增益放大手感
		# 用 _cam_distance 做主缩放轴（等距视角下距离变化视觉冲击力远强于正交 size 微调）
		var g: float = 1.0 + (event.factor - 1.0) * ZOOM_MAGIFY_GAIN
		var old_dist: float = _cam_distance
		_cam_distance = clamp(_cam_distance / g, CAM_MIN_DIST, CAM_MAX_DIST)
		_update_camera()
		print("[Battle3D][zoom-debug] factor=%.4f dist %.0f -> %.0f  size=%.1f" % [event.factor, old_dist, _cam_distance, cam.size])
		return
	if event is InputEventPanGesture:
		_touch_pan_by_screen(event.delta)
		return

	# 键盘：F3 切回 2D 战斗场景（与 Battle2D.tscn 双向切换，互不影响）
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_F3:
			get_tree().change_scene_to_file("res://scenes/Battle2D.tscn")
			return
		# R 键：重置视角到默认等距
		if event.keycode == KEY_R:
			_cam_yaw = deg_to_rad(90.0)
			_cam_pitch = deg_to_rad(55.0)
			_cam_zoom = 1.0
			_frame_camera()
			return

	# ── 鼠标滚轮缩放（用 _cam_distance 做主缩放轴） ──
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_WHEEL_UP:
		_cam_distance = clamp(_cam_distance / ZOOM_WHEEL_STEP, CAM_MIN_DIST, CAM_MAX_DIST)
		_update_camera()
		print("[Battle3D][wheel] UP  dist=%.0f  size=%.1f" % [_cam_distance, cam.size])
		return
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
		_cam_distance = clamp(_cam_distance * ZOOM_WHEEL_STEP, CAM_MIN_DIST, CAM_MAX_DIST)
		_update_camera()
		print("[Battle3D][wheel] DOWN dist=%.0f  size=%.1f" % [_cam_distance, cam.size])
		return

	# ── 右键拖拽：旋转轨道 ──
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_RIGHT:
		if event.pressed:
			_dragging_rot = true
			_drag_last = get_viewport().get_mouse_position()
		else:
			_dragging_rot = false
		return

	# ── Shift+右键 或 中键：平移（移动相机目标点） ──
	var pan_trigger := false
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_MIDDLE:
		pan_trigger = true
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_RIGHT and \
		event.shift_pressed:
		pan_trigger = true
	if pan_trigger:
		if event.pressed:
			_dragging_pan = true
			_drag_last = get_viewport().get_mouse_position()
		else:
			_dragging_pan = false
		return

	# ── 鼠标移动：应用旋转/平移 ──
	if event is InputEventMouseMotion:
		if _dragging_rot:
			var d: Vector2 = event.relative
			_cam_yaw -= deg_to_rad(d.x * 0.6)
			_cam_pitch = clamp(_cam_pitch - deg_to_rad(d.y * 0.4),
				deg_to_rad(10.0), deg_to_rad(85.0))
			_update_camera()
			return
		if _dragging_pan:
			var d: Vector2 = event.relative
			# 屏幕右/上方向 → 世界平移（用相机右/前向量投影到地面）
			var right: Vector3 = cam.global_transform.basis.x
			var fwd: Vector3 = -cam.global_transform.basis.z
			right.y = 0.0; fwd.y = 0.0
			right = right.normalized(); fwd = fwd.normalized()
			var move: Vector3 = (right * -d.x + fwd * d.y) * PAN_SPEED * (_cam_distance / 1000.0)
			_cam_target += move
			_update_camera()
			return

	# ── 左键选中/移动/技能点选 移到 _unhandled_input（UI 按钮消费后不再下发给棋盘）──
	# （此处仅处理相机/滚轮/触控板/触屏/键盘，棋盘点选见 _unhandled_input）


# 棋盘点选 / 取消 统一在 _unhandled_input：UI（SkillMenu 按钮）消费事件后不会下发到这里，
# 避免点击技能按钮时穿透触发棋盘取消选中或非法目标报错（事件穿透防线）。
func _unhandled_input(event: InputEvent) -> void:
	# ── 取消 / 退出状态机：右键 或 Esc ──
	if event.is_action_pressed("ui_cancel") or (event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_RIGHT and event.pressed):
		if not _targeting_skill.is_empty():
			_exit_skill_targeting()
			status_label.text = "已退出目标选择"
			get_viewport().set_input_as_handled()
			return
		elif not _selected_unit.is_empty():
			_clear_selection()
			get_viewport().set_input_as_handled()
			return

	# ── 鼠标移动：技能目标态下实时预览 AOE 受击范围（暗红层）──
	if event is InputEventMouseMotion and not _targeting_skill.is_empty():
		if not _dragging_rot and not _dragging_pan:
			var cell: Dictionary = _screen_to_hex(event.position)
			_update_aoe_preview(cell)
		return

	# ── 左键：棋盘点选（选中 / 移动 / 技能目标）──
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		# Phase 5.0：动画/敌方/结算态下锁定一切棋盘点选输入
		if battle_sm.input_locked():
			get_viewport().set_input_as_handled()
			return
		if battle_state.is_empty():
			return
		var cell: Dictionary = _screen_to_hex(event.position)
		var clicked_unit: Dictionary = _find_unit_at(int(cell["q"]), int(cell["r"]))
		if not _targeting_skill.is_empty():
			_handle_skill_click(cell, clicked_unit)
			get_viewport().set_input_as_handled()
			return
		if _awaiting_move_target:
			if not clicked_unit.is_empty() and str(clicked_unit.get("unitId", clicked_unit.get("id",""))) == str(_selected_unit.get("unitId", _selected_unit.get("id",""))):
				_clear_selection()
				return
			_try_move(int(cell["q"]), int(cell["r"]))
			return
		if not clicked_unit.is_empty() and _my_unit_ids.has(str(clicked_unit.get("unitId", clicked_unit.get("id","")))):
			_select_unit(clicked_unit)
		else:
			_clear_selection()


# 技能目标点选：合法→施放，非法→提示
func _handle_skill_click(cell: Dictionary, clicked_unit: Dictionary):
	var tf: String = _targeting_skill.get("target_filter", _targeting_skill.get("targetFilter", "enemy"))
	var is_valid: bool = false
	if tf == "tile" or tf == "self":
		is_valid = _skill_target_cells.any(func(c): return int(c.q) == int(cell.q) and int(c.r) == int(cell.r))
	else:
		is_valid = (not clicked_unit.is_empty()) and _skill_target_cells.any(
			func(c): return c.unit != null and str(c.unit.get("unitId", c.unit.get("id",""))) == str(clicked_unit.get("unitId", clicked_unit.get("id",""))))
	if not is_valid:
		status_label.text = "非法目标"
		return
	var target_hex: Dictionary = {}
	if tf == "tile" or tf == "self":
		target_hex = {"q": int(cell.q), "r": int(cell.r)}
	_cast_skill_at(clicked_unit, target_hex)


func _cast_skill_at(target_unit: Dictionary, target_hex: Dictionary):
	var sk: Dictionary = _targeting_skill
	var payload: Dictionary = {
		"attacker_id": str(_selected_unit.get("unitId", _selected_unit.get("id", ""))),
		"attack_type": "skill",
		# 技能 id 双向兼容：真实词条库可能用 skill_id，demo 构造体用 id
		"skill_id": str(sk.get("id", sk.get("skill_id", ""))),
	}
	if not target_unit.is_empty():
		payload["target_id"] = str(target_unit.get("unitId", target_unit.get("id", "")))
	if not target_hex.is_empty():
		payload["target_pos"] = {"q": int(target_hex.q), "r": int(target_hex.r)}
	# AOE 形状契约（若后端 skillExecutor 解析）：透传 shape 与 aoe_radius 双向键名
	var shape = sk.get("shape", null)
	if shape != null and shape != "":
		payload["aoe_shape"] = {
			"shape": str(shape),
			"aoe_radius": int(sk.get("aoe_radius", sk.get("aoeRadius", 0))),
		}
	# ★ Phase 7.2：记录施法位移动效上下文（近战突进/远程后座）
	_cast_attacker_id = str(_selected_unit.get("unitId", _selected_unit.get("id", "")))
	var au_pos: Dictionary = _selected_unit.get("position", {})
	_cast_from_pos = hex_to_world(int(au_pos.get("q", 0)), int(au_pos.get("r", 0)), UNIT_Y)
	var tu_pos: Dictionary = target_hex if not target_hex.is_empty() else (target_unit.get("position", {}) if not target_unit.is_empty() else {})
	_cast_to_pos = hex_to_world(int(tu_pos.get("q", 0)), int(tu_pos.get("r", 0)), UNIT_Y)
	var cat: String = str(sk.get("category", sk.get("type", sk.get("attack_type", "")))).to_lower()
	_cast_is_ranged = not (cat.contains("melee") or cat.contains("近战"))
	status_label.text = "技能施放中…"
	# Phase 5.0：进入 ANIMATING（锁定一切棋盘点选输入），待响应 + WS 刷新后恢复
	battle_sm.enter_animating("skill:%s" % str(sk.get("name", "")))
	api.post_battle_action(_battle_id, "attack", payload, _on_skill_ok, _on_skill_err)


func _on_skill_ok(_data: Dictionary):
	_targeting_skill = {}
	_skill_target_cells = []
	_clear_skill_highlight()
	# Phase 5：伤害飘字（驱动源 = /attack 响应 combat_result.final_damage，不依赖 WS 差值）
	_spawn_damage_float_from_result(_data)
	# ★ Phase 7.2：施法位移动效（近战突进冲刺 + 弹性回弹 / 远程后座回弹）
	if not _cast_attacker_id.is_empty():
		_play_cast_dash(_cast_attacker_id, _cast_from_pos, _cast_to_pos, _cast_is_ranged)
		_cast_attacker_id = ""
	status_label.text = "技能结算完成，等待同步…"
	# Phase 5.0：ANIMATING 结束 → 选中仍在则回 UNIT_SELECTED，否则 IDLE（WS 推送会再次校正）
	if not _selected_unit.is_empty():
		battle_sm.enter_unit_selected(str(_selected_unit.get("unitId", _selected_unit.get("id", ""))))
	else:
		battle_sm.enter_idle()


func _on_skill_err(msg: String, _code: int):
	status_label.text = "技能施放失败: " + msg
	_exit_skill_targeting()
	# Phase 5.0：错误也恢复交互态
	if not _selected_unit.is_empty():
		battle_sm.enter_unit_selected(str(_selected_unit.get("unitId", _selected_unit.get("id", ""))))
	else:
		battle_sm.enter_idle()


# ============================================================
# Phase 5：伤害飘字（驱动源 = /attack 响应 combat_result.final_damage）
# 说明：WS 推送为纯全量快照（combatSnap 不含增量 events），故飘字以 HTTP 响应即时播放，
# 不依赖前后帧 HP 差值。后端当前未下发 is_crit（已记录待补），暴击闪红降级为普通飘字 + 放大。
# ============================================================
func _spawn_damage_float_from_result(_data: Dictionary) -> void:
	var cr: Dictionary = _data.get("combat_result", {})
	var tid: String = str(_data.get("targetId", ""))
	var dmg: int = int(cr.get("final_damage", 0))
	var dodged: bool = bool(cr.get("dodged", false))
	# 后端 /attack 已透传 is_crit（combat.ts 组装 combat_result 补齐）
	var is_crit: bool = bool(cr.get("is_crit", false))
	_spawn_damage_float(tid, dmg, dodged, is_crit)
	# ★ Phase 7.1：目标被击杀 → 触发离场动效（闪白→震动→爆裂渐隐）
	if bool(cr.get("killed", false)) and not tid.is_empty():
		_play_kill_effect(tid)
	# ── Phase 8·联调表现层对接：消费后端反击链/三路分流结构化数据 ──
	# 数据来源：combat.ts /attack 响应 combat_result.counter_* / sizeTactic + 顶层 reaction_log
	# 1) 反击伤害飘字（反击者反伤给原攻击者）
	if bool(cr.get("counter_triggered", false)):
		var cdmg: int = int(cr.get("counter_damage", 0))
		var atk_id: String = str(_data.get("unitId", ""))
		if cdmg > 0 and not atk_id.is_empty():
			# 反击伤害飘在「原攻击者」身上，用暗红区别于普攻，标注「反」
			_spawn_counter_float(atk_id, cdmg)
		_push_log("[color=#ff6b5e]⟲ 反击[/color] 造成 [b]%d[/b] 伤害" % cdmg)
	# 2) 体型战术横幅（Phase 6 机动/姿态差值可视化入口：sizeTactic.amount 即体型机动补偿）
	var st: Dictionary = cr.get("sizeTactic", {})
	if st != null and st.size() > 0:
		var st_name: String = str(st.get("name", "体型战术"))
		var st_amt: int = int(st.get("amount", 0))
		if st_amt != 0:
			_show_size_banner("%s 机动补偿 %+d" % [st_name, st_amt])
			_push_log("[color=#9be7ff]⚖ %s[/color] 机动补偿 [b]%+d[/b]" % [st_name, st_amt])
	# ── 阶段 6·机动差值与姿态数据透传消费（combat.ts 注入 combat_result.mobility_diff 等） ──
	# 字段严格对齐 damagePipe.stages，不臆造：mobility_diff（封顶+5，每点+1攻击力）、
	# sniper_mobility_reduction（狙击机动减免）、height_bonus（高地）、attacker_stance/defender_stance
	var mob_diff: int = int(cr.get("mobility_diff", 0))
	var sniper_red: int = int(cr.get("sniper_mobility_reduction", 0))
	var height_b: float = float(cr.get("height_bonus", 0))
	var atk_stance: String = str(cr.get("attacker_stance", ""))
	var def_stance: String = str(cr.get("defender_stance", ""))
	# a) 机动优势/劣势结构化日志 + 飘字标签
	if mob_diff > 0:
		# 增伤% 近似：机动差对攻击力边际贡献 = mob_diff；按 temp_attack 占比估算（base+diff 分母）
		var pct: int = int(round(float(mob_diff) / float(max(1, dmg)) * 100)) if dmg > 0 else 0
		_push_log("[color=#00d4aa][机动优势][/color] 机动超越 [b]+%d[/b] (增伤约 [b]+%d%%[/b])" % [mob_diff, pct])
		_spawn_advantage_float(tid, "机动压制", Color(0.0, 0.83, 0.67))  # 绿：攻方压制
	elif mob_diff < 0:
		_push_log("[color=#ffb000][机动劣势][/color] 目标规避 [b]+%d[/b]" % abs(mob_diff))
	# b) 狙击机动减免提示
	if sniper_red > 0:
		_push_log("[color=#ff6b5e]⊘ 狙击压制[/color] 目标机动 [b]-%d[/b]" % sniper_red)
	# c) 高地优势提示（地形姿态类）
	if height_b > 0:
		_push_log("[color=#9be7ff]▲ 高地优势[/color] 加成 [b]+%d[/b]" % int(height_b))
	# d) 防御姿态减伤判定（defensive_stance 触发 fortified 减伤；破防对立面）
	if def_stance == "defensive":
		_push_log("[color=#7fd1ff][姿态][/color] 防御姿态生效，抵消冲击")
		_spawn_advantage_float(tid, "防御姿态", Color(0.5, 0.82, 1.0))  # 蓝：守方减伤
	elif atk_stance == "aggressive":
		_push_log("[color=#ffd166][姿态][/color] 攻击姿态，伤害强化")
	# 3) reaction_log 文本流（反击链/三路分流逐条可见化）
	var rlog: Array = _data.get("reaction_log", [])
	if rlog != null and rlog.size() > 0:
		for line in rlog:
			_push_log(str(line))


# ★ Phase 8：反击伤害飘字（区别于普攻，暗红 + 「反」前缀标记）
func _spawn_counter_float(unit_id: String, amount: int) -> void:
	if unit_id.is_empty():
		return
	var node: Node3D = _unit_renderer.get_unit_node(unit_id) if _unit_renderer != null else null
	if node == null:
		return
	var anchor: Vector3 = node.global_position
	var float_root := Node3D.new()
	_unit_root.add_child(float_root)
	float_root.global_position = anchor + Vector3(0, 8.0, 0)
	var lbl := Label3D.new()
	lbl.text = "反 -%d" % amount
	lbl.font_size = 30
	lbl.outline_size = 5
	lbl.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	lbl.modulate = Color(1.0, 0.42, 0.37)  # 暗红
	float_root.add_child(lbl)
	var tw := create_tween()
	tw.tween_property(lbl, "position:y", 6.0, 0.6).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tw.parallel().tween_property(lbl, "modulate:a", 0.0, 0.6)
	tw.tween_callback(func(): float_root.queue_free())


# ★ 阶段 6：机动/姿态短瞬态微标飘字（绿=攻方压制，蓝=守方防御姿态；区别于伤害数字）
func _spawn_advantage_float(unit_id: String, tag: String, color: Color) -> void:
	if unit_id.is_empty():
		return
	var node: Node3D = _unit_renderer.get_unit_node(unit_id) if _unit_renderer != null else null
	if node == null:
		return
	var anchor: Vector3 = node.global_position
	var float_root := Node3D.new()
	_unit_root.add_child(float_root)
	float_root.global_position = anchor + Vector3(2.5, 10.0, 0)  # 偏右上，避免与主伤害飘字重叠
	var lbl := Label3D.new()
	lbl.text = tag
	lbl.font_size = 22
	lbl.outline_size = 4
	lbl.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	lbl.modulate = color
	float_root.add_child(lbl)
	var tw := create_tween()
	tw.tween_property(lbl, "position:y", 7.5, 0.7).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tw.parallel().tween_property(lbl, "modulate:a", 0.0, 0.7)
	tw.tween_callback(func(): float_root.queue_free())


# ★ Phase 8：战斗日志推送（反击链/三路分流/reaction_log 文本流，挂 UILayer.BattleLog）
func _push_log(msg: String) -> void:
	if _battle_log == null:
		return
	_battle_log_lines.append(msg)
	if _battle_log_lines.size() > BATTLE_LOG_MAX:
		_battle_log_lines = _battle_log_lines.slice(_battle_log_lines.size() - BATTLE_LOG_MAX)
	_battle_log.clear()
	_battle_log.append_text("\n".join(_battle_log_lines))


# ★ Phase 8：体型战术横幅（复用 _enemy_banner 同款控件样式，避免新增场景节点）
func _show_size_banner(text: String) -> void:
	if _banner_label == null or _enemy_banner == null:
		return
	_banner_label.text = text
	_enemy_banner.visible = true
	_enemy_banner.modulate = Color(1, 1, 1, 1)
	var tw := create_tween()
	tw.tween_property(_enemy_banner, "modulate:a", 0.0, 1.2).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN)
	tw.tween_callback(func(): _enemy_banner.visible = false)


# ★ Phase 7.1：击杀离场动效
# 流程：UnitRenderer.detach_for_death 摘除节点（避免 update 全清时立即销毁）
#       → 闪白（modulate 瞬间白）→ 剧烈震动（position 抖动）
#       → 红色爆裂（scale 放大 + modulate alpha 渐隐）→ queue_free 并经 _release_dying 释放。
func _play_kill_effect(unit_id: String) -> void:
	if _unit_renderer == null:
		return
	var node: Node3D = _unit_renderer.detach_for_death(unit_id)
	if node == null or not is_instance_valid(node):
		return
	# 跳过若已在离场（避免重复触发）
	if node.get_meta("dying", false):
		return
	node.set_meta("dying", true)
	var base_pos: Vector3 = node.position
	# 1) 闪白
	node.modulate = Color(1, 1, 1, 1)
	# 2) 剧烈震动（500ms）
	var shake := create_tween()
	shake.tween_interval(0.0)
	for i in range(8):
		var off := Vector3(randf_range(-6, 6), randf_range(0, 4), randf_range(-6, 6))
		shake.tween_property(node, "position", base_pos + off, 0.05)
	shake.tween_property(node, "position", base_pos, 0.05)
	# 3) 红色爆裂 + 渐隐（400ms）
	var burst := create_tween()
	burst.tween_property(node, "scale", node.scale * 1.6, 0.2)
	burst.parallel().tween_property(node, "modulate:a", 0.0, 0.4)
	burst.parallel().tween_property(node, "position:y", base_pos.y + 14.0, 0.4)
	burst.tween_interval(0.0)
	burst.tween_callback(func(): _unit_renderer._release_dying(unit_id))


# ★ Phase 7.2：施法位移动效
# 近战（Melee）：向目标格突进冲刺 60% 距离（dash）→ 触发伤害飘字/受击 → 弹性回弹归位（ELASTIC_OUT）。
# 远程（Ranged）：施法者轻微后仰后座力（recoil）→ 回弹归位。
# 节点经 UnitRenderer.detach_for_anim 摘除托管，避免 WS 刷新 update 重绘时打断/误清。
func _play_cast_dash(attacker_id: String, from_pos: Vector3, to_pos: Vector3, is_ranged: bool) -> void:
	if _unit_renderer == null:
		return
	var node: Node3D = _unit_renderer.detach_for_anim(attacker_id)
	if node == null or not is_instance_valid(node):
		return
	if node.get_meta("animating", false):
		return
	node.set_meta("animating", true)
	var base: Vector3 = from_pos
	var delta: Vector3 = (to_pos - from_pos)
	var dist: float = delta.length()
	if dist < 0.01:
		node.set_meta("animating", false)
		_unit_renderer._animating_nodes.erase(attacker_id)
		node.queue_free()
		return
	var dir: Vector3 = delta.normalized()
	var t := create_tween()
	if is_ranged:
		# 后座：向后退 25% 距离 → 回弹归位（CUBIC/OUT）
		var recoil: Vector3 = base - dir * dist * 0.25
		t.tween_property(node, "position", recoil, 0.12).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
		t.tween_property(node, "position", base, 0.22).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	else:
		# 突进：向目标冲刺 60% 距离 → 弹性回弹归位（ELASTIC/OUT）
		var dash: Vector3 = base + dir * dist * 0.6
		t.tween_property(node, "position", dash, 0.14).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
		t.tween_property(node, "position", base, 0.32).set_trans(Tween.TRANS_ELASTIC).set_ease(Tween.EASE_OUT)
	t.tween_callback(func():
		node.set_meta("animating", false)
		_unit_renderer._animating_nodes.erase(attacker_id)
		node.queue_free()  # 下次 set_battle_state.update 在正确格重建
	)


func _spawn_damage_float(unit_id: String, amount: int, dodged: bool, is_crit: bool) -> void:
	if unit_id.is_empty():
		return
	# 锚点：优先取已渲染的单位节点世界坐标，回退用 hex→world
	var anchor: Vector3 = Vector3.ZERO
	var node: Node3D = _unit_renderer.get_unit_node(unit_id) if _unit_renderer != null else null
	if node == null:
		return  # 单位节点未渲染（已离场），不飘字
	anchor = node.global_position
	# 飘字容器（与单位同根，局部坐标 = 单位全局坐标 - _unit_root.position）
	var float_root := Node3D.new()
	_unit_root.add_child(float_root)
	float_root.global_position = anchor + Vector3(0, 8.0, 0)
	var lbl := Label3D.new()
	# 文本：MISS / CRIT! -N / -N
	if dodged:
		lbl.text = "MISS"
	elif is_crit:
		lbl.text = "CRIT! -%d" % amount
	else:
		lbl.text = "-%d" % amount
	# 字号：暴击放大 1.4 倍（打击感），普通 32
	var base_size: int = 32
	lbl.font_size = int(base_size * 1.4) if is_crit else base_size
	lbl.outline_size = 5
	lbl.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	# 着色：MISS 灰青、暴击亮橙红(#ff3b30→#ff9500 渐层用纯色高亮)、普通淡黄白
	if dodged:
		lbl.modulate = Color(0.55, 0.8, 0.85)
	elif is_crit:
		lbl.modulate = Color(1.0, 0.23, 0.19)   # #ff3b30 亮橙红
	else:
		lbl.modulate = Color(1.0, 0.95, 0.85)
	float_root.add_child(lbl)
	# Tween：暴击用弹性冲顶回弹 + 放大后淡出；普通匀速上浮渐隐
	var tw := create_tween()
	var y0: float = float_root.position.y
	if is_crit:
		# 快速冲顶（回弹曲线 TRANS_BACK/EASE_OUT）+ 停顿 + 缓降淡出
		tw.tween_property(float_root, "position:y", y0 + 30.0, 0.22).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
		tw.tween_interval(0.28)
		tw.parallel().tween_property(lbl, "modulate:a", 0.0, 0.55)
		tw.parallel().tween_property(float_root, "position:y", y0 + 44.0, 0.55)
	else:
		tw.tween_property(float_root, "position:y", y0 + 26.0, 0.9)
		tw.parallel().tween_property(lbl, "modulate:a", 0.0, 0.9)
	tw.tween_callback(float_root.queue_free)


# Phase 5.0：状态机转移日志回调（HUD 角标可选，此处仅日志便于联调）
func _on_bsm_changed(_from: int, _to: int) -> void:
	print("[BattleStateMachine] %s → %s" % [BattleStateMachine.State.keys()[_from], BattleStateMachine.State.keys()[_to]])



# ---------------- 触屏多点控制 ----------------
# Godot 4 没有内置"捏合/双指旋转"手势识别，但 InputEventScreenTouch /
# InputEventScreenDrag 提供完整多点信息，这里自己实现一套轻量触控相机：
#   · 单指拖拽  → 旋转轨道（等同右键拖拽）
#   · 单指轻点  → 选中/移动单位（等同左键）
#   · 双指捏合  → 缩放（等同滚轮）
#   · 双指平移  → 移动相机目标点（等同中键平移）
func _handle_touch(event):
	var count: int = _touch_points.size()

	if event is InputEventScreenTouch:
		var st: InputEventScreenTouch = event
		if st.pressed:
			_touch_points[st.index] = st.position
			if count == 0:
				# 第一根手指落下：记录起点，准备区分点按/拖拽
				_touch_start = st.position
				_touch_moved = false
			elif count == 1:
				# 第二根手指落下：进入双指模式，初始化捏合基准
				_touch_last_mid = (_touch_points.values()[0] + st.position) * 0.5
				_touch_last_dist = _touch_points.values()[0].distance_to(st.position)
		else:
			_touch_points.erase(st.index)
			if count == 1:
				# 最后一根手指抬起：若几乎没移动 → 视为点按选中
				if not _touch_moved and battle_state.is_empty() == false:
					_touch_tap_select(st.position)
			# 手指数变化后清空双指基准，下一帧重新初始化
			_touch_last_dist = 0.0
		return

	# InputEventScreenDrag：某根手指移动
	if event is InputEventScreenDrag:
		var sd: InputEventScreenDrag = event
		if not _touch_points.has(sd.index):
			_touch_points[sd.index] = sd.position
		else:
			_touch_points[sd.index] = sd.position

		var n: int = _touch_points.size()
		if n >= 2:
			# 双指：取前两根手指做捏合 + 平移
			var pts: Array = _touch_points.values()
			var mid: Vector2 = (pts[0] + pts[1]) * 0.5
			var dist: float = pts[0].distance_to(pts[1])
			if _touch_last_dist > 0.0:
				# 捏合缩放：距离变大→放大（zoom 增大）
				var ratio: float = dist / max(_touch_last_dist, 1.0)
				_cam_zoom = clamp(_cam_zoom * ratio, 0.25, 4.0)
				_update_camera()
				# 双指整体平移：中点位移 → 移动相机目标
				var dmid: Vector2 = mid - _touch_last_mid
				if dmid.length() > 0.5:
					_touch_pan_by_screen(dmid)
			_touch_last_mid = mid
			_touch_last_dist = dist
		else:
			# 单指拖拽 → 旋转（与右键拖拽同逻辑）
			var d: Vector2 = sd.relative
			if d.length() > 0.0:
				if _touch_start.distance_to(sd.position) > TAP_SLOP:
					_touch_moved = true
				_cam_yaw -= deg_to_rad(d.x * 0.6)
				_cam_pitch = clamp(_cam_pitch - deg_to_rad(d.y * 0.4),
					deg_to_rad(10.0), deg_to_rad(85.0))
				_update_camera()
		return


# 双指整体平移：屏幕位移 → 世界平移（复用鼠标平移的基向量）
func _touch_pan_by_screen(d: Vector2):
	var right: Vector3 = cam.global_transform.basis.x
	var fwd: Vector3 = -cam.global_transform.basis.z
	right.y = 0.0; fwd.y = 0.0
	right = right.normalized(); fwd = fwd.normalized()
	var move: Vector3 = (right * -d.x + fwd * d.y) * PAN_SPEED * (_cam_distance / 1000.0)
	_cam_target += move
	_update_camera()


# 单指轻点：把屏幕坐标反推到六边形并走选中/移动/技能逻辑
func _touch_tap_select(screen_pos: Vector2):
	var cell: Dictionary = _screen_to_hex(screen_pos)
	var clicked_unit: Dictionary = _find_unit_at(int(cell["q"]), int(cell["r"]))
	if not _targeting_skill.is_empty():
		_handle_skill_click(cell, clicked_unit)
		return
	if _awaiting_move_target:
		if not clicked_unit.is_empty() and str(clicked_unit.get("unitId", clicked_unit.get("id",""))) == str(_selected_unit.get("unitId", _selected_unit.get("id",""))):
			_clear_selection()
			return
		_try_move(int(cell["q"]), int(cell["r"]))
		return
	if not clicked_unit.is_empty() and _my_unit_ids.has(str(clicked_unit.get("unitId", clicked_unit.get("id","")))):
		_select_unit(clicked_unit)
	else:
		_clear_selection()


func _select_unit(unit: Dictionary):
	_selected_unit = unit
	_selected_skills = unit.get("skills", [])
	# Phase 5.0：状态机进入 UNIT_SELECTED
	battle_sm.enter_unit_selected(str(unit.get("unitId", unit.get("id", ""))))
	# Phase 7.1：刷新单位详情面板
	_refresh_unit_panel(unit)
	# 选中即自动绘制移动范围高亮（对齐 2D 原版 _select_unit 行为）
	_enter_move_mode()
	if _selected_skills.size() > 0:
		# 有技能：弹技能菜单（移动高亮已绘，菜单与高亮并存）
		_build_skill_menu(_selected_skills)
		status_label.text = "3D已选 %s · 选技能或移动" % str(unit.get("name", unit.get("id","")))
	else:
		# 无技能单位：同样弹出操作面板（移动 + 取消），保持交互统一
		_build_skill_menu([])


# Phase 7.1：单位详情面板（选中单位的 stats / 携带技能 / 状态效果）
func _refresh_unit_panel(unit: Dictionary) -> void:
	if unit.is_empty():
		_unit_panel.visible = false
		return
	var uid: String = str(unit.get("unitId", unit.get("id", "")))
	var name: String = str(unit.get("name", uid))
	var faction: String = str(unit.get("faction", unit.get("role", "")))
	var role: String = str(unit.get("role", unit.get("faction", "")))
	var hp: int = int(unit.get("hp", unit.get("currentHp", 0)))
	var max_hp: int = int(unit.get("maxHp", unit.get("max_hp", hp)))
	var ap: Dictionary = unit.get("action_points", {})
	var stats: Dictionary = unit.get("currentStats", unit.get("stats", {}))
	# 标题（我方单位用青色强调，敌方用常规色）
	var is_mine: bool = _my_unit_ids.has(uid)
	_unit_title.text = "%s%s" % [name, "（我方）" if is_mine else "（敌方）"]
	_unit_title.add_theme_color_override("font_color",
		UITheme.c("ally") if is_mine else UITheme.c("enemy"))
	# 基础属性
	var lines: PackedStringArray = []
	lines.append("ID: %s" % uid)
	lines.append("阵营/角色: %s / %s" % [faction, role])
	lines.append("HP: %d / %d" % [hp, max_hp])
	if not stats.is_empty():
		var sk := ""
		for k in stats.keys():
			sk += "  %s=%s\n" % [str(k), str(stats[k])]
		lines.append("属性:\n%s" % sk.strip_edges())
	# 行动力
	var ap_txt := "行动力: "
	for k in ap.keys():
		ap_txt += "%s=%d  " % [str(k), int(ap[k])]
	lines.append(ap_txt.strip_edges())
	# 状态效果
	var se: Array = unit.get("statusEffects", [])
	if se.size() > 0:
		var sst := "状态: "
		for e in se:
			if e is Dictionary:
				sst += "%s" % str(e.get("name", e.get("type", "?")))
				if e.has("duration"):
					sst += "(%d)" % int(e["duration"])
				sst += "  "
			else:
				sst += "%s  " % str(e)
		lines.append(sst.strip_edges())
	_unit_stats.text = "\n".join(lines)
	# 携带技能
	var skill_lines: PackedStringArray = ["携带技能:"]
	var skills: Array = unit.get("skills", [])
	if skills.size() == 0:
		skill_lines.append("  （无）")
	for sk2 in skills:
		if sk2 is Dictionary:
			skill_lines.append("  · %s" % str(sk2.get("name", sk2.get("skill_key", "?"))))
		else:
			skill_lines.append("  · %s" % str(sk2))
	_unit_skills.text = "\n".join(skill_lines)
	_unit_panel.visible = true


# ---------------- 阶段4：技能菜单 UI ----------------
func _build_skill_menu(skills: Array):
	# 清空旧按钮
	for c in skill_list.get_children():
		skill_list.remove_child(c)
		c.queue_free()
	# Phase 5.2：读取选中单位剩余行动力，AP 不足时禁用对应按钮
	var ap: Dictionary = _selected_unit.get("action_points", {})
	var ap_move: int = int(ap.get("MOVE", 1))
	var ap_attack: int = int(ap.get("ATTACK", 1))
	var ap_defend: int = int(ap.get("DEFEND", 1))
	# "移动"按钮（进入移动模式）
	var move_btn := Button.new()
	move_btn.text = "移动 (AP %d)" % ap_move
	move_btn.mouse_filter = Control.MOUSE_FILTER_STOP
	move_btn.disabled = ap_move <= 0
	move_btn.pressed.connect(_on_move_button_pressed)
	UITheme.apply_button(move_btn)
	skill_list.add_child(move_btn)
	# 防御按钮（对齐 alpha3 战场的 defend 动作）
	var defend_btn := Button.new()
	defend_btn.text = "防御 (AP %d)" % ap_defend
	defend_btn.mouse_filter = Control.MOUSE_FILTER_STOP
	defend_btn.disabled = ap_defend <= 0
	defend_btn.pressed.connect(_on_defend_pressed)
	UITheme.apply_button(defend_btn)
	skill_list.add_child(defend_btn)
	# 待机按钮（对齐 alpha3 战场的 wait 动作）
	var wait_btn := Button.new()
	wait_btn.text = "待机"
	wait_btn.mouse_filter = Control.MOUSE_FILTER_STOP
	wait_btn.pressed.connect(_on_wait_pressed)
	UITheme.apply_button(wait_btn)
	skill_list.add_child(wait_btn)
	# 各技能按钮（Phase 5.2：攻击类耗 ATTACK，辅助/防御类耗 DEFEND）
	for sk in skills:
		var rf: Dictionary = HexMath.get_skill_range_fields(sk)
		var btn := Button.new()
		var tf: String = str(sk.get("target_filter", sk.get("targetFilter", ""))).to_lower()
		var eff: String = str(sk.get("effect", "")).to_lower()
		var need_attack: bool = (tf == "enemy") or eff.contains("attack")
		var remain: int = ap_attack if need_attack else ap_defend
		btn.text = "%s  [射程 %d-%d · AP %d]" % [str(sk.get("name","?")), int(rf["minRange"]), int(rf["maxRange"]), remain]
		btn.mouse_filter = Control.MOUSE_FILTER_STOP
		btn.disabled = remain <= 0
		btn.pressed.connect(_on_skill_button_pressed.bind(sk))
		UITheme.apply_button(btn)
		skill_list.add_child(btn)
	# "取消"按钮（清除选中）
	var cancel_btn := Button.new()
	cancel_btn.text = "取消"
	cancel_btn.mouse_filter = Control.MOUSE_FILTER_STOP
	cancel_btn.pressed.connect(_clear_selection)
	UITheme.apply_button(cancel_btn)
	skill_list.add_child(cancel_btn)
	skill_menu.visible = true


func _on_move_button_pressed():
	_exit_skill_targeting()
	_enter_move_mode()


# 结束回合（顶栏常驻，对齐 alpha3 战场顶栏 endTurn）
func _on_end_turn_pressed():
	if _battle_id.is_empty():
		return
	status_label.text = "3D结束回合中…"
	# Phase 5.0：进入 ROUND_SETTLING（等待 WS 推送回合轮转）
	battle_sm.enter_round_settling()
	api.post_battle_action(_battle_id, "end-turn", {}, _on_endturn_ok, _on_http_err)


# Phase 7.2：打开词条库中枢编辑器（覆盖层，不卸载战斗场景）
func _on_open_glossary() -> void:
	if has_node("GlossaryStudio"):
		return
	var studio: Control = load("res://scenes/GlossaryStudio.tscn").instantiate()
	add_child(studio)


# 阶段7·武器库：打开机体/武器编辑器（覆盖层，复用 /units 端点）
func _on_open_unit_studio() -> void:
	if has_node("UnitStudio"):
		return
	var studio: Control = load("res://scenes/UnitStudio.gd").new()
	studio.name = "UnitStudio"
	add_child(studio)


func _on_endturn_ok(_data: Dictionary):
	status_label.text = "3D已结束回合，等待对手"
	# 实际态转移由 WS battle_state_updated → _refresh_turn_hud 校正（敌回合 ENEMY_TURN / 我方 UNIT_SELECTED）


# 防御（对齐 alpha3 战场的 defend 动作，走通用 /action 端点）
func _on_defend_pressed():
	if _selected_unit.is_empty():
		return
	var uid: String = str(_selected_unit.get("unitId", _selected_unit.get("id", "")))
	_clear_skill_menu()
	status_label.text = "3D防御中…"
	api.post_battle_action(_battle_id, "action", {
		"actionType": "defend", "params": {"unitId": uid}
	}, _on_action_ok, _on_http_err)


# 待机（对齐 alpha3 战场的 wait 动作，走通用 /action 端点）
func _on_wait_pressed():
	if _selected_unit.is_empty():
		return
	var uid: String = str(_selected_unit.get("unitId", _selected_unit.get("id", "")))
	_clear_skill_menu()
	status_label.text = "3D待机中…"
	api.post_battle_action(_battle_id, "action", {
		"actionType": "wait", "params": {"unitId": uid}
	}, _on_action_ok, _on_http_err)


func _on_action_ok(_data: Dictionary):
	_clear_selection()
	status_label.text = "3D动作完成"


func _on_skill_button_pressed(sk: Dictionary):
	_enter_skill_targeting(sk)


func _clear_skill_menu():
	skill_menu.visible = false
	for c in skill_list.get_children():
		skill_list.remove_child(c)
		c.queue_free()


func _clear_selection():
	_selected_unit = {}
	_awaiting_move_target = false
	_selected_skills = []
	_exit_skill_targeting()
	_clear_skill_menu()
	_clear_move_highlight()
	# Phase 7.1：隐藏单位详情面板
	_unit_panel.visible = false
	# Phase 5.0：回到 IDLE
	battle_sm.enter_idle()
	status_label.text = "3D已取消选中"


# ---------------- 移动范围高亮（3D 青色圆盘） ----------------
# 进入移动模式：本地枚举可达格（半径取 unit.moveRange，缺省 3），过滤占用格，绘制高亮
func _enter_move_mode():
	if _selected_unit.is_empty():
		return
	_clear_skill_menu()
	_clear_move_highlight()
	var pos: Dictionary = _selected_unit.get("position", {})
	if pos.is_empty():
		return
	var sq: int = int(pos.get("q", 0))
	var sr: int = int(pos.get("r", 0))
	var move_range: float = float(_selected_unit.get("moveRange", 3))
	if move_range <= 0:
		move_range = 3.0
	# 对齐后端 tsFindPath / 前端 2107：用地形加权可达性 BFS（非直线距离环），
	# 否则高亮格实际路径消耗 > moveRange 时后端会判 OUT_OF_RANGE。
	var occupied := {}
	var units = battle_state.get("units", {})
	var ul: Array = units.values() if units is Dictionary else (units if units is Array else [])
	var self_id: String = str(_selected_unit.get("unitId", _selected_unit.get("id", "")))
	for u in ul:
		if not (u is Dictionary):
			continue
		if str(u.get("unitId", u.get("id", ""))) == self_id:
			continue
		var p: Dictionary = u.get("position", {})
		if p.is_empty():
			continue
		occupied["%d,%d" % [int(p.get("q", 0)), int(p.get("r", 0))]] = true
	var all_cells = battle_state.get("cells", [])
	if all_cells is Dictionary:   # 兼容 {map:{cells:[]}} 结构
		all_cells = all_cells.get("cells", [])
	var movable: Array = HexMath.reachable_cells(sq, sr, move_range, all_cells, occupied)
	_draw_move_highlight(movable)
	_awaiting_move_target = true
	status_label.text = "3D已选 %s · 点目标格移动（%d格）" % [str(_selected_unit.get("name", self_id)), movable.size()]


func _draw_move_highlight(cells: Array):
	_hl.draw_move(cells, _move_hl_root, HL_Y_MOVE)


func _clear_move_highlight():
	for c in _move_hl_root.get_children():
		c.queue_free()


# ---------------- 阶段4：目标选择 + 高亮 ----------------
func _enter_skill_targeting(sk: Dictionary):
	_targeting_skill = sk
	# Phase 5.0：状态机进入 SKILL_TARGETING
	battle_sm.enter_skill_targeting(sk)
	var rf: Dictionary = HexMath.get_skill_range_fields(sk)
	_skill_target_cells = _compute_target_cells(sk, rf)
	_draw_skill_highlight(_skill_target_cells)
	_clear_aoe_highlight()   # 进入时尚未 Hover，先清空 AOE 预览
	status_label.text = "选择【%s】目标 · 右键/Esc 取消" % str(sk.get("name", ""))


# 判断两个单位是否"同一方"（己方）：ownerId / playerId / faction 任一相同即视为同方。
# 兼容 demo：U1 earth / U2 maxion 的 faction 不同 → 互为敌方；真实战局 ownerId 不同 → 互为敌方。
func _same_side(a: Dictionary, b: Dictionary) -> bool:
	var aid: String = str(a.get("ownerId", a.get("playerId", "")))
	var bid: String = str(b.get("ownerId", b.get("playerId", "")))
	if aid != "" and bid != "" and aid == bid:
		return true
	var af: String = str(a.get("faction", ""))
	var bf: String = str(b.get("faction", ""))
	if af != "" and bf != "" and af == bf:
		return true
	return false

func _compute_target_cells(sk: Dictionary, rf: Dictionary) -> Array:
	var tf: String = sk.get("target_filter", sk.get("targetFilter", "enemy"))
	var sel_q: int = int(_selected_unit.get("position", {}).get("q", 0))
	var sel_r: int = int(_selected_unit.get("position", {}).get("r", 0))
	# 1) 先枚举整个射程环（对齐 alpha3 skillRangeHexes），让玩家看到完整射程圈
	var ring: Array = HexMath.get_hexes_in_range(sel_q, sel_r, int(rf["maxRange"]))
	var cells: Array = []
	var valid_keys := {}
	for cell in ring:
		var cq: int = int(cell.q); var cr: int = int(cell.r)
		# minRange 过滤（近身不能打）
		if HexMath.hex_distance(sel_q, sel_r, cq, cr) < int(rf["minRange"]):
			continue
		cells.append({"q": cq, "r": cr, "unit": null})
		valid_keys["%d,%d" % [cq, cr]] = true
	# 2) 再对圈内单位做阵营/类型过滤，标记其 unit（用于精确命中），但范围圈始终显示
	var units = battle_state.get("units", {})
	var unit_list: Array = units.values() if units is Dictionary else units
	for u in unit_list:
		if not (u is Dictionary):
			continue
		var uq: int = int(u.get("position", {}).get("q", -999))
		var ur: int = int(u.get("position", {}).get("r", -999))
		var key: String = "%d,%d" % [uq, ur]
		if not valid_keys.has(key):
			continue   # 不在射程圈内
		if tf == "enemy" and _same_side(_selected_unit, u):
			continue
		if tf == "ally" and not _same_side(_selected_unit, u):
			continue
		# 标记该格的 unit（保留射程圈，同时记录可命中的单位）
		for c in cells:
			if int(c.q) == uq and int(c.r) == ur:
				c.unit = u
				break
	return cells


func _draw_skill_highlight(cells: Array):
	_hl.draw_skill(cells, _skill_hl_root, HL_Y_SKILL)


func _exit_skill_targeting():
	_targeting_skill = {}
	_skill_target_cells = []
	_clear_skill_highlight()
	_clear_aoe_highlight()
	# Phase 5.0：退出目标选择 → 仍有选中则回到 UNIT_SELECTED，否则 IDLE
	if not _selected_unit.is_empty():
		battle_sm.enter_unit_selected(str(_selected_unit.get("unitId", _selected_unit.get("id", ""))))
	else:
		battle_sm.enter_idle()


func _clear_skill_highlight():
	for c in _skill_hl_root.get_children():
		c.queue_free()


# ---------------- 阶段4.3：AOE 受击范围预览 ----------------
# Hover 在目标格时，若技能带 shape，实时算 AOE 受击格并叠加暗红高亮层
func _update_aoe_preview(hover_cell: Dictionary):
	if _targeting_skill.is_empty():
		return
	var shape = _targeting_skill.get("shape", null)
	if shape == null or shape == "":
		_clear_aoe_highlight()
		return
	var caster_pos: Dictionary = _selected_unit.get("position", {})
	var caster: Dictionary = {
		"q": int(caster_pos.get("q", 0)),
		"r": int(caster_pos.get("r", 0)),
	}
	var aoe_cells: Array = HexMath.aoe_cells_from_skill(caster, hover_cell, _targeting_skill)
	_draw_aoe_highlight(aoe_cells)


func _draw_aoe_highlight(cells: Array):
	_hl.draw_aoe(cells, _aoe_hl_root, HL_Y_AOE)


func _clear_aoe_highlight():
	for c in _aoe_hl_root.get_children():
		c.queue_free()


func _try_move(tq: int, tr: int):
	if _selected_unit.is_empty() or _battle_id.is_empty():
		return
	var uid: String = str(_selected_unit.get("unitId", _selected_unit.get("id", "")))
	status_label.text = "3D移动中…"
	_awaiting_move_target = true
	api.post_battle_action(_battle_id, "move", {
		"unitId": uid,
		"target_q": tq,
		"target_r": tr
	}, _on_move_ok, _on_move_err)


func _on_move_ok(_data: Dictionary):
	status_label.text = "3D移动指令已发送，等待同步…"

func _on_move_err(msg: String, _code: int):
	status_label.text = "3D移动失败: " + msg
	_awaiting_move_target = false
