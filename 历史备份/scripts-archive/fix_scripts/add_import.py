#!/usr/bin/env python3
"""Add NewBattlefieldView import to main.js"""

path = '/root/original-project/frontend/src/main.js'

with open(path) as f:
    c = f.read()

old = "import NewBattleView from './views/NewBattleView.vue';\nimport NewPreparationRoom from './views/NewPreparationRoom.vue';"
new = "import NewBattleView from './views/NewBattleView.vue';\nimport NewBattlefieldView from './views/NewBattlefieldView.vue';\nimport NewPreparationRoom from './views/NewPreparationRoom.vue';"

if old in c:
    c = c.replace(old, new, 1)
    with open(path, 'w') as f:
        f.write(c)
    print("✅ Import added")
else:
    print("❌ Pattern not found")
    # Debug
    for line in c.split('\n'):
        if 'NewBattleView' in line or 'NewPreparationRoom' in line:
            print(f"  LINE: {line!r}")
