/**
 * damagePipe.cjs - 机甲战棋伤害计算管道 (Phase 10 泛化语法战斗中枢)
 * 
 * 12 阶段泛化伤害管道：
 *   1. base_attack            - 基础攻击力
 *   2. mobility_diff          - 双方机动值差
 *   3. temp_attack            - 临时攻击力
 *   4. extras                 - 泛化额外值累加器
 *   5. attack_after_extras    - 追加额外值后的攻击力
 *   6. height_bonus           - 高地优势加成
 *   7. terrain_kind_modifiers - 地形伤害类型修正
 *   8. defense                - 防御减免（泛化）
 *   9. weapon_penalty         - 武器克制惩罚（泛化）
 *  10. armor_reduction        - 装备/技能伤害减免（泛化）
 *  11. manual_roll_bonus      - 手动摇骰追加伤害
 *  12. final_damage           - 最终伤害计算
 *  13. crit                   - 暴击判定
 *
 * 使用海豹骰子 dicescript 引擎统一所有骰子判定。
 */

// DiceEngine.cjs 已于 Phase 4 废除，直接使用 Math.random()

const { BuffManager } = require('./buffManager.cjs');
const DiceService = require('./diceService.cjs');

// ============================================================
// 常量配置
// ============================================================

const CRIT_THRESHOLD = 5;       // 暴击阈值 (1d6 >= 5, 即 1/3 概率)
const CRIT_MIN = 0.8;           // 暴击倍率下限
const CRIT_MAX = 1.5;           // 暴击倍率上限
const GUARANTEED_DAMAGE = 1;    // 保底伤害

// 默认地形伤害类型修正（运行时由 terrainDefs 覆盖）
const DEFAULT_TERRAIN_KIND_MODIFIERS = {
    beam: 1.0,
    kinetic: 1.0,
    explosive: 1.0,
    corrosive: 1.0,
    thermal: 1.0
};

// 迷雾精度惩罚
const FOG_ACCURACY = 0.7;

// 泛化武器克制惩罚
const WEAPON_COUNTER_PENALTY = -2;

// ============================================================
// 伤害计算管道（静态方法）
// ============================================================

class DamagePipe {

    /**
     * 掷骰（统一走 diceService.cjs，DiceEngine 已于 Phase 4 废除）
     */
    static rollDice(faces = 6) {
        return DiceService.roll(faces);
    }

    /**
     * 暴击判定：1d6 >= 阈值（阈值由骰子配置驱动）
     */
    static checkCrit() {
        return DiceService.roll(6) >= DiceService.config.critThreshold;
    }

