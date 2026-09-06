#!/usr/bin/env python3
"""
Phase 3: NewBattleView.vue 综合补丁
- 平滑位移插值引擎 (Lerp)
- drawBattleScene 集成 lerp 坐标
- executeMove 接入 lerp 动画
"""
import re

FILE = '/root/original-project/frontend/src/views/NewBattleView.vue'

with open(FILE, 'r') as f:
    content = f.read()

original = content
changes = 0

# ================================================================
#  Patch 1: 在 setUnitVisual 后插入 lerp 引擎代码
# ================================================================

old_set_visual = '''/** 设置单位的视觉状态 */
function setUnitVisual(unitId, direction, actionState) {
  const existing = unitSpriteState.get(unitId) || {}
  unitSpriteState.set(unitId, {
    direction: direction ?? existing.direction ?? 0,
    actionState: actionState ?? existing.actionState ?? 'idle',
  })
}'''

new_set_visual = '''/** 设置单位的视觉状态 */
function setUnitVisual(unitId, direction, actionState) {
  const existing = unitSpriteState.get(unitId) || {}
  unitSpriteState.set(unitId, {
    direction: direction ?? existing.direction ?? 0,
    actionState: actionState ?? existing.actionState ?? 'idle',
  })
}

// === Phase 3: 平滑位移插值引擎 (Lerp) ===
// unitLerpState: Map<unitId, { fromX, fromY, toX, toY, startTime, duration, onComplete }>
const unitLerpState = reactive(new Map())
let _lerpAnimId = null

/** 启动单位平滑位移动画 (flatX/flatY 空间线性插值) */
function startLerpAnimation(unitId, fromFlat, toFlat, duration = 300, onComplete = null) {
  unitLerpState.set(unitId, {
    fromX: fromFlat.flatX,
    fromY: fromFlat.flatY,
    toX:   toFlat.flatX,
    toY:   toFlat.flatY,
    startTime: performance.now(),
    duration,
    onComplete,
  })
  if (!_lerpAnimId) _tickLerp()
}

/** 强制停止某单位的位移动画 */
function stopLerpAnimation(unitId) {
  unitLerpState.delete(unitId)
}

/** 清除所有位移动画 */
function clearAllLerp() {
  unitLerpState.clear()
  if (_lerpAnimId) { cancelAnimationFrame(_lerpAnimId); _lerpAnimId = null }
}

/** 每帧 tick：更新插值位置 + 触发重绘 */
function _tickLerp() {
  const now = performance.now()
  let hasActive = false

  unitLerpState.forEach((entry, id) => {
    const elapsed = now - entry.startTime
    const rawT = Math.min(elapsed / entry.duration, 1.0)
    // easeInOutCubic: 开始慢 → 中间快 → 结束慢，更自然的机甲移动感
    const t = rawT < 0.5 ? 4 * rawT * rawT * rawT : 1 - Math.pow(-2 * rawT + 2, 3) / 2
    entry.currentX = entry.fromX + (entry.toX - entry.fromX) * t
    entry.currentY = entry.fromY + (entry.toY - entry.fromY) * t

    if (rawT >= 1.0) {
      entry.currentX = entry.toX
      entry.currentY = entry.toY
      const cb = entry.onComplete
      unitLerpState.delete(id)
      if (cb) cb()
    } else {
      hasActive = true
    }
  })

  hexGrid.value?.redraw()

  if (hasActive) {
    _lerpAnimId = requestAnimationFrame(_tickLerp)
  } else {
    _lerpAnimId = null
  }
}

/** 获取单位当前在屏幕上的绘制坐标 (考虑 lerp 插值) */
function getUnitDrawFlat(unit) {
  const lerpEntry = unitLerpState.get(unit.id)
  if (lerpEntry && lerpEntry.currentX !== undefined && lerpEntry.currentY !== undefined) {
    return { flatX: lerpEntry.currentX, flatY: lerpEntry.currentY }
  }
  // fallback: 静态六角中心坐标
  const { flatX, flatY } = pointyTopCenter(unit.q, unit.r, HEX_RADIUS, spacingH, spacingV)
  return { flatX, flatY }
}'''

if old_set_visual in content:
    content = content.replace(old_set_visual, new_set_visual, 1)
    changes += 1
    print('PATCH 1 OK: lerp engine inserted after setUnitVisual')
