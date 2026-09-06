/**
 * Phase 29-CombatStart — 大一统战斗路由（3006 网关执政）
 *
 * 接管原 mecha-combat:3004 的全部职责：
 * - 战斗创建与初始化
 * - 战前设置（胜利条件/ACE单位/部署池）
 * - 战斗状态 CRUD
 * - 单位行动点管理
 * - 伤害计算管道
 *
 * @module routes/combat
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authenticate } from '../middleware/auth.js';
import { validateBody } from '../middleware/validateBody.js';
import { BattlefieldMapContract } from '@mecha/shared-kernel';
import { z } from 'zod';
import { get } from '../db/sqlite.js';
import {
  createBattleUnit,
  createBattleState,
  consumeActionPoint,
  hasActionPoints,
  resetAllActionPoints,
  markStandbyIfDone,
  resolveRole,
  getRoleUnits,
  isUnitAlive,
  TURN_ROLES,
  LEGACY_FACTION_TO_ROLE,
} from '../battleStateFactory.js';
import { BattlePhase } from '@mecha/shared-kernel';
import {
  saveBattleSnapshot,
  loadBattleSnapshot,
  clearBattleSnapshot,
  fromPlainState,
  reconcileBattle,
} from '../combatSnap.js';
import type { BattleState, BattleUnit, HexCoord, UnitStats } from '@mecha/shared-kernel';
import { getSkillRangeFields, resolveSkillCategory } from '@mecha/shared-kernel';
import { getSkillExecutor, getEffectExecutor, getEquipmentDurabilityManager } from '../combatBridge.js';
import { logger } from '../utils/logger.js';
import { pickUnitId } from '../utils/combatId.js';
import { sanitizeSkillContext } from '../utils/skillDto.js';
import { createRequire } from 'module';

// H1~H7 反应钩子注册表与联防纯函数（F 基础：文件隔离，零侵入主链路）
const nodeRequire = createRequire(import.meta.url);
const { fire: fireReaction, setGatewayTriggers, listTriggers } = nodeRequire('../../services/combat-service/src/services/combatCore/reactionHandlers/index.cjs');
const { isCollinearBlockade } = nodeRequire('../../services/combat-service/src/services/combatCore/reactionHandlers/zoc_block.cjs');
const { resolveDuel, duelCheck } = nodeRequire('../../services/combat-service/src/services/combatCore/reactionHandlers/duel.cjs');
const { resolveSnatch } = nodeRequire('../../services/combat-service/src/services/combatCore/reactionHandlers/steal.cjs');
const { resolveCover } = nodeRequire('../../services/combat-service/src/services/combatCore/reactionHandlers/cover.cjs');
const { pickupAirdrops } = nodeRequire('../../services/combat-service/src/services/combatCore/reactionHandlers/airdrop_drop.cjs');
const BuffManager = nodeRequire('../../services/combat-service/src/services/combatCore/buffManager.cjs');
const atomRegistry = nodeRequire('../../services/combat-service/src/services/combatCore/atomRegistry.cjs');

// ── Phase B：事件总线归一 ──────────────────────────────────────
// 网关层面"官方点火清单"。任何 register(trigger) 不在该清单内 → 启动自检告警（死代码旁路防护）。
// 新增接线点时务必同步登记到此清单，否则自检会告警。
const GATEWAY_KNOWN_TRIGGERS = [
  'on_attacked', 'on_attack_start', 'on_target_selected', 'on_damage_dealt',
  'on_kill', 'on_round_start',
  // ── RESERVED 预留埋点（Phase 8 清单收口核查）：以下 trigger 已登记于清单，
  //    但当前 combat.ts 无 fireReaction 点火点、reactionHandlers 也无 register。
  //    保留以允许未来接线时通过自检；请勿误读为「已接通」。
  'on_counterattack', 'on_reaction', 'on_after_skill_resolve', 'on_phase',
  'on_move', 'on_faction_skill', 'on_visibility_changed',
  'on_move_path', 'on_item_pickup', 'on_turn_end', 'pre_damage_apply',
  'on_action_order_changed', 'on_unit_turn_start', 'post_melee_damage', 'on_ally_attacked',
  'on_battle_start', // ★ Phase 7.3：补登 combat.ts 第3171行点火点，消除自检「不在点火清单」误告警
];
setGatewayTriggers(GATEWAY_KNOWN_TRIGGERS);
if (process.env.COMBAT_REACTION_DEBUG === '1') {
  console.log(`[combat.ts] 事件总线自检：已登记点火点 ${GATEWAY_KNOWN_TRIGGERS.length} 个；反应器已注册 ${listTriggers().length} 个: ${listTriggers().join(', ')}`);
}
const { evaluateVictory } = nodeRequire('../../services/combat-service/src/services/combatCore/victoryChecker.cjs');
const { getHexKey } = nodeRequire('../../services/combat-service/src/services/combatCore/hexKey.cjs');
const DiceService = nodeRequire('../../services/combat-service/src/services/combatCore/diceService.cjs');
// ★ Week3：每战局掷骰 nonce 计数器（确定性种子第三步），保证同战局不同攻击步骤的掷骰序列可复现且互不串扰。
const _battleDiceNonce = new Map<string, number>();
const { getGlossaryConfig, saveGlossaryConfig, checkCost, consumeCost } = nodeRequire('../../services/combat-service/src/services/combatCore/configLoader.cjs');
import { pushBattleState } from '../services/commPush.js';
import { applySizeConfigOverride, snapshotSizeConfig, applySizeHp } from '../unitSize.js';

// ============================================
// 战局获取统一入口（第3步：路由重构 / 重启重hydration）
// 内存优先 → 内存缺失但 DB 有 in_progress 快照则重建回内存 → 否则 null。
// 调用点只需把 `requireBattle(battleId)` 换成 `requireBattle(battleId)`，
// 保留原有 `if (!battle) { 404 }` 块即可，rehydrate 逻辑内聚于此。
// 同步（与 combatSnap 防呆纪律一致，避免 44 处遗留悬空 Promise）。
// ============================================
function requireBattle(battleId: string): any | null {
  // 1) 内存优先（用裸 Map.get，避免与下方 rehydrate 形成递归）
  const mem = battleStore.get(battleId);
  if (mem) return mem;
  // 2) 内存缺失 → 尝试从 DB 快照重建（解决服务重启后幽灵 404）
  try {
    const plain = loadBattleSnapshot(battleId);
    if (plain) {
      const rebuilt = fromPlainState(plain);
      reconcileBattle(rebuilt); // 隐患一加固：清算超时僵尸 pendingSurprise
      battleStore.set(battleId, rebuilt); // 写回内存，后续调用直接命中
      logger.info({ msg: `[requireBattle] 从 DB 快照重建战局 ${ battleId } units= ${ rebuilt.units?.size ?? 0 }` });
      return rebuilt;
    }
  } catch (e: any) {
    logger.error({ msg: `[requireBattle] rehydrate 失败 ${ battleId } ${ e?.message || e }` });
  }
  return null;
}

// ============================================
// 内存战局快照回滚脚手架（重构方案 1.3 Step A — 第一道可逆闸门）
// 作用：为「读改写回」类脆弱操作提供异常状态下的顶层引用替换还原，
//       彻底杜绝隐性战局数据损坏（半更新态）。
// 边界：battle 必须是纯数据（实测含 units:Map，structuredClone 支持 Map；
//       BattleUnit 经 toExecutorUnit 验证为纯数据）。回滚用 Object.assign
//       顶层替换，确保 Map 引用也一并还原，不可用逐字段 merge。
// 注意：仅覆盖【内存战局】；元数据(房间/部署池)落盘仍走 sql.js 手动事务。
// ============================================
function withBattleRollback<T>(battle: any, fn: () => T): T {
  const snap = structuredClone(battle); // 操作前深拷贝快照（须先验证 battle 纯净度）
  try {
    return fn();
  } catch (e: any) {
    Object.assign(battle, snap);        // 顶层引用替换，Map 等结构一并还原
    logger.error({ msg: '[withBattleRollback] 战局写回回滚', battleId: battle?.id, err: e?.message || e });
    throw e;
  }
}

// ============================================
// 阵营角色轮转管理（阶段二规则）
// 轮转以「角色」(attack/defense/ambush) 为单位，不以势力(earth/balon/maxion)为依据。
// 旧战局( factionTurnOrder 仍是势力键 ) 或缺少 factionRoles 时，运行时迁移。
// ============================================
/**
 * 依据「实际已部署单位」重建 factionRoles（faction→role），使其与战局完全一致。
 * 权威数据源：battle.factionRolesConfig（来自 room.rules.factionRoles，结构 role→[factions]）。
 * 规则（优先级）：
 *   1) 房间配置 factionRolesConfig：配置里覆盖到的已部署阵营 → 对应角色（唯一权威，绝不反向覆盖）；
 *   2) 遗留映射 LEGACY_FACTION_TO_ROLE（仅作未覆盖阵营的兜底，不覆盖配置）；
 *   3) 其余未分配阵营 → 按优先级(attack/defense/ambush)填入尚无人占用的角色。
 * 这样 GM 在整备室配置的“阵营↔角色”映射在开战后始终生效，且不再被硬编码 earth/maxion/balon 覆盖。
 */
function reconcileFactionRoles(battle: BattleState): void {
  const order = (battle.factionTurnOrder || []).filter((r: string) => TURN_ROLES.includes(r as typeof TURN_ROLES[number]));
  const deployed = new Set<string>();
  if (battle.units && typeof (battle.units as any).values === 'function') {
    for (const u of (battle.units as any).values()) {
      if (u && u.faction != null) deployed.add(String(u.faction));
    }
  }
  const fr: Record<string, string> = {};
  const roleHasFaction: Record<string, boolean> = {};

  // 1) 权威：房间配置的 factionRoles（role→[factions]），整备室一路透传而来
  const cfg = ((battle as any).factionRolesConfig && typeof (battle as any).factionRolesConfig === 'object')
    ? (battle as any).factionRolesConfig
    : {};
  for (const [role, factions] of Object.entries(cfg)) {
    if (!order.includes(role as typeof TURN_ROLES[number])) continue;
    const fa = Array.isArray(factions) ? factions : [factions];
    for (const f of fa) {
      const fs = String(f);
      if (deployed.has(fs) && !fr[fs]) {
        fr[fs] = role;
        roleHasFaction[role] = true;
      }
    }
  }
  // 2) 遗留映射（仅兜底，绝不覆盖配置已分配的阵营）
  for (const f of deployed) {
    if (fr[f]) continue;
    const legacy = LEGACY_FACTION_TO_ROLE[f as keyof typeof LEGACY_FACTION_TO_ROLE];
    if (legacy && order.includes(legacy) && !roleHasFaction[legacy]) {
      fr[f] = legacy;
      roleHasFaction[legacy] = true;
    }
  }
  // 3) 剩余未分配阵营 → 尚无人占用的角色（按优先级）
  const priority = ['attack', 'defense', 'ambush'] as const;
  for (const f of deployed) {
    if (fr[f]) continue;
    const target = priority.find(r => order.includes(r) && !roleHasFaction[r]);
    fr[f] = target || 'attack';
    roleHasFaction[fr[f]] = true;
  }
  battle.factionRoles = fr;
}

function ensureTurnModel(battle: BattleState): void {
  // 归一化 factionTurnOrder 仅保留合法角色
  const order = (battle.factionTurnOrder || []).filter((r: string) => TURN_ROLES.includes(r as typeof TURN_ROLES[number]));
  if (order.length) battle.factionTurnOrder = order;
  else battle.factionTurnOrder = [...TURN_ROLES];
  // 始终根据实际部署重建 factionRoles（修复空 {} / 漏传 / 角色错位）
  reconcileFactionRoles(battle);
  if (battle.activeFactionIndex == null) battle.activeFactionIndex = 0;
  // 确保 activeFaction 合法（旧势力键或越界则拉回首位）
  if (!battle.factionTurnOrder.includes(battle.activeFaction as typeof TURN_ROLES[number])) {
    battle.activeFaction = battle.factionTurnOrder[0] || 'attack';
  }
  // 同步 activeFactionIndex 到新 order
  const ni = battle.factionTurnOrder.indexOf(battle.activeFaction as typeof TURN_ROLES[number]);
  if (ni >= 0) battle.activeFactionIndex = ni;
}

/** 新一轮副作用：统一重置 AP（已在 advanceTurn 内完成）+ 空投生成与拾取结算 */
function applyNewRoundEffects(battle: BattleState): void {
  try {
    fireReaction('on_round_start', { battleState: battle, round: battle.round, log: () => {}, broadcast: () => {} });
    if (Array.isArray(battle.units)) {
      for (const u of battle.units) { fireReaction('on_item_pickup', { battleState: battle, unit: u }); pickupAirdrops(battle, u as any); }
    } else if (battle.units && typeof (battle.units as any).forEach === 'function') {
      (battle.units as any).forEach((u: any) => { fireReaction('on_item_pickup', { battleState: battle, unit: u }); pickupAirdrops(battle, u); });
    }
  } catch (e) { logger.error({ msg: `[airdrop/H4] ${ JSON.stringify((e as any)?.message) }` }); }
  // 清除上一轮遗留的「防御姿态」减伤（持续到该单位下个自己的回合开始 = 新一轮时点）
  try {
    const unitsArr = Array.isArray(battle.units) ? battle.units : (battle.units && typeof (battle.units as any).forEach === 'function' ? Array.from((battle.units as any).values()) : []);
    for (const u of unitsArr) {
      if (u && Array.isArray(u.statusEffects)) {
        u.statusEffects = u.statusEffects.filter((s: any) => s.source !== 'defend_action');
      }
    }
  } catch (e2) { logger.error({ msg: `[defend/clear] ${ JSON.stringify((e2 as any)?.message) }` }); }
}

/** 推进到下一个「有存活棋子」的角色；跨过末尾则进入新一轮（重置行动点） */
function advanceTurn(battle: BattleState): { isNewRound: boolean } {
  const order = (battle.factionTurnOrder && battle.factionTurnOrder.length)
    ? battle.factionTurnOrder
    : ([...TURN_ROLES] as string[]);
  const n = order.length;
  const startIdx = battle.activeFactionIndex || 0;
  let isNewRound = false;
  for (let step = 1; step <= n; step++) {
    const nextIdx = (startIdx + step) % n;
    if (startIdx + step >= n) isNewRound = true; // 越过末尾回到起点 = 新一轮
    const role = order[nextIdx];
    if (getRoleUnits(battle, role).length > 0) {
      if (isNewRound) {
        battle.round += 1;
        resetAllActionPoints(battle);
      }
      battle.activeFactionIndex = nextIdx;
      battle.activeFaction = role;
      battle.turn = (battle.turn || 0) + 1;
      for (const u of getRoleUnits(battle, role)) {
        (u as unknown as { standby?: boolean }).standby = false;
      }
      return { isNewRound };
    }
  }
  return { isNewRound: false };
}

/**
 * Phase 6：服务端驱动的 AI 回合。
 *
 * 遍历指定角色下所有有行动点的存活单位，对每个单位循环行动直到无法再动：
 *  - 若射程内有存活敌方 → 复用 runAttackInternal 执行攻击（force 绕过回合/AP 门控）
 *  - 否则用 tsFindPath 走向最近敌方的射程内格
 * 每一步都记录进 battle.aiActions 并通过 battleStore.set 推送全量快照，
 * 客户端据此平滑补间位移与播放受击飘字，而非瞬移/瞬砍。
 *
 * 该函数被 end-turn 在切到 AI 角色后异步触发（不阻塞 HTTP 响应）。
 */
/**
 * ★ Phase 7.1 AI 技能策略优选
 * 从单位的 attack 类技能中，依据【射程覆盖 / AOE 覆盖 / 预估伤害】给每个候选打分，
 * 返回最优技能（含 key/skill_key）。若无任何 attack 技能则兜底取 skills[0]。
 * @param battle 战局（用于统计 AOE 覆盖的敌方数量）
 * @param unit  AI 行动单位
 * @param nearest 当前锁定的最近敌方
 */
function aiPickAttackSkill(battle: any, unit: any, nearest: any): any {
  const skills = Array.isArray(unit.skills) ? unit.skills : [];
  const atkSkills = skills.filter(
    (s: any) => s && (s.attack_type === 'attack' || s.action_type === 'attack' || s.category === 'attack'),
  );
  const pool = atkSkills.length > 0 ? atkSkills : skills;
  if (pool.length === 0) return null;
  if (pool.length === 1) {
    const s = pool[0];
    return { key: s.key || s.skill_key || s.id, skill: s };
  }
  const nearestPos = nearest?.position || { q: 0, r: 0 };
  let best: any = null;
  let bestScore = -Infinity;
  for (const s of pool) {
    let score = 0;
    // 1) 射程覆盖：能命中最近敌 → +2
    const rf = getSkillRangeFields(s);
    const maxR = rf?.maxRange ?? (s.cast_range ?? unit.range ?? 1);
    const minR = rf?.minRange ?? 1;
    const dToNearest = hexDist(unit.position, nearestPos);
    if (dToNearest >= minR && dToNearest <= maxR) score += 2;
    // 2) AOE 覆盖：技能带 aoe/area 且能波及 ≥2 敌 → +3
    const aoeR = (s.aoe ?? s.area ?? s.radius ?? 0);
    if (aoeR > 0) {
      const selfRole = resolveRole(battle.factionRoles || {}, unit.faction);
      const extra = Array.from(battle.units.values()).filter(
        (e: any) => isUnitAlive(e)
          && resolveRole(battle.factionRoles || {}, e.faction) !== selfRole
          && hexDist(nearestPos, e.position) <= aoeR,
      ).length;
      if (extra >= 2) score += 3;
    }
    // 3) 预估伤害：粗略取 power/base_damage/effects 中的最大值，加权 +dmg/10
    const dmg = Math.max(
      Number(s.power) || 0,
      Number(s.base_damage) || 0,
      ...(Array.isArray(s.effects) ? s.effects.map((ef: any) => Number(ef?.value) || 0) : [0]),
    );
    score += dmg / 10;
    if (score > bestScore) { bestScore = score; best = s; }
  }
  return best ? { key: best.key || best.skill_key || best.id, skill: best } : null;
}

async function runAiTurn(battle: BattleState, role: string, depth: number = 0): Promise<void> {
  try {
    // 防御：全 AI 战局或异常时限制连续 AI 推进行数（避免死循环）
    if (depth > 40) { logger.warn({ msg: '[ai/turn] 超出最大 AI 推进深度，中止' }); return; }
    // 清空上一轮 AI 增量，本次重新累积
    battle.aiActions = [];
    const units = getRoleUnits(battle, role).filter((u: any) => isUnitAlive(u));
    for (const unit of units) {
      if (!isUnitAlive(unit)) continue;
      let acted = true;
      let guard = 0;
      while (acted && guard < 4) {
        guard++;
        acted = false;
        // 找最近存活敌方（角色键 ≠ 自身角色）
        const enemies = Array.from(battle.units.values()).filter(
          (e: any) => isUnitAlive(e) && resolveRole(battle.factionRoles || {}, e.faction) !== role,
        );
        if (enemies.length === 0) break;
        let nearest: any = null;
        let best = Infinity;
        for (const e of enemies) {
          const d = hexDist(unit.position, e.position);
          if (d < best) { best = d; nearest = e; }
        }
        if (!nearest) break;
        const range = (unit as any).range ?? (unit as any).currentStats?.range ?? 1;
        if (best <= range) {
          // 攻击：★ Phase 7.1 AI 策略优选技能（射程/AOE/伤害）
          const pick = aiPickAttackSkill(battle, unit, nearest);
          const skillKey = pick?.key
            || (Array.isArray((unit as any).skills) && (unit as any).skills[0]
              && ((unit as any).skills[0].key || (unit as any).skills[0].id));
          const from = { q: unit.position.q, r: unit.position.r };
          const res = await runAttackInternal(battle, {
            attackerId: (unit as any).unitId,
            targetId: (nearest as any).unitId,
            skillKey,
            force: true,
            skipConsume: true,
          });
          battle.aiActions = battle.aiActions || [];
          const cr = res?.result || {};
          battle.aiActions.push({
            type: 'attack',
            unitId: (unit as any).unitId,
            from,
            targetId: (nearest as any).unitId,
            skillKey,
            combat_result: {
              ...cr,
              killed: !!cr.killed,
              killed_targets: Array.isArray(cr.killedTargets) ? cr.killedTargets : [],
              // 阶段 6：机动/姿态数据透传（与 /attack 响应一致，读 damagePipe.stages）
              mobility_diff: (cr && cr.stages) ? (cr.stages.mobility_diff ?? 0) : 0,
              sniper_mobility_reduction: (cr && cr.stages) ? (cr.stages.sniper_mobility_reduction ?? 0) : 0,
              height_bonus: (cr && cr.stages) ? (cr.stages.height_bonus ?? 0) : 0,
              attacker_stance: ((unit as any).stance) ? String((unit as any).stance) : null,
              defender_stance: ((nearest as any).stance) ? String((nearest as any).stance) : null,
            },
          });
          battleStore.set(battle.id, battle);
          acted = true;
        } else {
          // 移动：寻路到最近敌射程内（路径上限 = range+2 搜索半径）
          const path = tsFindPath(battle, unit.position, nearest.position, Number(range) + 2);
          if (path && path.length > 1) {
            const steps = Math.max(1, (unit as any).moveRange || (unit as any).mobility || 3);
            const idx = Math.min(steps, path.length - 1);
            const target = path[idx] || path[path.length - 1];
            const from = { q: unit.position.q, r: unit.position.r };
            unit.position = { q: target.q, r: target.r };
            (unit as any).q = target.q;
            (unit as any).r = target.r;
            battle.aiActions = battle.aiActions || [];
            battle.aiActions.push({
              type: 'move',
              unitId: (unit as any).unitId,
              from,
              to: { q: target.q, r: target.r },
            });
            battleStore.set(battle.id, battle);
            acted = true;
          } else {
            break;
          }
        }
      }
    }
    // AI 本角色行动完毕：推进到下一角色（可能跨入新一轮）
    const adv2 = advanceTurn(battle);
    if (adv2.isNewRound) applyNewRoundEffects(battle);
    const v2 = evaluateVictory(battle);
    if (v2.victory) {
      (battle as any).status = 'finished';
      try { clearBattleSnapshot(battle.id); } catch { /* ignore */ }
    }
    battle.aiActions = battle.aiActions || [];
    battle.aiActions.push({ type: 'end_turn', unitId: '' });
    battleStore.set(battle.id, battle);
    // 若下一角色仍是 AI 控制，链式触发其回合；否则停手交由玩家/客户端接手
    if (!v2.victory && Array.isArray(battle.aiRoles) && battle.aiRoles.includes(battle.activeFaction)) {
      await runAiTurn(battle, battle.activeFaction, depth + 1);
    }
  } catch (e) {
    logger.error({ msg: `[ai/turn] ${ (e as any)?.message }` });
  }
}

/**
 * 被动调度器：在单位每次"开始行动"时调用。
 * 遍历该单位所有 action_type==='passive' 的技能，校验 trigger.type 与 trigger.condition，
 * 条件满足且本回合未触发过，则将技能的 effects 转写为运行时 statusEffect 写入单位，
 * 并产出战报日志（供前端透传"XX 被动自动触发"）。
 *
 * 触发模型（与 shared-kernel TriggerContract 对齐）：
 *  - trigger.type 须为 'on_turn_start' 或省略（行动时触发）。其它时机（on_damage_taken 等）此处不处理。
 *  - trigger.condition（可选）：
 *      hp_below_pct            当前 HP/MaxHP*100 < 该值
 *      distance_less_than      与最近敌方六角距离 ≤ 该值
 *      distance_greater_than   与最近敌方六角距离 ≥ 该值
 *    所有给定的阈值条件需同时满足。
 */
function evaluatePassives(unit: any, battle: any): any[] {
  const logs: any[] = [];
  if (!unit || !battle) return logs;
  const selfRole = resolveRole(battle.factionRoles, unit.faction);
  const skills = Array.isArray(unit.skills) ? unit.skills : (safeParseValue(unit.skills) || []);
  const passives = skills.filter(
    (s: any) => s && (s.action_type === 'passive' || s.trigger?.type === 'on_turn_start'),
  );
  if (passives.length === 0) return logs;

  // 本回合去重：避免一次行动多次结算时重复叠加同一被动
  const fired = (unit as any)._passiveFired ?? {};
  if (fired.round !== battle.round) {
    (unit as any)._passiveFired = { round: battle.round, keys: new Set<string>() };
  }
  const firedKeys = (unit as any)._passiveFired.keys as Set<string>;

  // 最近敌方距离
  let nearestEnemyDist = Infinity;
  for (const e of battle.units.values()) {
    if (!e || e === unit) continue;
    if ((e.currentStats?.hp ?? 0) <= 0) continue;
    if (resolveRole(battle.factionRoles, e.faction) === selfRole) continue; // 仅敌方
    if (!unit.position || !e.position) continue;
    const d = hexDist(unit.position, e.position);
    if (d < nearestEnemyDist) nearestEnemyDist = d;
  }

  for (const skill of passives) {
    const skillKey = skill.key || skill.skill_key || skill.id || skill.name;
    if (firedKeys.has(String(skillKey))) continue; // 本回合已触发
    const trig = skill.trigger || {};
    if (trig.type && trig.type !== 'on_turn_start' && trig.type !== 'unconditional') continue;

    const cond = trig.condition || {};
    let ok = true;
    if (typeof cond.hp_below_pct === 'number') {
      const maxHp = unit.currentStats?.maxHp ?? unit.maxHp ?? 0;
      const hp = unit.currentStats?.hp ?? unit.hp ?? 0;
      const pct = maxHp > 0 ? (hp / maxHp) * 100 : 100;
      if (!(pct < cond.hp_below_pct)) ok = false;
    }
    if (ok && typeof cond.distance_less_than === 'number') {
      if (!(nearestEnemyDist <= cond.distance_less_than)) ok = false;
    }
    if (ok && typeof cond.distance_greater_than === 'number') {
      if (!(nearestEnemyDist >= cond.distance_greater_than)) ok = false;
    }
    if (!ok) continue;

    // 条件满足：把 effects 转写为运行时 statusEffect
    const effects = Array.isArray(skill.effects) ? skill.effects : [];
    for (const eff of effects) {
      if (!eff) continue;
      const fx = {
        label: skill.name || skill.name || skillKey,
        key: String(skillKey),
        source: String(skillKey),
        trigger: { type: 'unconditional', attack_type: eff.type, damage_kind: eff.damage_kind },
        applies_on: eff.applies_on || 'defense',
        consumption: eff.consumption || { mode: 'duration', value: eff.consumption?.value ?? 1 },
        mode: eff.mode || 'restore',
        target_type: eff.target_type || 'self',
        value: eff.value ?? null,
        flat_value: eff.flat_value ?? null,
        fixed_rate_multiplier: eff.fixed_rate_multiplier ?? null,
        armor_pen: eff.armor_pen ?? null,
        fixed_mod: eff.fixed_mod ?? null,
        rate_value: eff.rate_value ?? null,
        base: eff.base ?? null,
        duration: eff.duration ?? null,
        trigger_scope: eff.trigger_scope || null,
        meta: { passive: true, fromTrigger: trig.type || 'on_turn_start' },
      };
      unit.statusEffects = Array.isArray(unit.statusEffects) ? unit.statusEffects : [];
      unit.statusEffects.push(fx);
    }

    firedKeys.add(String(skillKey));
    logs.push({
      type: 'passive_triggered',
      unit_id: unit.id,
      unit_name: unit.name,
      skill_key: String(skillKey),
      skill_name: skill.name || String(skillKey),
      trigger: trig.type || 'on_turn_start',
      condition: cond,
    });
  }
  return logs;
}