    /**
     * 主计算入口：完整 12+1 阶段泛化伤害管道
     *
     * @param {Object} config
     * @param {Object} config.attacker - { melee, ranged, attack(fallback), mobility, weaponType, buffs[], skills[], extraBonuses, z, height, equipment }
     * @param {Object} config.defender - { defense, armorType, shield, resistance, buffs[], equipment, skills[], mobility, terrain, z, height }
     * @param {string} config.attack_type - 'melee' | 'ranged'
     * @param {number} config.sniper_mobility_reduction - 狙击技能：目标机动值减免（0 表示无狙击）
     * @param {Object} config.terrainDefs - 地形定义字典（可选，默认 {}）
     * @param {boolean} config.is_manual_roll - 是否启用手动摇骰阶段
     * @param {string} config.dice_type - 手动摇骰的骰子类型，如 '1d6'
     * @param {number} config.success_line - 手动摇骰的成功线
     * @param {number} config.success_bonus_damage - 手动摇骰成功追加伤害
     * @param {number} config.height_bonus_per_diff - 每高度差的伤害加成
     * @returns {Object} { stages, final_damage, is_crit, crit_multiplier }
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
        const terrainDefs = config.terrainDefs || {};
        // Step 5: 权威伤害种类——优先 config.damage_kind（词条贡献），缺失回退 weaponType
        const damageKind = config.damage_kind || attacker.weaponType || 'kinetic';

        // ---- 阶段1.5/3.5/8.5：结构化 statusEffects 条件匹配（blockade 削机动 / assist 增伤 / guard 减伤）----
        // 统一由遍历 statusEffects + matchTrigger 动态提取，与具体技能名解耦。
        // 若调用方未传入 statusEffects（旧 config 形状），则全部为 0，不影响既有行为。
        const trigCtx = { attack_type: attackType, damage_kind: damageKind };
        const _attackerStatus = (attacker.statusEffects && Array.isArray(attacker.statusEffects))
            ? BuffManager.getMatchingStatus(attacker, trigCtx, 'attack') : [];
        const _attackerDebuff = (attacker.statusEffects && Array.isArray(attacker.statusEffects))
            ? BuffManager.getMatchingStatus(attacker, trigCtx, 'attack_debuff_target') : [];
        const _defenderStatus = (defender.statusEffects && Array.isArray(defender.statusEffects))
            ? BuffManager.getMatchingStatus(defender, trigCtx, 'defense') : [];
        const blockadeMob = _attackerDebuff.reduce((s, b) => s + (Number(b.value) || 0), 0);
        const assistVal = _attackerStatus.reduce((s, b) => s + (Number(b.value) || 0), 0);
        const guardVal = _defenderStatus.reduce((s, b) => s + (Number(b.value) || 0), 0);
        // 侦察机动增益（applies_on='mobility'）：计入攻方有效机动
        const _mobilityBuff = (attacker.statusEffects && Array.isArray(attacker.statusEffects))
            ? BuffManager.getMatchingStatus(attacker, trigCtx, 'mobility') : [];
        const mobilityBuffVal = _mobilityBuff.reduce((s, b) => s + (Number(b.value) || 0), 0);

        // ---- 阶段 1: 基础攻击力（近战=格斗 / 远程=射击） ----
        const baseAttack = attackType === 'melee'
            ? (attacker.melee || attacker.attack || 10)
            : (attacker.ranged || attacker.attack || 10);
        result.stages.base_attack = baseAttack;

        // ---- 阶段 2: 双方机动值差（阶段二：支持上下文有效机动注入） ----
        const attMobility = (config.attacker_effective_mobility != null)
            ? config.attacker_effective_mobility
            : (attacker.mobility || 0) + mobilityBuffVal;
        const defMobility = (config.defender_effective_mobility != null)
            ? config.defender_effective_mobility
            : (defender.mobility || 0);
        // 狙击技能：目标机动值 -2（Excel: 舍弃移动，机动值差计算中目标机动值-2）
        const sniperReduction = config.sniper_mobility_reduction || 0;
        const effectiveDefMobility = Math.max(0, defMobility - sniperReduction - blockadeMob);
        // 机动值差额 = 攻方有效机动 - 守方有效机动；上限封顶 +5，下限不设限制（允许负数无限放大）
        const mobilityDiff = Math.min(5, attMobility - effectiveDefMobility);
        result.stages.mobility_diff = mobilityDiff;
        if (sniperReduction > 0) {
            result.stages.sniper_mobility_reduction = sniperReduction;
        }

        // ---- 阶段 3: 临时攻击力 ----
        const tempAttack = baseAttack + mobilityDiff;
        result.stages.temp_attack = tempAttack;

        // ---- 阶段 4: 额外值（泛化累加器） ----
        const extraValues = this._calcExtraValues(attacker);
        result.stages.extras = extraValues;

        // ---- 阶段 5: 追加额外值后的攻击力（含 assist 增伤）----
        const attackAfterExtras = tempAttack + extraValues.total + assistVal;
        result.stages.attack_after_extras = attackAfterExtras;

        // ---- 阶段 6: 高地优势加成 ----
        const heightBonus = this._calcHeightBonus(attacker, defender, config);
        result.stages.height_bonus = heightBonus;

        // ---- 阶段 7: 地形伤害类型修正 ----
        const terrainKindMods = this._applyTerrainKindModifiers(defender, damageKind, terrainDefs);
        result.stages.terrain_kind_modifiers = terrainKindMods;

        // ---- 阶段 8: 防御减免（泛化） ----
        const defense = this._calcDefense(defender, attacker, terrainDefs, damageKind, config);
        result.stages.defense = defense;

        // ---- 阶段 9: 武器克制惩罚（泛化） ----
        const weaponPenalty = this._calcWeaponPenalty(attacker, defender, damageKind);
        result.stages.weapon_penalty = weaponPenalty;

        // ---- 阶段 10: 装备/技能伤害减免（泛化） ----
        const armorReduction = this._calcArmorReduction(attacker, defender, damageKind);
        result.stages.armor_reduction = armorReduction;

        // ---- 阶段 11: 手动摇骰追加伤害 ----
        const manualRollResult = this._applyManualRollBonus(config);
        result.stages.manual_roll = manualRollResult;

        // ---- 阶段 12: 最终伤害计算 ----
        let finalDamage = Math.max(0, attackAfterExtras - defense.total)
            + heightBonus.bonus
            + weaponPenalty
            - armorReduction
            + manualRollResult.bonus;
        finalDamage = Math.max(GUARANTEED_DAMAGE, finalDamage);

        // 应用地形伤害类型修正
        finalDamage = Math.floor(finalDamage * terrainKindMods.modifier);
        finalDamage = Math.max(GUARANTEED_DAMAGE, finalDamage);
        result.stages.final_damage_pre_crit = finalDamage;

        // ---- 阶段 13: 暴击判定（伤害计算完成后） ----
        const isCrit = this.checkCrit();
        result.is_crit = isCrit;
        result.stages.is_crit = isCrit;

        if (isCrit) {
            const critMult = DiceService.config.critMin + Math.random() * (DiceService.config.critMax - DiceService.config.critMin);
            result.crit_multiplier = parseFloat(critMult.toFixed(2));
            finalDamage = Math.floor(finalDamage * critMult);
        }

        result.final_damage = Math.max(GUARANTEED_DAMAGE, finalDamage);
        result.stages.final_damage = result.final_damage;

        // 本轮结算中被「命中条件且被实际使用」的 statusEffects.id 列表（供调用方扣减层数）
        result.triggered_status = [
            ..._attackerStatus.map(b => b.id),
            ..._attackerDebuff.map(b => b.id),
            ..._defenderStatus.map(b => b.id),
        ];

        return result;
    }

    // ---- 内部计算方法 ----

    /**
     * 泛化额外值累加器
     * 遍历 bonuses 数组，对任意 bonus_value !== undefined 的条目累加，
     * 不做类型名判断（不区分 assist/counter/focused_fire/sweep_precise/guard/blockade）
     *
     * @param {Object} attacker - 攻击方对象
     * @returns {{ total: number, details: Object }}
     */
    static _calcExtraValues(attacker) {
        let total = 0;
        const details = {};
        const bonuses = attacker.extraBonuses?.bonuses || attacker.bonuses || [];
        for (const bonus of bonuses) {
            if (!bonus) continue;
            const val = bonus.bonus_value ?? bonus.value ?? 0;
            if (val !== 0) {
                total += val;
                details[bonus.type || 'generic'] = val;
            }
        }
        return { total, details };
    }

