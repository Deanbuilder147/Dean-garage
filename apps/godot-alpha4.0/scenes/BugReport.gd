extends Control

# 问题反馈（复刻 8081 /bug-report）
# POST /api/bug-report {module,severity,title,description,contact}
# 提交后可查看反馈列表（referee/dominator 权限）。

var status_label: Label
var list_box: VBoxContainer

var _inputs := {}

func _ready() -> void:
	_build_ui()
	_apply_theme()

func _build_ui() -> void:
	var v := VBoxContainer.new()
	v.name = "VBox"
	v.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(v)

	var title := Label.new()
	title.text = "🐞 问题反馈"
	title.add_theme_font_size_override("font_size", 20)
	v.add_child(title)

	var slabel := Label.new()
	slabel.name = "StatusLabel"
	slabel.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	v.add_child(slabel)

	var top := HBoxContainer.new()
	top.add_theme_constant_override("separation", 8)
	top.add_child(_mk_btn("📤 提交反馈", _on_submit))
	top.add_child(_mk_btn("↻ 刷新列表", _on_refresh_list))
	top.add_child(_mk_btn("← 返回首页", _on_back))
	v.add_child(top)

	var form := PanelContainer.new()
	form.add_theme_constant_override("margin_top", 6)
	v.add_child(form)
	var fv := VBoxContainer.new()
	form.add_child(fv)

	for f in ["module", "severity", "title", "description", "contact"]:
		var row := VBoxContainer.new()
		var lab := Label.new()
		lab.text = f
		row.add_child(lab)
		var inp: Control
		if f == "description":
			inp = TextEdit.new()
			inp.custom_minimum_size = Vector2(0, 120)
		else:
			inp = LineEdit.new()
			inp.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		inp.name = "in_" + f
		inp.placeholder_text = f
		row.add_child(inp)
		_inputs[f] = inp
		fv.add_child(row)

	var lsec := PanelContainer.new()
	lsec.name = "ListSection"
	lsec.size_flags_vertical = Control.SIZE_EXPAND_FILL
	v.add_child(lsec)
	var lv := VBoxContainer.new()
	lsec.add_child(lv)
	var ltitle := Label.new()
	ltitle.text = "反馈列表（审核员可见）"
	lv.add_child(ltitle)
	var lbox := VBoxContainer.new()
	lbox.name = "ListBox"
	lbox.size_flags_vertical = Control.SIZE_EXPAND_FILL
	lv.add_child(lbox)

	status_label = $VBox/StatusLabel
	list_box = lbox

func _apply_theme() -> void:
	UITheme.apply_panel(self, 16, UITheme.c("panel"), UITheme.c("border"))
	UITheme.apply_label(status_label, true, 13)
	UITheme.apply_panel($VBox/ListSection, 8, UITheme.c("panel2"), UITheme.c("accent2"))

func _on_submit() -> void:
	var payload := {}
	for f in _inputs.keys():
		var ctrl = _inputs[f]
		var val := ""
		if ctrl is TextEdit:
			val = ctrl.text.strip_edges()
		else:
			val = ctrl.text.strip_edges()
		if val != "":
			payload[f] = val
	if not payload.has("title") or not payload.has("description"):
		status_label.text = "❌ 标题与描述必填"
		return
	status_label.text = "提交中…"
	Api.submit_bug_report(payload, _on_submitted, _on_err.bind("提交失败"))

func _on_submitted(_d: Dictionary) -> void:
	status_label.text = "✅ 反馈已提交，感谢！"
	for f in _inputs.keys():
		if _inputs[f] is TextEdit:
			_inputs[f].text = ""
		else:
			_inputs[f].text = ""
	_on_refresh_list()

func _on_refresh_list() -> void:
	Api.list_bug_reports(_on_list, _on_err.bind("读取反馈列表失败（需审核员权限）"))

func _on_list(data: Dictionary) -> void:
	var arr = data.get("reports", [])
	if typeof(arr) != TYPE_ARRAY:
		arr = []
	for c in list_box.get_children():
		c.queue_free()
	if arr.is_empty():
		var e := Label.new()
		e.text = "（暂无反馈或权限不足）"
		list_box.add_child(e)
		return
	for r in arr:
		var lab := Label.new()
		lab.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		lab.text = "[%s/%s] %s — %s (状态:%s)" % [r.get("module",""), r.get("severity",""), r.get("title",""), r.get("reporter_name",""), r.get("status","")]
		list_box.add_child(lab)

func _on_back() -> void:
	SceneManager.to_home()

func _mk_btn(text: String, cb: Callable) -> Button:
	var b := Button.new()
	b.text = text
	b.connect("pressed", cb)
	return b

func _on_err(msg: String, _c: int, _b: String) -> void:
	status_label.text = "❌ %s" % msg
