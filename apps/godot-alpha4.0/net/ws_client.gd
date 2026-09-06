# ============================================================
# net/ws_client.gd
# 原生 WebSocket 客户端（GDScript 封装）
# 对接后端 comm-service 的 RFC 6455 原生 WS 端点（/ws-native）。
#
# 为什么不用 Socket.io：Godot 4.7 的 WebSocketPeer 是标准 RFC 6455
# 客户端，与 Socket.io 自定义帧协议（握手/心跳/命名空间）不兼容。
# 后端 comm-service 在同一 3005 httpServer 上用 `ws` 库挂载了原生
# WS 服务，路径 /ws-native，推送同样的 battle-state 增量。
#
# 协议（JSON 文本帧）：
#   客户端→服务端：
#     {"type":"subscribe","battleId":"<id>","token":"<jwt>"}
#     {"type":"unsubscribe","battleId":"<id>"}
#   服务端→客户端（auth 后）：
#     {"type":"subscribed","battleId":"<id>"}
#     {"type":"battle-state","battleId":"<id>","battleState":{...},"serverTime":123}
#     {"type":"error","message":"..."}
#
# 注意：WebSocketPeer 是纯对象（非 Node），本类用 poll() 手动驱动。
# 调用方需在 _process 中调用 ws.poll()，并通过 signal 接收推送。
# ============================================================
class_name WsClient
extends RefCounted

# 服务端原生 WS 端点（经 8081 单一入口反代到 comm-service /ws-native）
# 符合运维纪律：所有客户端入口收敛到 http://106.54.197.69:8081
const WS_URL := "ws://106.54.197.69:8081/ws-native"

signal battle_state_received(battle_id: String, battle_state: Dictionary)
signal subscribed(battle_id: String)
signal connection_closed()
signal connection_error(msg: String)

var _ws := WebSocketPeer.new()
var _state := WebSocketPeer.STATE_CLOSED
var _token: String = ""
var _battle_id: String = ""
var _was_open := false
var _sub_sent := false


func connect_and_subscribe(battle_id: String, token: String):
	_battle_id = battle_id
	_token = token
	_sub_sent = false
	var err := _ws.connect_to_url(WS_URL)
	if err != OK:
		connection_error.emit("WS 连接失败: %d" % err)


func disconnect_ws():
	if _state != WebSocketPeer.STATE_CLOSED:
		_ws.close()
	_state = WebSocketPeer.STATE_CLOSED


# 每帧调用：驱动 WS 状态机并派发消息
func poll():
	_ws.poll()
	_state = _ws.get_ready_state()
	match _state:
		WebSocketPeer.STATE_OPEN:
			if not _was_open:
				_was_open = true
				print("[WsClient] 连接已建立 (OPEN)")
			_read_available()
		WebSocketPeer.STATE_CLOSED:
			# 仅在曾经 OPEN 后进入 CLOSED 才发信号，避免初始抖动
			if not _battle_id.is_empty():
				connection_closed.emit()
				_battle_id = ""


func _read_available():
	while _ws.get_available_packet_count() > 0:
		var raw := _ws.get_packet()
		var txt := raw.get_string_from_utf8()
		var msg: Dictionary = JSON.parse_string(txt)
		if msg == null or not (msg is Dictionary):
			continue
		var type: String = str(msg.get("type", ""))
		match type:
			"subscribed":
				subscribed.emit(str(msg.get("battleId", _battle_id)))
			"battle-state":
				var bid: String = str(msg.get("battleId", _battle_id))
				var st: Dictionary = msg.get("battleState", {})
				if st is Dictionary:
					battle_state_received.emit(bid, st)
					# 阶段 3·桥接 EventBus：战斗状态推送 → 全局事件总线
					EventBus.battle_state_updated.emit(st)
					# 阶段 5·伤害结算时机转发：若后端附带时机事件数组则逐一 emit
					var timing_events: Array = msg.get("timingEvents", [])
					for ev in timing_events:
						if ev is Dictionary:
							EventBus.emit_timing(str(ev.get("timing", "")), ev.get("context", {}))
			"error":
				connection_error.emit(str(msg.get("message", "unknown error")))
			_:
				# 未知帧忽略
				pass


# 内部：发送订阅（在 OPEN 后由 poll 链触发时由调用方主动调用）
func _send_subscribe():
	var payload := {
		"type": "subscribe",
		"battleId": _battle_id,
		"token": _token,
	}
	_ws.send_text(JSON.stringify(payload))


# 在 OPEN 状态后调用一次，发起订阅（仅发一次，避免每帧重发导致后端刷屏）
func flush_subscribe():
	if _state == WebSocketPeer.STATE_OPEN and not _sub_sent:
		_sub_sent = true
		_send_subscribe()
