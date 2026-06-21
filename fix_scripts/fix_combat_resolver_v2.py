#!/usr/bin/env python3
"""修复 combatResolver.js - processManualRollResult 作为实例方法"""
import subprocess

BASE = '/root/original-project'
path = f'{BASE}/services/combat-service/src/services/combatResolver.js'

# 恢复原始
subprocess.run(['git', '-C', BASE, 'checkout', '--', 'services/combat-service/src/services/combatResolver.js'])

with open(path, 'r') as f:
    content = f.read()

patches = 0

# 1. constructor: manualRollPending Map
old = '        this.skillExecutor.resetStableForBattle();\n    }'
new = '        this.skillExecutor.resetStableForBattle();\n        // Phase 11: 手动摇骰挂起队列\n        this.manualRollPending = new Map();\n    }'
if old in content:
    content = content.replace(old, new)
    patches += 1
    print('[1/3] OK constructor')

# 2. executeTurn: external_roll_result 注入
old = '            height_bonus_per_diff: skillUf.height_bonus_per_diff ?? 0\n        });'
new = '            height_bonus_per_diff: skillUf.height_bonus_per_diff ?? 0,\n            // Phase 11: 外部掷骰结果 (WebSocket 手动摇骰传入)\n            external_roll_result: options.external_roll_result || null\n        });'
if old in content:
    content = content.replace(old, new)
    patches += 1
    print('[2/3] OK executeTurn external_roll_result')

# 3. 在 reset() 方法后添加 processManualRollResult 实例方法
# 找到 reset() 的结束 }
old_reset_end = '        this.skillExecutor.resetStableForBattle();\n    }'
if old_reset_end in content and 'Phase 11' not in content[:content.index(old_reset_end)+len(old_reset_end)]:
    new_reset = '''        this.skillExecutor.resetStableForBattle();
        // Phase 11: 清理挂起的手动摇骰
        if (this.manualRollPending) {
            this.manualRollPending.forEach(({ reject, timeout }) => {
                clearTimeout(timeout);
                reject(new Error('战斗重置'));
            });
            this.manualRollPending.clear();
        }
    }

    /**
     * Phase 11: 处理外部手动摇骰结果
     * @param {string} turnId - 战斗回合 ID
     * @param {Object} rollResult
     */
    processManualRollResult(turnId, rollResult) {
        const pending = this.manualRollPending.get(turnId);
        if (!pending) {
            console.warn('[Phase11] 未找到挂起的手动摇骰 turnId=' + turnId);
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
    }'''
    content = content.replace(old_reset_end, new_reset)
    patches += 1
    print('[3/3] OK reset + processManualRollResult')

with open(path, 'w') as f:
    f.write(content)

print(f'\n=== 修复完成: {patches}/3 ===')
print(f'文件行数: {content.count(chr(10))}')

# 验证语法
import re
# 检查 processManualRollResult 前没有多余缩进
for i, line in enumerate(content.split('\n')):
    if 'processManualRollResult' in line:
        indent = len(line) - len(line.lstrip())
        print(f'processManualRollResult at line {i+1}, indent={indent}')
