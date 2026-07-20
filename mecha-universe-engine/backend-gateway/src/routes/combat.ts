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
    width: bfRow.width || 20,
    height: bfRow.height || 30,
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
  const unitsObj: Record<string, BattleUnit> = {};
  for (const [id, unit] of battle.units) {
    unitsObj[id] = unit;
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
      currentStats: u.currentStats as UnitStats,
      skills: u.skills ?? [],
      statusEffects: u.statusEffects ?? [],
      // 🟢 默认注入标准行动点积木
      actionPoints: u.actionPoints,
    })
  );

  const battle = createBattleState({ id: battleId, map, units });

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

  resetAllActionPoints(battle);
  battle.turn += 1;

  console.log(`[Gateway:3006] [TURN END] 战局 ${battleId} 进入第 ${battle.turn} 回合 | 所有单位行动点已重置`);

  res.json({
    success: true,
    battleId,
    turn: battle.turn,
    message: `进入第 ${battle.turn} 回合，行动点已重置为 { MOVE: 1, ATTACK: 1 }`,
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
    equipment: u?.equipment ?? {},
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
  } = req.body || {};

  if (!skillType) {
    res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'skillType 为必填项' });
    return;
  }

  const battle = battleStore.get(battleId);

  let exeCaster: any;
  let exeTarget: any = null;
  let writeBackTarget: any = null;

  if (casterUnitId) {
    if (!battle) { res.status(404).json({ success: false, error: 'BATTLE_NOT_FOUND' }); return; }
    const u = battle.units.get(String(casterUnitId));
    if (!u) { res.status(404).json({ success: false, error: 'CASTER_UNIT_NOT_FOUND' }); return; }
    exeCaster = toExecutorUnit(u);
  } else if (caster) {
    exeCaster = caster;
  } else {
    res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: '需提供 casterUnitId 或 caster' });
    return;
  }

  if (targetUnitId) {
    if (!battle) { res.status(404).json({ success: false, error: 'BATTLE_NOT_FOUND' }); return; }
    const u = battle.units.get(String(targetUnitId));
    if (!u) { res.status(404).json({ success: false, error: 'TARGET_UNIT_NOT_FOUND' }); return; }
    exeTarget = toExecutorUnit(u);
    writeBackTarget = u;
  } else if (target) {
    exeTarget = target;
  }

  try {
    const executor = getSkillExecutor();
    const result = executor.executeUniversalSkill(
      skillType,
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

    res.json({
      success: true,
      battleId,
      skillType,
      engine: 'combat-service/.cjs',
      result,
    });
  } catch (err: any) {
    console.error(`[Gateway:3006] [SKILL ERROR] 战局 ${battleId}:`, err);
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

  // 从 pendingUnits 中查找并移除
  const pending: any[] = (battle as any).pendingUnits || [];
  const idx = pending.findIndex((u: any) => String(u.id) === String(unit_id));
  if (idx < 0) {
    res.status(404).json({ error: 'UNIT_NOT_IN_POOL', message: '该单位不在部署池中' });
    return;
  }

  // 移除并注入战局
  const [unitData] = pending.splice(idx, 1);
  (battle as any).pendingUnits = pending;

  const deployedUnit = createBattleUnit({
    unitId: String(unitData.id),
    matrixId: unitData.matrixId || unitData.matrix_id || String(unitData.id),
    ownerId: unitData.ownerId || unitData.owner_id || req.auth!.userId,
    position: { q: Number(q), r: Number(r) },
    currentStats: unitData.stats || unit_data?.stats || { attack: 10, defense: 10, mobility: 5, hp: 100 },
    skills: unitData.skills || [],
    statusEffects: [],
    actionPoints: { MOVE: 1, ATTACK: 1 },
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

  // Even-R 六角格子距离
  function hexDist(q1: number, r1: number, q2: number, r2: number): number {
    const dq = q1 - q2; const dr = r1 - r2;
    return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
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

export default router;
