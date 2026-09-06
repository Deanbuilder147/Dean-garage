# ============================================================
# net/api_client.gd
# HTTP 通信层（GDScript 移植版）
# 对齐 frontend/src/api/client.js + battleSocket.js
#
# 职责：封装 Godot HTTPRequest，对接 Node 后端（backend-gateway /api）。
#   - 自动附带 Authorization: Bearer <token>
#   - 公开路径白名单免 token
#   - 统一 JSON 解析 + 错误回调
#
# 注意：作为 autoload 单例 "ApiClient" 使用；脚本不再声明 class_name
# 以免与同名 autoload 单例冲突。
# ============================================================
extends Node

# ---- 配置（对齐 client.js） ----
const BASE_URL := "http://106.54.197.69:8081/api"  # 后端网关入口
const TOKEN_KEY := "mecha_jwt"
const USER_KEY := "mecha_user"

# 免 token 的公开路径（前缀匹配）
const PUBLIC_PATHS := [
	"/auth/login", "/auth/register",
	"/rooms", "/rooms/",
	"/map/list", "/map/",
	"/combat-glossary/config", "/combat-glossary/",
	"/size-config",
]

signal auth_changed(user: Dictionary)

var _token: String = ""
var _user: Dictionary = {}
var _pending: Array = []  # 等待待发请求（token 恢复后）

# ---- token 持久化 ----
func _ready():
	_load_session()

func _load_session():
	_token = ""
	if FileAccess.file_exists("user://token.dat"):
		var f := FileAccess.open("user://token.dat", FileAccess.READ)
		_token = f.get_line().strip_edges()
		f.close()
	if FileAccess.file_exists("user://user.dat"):
		var f := FileAccess.open("user://user.dat", FileAccess.READ)
		var txt := f.get_as_text()
		f.close()
		var p: Dictionary = JSON.parse_string(txt)
		if p != null:
			_user = p

func _save_session():
	var ft := FileAccess.open("user://token.dat", FileAccess.WRITE)
	ft.store_line(_token)
	ft.close()
	var fu := FileAccess.open("user://user.dat", FileAccess.WRITE)
	fu.store_string(JSON.stringify(_user))
	fu.close()

func set_token(token: String, user: Dictionary = {}):
	_token = token
	_user = user
	_save_session()
	auth_changed.emit(_user)
	# 发送等待中的请求
	var queued := _pending.duplicate()
	_pending.clear()
	for cb in queued:
		cb.call()

func get_token() -> String:
	return _token

func get_user() -> Dictionary:
	return _user

func logout():
	_token = ""
	_user = {}
	if FileAccess.file_exists("user://token.dat"):
		DirAccess.remove_absolute("user://token.dat")
	if FileAccess.file_exists("user://user.dat"):
		DirAccess.remove_absolute("user://user.dat")

# ---- 公开路径判定 ----
func _is_public(path: String) -> bool:
	for p in PUBLIC_PATHS:
		if path.begins_with(p):
			return true
	return false

# ---- 核心请求 ----
# on_ok(result: Dictionary), on_err(msg: String, code: int)
func request(method: String, path: String, body: Variant = null, on_ok: Callable = Callable(), on_err: Callable = Callable()):
	var url := BASE_URL + path
	var http := HTTPRequest.new()
	add_child(http)
	http.request_completed.connect(
		func(_r, code, _h, body_bytes):
			_on_response(http, code, body_bytes, on_ok, on_err)
	)
	var headers := PackedStringArray()
	if not _token.is_empty():
		headers.append("Authorization: Bearer " + _token)
	headers.append("Content-Type: application/json")
	var use_body := ""
	if body != null:
		use_body = JSON.stringify(body)
	var m := HTTPClient.METHOD_GET
	match method.to_upper():
		"GET": m = HTTPClient.METHOD_GET
		"POST": m = HTTPClient.METHOD_POST
		"PUT": m = HTTPClient.METHOD_PUT
		"DELETE": m = HTTPClient.METHOD_DELETE
		"HEAD": m = HTTPClient.METHOD_HEAD
		"OPTIONS": m = HTTPClient.METHOD_OPTIONS
		"PATCH": m = HTTPClient.METHOD_PATCH
	var err := http.request(url, headers, m, use_body)
	if err != OK:
		if on_err.is_valid():
			on_err.call("HTTP 请求失败: %d" % err, err)

