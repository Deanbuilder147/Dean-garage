#!/usr/bin/env python3
"""Fix: insert terrain methods into SkillExecutor class"""
p = '/root/original-project/services/combat-service/src/services/combatCore/skillExecutor.cjs'
lines = open(p).read().split('\n')

# Find class closing brace (before getTerrainConfig free function)
insert_at = None
for i in range(620, min(650, len(lines))):
    if 'getTerrainConfig' in lines[i] and 'function' in lines[i]:
        for j in range(i-1, i-10, -1):
            if lines[j].strip() == '}':
                insert_at = j
                break
        break

if insert_at:
    methods = """
    // ============================================================
    // Phase9: 可破坏地形管道
    // ============================================================

    _getTerrainConfig() {
        try {
            const cfg = getGlossaryConfig()
            return cfg?.terrains || {}
        } catch (e) {
            return {}
        }
    }

    _applyTerrainDamage(unit, targetCell, damage, battleState) {
        if (!targetCell || !battleState) return { terrainDestroyed: false, newTerrain: null, message: '' }
        const terrains = this._getTerrainConfig()
        const key = targetCell.q + ',' + targetCell.r
        const currentTerrainId = (battleState.terrain && battleState.terrain[key]) || 'moon'
        const terrainDef = terrains[currentTerrainId]
        if (!terrainDef || !terrainDef.is_destructible) {
            return { terrainDestroyed: false, newTerrain: null, message: '' }
        }
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
                message: terrainDef.name + ' 被摧毁！'
            }
        }
        return {
            terrainDestroyed: false,
            newTerrain: null,
            message: terrainDef.name + ' 受损: ' + battleState.terrain_hp[key] + '/' + terrainDef.max_hp
        }
    }

    _getTerrainDefenseBonus(cellQ, cellR, terrainMap) {
        if (!terrainMap) return 0
        const terrains = this._getTerrainConfig()
        const tid = terrainMap[cellQ + ',' + cellR] || 'moon'
        const def = terrains[tid]
        return def?.defense_bonus ?? 0
    }

    _getTerrainMoveCost(cellQ, cellR, terrainMap) {
        if (!terrainMap) return 1
        const terrains = this._getTerrainConfig()
        const tid = terrainMap[cellQ + ',' + cellR] || 'moon'
        const def = terrains[tid]
        return def?.move_cost ?? 1
    }

"""
    new_lines = lines[:insert_at] + methods.split('\n') + lines[insert_at:]
    open(p, 'w').write('\n'.join(new_lines))
    print(f'OK: terrain methods inserted at line {insert_at+1}')
else:
    print('ERROR: insert point not found')