/**
 * 效果堆栈分头路由（双阵营主目标核心）：
 * 把技能自身的 effects 数组按每个 effect 的 target_type 路由到对应阵营的单位，
 * 转写为运行时 statusEffect 写入。这样「对友方产生效果1、对敌方产生效果2」的
 * 双阵营技能只需在词条编辑器里让两个 effect 分别设为 SINGLE_ALLY / SINGLE_ENEMY，
 * 而玩家释放时只需选一个敌方主目标（友方自动按施法者阵营寻找）。
 *
 * target_type 语义：
 *  SELF / 缺省   → 施法者自身
 *  SINGLE_ALLY   → 施法者阵营第一个存活友军
 *  AREA_ALLY     → 施法者阵营全部存活友军
 *  SINGLE_ENEMY  → 主目标（primaryTarget，应为敌方）
 *  AREA_ENEMY    → 敌方全体存活单位
 *  ALL_UNITS     → 战局全体存活单位
 * 返回写入的战报日志数组。
 */
function routeEffectStackToTargets(skill: any, casterUnit: any, primaryTarget: any, battle: any): any[] {
  const logs: any[] = [];
  if (!skill || !battle) return logs;
  const effects = Array.isArray(skill.effects) ? skill.effects : [];
  if (effects.length === 0) return logs;

  const casterRole = resolveRole(battle.factionRoles, casterUnit.faction);
  const allies: any[] = [];
  const enemies: any[] = [];
  for (const u of battle.units.values()) {
    if (!u || u === casterUnit) continue;
    if ((u.currentStats?.hp ?? 0) <= 0) continue;
    const r = resolveRole(battle.factionRoles, u.faction);
    if (r === casterRole) allies.push(u); else enemies.push(u);
  }

  const pickTargets = (tt: string): any[] => {
    switch (tt) {
      case 'SELF': return [casterUnit];
      case 'SINGLE_ALLY': return allies.length ? [allies[0]] : [];
      case 'AREA_ALLY': return allies;
      case 'SINGLE_ENEMY': return primaryTarget ? [primaryTarget] : (enemies.length ? [enemies[0]] : []);
      case 'AREA_ENEMY': return enemies;
      case 'ALL_UNITS': return [casterUnit, ...allies, ...enemies];
      default: return [casterUnit];
    }
  };

  const skillKey = skill.key || skill.skill_key || skill.id || skill.name || 'effect_stack';
  for (const eff of effects) {
    if (!eff) continue;
    const targets = pickTargets(eff.target_type || 'SELF');
    if (targets.length === 0) continue;
    for (const tu of targets) {
      const fx = {
        label: skill.name || skillKey,
        key: String(skillKey),
        source: String(skillKey),
        trigger: { type: 'unconditional', attack_type: eff.type, damage_kind: eff.damage_kind },
        applies_on: eff.applies_on || 'defense',
        consumption: eff.consumption || { mode: 'duration', value: eff.consumption?.value ?? 1 },
        mode: eff.mode || 'restore',
        target_type: eff.target_type || 'SELF',
        value: eff.value ?? null,
        flat_value: eff.flat_value ?? null,
        fixed_rate_multiplier: eff.fixed_rate_multiplier ?? null,
        armor_pen: eff.armor_pen ?? null,
        fixed_mod: eff.fixed_mod ?? null,
        rate_value: eff.rate_value ?? null,
        base: eff.base ?? null,
        duration: eff.duration ?? null,
        trigger_scope: eff.trigger_scope || null,
        meta: { routed_effect: true, fromSkill: skillKey },
      };
      tu.statusEffects = Array.isArray(tu.statusEffects) ? tu.statusEffects : [];
      tu.statusEffects.push(fx);
    }
    logs.push({
      type: 'effect_routed',
      skill_key: String(skillKey),
      effect_type: eff.type,
      target_type: eff.target_type || 'SELF',
      targets: pickTargets(eff.target_type || 'SELF').map((t: any) => t.id || t.unitId),
    });
  }
  return logs;
}

/**
 * 自动跳轮检查：
 * - 当前角色已无存活棋子 → 跳过
 * - 当前角色所有存活棋子均已「待机(standby)」→ 跳到下一角色
 * 返回是否发生了跳轮。
 */
function maybeAutoAdvance(battle: BattleState): boolean {
  ensureTurnModel(battle);
  const role = battle.activeFaction;
  const us = getRoleUnits(battle, role);
  if (us.length === 0 || us.every(u => (u as unknown as { standby?: boolean }).standby === true)) {
    const adv = advanceTurn(battle);
    if (adv.isNewRound) applyNewRoundEffects(battle);
    return true;
  }
  return false;
}

// 从战局 cells 构建 "q,r"→terrainId 地形图，供 .cjs 攻击引擎计算掩体减伤
function buildTerrainMap(battle: any): Record<string, string> {
  const map: Record<string, string> = {};
  const cells = battle?.map?.cells || battle?.cells || battle?.battlefield_state?.cells || [];
  for (const c of cells) {
    if (c && c.q != null && c.r != null) map[getHexKey(c.q, c.r)] = c.terrain || 'moon';
  }
  return map;
}

// 方案A：部署时解析单位轮转角色(attack/defense/ambush)。
// 优先 battle.factionRoles（已 reconcile）→ 其次 factionRolesConfig（role->factions[]）→ 兜底 attack。
function resolveUnitRole(battle: any, faction: string | undefined): string {
  if (battle?.factionRoles && faction != null && battle.factionRoles[faction]) return battle.factionRoles[faction];
  const cfg = battle?.factionRolesConfig;
  if (cfg && typeof cfg === 'object') {
    for (const [role, fa] of Object.entries(cfg)) {
      const arr = Array.isArray(fa) ? fa : [fa];
      if (faction != null && arr.includes(faction)) return role;
    }
  }
  return 'attack';
}

// 将地图内容(单元格包围盒)平移到 gridW×gridH 画布中心，保证战场打开时居中。
// 中心 = ((gridW-1)/2, (gridH-1)/2)；50×50 → (24.5, 24.5)。
// 偏移量按 cells 包围盒计算，cells 与 spawn_points 同移（与编辑器重定位逻辑一致）；
// 已居中的地图 dq=dr=0 → 原样返回（幂等，可重复创建战局）。
function centerMapInGrid(rawCells: any[], rawSpawns: any[], gridW: number, gridH: number) {
  let cells = Array.isArray(rawCells) ? rawCells : [];
  let spawns = Array.isArray(rawSpawns) ? rawSpawns : [];
  if (!cells.length) return { cells, spawns };
  let minQ = Infinity, maxQ = -Infinity, minR = Infinity, maxR = -Infinity;
  for (const c of cells) {
    if (c && c.q != null && c.r != null) {
      if (c.q < minQ) minQ = c.q;
      if (c.q > maxQ) maxQ = c.q;
      if (c.r < minR) minR = c.r;
      if (c.r > maxR) maxR = c.r;
    }
  }
  if (!isFinite(minQ)) return { cells, spawns };
  const cq = (minQ + maxQ) / 2;
  const cr = (minR + maxR) / 2;
  const dq = Math.round((gridW - 1) / 2 - cq);
  const dr = Math.round((gridH - 1) / 2 - cr);
  if (dq === 0 && dr === 0) return { cells, spawns };
  const shiftCell = (c: any) => (c && c.q != null && c.r != null ? { ...c, q: c.q + dq, r: c.r + dr } : c);
  const shiftSpawn = (p: any) => (p && p.q != null && p.r != null ? { ...p, q: p.q + dq, r: p.r + dr } : p);
  return {
    cells: cells.map(shiftCell),
    spawns: spawns.map(shiftSpawn),
  };
}
import { terrainCost } from './terrainCosts.js';

const router = Router();

// ============================================
// 内存战局存储（Phase 29-P2: 后续迁移至 Redis/PostgreSQL）
// ============================================

// ============================================
// Batch A 任务1.0/1.2: 推送与战报缓冲（P8）
// 用子类包装 battleStore：每次 set 自动把权威态推到 comm（单向数据管道，
// 覆盖 attack/move/skill/action/end-turn/deploy 等所有 mutation 路由）。
// ============================================
class PushBattleStore extends Map<string, BattleState> {
  set(key: string, value: BattleState): this {
    const r = super.set(key, value);
    // fire-and-forget：不 await；推送失败被 commPush 内部 try/catch 吞掉，不影响主链路
    pushBattleState(key, value);
    // 第2步：每次权威态变更即同步落库快照（覆盖 deploy/recall/end-deployment/move/
    // attack/skill/damage/end-turn/victory/seed 所有 mutation 路由）。
    // ★ A-5：CAS 乐观锁——每次写回自动携带 _version（并发写冲突则拒绝落库，避免半更新态覆盖）。
    // 同步调用（与 combatSnap 防呆纪律一致）；失败被吞，不影响主链路。
    try {
      const baseVersion = Number((value as any)._version ?? 0);
      const nextVersion = baseVersion + 1;
      (value as any)._version = nextVersion;
      const casOk = saveBattleSnapshot(key, value, baseVersion);
      if (!casOk) {
        logger.warn({ msg: `[PushBattleStore] CAS 冲突 ${ key } base=${ baseVersion }（丢弃落库，内存态保留）` });
      }
    } catch (e: any) {
      logger.error({ msg: `[PushBattleStore] saveBattleSnapshot 失败 ${ key } ${ e?.message || e }` });
    }
    return r;
  }
}
const battleStore = new PushBattleStore();

/**
 * ★ A-5：applyPatch —— 唯一状态写回出口（原子事务 + 增量 Diff + CAS）。
 *
 * 职责：
 *  1. 五条不变量守卫（HP/占位/越界/悬空 unitId/批内双写），任一违反则整体回滚。
 *  2. 原子性：先在内存克隆上应用 patches，全部通过后才提交 battleStore.set；
 *     失败则回滚（Object.assign 顶层替换受影响单位子集，恢复 _meta 等活路径）。
 *  3. 增量 Diff：生成 { version, baseVersion, patches[] } 挂到 battle._lastDiff，
 *     供 comm 增量广播（替代整局全量推送，逐步演进）。
 *  4. CAS 乐观锁：调 saveBattleSnapshot 时携带 expectedVersion，并发写冲突则拒绝落库。
 *
 * @param battleId 战局 id
 * @param patches PatchContract.statePatch 数组（{unitId, field, op, value}）
 * @param opts.fromPhase 调用来源标记（'skill'|'attack'|...），仅日志
 */
function applyPatch(battleId: string, patches: any[], opts: { fromPhase?: string } = {}): { ok: boolean; error?: string } {
  const battle = requireBattle(battleId);
  if (!battle) return { ok: false, error: 'BATTLE_NOT_FOUND' };
  const units = battle.units instanceof Map ? battle.units : new Map();
  const width = battle.map?.attributes?.get?.('width') ?? battle.map?.width ?? 100;
  const height = battle.map?.attributes?.get?.('height') ?? battle.map?.height ?? 100;

  // ---- 1. 预检：悬空 unitId（不变量4） ----
  for (const p of patches) {
    if (!units.has(String(p.unitId))) {
      logger.warn({ msg: `[applyPatch] 悬空 unitId 拒绝 ${ battleId } ${ p.unitId }` });
      return { ok: false, error: 'ORPHAN_UNIT_ID' };
    }
  }

  // ---- 2. 克隆受影响单位子集，准备原子应用（不变量5：批内双写检测） ----
  const touched = new Map<string, any>();
  for (const p of patches) {
    const id = String(p.unitId);
    if (!touched.has(id)) {
      const u = units.get(id);
      touched.set(id, structuredClone(u));
    }
  }
  // 批内双写：同一 unitId 同一 field 出现多次 → 视为非法（非幂等）
  const seen = new Set<string>();
  for (const p of patches) {
    const k = `${p.unitId}:${p.field}`;
    if (seen.has(k)) {
      logger.warn({ msg: `[applyPatch] 批内双写拒绝 ${ battleId } ${ k }` });
      return { ok: false, error: 'BATCH_DOUBLE_WRITE' };
    }
    seen.add(k);
  }

  // ---- 3. 应用 patches（在克隆上） + 不变量守卫 ----
  const applied: { unitId: string; field: string; value: number }[] = [];
  for (const p of patches) {
    const u = touched.get(String(p.unitId));
    const stats = u.currentStats || (u.currentStats = {});
    const cur = Number(stats[p.field] ?? 0);
    let next = cur;
    if (p.op === 'set') next = Number(p.value);
    else if (p.op === 'add') next = cur + Number(p.value);
    else if (p.op === 'sub') next = cur - Number(p.value);

    // 不变量1：HP 边界
    if (p.field === 'hp') {
      const maxHp = Number(u.currentStats?.max_hp ?? u.currentStats?.maxHp ?? 0);
      if (next < 0) next = 0;
      if (maxHp > 0 && next > maxHp) next = maxHp;
    }
    // 不变量2/3 占位与越界：仅对 position 变更做校验（field 为 position 时 value 为 {q,r}）
    if (p.field === 'position') {
      const pos = p.value;
      if (pos && (pos.q < 0 || pos.r < 0 || pos.q >= width || pos.r >= height)) {
        logger.warn({ msg: `[applyPatch] 越界拒绝 ${ battleId }`, pos });
        return { ok: false, error: 'OUT_OF_BOUNDS' };
      }
    }
    stats[p.field] = next;
    applied.push({ unitId: String(p.unitId), field: p.field, value: next });
  }

  // ---- 4. 提交：写回受影响的单位子集（顶层替换，保留 Map 引用） ----
  for (const [id, u] of touched) {
    units.set(id, u);
  }

  // ---- 5. 增量 Diff 生成（version/baseVersion/patches） ----
  const baseVersion = Number((battle as any)._version ?? 0);
  const version = baseVersion + 1;
  (battle as any)._version = version;
  (battle as any)._lastDiff = {
    version,
    baseVersion,
    battleId,
    patches: applied.map((a) => ({ unitId: a.unitId, field: a.field, value: a.value })),
  };

  // ---- 6. 落库（CAS 乐观锁） ----
  try {
    const ok = saveBattleSnapshot(battleId, battle, baseVersion);
    if (!ok) {
      logger.warn({ msg: `[applyPatch] CAS 冲突 ${ battleId } base=${ baseVersion }` });
      return { ok: false, error: 'CAS_CONFLICT' };
    }
  } catch (e: any) {
    logger.error({ msg: `[applyPatch] saveBattleSnapshot 失败 ${ battleId } ${ e?.message || e }` });
    return { ok: false, error: 'SNAPSHOT_FAILED' };
  }

  // ---- 7. 触发实时推送（整局 + 增量 diff 一并携带，逐步演进） ----
  battleStore.set(battleId, battle);
  logger.info({ msg: `[applyPatch] 写回成功 ${ battleId } patches=${ patches.length } v=${ version }`, fromPhase: opts.fromPhase });
  return { ok: true };
}

/** P8：向战局追加一条战报（combatLog[] 缓冲），随推送流携带给前端。 */
function appendCombatLog(battle: any, entry: any): void {
  if (!battle) return;
  battle.combatLog = Array.isArray(battle.combatLog) ? battle.combatLog : [];
  battle.combatLog.push({ ...entry, t: Date.now() });
  if (battle.combatLog.length > 200) battle.combatLog.shift();
}

/**
 * ★ HP 写回统一入口：顶层 hp/maxHp 与 currentStats.hp 同源（项目契约，见 createBattleUnit）。
 * 攻击/治疗/反击/分担等所有伤害结算必须经由本函数，确保：
 *   1. currentStats.hp 被扣减（引擎内部读 currentStats.hp 做存活/胜利判定）；
 *   2. 顶层 bu.hp 同步扣减（前端 normalizeBattleState 仅当顶层 hp===undefined 才回灌 currentStats，
 *      而 createBattleUnit 已注入顶层 hp，故若不在此同步顶层，前端棋子 HP 永远显示初始满血）。
 * @param bu       BattleUnit（来自 battle.units.get）
 * @param delta    伤害为负、治疗为正
 * @param maxHp    可选，提供则用其钳制治疗上限；缺省用 currentStats.maxHp
 */
function applyHpDelta(bu: any, delta: number, maxHp?: number): number {
  if (!bu) return 0;
  const st = bu.currentStats || (bu.currentStats = {});
  const before = st.hp ?? 0;
  // delta 符号约定：负值=扣血，正值=治疗；统一用 before + delta。
  let next = before + delta;
  if (delta < 0) next = Math.max(0, next);                 // 扣血下限 0
  else if (delta > 0) {                                     // 治疗上限
    const cap = (maxHp ?? st.maxHp ?? before);
    if (cap > 0) next = Math.min(cap, next);
  }
  st.hp = next;
  // 同步顶层（前端直接读取顶层 hp，且 dead 判定依赖顶层）
  bu.hp = next;
  if (next <= 0) bu.killed = true;
  return next;
}

/** 战斗态对外视图：units（Map）→ 数组，便于前端消费；未找到返回 null。 */
function getStateView(battleId: string): any {
  const b = requireBattle(battleId);
  if (!b) return null;
  const units = b.units instanceof Map ? Array.from(b.units.values()) : (b.units || []);
  return { ...b, units };
}

// ============================================
// Batch B 任务2.2: 集中化指令门控（canIssueCommand）
// 替代散落的内联 faction 校验，统一承载：
//   - neutral 单位始终可行动
//   - 当前激活阵营可行动
//   - REFEREE / DOMINATOR 的 Override Bypass 特权（GM 越权放行）
// ============================================
function canIssueCommand(battle: any, unit: any, reqUser?: any): boolean {
  if (!battle || !unit) return false;
  const f = unit.faction;
  if (f === 'neutral') return true; // neutral 单位不受阵营轮转限制
  if (battle.activeFaction && resolveRole(battle.factionRoles, f) === battle.activeFaction) return true;

  const uid = String(reqUser?.userId || reqUser?.user?.userId || '');
  // 战局身份快照（开战瞬间固化，防中途后台改 role 越权作弊）；缺失时回退实时 token role（兼容旧战局）
  const snap = (battle as any).state_snapshot?.roles?.[uid];
  const liveRole = (reqUser?.role || reqUser?.user?.role || '').toUpperCase();
  const role = (snap?.role || liveRole).toUpperCase();
  // GM / 裁判越权放行：只读开战瞬间固化的账号 role 快照
  if (role === 'REFEREE' || role === 'DOMINATOR') return true;
  // 代打机制（2026-07-30）：房主（isHost）可代理场上任意棋子，无视回合门控。
  // 2026-08-05 解耦：仅当房主未作为普通玩家下场（identity_role !== 'player'）时生效，
  // 避免房主亲自 1v1 时仍持有操控对方棋子的「合法开挂」特权。
  if (battle.hostId && uid && String(uid) === String(battle.hostId)) {
    const hostIdentity = snap?.identity_role || 'referee'; // 未下场默认 referee（纯代打）
    if (hostIdentity !== 'player') return true;
  }
  return false;
}

// ============================================
// ★ 战局创建端点（Phase 29-CombatStart 补齐）
// ============================================

/**
 * POST /api/combat
 * 战局发令枪 — 创建新战局，生成 battleId 并注册空沙盒
 *
 * 前端 NewPreparationRoom.vue:267 调用 combatAPI.createBattle({ battlefield_id })
 */
// Phase 30-Cover: 防御性 JSON.parse（DB 字段可能为 TEXT 字符串，未解析会被按字符拆解成脏数据）
function safeParseValue(v: any): any {
  if (typeof v === 'string') {
    try { return JSON.parse(v); } catch { return v; }
  }
  return v;
}

// ★ B.7 Gateway 预注入校验器（难度 / H-Safe 数值护栏）— 实现见 battleGuards.ts
import { preInjectBattleGuards } from './battleGuards.js';

// ============================================
// ★ 阶段 B：坐标语义统一（Even-R Offset 真理源）
// 前端 (q,r) 为 Even-R Offset 坐标（pointyTopCenter 渲染 / pointyTopToHex 点击均走 offset）。
// 后端寻路 / 相邻 / 距离必须统一到 offset，禁止用 axial 固定向量（会与前端渲染错位）。
// 换算 B（已 node 校验：所有 6 个 offset 邻居 cube 距离均为 1）：
//   offset(q,r) → axial = { q: q - (r + (r&1))/2, r }
// ============================================

/** Even-R offset 邻居方向表：与前端 hexUtils.getHexNeighbors 完全一致（含奇偶行分支） */
function getEvenROffsetDirs(q: number, r: number): [number, number][] {
  if (r % 2 === 0) {
    return [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]];
  }
  return [[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]];
}

/** Even-R offset → axial（用于正确的六边形距离计算） */
function offsetToAxial(q: number, r: number): { q: number; r: number } {
  return { q: q - (r + (r & 1)) / 2, r };
}

/** Even-R offset 六边形距离（cube 距离，等价于先转 axial 再算） */
function hexDistanceOffset(
  q1: number, r1: number, q2: number, r2: number
): number {
  const a = offsetToAxial(q1, r1);
  const b = offsetToAxial(q2, r2);
  const dq = Math.abs(a.q - b.q);
  const dr = Math.abs(a.r - b.r);
  const ds = Math.abs(a.q + a.r - b.q - b.r);
  return Math.max(dq, dr, ds);
}

// ============================================
// 阶段一：六边形 BFS 路径回溯（供移动轨迹逐段行走）
// ============================================
function tsFindPath(state: any, from: any, to: any, maxRange: number): Array<{ q: number; r: number }> | null {
  const cells = state?.map?.cells || state?.cells || [];
  const cellSet = new Set(cells.map((c: any) => `${c.q},${c.r}`));
  const terrainOf: Record<string, string> = {};
  for (const c of cells) terrainOf[`${c.q},${c.r}`] = c.terrain;

  const occ = new Set<string>();
  for (const u of state.units.values()) {
    if (u.unitId !== from.unitId && u.position) occ.add(`${u.position.q},${u.position.r}`);
  }
  if (occ.has(`${to.q},${to.r}`)) return null;
  // H6 联防：同阵营严格共线单位列表（一次构建，供邻居扩展复用）
  const zocUnits: any[] = Array.from(state.units.values()).map((u: any) => ({
    faction: u.faction ?? u.ownerId,
    position: u.position ?? u,
  }));

  const startKey = `${from.q},${from.r}`;
  const goalKey = `${to.q},${to.r}`;
  // ★ 地形加权 Dijkstra：dist = 累计移动消耗（普通地形 1 点/格，特殊地形更多）。
  // maxRange = 移动力总预算（移动值本身，单位：移动点），与前端高亮 BFS 对齐。
  // best[key] = 到达该格的最小累计消耗；queue 按累计消耗升序取最小扩展。
  const best = new Map<string, number>([[startKey, 0]]);
  const prev = new Map<string, any>();
  const queue: any[] = [{ q: from.q, r: from.r, cost: 0 }];
  let reached = from.q === to.q && from.r === to.r;

  while (queue.length) {
    queue.sort((a: any, b: any) => a.cost - b.cost);
    const cur = queue.shift();
    if (cur.cost > (best.get(`${cur.q},${cur.r}`) ?? Infinity)) continue;
    if (cur.q === to.q && cur.r === to.r) { reached = true; break; }

    const dirs = getEvenROffsetDirs(cur.q, cur.r);
    for (const [dq, dr] of dirs) {
      const nq = cur.q + dq, nr = cur.r + dr;
      const nk = `${nq},${nr}`;
      if (cellSet.size > 0 && !cellSet.has(nk)) continue;
      if (occ.has(nk)) continue;
      // H6 联防：严格共线边阻塞（越界格保护已在纯函数内）
      try {
        if (isCollinearBlockade(cur, { q: nq, r: nr }, zocUnits)) continue;
      } catch (e) { /* 保护：异常不阻断寻路 */ }
      const enterCost = terrainCost(terrainOf[nk]);
      if (enterCost >= 99) continue; // wall 等不可通行
      const nCost = cur.cost + enterCost;
      if (nCost > maxRange) continue;
      if (nCost >= (best.get(nk) ?? Infinity)) continue;
      best.set(nk, nCost);
      prev.set(nk, cur);
      queue.push({ q: nq, r: nr, cost: nCost });
    }
  }

  if (!reached) return null;
  // 回溯路径
  const path: Array<{ q: number; r: number }> = [];
  let node: any = { q: to.q, r: to.r };
  while (node) {
    path.unshift({ q: node.q, r: node.r });
    node = prev.get(`${node.q},${node.r}`);
  }
  return path.length ? path : null;
}

