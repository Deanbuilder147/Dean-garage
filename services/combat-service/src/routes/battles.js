import express from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import db from '../database/db.js';
import { CombatResolver } from '../services/combatResolver.js';
import { TurnManager } from '../services/turnManager.js';
import { validateRequest, createBattleSchema, moveSchema, attackSchema, battleActionSchema } from '../validators/battle.validators.js';

const router = express.Router();

// JWT 配置（与 auth-service 保持一致）
// 环境变量必须设置，无 fallback（安全要求）
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.refine(val => val, { message: '[启动错误] JWT_SECRET 环境变量必须设置！' });
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

// 获取战斗会话列表
router.get('/', authenticate, (req, res) => {
  try {
    const battles = db.prepare(
      'SELECT * FROM battle_sessions ORDER BY created_at DESC'
    ).all();
    res.json({ battles });
  } catch (error) {
    console.error('Get battles error:', error);
    res.status(500).json({ error: '获取战斗列表失败' });
  }
});

// 获取战斗详情
router.get('/:id', authenticate, (req, res) => {
  try {
    const battle = db.prepare(
      'SELECT * FROM battle_sessions WHERE id = ?'
    ).get(req.params.id);
    
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

    // TODO: 需要从地图服务获取战场信息
    // const battlefield = await fetch(`${process.env.MAP_SERVICE_URL}/api/battlefields/${battlefield_id}`);
    
    // 简化处理：先假设战场存在
    const battlefield = { id: battlefield_id, width: 10, height: 10, terrain: '{}' };

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

    // 解析地形
    let terrainMap = {};
    try {
      terrainMap = JSON.parse(battlefield.terrain || '{}');
    } catch (e) {}

    // 生成格子数据
    const cells = [];
    for (let q = 0; q < battlefield.width; q++) {
      for (let r = 0; r < battlefield.height; r++) {
        const key = `${q},${r}`;
        cells.push({
          q,
          r,
          terrain: terrainMap[key] || 'lunar'
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

    const stateStr = JSON.stringify(initialState);
    const result = db.run(
      'INSERT INTO battle_sessions (battlefield_id, room_id, units_state, status, phase, current_faction, current_turn, spawn_phase_done, spawn_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [battlefield_id, room_id || null, stateStr, 'active', room_id ? 'spawn_selection' : 'deployment', 'earth', 1, 0, JSON.stringify(spawnOrder)]
    );

    const battle = db.prepare('SELECT * FROM battle_sessions WHERE id = ?').get(result.lastInsertRowid);

    res.status(201).json({
      message: '战斗创建成功',
      battle: {
        ...battle,
        battlefield_state: initialState
      }
    });
  } catch (error) {
    console.error('Create battle error:', error);
    res.status(500).json({ error: '创建战斗失败' });
  }
});

// 执行移动
router.post('/:id/move', authenticate, async (req, res) => {
  try {
    // Validate request with Zod
    const validation = validateRequest(moveSchema, req.body);
    if (!validation.success) {
      return res.status(400).json(validation.error);
    }
    
    const { unit_id, target_q, target_r } = validation.data;
    
    const battle = db.prepare(
      'SELECT * FROM battle_sessions WHERE id = ?'
    ).get(req.params.id);
    
    if (!battle) {
      return res.status(404).json({ error: '战斗不存在' });
    }
    
    const state = JSON.parse(battle.units_state || '{}');
    const unit = state.units?.find(u => u.id === unit_id);
    
    if (!unit) {
      return res.status(404).json({ error: '单位不存在' });
    }
    
    // 计算移动范围
    const movementRange = unit.机动 || 3;
    const distance = Math.abs(target_q - unit.q) + Math.abs(target_r - unit.r);
    
    if (distance > movementRange) {
      return res.status(400).json({ error: '目标超出移动范围' });
    }
    
    // 更新位置
    unit.q = target_q;
    unit.r = target_r;
    unit.has_moved = true;
    
    // 保存状态
    db.prepare(
      'UPDATE battle_sessions SET units_state = ? WHERE id = ?'
    ).run(JSON.stringify(state), req.params.id);
    
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
    
    const battle = db.prepare(
      'SELECT * FROM battle_sessions WHERE id = ?'
    ).get(req.params.id);
    
    if (!battle) {
      return res.status(404).json({ error: '战斗不存在' });
    }
    
    const state = JSON.parse(battle.units_state || '{}');
    const attacker = state.units?.find(u => u.id === attacker_id);
    const target = state.units?.find(u => u.id === target_id);
    
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
    
    // 战斗结算
    const combatResult = CombatResolver.resolveAttack(attacker, target, attack_type);
    
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
    target.hp = combatResult.target_hp_after;
    attacker.has_acted = true;
    
    // 添加战斗日志
    state.battle_log = state.battle_log || [];
    state.battle_log.push({
      type: 'attack',
      attacker: attacker.name,
      target: target.name,
      attack_type,
      damage: combatResult.final_damage,
      target_hp: combatResult.target_hp_after,
      timestamp: new Date().toISOString()
    });
    
    // 检查目标是否死亡
    if (combatResult.target_hp_after <= 0) {
      state.units = state.units.filter(u => u.id !== target_id);
      state.battle_log.push({
        type: 'destroyed',
        unit: target.name,
        destroyed_by: attacker.name
      });
    }
    
    // 保存状态
    db.prepare(
      'UPDATE battle_sessions SET units_state = ? WHERE id = ?'
    ).run(JSON.stringify(state), req.params.id);
    
    res.json({ 
      message: '攻击结算完成',
      combat_result: combatResult,
      state
    });
  } catch (error) {
    console.error('Attack error:', error);
    res.status(500).json({ error: '攻击失败' });
  }
});

// 处理奇袭选择
router.post('/:id/surprise-choice', authenticate, (req, res) => {
  try {
    const { choice, surprise_unit_id, original_attacker_id, target_id, attack_type } = req.body;
    // choice: 'replace' | 'counter' | 'giveup'
    
    const battle = db.prepare(
      'SELECT * FROM battle_sessions WHERE id = ?'
    ).get(req.params.id);
    
    if (!battle) {
      return res.status(404).json({ error: '战斗不存在' });
    }
    
    const state = JSON.parse(battle.units_state || '{}');
    const originalAttacker = state.units?.find(u => u.id === original_attacker_id);
    const target = state.units?.find(u => u.id === target_id);
    
    if (!originalAttacker || !target) {
      return res.status(404).json({ error: '单位不存在' });
    }
    
    state.battle_log = state.battle_log || [];
    
    if (choice === 'giveup') {
      // 放弃奇袭，执行原攻击
      const result = CombatResolver.resolveAttack(originalAttacker, target, attack_type);
      
      target.hp = result.target_hp_after;
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
        target_hp: result.target_hp_after,
        timestamp: new Date().toISOString()
      });
      
      if (result.target_hp_after <= 0) {
        state.units = state.units.filter(u => u.id !== target_id);
        state.battle_log.push({
          type: 'destroyed',
          unit: target.name,
          destroyed_by: originalAttacker.name
        });
      }
      
      db.prepare(
        'UPDATE battle_sessions SET units_state = ? WHERE id = ?'
      ).run(JSON.stringify(state), req.params.id);
      
      res.json({ 
        message: '放弃奇袭，原攻击执行完成',
        combat_result: result,
        state
      });
      return;
    }
    
    if (choice === 'replace') {
      // 顶替：取消原攻击，奇袭单位执行攻击
      const surpriseUnit = state.units?.find(u => u.id === surprise_unit_id);
      if (!surpriseUnit) {
        return res.status(404).json({ error: '奇袭单位不存在' });
      }
      
      const result = CombatResolver.resolveSurpriseAttack(surpriseUnit, target, attack_type);
      
      target.hp = result.target_hp_after;
      surpriseUnit.has_acted = true;
      
      state.battle_log.push({
        type: 'surprise_replace',
        message: `${surpriseUnit.name} 顶替了 ${originalAttacker.name} 的攻击`,
        dice_roll: result.dice_roll,
        dice_color: result.dice_color,
        damage: result.final_damage,
        target_hp: result.target_hp_after,
        timestamp: new Date().toISOString()
      });
      
      if (result.target_hp_after <= 0) {
        state.units = state.units.filter(u => u.id !== target_id);
        state.battle_log.push({
          type: 'destroyed',
          unit: target.name,
          destroyed_by: surpriseUnit.name
        });
      }
      
      db.prepare(
        'UPDATE battle_sessions SET units_state = ? WHERE id = ?'
      ).run(JSON.stringify(state), req.params.id);
      
      res.json({ 
        message: '奇袭顶替成功',
        combat_result: result,
        state
      });
      return;
    }
    
    if (choice === 'counter') {
      // 先制：原攻击继续，奇袭单位额外攻击
      const surpriseUnit = state.units?.find(u => u.id === surprise_unit_id);
      if (!surpriseUnit) {
        return res.status(404).json({ error: '奇袭单位不存在' });
      }
      
      // 执行原攻击
      const originalResult = CombatResolver.resolveAttack(originalAttacker, target, attack_type);
      
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
        state.units = state.units.filter(u => u.id !== target_id);
        state.battle_log.push({
          type: 'destroyed',
          unit: target.name,
          destroyed_by: surpriseUnit.name
        });
      }
      
      db.prepare(
        'UPDATE battle_sessions SET units_state = ? WHERE id = ?'
      ).run(JSON.stringify(state), req.params.id);
      
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
router.post('/:id/end-turn', authenticate, (req, res) => {
  try {
    const battle = db.prepare(
      'SELECT * FROM battle_sessions WHERE id = ?'
    ).get(req.params.id);
    
    if (!battle) {
      return res.status(404).json({ error: '战斗不存在' });
    }
    
    const state = JSON.parse(battle.units_state || '{}');
    const nextState = TurnManager.nextTurn(state);
    
    db.prepare(
      'UPDATE battle_sessions SET units_state = ?, phase = ? WHERE id = ?'
    ).run(JSON.stringify(nextState), nextState.phase, req.params.id);
    
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
router.post('/:id/artillery', authenticate, (req, res) => {
  try {
    const { center_q, center_r } = req.body;
    
    const battle = db.prepare(
      'SELECT * FROM battle_sessions WHERE id = ?'
    ).get(req.params.id);
    
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
    db.prepare(
      'UPDATE battle_sessions SET units_state = ? WHERE id = ?'
    ).run(JSON.stringify(state), req.params.id);
    
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

// 马克西翁：迷雾系统
router.post('/:id/fog-system', authenticate, (req, res) => {
  try {
    const battle = db.prepare(
      'SELECT * FROM battle_sessions WHERE id = ?'
    ).get(req.params.id);
    
    if (!battle) {
      return res.status(404).json({ error: '战斗不存在' });
    }
    
    const state = JSON.parse(battle.units_state || '{}');
    
    if (state.current_faction !== 'maxion') {
      return res.status(400).json({ error: '只有马克西翁可以使用迷雾系统' });
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
    db.prepare(
      'UPDATE battle_sessions SET units_state = ? WHERE id = ?'
    ).run(JSON.stringify(state), req.params.id);
    
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
router.post('/:id/select-spawn', authenticate, (req, res) => {
  try {
    const { q, r } = req.body;
    const battle = db.prepare('SELECT * FROM battle_sessions WHERE id = ?').get(req.params.id);
    
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
    
    db.prepare('UPDATE battle_sessions SET units_state = ?, phase = ?, spawn_order = ? WHERE id = ?')
      .run(JSON.stringify(state), state.phase, JSON.stringify(state.spawn_order), req.params.id);
    
    res.json({ message: '出生点选择成功', state });
  } catch (error) {
    console.error('Select spawn error:', error);
    res.status(500).json({ error: '选择出生点失败' });
  }
});

// 部署单位（出生点部署阶段）
router.post('/:id/deploy-unit', authenticate, (req, res) => {
  try {
    const { unit_id, q, r } = req.body;
    const battle = db.prepare('SELECT * FROM battle_sessions WHERE id = ?').get(req.params.id);
    
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
      // 从待部署列表获取单位信息（简化：创建基础单位）
      state.units.push({
        id: unit_id,
        name: 'Unit ' + unit_id,
        q, r,
        hp: 100,
        max_hp: 100,
        faction: 'earth',
        has_acted: false,
        has_moved: false
      });
    }
    
    db.prepare('UPDATE battle_sessions SET units_state = ? WHERE id = ?')
      .run(JSON.stringify(state), req.params.id);
    
    res.json({ message: '单位部署成功', state });
  } catch (error) {
    console.error('Deploy unit error:', error);
    res.status(500).json({ error: '部署单位失败' });
  }
});

// 结束部署阶段
router.post('/:id/end-deployment', authenticate, (req, res) => {
  try {
    const battle = db.prepare('SELECT * FROM battle_sessions WHERE id = ?').get(req.params.id);
    
    if (!battle) {
      return res.status(404).json({ error: '战斗不存在' });
    }
    
    const state = JSON.parse(battle.units_state || '{}');
    state.phase = 'tactical';
    
    db.prepare('UPDATE battle_sessions SET units_state = ?, phase = ? WHERE id = ?')
      .run(JSON.stringify(state), state.phase, req.params.id);
    
    res.json({ message: '部署阶段结束', state });
  } catch (error) {
    console.error('End deployment error:', error);
    res.status(500).json({ error: '结束部署失败' });
  }
});

// 结束战术阶段
router.post('/:id/end-tactical', authenticate, (req, res) => {
  try {
    const battle = db.prepare('SELECT * FROM battle_sessions WHERE id = ?').get(req.params.id);
    
    if (!battle) {
      return res.status(404).json({ error: '战斗不存在' });
    }
    
    const state = JSON.parse(battle.units_state || '{}');
    state.phase = 'deployment';
    state.turn_number = 1;
    state.current_faction = 'earth';
    
    db.prepare('UPDATE battle_sessions SET units_state = ?, phase = ?, current_faction = ?, turn_number = ? WHERE id = ?')
      .run(JSON.stringify(state), state.phase, state.current_faction, state.turn_number, req.params.id);
    
    res.json({ message: '战术阶段结束', state });
  } catch (error) {
    console.error('End tactical error:', error);
    res.status(500).json({ error: '结束战术阶段失败' });
  }
});

// 通用行动处理（用于火力覆盖等）
router.post('/:id/action', authenticate, (req, res) => {
  try {
    const { actionType, params } = req.body;
    const battle = db.prepare('SELECT * FROM battle_sessions WHERE id = ?').get(req.params.id);
    
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
      
      db.prepare('UPDATE battle_sessions SET units_state = ? WHERE id = ?')
        .run(JSON.stringify(state), req.params.id);
      
      return res.json({ message: '火力覆盖发动成功', state });
    }
    
    res.status(400).json({ error: '未知的行动类型' });
  } catch (error) {
    console.error('Action error:', error);
    res.status(500).json({ error: '行动失败' });
  }
});

// 拜隆增援
router.post('/:id/support', authenticate, (req, res) => {
  try {
    const { support_unit_id } = req.body;
    const battle = db.prepare('SELECT * FROM battle_sessions WHERE id = ?').get(req.params.id);
    
    if (!battle) {
      return res.status(404).json({ error: '战斗不存在' });
    }
    
    const state = JSON.parse(battle.units_state || '{}');
    
    // TODO: 实现拜隆增援逻辑
    // 简化处理：记录增援
    state.battle_log = state.battle_log || [];
    state.battle_log.push({
      type: 'support',
      message: `拜隆单位 ${support_unit_id} 进行增援`,
      timestamp: new Date().toISOString()
    });
    
    db.prepare('UPDATE battle_sessions SET units_state = ? WHERE id = ?')
      .run(JSON.stringify(state), req.params.id);
    
    res.json({ message: '增援成功', state });
  } catch (error) {
    console.error('Support error:', error);
    res.status(500).json({ error: '增援失败' });
  }
});

export default router;