"""Fix frontend map list to use database IDs instead of filenames."""

bf_path = '/root/original-project/frontend/src/views/NewBattlefieldView.vue'
with open(bf_path, 'r') as f:
    content = f.read()

changes = 0

# Fix 1: Option value from m.filename to m.id
old_opt = ':value="m.filename"'
new_opt = ':value="m.id"'
if old_opt in content:
    content = content.replace(old_opt, new_opt)
    changes += 1
    print("  ✓ option value: m.filename → m.id")

# Fix 2: Option display text (already shows m.name, keep but add terrainCount)
old_display = '{{ m.name }} ({{ m.width }}×{{ m.height }})'
new_display = '{{ m.name }} [{{ m.terrainCount }}格]'
if old_display in content:
    content = content.replace(old_display, new_display)
    changes += 1
    print("  ✓ option display updated")

# Fix 2b: Alternative display format check
old_display2 = 'm.name }} ({{ m.width }}×{{ m.height }}'
if old_display2 in content:
    content = content.replace(old_display2, 'm.name }} [{{ m.terrainCount }}格]')
    changes += 1

# Fix 3: onSelectMapFile - use ?id= instead of ?file=
old_fetch = 'fetch(`/api/map/list?file=${encodeURIComponent(filename)}`)'
new_fetch = 'fetch(`/api/map/list?id=${encodeURIComponent(filename)}`)'
if old_fetch in content:
    content = content.replace(old_fetch, new_fetch)
    changes += 1
    print("  ✓ fetch: ?file= → ?id=")

# Fix 4: getBattlefields fallback uses find by id, update
old_find = "maps.find(m => m.filename === filename || m.name === filename.replace('.json', ''))"
new_find = "maps.find(m => String(m.id) === filename || m.name === filename.replace('.json', ''))"
if old_find in content:
    content = content.replace(old_find, new_find)
    changes += 1
    print("  ✓ fallback find: m.filename → m.id")

# Fix 5: loadMapData call - after API returns data, update the access pattern
# The API now returns { id, name, width, height, terrain, type, createdAt }
# loadMapData expects { name, terrain, hexConfig... }
# This should work as-is since terrain is already parsed

# Fix 6: The response data structure changed:
# Old: data.battlefield || data.map
# New: { id, name, width, height, terrain, type, createdAt } (direct response)
old_load = 'await loadMapData(data.battlefield || data.map)'
new_load = 'await loadMapData(data)'
if old_load in content:
    content = content.replace(old_load, new_load)
    changes += 1
    print("  ✓ loadMapData: direct response")

# Fix 7: mapLoadStatus reference
old_status = 'data.battlefield || data.map'
old_status_check = "data.battlefield || data.map"
if old_status in content:
    content = content.replace(old_status, 'data')
    changes += 1

with open(bf_path, 'w') as f:
    f.write(content)

print(f"✓ Frontend: {changes} changes applied to NewBattlefieldView.vue")

# Verify
with open(bf_path, 'r') as f:
    lines = f.readlines()
found_id = any('m.id' in l and 'option' in l for l in [''.join(lines)])
found_fetch = any('?id=' in l for l in lines)
print(f"  Verify: id_option={found_id}, id_query={found_fetch}")
