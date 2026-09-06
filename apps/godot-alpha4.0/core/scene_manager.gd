# ============================================================
# core/scene_manager.gd  (autoload: SceneManager)
#
# 统一场景切换 + 跨场景上下文(ctx) + 返回栈。
# 修复「点击创建后退出了」类问题：所有跳转走本单例，
# 目标场景缺失或加载失败会给出可读错误，而非静默崩溃退出。
# ============================================================
extends Node

# 跨场景上下文（room_id / map_id / edit_id / user 等）
var ctx: Dictionary = {}
# 返回栈（场景路径）
var _stack: Array[String] = []

# 切换场景；merge_ctx 会在进入时并入 ctx
# 兼容 .tscn/.scn（change_scene_to_file）与 .gd（load().new() 纯脚本场景）
func to_scene(path: String, merge_ctx: Dictionary = {}):
	for k in merge_ctx.keys():
		ctx[k] = merge_ctx[k]
	print("[SceneManager] -> ", path)
	if path.ends_with(".gd"):
		var scr := load(path)
		if scr == null:
			push_error("[SceneManager] 脚本加载失败 path=%s" % path)
			return
		var inst = scr.new()
		_switch_instance(inst, path)
		return
	var err := get_tree().change_scene_to_file(path)
	if err != OK:
		push_error("[SceneManager] 切换失败 path=%s err=%d" % [path, err])

# 替换当前场景为给定实例（用于纯 .gd 脚本场景）
func _switch_instance(inst: Node, path: String) -> void:
	var tree := get_tree()
	var cur := tree.current_scene
	if cur != null:
		cur.queue_free()
	inst.scene_file_path = path
	# 纯 .gd 场景被直接挂到视口根，自身默认锚点(0,0,0,0)尺寸 0×0 会全部挤到左上角/错位。
	# 统一对 Control 实例撑满视口，根治根节点未设 FULL_RECT 导致的布局错位。
	if inst is Control:
		inst.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		if inst.custom_minimum_size == Vector2.ZERO:
			inst.custom_minimum_size = get_viewport().size
	tree.root.call_deferred("add_child", inst)
	tree.set_deferred("current_scene", inst)

func to_login():        to_scene("res://scenes/nav/LoginView.tscn")
func to_home():         to_scene("res://scenes/HomeView.gd")
func to_lobby():        to_scene("res://scenes/nav/RoomLobby.tscn")
func to_map_select():   to_scene("res://scenes/nav/MapSelect.tscn")
func to_preparation():  to_scene("res://scenes/nav/PreparationRoom.tscn")
func to_battle3d():     to_scene("res://scenes/Battle3D.tscn", {"room_id": ctx.get("room_id", ""), "battle_id": ctx.get("battle_id", "")})

# 推入当前场景到返回栈，再切换
func push_and_to(path: String, merge_ctx: Dictionary = {}):
	_stack.push_back(get_tree().current_scene.scene_file_path)
	to_scene(path, merge_ctx)

func back():
	if _stack.is_empty():
		return
	var prev: String = _stack.pop_back()
	to_scene(prev)

func set_ctx(key: String, value):
	ctx[key] = value

func get_ctx(key: String, default = ""):
	return ctx.get(key, default)

func reset():
	ctx.clear()
	_stack.clear()
