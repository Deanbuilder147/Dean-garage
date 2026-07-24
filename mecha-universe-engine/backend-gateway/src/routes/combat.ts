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
import { get } from '../db/sqlite.js';
import {
  createBattleUnit,
  createBattleState,
  consumeActionPoint,
  hasActionPoints,
  resetAllActionPoints,
} from '../battleStateFactory.js';
import { BattlePhase } from '@mecha/shared-kernel';
import type { BattleState, BattleUnit, HexCoord, UnitStats } from '@mecha/shared-kernel';
import { getSkillExecutor } from '../combatBridge.js';
import { terrainCost } from './terrainCosts.js';

const router = Router();

// ============================================
// 内存战局存储（Phase 29-P2: 后续迁移至 Redis/PostgreSQL）
// ============================================

const battleStore = new Map<string, BattleState>();

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

router.post('/api/combat', authenticate, (req: Request, res: Response) => {
  const { battlefield_id } = req.body || {};

  if (!battlefield_id) {
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
    width: 100,
    height: 100,
    cells: JSON.parse(bfRow.cells || '[]'),
    spawn_points: JSON.parse(bfRow.spawn_points || '[]'),
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
  });

  battleStore.set(battleId, battle);

  console.log(`[Gateway:3006] [BATTLE CREATE] 战局 ${battleId} 已创建 | battlefield=${battlefield_id} (${bfRow.name}) | 地图尺寸: ${bfRow.width}×${bfRow.height} | user=${req.auth?.username || '?'}`);

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
router.post('/api/combat/:battleId/victory-conditions', authenticate, (req: Request, res: Response) => {
  const { battleId } = req.params;
  const conditions = req.body;

  const battle = battleStore.get(battleId);
  if (!battle) {
    res.status(404).json({ error: 'BATTLE_NOT_FOUND', message: `战局 ${battleId} 不存在` });
    return;
  }

  // 将胜利条件挂载到 battle 元数据上
  (battle as any).victoryConditions = conditions;

  console.log(`[Gateway:3006] [VICTORY CONDS] 战局 ${battleId} 胜利条件已绑定:`, JSON.stringify(conditions));

  res.json({ success: true, battleId, victoryConditions: conditions });
});

/**
 * POST /api/combat/:battleId/ace-unit
 * 绑定当前战局的玩家 ACE 专属机体
 *
 * 前端调用: combatAPI.setAceUnit(battleId, { faction, unit_id })
 */
router.post('/api/combat/:battleId/ace-unit', authenticate, (req: Request, res: Response) => {
  const { battleId } = req.params;
  const { faction, unit_id } = req.body || {};

  if (!faction || !unit_id) {
    res.status(400).json({ error: 'VALIDATION_ERROR', message: 'faction 和 unit_id 为必填项' });
    return;
  }

  const battle = battleStore.get(battleId);
  if (!battle) {
    res.status(404).json({ error: 'BATTLE_NOT_FOUND', message: `战局 ${battleId} 不存在` });
    return;
  }

  // 初始化 ACE 存储并绑定
  if (!(battle as any).aceUnits) {
    (battle as any).aceUnits = {};
  }
  (battle as any).aceUnits[faction] = unit_id;

  console.log(`[Gateway:3006] [ACE UNIT] 战局 ${battleId} ACE 已绑定: faction=${faction}, unitId=${unit_id}`);

  res.json({ success: true, battleId, aceUnits: (battle as any).aceUnits });
});

/**
 * POST /api/combat/:battleId/pending-units
 * 注入战前整备完成的待部署单位池
 *
 * 前端调用: combatAPI.setPendingUnits(battleId, { units: [...] })
 */
router.post('/api/combat/:battleId/pending-units', authenticate, (req: Request, res: Response) => {
  const { battleId } = req.params;
  const { units: rawUnits } = req.body || {};

  if (!rawUnits || !Array.isArray(rawUnits)) {
    res.status(400).json({ error: 'VALIDATION_ERROR', message: 'units 数组为必填项' });
    return;
  }

  const battle = battleStore.get(battleId);
  if (!battle) {
    res.status(404).json({ error: 'BATTLE_NOT_FOUND', message: `战局 ${battleId} 不存在` });
    return;
  }

  // 将待部署单位存入沙盒（deploy 阶段正式注入战场坐标）
  (battle as any).pendingUnits = rawUnits;

  console.log(`[Gateway:3006] [PENDING UNITS] 战局 ${battleId} 已接收 ${rawUnits.length} 个待部署单位`);

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
  const battle = battleStore.get(battleId);

  if (!battle) {
    res.status(404).json({ error: 'BATTLE_NOT_FOUND', message: `战局 ${battleId} 不存在` });
    return;
  }

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
    activeFaction: battle.activeFaction || '',
    activeFactionIndex: battle.activeFactionIndex || 0,
    round: battle.round || 1,
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

  const units: BattleUnit[] = rawUnits.map((u: any) =>
    createBattleUnit({
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
      name: u.name,
      codename: u.codename,
      unitCode: u.unitCode ?? u.codename,
      type: u.type,
      viewUrls: (() => { const v = safeParseValue(u.view_urls ?? u.viewUrls); return (v && typeof v === 'object') ? v : undefined })(),
    })
  );

  const battle = createBattleState({
    id: battleId,
    map,
    units,
    factionTurnOrder: (req.body && Array.isArray(req.body.factionTurnOrder)) ? req.body.factionTurnOrder as string[] : [],
  });

  battleStore.set(battleId, battle);

  console.log(`[Gateway:3006] [BATTLE INIT] 战局 ${battleId} 已初始化，${units.length} 个单位就位 | action_points: { MOVE: 1, ATTACK: 1 }`);

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

  const battle = battleStore.get(battleId);
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

  console.log(`[Gateway:3006] [ACTION POINT] ${unitId} 消耗 ${action} ×${amount} | 剩余: ${JSON.stringify(unit.action_points)}`);

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

  const battle = battleStore.get(battleId);
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

  const battle = battleStore.get(battleId);
  if (!battle) {
    res.status(404).json({ error: 'BATTLE_NOT_FOUND' });
    return;
  }

  const order = battle.factionTurnOrder || [];
  if (order.length === 0) {
    // 兼容旧战局（无阵营顺序）：退化为全重置 + turn+1
    resetAllActionPoints(battle);
    battle.turn += 1;
    return res.json({
      success: true,
      battleId,
      turn: battle.turn,
      round: battle.round,
      activeFaction: battle.activeFaction,
      message: '无阵营顺序配置，行动点已统一重置',
    });
  }

  const idx = battle.activeFactionIndex || 0;
  const nextIdx = (idx + 1) % order.length;
  const isNewRound = nextIdx === 0;

  if (isNewRound) {
    // 最后一个活跃阵营结束 → 进入下一 Round，统一重置场上所有单位 AP
    battle.round += 1;
    resetAllActionPoints(battle);
  }
  // 单阵营结束：不重置 AP，仅切换 activeFaction

  battle.activeFactionIndex = nextIdx;
  battle.activeFaction = order[nextIdx] || '';
  battle.turn += 1;

  console.log(`[Gateway:3006] [TURN END] 战局 ${battleId} 阵营切换 → ${order[nextIdx]} | Round ${battle.round} | ${isNewRound ? '统一重置AP' : '仅切换阵营'}`);

  res.json({
    success: true,
    battleId,
    turn: battle.turn,
    round: battle.round,
    activeFaction: battle.activeFaction,
    activeFactionIndex: nextIdx,
    factionTurnOrder: order,
    message: isNewRound
      ? `进入第 ${battle.round} 轮，行动点已统一重置`
      : `切换到阵营 ${order[nextIdx]}`,
  });
});

/**
 * Phase 29-P2: 伤害计算端点（技能测试 / 正式伤害管道）
 */
router.post('/api/combat/:battleId/damage', async (req: Request, res: Response) => {
  const { battleId } = req.params;
  const { caster, target, clauses } = req.body;

  const battle = battleStore.get(battleId);
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
    console.error(`[Gateway:3006] [DAMAGE ERROR] 战局 ${battleId}:`, err);
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
    max_hp: s.maxHp ?? s.maxHp ?? s.hp ?? 0,
    attack: s.attack ?? 0,
    melee: s.attack ?? s.melee ?? 0,
    ranged: s.attack ?? s.ranged ?? 0,
    defense: s.defense ?? 0,
    shield: s.shield ?? 0,
    mobility: s.mobility ?? 0,
    faction: u?.ownerId ?? u?.faction ?? 'neutral',
    evasion_mod: s.evasion_mod ?? 0,
    accuracy_mod: s.accuracy_mod ?? 0,
    equipment: u?.equipment ?? {},
    equipState: u?.equipState ?? [],
    has_moved: u?.has_moved ?? false,
    stealth: u?.stealth ?? false,
    z: u?.z ?? u?.height ?? 0,
    height: u?.height ?? 0,
    skills: u?.skills ?? [],
  };
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
// ============================================
// ★ 阶段 B·审计报告 #2/#3 修复：技能施放范围解析
// 从多方解析技能施放范围 { max, min }（max=最大射程, min=最小施放距离 min_cast_range）：
//   1) 请求体 skillDefinition（前端若显式携带）
//   2) 施法者已拥有技能 exeCaster.skills（前端发 UUID skill_id，单位 skills 可能用 key）
//   3) 均无法解析 → 返回 null（调用方跳过校验，安全默认，不阻断合法请求）
// 字段名兼容 glossary 原始命名(max_range/cast_range/min_cast_range/min_range) 与归一化命名(range/range_max/range_min)。
// ============================================
function resolveSkillRange(
  skillKey: any,
  skillId: any,
  exeCaster: any,
  skillDefinition: any,
): { max: number; min: number } | null {
  const MAX_FIELDS = ['max_range', 'cast_range', 'range_max', 'range'];
  const MIN_FIELDS = ['min_cast_range', 'min_range', 'range_min'];
  const pickNum = (def: any, fields: string[]): number | undefined => {
    if (!def) return undefined;
    for (const f of fields) {
      const v = def[f];
      if (v === undefined || v === null) continue;
      if (typeof v === 'number') return v;
      if (typeof v === 'string') {
        const nums = String(v).split(/[-~]/).map(Number).filter(n => !isNaN(n));
        if (nums.length) return Math.max(...nums);
      }
    }
    return undefined;
  };
  // 1) 请求体携带的 skillDefinition
  let max = pickNum(skillDefinition, MAX_FIELDS);
  let min = pickNum(skillDefinition, MIN_FIELDS);
  // 2) 施法者已拥有技能（按 UUID id 或 glossary key 匹配）
  if (max === undefined) {
    const owned = (exeCaster?.skills || []).find((s: any) =>
      s && (s.id === skillId || s.id === skillKey || s.key === skillKey || s.skill_key === skillKey),
    );
    if (owned) {
      max = pickNum(owned, MAX_FIELDS);
      if (min === undefined) min = pickNum(owned, MIN_FIELDS);
    }
  }
  if (max === undefined) return null;
  return { max, min: min || 0 };
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
  } = req.body || {};

  // skillType 可由前端 skill_id（UUID）或 attack_type（melee/ranged）兜底
  const skillKey = skillType || skill_id || attack_type || null;

  if (!skillKey) {
    res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'skillType 为必填项' });
    return;
  }

  const battle = battleStore.get(battleId);

  let exeCaster: any;
  let exeTarget: any = null;
  let writeBackTarget: any = null;
  let casterBattleUnit: any = null;

  const casterId = casterUnitId || attacker_id;
  const targetId = targetUnitId || target_id;

  if (casterId) {
    if (!battle) { res.status(404).json({ success: false, error: 'BATTLE_NOT_FOUND' }); return; }
    const u = battle.units.get(String(casterId));
    if (!u) { res.status(404).json({ success: false, error: 'CASTER_UNIT_NOT_FOUND' }); return; }
    exeCaster = toExecutorUnit(u);
    casterBattleUnit = u;
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

  // ===== 阶段 B·审计报告 #2/#3：施放距离 + 最小施放距离校验（Even-R Offset 距离）=====
  // 网关层权威拦截：距离 > 最大射程 → OUT_OF_RANGE；距离 < 最小施放距离(min_cast_range) → BELOW_MIN_RANGE。
  // 无目标(自身/地图技能)或无法解析射程时跳过校验（安全默认）。基础攻击(melee/ranged)射程取单位基础 range。
  if (exeCaster && exeTarget && typeof exeCaster.q === 'number' && typeof exeTarget.q === 'number') {
    const dist = hexDistanceOffset(exeCaster.q, exeCaster.r, exeTarget.q, exeTarget.r);
    let range = resolveSkillRange(skillKey, skill_id, exeCaster, skillDefinition);
    if (range === null && (attack_type === 'melee' || attack_type === 'ranged')) {
      const basic = casterBattleUnit?.currentStats?.range;
      if (typeof basic === 'number') range = { max: basic, min: 0 };
    }
    if (range) {
      if (dist > range.max) {
        res.status(400).json({
          success: false, error: 'OUT_OF_RANGE',
          message: `目标距离 ${dist} 超出射程 ${range.max}`, distance: dist, maxRange: range.max,
        });
        return;
      }
      if (dist < range.min) {
        res.status(400).json({
          success: false, error: 'BELOW_MIN_RANGE',
          message: `目标距离 ${dist} 小于最小施放距离 ${range.min}`, distance: dist, minRange: range.min,
        });
        return;
      }
    }
  }

  try {
    const executor = getSkillExecutor();
    const result = executor.executeUniversalSkill(
      skillKey,
      exeCaster,
      exeTarget,
      {
        ...(context || {}),
        allUnits: battle ? Array.from(battle.units.values()).map(toExecutorUnit) : (context?.allUnits || []),
        battleState: battle || context?.battleState || null,
      },
      skillDefinition || null,
    );

    // 回写伤害/治疗到内存战局目标单位
    if (writeBackTarget && result && result.triggered !== false) {
      const st = writeBackTarget.currentStats || (writeBackTarget.currentStats = {});
      if (typeof result.final_damage === 'number' && result.final_damage > 0) {
        st.hp = Math.max(0, (st.hp ?? 0) - result.final_damage);
      }
      if (typeof result.heal_amount === 'number' && result.heal_amount > 0) {
        const maxHp = st.maxHp ?? st.hp ?? 0;
        st.hp = Math.min(maxHp, (st.hp ?? 0) + result.heal_amount);
      }
    }

    // 反击伤害写回施法者（仅当施法者取自战局单位）
    if (casterBattleUnit && result && result.counter_triggered && result.counter_damage > 0) {
      const cst = casterBattleUnit.currentStats || (casterBattleUnit.currentStats = {});
      cst.hp = Math.max(0, (cst.hp ?? 0) - result.counter_damage);
    }

    res.json({
      success: true,
      battleId,
      skillType: skillKey,
      engine: 'combat-service/.cjs',
      result,
    });
  } catch (err: any) {
    console.error(`[Gateway:3006] [SKILL ERROR] 战局 ${battleId}:`, err);
    res.status(500).json({ success: false, error: String(err?.message || err) });
  }
});

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
    context,
  } = req.body || {};

  if (!attacker_id) {
    res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'attacker_id 为必填项' });
    return;
  }

  const battle = battleStore.get(battleId);
  if (!battle) { res.status(404).json({ success: false, error: 'BATTLE_NOT_FOUND' }); return; }

  const casterUnit = battle.units.get(String(attacker_id));
  if (!casterUnit) { res.status(404).json({ success: false, error: 'CASTER_UNIT_NOT_FOUND' }); return; }
  const exeCaster = toExecutorUnit(casterUnit);

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
    if (!skill_id) {
      res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: '技能攻击需提供 skill_id' });
      return;
    }
    // 从施法者已拥有技能(含 UUID id 与 glossary key)映射出可执行 key
    const owned = (exeCaster.skills || []).find((s: any) => s.id === skill_id);
    skillKey = owned?.key || owned?.skill_key || skill_id;
  } else {
    const at = attack_type === 'ranged' ? 'ranged' : 'melee';
    skillKey = at;
    const rangeVal = casterUnit.currentStats?.range ?? (at === 'ranged' ? 2 : 1);
    // 内联基础攻击定义，驱动 .cjs executeUniversalSkill 计算伤害（base_damage 取单位近战/远程值）
    inlineDef = {
      type: 'active',
      label: at === 'ranged' ? '远程攻击' : '近战攻击',
      category: at,
      action_type: 'attack',
      attack_stat: at,
      damage_kind: 'kinetic',
      cast_range: rangeVal,
      max_range: rangeVal,
      min_cast_range: casterUnit?.currentStats?.min_range ?? 0,
      min_range: casterUnit?.currentStats?.min_range ?? 0,
      base_damage: at === 'ranged'
        ? (exeCaster.ranged || exeCaster.attack || 0)
        : (exeCaster.melee || exeCaster.attack || 0),
      dice_type: '1d6',
      success_line: 4,
      success_bonus_damage: 0,
      is_manual_roll: false,
      target_filter: 'enemy',
      requires_hit: true,
      height_bonus_enabled: true,
    };
  }

  // ===== #2/#3 距离 + 最小距离校验（与 /skill 一致）=====
  if (exeCaster && exeTarget && typeof exeCaster.q === 'number' && typeof exeTarget.q === 'number') {
    const dist = hexDistanceOffset(exeCaster.q, exeCaster.r, exeTarget.q, exeTarget.r);
    let range = resolveSkillRange(skillKey, skill_id, exeCaster, inlineDef);
    if (range === null && (skillKey === 'melee' || skillKey === 'ranged')) {
      const basic = casterUnit.currentStats?.range;
      if (typeof basic === 'number') range = { max: basic, min: casterUnit?.currentStats?.min_range ?? 0 };
    }
    if (range) {
      if (dist > range.max) {
        res.status(400).json({
          success: false, error: 'OUT_OF_RANGE',
          message: `目标距离 ${dist} 超出射程 ${range.max}`, distance: dist, maxRange: range.max,
        });
        return;
      }
      if (dist < range.min) {
        res.status(400).json({
          success: false, error: 'BELOW_MIN_RANGE',
          message: `目标距离 ${dist} 小于最小施放距离 ${range.min}`, distance: dist, minRange: range.min,
        });
        return;
      }
    }
  }

  try {
    const executor = getSkillExecutor();
    const result = executor.executeUniversalSkill(
      skillKey,
      exeCaster,
      exeTarget,
      {
        ...(context || {}),
        allUnits: Array.from(battle.units.values()).map(toExecutorUnit),
        battleState: battle,
      },
      inlineDef || null,
    );

    // 回写伤害/治疗到内存战局目标单位（前端 refreshState 会重新拉取生效）
    if (writeBackTarget && result && result.triggered !== false) {
      const st = writeBackTarget.currentStats || (writeBackTarget.currentStats = {});
      if (typeof result.final_damage === 'number' && result.final_damage > 0) {
        st.hp = Math.max(0, (st.hp ?? 0) - result.final_damage);
      }
      if (typeof result.heal_amount === 'number' && result.heal_amount > 0) {
        const maxHp = st.maxHp ?? st.hp ?? 0;
        st.hp = Math.min(maxHp, (st.hp ?? 0) + result.heal_amount);
      }
    }

    // 反击伤害写回攻击者（前端 refreshState 重新拉取生效）
    if (casterUnit && result && result.counter_triggered && result.counter_damage > 0) {
      const cst = casterUnit.currentStats || (casterUnit.currentStats = {} as any);
      cst.hp = Math.max(0, (cst.hp ?? 0) - result.counter_damage);
    }

    // 响应结构对齐前端消费（combat_result.final_damage / surprise_triggered）
    res.json({
      success: true,
      combat_result: {
        triggered: result?.triggered ?? true,
        final_damage: result?.final_damage ?? 0,
        dodged: result?.dodged ?? false,
        counter_triggered: result?.counter_triggered ?? false,
        counter_damage: result?.counter_damage ?? 0,
        attack_type: result?.attack_type,
        attack_stat: result?.attack_stat,
        damage_kind: result?.damage_kind,
        dice: result?.dice ?? null,
        message: result?.message ?? '',
      },
      skill_id: skill_id ?? null,
      surprise_triggered: false,
      engine: 'combat-service/.cjs',
    });
  } catch (err: any) {
    console.error(`[Gateway:3006] [ATTACK ERROR] 战局 ${battleId}:`, err);
    res.status(500).json({ success: false, error: String(err?.message || err) });
  }
});

