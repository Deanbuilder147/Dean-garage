#!/usr/bin/env python3
"""Phase 12.2 v2: WebSocket 手动摇骰完整闭环
- battles.js: 检测 is_manual_roll → 挂起 → POST /:id/manual-roll-result
- socketService.js: manual_roll_response 增强广播
"""

BASE = '/root/original-project'

# ============ 1. battles.js ============
battles_path = f'{BASE}/services/combat-service/src/routes/battles.js'
with open(battles_path, 'r') as f:
    battles = f.read()

# 添加 pendingManualTurns Map
old_router = "const router = express.Router();"
new_router = """const router = express.Router();

// Phase 12: 手动摇骰挂起的回合数据
const pendingManualTurns = new Map();"""
battles = battles.replace(old_router, new_router)

# 在攻击路由中注入 is_manual_roll 检测
old_attack_start = """    // 注入防御方地形
    injectTerrain(state, target);

    // 战斗结算
    const combatResult = CombatResolver.resolveAttack(attacker, target, attack_type, skill_id);"""

new_attack_start = """    // 注入防御方地形
    injectTerrain(state, target);

    // Phase 12: 检测手动摇骰技能
    let pendingRoll = false;
    let pendingDiceType = '1d6';
    let pendingSuccessLine = 4;
    if (skill_id) {
        const glossary = getGlossaryConfig();
        const skillDef = glossary?.skills?.[skill_id];
        if (skillDef && skillDef.is_manual_roll) {
            pendingRoll = true;
            pendingDiceType = skillDef.dice_type || '1d6';
            pendingSuccessLine = skillDef.success_line ?? 4;
        }
    }

    // Phase 12: 手动摇骰 → 挂起并等待客户端结果
    if (pendingRoll) {
        const turnId = `turn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        pendingManualTurns.set(turnId, {
            battleId: req.params.id,
            attacker,
            target,
            attack_type,
            skill_id,
            state,
            createdAt: Date.now()
        });
        // 60 秒超时自动清理
        setTimeout(() => { pendingManualTurns.delete(turnId); }, 60000);

        return res.json({
            status: 'pending_roll',
            turnId,
            dice_type: pendingDiceType,
            success_line: pendingSuccessLine,
            message: '该技能需要手动摇骰，请通过 POST /:id/manual-roll-result 提交结果'
        });
    }

    // 战斗结算
    const combatResult = CombatResolver.resolveAttack(attacker, target, attack_type, skill_id);"""

battles = battles.replace(old_attack_start, new_attack_start)
print('[Battles Step 1] is_manual_roll 检测注入完成')

