#!/usr/bin/env python3
"""
Phase 9.5: 全面落地"区间地形批量刷"与"可破坏生态单元"
三大手术:
  1. glossary-skill-config.json: 添加 city_building / rubble 地形
  2. damagePipe.cjs: 新增 calculateTerrainDamage 管道
  3. terrainMovement.cjs: 支持 is_destructible / max_hp / 动态地形转换
"""
import sys, json, os

ROOT = '/root/original-project'
changes_log = []

# ================================================================
# Part 1: 补全 glossary-skill-config.json 地形字典
# ================================================================
glossary_path = os.path.join(ROOT, 'services/combat-service/src/config/glossary-skill-config.json')
with open(glossary_path, 'r') as f:
    glossary = json.load(f)

added = 0
# 添加 rubble (残骸)
if 'rubble' not in glossary['terrains']:
    glossary['terrains']['rubble'] = {
        "name": "残骸",
        "color": "#8b7d6b",
        "move_cost": 2,
        "defense_bonus": 10,
        "is_destructible": False,
        "max_hp": 0,
        "destroyed_transform_to": "rubble"
    }
    added += 1
    changes_log.append(f'  + rubble (残骸) 地形')

# 添加 city_building (城市建筑) — 可破坏生态单元核心案例
if 'city_building' not in glossary['terrains']:
    glossary['terrains']['city_building'] = {
        "name": "城市建筑",
        "color": "#b8860b",
        "move_cost": 1,
        "defense_bonus": 25,
        "is_destructible": True,
        "max_hp": 4,
        "destroyed_transform_to": "rubble"
    }
    added += 1
    changes_log.append(f'  + city_building (城市建筑, 可破坏→残骸) 地形')

with open(glossary_path, 'w') as f:
    json.dump(glossary, f, indent=2, ensure_ascii=False)

print(f'[1/3] glossary-skill-config.json: 添加 {added} 种地形')

# ================================================================
# Part 2: 扩展 damagePipe.cjs — 新增可破坏地形伤害管道
# ================================================================
damage_path = os.path.join(ROOT, 'services/combat-service/src/services/combatCore/damagePipe.cjs')
with open(damage_path, 'r') as f:
    damage_content = f.read()

# Insert terrain damage method BEFORE calculateQuick
insert_marker = '''    static calculateQuick(attacker, defender, attackType = 'melee') {'''

terrain_damage_code = '''
    // ============================================================
    //  Phase 9.5: 可破坏地形伤害管道
    //  当攻击目标为地形格子且 is_destructible=true 时，扣减 terrain_hp
    //  HP 归零时返回地形退化结果，并更新寻路 move_cost
    // ============================================================

    /**
     * 计算对可破坏地形的伤害
     * @param {Object} attacker      - 攻击者单位数据 { attack, weaponType, ... }
     * @param {Object} terrainCell   - 目标地形格子 { terrain_id, terrain_hp, is_destructible, max_hp, destroyed_transform_to }
     * @param {Object} terrainDefs   - 全地形定义字典 (用于获取退化后地形的 move_cost)
     * @returns {Object} { damage, hp_before, hp_after, destroyed, new_terrain_id, new_move_cost }
     */
    static calculateTerrainDamage(attacker, terrainCell, terrainDefs = {}) {
        const result = {
            damage: 0,
            hp_before: terrainCell.terrain_hp || terrainCell.max_hp || 0,
            hp_after: 0,
            destroyed: false,
            new_terrain_id: null,
            new_move_cost: null,
            message: ''
        }

        // 不可破坏地形，直接返回
        if (!terrainCell.is_destructible) {
            result.hp_after = result.hp_before
            result.message = `${terrainCell.terrain_id} 不可破坏`
            return result
        }

        // 计算基础伤害 (与单位伤害管道一致的攻击力取值)
        const baseAttack = attacker.melee || attacker.ranged || attacker.attack || 10

        // 对地形的伤害 = 基础攻击力 * 0.8 (地形无机动值闪避)
        // 某些武器类型对建筑有加成
        let damage = Math.floor(baseAttack * 0.8)
        if (attacker.weaponType === 'explosive' || attacker.weaponType === 'beam') {
            damage = Math.floor(baseAttack * 1.0)  // 爆炸/光束对建筑全额伤害
        }

        // 保底伤害
        if (damage < 1) damage = 1

        result.damage = damage

        // 计算剩余 HP
        const maxHp = terrainCell.max_hp || 1
        result.hp_after = Math.max(0, result.hp_before - damage)

        // 判断是否破坏
        if (result.hp_after <= 0) {
            result.destroyed = true
            const transformTo = terrainCell.destroyed_transform_to || 'plain'
            result.new_terrain_id = transformTo

            // 获取退化后地形的移动消耗
            const newTerrain = terrainDefs[transformTo] || {}
            result.new_move_cost = newTerrain.move_cost !== undefined
                ? newTerrain.move_cost
                : (newTerrain.cost !== undefined ? newTerrain.cost : 1)

            result.message = `${terrainCell.terrain_id} 被摧毁! 退化 → ${transformTo} (move_cost=${result.new_move_cost})`
        } else {
            result.message = `${terrainCell.terrain_id} 受到 ${damage} 点伤害，剩余 ${result.hp_after}/${maxHp} HP`
        }

        return result
    }

    /**
     * 便捷方法：计算并应用地形伤害 (返回更新后的 terrainCell 快照)
     */
    static applyTerrainDamage(attacker, terrainCell, terrainDefs = {}) {
        const result = this.calculateTerrainDamage(attacker, terrainCell, terrainDefs)

        // 更新 terrainCell 的运行时 HP
        terrainCell.terrain_hp = result.hp_after

        // 如果被破坏，更新 terrain_id 和 move_cost
        if (result.destroyed && result.new_terrain_id) {
            terrainCell.terrain_id = result.new_terrain_id
            terrainCell.is_destructible = false
            terrainCell.max_hp = 0
            terrainCell.destroyed_transform_to = result.new_terrain_id
        }

        return result
    }

'''

