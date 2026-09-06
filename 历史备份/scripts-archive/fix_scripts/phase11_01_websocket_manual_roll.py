#!/usr/bin/env python3
"""
Phase 11.1: 手动摇骰 WebSocket 同步
- socketService.js: 添加 manual_roll_request / manual_roll_response / manual_roll_broadcast 消息类型
- combatResolver.js: 添加 pendingManualRolls Map，支持挂起等待玩家摇骰
- skillExecutor.cjs: 更新 evaluateManualRoll 接受外部掷骰结果
"""

import re

BASE = '/root/original-project'

def patch_socket_service():
    """在 socketService.js 的 switch-case 中添加 manual_roll 相关消息处理"""
    path = f'{BASE}/services/combat-service/src/services/socketService.js'
    with open(path, 'r') as f:
        content = f.read()

    # 1. 在 handleMessage switch 中添加新 case (在 'ping' 之前)
    old_case = """      case 'ping':
        this.sendToClient(clientId, {
          type: 'pong',
          timestamp: new Date().toISOString()
        });
        break;"""

    new_case = """      case 'manual_roll_request':
        // Phase 11: 手动摇骰请求 -> 广播给房间其他玩家
        console.log(`客户端 ${clientId} 请求手动摇骰:`, data);
        this.broadcastToBattle(battleId, {
          type: 'manual_roll_broadcast',
          clientId,
          ...data,
          timestamp: new Date().toISOString()
        });
        break;

      case 'manual_roll_response':
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
        break;

      case 'ping':
        this.sendToClient(clientId, {
          type: 'pong',
          timestamp: new Date().toISOString()
        });
        break;"""

    content = content.replace(old_case, new_case)
    with open(path, 'w') as f:
        f.write(content)
    print('[OK] socketService.js: 添加 manual_roll_request/response 消息处理')


def patch_combat_resolver():
    """在 combatResolver.js 中添加 manualRollPending Map + processManualRoll 方法"""
    path = f'{BASE}/services/combat-service/src/services/combatResolver.js'
    with open(path, 'r') as f:
        content = f.read()

    # 1. 在 constructor 中添加 manualRollPending Map
    old_ctor = """        this.skillExecutor.resetStableForBattle();
    }"""
    new_ctor = """        this.skillExecutor.resetStableForBattle();
        // Phase 11: 手动摇骰挂起队列 turnId -> { resolve, reject, timeout }
        this.manualRollPending = new Map();
    }"""
    content = content.replace(old_ctor, new_ctor)

    # 2. 在 executeTurn 中注入 external_roll_result 支持
    # 修改 is_manual_roll 部分：注入 external 摇骰结果
    old_manual = """            height_bonus_per_diff: skillUf.height_bonus_per_diff ?? 0
        });"""
    new_manual = """            height_bonus_per_diff: skillUf.height_bonus_per_diff ?? 0,
            // Phase 11: 注入外部掷骰结果（从 WebSocket 手动摇骰传入）
            external_roll_result: options.external_roll_result || null
        });"""
    content = content.replace(old_manual, new_manual)

    # 3. 在 destroy/reset 中清理 manualRollPending
    old_reset = """    reset() {
        this.fogActive = false;
        this.fireCoverageUsed = false;
        this.durability.reset();
        this.skillExecutor.resetStableForBattle();
    }"""
    new_reset = """    reset() {
        this.fogActive = false;
        this.fireCoverageUsed = false;
        this.durability.reset();
        this.skillExecutor.resetStableForBattle();
        // Phase 11: 清理挂起的手动摇骰
        this.manualRollPending.forEach(({ reject, timeout }) => {
            clearTimeout(timeout);
            reject(new Error('战斗重置'));
        });
        this.manualRollPending.clear();
    }"""
    content = content.replace(old_reset, new_reset)

    # 4. 添加 processManualRollResult 方法（在类最后一个方法之前）
    old_export = """export { CombatResolver };"""

    new_method = """
    /**
     * Phase 11: 处理外部手动摇骰结果
     * @param {string} turnId - 战斗回合 ID
     * @param {Object} rollResult - { roll, diceType, successLine, isSuccess, bonus }
     */
    processManualRollResult(turnId, rollResult) {
        const pending = this.manualRollPending.get(turnId);
        if (!pending) {
            console.warn(`[Phase11] 未找到挂起的手动摇骰 turnId=${turnId}`);
            return false;
        }
        clearTimeout(pending.timeout);
        this.manualRollPending.delete(turnId);
        const isSuccess = rollResult.roll >= (rollResult.successLine ?? 4);
        const bonus = isSuccess ? (rollResult.bonus_damage ?? rollResult.bonus ?? 0) : 0;
        pending.resolve({
            roll: rollResult.roll,
            diceType: rollResult.dice_type || '1d6',
            successLine: rollResult.success_line ?? 4,
            isSuccess,
            bonus
        });
        return true;
    }

"""

    content = content.replace(old_export, new_method + old_export)

    with open(path, 'w') as f:
        f.write(content)
    print('[OK] combatResolver.js: 添加 manualRollPending + processManualRollResult')


