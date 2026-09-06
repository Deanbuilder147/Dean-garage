extends Control

# 机体/武器编辑器（方案A）
# 对齐后端 /units 真实磁盘契约（实测）：
#   - 唯一标识：id (uuid)，非 uid
#   - stats / skills / attributes 均为「字符串化的 JSON」，保存时须原样序列化回传
#   - attributes.parts 是 dict：{ "主机体": {type,normalizedType,slot,格斗,射击,结构,机动,hp,maxHp,durability,...}, ... }
#   - attributes.skills_by_owner 是 dict：{ "主机体": [{skill_key,category,action_type,...}], ... }
#   - 顶层可写字段：name/faction/category/tier/sprite_key/size/codename/is_public
# PUT 校验为 warn 级（不阻断），故保存时把原 stats/skills/attributes 字符串原样回传，只改 parts / 顶层字段。

# 使用 autoload 单例 Api（注册于 project.godot），勿用 const preload 遮蔽为脚本类
# （否则 Api.xxx() 会被当静态调用报 "Cannot call non-static function"）

var list_panel: PanelContainer
var list_box: VBoxContainer
var status_label: Label
var form_box: VBoxContainer
var form_status: Label
var parts_box: VBoxContainer
var so_box: VBoxContainer

var _units := []          # GET /units 原始数组
var _selected_id := ""    # 当前编辑单位 id (uuid)
var _field_inputs := {}   # 核心字段输入映射
var _orig_attrs := {}     # 解析后的 attributes（含 parts dict 与 skills_by_owner dict）

# 顶层可编辑字符串字段
const TOP_FIELDS := ["name", "faction", "category", "tier", "sprite_key", "size", "codename"]
# 武器槽（attributes.parts 元素）的可编辑数值/枚举字段
const PART_NUM_FIELDS := ["格斗", "射击", "结构", "机动", "hp", "maxHp", "durability", "maxDurability", "skillSlots"]
const PART_STR_FIELDS := ["type", "normalizedType", "slot"]

func _ready() -> void:
	_build_static_ui()
	_apply_theme()
	_load_units()

# ---------- 静态 UI ----------
func _build_static_ui() -> void:
	var root := HBoxContainer.new()
	root.name = "HBox"
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.add_theme_constant_override("separation", 10)
	add_child(root)

	var left := VBoxContainer.new()
	left.name = "Left"
	left.custom_minimum_size = Vector2(300, 0)
	root.add_child(left)

	var ltitle := Label.new()
	ltitle.text = "机体库"
	ltitle.name = "ListTitle"
	left.add_child(ltitle)

	var lpanel := PanelContainer.new()
	lpanel.name = "ListPanel"
	lpanel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	left.add_child(lpanel)

	var lvbox := VBoxContainer.new()
	lvbox.name = "ListVBox"
	lpanel.add_child(lvbox)

	var lbox := VBoxContainer.new()
	lbox.name = "ListBox"
	lbox.size_flags_vertical = Control.SIZE_EXPAND_FILL
	lvbox.add_child(lbox)

	var sbar := HBoxContainer.new()
	sbar.add_theme_constant_override("separation", 6)
	left.add_child(sbar)
	sbar.add_child(_mk_btn("↻ 刷新", _on_refresh))
	sbar.add_child(_mk_btn("＋ 新建机体", _on_new_unit))

	var slabel := Label.new()
	slabel.name = "StatusLabel"
	slabel.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	left.add_child(slabel)

	var right := VBoxContainer.new()
	right.name = "Right"
	right.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	root.add_child(right)

	var rtitle := Label.new()
	rtitle.text = "机体 / 武器编辑"
	right.add_child(rtitle)

	var scroll := ScrollContainer.new()
	scroll.name = "Scroll"
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	right.add_child(scroll)

	var fvbox := VBoxContainer.new()
	fvbox.name = "FormVBox"
	fvbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(fvbox)

	_add_section(fvbox, "基础信息", "")
	for f in TOP_FIELDS:
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 8)
		var lab := Label.new()
		lab.text = f
		lab.custom_minimum_size = Vector2(90, 0)
		row.add_child(lab)
		var inp := LineEdit.new()
		inp.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		inp.name = "field_" + f
		inp.placeholder_text = f
		row.add_child(inp)
		_field_inputs[f] = inp
		fvbox.add_child(row)

	# 武器槽区
	var parts_sec := _add_section(fvbox, "武器槽 (attributes.parts)", "PartsSection")
	var pbox := VBoxContainer.new()
	pbox.name = "PartsBox"
	pbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	parts_sec.add_child(pbox)
	var padd := HBoxContainer.new()
	padd.add_theme_constant_override("separation", 6)
	padd.add_child(_mk_btn("＋ 添加武器槽", _on_add_part))
	parts_sec.add_child(padd)

	# skills_by_owner 区
	var so_sec := _add_section(fvbox, "机主技能 (attributes.skills_by_owner)", "SkillsOwnerSection")
	var sobox := VBoxContainer.new()
	sobox.name = "SkillsOwnerBox"
	sobox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	so_sec.add_child(sobox)

	var bar := HBoxContainer.new()
	bar.add_theme_constant_override("separation", 6)
	bar.add_child(_mk_btn("💾 保存", _on_save))
	bar.add_child(_mk_btn("🗑 删除", _on_delete))
	bar.add_child(_mk_btn("← 返回战斗", _on_back))
	fvbox.add_child(bar)

	var fstat := Label.new()
	fstat.name = "FormStatus"
	fstat.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	fvbox.add_child(fstat)

	# 赋值成员变量（节点已在上方创建）
	list_panel = $HBox/Left/ListPanel
	list_box = $HBox/Left/ListPanel/ListVBox/ListBox
	status_label = $HBox/Left/StatusLabel
	form_box = $HBox/Right/Scroll/FormVBox
	form_status = fstat
	parts_box = $HBox/Right/Scroll/FormVBox/PartsSection/PartsBox
	so_box = $HBox/Right/Scroll/FormVBox/SkillsOwnerSection/SkillsOwnerBox

