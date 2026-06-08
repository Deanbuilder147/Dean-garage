/**
 * damagePipe.cjs - 机甲战棋伤害计算管道
 * 
 * 伤害计算分为 9 个阶段，完整处理攻击→防御的数值流转。
 * 使用海豹骰子 dicescript 引擎统一所有骰子判定。
 */

const { defaultEngine } = require('./DiceEngine.cjs');

// ============================================================
// 常量配置
// ============================================================

const CRIT_THRESHOLD = 5;       // 暴击阈值 (1d6 >= 5, 即 1/3 概率)
const CRIT_MULTIPLIER = 1.5;    // 暴击倍率
const GUARANTEED_DAMAGE = 1;    // 保底伤害

// 武器克制系数
const WEAPON_TYPE_MULTIPLIER = {
    beam:   { normal: 1.0, armor: 1.3, shield: 0.7 },
    kinetic: { normal: 1.0, armor: 0.8, shield: 1.2 },
    missile: { normal: 1.0, armor: 1.1, shield: 0.9 },
    energy: { normal: 1.0, armor: 1.2, shield: 0.8 }
};

// ============================================================
// 伤害计算管道（静态方法）
// ============================================================

class DamagePipe {
    /**
     * 掷骰（使用 DiceEngine 统一接口）
     * @param {number} faces - 骰子面数
     * @returns {number} 掷骰结果
     */
    static rollDice(faces = 6) {
        return defaultEngine.roll(`1d${faces}`);
    }

    /**
     * 暴击判定：使用 1d6 >= CRIT_THRESHOLD
     * @returns {boolean} 是否暴击
     */
    static checkCrit() {
        return defaultEngine.check('1d6', '>=', CRIT_THRESHOLD);
    }

    /**
     * 主计算入口：完整伤害管道
     * @param {Object} config - 战斗配置
     * @param {Object} config.attacker - 攻击方 { attack, mobility, weaponType, level, buffs[] }
     * @param {Object} config.defender - 防御方 { defense, armorType, shield, level, buffs[] }
     * @returns {Object} 计算结果
     */
    static calculate(config) {
        const result = {
            stages: {},
            final_damage: 0,
            is_crit: false,
            is_miss: false
        };

        // ---- 阶段 1: 基础攻击力 ----
        const baseAttack = config.attacker.attack || 10;
        result.stages.base_attack = baseAttack;

        // ---- 阶段 2: 机动性加成 ----
        const mobilityBonus = Math.floor((config.attacker.mobility || 0) * 0.3);
        result.stages.mobility_bonus = mobilityBonus;

        // ---- 阶段 3: 武器加成 ----
        const weaponBonus = this._calcWeaponBonus(config.attacker.weaponType, config.defender.armorType);
        result.stages.weapon_bonus = weaponBonus;

        // ---- 阶段 4: 攻击 Buff ----
        const attackBuff = this._sumBuffs(config.attacker.buffs || [], 'attack');
        result.stages.attack_buff = attackBuff;

        // ---- 阶段 5: 临时攻击力 ----
        const tempAttack = baseAttack + mobilityBonus + weaponBonus + attackBuff;
        result.stages.temp_attack = tempAttack;

        // ---- 阶段 6: 等级差修正 ----
        const levelDiff = (config.attacker.level || 1) - (config.defender.level || 1);
        const levelModifier = 1 + levelDiff * 0.05;
        result.stages.level_modifier = levelModifier;

        // ---- 阶段 7: 暴击判定（使用 DiceEngine 1d6） ----
        const isCrit = this.checkCrit();
        result.is_crit = isCrit;
        result.stages.is_crit = isCrit;

        // 进攻方伤害
        let damage = tempAttack * levelModifier;
        if (isCrit) {
            damage *= CRIT_MULTIPLIER;
        }
        result.stages.raw_damage = Math.floor(damage);

        // ---- 阶段 8: 防御减免 ----
        const defenseReduction = this._calcDefense(config.defender, config.attacker.weaponType);
        result.stages.defense_reduction = defenseReduction;

        // ---- 阶段 9: 最终伤害（带保底伤害） ----
        result.final_damage = Math.max(
            GUARANTEED_DAMAGE,
            Math.floor(damage - defenseReduction.total)
        );
        result.stages.final_damage = result.final_damage;

        return result;
    }

    // ---- 内部计算方法 ----

    /**
     * 武器类型克制加成
     */
    static _calcWeaponBonus(weaponType, armorType) {
        const table = WEAPON_TYPE_MULTIPLIER[weaponType] || WEAPON_TYPE_MULTIPLIER.beam;
        const mult = table[armorType] || table.normal || 1.0;
        return Math.floor((mult - 1.0) * 10); // 转换为加值
    }

    /**
     * Buff 求和
     */
    static _sumBuffs(buffs, type) {
        return buffs
            .filter(b => b.type === type)
            .reduce((sum, b) => sum + (b.value || 0), 0);
    }

    /**
     * 防御计算
     */
    static _calcDefense(defender, attackerWeaponType) {
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
    }
}

module.exports = DamagePipe;