// ============================================
// ★ Phase 30-Deploy: 单位部署端点 — 将 pendingUnit 注入战场
// ============================================

/**
 * POST /api/combat/:battleId/deploy-unit
 * 在部署阶段将单位放在六角格 (q,r) 坐标上
 * 前端 NewBattleView.deployToHex → combatAPI.deployUnit
 */
router.post('/api/combat/:battleId/deploy-unit', authenticate, (req: Request, res: Response) => {
  const { battleId } = req.params;
  const { unit_id, q, r, unit_data } = req.body || {};

  if (!unit_id || q === undefined || r === undefined) {
    console.error('[DEPLOY-UNIT] 400 拦截: 缺必填参数 | req.body=', JSON.stringify(req.body));
    res.status(400).json({ error: 'VALIDATION_ERROR', message: 'unit_id, q, r 为必填项' });
    return;
  }

  const battle = battleStore.get(battleId);
  if (!battle) {
    res.status(404).json({ error: 'BATTLE_NOT_FOUND', message: `战局 ${battleId} 不存在` });
    return;
  }

  // 从 pendingUnits 中查找并移除；找不到时回退到请求体 unit_data
  // （覆盖：前端回退池 / pending-units 静默失败 / 重复部署场景）
  const pending: any[] = (battle as any).pendingUnits || [];
  const idx = pending.findIndex((u: any) => String(u.id) === String(unit_id));
  let unitData: any;
  if (idx >= 0) {
    [unitData] = pending.splice(idx, 1);
    (battle as any).pendingUnits = pending;
  } else if (unit_data) {
    unitData = unit_data;
    console.warn(`[DEPLOY-UNIT] 单位 ${unit_id} 不在部署池，回退使用请求体 unit_data 创建`);
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
    actionPoints: { MOVE: 1, ATTACK: 1 },
    // Phase 30-Cover: 战场端渲染补全字段（faction/name/codename/type + 七视图 viewUrls）
    faction: unitData.faction ?? unit_data?.faction,
    name: unitData.name ?? unit_data?.name,
    codename: unitData.codename ?? unit_data?.codename,
    unitCode: unitData.unitCode ?? unitData.codename ?? unit_data?.unitCode ?? unit_data?.codename,
    type: unitData.type ?? unit_data?.type,
    viewUrls,
    // 阶段二：传入归一化部件以构建装备耐久/独立 HP 状态
    parts: safeParseValue(unitData.attributes)?.parts ?? safeParseValue(unit_data?.attributes)?.parts,
  });

  battle.units.set(String(unit_id), deployedUnit);

  console.log(`[Gateway:3006] [DEPLOY] 单位 ${unit_id} 部署到 (${q},${r}) | 战局 ${battleId} | 池剩余 ${pending.length}`);

  res.json({
    success: true,
    battleId,
    unitId: unit_id,
    position: { q, r },
    poolRemaining: pending.length,
  });
});

