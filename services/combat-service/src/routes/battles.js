import express from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/db.js';
import { CombatResolver } from '../services/combatResolver.js';
import { TurnManager } from '../services/turnManager.js';
import { validateRequest, createBattleSchema, moveSchema, attackSchema, deploymentSchema, battleActionSchema } from '../validators/battle.validators.js';

import UnitConverter from '../services/unitConverter.js';
import { getGlossaryConfig, saveGlossaryConfig, deleteSkills } from '../services/combatCore/configLoader.cjs';

const router = express.Router();

// JWT 配置（与 auth-service 保持一致）
// 环境变量必须设置，无 fallback（安全要求）
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('[启动错误] JWT_SECRET 环境变量必须设置！');
  process.exit(1);
}

// 认证中间件
const authenticate = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: '未授权' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Token无效' });
  }
};

// 获取战斗状态（含 units_state 解析）
async function getBattleState(battleId) {
  const battle = await db.get('SELECT * FROM battle_sessions WHERE id = $1', [battleId]);
  if (!battle) return null;
  const state = JSON.parse(battle.units_state || '{}');
  state.id = battle.id;
  state.status = battle.status;
  return state;
}
// 获取战斗会话列表
router.get('/', authenticate, async (req, res) => {
  try {
    const battles = await db.all('SELECT * FROM battle_sessions ORDER BY created_at DESC');
    res.json({ battles });
  } catch (error) {
    console.error('Get battles error:', error);
    res.status(500).json({ error: '获取战斗列表失败' });
  }
});

// 获取战斗详情

// 词条库中枢配置 API
// ============================================================

// GET 读取词条库配置
router.get('/glossary-config', (req, res) => {
  try {
    const config = getGlossaryConfig();
    if (!config) {
      return res.status(500).json({ error: '配置文件读取失败' });
    }
    res.json(config);
  } catch (error) {
    console.error('[Glossary] GET error:', error);
    res.status(500).json({ error: '读取词条配置失败' });
  }
});

// POST 保存词条库配置 (支持原子增删改查)
router.post('/glossary-config', (req, res) => {
  try {
    const newConfig = req.body;
    if (!newConfig || typeof newConfig !== 'object' || Array.isArray(newConfig)) {
      return res.status(400).json({
        error: '配置格式无效',
        message: '请求体必须是 JSON 对象'
      });
    }

    // 原子删除指令: _delete_skills: ["skill_key_1", "skill_key_2"]
    const deleteKeys = newConfig._delete_skills || [];
    if (deleteKeys.length > 0) {
      const deleted = deleteSkills(deleteKeys);
      console.log(`[Glossary] 原子删除请求: [${deleteKeys.join(', ')}], 结果: ${deleted}`);
      // 清除 _delete_skills 避免写入磁盘
      delete newConfig._delete_skills;
      // 如果请求仅包含删除指令，直接返回
      if (Object.keys(newConfig).length === 0 || (Object.keys(newConfig).length === 1 && newConfig._meta)) {
        return res.json({
          message: `已删除 ${deleteKeys.length} 个技能词条`,
          deleted: deleteKeys,
          updated_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
        });
      }
    }

    newConfig._meta = newConfig._meta || {};
    newConfig._meta.date = new Date().toISOString().replace('T', ' ').substring(0, 19);
    newConfig._meta.generated_from = 'GlossaryView.vue 前端编辑界面 (结构化 CRUD)';
    newConfig._meta.version = newConfig._meta.version || '3.0';

    const success = saveGlossaryConfig(newConfig);
    if (!success) {
      return res.status(500).json({ error: '写入配置文件失败' });
    }

    console.log('[Glossary] 配置已更新 (结构化CRUD)，消费者将在下次调用时加载新值');
    res.json({
      message: '词条库配置已保存并生效',
      updated_at: newConfig._meta.date
    });
  } catch (error) {
    console.error('[Glossary] POST error:', error);
    res.status(500).json({ error: '保存词条配置失败' });
  }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const battle = await db.get('SELECT * FROM battle_sessions WHERE id = $1', [req.params.id]);
    
    if (!battle) {
      return res.status(404).json({ error: '战斗不存在' });
    }
    
    // 解析战斗状态
    let battlefieldState = {};
    try {
      battlefieldState = JSON.parse(battle.units_state || '{}');
    } catch (e) {}
    
    // 解析出生点相关状态
    let spawnOrder = [];
    try {
      spawnOrder = JSON.parse(battle.spawn_order || '[]');
    } catch (e) {}
    
    // 找出当前需要选择出生点的玩家
    let currentSpawnPlayer = null;
    if (!battle.spawn_phase_done && spawnOrder.length > 0) {
      const nextPlayer = spawnOrder.find(p => !p.has_selected);
      currentSpawnPlayer = nextPlayer ? nextPlayer.player_id : null;
    }
    
    res.json({ 
      battle: {
        ...battle,
        battlefield_state: battlefieldState,
        spawn_phase_done: !!battle.spawn_phase_done,
        spawn_order: spawnOrder,
        current_spawn_player: currentSpawnPlayer
      }
    });
  } catch (error) {
    console.error('Get battle error:', error);
    res.status(500).json({ error: '获取战斗详情失败' });
  }
});

