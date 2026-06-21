#!/usr/bin/env python3
"""Clean up main.js: add battlefield-edit route + NewBattlefieldView import"""

filepath = '/root/original-project/frontend/src/main.js'

with open(filepath, 'r') as f:
    content = f.read()

# Check if battlefield-edit route already exists (should not)
if '/battlefield-edit' in content:
    print("⚠ /battlefield-edit route already exists, skipping add")
else:
    # 1. Add import for NewBattlefieldView (after NewBattleView import)
    old_import = "import NewBattleView from './views/NewBattleView.vue'\nimport NewPreparationRoom from './views/NewPreparationRoom.vue'"
    new_import = "import NewBattleView from './views/NewBattleView.vue'\nimport NewBattlefieldView from './views/NewBattlefieldView.vue'\nimport NewPreparationRoom from './views/NewPreparationRoom.vue'"

    if old_import in content:
        content = content.replace(old_import, new_import, 1)
        print("✅ Added NewBattlefieldView import")
    else:
        print("❌ Import pattern not found!")

    # 2. Add /battlefield-edit route (after /battlefields route)
    old_route = "{ path: '/battlefields', component: NewBattlefieldSelector, meta: { requiresAuth: true } },"
    new_route = "{ path: '/battlefields', component: NewBattlefieldSelector, meta: { requiresAuth: true } },\n  { path: '/battlefield-edit', component: NewBattlefieldView, meta: { requiresAuth: true } },"

    if old_route in content:
        content = content.replace(old_route, new_route, 1)
        print("✅ Added /battlefield-edit route")
    else:
        print("❌ Route pattern not found!")

    with open(filepath, 'w') as f:
        f.write(content)

    # Verify
    with open(filepath, 'r') as f:
        verify = f.read()
    if '/battlefield-edit' in verify and 'NewBattlefieldView' in verify:
        print("✅ Verified: route and import present")
    else:
        print("❌ Verification failed!")