if insert_marker in damage_content:
    damage_content = damage_content.replace(insert_marker, terrain_damage_code + '\n' + insert_marker)
    print('[2/3] damagePipe.cjs: 新增 calculateTerrainDamage / applyTerrainDamage 管道')
else:
    print('[2/3] ERROR: damagePipe.cjs marker not found!')

with open(damage_path, 'w') as f:
    f.write(damage_content)

# ================================================================
# Part 3: 扩展 terrainMovement.cjs — 支持可破坏地形与动态转换
# ================================================================
terrain_path = os.path.join(ROOT, 'services/combat-service/src/services/combatCore/terrainMovement.cjs')
with open(terrain_path, 'r') as f:
    terrain_content = f.read()

# Update FALLBACK_TERRAINS to include destructible fields
old_fallback = """  static FALLBACK_TERRAINS = {
    empty:     { name: '空地',     cost: 1,  defense: 0,  can_spawn: true,  color: '#88CC88' },
    plain:     { name: '平原',     cost: 1,  defense: 0,  can_spawn: true,  color: '#AAFFAA' },
    forest:    { name: '森林',     cost: 2,  defense: 10, can_spawn: true,  color: '#228822' },
    mountain:  { name: '山地',     cost: 3,  defense: 20, can_spawn: false, color: '#886644' },
    water:     { name: '水域',     cost: 99, defense: 0,  can_spawn: false, color: '#4488FF' },
    base:      { name: '基地',     cost: 1,  defense: 0,  can_spawn: true,  color: '#FF4444' },
    mothership:{ name: '母舰',     cost: 1,  defense: 0,  can_spawn: true,  color: '#FFD700' },
    ruin:      { name: '废墟',     cost: 2,  defense: 15, can_spawn: true,  color: '#998866' },
    lava:      { name: '岩浆',     cost: 3,  defense: 0,  can_spawn: false, color: '#FF6600' },
    lunar:     { name: '月面',     cost: 1,  defense: 0,  can_spawn: true,  color: '#CCCCCC' },
    crater:    { name: '陨石坑',   cost: 2,  defense: 5,  can_spawn: true,  color: '#777766' },
  }"""

new_fallback = """  // Phase9.5: 回退地形表 — 新增 is_destructible / max_hp / destroyed_transform_to 字段
  static FALLBACK_TERRAINS = {
    empty:     { name: '空地',     cost: 1,  defense: 0,  can_spawn: true,  color: '#88CC88', is_destructible: false, max_hp: 0, destroyed_transform_to: 'empty' },
    plain:     { name: '平原',     cost: 1,  defense: 0,  can_spawn: true,  color: '#AAFFAA', is_destructible: false, max_hp: 0, destroyed_transform_to: 'plain' },
    forest:    { name: '森林',     cost: 2,  defense: 10, can_spawn: true,  color: '#228822', is_destructible: true,  max_hp: 3, destroyed_transform_to: 'plain' },
    mountain:  { name: '山地',     cost: 3,  defense: 20, can_spawn: false, color: '#886644', is_destructible: false, max_hp: 0, destroyed_transform_to: 'mountain' },
    water:     { name: '水域',     cost: 99, defense: 0,  can_spawn: false, color: '#4488FF', is_destructible: false, max_hp: 0, destroyed_transform_to: 'water' },
    base:      { name: '基地',     cost: 1,  defense: 0,  can_spawn: true,  color: '#FF4444', is_destructible: true,  max_hp: 5, destroyed_transform_to: 'ruin' },
    mothership:{ name: '母舰',     cost: 1,  defense: 0,  can_spawn: true,  color: '#FFD700', is_destructible: true,  max_hp: 8, destroyed_transform_to: 'ruin' },
    ruin:      { name: '废墟',     cost: 2,  defense: 15, can_spawn: true,  color: '#998866', is_destructible: false, max_hp: 0, destroyed_transform_to: 'ruin' },
    lava:      { name: '岩浆',     cost: 3,  defense: 0,  can_spawn: false, color: '#FF6600', is_destructible: false, max_hp: 0, destroyed_transform_to: 'lava' },
    lunar:     { name: '月面',     cost: 1,  defense: 0,  can_spawn: true,  color: '#CCCCCC', is_destructible: false, max_hp: 0, destroyed_transform_to: 'lunar' },
    crater:    { name: '陨石坑',   cost: 2,  defense: 5,  can_spawn: true,  color: '#777766', is_destructible: false, max_hp: 0, destroyed_transform_to: 'crater' },
    city_building: { name: '城市建筑', cost: 1, defense: 25, can_spawn: false, color: '#b8860b', is_destructible: true,  max_hp: 4, destroyed_transform_to: 'ruin' },
    rubble:    { name: '残骸',     cost: 2,  defense: 10, can_spawn: true,  color: '#8b7d6b', is_destructible: false, max_hp: 0, destroyed_transform_to: 'rubble' },
  }"""

