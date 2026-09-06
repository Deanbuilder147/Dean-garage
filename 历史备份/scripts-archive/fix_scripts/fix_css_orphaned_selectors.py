#!/usr/bin/env python3
"""Fix CSS: remove orphaned selectors that corrupt the CSS parser"""
path = '/root/original-project/frontend/src/views/NewBattleView.vue'

with open(path, 'r') as f:
    lines = f.readlines()

# Lines 2650-2668 (0-indexed: 2649-2667) are orphaned selectors
# Remove them and replace with a single comment
# 0-indexed: lines 2649 to 2667 inclusive

new_lines = []
i = 0
while i < len(lines):
    line = lines[i]
    # Check if this is the start of the orphaned block
    if (line.strip() == '/* ===== LEFT SIDEBAR ===== */' and
        i + 1 < len(lines) and '.log-entry.log-move' in lines[i + 1]):
        # Keep the comment
        new_lines.append(line)
        i += 1
        # Skip all orphaned selectors until we find the MAIN CONTENT comment
        while i < len(lines) and '/* ===== MAIN CONTENT ===== */' not in lines[i]:
            i += 1
        # Now at '/* ===== MAIN CONTENT ===== */', keep it
        if i < len(lines):
            new_lines.append(lines[i])
            i += 1
        continue
    new_lines.append(line)
    i += 1

with open(path, 'w') as f:
    f.writelines(new_lines)

print("OK: Removed orphaned CSS selectors")

# Verify
with open(path, 'r') as f:
    verify = f.read()

count = verify.count('.log-entry.log-move')
print(f"Remaining .log-entry.log-move occurrences: {count}")
dm_index = verify.find('.dm-main { flex:')
print(f".dm-main rule at position: {dm_index}")
# Check what's before dm-main
if dm_index > 0:
    before = verify[dm_index - 100:dm_index]
    print(f"Before .dm-main: ...{repr(before[-60:])}")
