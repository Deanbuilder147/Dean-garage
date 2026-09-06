#!/usr/bin/env python3
"""
Phase 14 紧急交互补丁: 整备室出击黑屏修复 - 双重防爆兜底手术

A. 装备 DKM 防爆器: sanitizeUnitEquipment + sanitizeAllUnitsEquipment
B. 地形清洗器强化: 出击入口强制激活 + terrainMap 接入
C. 全局错误边界: onMounted + drawBattleScene try/catch + console.error 明文堆栈
"""

import os, sys, re

ROOT = '/root/original-project'
NBV_PATH = os.path.join(ROOT, 'frontend/src/views/NewBattleView.vue')

# ================================================================
#  PATCH A: NewBattleView.vue — 装备 DKM 防爆器 + 地形清洗 + 错误边界
# ================================================================
def patch_newbattleview():
    if not os.path.exists(NBV_PATH):
        print(f'[FAIL] {NBV_PATH} not found')
        return False

    with open(NBV_PATH, 'r') as f:
        lines = f.readlines()

    injections = 0
    total_patches = 8  # number of injection points expected

    # === A1. Insert sanitizeUnitEquipment + sanitizeAllUnitsEquipment ===
    # Target: after line "function sanitizeTerrainMap" block ends (before "const route = useRoute()")
    # The sanitizeTerrainMap ends at line 518, followed by blank lines, then "const route = useRoute()" at ~521
    equipment_sanitizer = """
// ================================================================
//  Phase 14: 装备 DKM 防爆器 — 出击数据双重防护
//  确保所有 unit 拥有完整的 equipment 三槽位 + damage_kind_modifiers
// ================================================================

/**
 * 防御性清洗单个单位的装备对象
 * 确保 left_hand / right_hand / other 三槽位俱全，
 * 每个槽位包含标准 damage_kind_modifiers 节点
 */
function sanitizeUnitEquipment(unit) {
  if (!unit || typeof unit !== 'object') return unit
  unit.equipment = unit.equipment || {}
  const slots = ['left_hand', 'right_hand', 'other']
  let fixed = 0
  slots.forEach(slot => {
    if (!unit.equipment[slot] || typeof unit.equipment[slot] !== 'object') {
      unit.equipment[slot] = {
        damage_kind_modifiers: { kinetic: 0, beam: 0, explosive: 0, corrosive: 0 }
      }
      fixed++
    } else {
      const dkm = unit.equipment[slot].damage_kind_modifiers
      if (!dkm || typeof dkm !== 'object') {
        unit.equipment[slot].damage_kind_modifiers = { kinetic: 0, beam: 0, explosive: 0, corrosive: 0 }
        fixed++
      } else {
        // 补全缺失的伤害类型键
        const kinds = ['kinetic', 'beam', 'explosive', 'corrosive']
        let patched = false
        kinds.forEach(k => {
          if (!(k in dkm)) { dkm[k] = 0; patched = true }
        })
        if (patched) fixed++
      }
    }
  })
  if (fixed > 0) {
    console.log(`[EquipmentSanitizer] 单位 "${unit.name || unit.id}": 修复 ${fixed} 个装备槽位`)
  }
  return unit
}

/**
 * 批量清洗战场中所有单位的装备
 * 覆盖 battleState.units + deployPool
 */
function sanitizeAllUnitsEquipment() {
  const state = battleState.value
  let count = 0

  // 清洗 battlefieldState 中的 units
  if (state && state.units && Array.isArray(state.units)) {
    state.units.forEach(u => {
      const before = JSON.stringify(u.equipment || {})
      sanitizeUnitEquipment(u)
      if (JSON.stringify(u.equipment || {}) !== before) count++
    })
  }

  // 清洗 deployPool 中的单位
  if (deployPool.value && Array.isArray(deployPool.value)) {
    deployPool.value.forEach(u => sanitizeUnitEquipment(u))
  }

  if (count > 0) {
    console.log(`[EquipmentSanitizer] 已清洗 ${count} 个单位的装备 DKM 槽位 (总计 ${state?.units?.length || 0} 个战场单位)`)
    try { addLog('system', `[防爆] 已自动修复 ${count} 个单位的装备数据`) } catch(_) {}
  }
  return count
}

/**
 * 全局错误边界 — Canvas 渲染异常捕获
 * 防止 drawBattleScene 静默黑屏
 */
function safeDrawBattleScene(ctx, opts) {
  try {
    drawBattleScene(ctx, opts)
  } catch (e) {
    console.error('[CanvasCRASH] drawBattleScene 运行时报错:', e.message || e)
    console.error('[CanvasCRASH] 错误堆栈:', e.stack || '(无堆栈)')
    // 尝试在 Canvas 上绘制错误信息
    try {
      ctx.save()
      ctx.fillStyle = '#ff4444'
      ctx.font = 'bold 20px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('⚠ 渲染异常，请刷新页面', ctx.canvas.width / 2, 40)
      ctx.font = '14px monospace'
      ctx.fillStyle = '#ff8888'
      ctx.fillText(e.message || 'Unknown Error', ctx.canvas.width / 2, 65)
      ctx.restore()
    } catch(_) {}
    throw e  // 重新抛出以保持错误传播
  }
}
"""

    # Find insertion point: after sanitizeTerrainMap function ends, before "const route = useRoute()"
    inserted = False
    for i, line in enumerate(lines):
        if 'const route = useRoute()' in line:
            # Insert BEFORE this line
            lines.insert(i, equipment_sanitizer)
            print(f'[OK] A1: 装备 DKM 防爆器注入到 line {i+1} (sanitizeUnitEquipment/All + safeDraw)')
            injections += 1
            inserted = True
            break

    if not inserted:
        print('[FAIL] A1: 未找到 const route = useRoute() 注入点')
        return False

    # === A2. After battleState.value set in onMounted, call sanitizeAllUnitsEquipment() ===
    # Strategy: find onMounted first, then find the first battleState.value = data.battle || data AFTER it
    inserted2 = False
    onmounted_found = False
    for i, line in enumerate(lines):
        if 'onMounted(async () => {' in line:
            onmounted_found = True
            continue
        if onmounted_found and 'battleState.value = data.battle || data' in line:
            indent = ' ' * 8
            sanitize_call = indent + '// Phase 14: 出击装备 DKM 防爆清洗\n'
            sanitize_call += indent + 'sanitizeAllUnitsEquipment()\n'
            lines.insert(i + 1, sanitize_call)
            print(f'[OK] A2: onMounted 内 battleState 赋值后注入 sanitizeAllUnitsEquipment() at line {i+2}')
            injections += 1
            inserted2 = True
            break

    # Also for the auto-create path (inside catch block of onMounted)
    if not inserted2:
        for i, line in enumerate(lines):
            if onmounted_found and 'battleState.value = bd.battle || bd' in line:
                indent = ' ' * 8
                lines.insert(i + 1, indent + 'sanitizeAllUnitsEquipment()\n')
                print(f'[OK] A2b: auto-create 路径注入 sanitizeAllUnitsEquipment() at line {i+2}')
                injections += 1
                inserted2 = True
                break

    if not inserted2:
        print('[FAIL] A2: 未找到 onMounted 内的 battleState.value 赋值点')
        return False

    # === A3. After loadDeployPool() completes, sanitize deployPool ===
    # Target: after `await loadDeployPool()` within onMounted
    inserted3 = False
    for i, line in enumerate(lines):
        if 'await loadDeployPool()' in line:
            indent_match = re.match(r'^(\s*)', line)
            pad = indent_match.group(1) if indent_match else '      '
            # Use raw strings to avoid $ interpolation issues
            sani_line = (
                pad + '// Phase 14: 清洗部署池装备\n'
                + pad + 'if (deployPool.value && deployPool.value.length > 0) {\n'
                + pad + '  deployPool.value.forEach(u => sanitizeUnitEquipment(u))\n'
                + pad + '  console.log(\'[EquipmentSanitizer] 部署池已清洗 \' + deployPool.value.length + \' 个单位\')\n'
                + pad + '}\n'
            )
            lines.insert(i + 1, sani_line)
            print(f'[OK] A3: loadDeployPool 后注入部署池清洗 at line {i+2}')
            injections += 1
            inserted3 = True
            break

    if not inserted3:
        print('[WARN] A3: 未找到 await loadDeployPool()，可能已存在清洗逻辑')
        # Not critical, continue

    # === A4. In deployToHex, sanitize unit_data before sending ===
    # Target: before `await combatAPI.deployUnit(...)` — sanitize the unit object
    inserted4 = False
    for i, line in enumerate(lines):
        if 'await combatAPI.deployUnit(route.params.id' in line:
            # Insert sanitizeUnitEquipment(unit) right before this line
            pad = re.match(r'^(\s*)', line).group(1)
            sani_line = f'{pad}// Phase 14: 部署前清洗装备数据\n'
            sani_line += f'{pad}sanitizeUnitEquipment(unit)\n'
            lines.insert(i, sani_line)
            print(f'[OK] A4: deployToHex 部署前注入装备清洗 at line {i+1}')
            injections += 1
            inserted4 = True
            break

    if not inserted4:
        print('[WARN] A4: 未找到 deployUnit 调用点')

    # === A5. Wrap onMounted with global error boundary ===
    inserted5 = False
    for i, line in enumerate(lines):
        if 'onMounted(async () => {' in line:
            boundary_code = """  // Phase 14: 全局 Canvas 渲染错误边界 - 防止静默黑屏
  window.addEventListener('error', (event) => {
    if (event.filename && (event.filename.includes('NewBattleView') || event.filename.includes('HexGridCanvas'))) {
      console.error('[BattlefieldCRASH] 未捕获错误:', event.message)
      console.error('[BattlefieldCRASH] 文件:', event.filename, '行:', event.lineno, '列:', event.colno)
      console.error('[BattlefieldCRASH] 错误对象:', event.error)
      event.preventDefault()
    }
  })
  // 捕获 Promise rejection
  window.addEventListener('unhandledrejection', (event) => {
    console.error('[BattlefieldCRASH] 未处理的 Promise 拒绝:', event.reason)
    event.preventDefault()
  })

"""
            lines.insert(i + 1, boundary_code)
            print(f'[OK] A5: onMounted 全局错误边界注入 at line {i+2}')
            injections += 1
            inserted5 = True
            break

    if not inserted5:
        print('[FAIL] A5: 未找到 onMounted 入口')
        return False

    # === A6. Post-onMounted outer try/catch === 
    # The onMounted already has an inner try/catch. Add outer safety net.
    # Actually, we've already added the error event handlers. That's sufficient.

    # === A7. Replace draw-fn prop to use safeDrawBattleScene ===
    # Target: find `:draw-fn="drawBattleScene"` and change to safe wrapper
    inserted7 = False
    for i, line in enumerate(lines):
        if ':draw-fn="drawBattleScene"' in line:
            lines[i] = line.replace(':draw-fn="drawBattleScene"', ':draw-fn="safeDrawBattleScene"')
            print(f'[OK] A7: draw-fn 替换为 safeDrawBattleScene at line {i+1}')
            injections += 1
            inserted7 = True
            break

    if not inserted7:
        print('[FAIL] A7: 未找到 :draw-fn="drawBattleScene"')
        return False

    # === A8. Strengthen terrain sanitizer: ensure terrainMap sync is more defensive ===
    # Target: the CALL to sanitizeBattlefieldTerrain() inside onMounted, NOT the function definition
    inserted8 = False
    for i, line in enumerate(lines):
        if 'sanitizeBattlefieldTerrain()' in line and 'function' not in line:
            # This is a call site, not a function definition
            # Check preceding line for Phase 13 context
            prev_line_ok = (i > 0 and ('Phase 13' in lines[i-1] or 'Phase' in lines[i-1]))
            if not prev_line_ok:
                continue
            pad = '    '
            reinforce = (
                pad + '// Phase 14: 地形双重清洗强化 - 确保 Canvas 渲染前 terrainMap 已标准化\n'
                + pad + 'sanitizeBattlefieldTerrain()\n'
                + pad + '// 强制对 terrainMap 进行二次清洗（覆盖 battleState.terrain 未覆盖的局部变更）\n'
                + pad + 'if (terrainMap && typeof terrainMap === \"object\") {\n'
                + pad + '  let cleaned = 0\n'
                + pad + '  Object.entries(terrainMap).forEach(function(kv) {\n'
                + pad + '    const key = kv[0], val = kv[1]\n'
                + pad + '    if (typeof val === \"string\") {\n'
                + pad + '      terrainMap[key] = sanitizeTerrainCell(val)\n'
                + pad + '      cleaned++\n'
                + pad + '    } else if (val && typeof val === \"object\" && !val.terrain_id) {\n'
                + pad + '      terrainMap[key] = sanitizeTerrainCell(val)\n'
                + pad + '      cleaned++\n'
                + pad + '    }\n'
                + pad + '  })\n'
                + pad + '  if (cleaned > 0) console.log(\"[TerrainSanitizer] terrainMap 二次清洗: \" + cleaned + \" 个\")\n'
                + pad + '}\n'
            )
            lines[i] = reinforce
            print(f'[OK] A8: 地形双重清洗强化注入 at line {i+1}')
            injections += 1
            inserted8 = True
            break

    if not inserted8:
        print('[WARN] A8: 未找到 sanitizeBattlefieldTerrain() 强化点')

    # Write back
    with open(NBV_PATH, 'w') as f:
        f.writelines(lines)

    print(f'\n=== NewBattleView.vue 补丁完成: {injections}/{total_patches} 项注入 ===')
    return injections >= 5  # At least 5 successful injections


