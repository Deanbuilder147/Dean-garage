#!/usr/bin/env python3
"""修复 combatResolver.js - 使用精确匹配避免歧义"""
import subprocess

BASE = '/root/original-project'
path = f'{BASE}/services/combat-service/src/services/combatResolver.js'

subprocess.run(['git', '-C', BASE, 'checkout', '--', 'services/combat-service/src/services/combatResolver.js'])

with open(path, 'r') as f:
    content = f.read()

lines = content.split('\n')

# 找到 reset() 方法的位置
reset_idx = -1
for i, line in enumerate(lines):
    if line.strip() == 'reset() {':
        # 确认这是类方法（缩进4空格），不是构造函数内的 resetStableForBattle()
        if line.startswith('    ') and not line.startswith('        '):
            reset_idx = i
            break

if reset_idx < 0:
    print('[ERROR] 未找到 reset() 方法')
    exit(1)

# 找到 reset() 的结束 }
end_idx = reset_idx
brace_count = 0
for i in range(reset_idx, len(lines)):
    for ch in lines[i]:
        if ch == '{':
            brace_count += 1
        elif ch == '}':
            brace_count -= 1
            if brace_count == 0:
                end_idx = i
                break
    if brace_count == 0:
        break

print(f'reset() at line {reset_idx+1}, ends at line {end_idx+1}')
print(f'Current reset body ({end_idx - reset_idx + 1} lines):')
for i in range(reset_idx, end_idx + 1):
    print(f'  {lines[i]}')

# 构建新的 reset() + processManualRollResult
new_lines = [
    '    reset() {',
    '        this.fogActive = false;',
    '        this.fireCoverageUsed = false;',
    '        this.durability.reset();',
    '        this.skillExecutor.resetStableForBattle();',
    '        // Phase 11: 清理手动摇骰挂起队列',
    '        if (this.manualRollPending) {',
    '            this.manualRollPending.forEach(({ reject, timeout }) => {',
    '                clearTimeout(timeout);',
    '                reject(new Error(\'战斗重置\'));',
    '            });',
    '            this.manualRollPending.clear();',
    '        }',
    '    }',
    '',
    '    /**',
    '     * Phase 11: 处理外部手动摇骰结果',
    '     * @param {string} turnId - 战斗回合 ID',
    '     * @param {Object} rollResult',
    '     */',
    '    processManualRollResult(turnId, rollResult) {',
    '        const pending = this.manualRollPending.get(turnId);',
    '        if (!pending) {',
    '            console.warn(`[Phase11] 未找到挂起的手动摇骰 turnId=${turnId}`);',
    '            return false;',
    '        }',
    '        clearTimeout(pending.timeout);',
    '        this.manualRollPending.delete(turnId);',
    '        const isSuccess = rollResult.roll >= (rollResult.successLine ?? 4);',
    '        const bonus = isSuccess ? (rollResult.bonus_damage ?? rollResult.bonus ?? 0) : 0;',
    '        pending.resolve({',
    '            roll: rollResult.roll,',
    '            diceType: rollResult.dice_type || \'1d6\',',
    '            successLine: rollResult.success_line ?? 4,',
    '            isSuccess,',
    '            bonus',
    '        });',
    '        return true;',
    '    }',
]

# 替换
new_content = '\n'.join(lines[:reset_idx] + new_lines + lines[end_idx+1:])

# 另外还需要修改 constructor 和 executeTurn
# constructor: 添加 manualRollPending
new_content = new_content.replace(
    '        this.skillExecutor.resetStableForBattle();\n    }\n',
    '        this.skillExecutor.resetStableForBattle();\n        // Phase 11: 手动摇骰挂起队列\n        this.manualRollPending = new Map();\n    }\n',
    1  # 只替换第一次出现 (constructor)
)

# executeTurn: 注入 external_roll_result
new_content = new_content.replace(
    '            height_bonus_per_diff: skillUf.height_bonus_per_diff ?? 0\n        });',
    '            height_bonus_per_diff: skillUf.height_bonus_per_diff ?? 0,\n            // Phase 11: 外部掷骰结果 (WebSocket 手动摇骰)\n            external_roll_result: options.external_roll_result || null\n        });'
)

with open(path, 'w') as f:
    f.write(new_content)

print(f'\n=== 修复完成 ===')
print(f'总行数: {new_content.count(chr(10))}')
print(f'包含 manualRollPending: {"manualRollPending" in new_content}')
print(f'包含 processManualRollResult: {"processManualRollResult" in new_content}')
print(f'包含 external_roll_result: {"external_roll_result" in new_content}')