func _add_section(parent: Control, title: String, sec_name: String) -> Control:
	var panel := PanelContainer.new()
	if sec_name != "":
		panel.name = sec_name
	parent.add_child(panel)
	var v := VBoxContainer.new()
	panel.add_child(v)
	var t := Label.new()
	t.text = title
	t.add_theme_font_size_override("font_size", 16)
	v.add_child(t)
	return v

# ---------- 主题 ----------
func _apply_theme() -> void:
	UITheme.apply_panel(self, 16, UITheme.c("panel"), UITheme.c("border"))
	UITheme.apply_label($HBox/Left/ListTitle, false, 20)
	UITheme.apply_panel(list_panel, 8, UITheme.c("panel2"), UITheme.c("accent2"))
	UITheme.apply_label(status_label, true, 13)
	UITheme.apply_label($HBox/Right/Scroll/FormVBox.get_child(0).get_child(0).get_child(0), false, 20)
	UITheme.apply_label(form_status, true, 13)
	for f in TOP_FIELDS:
		UITheme.apply_label(_field_inputs[f].get_parent().get_child(0), true, 13)
		_field_inputs[f].add_theme_color_override("font_color", UITheme.c("text"))
	UITheme.apply_panel($HBox/Right/Scroll/FormVBox/PartsSection, 6, UITheme.c("panel1"), UITheme.c("accent1"))
	UITheme.apply_panel($HBox/Right/Scroll/FormVBox/SkillsOwnerSection, 6, UITheme.c("panel1"), UITheme.c("accent1"))

# ---------- 数据加载 ----------
func _load_units() -> void:
	Api.list_units(_on_units_loaded, _on_err.bind("加载机体列表失败"))

func _on_units_loaded(data: Dictionary) -> void:
	var arr = data.get("units", [])
	if not typeof(arr) == TYPE_ARRAY:
		arr = []
	_units = arr
	_refresh_list()

func _refresh_list() -> void:
	for c in list_box.get_children():
		c.queue_free()
	for u in _units:
		var key = str(u.get("id", ""))
		var nm = str(u.get("name", key))
		var btn := _mk_btn("%s  ·  %s" % [nm, key], _on_pick.bind(key))
		UITheme.apply_button(btn)
		list_box.add_child(btn)

func _on_pick(uid: String) -> void:
	_selected_id = uid
	for u in _units:
		if str(u.get("id", "")) == uid:
			_fill_form(u)
			status_label.text = "已载入：%s" % str(u.get("name", uid))
			return

