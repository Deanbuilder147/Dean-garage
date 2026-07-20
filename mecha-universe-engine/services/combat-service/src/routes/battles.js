/**
 * battles.js - 战场路由
 * 
 * 处理部署、移动、攻击、回合管理等 API 端点。
 * 使用 UnitConverter 将 hangar 棋子数据转换为战斗单位格式。
 * 移动校验使用 BFS 寻路考虑地形代价。
 */
import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { BattleState, hexDistance } from '../state/battleState.js';
import UnitConverter from '../services/unitConverter.js';
import { CombatResolver } from '../services/combatResolver.js';
import { getGlossaryConfig, saveGlossaryConfig } from '../services/combatCore/configLoader.cjs';

const router = Router();
const combatResolver = new CombatResolver();

// ============================================================
// 战场管理
// ============================================================

/**
 * GET /api/combat - 列出所有战场
 */
router.get('/', authenticate, (req, res) => {
  const battles = BattleState.listBattles();
  res.json({ battles });
});

/**
 * POST /api/combat - 创建新战场
 */
router.post('/', authenticate, (req, res) => {
  const { name, width, height, fogOfWar, terrain, cells } = req.body;

  const id = `battle_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const battle = BattleState.createBattle(id, {
    name: name || 'New Battle',
    width: width || 15,
    height: height || 10,
    fogOfWar: fogOfWar || false,
    terrain,
    cells
  });

  res.status(201).json({ success: true, battle });
});

/**
 * GET /api/combat/:id/state - 获取战场完整状态
 */
router.get('/:id/state', authenticate, (req, res) => {
  const state = BattleState.getBattle(req.params.id);
  if (!state) return res.status(404).json({ error: '战场不存在' });
  res.json(state);
});

// ============================================================
// 词条库配置（必须放在 /:id 路由之前，避免 "glossary-config" 被当作 :id）
// ============================================================

/**
 * GET /api/combat/glossary-config - 获取词条库配置（真实数据链路）
 */
router.get('/glossary-config', authenticate, (req, res) => {
  const config = getGlossaryConfig();
  if (!config) return res.status(500).json({ error: '词条库配置文件读取失败' });
  res.json({ success: true, ...config });
});

/**
 * POST /api/combat/glossary-config - 保存词条库配置（写入真实 JSON 文件）
 */
router.post('/glossary-config', authenticate, (req, res) => {
  const config = req.body;
  const saved = saveGlossaryConfig(config);
  if (saved) {
    console.log('[glossary-config] 词条库配置已写入磁盘, 词条数:', Object.keys(config.skills || {}).length);
    res.json({ success: true, message: `配置已保存 (${Object.keys(config.skills || {}).length} 个词条)` });
  } else {
    res.status(500).json({ error: '词条库配置文件写入失败' });
  }
});

// ============================================================
// 部署阶段
// ============================================================

/**
 * POST /api/combat/:id/deploy-unit - 部署单位到战场
 * 
 * 支持两种模式：
 * 1. 自动从格纳库获取棋子数据（只需提供 unit_id, q, r）
 * 2. 手动提供完整 unit_data（前端已经持有棋子数据时）
 */
router.post('/:id/deploy-unit', authenticate, async (req, res) => {
  try {
    const state = BattleState.getBattle(req.params.id);
    if (!state) return res.status(404).json({ error: '战场不存在' });
    if (state.phase !== 'deploy') return res.status(400).json({ error: '当前不是部署阶段' });

    const { unit_id, q, r, unit_data } = req.body;

    if (!unit_id) return res.status(400).json({ error: '缺少 unit_id' });
    if (q === undefined || r === undefined) return res.status(400).json({ error: '缺少部署坐标 q 或 r' });

    // 尝试构建战斗单位数据
    let combatUnit = null;

    // 方式1: 前端已提供完整转换数据
    if (unit_data && typeof unit_data === 'object') {
      combatUnit = {
        ...unit_data,
        id: unit_id,
        unit_id: unit_id,
        q, r,
        player_id: req.user?.id || 0,
        hp: unit_data.hp || unit_data.max_hp || 100,
        max_hp: unit_data.max_hp || unit_data.hp || 100,
        has_acted: false,
        has_moved: false,
        direction: unit_data.direction ?? 0,  // Phase 28-D: 初始正面特写
        buffs: []
      };
    }

    // 方式2: 从格纳库服务获取数据并使用 UnitConverter 转换
    if (!combatUnit) {
      try {
        const hangarUrl = process.env.HANGAR_SERVICE_URL || 'http://localhost:3002';
        const hangarRes = await fetch(`${hangarUrl}/api/hangar/units/${unit_id}`);

        if (hangarRes.ok) {
          const hangarUnit = await hangarRes.json();
          combatUnit = UnitConverter.convert(hangarUnit, {
            q, r,
            player_id: req.user?.id || 0
          });
        }
      } catch (e) {
        console.warn('[deploy-unit] 无法从格纳库获取棋子数据:', e.message);
      }
    }

    // 回退：创建基本占位单位（仅在无法获取任何数据时）
    if (!combatUnit) {
      console.warn(`[deploy-unit] 单位 ${unit_id} 无可用数据，使用默认值`);
      combatUnit = {
        id: unit_id,
        unit_id: unit_id,
        name: `Unit ${unit_id}`,
        player_id: req.user?.id || 0,
        q, r,
        hp: 100,
        max_hp: 100,
        attack: 12,
        melee: 12,
        ranged: 0,
        defense: 6,
        mobility: 3,
        weaponType: 'kinetic',
        armorType: 'normal',
        shield: 0,
        level: 1,
        faction: 'earth',
        direction: 0,   // Phase 28-D: 默认正面特写
        has_acted: false,
        has_moved: false,
        buffs: [],
        skills: []
      };
    }

    // 执行部署
    const result = BattleState.deployUnit(req.params.id, combatUnit);
    res.json(result);

  } catch (err) {
    console.error('[deploy-unit] 错误:', err.message);
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/combat/:id/deploy-units - 批量部署单位
 */
router.post('/:id/deploy-units', authenticate, async (req, res) => {
  try {
    const state = BattleState.getBattle(req.params.id);
    if (!state) return res.status(404).json({ error: '战场不存在' });

    const { units } = req.body;
    if (!Array.isArray(units)) return res.status(400).json({ error: 'units 必须是数组' });

    const results = [];
    const errors = [];

    for (const deployReq of units) {
      try {
        const { unit_id, q, r, unit_data } = deployReq;
        let combatUnit = null;

        if (unit_data && typeof unit_data === 'object') {
          combatUnit = {
            ...unit_data,
            id: unit_id,
            unit_id: unit_id,
            q, r,
            direction: unit_data.direction ?? 0,  // Phase 29-C: 补齐批量部署朝向状态兜底
            player_id: req.user?.id || 0,
            hp: unit_data.hp || unit_data.max_hp || 100,
            max_hp: unit_data.max_hp || unit_data.hp || 100,
            has_acted: false,
            has_moved: false,
            buffs: []
          };
        }

        if (!combatUnit) {
          try {
            const hangarUrl = process.env.HANGAR_SERVICE_URL || 'http://localhost:3002';
            const hangarRes = await fetch(`${hangarUrl}/api/hangar/units/${unit_id}`);
            if (hangarRes.ok) {
              const hangarUnit = await hangarRes.json();
              combatUnit = UnitConverter.convert(hangarUnit, {
                q, r,
                player_id: req.user?.id || 0
              });
            }
          } catch (e) {
            console.warn('[deploy-units] 无法从格纳库获取棋子:', unit_id, e.message);
          }
        }

        if (!combatUnit) {
          errors.push({ unit_id, error: '无法获取单位数据' });
          continue;
        }

        const result = BattleState.deployUnit(req.params.id, combatUnit);
        results.push(result);
      } catch (e) {
        errors.push({ unit_id: deployReq.unit_id, error: e.message });
      }
    }

    res.json({ success: errors.length === 0, results, errors, totalUnits: state.units.length });
  } catch (err) {
    console.error('[deploy-units] 错误:', err.message);
    res.status(400).json({ error: err.message });
  }
});

// ============================================================
// 战斗阶段
// ============================================================

/**
 * POST /api/combat/:id/move - 移动单位（BFS 地形代价校验）
 */
router.post('/:id/move', authenticate, (req, res) => {
  try {
    const { unit_id, q, r } = req.body;

    if (!unit_id) return res.status(400).json({ error: '缺少 unit_id' });
    if (q === undefined || r === undefined) return res.status(400).json({ error: '缺少目标坐标 q 或 r' });

    const state = BattleState.getBattle(req.params.id);
    if (!state) return res.status(404).json({ error: '战场不存在' });

    const result = BattleState.moveUnit(req.params.id, unit_id, q, r);
    res.json(result);

  } catch (err) {
    console.error('[move] 错误:', err.message);
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/combat/:id/move-range/:unit_id - 查询单位可移动范围
 */
router.get('/:id/move-range/:unit_id', authenticate, (req, res) => {
  try {
    const hexes = BattleState.getMoveRange(req.params.id, req.params.unit_id);
    res.json({ unit_id: req.params.unit_id, moveRange: hexes, count: hexes.length });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/combat/:id/attack - 执行攻击
 */
router.post('/:id/attack', authenticate, (req, res) => {
  try {
    const state = BattleState.getBattle(req.params.id);
    if (!state) return res.status(404).json({ error: '战场不存在' });
    if (state.phase !== 'combat') return res.status(400).json({ error: '当前不是战斗阶段' });

    const { attacker_id, defender_id, attack_type } = req.body;

    const attacker = state.units.find(u => u.id === attacker_id || u.unit_id === attacker_id);
    const defender = state.units.find(u => u.id === defender_id || u.unit_id === defender_id);

    if (!attacker) return res.status(404).json({ error: '攻击方不存在' });
    if (!defender) return res.status(404).json({ error: '防御方不存在' });
    if (attacker.hp <= 0) return res.status(400).json({ error: '攻击方已阵亡' });
    if (defender.hp <= 0) return res.status(400).json({ error: '防御方已阵亡' });
    if (attacker.has_acted) return res.status(400).json({ error: '攻击方本回合已行动过' });

    const attackType = attack_type || 'melee';

    // Validate range
    const dist = hexDistance(attacker.q, attacker.r, defender.q, defender.r);

    // Default melee range is 1 (adjacent hex)
    if (attackType === 'melee' && dist > 1) {
      return res.status(400).json({
        error: '目标不在近战范围',
        distance: dist,
        required: '1'
      });
    }

    // Init combat resolver with current battlefield state
    combatResolver.init(state, state.units.filter(u => u.hp > 0));

    // Execute combat via executeTurn
    const turnResult = combatResolver.executeTurn(attacker, defender, {
      turn: state.currentTurn || 1,
      attack_type: attackType,
      enableAmbush: false
    });

    // Record result
    BattleState.recordAttack(
      req.params.id,
      attacker.id || attacker.unit_id,
      defender.id || defender.unit_id,
      turnResult
    );

    // Phase 28-D: 攻击后计算攻击者朝向（面向目标）
    if (attacker.q !== undefined && defender.q !== undefined) {
      const dx = defender.q - attacker.q;
      const dy = defender.r - attacker.r;
      let angle = Math.atan2(dy, dx) * (180 / Math.PI);
      if (angle < 0) angle += 360;
      const sector = Math.floor(((angle + 30) % 360) / 60);
      attacker.direction = sector + 1;  // 1-6
    }

    // Check if defender was killed
    const defenderDead = defender.hp <= 0;

    res.json({
      success: true,
      attack_type: attackType,
      distance: dist,
      attacker_direction: attacker.direction,
      defenderDead,
      ...turnResult
    });

  } catch (err) {
    console.error('[attack] 错误:', err.message);
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/combat/:id/end-turn - 结束当前回合
 */
router.post('/:id/end-turn', authenticate, (req, res) => {
  try {
    const state = BattleState.getBattle(req.params.id);
    if (!state) return res.status(404).json({ error: '战场不存在' });

    const result = BattleState.endTurn(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/combat/:id/start-combat - 手动开始战斗阶段
 */
router.post('/:id/start-combat', authenticate, (req, res) => {
  try {
    const state = BattleState.getBattle(req.params.id);
    if (!state) return res.status(404).json({ error: '战场不存在' });

    if (state.units.length < 2) {
      return res.status(400).json({ error: '至少需要部署2个单位才能开始战斗' });
    }

    state.phase = 'combat';
    state.log.push('[阶段] 战斗阶段开始');
    state.updated = new Date().toISOString();

    res.json({ success: true, phase: 'combat' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ============================================================
// 部署池
// ============================================================

/**
 * GET /api/combat/:id/deploy-pool - 获取部署池
 */
router.get('/:id/deploy-pool', authenticate, (req, res) => {
  const state = BattleState.getBattle(req.params.id);
  if (!state) return res.status(404).json({ error: '战场不存在' });
  res.json({ success: true, units: state.deployPool || [] });
});

/**
 * POST /api/combat/:id/pending-units - 整备室出击时写入部署池
 * Phase 27: 接收整备室传来的完整单位数据，存入 battle.deployPool
 */
router.post('/:id/pending-units', authenticate, (req, res) => {
  try {
    const state = BattleState.getBattle(req.params.id);
    if (!state) return res.status(404).json({ error: '战场不存在' });

    const { units } = req.body;
    if (!Array.isArray(units)) return res.status(400).json({ error: 'units 必须是数组' });

    const result = BattleState.setDeployPool(req.params.id, units);
    console.log(`[pending-units] 部署池已写入 ${result.count} 个单位到战场 ${req.params.id}`);
    res.json({ success: true, count: result.count });
  } catch (err) {
    console.error('[pending-units] 错误:', err.message);
    res.status(400).json({ error: err.message });
  }
});

// ============================================================
// 结束部署
// ============================================================

/**
 * POST /api/combat/:id/end-deployment - 结束部署阶段，切入战斗
 */
router.post('/:id/end-deployment', authenticate, (req, res) => {
  try {
    const state = BattleState.getBattle(req.params.id);
    if (!state) return res.status(404).json({ error: '战场不存在' });
    if (state.phase !== 'deploy') return res.status(400).json({ error: '当前不是部署阶段' });

    state.phase = 'combat';
    state.log = state.log || [];
    state.log.push('[阶段] 部署结束，进入战斗阶段');
    state.updated = new Date().toISOString();

    res.json({ success: true, phase: 'combat' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ============================================================
// 战术动作
// ============================================================

/**
 * POST /api/combat/:id/action - 战术动作（wait/defend 等）
 * Phase 23 误删后恢复
 */
router.post('/:id/action', authenticate, (req, res) => {
  try {
    const state = BattleState.getBattle(req.params.id);
    if (!state) return res.status(404).json({ error: '战场不存在' });

    const { unit_id, action_type } = req.body;
    if (!unit_id) return res.status(400).json({ error: '缺少 unit_id' });

    const unit = state.units.find(u => u.id === unit_id || u.unit_id === unit_id);
    if (!unit) return res.status(404).json({ error: '单位不存在' });

    const action = action_type || 'wait';
    unit.has_acted = true;
    state.log.push(`[动作] ${unit.name || unit.id}: ${action}`);

    res.json({ success: true, unit_id, action_type: action });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ============================================================
// 阵营能力（兜底）
// ============================================================

/**
 * POST /api/combat/:id/fog-system - 迷雾系统
 */
router.post('/:id/fog-system', authenticate, (req, res) => {
  res.json({ success: true });
});

/**
 * POST /api/combat/:id/support - 支援
 */
router.post('/:id/support', authenticate, (req, res) => {
  res.json({ success: true });
});

/**
 * POST /api/combat/:id/conceal - 隐蔽
 */
router.post('/:id/conceal', authenticate, (req, res) => {
  res.json({ success: true });
});

// ============================================================
// 坐标跳转
// ============================================================

/**
 * POST /api/combat/:id/jump-to - 坐标跳转
 */
router.post('/:id/jump-to', authenticate, (req, res) => {
  res.json({ success: true });
});

// ============================================================
// 胜利条件
// ============================================================

/**
 * POST /api/combat/:id/victory-conditions - 设置胜利条件
 */
router.post('/:id/victory-conditions', authenticate, (req, res) => {
  try {
    const state = BattleState.getBattle(req.params.id);
    if (!state) return res.status(404).json({ error: '战场不存在' });
    state.victoryConditions = req.body.conditions || [];
    state.holdRound = req.body.hold_round || 8;
    if (req.body.target_q !== undefined) state.targetQ = req.body.target_q;
    if (req.body.target_r !== undefined) state.targetR = req.body.target_r;
    res.json({ success: true, conditions: state.victoryConditions });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/combat/:id/victory-conditions - 获取胜利条件
 */
router.get('/:id/victory-conditions', authenticate, (req, res) => {
  const state = BattleState.getBattle(req.params.id);
  if (!state) return res.status(404).json({ error: '战场不存在' });
  res.json({ conditions: state.victoryConditions || [], hold_round: state.holdRound });
});

// ============================================================
// ACE 单位
// ============================================================

/**
 * POST /api/combat/:id/ace-unit - 设置 ACE 单位
 */
router.post('/:id/ace-unit', authenticate, (req, res) => {
  try {
    const state = BattleState.getBattle(req.params.id);
    if (!state) return res.status(404).json({ error: '战场不存在' });
    if (!state.aceUnits) state.aceUnits = {};
    state.aceUnits[req.body.faction] = req.body.unit_id;
    res.json({ success: true, aceUnits: state.aceUnits });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/combat/:id/ace-unit - 获取 ACE 单位
 */
router.get('/:id/ace-unit', authenticate, (req, res) => {
  const state = BattleState.getBattle(req.params.id);
  if (!state) return res.status(404).json({ error: '战场不存在' });
  res.json({ aceUnits: state.aceUnits || {} });
});

// ============================================================
// 阵营冷却
// ============================================================

/**
 * GET /api/combat/:id/faction-cooldowns - 获取阵营冷却
 */
router.get('/:id/faction-cooldowns', authenticate, (req, res) => {
  const state = BattleState.getBattle(req.params.id);
  if (!state) return res.status(404).json({ error: '战场不存在' });
  res.json({ cooldowns: state.factionCooldowns || {} });
});

// ============================================================
// 加入战场
// ============================================================

/**
 * POST /api/combat/:id/join - 加入战场
 */
router.post('/:id/join', authenticate, (req, res) => {
  const state = BattleState.getBattle(req.params.id);
  if (!state) return res.status(404).json({ error: '战场不存在' });
  res.json({ success: true, battle: state });
});

export default router;
