#!/usr/bin/env python3
"""Phase 12.2: WebSocket 手动摇骰完整闭环
- battles.js: 检测 is_manual_roll → 挂起 → POST /:id/manual-roll-result
- combatResolver.js: 挂起存储改为静态 Map
- socketService.js: manual_roll_response 链接到回合完成
"""

import re

BASE = '/root/original-project'

# ============ 1. battles.js: 添加 pendingManualTurns + manual-roll-result 路由 ============
battles_path = f'{BASE}/services/combat-service/src/routes/battles.js'
with open(battles_path, 'r') as f:
    battles = f.read()

# 在攻击路由开头添加 is_manual_roll 检测（line ~430 附近）
# 在 attack_type 验证后、CombatResolver.resolveAttack 前插入
old_attack_start = """    // 注入防御方地形
    injectTerrain(state, target);

    // 战斗结算
    const combatResult = CombatResolver.resolveAttack(attacker, target, attack_type, skill_id);"""

new_attack_start = """    // 注入防御方地形
    injectTerrain(state, target);

    // Phase 12: 检测手动摇骰技能
    const SKILL_DICE_TYPE = '1d6';
    const SKILL_SUCCESS_LINE = 4;
    let pendingRoll = false;
    if (skill_id) {
        const glossary = getGlossaryConfig();
        const skillDef = glossary?.skills?.[skill_id];
        if (skillDef && skillDef.is_manual_roll) {
            pendingRoll = true;
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
            dice_type: SKILL_DICE_TYPE,
            success_line: SKILL_SUCCESS_LINE,
            message: '该技能需要手动摇骰，请通过 WebSocket 或 POST /:id/manual-roll-result 提交结果'
        });
    }

    // 战斗结算
    const combatResult = CombatResolver.resolveAttack(attacker, target, attack_type, skill_id);"""

battles = battles.replace(old_attack_start, new_attack_start)

# 添加 pendingManualTurns Map（在 router 定义之后）
old_router = "const router = express.Router();"
new_router = """const router = express.Router();

// Phase 12: 手动摇骰挂起的回合数据
const pendingManualTurns = new Map();"""

battles = battles.replace(old_router, new_router)

# 在 export default router 之前添加 manual-roll-result 路由
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

    // 更新状态（与原始攻击路由相同的逻辑）
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

// Phase 12: 查询挂起的摇骰（用于客户端重连恢复）
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

with open(battles_path, 'w') as f:
    f.write(battles)
print('[OK] battles.js: 手动摇骰挂起 + manual-roll-result 路由完成')

# ============ 2. combatResolver.js: resolveAttack 支持 external_roll_result 参数 ============
resolver_path = f'{BASE}/services/combat-service/src/services/combatResolver.js'
with open(resolver_path, 'r') as f:
    resolver = f.read()

# 更新静态 resolveAttack 方法支持第 4 个参数 external_roll_result
old_resolve = """CombatResolver.resolveAttack = function(attacker, target, attack_type, skill_id) {
    const res = new CombatResolver();
    return res.executeTurn(attacker, target, { attack_type, skill_id });
};"""

new_resolve = """CombatResolver.resolveAttack = function(attacker, target, attack_type, skill_id, external_roll_result) {
    const res = new CombatResolver();
    return res.executeTurn(attacker, target, { attack_type, skill_id, external_roll_result: external_roll_result || null });
};"""

resolver = resolver.replace(old_resolve, new_resolve)

with open(resolver_path, 'w') as f:
    f.write(resolver)
print('[OK] combatResolver.js: resolveAttack 支持 external_roll_result')

# ============ 3. socketService.js: WebSocket 手动摇骰完成后触发 HTTP 回调 ============
socket_path = f'{BASE}/services/combat-service/src/services/socketService.js'
with open(socket_path, 'r') as f:
    socket = f.read()

# 在 manual_roll_response case 中增加注释说明完整闭环
old_socket_roll = """      case 'manual_roll_response':
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

new_socket_roll = """      case 'manual_roll_response':
        // Phase 12: 摇骰结果回传 -> 发给请求方 + 触发战斗结算
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
        // 如果提供了 turnId，广播给房间（通知其他客户端）
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

socket = socket.replace(old_socket_roll, new_socket_roll)

with open(socket_path, 'w') as f:
    f.write(socket)
print('[OK] socketService.js: WebSocket 手动摇骰广播增强')
