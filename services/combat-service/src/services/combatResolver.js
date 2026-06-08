/**
 * combatResolver.js - 机甲战棋战斗解析器
 * 
 * 处理战斗中的特殊系统：奇袭、导弹轰炸、迷雾系统。
 * 所有骰子判定统一使用 DiceEngine，全部为 1d6。
 */

import DamagePipe from './combatCore/damagePipe.cjs';
import { defaultEngine } from './combatCore/DiceEngine.cjs';

class CombatResolver {
    constructor() {
        this.dice = defaultEngine;
        this.battlefield = null;
        this.fogActive = false;
    }

    /**
     * 初始化战场
     * @param {Object} battlefield - 战场配置 { id, name, fogOfWar, terrain[] }
     */
    init(battlefield) {
        this.battlefield = battlefield;
        this.fogActive = battlefield.fogOfWar || false;
    }

    // ============================================================
    // 奇袭系统 (Ambush)
    // ============================================================
    /**
     * 奇袭判定：1d6 > 3 表示奇袭失败（50% 概率触发奇袭）
     * 奇袭成功时，攻击方获得先手优势
     * @param {Object} attacker - 攻击方单位
     * @param {Object} defender - 防御方单位
     * @returns {Object|null} null 表示奇袭未触发，否则返回奇袭伤害
     */
    resolveAmbush(attacker, defender) {
        // 使用 DiceEngine 进行 1d6 判定
        const roll = this.dice.roll('1d6');
        if (roll > 3) {
            // 奇袭未触发（50% 概率）
            return null;
        }

        // 奇袭成功：计算先手伤害（70% 基础攻击力）
        const ambushDamage = Math.floor((attacker.attack || 10) * 0.7);
        const defenseReduction = DamagePipe._calcDefense(defender, attacker.weaponType || 'beam');

        return {
            type: 'ambush',
            roll: roll,
            damage: Math.max(1, ambushDamage - defenseReduction.total),
            message: `奇袭成功！(1d6=${roll}) 造成 ${Math.max(1, ambushDamage - defenseReduction.total)} 点伤害`
        };
    }

    // ============================================================
    // 导弹轰炸系统 (Missile Barrage)
    // ============================================================
    /**
     * 导弹轰炸：使用 1d6 判定命中数量
     * 发射 3 枚导弹，每枚导弹独立判定是否命中
     * @param {Object} attacker - 攻击方单位
     * @param {Object[]} targets - 目标单位列表
     * @returns {Object} 轰炸结果
     */
    resolveMissileBarrage(attacker, targets) {
        const missileCount = 3;
        const hits = [];
        const misses = [];
        let totalDamage = 0;

        for (let i = 0; i < missileCount; i++) {
            // 使用 DiceEngine 1d6 判定：>= 4 为命中（50% 命中率）
            const roll = this.dice.roll('1d6');
            const hit = roll >= 4;

            if (hit && targets.length > 0) {
                // 随机选择目标
                const target = targets[Math.floor(Math.random() * targets.length)];
                const damage = Math.floor((attacker.attack || 10) * 0.4);
                const defenseReduction = DamagePipe._calcDefense(target, 'missile');
                const finalDamage = Math.max(1, damage - defenseReduction.total);

                hits.push({ target: target.id, roll, damage: finalDamage });
                totalDamage += finalDamage;
            } else {
                misses.push({ roll });
            }
        }

        return {
            type: 'missile_barrage',
            totalMissiles: missileCount,
            hits: hits.length,
            misses: misses.length,
            totalDamage,
            details: { hits, misses },
            message: `导弹轰炸：${hits.length}/${missileCount} 命中，共造成 ${totalDamage} 点伤害`
        };
    }

    // ============================================================
    // 迷雾系统 (Fog of War)
    // ============================================================
    /**
     * 迷雾效果判定：使用 1d6 决定迷雾阶段
     * 1-2: 完全不可见（33%）
     * 3-4: 部分可见（33%）
     * 5-6: 正常可见（33%）
     * @returns {Object} 迷雾效果
     */
    resolveFogEffect() {
        if (!this.fogActive) {
            return { active: false, visibility: 'normal' };
        }

        const roll = this.dice.roll('1d6');

        let visibility;
        if (roll <= 2) {
            visibility = 'blind';      // 完全不可见：远程武器命中率-50%
        } else if (roll <= 4) {
            visibility = 'partial';    // 部分可见：远程武器命中率-25%
        } else {
            visibility = 'normal';     // 正常可见
        }

        return {
            active: true,
            roll,
            visibility,
            accuracyModifier: visibility === 'blind' ? -0.5 : visibility === 'partial' ? -0.25 : 0,
            message: `迷雾判定 (1d6=${roll}): ${visibility === 'blind' ? '完全不可见' : visibility === 'partial' ? '部分可见' : '正常可见'}`
        };
    }

    // ============================================================
    // 战斗主循环
    // ============================================================
    /**
     * 执行一回合战斗
     * @param {Object} attacker - 攻击方单位
     * @param {Object} defender - 防御方单位
     * @param {Object} options - 战斗选项
     * @returns {Object} 回合结果
     */
    executeTurn(attacker, defender, options = {}) {
        const result = {
            turn: options.turn || 1,
            actions: [],
            totalDamage: 0,
            fogEffect: null
        };

        // 1. 迷雾判定
        if (this.fogActive) {
            result.fogEffect = this.resolveFogEffect();
        }

        // 2. 奇袭判定（仅第一回合）
        if ((options.turn || 1) === 1) {
            const ambush = this.resolveAmbush(attacker, defender);
            if (ambush) {
                result.actions.push(ambush);
                result.totalDamage += ambush.damage;
            }
        }

        // 3. 导弹轰炸（如有导弹武器）
        if (attacker.weaponType === 'missile' && options.enableBarrage !== false) {
            const barrage = this.resolveMissileBarrage(attacker, [defender]);
            result.actions.push(barrage);
            result.totalDamage += barrage.totalDamage;
        }

        // 4. 主攻击（使用伤害计算管道）
        const damageResult = DamagePipe.calculate({
            attacker: {
                attack: attacker.attack,
                mobility: attacker.mobility,
                weaponType: attacker.weaponType,
                level: attacker.level,
                buffs: attacker.buffs || []
            },
            defender: {
                defense: defender.defense,
                armorType: defender.armorType,
                shield: defender.shield,
                level: defender.level,
                buffs: defender.buffs || []
            }
        });

        result.actions.push({
            type: 'main_attack',
            ...damageResult
        });
        result.totalDamage += damageResult.final_damage;

        return result;
    }

    /**
     * 重置解析器状态
     */
    reset() {
        this.dice.reset();
        this.fogActive = false;
    }
}

export { CombatResolver };
