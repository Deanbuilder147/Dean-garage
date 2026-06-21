#!/usr/bin/env python3
"""P2-9: Replace linear interpolation with hex Bresenham in turnManager.js"""

path = '/root/original-project/services/combat-service/src/services/turnManager.js'
with open(path, 'r') as f:
    content = f.read()

old_cells = '''  static getCellsBetween(unit1, unit2) {
    const cells = [];
    const steps = Math.max(Math.abs(unit1.q - unit2.q), Math.abs(unit1.r - unit2.r));

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const q = Math.round(unit1.q + (unit2.q - unit1.q) * t);
      const r = Math.round(unit1.r + (unit2.r - unit1.r) * t);
      cells.push({ q, r });
    }

    return cells;
  }'''

new_cells = '''  static getCellsBetween(unit1, unit2) {
    // 六角格 Bresenham 算法：在六角坐标系中计算两点间的格子
    const cells = [];
    const dq = unit2.q - unit1.q;
    const dr = unit2.r - unit1.r;
    const steps = Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq - dr));

    if (steps === 0) {
      cells.push({ q: unit1.q, r: unit1.r });
      return cells;
    }

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // 六角格线性插值后取整，处理漂移
      const q_f = unit1.q + dq * t;
      const r_f = unit1.r + dr * t;

      // 六角坐标舍入 (cube rounding)
      const sq = Math.round(q_f);
      const sr = Math.round(r_f);
      const sx = Math.round(-q_f - r_f);
      // 修正：确保 q + s + r === 0 (cube coordinate invariant)
      // 此处直接用 q,r 坐标的舍入结果，在 offset 坐标系中已足够
      // 使用 closest hex rounding
      const dq_diff = Math.abs(sq - q_f);
      const dr_diff = Math.abs(sr - r_f);
      const ds_diff = Math.abs(sx + q_f + r_f);

      let q, r;
      if (dq_diff > dr_diff && dq_diff > ds_diff) {
        q = -sr - sx;
        r = sr;
      } else if (dr_diff > ds_diff) {
        q = sq;
        r = -sq - sx;
      } else {
        q = sq;
        r = sr;
      }

      cells.push({ q, r });
    }

    return cells;
  }'''

if old_cells in content:
    content = content.replace(old_cells, new_cells)
    print('P2-9: getCellsBetween now uses hex Bresenham')
else:
    print('P2-9: getCellsBetween pattern not found, searching...')
    # Try to find the function
    idx = content.find('getCellsBetween')
    if idx > 0:
        print(f'  Found at byte {idx}')
        # Extract the function manually
        start = content.rfind('static', 0, idx)
        # Find matching closing brace
        brace_count = 0
        in_func = False
        for i in range(start, len(content)):
            if content[i] == '{':
                brace_count += 1
                in_func = True
            elif content[i] == '}':
                brace_count -= 1
                if in_func and brace_count == 0:
                    end = i + 1
                    break
        old_func = content[start:end]
        content = content.replace(old_func, new_cells)
        print('  Fixed via search!')
    else:
        print('  Not found at all')

with open(path, 'w') as f:
    f.write(content)
