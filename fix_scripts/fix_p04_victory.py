#!/usr/bin/env python3
"""P0-4: Fix checkVictory to filter dead units in turnManager.js"""
import re

path = '/root/original-project/services/combat-service/src/services/turnManager.js'
with open(path, 'r') as f:
    content = f.read()

# Fix checkVictory: only count alive units
old_victory = '''    state.units.forEach(unit => {
      factions[unit.faction] = true;
    });'''

new_victory = '''    state.units.forEach(unit => {
      // 只统计存活单位 (hp > 0)
      if (unit.hp > 0) {
        factions[unit.faction] = true;
      }
    });'''

content = content.replace(old_victory, new_victory)

with open(path, 'w') as f:
    f.write(content)
print('P0-4: checkVictory now filters dead units')
