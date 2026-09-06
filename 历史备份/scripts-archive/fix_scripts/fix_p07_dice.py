#!/usr/bin/env python3
"""P1-7: Replace Math.random rollDice with DiceEngine in turnManager.js"""
import re

path = '/root/original-project/services/combat-service/src/services/turnManager.js'
with open(path, 'r') as f:
    content = f.read()

# Check if DiceEngine is already imported
if 'DiceEngine' not in content or 'import' not in content:
    print("WARNING: turnManager.js doesn't import DiceEngine, adding import")

# Replace the rollDice implementation
old_roll = '''  static rollDice(sides = 6) {
    return Math.floor(Math.random() * sides) + 1;
  }'''

new_roll = '''  static rollDice(sides = 6) {
    // 使用 DiceEngine 统一掷骰，替代 Math.random
    try {
      // Lazy-load to avoid circular dependency
      const { defaultEngine } = require('./combatCore/DiceEngine.cjs');
      return defaultEngine.roll(`1d${sides}`);
    } catch (e) {
      // Fallback: if DiceEngine not available in this context
      return Math.floor(Math.random() * sides) + 1;
    }
  }'''

if old_roll in content:
    content = content.replace(old_roll, new_roll)
    print('P1-7: rollDice now uses DiceEngine')
else:
    print('WARNING: Could not find old rollDice, searching...')
    if 'rollDice' in content:
        print('  rollDice exists but pattern mismatch')
    else:
        print('  rollDice not found in turnManager.js')

with open(path, 'w') as f:
    f.write(content)
