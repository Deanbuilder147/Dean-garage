#!/usr/bin/env python3
"""Phase 2: NewBattleView.vue — Billboard 2D Sprite 渲染 + 状态机绑定"""
import os, re, shutil
from datetime import datetime

TARGET = '/root/original-project/frontend/src/views/NewBattleView.vue'
BACKUP_DIR = '/root/original-project/frontend/backups/20260619-phase2-sprite'

os.makedirs(BACKUP_DIR, exist_ok=True)
shutil.copy2(TARGET, os.path.join(BACKUP_DIR, 'NewBattleView.vue'))

with open(TARGET, 'r') as f:
    content = f.read()

original = content
changes = []

# ================================================================
# Change 1: 在 hexUtils import 中添加 computeDirection
# ================================================================
old_import = "import { HEX_WIDTH, HEX_HEIGHT, HEX_APOTHEM, HEX_RADIUS, DEFAULT_SPACING_H, DEFAULT_SPACING_V, DEFAULT_OFFSET_FACTOR, drawHexPath, getHexNeighbors, TERRAIN_COLORS, UNIVERSAL_TERRAIN_MAP, convertMapFormat, ISO_DEFAULTS, pointyTopCenter, pointyTopToHex } from '../utils/hexUtils.js'"
new_import = "import { HEX_WIDTH, HEX_HEIGHT, HEX_APOTHEM, HEX_RADIUS, DEFAULT_SPACING_H, DEFAULT_SPACING_V, DEFAULT_OFFSET_FACTOR, drawHexPath, getHexNeighbors, TERRAIN_COLORS, UNIVERSAL_TERRAIN_MAP, convertMapFormat, ISO_DEFAULTS, pointyTopCenter, pointyTopToHex, computeDirection } from '../utils/hexUtils.js'"
if old_import not in content:
    print("ERROR: hexUtils import not found!")
    exit(1)
content = content.replace(old_import, new_import, 1)
changes.append("✓ Added computeDirection to hexUtils import")

# ================================================================
# Change 2: 添加 unitSpriteResolver import
# ================================================================
old_comp_import = "import HexGridCanvas from '../components/HexGridCanvas.vue'"
new_comp_import = "import HexGridCanvas from '../components/HexGridCanvas.vue'\nimport { unitSpriteResolver } from '../resolvers/unitSpriteResolver.js'"
if old_comp_import not in content:
    print("ERROR: HexGridCanvas import not found!")
    exit(1)
content = content.replace(old_comp_import, new_comp_import, 1)
changes.append("✓ Added unitSpriteResolver import")

# ================================================================
# Change 3: 在 unitImageCache 后添加 unitSpriteState + 辅助函数
# ================================================================
old_cache = 'const unitImageCache = {} // 缓存单位图片'
new_cache = '''const unitImageCache = {} // 缓存单位图片

// === Phase 2: 单位视觉状态（朝向 + 动画状态机）===
// 客户端侧维护，不依赖后端数据，跨 refreshState() 持久化
const unitSpriteState = reactive(new Map())

/** 获取单位的视觉状态 */
function getUnitVisual(unit) {
  const state = unitSpriteState.get(unit.id)
  return {
    direction: state?.direction ?? 0,
    actionState: state?.actionState ?? 'idle',
  }
}

/** 设置单位的视觉状态 */
function setUnitVisual(unitId, direction, actionState) {
  const existing = unitSpriteState.get(unitId) || {}
  unitSpriteState.set(unitId, {
    direction: direction ?? existing.direction ?? 0,
    actionState: actionState ?? existing.actionState ?? 'idle',
  })
}'''
if old_cache not in content:
    print("ERROR: unitImageCache not found!")
    exit(1)
content = content.replace(old_cache, new_cache, 1)
changes.append("✓ Added unitSpriteState + getUnitVisual/setUnitVisual")

# ================================================================
# Change 4: 替换 drawBattleScene 中的 unit 渲染循环 (Billboard 模式)
# ================================================================
# 找到 "// Draw units (sorted by flatY" 到 "// Draw deployed RoyRoy markers"
old_unit_render_start = '  // Draw units (sorted by flatY for correct iso layering: back → front)'
old_unit_render_end = '  // Draw deployed RoyRoy markers (sorted by flatY for correct iso layering)'