func _on_response(http: HTTPRequest, code: int, body_bytes: PackedByteArray, on_ok: Callable, on_err: Callable):
	http.queue_free()
	var txt := body_bytes.get_string_from_utf8()
	var data = null
	if not txt.is_empty():
		data = JSON.parse_string(txt)
	if code >= 200 and code < 300:
		if on_ok.is_valid():
			on_ok.call(data if data != null else {})
	else:
		var msg := "HTTP %d" % code
		if data is Dictionary and data.has("error"):
			msg = str(data["error"])
		elif data is Dictionary and data.has("message"):
			msg = str(data["message"])
		if on_err.is_valid():
			on_err.call(msg, code)

# ====================== 端点封装 ======================
# 对齐 client.js 的 apiClient ===========================

# 登录：POST /auth/login {username,password} → {token,user}
func login(username: String, password: String, on_ok: Callable, on_err: Callable):
	request("POST", "/auth/login", {"username": username, "password": password},
		func(data):
			if data is Dictionary and data.has("token"):
				set_token(data["token"], data.get("user", {}))
			on_ok.call(data),
		on_err)

func register(username: String, email: String, password: String, on_ok: Callable, on_err: Callable):
	request("POST", "/auth/register", {"username": username, "email": email, "password": password}, on_ok, on_err)

# 房间列表：GET /rooms
func list_rooms(on_ok: Callable, on_err: Callable):
	request("GET", "/rooms", null, on_ok, on_err)

func create_room(payload: Dictionary, on_ok: Callable, on_err: Callable):
	request("POST", "/rooms", payload, on_ok, on_err)

func join_room(room_id: String, payload: Dictionary, on_ok: Callable, on_err: Callable):
	request("POST", "/rooms/%s/join" % room_id, payload, on_ok, on_err)

func leave_room(room_id: String, on_ok: Callable, on_err: Callable):
	request("POST", "/rooms/%s/leave" % room_id, null, on_ok, on_err)

func get_room(room_id: String, on_ok: Callable, on_err: Callable):
	request("GET", "/rooms/%s" % room_id, null, on_ok, on_err)

# 地图列表：GET /map/list
func list_maps(on_ok: Callable, on_err: Callable):
	request("GET", "/map/list", null, on_ok, on_err)

# 单地图战场：GET /map/list?id={id}（对齐后端 maps.ts 单文件分支）
func get_map(map_id: String, on_ok: Callable, on_err: Callable):
	request("GET", "/map/list?id=%s" % map_id, null, on_ok, on_err)

# 战斗：GET /combat/{id}/state
func get_battle_state(battle_id: String, on_ok: Callable, on_err: Callable):
	request("GET", "/combat/%s/state" % battle_id, null, on_ok, on_err)

# 创建战局：POST /combat  body {battlefield_id}
func create_battle(battlefield_id: String, on_ok: Callable, on_err: Callable):
	request("POST", "/combat", {"battlefield_id": battlefield_id}, on_ok, on_err)

func post_battle_action(battle_id: String, action: String, payload: Dictionary, on_ok: Callable, on_err: Callable):
	request("POST", "/combat/%s/%s" % [battle_id, action], payload, on_ok, on_err)

# 词条库配置：GET /api/combat-glossary/config
func get_glossary_config(on_ok: Callable, on_err: Callable):
	request("GET", "/combat-glossary/config", null, on_ok, on_err)

# ====================== 词条库中枢 Hub（六段式编辑器） ======================
# 对齐 backend-gateway/src/routes/glossary.ts 的 Hub 路由组（阶段7.2）
# 全量读取（含核心技能兜底）：GET /combat-glossary/hub-config
func get_hub_config(on_ok: Callable, on_err: Callable):
	request("GET", "/combat-glossary/hub-config", null, on_ok, on_err)

# 单条读取：GET /combat-glossary/hub-config/:key
func get_hub_skill(key: String, on_ok: Callable, on_err: Callable):
	request("GET", "/combat-glossary/hub-config/%s" % key, null, on_ok, on_err)

# 新建草稿（需 glossary.edit 权限）：POST /combat-glossary/hub-config
func create_hub_skill(payload: Dictionary, on_ok: Callable, on_err: Callable):
	request("POST", "/combat-glossary/hub-config", payload, on_ok, on_err)

# 更新（核心技能受保护）：PUT /combat-glossary/hub-config/:key
func update_hub_skill(key: String, payload: Dictionary, on_ok: Callable, on_err: Callable):
	request("PUT", "/combat-glossary/hub-config/%s" % key, payload, on_ok, on_err)

# 删除（核心技能受保护）：DELETE /combat-glossary/hub-config/:key
func delete_hub_skill(key: String, on_ok: Callable, on_err: Callable):
	request("DELETE", "/combat-glossary/hub-config/%s" % key, null, on_ok, on_err)