func _parse_json_field(variant_val) -> Variant:
	if typeof(variant_val) == TYPE_STRING:
		if variant_val.strip_edges() == "":
			return null
		var p = JSON.parse_string(variant_val)
		return p
	return variant_val

func _fill_form(u: Dictionary) -> void:
	for f in TOP_FIELDS:
		var val = u.get(f, "")
		_field_inputs[f].text = "" if val == null else str(val)
	# attributes（字符串 → dict）
	var attrs_raw = _parse_json_field(u.get("attributes", ""))
	if typeof(attrs_raw) != TYPE_DICTIONARY:
		attrs_raw = {}
	_orig_attrs = attrs_raw.duplicate(true)
	var parts: Dictionary = attrs_raw.get("parts", {})
	if typeof(parts) != TYPE_DICTIONARY:
		parts = {}
	_render_parts(parts)
	var so: Dictionary = attrs_raw.get("skills_by_owner", {})
	if typeof(so) != TYPE_DICTIONARY:
		so = {}
	_render_so(so)

func _render_parts(parts: Dictionary) -> void:
	for c in parts_box.get_children():
		c.queue_free()
	if parts.is_empty():
		var empty := Label.new()
		empty.text = "（暂无武器槽，点「＋ 添加武器槽」）"
		parts_box.add_child(empty)
		return
	for slot_key in parts.keys():
		parts_box.add_child(_mk_part_panel(slot_key, parts[slot_key]))

func _mk_part_panel(slot_key: String, part: Dictionary) -> Control:
	var panel := PanelContainer.new()
	panel.name = "part_" + slot_key
	var v := VBoxContainer.new()
	panel.add_child(v)
	var head := HBoxContainer.new()
	var title := Label.new()
	title.text = "武器槽：%s" % slot_key
	head.add_child(title)
	head.add_child(_mk_btn("✕ 删除槽", _on_del_part.bind(slot_key)))
	v.add_child(head)

	# slot 名（key）编辑
	var krow := HBoxContainer.new()
	krow.add_theme_constant_override("separation", 8)
	var klab := Label.new()
	klab.text = "slot名(key)"
	klab.custom_minimum_size = Vector2(110, 0)
	krow.add_child(klab)
	var kinp := LineEdit.new()
	kinp.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	kinp.text = slot_key
	kinp.name = "partkey_" + slot_key
	krow.add_child(kinp)
	v.add_child(krow)

	for k in PART_STR_FIELDS:
		var val = str(part.get(k, ""))
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 8)
		var lab := Label.new()
		lab.text = k
		lab.custom_minimum_size = Vector2(110, 0)
		row.add_child(lab)
		var inp := LineEdit.new()
		inp.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		inp.text = val
		inp.name = "part_%s_%s" % [slot_key, k]
		row.add_child(inp)
		v.add_child(row)
	for k in PART_NUM_FIELDS:
		var val = str(part.get(k, 0))
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 8)
		var lab := Label.new()
		lab.text = k
		lab.custom_minimum_size = Vector2(110, 0)
		row.add_child(lab)
		var inp := LineEdit.new()
		inp.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		inp.text = val
		inp.name = "part_%s_%s" % [slot_key, k]
		row.add_child(inp)
		v.add_child(row)
	return panel

func _render_so(so: Dictionary) -> void:
	for c in so_box.get_children():
		c.queue_free()
	if so.is_empty():
		var empty := Label.new()
		empty.text = "（暂无机主技能，格式：{ \"机主key\": [\"skill_key\", ...] }）"
		so_box.add_child(empty)
		return
	for owner_key in so.keys():
		var arr = so[owner_key]
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 8)
		var lab := Label.new()
		lab.text = str(owner_key)
		lab.custom_minimum_size = Vector2(120, 0)
		row.add_child(lab)
		var inp := LineEdit.new()
		inp.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var txt := ""
		if typeof(arr) == TYPE_ARRAY:
			var ks := []
			for e in arr:
				if typeof(e) == TYPE_DICTIONARY:
					ks.append(str(e.get("skill_key", "")))
				else:
					ks.append(str(e))
			txt = ", ".join(ks)
		inp.text = txt
		inp.name = "so_" + str(owner_key)
		row.add_child(inp)
		so_box.add_child(row)