if old_unit_render_start not in content:
    print("ERROR: Unit render start marker not found!")
    exit(1)
if old_unit_render_end not in content:
    print("ERROR: RoyRoy marker marker not found!")
    exit(1)

idx_start = content.index(old_unit_render_start)
idx_end = content.index(old_unit_render_end)

new_unit_render = '''  // ================================================================
  //  Draw units — Billboard 2D 垂直站立渲染 (Phase 2)
  //  按 screenY Z-order 排序，逃逸 ISO 矩阵以保持 1:1 正常比例
  // ================================================================

  // 从 HexGridCanvas 暴露的 API 获取变换参数
  const iso = hexGrid.value?.ISO || ISO_DEFAULTS
  const s = hexGrid.value?.scale || 1
  const ox = hexGrid.value?.offsetX || 0
  const oy = hexGrid.value?.offsetY || 0

  // 预计算各 unit 的屏幕 Y，用于 Z-order 排序
  const unitsWithScreenY = allUnits.value
    .filter(u => u.q !== undefined)
    .map(u => {
      const { flatX, flatY } = pointyTopCenter(u.q, u.r, HEX_RADIUS, spacingH, spacingV)
      const screenY = oy + s * (iso.scaleY * flatX + iso.shearY * flatY)
      return { unit: u, flatX, flatY, screenY }
    })
    .sort((a, b) => a.screenY - b.screenY)  // Y小(靠后)先绘 → Y大(靠前)覆盖

  unitsWithScreenY.forEach(({ unit, flatX, flatY }) => {
    if (unit.q === undefined) return

    const isSelected = selectedUnit.value?.id === unit.id
    const fc = getFactionColor(unit.faction)
    const isConcealed = unit.concealed === true

    // === Step A: 计算屏幕空间锚点 (unit 脚底中心) ===
    const screenX = ox + s * (iso.scaleX * flatX + iso.shearX * flatY)
    const screenY = oy + s * (iso.shearY * flatX + iso.scaleY * flatY)

    // === Step B: 逃逸 ISO 矩阵 ===
    ctx.save()

    // === Step C: 重置为单位矩阵，定位到屏幕像素 ===
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.translate(screenX, screenY)
    ctx.scale(s, s)  // 只缩放，不倾斜

    // === Step D: 查询切图纹理 ===
    const visual = getUnitVisual(unit)
    const unitCode = unit.unitCode || unit.type || String(unit.id)
    const fallbackCode = 'DEFAULT'
    const sprite = !isConcealed
      ? unitSpriteResolver.getTexture(unitCode, visual.direction, visual.actionState, fallbackCode)
      : null

    const hasSprite = sprite && sprite.image.complete && sprite.image.naturalWidth > 0

    if (hasSprite && !isConcealed) {
      // ---- 2D 棋子以 1:1 正常比例绘制 (不受 ISO 压扁) ----
      ctx.drawImage(
        sprite.image,
        sprite.sx, sprite.sy, sprite.sw, sprite.sh,
        -sprite.anchorX, -sprite.anchorY,
        sprite.renderW, sprite.renderH
      )
    } else {
      // ---- Fallback: 圆形底色 + 首字母 ----
      const r = HEX_RADIUS * 0.4
      ctx.beginPath()
      ctx.arc(0, 0, r, 0, Math.PI * 2)
      ctx.fillStyle = isConcealed ? hexToRGBA(fc, 0.15) : hexToRGBA(fc, 0.45)
      ctx.fill()
      ctx.strokeStyle = isConcealed && !isSelected ? hexToRGBA(fc, 0.3) : (isSelected ? '#ffffff' : fc)
      ctx.lineWidth = isSelected ? 3.5 : 2.5
      if (isConcealed && !isSelected) ctx.setLineDash([3, 4])
      ctx.stroke()
      ctx.setLineDash([])

      const letter = (unit.name || 'U')[0]
      ctx.fillStyle = fc
      ctx.font = 'bold 16px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(letter, 0, 0)
    }

    // Selection ring
    if (isSelected) {
      ctx.beginPath()
      ctx.arc(0, 0, HEX_RADIUS * 0.5, 0, Math.PI * 2)
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 2
      ctx.setLineDash([4, 3])
      ctx.stroke()
      ctx.setLineDash([])
    }

    // Concealment indicator
    if (isConcealed) {
      ctx.beginPath()
      ctx.arc(0, -HEX_RADIUS * 0.33, 2.5, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(0,180,220,0.7)'
      ctx.fill()
    }

    // HP bar (在 billboard 空间内绘制，保证不变形)
    const hpPct = Math.max(0, (unit.hp || 100) / 100)
    const barW = HEX_RADIUS * 0.6
    const barH = 3
    const barY = HEX_RADIUS * 0.32
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillRect(-barW / 2, barY, barW, barH)
    ctx.fillStyle = hpPct > 0.5 ? '#13ff43' : hpPct > 0.25 ? '#ffb000' : '#ff4d4d'
    ctx.fillRect(-barW / 2, barY, barW * hpPct, barH)

    // === Step E: 恢复 CTM ===
    ctx.restore()
  })

  // Draw deployed RoyRoy markers (sorted by flatY for correct iso layering)'''

