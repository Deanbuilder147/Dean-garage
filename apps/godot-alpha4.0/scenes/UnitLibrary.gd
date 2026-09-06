extends Control

# 棋子库（复刻 8081 /unit-library）
# 展示公开单位 /units/public，列出名称/阵营/分类，可查看详情。

var list_box: VBoxContainer
var detail: Label
var status_label: Label

var _units := []

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
	title.text = "🤖 棋子库（公开单位）"
	title.add_theme_font_size_override("font_size", 20)
	v.add_child(title)

	var slabel := Label.new()
	slabel.name = "StatusLabel"
	slabel.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	v.add_child(slabel)

	var top := HBoxContainer.new()
	top.add_theme_constant_override("separation", 8)
	top.add_child(_mk_btn("↻ 刷新", _on_refresh))
	top.add_child(_mk_btn("← 返回首页", _on_back))
	v.add_child(top)

	var h := HBoxContainer.new()
	h.size_flags_vertical = Control.SIZE_EXPAND_FILL
	h.add_theme_constant_override("separation", 10)
	v.add_child(h)

	var lsec := PanelContainer.new()
	lsec.name = "ListSection"
	lsec.custom_minimum_size = Vector2(360, 0)
	lsec.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	h.add_child(lsec)
	var lv := VBoxContainer.new()
	lsec.add_child(lv)
	var ltitle := Label.new()
	ltitle.text = "单位列表"
	lv.add_child(ltitle)
	var lbox := VBoxContainer.new()
	lbox.name = "ListBox"
	lbox.size_flags_vertical = Control.SIZE_EXPAND_FILL
	lv.add_child(lbox)

	var dsec := PanelContainer.new()
	dsec.name = "DetailSection"
	dsec.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	h.add_child(dsec)
	var dv := VBoxContainer.new()
	dsec.add_child(dv)
	var dtitle := Label.new()
	dtitle.text = "详情"
	dv.add_child(dtitle)
	var dl := Label.new()
	dl.name = "DetailLabel"
	dl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	dl.size_flags_vertical = Control.SIZE_EXPAND_FILL
	dv.add_child(dl)

	list_box = $VBox/ListSection/ListBox
	detail = dl
	status_label = $VBox/StatusLabel

func _apply_theme() -> void:
	UITheme.apply_panel(self, 16, UITheme.c("panel"), UITheme.c("border"))
	UITheme.apply_label(status_label, true, 13)
	UITheme.apply_panel($VBox/ListSection, 8, UITheme.c("panel2"), UITheme.c("accent2"))
	UITheme.apply_panel($VBox/DetailSection, 8, UITheme.c("panel1"), UITheme.c("accent1"))

func _load() -> void:
	Api.list_public_units(_on_loaded, _on_err.bind("加载棋子库失败"))

func _on_loaded(data: Dictionary) -> void:
	var arr = data.get("units", [])
	if typeof(arr) != TYPE_ARRAY:
		arr = data.get("data", [])
	if typeof(arr) != TYPE_ARRAY:
		arr = []
	_units = arr
	_refresh_list()

func _refresh_list() -> void:
	for c in list_box.get_children():
		c.queue_free()
	for u in _units:
		var nm = str(u.get("name", "?"))
		var fac = str(u.get("faction", ""))
		var cat = str(u.get("category", ""))
		var btn := _mk_btn("%s · %s/%s" % [nm, fac, cat], _on_pick.bind(u))
		UITheme.apply_button(btn)
		list_box.add_child(btn)

func _on_pick(u: Dictionary) -> void:
	var s := "名称：%s\n阵营：%s\n分类：%s\n" % [u.get("name",""), u.get("faction",""), u.get("category","")]
	var attrs = u.get("attributes", "")
	if typeof(attrs) == TYPE_STRING and attrs != "":
		var p = JSON.parse_string(attrs)
		if typeof(p) == TYPE_DICTIONARY:
			var parts: Dictionary = p.get("parts", {})
			s += "武器槽(%d)：%s\n" % [parts.size(), ", ".join(parts.keys())]
	var stats = u.get("stats", "")
	if typeof(stats) == TYPE_STRING and stats != "":
		var st = JSON.parse_string(stats)
		if typeof(st) == TYPE_DICTIONARY:
			s += "属性：HP=%s 攻击=%s 防御=%s 机动=%s\n" % [st.get("hp",0), st.get("attack",0), st.get("defense",0), st.get("mobility",0)]
	detail.text = s

func _on_refresh() -> void:
	status_label.text = "刷新中…"
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