# ---------- payload（对齐后端真实契约）----------
func _collect_payload() -> Dictionary:
	var payload := {}
	for f in TOP_FIELDS:
		var raw: String = _field_inputs[f].text.strip_edges()
		if raw == "":
			continue
		if f == "tier":
			payload[f] = raw.to_int()
		else:
			payload[f] = raw
	# 重新收集 attributes.parts（dict，key 为槽位名）
	var parts := {}
	for panel in parts_box.get_children():
		if not panel is PanelContainer:
			continue
		var v := panel.get_child(0)
		# 读取 slot 名
		var new_key := ""
		var part := {}
		for row in v.get_children():
			if not row is HBoxContainer:
				continue
			var lab: Label = row.get_child(0)
			var inp: LineEdit = row.get_child(1)
			var k := lab.text
			var txt := inp.text.strip_edges()
			if k == "slot名(key)":
				new_key = txt if txt != "" else panel.name.trim_prefix("part_")
			elif k in PART_STR_FIELDS:
				part[k] = txt
			elif k in PART_NUM_FIELDS:
				part[k] = txt.to_int()
		if new_key == "":
			new_key = panel.name.trim_prefix("part_")
		parts[new_key] = part
	# 收集 skills_by_owner（dict）
	var so := {}
	for row in so_box.get_children():
		if not row is HBoxContainer:
			continue
		var lab: Label = row.get_child(0)
		var inp: LineEdit = row.get_child(1)
		var keys := []
		for seg in inp.text.split(","):
			seg = seg.strip_edges()
			if seg != "":
				keys.append(seg)
		so[lab.text] = keys
	# 合并回 attributes（保留原 attributes 中其它字段）
	var attrs := _orig_attrs.duplicate(true) if typeof(_orig_attrs) == TYPE_DICTIONARY else {}
	attrs["parts"] = parts
	attrs["skills_by_owner"] = so
	payload["attributes"] = JSON.stringify(attrs)
	return payload

# ---------- 操作 ----------
func _on_refresh() -> void:
	status_label.text = "刷新中…"
	_load_units()

func _on_new_unit() -> void:
	_selected_id = ""
	for f in TOP_FIELDS:
		_field_inputs[f].text = ""
	_field_inputs["name"].text = "新机体"
	_field_inputs["faction"].text = "earth"
	_orig_attrs = {"parts": {}, "skills_by_owner": {}}
	_render_parts({})
	_render_so({})
	form_status.text = "新建模式：保存后将创建新机体。"

func _on_add_part() -> void:
	var idx := parts_box.get_child_count() + 1
	var slot_key := "槽位%d" % idx
	var part := {"type": "武器", "normalizedType": "melee", "slot": slot_key,
		"格斗": 0, "射击": 0, "结构": 0, "机动": 0, "hp": 0, "maxHp": 0,
		"durability": 0, "maxDurability": 0, "skillSlots": 0}
	parts_box.add_child(_mk_part_panel(slot_key, part))

func _on_del_part(slot_key: String) -> void:
	for panel in parts_box.get_children():
		if panel is PanelContainer and panel.name == "part_" + slot_key:
			panel.queue_free()
			return

func _on_save() -> void:
	form_status.text = "保存中…"
	var payload := _collect_payload()
	if _selected_id == "":
		Api.create_unit(payload, _on_saved, _on_err.bind("新建机体失败"))
	else:
		Api.update_unit(_selected_id, payload, _on_saved, _on_err.bind("更新机体失败"))

func _on_saved(_data: Dictionary) -> void:
	form_status.text = "✅ 已保存。"
	_load_units()

func _on_delete() -> void:
	if _selected_id == "":
		form_status.text = "（新建模式无需删除）"
		return
	Api.delete_unit(_selected_id, _on_deleted, _on_err.bind("删除机体失败"))

func _on_deleted(_data: Dictionary) -> void:
	form_status.text = "🗑 已删除。"
	_selected_id = ""
	_load_units()

func _on_back() -> void:
	queue_free()

# ---------- 工具 ----------
func _mk_btn(text: String, cb: Callable) -> Button:
	var b := Button.new()
	b.text = text
	b.connect("pressed", cb)
	return b

func _on_err(msg: String, _http: int, _body: String) -> void:
	status_label.text = "❌ %s" % msg
	form_status.text = "❌ %s" % msg