// B-4 Macro 边界：地图加载入口全量 safeParse（battlefield_id 必填、英文键）
router.post('/api/combat', authenticate, validateBody(z.object({ battlefield_id: z.string().min(1) })), (req: Request, res: Response) => {
  const { battlefield_id } = req.body || {};

  if (!battlefield_id) {
    // ★ C1 参数强一致：检测驼峰误写 battlefieldId，给出明确开发者提示避免静默 400
    if (req.body && 'battlefieldId' in req.body) {
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'battlefield_id 为必填项；检测到请求体中使用了驼峰误写 battlefieldId，参数名不匹配，请统一使用 snake_case 的 battlefield_id',
        hint: 'expected_key: battlefield_id, got_key: battlefieldId',
      });
      return;
    }
    res.status(400).json({ error: 'VALIDATION_ERROR', message: 'battlefield_id 为必填项' });
    return;
  }

  // Phase 30-Fix: 从数据库加载真实战场地图数据
  const bfRow = get('SELECT * FROM maps WHERE id = ?', [battlefield_id]) as any;
  if (!bfRow) {
    res.status(404).json({ error: 'BATTLEFIELD_NOT_FOUND', message: `战场 ${battlefield_id} 不存在` });
    return;
  }

  const battleId = uuidv4();

  // 用真实地图数据构建 map 对象（取代旧空壳 {width:0, height:0, cells:[]}）
  const battleMap = {
    id: String(battlefield_id),
    name: bfRow.name || `battlefield-${battlefield_id}`,
    width: 50,
    height: 50,
    // 居中：把地图内容(单元格包围盒)平移到 50×50 画布中心(24.5,24.5)，保证战场打开即居中
    ...(() => {
      const _centered = centerMapInGrid(
        JSON.parse(bfRow.cells || '[]'),
        JSON.parse(bfRow.spawn_points || '[]'),
        50, 50
      );
      return { cells: _centered.cells, spawn_points: _centered.spawns };
    })(),
    is_public_copy: Boolean(bfRow.is_public_copy),
    is_public: Boolean(bfRow.is_public),
    review_status: bfRow.review_status || 'pending',
    generation_status: bfRow.generation_status || 'complete',
    attributes: new Map(Object.entries(JSON.parse(bfRow.attributes || '{}'))),
  };

  const battle = createBattleState({
    id: battleId,
    map: battleMap,
    units: [],
    factionTurnOrder: (req.body && Array.isArray(req.body.factionTurnOrder)) ? req.body.factionTurnOrder as string[] : [],
    factionRoles: (req.body && req.body.factionRoles && typeof req.body.factionRoles === 'object') ? req.body.factionRoles as Record<string, string> : {},
  });

  battleStore.set(battleId, battle);

  logger.info({ msg: `[Gateway:3006] [BATTLE CREATE] 战局 ${battleId} 已创建 | battlefield=${battlefield_id} (${bfRow.name}) | 地图尺寸: ${bfRow.width}×${bfRow.height} | user=${req.auth?.username || '?'}` });

  res.status(201).json({
    success: true,
    battle: { id: battleId, battlefield_id, mapName: bfRow.name },
  });
});

/**
 * GET /api/combat
 * 列出所有活跃战局（调试用）
 */
router.get('/api/combat', (_req: Request, res: Response) => {
  const battles = Array.from(battleStore.values()).map(b => ({
    id: b.id,
    phase: b.phase,
    turn: b.turn,
    unitCount: b.units.size,
  }));
  res.json({ battles });
});

// ============================================
// ★ 战前设置端点（Phase 29-CombatStart 补齐，自 3004 移植）
// ============================================

/**
 * POST /api/combat/:battleId/victory-conditions
 * 绑定战局胜利条件
 *
 * 前端调用: combatAPI.setVictoryConditions(battleId, { conditions, hold_round, ... })
 */

/**
 * A5 防腐层（Anti-Corruption Layer）
 * ------------------------------------------------------------------
 * 前端整备室发送的是「扁平」形状：
 *   { conditions:[...], hold_round, target_q, target_r }
 * 而 combat-service 的 victoryChecker 实际读取：
 *   vc.facility.{q,r,hp,faction,attacker,holder,owner,capturer}
 * 字段名错位导致 facility 恒为 undefined → destroy_facility / hold_position 永不触发。
 *
 * 此函数在写入 battle 元数据前，把扁平字段合成 victoryChecker 期望的 facility 对象，
 * 不改动核心消费端 victoryChecker，纯网关侧形状适配。
 * - hp 默认正值(100)：设施须被攻击至 0 才获胜，避免开局即胜。
 * - 若 payload 已携带 facility（未来扩展），以其为准，不覆盖。
 */
function normalizeVictoryConditions(body: any): any {
  const conditions = Array.isArray(body?.conditions) ? body.conditions.slice() : [];
  const vc: any = { ...body, conditions };
  const needFacility = conditions.includes('destroy_facility') || conditions.includes('hold_position');
  if (needFacility) {
    const toNum = (v: any) => (v === undefined || v === null || v === '' ? undefined : Number(v));
    const q = toNum(body.target_q ?? (body.facility && body.facility.q));
    const r = toNum(body.target_r ?? (body.facility && body.facility.r));
    const hp = typeof body.facility_hp === 'number'
      ? body.facility_hp
      : (body.facility && typeof body.facility.hp === 'number' ? body.facility.hp : 100);
    vc.facility = {
      q,
      r,
      hp,
      faction: body.facility_faction ?? (body.facility && body.facility.faction),
      attacker: body.facility_attacker ?? (body.facility && body.facility.attacker),
      holder: body.facility_holder ?? (body.facility && body.facility.holder),
      owner: body.facility_owner ?? (body.facility && body.facility.owner),
      capturer: body.facility_capturer ?? (body.facility && body.facility.capturer),
    };
  }
  return vc;
}

router.post('/api/combat/:battleId/victory-conditions', authenticate, (req: Request, res: Response) => {
  const { battleId } = req.params;
  const conditions = req.body;

  const battle = requireBattle(battleId);
  if (!battle) {
    res.status(404).json({ error: 'BATTLE_NOT_FOUND', message: `战局 ${battleId} 不存在` });
    return;
  }

  // ★ A5 防腐层：将前端扁平形状(conditions/hold_round/target_q/target_r)转换为
  //   victoryChecker 引擎期望的 facility 对象（destroy_facility/hold_position 依赖）。
  const normalized = normalizeVictoryConditions(conditions);

  // 快照回滚闸门：挂载胜利条件 + 触发实时推送，任一步异常即还原 battle
  withBattleRollback(battle, () => {
    // 将胜利条件挂载到 battle 元数据上
    (battle as any).victoryConditions = normalized;

    logger.info({ msg: `[Gateway:3006] [VICTORY CONDS] 战局 ${battleId} 胜利条件已绑定: ${ JSON.stringify(normalized) }` });

    battleStore.set(battleId, battle); // 触发实时推送：胜利条件绑定
  });

  res.json({ success: true, battleId, victoryConditions: normalized });
});

/**
 * POST /api/combat/:battleId/ace-unit
 * 绑定当前战局的玩家 ACE 专属机体
 *
 * 前端调用: combatAPI.setAceUnit(battleId, { faction, unitId })
 * ★ P0 命名统一(C2/C3): 双接收兜底 unit_id ?? unitId，内部统一 unitId
 */
router.post('/api/combat/:battleId/ace-unit', authenticate, (req: Request, res: Response) => {
  const { battleId } = req.params;
  const faction = req.body?.faction;
  const unitId = pickUnitId(req.body); // 阶段三：pickId 收口（双命名兜底 + 归一化）

  if (!faction || !unitId) {
    res.status(400).json({ error: 'VALIDATION_ERROR', message: 'faction 和 unitId 为必填项' });
    return;
  }

  const battle = requireBattle(battleId);
  if (!battle) {
    res.status(404).json({ error: 'BATTLE_NOT_FOUND', message: `战局 ${battleId} 不存在` });
    return;
  }

  // 初始化 ACE 存储并绑定
  if (!(battle as any).aceUnits) {
    (battle as any).aceUnits = {};
  }
  (battle as any).aceUnits[faction] = unitId;

  logger.info({ msg: `[Gateway:3006] [ACE UNIT] 战局 ${battleId} ACE 已绑定: faction=${faction}, unitId=${unitId}` });

  battleStore.set(battleId, battle); // 触发实时推送：ACE 机体绑定

  res.json({ success: true, battleId, aceUnits: (battle as any).aceUnits });
});

/**
 * POST /api/combat/:battleId/pending-units
 * 注入战前整备完成的待部署单位池
 *
 * 前端调用: combatAPI.setPendingUnits(battleId, { units: [...] })
 */

/**
 * A7 部署池装备形状 sanitize。
 * 确保 unit.equipment 是普通对象；对每个槽位携带的 damage_kind_modifiers 归一为
 * 5 个标准伤害类型(kinetic/beam/explosive/corrosive/thermal) 的数值对象，缺失键补 0、
 * 非数值 coerce 为 0，避免脏数据导致减伤功能失效（A7 中等风险数据归一化）。
 */
const DKM_KEYS = ['kinetic', 'beam', 'explosive', 'corrosive', 'thermal'];
function sanitizeEquipment(equipment: any): any {
  if (!equipment || typeof equipment !== 'object' || Array.isArray(equipment)) return {};
  const out: any = {};
  for (const [slot, val] of Object.entries(equipment)) {
    if (!val || typeof val !== 'object') continue;
    const slotObj: any = { ...(val as any) };
    const dkmRaw = (val as any).damage_kind_modifiers;
    const dkm: any = {};
    for (const k of DKM_KEYS) {
      const v = dkmRaw && typeof dkmRaw === 'object' ? dkmRaw[k] : undefined;
      dkm[k] = (typeof v === 'number' && Number.isFinite(v)) ? v : 0;
    }
    slotObj.damage_kind_modifiers = dkm;
    out[slot] = slotObj;
  }
  return out;
}

// 房间开战时由 rooms 路由调用：确保 battleStore 中存在该战局（含地图），并预置部署池 pendingUnits。
// 这样 NewBattleView 进入时 getBattleState 命中已有战局，pendingUnits 不会被兜底 createBattle 清空。
export function seedRoomBattle(battleId: string, mapId: string | null, pendingUnits: any[], factionRolesConfig: any = null, hostId: string | null = null, players: any[] = []): void {
  let battle = requireBattle(battleId);
  if (!battle) {
    let battleMap: any = { id: mapId || 'default', name: 'battlefield', width: 50, height: 50, cells: [], spawn_points: [] };
    if (mapId) {
      const bfRow = get('SELECT * FROM maps WHERE id = ?', [mapId]) as any;
      if (bfRow) {
        battleMap = {
          id: String(mapId),
          name: bfRow.name || `battlefield-${mapId}`,
          width: 50,
          height: 50,
          ...(() => {
            const _centered = centerMapInGrid(
              JSON.parse(bfRow.cells || '[]'),
              JSON.parse(bfRow.spawn_points || '[]'),
              50, 50
            );
            return { cells: _centered.cells, spawn_points: _centered.spawns };
          })(),
          is_public_copy: Boolean(bfRow.is_public_copy),
          is_public: Boolean(bfRow.is_public),
          review_status: bfRow.review_status || 'pending',
          generation_status: bfRow.generation_status || 'complete',
          attributes: new Map(Object.entries(JSON.parse(bfRow.attributes || '{}'))),
        };
      }
    }
    battle = createBattleState({
      id: battleId,
      map: battleMap,
      units: [],
      factionTurnOrder: [],
      factionRoles: {},
    });
    battleStore.set(battleId, battle);
  }
  (battle as any).pendingUnits = Array.isArray(pendingUnits) ? pendingUnits : [];
  // 代打机制：房主身份（isHost）锁定，供 canIssueCommand / 战争迷雾豁免判定
  (battle as any).hostId = hostId || (battle as any).hostId || null;
  // 权威阵营↔角色配置（来自 room.rules.factionRoles），开战部署完成后供 reconcileFactionRoles 使用
  (battle as any).factionRolesConfig = (factionRolesConfig && typeof factionRolesConfig === 'object') ? factionRolesConfig : null;
  // 战局身份快照（2026-08-05 安全加固）：开战瞬间定格每个参战玩家的账号 role + 房间内 identity_role，
  // 局内 canIssueCommand / resolveSurpriseChoice 只读此快照，杜绝中途后台改账号 role 的越权作弊。
  // 随 battles.state_snapshot 自动落库（下方 battleStore.set 触发 saveBattleSnapshot）。
  const snapRoles: Record<string, { role: string; identity_role: string }> = {};
  for (const p of (Array.isArray(players) ? players : [])) {
    const uid = String(p?.userId || p?.user_id || '');
    if (!uid) continue;
    snapRoles[uid] = {
      role: String(p?.accountRole || p?.role || 'user').toUpperCase(),
      identity_role: String(p?.identityRole || p?.identity_role || 'player'),
    };
  }
  (battle as any).state_snapshot = {
    ...((battle as any).state_snapshot || {}),
    roles: snapRoles,
    hostId: (battle as any).hostId || null,
  };
  // 重新写入以触发 PushBattleStore.set → 自动 saveBattleSnapshot 落库
  battleStore.set(battleId, battle);

  // ★ 2.0B.1 战斗初始化：将所有对局单位显式注册进装备耐久管理器。
  // 数据真相源为 unit.equipState（活路径），register 将耐久快照载入 _state，
  // 供结算时 applyDamage / consumeWeaponDurability 与 K1 lockDurability 读写。
  // （注册自带自动守卫：若结算时仍未注册，耐久模块会按 equipState 即时装载。）
  try {
    const edMgr = getEquipmentDurabilityManager();
    const initUnits = Array.isArray(pendingUnits) ? pendingUnits.slice() : [];
    if (battle.units && typeof (battle.units as any).forEach === 'function') {
      (battle.units as any).forEach((u: any) => { if (u) initUnits.push(u); });
    } else if (battle.units && typeof (battle.units as any).values === 'function') {
      (battle.units as any).values().forEach((u: any) => { if (u) initUnits.push(u); });
    }
    initUnits.forEach((u: any) => { try { edMgr.register(u); } catch (_) { /* 单个单位注册失败不影响整体 */ } });
  } catch (_) { /* 耐久注册失败不应阻断开局 */ }

  logger.info({ msg: `[Gateway:3006] [seedRoomBattle] battle=${battleId} 预置部署池 ${((battle as any).pendingUnits || []).length} 个单位；hostId=${hostId || '缺省'}；factionRolesConfig=${factionRolesConfig ? '已注入' : '缺省'}；快照角色数=${Object.keys(snapRoles).length}` });
}

// 清除内存中的对局（房间删除/对局解散时调用，由 rooms 路由在 dominator 或房主删除房间时触发）
export function clearBattle(battleId: string): void {
  if (battleStore.has(battleId)) {
    battleStore.delete(battleId);
    logger.info({ msg: `[Gateway:3006] [clearBattle] 已清除内存对局 battle=${battleId}` });
  }
}

// B-4 Macro 边界：pending-units 提交入口全量 safeParse（units 数组必填）
router.post('/api/combat/:battleId/pending-units', authenticate, validateBody(z.object({ units: z.array(z.any()).min(1) })), (req: Request, res: Response) => {
  const { battleId } = req.params;
  const { units: rawUnits } = req.body || {};

  if (!rawUnits || !Array.isArray(rawUnits)) {
    res.status(400).json({ error: 'VALIDATION_ERROR', message: 'units 数组为必填项' });
    return;
  }

  const battle = requireBattle(battleId);
  if (!battle) {
    res.status(404).json({ error: 'BATTLE_NOT_FOUND', message: `战局 ${battleId} 不存在` });
    return;
  }

  // A7 落库前装备形状 sanitize（3 槽位 + damage_kind_modifiers 归一）
  const sanitizedUnits = rawUnits.map((u: any) => {
    const statsObj = (typeof u?.stats === 'string') ? safeParseValue(u.stats) : (u?.stats || {});
    const baseHp = (statsObj && typeof statsObj.hp === 'number' && statsObj.hp > 0) ? statsObj.hp : 100;
    const sizedHp = applySizeHp(baseHp, u?.size || 'm');
    return {
      ...u,
      equipment: sanitizeEquipment(u?.equipment),
      // 顶层 hp/maxHp 同源修正，供前端直接读取（避免部署池单位误判阵亡标灰）
      hp: (typeof u?.hp === 'number' && u.hp > 0) ? u.hp : sizedHp,
      maxHp: (typeof u?.maxHp === 'number' && u.maxHp > 0) ? u.maxHp : sizedHp,
    };
  });

  // 将待部署单位存入沙盒（deploy 阶段正式注入战场坐标）
  (battle as any).pendingUnits = sanitizedUnits;

  logger.info({ msg: `[Gateway:3006] [PENDING UNITS] 战局 ${battleId} 已接收 ${rawUnits.length} 个待部署单位` });

  res.json({
    success: true,
    battleId,
    pendingCount: rawUnits.length,
  });
});

// ============================================
// 战斗状态端点（原有）
// ============================================

/**
 * GET /api/combat/:battleId/state
 * 拉取完整战局状态快照
 */
router.get('/api/combat/:battleId/state', (req: Request, res: Response) => {
  const battleId = req.params.battleId;
  const battle = requireBattle(battleId);

  if (!battle) {
    res.status(404).json({ error: 'BATTLE_NOT_FOUND', message: `战局 ${battleId} 不存在` });
    return;
  }

  // D3 兜底：清除过期僵尸 pending（timer 未触发时的双保险）
  reapStalePending(battle);

  // 序列化 Map → 普通对象供 JSON 传输
  const unitsObj: Record<string, any> = {};
  for (const [id, unit] of battle.units) {
    const u: any = { ...unit };
    // 展开 Royroy 状态为前端既有顶层字段（royroy_deployed / royroy_q / royroy_r / royroy_status）
    if (unit.royroy) {
      u.royroy_deployed = unit.royroy.deployed;
      u.royroy_q = unit.royroy.q;
      u.royroy_r = unit.royroy.r;
      u.royroy_status = unit.royroy.status;
    }
    unitsObj[id] = u;
  }

  res.json({
    id: battle.id,
    phase: battle.phase,
    turn: battle.turn,
    activeUnitId: battle.activeUnitId,
    units: unitsObj,
    map: battle.map,
    log: battle.log,
    startedAt: battle.startedAt,
    // 阶段二规则：阵营轮转状态（前端据此高亮当前阵营、门控操作）
    factionTurnOrder: battle.factionTurnOrder || [],
    factionRoles: battle.factionRoles || {},
    activeFaction: battle.activeFaction || '',
    activeFactionIndex: battle.activeFactionIndex || 0,
    round: battle.round || 1,
    // 任务 4.3：奇袭中断状态（前端轮询，10s 倒计时 deadline 驱动 QTE）
    surprise: (battle as any).pendingSurprise ? serializePending((battle as any).pendingSurprise) : null,
  });
});

/**
 * POST /api/combat/:battleId/initialize
 * 初始化战局快盒 — 所有单位注入 action_points = { MOVE: 1, ATTACK: 1 }
 */
router.post('/api/combat/:battleId/initialize', authenticate, (req: Request, res: Response) => {
  const battleId = req.params.battleId;
  const { map, units: rawUnits } = req.body;

  if (!map || !rawUnits || !Array.isArray(rawUnits)) {
    res.status(400).json({ error: 'VALIDATION_ERROR', message: 'map 和 units 数组为必填项' });
    return;
  }

  if (battleStore.has(battleId)) {
    res.status(409).json({ error: 'BATTLE_EXISTS', message: `战局 ${battleId} 已存在` });
    return;
  }

  // ★ B.7 Gateway 预注入校验器：难度归一化 + H-Safe 数值护栏
  // 在进入引擎 zygote 前，对 difficulty 与所有单位的数值（currentStats / statusEffects）
  // 做合法化与钳制，阻断词链条目/快照造成的属性爆炸或负值穿透。
  const guard = preInjectBattleGuards(req.body);

  const units: BattleUnit[] = guard.units.map((u: any) => {
    const bu = createBattleUnit({
      unitId: u.unitId,
      matrixId: u.matrixId,
      ownerId: u.ownerId,
      position: u.position as HexCoord,
      // 防御性解析：DB 字段可能为 TEXT 字符串
      currentStats: safeParseValue(u.currentStats) as UnitStats,
      skills: safeParseValue(u.skills) ?? [],
      statusEffects: safeParseValue(u.statusEffects) ?? [],
      // 🟢 默认注入标准行动点积木
      actionPoints: u.actionPoints,
      // Phase 30-Cover: 战场端渲染补全字段
      faction: u.faction,
      // 方案A：重载/快照载入时同样写入轮转角色
      role: resolveRole(u.factionRoles, u.faction),
      name: u.name,
      codename: u.codename,
      unitCode: u.unitCode ?? u.codename,
      type: u.type,
      viewUrls: (() => { const v = safeParseValue(u.view_urls ?? u.viewUrls); return (v && typeof v === 'object') ? v : undefined })(),
      // 单位体型（体积）：透传，缺省 m
      size: u.size,
      // 机体基础属性（编辑器原始值）：射击/格斗/机动，供前端单位卡片展示
      main_射击: u.main_射击,
      main_格斗: u.main_格斗,
      main_机动: u.main_机动,
    });
    // 登场即隐匿：从存档/快照载入的偷袭单位同样开局即隐匿
    if (isStealthCapableUnit(u, u.factionRoles)) applySpawnStealth(bu);
    return bu;
  });

  const battle = createBattleState({
    id: battleId,
    map,
    units,
    factionTurnOrder: (req.body && Array.isArray(req.body.factionTurnOrder)) ? req.body.factionTurnOrder as string[] : [],
    factionRoles: (req.body && req.body.factionRoles && typeof req.body.factionRoles === 'object') ? req.body.factionRoles : {},
  });

  battleStore.set(battleId, battle);

  logger.info({ msg: `[Gateway:3006] [BATTLE INIT] 战局 ${battleId} 已初始化，${units.length} 个单位就位 | action_points: { MOVE: 1, ATTACK: 1 }` });

  res.json({
    success: true,
    battleId,
    unitCount: units.length,
    phase: battle.phase,
  });
});

/**
 * POST /api/combat/:battleId/action-points/consume
 * 消耗单位行动点 (MOVE / ATTACK / 自定义)
 */
router.post('/api/combat/:battleId/action-points/consume', authenticate, (req: Request, res: Response) => {
  const { battleId } = req.params;
  const { unitId, action, amount = 1 } = req.body;

  const battle = requireBattle(battleId);
  if (!battle) {
    res.status(404).json({ error: 'BATTLE_NOT_FOUND' });
    return;
  }

  const unit = battle.units.get(unitId);
  if (!unit) {
    res.status(404).json({ error: 'UNIT_NOT_FOUND' });
    return;
  }

  const success = consumeActionPoint(unit, action, amount);

  if (!success) {
    res.json({
      success: false,
      unitId,
      action,
      remaining: unit.action_points[action] ?? 0,
      message: `${action} 行动点不足`,
    });
    return;
  }

  logger.info({ msg: `[Gateway:3006] [ACTION POINT] ${unitId} 消耗 ${action} ×${amount} | 剩余: ${JSON.stringify(unit.action_points)}` });

  battleStore.set(battleId, battle); // 触发实时推送：行动点强制消耗

  res.json({
    success: true,
    unitId,
    action,
    consumed: amount,
    remaining: unit.action_points,
  });
});

/**
 * GET /api/combat/:battleId/action-points/:unitId
 * 查询单位当前行动点状态
 */
router.get('/api/combat/:battleId/action-points/:unitId', (req: Request, res: Response) => {
  const { battleId, unitId } = req.params;

  const battle = requireBattle(battleId);
  if (!battle) {
    res.status(404).json({ error: 'BATTLE_NOT_FOUND' });
    return;
  }

  const unit = battle.units.get(unitId);
  if (!unit) {
    res.status(404).json({ error: 'UNIT_NOT_FOUND' });
    return;
  }

  res.json({
    unitId,
    action_points: unit.action_points,
    canMove: hasActionPoints(unit, 'MOVE'),
    canAttack: hasActionPoints(unit, 'ATTACK'),
  });
});

/**
 * POST /api/combat/:battleId/end-turn
 * 结束回合：重置所有单位行动点为 { MOVE: 1, ATTACK: 1 }
 */