/**
 * POST /api/combat/:battleId/end-deployment
 * 结束部署阶段，切换到战斗阶段
 */
router.post('/api/combat/:battleId/end-deployment', authenticate, (req: Request, res: Response) => {
  const { battleId } = req.params;

  const battle = battleStore.get(battleId);
  if (!battle) {
    res.status(404).json({ error: 'BATTLE_NOT_FOUND', message: `战局 ${battleId} 不存在` });
    return;
  }

  battle.phase = BattlePhase.COMBAT;
  battle.turn = 1;
  battle.round = 1;
  battle.activeFactionIndex = 0;
  battle.activeFaction = (battle.factionTurnOrder && battle.factionTurnOrder[0]) || '';

  console.log(`[Gateway:3006] [DEPLOY END] 战局 ${battleId} 部署阶段结束 → 进入战斗 | ${battle.units.size} 个单位`);

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

  const battle = battleStore.get(battleId);
  if (!battle) {
    res.status(404).json({ error: 'BATTLE_NOT_FOUND', message: `战局 ${battleId} 不存在` });
    return;
  }

  const pendingUnits = (battle as any).pendingUnits || [];

  console.log(`[Gateway:3006] [DEPLOY POOL] 战局 ${battleId} 返回 ${pendingUnits.length} 个待部署单位`);

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

  const battle = battleStore.get(battleId);
  if (!battle) {
    res.status(404).json({ error: 'BATTLE_NOT_FOUND', message: `战局 ${battleId} 不存在` });
    return;
  }

  const conditions = (battle as any).victoryConditions || null;

  console.log(`[Gateway:3006] [GET VICTORY CONDS] 战局 ${battleId}`, conditions ? '有胜利条件' : '(空)');

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

  const battle = battleStore.get(battleId);
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

  console.log(`[Gateway:3006] [FACTION CDs] 战局 ${battleId} 冷却状态:`, JSON.stringify(cooldowns));

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

  const battle = battleStore.get(battleId);
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

  console.log(`[Gateway:3006] [CD TICK] 战局 ${battleId} 全阵营冷却递减完成`);

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

  const battle = battleStore.get(battleId);
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

  console.log(`[Gateway:3006] [BEAM HITS] 战局 ${battleId} 射线命中 ${hits.length} 个单位`);

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
  const battle = battleStore.get(battleId);
  if (!battle) return res.status(404).json({ error: 'BATTLE_NOT_FOUND' });

  if (actionType === 'deploy_royroy') {
    const { unit_id, q, r } = params;
    const host = battle.units.get(String(unit_id));
    if (!host) return res.status(404).json({ error: 'UNIT_NOT_FOUND' });
    const roy = host.royroy;
    if (!roy) return res.status(400).json({ error: 'NO_ROYROY', message: '该单位无 Royroy' });
    if (roy.status === 'destroyed') return res.status(400).json({ error: 'ROYROY_DESTROYED', message: 'Royroy 已损毁，本局不可再部署' });
    if (roy.deployed) return res.status(400).json({ error: 'ALREADY_DEPLOYED' });
    if ((roy.cooldownRound ?? 0) > battle.round) return res.status(400).json({ error: 'COOLDOWN', message: `冷却中，第 ${roy.cooldownRound} 轮后可再部署` });
    if (roy.hp <= 0) return res.status(400).json({ error: 'HP_ZERO' });
    // 行动阶段门控：宿主须为当前 activeFaction
    if (battle.activeFaction && host.faction !== battle.activeFaction) {
      return res.status(400).json({ error: 'NOT_YOUR_TURN', message: `当前行动阵营为 ${battle.activeFaction}` });
    }
    const target = { q: Number(q), r: Number(r) };
    const cells = new Set((battle.map?.cells || []).map((c: any) => `${c.q},${c.r}`));
    if (!cells.has(`${target.q},${target.r}`)) return res.status(400).json({ error: 'INVALID_CELL' });
    if (hexDist(host.position, target) !== 1) return res.status(400).json({ error: 'NOT_ADJACENT', message: 'Royroy 必须部署在主机相邻格' });
    const occupied = new Set<string>();
    for (const u of battle.units.values()) if (u.position) occupied.add(`${u.position.q},${u.position.r}`);
    for (const u of battle.units.values()) if (u.royroy?.deployed && u.royroy.q !== undefined) occupied.add(`${u.royroy.q},${u.royroy.r}`);
    if (occupied.has(`${target.q},${target.r}`)) return res.status(400).json({ error: 'CELL_OCCUPIED' });
    // 部署：不消耗任何 AP
    roy.deployed = true;
    roy.status = 'deployed';
    roy.q = target.q;
    roy.r = target.r;
    return res.json({ success: true, actionType, unit_id, royroy: roy, battleId });
  }

  if (actionType === 'retrieve_royroy') {
    const { unit_id } = params;
    const host = battle.units.get(String(unit_id));
    if (!host) return res.status(404).json({ error: 'UNIT_NOT_FOUND' });
    const roy = host.royroy;
    if (!roy) return res.status(400).json({ error: 'NO_ROYROY' });
    if (roy.status === 'destroyed') return res.status(400).json({ error: 'ROYROY_DESTROYED' });
    if (!roy.deployed) return res.status(400).json({ error: 'NOT_DEPLOYED' });
    if (roy.hp <= 0) return res.status(400).json({ error: 'HP_ZERO', message: 'HP 为 0 不可回收' });
    if (battle.activeFaction && host.faction !== battle.activeFaction) {
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
    return res.json({ success: true, actionType, unit_id, royroy: roy, cooldownRound: roy.cooldownRound, battleId });
  }

  if (actionType === 'damage_royroy') {
    const { unit_id, dmg } = params;
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
      return res.json({ success: true, actionType, unit_id, destroyed: true, royroy: roy, battleId });
    }
    return res.json({ success: true, actionType, unit_id, destroyed: false, royroy: roy, battleId });
  }

  return res.status(400).json({ error: 'UNKNOWN_ACTION', message: `未知 actionType: ${actionType}` });
});

