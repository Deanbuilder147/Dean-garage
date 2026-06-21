/**
 * equipmentDurability.cjs - 装备耐久度管理模块
 * 
 * 管理战斗中装备耐久度的消耗、归零和加成移除。
 * 
 * 耐久度规则（按 Excel 设定器 + 战斗规则表）：
 *   武器：        结构 × 1，每次攻击消耗 1
 *   防具（装甲/盾牌）：固定 5，每次抵消伤害消耗 1
 *   载具（推进器）：结构 × 1 = 可被攻击次数
 *   背包（辅助）：  固定 5，被击中消耗
 *   全覆式装甲：  固定 5，对实体武器 -2 减免，消耗后失效
 *   抗性涂层：    固定 5，对光束武器 -2 减免，消耗后失效
 * 
 * 防具抵消规则：
 *   每次承受攻击时，若防具耐久 > 0：
 *     防具抵消 3 点伤害 → 耐久度 -1
 *     溢出伤害由单位 HP 承伤
 *   若装备了全覆式装甲 + 抗性涂层：
 *     对 kinetic 武器额外 -2，全覆式装甲耐久 -1
 *     对 energy 武器额外 -2，抗性涂层耐久 -1
 */

class EquipmentDurability {
    constructor() {
        // 存储各单位装备耐久度快照 { unit_id: { equipment_slots } }
        this._state = {};
    }

    /**
     * 注册单位的装备耐久度
     * @param {Object} unit - 战斗单位
     */
    register(unit) {
        if (!unit || !unit.id && !unit.unit_id) return;
        const uid = unit.id || unit.unit_id;

        this._state[uid] = {
            // 装备槽位耐久度
            left_hand: {
                type: unit.left_hand_type,
                durability: unit.left_hand_durability || 0,
                melee: unit.left_hand_melee || 0,
                ranged: unit.left_hand_ranged || 0,
                defense: unit.left_hand_defense || 0,
                resistance: unit.left_hand_resistance || null
            },
            right_hand: {
                type: unit.right_hand_type,
                durability: unit.right_hand_durability || 0,
                melee: unit.right_hand_melee || 0,
                ranged: unit.right_hand_ranged || 0,
                defense: unit.right_hand_defense || 0,
                resistance: unit.right_hand_resistance || null
            },
            extra: {
                type: unit.extra_type,
                durability: unit.extra_durability || 0,
                melee: unit.extra_melee || 0,
                ranged: unit.extra_ranged || 0,
                defense: unit.extra_defense || 0,
                resistance: unit.extra_resistance || null
            },
            // 特殊装备耐久度
            special_full_armor: (unit.equipment && unit.equipment.full_armor) ? 5 : 0,
            special_coating: (unit.equipment && unit.equipment.coating) ? 5 : 0
        };
    }