router.post('/api/combat/:battleId/end-turn', authenticate, (req: Request, res: Response) => {
  const { battleId } = req.params;

  const battle = requireBattle(battleId);
  if (!battle) {
    res.status(404).json({ error: 'BATTLE_NOT_FOUND' });
    return;
  }

  const order = battle.factionTurnOrder || [];
  if (order.length === 0) {
    // 兼容旧战局（无阵营顺序）：退化为全重置 + turn+1
    resetAllActionPoints(battle);
    battle.turn += 1;
    const victoryResultLegacy = evaluateVictory(battle);
    if (victoryResultLegacy.victory) {
      (battle as any).status = 'finished';
      clearBattleSnapshot(battleId); // 隐患二：终局清快照，避免 SQLite 膨胀
    }
    return res.json({
      success: true,
      battleId,
      turn: battle.turn,
      round: battle.round,
      activeFaction: battle.activeFaction,
      victory: victoryResultLegacy,
      message: '无阵营顺序配置，行动点已统一重置',
    });
  }

  // 角色制轮转：迁移旧模型 + 跳过空角色 + 跨末尾进入新一轮
  ensureTurnModel(battle);
  const endedFaction = battle.activeFaction; // 记录刚结束的阵营，回合末清除其 Buff
  const adv = advanceTurn(battle);
  // Phase E：on_action_order_changed 点火（行动序切换后）—— 供行动债/结算序反应器接管
  fireReaction('on_action_order_changed', {
    battleState: battle,
    newCurrentFaction: battle.currentFaction,
    newTurn: battle.turn,
    advanceResult: adv,
  });
  // 任务 4.3 D5：跨回合 AP 债务扣减（advanceTurn 已重置 AP，此处仅扣 1 点 ATTACK + 解锁，不叠加）
  if (endedFaction) {
    for (const u of battle.units.values()) {
      if (u.faction === endedFaction && (u as any).nextTurnApPenalty && (u as any).nextTurnApPenalty > 0) {
        consumeActionPoint(u, 'ATTACK', 1);
        (u as any).nextTurnApPenalty = 0;
        (u as any).surpriseDebtLock = false;
      }
    }
  }
  // 回合末清除：对被结束阵营的单位 tick Buff（本功能机动 Buff + 既有 defense/attack Buff 一并清理，拔出萝卜带出泥）
  if (endedFaction) {
    for (const u of battle.units.values()) {
      if (u.faction === endedFaction) { BuffManager.tickBuffs(u); BuffManager.tickStatus(u); }
    }
    // Phase B：on_turn_end 点火（刚结束阵营的回合末）—— 供结算类反应器接管
    fireReaction('on_turn_end', { battleState: battle, endedFaction, endedUnits: Array.from(battle.units.values()).filter((u: any) => u.faction === endedFaction) });
  }
  // 新一轮：空投生成与拾取结算（行动点已在 advanceTurn 内统一重置）
  if (adv.isNewRound) applyNewRoundEffects(battle);
  // 单阵营结束：不重置 AP，仅切换 activeFaction（新一轮已在 advanceTurn 内重置）

  // 实时胜利条件结算（回合切换后可能触发，如据守满轮/全歼）
  const victoryResult = evaluateVictory(battle);
  if (victoryResult.victory) {
    (battle as any).status = 'finished';
    clearBattleSnapshot(battleId); // 隐患二：终局清快照，避免 SQLite 膨胀
  }

  logger.info({ msg: `[Gateway:3006] [TURN END] 战局 ${battleId} 阵营切换 → ${battle.activeFaction} | Round ${battle.round} | ${adv.isNewRound ? '统一重置AP' : '仅切换阵营'}` });

  battleStore.set(battleId, battle); // 触发实时推送：阵营切换/AP 重置/胜利判定

  // Phase 6：若下一个行动角色属于 AI 控制，则异步驱动 AI 回合（不阻塞本次 HTTP 响应）。
  // runAiTurn 内部每步都会 battleStore.set 推送全量快照，客户端据此平滑播放敌方行动。
  const nextRole = battle.activeFaction;
  if (!victoryResult.victory && Array.isArray(battle.aiRoles) && battle.aiRoles.includes(nextRole)) {
    // fire-and-forget：AI 回合与 HTTP 响应并行，客户端通过 WS 增量快照接管表现层
    Promise.resolve().then(() => runAiTurn(battle, nextRole)).catch((e) => {
      logger.error({ msg: `[ai/turn/dispatch] ${ (e as any)?.message }` });
    });
  }

  res.json({
    success: true,
    battleId,
    turn: battle.turn,
    round: battle.round,
    activeFaction: battle.activeFaction,
    activeFactionIndex: battle.activeFactionIndex,
    factionTurnOrder: battle.factionTurnOrder,
    message: adv.isNewRound
      ? `进入第 ${battle.round} 轮，行动点已统一重置`
      : `切换到阵营 ${battle.activeFaction}`,
      victory: victoryResult,
  });
});

/**
 * Phase 29-P2: 伤害计算端点（技能测试 / 正式伤害管道）
 */
router.post('/api/combat/:battleId/damage', async (req: Request, res: Response) => {
  const { battleId } = req.params;
  const { caster, target, clauses } = req.body;

  const battle = requireBattle(battleId);
  if (!battle) {
    res.status(404).json({ error: 'BATTLE_NOT_FOUND' });
    return;
  }

  if (!caster || !target || !clauses) {
    res.status(400).json({ error: 'VALIDATION_ERROR', message: 'caster, target, clauses 为必填项' });
    return;
  }

  try {
    const { computeDamage } = await import('../damagePipe.js');
    const result = computeDamage(
      clauses,
      caster as BattleUnit,
      target as BattleUnit,
      () => Math.floor(Math.random() * 6) + 1,
    );
    res.json({ success: true, result });
  } catch (err) {
    logger.error({ msg: `[Gateway:3006] [DAMAGE ERROR] 战局 ${battleId}: ${ err }` });
    res.status(500).json({ success: false, error: String(err) });
  }
});

/**
 * 桥接 .cjs 核心战斗引擎：将网关 BattleUnit 适配为 skillExecutor 期望的扁平化单位形状。
 */
function toExecutorUnit(u: any): any {
  const s = u?.currentStats || u?.stats || {};
  return {
    id: u?.unitId ?? u?.id,
    q: u?.position?.q ?? u?.q ?? 0,
    r: u?.position?.r ?? u?.r ?? 0,
    hp: s.hp ?? 0,
    max_hp: s.maxHp ?? s.max_hp ?? s.hp ?? 0,
    attack: s.attack ?? 0,
    melee: s.attack ?? s.melee ?? 0,
    ranged: s.attack ?? s.ranged ?? 0,
    defense: s.defense ?? 0,
    // ★ 2026-08-06 契约修复：前端计算并落库 stats.armor，damagePipe 也确实读 armor 参与减伤，
    //   但此转换层此前未透传 → 引擎内 armor 恒 undefined，护甲属性全程无效。
    armor: s.armor ?? 0,
    shield: s.shield ?? 0,
    mobility: s.mobility ?? 0,
    // A 修复：faction 表达政治/战局阵营（earth/balon...），ownerId 仅表达玩家归属，二者彻底分离
    faction: u?.faction ?? u?.ownerId ?? 'neutral',
    // B&C 收敛：统一以 snake_case 透传引擎，兼容上游 camel（evasion/accuracy/max_hp）命名
    evasion_mod: s.evasion_mod ?? s.evasion ?? 0,
    accuracy_mod: s.accuracy_mod ?? s.accuracy ?? 0,
    equipment: u?.equipment ?? {},
    equipState: u?.equipState ?? [],
    has_moved: u?.has_moved ?? false,
    stealth: u?.stealth ?? false,
    z: u?.z ?? u?.height ?? 0,
    height: u?.height ?? 0,
    skills: u?.skills ?? [],
    // 结构化 statusEffects（自动化技能统一模型）——传入引擎供动态提取
    statusEffects: (u && Array.isArray(u.statusEffects)) ? [...u.statusEffects] : [],
    // 体型（体积）：透传给引擎以计算体型克制减伤/机动补偿
    size: u?.size ?? 'm',
    // ★ A-5 (A-2)：活路径元信息 _meta（含 C-6 lockedDurability）必须透传引擎，
    // 否则引擎结算副本丢失状态锁，导致"已锁装备被维修/复用"的幽灵行为。
    // 结构化克隆避免引擎改副本污染内存态。
    _meta: u?._meta ? structuredClone(u._meta) : undefined,
  };
}

/**
 * 将引擎结算产生的 statusEffects 变更写回战局单位：
 *  - 始终以引擎返回的 exeCaster/exeTarget（其 statusEffects 已被引擎按统一模型修改）为准写回真实单位；
 *  - 消费被命中触发的 status（result.triggered_status）层数（counter 模式 remaining--，归零移除）。
 * 引擎保持纯函数（不回写），此处负责把"单向数据管道"的末端结果落盘。
 */
function applyStatusEffectsWriteback(casterUnit: any, exeCaster: any, targetUnit: any, exeTarget: any, result: any) {
  const ids = (result && result.triggered_status) || [];
  if (exeCaster && casterUnit) {
    BuffManager.consumeStatuses(exeCaster, ids);
    casterUnit.statusEffects = exeCaster.statusEffects;
    // ★ 闭环：引擎可能在 _meta.flags 写入阻断/状态锁等标记（如 block_movement），
    //   必须回写真实单位，否则 /move 等消费侧读不到。structuredClone 避免副本污染。
    if (exeCaster._meta) casterUnit._meta = structuredClone(exeCaster._meta);
  }
  if (exeTarget && targetUnit) {
    BuffManager.consumeStatuses(exeTarget, ids);
    targetUnit.statusEffects = exeTarget.statusEffects;
    if (exeTarget._meta) targetUnit._meta = structuredClone(exeTarget._meta);
  }
}

/**
 * POST /api/combat/:battleId/skill
 * 桥接 services/combat-service 的 .cjs 核心战斗引擎执行技能施法/结算。
 * 真实战斗路径现经 .cjs（含海豹骰子掷骰 + 多分支命中），替代此前未在生产生效的 TS 死代码。
 *
 * Body（沿用 /damage 约定的「客户端直传单位对象」模式）：
 *  - skillType: string (必填)        词条库技能 key
 *  - caster: object (必填)            施法单位（扁平化形状；或提供 casterUnitId 从战局取）
 *  - target: object (可选)            目标单位（self/无目标技能可省略；或提供 targetUnitId）
 *  - context: object (可选)           附加上下文（allUnits / battleState 等，透传给 .cjs）
 *  - skillDefinition: object (可选)   内联技能定义（has_dice + dice_branches 等），
 *        请求级注入 .cjs 实时 config，用于测试掷骰分支而不污染持久配置
 *  - casterUnitId / targetUnitId: string (可选) 从内存战局取单位并回写伤害/治疗
 */
// 注：原 resolveSkillRange() 已移除。射程判定统一由前端"选中目标"阶段（getSkillRange + validTargets 门控）权威完成，
// 结算端不再重复解析/校验距离，避免两套数据源不一致导致合法目标被 OUT_OF_RANGE 误杀（距离坍缩）。

// ============================================================
// 武器类装备机动值加成（机动差公式扩展）
// 规则：若攻击来源是武器类装备（技能槽 left/right/extra，或基础 melee/ranged 攻击），
// 则攻击方机动值需叠加该武器(们)的机动值，再与防御方机动做差。
// 攻击方机动优势带来的增伤由引擎封顶 +4；防御方优势减伤无上限。
// ============================================================
const WEAPON_SLOTS = ['left', 'right', 'extra'];

/**
 * ★ C-6：装备活路径统一 helper。
 * 返回未损毁且耐久 > 0 的装备列表（拦截 destroyed / durability<=0），
 * computeWeaponMobilityBonus 与 getEquipmentAttackStat 共用，消除重复拦截逻辑。
 */
function activeEquip(exeCaster: any): any[] {
  const eq = (exeCaster && exeCaster.equipState) || [];
  return eq.filter((e: any) => e && !e.destroyed && (e.durability ?? 0) > 0);
}

/** ★ C-6：装备槽位是否已被锁定（lockedDurability 状态锁） */
function isEquipmentLocked(unit: any, slotKey: string): boolean {
  const locked = unit?._meta?.lockedDurability;
  return !!(locked && locked[slotKey]);
}

/** ★ C-6：锁定装备槽位（三写原子：destroyed=true / durability=0 / _meta.lockedDurability[slot]=true） */
function applyEquipmentLock(unit: any, slotKey: string): void {
  if (!unit) return;
  const eq = unit.equipState || (unit.equipState = []);
  const target = eq.find((e: any) => e && String(e.slot || '') === slotKey);
  if (target) {
    target.destroyed = true;
    target.durability = 0;
  }
  unit._meta = unit._meta || { lockedDurability: {} };
  unit._meta.lockedDurability = unit._meta.lockedDurability || {};
  unit._meta.lockedDurability[slotKey] = true;
}

function computeWeaponMobilityBonus(exeCaster: any, skillSlot: any): { mobility: number; isWeapon: boolean } {
  const eq = activeEquip(exeCaster);
  // 2.0B.2：已损毁（destroyed）或耐久归零的武器不再提供任何机动加成（由 activeEquip 拦截）
  const weapons = eq.filter((e: any) => e && (e.type === '武器' || e.type === 'weapon' || String(e.type || '').toLowerCase() === 'weapon'));
  if (!weapons.length) return { mobility: 0, isWeapon: false };
  // 是否武器来源：基础攻击(skillSlot 为空)或技能槽属于武器槽
  const isWeapon = !skillSlot || WEAPON_SLOTS.includes(skillSlot);
  if (!isWeapon) return { mobility: 0, isWeapon: false };
  // 优先按技能槽匹配具体武器；无法匹配则汇总所有武器机动
  let list = weapons as any[];
  if (skillSlot && WEAPON_SLOTS.includes(skillSlot)) {
    const matched = weapons.filter((w: any) => {
      const s = String(w.slot || '');
      const bare = s.replace(/_hand$/, '');
      return s.includes(skillSlot) || bare.includes(skillSlot) || skillSlot.includes(bare) || bare === skillSlot;
    });
    if (matched.length) list = matched;
  }
  const mobility = list.reduce((a: number, w: any) => a + Number(w.mobility || 0), 0);
  return { mobility, isWeapon: true };
}

// ============================================
// 装备携带技能的基础伤害加成：若发动的技能由装备(武器/防具/载具/背包)携带，
// 则叠加该装备的 格斗/射击 值（仅按技能来源槽位匹配的具体装备计入；机体槽不计入，避免与基础值重复）。
// ============================================
const EQ_TYPES = ['武器', '防具', '载具', '背包'];
function getEquipmentAttackStat(casterUnit: any, skillSlot: any, isRanged: boolean): number {
  const parts = (casterUnit && casterUnit.parts) || null;
  if (!parts || !skillSlot) return 0;
  // 2.0B.2：已损毁或耐久归零的装备槽，其攻击加成一律失效（由 activeEquip 给出活路径列表）
  const active = activeEquip(casterUnit);
  const disabledSlots = new Set<string>();
  active.forEach((e: any) => {
    if (e.slot) disabledSlots.add(String(e.slot));
    if (e.name) disabledSlots.add(String(e.name));
  });
  const bare = String(skillSlot).replace(/_hand$/, '');
  let total = 0;
  for (const p of Object.values(parts) as any[]) {
    if (!p || typeof p !== 'object') continue;
    const t = String(p.normalizedType || p.type || '').trim();
    if (!EQ_TYPES.includes(t)) continue; // 仅装备类计入（机体不计入，避免与基础值重复）
    const ps = String(p.slot || '');
    if (disabledSlots.has(ps) || disabledSlots.has(String(p.name || ''))) continue; // 2.0B.2：损毁槽不计入攻击
    const pb = ps.replace(/_hand$/, '');
    const matched = ps === skillSlot || pb === bare || ps.includes(bare) || bare.includes(pb);
    if (!matched) continue;
    const v = isRanged ? (p.射击 ?? p.ranged ?? 0) : (p.格斗 ?? p.melee ?? 0);
    total += Number(v) || 0;
  }
  return total;
}

router.post('/api/combat/:battleId/skill', (req: Request, res: Response) => {
  const { battleId } = req.params;
  const {
    skillType,
    caster,
    target,
    context,
    skillDefinition,
    casterUnitId,
    targetUnitId,
    // 兼容前端真实攻击载荷字段名（NewBattleView.executeAttack / executeSkillAttack）
    attacker_id,
    target_id,
    skill_id,
    attack_type,
    aoe_dir,
  } = req.body || {};

  // skillType 可由前端 skill_id（UUID）或 attack_type（melee/ranged）兜底
  const skillKey = skillType || skill_id || attack_type || null;

  if (!skillKey) {
    res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'skillType 为必填项' });
    return;
  }

  const battle = requireBattle(battleId);
  if (!battle) { res.status(404).json({ success: false, error: 'BATTLE_NOT_FOUND' }); return; }

  let exeCaster: any;
  let exeTarget: any = null;
  let writeBackTarget: any = null;
  let casterBattleUnit: any = null;

  const casterId = casterUnitId || attacker_id;
  const targetId = targetUnitId || target_id;
  let passiveLogsSkill: any[] = [];

  if (casterId) {
    if (!battle) { res.status(404).json({ success: false, error: 'BATTLE_NOT_FOUND' }); return; }
    const u = battle.units.get(String(casterId));
    if (!u) { res.status(404).json({ success: false, error: 'CASTER_UNIT_NOT_FOUND' }); return; }
    exeCaster = toExecutorUnit(u);
    casterBattleUnit = u;
    // 被动调度器：技能施放单位开始行动时按 trigger 条件自动发动被动技能
    passiveLogsSkill = evaluatePassives(u, battle);
    // 阵营轮转门控（角色制）：仅当前行动角色的单位可攻击；单人沙盒模式放开
    ensureTurnModel(battle);
    const owners = new Set<string>();
    for (const su of battle.units.values()) if (su.ownerId) owners.add(su.ownerId);
    if (owners.size > 1 && battle.activeFaction && !canIssueCommand(battle, u, (req as any).user)) {
      res.status(400).json({ success: false, error: 'NOT_YOUR_TURN', message: `当前行动阵营为 ${battle.activeFaction}` });
      return;
    }
  } else if (caster) {
    exeCaster = caster;
  } else {
    res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: '需提供 casterUnitId/caster' });
    return;
  }

  if (targetId) {
    if (!battle) { res.status(404).json({ success: false, error: 'BATTLE_NOT_FOUND' }); return; }
    const u = battle.units.get(String(targetId));
    if (!u) { res.status(404).json({ success: false, error: 'TARGET_UNIT_NOT_FOUND' }); return; }
    exeTarget = toExecutorUnit(u);
    writeBackTarget = u;
  } else if (target) {
    exeTarget = target;
  }

  // ★ Phase 31-RangeNormalize：射程判定由前端"选中目标"阶段权威完成（getSkillRange + validTargets 门控），
  // 网关层不重复校验（避免双重拒绝：前端已选 + 内部 executeUniversalSkill 已用 isTargetInRange 兜底）。
  // 内部路径（反击/决斗/治疗等）经 executeUniversalSkill 内的 isTargetInRange 统一校验，
  // 三端共用 shared-kernel 纯函数，杜绝口径分叉。选中即视为已通过射程判定。

  try {
    // ★ C-6：E 组（装备携带）技能预检——若技能来源装备槽已被 lockedDurability 锁定，
    // 显式返回 EQUIPMENT_LOCKED，杜绝"武器已炸仍在放技能"的幽灵加成。
    const _skillSlot = (casterBattleUnit?.skills || []).find((s: any) => s && (s.id === skillKey || s.key === skillKey || s.skill_key === skillKey))?.slot;
    if (casterBattleUnit && _skillSlot && isEquipmentLocked(casterBattleUnit, _skillSlot)) {
      res.status(400).json({ success: false, error: 'EQUIPMENT_LOCKED', message: `装备槽 ${_skillSlot} 已损毁锁定，技能不可用` });
      return;
    }
    // ★ Week3：确定性掷骰入口——以 (battleId, round, nonce) 注入种子，使同一战斗同一步必产出相同掷骰序列，战报可重放。
    // nonce 为每战局独立递增计数器（模块级 Map 维护），保证单次攻击内部多次掷骰序列确定且不同攻击间互不干扰。
    if (!_battleDiceNonce.has(battleId)) _battleDiceNonce.set(battleId, 0);
    const diceNonce = _battleDiceNonce.get(battleId)! + 1;
    _battleDiceNonce.set(battleId, diceNonce);
    DiceService.setSeed(battleId, battle.round || 1, diceNonce);
    const executor = getSkillExecutor();
    // Phase B：on_attack_start 点火（攻击发起前、目标已锁定）—— 供决斗/掩护/ZOC 等反应器接管
    if (casterBattleUnit && writeBackTarget) {
      fireReaction('on_attack_start', {
        caster: casterBattleUnit, target: writeBackTarget, battle, skillKey,
        pendingAction: (battle as any).pendingAction || null,
      });
      // S2：补齐 on_attacked 点火（目标被攻击时）—— 此前仅登记于 GATEWAY_KNOWN_TRIGGERS 却从未点火
      fireReaction('on_attacked', {
        caster: casterBattleUnit, target: writeBackTarget, battle, skillKey,
        pendingAction: (battle as any).pendingAction || null,
      });
    }
    // Phase C：三型寿命管制（opt-in；仅 entry.cost.enforce===true 时拦截，默认不影响现有词条）
    if (casterBattleUnit && writeBackTarget) {
      const entry = (getGlossaryConfig().skills || {})[skillKey];
      if (entry) {
        const costCheck = checkCost(battle, casterBattleUnit, entry);
        if (!costCheck.ok) {
          res.status(400).json({ success: false, error: 'COST_LIMIT_REACHED', message: costCheck.reason });
          return;
        }
        (req as any).__costEntry = entry; // 结算成功后扣减
      }
    }
    // 武器类装备机动值加成：基础攻击(skillSlot 为空)或武器槽技能 → 叠加武器机动
    const ownedSkillForWeapon = (exeCaster?.skills || []).find((s: any) => s && (s.id === skillKey || s.key === skillKey || s.skill_key === skillKey || s.id === skill_id));
    const weaponInfo = computeWeaponMobilityBonus(exeCaster, ownedSkillForWeapon?.slot || null);
    const result = executor.executeUniversalSkill(
      skillKey,
      exeCaster,
      exeTarget,
      {
        ...sanitizeSkillContext(context), // 阶段三：DTO 白名单剥离伪造战局字段，仅放行安全元数据
        allUnits: battle ? Array.from(battle.units.values()).map(toExecutorUnit) : (context?.allUnits || []),
        battleState: battle || context?.battleState || null,
        terrainMap: battle ? buildTerrainMap(battle) : (context?.terrainMap || null),
        weaponMobility: weaponInfo.mobility,
        isWeaponAttack: weaponInfo.isWeapon,
        // ★ 地图炮方向选择：前端显式 aoe_dir（1-6）透传给战斗引擎
        aoe_dir: (typeof aoe_dir === 'number' && aoe_dir >= 1 && aoe_dir <= 6) ? aoe_dir : (typeof aoe_dir === 'string' && /^[1-6]$/.test(aoe_dir) ? Number(aoe_dir) : null),
      },
      skillDefinition || null,
    );

    // Phase C：结算成功后扣减三型寿命（opt-in；entry.cost.enforce===true 才实际扣减）
    if ((req as any).__costEntry) {
      try { consumeCost(battle, casterBattleUnit, (req as any).__costEntry); } catch (_) { /* 不影响主链路 */ }
    }

    // ★ 2026-08-06 Phase 33-Contract：结算诊断落盘。
    //   引擎侧的 diagnostics（如 UNKNOWN_PREDICATE）在此同步到服务端 logger，
    //   前端经 result.diagnostics 渲染黄色警告条，彻底消除静默吞失败。
    if (result && Array.isArray((result as any).diagnostics) && (result as any).diagnostics.length) {
      const diags = (result as any).diagnostics;
      const level = diags.some((d: any) => d.level === 'error') ? 'error' : 'warn';
      logger[level]({
        msg: `[SKILL DIAGNOSTICS] 战局 ${battleId} 技能 ${skillKey}`,
        diagnostics: diags,
      });
    }

    // ★ Phase 32-AOE：多目标批量写回（形状驱动范围技能）
    //   当 result.targets 存在时遍历所有命中单位扣血 + 状态挂接；否则回落单目标写回。
    if (result && result.triggered !== false) {
      if (Array.isArray(result.targets) && result.targets.length > 0) {
        result.targets.forEach((t: any) => {
          const bu = battle ? battle.units.get(String(t.unitId)) : null;
          if (!bu) return;
          if (typeof t.finalDamage === 'number' && t.finalDamage > 0) {
            // ★ 统一 HP 写回（同步顶层 hp 与 currentStats.hp，使前端棋子真实扣血）
            applyHpDelta(bu, -t.finalDamage);
            t.killed = ((bu.currentStats?.hp ?? 0) <= 0);
            // ★ 2.0B.3 防御侧：受击触发防具耐久消耗（铠甲归零自动破损并移除加成，同步回写 equipState）
            try { getEquipmentDurabilityManager().applyDamage(bu, t.finalDamage, result.damage_kind); } catch (_) { /* 耐久不影响 HP 主流程 */ }
          }
          if (Array.isArray(t.statusEffects) && t.statusEffects.length) {
            const list = bu.statusEffects || (bu.statusEffects = []);
            t.statusEffects.forEach((se: any) => {
              list.push({
                status: se.status,
                value: se.value,
                stacks: se.stacks || 1,
                duration: se.duration || 3,
                appliedAt: Date.now(),
                source: skillKey,
              });
            });
          }
        });
      } else if (writeBackTarget) {
        // Phase B：pre_damage_apply 点火（伤害/治疗写回前）—— 供减免/转移/均摊等反应器介入
        fireReaction('pre_damage_apply', {
          caster: casterBattleUnit, target: writeBackTarget, battle, skillKey,
          result, pendingAction: (battle as any).pendingAction || null,
        });
        // 回写伤害/治疗到内存战局目标单位（单目标）★ 统一经 applyHpDelta 同步顶层
        if (typeof result.final_damage === 'number' && result.final_damage > 0) {
          applyHpDelta(writeBackTarget, -result.final_damage);
          // ★ 2.0B.3 防御侧：受击触发防具耐久消耗（铠甲归零自动破损并移除加成，同步回写 equipState）
          try { getEquipmentDurabilityManager().applyDamage(writeBackTarget, result.final_damage, result.damage_kind); } catch (_) { /* 耐久不影响 HP 主流程 */ }
        }
        if (typeof result.heal_amount === 'number' && result.heal_amount > 0) {
          applyHpDelta(writeBackTarget, result.heal_amount);
        }
      }
    }

    // ★ 2.0B.3 攻击侧武器耐久消耗（/skill 路径）：造成伤害时武器 -1（被锁定槽由 isLocked 钳 0）
    if (result && result.final_damage > 0 && !result.dodged) {
      try { getEquipmentDurabilityManager().consumeWeaponDurability(casterBattleUnit); } catch (_) { /* 耐久不影响主流程 */ }
    }
    // 反击伤害写回施法者（仅当施法者取自战局单位）★ 统一经 applyHpDelta 同步顶层
    if (casterBattleUnit && result && result.counter_triggered && result.counter_damage > 0) {
      applyHpDelta(casterBattleUnit, -result.counter_damage);
    }

    // 双阵营效果堆栈路由：当技能自身携带 effects 数组（纯效果组 / target_scope=both|all），
    // 按每个 effect 的 target_type 分头命中敌友单位，补挂 statusEffect（与 DSL 引擎结算互补，互不重复）。
    const ownedSkillForRouting = (casterBattleUnit?.skills || []).find(
      (s: any) => s && (s.id === skillKey || s.key === skillKey || s.skill_key === skillKey || s.id === skill_id),
    );
    const routingLogs: any[] = [];
    if (ownedSkillForRouting && Array.isArray(ownedSkillForRouting.effects) && ownedSkillForRouting.effects.length) {
      const scope = ownedSkillForRouting.target_scope;
      if (scope === 'both' || scope === 'all' || !ownedSkillForRouting.order) {
        const rl = routeEffectStackToTargets(ownedSkillForRouting, casterBattleUnit, writeBackTarget, battle);
        routingLogs.push(...rl);
      }
    }

    // 结构化 statusEffects 写回（buff/debuff 生成实例 或 attack 消费的层数扣减）
    // 多目标场景：target 端的 status 已由上方批量写回处理，此处仅处理 caster 端（反击类）。
    applyStatusEffectsWriteback(casterBattleUnit, exeCaster, writeBackTarget, exeTarget, result);

    // 破隐规则②：释放任意主动技能（非"进入隐匿"类）即强制破隐。
    // 攻击类经 /attack 路由 D9-10 已处理；此处覆盖 /skill 路由所有主动技能（attack/heal/buff/debuff/support）。
    if (casterBattleUnit && (casterBattleUnit as any).stealth && !STEALTH_ENTER_KEYS.includes(String(skillKey))) {
      breakStealth(casterBattleUnit, 'active-skill');
    }

    // 实时胜利条件结算（技能攻击击杀后可能触发）
    const skillVictory = evaluateVictory(battle);
    if (skillVictory.victory) {
      (battle as any).status = 'finished';
      clearBattleSnapshot(battleId); // 隐患二：终局清快照，避免 SQLite 膨胀
    }

    battleStore.set(battleId, battle); // 触发实时推送：技能结算（HP/状态/AP/破隐/胜负）

    res.json({
      success: true,
      battleId,
      skillType: skillKey,
      engine: 'combat-service/.cjs',
      result,
      victory: skillVictory,
      passive_triggers: (typeof passiveLogsSkill !== 'undefined' && passiveLogsSkill.length) ? passiveLogsSkill : undefined,
      effect_routes: routingLogs.length ? routingLogs : undefined,
    });
  } catch (err: any) {
    logger.error({ msg: `[Gateway:3006] [SKILL ERROR] 战局 ${battleId}: ${ err }` });
    res.status(500).json({ success: false, error: String(err?.message || err) });
  }
});

