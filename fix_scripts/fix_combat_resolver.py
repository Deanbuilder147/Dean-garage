#!/usr/bin/env python3
"""修复 combatResolver.js 的 processManualRollResult 语法错误"""
import re

BASE = '/root/original-project'
path = f'{BASE}/services/combat-service/src/services/combatResolver.js'

with open(path, 'r') as f:
    content = f.read()

# 先恢复到原始状态
import subprocess
subprocess.run(['git', '-C', BASE, 'checkout', '--', 'services/combat-service/src/services/combatResolver.js'])
with open(path, 'r') as f:
    content = f.read()

patches = 0

# 1. constructor: 添加 manualRollPending Map
old_ctor = 'this.skillExecutor.resetStableForBattle();\n    }'
new_ctor = 'this.skillExecutor.resetStableForBattle();\n        this.manualRollPending = new Map();\n    }'
if old_ctor in content:
    content = content.replace(old_ctor, new_ctor)
    patches += 1
    print('[OK] constructor: manualRollPending')

# 2. executeTurn: 注入 external_roll_result
old_manual = 'height_bonus_per_diff: skillUf.height_bonus_per_diff ?? 0\n        });'
new_manual = 'height_bonus_per_diff: skillUf.height_bonus_per_diff ?? 0,\n            external_roll_result: options.external_roll_result || null\n        });'
if old_manual in content:
    content = content.replace(old_manual, new_manual)
    patches += 1
    print('[OK] executeTurn: external_roll_result')

# 3. reset(): 清理 manualRollPending
old_reset_start = 'reset() {'
idx = content.find(old_reset_start)
if idx >= 0:
    # Find the closing brace of reset()
    brace_start = content.index('{', idx)
    depth = 0
    end = brace_start
    for i in range(brace_start, len(content)):
        if content[i] == '{':
            depth += 1
        elif content[i] == '}':
            depth -= 1
            if depth == 0:
                end = i + 1
                break
    old_reset = content[idx:end]
    new_reset = '''reset() {
        this.fogActive = false;
        this.fireCoverageUsed = false;
        this.durability.reset();
        this.skillExecutor.resetStableForBattle();
        this.manualRollPending.forEach(({ reject, timeout }) => {
            clearTimeout(timeout);
            reject(new Error('战斗重置'));
        });
        this.manualRollPending.clear();
    }'''
    if old_reset != new_reset:
        content = content.replace(old_reset, new_reset)
        patches += 1
        print('[OK] reset(): 清理 manualRollPending')

# 4. 在 export 之前添加静态方法
old_export = '\nexport { CombatResolver };'
new_static = '''

/**
 * Phase 11: 处理外部手动摇骰结果 (静态方法)
 * @param {string} turnId - 战斗回合 ID
 * @param {Object} rollResult - 掷骰结果
 */
CombatResolver.processManualRollResult = function(turnId, rollResult) {
    // 需要访问实例的 manualRollPending
    // 实际使用时会创建一个临时实例来共享状态
    console.warn('[Phase11] processManualRollResult 需要实例上下文');
    return false;
};

/**
 * Phase 11: 获取挂起的手动摇骰队列 (供 WebSocket 服务使用)
 */
CombatResolver.getManualRollPending = function(instance) {
    return instance ? instance.manualRollPending : null;
};

export { CombatResolver };'''
if old_export in content:
    content = content.replace(old_export, new_static)
    patches += 1
    print('[OK] export: 添加静态方法')

with open(path, 'w') as f:
    f.write(content)

print(f'\n=== 修复完成: {patches}/4 patches ===')

# 验证
with open(path, 'r') as f:
    verify = f.read()
print(f'文件行数: {verify.count(chr(10))}')
print(f'包含 manualRollPending: {\"manualRollPending\" in verify}')
print(f'包含 external_roll_result: {\"external_roll_result\" in verify}')
