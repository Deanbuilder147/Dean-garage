#!/usr/bin/env python3
"""Fix battles.js: forward auth header when calling hangar service"""
path = '/root/original-project/services/combat-service/src/routes/battles.js'
with open(path, 'r') as f:
    content = f.read()

old = "      // 尝试从格纳库获取棋子数据\n      let hangarUnit = null;\n      try {\n        const hangarUrl = process.env.HANGAR_SERVICE_URL || 'http://localhost:3002';\n        const hangarRes = await fetch(`${hangarUrl}/api/hangar/units/${unit_id}`);\n        if (hangarRes.ok) {\n          hangarUnit = await hangarRes.json();\n        }\n      } catch (e) {\n        console.warn('[deploy-unit] 无法从格纳库获取棋子数据:', e.message);\n      }"

new = "      // 尝试从格纳库获取棋子数据\n      let hangarUnit = null;\n      try {\n        const hangarUrl = process.env.HANGAR_SERVICE_URL || 'http://localhost:3002';\n        const headers = {};\n        if (req.headers.authorization) {\n          headers['Authorization'] = req.headers.authorization;\n        }\n        const hangarRes = await fetch(`${hangarUrl}/api/hangar/units/${unit_id}`, { headers });\n        if (hangarRes.ok) {\n          hangarUnit = await hangarRes.json();\n        } else {\n          console.warn('[deploy-unit] 格纳库响应:', hangarRes.status);\n        }\n      } catch (e) {\n        console.warn('[deploy-unit] 无法从格纳库获取棋子数据:', e.message);\n      }"

if old in content:
    content = content.replace(old, new)
    with open(path, 'w') as f:
        f.write(content)
    print('OK: Auth header forwarding added')
else:
    print('WARNING: Old pattern not found, searching...')
    # Try without exact whitespace
    import re
    if 'hangar/units' in content:
        print('Found hangar/units reference, manual check needed')
    else:
        print('No hangar reference found')