content = content[:idx_start] + new_unit_render + content[idx_end:]
changes.append("✓ Replaced unit rendering with Billboard 2D sprite pipeline")

# ================================================================
# Change 5: 修改 executeMove — 设置 direction + actionState='move'
# ================================================================
old_move = '''async function executeMove(tq, tr) {
  if (!selectedUnit.value) return
  const unit = selectedUnit.value
  try {
    const fromCoord = formatCoord(unit.q, unit.r)'''

new_move = '''async function executeMove(tq, tr) {
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
    const fromCoord = formatCoord(fromQ, fromR)'''

if old_move not in content:
    print("ERROR: executeMove start not found!")
    exit(1)
content = content.replace(old_move, new_move, 1)
changes.append("✓ Added direction compute + actionState='move' in executeMove")

# ================================================================
# Change 6: executeMove 成功后恢复 actionState='idle'
# ================================================================
old_move_success = '''    const toCoord = formatCoord(tq, tr)
    addLog('move', `${unit.name} 从 ${fromCoord} 移动到 ${toCoord}`)
    actionMode.value = null
    await refreshState()'''

new_move_success = '''    const toCoord = formatCoord(tq, tr)
    addLog('move', `${unit.name} 从 ${fromCoord} 移动到 ${toCoord}`)
    actionMode.value = null
    await refreshState()
    // Phase 2: 移动完成后保持朝向，恢复 idle
    setUnitVisual(unit.id, dir ?? 0, 'idle')
    hexGrid.value?.redraw()'''

if old_move_success not in content:
    print("ERROR: executeMove success block not found!")
    exit(1)
content = content.replace(old_move_success, new_move_success, 1)
changes.append("✓ Added post-move actionState='idle' restore")

# ================================================================
# Change 7: executeMove 失败后恢复状态
# ================================================================
old_move_error = '''    addLog('error', `移动失败: ${e.response?.data?.error || e.message}`)
    cancelAction()
  }
}'''

new_move_error = '''    addLog('error', `移动失败: ${e.response?.data?.error || e.message}`)
    // Phase 2: 移动失败恢复默认状态
    setUnitVisual(unit.id, 0, 'idle')
    cancelAction()
  }
}'''

if old_move_error not in content:
    print("ERROR: executeMove error block not found!")
    exit(1)
content = content.replace(old_move_error, new_move_error, 1)
changes.append("✓ Added executeMove error recovery for visual state")

# ================================================================
# Change 8: executeAction — defend → actionState='defend', wait → 'wait'
# ================================================================
old_defend = '''    if (type === 'defend') {
      addLog('action', `${unit.name} 进入防御姿态 (+15 护盾)`)
      // Attempt backend call'''

new_defend = '''    if (type === 'defend') {
      addLog('action', `${unit.name} 进入防御姿态 (+15 护盾)`)
      // Phase 2: 防御姿态视觉
      setUnitVisual(unit.id, null, 'defend')
      // Attempt backend call'''

if old_defend not in content:
    print("ERROR: defend block not found!")
    exit(1)
content = content.replace(old_defend, new_defend, 1)

# For 'wait'
old_wait = '''    } else if (type === 'wait') {
      addLog('action', `${unit.name} 原地待机`)
      try {'''

