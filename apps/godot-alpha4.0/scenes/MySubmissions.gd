extends Control

# 我的投稿（复刻 8081 /my-units）
# GET /api/map/my-submissions 列出当前用户提交的战场/地图，显示审核状态。

var status_label: Label
var list_box: VBoxContainer

var _items := []

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
	title.text = "📥 我的投稿"
	title.add_theme_font_size_override("font_size", 20)
	v.add_child(title)

	var slabel := Label.new()
	slabel.name = "StatusLabel"
	slabel.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	v.add_child(slabel)

	var top := HBoxContainer.new()
	top.add_theme_constant_override("separation", 8)
	top.add_child(_mk_btn("↻ 刷新", _on_refresh))
	top.add_child(_mk_btn("＋ 新建地图", _on_new))
	top.add_child(_mk_btn("← 返回首页", _on_back))
	v.add_child(top)

	var lsec := PanelContainer.new()
	lsec.name = "ListSection"
	lsec.size_flags_vertical = Control.SIZE_EXPAND_FILL
	v.add_child(lsec)
	var lv := VBoxContainer.new()
	lsec.add_child(lv)
	var ltitle := Label.new()
	ltitle.text = "我的地图投稿"
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

func _load() -> void:
	Api.list_my_map_submissions(_on_loaded, _on_err.bind("加载我的投稿失败"))

func _on_loaded(d: Dictionary) -> void:
	var arr = d.get("submissions", [])
	if typeof(arr) != TYPE_ARRAY:
		arr = d.get("data", [])
	if typeof(arr) != TYPE_ARRAY:
		arr = []
	_items = arr
	_refresh_list()

func _refresh_list() -> void:
	for c in list_box.get_children():
		c.queue_free()
	if _items.is_empty():
		var e := Label.new()
		e.text = "（暂无投稿，点「新建地图」去编辑器）"
		list_box.add_child(e)
		return
	for it in _items:
		var lab := Label.new()
		lab.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		lab.text = "🗺 %s  状态:%s  尺寸:%sx%s" % [it.get("name",""), it.get("status",""), it.get("width",""), it.get("height","")]
		list_box.add_child(lab)

func _on_refresh() -> void:
	status_label.text = "刷新中…"
	_load()

func _on_new() -> void:
	# 打开地图编辑器（新建模式）
	SceneManager.to_scene("res://scenes/MapEditor.gd")

func _on_back() -> void:
	SceneManager.to_home()

func _mk_btn(text: String, cb: Callable) -> Button:
	var b := Button.new()
	b.text = text
	b.connect("pressed", cb)
	return b

func _on_err(msg: String, _c: int, _b: String) -> void:
	status_label.text = "❌ %s" % msg