// ============================================
// 任务 4.3 — 两阶段中断状态机（反应奇袭 / tactical_overwatch）
// 暴露：maybeInterceptSurprise / resolveSurpriseChoice / forceSettleOnTimeout /
//       disposePendingSurprise / reapStalePending / runAttackInternal / serializePending
// 状态载体：(battle as any).pendingSurprise = {
//   attackerId, defenderId, reactors[], lockedReactorId, phase, timerId,
//   deadline, createdAt, originalRequest{attacker_id,target_id,attack_type,skill_id,skill_key,skill_name,context,skillKey,inlineDef}, byRole
// }
// 依赖（同模块作用域）：getSkillExecutor / toExecutorUnit / buildTerrainMap /
//   applyStatusEffectsWriteback / fireReaction / evaluateVictory / applySizeTacticBuff /
//   consumeActionPoint / markStandbyIfDone / hasActionPoints / resolveRole /
//   hexDistanceOffset / battleStore / getGlossaryConfig /
//   computeWeaponMobilityBonus / getEquipmentAttackStat
// 注：当前 Gateway 无 WS 推送通道（commPush 未接线），客户端经 GET /state 轮询 pendingSurprise。
// ============================================

const SURPRISE_TIMEOUT_MS = 10000;
const OVERWATCH_SKILL_KEY = 'tactical_overwatch';

/** tactical_overwatch 反应射程：统一由 getSkillRangeFields 派生（加法模型）；systems.ambush.activation_range 为系统层参数特例兜底（不传入 getSkillRangeFields） */
function getOverwatchRange(battle: any): number {
  const cfg = getGlossaryConfig();
  const skill = cfg?.skills?.[OVERWATCH_SKILL_KEY];
  if (skill) {
    const rf = getSkillRangeFields(skill);
    if (typeof rf.maxRange === 'number' && rf.maxRange > 0) return rf.maxRange;
  }
  const amb = cfg?.systems?.ambush;
  if (amb && typeof amb.activation_range === 'number') return amb.activation_range;
  return 6;
}

/** 奇袭倍率（counter ×1.5；stealth 由引擎 stealth_ambush hook 处理，避免双重乘） */
function getAmbushMultiplier(): number {
  const cfg = getGlossaryConfig();
  const m = cfg?.dice?.ambushMultiplier;
  return typeof m === 'number' ? m : 1.5;
}

function unitInRange(cUnit: any, targetUnit: any, range: number): boolean {
  if (!cUnit?.position || !targetUnit?.position) return false;
  return hexDistanceOffset(cUnit.position.q, cUnit.position.r, targetUnit.position.q, targetUnit.position.r) <= range;
}

function unitHasSkill(u: any, key: string): boolean {
  const skills = u?.skills;
  if (!Array.isArray(skills)) return false;
  return skills.some((s: any) =>
    s?.key === key || s?.skill_key === key || s?.id === key || s?.name === key || s === key,
  );
}

function reactorIsAI(u: any): boolean {
  return !!(u && ((u as any).isAI === true || u.faction === 'neutral'));
}

// D2 资格检索 + 并发仲裁（单一最高机动锁定）
function findSurpriseReactors(battle: any, attackerUnit: any, defenderUnit: any): any[] {
  const range = getOverwatchRange(battle);
  const reactors: any[] = [];
  for (const u of battle.units.values()) {
    if (!u || u === attackerUnit || u === defenderUnit) continue;
    const st = u.currentStats;
    if (!st || st.hp <= 0) continue; // 存活
    if ((u as any).stealth !== true) continue; // D9-4 隐匿硬门槛
    if (!unitHasSkill(u, OVERWATCH_SKILL_KEY)) continue; // 拥有反应技能
    const role = resolveRole(battle.factionRoles, u.faction);
    if (role === 'attack' || role === 'defense') continue; // 非 A/B 阵营
    if ((u as any).surpriseDebtLock === true) continue; // 债务锁死禁止再触发
    const aInRange = attackerUnit
      ? unitInRange(u, attackerUnit, range) && (attackerUnit.currentStats?.hp ?? 0) > 0
      : false;
    const bInRange = defenderUnit
      ? unitInRange(u, defenderUnit, range) && (defenderUnit.currentStats?.hp ?? 0) > 0
      : false;
    if (!aInRange && !bInRange) continue; // 射程裁剪（D2/D9-3）
    let available_choices: string[] = [];
    if (aInRange && bInRange) available_choices = ['replace', 'counter', 'giveup'];
    else if (aInRange) available_choices = ['counter', 'giveup'];
    else available_choices = ['replace', 'giveup'];
    reactors.push({
      unitId: u.id,
      role,
      mobility: st.mobility ?? 0,
      aInRange,
      bInRange,
      available_choices,
    });
  }
  return reactors;
}

function pickLockedReactor(reactors: any[]): any {
  if (reactors.length === 0) return null;
  return reactors.reduce((best, cur) => (cur.mobility > best.mobility ? cur : best), reactors[0]);
}

// 构建技能定义：优先复用 /attack 已算好的 skillKey/inlineDef（重放无损）；否则按 attack_type/skill_id 推导
function buildSkillDef(battle: any, body: any): { skillKey: string; inlineDef: any; error?: any } {
  if (body?.skillKey && body?.inlineDef) return { skillKey: body.skillKey, inlineDef: body.inlineDef };
  const { attack_type, skill_id } = body || {};
  const casterUnit = battle?.units?.get(String(body?.attackerId));
  const exeCaster = casterUnit ? toExecutorUnit(casterUnit) : null;
  let skillKey = attack_type === 'skill' ? (skill_id || null) : (attack_type === 'ranged' ? 'ranged' : 'melee');
  let inlineDef: any = null;
  if (attack_type === 'skill' && skill_id) {
    const allSkills = battle?.skills || getGlossaryConfig()?.skills || {};
    const sk = allSkills[skill_id] || Object.values(allSkills).find((s: any) => s?.id === skill_id);
    if (sk) {
      skillKey = sk.key || sk.id || skill_id;
      const isRanged = sk.category === 'ranged' || /远程|ranged|射击|shot/i.test(String(sk.type || '')) || sk.damageType === 'ENERGY';
      inlineDef = {
        type: 'active',
        label: sk.name || skillKey,
        category: isRanged ? 'ranged' : 'melee',
        action_type: 'attack',
        attack_stat: isRanged ? 'ranged' : 'melee',
        damage_kind: sk.damageType === 'ENERGY' ? 'energy' : 'kinetic',
        // ★ 归拢：射程统一由 getSkillRangeFields（shared-kernel 真相源）派生，不再写死 BASIC_*_RANGE
        // 派生值 cast_range/max_range/min_range 仅作为引擎兼容字段，值来自派生结果（非来源写死），严禁回退读取为真相
        ...(() => {
          const rf = getSkillRangeFields(sk);
          return { cast_range: rf.maxRange, max_range: rf.maxRange, min_cast_range: rf.minRange, min_range: rf.minRange };
        })(),
        base_damage: (isRanged ? (sk.ranged || sk.attack || 0) : (sk.melee || sk.attack || 0)) + getEquipmentAttackStat(casterUnit, (sk as any)?.slot ?? null, isRanged),
        dice_type: '1d6',
        success_line: DiceService.getConfig().hitCheck?.successLine ?? 4,
        success_bonus_damage: 0,
        is_manual_roll: false,
        target_filter: 'enemy',
        requires_hit: true,
        height_bonus_enabled: true,
      };
    }
  } else {
    // 攻击必须由技能承载，不存在"普通攻击"概念：拒绝无 skill_id 的 ranged/melee 基础攻击。
    return { skillKey: '', inlineDef: null, error: { status: 400, body: { success: false, error: 'SKILL_REQUIRED', message: '攻击必须由技能承载：attack_type=skill 且携带 skill_id' } } };
  }
  if (!skillKey) {
    return { skillKey: '', inlineDef: null, error: { status: 400, body: { success: false, error: 'VALIDATION_ERROR', message: 'skill_key/skill_id/attack_type 不能为空' } } };
  }
  return { skillKey, inlineDef };
}

// D6 复用：真实结算核心（从 /attack try-block 抽出）
// opts: { attackerId, targetId, attack_type, skill_id, skill_key, skill_name, context,
//         skillKey?, inlineDef?, isSurpriseResolution?, skipConsume?, damageMultiplier?, force? }
function runAttackInternal(battle: any, opts: any): any {
  const { attackerId, targetId } = opts;
  const casterUnit = battle.units.get(String(attackerId));
  const writeBackTarget = battle.units.get(String(targetId));
  if (!casterUnit) return { ok: false, code: 'CASTER_UNIT_NOT_FOUND', status: 404 };
  if (!writeBackTarget) return { ok: false, code: 'TARGET_UNIT_NOT_FOUND', status: 404 };

  const def = buildSkillDef(battle, { ...opts, skillKey: opts.skillKey, inlineDef: opts.inlineDef });
  if (def.error) return { ok: false, ...def.error };
  const { skillKey, inlineDef } = def;

  // 阵营轮转门控（角色制）：单人沙盒放开；多人时仅当前行动角色可攻击。
  // force 或 isSurpriseResolution（奇袭结算链在"非锁定者自身回合"代为攻击）时绕过。
  if (!opts.force && !opts.isSurpriseResolution) {
    ensureTurnModel(battle);
    const owners = new Set<string>();
    for (const su of battle.units.values()) if (su.ownerId) owners.add(su.ownerId);
    if (owners.size > 1 && battle.activeFaction && resolveRole(battle.factionRoles, casterUnit.faction) !== battle.activeFaction) {
      return { ok: false, code: 'NOT_YOUR_TURN', status: 400, message: `当前行动阵营为 ${battle.activeFaction}` };
    }
  }

  // AP 门控（skipConsume/force 跳过：奇袭重放/恢复原攻击由调用方负责；D9-6）
  if (!opts.force && !opts.skipConsume && !hasActionPoints(casterUnit, 'ATTACK')) {
    return { ok: false, code: 'NO_ATTACK_AP', status: 400, message: '无可用攻击行动点' };
  }

  const exeCaster = toExecutorUnit(casterUnit);
  const exeTarget = toExecutorUnit(writeBackTarget);

  try {
    const executor = getSkillExecutor();
    const ownedSkillForWeapon = (exeCaster?.skills || []).find((s: any) => s && (s.id === skillKey || s.key === skillKey || s.skill_key === skillKey));
    // ★ C-6：装备槽锁定预检（EQUIPMENT_LOCKED），与 /skill 路由一致
    if (ownedSkillForWeapon?.slot && isEquipmentLocked(casterUnit, ownedSkillForWeapon.slot)) {
      return { ok: false, code: 'EQUIPMENT_LOCKED', status: 400, message: `装备槽 ${ownedSkillForWeapon.slot} 已损毁锁定，技能不可用` };
    }
    const weaponInfo = computeWeaponMobilityBonus(exeCaster, ownedSkillForWeapon?.slot || null);
    const result = executor.executeUniversalSkill(
      skillKey,
      exeCaster,
      exeTarget,
      {
        ...sanitizeSkillContext(opts.context), // 阶段三：DTO 白名单剥离伪造战局字段，仅放行安全元数据
        allUnits: Array.from(battle.units.values()).map(toExecutorUnit),
        battleState: battle,
        terrainMap: buildTerrainMap(battle),
        weaponMobility: weaponInfo.mobility,
        isWeaponAttack: weaponInfo.isWeapon,
      },
      inlineDef || null,
    );

    // D9-7 奇袭倍率（counter ×1.5；stealth 由引擎 stealth_ambush hook 处理）
    if (opts.damageMultiplier && opts.damageMultiplier !== 1 && result && result.final_damage > 0) {
      result.final_damage = Math.floor(result.final_damage * opts.damageMultiplier);
    }

    // ★ Phase 32-AOE：多目标批量写回（runAttackInternal 路径）
    if (result && result.triggered !== false) {
      if (Array.isArray(result.targets) && result.targets.length > 0) {
        result.killedTargets = [];
        result.targets.forEach((t: any) => {
          const bu = battle ? battle.units.get(String(t.unitId)) : null;
          if (!bu) return;
          if (typeof t.finalDamage === 'number' && t.finalDamage > 0) {
            // ★ 统一 HP 写回（同步顶层 hp 与 currentStats.hp，使前端棋子真实扣血）
            applyHpDelta(bu, -t.finalDamage);
            t.killed = ((bu.currentStats?.hp ?? 0) <= 0);
            if (t.killed) (result.killedTargets as string[]).push(String(t.unitId));
            // ★ 2.0B.3 防御侧：受击触发防具耐久消耗（铠甲归零自动破损并移除加成，同步回写 equipState）
            try { getEquipmentDurabilityManager().applyDamage(bu, t.finalDamage, result.damage_kind); } catch (_) { /* 耐久不影响 HP 主流程 */ }
          }
          if (Array.isArray(t.statusEffects) && t.statusEffects.length) {
            const list = bu.statusEffects || (bu.statusEffects = []);
            t.statusEffects.forEach((se: any) => {
              list.push({
                status: se.status,
                value: se.value,
                stacks: se.stacks || 1,
                duration: se.duration || 3,
                appliedAt: Date.now(),
                source: skillKey,
              });
            });
          }
        });
        // 主目标（writeBackTarget）死亡 → 置顶层 killed
        if (writeBackTarget && (writeBackTarget.currentStats?.hp ?? 0) <= 0) {
          result.killed = true;
        }
      } else if (writeBackTarget) {
        // 单目标写回 ★ 统一经 applyHpDelta 同步顶层
        if (typeof result.final_damage === 'number' && result.final_damage > 0) {
          applyHpDelta(writeBackTarget, -result.final_damage);
        }
        if (typeof result.heal_amount === 'number' && result.heal_amount > 0) {
          applyHpDelta(writeBackTarget, result.heal_amount);
        }
        // ★ Phase 7.1：单目标击杀标记（hp 归零且造成过伤害）
        if ((result.final_damage ?? 0) > 0 && (writeBackTarget.currentStats?.hp ?? 0) <= 0) {
          result.killed = true;
        }
      }
    }
    // ★ 2.0B.3 攻击侧武器耐久消耗：每次攻击 -1（被锁定槽不可被消耗，由 isLocked 钳 0）
    if (result && result.triggered !== false && !result.dodged) {
      try { getEquipmentDurabilityManager().consumeWeaponDurability(casterUnit); } catch (_) { /* 耐久不影响攻击主流程 */ }
    }
    if (casterUnit && result && result.counter_triggered && result.counter_damage > 0) {
      applyHpDelta(casterUnit, -result.counter_damage);
    }

    applyStatusEffectsWriteback(casterUnit, exeCaster, writeBackTarget, exeTarget, result);

    if (!opts.skipConsume) {
      consumeActionPoint(casterUnit, 'ATTACK', 1);
      markStandbyIfDone(casterUnit);
    }

    // ===== H2/H3/H5 反应钩子派发（斩杀/再动/抢夺/援助/幸运）=====
    const reactionEvents: any[] = [];
    const reactionLog: string[] = [];
    const broadcast = (evt: string, payload: any) => { reactionEvents.push({ evt, payload }); };
    const rlog = (m: string) => { reactionLog.push(m); };
    const dmg = result?.final_damage ?? 0;
    const reactionCtx: any = {
      battleState: battle,
      caster: casterUnit,
      target: writeBackTarget,
      damage: dmg,
      damageKind: result?.damage_kind,
      attackStat: result?.attack_stat,
      round: battle.round,
      log: rlog, broadcast,
    };
    // H5 幸运：攻击方回合行动权限分支
    let luckyEffect: any = null;
    if (casterUnit && dmg >= 0) {
      const lucky = fireReaction('on_unit_turn_start', { ...reactionCtx, caster: casterUnit });
      if (lucky) luckyEffect = lucky.effect;
    }
    // H3 抢夺（两段式）：检测可抢夺并暂存 pendingSnatch
    if (writeBackTarget && dmg > 0) {
      const snatch = fireReaction('on_damage_dealt', reactionCtx);
      if (snatch && snatch.canSnatch) {
        (battle as any).pendingSnatch = {
          attackerId: casterUnit?.unitId,
          targetId: writeBackTarget?.unitId,
          damage: dmg,
          bestWeaponAttack: snatch.bestWeaponAttack,
          targetWeapon: snatch.targetWeapon,
        };
      }
    }
    // H2 斩杀：近战伤害结算后，目标 HP<5 掷骰致死
    if (writeBackTarget && dmg > 0) {
      fireReaction('post_melee_damage', reactionCtx);
    }
    // 击杀 → 再动（reactivate）
    if (writeBackTarget && (writeBackTarget.currentStats?.hp ?? 0) <= 0) {
      fireReaction('on_kill', reactionCtx);
    }
    // 援助：友军受击 → pending_reaction
    if (writeBackTarget && dmg > 0) {
      fireReaction('on_ally_attacked', { ...reactionCtx, caster: casterUnit, target: writeBackTarget });
    }

    // 体型机动补偿：被更大机体攻击 → 防守方挂临时机动 Buff
    if (writeBackTarget && result?.sizeTactic && result.sizeTactic.amount > 0) {
      BuffManager.applyBuff(writeBackTarget, BuffManager.BUFF_TYPES.MOBILITY, result.sizeTactic.amount, 1);
    }

    return {
      ok: true,
      isSurpriseResolution: !!opts.isSurpriseResolution,
      casterUnit,
      writeBackTarget,
      result,
      reactionEvents,
      reactionLog,
      pendingSnatch: (battle as any).pendingSnatch ?? null,
      pendingReaction: (battle as any).pendingReaction ?? null,
      victoryResult: evaluateVictory(battle),
      luckyEffect,
    };
  } catch (err: any) {
    logger.error({ msg: `[Gateway:3006] [ATTACK ERROR] 战局 ${battle?.id}: ${ err }` });
    return { ok: false, code: 'ATTACK_EXEC_ERROR', status: 500, message: String(err?.message || err) };
  }
}

// D9-2/C 重放载荷校验：解析 C 自选技能并做二次射程校验（D9-3）
function resolveSelectedSkill(battle: any, selectedSkillId: any, cUnit: any, targetUnit: any, mode: string): any {
  if (!selectedSkillId) {
    // 攻击必须由技能承载，不存在"普通攻击"概念：未选技能直接拒绝。
    return { error: { status: 400, body: { success: false, error: 'SKILL_REQUIRED', message: '请先选择技能后再发起攻击' } } };
  }
  const owned = (cUnit.skills || []).find((s: any) =>
    s?.id === selectedSkillId || s?.key === selectedSkillId || s?.skill_key === selectedSkillId,
  );
  if (!owned) return { error: { status: 400, body: { success: false, error: 'SKILL_NOT_OWNED', message: 'C 不拥有所选技能' } } };
  const skillKey = owned.key || owned.skill_key || owned.name || selectedSkillId;
  // ★ 射程唯一真相源：由 getSkillRangeFields（shared-kernel）按【类型+词条】派生。
  // 不再做"远程护栏"二次修正——射程只取决于类型(远程=3/近战=1/auto=0)与词条显式数值覆盖。
  const rf = getSkillRangeFields(owned);
  const range = rf.maxRange;
  if (!unitInRange(cUnit, targetUnit, range)) {
    return { error: { status: 400, body: { success: false, error: 'INVALID_CHOICE', message: '所选技能射程不足以覆盖目标（D9-3 二次校验）' } } };
  }
  const at = /远程|ranged|shot/i.test(String(owned.type || '')) || owned.category === 'ranged' ? 'ranged' : 'melee';
  return { attack_type: at, skill_id: selectedSkillId, skill_key: skillKey };
}

function recordDebt(cUnit: any): void {
  (cUnit as any).nextTurnApPenalty = 1;
  (cUnit as any).surpriseDebtLock = true;
}

/** 剥离不可序列化字段（timerId 等） */
function serializePending(pend: any): any {
  if (!pend) return null;
  return {
    attackerId: pend.attackerId,
    defenderId: pend.defenderId,
    reactors: pend.reactors,
    lockedReactorId: pend.lockedReactorId,
    phase: pend.phase,
    createdAt: pend.createdAt,
    deadline: pend.deadline,
    byRole: pend.byRole,
    available_choices:
      (pend.reactors || []).find((r: any) => String(r.unitId) === String(pend.lockedReactorId))?.available_choices || [],
  };
}

// D1/D3 挂载待处理奇袭；返回 { interrupted, surprise }
function maybeInterceptSurprise(battleId: string, battle: any, originalRequest: any): { interrupted: boolean; surprise?: any } {
  if ((battle as any).pendingSurprise) {
    return { interrupted: true, surprise: serializePending((battle as any).pendingSurprise) };
  }
  const attackerUnit = battle.units.get(String(originalRequest.attacker_id));
  const defenderUnit = battle.units.get(String(originalRequest.target_id));
  if (!attackerUnit || !defenderUnit) return { interrupted: false };

  const reactors = findSurpriseReactors(battle, attackerUnit, defenderUnit);
  if (reactors.length === 0) return { interrupted: false };

  const locked = pickLockedReactor(reactors);
  const now = Date.now();
  const pend: any = {
    attackerId: originalRequest.attacker_id,
    defenderId: originalRequest.target_id,
    reactors,
    lockedReactorId: locked.unitId,
    byRole: locked.role,
    phase: 'waiting',
    createdAt: now,
    deadline: now + SURPRISE_TIMEOUT_MS,
    originalRequest,
  };
  // D3 Timer Trap：挂起立即启动 10s 倒计时；超时强制清算
  pend.timerId = setTimeout(() => forceSettleOnTimeout(battleId, battle), SURPRISE_TIMEOUT_MS);
  (battle as any).pendingSurprise = pend;
  return { interrupted: true, surprise: serializePending(pend) };
}

// D3/D5 超时清算 = 全部 giveup → 恢复原攻击（A 尚未消耗 ATTACK AP）
function forceSettleOnTimeout(battleId: string, battle?: any): void {
  const b = battle || requireBattle(battleId);
  if (!b) return;
  const pend = (b as any).pendingSurprise;
  if (!pend || pend.phase === 'settling' || pend.phase === 'done') return;
  if (pend.timerId) clearTimeout(pend.timerId);
  pend.phase = 'settling';
  const req = pend.originalRequest;
  // 快照回滚闸门：结算攻击若抛错，还原战局且保留 pendingSurprise='settling'
  // （不置 done），避免半更新态卡死，可重试或下次超时再清算。
  withBattleRollback(b, () => {
    runAttackInternal(b, {
      attackerId: req.attacker_id,
      targetId: req.target_id,
      attack_type: req.attack_type,
      skill_id: req.skill_id,
      skill_key: req.skill_key,
      skill_name: req.skill_name,
      context: req.context,
      skillKey: req.skillKey,
      inlineDef: req.inlineDef,
      isSurpriseResolution: true,
      skipConsume: false,
    });
    pend.phase = 'done';
    (b as any).pendingSurprise = null;
  });
}