// 创建战斗会话
router.post('/', authenticate, async (req, res) => {
  try {
    // Validate request with Zod
    const validation = validateRequest(createBattleSchema, req.body);
    if (!validation.success) {
      return res.status(400).json(validation.error);
    }
    
    const { battlefield_id, room_id, players } = validation.data;

    // 从 Map Service 获取战场信息
    let battlefield;
    try {
      const mapServiceUrl = process.env.MAP_SERVICE_URL || 'http://map-service:3003';
      const mapResponse = await fetch(`${mapServiceUrl}/api/map/battlefields/${battlefield_id}`, { headers: req.headers.authorization ? { Authorization: req.headers.authorization } : {} });
      if (mapResponse.ok) {
        battlefield = await mapResponse.json();
      } else {
        console.warn(`[Battles] Map Service 返回 ${mapResponse.status}，使用默认战场`);
        battlefield = { id: battlefield_id, width: 10, height: 10, terrain: {}, terrain_hp: {} };
      }
    } catch (error) {
      console.warn(`[Battles] 无法连接 Map Service: ${error.message}，使用默认战场`);
      battlefield = { id: battlefield_id, width: 10, height: 10, terrain: {}, terrain_hp: {} };
    }

    // 如果有room_id，从房间创建战斗
    let roomPlayers = [];
    let spawnOrder = [];
    
    if (room_id) {
      // TODO: 需要从通信服务获取房间玩家信息
      // roomPlayers = await fetch(`${process.env.COMM_SERVICE_URL}/api/rooms/${room_id}/players`);
      
      // 简化处理：假设有2个玩家
      roomPlayers = [
        { user_id: req.user.userId, faction: 'earth', seat_index: 0 },
        { user_id: 'player2', faction: 'maxion', seat_index: 1 }
      ];
      
      // 生成出生点选择顺序
      spawnOrder = roomPlayers.map(p => ({
        player_id: p.user_id,
        faction: p.faction,
        has_selected: false
      }));
    }

    // 解析地形（Map Service 返回的 terrain 已是对象）
    let terrainMap = {};
    if (battlefield.terrain) {
      terrainMap = typeof battlefield.terrain === 'string'
        ? JSON.parse(battlefield.terrain)
        : battlefield.terrain;
    }

    // 生成格子数据
    const cells = [];
    for (let q = 0; q < battlefield.width; q++) {
      for (let r = 0; r < battlefield.height; r++) {
        const key = `${q},${r}`;
        cells.push({
          q,
          r,
          terrain: terrainMap[key] || 'empty'
        });
      }
    }

    // 创建战斗会话状态
    const initialState = {
      width: battlefield.width,
      height: battlefield.height,
      cells: cells,
      units: [],
      current_faction: 'earth',
      turn_number: 1,
      phase: room_id ? 'spawn_selection' : 'deployment',
      battle_log: [],
      spawn_order: spawnOrder,
      spawn_phase_done: false
    };

    // Generate UUID for battle session
    const battleId = uuidv4();
    const stateStr = JSON.stringify(initialState);
    const battle = await db.get(
      'INSERT INTO battle_sessions (id, battlefield_id, room_id, units_state, status, phase, current_faction, current_turn, spawn_phase_done, spawn_order) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *',
      [battleId, battlefield_id, room_id || null, stateStr, 'active', room_id ? 'spawn_selection' : 'deployment', 'earth', 1, 0, JSON.stringify(spawnOrder)]
    );

    res.status(201).json({
      message: '战斗创建成功',
      battle: {
        ...battle,
        battlefield_state: initialState
      }
    });
  } catch (error) {
    console.error('Create battle error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: '创建战斗失败: ' + error.message });
  }
});

// ===== Terrain cost map (must match frontend TERRAIN_MAP) =====
const TERRAIN_COST_MAP = {
  space: 1, moon: 1, lunar: 1, empty: 1, base: 1, mothership: 1,
  repair_station: 1, spawn_earth: 0, spawn_maxion: 0, spawn: 0,
  desert: 1.5, forest: 2, water: 2.5, mountain: 3, fortress: 5,
  wall: 99
};

function getTerrainCost(terrainId) {
  return TERRAIN_COST_MAP[terrainId] || 1;
}

// 注入地形到单位（根据单位位置查询 state.cells）
function injectTerrain(state, unit) {
  if (!unit || unit.q === undefined) return;
  const cellMap = {};
  (state.cells || []).forEach(c => { cellMap[String(c.q)+','+String(c.r)] = c.terrain; });
  unit.terrain = cellMap[String(unit.q)+','+String(unit.r)] || null;
}

// BFS pathfinding: returns true if target hex is reachable within movementRange
function canMoveTo(state, unit, target_q, target_r, movementRange) {
  const cells = state.cells || [];
  const cellMap = {};
  cells.forEach(c => { cellMap[String(c.q)+','+String(c.r)] = { terrain: c.terrain || 'empty' }; });

  const units = state.units || [];
  const unitMap = {};
  units.forEach(u => {
    if (u.q !== undefined) unitMap[String(u.q)+','+String(u.r)] = true;
  });

  const startKey = String(unit.q)+','+String(unit.r);
  const targetKey = String(target_q)+','+String(target_r);

  // Remove self from unit map so starting position is passable
  if (unitMap[startKey]) delete unitMap[startKey];

  const dirs = [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];
  const costMap = {};
  costMap[startKey] = 0;
  const queue = [{ q: unit.q, r: unit.r, cost: 0 }];

  while (queue.length > 0) {
    queue.sort((a, b) => a.cost - b.cost);
    const cur = queue.shift();

    for (const [dq, dr] of dirs) {
      const nq = cur.q + dq;
      const nr = cur.r + dr;
      const nkey = String(nq)+','+String(nr);

      const cell = cellMap[nkey];
      if (!cell) continue; // out of bounds

      const terrainCost = getTerrainCost(cell.terrain);
      if (terrainCost >= 99) continue; // impassable

      // Cannot pass through occupied hexes (except start)
      if (unitMap[nkey] && nkey !== startKey) continue;

      const newCost = cur.cost + terrainCost;
      if (newCost > movementRange) continue;

      if (costMap[nkey] === undefined || newCost < costMap[nkey]) {
        costMap[nkey] = newCost;
        queue.push({ q: nq, r: nr, cost: newCost });
      }
    }
  }

  return costMap[targetKey] !== undefined;
}

// 执行移动
router.post('/:id/move', authenticate, async (req, res) => {
  try {
    // Validate request with Zod
    const validation = validateRequest(moveSchema, req.body);
    if (!validation.success) {
      return res.status(400).json(validation.error);
    }
    
    const { unit_id, target_q, target_r } = validation.data;
    
    const battle = await db.get('SELECT * FROM battle_sessions WHERE id = $1', [req.params.id]);
    
    if (!battle) {
      return res.status(404).json({ error: '战斗不存在' });
    }
    
    const state = JSON.parse(battle.units_state || '{}');
    console.log('[MOVE DEBUG] unit_id:', unit_id, 'type:', typeof unit_id);
    console.log('[MOVE DEBUG] state.units:', (state.units || []).map(u => ({id: u.id, t: typeof u.id, n: u.name})));
    const unit = state.units?.find(u => String(u.id) === String(unit_id));
    
    if (!unit) {
      return res.status(404).json({ error: '单位不存在' });
    }
        // 计算移动范围 — BFS地形代价验证
    const movementRange = Math.floor(((unit.mobility || unit.机动 || 3) / 2)) || 1;

    if (!canMoveTo(state, unit, target_q, target_r, movementRange)) {
      return res.status(400).json({ error: '目标超出移动范围（考虑地形）' });
    }
    
    // 更新位置
    unit.q = target_q;
    unit.r = target_r;
    unit.has_moved = true;

    
    // 注入新格子的地形
    injectTerrain(state, unit);

    // 保存状态
    await db.execute('UPDATE battle_sessions SET units_state = $1, phase = $2, current_faction = $3, current_turn = $4 WHERE id = $5', [JSON.stringify(state), state.phase, state.current_faction, state.turn_number, req.params.id]);
    
    res.json({ 
      message: '移动成功',
      unit,
      state
    });
  } catch (error) {
    console.error('Move error:', error);
    res.status(500).json({ error: '移动失败' });
  }
});

// 执行攻击
router.post('/:id/attack', authenticate, async (req, res) => {
  try {
    // Validate request with Zod
    const validation = validateRequest(attackSchema, req.body);
    if (!validation.success) {
      return res.status(400).json(validation.error);
    }
    
    const { attacker_id, target_id, attack_type, skill_id } = validation.data;
    
    const battle = await db.get('SELECT * FROM battle_sessions WHERE id = $1', [req.params.id]);
    
    if (!battle) {
      return res.status(404).json({ error: '战斗不存在' });
    }
    
    const state = JSON.parse(battle.units_state || '{}');
    const attacker = state.units?.find(u => String(u.id) === String(attacker_id));
    const target = state.units?.find(u => String(u.id) === String(target_id));
    
    if (!attacker || !target) {
      return res.status(404).json({ error: '单位不存在' });
    }
    
    // 检查奇袭触发
    const surpriseCheck = CombatResolver.checkSurpriseAttack(attacker, target, state.units);
    
    if (surpriseCheck) {
      // 奇袭触发，返回奇袭信息
      return res.json({ 
        message: '奇袭触发',
        surprise_triggered: true,
        surprise_info: surpriseCheck,
        state
      });
    }
    
    // 注入防御方地形
    injectTerrain(state, target);

    // 战斗结算
    const combatResult = CombatResolver.resolveAttack(attacker, target, attack_type, skill_id);
    
    // 标记攻击者造成伤害（用于隐匿判断）
    attacker.dealtDamageThisTurn = true;
    
    // 检查拜隆增援
    if (target.faction === 'balon') {
      const supportUnits = CombatResolver.getSupportUnits ? CombatResolver.getSupportUnits(target, state.units) : [];
      
      if (supportUnits.length > 0) {
        // 返回增援选项给前端
        return res.json({ 
          message: '检测到可增援单位',
          support_triggered: true,
          support_units: supportUnits.map(u => ({
            id: u.id,
            name: u.name,
            q: u.q,
            r: u.r
          })),
          combat_result: combatResult,
          state
        });
      }
    }
    
    // 更新HP
    // executeTurn 已通过副作用修改 defender.hp，直接使用即可
    attacker.has_acted = true;
    
    // 检查当前阵营是否全部行动完毕，自动推进回合
    const autoTurnResult = autoTurnCheck(state);
    // 添加战斗日志
    state.battle_log = state.battle_log || [];
    state.battle_log.push({
      type: 'attack',
      attacker: attacker.name,
      target: target.name,
      attack_type,
      damage: combatResult.final_damage,
      target_hp: target.hp,
      timestamp: new Date().toISOString()
    });
    
    // 检查目标是否死亡
    if (target.hp <= 0) {
      state.units = state.units.filter(u => String(u.id) !== String(target_id));
      state.battle_log.push({
        type: 'destroyed',
        unit: target.name,
        destroyed_by: attacker.name
      });
    }
    
    // 保存状态
    await db.execute('UPDATE battle_sessions SET units_state = $1, phase = $2, current_faction = $3, current_turn = $4 WHERE id = $5', [JSON.stringify(state), state.phase, state.current_faction, state.turn_number, req.params.id]);
    
    res.json({ 
      message: '攻击结算完成',
      auto_turn_change: autoTurnResult,
      combat_result: combatResult,
      state
    });
  } catch (error) {
    console.error('Attack error:', error);
    res.status(500).json({ error: '攻击失败' });
  }
});

// 处理奇袭选择
router.post('/:id/surprise-choice', authenticate, async (req, res) => {
  try {
    const { choice, surprise_unit_id, original_attacker_id, target_id, attack_type, skill_id } = req.body;
    // choice: 'replace' | 'counter' | 'giveup'
    
    const battle = await db.get('SELECT * FROM battle_sessions WHERE id = $1', [req.params.id]);
    
    if (!battle) {
      return res.status(404).json({ error: '战斗不存在' });
    }
    
    const state = JSON.parse(battle.units_state || '{}');
    const originalAttacker = state.units?.find(u => String(u.id) === String(original_attacker_id));
    const target = state.units?.find(u => String(u.id) === String(target_id));
    
    if (!originalAttacker || !target) {
      return res.status(404).json({ error: '单位不存在' });
    }
    
    state.battle_log = state.battle_log || [];
    
    if (choice === 'giveup') {
      // 放弃奇袭，执行原攻击
      injectTerrain(state, target);
      const result = CombatResolver.resolveAttack(originalAttacker, target, attack_type);
      
      // target.hp 已被 executeTurn 副作用修改;
      originalAttacker.has_acted = true;
      
      state.battle_log.push({
        type: 'surprise_giveup',
        message: '放弃了奇袭机会',
        timestamp: new Date().toISOString()
      });
      
      state.battle_log.push({
        type: 'attack',
        attacker: originalAttacker.name,
        target: target.name,
        attack_type,
        damage: result.final_damage,
        target_hp: target.hp,
        timestamp: new Date().toISOString()
      });
      
      if (target.hp <= 0) {
        state.units = state.units.filter(u => String(u.id) !== String(target_id));
        state.battle_log.push({
          type: 'destroyed',
          unit: target.name,
          destroyed_by: originalAttacker.name
        });
      }
      
      await db.execute('UPDATE battle_sessions SET units_state = $1, phase = $2, current_faction = $3, current_turn = $4 WHERE id = $5', [JSON.stringify(state), state.phase, state.current_faction, state.turn_number, req.params.id]);
      
      res.json({ 
        message: '放弃奇袭，原攻击执行完成',
        combat_result: result,
        state
      });
      return;
    }
    
    if (choice === 'replace') {
      // 顶替：取消原攻击，奇袭单位执行攻击
      const surpriseUnit = state.units?.find(u => String(u.id) === String(surprise_unit_id));
      if (!surpriseUnit) {
        return res.status(404).json({ error: '奇袭单位不存在' });
      }
      
      injectTerrain(state, target);
      const result = CombatResolver.resolveSurpriseAttack(surpriseUnit, target, attack_type);
      
      // target.hp 已被 executeTurn 副作用修改;
      surpriseUnit.has_acted = true;
      
      state.battle_log.push({
        type: 'surprise_replace',
        message: `${surpriseUnit.name} 顶替了 ${originalAttacker.name} 的攻击`,
        dice_roll: result.dice_roll,
        dice_color: result.dice_color,
        damage: result.final_damage,
        target_hp: target.hp,
        timestamp: new Date().toISOString()
      });
      
      if (target.hp <= 0) {
        state.units = state.units.filter(u => String(u.id) !== String(target_id));
        state.battle_log.push({
          type: 'destroyed',
          unit: target.name,
          destroyed_by: surpriseUnit.name
        });
      }
      
      await db.execute('UPDATE battle_sessions SET units_state = $1, phase = $2, current_faction = $3, current_turn = $4 WHERE id = $5', [JSON.stringify(state), state.phase, state.current_faction, state.turn_number, req.params.id]);
      
      res.json({ 
        message: '奇袭顶替成功',
        combat_result: result,
        state
      });
      return;
    }
    
    if (choice === 'counter') {
      // 先制：原攻击继续，奇袭单位额外攻击
      const surpriseUnit = state.units?.find(u => String(u.id) === String(surprise_unit_id));
      if (!surpriseUnit) {
        return res.status(404).json({ error: '奇袭单位不存在' });
      }

      // 注入防御方地形
      injectTerrain(state, target);

      // 执行原攻击
      const originalResult = CombatResolver.resolveAttack(originalAttacker, target, attack_type, skill_id);
      
      // 执行奇袭攻击
      const surpriseResult = CombatResolver.resolveSurpriseAttack(surpriseUnit, target, attack_type);
      
      // 更新HP（取伤害之和）
      const totalDamage = originalResult.final_damage + surpriseResult.final_damage;
      target.hp = Math.max(0, target.hp - totalDamage);
      
      originalAttacker.has_acted = true;
      surpriseUnit.has_acted = true;
      
      state.battle_log.push({
        type: 'surprise_counter',
        message: `${surpriseUnit.name} 进行了先制攻击`,
        original_attack: {
          attacker: originalAttacker.name,
          damage: originalResult.final_damage
        },
        surprise_attack: {
          attacker: surpriseUnit.name,
          dice_roll: surpriseResult.dice_roll,
          dice_color: surpriseResult.dice_color,
          damage: surpriseResult.final_damage
        },
        total_damage: totalDamage,
        target_hp: target.hp,
        timestamp: new Date().toISOString()
      });
      
      if (target.hp <= 0) {
        state.units = state.units.filter(u => String(u.id) !== String(target_id));
        state.battle_log.push({
          type: 'destroyed',
          unit: target.name,
          destroyed_by: surpriseUnit.name
        });
      }
      
      await db.execute('UPDATE battle_sessions SET units_state = $1, phase = $2, current_faction = $3, current_turn = $4 WHERE id = $5', [JSON.stringify(state), state.phase, state.current_faction, state.turn_number, req.params.id]);
      
      res.json({ 
        message: '先制攻击成功',
        combat_results: {
          original: originalResult,
          surprise: surpriseResult
        },
        state
      });
      return;
    }
    
    res.status(400).json({ error: '无效的奇袭选择' });
  } catch (error) {
    console.error('Surprise choice error:', error);
    res.status(500).json({ error: '处理奇袭选择失败' });
  }
});

// 结束回合
router.post('/:id/end-turn', authenticate, async (req, res) => {
  try {
    const battle = await db.get('SELECT * FROM battle_sessions WHERE id = $1', [req.params.id]);
    
    if (!battle) {
      return res.status(404).json({ error: '战斗不存在' });
    }
    
    const state = JSON.parse(battle.units_state || '{}');
    const nextState = TurnManager.nextTurn(state);
    
    await db.execute('UPDATE battle_sessions SET units_state = $1, phase = $2 WHERE id = $3', [JSON.stringify(nextState), nextState.phase, req.params.id]);
    
    res.json({ 
      message: '回合结束',
      state: nextState
    });
  } catch (error) {
    console.error('End turn error:', error);
    res.status(500).json({ error: '结束回合失败' });
  }
});

// 地球联合：火力覆盖
router.post('/:id/artillery', authenticate, async (req, res) => {
  try {
    const { center_q, center_r } = req.body;
    
    const battle = await db.get('SELECT * FROM battle_sessions WHERE id = $1', [req.params.id]);
    
    if (!battle) {
      return res.status(404).json({ error: '战斗不存在' });
    }
    
    const state = JSON.parse(battle.units_state || '{}');
    
    if (state.current_faction !== 'earth') {
      return res.status(400).json({ error: '只有地球联合可以使用火力覆盖' });
    }
    
    if (state.earthArtilleryUsed) {
      return res.status(400).json({ error: '火力覆盖已使用' });
    }
    
    // 执行火力覆盖
    const artilleryResult = CombatResolver.resolveEarthArtillery ?
      CombatResolver.resolveEarthArtillery(center_q, center_r, state.units, state.battlefield_state) :
      { damage: 10, units_affected: [], logs: [] };
    
    // 更新状态
    state.earthArtilleryUsed = true;
    state.battle_log = state.battle_log || [];
    
    artilleryResult.logs.forEach(log => {
      state.battle_log.push({
        ...log,
        timestamp: new Date().toISOString()
      });
    });
    
    // 保存状态
    await db.execute('UPDATE battle_sessions SET units_state = $1, phase = $2, current_faction = $3, current_turn = $4 WHERE id = $5', [JSON.stringify(state), state.phase, state.current_faction, state.turn_number, req.params.id]);
    
    res.json({
      message: '火力覆盖发动成功',
      result: artilleryResult,
      state
    });
  } catch (error) {
    console.error('Artillery error:', error);
    res.status(500).json({ error: '火力覆盖失败' });
  }
});

// 攻击阵营（地球联合）：迷雾系统
router.post('/:id/fog-system', authenticate, async (req, res) => {
  try {
    const battle = await db.get('SELECT * FROM battle_sessions WHERE id = $1', [req.params.id]);
    
    if (!battle) {
      return res.status(404).json({ error: '战斗不存在' });
    }
    
    const state = JSON.parse(battle.units_state || '{}');
    
    if (state.current_faction !== 'earth') {
      return res.status(400).json({ error: '只有攻击阵营（地球联合）可以使用迷雾系统' });
    }
    
    if (state.fogSystemUsed) {
      return res.status(400).json({ error: '迷雾系统已使用' });
    }
    
    // 执行迷雾系统
    const fogResult = CombatResolver.resolveFogSystem ?
      CombatResolver.resolveFogSystem(state.units, state.battlefield_state) :
      { effect: 'defense_buff', duration: 2, logs: [] };
    
    // 更新状态
    state.fogSystemUsed = true;
    state.fogEffect = fogResult.effect;
    state.fogDuration = fogResult.duration || 2;
    state.battle_log = state.battle_log || [];
    
    fogResult.logs.forEach(log => {
      state.battle_log.push({
        ...log,
        timestamp: new Date().toISOString()
      });
    });
    
    // 保存状态
    await db.execute('UPDATE battle_sessions SET units_state = $1, phase = $2, current_faction = $3, current_turn = $4 WHERE id = $5', [JSON.stringify(state), state.phase, state.current_faction, state.turn_number, req.params.id]);
    
    res.json({
      message: '迷雾系统发动成功',
      result: fogResult,
      state
    });
  } catch (error) {
    console.error('Fog system error:', error);
    res.status(500).json({ error: '迷雾系统失败' });
  }
});

// 选择出生点（出生点选择阶段）
router.post('/:id/select-spawn', authenticate, async (req, res) => {
  try {
    const { q, r } = req.body;
    const battle = await db.get('SELECT * FROM battle_sessions WHERE id = $1', [req.params.id]);
    
    if (!battle) {
      return res.status(404).json({ error: '战斗不存在' });
    }
    
    const state = JSON.parse(battle.units_state || '{}');
    
    // TODO: 实现出生点选择逻辑
    // 简化处理：标记当前玩家已选择
    if (state.spawn_order) {
      const currentSpawner = state.spawn_order.find(p => !p.has_selected);
      if (currentSpawner) {
        currentSpawner.has_selected = true;
        currentSpawner.spawn_point = { q, r, type: 'mothership' };
      }
    }
    
    // 检查是否所有玩家都选择了出生点
    const allSelected = state.spawn_order?.every(p => p.has_selected);
    if (allSelected) {
      state.phase = 'spawn_deployment';
      state.spawn_phase_done = true;
    }
    
    await db.execute('UPDATE battle_sessions SET units_state = $1, phase = $2, spawn_order = $3 WHERE id = $4', [JSON.stringify(state), state.phase, JSON.stringify(state.spawn_order), req.params.id]);
    
    res.json({ message: '出生点选择成功', state });
  } catch (error) {
    console.error('Select spawn error:', error);
    res.status(500).json({ error: '选择出生点失败' });
  }
});

// 部署单位（出生点部署阶段）
// ===== 部署池管理 =====
// GET /:id/deploy-pool - 返回可部署的棋子快照列表
router.get('/:id/deploy-pool', authenticate, async (req, res) => {
  try {
    const state = await getBattleState(req.params.id);
    if (!state) return res.status(404).json({ error: 'Battle not found' });

    const pool = state.pending_deploy_units
      ? Object.values(state.pending_deploy_units)
      : [];

    // 过滤掉已部署的单位
    const deployedIds = new Set((state.units || []).map(u => u.id));
    const available = pool.filter(u => !deployedIds.has(u.id));

    res.json({ units: available });
  } catch (e) {
    console.error('[deploy-pool] 错误:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /:id/pending-units - 接收准备室传来的棋子完整数据
router.post('/:id/pending-units', authenticate, async (req, res) => {
  try {
    const { units } = req.body;
    if (!units || !Array.isArray(units)) {
      return res.status(400).json({ error: 'units array required' });
    }

    const state = await getBattleState(req.params.id);
    if (!state) return res.status(404).json({ error: 'Battle not found' });

    state.pending_deploy_units = {};
    for (const unit of units) {
      if (unit && unit.id) {
        state.pending_deploy_units[unit.id] = unit;
      }
    }

    // 持久化
    try {
      const db = req.app.get('db');
      await db.execute(
        'UPDATE battle_sessions SET units_state = $1 WHERE id = $2',
        [JSON.stringify(state), req.params.id]
      );
    } catch (e) {
      console.warn('[pending-units] 持久化失败（非致命）:', e.message);
    }

    console.log(`[pending-units] 已存储 ${Object.keys(state.pending_deploy_units).length} 个棋子`);
    res.json({ ok: true, count: Object.keys(state.pending_deploy_units).length });
  } catch (e) {
    console.error('[pending-units] 错误:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ===== 部署池管理 =====
// GET /:id/deploy-pool - 返回可部署的棋子快照列表
router.get('/:id/deploy-pool', authenticate, async (req, res) => {
  try {
    const state = await getBattleState(req.params.id);
    if (!state) return res.status(404).json({ error: 'Battle not found' });

    const pool = state.pending_deploy_units
      ? Object.values(state.pending_deploy_units)
      : [];

    // 过滤掉已部署的单位
    const deployedIds = new Set((state.units || []).map(u => u.id));
    const available = pool.filter(u => !deployedIds.has(u.id));

    res.json({ units: available });
  } catch (e) {
    console.error('[deploy-pool] 错误:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /:id/pending-units - 接收准备室传来的棋子完整数据
router.post('/:id/pending-units', authenticate, async (req, res) => {
  try {
    const { units } = req.body;
    if (!units || !Array.isArray(units)) {
      return res.status(400).json({ error: 'units array required' });
    }

    const state = await getBattleState(req.params.id);
    if (!state) return res.status(404).json({ error: 'Battle not found' });

    state.pending_deploy_units = {};
    for (const unit of units) {
      if (unit && unit.id) {
        state.pending_deploy_units[unit.id] = unit;
      }
    }

    // 持久化
    try {
      const db = req.app.get('db');
      await db.execute(
        'UPDATE battle_sessions SET units_state = $1 WHERE id = $2',
        [JSON.stringify(state), req.params.id]
      );
    } catch (e) {
      console.warn('[pending-units] 持久化失败（非致命）:', e.message);
    }

    console.log(`[pending-units] 已存储 ${Object.keys(state.pending_deploy_units).length} 个棋子`);
    res.json({ ok: true, count: Object.keys(state.pending_deploy_units).length });
  } catch (e) {
    console.error('[pending-units] 错误:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/deploy-unit', authenticate, async (req, res) => {
  try {
    // Validate request with Zod
    const validation = validateRequest(deploymentSchema, req.body);
    if (!validation.success) {
      return res.status(400).json(validation.error);
    }
    
    const { unit_id, q, r } = validation.data;
    const battle = await db.get('SELECT * FROM battle_sessions WHERE id = $1', [req.params.id]);
    
    if (!battle) {
      return res.status(404).json({ error: '战斗不存在' });
    }
    
    const state = JSON.parse(battle.units_state || '{}');
    
    // TODO: 实现单位部署逻辑
    // 简化处理：将单位添加到战场
    if (!state.units) state.units = [];
    
    // 检查单位是否已部署
    const existing = state.units.find(u => u.id === unit_id);
    if (!existing) {
      // 优先使用请求中携带的完整棋子数据（自包含部署）
      let hangarUnit = req.body.unit_data || null;

      // 其次从后端部署池中查找
      if (!hangarUnit && state.pending_deploy_units && state.pending_deploy_units[unit_id]) {
        hangarUnit = state.pending_deploy_units[unit_id];
        console.log('[deploy-unit] 从部署池获取棋子:', hangarUnit.name || unit_id);
      }

      // 最后回退到格纳库服务
      if (!hangarUnit) {
        try {
          const hangarUrl = process.env.HANGAR_SERVICE_URL || 'http://localhost:3002';
          const headers = {};
          if (req.headers.authorization) {
            headers['Authorization'] = req.headers.authorization;
          }
          const hangarRes = await fetch(`${hangarUrl}/api/hangar/units/${unit_id}`, { headers });
          if (hangarRes.ok) {
            hangarUnit = await hangarRes.json();
          } else {
            console.warn('[deploy-unit] 格纳库响应:', hangarRes.status);
          }
        } catch (e) {
          console.warn('[deploy-unit] 无法从格纳库获取棋子数据:', e.message);
        }
      }

      // 使用 UnitConverter 转换或回退到基本单位
      if (hangarUnit) {
        console.log('[deploy-unit:DEBUG] hangarUnit keys:', Object.keys(hangarUnit).join(', '));
        console.log('[deploy-unit:DEBUG] hangarUnit.mobility:', hangarUnit.mobility);
        console.log('[deploy-unit:DEBUG] hangarUnit["main_机动"]:', hangarUnit["main_机动"]);
        const converted = UnitConverter.convert(hangarUnit, { q, r, player_id: req.user?.id || 0 });
        console.log('[deploy-unit:DEBUG] converted.mobility:', converted.mobility);
        state.units.push(converted);

        // 从部署池中移除已部署单位
        if (state.pending_deploy_units && state.pending_deploy_units[unit_id]) {
          delete state.pending_deploy_units[unit_id];
        }

        // 注入部署格子的地形
        injectTerrain(state, converted);

        // 从部署池中移除已部署单位
        if (state.pending_deploy_units && state.pending_deploy_units[unit_id]) {
          delete state.pending_deploy_units[unit_id];
        }
      } else {
        // 回退：创建基本占位单位
        state.units.push({
          id: unit_id,
          name: 'Unit ' + unit_id,
          q, r,
          hp: 100,
          max_hp: 100,
          attack: 12,
          defense: 6,
          mobility: 3,
          weaponType: 'beam',
          armorType: 'normal',
          shield: 0,
          level: 1,
          faction: 'earth',
          has_acted: false,
          has_moved: false,
          buffs: []
        });
      }
    }
    
    await db.execute('UPDATE battle_sessions SET units_state = $1, phase = $2, current_faction = $3, current_turn = $4 WHERE id = $5', [JSON.stringify(state), state.phase, state.current_faction, state.turn_number, req.params.id]);
    
    res.json({ message: '单位部署成功', state });
  } catch (error) {
    console.error('Deploy unit error:', error);
    res.status(500).json({ error: '部署单位失败' });
  }
});

// 结束部署阶段
router.post('/:id/end-deployment', authenticate, async (req, res) => {
  try {
    const battle = await db.get('SELECT * FROM battle_sessions WHERE id = $1', [req.params.id]);
    
    if (!battle) {
      return res.status(404).json({ error: '战斗不存在' });
    }
    
    const state = JSON.parse(battle.units_state || '{}');
    state.phase = 'tactical';

    // P15: 初始化所有单位的技能计数器（助攻/守护/阻碍）
    try {
      CombatResolver.init(state.battlefield_state, state.units || []);
      console.log('[end-deployment] 技能计数器已初始化');
    } catch (e) {
      console.warn('[end-deployment] 技能计数器初始化失败:', e.message);
    }
    
    await db.execute('UPDATE battle_sessions SET units_state = $1, phase = $2 WHERE id = $3', [JSON.stringify(state), state.phase, req.params.id]);
    
    res.json({ message: '部署阶段结束', state });
  } catch (error) {
    console.error('End deployment error:', error);
    res.status(500).json({ error: '结束部署失败' });
  }
});

// 结束战术阶段
router.post('/:id/end-tactical', authenticate, async (req, res) => {
  try {
    const battle = await db.get('SELECT * FROM battle_sessions WHERE id = $1', [req.params.id]);
    
    if (!battle) {
      return res.status(404).json({ error: '战斗不存在' });
    }
    
    const state = JSON.parse(battle.units_state || '{}');
    state.phase = 'deployment';
    state.turn_number = 1;
    state.current_faction = 'earth';
    
    await db.execute('UPDATE battle_sessions SET units_state = $1, phase = $2, current_faction = $3, current_turn = $4 WHERE id = $5', [JSON.stringify(state), state.phase, state.current_faction, state.turn_number, req.params.id]);
    
    res.json({ message: '战术阶段结束', state });
  } catch (error) {
    console.error('End tactical error:', error);
    res.status(500).json({ error: '结束战术阶段失败' });
  }
});


// 自动回合推进：当前阵营所有单位都已行动完毕时自动结束回合
function autoTurnCheck(state) {
  const currentFactionUnits = (state.units || []).filter(
    u => u.faction === state.current_faction && (u.hp || 0) > 0
  );
  if (currentFactionUnits.length === 0) return false;
  const allActed = currentFactionUnits.every(u => u.has_acted === true);
  if (allActed) {
    const nextState = require('../services/turnManager.js').default.nextTurn(state);
    Object.assign(state, nextState);

    // 阵营切换后检查胜利条件
    const victoryAfterTurn = TurnManager.checkVictory(state);
    if (victoryAfterTurn.victory) {
      state.phase = 'ended';
      state.winner = victoryAfterTurn.winner;
      state.battle_log = state.battle_log || [];
      state.battle_log.push({
        type: 'battle_end',
        message: `战斗结束！${victoryAfterTurn.winner} 胜利 (${victoryAfterTurn.type})`,
        timestamp: new Date().toISOString()
      });
    }

    return true;
  }
  return false;
}

// 通用行动处理（用于火力覆盖等）
router.post('/:id/action', authenticate, async (req, res) => {
  try {
    const { actionType, params } = req.body;
    const battle = await db.get('SELECT * FROM battle_sessions WHERE id = $1', [req.params.id]);
    
    if (!battle) {
      return res.status(404).json({ error: '战斗不存在' });
    }
    
    const state = JSON.parse(battle.units_state || '{}');
    
    if (actionType === 'artillery') {
      // 调用火力覆盖
      const { centerQ, centerR } = params;
      
      if (state.current_faction !== 'earth') {
        return res.status(400).json({ error: '只有地球联合可以使用火力覆盖' });
      }
      
      if (state.earthArtilleryUsed) {
        return res.status(400).json({ error: '火力覆盖已使用' });
      }
      
      state.earthArtilleryUsed = true;
      state.battle_log = state.battle_log || [];
      state.battle_log.push({
        type: 'artillery',
        message: `火力覆盖 (${centerQ},${centerR})`,
        timestamp: new Date().toISOString()
      });
      
      await db.execute('UPDATE battle_sessions SET units_state = $1, phase = $2, current_faction = $3, current_turn = $4 WHERE id = $5', [JSON.stringify(state), state.phase, state.current_faction, state.turn_number, req.params.id]);
      
      return res.json({ message: '火力覆盖发动成功', state });
    }
    if (actionType === 'deploy_royroy') {
      const { unit_id, q, r } = params;
      const parentUnit = (state.units || []).find(u => String(u.id) === String(unit_id));
      if (!parentUnit) {
        return res.status(404).json({ error: '未找到所属单位' });
      }
      if (!parentUnit.royroy) {
        return res.status(400).json({ error: '该单位没有 RoyRoy' });
      }
      if (parentUnit.royroy_deployed) {
        return res.status(400).json({ error: 'RoyRoy 已经部署' });
      }
      const dq = Math.abs(q - parentUnit.q);
      const dr = Math.abs(r - parentUnit.r);
      const ds = Math.abs(-q - r - (-parentUnit.q - parentUnit.r));
      if (Math.max(dq, dr, ds) !== 1) {
        return res.status(400).json({ error: 'RoyRoy 只能部署在相邻空格' });
      }
      if ((state.units || []).some(u => u.q === q && u.r === r)) {
        return res.status(400).json({ error: '该格已有单位' });
      }
      parentUnit.royroy_deployed = true;
      parentUnit.royroy_q = q;
      parentUnit.royroy_r = r;
      state.battle_log = state.battle_log || [];
      state.battle_log.push({
        type: 'deploy_royroy',
        message: `${parentUnit.name} 部署 RoyRoy -> (${q},${r})`,
        timestamp: new Date().toISOString()
      });
      await db.execute('UPDATE battle_sessions SET units_state = $1, phase = $2, current_faction = $3, current_turn = $4 WHERE id = $5', [JSON.stringify(state), state.phase, state.current_faction, state.turn_number, req.params.id]);
      return res.json({ message: 'RoyRoy 部署成功', state });
    }
    
    if (actionType === 'defend') {
      const { unit_id } = params;
      const unit = (state.units || []).find(u => String(u.id) === String(unit_id));
      if (!unit) {
        return res.status(404).json({ error: '单位不存在' });
      }
      unit.shield = (unit.shield || 0) + 15;
      unit.has_acted = true;
      state.battle_log = state.battle_log || [];
      state.battle_log.push({
        type: 'action',
        message: `${unit.name} 进入防御姿态 (+15 护盾)`,
        timestamp: new Date().toISOString()
      });
      const autoTurnDef = autoTurnCheck(state);
      await db.execute('UPDATE battle_sessions SET units_state = $1, phase = $2, current_faction = $3, current_turn = $4 WHERE id = $5', [JSON.stringify(state), state.phase, state.current_faction, state.turn_number, req.params.id]);
      return res.json({ message: '防御姿态', state, auto_turn_change: autoTurnDef });
    }
    if (actionType === 'wait') {
      const { unit_id } = params;
      const unit = (state.units || []).find(u => String(u.id) === String(unit_id));
      if (!unit) {
        return res.status(404).json({ error: '单位不存在' });
      }
      unit.has_acted = true;
      state.battle_log = state.battle_log || [];
      state.battle_log.push({
        type: 'action',
        message: `${unit.name} 原地待机`,
        timestamp: new Date().toISOString()
      });
      const autoTurnWait = autoTurnCheck(state);
      await db.execute('UPDATE battle_sessions SET units_state = $1, phase = $2, current_faction = $3, current_turn = $4 WHERE id = $5', [JSON.stringify(state), state.phase, state.current_faction, state.turn_number, req.params.id]);
      return res.json({ message: '待机', state, auto_turn_change: autoTurnWait });
    }

    if (actionType === 'skip_tactical') {
      const { unit_id } = params;
      try {
        TurnManager.skipTacticalPhase(state, unit_id);
        const autoTurnSkip = autoTurnCheck(state);
        await db.execute('UPDATE battle_sessions SET units_state = $1, phase = $2, current_faction = $3, current_turn = $4 WHERE id = $5', [JSON.stringify(state), state.phase, state.current_faction, state.turn_number, req.params.id]);
        return res.json({ message: '跳过战术环节', state, auto_turn_change: autoTurnSkip });
      } catch (e) {
        return res.status(400).json({ error: e.message });
      }
    }

    if (actionType === 'skip_move') {
      const { unit_id } = params;
      try {
        TurnManager.skipMovePhase(state, unit_id);
        const autoTurnSkipM = autoTurnCheck(state);
        await db.execute('UPDATE battle_sessions SET units_state = $1, phase = $2, current_faction = $3, current_turn = $4 WHERE id = $5', [JSON.stringify(state), state.phase, state.current_faction, state.turn_number, req.params.id]);
        return res.json({ message: '跳过移动', state, auto_turn_change: autoTurnSkipM });
      } catch (e) {
        return res.status(400).json({ error: e.message });
      }
    }

    if (actionType === 'scout') {
      const { unit_id, center_q, center_r } = params;
      const scoutUnit = (state.units || []).find(u => String(u.id) === String(unit_id));
      if (!scoutUnit) {
        return res.status(404).json({ error: '单位不存在' });
      }
      const scoutResult = CombatResolver.resolveScoutReveal ?
        CombatResolver.resolveScoutReveal({ q: center_q, r: center_r }, state.units) :
        { revealed_units: [] };
      // 或者用 TurnManager 的 revealConcealedUnits
      TurnManager.revealConcealedUnits(state, center_q, center_r, state.units);
      scoutUnit.has_acted = true;
      const autoTurnScout = autoTurnCheck(state);
      await db.execute('UPDATE battle_sessions SET units_state = $1, phase = $2, current_faction = $3, current_turn = $4 WHERE id = $5', [JSON.stringify(state), state.phase, state.current_faction, state.turn_number, req.params.id]);
      return res.json({ message: '侦察执行完成', state, auto_turn_change: autoTurnScout, result: scoutResult });
    }

    res.status(400).json({ error: '未知的行动类型' });
  } catch (error) {
    console.error('Action error:', error);
    res.status(500).json({ error: '行动失败' });
  }
});

// ===== 胜利条件设置 =====
router.post('/:id/victory-conditions', authenticate, async (req, res) => {
  try {
    const { conditions, target_q, target_r, hold_round, capture_points, target_facility_faction } = req.body;
    const battle = await db.get('SELECT * FROM battle_sessions WHERE id = $1', [req.params.id]);
    if (!battle) return res.status(404).json({ error: '战斗不存在' });

    const state = JSON.parse(battle.units_state || '{}');
    state.victory_conditions = conditions || ['annihilate'];
    if (target_q !== undefined && target_r !== undefined) {
      state.victory_targets = [{ q: target_q, r: target_r }];
    }
    if (hold_round) state.victory_hold_round = hold_round;
    if (capture_points) state.victory_capture_points = capture_points;
    if (target_facility_faction) state.victory_target_destroyer = target_facility_faction;

    await db.execute('UPDATE battle_sessions SET units_state = $1 WHERE id = $2', [JSON.stringify(state), req.params.id]);
    res.json({ message: '胜利条件已设置', victory_conditions: state.victory_conditions });
  } catch (error) {
    console.error('Victory conditions error:', error);
    res.status(500).json({ error: '设置胜利条件失败' });
  }
});

// 获取胜利条件
router.get('/:id/victory-conditions', authenticate, async (req, res) => {
  try {
    const state = await getBattleState(req.params.id);
    if (!state) return res.status(404).json({ error: '战斗不存在' });
    res.json({
      victory_conditions: state.victory_conditions || ['annihilate'],
      victory_targets: state.victory_targets || [],
      victory_hold_round: state.victory_hold_round || 8,
      victory_capture_points: state.victory_capture_points || [],
      victory_target_destroyer: state.victory_target_destroyer || null,
      round_number: TurnManager.getRoundNumber(state),
    });
  } catch (error) {
    res.status(500).json({ error: '获取胜利条件失败' });
  }
});

// ===== ACE 单位设置 =====
router.post('/:id/ace-unit', authenticate, async (req, res) => {
  try {
    const { faction, unit_id } = req.body;
    if (!faction || !unit_id) {
      return res.status(400).json({ error: '缺少 faction 或 unit_id' });
    }
    const battle = await db.get('SELECT * FROM battle_sessions WHERE id = $1', [req.params.id]);
    if (!battle) return res.status(404).json({ error: '战斗不存在' });

    const state = JSON.parse(battle.units_state || '{}');
    if (!state.ace_units) state.ace_units = {};
    state.ace_units[faction] = unit_id;

    await db.execute('UPDATE battle_sessions SET units_state = $1 WHERE id = $2', [JSON.stringify(state), req.params.id]);
    res.json({ message: `${faction} ACE 已设置`, ace_units: state.ace_units });
  } catch (error) {
    console.error('ACE set error:', error);
    res.status(500).json({ error: '设置ACE失败' });
  }
});

// 获取 ACE 单位
router.get('/:id/ace-unit', authenticate, async (req, res) => {
  try {
    const state = await getBattleState(req.params.id);
    if (!state) return res.status(404).json({ error: '战斗不存在' });
    res.json({ ace_units: state.ace_units || {} });
  } catch (error) {
    res.status(500).json({ error: '获取ACE失败' });
  }
});

// ===== 坐标跳转 (移动单位到指定坐标) =====
router.post('/:id/jump-to', authenticate, async (req, res) => {
  try {
    const { unit_id, target_q, target_r } = req.body;
    const battle = await db.get('SELECT * FROM battle_sessions WHERE id = $1', [req.params.id]);
    if (!battle) return res.status(404).json({ error: '战斗不存在' });

    const state = JSON.parse(battle.units_state || '{}');
    const unit = (state.units || []).find(u => String(u.id) === String(unit_id));
    if (!unit) return res.status(404).json({ error: '单位不存在' });
    if (unit.has_moved) return res.status(400).json({ error: '该单位本回合已移动' });

    // 验证目标格在边界内
    const gridW = state.grid_width || 20;
    const gridH = state.grid_height || 15;
    if (target_q < 0 || target_q >= gridW || target_r < 0 || target_r >= gridH) {
      return res.status(400).json({ error: '目标坐标超出地图边界' });
    }

    // 验证目标格未被占用
    const occupied = (state.units || []).find(u => u.q === target_q && u.r === target_r && u.hp > 0);
    if (occupied) return res.status(400).json({ error: '目标格已被占用' });

    // 验证移动范围（使用机动值）
    const rawMob = unit.mobility || 3;
    const movePoints = Math.floor(rawMob / 2) || 1;
    const dist = TurnManager.calculateDistance(
      { q: unit.q, r: unit.r },
      { q: target_q, r: target_r }
    );
    if (dist > movePoints) {
      return res.status(400).json({ error: `移动距离 ${dist} 超出机动范围 ${movePoints}` });
    }

    // 执行移动
    const fromCoord = `${unit.q},${unit.r}`;
    unit.q = target_q;
    unit.r = target_r;
    unit.has_moved = true;

    // 隐匿检查：条件4 - 非友方直线路径
    const allUnits = state.units || [];
    for (const u of allUnits) {
      if (u.id === unit.id || u.hp <= 0 || !u.concealed) continue;
      if (u.faction === unit.faction) continue;
      if (TurnManager._onStraightLine(unit, u)) {
        u.concealed = false;
        state.battle_log.push({
          type: 'conceal_break',
          unit_id: u.id,
          unit_name: u.name,
          message: `${u.name} 因非友方 ${unit.name} 在直线路径上而暴露`,
          timestamp: new Date().toISOString()
        });
      }
    }

    // 恢复隐匿（偷袭阵营跳过战术环节后移动）
    if (unit.concealRestorePending && unit.faction === 'maxion') {
      unit.concealed = true;
      unit.concealRestorePending = false;
      unit.concealDuration = 999;
    }

    state.battle_log = state.battle_log || [];
    state.battle_log.push({
      type: 'move',
      message: `${unit.name} 从 (${fromCoord}) 移动到 (${target_q},${target_r})`,
      timestamp: new Date().toISOString()
    });

    // 检查胜利条件
    const victoryCheck = TurnManager.checkVictory(state);
    if (victoryCheck.victory) {
      state.phase = 'ended';
      state.winner = victoryCheck.winner;
    }

    const autoTurnResult = autoTurnCheck(state);
    await db.execute('UPDATE battle_sessions SET units_state = $1, phase = $2, current_faction = $3, current_turn = $4 WHERE id = $5', [JSON.stringify(state), state.phase, state.current_faction, state.turn_number, req.params.id]);
    res.json({
      message: '移动成功',
      state,
      auto_turn_change: autoTurnResult,
      victory: victoryCheck.victory ? victoryCheck : undefined
    });
  } catch (error) {
    console.error('Jump error:', error);
    res.status(500).json({ error: '坐标跳转失败' });
  }
});

// ===== 获取阵营能力冷却信息 =====
router.get('/:id/faction-cooldowns', authenticate, async (req, res) => {
  try {
    const state = await getBattleState(req.params.id);
    if (!state) return res.status(404).json({ error: '战斗不存在' });
    res.json({
      fireCoverageUsed: state.fireCoverageUsed || state.earthArtilleryUsed || false,
      fogSystemUsed: state.fogSystemUsed || false,
      fogCooldownRemaining: state.fogCooldownRemaining || 0,
      reinforcementUsed: state.reinforcementUsed || false,
      supplyAvailable: true, // 补给被动始终可用
      round_number: TurnManager.getRoundNumber(state),
      ace_units: state.ace_units || {},
      faction_roles: state.faction_roles || {},
    });
  } catch (error) {
    res.status(500).json({ error: '获取冷却信息失败' });
  }
});

// 防守阵营：增援（被动技能，1格内友军代受80%伤害）
router.post('/:id/support', authenticate, async (req, res) => {
  try {
    const { support_unit_id, target_unit_id } = req.body;
    const battle = await db.get('SELECT * FROM battle_sessions WHERE id = $1', [req.params.id]);

    if (!battle) {
      return res.status(404).json({ error: '战斗不存在' });
    }

    const state = JSON.parse(battle.units_state || '{}');

    const supportUnit = (state.units || []).find(u => String(u.id) === String(support_unit_id));
    const targetUnit = (state.units || []).find(u => String(u.id) === String(target_unit_id));

    if (!supportUnit || !targetUnit) {
      return res.status(404).json({ error: '单位不存在' });
    }

    // 验证防守阵营角色
    const factionRoles = state.faction_roles || {};
    const role = factionRoles[supportUnit.faction] || 'defense';
    if (role !== 'defense') {
      return res.status(400).json({ error: '只有防守阵营可以使用增援' });
    }

    // 检查距离（1格范围内）
    const dq = Math.abs((targetUnit.q || 0) - (supportUnit.q || 0));
    const dr = Math.abs((targetUnit.r || 0) - (supportUnit.r || 0));
    const dist = Math.max(dq, dr, Math.abs(dq + dr));
    if (dist > 1) {
      return res.status(400).json({ error: '增援仅限1格范围内的友军（当前距离 ' + dist + ' 格）' });
    }

    // 计算增援伤害（友军承受80%，目标承担20%）
    const pendingDamage = state.pending_damage || 10;
    const redirectedDamage = Math.floor(pendingDamage * 0.8);
    const targetDamage = pendingDamage - redirectedDamage;

    // 应用伤害
    supportUnit.hp = Math.max(0, supportUnit.hp - redirectedDamage);

    state.battle_log = state.battle_log || [];
    state.battle_log.push({
      type: 'reinforcement',
      unit_id: supportUnit.id,
      unit_name: supportUnit.name || supportUnit.id,
      target_id: targetUnit.id,
      target_name: targetUnit.name || targetUnit.id,
      redirected_damage: redirectedDamage,
      target_damage: targetDamage,
      message: (supportUnit.name || supportUnit.id) + ' 增援了 ' + (targetUnit.name || targetUnit.id) + '！承受 ' + redirectedDamage + ' 伤害（目标承担 ' + targetDamage + '）',
      timestamp: new Date().toISOString()
    });

    state.reinforcement_applied = true;
    state.reinforcement_target_damage = targetDamage;

    if (supportUnit.hp <= 0) {
      state.battle_log.push({
        type: 'destroyed',
        unit: supportUnit.name || supportUnit.id,
        destroyed_by: '增援牺牲',
        timestamp: new Date().toISOString()
      });
    }

    await db.execute('UPDATE battle_sessions SET units_state = $1, phase = $2, current_faction = $3, current_turn = $4 WHERE id = $5',
      [JSON.stringify(state), state.phase, state.current_faction, state.turn_number, req.params.id]);

    res.json({
      message: '增援成功',
      redirected_damage: redirectedDamage,
      target_damage: targetDamage,
      support_unit_hp: supportUnit.hp,
      state
    });
  } catch (error) {
    console.error('Reinforcement error:', error);
    res.status(500).json({ error: '增援失败' });
  }
});

// 强攻（攻击阵营技能）
router.post('/:id/assault', authenticate, async (req, res) => {
  try {
    const { unit_id } = req.body;
    const battle = await db.get('SELECT * FROM battle_sessions WHERE id = $1', [req.params.id]);
    if (!battle) return res.status(404).json({ error: '战斗不存在' });
    const state = JSON.parse(battle.units_state || '{}');
    const unit = (state.units || []).find(u => String(u.id) === String(unit_id));
    if (!unit) return res.status(404).json({ error: '单位不存在' });
    
    // 强攻：攻击力+30%
    unit.attack_bonus = (unit.attack_bonus || 0) + Math.floor((unit.attack || 0) * 0.3);
    state.assaultUsed = true;
    state.battle_log = state.battle_log || [];
    state.battle_log.push({
      type: 'assault',
      message: `${unit.name} 发动强攻，攻击力+30%`,
      timestamp: new Date().toISOString()
    });
    
    await db.execute('UPDATE battle_sessions SET units_state = $1 WHERE id = $2', [JSON.stringify(state), req.params.id]);
    res.json({ message: '强攻发动', state });
  } catch (error) {
    res.status(500).json({ error: '强攻失败' });
  }
});

// 加固（防守阵营技能）
router.post('/:id/fortify', authenticate, async (req, res) => {
  try {
    const { unit_id } = req.body;
    const battle = await db.get('SELECT * FROM battle_sessions WHERE id = $1', [req.params.id]);
    if (!battle) return res.status(404).json({ error: '战斗不存在' });
    const state = JSON.parse(battle.units_state || '{}');
    const unit = (state.units || []).find(u => String(u.id) === String(unit_id));
    if (!unit) return res.status(404).json({ error: '单位不存在' });
    
    // 加固：防御力+30%
    unit.defense_bonus = (unit.defense_bonus || 0) + Math.floor((unit.defense || 0) * 0.3);
    state.fortifyUsed = true;
    state.battle_log = state.battle_log || [];
    state.battle_log.push({
      type: 'fortify',
      message: `${unit.name} 发动加固，防御力+30%`,
      timestamp: new Date().toISOString()
    });
    
    await db.execute('UPDATE battle_sessions SET units_state = $1 WHERE id = $2', [JSON.stringify(state), req.params.id]);
    res.json({ message: '加固发动', state });
  } catch (error) {
    res.status(500).json({ error: '加固失败' });
  }
});

// 隐匿（偷袭阵营技能 - 全员可用，无视ACE）
router.post('/:id/conceal', authenticate, async (req, res) => {
  try {
    const { unit_id } = req.body;
    const battle = await db.get('SELECT * FROM battle_sessions WHERE id = $1', [req.params.id]);
    if (!battle) return res.status(404).json({ error: '战斗不存在' });
    const state = JSON.parse(battle.units_state || '{}');
    const unit = (state.units || []).find(u => String(u.id) === String(unit_id));
    if (!unit) return res.status(404).json({ error: '单位不存在' });
    
    // 隐匿：不检查ACE，偷袭阵营全员可用
    unit.concealed = true;
    unit.concealDuration = 3; // 持续3轮
    unit.concealSource = 'skill';
    state.battle_log = state.battle_log || [];
    state.battle_log.push({
      type: 'conceal',
      message: `${unit.name} 进入隐匿状态`,
      timestamp: new Date().toISOString()
    });
    
    await db.execute('UPDATE battle_sessions SET units_state = $1 WHERE id = $2', [JSON.stringify(state), req.params.id]);
    res.json({ message: '隐匿发动', state });
  } catch (error) {
    res.status(500).json({ error: '隐匿失败' });
  }
});

// ============================================================
export default router;
