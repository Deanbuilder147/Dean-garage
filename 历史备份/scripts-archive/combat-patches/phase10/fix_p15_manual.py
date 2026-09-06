#!/usr/bin/env python3
"""P15 manual fix: Check turnManager.js init pattern and add skill counter init"""
path = "/root/original-project/services/combat-service/src/services/turnManager.js"
with open(path, "r") as f:
    content = f.read()

# Check what init patterns exist
import re
init_patterns = re.findall(r'(this\.\w+\.init\([^)]*\))', content)
print(f"Found init calls: {init_patterns}")

# Also check for any resolver reference
resolver_refs = re.findall(r'resolver', content)
print(f"resolver references: {len(resolver_refs)}")

# Check for combatResolver
cr_refs = re.findall(r'combatResolver', content)
print(f"combatResolver references: {len(cr_refs)}")

# Dump the constructor and any startBattle-like methods
for i, line in enumerate(content.split('\n'), 1):
    if 'init' in line.lower() or 'startBattle' in line or 'resolver' in line.lower():
        print(f"  L{i}: {line.strip()}")
