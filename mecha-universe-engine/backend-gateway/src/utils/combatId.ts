/**
 * 战斗 ID 统一收口（阶段三 · 模块收口）
 * ------------------------------------------------------------
 * 收口目标：消除 combat.ts 中散落的 `req.body?.unitId ?? req.body?.unit_id`
 * 等裸兜底，提供单一真相函数，统一以下语义：
 *   1. 双命名兜底（camelCase / snake_case 兼容）：unitId ?? unit_id、
 *      casterUnitId ?? caster_id ?? caster、targetUnitId ?? target_id ?? target。
 *   2. 字符串归一化：所有 ID 强制 String() + trim，避免 number 型 ID 与
 *      Map<string, Unit> 的 key 类型不匹配导致 get 命中失败。
 *   3. 防伪造兜底：null / undefined / '' / 'null' / 'undefined' 一律归一为
 *      undefined，避免 `battle.units.get(null)` 误命中真实单位（Map 允许
 *      任意对象作 key，null 曾可命中极少数字符串化异常路径）。
 *
 * 设计纪律（与战斗宪法一致）：
 *   - 本模块零外部依赖，纯函数，可被引擎与网关共享。
 *   - 绝不在此发起任何 IO / 读 Store；只做字符串归一。
 */

/** 归一化单个候选值为安全 ID 字符串。 */
function normalize(raw: unknown): string | undefined {
  if (raw === null || raw === undefined) return undefined;
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (t === '' || t === 'null' || t === 'undefined') return undefined;
    return t;
  }
  if (typeof raw === 'number' || typeof raw === 'boolean') {
    return String(raw);
  }
  // 对象（如 caster 透传的单位对象）取 .id / .unitId / .unit_id
  if (typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    return normalize(o.id ?? o.unitId ?? o.unit_id);
  }
  return undefined;
}

/**
 * 从多个候选键中挑出第一个有效 ID（双命名兜底）。
 * 顺序：靠前的候选优先级高。调用方按「首选 camelCase，兜底 snake_case」排列。
 *
 * @example
 *   pickId(req.body?.unitId, req.body?.unit_id)          // 单位
 *   pickId(req.body?.casterUnitId, req.body?.caster_id)  // 施法者
 *   pickId(req.body?.targetUnitId, req.body?.target_id)  // 目标
 */
export function pickId(...candidates: unknown[]): string | undefined {
  for (const c of candidates) {
    const v = normalize(c);
    if (v !== undefined) return v;
  }
  return undefined;
}

/**
 * 从任意 body 提取「单位 ID」，兼容全部历史命名变体。
 * 优先 unitId/unit_id，其次 casterUnitId/caster_id/caster，
 * 最后 targetUnitId/target_id/target（用于单单位上下文场景）。
 */
export function pickUnitId(body: Record<string, any> | undefined | null): string | undefined {
  if (!body) return undefined;
  return pickId(
    body.unitId,
    body.unit_id,
    body.casterUnitId,
    body.caster_id,
    body.caster,
    body.targetUnitId,
    body.target_id,
    body.target,
  );
}

/**
 * 从任意 body 提取「施法者 ID」（技能语义专用）。
 */
export function pickCasterId(body: Record<string, any> | undefined | null): string | undefined {
  if (!body) return undefined;
  return pickId(
    body.casterUnitId,
    body.caster_id,
    body.caster,
    body.unitId,
    body.unit_id,
  );
}

/**
 * 从任意 body 提取「目标 ID」（技能语义专用）。
 */
export function pickTargetId(body: Record<string, any> | undefined | null): string | undefined {
  if (!body) return undefined;
  return pickId(
    body.targetUnitId,
    body.target_id,
    body.target,
    body.unitId,
    body.unit_id,
  );
}
