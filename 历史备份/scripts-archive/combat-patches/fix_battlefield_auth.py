#!/usr/bin/env python3
"""Fix BattlefieldView.vue - add missing Authorization headers to all /api/map API calls"""

path = '/root/original-project/frontend/src/views/BattlefieldView.vue'
with open(path, 'r') as f:
    content = f.read()

changes = 0

# Fix 1: loadBattlefields
old1 = "async function loadBattlefields() {\n  try {\n    const res = await fetch('/api/map/battlefields');"
new1 = "async function loadBattlefields() {\n  try {\n    const token = localStorage.getItem('token');\n    const res = await fetch('/api/map/battlefields', {\n      headers: { 'Authorization': `Bearer ${token}` }\n    });"
if old1 in content:
    content = content.replace(old1, new1)
    changes += 1
    print('Fix 1: loadBattlefields')

# Fix 2: createBattlefield
old2 = "    const res = await fetch('/api/map/battlefields', {\n      method: 'POST',\n      headers: { 'Content-Type': 'application/json' },"
new2 = "    const token = localStorage.getItem('token');\n    const res = await fetch('/api/map/battlefields', {\n      method: 'POST',\n      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },"
if old2 in content:
    content = content.replace(old2, new2)
    changes += 1
    print('Fix 2: createBattlefield')

# Fix 3: selectBattlefield
old3 = "    const res = await fetch(`/api/map/battlefields/${bf.id}`);"
new3 = "    const token = localStorage.getItem('token');\n    const res = await fetch(`/api/map/battlefields/${bf.id}`, {\n      headers: { 'Authorization': `Bearer ${token}` }\n    });"
if old3 in content:
    content = content.replace(old3, new3)
    changes += 1
    print('Fix 3: selectBattlefield')

# Fix 4: saveBattlefield
old4 = "    const res = await fetch(`/api/map/battlefields/${currentBattlefield.value.id}`, {\n      method: 'PUT',\n      headers: { 'Content-Type': 'application/json' },"
new4 = "    const token = localStorage.getItem('token');\n    const res = await fetch(`/api/map/battlefields/${currentBattlefield.value.id}`, {\n      method: 'PUT',\n      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },"
if old4 in content:
    content = content.replace(old4, new4)
    changes += 1
    print('Fix 4: saveBattlefield')

# Fix 5: deleteBattlefield
old5 = "    await fetch(`/api/map/battlefields/${id}`, { method: 'DELETE' });"
new5 = "    const token = localStorage.getItem('token');\n    await fetch(`/api/map/battlefields/${id}`, {\n      method: 'DELETE',\n      headers: { 'Authorization': `Bearer ${token}` }\n    });"
if old5 in content:
    content = content.replace(old5, new5)
    changes += 1
    print('Fix 5: deleteBattlefield')

if changes > 0:
    with open(path, 'w') as f:
        f.write(content)
    print(f'\nDone: {changes} fixes applied')
else:
    print('No changes made')
