/**
 * combatSnap.ts —— 战局状态快照：序列化 / 重建 / 持久化 / 重hydration
 *
 * 背景：战局原本只存在于内存 battleStore（一个 Map）。服务重启/容器重建后内存清空，
 * 而 DB 的 battles 表只存基础元数据，导致「返回上次战斗」必然 404（幽灵指针）。
 * 本模块把完整战局态序列化为 JSON 存入 battles.state_snapshot，并在内存缺失时反序列化重建。
 *
 * ⚠️ 防呆纪律（异步传染警报）：
 *   loadBattleSnapshot / saveBattleSnapshot / clearBattleSnapshot 全部为【同步】函数。
 *   底层走 sql.js 的同步 db.get / db.run（见 db/sqlite.ts）。
 *   本模块刻意不引入任何 async/Promise，避免后续替换 44 处 battleStore.get 时
 *   留下悬空的 Promise 或漏写 await。若将来底层改为异步，此处必须整体升级并同步改路由。
 *
 * ⚠️ 隐患一（定时器黑洞）：
 *   快照【禁止】序列化 pendingSurprise.timerId（定时器对象无法 JSON 化，且重建后必失效）。
 *   fromPlainState 末尾调用 reconcileBattle → reapStalePending，对已超时的僵尸 QTE 强制清算。
 */

import { logger } from './utils/logger.js';
import { get, run } from './db/sqlite.js';
import { DEFAULT_ACTION_POINTS } from './battleStateFactory.js';

// 自包含 safeParse：combatSnap 刻意不依赖 routes/combat.ts（其依赖链含战斗引擎 .cjs，环境缺失时会拖垮导入）
function safeParseValue(v: any): any {
  if (typeof v === 'string') {
    try { return JSON.parse(v); } catch { return v; }
  }
  return v;
}

// ---- 可序列化的顶层字段白名单（避免混入函数/不可序列化残骸） ----
const PLAIN_TOP_KEYS = [
  'id',
  'phase',
  'turn',
  'round',
  'activeUnitId',
  'activeFaction',
  'activeFactionIndex',
  'factionTurnOrder',
  'factionRoles',
  'startedAt',
  'finishedAt',
  'winnerFaction',
  'log',
  'pendingUnits',
  'hostId',
  'factionRolesConfig',
  'pendingSurprise',
  // battle.map 单独处理
  // battle.units 单独处理
];

/**
 * 把一个 BattleUnit（纯数据实例）规整为可序列化纯对象。
 * BattleUnit 无方法，仅补 action_points / standby 兜底。
 */
function unitToPlain(u: any): any {
  if (!u || typeof u !== 'object') return u;
  return {
    ...u,
    action_points: { ...(DEFAULT_ACTION_POINTS as Record<string, number>), ...(u.action_points || {}) },
    standby: typeof u.standby === 'boolean' ? u.standby : false,
  };
}

/**
 * 把一个 BattlefieldMap（运行时 plain object，attributes 为 Map）转为可序列化对象。
 */
function mapToPlain(m: any): any {
  if (!m || typeof m !== 'object') return m;
  const out: any = { ...m };
  if (m.attributes instanceof Map) {
    out.attributes = Object.fromEntries(m.attributes.entries());
  } else if (m.attributes && typeof m.attributes === 'object') {
    out.attributes = { ...m.attributes };
  }
  return out;
}

/** 选择性序列化：输出可被 JSON.stringify 的纯对象 */
export function toPlainState(battle: any): any {
  if (!battle) return null;
  const plain: any = {};
  for (const k of PLAIN_TOP_KEYS) {
    if (k in battle) plain[k] = battle[k];
  }
  // units：Map<EntityId, BattleUnit> → 数组（保留 unitId 以便重建回 Map）
  if (battle.units instanceof Map) {
    plain.units = Array.from(battle.units.values()).map(unitToPlain);
  } else if (Array.isArray(battle.units)) {
    plain.units = battle.units.map(unitToPlain);
  } else {
    plain.units = [];
  }
  // map：attributes Map → 普通对象
  plain.map = mapToPlain(battle.map);
  // 隐患一：pendingSurprise 剔除 timerId（定时器对象无法序列化，重建后必失效）
  if (plain.pendingSurprise && typeof plain.pendingSurprise === 'object') {
    const { timerId, ...rest } = plain.pendingSurprise;
    plain.pendingSurprise = rest;
  }
  return plain;
}

/** 重建一个单位（从 plain 恢复），补兜底字段 */
function unitFromPlain(p: any): any {
  const u = { ...p };
  u.action_points = { ...(DEFAULT_ACTION_POINTS as Record<string, number>), ...(p.action_points || {}) };
  if (typeof u.standby !== 'boolean') u.standby = false;
  return u;
}