    /**
     * 高地优势加成
     * 计算攻击方与防御方的高度差，每差1点给予 bonusPerDiff 伤害加成
     *
     * @param {Object} attacker - 攻击方
     * @param {Object} defender - 防御方
     * @param {Object} config - 管道配置
     * @returns {{ height_diff: number, bonus: number, message?: string }}
     */
    static _calcHeightBonus(attacker, defender, config) {
        const attZ = attacker.z ?? attacker.height ?? 0;
        const defZ = defender.z ?? defender.height ?? 0;
        const heightDiff = attZ - defZ;
        const bonusPerDiff = config.height_bonus_per_diff ?? 0;
        if (heightDiff > 0 && bonusPerDiff > 0) {
            const bonus = Math.floor(heightDiff * bonusPerDiff);
            return {
                height_diff: heightDiff,
                bonus,
                message: `高地优势 z+${heightDiff}, 伤害+${bonus}`
            };
        }
        return { height_diff: heightDiff, bonus: 0 };
    }

    /**
     * 地形伤害类型修正
     * 根据防御方所在地形的 damage_kind_modifiers 字典，对特定伤害种类施加倍率修正
     *
     * @param {Object} defender - 防御方
     * @param {string} damageKind - 攻击者实际伤害种类（权威来源，非 weaponType）
     * @param {Object} terrainDefs - 地形定义字典
     * @returns {{ terrain_id: string, damage_kind: string, modifier: number, defense_bonus: number }}
     */
    static _applyTerrainKindModifiers(defender, damageKind, terrainDefs) {
        const terrainId = defender.terrain || 'moon';
        const terrainDef = terrainDefs[terrainId] || {};
        const kindMods = terrainDef.damage_kind_modifiers || DEFAULT_TERRAIN_KIND_MODIFIERS;
        const modifier = kindMods[damageKind] || 1.0;
        const defenseBonus = terrainDef.defense_bonus ?? 0;
        return {
            terrain_id: terrainId,
            damage_kind: damageKind,
            modifier,
            defense_bonus: defenseBonus
        };
    }