// D4 响应分支决策
// D-4.3 服务端鉴权加固：role 取自 token(req.auth.role)，userId 取自 token(req.auth.userId)
//   取代原 body.referee 信任，绑定 unit.ownerId 防冒充代投。
function resolveSurpriseChoice(battle: any, unitId: any, choice: string, selectedSkillId: any, role?: string, userId?: string): any {
  const pend = (battle as any).pendingSurprise;
  if (!pend) return { ok: false, code: 'NO_PENDING_SURPRISE', status: 409 };
  if (pend.phase === 'settling' || pend.phase === 'done') return { ok: false, code: 'ALREADY_SETTLED', status: 409 };

  const lockedUnit = battle.units.get(String(pend.lockedReactorId));
  const lockedIsAI = reactorIsAI(lockedUnit);
  const lockedOwner = lockedUnit?.ownerId;

  // 鉴权绑定：① 合法拥有者本人响应；② GM(REFEREE/DOMINATOR) 仅可代投 AI/neutral 锁定者（D9-8）
  // 2026-08-05 安全加固：isGM 改读开战瞬间固化的身份快照，杜绝中途后台改 role 越权代投。
  // 快照缺失时回退入参 role（兼容旧战局）。
  const snapRole = (battle as any)?.state_snapshot?.roles?.[String(userId)]?.role || role || '';
  const isGM = snapRole === 'REFEREE' || snapRole === 'DOMINATOR';
  const isOwner = userId != null && lockedOwner != null && String(userId) === String(lockedOwner);
  if (!isOwner && !(isGM && lockedIsAI)) {
    return { ok: false, code: 'OWNER_MISMATCH', status: 403, message: '仅锁定反应者的拥有者(或 GM 代投 AI)可响应' };
  }
  // 锁定反应者一致性：unitId 必须等于 lockedReactorId（防误调/越权）
  if (pend.lockedReactorId !== String(unitId)) {
    return { ok: false, code: 'NOT_LOCKED_REACTOR', status: 409, message: 'unitId 必须为锁定反应者(lockedReactorId)' };
  }

  const reactor = pend.reactors.find((r: any) => String(r.unitId) === String(pend.lockedReactorId));
  if (!reactor) return { ok: false, code: 'REACTOR_NOT_FOUND', status: 404 };
  if (!reactor.available_choices.includes(choice)) {
    return { ok: false, code: 'INVALID_CHOICE', status: 400, message: 'choice 不在 available_choices 中（保持 pending）' };
  }

  // D9-3 二次射程校验（玩家自选 skill_id）：校验失败 400 并保持 pending
  const cUnit = battle.units.get(String(pend.lockedReactorId));
  const aUnit = battle.units.get(String(pend.attackerId));
  const bUnit = battle.units.get(String(pend.defenderId));
  if (choice === 'replace' || choice === 'counter') {
    const targetForSkill = choice === 'replace' ? bUnit : aUnit;
    const sel = resolveSelectedSkill(battle, selectedSkillId, cUnit, targetForSkill, choice);
    if (sel.error) return sel.error; // 保持 pending（未 clearTimeout 前已在此分支前拦截）
    // 通过校验则暂存，供下方使用
    (pend as any)._selectedSkill = sel;
  }

  if (pend.timerId) clearTimeout(pend.timerId);
  pend.phase = 'settling';

  const req = pend.originalRequest;
  const outcome: any = { choice, reactorId: String(pend.lockedReactorId) };

  if (choice === 'giveup') {
    // 恢复原攻击（A 未消耗）
    outcome.resume = runAttackInternal(battle, {
      attackerId: pend.attackerId,
      targetId: pend.defenderId,
      attack_type: req.attack_type,
      skill_id: req.skill_id,
      skill_key: req.skill_key,
      skill_name: req.skill_name,
      context: req.context,
      skillKey: req.skillKey,
      inlineDef: req.inlineDef,
      isSurpriseResolution: true,
      skipConsume: false,
    });
  } else if (choice === 'replace') {
    // 剥夺 A 的 ATTACK AP + 记债锁；以 C 攻 B 重放
    consumeActionPoint(aUnit, 'ATTACK', 1);
    markStandbyIfDone(aUnit);
    recordDebt(cUnit);
    const sel = (pend as any)._selectedSkill;
    outcome.replace = runAttackInternal(battle, {
      attackerId: String(pend.lockedReactorId),
      targetId: pend.defenderId,
      attack_type: sel.attack_type,
      skill_id: sel.skill_id,
      skill_key: sel.skill_key,
      context: {},
      isSurpriseResolution: true,
      skipConsume: false,
    });
  } else if (choice === 'counter') {
    consumeActionPoint(aUnit, 'ATTACK', 1);
    markStandbyIfDone(aUnit);
    recordDebt(cUnit);
    const sel = (pend as any)._selectedSkill;
    const mult = getAmbushMultiplier(); // 1.5
    outcome.counter = runAttackInternal(battle, {
      attackerId: String(pend.lockedReactorId),
      targetId: pend.attackerId,
      attack_type: sel.attack_type,
      skill_id: sel.skill_id,
      skill_key: sel.skill_key,
      context: {},
      isSurpriseResolution: true,
      skipConsume: false,
      damageMultiplier: mult,
    });
    const aDead = (aUnit.currentStats?.hp ?? 1) <= 0;
    if (aDead) {
      outcome.counterKilled = true; // A→B 原攻击 nullify
    } else {
      // 恢复原攻击（A 已消耗，skipConsume + force 绕过待机门控；D9-6）
      outcome.resume = runAttackInternal(battle, {
        attackerId: pend.attackerId,
        targetId: pend.defenderId,
        attack_type: req.attack_type,
        skill_id: req.skill_id,
        skill_key: req.skill_key,
        skill_name: req.skill_name,
        context: req.context,
        skillKey: req.skillKey,
        inlineDef: req.inlineDef,
        isSurpriseResolution: true,
        skipConsume: true,
        force: true,
      });
    }
  }

  // D9-4 强制显形：发动奇袭（replace/counter）后无论结果 C 强制显形；giveup 不动 stealth
  if (choice !== 'giveup' && cUnit) (cUnit as any).stealth = false;

  pend.phase = 'done';
  (battle as any).pendingSurprise = null;
  return { ok: true, outcome };
}

/** D3 兜底：战局终止/掉线时释放 pending（当前无 delete 路由，供 /state reap 与未来 dispose 调用） */
function disposePendingSurprise(battleId: string): void {
  const b = requireBattle(battleId);
  if (!b) return;
  const pend = (b as any).pendingSurprise;
  if (pend?.timerId) clearTimeout(pend.timerId);
  (b as any).pendingSurprise = null;
}

/** D3 兜底：清除已过期的僵尸 pending（timer 未触发时的双保险）。
 * （重hydration 的 reconcile 由 combatSnap 自包含实现，见 combatSnap.reconcileBattle） */
function reapStalePending(battle: any): void {
  const pend = (battle as any).pendingSurprise;
  if (pend && pend.phase === 'waiting' && Date.now() > pend.deadline) {
    forceSettleOnTimeout(battle.id, battle);
  }
}

// ============================================
// ★ 阶段 B·审计报告 #1 修复：补齐缺失的 /attack 主路由
// 前端 NewBattleView.executeAttack / executeSkillAttack 调用 combatAPI.attack
// → POST /api/combat/:battleId/attack。此前该路由不存在(404)，攻击真实路径未接通，
// 导致 #2/#3 距离校验无法在游戏内生效。本路由复用 /skill 的 .cjs 执行引擎 + 距离校验，
// 并把响应结构对齐前端期望（combat_result.final_damage / attacker_direction / surprise_triggered）。
// Body：attacker_id / target_id / attack_type(melee|ranged|skill) / skill_id(UUID，技能攻击时) / context
// ============================================
router.post('/api/combat/:battleId/attack', (req: Request, res: Response) => {
  const { battleId } = req.params;
  const {
    attacker_id,
    target_id,
    attack_type,
    skill_id,
    skill_key,
    skill_name,
    context,
  } = req.body || {};

  if (!attacker_id) {
    res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'attacker_id 为必填项' });
    return;
  }

  const battle = requireBattle(battleId);
  if (!battle) { res.status(404).json({ success: false, error: 'BATTLE_NOT_FOUND' }); return; }

  const casterUnit = battle.units.get(String(attacker_id));
  if (!casterUnit) { res.status(404).json({ success: false, error: 'CASTER_UNIT_NOT_FOUND' }); return; }
  const exeCaster = toExecutorUnit(casterUnit);

  // 被动调度器：攻击单位开始行动时按 trigger 条件自动发动被动技能
  const passiveLogsAttack = evaluatePassives(casterUnit, battle);

  let exeTarget: any = null;
  let writeBackTarget: any = null;
  if (target_id) {
    const tu = battle.units.get(String(target_id));
    if (!tu) { res.status(404).json({ success: false, error: 'TARGET_UNIT_NOT_FOUND' }); return; }
    exeTarget = toExecutorUnit(tu);
    writeBackTarget = tu;
  }

  // 解析技能 key：技能攻击需 skill_id(UUID) → glossary key；基础攻击用 melee/ranged 并内联定义
  let skillKey: any;
  let inlineDef: any = null;
  if (attack_type === 'skill') {
    // 系统级兜底：支持按 id / key / name 任意一种身份解析拥有技能，
    // 不再因缺少 skill_id 直接返回 VALIDATION_ERROR，确保整个技能系统不会因标识问题整体崩坏。
    const owned =
      (exeCaster.skills || []).find((s: any) => skill_id && s.id === skill_id) ||
      (exeCaster.skills || []).find((s: any) => skill_key && (s.key === skill_key || s.skill_key === skill_key)) ||
      (exeCaster.skills || []).find((s: any) => skill_name && s.name === skill_name);
    if (owned) {
      // 优先用归属技能自身的射程定义交给引擎；保证 UI/高亮/校验/结算同源
      skillKey = owned?.key || owned?.skill_key || owned?.name || skill_id;
      // ★ 射程唯一真相源：一律由 getSkillRangeFields 派生（类型基准 + 词条显式射程）。
      // 废除旧 `?? 1` 写死——任何缺失/误填都不应把远程炮压成 1 格。
      const rf = getSkillRangeFields(owned);
      const realRange = rf.maxRange;
      const realMin = rf.minRange;
      const isRanged = /远程|ranged|射击|shot/i.test(String(owned.type || '')) || owned.damageType === 'ENERGY';
      inlineDef = {
        type: 'active',
        label: owned.name,
        category: isRanged ? 'ranged' : 'melee',
        action_type: 'attack',
        attack_stat: isRanged ? 'ranged' : 'melee',
        damage_kind: owned.damageType === 'ENERGY' ? 'energy' : 'kinetic',
        cast_range: realRange,
        min_cast_range: realMin,
        max_range: realRange,
        min_range: realMin,
        base_damage: (isRanged ? (exeCaster.ranged || exeCaster.attack || 0) : (exeCaster.melee || exeCaster.attack || 0)) + getEquipmentAttackStat(casterUnit, (owned as any)?.slot ?? null, isRanged),
        dice_type: '1d6',
        success_line: DiceService.getConfig().hitCheck?.successLine ?? 4,
        success_bonus_damage: 0,
        is_manual_roll: false,
        target_filter: 'enemy',
        requires_hit: true,
        height_bonus_enabled: true,
      };
    } else {
      // 未在本体拥有技能列表中命中：把请求的身份当作 glossary 键交给引擎解析完整定义；
      // 引擎若也无法命中则退化为基础远程攻击定义，保证技能攻击永不因解析失败而阻断。
      skillKey = skill_key || skill_name || skill_id || null;
      if (!skillKey) {
        res.status(400).json({ success: false, error: 'SKILL_IDENTIFIER_MISSING', message: '技能攻击需提供 skill_id / skill_key / skill_name 之一' });
        return;
      }
      inlineDef = {
        type: 'active',
        label: String(skillKey),
        category: 'ranged',
        action_type: 'attack',
        attack_stat: 'ranged',
        damage_kind: /能量|energy|光束|beam|电磁|em/i.test(String(skill_key || skill_name || '')) ? 'energy' : 'kinetic',
        // 退化兜底：category:'ranged' 经 getSkillRangeFields 派生（基准 3），不再写死 cast_range:2
        ...(() => {
          const rf = getSkillRangeFields({ category: 'ranged' });
          return { cast_range: rf.maxRange, max_range: rf.maxRange, min_cast_range: rf.minRange, min_range: rf.minRange };
        })(),
        base_damage: (exeCaster.ranged || exeCaster.attack || 0) + getEquipmentAttackStat(casterUnit, null, true),
        dice_type: '1d6',
        success_line: DiceService.getConfig().hitCheck?.successLine ?? 4,
        success_bonus_damage: 0,
        is_manual_roll: false,
        target_filter: 'enemy',
        requires_hit: true,
        height_bonus_enabled: true,
      };
    }
  } else {
    // 攻击必须由机体携带的技能承载，不存在"普通攻击"概念。
    // 不接受无 skill_id 的 ranged/melee 基础攻击分支。
    res.status(400).json({
      success: false,
      error: 'SKILL_REQUIRED',
      message: '攻击必须由技能承载：请提供 attack_type=skill 并携带 skill_id / skill_key / skill_name',
    });
    return;
  }

  // ★ Phase 31-RangeNormalize：射程判定由前端"选中目标"阶段权威完成（getSkillRange + validTargets 门控）。
  // 内部 executeUniversalSkill 已用 isTargetInRange（shared-kernel 纯函数）兜底校验，
  // 三端共用同一套函数，杜绝"前端能选后端打不出"。选中即视为已通过射程判定。

  // 任务 4.3 — 奇袭拦截（D9-1: 奇袭结算链内 __surpriseResolution 跳过拦截，避免套娃）
  if (!(req.body as any).__surpriseResolution) {
    const existing = (battle as any).pendingSurprise;
    if (existing && existing.phase !== 'done') {
      res.status(409).json({
        success: false,
        error: 'SURPRISE_IN_PROGRESS',
        message: '当前战局存在进行中的奇袭中断，请等待结算或响应',
        surprise: serializePending(existing),
      });
      return;
    }
    const intercept = maybeInterceptSurprise(battleId, battle, {
      attacker_id,
      target_id,
      attack_type,
      skill_id,
      skill_key,
      skill_name,
      context,
      skillKey,
      inlineDef,
    });
    if (intercept.interrupted) {
      // 触发推送，让 reactor（其他客户端）经 socket 收到 pendingSurprise 并弹出 QTE
      battleStore.set(battleId, battle);
      res.status(200).json({ success: false, interrupted: true, surprise: intercept.surprise });
      return;
    }
  }

  const r = runAttackInternal(battle, {
    attackerId: attacker_id,
    targetId: target_id,
    attack_type,
    skill_id,
    skill_key,
    skill_name,
    context: context || {},
    skillKey,
    inlineDef,
    isSurpriseResolution: !!(req.body as any).__surpriseResolution,
  });
  if (!r.ok) {
    res.status(r.status || 400).json({ success: false, error: r.code, message: r.message });
    return;
  }

  const { casterUnit: cu, writeBackTarget: wbt, result, reactionEvents, reactionLog, pendingSnatch, pendingReaction, victoryResult, luckyEffect } = r;

  // D9-10 隐匿规则：真实攻击（非奇袭重放）强制破隐
  if (cu && !r.isSurpriseResolution) (cu as any).stealth = false;

  // P8：追加战报缓冲（随推送流携带给前端）
  appendCombatLog(requireBattle(battleId), {
    type: 'combat',
    caster: (cu as any)?.id ?? (cu as any)?.unitId,
    target: (wbt && ((wbt as any).id ?? (wbt as any).unitId)) || null,
    dmg: result?.final_damage ?? 0,
    kind: result?.damage_kind,
    skill: skill_key ?? null,
    crit: result?.is_crit ?? false,
  });

  // 触发实时推送：攻击结算（破隐/战损/战报）已落到内存态，必须 set 才经 comm 广播给各客户端
  battleStore.set(battleId, battle);

  // 隐患二收尾：攻击击杀触发终局 → 清快照，避免 SQLite 膨胀
  if (victoryResult && (victoryResult as any).victory) {
    (battle as any).status = 'finished';
    clearBattleSnapshot(battleId);
  }

  // 响应结构对齐前端消费（combat_result.final_damage / surprise_triggered）
  res.json({
    success: true,
    attacker_id: (cu as any)?.id ?? (cu as any)?.unitId ?? attacker_id,
    target_id: (wbt && ((wbt as any).id ?? (wbt as any).unitId)) || target_id,
    combat_result: {
      triggered: result?.triggered ?? true,
      final_damage: result?.final_damage ?? 0,
      is_crit: !!result?.is_crit,
      killed: !!result?.killed,
      killed_targets: Array.isArray(result?.killedTargets) ? result.killedTargets : [],
      dodged: result?.dodged ?? false,
      counter_triggered: result?.counter_triggered ?? false,
      counter_damage: result?.counter_damage ?? 0,
      attack_type: result?.attack_type,
      attack_stat: result?.attack_stat,
      damage_kind: result?.damage_kind,
      dice: result?.dice ?? null,
      message: result?.message ?? '',
      formula: result?.formula ?? null,
      sizeBanner: result?.sizeBanner ?? null,
      sizeTactic: result?.sizeTactic ?? null,
      // ★ Phase 32-AOE：多目标结算汇总（地图炮/AOE 命中全体）透传给前端弹窗
      targets: Array.isArray(result?.targets) ? result.targets : null,
      hit_count: result?.hit_count ?? 0,
      aoe_mode: result?.aoe_mode ?? null,
      // ── 阶段 6：机动差值与姿态数据透传（严格对齐 damagePipe.stages，禁止臆造字段） ──
      mobility_diff: (result && result.stages) ? (result.stages.mobility_diff ?? 0) : 0,
      sniper_mobility_reduction: (result && result.stages) ? (result.stages.sniper_mobility_reduction ?? 0) : 0,
      height_bonus: (result && result.stages) ? (result.stages.height_bonus ?? 0) : 0,
      attacker_stance: (casterUnit && casterUnit.stance) ? String(casterUnit.stance) : null,
      defender_stance: (writeBackTarget && writeBackTarget.stance) ? String(writeBackTarget.stance) : null,
    },
    skill_id: skill_id ?? null,
    surprise_triggered: false,
    engine: 'combat-service/.cjs',
    reaction_events: reactionEvents,
    reaction_log: reactionLog,
    lucky_effect: luckyEffect,
    pending_snatch: pendingSnatch ?? null,
    pending_reaction: pendingReaction ?? null,
    victory: victoryResult,
    interrupted: false,
    passive_triggers: passiveLogsAttack.length ? passiveLogsAttack : undefined,
  });
});

// ============================================
// 任务 4.3 — 奇袭响应路由
// GET  /api/combat/:battleId/surprise-choice  → 拉取当前 pendingSurprise（前端轮询）
// POST /api/combat/:battleId/surprise-choice  → 锁定反应者响应（replace/counter/giveup）
//   Body: { unitId, choice, skill_id?, referee? }
//   REFEREE（referee:true）仅可代投 AI/neutral 锁定者（D9-8）
// ============================================
router.get('/api/combat/:battleId/surprise-choice', authenticate, (req: Request, res: Response) => {
  const { battleId } = req.params;
  const battle = requireBattle(battleId);
  if (!battle) { res.status(404).json({ success: false, error: 'BATTLE_NOT_FOUND' }); return; }
  const pend = (battle as any).pendingSurprise;
  res.json({ success: true, battleId, surprise: pend ? serializePending(pend) : null });
});

router.post('/api/combat/:battleId/surprise-choice', authenticate, (req: Request, res: Response) => {
  const { battleId } = req.params;
  // 阶段三：pickId 收口（camelCase/snake_case 双接收兜底，内部统一 unitId）
  const unitId = pickUnitId(req.body);
  const { choice, skill_id } = req.body || {};
  if (!battleId) { res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'battleId 必填' }); return; }
  if (!unitId || !choice) { res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'unitId/choice 必填' }); return; }
  const battle = requireBattle(battleId);
  if (!battle) { res.status(404).json({ success: false, error: 'BATTLE_NOT_FOUND' }); return; }
  const outcome = resolveSurpriseChoice(battle, unitId, choice, skill_id, req.auth?.role, req.auth?.userId);
  if (!outcome.ok) {
    res.status(outcome.status || 400).json({ success: false, error: outcome.code, message: outcome.message });
    return;
  }
  const out = outcome.outcome || {};
  // 触发实时推送：奇袭结算（QTE 响应/反应者攻击/清 pendingSurprise）已落到内存态，set 才广播
  battleStore.set(battleId, battle);
  res.json({
    success: true,
    battleId,
    choice,
    reactorId: out.reactorId,
    counterKilled: out.counterKilled ?? false,
    surprise: null,
    victory: out.resume?.victoryResult ?? out.replace?.victoryResult ?? out.counter?.victoryResult ?? null,
  });
});

// ============================================
// ★ Phase 30-Deploy: 单位部署端点 — 将 pendingUnit 注入战场
// ============================================

/**
 * POST /api/combat/:battleId/deploy-unit
 * 在部署阶段将单位放在六角格 (q,r) 坐标上
 * 前端 NewBattleView.deployToHex → combatAPI.deployUnit
 */
// 识别"偷袭/隐匿单位"：战术角色为 ambush（方案A 下偷袭方），或携带 stealth 系列词条/技能
// （stealth_initiate / stealth_ambush / stealth_camouflage 等）。用于"登场即隐匿"。
// ★ 修正（2026-07-31）：隐匿资格以「战术角色 role」为准，不再依赖固有阵营 faction。
//   旧逻辑误将 maxion 固有阵营直接判为隐匿，导致方案A 下 defense→maxion 的防守方被误隐。
function isStealthCapableUnit(unitData: any, factionRoles?: Record<string, string>): boolean {
  if (!unitData) return false;
  // 严格把关：仅战术角色为 ambush 的阵营单位才享"登场即隐匿"被动
  const role = (factionRoles && unitData.faction != null)
    ? resolveRole(factionRoles, unitData.faction)
    : '';
  if (role === 'ambush') return true;
  const rawTags = [
    ...(Array.isArray(unitData.skills)
      ? unitData.skills
      : (typeof unitData.skills === 'string' ? (safeParseValue(unitData.skills) ?? []) : [])),
    ...(Array.isArray(unitData.equipped_tags)
      ? unitData.equipped_tags
      : (typeof unitData.equipped_tags === 'string' ? (safeParseValue(unitData.equipped_tags) ?? []) : [])),
  ];
  const joined = rawTags
    .map((t: any) => (typeof t === 'string' ? t : (t?.id || t?.key || t?.name || '')))
    .join(',')
    .toLowerCase();
  return /stealth|隐匿|潜行|偷袭/.test(joined);
}

// 给单位打上"登场即隐匿"标记（不耗 AP、不依赖按钮）
function applySpawnStealth(unit: any): void {
  (unit as any).stealth = true;
  (unit as any).stealthData = { type: 'conceal', duration: -1, appliedAt: Date.now(), auto: true };
}

// 进入隐匿类技能（白名单）：释放这些技能不破隐（它们本身就是进入/保持隐匿）
const STEALTH_ENTER_KEYS = ['stealth_initiate', 'enter_stealth', 'stealth_ambush'];
// 破隐规则③的邻近阈值：敌方单位停在此距离(含)以内即暴露
const STEALTH_PROXIMITY_RANGE = 2;

// 强制破隐：置 stealth=false，并记录破隐原因/时间（供前端滤镜与战报消费）
function breakStealth(unit: any, reason: string): void {
  if (!unit || (unit as any).stealth !== true) return;
  (unit as any).stealth = false;
  (unit as any).stealthData = {
    ...((unit as any).stealthData || {}),
    brokenAt: Date.now(),
    reason,
  };
  logger.info({ msg: `[Gateway:3006] [STEALTH] 单位 ${(unit as any).unitId ?? (unit as any).id} 破隐 reason=${reason}` });
}

// 邻近暴露扫描：任一隐匿单位若被敌方(不同 ownerId)存活单位停在距离 ≤ threshold 内则破隐。
// 覆盖"敌人停在它距离 2 以内"的破隐判据（无论谁移动靠近，都在移动后全量扫描）。
function exposeStealthByProximity(battle: any, threshold = STEALTH_PROXIMITY_RANGE): void {
  if (!battle?.units) return;
  for (const h of battle.units.values()) {
    if (!h || (h as any).stealth !== true) continue;
    let exposed = false;
    for (const o of battle.units.values()) {
      if (o === h) continue;
      const st = o.currentStats;
      if (!st || st.hp <= 0) continue; // 仅存活单位可暴露
      if (o.ownerId && h.ownerId && o.ownerId === h.ownerId) continue; // 同主(队友)不算暴露
      if (!o.position) continue;
      const d = hexDistanceOffset(o.position.q, o.position.r, h.position.q, h.position.r);
      if (d <= threshold) { exposed = true; break; }
    }
    if (exposed) breakStealth(h, 'proximity');
  }
}

