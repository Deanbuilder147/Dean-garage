/**
 * 原生 WebSocket (RFC 6455) 支持层
 * 目的：Godot 4.7 的 WebSocketPeer 是标准 RFC 6455 客户端，与 Socket.io 的
 *       自定义帧协议（握手/ping/命名空间）不兼容。为 Godot 客户端提供一条
 *       轻量级原生 WS 通道，复用同一 3005 httpServer，挂载在 /ws-native 路径，
 *       推送与 Socket.io 完全一致的 battle-state 增量。
 *
 * 协议（JSON 文本帧）：
 *   客户端 → 服务端：
 *     {"type":"subscribe","battleId":"<id>","token":"<jwt>"}
 *     {"type":"unsubscribe","battleId":"<id>"}
 *   服务端 → 客户端：
 *     {"type":"subscribed","battleId":"<id>"}
 *     {"type":"battle-state","battleId":"<id>","battleState":{...},"serverTime":123}
 *     {"type":"error","message":"..."}
 *
 * 注意：本文件为 ESM（comm-service "type":"module"）。
 */

import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

// 原生 WS 订阅索引：battleId -> Set<ws>
const nativeSubs = new Map();

function addSub(battleId, ws) {
  if (!nativeSubs.has(battleId)) nativeSubs.set(battleId, new Set());
  nativeSubs.get(battleId).add(ws);
  ws._battleId = battleId;
}

function removeSub(ws) {
  const bid = ws._battleId;
  if (!bid) return;
  const set = nativeSubs.get(bid);
  if (set) {
    set.delete(ws);
    if (set.size === 0) nativeSubs.delete(bid);
  }
  ws._battleId = null;
}

function sendJson(ws, obj) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

/**
 * 初始化原生 WS 服务，挂载到已有的 httpServer 上。
 * @param {http.Server} httpServer 与 Socket.io 共享的 httpServer
 * @param {string} path 原生 WS 路径，默认 /ws-native
 */
export function setupNativeWs(httpServer, path = '/ws-native') {
  const wss = new WebSocketServer({ server: httpServer, path });

  wss.on('connection', (ws) => {
    ws._battleId = null;
    ws._authed = false;

    ws.on('message', (data) => {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        sendJson(ws, { type: 'error', message: 'invalid JSON' });
        return;
      }
      if (!msg || typeof msg !== 'object') return;
      const type = msg.type;

      if (type === 'subscribe') {
        const { battleId, token } = msg;
        if (!battleId) {
          sendJson(ws, { type: 'error', message: 'battleId required' });
          return;
        }
        // 鉴权（与 Socket.io 中间件一致）
        if (JWT_SECRET && token) {
          try {
            jwt.verify(token, JWT_SECRET);
            ws._authed = true;
          } catch {
            ws._authed = false;
          }
        }
        // 即使未鉴权也允许订阅（Godot demo 用），但记录状态
        removeSub(ws);
        addSub(String(battleId), ws);
        sendJson(ws, { type: 'subscribed', battleId: String(battleId) });
      } else if (type === 'unsubscribe') {
        removeSub(ws);
      }
    });

    ws.on('close', () => removeSub(ws));
    ws.on('error', () => removeSub(ws));
  });

  console.log(`[Comm] 原生 WS (RFC6455) 已挂载到 ${path}`);
  return wss;
}

/**
 * 向原生 WS 订阅者广播战斗态。由 emitBattleState 调用，零侵入 Socket.io 主链路。
 * 注意：这里下发全量快照（与 Socket.io 的 applyFog 已过滤视图同源），
 * Godot 端仅做整帧替换渲染（canvas 单向终点）。
 * @param {string} battleId
 * @param {object} state 已做迷雾过滤的视图（与 Socket.io 同视图）
 */
export function broadcastNative(battleId, state) {
  const set = nativeSubs.get(String(battleId));
  if (!set || set.size === 0) return;
  const payload = JSON.stringify({
    type: 'battle-state',
    battleId: String(battleId),
    battleState: state,
    serverTime: Date.now(),
  });
  for (const ws of set) {
    if (ws.readyState === ws.OPEN) ws.send(payload);
  }
}
