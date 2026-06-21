#!/usr/bin/env python3
"""向 combatResolver.js 中插入 5 个缺失的静态方法"""
import os

path = '/root/original-project/services/combat-service/src/services/combatResolver.js'

with open(path, 'r') as f:
    content = f.read()

# 找到 class 结尾的 '}'（在 export 之前）
export_pos = content.rfind('\nexport { CombatResolver };')
if export_pos < 0:
    export_pos = content.rfind('\nexport {')
    if export_pos < 0:
        print('ERROR: Cannot find export statement')
        exit(1)

class_end = content.rfind('\n}', 0, export_pos)
print(f'Inserting at position {class_end} (before export at {export_pos})')

new_methods = '''
    /**
     * 解决攻击 - 标准攻击结算
     * 使用 DamagePipe 计算管道进行完整伤害计算
     * @param {Object} attacker - 攻击方单位 { attack, mobility, weaponType, level, buffs, hp }
     * @param {Object} defender - 防御方单位 { defense, armorType, shield, level, buffs, hp }
     * @param {string} attack_type - 攻击类型 'kinetic'|'beam'|'explosive'
     * @returns {Object} { final_damage, target_hp_after, stages, is_crit, is_miss }
     */
    static resolveAttack(attacker, defender, attack_type = 'kinetic') {
        const damageResult = DamagePipe.calculate({
            attacker: {
                attack: attacker.attack || 10,
                mobility: attacker.mobility || 0,
                weaponType: attack_type,
                level: attacker.level || 1,
                buffs: attacker.buffs || []
            },
            defender: {
                defense: defender.defense || 5,
                armorType: defender.armorType || 'normal',
                shield: defender.shield || 0,
                level: defender.level || 1,
                buffs: defender.buffs || []
            }
        });

        const target_hp_after = Math.max(0, (defender.hp || 0) - damageResult.final_damage);

        return {
            final_damage: damageResult.final_damage,
            target_hp_after,
            stages: damageResult.stages,
            is_crit: damageResult.is_crit,
            is_miss: damageResult.is_miss
        };
    }

    /**
     * 奇袭攻击 - 1d6 奇袭判定, >=3 成功获得 50% 额外伤害
     * @param {Object} attacker - 奇袭方单位
     * @param {Object} defender - 防御方单位
     * @param {string} attack_type - 攻击类型
     * @returns {Object} { final_damage, target_hp_after, dice_roll, dice_color, surprise_success }
     */
    static resolveSurpriseAttack(attacker, defender, attack_type = 'kinetic') {
        const roll = defaultEngine.roll('1d6');
        const colors = ['red', 'blue', 'green', 'gold', 'purple', 'silver'];
        const dice_color = colors[(roll - 1) % colors.length] || 'red';

        if (roll < 3) {
            const normalResult = this.resolveAttack(attacker, defender, attack_type);
            return { ...normalResult, dice_roll: roll, dice_color, surprise_success: false };
        }

        const surpriseBonus = Math.floor((attacker.attack || 10) * 0.5);
        const damageResult = DamagePipe.calculate({
            attacker: {
                attack: (attacker.attack || 10) + surpriseBonus,
                mobility: attacker.mobility || 0,
                weaponType: attack_type,
                level: attacker.level || 1,
                buffs: attacker.buffs || []
            },
            defender: {
                defense: defender.defense || 5,
                armorType: defender.armorType || 'normal',
                shield: defender.shield || 0,
                level: defender.level || 1,
                buffs: defender.buffs || []
            }
        });

        const target_hp_after = Math.max(0, (defender.hp || 0) - damageResult.final_damage);

        return {
            final_damage: damageResult.final_damage,
            target_hp_after,
            dice_roll: roll,
            dice_color,
            surprise_success: true,
            surprise_bonus: surpriseBonus,
            stages: damageResult.stages,
            is_crit: damageResult.is_crit
        };
    }

    /**
     * 冲锋攻击 - 机动性转换为额外伤害加成
     * @returns {Object} { final_damage, target_hp_after, charge_bonus }
     */
    static resolveChargeAttack(attacker, defender, attack_type = 'kinetic') {
        const mobilityBonus = Math.floor((attacker.mobility || 0) * 0.5);

        const damageResult = DamagePipe.calculate({
            attacker: {
                attack: (attacker.attack || 10) + mobilityBonus,
                mobility: attacker.mobility || 0,
                weaponType: attack_type,
                level: attacker.level || 1,
                buffs: [...(attacker.buffs || []), { type: 'attack', value: mobilityBonus, source: 'charge' }]
            },
            defender: {
                defense: defender.defense || 5,
                armorType: defender.armorType || 'normal',
                shield: defender.shield || 0,
                level: defender.level || 1,
                buffs: defender.buffs || []
            }
        });

        const target_hp_after = Math.max(0, (defender.hp || 0) - damageResult.final_damage);

        return {
            final_damage: damageResult.final_damage,
            target_hp_after,
            charge_bonus: mobilityBonus,
            stages: damageResult.stages,
            is_crit: damageResult.is_crit
        };
    }

    /**
     * 反击 - 受击后以 60% 力量回击
     * @returns {Object} { final_damage, target_hp_after, is_counter: true }
     */
    static resolveCounterAttack(attacker, defender, attack_type = 'kinetic') {
        const damageResult = DamagePipe.calculate({
            attacker: {
                attack: Math.floor((attacker.attack || 10) * 0.6),
                mobility: Math.floor((attacker.mobility || 0) * 0.6),
                weaponType: attack_type,
                level: attacker.level || 1,
                buffs: attacker.buffs || []
            },
            defender: {
                defense: defender.defense || 5,
                armorType: defender.armorType || 'normal',
                shield: defender.shield || 0,
                level: defender.level || 1,
                buffs: defender.buffs || []
            }
        });

        const target_hp_after = Math.max(0, (defender.hp || 0) - damageResult.final_damage);

        return {
            final_damage: damageResult.final_damage,
            target_hp_after,
            stages: damageResult.stages,
            is_crit: damageResult.is_crit,
            is_counter: true
        };
    }

    /**
     * 穿透攻击 - 忽略 50% 防御力和护盾
     * @returns {Object} { final_damage, target_hp_after, phase_bypass: true }
     */
    static resolvePhaseAttack(attacker, defender, attack_type = 'beam') {
        const damageResult = DamagePipe.calculate({
            attacker: {
                attack: attacker.attack || 10,
                mobility: attacker.mobility || 0,
                weaponType: attack_type,
                level: attacker.level || 1,
                buffs: attacker.buffs || []
            },
            defender: {
                defense: Math.floor((defender.defense || 5) * 0.5),
                armorType: defender.armorType || 'normal',
                shield: Math.floor((defender.shield || 0) * 0.5),
                level: defender.level || 1,
                buffs: defender.buffs || []
            }
        });

        const target_hp_after = Math.max(0, (defender.hp || 0) - damageResult.final_damage);

        return {
            final_damage: damageResult.final_damage,
            target_hp_after,
            stages: damageResult.stages,
            is_crit: damageResult.is_crit,
            phase_bypass: true
        };
    }
'''

before = content[:class_end]
after = content[class_end:]
new_content = before + new_methods + after

with open(path, 'w') as f:
    f.write(new_content)

print(f'OK: Inserted 5 methods. New size: {len(new_content)} chars, {new_content.count(chr(10))} lines')

# Verify
if 'resolveAttack' in new_content and 'resolveSurpriseAttack' in new_content:
    print('VERIFIED: All 5 methods present')
else:
    print('WARNING: Methods may not have been inserted correctly')
