/**
 * roomSettingsSchema.ts
 * ★ C5 房间防投毒：settings 接口的 Schema 白名单与强校验
 *
 * 设计原则（架构师决策 2026-08-02）：
 * 1. 基础字段严格类型 + 边界锁定（name / maxPlayers / turnTimeLimit）。
 * 2. 未知键显式拒绝（Reject），停止原静默忽略机制。
 * 3. JSON 字段（rules / victoryConditions / factionPasswords）做结构防御：
 *    限制最大嵌套深度 + 整体载荷体积，切断 JSON 炸弹 / 超长文本撑爆 DB 的路径。
 * 4. 子键白名单（factionPasswords 的 4 位数字规则）复用 rooms.ts 的 normalizeFactionPasswords，
 *    本模块不写死细碎枚举字典，保持路由层纯净。
 * 5. 系统字段（host_id / created_at / id）硬性黑名单，与未知键同策略拒绝。
 *
 * 注意：本模块不依赖任何运行时全局状态，纯函数，便于单测与未来扩展。
 */

// ---- 常量边界 ----
export const SETTINGS_NAME_MAX = 40;
export const SETTINGS_MAX_PLAYERS_MIN = 2;
export const SETTINGS_MAX_PLAYERS_MAX = 16;
export const SETTINGS_TURN_TIME_MIN = 30;
export const SETTINGS_TURN_TIME_MAX = 3600;
// JSON 结构防御
export const SETTINGS_JSON_MAX_DEPTH = 4; // 最大嵌套深度
export const SETTINGS_JSON_MAX_BYTES = 8192; // 单个 JSON 字段序列化后最大字节数（UTF-8）

// ---- 白名单 / 黑名单 ----
// 允许客户端修改的字段（决策 B：mapId / isPrivate / code 坚决不纳入）
export const ALLOWED_KEYS = [
  'name',
  'maxPlayers',
  'turnTimeLimit',
  'rules',
  'victoryConditions',
  'factionPasswords',
] as const;

// 系统字段硬性隔离（决策 C）：即便绕过白名单也显式拦截，给出清晰语义
export const BLOCKED_KEYS = [
  'host_id',
  'created_at',
  'id',
  'mapId',
  'isPrivate',
  'code',
] as const;

export type RoomSettingsError = {
  error: string;
  field?: string;
  message: string;
};

/**
 * 计算任意值的 JSON 嵌套深度。
 */
function jsonDepth(value: any, depth = 0): number {
  if (value === null || typeof value !== 'object') return depth;
  let max = depth;
  if (Array.isArray(value)) {
    for (const item of value) max = Math.max(max, jsonDepth(item, depth + 1));
  } else {
    for (const k of Object.keys(value)) max = Math.max(max, jsonDepth(value[k], depth + 1));
  }
  return max;
}

/**
 * 校验单个 JSON 字段（rules / victoryConditions / factionPasswords）。
 * 返回序列化后的字符串或抛出 RoomSettingsError。
 */
function validateJsonField(field: string, value: any): string {
  if (value === null || typeof value !== 'object') {
    throw { error: 'VALIDATION_ERROR', field, message: `${field} 必须是对象或数组` } as RoomSettingsError;
  }
  const depth = jsonDepth(value);
  if (depth > SETTINGS_JSON_MAX_DEPTH) {
    throw {
      error: 'VALIDATION_ERROR',
      field,
      message: `${field} 嵌套深度超过上限 ${SETTINGS_JSON_MAX_DEPTH}`,
    } as RoomSettingsError;
  }
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw { error: 'VALIDATION_ERROR', field, message: `${field} 无法序列化为合法 JSON` } as RoomSettingsError;
  }
  const bytes = Buffer.byteLength(serialized, 'utf8');
  if (bytes > SETTINGS_JSON_MAX_BYTES) {
    throw {
      error: 'VALIDATION_ERROR',
      field,
      message: `${field} 载荷过大（${bytes} > ${SETTINGS_JSON_MAX_BYTES} 字节）`,
    } as RoomSettingsError;
  }
  return serialized;
}

/**
 * 校验整个 settings 请求体。
 * @returns 规范化后的 { updates, values }，直接用于参数化 SQL。
 * @throws RoomSettingsError（含 error/field/message）用于 400 响应。
 */