new_wait = '''    } else if (type === 'wait') {
      addLog('action', `${unit.name} 原地待机`)
      // Phase 2: 待命视觉
      setUnitVisual(unit.id, null, 'wait')
      try {'''

if old_wait not in content:
    print("ERROR: wait block not found!")
    exit(1)
content = content.replace(old_wait, new_wait, 1)
changes.append("✓ Added defend/wait actionState management")

# ================================================================
# Change 9: refreshState — 恢复所有 unit 的 actionState 为 idle
# ================================================================
old_refresh = '''  // Preserve selection if unit still exists
  if (selectedUnit.value) {
    const found = allUnits.value.find(u => u.id === selectedUnit.value.id)
    if (found) selectedUnit.value = found
    else selectedUnit.value = null
  }
  // 加载阵营冷却和胜利条件
  loadFactionRoles(); loadFactionCooldowns().catch(() => {})
  loadVictoryInfo().catch(() => {})
  hexGrid.value?.redraw()'''

new_refresh = '''  // Preserve selection if unit still exists
  if (selectedUnit.value) {
    const found = allUnits.value.find(u => u.id === selectedUnit.value.id)
    if (found) selectedUnit.value = found
    else selectedUnit.value = null
  }
  // Phase 2: 全局刷新后将所有 unit actionState 恢复 idle（保持 direction）
  const allUnitIds = allUnits.value.map(u => u.id)
  unitSpriteState.forEach((state, id) => {
    unitSpriteState.set(id, { direction: state.direction, actionState: 'idle' })
  })
  // 加载阵营冷却和胜利条件
  loadFactionRoles(); loadFactionCooldowns().catch(() => {})
  loadVictoryInfo().catch(() => {})
  hexGrid.value?.redraw()'''

if old_refresh not in content:
    print("ERROR: refreshState block not found!")
    exit(1)
content = content.replace(old_refresh, new_refresh, 1)
changes.append("✓ Added refreshState actionState='idle' reset")

# ================================================================
# 写入
# ================================================================
with open(TARGET, 'w') as f:
    f.write(content)

print(f"\nAll changes applied ({len(changes)}):")
for c in changes:
    print(f"  {c}")

# 验证
with open(TARGET, 'r') as f:
    verify = f.read()

checks = [
    ('computeDirection in import', 'computeDirection', True),
    ('unitSpriteResolver import', 'unitSpriteResolver', True),
    ('unitSpriteState', 'unitSpriteState = reactive', True),
    ('getUnitVisual', 'function getUnitVisual', True),
    ('setUnitVisual', 'function setUnitVisual', True),
    ('Billboard: setTransform escape', 'ctx.setTransform(1, 0, 0, 1, 0, 0)', True),
    ('Billboard: screenX calc', 'iso.scaleX * flatX + iso.shearX * flatY', True),
    ('Billboard: getTexture call', 'unitSpriteResolver.getTexture', True),
    ('Billboard: fallback rendering', 'Fallback: 圆形底色', True),
    ('executeMove direction', 'computeDirection(fromQ, fromR, tq, tr)', True),
    ('executeMove actionState move', "setUnitVisual(unit.id, null, 'move')", True),
    ('executeMove restore idle', "setUnitVisual(unit.id, dir ?? 0, 'idle')", True),
    ('defend actionState', "setUnitVisual(unit.id, null, 'defend')", True),
    ('wait actionState', "setUnitVisual(unit.id, null, 'wait')", True),
    ('refreshState idle reset', "actionState: 'idle'", True),
    # BAD: ensure old code is gone
    ('OLD: unit main_image_url', "unit.main_image_url", False),
    ('OLD: unitImageCache[unit.id]', "unitImageCache[unit.id]", False),
    ('OLD: tokenRadius', "tokenRadius", False),
]
print("\nVerification:")
ok = True
for label, pattern, should_exist in checks:
    found = pattern in verify
    status = '✓' if found == should_exist else '✗'
    if found != should_exist:
        ok = False
        print(f"  {status} {label} (expected={should_exist}, found={found})")
    else:
        print(f"  {status} {label}")

lines = len(verify.splitlines())
print(f"\nFinal size: {lines} lines (original: {len(original.splitlines())})")
print(f"Backup: {BACKUP_DIR}/NewBattleView.vue")
print(f"Result: {'ALL OK' if ok else 'SOME CHECKS FAILED'}")
