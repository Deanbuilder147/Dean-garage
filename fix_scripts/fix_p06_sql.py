#!/usr/bin/env python3
"""P1-6: Fix SQL $1 duplicate bindings in battles.js"""
import re

path = '/root/original-project/services/combat-service/src/routes/battles.js'
with open(path, 'r') as f:
    content = f.read()

# Find all occurrences of UPDATE ... WHERE id = $1 with wrong bindings
# Pattern: db('UPDATE ... WHERE id = $1')(state_str, id, ...)
# Should be: db('UPDATE ... WHERE id = $2')(state_str, id, ...)
# Or: db('UPDATE ... WHERE id = $3')(state_str, phase, id, ...)

# Fix 1: Single $1 WHERE (units_state = $1 WHERE id = $1) -> (units_state = $1 WHERE id = $2)
old1 = "UPDATE battle_sessions SET units_state = $1 WHERE id = $1"
new1 = "UPDATE battle_sessions SET units_state = $1 WHERE id = $2"
content = content.replace(old1, new1)

# Fix 2: Multiple $1 patterns with spawn_order
old2 = "UPDATE battle_sessions SET units_state = $1, phase = $2, spawn_order = $3 WHERE id = $1"
new2 = "UPDATE battle_sessions SET units_state = $1, phase = $2, spawn_order = $3 WHERE id = $4"
content = content.replace(old2, new2)

# Fix 3: end_deployment
old3 = "UPDATE battle_sessions SET units_state = $1, phase = $2 WHERE id = $1"
new3 = "UPDATE battle_sessions SET units_state = $1, phase = $2 WHERE id = $3"
content = content.replace(old3, new3)

# Fix 4: Fixed duplicate in fog route
old4 = "'UPDATE battle_sessions SET units_state = $1 WHERE id = $2'"
# This one is already correct format in the deploy-unit route, check if any remain wrong
# Actually let me just regex all patterns

# Generic fix: WHERE id = $1 at the end of SQL, when there are other $1 before it
# Count $N references and fix the last one
lines = content.split('\n')
fixed_lines = []
for i, line in enumerate(lines):
    # Find UPDATE ... WHERE id = $1
    if 'UPDATE battle_sessions' in line and "WHERE id = $1'" in line:
        # Count max param used so far (before WHERE)
        prefix = line.split("WHERE id")[0] if "WHERE id" in line else line
        max_n = 0
        for j in range(1, 10):
            if f'${j}' in prefix:
                max_n = j
        if max_n > 0:
            correct_n = max_n + 1
            if correct_n > 1:
                old_where = f"WHERE id = $1'"
                new_where = f"WHERE id = ${correct_n}'"
                if old_where in line:
                    line = line.replace(old_where, new_where)
                    print(f"  Line {i+1}: Fixed WHERE id=$1 -> WHERE id=${correct_n}")
    fixed_lines.append(line)

content = '\n'.join(fixed_lines)

with open(path, 'w') as f:
    f.write(content)
print('P1-6: Fixed all SQL $N duplicate bindings in battles.js')
