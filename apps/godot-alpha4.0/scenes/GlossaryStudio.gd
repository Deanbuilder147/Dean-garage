extends Control
# 阶段7.2：词条库中枢编辑器（Godot 版六段式技能配方器）
# 对齐 backend-gateway/src/routes/glossary.ts 的 Hub 路由组与真实六段式词条 schema。
# 真实词条结构（GET /hub-config → glossary.skills 为 dict）：
#   skill_key / name / category / action_type / target_scope /
#   timing{trigger,phase} / cost{ap,charges,cooldown,limit_scope} /
#   roll{mode,generator,segments} / target{scope,min_range,max_range} /
#   conditions[] / effects[] / meta_ops / faction_role
# 后端 generateHubDraft 仅消费 name/category/action_type/target_scope/skill_key/faction_role，
# 其余字段由骨架注入；本编辑器据此设计表单，避免发送后端不认识的扁平字段。
# 纯代码构建 UI（避免 tscn 手写结构错误），从 Api autoload 读写。

@onready var api = Api

var _list_box: VBoxContainer
var _form_scroll: ScrollContainer
var _form_box: VBoxContainer
var _result_box: TextEdit
var _status: Label

var _skills: Array = []
var _selected_key: String = ""
var _fields: Dictionary = {}  # field_name -> Control

const CATEGORIES := ["melee", "ranged", "support", "auto", "automation", "special"]
const ACTIONS := ["attack", "heal", "buff", "debuff", "passive"]
const SCOPES := ["single_enemy", "single_ally", "self", "aoe_enemy", "aoe_ally", "all_enemy"]
# 基础可编辑字段（对齐 generateHubDraft 消费 + target 嵌套范围）
const EDIT_FIELDS := [
	{"key": "skill_key", "label": "技能Key(唯一主键)", "type": "line", "path": "skill_key"},
	{"key": "name", "label": "显示名", "type": "line", "path": "name"},
	{"key": "category", "label": "分类(决定默认射程)", "type": "option", "path": "category", "opts": CATEGORIES},
	{"key": "action_type", "label": "动作类型", "type": "option", "path": "action_type", "opts": ACTIONS},
	{"key": "target_scope", "label": "目标范围", "type": "option", "path": "target_scope", "opts": SCOPES},
	{"key": "min_range", "label": "最小射程(min_range)", "type": "line", "path": "target.min_range"},
	{"key": "max_range", "label": "最大射程(max_range)", "type": "line", "path": "target.max_range"},
]
# 高级区（JSON 文本编辑，对应后端嵌套结构，留空则由骨架注入）
const ADVANCED_FIELDS := [
	{"key": "effects", "label": "effects (JSON数组，留空用骨架)", "type": "multiline"},
	{"key": "conditions", "label": "conditions (JSON数组，留空用骨架)", "type": "multiline"},
	{"key": "cost", "label": "cost (JSON，留空用骨架)", "type": "multiline"},
]


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	_build_ui()
	_load_list()


func _build_ui() -> void:
	var root := VBoxContainer.new()
	root.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(root)

	var bar := HBoxContainer.new()
	root.add_child(bar)
	bar.add_child(_mk_btn_themed("＋ 新建", _on_new))
	bar.add_child(_mk_btn_themed("↻ 刷新", _on_refresh))
	bar.add_child(_mk_btn_themed("💾 保存", _on_save))
	bar.add_child(_mk_btn_themed("🗑 删除", _on_delete))
	bar.add_child(_mk_spacer())
	bar.add_child(_mk_btn_themed("← 返回战斗", _on_back))

	_status = Label.new()
	UITheme.apply_label(_status, true, 14)
	_status.text = "加载中…"
	root.add_child(_status)

	var mid := HBoxContainer.new()
	mid.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root.add_child(mid)

	var list_panel := PanelContainer.new()
	UITheme.apply_panel(list_panel, 8, UITheme.c("panel2"), UITheme.c("accent2"))
	mid.add_child(list_panel)
	var list_wrap := VBoxContainer.new()
	list_wrap.custom_minimum_size = Vector2(280, 0)
	list_panel.add_child(list_wrap)
	var list_title := Label.new()
	UITheme.apply_label(list_title, false, 16)
	list_title.text = "技能列表 (Hub)"
	list_wrap.add_child(list_title)
	var list_scroll := ScrollContainer.new()
	list_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	list_wrap.add_child(list_scroll)
	_list_box = VBoxContainer.new()
	list_scroll.add_child(_list_box)

	_form_scroll = ScrollContainer.new()
	_form_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_form_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	mid.add_child(_form_scroll)
	_form_box = VBoxContainer.new()
	_form_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_form_scroll.add_child(_form_box)
	_build_form()

	var bottom := VBoxContainer.new()
	root.add_child(bottom)
	var bbar := HBoxContainer.new()
	bottom.add_child(bbar)
	bbar.add_child(_mk_btn_themed("🎯 靶场试算(test-skill)", _on_test))
	var hint := Label.new()
	UITheme.apply_label(hint, true, 13)
	hint.text = "  （免鉴权，真实引擎结算单回合）"
	bbar.add_child(hint)
	_result_box = TextEdit.new()
	_result_box.editable = false
	_result_box.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_result_box.custom_minimum_size = Vector2(0, 150)
	_result_box.add_theme_color_override("default_color", Color(0.8, 1.0, 0.9))
	UITheme.apply_panel(_result_box, 6, UITheme.c("panel1"), UITheme.c("accent1"))
	bottom.add_child(_result_box)


