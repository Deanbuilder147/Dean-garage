#!/usr/bin/env python3
"""P1-7 (revised): Add DiceEngine import + replace rollDice in turnManager.js"""
import re

path = '/root/original-project/services/combat-service/src/services/turnManager.js'
with open(path, 'r') as f:
    content = f.read()

# Step 1: Add import at top of file
# Check if DiceEngine is already imported
if 'DiceEngine' not in content[:100] and 'dice' not in content[:100].lower():
    # Find the first import or class declaration and add import before it
    if 'import' in content[:200]:
        # Add after last import
        last_import = 0
        for i, line in enumerate(content.split('\n')):
            if line.strip().startswith('import '):
                last_import = i
        lines = content.split('\n')
        lines.insert(last_import + 1, "import { defaultEngine } from './combatCore/DiceEngine.cjs';")
        content = '\n'.join(lines)
        print('  Added DiceEngine import')
    elif 'class TurnManager' in content:
        content = content.replace(
            'class TurnManager',
            "import { defaultEngine } from './combatCore/DiceEngine.cjs';\n\nclass TurnManager"
        )
        print('  Added DiceEngine import before class')

# Step 2: Replace rollDice
old_roll = '''  static rollDice(sides = 6) {
    return Math.floor(Math.random() * sides) + 1;
  }'''

new_roll = '''  static rollDice(sides = 6) {
    // 统一使用 DiceEngine 掷骰
    return defaultEngine.roll(`1d${sides}`);
  }'''

if old_roll in content:
    content = content.replace(old_roll, new_roll)
    print('P1-7: rollDice now uses DiceEngine (unified)')
else:
    print('P1-7 WARNING: rollDice pattern not found')

with open(path, 'w') as f:
    f.write(content)
print('P1-7: Complete')
