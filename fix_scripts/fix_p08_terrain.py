#!/usr/bin/env python3
"""P1-8: Change default terrain from 'lunar' to 'empty' in battles.js"""
path = '/root/original-project/services/combat-service/src/routes/battles.js'
with open(path, 'r') as f:
    content = f.read()

# Fix default terrain
old_t = "terrain: terrainMap[key] || 'lunar'"
new_t = "terrain: terrainMap[key] || 'empty'"

if old_t in content:
    content = content.replace(old_t, new_t)
    print('P1-8: Default terrain changed from lunar to empty')
else:
    print('P1-8: Pattern not found, searching...')
    import re
    # Try to find the line
    for i, line in enumerate(content.split('\n')):
        if 'terrainMap' in line and 'lunar' in line:
            print(f'  Found at line {i+1}: {line.strip()}')
            # Replace with regex
            content = content.replace(
                re.search(r"terrainMap\[key\] \|\| '[^']+'", line).group(),
                "terrainMap[key] || 'empty'"
            )
            print('  Fixed!')
            break
    else:
        print('  Not found at all')

with open(path, 'w') as f:
    f.write(content)
