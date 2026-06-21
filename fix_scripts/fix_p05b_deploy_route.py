#!/usr/bin/env python3
"""P1-5b: Fix deploy-unit route in battles.js to include combat attributes"""
import re

path = '/root/original-project/services/combat-service/src/routes/battles.js'
with open(path, 'r') as f:
    content = f.read()

# Fix: Add combat attributes to deploy-unit route
old_deploy = '''      state.units.push({
        id: unit_id,
        name: 'Unit ' + unit_id,
        q, r,
        hp: 100,
        max_hp: 100,
        faction: 'earth',
        has_acted: false,
        has_moved: false
      });'''

new_deploy = '''      state.units.push({
        id: unit_id,
        name: 'Unit ' + unit_id,
        q, r,
        hp: 100,
        max_hp: 100,
        attack: 12,
        defense: 6,
        mobility: 3,
        weaponType: 'beam',
        armorType: 'normal',
        shield: 0,
        level: 1,
        faction: 'earth',
        has_acted: false,
        has_moved: false,
        buffs: []
      });'''

if old_deploy in content:
    content = content.replace(old_deploy, new_deploy)
    print('P1-5b: battles.js deploy-unit now includes combat attributes')
else:
    print('P1-5b: deploy-unit pattern not found in battles.js')

with open(path, 'w') as f:
    f.write(content)