else:
    print('ERROR: PATCH 1 - setUnitVisual not found!')
    exit(1)

# ================================================================
#  Patch 2: executeMove — 集成 lerp 动画
# ================================================================

old_execute_move = '''async function executeMove(tq, tr) {
  if (!selectedUnit.value) return
  const unit = selectedUnit.value
  const fromQ = unit.q, fromR = unit.r

  // Phase 2: 计算移动方向并设置朝向 + 移动状态
  const dir = computeDirection(fromQ, fromR, tq, tr)
  if (dir !== null) {
    setUnitVisual(unit.id, dir, 'move')
  } else {
    setUnitVisual(unit.id, null, 'move')
  }
  hexGrid.value?.redraw()

  try {
    const fromCoord = formatCoord(fromQ, fromR)
    await combatAPI.move(route.params.id, { unit_id: String(unit.id), target_q: tq, target_r: tr })
    const toCoord = formatCoord(tq, tr)
    addLog('move', `${unit.name} 从 ${fromCoord} 移动到 ${toCoord}`)
    actionMode.value = null
    await refreshState()
    // Phase 2: 移动完成后保持朝向，恢复 idle
    setUnitVisual(unit.id, dir ?? 0, 'idle')
    hexGrid.value?.redraw()
  } catch (e) {
    addLog('error', `移动失败: ${e.response?.data?.error || e.message}`)
    // Phase 2: 移动失败恢复默认状态
    setUnitVisual(unit.id, 0, 'idle')
    cancelAction()
  }
}'''

new_execute_move = '''async function executeMove(tq, tr) {
  if (!selectedUnit.value) return
  const unit = selectedUnit.value
  const fromQ = unit.q, fromR = unit.r

  // Phase 2+3: 计算移动方向并设置朝向 + 移动状态
  const dir = computeDirection(fromQ, fromR, tq, tr)
  if (dir !== null) {
    setUnitVisual(unit.id, dir, 'move')
  } else {
    setUnitVisual(unit.id, null, 'move')
  }

  // Phase 3: 平滑位移 — 先发起 API，成功后启动 lerp 动画
  try {
    const fromCoord = formatCoord(fromQ, fromR)
    const { flatX: fromX, flatY: fromY } = pointyTopCenter(fromQ, fromR, HEX_RADIUS, spacingH, spacingV)
    const { flatX: toX, flatY: toY } = pointyTopCenter(tq, tr, HEX_RADIUS, spacingH, spacingV)

    await combatAPI.move(route.params.id, { unit_id: String(unit.id), target_q: tq, target_r: tr })
    const toCoord = formatCoord(tq, tr)
    addLog('move', `${unit.name} 从 ${fromCoord} 移动到 ${toCoord}`)

    // 启动 lerp 动画 (每格约 300ms)
    const distance = Math.sqrt((toX - fromX) ** 2 + (toY - fromY) ** 2)
    const duration = Math.max(200, Math.min(600, distance * 2.5))
    actionMode.value = null

    startLerpAnimation(unit.id, { flatX: fromX, flatY: fromY }, { flatX: toX, flatY: toY }, duration, async () => {
      // lerp 完成后：刷新服务器状态 + 恢复 idle
      stopLerpAnimation(unit.id)
      await refreshState()
      setUnitVisual(unit.id, dir ?? 0, 'idle')
    })
  } catch (e) {
    addLog('error', `移动失败: ${e.response?.data?.error || e.message}`)
    // Phase 2+3: 移动失败恢复默认状态
    stopLerpAnimation(unit.id)
    setUnitVisual(unit.id, 0, 'idle')
    cancelAction()
  }
}'''

if old_execute_move in content:
    content = content.replace(old_execute_move, new_execute_move, 1)
    changes += 1
    print('PATCH 2 OK: executeMove lerp integration')
else:
    print('ERROR: PATCH 2 - executeMove not found!')
    exit(1)

# ================================================================
#  Patch 3: drawBattleScene — 使用 lerp 插值坐标绘制单位
# ================================================================

