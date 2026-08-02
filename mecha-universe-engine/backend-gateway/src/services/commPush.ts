/**
 * Batch A 任务1.0 — Gateway → Comm 内部推送客户端（单向）
 *
 * 战斗权威态的唯一真相在 3006 网关（battleStore）。
 * 本模块把战斗态通过 `POST /internal/sync-state` 推给 3005 comm-service，
 * 由 comm 做迷雾过滤后再经 Socket.io 广播给各客户端。
 *
 * 设计原则：
 *  - fire-and-forget：推送失败（comm 抖动/网络）绝不阻断战斗主链路（attack/move/...）。
 *  - 短超时（1.5s）+ try/catch 包裹，避免 await 卡死路由。
 *  - 通过 `x-internal-token` 做内部鉴权，comm 端校验同值。
 */

import { logger } from '../utils/logger.js';
import fs from 'fs';

// 默认地址解析（显式 COMM_SERVICE_URL 环境变量始终优先）：
//  - 容器内（生产/Docker）：使用服务名 http://mecha-comm:3005（同 docker 网络内网解析）
//  - 本地盲测（非容器）：自动降级到 http://127.0.0.1:3005，避免 ENOTFOUND mecha-comm
// 判定依据：容器内存在 /.dockerenv 标记文件。
function resolveCommServiceUrl(): string {
  if (process.env.COMM_SERVICE_URL) return process.env.COMM_SERVICE_URL;
  const inDocker = fs.existsSync('/.dockerenv');
  return inDocker ? 'http://mecha-comm:3005' : 'http://127.0.0.1:3005';
}

const COMM_SERVICE_URL = resolveCommServiceUrl();
const INTERNAL_TOKEN = process.env.INTERNAL_SYNC_TOKEN || 'mecha-internal-sync';

// 递归清理为 JSON 安全对象：Map/Set → 数组，剥离函数与 Node Timeout（不可序列化）
function sanitizeForJson(value: any, depth = 0): any {
  if (depth > 8) return null;
  if (value === null || value === undefined) return value;
  if (typeof value === 'function') return undefined;
  if (value instanceof Map) return Array.from(value.values()).map((v: any) => sanitizeForJson(v, depth + 1));
  if (value instanceof Set) return Array.from(value).map((v: any) => sanitizeForJson(v, depth + 1));
  if (Array.isArray(value)) return value.map((v: any) => sanitizeForJson(v, depth + 1));
  if (typeof value === 'object') {
    // 跳过 Node Timer / Socket 句柄（含 hasRef 方法即视为定时器，避免 timerId 序列化异常）
    if (typeof value.hasRef === 'function' && 'ref' in value) return null;
    const out: any = {};
    for (const k of Object.keys(value)) {
      const sv = sanitizeForJson(value[k], depth + 1);
      if (sv !== undefined) out[k] = sv;
    }
    return out;
  }
  return value;
}

/**
 * 推送一局完整战斗态到 comm-service。
 * @param battleId 战斗 UUID
 * @param battle   战斗态（含 combatLog[] 缓冲，P8 随推送流携带）
 */
export async function pushBattleState(battleId: string, battle: any): Promise<void> {
  if (!battleId || !battle) return;
  // 老版本 Node 无全局 fetch 时静默跳过，绝不影响战斗主链路
  if (typeof fetch !== 'function') return;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    const res = await fetch(`${COMM_SERVICE_URL}/internal/sync-state`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-token': INTERNAL_TOKEN,
      },
      body: JSON.stringify({ battleId, battleState: sanitizeForJson(battle) }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      logger.warn({ msg: `[commPush] sync-state 返回非 2xx: ${res.status} for ${battleId}` });
    }
  } catch (err: any) {
    // 推送是旁路，任何异常都只记录，不影响战斗返回
    logger.warn({ msg: `[commPush] sync-state 推送失败（已忽略）: ${ err?.message || err }` });
  }
}

/**
 * 推送房间名册变更广播到 comm-service。
 * comm 收到后向 `prep-<roomId>` 频道 emit `room-update`，前端整备室据此实时刷新。
 * 同样是 fire-and-forget 旁路，失败绝不阻断 REST 主链路。
 */
export async function pushRoomUpdate(roomId: string): Promise<void> {
  if (!roomId) return;
  if (typeof fetch !== 'function') return;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    const res = await fetch(`${COMM_SERVICE_URL}/internal/room-update`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-token': INTERNAL_TOKEN,
      },
      body: JSON.stringify({ roomId }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      logger.warn({ msg: `[commPush] room-update 返回非 2xx: ${res.status} for ${roomId}` });
    }
  } catch (err: any) {
    logger.warn({ msg: `[commPush] room-update 推送失败（已忽略）: ${ err?.message || err }` });
  }
}

export default { pushBattleState, pushRoomUpdate };
