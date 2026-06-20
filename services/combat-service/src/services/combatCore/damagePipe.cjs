/**
 * damagePipe.cjs v2.0 — 机甲战棋伤害计算管道（去骰化）
 *
 * 按照 Excel 战斗规则表实现：
 *   伤害值 = 技能攻击力(格斗/射击) + 双方机动值差 + 额外值 - 防御减免
 * 暴击判定使用 Math.random()（33.3% 固定概率，无海豹骰子引擎）
 */

// ============================================================
// 常量配置
// ============================================================

const CRIT_THRESHOLD = 5;       // 暴击阈值 (33.3% 概率)
const CRIT_MIN = 0.8;           // 暴击倍率下限
const CRIT_MAX = 1.5;           // 暴击倍率上限
const GUARANTEED_DAMAGE = 1;    // 保底伤害

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

const WEAPON_COUNTER_PENALTY = -2;
const FULL_ARMOR_REDUCTION = 2;
const COATING_REDUCTION = 2;

// ============================================================
// 伤害计算管道（静态方法）
// ============================================================

class DamagePipe {

    /**
     * 掷骰（内部使用 Math.random，不依赖 DiceEngine）
     */
    static rollDice(faces = 6) {
        return Math.floor(Math.random() * faces) + 1;
    }

    /**
     * 暴击判定（固定 33.3% 概率）
     */
    static checkCrit() {
        return Math.random() < 1 / 3;
    }

    /**
     * 主计算入口：完整 9 阶段伤害管道
     */
    static calculate(config) {
        const result = {
            stages: {},
            final_damage: 0,
            is_crit: false,
            crit_multiplier: 1.0
        };

        const attackType = config.attack_type || 'melee';
        const attacker = config.attacker || {};
        const defender = config.defender || {};

        // ---- 阶段 1: 基础攻击力 ----
        let baseAttack;
        if (attackType === 'ranged') {
            baseAttack = attacker.ranged || attacker.attack || 10;
        } else {
            baseAttack = attacker.melee || attacker.attack || 10;
        }
        result.stages.base_attack = baseAttack;

        // ---- 阶段 2: 机动值差 ----
        const sniperReduction = config.sniper_mobility_reduction || 0;
        const defMobility = Math.max(0, (defender.mobility || 0) - sniperReduction);
        const mobilityDiff = (attacker.mobility || 0) - defMobility;
        result.stages.mobility_diff = mobilityDiff;

        // ---- 阶段 3: 临时攻击力 ----
        let tempAttack = baseAttack + mobilityDiff;
        result.stages.temp_attack = tempAttack;

        // ---- 阶段 4: 额外加成 ----
        const extras = this._calcExtraValues(attacker, defender);
        result.stages.extras = extras;
        tempAttack += extras.total;
        result.stages.attack_after_extras = Math.max(0, tempAttack);

        // ---- 阶段 5: 防御计算 ----
        const def = this._calcDefense(defender, attacker);
        result.stages.defense = def;

        // ---- 阶段 6: 武器克制 ----
        let weaponPenalty = 0;
        if (defender.resistance && attacker.weaponType) {
            if (defender.resistance === attacker.weaponType) {
                weaponPenalty = WEAPON_COUNTER_PENALTY;
            }
        }
        result.stages.weapon_penalty = weaponPenalty;

        // ---- 阶段 7: 护甲减免 ----
        const armorReduction = this._calcArmorReduction(attacker, defender);
        result.stages.armor_reduction = armorReduction;

        // ---- 阶段 8: 最终伤害 ----
        let finalDamage = Math.max(0, tempAttack - def.total) + weaponPenalty - armorReduction;

        // 保底伤害
        if (finalDamage < GUARANTEED_DAMAGE && baseAttack > 0) {
            finalDamage = GUARANTEED_DAMAGE;
            result.stages.guaranteed = true;
        }

        // 护盾吸收
        if (defender.shield && defender.shield > 0) {
            const shieldAbsorb = Math.min(defender.shield, finalDamage);
            finalDamage = Math.max(0, finalDamage - shieldAbsorb);
            result.stages.shield_absorbed = shieldAbsorb;
        }

        result.final_damage = Math.floor(finalDamage);

        // ---- 阶段 9: 暴击判定 ----
        if (DamagePipe.checkCrit()) {
            result.is_crit = true;
            const critMultiplier = CRIT_MIN + Math.random() * (CRIT_MAX - CRIT_MIN);
            result.crit_multiplier = critMultiplier;
            result.final_damage = Math.floor(result.final_damage * critMultiplier);
        }

        return result;
    }

    static _calcExtraValues(attacker, defender) {
        let total = 0;
        const details = {};

        // 技能加成
        const bonuses = attacker.extraBonuses?.bonuses || attacker.bonuses || [];
        for (const bonus of bonuses) {
            if (!bonus) continue;
            if (bonus.type === 'assist') {
                details.assist = bonus.value;
                total += bonus.value;
            } else if (bonus.type === 'counter') {
                details.counter = bonus.value;
                total += bonus.value;
            } else if (bonus.type === 'focused_fire') {
                details.focused_fire = bonus.value;
                total += bonus.value;
            } else if (bonus.type === 'sweep_precise') {
                details.sweep_precise = bonus.value;
                total += bonus.value;
            } else if (bonus.type === 'guard') {
                details.guard = bonus.value;
                total += bonus.value;
            } else if (bonus.type === 'blockade') {
                details.blockade = `defender mobility -${bonus.value}`;
            }
        }

        return { total, details };
    }

    static _sumBuffs(buffs, type) {
        if (!buffs || !buffs.length) return 0;
        return buffs
            .filter(b => b && b.type === type)
            .reduce((sum, b) => sum + (b.value || 0), 0);
    }

    static _calcDefense(defender, attacker) {
        const baseDefense = defender.defense || 5;
        const shieldValue = defender.shield || 0;
        const defenseBuffs = this._sumBuffs(defender.buffs || [], 'defense');
        const terrainBonus = TERRAIN_DEFENSE[defender.terrain] || 0;

        // 守护技能减免
        let guardReduction = 0;
        if (defender.guard_counter > 0 && (defender.skills || []).some(s => s && s.type === 'guard' && s.active)) {
            guardReduction = 5;
        }

        // 全覆式装甲/抗性涂层减免（在 armor_reduction 阶段处理）
        return {
            base: baseDefense,
            shield: shieldValue,
            buffs: defenseBuffs,
            terrain: terrainBonus,
            guard: guardReduction,
            total: baseDefense + shieldValue + defenseBuffs + terrainBonus + guardReduction
        };
    }

    static _calcArmorReduction(attacker, defender) {
        let reduction = 0;
        const weaponType = attacker.weaponType || 'kinetic';
        const eq = defender.equipment || {};
        const skills = defender.skills || [];

        if (eq.full_armor || skills.some(s => s && s.type === 'full_armor' && s.active)) {
            if (weaponType === 'kinetic') {
                reduction += FULL_ARMOR_REDUCTION;
            }
        }
        if (eq.coating || skills.some(s => s && s.type === 'coating' && s.active)) {
            if (weaponType === 'beam' || weaponType === 'energy') {
                reduction += COATING_REDUCTION;
            }
        }
        return reduction;
    }


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


    static calculateQuick(attacker, defender, attackType = 'melee') {
        return this.calculate({
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
                buffs: defender.buffs || [],
                equipment: defender.equipment || {},
                skills: defender.skills || [],
                mobility: defender.mobility || 0,
                terrain: defender.terrain || null
            },
            attack_type: attackType
        });
    }
}

module.exports = DamagePipe;
