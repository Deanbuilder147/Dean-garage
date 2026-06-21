#!/usr/bin/env python3
"""
Phase 9 Feature 4: 可破坏环境单元 (Destructible Terrain) 生命周期
1. skillExecutor.cjs: 增加 terrain damage 管道拦截
2. battles.js: 增加 terrain_hp 状态管理
"""
import re

EXEC_PATH = '/root/original-project/services/combat-service/src/services/combatCore/skillExecutor.cjs'
ROUTES_PATH = '/root/original-project/services/combat-service/src/routes/battles.js'

changes = 0

# ============ Part A: skillExecutor.cjs ============

with open(EXEC_PATH) as f:
    exec_code = f.read()

exec_lines = exec_code.split('\n')

# === A1. Add terrain damage evaluation method ===
# Find the _evaluateDice method
eval_dice_idx = None
for i, line in enumerate(exec_lines):
    if '_evaluateDice(cfg)' in line:
        eval_dice_idx = i
        break

# Find a good insertion point - after _applyDiceToDamage
apply_dice_idx = None
for i, line in enumerate(exec_lines):
    if '_applyDiceToDamage(' in line:
        for j in range(i, min(i+30, len(exec_lines))):
            if exec_lines[j].strip() == '}' and 'return' in exec_lines[j-1]:
                apply_dice_idx = j + 1
                break
        break

if apply_dice_idx:
    terrain_methods = """
    // ============================================================
    // Phase9: 可破坏地形管道
    // ============================================================

    /**
     * 加载地形库配置 (从 glossary 配置 terrains 节点)
     */
    _getTerrainConfig() {
        try {
            const cfg = getGlossaryConfig()
            return cfg?.terrains || {}
        } catch (e) {
            return {}
        }
    }

    /**
     * 对目标格子施加地形伤害 (可破坏地形)
     * @param {Object} unit - 攻击方单位
     * @param {Object} targetCell - 目标格子 { q, r }
     * @param {number} damage - 造成的伤害
     * @param {Object} battleState - 战场状态 (含 terrain_hp map)
     * @returns {{ terrainDestroyed: boolean, newTerrain: string|null, message: string }}
     */
    _applyTerrainDamage(unit, targetCell, damage, battleState) {
        if (!targetCell || !battleState) return { terrainDestroyed: false, newTerrain: null, message: '' }
        const terrains = this._getTerrainConfig()
        const key = `${targetCell.q},${targetCell.r}`
        const currentTerrainId = (battleState.terrain && battleState.terrain[key]) || 'moon'
        const terrainDef = terrains[currentTerrainId]
        if (!terrainDef || !terrainDef.is_destructible) {
            return { terrainDestroyed: false, newTerrain: null, message: '' }
        }
        // 初始化 terrain_hp map
        if (!battleState.terrain_hp) battleState.terrain_hp = {}
        if (battleState.terrain_hp[key] === undefined) {
            battleState.terrain_hp[key] = terrainDef.max_hp
        }
        battleState.terrain_hp[key] -= damage
        if (battleState.terrain_hp[key] <= 0) {
            const transformTo = terrainDef.destroyed_transform_to || 'moon'
            battleState.terrain[key] = transformTo
            delete battleState.terrain_hp[key]
            return {
                terrainDestroyed: true,
                newTerrain: transformTo,
                message: `${terrainDef.name} 被摧毁！→ ${terrains[transformTo]?.name || transformTo}`
            }
        }
        return {
            terrainDestroyed: false,
            newTerrain: null,
            message: `${terrainDef.name} 受损: ${battleState.terrain_hp[key]}/${terrainDef.max_hp}`
        }
    }

    /**
     * 获取指定格子的地形防御修正
     * @returns {number} defense_bonus
     */
    _getTerrainDefenseBonus(cellQ, cellR, terrainMap) {
        if (!terrainMap) return 0
        const terrains = this._getTerrainConfig()
        const tid = terrainMap[`${cellQ},${cellR}`] || 'moon'
        const def = terrains[tid]
        return def?.defense_bonus ?? 0
    }

    /**
     * 获取指定格子的移动消耗
     * @returns {number} move_cost
     */
    _getTerrainMoveCost(cellQ, cellR, terrainMap) {
        if (!terrainMap) return 1
        const terrains = this._getTerrainConfig()
        const tid = terrainMap[`${cellQ},${cellR}`] || 'moon'
        const def = terrains[tid]
        return def?.move_cost ?? 1
    }
"""

    exec_lines = exec_lines[:apply_dice_idx] + terrain_methods.split('\n') + exec_lines[apply_dice_idx:]
    changes += 1
    print('[A1] Terrain damage methods added to skillExecutor')