    /**
     * 防御减免（泛化）
     * 基础防御 + 护盾 + Buff + 地形防御 + 装备防御修正
     *
     * @param {Object} defender - 防御方
     * @param {Object} attacker - 攻击方
     * @param {Object} terrainDefs - 地形定义字典
     * @param {string} damageKind - 攻击者实际伤害种类（权威来源，非 weaponType）
     * @returns {{ base: number, shield: number, buffs: number, terrain: number, equipment_reduction: number, total: number }}
     */
    static _calcDefense(defender, attacker, terrainDefs, damageKind, config) {
        // 防御力彻底废弃 → 0；减伤完全由护甲(机体结构*0.25) + 伤害分担接管
        const armorValue = (config && config.defender_armor != null)
            ? config.defender_armor
            : (defender.armor || 0);
        const baseDefense = (defender.defense ?? 0) + armorValue;
        const shieldValue = defender.shield || 0;
        const defenseBuffs = this._sumBuffs(defender.buffs || [], 'defense') + guardVal;

        // 泛化地形防御
        const terrainId = defender.terrain || 'moon';
        const terrainDef = terrainDefs[terrainId] || {};
        const terrainBonus = terrainDef.defense_bonus ?? 0;

        // 泛化装备防御修正（以权威伤害种类匹配 damage_kind_modifiers）
        let eqReduction = 0;
        const eq = defender.equipment || {};
        if (eq.defense_modifiers) {
            const weaponType = damageKind || attacker.weaponType || 'kinetic';
            eqReduction = eq.defense_modifiers[weaponType] || 0;
        }

        return {
            base: baseDefense,
            armor: armorValue,
            shield: shieldValue,
            buffs: defenseBuffs,
            terrain: terrainBonus,
            equipment_reduction: eqReduction,
            total: baseDefense + shieldValue + defenseBuffs + terrainBonus + eqReduction
        };
    }

    /**
     * 武器克制惩罚（泛化）
     * 攻击方实际伤害种类 == 防御方 resistance → 惩罚值
     *
     * @param {Object} attacker - 攻击方
     * @param {Object} defender - 防御方
     * @param {string} damageKind - 攻击者实际伤害种类（权威来源，非 weaponType）
     * @returns {number} 惩罚值
     */
    static _calcWeaponPenalty(attacker, defender, damageKind) {
        const attackerWeaponType = damageKind || null;
        const defenderResistance = defender.resistance || null;
        if (!attackerWeaponType || !defenderResistance) return 0;
        if (attackerWeaponType === defenderResistance) return WEAPON_COUNTER_PENALTY;
        return 0;
    }

    /**
     * 装备/技能伤害减免（泛化）
     * 遍历防御方所有装备槽位和技能，查找 damage_kind_modifiers 字典，
     * 根据攻击方实际伤害种类累加减免值
     *
     * @param {Object} attacker - 攻击方
     * @param {Object} defender - 防御方
     * @param {string} damageKind - 攻击者实际伤害种类（权威来源，非 weaponType）
     * @returns {number} 总减免值
     */
    static _calcArmorReduction(attacker, defender, damageKind) {
        let reduction = 0;
        const weaponType = damageKind || attacker.weaponType || 'kinetic';
        const eq = defender.equipment || {};

        // 遍历所有装备槽位
        for (const slot of ['full_armor', 'coating', 'shield_gen', 'reactive_armor']) {
            if (eq[slot]) {
                const slotMods = eq[slot].damage_kind_modifiers || {};
                reduction += slotMods[weaponType] || 0;
            }
        }

        // 遍历防御方技能，查找提供装备式保护的技能
        const skills = defender.skills || [];
        for (const skill of skills) {
            if (!skill || !skill.active) continue;
            const skillMods = skill.damage_kind_modifiers || {};
            reduction += skillMods[weaponType] || 0;
        }

        return reduction;
    }