func _build_form() -> void:
	for child in _form_box.get_children():
		child.queue_free()
	_fields.clear()
	for f in EDIT_FIELDS + ADVANCED_FIELDS:
		var label := Label.new()
		UITheme.apply_label(label, true, 14)
		label.text = f["label"]
		_form_box.add_child(label)
		var ctrl: Control
		if f["type"] == "multiline":
			var te := TextEdit.new()
			te.custom_minimum_size = Vector2(0, 90)
			te.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			ctrl = te
		elif f["type"] == "option":
			var ob := OptionButton.new()
			ob.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			for o in f["opts"]:
				ob.add_item(o)
			ctrl = ob
		else:
			var le := LineEdit.new()
			le.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			ctrl = le
		UITheme.apply_panel(ctrl, 4, UITheme.c("panel1"), UITheme.c("accent1"))
		_form_box.add_child(ctrl)
		_fields[f["key"]] = ctrl


# ---------- 数据加载 ----------
func _load_list() -> void:
	_status.text = "拉取词条库…"
	api.get_hub_config(_on_list_ok, _on_err)


func _on_list_ok(data: Dictionary) -> void:
	# 真实返回：{ success, glossary: { skills: {<key>: {...}} }, skillCount }
	var glossary: Dictionary = data.get("glossary", data)
	var skills_map = glossary.get("skills", {})
	var arr: Array = []
	if skills_map is Dictionary:
		arr = skills_map.values()
	elif skills_map is Array:
		arr = skills_map
	_skills = arr
	_status.text = "共 %d 条技能（含核心兜底）" % _skills.size()
	for child in _list_box.get_children():
		child.queue_free()
	for s in _skills:
		if not (s is Dictionary):
			continue
		var key: String = str(s.get("skill_key", s.get("key", "?")))
		var nm: String = str(s.get("name", key))
		var cat: String = str(s.get("category", ""))
		var btn: Button = _mk_btn("%s  ·  %s  [%s]" % [nm, key, cat], _on_pick.bind(key))
		UITheme.apply_button(btn)
		btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		_list_box.add_child(btn)


# ---------- 选择 / 填充表单 ----------
func _on_pick(key: String) -> void:
	_selected_key = key
	var found: Dictionary = {}
	for s in _skills:
		if not (s is Dictionary):
			continue
		if str(s.get("skill_key", s.get("key", ""))) == key:
			found = s
			break
	_fill_form(found)
	_status.text = "已选中: %s" % key


func _get_nested(s: Dictionary, path: String):
	var cur: Variant = s
	for part in path.split("."):
		if cur is Dictionary and cur.has(part):
			cur = cur[part]
		else:
			return null
	return cur


func _fill_form(s: Dictionary) -> void:
	for f in EDIT_FIELDS + ADVANCED_FIELDS:
		var key: String = f["key"]
		var ctrl: Control = _fields.get(key)
		if ctrl == null:
			continue
		if f.has("path"):
			var val = _get_nested(s, f["path"])
			if ctrl is LineEdit:
				(ctrl as LineEdit).text = "" if val == null else str(val)
			elif ctrl is OptionButton:
				var idx: int = f["opts"].find(str(val))
				(ctrl as OptionButton).selected = idx if idx >= 0 else 0
		else:
			# 高级区：整个子对象转 JSON 文本
			var sub = s.get(key, null)
			if ctrl is TextEdit:
				(ctrl as TextEdit).text = "" if sub == null else JSON.stringify(sub)


