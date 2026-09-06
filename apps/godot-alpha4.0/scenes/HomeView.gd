extends Control

# 首页 + 侧边栏导航枢纽（复刻 8081 TheSidebar 的导航结构）
# 登录后入口。侧边栏链接到所有基础功能场景。

const NAV := [
	{"key": "home",      "label": "🏠 首页",       "scene": ""},
	{"key": "units",     "label": "🛠 单位编辑器",  "scene": "res://scenes/UnitStudio.gd"},
	{"key": "battlefield-edit", "label": "🗺 地图编辑器", "scene": "res://scenes/MapEditor.gd"},
	{"key": "battlefields", "label": "⚔ 战术部署",   "scene": "res://scenes/nav/RoomLobby.tscn"},
	{"key": "glossary",  "label": "📖 词条库",      "scene": "res://scenes/GlossaryStudio.tscn"},
	{"key": "asset-gen", "label": "🎨 AI素材工坊",  "scene": "res://scenes/AssetGen.gd"},
	{"key": "bug-report","label": "🐞 问题反馈",    "scene": "res://scenes/BugReport.gd"},
	{"key": "unit-library","label": "🤖 棋子库",    "scene": "res://scenes/UnitLibrary.gd"},
	{"key": "my-units",  "label": "📥 我的投稿",    "scene": "res://scenes/MySubmissions.gd"},
	{"key": "admin-center","label": "🛡 后台管理",  "scene": "res://scenes/AdminCenter.gd"},
]

var content: Control
var status_label: Label

func _ready() -> void:
	_build_ui()
	_apply_theme()
	_render_home()

func _build_ui() -> void:
	var root := HBoxContainer.new()
	root.name = "HBox"
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(root)

	# 侧边栏
	var side := VBoxContainer.new()
	side.custom_minimum_size = Vector2(220, 0)
	side.name = "Side"
	root.add_child(side)

	var logo := Label.new()
	logo.text = "MECHA 控制台"
	logo.add_theme_font_size_override("font_size", 18)
	side.add_child(logo)

	var user := Label.new()
	user.name = "UserLabel"
	var u: Dictionary = SceneManager.ctx.get("user", {})
	user.text = "用户：%s" % str(u.get("username", "未登录"))
	user.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	side.add_child(user)

	var nav_box := VBoxContainer.new()
	nav_box.name = "NavBox"
	nav_box.size_flags_vertical = Control.SIZE_EXPAND_FILL
	nav_box.add_theme_constant_override("separation", 4)
	side.add_child(nav_box)

	for item in NAV:
		var btn := Button.new()
		btn.text = item.label
		btn.name = "nav_" + item.key
		btn.alignment = HORIZONTAL_ALIGNMENT_LEFT
		btn.connect("pressed", _on_nav.bind(item.key))
		nav_box.add_child(btn)

	side.add_child(_mk_btn("🚪 退出登录", _on_logout))

	# 内容区
	var content := VBoxContainer.new()
	content.name = "Content"
	content.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	root.add_child(content)

	var slabel := Label.new()
	slabel.name = "StatusLabel"
	slabel.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	content.add_child(slabel)

	# 赋值成员变量（供 _ready 后续阶段使用）
	self.content = content
	status_label = slabel

func _apply_theme() -> void:
	UITheme.apply_panel(self, 0, UITheme.c("bg"), Color(0, 0, 0, 0))
	UITheme.apply_panel($HBox/Side, 10, UITheme.c("panel2"), UITheme.c("border"))
	UITheme.apply_label($HBox/Side.get_child(0), false, 18)
	UITheme.apply_label($HBox/Side/UserLabel, true, 13)
	for item in NAV:
		UITheme.apply_button($HBox/Side/NavBox.get_node("nav_" + item.key))
	UITheme.apply_button($HBox/Side.get_child($HBox/Side.get_child_count() - 1))
	UITheme.apply_label(status_label, true, 14)

func _on_nav(key: String) -> void:
	var item := _find(key)
	if item == null:
		return
	if item.scene == "":
		_render_home()
		return
	status_label.text = "打开：%s" % item.label
	# 直接切换场景（子功能为独立全屏场景，自带返回）
	SceneManager.to_scene(item.scene)

func _find(key: String) -> Dictionary:
	for item in NAV:
		if item.key == key:
			return item
	return {}

func _render_home() -> void:
	status_label.text = "欢迎使用 MECHA 控制台（Godot 客户端）。\n左侧为功能导航，复刻自 8081 网页端侧边栏。"
	# 清理旧内容（保留 StatusLabel）
	for c in content.get_children():
		if c != status_label:
			c.queue_free()

	var cards := GridContainer.new()
	cards.columns = 2
	cards.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	cards.add_theme_constant_override("h_separation", 12)
	cards.add_theme_constant_override("v_separation", 12)
	content.add_child(cards)
	for item in NAV:
		if item.key == "home":
			continue
		var card := PanelContainer.new()
		var v := VBoxContainer.new()
		card.add_child(v)
		var t := Label.new()
		t.text = item.label
		t.add_theme_font_size_override("font_size", 16)
		v.add_child(t)
		var open := _mk_btn("进入", _on_nav.bind(item.key))
		v.add_child(open)
		cards.add_child(card)
		UITheme.apply_panel(card, 8, UITheme.c("panel"), UITheme.c("accent2"))
		UITheme.apply_button(open)

func _on_logout() -> void:
	Api.logout()
	SceneManager.reset()
	SceneManager.to_login()

func _mk_btn(text: String, cb: Callable) -> Button:
	var b := Button.new()
	b.text = text
	b.connect("pressed", cb)
	return b