export function validateRoomSettings(
  body: Record<string, any> | undefined | null,
): { updates: string[]; values: any[] } {
  const updates: string[] = [];
  const values: any[] = [];

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw { error: 'VALIDATION_ERROR', message: '请求体必须是非空对象' } as RoomSettingsError;
  }

  const keys = Object.keys(body);

  // 决策 C：先拦截系统字段（显式黑名单，给出比"未知键"更清晰的语义）
  for (const blocked of BLOCKED_KEYS) {
    if (blocked in body) {
      throw {
        error: 'FORBIDDEN_FIELD',
        field: blocked,
        message: `字段 ${blocked} 为系统保留字段，禁止通过 settings 接口修改`,
      } as RoomSettingsError;
    }
  }

  // 决策 1：未知键显式拒绝（Reject），停止静默忽略
  for (const key of keys) {
    if (!(ALLOWED_KEYS as readonly string[]).includes(key)) {
      throw {
        error: 'UNKNOWN_FIELD',
        field: key,
        message: `未知字段 ${key} 不在允许修改的白名单内`,
      } as RoomSettingsError;
    }
  }

  // ---- 逐个字段强校验 ----
  if ('name' in body) {
    const v = body.name;
    if (typeof v !== 'string') {
      throw { error: 'VALIDATION_ERROR', field: 'name', message: 'name 必须是字符串' } as RoomSettingsError;
    }
    const trimmed = v.trim();
    if (trimmed.length < 1 || trimmed.length > SETTINGS_NAME_MAX) {
      throw {
        error: 'VALIDATION_ERROR',
        field: 'name',
        message: `name 长度必须在 1–${SETTINGS_NAME_MAX} 字符之间`,
      } as RoomSettingsError;
    }
    updates.push('name = ?');
    values.push(trimmed);
  }

  if ('maxPlayers' in body) {
    const v = body.maxPlayers;
    if (!Number.isInteger(v)) {
      throw {
        error: 'VALIDATION_ERROR',
        field: 'maxPlayers',
        message: 'maxPlayers 必须是正整数',
      } as RoomSettingsError;
    }
    if (v < SETTINGS_MAX_PLAYERS_MIN || v > SETTINGS_MAX_PLAYERS_MAX) {
      throw {
        error: 'VALIDATION_ERROR',
        field: 'maxPlayers',
        message: `maxPlayers 必须在 ${SETTINGS_MAX_PLAYERS_MIN}–${SETTINGS_MAX_PLAYERS_MAX} 之间`,
      } as RoomSettingsError;
    }
    updates.push('max_players = ?');
    values.push(v);
  }

  if ('turnTimeLimit' in body) {
    const v = body.turnTimeLimit;
    if (!Number.isInteger(v)) {
      throw {
        error: 'VALIDATION_ERROR',
        field: 'turnTimeLimit',
        message: 'turnTimeLimit 必须是整数',
      } as RoomSettingsError;
    }
    const ok = v === 0 || (v >= SETTINGS_TURN_TIME_MIN && v <= SETTINGS_TURN_TIME_MAX);
    if (!ok) {
      throw {
        error: 'VALIDATION_ERROR',
        field: 'turnTimeLimit',
        message: `turnTimeLimit 必须为 0（不限）或 ${SETTINGS_TURN_TIME_MIN}–${SETTINGS_TURN_TIME_MAX} 秒`,
      } as RoomSettingsError;
    }
    updates.push('turn_time_limit = ?');
    values.push(v);
  }

  if ('rules' in body) {
    const serialized = validateJsonField('rules', body.rules);
    updates.push('rules = ?');
    values.push(serialized);
  }

  if ('victoryConditions' in body) {
    const serialized = validateJsonField('victoryConditions', body.victoryConditions);
    updates.push('victory_conditions = ?');
    values.push(serialized);
  }

  // factionPasswords：结构防御由 validateJsonField 兜底，子键白名单 + 4位数字规则
  // 由调用方在 rooms.ts 内复用 normalizeFactionPasswords 完成（保持本模块纯净）。
  // 此处仅做深度/体积防御，最终序列化交由 rooms.ts 的 normalizeFactionPasswords 产出。
  if ('factionPasswords' in body) {
    // 仅做结构防御（深度/体积）；子键白名单 + 4 位数字规则由 rooms.ts 的
    // normalizeFactionPasswords 落地，保持本模块不写死细碎枚举字典。
    validateJsonField('factionPasswords', body.factionPasswords);
  }

  return { updates, values };
}
