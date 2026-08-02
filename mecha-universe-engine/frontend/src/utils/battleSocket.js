/**
 * Battle Socket 客户端（Batch C-1）
 * 连接 comm 服务的 Socket.io（经 nginx /socket.io 反代到 mecha-comm:3005）。
 * 仅作为「实时唤醒」通道：收到 battle-state 后由调用方决定如何刷新本地状态。
 * 设计为叠加层——即使连接失败，前端仍可用 GET /state (refreshState) 兜底，不破坏既有逻辑。
 */
import { io } from 'socket.io-client'

let socket = null

export function connectBattleSocket({ battleId, token, faction, role, onState, onConnect }) {
  disconnectBattleSocket()
  if (!battleId || !token) return null
  try {
    // 不传 URL → 使用页面同源（nginx /socket.io/ → comm）
    socket = io({
      path: '/socket.io',
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1500,
    })

    socket.on('connect', () => {
      socket.emit('join-battle', { battleId, faction, role })
      // 隐患三收尾：断线重连（含首次连接）后强制刷新一次全量态，
      // 避免 WS 重连时差拿到陈旧 battle-state 推送而错过服务端已落库的最新态。
      if (typeof onConnect === 'function') onConnect()
    })

    socket.on('battle-state', (payload) => {
      const state = payload?.battleState || payload?.state || payload
      if (state && typeof onState === 'function') onState(state)
    })

    // 连接失败/断开：静默，前端回退到 refreshState 轮询兜底
    socket.on('connect_error', () => {})
    socket.on('disconnect', () => {})

    return socket
  } catch (e) {
    socket = null
    return null
  }
}

export function disconnectBattleSocket() {
  if (socket) {
    try {
      socket.disconnect()
    } catch (e) {
      /* noop */
    }
    socket = null
  }
}

export function isBattleSocketConnected() {
  return !!socket && socket.connected
}