router.post('/api/combat/:battleId/move', authenticate, (req: Request, res: Response) => {
  try {
    const battleId = req.params.battleId;
    const { unit_id, target_q, target_r } = req.body || {};
    const state = battleStore.get(battleId);
    if (!state) return res.status(404).json({ error: 'BATTLE_NOT_FOUND' });
    const unit = state.units.get(String(unit_id));
    if (!unit) return res.status(404).json({ error: 'UNIT_NOT_FOUND' });

    // 阵营轮转门控：仅当前 activeFaction 的单位可移动
    if (state.activeFaction && unit.faction !== state.activeFaction) {
      return res.status(400).json({ error: 'NOT_YOUR_TURN', message: `当前行动阵营为 ${state.activeFaction}` });
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
    let movementRange = Math.max(1, Math.round(Number(rawMob)));

    const path = tsFindPath(
      state,
      { q: from.q, r: from.r, unitId: unit.unitId },
      { q: target_q, r: target_r },
      movementRange,
    );
    if (!path) return res.status(400).json({ error: 'OUT_OF_RANGE' });

    unit.position = { q: target_q, r: target_r };

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

    res.json({
      success: true,
      unit_id,
      from,
      to: { q: target_q, r: target_r },
      path,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'MOVE_FAILED', message: err?.message || String(err) });
  }
});

export default router;