router.post('/api/combat/:battleId/deploy-unit', authenticate, (req: Request, res: Response) => {
  const { battleId } = req.params;
  // 阶段三：pickId 收口（camelCase/snake_case 双接收兜底，内部统一 unitId）
  const unitId = pickUnitId(req.body);
  const { q, r, unit_data } = req.body || {};

  if (!unitId || q === undefined || r === undefined) {
    logger.error({ msg: `[DEPLOY-UNIT] 400 拦截: 缺必填参数 | req.body= ${ JSON.stringify(req.body) }` });
    res.status(400).json({ error: 'VALIDATION_ERROR', message: 'unitId, q, r 为必填项' });
    return;
  }

  const battle = requireBattle(battleId);
  if (!battle) {
    res.status(404).json({ error: 'BATTLE_NOT_FOUND', message: `战局 ${battleId} 不存在` });
    return;
  }

  // ★ P-3+ DK4：部署锁定门控——非部署阶段（已进入 BATTLE_LOADING/COMBAT）一律 409 DEPLOY_LOCKED，
  // 杜绝"看完站位再补放"与赛后补放。先关门后验货的关门体现。
  if (battle.phase !== BattlePhase.DEPLOYMENT) {
    res.status(409).json({ error: 'DEPLOY_LOCKED', message: '部署阶段已锁定，无法再放置单位' });
    return;
  }

  // 从 pendingUnits 中查找并移除；找不到时回退到请求体 unit_data
  // （覆盖：前端回退池 / pending-units 静默失败 / 重复部署场景）
  const pending: any[] = (battle as any).pendingUnits || [];
  const idx = pending.findIndex((u: any) => String(u.id) === String(unitId));
  let unitData: any;
  if (idx >= 0) {
    [unitData] = pending.splice(idx, 1);
    (battle as any).pendingUnits = pending;
  } else if (unit_data) {
    unitData = unit_data;
    logger.warn({ msg: `[DEPLOY-UNIT] 单位 ${unitId} 不在部署池，回退使用请求体 unit_data 创建` });
  } else {
    res.status(404).json({ error: 'UNIT_NOT_IN_POOL', message: '该单位不在部署池中' });
    return;
  }

  // Phase 30-Cover: 七视图 URL 优先取 unitData（部署池），回退到请求体 unit_data
  const rawViewUrls = unitData.view_urls ?? unitData.viewUrls ?? unit_data?.view_urls ?? unit_data?.viewUrls
  const viewUrls = (() => {
    const v = safeParseValue(rawViewUrls)
    return (v && typeof v === 'object') ? v : undefined
  })()

  const deployedUnit = createBattleUnit({
    unitId: String(unitData.id),
    matrixId: unitData.matrixId || unitData.matrix_id || String(unitData.id),
    ownerId: unitData.ownerId || unitData.owner_id || req.auth!.userId,
    position: { q: Number(q), r: Number(r) },
    // 防御性解析：避免 stats/skills/viewUrls 为原始字符串导致按字符拆解
    currentStats: safeParseValue(unitData.stats ?? unit_data?.stats) ?? { attack: 10, defense: 10, mobility: 5, speed: 5, hp: 100 },
    skills: safeParseValue(unitData.skills ?? unit_data?.skills) ?? [],
    statusEffects: [],
    actionPoints: { MOVE: 1, ATTACK: 1, DEFEND: 1 },
    // Phase 30-Cover: 战场端渲染补全字段（faction/name/codename/type + 七视图 viewUrls）
    faction: unitData.faction ?? unit_data?.faction,
    // 方案A：部署即写入轮转角色（与 factionRoles 还原同源），作为后续逻辑判定依据
    role: resolveUnitRole(battle, unitData.faction ?? unit_data?.faction),
    name: unitData.name ?? unit_data?.name,
    codename: unitData.codename ?? unit_data?.codename,
    unitCode: unitData.unitCode ?? unitData.codename ?? unit_data?.unitCode ?? unit_data?.codename,
    type: unitData.type ?? unit_data?.type,
    viewUrls,
    // 单位体型（体积）：优先取部署池，回退请求体
    size: unitData.size ?? unit_data?.size,
    // 机体基础属性（编辑器原始值）：射击/格斗/机动，供前端单位卡片展示
    main_射击: unitData.main_射击 ?? unit_data?.main_射击,
    main_格斗: unitData.main_格斗 ?? unit_data?.main_格斗,
    main_机动: unitData.main_机动 ?? unit_data?.main_机动,
    // 阶段二：传入归一化部件以构建装备耐久/独立 HP 状态
    parts: safeParseValue(unitData.attributes)?.parts ?? safeParseValue(unit_data?.attributes)?.parts,
  });

  battle.units.set(String(unitId), deployedUnit);

  // 登场即隐匿（用户需求）：偷袭/隐匿单位部署时直接进入隐匿，无需按钮、不耗 AP。
  // 破隐条件：① 真实攻击（/attack 路由 D9-10）；② 释放任意主动技能（/skill 路由，STEALTH_ENTER_KEYS 除外）；
  //   ③ 任一敌方单位停在其距离 ≤2 内（proximity，移动后扫描）；④ 奇袭结算后反应方 C 强制显形（D9-4）。
  if (isStealthCapableUnit(unitData, battle.factionRoles)) applySpawnStealth(deployedUnit);

  logger.info({ msg: `[Gateway:3006] [DEPLOY] 单位 ${unitId} 部署到 (${q},${r}) | 战局 ${battleId} | 池剩余 ${pending.length}` });

  battleStore.set(battleId, battle); // 触发实时推送：单位登场（含隐匿状态）

  res.json({
    success: true,
    battleId,
    unitId: unitId,
    position: { q, r },
    poolRemaining: pending.length,
  });
});

/**
 * ★ P-3+：统一点火序列（Ignition Tick）。
 * 把"进入战斗"的全部一次性结算收敛到单一函数，保证时序可复现、与操作顺序无关：
 *  - round=1 / 先攻阵营 / 行动序初始化
 *  - 用已 reconcile 的 factionRoles 回填每个单位轮转角色（敌我/可见/胜负判定一致）
 *  - 触发 ON_BATTLE_START 反应（初始 Buff / 词条到期时间统一锚定）
 * 单一原子事务：调用方在 BATTLE_LOADING 关门后调用，随后 battleStore.set（A-5 CAS 自动覆盖）。
 */
function igniteBattleStart(battle: any): void {
  battle.turn = 1;
  battle.round = 1;
  battle.activeFactionIndex = 0;
  battle.activeFaction = (battle.factionTurnOrder && battle.factionTurnOrder[0]) || '';
  ensureTurnModel(battle);
  for (const u of battle.units.values()) {
    (u as unknown as { role?: string }).role = resolveRole(battle.factionRoles, (u as unknown as { faction?: string }).faction);
  }
  // ON_BATTLE_START 统一点火：初始 Buff / 词条计时统一锚定（与操作顺序无关，可复现）
  try {
    fireReaction('on_battle_start', { battleState: battle, round: 1, log: () => {}, broadcast: () => {} });
  } catch (e: any) {
    logger.error({ msg: `[igniteBattleStart] on_battle_start 反应失败 ${ e?.message || e }` });
  }
}

/**
 * POST /api/combat/:battleId/end-deployment
 * 结束部署阶段，切换到战斗阶段
 * ★ P-3+：三段式门控（DEPLOYMENT → BATTLE_LOADING → COMBAT）：先关门后验货，再统一点火。
 */
router.post('/api/combat/:battleId/end-deployment', authenticate, (req: Request, res: Response) => {
  const { battleId } = req.params;

  const battle = requireBattle(battleId);
  if (!battle) {
    res.status(404).json({ error: 'BATTLE_NOT_FOUND', message: `战局 ${battleId} 不存在` });
    return;
  }

  // ★ P-3+ DK3：仅房主可点火（hostId 非空时必须匹配），否则 403
  if (battle.hostId && battle.hostId !== (req.auth && (req.auth as any).userId)) {
    res.status(403).json({ error: 'FORBIDDEN', message: '只有房主可结束部署并进入战斗' });
    return;
  }
  // ★ P-3+ DK3：幂等 + 已点火则返回 409 DEPLOY_LOCKED（杜绝重复点火/赛后补放）
  if (battle.phase === BattlePhase.COMBAT) {
    res.status(409).json({ error: 'DEPLOY_LOCKED', message: '战斗已在进行，部署已锁定' });
    return;
  }

  // ★ P-3+：先关门（DEPLOYMENT → BATTLE_LOADING），进入验货态，deploy-unit 此时即 409
  battle.phase = BattlePhase.BATTLE_LOADING;

  // ★ P-3+：验货（先关门后验货）——单位数 > 0 才允许点火
  if (!battle.units || battle.units.size === 0) {
    battle.phase = BattlePhase.DEPLOYMENT; // 验货失败回滚
    res.status(400).json({ error: 'NO_UNITS_DEPLOYED', message: '尚未部署任何单位，无法进入战斗' });
    return;
  }

  // ★ P-3+：统一点火序列（Ignition Tick）——回合/先攻/角色回填/ON_BATTLE_START，单一原子事务
  try {
    igniteBattleStart(battle);
  } catch (e: any) {
    battle.phase = BattlePhase.DEPLOYMENT; // 点火失败回滚关门
    logger.error({ msg: `[DEPLOY END] 点火失败回滚 ${ battleId } ${ e?.message || e }` });
    res.status(500).json({ error: 'IGNITION_FAILED', message: '战斗点火失败' });
    return;
  }
  battle.phase = BattlePhase.COMBAT;

  logger.info({ msg: `[Gateway:3006] [DEPLOY END] 战局 ${battleId} 部署阶段结束 → 进入战斗 | ${battle.units.size} 个单位` });

  battleStore.set(battleId, battle); // 触发实时推送：进入战斗阶段/重置回合

  res.json({
    success: true,
    battleId,
    phase: battle.phase,
    unitCount: battle.units.size,
  });
});

// ============================================
// ★ 局内读取端点（Phase 29-Rescure 终极收官补齐）
// ============================================

/**
 * GET /api/combat/:battleId/deploy-pool
 * 拉取待部署机甲池镜像（前端 BattleMainView.loadDeployPool 依赖）
 *
 * 读取上一轮 POST /pending-units 写入的沙盒数据，无损回传前端。
 */
router.get('/api/combat/:battleId/deploy-pool', authenticate, (req: Request, res: Response) => {
  const { battleId } = req.params;

  const battle = requireBattle(battleId);
  if (!battle) {
    res.status(404).json({ error: 'BATTLE_NOT_FOUND', message: `战局 ${battleId} 不存在` });
    return;
  }

  const pendingUnits = (battle as any).pendingUnits || [];

  logger.info({ msg: `[Gateway:3006] [DEPLOY POOL] 战局 ${battleId} 返回 ${pendingUnits.length} 个待部署单位` });

  res.json({
    success: true,
    battleId,
    units: pendingUnits,
    count: pendingUnits.length,
  });
});

/**
 * GET /api/combat/:battleId/victory-conditions
 * 拉取当前战局的胜利断言条件
 *
 * 读取 POST /viction-conditions 写入的胜利条件配置。
 */
router.get('/api/combat/:battleId/victory-conditions', authenticate, (req: Request, res: Response) => {
  const { battleId } = req.params;

  const battle = requireBattle(battleId);
  if (!battle) {
    res.status(404).json({ error: 'BATTLE_NOT_FOUND', message: `战局 ${battleId} 不存在` });
    return;
  }

  const conditions = (battle as any).victoryConditions || null;

  logger.info({ msg: `[Gateway:3006] [GET VICTORY CONDS] 战局 ${battleId} ${ conditions ? '有胜利条件' : '(空)' }` });

  res.json({
    success: true,
    battleId,
    victoryConditions: conditions,
  });
});

/**
 * GET /api/combat/:battleId/faction-cooldowns
 * 返回各阵营战术指令运行时冷却计数 CD 字典
 *
 * 运行时数据：记录每方每个战术技能的剩余冷却回合数。
 * 格式: { earth: { orbital_bombardment: 0, ... }, mars: { ... } }
 */
router.get('/api/combat/:battleId/faction-cooldowns', authenticate, (req: Request, res: Response) => {
  const { battleId } = req.params;

  const battle = requireBattle(battleId);
  if (!battle) {
    res.status(404).json({ error: 'BATTLE_NOT_FOUND', message: `战局 ${battleId} 不存在` });
    return;
  }

  // 初始化或读取阵营冷却字典（首次访问返回全零）
  if (!(battle as any).factionCooldowns) {
    (battle as any).factionCooldowns = {
      earth: {},
      mars: {},
      neutral: {},
    };
  }

  const cooldowns = (battle as any).factionCooldowns;

  logger.info({ msg: `[Gateway:3006] [FACTION CDs] 战局 ${battleId} 冷却状态: ${ JSON.stringify(cooldowns) }` });

  res.json({
    success: true,
    battleId,
    factionCooldowns: cooldowns,
  });
});

// ============================================
// 内部工具：重置阵营冷却（供 end-turn 等调用）
// ============================================

/**
 * POST /api/combat/:battleId/faction-cooldowns/tick
 * 回合结束时递减所有阵营冷却计数（内部管道端点）
 */
router.post('/api/combat/:battleId/faction-cooldowns/tick', authenticate, (req: Request, res: Response) => {
  const { battleId } = req.params;

  const battle = requireBattle(battleId);
  if (!battle) {
    res.status(404).json({ error: 'BATTLE_NOT_FOUND', message: `战局 ${battleId} 不存在` });
    return;
  }

  const cds = (battle as any).factionCooldowns || {};
  
  // 所有阵营所有技能 CD -1（最小归零）
  for (const faction of Object.keys(cds)) {
    for (const skill of Object.keys(cds[faction])) {
      if (cds[faction][skill] > 0) {
        cds[faction][skill] -= 1;
      }
    }
  }

  (battle as any).factionCooldowns = cds;

  logger.info({ msg: `[Gateway:3006] [CD TICK] 战局 ${battleId} 全阵营冷却递减完成` });

  battleStore.set(battleId, battle); // 触发实时推送：阵营冷却递减

  res.json({
    success: true,
    battleId,
    factionCooldowns: cds,
  });
});

// ============================================
// Phase 30-地图炮: 方向射线命中判定器
// ============================================

/**
 * directional_beam 命中判定 — 六角格射线碰撞算法
 *
 * 从 caster 坐标 (q0, r0) 沿 direction 方向发射一条宽度为 width 的射线。
 * 遍历战场所有单位，判断是否在射线路径上。
 *
 * @param q0 施法者 q
 * @param r0 施法者 r
 * @param direction 射线方向 { dq, dr } (六角格方向向量)
 * @param length   射线长度 (六角格数)
 * @param width    射线宽度 (垂直偏移格数，0 = 精确线)
 * @param units    战场单位 Map
 * @returns 被命中的单位 ID 列表
 */
function getDirectionalBeamHits(
  q0: number, r0: number,
  direction: { dq: number; dr: number },
  length: number, width: number,
  units: Map<string, BattleUnit>
): string[] {
  const hits: string[] = [];

  // Even-R offset 六边形距离（阶段 B：统一 offset 语义）
  function hexDist(q1: number, r1: number, q2: number, r2: number): number {
    return hexDistanceOffset(q1, r1, q2, r2);
  }

  // 点到线段的六角格距离
  function pointToBeamDist(tq: number, tr: number): number {
    // 计算目标在射线方向上的投影
    const dot = (tq - q0) * direction.dq + (tr - r0) * direction.dr;
    // 投影在射线长度内
    if (dot < 0 || dot > length) return Infinity;
    // 垂直距离（六角坐标空间近似）
    const perpDq = (tq - q0) - direction.dq * dot;
    const perpDr = (tr - r0) - direction.dr * dot;
    return hexDist(0, 0, perpDq, perpDr);
  }

  for (const [unitId, unit] of units) {
    const { q, r } = unit.position;
    const dist = pointToBeamDist(q, r);
    if (dist <= width + 0.5) hits.push(unitId);
  }

  return hits;
}

/**
 * POST /api/combat/:battleId/beam-hits
 * 查询方向射线命中哪些单位（不执行伤害，纯查询）
 *
 * Body: { casterUnitId, direction: { dq, dr }, length, width }
 */
router.post('/api/combat/:battleId/beam-hits', authenticate, (req: Request, res: Response) => {
  const { battleId } = req.params;
  const { casterUnitId, direction, length, width } = req.body || {};

  const battle = requireBattle(battleId);
  if (!battle) {
    res.status(404).json({ error: 'BATTLE_NOT_FOUND' });
    return;
  }

  if (!casterUnitId || !direction || length === undefined) {
    res.status(400).json({ error: 'VALIDATION_ERROR', message: 'casterUnitId, direction, length 为必填项' });
    return;
  }

  const caster = battle.units.get(String(casterUnitId));
  if (!caster) {
    res.status(404).json({ error: 'UNIT_NOT_FOUND' });
    return;
  }

  const beamWidth = width ?? 0;
  const hits = getDirectionalBeamHits(
    caster.position.q, caster.position.r,
    direction, length, beamWidth,
    battle.units
  );

  logger.info({ msg: `[Gateway:3006] [BEAM HITS] 战局 ${battleId} 射线命中 ${hits.length} 个单位` });

  res.json({
    success: true,
    battleId,
    casterPosition: caster.position,
    direction, length, width: beamWidth,
    hits,
  });
});

/**
 * POST /api/combat/:battleId/move
 * 阶段一：移动单位并返回完整六边形路径（供前端逐段行走 + 动态朝向）。
 * 移动范围 = 机体+载具(耐久>0)+背包(耐久>0)（移动力直接等于有效机动总和）。
 */
// ============================================
// ★ Royroy 浮游辅机动作（阶段二规则6）
// ============================================

/** Even-R Offset 六角格距离（阶段 B：统一 offset 语义，offset→axial 后取 cube 距离） */
function hexDist(a: { q: number; r: number }, b: { q: number; r: number }): number {
  return hexDistanceOffset(a.q, a.r, b.q, b.r);
}

router.post('/api/combat/:battleId/action', authenticate, (req: Request, res: Response) => {
  const { battleId } = req.params;
  const { actionType, params = {} } = req.body || {};
  const battle = requireBattle(battleId);
  if (!battle) return res.status(404).json({ error: 'BATTLE_NOT_FOUND' });
  // 角色制轮转模型迁移（旧战局势力键 → 角色键），保证门控正确
  ensureTurnModel(battle);

  if (actionType === 'wait') {
    // 待机：标记该单位 standby，若同角色全员待机则自动跳到下一阵营
    const unit_id = params?.unitId ?? params?.unit_id; // ★ P0 双接收兜底
    const u = battle.units.get(String(unit_id));
    if (!u) return res.status(404).json({ error: 'UNIT_NOT_FOUND' });
    if (battle.activeFaction && !canIssueCommand(battle, u, (req as any).user)) {
      return res.status(400).json({ error: 'NOT_YOUR_TURN', message: `当前行动阵营为 ${battle.activeFaction}` });
    }
    (u as unknown as { standby?: boolean }).standby = true;
    u.action_points = { MOVE: 0, ATTACK: 0, DEFEND: 0 };   // 待机 = 终结该单位本轮
    battleStore.set(battleId, battle); // 触发实时推送：待机/阵营切换
    const advanced = maybeAutoAdvance(battle);
    return res.json({
      success: true,
      actionType,
      unitId: unit_id,
      standby: true,
      advanced,
      activeFaction: battle.activeFaction,
      activeFactionIndex: battle.activeFactionIndex,
      round: battle.round,
      turn: battle.turn,
      message: advanced ? '全员待机，自动切换到下一阵营' : '已待机',
    });
  }

  if (actionType === 'defend') {
    // 防御：清零行动点（终结本轮）+ 标记 standby（走全员待机自动跳阵营）+ 写入持续减伤 statusEffect
    const unit_id = params?.unitId ?? params?.unit_id; // ★ P0 双接收兜底
    const u = battle.units.get(String(unit_id));
    if (!u) return res.status(404).json({ error: 'UNIT_NOT_FOUND' });
    if (battle.activeFaction && !canIssueCommand(battle, u, (req as any).user)) {
      return res.status(400).json({ error: 'NOT_YOUR_TURN', message: `当前行动阵营为 ${battle.activeFaction}` });
    }
    // 被动调度器：防御单位开始行动时按 trigger 条件自动发动被动技能
    const passiveLogsDefend = evaluatePassives(u, battle);
    // ① 防御 = 消耗 DEFEND 行动点（属于三类之一，不再强制终结整轮）
    consumeActionPoint(u, 'DEFEND', 1);
    // ② 系统级兜底：三类行动点用满任意两类即进入待机（如已移动则本次防御后自动待机）
    markStandbyIfDone(u);
    // ③ 写入「防御姿态」减伤 statusEffect（value=3，applies_on='defense'，与 guard 同源）
    u.statusEffects = Array.isArray(u.statusEffects) ? u.statusEffects : [];
    u.statusEffects = u.statusEffects.filter((s: any) => s.source !== 'defend_action'); // 去重，避免连点叠加
    u.statusEffects.push({
      id: `defend_${u.unitId}_${Date.now()}`,
      type: 'defense',
      duration: 1,
      remainingTurns: 1,
      params: {},
      // 以下字段为运行时减伤管道 / 清理逻辑所需（StatusEffect 类型未声明，引擎按 any 读取）
      source: 'defend_action',
      label: '防御姿态',
      action_type: 'defense_buff',
      value: 3,                                   // 每次受击 -3
      consumption: { mode: 'duration', remaining: 1, max: 1 },
      trigger: { type: 'unconditional', attack_type: null, damage_kind: null },
      applies_on: 'defense',
    } as any);
    battleStore.set(battleId, battle); // 触发实时推送：防御姿态/AP/待机
    const advanced = maybeAutoAdvance(battle);
    return res.json({
      success: true,
      actionType,
      unitId: unit_id,
      standby: !!(u as unknown as { standby?: boolean }).standby,
      advanced,
      activeFaction: battle.activeFaction,
      activeFactionIndex: battle.activeFactionIndex,
      round: battle.round,
      turn: battle.turn,
      message: '进入防御姿态',
      passive_triggers: passiveLogsDefend.length ? passiveLogsDefend : undefined,
    });
  }

  if (actionType === 'deploy_royroy') {
    const unit_id = params?.unitId ?? params?.unit_id; // ★ P0 双接收兜底
    const { q, r } = params;
    const host = battle.units.get(String(unit_id));
    if (!host) return res.status(404).json({ error: 'UNIT_NOT_FOUND' });
    const roy = host.royroy;
    if (!roy) return res.status(400).json({ error: 'NO_ROYROY', message: '该单位无 Royroy' });
    if (roy.status === 'destroyed') return res.status(400).json({ error: 'ROYROY_DESTROYED', message: 'Royroy 已损毁，本局不可再部署' });
    if (roy.deployed) return res.status(400).json({ error: 'ALREADY_DEPLOYED' });
    if ((roy.cooldownRound ?? 0) > battle.round) return res.status(400).json({ error: 'COOLDOWN', message: `冷却中，第 ${roy.cooldownRound} 轮后可再部署` });
    if (roy.hp <= 0) return res.status(400).json({ error: 'HP_ZERO' });
    // 行动阶段门控：宿主须为当前 activeFaction
    if (battle.activeFaction && resolveRole(battle.factionRoles, host.faction) !== battle.activeFaction) {
      return res.status(400).json({ error: 'NOT_YOUR_TURN', message: `当前行动阵营为 ${battle.activeFaction}` });
    }
    const target = { q: Number(q), r: Number(r) };
    const targetKey = getHexKey(target.q, target.r);
    const cells = new Set((battle.map?.cells || []).map((c: any) => getHexKey(c.q, c.r)));
    if (!cells.has(targetKey)) return res.status(400).json({ error: 'INVALID_CELL' });
    if (hexDist(host.position, target) !== 1) return res.status(400).json({ error: 'NOT_ADJACENT', message: 'Royroy 必须部署在主机相邻格' });
    const occupied = new Set<string>();
    for (const u of battle.units.values()) if (u.position) occupied.add(getHexKey(u.position.q, u.position.r));
    for (const u of battle.units.values()) if (u.royroy?.deployed && u.royroy.q !== undefined) occupied.add(getHexKey(u.royroy.q, u.royroy.r));
    if (occupied.has(targetKey)) return res.status(400).json({ error: 'CELL_OCCUPIED' });
    // 部署：不消耗任何 AP
    roy.deployed = true;
    roy.status = 'deployed';
    roy.q = target.q;
    roy.r = target.r;
    // ★ A8 阵营继承：部署时强制透传母机的 faction / ownerId，确保 Royroy
    //   能被战斗核心的友军/敌军识别与归属逻辑正确处理（含未来纳入目标集合）。
    roy.faction = host.faction;
    roy.ownerId = host.ownerId;
    battleStore.set(battleId, battle); // 触发实时推送：Royroy 部署上场
    return res.json({ success: true, actionType, unitId: unit_id, royroy: roy, battleId });
  }

  if (actionType === 'retrieve_royroy') {
    const unit_id = params?.unitId ?? params?.unit_id; // ★ P0 双接收兜底
    const host = battle.units.get(String(unit_id));
    if (!host) return res.status(404).json({ error: 'UNIT_NOT_FOUND' });
    const roy = host.royroy;
    if (!roy) return res.status(400).json({ error: 'NO_ROYROY' });
    if (roy.status === 'destroyed') return res.status(400).json({ error: 'ROYROY_DESTROYED' });
    if (!roy.deployed) return res.status(400).json({ error: 'NOT_DEPLOYED' });
    if (roy.hp <= 0) return res.status(400).json({ error: 'HP_ZERO', message: 'HP 为 0 不可回收' });
    if (battle.activeFaction && resolveRole(battle.factionRoles, host.faction) !== battle.activeFaction) {
      return res.status(400).json({ error: 'NOT_YOUR_TURN', message: `当前行动阵营为 ${battle.activeFaction}` });
    }
    if (roy.q === undefined || roy.r === undefined || hexDist(host.position, { q: roy.q, r: roy.r }) !== 1) {
      return res.status(400).json({ error: 'NOT_ADJACENT', message: '回收需 Royroy 处于主机相邻格' });
    }
    // 回收：不消耗 AP，回血至满，冷却 round+2
    roy.deployed = false;
    roy.status = 'inactive';
    roy.hp = roy.maxHp;
    roy.cooldownRound = battle.round + 2;
    roy.q = undefined;
    roy.r = undefined;
    battleStore.set(battleId, battle); // 触发实时推送：Royroy 回收
    return res.json({ success: true, actionType, unitId: unit_id, royroy: roy, cooldownRound: roy.cooldownRound, battleId });
  }

  if (actionType === 'damage_royroy') {
    const unit_id = params?.unitId ?? params?.unit_id; // ★ P0 双接收兜底
    const { dmg } = params;
    const host = battle.units.get(String(unit_id));
    if (!host) return res.status(404).json({ error: 'UNIT_NOT_FOUND' });
    const roy = host.royroy;
    if (!roy || !roy.deployed) return res.status(400).json({ error: 'NO_DEPLOYED_ROYROY' });
    const d = Number(dmg) || 0;
    roy.hp = Math.max(0, roy.hp - d);
    if (roy.hp <= 0) {
      roy.status = 'destroyed';
      roy.deployed = false;
      roy.q = undefined;
      roy.r = undefined;
      battleStore.set(battleId, battle); // 触发实时推送：Royroy 损毁
      return res.json({ success: true, actionType, unitId: unit_id, destroyed: true, royroy: roy, battleId });
    }
    battleStore.set(battleId, battle); // 触发实时推送：Royroy 受击
    return res.json({ success: true, actionType, unitId: unit_id, destroyed: false, royroy: roy, battleId });
  }

  return res.status(400).json({ error: 'UNKNOWN_ACTION', message: `未知 actionType: ${actionType}` });
});