if old_fallback in terrain_content:
    terrain_content = terrain_content.replace(old_fallback, new_fallback)
    print('[3/3a] terrainMovement.cjs: 更新 FALLBACK_TERRAINS (is_destructible/max_hp 字段)')
else:
    print('[3/3a] WARNING: FALLBACK_TERRAINS pattern not found')

# Add destructible-related methods BEFORE calculatePathCost
insert_marker2 = '''  /**
   * 计算路径总消耗
   */
  static calculatePathCost(path) {'''

destructible_methods = '''
  // ============================================================
  //  Phase 9.5: 可破坏地形支持方法
  // ============================================================

  /**
   * 检查地形是否可破坏
   */
  static isDestructible(terrainId) {
    const data = this.getTerrainData()
    const t = data[terrainId]
    return t ? !!t.is_destructible : false
  }

  /**
   * 获取地形的最大 HP
   */
  static getTerrainMaxHp(terrainId) {
    const data = this.getTerrainData()
    const t = data[terrainId]
    return t ? (t.max_hp || 0) : 0
  }

  /**
   * 获取地形被破坏后的转化目标
   */
  static getDestroyedTransformTo(terrainId) {
    const data = this.getTerrainData()
    const t = data[terrainId]
    return t ? (t.destroyed_transform_to || terrainId) : terrainId
  }

  /**
   * 应用地形破坏转换：
   *   - 将 terrainMap 中指定格子的 terrain_id 替换为退化地形
   *   - 更新 move_cost 为退化地形的消耗
   *   - 返回更新后的 terrainCell 快照
   */
  static applyTerrainDestruction(terrainMap, q, r, terrainDefs = {}) {
    const key = `${q},${r}`
    const cell = terrainMap[key]
    if (!cell) return null

    const oldTerrainId = cell.terrain_id || cell.terrain || 'empty'
    const transformTo = this.getDestroyedTransformTo(oldTerrainId)

    // 获取退化地形的属性
    const newTerrain = terrainDefs[transformTo]
        || this.getTerrainData()[transformTo]
        || this.FALLBACK_TERRAINS[transformTo]
        || {}

    const oldMoveCost = cell.move_cost || this.getMoveCost(oldTerrainId)
    const newMoveCost = newTerrain.move_cost !== undefined
        ? newTerrain.move_cost
        : (newTerrain.cost || 1)

    // 更新 terrainMap 中的格子
    if (terrainMap[key]) {
        terrainMap[key].terrain_id = transformTo
        terrainMap[key].terrain = transformTo
        terrainMap[key].move_cost = newMoveCost
        terrainMap[key].terrain_hp = 0
        terrainMap[key].is_destructible = false
    }

    return {
        key,
        old_terrain_id: oldTerrainId,
        new_terrain_id: transformTo,
        old_move_cost: oldMoveCost,
        new_move_cost: newMoveCost,
        destroyed: true,
    }
  }

'''

if insert_marker2 in terrain_content:
    terrain_content = terrain_content.replace(insert_marker2, destructible_methods + '\n' + insert_marker2)
    print('[3/3b] terrainMovement.cjs: 新增 isDestructible/getTerrainMaxHp/getDestroyedTransformTo/applyTerrainDestruction')
else:
    print('[3/3b] WARNING: calculatePathCost marker not found')

with open(terrain_path, 'w') as f:
    f.write(terrain_content)

# ================================================================
# Summary
# ================================================================
print()
print('=' * 60)
print('Phase 9.5 可破坏生态单元 — 手术完成')
print('=' * 60)
for log in changes_log:
    print(log)
print()
print('现在运行: cd /root/original-project && 构建验证...')