    /**
     * 应用伤害到防具/特殊装备（在 DamagePipe 计算完成后调用）
     * 防具每次抵消 3 点伤害，消耗 1 耐久
     * 全覆式装甲对 kinetic 额外 -2，抗性涂层对 energy 额外 -2
     *
     * @param {Object} unit - 防御方单位
     * @param {number} incomingDamage - 原始伤害
     * @param {string} weaponType - 攻击方武器类型 'energy' | 'kinetic'
     * @returns {Object} { remaining_damage, absorbed, changes[] }
     */
    applyDamage(unit, incomingDamage, weaponType = 'kinetic') {
        if (!unit || incomingDamage <= 0) {
            return { remaining_damage: incomingDamage || 0, absorbed: 0, changes: [] };
        }

        const uid = unit.id || unit.unit_id;
        if (!this._state[uid]) {
            return { remaining_damage: incomingDamage, absorbed: 0, changes: [] };
        }

        const state = this._state[uid];
        let remaining = incomingDamage;
        let absorbed = 0;
        const changes = [];

        // 1. 防具抵消伤害（装甲/盾牌）
        const armorSlots = ['left_hand', 'right_hand', 'extra'].filter(
            slot => state[slot].type === 'armor' && state[slot].durability > 0
        );

        for (const slot of armorSlots) {
            if (remaining <= 0) break;
            const armor = state[slot];
            const absorbAmount = Math.min(remaining, 3);
            remaining -= absorbAmount;
            absorbed += absorbAmount;
            armor.durability -= 1;

            changes.push({
                type: 'armor_absorb',
                slot,
                absorbed: absorbAmount,
                durability_after: armor.durability,
                broken: armor.durability <= 0
            });

            // 耐久归零 → 移除加成
            if (armor.durability <= 0) {
                this._onEquipmentBroken(unit, slot, armor);
            }
        }

        // 2. 全覆式装甲抵消（kinetic 武器）
        if (remaining > 0 && state.special_full_armor > 0 && weaponType === 'kinetic') {
            const absorbAmount = Math.min(remaining, 2);
            remaining -= absorbAmount;
            absorbed += absorbAmount;
            state.special_full_armor -= 1;

            changes.push({
                type: 'full_armor_absorb',
                absorbed: absorbAmount,
                durability_after: state.special_full_armor,
                broken: state.special_full_armor <= 0
            });

            if (state.special_full_armor <= 0 && unit.equipment) {
                unit.equipment.full_armor = false;
            }
        }

        // 3. 抗性涂层抵消（energy 武器）
        if (remaining > 0 && state.special_coating > 0 && weaponType === 'energy') {
            const absorbAmount = Math.min(remaining, 2);
            remaining -= absorbAmount;
            absorbed += absorbAmount;
            state.special_coating -= 1;

            changes.push({
                type: 'coating_absorb',
                absorbed: absorbAmount,
                durability_after: state.special_coating,
                broken: state.special_coating <= 0
            });

            if (state.special_coating <= 0 && unit.equipment) {
                unit.equipment.coating = false;
            }
        }

        return {
            remaining_damage: remaining,
            absorbed,
            changes,
            message: `耐久度结算：吸收 ${absorbed} 点伤害，${remaining} 点由 HP 承受`
        };
    }

    /**
     * 消耗武器耐久度（攻击方每次攻击 -1）
     */
    consumeWeaponDurability(unit) {
        if (!unit) return;
        const uid = unit.id || unit.unit_id;
        if (!this._state[uid]) return;

        const weaponSlots = ['left_hand', 'right_hand', 'extra'].filter(
            slot => this._state[uid][slot].type === 'weapon' && this._state[uid][slot].durability > 0
        );

        for (const slot of weaponSlots) {
            const weapon = this._state[uid][slot];
            weapon.durability -= 1;

            if (weapon.durability <= 0) {
                this._onEquipmentBroken(unit, slot, weapon);
            }
            break; // 每次攻击最多消耗一个武器槽
        }
    }

    /**
     * 装备耐久度归零 → 移除加成
     * @private
     */
    _onEquipmentBroken(unit, slot, equipData) {
        equipData.broken = true;

        switch (equipData.type) {
            case 'weapon':
                // 武器损坏：移除攻击加成
                unit[`${slot}_hand_melee`] = 0;
                unit[`${slot}_hand_ranged`] = 0;
                break;
            case 'armor':
                // 防具损坏：移除防御加成和护盾
                unit[`${slot}_hand_defense`] = 0;
                unit.shield = Math.max(0, (unit.shield || 0) - equipData.defense);
                break;
            case 'thruster':
                // 载具损坏：移除机动加成
                unit.mobility = Math.max(0, (unit.mobility || 0) - Math.floor((equipData.durability || 0) * 0.5));
                break;
            case 'support':
                // 背包损坏：移除辅助加成
                unit[`${slot}_hand_defense`] = 0;
                break;
        }
    }

    /**
     * 获取装备耐久度
     */
    getDurability(unit, slot) {
        if (!unit) return 0;
        const uid = unit.id || unit.unit_id;
        if (!this._state[uid]) return 0;
        if (slot.startsWith('special_')) {
            return this._state[uid][slot] || 0;
        }
        return this._state[uid][slot] ? this._state[uid][slot].durability : 0;
    }

    /**
     * 重置所有状态
     */
    reset() {
        this._state = {};
    }
}

module.exports = EquipmentDurability;
