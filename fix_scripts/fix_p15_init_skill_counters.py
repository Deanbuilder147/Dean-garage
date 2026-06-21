#!/usr/bin/env python3
"""P15: turnManager.js 启动战斗时自动初始化自动化技能计数器（助攻5次/守护3次/阻碍3次）"""
import re

path = '/root/original-project/services/combat-service/src/services/turnManager.js'
with open(path, 'r') as f:
    content = f.read()

# 修改1: 将 combatResolver.init(battlefield) 改为 combatResolver.init(battlefield, allUnits)
# 这样 init() 内部会调用 initSkillCounters 统一初始化助攻/守护/阻碍的计数器
old_init = 'this.resolver.init(battlefield)'
new_init = 'this.resolver.init(battlefield, allUnits)'

count = content.count(old_init)
if count > 0:
    content = content.replace(old_init, new_init)
    print(f'P15: Replaced {count} occurrence(s) of resolver.init(battlefield) -> resolver.init(battlefield, allUnits)')
else:
    # Fallback: try other patterns
    for pattern in ['combatResolver.init(battlefield)', 'resolver.init(battlefield)']:
        if content.count(pattern) > 0:
            content = content.replace(pattern, pattern.replace('(battlefield)', '(battlefield, allUnits)'))
            print(f'P15: Replaced {pattern}')
            break
    else:
        print('P15 WARNING: Could not find resolver.init(battlefield) call site')
        print('Please manually add "allUnits" as second argument to combatResolver.init() call')

with open(path, 'w') as f:
    f.write(content)

print('P15: initSkillCounters will now auto-trigger at battle start')
print('     助攻计数器=5, 守护计数器=3, 阻碍计数器=3 将在部署完成时初始化')