    /**
     * 手动摇骰追加伤害
     * 如果 config.is_manual_roll 为 true，模拟玩家手动摇骰判定
     * TODO: Phase 10 - 状态机钩子，等待玩家实际输入
     *
     * @param {Object} config - 管道配置
     * @returns {{ manual: boolean, bonus: number, roll?: number, diceType?: string, successLine?: number, isSuccess?: boolean, message?: string }}
     */
    static _applyManualRollBonus(config) {
        if (!config.is_manual_roll) return { manual: false, bonus: 0 };

        // TODO: Phase 10 - state machine hook for manual roll input
        // 当前自动掷骰模拟
        const diceType = config.dice_type || '1d6';
        const successLine = config.success_line ?? 4;
        const bonusDamage = config.success_bonus_damage ?? 0;

        // 解析并掷骰（统一走 diceService.cjs，支持 "NdM" 与面数）
        const roll = DiceService.roll(diceType);

        const isSuccess = roll >= successLine;
        const bonus = isSuccess ? bonusDamage : 0;
        return {
            manual: true,
            roll,
            diceType,
            successLine,
            isSuccess,
            bonus,
            message: `[手动摇骰] 掷${diceType}=${roll} ${isSuccess ? '>=' : '<'} ${successLine}, 追加伤害+${bonus}`
        };
    }

    /**
     * Buff 求和
     */
    static _sumBuffs(buffs, type) {
        if (!buffs || !buffs.length) return 0;
        return buffs
            .filter(b => b && b.type === type)
            .reduce((sum, b) => sum + (b.value || 0), 0);
    }

    /**
     * 计算对地形的伤害
     */
    static calculateTerrainDamage(attacker, terrainDef, config) {
        const weaponType = config.damage_kind || attacker.weaponType || 'kinetic';
        const baseDamage = attacker.attack || 10;
        const terrainResistance = terrainDef.resistance || {};
        const resistance = terrainResistance[weaponType] || 1.0;
        return Math.floor(baseDamage * resistance);
    }

    /**
     * 应用地形伤害效果
     */
    static applyTerrainDamage(terrain, damage, terrainDefs) {
        const terrainDef = terrainDefs[terrain] || {};
        const hp = terrainDef.hp || 100;
        const remaining = Math.max(0, hp - damage);
        return {
            terrain,
            damage,
            hp_before: hp,
            hp_after: remaining,
            destroyed: remaining <= 0
        };
    }

    /**
     * 快速计算：简化接口兼容旧调用
     * 自动从 attacker.attack 推断 melee/ranged（取 attack 为两者共用值）
     *
     * @param {Object} attacker - 攻击方
     * @param {Object} defender - 防御方
     * @param {string} attackType - 'melee' | 'ranged'
     * @param {Object} terrainDefs - 地形定义（可选）
     * @returns {Object} 管道计算结果
     */
    static calculateQuick(attacker, defender, attackType = 'melee', terrainDefs = {}) {
        return this.calculate({
            attacker: {
                melee: attacker.melee || attacker.attack || 10,
                ranged: attacker.ranged || attacker.attack || 10,
                attack: attacker.attack || 10,
                mobility: attacker.mobility || 0,
                weaponType: attacker.weaponType || 'kinetic',
                buffs: attacker.buffs || [],
                skills: attacker.skills || [],
                extraBonuses: attacker.extraBonuses || null,
                z: attacker.z ?? attacker.height ?? 0,
                height: attacker.height ?? attacker.z ?? 0
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
                terrain: defender.terrain || 'moon',
                z: defender.z ?? defender.height ?? 0,
                height: defender.height ?? defender.z ?? 0
            },
            attack_type: attackType,
            terrainDefs: terrainDefs || {}
        });
    }

    /**
     * 六边形距离（Even-R offset → axial → cube），与后端 hexDistanceOffset 完全一致。
     * 供阵营技能 AoE 半径判定（factionSkillRegistry 调用）使用。
     */
    static calculateHexDistance(a, b) {
        const offToAx = (q, r) => ({ q: q - (r + (r & 1)) / 2, r });
        const ax = offToAx(a?.q || 0, a?.r || 0);
        const bx = offToAx(b?.q || 0, b?.r || 0);
        return Math.max(
            Math.abs(ax.q - bx.q),
            Math.abs(ax.r - bx.r),
            Math.abs(ax.q + ax.r - bx.q - bx.r)
        );
    }
}

module.exports = DamagePipe;