# Replace the unit mapping block that computes flatX/flatY per unit
old_zorder = '''  // 预计算各 unit 的屏幕 Y，用于 Z-order 排序
  const unitsWithScreenY = allUnits.value
    .filter(u => u.q !== undefined)
    .map(u => {
      const { flatX, flatY } = pointyTopCenter(u.q, u.r, HEX_RADIUS, spacingH, spacingV)
      const screenY = oy + s * (iso.scaleY * flatX + iso.shearY * flatY)
      return { unit: u, flatX, flatY, screenY }
    })
    .sort((a, b) => a.screenY - b.screenY)  // Y小(靠后)先绘 → Y大(靠前)覆盖

  unitsWithScreenY.forEach(({ unit, flatX, flatY }) => {'''

new_zorder = '''  // 预计算各 unit 的屏幕 Y，用于 Z-order 排序
  // Phase 3: 使用 getUnitDrawFlat 获取考虑 lerp 插值的实时坐标
  const unitsWithScreenY = allUnits.value
    .filter(u => u.q !== undefined)
    .map(u => {
      const { flatX, flatY } = getUnitDrawFlat(u)
      const screenY = oy + s * (iso.scaleY * flatX + iso.shearY * flatY)
      return { unit: u, flatX, flatY, screenY }
    })
    .sort((a, b) => a.screenY - b.screenY)  // Y小(靠后)先绘 → Y大(靠前)覆盖

  unitsWithScreenY.forEach(({ unit, flatX, flatY }) => {'''

if old_zorder in content:
    content = content.replace(old_zorder, new_zorder, 1)
    changes += 1
    print('PATCH 3 OK: drawBattleScene Z-order uses lerp positions')
else:
    print('ERROR: PATCH 3 - Z-order block not found!')
    exit(1)

# ================================================================
#  Patch 4: refreshState 中清除 lerp 残留
# ================================================================

old_refresh = '''  // Phase 2: 全局刷新后将所有 unit actionState 恢复 idle（保持 direction）
  const allUnitIds = allUnits.value.map(u => u.id)
  unitSpriteState.forEach((state, id) => {
    unitSpriteState.set(id, { direction: state.direction, actionState: 'idle' })
  })'''

new_refresh = '''  // Phase 2+3: 全局刷新后将所有 unit actionState 恢复 idle（保持 direction）
  // Phase 3: 清除过期的 lerp 动画状态
  const allUnitIds = allUnits.value.map(u => u.id)
  unitSpriteState.forEach((state, id) => {
    unitSpriteState.set(id, { direction: state.direction, actionState: 'idle' })
  })
  // 清除已不在场上单位的 lerp 状态
  unitLerpState.forEach((_, id) => {
    if (!allUnitIds.includes(id)) unitLerpState.delete(id)
  })'''

if old_refresh in content:
    content = content.replace(old_refresh, new_refresh, 1)
    changes += 1
    print('PATCH 4 OK: refreshState lerp cleanup')
else:
    print('ERROR: PATCH 4 - refreshState not found!')
    exit(1)

# ================================================================
#  Write back
# ================================================================

with open(FILE, 'w') as f:
    f.write(content)

print(f'\n=== Phase 3 NewBattleView Patch Summary ===')
print(f'Total changes: {changes}/4 applied')
print(f'Lines: {len(original.splitlines())} → {len(content.splitlines())}')

# ================================================================
#  Validation
# ================================================================

checks = {
    'GOOD: unitLerpState': 'unitLerpState',
    'GOOD: startLerpAnimation': 'startLerpAnimation',
    'GOOD: stopLerpAnimation': 'stopLerpAnimation',
    'GOOD: _tickLerp': '_tickLerp',
    'GOOD: getUnitDrawFlat': 'getUnitDrawFlat',
    'GOOD: easeInOutCubic': 'easeInOutCubic',
    'GOOD: executeMove lerp': 'startLerpAnimation(unit.id',
    'GOOD: drawBattleScene getUnitDrawFlat': 'getUnitDrawFlat(u)',
    'GOOD: refreshState lerp cleanup': 'unitLerpState.delete(id)',
}

passed = 0
for label, pattern in checks.items():
    if pattern in content:
        print(f'  ✅ {label}')
        passed += 1
    else:
        print(f'  ❌ {label} - NOT FOUND')

print(f'\nValidation: {passed}/{len(checks)} passed')