# 添加路由：在 export default router 之前
old_export = "export default router;"
new_routes = """// Phase 12: 手动摇骰结果提交
router.post('/:id/manual-roll-result', authenticate, async (req, res) => {
  try {
    const { turnId, roll } = req.body;
    if (!turnId || roll === undefined) {
      return res.status(400).json({ error: '缺少 turnId 或 roll' });
    }

    const pending = pendingManualTurns.get(turnId);
    if (!pending) {
      return res.status(404).json({ error: '未找到挂起的摇骰回合（可能已超时）' });
    }
    pendingManualTurns.delete(turnId);

    const { attacker, target, attack_type, skill_id, state, createdAt } = pending;
    console.log(`[Phase12] 手动摇骰完成 turnId=${turnId} roll=${roll} 等待=${Date.now() - createdAt}ms`);

    // 构建 external_roll_result
    const glossary = getGlossaryConfig();
    const skillDef = glossary?.skills?.[skill_id] || {};
    const external_roll_result = {
      roll,
      dice_type: skillDef.dice_type || '1d6',
      success_line: skillDef.success_line ?? 4,
      bonus_damage: skillDef.success_bonus_damage ?? 0,
      isSuccess: roll >= (skillDef.success_line ?? 4)
    };

    // 重新执行完整攻击（带掷骰结果）
    const combatResult = CombatResolver.resolveAttack(attacker, target, attack_type, skill_id, external_roll_result);

    // 更新状态
    attacker.dealtDamageThisTurn = true;
    attacker.has_acted = true;

    state.battle_log = state.battle_log || [];
    state.battle_log.push({
      type: 'attack',
      attacker: attacker.name,
      target: target.name,
      attack_type,
      skill_id,
      damage: combatResult.final_damage,
      manual_roll: roll,
      target_hp: target.hp,
      timestamp: new Date().toISOString()
    });

    if (target.hp <= 0) {
      state.units = state.units.filter(u => String(u.id) !== String(target.id));
      state.battle_log.push({
        type: 'destroyed',
        unit: target.name,
        destroyed_by: attacker.name
      });
    }

    // 检查回合推进
    const autoTurnResult = autoTurnCheck(state);

    await db.execute(
      'UPDATE battle_sessions SET units_state = $1, phase = $2, current_faction = $3, current_turn = $4 WHERE id = $5',
      [JSON.stringify(state), state.phase, state.current_faction, state.turn_number, req.params.id]
    );

    res.json({
      message: '手动摇骰攻击完成',
      status: 'roll_resolved',
      turnId,
      manual_roll: { roll, dice_type: external_roll_result.dice_type, success_line: external_roll_result.success_line, isSuccess: external_roll_result.isSuccess },
      combat_result: combatResult,
      state
    });
  } catch (error) {
    console.error('[Phase12] manual-roll-result error:', error);
    res.status(500).json({ error: '手动摇骰结算失败' });
  }
});

// Phase 12: 查询挂起的摇骰（客户端重连恢复）
router.get('/:id/pending-roll', authenticate, async (req, res) => {
  try {
    const pendingList = [];
    for (const [turnId, data] of pendingManualTurns.entries()) {
      if (data.battleId === req.params.id) {
        const glossary = getGlossaryConfig();
        const skillDef = glossary?.skills?.[data.skill_id] || {};
        pendingList.push({
          turnId,
          attacker_id: data.attacker.id,
          target_id: data.target.id,
          dice_type: skillDef.dice_type || '1d6',
          success_line: skillDef.success_line ?? 4,
          createdAt: data.createdAt
        });
      }
    }
    res.json({ status: 'ok', pending: pendingList });
  } catch (error) {
    res.status(500).json({ error: '查询失败' });
  }
});

export default router;"""

battles = battles.replace(old_export, new_routes)
print('[Battles Step 2] manual-roll-result 路由添加完成')

with open(battles_path, 'w') as f:
    f.write(battles)

# ============ 2. socketService.js ============
socket_path = f'{BASE}/services/combat-service/src/services/socketService.js'
with open(socket_path, 'r') as f:
    socket = f.read()

old_roll = """      case 'manual_roll_response':
        // Phase 11: 摇骰结果回传 -> 发给请求方
        console.log(`客户端 ${clientId} 摇骰结果:`, data);
        if (data.requestClientId) {
          this.sendToClient(data.requestClientId, {
            type: 'manual_roll_result',
            clientId,
            ...data,
            timestamp: new Date().toISOString()
          });
        }
        break;"""

new_roll = """      case 'manual_roll_response':
        // Phase 12: 摇骰结果回传 -> 发给请求方 + 广播房间
        console.log(`[Phase12] 客户端 ${clientId} 摇骰结果: turnId=${data.turnId} roll=${data.roll}`);
        if (data.requestClientId) {
          this.sendToClient(data.requestClientId, {
            type: 'manual_roll_result',
            clientId,
            turnId: data.turnId,
            roll: data.roll,
            diceType: data.dice_type || '1d6',
            successLine: data.success_line || 4,
            isSuccess: data.roll >= (data.success_line || 4),
            timestamp: new Date().toISOString()
          });
        }
        // 广播给房间所有客户端
        if (data.turnId) {
          this.broadcastToBattle(battleId, {
            type: 'manual_roll_broadcast',
            clientId,
            turnId: data.turnId,
            roll: data.roll,
            diceType: data.dice_type || '1d6',
            timestamp: new Date().toISOString()
          });
        }
        break;"""

socket = socket.replace(old_roll, new_roll)

with open(socket_path, 'w') as f:
    f.write(socket)
print('[OK] socketService.js 增强完成')