# 靶场单回合模拟（免鉴权）：POST /combat-glossary/test-skill {key, target?}
# 返回结构化结算结果（伤害/状态/文本），供编辑器实时试算
func test_skill(key: String, on_ok: Callable, on_err: Callable, target: Dictionary = {}):
	var body := {"key": key}
	if not target.is_empty():
		body["target"] = target
	request("POST", "/combat-glossary/test-skill", body, on_ok, on_err)

# 七视图尺寸配置：GET /api/combat/size-config
func get_size_config(on_ok: Callable, on_err: Callable):
	request("GET", "/combat/size-config", null, on_ok, on_err)

# 七视图尺寸配置热更：PUT /api/combat/size-config
func put_size_config(payload: Dictionary, on_ok: Callable, on_err: Callable):
	request("PUT", "/combat/size-config", payload, on_ok, on_err)

# 骰子工坊配置：GET /api/combat/dice-config
func get_dice_config(on_ok: Callable, on_err: Callable):
	request("GET", "/combat/dice-config", null, on_ok, on_err)

# 骰子工坊配置热更：PUT /api/combat/dice-config
func put_dice_config(payload: Dictionary, on_ok: Callable, on_err: Callable):
	request("PUT", "/combat/dice-config", payload, on_ok, on_err)

# ---- 账号 ----
func get_me(on_ok: Callable, on_err: Callable):
	request("GET", "/auth/me", null, on_ok, on_err)

func update_profile(payload: Dictionary, on_ok: Callable, on_err: Callable):
	request("PUT", "/auth/profile", payload, on_ok, on_err)

func change_password(old_pwd: String, new_pwd: String, on_ok: Callable, on_err: Callable):
	request("POST", "/auth/change-password", {"old_password": old_pwd, "new_password": new_pwd}, on_ok, on_err)

# ---- 房间辅助 ----
func get_room_by_code(code: String, on_ok: Callable, on_err: Callable):
	request("GET", "/rooms/by-code/%s" % code, null, on_ok, on_err)

func set_ready(room_id: String, ready: bool, on_ok: Callable, on_err: Callable):
	request("POST", "/rooms/%s/ready" % room_id, {"ready": ready}, on_ok, on_err)

func start_room(room_id: String, on_ok: Callable, on_err: Callable):
	request("POST", "/rooms/%s/start" % room_id, null, on_ok, on_err)

# 设置玩家出战单位：PUT /api/rooms/:roomId/players/:userId/units
func set_player_units(room_id: String, user_id: String, unit_ids: Array, on_ok: Callable, on_err: Callable):
	request("PUT", "/rooms/%s/players/%s/units" % [room_id, user_id], {"unitIds": unit_ids}, on_ok, on_err)

func lock_roster(room_id: String, on_ok: Callable, on_err: Callable):
	request("POST", "/rooms/%s/lock-roster" % room_id, null, on_ok, on_err)

func send_room_chat(room_id: String, text: String, on_ok: Callable, on_err: Callable):
	request("POST", "/rooms/%s/chat" % room_id, {"message": text}, on_ok, on_err)

# ---- C 档：单位编辑器 ----
# 单位列表：GET /api/units  （visibility 可传 "all"/"public"/"my"）
func list_units(on_ok: Callable, on_err: Callable, visibility := "all"):
	var q := "" if visibility == "all" else "?visibility=%s" % visibility
	request("GET", "/units%s" % q, null, on_ok, on_err)

func create_unit(payload: Dictionary, on_ok: Callable, on_err: Callable):
	request("POST", "/units", payload, on_ok, on_err)

func get_unit(unit_id: String, on_ok: Callable, on_err: Callable):
	request("GET", "/units/%s" % unit_id, null, on_ok, on_err)

func update_unit(unit_id: String, payload: Dictionary, on_ok: Callable, on_err: Callable):
	request("PUT", "/units/%s" % unit_id, payload, on_ok, on_err)

func delete_unit(unit_id: String, on_ok: Callable, on_err: Callable):
	request("DELETE", "/units/%s" % unit_id, null, on_ok, on_err)

func create_unit_from_json(json_text: String, on_ok: Callable, on_err: Callable):
	request("POST", "/units/create-from-json", {"json": json_text}, on_ok, on_err)

func list_public_units(on_ok: Callable, on_err: Callable):
	request("GET", "/units/public", null, on_ok, on_err)

func list_my_submissions(on_ok: Callable, on_err: Callable):
	request("GET", "/units/my-submissions", null, on_ok, on_err)

# ---- 地图编辑器 / 战场（复刻 8081 地图编辑器 + 我的投稿） ----
# 战场列表：GET /api/map/battlefields
func list_battlefields(on_ok: Callable, on_err: Callable):
	request("GET", "/map/battlefields", null, on_ok, on_err)