def patch_skill_executor():
    """更新 skillExecutor.cjs 的 evaluateManualRoll 支持外部掷骰结果"""
    path = f'{BASE}/services/combat-service/src/services/combatCore/skillExecutor.cjs'
    with open(path, 'r') as f:
        content = f.read()

    # 更新 evaluateManualRoll 接受 external_roll_result
    old_eval = """    evaluateManualRoll(skillCfg) {
        if (!skillCfg || !skillCfg.is_manual_roll) {
            return { manual: false, bonus: 0 };
        }
        const dice = this._evaluateDice(skillCfg);
        const bonus = dice.isSuccess ? (skillCfg.success_bonus_damage ?? 0) : 0;
        return {
            manual: true,
            roll: dice.roll,
            diceType: dice.diceType,
            successLine: dice.successLine,
            isSuccess: dice.isSuccess,
            bonus,
            message: dice.isSuccess
                ? `[手动摇骰 SUCCESS] 掷${dice.diceType}=${dice.roll} >= ${dice.successLine}, 追加+${bonus}`
                : `[手动摇骰 FAIL] 掷${dice.diceType}=${dice.roll} < ${dice.successLine}`
        };
    }"""

    new_eval = """    evaluateManualRoll(skillCfg, externalResult = null) {
        if (!skillCfg || !skillCfg.is_manual_roll) {
            return { manual: false, bonus: 0 };
        }

        let dice;
        if (externalResult && externalResult.roll !== undefined) {
            // Phase 11: 使用外部传入的掷骰结果 (来自 WebSocket 手动摇骰)
            dice = {
                roll: externalResult.roll,
                diceType: externalResult.diceType || skillCfg.dice_type || '1d6',
                successLine: externalResult.successLine ?? skillCfg.success_line ?? 4,
                isSuccess: externalResult.isSuccess ?? (externalResult.roll >= (externalResult.successLine ?? skillCfg.success_line ?? 4))
            };
        } else {
            // 回退: 自动模拟掷骰
            dice = this._evaluateDice(skillCfg);
        }

        const bonus = dice.isSuccess ? (skillCfg.success_bonus_damage ?? 0) : 0;
        return {
            manual: true,
            roll: dice.roll,
            diceType: dice.diceType,
            successLine: dice.successLine,
            isSuccess: dice.isSuccess,
            bonus,
            message: dice.isSuccess
                ? `[手动摇骰 SUCCESS] 掷${dice.diceType}=${dice.roll} >= ${dice.successLine}, 追加+${bonus}`
                : `[手动摇骰 FAIL] 掷${dice.diceType}=${dice.roll} < ${dice.successLine}`
        };
    }"""

    content = content.replace(old_eval, new_eval)
    with open(path, 'w') as f:
        f.write(content)
    print('[OK] skillExecutor.cjs: 更新 evaluateManualRoll 支持外部结果')


