#!/usr/bin/env python3
"""P0-2 + P0-3: Add terrain defense and fog accuracy to DamagePipe"""

import re

path = '/root/original-project/services/combat-service/src/services/combatCore/damagePipe.cjs'
with open(path, 'r') as f:
    content = f.read()

# Step 1: Add terrain/fog constants after GUARANTEED_DAMAGE
terrain_and_fog = '''\
// 地形防御加成
const TERRAIN_DEFENSE = {
    forest: 10,
    mountain: 20,
    ruins: 15,
    building: 10,
    lunar: 5,
    empty: 0,
    repair_station: 5
};

// 迷雾命中率修正表
const FOG_ACCURACY = {
    blind: -0.5,
    partial: -0.25,
    normal: 0
};
'''
content = content.replace(
    'const GUARANTEED_DAMAGE = 1;    // 保底伤害',
    'const GUARANTEED_DAMAGE = 1;    // 保底伤害\n\n' + terrain_and_fog
)

# Step 2: Modify _calcDefense to accept terrain parameter
old_defense = '''    static _calcDefense(defender, attackerWeaponType) {
        const baseDefense = defender.defense || 5;
        const shieldValue = defender.shield || 0;
        const defenseBuffs = this._sumBuffs(defender.buffs || [], 'defense');

        // 护盾对能量的额外减免
        let shieldMultiplier = 1.0;
        if (attackerWeaponType === 'beam') {
            shieldMultiplier = 1.5; // 护盾对光束武器额外有效
        }

        return {
            base: baseDefense,
            shield: Math.floor(shieldValue * shieldMultiplier),
            buffs: defenseBuffs,
            total: baseDefense + Math.floor(shieldValue * shieldMultiplier) + defenseBuffs
        };
    }'''

new_defense = '''    static _calcDefense(defender, attackerWeaponType, terrainId) {
        const baseDefense = defender.defense || 5;
        const shieldValue = defender.shield || 0;
        const defenseBuffs = this._sumBuffs(defender.buffs || [], 'defense');

        // 护盾对光束武器额外有效
        let shieldMultiplier = 1.0;
        if (attackerWeaponType === 'beam') {
            shieldMultiplier = 1.5;
        }

        // 地形防御加成
        const terrainBonus = TERRAIN_DEFENSE[terrainId] || 0;

        return {
            base: baseDefense,
            shield: Math.floor(shieldValue * shieldMultiplier),
            buffs: defenseBuffs,
            terrain: terrainBonus,
            total: baseDefense + Math.floor(shieldValue * shieldMultiplier) + defenseBuffs + terrainBonus
        };
    }'''

content = content.replace(old_defense, new_defense)

# Step 3: Modify calculate() to add phase 0 fog check
old_calc = '''    static calculate(config) {
        const result = {
            stages: {},
            final_damage: 0,
            is_crit: false,
            is_miss: false
        };

        // ---- 阶段 1: 基础攻击力 ----
        const baseAttack = config.attacker.attack || 10;
        result.stages.base_attack = baseAttack;'''

# Add fog check phase before phase 1
new_calc = '''    static calculate(config) {
        const result = {
            stages: {},
            final_damage: 0,
            is_crit: false,
            is_miss: false,
            fog_applied: false
        };

        // ---- 阶段 0: 迷雾命中判定 ----
        if (config.fogEffect && config.fogEffect.accuracyModifier && config.fogEffect.accuracyModifier < 0) {
            const fogRoll = this.rollDice(6);
            const hitChance = 1.0 + config.fogEffect.accuracyModifier;
            const missThreshold = Math.ceil(6 * (1 - hitChance));
            if (fogRoll <= missThreshold) {
                result.is_miss = true;
                result.fog_applied = true;
                result.stages.fog_miss = {
                    roll: fogRoll,
                    missThreshold,
                    accuracyModifier: config.fogEffect.accuracyModifier
                };
                result.final_damage = 0;
                return result;
            }
            result.fog_applied = true;
            result.stages.fog_check = { roll: fogRoll, passed: true };
        }

        // ---- 阶段 1: 基础攻击力 ----
        const baseAttack = config.attacker.attack || 10;
        result.stages.base_attack = baseAttack;'''

content = content.replace(old_calc, new_calc)

# Step 4: Modify the _calcDefense call in calculate() to pass terrain
old_def_call = "const defenseReduction = this._calcDefense(config.defender, config.attacker.weaponType);"
new_def_call = "        const terrainId = config.terrain || 'empty';\n        const defenseReduction = this._calcDefense(config.defender, config.attacker.weaponType, terrainId);"
content = content.replace(old_def_call, new_def_call)

# Add terrain info to result
old_def_result = "        result.stages.defense_reduction = defenseReduction;"
new_def_result = "        result.stages.defense_reduction = defenseReduction;\n        result.stages.terrain_bonus = defenseReduction.terrain || 0;"
content = content.replace(old_def_result, new_def_result)

with open(path, 'w') as f:
    f.write(content)

print('P0-2 + P0-3: DamagePipe updated with terrain defense and fog accuracy')