# === A2. Modify _getUniversalFields to include terrain awareness ===
# This is already there, but make it check for terrain def bonus in damage calc context


# === A3. Add terrain_hp check in the module export ===
# Find module.exports
module_export_idx = None
for i, line in enumerate(exec_lines):
    if 'module.exports' in line and 'SkillExecutor' in line:
        module_export_idx = i
        break

if not module_export_idx:
    for i, line in enumerate(exec_lines):
        if 'module.exports' in line:
            module_export_idx = i
            break

if module_export_idx:
    # Add terrain-related exports
    for i in range(module_export_idx, min(module_export_idx+10, len(exec_lines))):
        if 'SkillExecutor' in exec_lines[i] or '};' in exec_lines[i] or '}' in exec_lines[i].strip():
            if 'SkillExecutor' not in exec_lines[i]:
                continue
            # Insert before this line
            terrain_export = """
/**
 * Phase9: 全局地形实用函数 (无状态, 可外部调用)
 */
function getTerrainConfig() {
    try {
        return getGlossaryConfig()?.terrains || {}
    } catch (e) { return {} }
}

function evaluateTerrainDestruction(cellQ, cellR, damage, battleState) {
    const exec = new SkillExecutor()
    return exec._applyTerrainDamage(null, { q: cellQ, r: cellR }, damage, battleState)
}
"""
            exec_lines = exec_lines[:i] + terrain_export.split('\n') + exec_lines[i:]
            changes += 1
            print('[A3] Terrain exports added to module.exports area')
            break

# Write back skillExecutor
with open(EXEC_PATH, 'w') as f:
    f.write('\n'.join(exec_lines))

# ============ Part B: battles.js routes - terrain_hp state ============

with open(ROUTES_PATH) as f:
    routes = f.read()

# Add terrain_hp initialization to battle creation
# Find battle initialization
battle_init_idx = None
# Look for where battlefield state is initialized
for m in re.finditer(r'battleState\s*=\s*\{', routes):
    battle_init_idx = m.start()
    break

if not battle_init_idx:
    # Search for terrain init
    for m in re.finditer(r'terrain\s*:', routes):
        battle_init_idx = m.start()
        # Find the line around this
        lines_r = routes.split('\n')
        for i, line in enumerate(lines_r):
            if 'terrain' in line and ':' in line and 'terrain_hp' not in line:
                # Add terrain_hp after terrain initialization
                indent = len(line) - len(line.lstrip())
                hp_line = ' ' * indent + 'terrain_hp: {},'
                lines_r.insert(i+1, hp_line)
                changes += 1
                print('[B1] terrain_hp initialization added to battle creation')
                break
        routes = '\n'.join(lines_r)
        break

if changes < 3:
    # Fallback: search for any terrain map assignment in routes
    lines_r = routes.split('\n')
    for i, line in enumerate(lines_r):
        if ('terrain' in line and ':' in line and 'terrain_hp' not in line 
            and ('battleState' in line or 'battle' in line or 'state' in line)):
            indent = len(line) - len(line.lstrip())
            hp_line = ' ' * indent + 'terrain_hp: {},'
            lines_r.insert(i+1, hp_line)
            changes += 1
            print('[B1] terrain_hp init added (fallback)')
            break
    routes = '\n'.join(lines_r)

with open(ROUTES_PATH, 'w') as f:
    f.write(routes)
print(f'DONE: {changes} changes applied for destructible terrain')