# 单战场：GET /api/map/battlefields/:id
func get_battlefield(id: String, on_ok: Callable, on_err: Callable):
	request("GET", "/map/battlefields/%s" % id, null, on_ok, on_err)

# 新建战场：POST /api/map/battlefields  body {name,width,height,terrain,spawns,...}
func create_battlefield(payload: Dictionary, on_ok: Callable, on_err: Callable):
	request("POST", "/map/battlefields", payload, on_ok, on_err)

# 更新战场：PUT /api/map/battlefields/:id
func update_battlefield(id: String, payload: Dictionary, on_ok: Callable, on_err: Callable):
	request("PUT", "/map/battlefields/%s" % id, payload, on_ok, on_err)

# 删除战场：DELETE /api/map/battlefields/:id
func delete_battlefield(id: String, on_ok: Callable, on_err: Callable):
	request("DELETE", "/map/battlefields/%s" % id, null, on_ok, on_err)

# 我的投稿（地图）：GET /api/map/my-submissions
func list_my_map_submissions(on_ok: Callable, on_err: Callable):
	request("GET", "/map/my-submissions", null, on_ok, on_err)

# 审核队列（admin/dominator）：GET /api/map/review-queue
func list_review_queue(on_ok: Callable, on_err: Callable):
	request("GET", "/map/review-queue", null, on_ok, on_err)

# 审核：POST /api/map/:mapId/review  body {status, note}
func review_map(map_id: String, status: String, note: String, on_ok: Callable, on_err: Callable):
	request("POST", "/map/%s/review" % map_id, {"status": status, "note": note}, on_ok, on_err)

# ---- 问题反馈 BugReport（复刻 8081 问题反馈） ----
# 提交：POST /api/bug-report  body {module,severity,title,description,contact}
func submit_bug_report(payload: Dictionary, on_ok: Callable, on_err: Callable):
	request("POST", "/bug-report", payload, on_ok, on_err)

# 列表（referee/dominator）：GET /api/bug-report/list
func list_bug_reports(on_ok: Callable, on_err: Callable):
	request("GET", "/bug-report/list", null, on_ok, on_err)

# 更新状态：PUT /api/bug-report/:id  body {status}
func update_bug_report(id: String, status: String, on_ok: Callable, on_err: Callable):
	request("PUT", "/bug-report/%s" % id, {"status": status}, on_ok, on_err)

# ---- 后台管理 AdminCenter（复刻 8081 后台管理） ----
# 用户列表（dominator）：GET /api/admin/list-users
func admin_list_users(on_ok: Callable, on_err: Callable):
	request("GET", "/admin/list-users", null, on_ok, on_err)

# 搜索用户：GET /api/admin/search-users?q=
func admin_search_users(q: String, on_ok: Callable, on_err: Callable):
	request("GET", "/admin/search-users?q=%s" % q, null, on_ok, on_err)

# 改用户角色（dominator）：PUT /api/admin/set-role  body {userId,role}
func admin_set_role(user_id: String, role: String, on_ok: Callable, on_err: Callable):
	request("PUT", "/admin/set-role", {"userId": user_id, "role": role}, on_ok, on_err)

# 改用户（dominator）：PUT /api/admin/users/:userId  body {credits?,role?,isActive?}
func admin_update_user(user_id: String, payload: Dictionary, on_ok: Callable, on_err: Callable):
	request("PUT", "/admin/users/%s" % user_id, payload, on_ok, on_err)

# 赠送积分：POST /api/admin/gift-credits  body {userId,amount}
func admin_gift_credits(user_id: String, amount: int, on_ok: Callable, on_err: Callable):
	request("POST", "/admin/gift-credits", {"userId": user_id, "amount": amount}, on_ok, on_err)

# 功能开关：GET/PUT /api/admin/features
func admin_get_features(on_ok: Callable, on_err: Callable):
	request("GET", "/admin/features", null, on_ok, on_err)

func admin_put_features(payload: Dictionary, on_ok: Callable, on_err: Callable):
	request("PUT", "/admin/features", payload, on_ok, on_err)

# ---- AI 素材工坊（复刻 8081，依赖 Meowa） ----
# 生成：POST /api/asset-gen/generate  body {prompt, ...}（注意：图片上传需 multipart，这里仅文本提示词模式）
func asset_gen_generate(payload: Dictionary, on_ok: Callable, on_err: Callable):
	request("POST", "/asset-gen/generate", payload, on_ok, on_err)

# 积分：GET /api/asset-gen/credits
func asset_gen_credits(on_ok: Callable, on_err: Callable):
	request("GET", "/asset-gen/credits", null, on_ok, on_err)
