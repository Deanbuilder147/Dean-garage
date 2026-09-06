extends Control

@onready var api = Api

const TEST_USER := "deantest"
const TEST_PASS := "7654321"

@onready var user_edit: LineEdit = $VBox/UserEdit
@onready var pass_edit: LineEdit = $VBox/PassEdit
@onready var login_btn: Button = $VBox/LoginBtn
@onready var reg_btn: Button = $VBox/RegBtn
@onready var hint: Label = $VBox/Hint


func _ready():
	# 套用统一主题
	UITheme.apply_panel(self, 16, UITheme.c("panel"), UITheme.c("border"))
	UITheme.apply_label($VBox/Title, false, 28)
	for e in [$VBox/UserEdit, $VBox/PassEdit]:
		e.add_theme_stylebox_override("normal", UITheme.panel(6, UITheme.c("panel2"), UITheme.c("border")))
		e.add_theme_color_override("font_color", UITheme.c("text"))
	for b in [login_btn, reg_btn]:
		UITheme.apply_button(b, 8)
	UITheme.apply_label(hint, true, 14)

	user_edit.text = TEST_USER
	pass_edit.text = TEST_PASS
	pass_edit.secret = true

	login_btn.pressed.connect(_on_login)
	reg_btn.pressed.connect(_on_register)

	# 已登录则直接进入大厅（延迟到场景树稳定后，避免过早切场景警告）
	if not api.get_token().is_empty():
		call_deferred("_deferred_enter_lobby")


func _deferred_enter_lobby():
	SceneManager.to_home()


func _on_login():
	hint.text = "登录中…"
	api.login(user_edit.text.strip_edges(), pass_edit.text, _on_login_ok, _on_err)


func _on_register():
	hint.text = "注册中…"
	api.register(user_edit.text.strip_edges(), pass_edit.text, "", _on_login_ok, _on_err)


func _on_login_ok(data: Dictionary):
	SceneManager.ctx["user"] = data.get("user", {})
	SceneManager.to_home()


func _on_err(msg: String, _code: int):
	hint.text = "错误: " + msg
