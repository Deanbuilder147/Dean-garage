    /**
     * 解决攻击 - 标准攻击结算
     * 使用 DamagePipe 计算管道进行完整伤害计算
     * @param {Object} attacker - 攻击方单位 { melee, ranged, attack, mobility, weaponType, buffs, skills, equipment }
     * @param {Object} defender - 防御方单位 { defense, armorType, shield, resistance, buffs, skills, equipment }
     * @param {string} attack_type - 攻击类型 'melee'|'ranged'
     * @returns {Object} { final_damage, target_hp_after, stages, is_crit, is_miss }
     */
    static resolveAttack(attacker, defender, attack_type = 'melee') {
        const damageResult = DamagePipe.calculate({
            attacker: {
                melee: attacker.melee || attacker.attack || 10,
                ranged: attacker.ranged || attacker.attack || 10,
                attack: attacker.attack || 10,
                mobility: attacker.mobility || 0,
                weaponType: attacker.weaponType || 'kinetic',
                buffs: attacker.buffs || [],
                skills: attacker.skills || []
            },
            defender: {
                defense: defender.defense || 5,
                armorType: defender.armorType || 'normal',
                shield: defender.shield || 0,
                resistance: defender.resistance || null,
                mobility: defender.mobility || 0,
                buffs: defender.buffs || [],
                equipment: defender.equipment || {},
                skills: defender.skills || []
            },
            attack_type
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
     * 奇袭攻击 - 1d6 奇袭判定，≥3 成功获得 50% 额外伤害
     * @param {Object} attacker - 奇袭方单位
     * @param {Object} defender - 防御方单位
     * @param {string} attack_type - 攻击类型 'melee'|'ranged'
     * @returns {Object} { final_damage, target_hp_after, dice_roll, dice_color, surprise_success }
     */
    static resolveSurpriseAttack(attacker, defender, attack_type = 'melee') {
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
                melee: (attacker.melee || attacker.attack || 10) + surpriseBonus,
                ranged: (attacker.ranged || attacker.attack || 10) + surpriseBonus,
                attack: (attacker.attack || 10) + surpriseBonus,
                mobility: attacker.mobility || 0,
                weaponType: attacker.weaponType || 'kinetic',
                buffs: attacker.buffs || [],
                skills: attacker.skills || []
            },
            defender: {
                defense: defender.defense || 5,
                armorType: defender.armorType || 'normal',
                shield: defender.shield || 0,
                resistance: defender.resistance || null,
                mobility: defender.mobility || 0,
                buffs: defender.buffs || [],
                equipment: defender.equipment || {},
                skills: defender.skills || []
            },
            attack_type
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
     * @param {Object} attacker - 冲锋方单位
     * @param {Object} defender - 防御方单位
     * @param {string} attack_type - 攻击类型 'melee'|'ranged'
     * @returns {Object} 冲锋攻击结果 { final_damage, target_hp_after, charge_bonus }
     */
    static resolveChargeAttack(attacker, defender, attack_type = 'melee') {
        const mobilityBonus = Math.floor((attacker.mobility || 0) * 0.5);

        const damageResult = DamagePipe.calculate({
            attacker: {
                melee: (attacker.melee || attacker.attack || 10) + mobilityBonus,
                ranged: (attacker.ranged || attacker.attack || 10) + mobilityBonus,
                attack: (attacker.attack || 10) + mobilityBonus,
                mobility: attacker.mobility || 0,
                weaponType: attacker.weaponType || 'kinetic',
                buffs: [...(attacker.buffs || []), { type: 'attack', value: mobilityBonus, source: 'charge' }],
                skills: attacker.skills || []
            },
            defender: {
                defense: defender.defense || 5,
                armorType: defender.armorType || 'normal',
                shield: defender.shield || 0,
                resistance: defender.resistance || null,
                mobility: defender.mobility || 0,
                buffs: defender.buffs || [],
                equipment: defender.equipment || {},
                skills: defender.skills || []
            },
            attack_type
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
     * @param {Object} attacker - 反击方单位
     * @param {Object} defender - 被反击方单位
     * @param {string} attack_type - 攻击类型 'melee'|'ranged'
     * @returns {Object} 反击结果 { final_damage, target_hp_after, is_counter: true }
     */
    static resolveCounterAttack(attacker, defender, attack_type = 'melee') {
        const damageResult = DamagePipe.calculate({
            attacker: {
                melee: Math.floor((attacker.melee || attacker.attack || 10) * 0.6),
                ranged: Math.floor((attacker.ranged || attacker.attack || 10) * 0.6),
                attack: Math.floor((attacker.attack || 10) * 0.6),
                mobility: Math.floor((attacker.mobility || 0) * 0.6),
                weaponType: attacker.weaponType || 'kinetic',
                buffs: attacker.buffs || [],
                skills: attacker.skills || []
            },
            defender: {
                defense: defender.defense || 5,
                armorType: defender.armorType || 'normal',
                shield: defender.shield || 0,
                resistance: defender.resistance || null,
                mobility: defender.mobility || 0,
                buffs: defender.buffs || [],
                equipment: defender.equipment || {},
                skills: defender.skills || []
            },
            attack_type
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
     * @param {Object} attacker - 攻击方单位
     * @param {Object} defender - 防御方单位
     * @param {string} attack_type - 攻击类型 'melee'|'ranged'
     * @returns {Object} 穿透攻击结果 { final_damage, target_hp_after, phase_bypass: true }
     */
    static resolvePhaseAttack(attacker, defender, attack_type = 'melee') {
        const damageResult = DamagePipe.calculate({
            attacker: {
                melee: attacker.melee || attacker.attack || 10,
                ranged: attacker.ranged || attacker.attack || 10,
                attack: attacker.attack || 10,
                mobility: attacker.mobility || 0,
                weaponType: attacker.weaponType || 'kinetic',
                buffs: attacker.buffs || [],
                skills: attacker.skills || []
            },
            defender: {
                defense: Math.floor((defender.defense || 5) * 0.5),
                armorType: defender.armorType || 'normal',
                shield: Math.floor((defender.shield || 0) * 0.5),
                resistance: defender.resistance || null,
                mobility: defender.mobility || 0,
                buffs: defender.buffs || [],
                equipment: defender.equipment || {},
                skills: defender.skills || []
            },
            attack_type
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
