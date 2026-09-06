extends Control

# AI 素材工坊（复刻 8081 /asset-gen）
# POST /api/asset-gen/generate {prompt, ...} 文本提示词模式（图片上传需 multipart，Godot 端暂用提示词）。
# GET /api/asset-gen/credits 显示剩余积分。

var status_label: Label
var credits_label: Label
var prompt_input: TextEdit

func _ready() -> void:
	_build_ui()
	_apply_theme()
	_load_credits()

func _build_ui() -> void:
	var v := VBoxContainer.new()
	v.name = "VBox"
	v.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(v)

	var title := Label.new()
	title.text = "🎨 AI 素材工坊"
	title.add_theme_font_size_override("font_size", 20)
	v.add_child(title)

	var cl := Label.new()
	cl.name = "CreditsLabel"
	v.add_child(cl)

	var slabel := Label.new()
	slabel.name = "StatusLabel"
	slabel.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	v.add_child(slabel)

	var top := HBoxContainer.new()
	top.add_theme_constant_override("separation", 8)
	top.add_child(_mk_btn("🎨 生成", _on_generate))
	top.add_child(_mk_btn("← 返回首页", _on_back))
	v.add_child(top)

	var fsec := PanelContainer.new()
	fsec.name = "FormSection"
	v.add_child(fsec)
	var fv := VBoxContainer.new()
	fsec.add_child(fv)
	var lab := Label.new()
	lab.text = "提示词（prompt）"
	fv.add_child(lab)
	var inp := TextEdit.new()
	inp.name = "PromptInput"
	inp.custom_minimum_size = Vector2(0, 160)
	inp.placeholder_text = "描述你想要的棋子/地形材质…"
	fv.add_child(inp)

	status_label = $VBox/StatusLabel
	credits_label = $VBox/CreditsLabel
	prompt_input = inp

func _apply_theme() -> void:
	UITheme.apply_panel(self, 16, UITheme.c("panel"), UITheme.c("border"))
	UITheme.apply_label(status_label, true, 13)
	UITheme.apply_label(credits_label, true, 13)
	UITheme.apply_panel($VBox/FormSection, 8, UITheme.c("panel2"), UITheme.c("accent2"))

func _load_credits() -> void:
	Api.asset_gen_credits(_on_credits, _on_err.bind("读取积分失败"))

func _on_credits(d: Dictionary) -> void:
	credits_label.text = "剩余积分：%s" % str(d.get("credits", d.get("data", "?")))

func _on_generate() -> void:
	var prompt := prompt_input.text.strip_edges()
	if prompt == "":
		status_label.text = "❌ 请填写提示词"
		return
	status_label.text = "生成中（调用 Meowa）…"
	Api.asset_gen_generate({"prompt": prompt}, _on_gen, _on_err.bind("生成失败"))

func _on_gen(d: Dictionary) -> void:
	status_label.text = "✅ 已提交：%s" % str(d.get("url", d.get("message", "完成"))
		).substr(0, 200)

func _on_back() -> void:
	SceneManager.to_home()

func _mk_btn(text: String, cb: Callable) -> Button:
	var b := Button.new()
	b.text = text
	b.connect("pressed", cb)
	return b

func _on_err(msg: String, _c: int, _b: String) -> void:
	status_label.text = "❌ %s" % msg
