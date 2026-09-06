#!/usr/bin/env python3
"""P1-5: Add combat attributes to deployUnit in turnManager.js"""
import re

path = '/root/original-project/services/combat-service/src/services/turnManager.js'
with open(path, 'r') as f:
    content = f.read()

# Fix deployUnit: add combat attributes to newUnit
old_deploy = '''    const newUnit = {
      id: unitId,
      playerId: playerId,
      faction: playerSpawn.faction,
      q: q,
      r: r,
      has_moved: false,
      has_acted: false,
      royroy_deployed: false
    };'''

new_deploy = '''    const newUnit = {
      id: unitId,
      playerId: playerId,
      faction: playerSpawn.faction,
      q: q,
      r: r,
      hp: 100,
      max_hp: 100,
      attack: 12,
      defense: 6,
      mobility: 3,
      weaponType: 'beam',
      armorType: 'normal',
      shield: 0,
      level: 1,
      has_moved: false,
      has_acted: false,
      royroy_deployed: false,
      buffs: []
    };'''

content = content.replace(old_deploy, new_deploy)

with open(path, 'w') as f:
    f.write(content)
print('P1-5: deployUnit now includes combat attributes')
