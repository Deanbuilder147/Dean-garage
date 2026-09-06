extends Control

# 后台管理（复刻 8081 /admin-center，dominator 权限）
# GET /api/admin/list-users 列出用户
# PUT /api/admin/set-role {userId,role} 改角色
# POST /api/admin/gift-credits {userId,amount} 赠积分

var status_label: Label
var list_box: VBoxContainer
var search_input: LineEdit

var _users := []

func _ready() -> void:
	_build_ui()
	_apply_theme()
	_load()

func _build_ui() -> void:
	var v := VBoxContainer.new()
	v.name = "VBox"
	v.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(v)

	var title := Label.new()
	title.text = "🛡 后台管理（仅管理员）"
	title.add_theme_font_size_override("font_size", 20)
	v.add_child(title)

	var slabel := Label.new()
	slabel.name = "StatusLabel"
	slabel.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	v.add_child(slabel)

	var top := HBoxContainer.new()
	top.name = "Top"
	top.add_theme_constant_override("separation", 8)
	var sinp := LineEdit.new()
	sinp.name = "SearchInput"
	sinp.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	sinp.placeholder_text = "搜索用户名"
	top.add_child(sinp)
	top.add_child(_mk_btn("🔍 搜索", _on_search))
	top.add_child(_mk_btn("↻ 刷新", _on_refresh))
	top.add_child(_mk_btn("← 返回首页", _on_back))
	v.add_child(top)

	var lsec := PanelContainer.new()
	lsec.name = "ListSection"
	lsec.size_flags_vertical = Control.SIZE_EXPAND_FILL
	v.add_child(lsec)
	var lv := VBoxContainer.new()
	lsec.add_child(lv)
	var ltitle := Label.new()
	ltitle.text = "用户列表"
	lv.add_child(ltitle)
	var lbox := VBoxContainer.new()
	lbox.name = "ListBox"
	lbox.size_flags_vertical = Control.SIZE_EXPAND_FILL
	lv.add_child(lbox)

	status_label = $VBox/StatusLabel
	list_box = lbox
	search_input = $VBox/Top/SearchInput

func _apply_theme() -> void:
	UITheme.apply_panel(self, 16, UITheme.c("panel"), UITheme.c("border"))
	UITheme.apply_label(status_label, true, 13)
	UITheme.apply_panel($VBox/ListSection, 8, UITheme.c("panel2"), UITheme.c("accent2"))

func _load() -> void:
	Api.admin_list_users(_on_loaded, _on_err.bind("加载用户失败（需管理员权限）"))

func _on_search() -> void:
	var q := search_input.text.strip_edges()
	if q == "":
		_load()
		return
	Api.admin_search_users(q, _on_loaded, _on_err.bind("搜索失败"))

func _on_loaded(d: Dictionary) -> void:
	var arr = d.get("users", [])
	if typeof(arr) != TYPE_ARRAY:
		arr = d.get("data", [])
	if typeof(arr) != TYPE_ARRAY:
		arr = []
	_users = arr
	_refresh_list()

func _refresh_list() -> void:
	for c in list_box.get_children():
		c.queue_free()
	if _users.is_empty():
		var e := Label.new()
		e.text = "（无用户或权限不足）"
		list_box.add_child(e)
		return
	for u in _users:
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 6)
		var info := Label.new()
		info.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		info.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		info.text = "%s · 角色:%s · 积分:%s" % [u.get("username",""), u.get("role",""), u.get("credits",0)]
		row.add_child(info)
		var rid := str(u.get("id", u.get("userId", "")))
		row.add_child(_mk_btn("升管理员", _on_set_role.bind(rid, "dominator")))
		row.add_child(_mk_btn("+100积分", _on_gift.bind(rid, 100)))
		list_box.add_child(row)

func _on_set_role(uid: String, role: String) -> void:
	status_label.text = "修改角色中…"
	Api.admin_set_role(uid, role, _on_ok, _on_err.bind("改角色失败"))

func _on_gift(uid: String, amount: int) -> void:
	status_label.text = "赠送积分中…"
	Api.admin_gift_credits(uid, amount, _on_ok, _on_err.bind("赠积分失败"))

func _on_ok(_d: Dictionary) -> void:
	status_label.text = "✅ 操作成功"
	_load()

func _on_refresh() -> void:
	search_input.text = ""
	_load()

func _on_back() -> void:
	SceneManager.to_home()

func _mk_btn(text: String, cb: Callable) -> Button:
	var b := Button.new()
	b.text = text
	b.connect("pressed", cb)
	return b

func _on_err(msg: String, _c: int, _b: String) -> void:
	status_label.text = "❌ %s" % msg