# ================================================================
#  PATCH B: 后端 damagePipe.cjs — 加固 _calcArmorReduction 防御 (额外安全网)
# ================================================================
def patch_damage_pipe():
    """加固后端 _calcArmorReduction 使其在收到空装备时也不崩溃"""
    dp_path = os.path.join(ROOT, 'services/combat-service/src/services/combatCore/damagePipe.cjs')
    if not os.path.exists(dp_path):
        print(f'[WARN] damagePipe.cjs not found, skipping backend patch')
        return True

    with open(dp_path, 'r') as f:
        content = f.read()

    original = '''    static _calcArmorReduction(attacker, defender) {
        let reduction = 0;
        const weaponType = attacker.weaponType || 'kinetic';
        const eq = defender.equipment || {};

        // 遍历所有装备槽位
        // Phase 12: 扩展槽位支持手部/其它装备 dkm
        for (const slot of ['full_armor', 'coating', 'shield_gen', 'reactive_armor', 'left_hand', 'right_hand', 'other']) {
            if (eq[slot]) {
                const slotMods = eq[slot].damage_kind_modifiers || {};
                reduction += slotMods[weaponType] || 0;
            }
        }'''

    replacement = '''    static _calcArmorReduction(attacker, defender) {
        let reduction = 0;
        const weaponType = (attacker && attacker.weaponType) || 'kinetic';
        const eq = (defender && defender.equipment) || {};

        // 遍历所有装备槽位
        // Phase 14: 加固防御 - 确保空值不引发崩溃
        for (const slot of ['full_armor', 'coating', 'shield_gen', 'reactive_armor', 'left_hand', 'right_hand', 'other']) {
            try {
                const slotData = eq[slot];
                if (slotData && typeof slotData === 'object') {
                    const slotMods = slotData.damage_kind_modifiers || {};
                    if (slotMods && typeof slotMods === 'object') {
                        reduction += Number(slotMods[weaponType]) || 0;
                    }
                }
            } catch(e) {
                console.warn(`[_calcArmorReduction] 槽位 ${slot} 处理异常:`, e.message);
            }
        }'''

    if original in content:
        content = content.replace(original, replacement)
        with open(dp_path, 'w') as f:
            f.write(content)
        print('[OK] B: damagePipe.cjs _calcArmorReduction 已加固 (try/catch + 类型检查)')
        return True
    else:
        print('[WARN] B: damagePipe.cjs 内容已变更，跳过加固')
        return False


# ================================================================
#  MAIN
# ================================================================
if __name__ == '__main__':
    print('=== Phase 14 紧急补丁: 整备室出击黑屏修复 ===')
    print()

    result_a = patch_newbattleview()
    result_b = patch_damage_pipe()

    if result_a and result_b:
        print('\n=== ALL PATCHES SUCCESSFUL ===')
    else:
        print('\n=== SOME PATCHES FAILED - see above ===')
        sys.exit(1)
