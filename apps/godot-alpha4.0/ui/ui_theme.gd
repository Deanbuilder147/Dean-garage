# ============================================================
# ui/ui_theme.gd  (autoload: UITheme)
#
# Godot 客户端统一视觉主题。此前 Battle3D/Battle2D 的 HUD 是裸
# Label/Button（prototype 态），本单例提供配色常量与 StyleBox 工厂，
# 让所有战斗/导航 HUD 套用一致的科技感深色面板 + 琥珀/青强调色。
#
# 配色锚定原 Web 端 UITheme（琥珀主色），此处取其在 Godot 下的等价值。
# ============================================================
extends Node

# ---- 配色（Color 常量，alpha 已含） ----
const C_BG_PANEL    := Color(0.00, 0.06, 0.09, 0.82)   # 面板底（深青黑）
const C_BG_PANEL_2  := Color(0.02, 0.10, 0.14, 0.90)   # 次级面板
const C_BORDER      := Color(0.00, 0.58, 0.66, 0.55)   # 边框（青）
const C_ACCENT      := Color(0.70, 0.48, 0.00, 1.00)   # 琥珀主强调
const C_ACCENT_2    := Color(0.00, 0.83, 0.93, 1.00)   # 青次强调
const C_TEXT        := Color(0.87, 0.94, 1.00, 1.00)   # 主文字（冷白）
const C_TEXT_DIM    := Color(0.55, 0.66, 0.75, 1.00)   # 次文字
const C_DANGER      := Color(0.70, 0.30, 0.35, 1.00)   # 危险/敌方（暗红）
const C_OK          := Color(0.40, 0.75, 0.50, 1.00)   # 就绪/友方（绿）

# 便于代码取色：UITheme.c("accent")
func c(key: String) -> Color:
	match key:
		"bg", "panel":        return C_BG_PANEL
		"panel2":             return C_BG_PANEL_2
		"border":             return C_BORDER
		"accent":             return C_ACCENT
		"accent2", "cyan":    return C_ACCENT_2
		"text":               return C_TEXT
		"dim":                return C_TEXT_DIM
		"danger", "enemy":    return C_DANGER
		"ok", "ally":         return C_OK
	return C_TEXT

# ---- StyleBox 工厂 ----

# 圆角半透明面板（默认深青黑底 + 青边框）
func panel(radius := 10, bg := C_BG_PANEL, border := C_BORDER) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = bg
	sb.border_color = border
	sb.border_width_left = 1
	sb.border_width_top = 1
	sb.border_width_right = 1
	sb.border_width_bottom = 1
	sb.corner_radius_top_left = radius
	sb.corner_radius_top_right = radius
	sb.corner_radius_bottom_left = radius
	sb.corner_radius_bottom_right = radius
	sb.content_margin_left = 12
	sb.content_margin_top = 8
	sb.content_margin_right = 12
	sb.content_margin_bottom = 8
	return sb

# 按钮（琥珀描边 + 悬停提亮）
func button(radius := 8, base := C_BG_PANEL_2, border := C_ACCENT) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = base
	sb.border_color = border
	sb.border_width_left = 1
	sb.border_width_top = 1
	sb.border_width_right = 1
	sb.border_width_bottom = 1
	sb.corner_radius_top_left = radius
	sb.corner_radius_top_right = radius
	sb.corner_radius_bottom_left = radius
	sb.corner_radius_bottom_right = radius
	sb.content_margin_left = 16
	sb.content_margin_top = 8
	sb.content_margin_right = 16
	sb.content_margin_bottom = 8
	return sb

func button_hover() -> StyleBoxFlat:
	var sb := button()
	sb.bg_color = Color(0.10, 0.20, 0.26, 0.95)
	sb.border_color = C_ACCENT_2
	return sb

# 给一个 Control 节点套面板主题（含 focus/normal 各态）
# 注意：不改动 mouse_filter，避免覆盖 Battle3D 对 HUD 穿透(IGNORE)的既有设置。
func apply_panel(node: Control, radius := 10, bg := C_BG_PANEL, border := C_BORDER):
	var sb := panel(radius, bg, border)
	node.add_theme_stylebox_override("panel", sb)
	node.add_theme_stylebox_override("normal", sb)

# 给 Button 套统一按钮主题（normal/hover/pressed/focus）
func apply_button(btn: Button, radius := 8):
	btn.add_theme_stylebox_override("normal", button(radius))
	btn.add_theme_stylebox_override("hover", button_hover())
	btn.add_theme_stylebox_override("pressed", button(radius, Color(0.14, 0.26, 0.32, 0.95), C_ACCENT_2))
	btn.add_theme_stylebox_override("focus", button(radius, C_BG_PANEL_2, C_ACCENT_2))
	btn.add_theme_color_override("font_color", C_TEXT)
	btn.add_theme_color_override("font_hover_color", C_ACCENT_2)
	btn.add_theme_color_override("font_pressed_color", C_ACCENT_2)
	btn.add_theme_font_size_override("font_size", 16)

# 给 Label 套统一文字色/字号
func apply_label(lbl: Label, dim := false, size := 18):
	lbl.add_theme_color_override("font_color", C_TEXT_DIM if dim else C_TEXT)
	lbl.add_theme_font_size_override("font_size", size)
