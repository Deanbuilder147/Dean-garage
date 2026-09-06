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
 *   全覆式装甲：  固定 5，对实体武器 -3 减免，消耗后失效
 *   抗性涂层：    固定 5，对光束武器 -3 减免，消耗后失效
 * 
 * 防具抵消规则：
 *   每次承受攻击时，若防具耐久 > 0：
 *     防具抵消 3 点伤害 → 耐久度 -1
 *     溢出伤害由单位 HP 承伤
 *   若装备了全覆式装甲 + 抗性涂层：
 *     对 kinetic(实体) 武器额外 -3，全覆式装甲耐久 -1
 *     对 beam(光束，含 energy/laser/em 别名) 武器额外 -3，抗性涂层耐久 -1
 */

const { normalizeDamageKind } = require('./skillContract.cjs');

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
        if (!unit || !(unit.id || unit.unit_id)) return;
        const uid = unit.id || unit.unit_id;

        const slots = ['left_hand', 'right_hand', 'extra'];
        const state = {
            left_hand: { type: null, durability: 0, melee: 0, ranged: 0, defense: 0, resistance: null, hp: 0, maxHp: 0, broken: false },
            right_hand: { type: null, durability: 0, melee: 0, ranged: 0, defense: 0, resistance: null, hp: 0, maxHp: 0, broken: false },
            extra: { type: null, durability: 0, melee: 0, ranged: 0, defense: 0, resistance: null, hp: 0, maxHp: 0, broken: false },
            // 特殊装备耐久度
            special_full_armor: (unit.equipment && unit.equipment.full_armor) ? 5 : 0,
            special_coating: (unit.equipment && unit.equipment.coating) ? 5 : 0,
            special_shield_gen: (unit.equipment && unit.equipment.shield_gen) ? 5 : 0,
            special_reactive_armor: (unit.equipment && unit.equipment.reactive_armor) ? 5 : 0
        };

        // 阶段二：优先从新模型 unit.equipState（数组）构建装备槽
        const eq = (unit.equipState && Array.isArray(unit.equipState)) ? unit.equipState : null;
        if (eq) {
            const TYPE_MAP = { '武器': 'weapon', '防具': 'armor', '载具': 'thruster', '背包': 'support' };
            eq.forEach((e, i) => {
                const slot = slots[i % slots.length];
                const t = TYPE_MAP[e.type] || 'weapon';
                state[slot] = {
                    type: t,
                    durability: e.durability ?? 0,
                    maxDurability: e.maxDurability ?? e.durability ?? 0,
                    melee: e.melee || 0,
                    ranged: e.ranged || 0,
                    defense: e.defense || 0,
                    resistance: e.resistance || null,
                    hp: e.hp ?? 0,
                    maxHp: e.maxHp ?? e.hp ?? 0,
                    broken: !!e.destroyed,
                    _idx: i,
                };
            });
        } else {
            // 兼容旧字段（left_hand_* 等）
            ['left_hand', 'right_hand', 'extra'].forEach((slot) => {
                const type = unit[`${slot}_type`];
                if (!type) return;
                state[slot] = {
                    type,
                    durability: unit[`${slot}_durability`] ?? 0,
                    melee: unit[`${slot}_melee`] ?? 0,
                    ranged: unit[`${slot}_ranged`] ?? 0,
                    defense: unit[`${slot}_defense`] ?? 0,
                    resistance: unit[`${slot}_resistance`] ?? null,
                    hp: unit[`${slot}_hp`] ?? 0,
                    maxHp: unit[`${slot}_hp`] ?? 0,
                    broken: false,
                    _idx: -1,
                };
            });
        }

        this._state[uid] = state;
    }

    /**
     * 应用伤害到防具/特殊装备（在 DamagePipe 计算完成后调用）
     * 防具每次抵消 3 点伤害，消耗 1 耐久
     * 全覆式装甲对 kinetic(实体) 额外 -3，抗性涂层对 beam(光束) 额外 -3
     *
     * @param {Object} unit - 防御方单位
     * @param {number} incomingDamage - 原始伤害
     * @param {string} weaponType - 攻击方伤害种类（经别名归一：energy/laser/em→beam）
     * @returns {Object} { remaining_damage, absorbed, changes[] }
     */
    applyDamage(unit, incomingDamage, weaponType = 'kinetic') {
        if (!unit || incomingDamage <= 0) {
            return { remaining_damage: incomingDamage || 0, absorbed: 0, changes: [] };
        }

        // P0-2: 武器类型归一为权威伤害种类（energy/laser/em 等别名统一映射为 beam）
        const dk = normalizeDamageKind(weaponType);

        const uid = unit.id || unit.unit_id;
        if (!this._state[uid]) {
            return { remaining_damage: incomingDamage, absorbed: 0, changes: [] };
        }

        const state = this._state[uid];
        let remaining = incomingDamage;
        let absorbed = 0;
        const changes = [];

        // 阶段二：防具/背包作为独立伤害吸收槽，每次分担 3 点（扣减独立 HP 与耐久）
        const armorSlots = ['left_hand', 'right_hand', 'extra'].filter(
            slot => state[slot].type === 'armor' && !state[slot].broken
        );

        for (const slot of armorSlots) {
            if (remaining <= 0) break;
            const armor = state[slot];
            const absorbAmount = Math.min(remaining, 3); // 每个吸收槽每次最多分担 3 点伤害
            remaining -= absorbAmount;
            absorbed += absorbAmount;
            armor.durability -= 1;
            armor.hp -= absorbAmount; // 扣减独立 HP（规则3）

            changes.push({
                type: 'armor_absorb',
                slot,
                absorbed: absorbAmount,
                durability_after: Math.max(0, armor.durability),
                hp_after: Math.max(0, armor.hp),
                broken: armor.durability <= 0 || armor.hp <= 0
            });

            // HP 或耐久任一归零 → 标记损坏/丢弃
            if (armor.durability <= 0 || armor.hp <= 0) {
                this._onEquipmentBroken(unit, slot, armor);
            }
        }

        // 2. 全覆式装甲抵消（kinetic 实体武器）
        if (remaining > 0 && state.special_full_armor > 0 && dk === 'kinetic') {
            const absorbAmount = Math.min(remaining, 3);
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

        // 3. 抗性涂层抵消（beam 光束武器，含 energy/laser/em 别名）
        if (remaining > 0 && state.special_coating > 0 && dk === 'beam') {
            const absorbAmount = Math.min(remaining, 3);
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
     * 按槽位消耗指定量耐久度（通用入口，供阻断/火力覆盖等场景调用）
     * 支持常规槽位（left_hand/right_hand/extra）与特殊槽位（special_full_armor 等）。
     * 消耗至 0 时同步关闭对应 equipment 开关。
     *
     * @param {Object} unit - 单位
     * @param {string} slot - 槽位名（如 'special_full_armor'）
     * @param {number} [amount=1] - 消耗数量
     * @returns {{ consumed: number, broken: boolean }}
     */
    consumeDurability(unit, slot, amount = 1) {
        if (!unit) return { consumed: 0, broken: false };
        const uid = unit.id || unit.unit_id;
        if (!this._state[uid]) return { consumed: 0, broken: false };
        const cur = this._state[uid][slot];
        if (typeof cur !== 'number') return { consumed: 0, broken: false };

        const before = cur;
        const after = Math.max(0, cur - amount);
        this._state[uid][slot] = after;

        // 耐久归零 → 关闭对应装备开关
        if (after <= 0 && unit.equipment) {
            const flag = slot.startsWith('special_') ? slot.slice('special_'.length) : slot;
            if (Object.prototype.hasOwnProperty.call(unit.equipment, flag)) {
                unit.equipment[flag] = false;
            }
        }
        return { consumed: before - after, broken: after <= 0 };
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

        // 阶段二：同步回写新模型 unit.equipState（供序列化/HUD 展示损坏状态）
        if (equipData._idx != null && equipData._idx >= 0 && unit.equipState && unit.equipState[equipData._idx]) {
            unit.equipState[equipData._idx].destroyed = true;
            unit.equipState[equipData._idx].hp = 0;
            unit.equipState[equipData._idx].durability = 0;
        }

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