/** 重建 map（attributes 普通对象 → Map） */
function mapFromPlain(m: any): any {
  if (!m || typeof m !== 'object') return m;
  const out: any = { ...m };
  if (m.attributes && typeof m.attributes === 'object' && !(m.attributes instanceof Map)) {
    out.attributes = new Map(Object.entries(m.attributes));
  }
  return out;
}

/**
 * 从 plain 重建合法 BattleState（内存态）。
 * 注意：BattleUnit 无方法，直接 reconstruct（含已算好的派生字段 equipState/royroy/mobility 等），
 * 不重跑 createBattleUnit，避免 CreateBattleUnitParams 字段映射错位。
 * 重建后 units 回 Map、map.attributes 回 Map。
 */
export function fromPlainState(plain: any): any {
  if (!plain || typeof plain !== 'object') return null;
  const battle: any = {};
  for (const k of PLAIN_TOP_KEYS) {
    if (k in plain) battle[k] = plain[k];
  }
  // units：数组 → Map<unitId, BattleUnit>
  battle.units = new Map();
  if (Array.isArray(plain.units)) {
    for (const p of plain.units) {
      const u = unitFromPlain(p);
      battle.units.set(u.unitId, u);
    }
  }
  // map
  battle.map = mapFromPlain(plain.map);
  // 重建后状态自检/兜底
  if (typeof battle.activeFactionIndex !== 'number') battle.activeFactionIndex = 0;
  if (!Array.isArray(battle.log)) battle.log = [];
  if (!Array.isArray(battle.factionTurnOrder)) battle.factionTurnOrder = [];
  battle.factionRoles = battle.factionRoles || {};
  return battle;
}

/**
 * 重建后的过期状态清理（隐患一加固：定时器黑洞）。
 * 快照已剔除 timerId，重建出的 pendingSurprise 是「waiting 但无定时器」的僵尸态。
 * 若 deadline 已过（重启往往几十秒，必超时），直接强制清算（清掉挂起态、恢复回合），
 * 避免战局永久死锁在奇袭 QTE。此逻辑与 combat.ts 的 reapStalePending 语义一致，但自包含不依赖战斗引擎。
 * 必须在 fromPlainState 之后、写入 battleStore 之前调用。
 */
export function reconcileBattle(battle: any): void {
  if (!battle) return;
  try {
    const pend = battle.pendingSurprise;
    if (pend && pend.phase === 'waiting' && typeof pend.deadline === 'number' && Date.now() > pend.deadline) {
      logger.warn({ msg: `[combatSnap] reconcileBattle: 检测到超时僵尸 pendingSurprise，强制清算 ${ battle.id }` });
      battle.pendingSurprise = null;
      // 若战局因奇袭挂起而卡在 DEPLOYMENT/BATTLE 之外，回退到正常战斗态
      if (battle.phase === 'surprise' || battle.phase === 'pending_surprise') {
        battle.phase = 'battle';
      }
    }
  } catch (e: any) {
    logger.error({ msg: `[combatSnap] reconcileBattle 失败: ${ e?.message || e }` });
  }
}

// ============ 持久化（全部同步，见顶部防呆纪律） ============

/** 落库快照：UPDATE battles SET state_snapshot=?, snapshot_at=now WHERE id=?（同步） */
export function saveBattleSnapshot(battleId: string, battle: any): void {
  try {
    const plain = toPlainState(battle);
    const json = JSON.stringify(plain);
    run('UPDATE battles SET state_snapshot = ?, snapshot_at = datetime(\'now\') WHERE id = ?', [json, battleId]);
  } catch (e: any) {
    logger.error({ msg: `[combatSnap] saveBattleSnapshot 失败: ${ battleId } ${ e?.message || e }` });
  }
}

/** 加载快照：读 state_snapshot 并 parse，返回 plain 或 null（同步，无 Promise） */
export function loadBattleSnapshot(battleId: string): any | null {
  try {
    const row = get('SELECT state_snapshot, snapshot_at FROM battles WHERE id = ?', [battleId]) as any;
    if (!row || !row.state_snapshot) return null;
    const plain = safeParseValue(row.state_snapshot);
    if (!plain || typeof plain !== 'object') return null;
    plain.__snapshot_at = row.snapshot_at || null;
    return plain;
  } catch (e: any) {
    logger.error({ msg: `[combatSnap] loadBattleSnapshot 失败: ${ battleId } ${ e?.message || e }` });
    return null;
  }
}

/** 终极清理（隐患二加固）：战斗结束置空快照，只留战绩元数据（同步） */
export function clearBattleSnapshot(battleId: string): void {
  try {
    run('UPDATE battles SET state_snapshot = NULL, status = \'finished\', snapshot_at = datetime(\'now\') WHERE id = ?', [battleId]);
  } catch (e: any) {
    logger.error({ msg: `[combatSnap] clearBattleSnapshot 失败: ${ battleId } ${ e?.message || e }` });
  }
}
