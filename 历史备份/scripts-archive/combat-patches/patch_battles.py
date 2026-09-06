#!/usr/bin/env python3
"""修改 battles.js 的 deploy-unit 端点，使用 UnitConverter 替代硬编码"""
import os

path = '/root/original-project/services/combat-service/src/routes/battles.js'

with open(path, 'r') as f:
    content = f.read()

# 1. 添加 import（在文件顶部，最后一个 import 之后）
import_insert = "\nimport UnitConverter from '../services/unitConverter.js';\n"
last_import = content.rfind("import ")
# 找到最后一个 import 语句的结尾
last_import_end = content.find("\n", last_import)
import_index = last_import_end + 1

content = content[:import_index] + import_insert + content[import_index:]

# 2. 替换 deploy-unit 端点中的硬编码部分
old_deploy = '''    // 检查单位是否已部署
    const existing = state.units.find(u => u.id === unit_id);
    if (!existing) {
      // 从待部署列表获取单位信息（简化：创建基础单位）
      state.units.push({
        id: unit_id,
        name: 'Unit ' + unit_id,
        q, r,
        hp: 100,
        max_hp: 100,
        attack: 12,
        defense: 6,
        mobility: 3,
        weaponType: 'beam',
        armorType: 'normal',
        shield: 0,
        level: 1,
        faction: 'earth',
        has_acted: false,
        has_moved: false,
        buffs: []
      });
    }'''

new_deploy = '''    // 检查单位是否已部署
    const existing = state.units.find(u => u.id === unit_id);
    if (!existing) {
      // 尝试从格纳库获取棋子数据
      let hangarUnit = null;
      try {
        const hangarUrl = process.env.HANGAR_SERVICE_URL || 'http://localhost:3002';
        const hangarRes = await fetch(`${hangarUrl}/api/hangar/units/${unit_id}`);
        if (hangarRes.ok) {
          hangarUnit = await hangarRes.json();
        }
      } catch (e) {
        console.warn('[deploy-unit] 无法从格纳库获取棋子数据:', e.message);
      }

      // 使用 UnitConverter 转换或回退到基本单位
      if (hangarUnit) {
        const converted = UnitConverter.convert(hangarUnit, { q, r, player_id: req.user?.id || 0 });
        state.units.push(converted);
      } else {
        // 回退：创建基本占位单位
        state.units.push({
          id: unit_id,
          name: 'Unit ' + unit_id,
          q, r,
          hp: 100,
          max_hp: 100,
          attack: 12,
          defense: 6,
          mobility: 3,
          weaponType: 'beam',
          armorType: 'normal',
          shield: 0,
          level: 1,
          faction: 'earth',
          has_acted: false,
          has_moved: false,
          buffs: []
        });
      }
    }'''

if old_deploy in content:
    content = content.replace(old_deploy, new_deploy)
    print('OK: deploy-unit endpoint updated')
else:
    print('WARNING: Could not find old deploy-unit code to replace')

with open(path, 'w') as f:
    f.write(content)

print(f'OK: battles.js updated. Size: {len(content)} chars')