router.post('/api/combat/:battleId/move', authenticate, (req: Request, res: Response) => {
  try {
    const battleId = req.params.battleId;
    const unit_id = pickUnitId(req.body); // 阶段三：pickId 收口（双命名兜底 + 归一化）
    const { target_q, target_r } = req.body || {};
    const state = requireBattle(battleId);
    if (!state) return res.status(404).json({ error: 'BATTLE_NOT_FOUND' });
    // 角色制轮转模型迁移（旧战局势力键 → 角色键）
    ensureTurnModel(state);
    const unit = state.units.get(String(unit_id));
    if (!unit) return res.status(404).json({ error: 'UNIT_NOT_FOUND' });

    // ★ 定身/移动阻断拦截（G_block_movement 消费侧闭环）：
    // 读取施动单位 _meta.flags.block_movement 与到期回合 block_movement_until。
    // 若处于阻断生效期（标记为真且未到期），直接拒绝移动，不进入寻路/AP 消耗。
    const bmFlags = unit?._meta?.flags;
    if (bmFlags && bmFlags.block_movement === true) {
      const until = typeof bmFlags.block_movement_until === 'number' ? bmFlags.block_movement_until : Infinity;
      const curRound = typeof state.round === 'number' ? state.round : (state.turnOrder?.round ?? 0);
      if (curRound <= until) {
        return res.status(400).json({
          ok: false,
          code: 'MOVEMENT_BLOCKED',
          message: '单位已被定身/阻断移动',
          until_round: until === Infinity ? null : until,
        });
      }
    }

    // 阵营轮转门控：仅当前 activeFaction(角色) 的单位可移动
    if (state.activeFaction && resolveRole(state.factionRoles, unit.faction) !== state.activeFaction) {
      return res.status(400).json({ error: 'NOT_YOUR_TURN', message: `当前行动阵营为 ${state.activeFaction}` });
    }

    // 被动调度器：本单位开始行动（移动）时按 trigger 条件自动发动被动技能
    const passiveLogsMove = evaluatePassives(unit, state);

    // P0：移动行动点校验（每轮回合仅 1 次移动）
    if (!hasActionPoints(unit, 'MOVE')) {
      return res.status(400).json({ success: false, error: 'NO_MOVE_AP', message: '移动行动点已用完（每轮回合仅 1 次移动）' });
    }

    const from = unit.position;
    // 移动范围 = 移动力总预算（移动值本身，单位：移动点）。
    // 普通地形每格消耗 1 点，特殊地形更多；tsFindPath 按地形加权 Dijkstra 在预算内寻路。
    // 预算优先取 moveRange（机体+载具+背包合计，即 currentStats.speed）；
    // moveRange 缺/0 时回退 mobility（仅机体），最后兜底 3。
    // 重要：currentStats.speed 未注入时 moveRange=0，故用真值判断 + 下限 1 防锁死。
    const rawMob = (unit.moveRange && unit.moveRange > 0)
      ? unit.moveRange
      : (unit.mobility || 3);
    // 体型机动补偿 Buff：被更大机体攻击后，下回合移动 +N（由 BuffManager 写入）
    const buffMob = ((unit as any).mobility_buff && (unit as any).mobility_buff_turns > 0) ? ((unit as any).mobility_buff || 0) : 0;
    // 侦察机动增益：从 statusEffects(applies_on='mobility'，持续 duration) 读取
    const scoutMob = Array.isArray((unit as any).statusEffects)
      ? (unit as any).statusEffects
          .filter((s: any) => s && s.applies_on === 'mobility' && s.consumption && s.consumption.mode === 'duration')
          .reduce((a: number, s: any) => a + (Number(s.value) || 0), 0)
      : 0;
    let movementRange = Math.max(1, Math.round(Number(rawMob) + Number(buffMob) + Number(scoutMob)));

    const path = tsFindPath(
      state,
      { q: from.q, r: from.r, unitId: unit.unitId },
      { q: target_q, r: target_r },
      movementRange,
    );
    if (!path) return res.status(400).json({ error: 'OUT_OF_RANGE' });

    // Phase B：on_move_path 点火（路径已确认合法、落地前）—— 供 ZOC/阻碍等反应器接管路径结算
    fireReaction('on_move_path', { battleState: state, unit, from, to: { q: target_q, r: target_r }, path });

    // Batch D 任务4.2: 移动触发伏击 — 若目的地落入敌方隐身 overwatch 单位射程，
    // 复用 4.3 双段中断状态机（pendingSurprise + 10s 倒计时）发起伏击。
    const fromPos = { q: from.q, r: from.r };
    // 临时把单位摆到目的地做射程判定；判定后复位，未触发则按正常流程移动。
    unit.position = { q: target_q, r: target_r };
    unit.q = target_q; unit.r = target_r;
    const ambush = maybeInterceptSurprise(battleId, state, {
      attacker_id: unit.unitId,
      target_id: unit.unitId,
      attack_type: 'melee',
      __moveAmbush: true,
    });
    if (ambush.interrupted) {
      // 伏击中断移动：单位保持原位，等待前端走 surprise-choice 结算（ambusher 攻击 mover）
      unit.position = fromPos;
      unit.q = fromPos.q; unit.r = fromPos.r;
      // 触发推送：让 reactor（其他客户端）经 socket 收到 pendingSurprise 并弹出 QTE
      battleStore.set(battleId, state);
      return res.json({
        success: true,
        ambushed: true,
        interrupted: true,
        surprise: ambush.surprise,
        unitId: unit_id,
        state: getStateView(battleId),
      });
    }
    unit.position = fromPos;
    unit.q = fromPos.q; unit.r = fromPos.r;

    unit.position = { q: target_q, r: target_r };
    // A5-hold_position 契约对齐：顶层 q/r 与 position 同步（victoryChecker 读顶层）
    unit.q = target_q;
    unit.r = target_r;

    // 阶段二规则6：auto Royroy 随主机移动后自动重定位至邻域空格（不消耗主机 MOVE）
    if (unit.royroy?.deployed && unit.royroy.isAuto) {
      const cells = new Set((state.map?.cells || []).map((c: any) => `${c.q},${c.r}`));
      const occupied = new Set<string>();
      for (const u of state.units.values()) if (u.position) occupied.add(`${u.position.q},${u.position.r}`);
      for (const u of state.units.values()) if (u !== unit && u.royroy?.deployed && u.royroy.q !== undefined) occupied.add(`${u.royroy.q},${u.royroy.r}`);
      const dirs = getEvenROffsetDirs(target_q, target_r);
      for (const [dq, dr] of dirs) {
        const nq = target_q + dq, nr = target_r + dr, nk = `${nq},${nr}`;
        if (cells.has(nk) && !occupied.has(nk)) { unit.royroy.q = nq; unit.royroy.r = nr; break; }
      }
    }

    // P0：消费移动行动点
    consumeActionPoint(unit, 'MOVE', 1);
    // 三类行动点用满任意两类即进入待机（系统级兜底，覆盖所有移动路径）
    markStandbyIfDone(unit);

    // 破隐规则③：移动完成后扫描——若任一敌方单位停在该隐匿单位距离 ≤2 内则暴露。
    // 覆盖"敌人停在它距离 2 以内"的破隐判据（无论谁移动靠近）。
    exposeStealthByProximity(state, STEALTH_PROXIMITY_RANGE);

    // 触发实时推送：移动（落位/AP 消耗/待机/破隐）已落到内存态，set 才经 comm 广播
    battleStore.set(battleId, state);

    res.json({
      success: true,
      unitId: unit_id,
      from,
      to: { q: target_q, r: target_r },
      path,
      passive_triggers: passiveLogsMove.length ? passiveLogsMove : undefined,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'MOVE_FAILED', message: err?.message || String(err) });
  }
});

// ============================================
// 临时验收路由（第 0/1 步验收用，验收后删除）
// GET /api/debug/test-snapshot/:battleId
//   读取内存战局 → 落库快照 → 读出 plain → 重建 dummyBattle → 返回类型校验
// O4 安全门控：调试路由仅允许非生产环境访问，防止生产泄漏战局内部数据
// ============================================
router.get('/api/debug/test-snapshot/:battleId', (req: Request, res: Response) => {
  // 生产环境一律拒绝（即便误部署也不会暴露内部战局数据）
  if (process.env.NODE_ENV === 'production') {
    res.status(404).json({ error: 'NOT_FOUND', message: '调试端点不在生产环境提供' });
    return;
  }
  try {
    const { battleId } = req.params;
    const battle = requireBattle(battleId);
    if (!battle) {
      res.status(404).json({ ok: false, error: `战局 ${battleId} 不在内存中（服务重启后内存战局会清空，请先开一局再测）` });
      return;
    }
    // 1) 落库快照
    saveBattleSnapshot(battleId, battle);
    // 2) 从 DB 读出 pure 态
    const plain = loadBattleSnapshot(battleId);
    if (!plain) {
      res.status(500).json({ ok: false, error: 'loadBattleSnapshot 返回 null（DB 写入或读出失败）' });
      return;
    }
    // 3) 重建 dummyBattle
    const dummyBattle = fromPlainState(plain);
    // 临时诊断：dump 部署池(pendingUnits)与已部署单位的关键字段，定位标灰根因
    const dumpUnit = (u: any) => ({
      id: u?.id, name: u?.name,
      faction: u?.faction, role: u?.role,
      hp: u?.hp, maxHp: u?.maxHp,
      currentStatsHp: u?.currentStats?.hp,
      dead: u?.dead,
    });
    const pending = (battle as any).pendingUnits || [];
    const deployed = battle.units instanceof Map ? Array.from(battle.units.values()) : [];
    res.json({
      ok: true,
      battleId,
      originalUnitsIsMap: battle.units instanceof Map,
      rebuiltUnitsIsMap: dummyBattle && dummyBattle.units instanceof Map,
      originalUnitCount: battle.units instanceof Map ? battle.units.size : 0,
      rebuiltUnitCount: dummyBattle && dummyBattle.units instanceof Map ? dummyBattle.units.size : 0,
      snapshotAt: plain.__snapshot_at || null,
      diag: {
        pendingCount: pending.length,
        pendingSample: pending.slice(0, 8).map(dumpUnit),
        deployedCount: deployed.length,
        deployedSample: deployed.slice(0, 8).map(dumpUnit),
      },
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// ============================================
// Phase 30-DiceUnify: 骰子工坊全局参数读写
// GET  /api/combat/dice-config  → 当前骰子引擎参数
// PUT  /api/combat/dice-config  → 保存并热更新（写入 glossary.dice，DiceService 实时读取）
// ============================================
router.get('/api/combat/dice-config', (req: Request, res: Response) => {
  try {
    res.json({ ok: true, config: DiceService.getConfig() });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

router.put('/api/combat/dice-config', authenticate, (req: Request, res: Response) => {
  try {
    const incoming = req.body || {};
    const cfg = getGlossaryConfig() || {};
    cfg.dice = {
      rollMult: incoming.rollMult,
      critThreshold: incoming.critThreshold,
      critMin: incoming.critMin,
      critMax: incoming.critMax,
      availableDiceTypes: incoming.availableDiceTypes,
      manualRollDefault: incoming.manualRollDefault,
      hitCheck: incoming.hitCheck,
    };
    const ok = saveGlossaryConfig(cfg);
    if (!ok) {
      res.status(500).json({ ok: false, error: '写入配置文件失败' });
      return;
    }
    DiceService.getConfig(); // 触发实时重读
    res.json({ ok: true, config: DiceService.getConfig() });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// ============================================
// 原子注册表：语义名 → handler 真相源透传（六段式编辑器 / 方案 A 对接入口）
// GET /api/combat/atom-registry  → 返回 atomRegistry.listMeta()（语义名 + handlerKey + kind + params + guard + desc）
//     可选 ?resolve=<type> 直接对单个语义原子做一次 resolve 预览（翻译后的引擎 effect）
// ============================================
router.get('/api/combat/atom-registry', (req: Request, res: Response) => {
  try {
    // 刷新 entry_id 校验器：基于当前词条库 key 集合（skills/specials/factions/statuses...）
    const glossary = getGlossaryConfig() || {};
    const entryKeys = new Set<string>();
    for (const bucket of ['skills', 'specials', 'factions', 'statuses', 'equipment', 'passives']) {
      const m = glossary[bucket];
      if (m && typeof m === 'object') for (const k of Object.keys(m)) entryKeys.add(k);
    }
    atomRegistry.setEntryValidator((id: string) => entryKeys.has(id));

    const wantResolve = typeof req.query.resolve === 'string' ? req.query.resolve : undefined;
    if (wantResolve) {
      const preview = atomRegistry.resolve({ type: wantResolve });
      res.json({ ok: true, semantic: wantResolve, resolved: preview });
      return;
    }
    res.json({ ok: true, atoms: atomRegistry.listMeta() });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// ============================================
// 体型工坊：尺寸 / 受击系数全局参数读写
// GET  /api/combat/size-config  → 当前尺寸相关参数（渲染缩放/HP/机动/受击/七视图盒子）
// PUT  /api/combat/size-config  → 保存并热更新（写入 glossary.size，applySizeConfigOverride 实时生效）
// ============================================
router.get('/api/combat/size-config', (req: Request, res: Response) => {
  try {
    res.json({ ok: true, config: snapshotSizeConfig() });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

router.put('/api/combat/size-config', authenticate, (req: Request, res: Response) => {
  try {
    const incoming = req.body || {};
    const cfg = getGlossaryConfig() || {};
    cfg.size = {
      renderScale: incoming.renderScale,
      hpFactor: incoming.hpFactor,
      mobFactor: incoming.mobFactor,
      hitFactor: incoming.hitFactor,
      sevenBox: incoming.sevenBox,
    };
    const ok = saveGlossaryConfig(cfg);
    if (!ok) {
      res.status(500).json({ ok: false, error: '写入配置文件失败' });
      return;
    }
    applySizeConfigOverride(cfg.size); // 实时热更新内存覆盖
    res.json({ ok: true, config: snapshotSizeConfig() });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// ============================================
// Batch B 任务4.1: 进入隐匿（stealth_initiate）
// ① 登场即隐匿：deploy-unit / 载入存档时，isStealthCapableUnit 命中即 applySpawnStealth
//    （不耗 AP、不依赖按钮），满足"偷袭单位登场时即生效"。
// ② 手动按钮仍保留：前端 → 后端 enter_stealth（耗 1 MOVE AP）可破隐后重新隐匿。
// 破隐规则（4 条，已落地）：
//   ① 真实攻击自动破隐（/attack 路由 D9-10）；
//   ② 释放任意主动技能破隐（/skill 路由，STEALTH_ENTER_KEYS 例外：进入隐匿类不破隐）；
//   ③ 敌方单位停在其距离 ≤STEALTH_PROXIMITY_RANGE(2) 内破隐（/move 后 proximity 全量扫描）；
//   ④ 奇袭结算后反应方 C 强制显形（D9-4）。
// 复用核心裁决现有 enter_stealth 通道，不新建第二套隐身体系。
// ============================================
router.post('/api/combat/:battleId/stealth', (req: Request, res: Response) => {
  const { battleId } = req.params;
  const unitId = pickUnitId(req.body); // 阶段三：pickId 收口（双命名兜底 + 归一化）
  const { mode } = req.body || {};
  if (!battleId) { res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'battleId 必填' }); return; }
  if (!unitId) { res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'unitId 必填' }); return; }

  const battle = requireBattle(battleId);
  if (!battle) { res.status(404).json({ success: false, error: 'BATTLE_NOT_FOUND' }); return; }
  const unitList: any[] = battle.units instanceof Map ? Array.from(battle.units.values()) : (Array.isArray(battle.units) ? battle.units : []);
  const unit: any = unitList.find((u: any) => String(u.unitId ?? u.id) === String(unitId));
  if (!unit) { res.status(404).json({ success: false, error: 'UNIT_NOT_FOUND' }); return; }

  if (!canIssueCommand(battle, unit, (req as any).user)) {
    res.status(403).json({ success: false, error: 'NOT_YOUR_TURN', message: '该单位当前阵营不可行动' });
    return;
  }

  const effectExecutor = getEffectExecutor();
  if (!effectExecutor || !effectExecutor.handleEnterStealth) {
    res.status(500).json({ success: false, error: 'ENGINE_UNAVAILABLE' });
    return;
  }

  let outcome: any;
  if (mode === 'exit') {
    outcome = effectExecutor.handleExitStealth({ reason: 'manual' }, { unit });
  } else {
    // 进入隐匿耗 1 MOVE AP
    const ap = unit.action_points || { MOVE: 0, ATTACK: 0, DEFEND: 0 };
    if ((ap.MOVE ?? 0) < 1) {
      res.status(400).json({ success: false, error: 'NO_MOVE_AP', message: '移动行动点不足，无法进入隐匿' });
      return;
    }
    ap.MOVE = (ap.MOVE ?? 0) - 1;
    unit.action_points = ap;
    outcome = effectExecutor.handleEnterStealth({ type: 'conceal', duration: 2 }, { unit });
  }

  if (!outcome || !outcome.success) {
    res.status(400).json({ success: false, error: 'STEALTH_FAILED', message: outcome?.reason || '隐匿操作失败' });
    return;
  }

  battleStore.set(battleId, battle); // 触发自动推送（含 combatLog）
  res.json({ success: true, battleId, unitId, mode: mode || 'enter', stealth: unit.stealth, action_points: unit.action_points, state: getStateView(battleId) });
});

export default router;

// ===== 特殊触发词条：交互式反应路由（决斗/抢夺/援助 两段式结算）=====

// H1 决斗预检：选目标时由前端调用，返回 { canDuel, reason }
router.post('/api/combat/:battleId/duel-check', (req: any, res: any) => {
  try {
    const { battleId } = req.params;
    const battle = requireBattle(battleId);
    if (!battle) return res.status(404).json({ error: 'BATTLE_NOT_FOUND' });
    // ★ P0 双接收兜底：caster_unit_id ?? casterUnitId / target_unit_id ?? targetUnitId
    const caster_unit_id = req.body?.casterUnitId ?? req.body?.caster_unit_id;
    const target_unit_id = req.body?.targetUnitId ?? req.body?.target_unit_id;
    const casterUnit = battle.units.get(String(caster_unit_id));
    const targetUnit = battle.units.get(String(target_unit_id));
    if (!casterUnit || !targetUnit) return res.status(400).json({ error: 'UNIT_NOT_FOUND' });
    // 批次1·1.1：on_target_selected 现由 generic_target_select 注册为通用预检（与 duel 解耦）。
    // 先过通用闸门（目标存在/未阵亡/非自杀），失败直接拒绝发动；duel 专属门槛仍由 duelCheck 驱动。
    const pre = fireReaction('on_target_selected', { battleState: battle, caster: casterUnit, target: targetUnit });
    if (pre && pre.ok === false) {
      return res.json({ canDuel: false, reason: pre.reason });
    }
    const result = duelCheck(casterUnit, targetUnit);
    return res.json({ canDuel: result.canDuel, reason: result.reason || null });
  } catch (err: any) {
    return res.status(500).json({ error: 'DUEL_CHECK_FAILED', message: err?.message || String(err) });
  }
});

// 决斗结算：双方掷 1d6 比大小（D2 建议值：替代普通攻击）
router.post('/api/combat/:battleId/resolve-duel', (req: any, res: any) => {
  try {
    const { battleId } = req.params;
    const battle = requireBattle(battleId);
    if (!battle) return res.status(404).json({ error: 'BATTLE_NOT_FOUND' });
    // ★ P0 双接收兜底：caster_unit_id ?? casterUnitId / target_unit_id ?? targetUnitId
    const caster_unit_id = req.body?.casterUnitId ?? req.body?.caster_unit_id;
    const target_unit_id = req.body?.targetUnitId ?? req.body?.target_unit_id;
    const { manual_caster, manual_target } = req.body || {};
    const casterUnit = battle.units.get(String(caster_unit_id));
    const targetUnit = battle.units.get(String(target_unit_id));
    if (!casterUnit || !targetUnit) return res.status(400).json({ error: 'UNIT_NOT_FOUND' });
    const pre = duelCheck(casterUnit, targetUnit);
    if (!pre.canDuel) return res.status(400).json({ error: 'DUEL_NOT_ALLOWED', reason: pre.reason });
    // Phase B：决斗改事件驱动——resolve-duel 即一次攻击发起，复用 on_attack_start 反应器
    fireReaction('on_attack_start', { caster: casterUnit, target: targetUnit, battle, skillKey: 'DUEL_RESOLUTION' });
    const ctx: any = {
      battleState: battle, caster: casterUnit, target: targetUnit,
      round: battle.round, log: () => {}, broadcast: () => {},
    };
    const r = resolveDuel(ctx, manual_caster, manual_target);
    battleStore.set(battleId, battle); // 触发实时推送：决斗结算（HP 变动）
    return res.json({
      outcome: r.outcome,
      caster_roll: r.casterRoll,
      target_roll: r.targetRoll,
      caster_hp: casterUnit.currentStats?.hp,
      target_hp: targetUnit.currentStats?.hp,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'RESOLVE_DUEL_FAILED', message: err?.message || String(err) });
  }
});

// 抢夺结算（两段式第 2 段）：接受则本次伤害减半 + 获得目标主手武器（仅内存态）
router.post('/api/combat/:battleId/resolve-snatch', (req: any, res: any) => {
  try {
    const { battleId } = req.params;
    const battle = requireBattle(battleId);
    if (!battle) return res.status(404).json({ error: 'BATTLE_NOT_FOUND' });
    // ★ P0 双接收兜底：caster_unit_id ?? casterUnitId / target_unit_id ?? targetUnitId
    const caster_unit_id = req.body?.casterUnitId ?? req.body?.caster_unit_id;
    const target_unit_id = req.body?.targetUnitId ?? req.body?.target_unit_id;
    const { accept } = req.body || {};
    const casterUnit = battle.units.get(String(caster_unit_id));
    const targetUnit = battle.units.get(String(target_unit_id));
    if (!casterUnit || !targetUnit) return res.status(400).json({ error: 'UNIT_NOT_FOUND' });
    const pending = (battle as any).pendingSnatch;
    if (!pending || pending.attackerId !== casterUnit.unitId || pending.targetId !== targetUnit.unitId) {
      return res.status(400).json({ error: 'NO_PENDING_SNATCH' });
    }
    let result: any = { accepted: false };
    if (accept) {
      const ctx: any = {
        battleState: battle, caster: casterUnit, target: targetUnit,
        round: battle.round, log: () => {}, broadcast: () => {},
      };
      result = resolveSnatch(ctx, pending.damage);
      // 把"本次伤害减半"回灌到已写回的目标 HP ★ 统一经 applyHpDelta 同步顶层
      // 减半 = 实际比原伤害少扣 diff，应把少扣的部分加回（diff>0 治疗方向）
      const diff = pending.damage - (result.halvedDamage ?? pending.damage);
      if (diff !== 0) applyHpDelta(targetUnit, diff);
      void casterUnit; void targetUnit;
    }
    (battle as any).pendingSnatch = null;
    battleStore.set(battleId, battle); // 触发实时推送：抢夺结算（HP/清除 pendingSnatch）
    return res.json({
      accepted: Boolean(accept),
      halvedDamage: result.halvedDamage ?? pending.damage,
      success: result.success ?? false,
      target_hp: targetUnit.currentStats?.hp,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'RESOLVE_SNATCH_FAILED', message: err?.message || String(err) });
  }
});

// 援助结算（两段式第 2 段）：瞬移分担 / 反击 / 放弃（10s 超时权威由 resolveCover 内部判定）
router.post('/api/combat/:battleId/resolve-cover', (req: any, res: any) => {
  try {
    const { battleId } = req.params;
    const battle = requireBattle(battleId);
    if (!battle) return res.status(404).json({ error: 'BATTLE_NOT_FOUND' });
    const { choice } = req.body || {};
    const ctx: any = { battleState: battle, log: () => {}, broadcast: () => {} };
    const result = resolveCover(ctx, choice || 'give_up');
    battleStore.set(battleId, battle); // 触发实时推送：援助结算
    return res.json({ resolved: result.resolved, choice: result.choice, shared: result.shared, countered: result.countered });
  } catch (err: any) {
    return res.status(500).json({ error: 'RESOLVE_COVER_FAILED', message: err?.message || String(err) });
  }
});