func _read_form() -> Dictionary:
	var out: Dictionary = {}
	for f in EDIT_FIELDS:
		var key: String = f["key"]
		var ctrl: Control = _fields.get(key)
		if ctrl == null:
			continue
		if ctrl is LineEdit:
			out[key] = (ctrl as LineEdit).text.strip_edges()
		elif ctrl is OptionButton:
			out[key] = f["opts"][(ctrl as OptionButton).selected]
	# target 嵌套：min_range / max_range
	var tgt: Dictionary = {}
	if _fields.has("min_range") and (_fields["min_range"] as LineEdit).text.strip_edges().is_valid_int():
		tgt["min_range"] = int((_fields["min_range"] as LineEdit).text.strip_edges())
	if _fields.has("max_range") and (_fields["max_range"] as LineEdit).text.strip_edges().is_valid_int():
		tgt["max_range"] = int((_fields["max_range"] as LineEdit).text.strip_edges())
	var payload: Dictionary = {
		"skill_key": out.get("skill_key", _selected_key),
		"name": out.get("name", ""),
		"category": out.get("category", "ranged"),
		"action_type": out.get("action_type", "attack"),
		"target_scope": out.get("target_scope", "single_enemy"),
	}
	if not tgt.is_empty():
		payload["target"] = tgt
	# 高级区：解析 JSON 文本，失败则忽略（用骨架默认）
	for f in ADVANCED_FIELDS:
		var ctrl: Control = _fields.get(f["key"])
		if ctrl == null or not (ctrl is TextEdit):
			continue
		var raw: String = (ctrl as TextEdit).text.strip_edges()
		if raw.is_empty():
			continue
		var pv: Variant = JSON.parse_string(raw)
		if pv != null:
			payload[f["key"]] = pv
	return payload


# ---------- 写操作 ----------
func _on_new() -> void:
	_selected_key = ""
	_fill_form({})
	_status.text = "新建草稿（填 skill_key + 名称后保存）"


func _on_save() -> void:
	if _selected_key == "":
		var k: String = (_fields["skill_key"] as LineEdit).text.strip_edges()
		if k.is_empty():
			_status.text = "错误：未指定 skill_key（先用「新建」填写）"
			return
		_selected_key = k
	var payload: Dictionary = _read_form()
	payload["skill_key"] = _selected_key
	var exists := _skills.any(func(s): return (s is Dictionary) and str(s.get("skill_key", s.get("key", ""))) == _selected_key)
	if exists:
		api.update_hub_skill(_selected_key, payload, _on_write_ok, _on_err)
	else:
		api.create_hub_skill(payload, _on_write_ok, _on_err)


func _on_delete() -> void:
	if _selected_key == "":
		_status.text = "错误：未选中要删除的技能"
		return
	api.delete_hub_skill(_selected_key, _on_write_ok, _on_err)


func _on_write_ok(_data: Dictionary) -> void:
	_status.text = "已保存 ✓ 重新加载列表…"
	_load_list()


func _on_test() -> void:
	if _selected_key == "":
		_result_box.text = "请先选中或填写 skill_key"
		return
	_status.text = "靶场试算中…"
	api.test_skill(_selected_key, _on_test_ok, _on_err, {})


func _on_test_ok(data: Dictionary) -> void:
	_result_box.text = JSON.stringify(data, "", 2)
	_status.text = "靶场试算完成"


func _on_refresh() -> void:
	_load_list()


func _on_back() -> void:
	if get_tree().current_scene == self:
		get_tree().quit()
	else:
		queue_free()


func _on_err(msg: String) -> void:
	_status.text = "错误: %s" % msg
	_result_box.text = msg


# ---------- 工具 ----------
func _mk_btn(text: String, cb: Callable) -> Button:
	var b := Button.new()
	b.text = text
	b.pressed.connect(cb)
	return b

# 创建按钮并套用统一主题（apply_button 返回 void，不能作 add_child 参数）
func _mk_btn_themed(text: String, cb: Callable) -> Button:
	var b := _mk_btn(text, cb)
	UITheme.apply_button(b)
	return b


func _mk_spacer() -> Control:
	var c := Control.new()
	c.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return c
