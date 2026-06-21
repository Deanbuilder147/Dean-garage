#!/usr/bin/env python3
"""Fix logContainer undefined error in NewBattleView.vue

Removes the nextTick + logContainer scroll block from addLog().
Scrolling is handled by TheSidebar.vue's watch(sidebarActionLog).
"""

filepath = '/root/original-project/frontend/src/views/NewBattleView.vue'

with open(filepath, 'r') as f:
    content = f.read()

old = """  // Auto-scroll
  nextTick(() => {
    if (logContainer.value) logContainer.value.scrollTop = 0
  })"""

new = """  // Auto-scroll handled by TheSidebar.vue"""

if old not in content:
    print("❌ Pattern NOT found in file!")
    # Debug: show lines around addLog
    idx = content.find('function addLog')
    if idx >= 0:
        print(f"addLog found at char {idx}:")
        print(content[idx:idx+400])
    else:
        print("addLog function not found at all!")
    exit(1)

content = content.replace(old, new, 1)

with open(filepath, 'w') as f:
    f.write(content)

print("✅ Fixed: removed logContainer scroll block from addLog()")

# Verify
with open(filepath, 'r') as f:
    verify = f.read()

if 'logContainer.value' in verify:
    print("⚠ WARNING: logContainer still appears in file!")
else:
    print("✅ Verified: no logContainer references remain in file")