def patch_damage_pipe():
    """更新 damagePipe.cjs 的 _applyManualRollBonus 支持外部掷骰结果"""
    path = f'{BASE}/services/combat-service/src/services/combatCore/damagePipe.cjs'
    with open(path, 'r') as f:
        content = f.read()

    old_manual = """    static _applyManualRollBonus(config) {
        if (!config.is_manual_roll) return { manual: false, bonus: 0 };

        // TODO: Phase 10 - state machine hook for manual roll input
        // 当前自动掷骰模拟
        const diceType = config.dice_type || '1d6';
        const successLine = config.success_line ?? 4;
        const bonusDamage = config.success_bonus_damage ?? 0;

        // 解析骰子字符串
        const m = String(diceType).match(/^(\\\\d+)d(\\\\d+)$/i);
        const count = m ? parseInt(m[1]) : 1;
        const sides = m ? parseInt(m[2]) : 6;
        let roll = 0;
        for (let i = 0; i < count; i++) roll += Math.floor(Math.random() * sides) + 1;

        const isSuccess = roll >= successLine;
        const bonus = isSuccess ? bonusDamage : 0;
        return {
            manual: true,
            roll,
            diceType,
            successLine,
            isSuccess,
            bonus,
            message: `[手动摇骰] 掷${diceType}=${roll} ${isSuccess ? '>=' : '<'} ${successLine}, 追加伤害+${bonus}`
        };
    }"""

    new_manual = """    static _applyManualRollBonus(config) {
        if (!config.is_manual_roll) return { manual: false, bonus: 0 };

        // Phase 11: 优先使用外部传入的掷骰结果 (WebSocket 手动摇骰)
        const externalResult = config.external_roll_result;
        const diceType = config.dice_type || '1d6';
        const successLine = config.success_line ?? 4;
        const bonusDamage = config.success_bonus_damage ?? 0;

        let roll, isSuccess;
        if (externalResult && externalResult.roll !== undefined) {
            // 使用外部掷骰结果
            roll = externalResult.roll;
            isSuccess = externalResult.isSuccess ?? (roll >= successLine);
        } else {
            // 回退: 自动模拟掷骰
            const m = String(diceType).match(/^(\\d+)d(\\d+)$/i);
            const count = m ? parseInt(m[1]) : 1;
            const sides = m ? parseInt(m[2]) : 6;
            roll = 0;
            for (let i = 0; i < count; i++) roll += Math.floor(Math.random() * sides) + 1;
            isSuccess = roll >= successLine;
        }

        const bonus = isSuccess ? bonusDamage : 0;
        return {
            manual: true,
            roll,
            diceType,
            successLine,
            isSuccess,
            bonus,
            message: `[手动摇骰] 掷${diceType}=${roll} ${isSuccess ? '>=' : '<'} ${successLine}, 追加伤害+${bonus}`
        };
    }"""

    # 尝试正确的转义
    if old_manual not in content:
        print('[WARN] damagePipe.cjs _applyManualRollBonus 原始文本匹配失败，尝试简化匹配...')
        # Try without the TODO comment
        old_manual2 = """    static _applyManualRollBonus(config) {
        if (!config.is_manual_roll) return { manual: false, bonus: 0 };"""
        idx = content.find(old_manual2)
        if idx >= 0:
            # Find the closing brace of this function
            brace_count = 0
            start = idx + len(old_manual2)
            for i in range(start, len(content)):
                c = content[i]
                if c == '{':
                    brace_count += 1
                elif c == '}':
                    if brace_count == 0:
                        end = i + 1
                        break
                    brace_count -= 1
            else:
                print('[ERROR] 找不到 _applyManualRollBonus 结束括号')
                return

            old_full = content[idx:end]
            content = content.replace(old_full, new_manual)
            print('[OK] damagePipe.cjs (简化匹配): 更新 _applyManualRollBonus')
        else:
            print('[ERROR] damagePipe.cjs _applyManualRollBonus 未找到')
            return
    else:
        content = content.replace(old_manual, new_manual)
        print('[OK] damagePipe.cjs: 更新 _applyManualRollBonus')

    with open(path, 'w') as f:
        f.write(content)


if __name__ == '__main__':
    print('=== Phase 11.1: 手动摇骰 WebSocket 同步 ===')
    patch_socket_service()
    patch_combat_resolver()
    patch_skill_executor()
    patch_damage_pipe()
    print('=== Phase 11.1 完成 ===')
