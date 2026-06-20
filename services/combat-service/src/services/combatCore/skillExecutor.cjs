/**
 * skillExecutor.cjs - 技能执行器 v2.0 (去骰化 + 词条库中枢对接)
 *
 * 按照词条库 glossary-skill-config.json 实现确定性技能逻辑。
 * 所有随机掷骰判定已移除，改为读取词条库配置的固定参数。
 *
 * 技能类型：
 *   近战技能：反击、格挡、长柄、补给(双槽)
 *   远程技能：扫射、投掷、稳定、狙击
 *   自动化技能：助攻、守护、阻碍、侦察(双槽)
 *   特殊词条：斩杀、决斗、抢夺、专注射击、幸运、再动
 */

const { getSkillConfig, getSystemConfig, getGlossaryConfig } = require('./configLoader.cjs');

// configLoader 提供运行时动态加载，无需模块级缓存
// getSkillConfig() / getSystemConfig() 每次从磁盘读取最新值


class SkillExecutor {
    constructor() {
        // 稳定技能每局使用状态追踪：key = unit.id
        this.stableUsedInBattle = new Map();
        this.config = getGlossaryConfig();
    }

    /**
     * 获取技能的通用结构化属性 (v3.0 数据模型)
     * @returns {{ target_filter, cast_range, aoe_radius, base_damage, status_effects }}
     */
    _getUniversalFields(skillType) {
        const cfg = getSkillConfig(skillType);
        return {
            target_filter: cfg?.target_filter ?? 'enemy',
            cast_range: cfg?.cast_range ?? 1,
            aoe_radius: cfg?.aoe_radius ?? 0,
            base_damage: cfg?.base_damage ?? 0,
            status_effects: cfg?.status_effects ?? []
        };
    }

    /**
     * 根据 cast_range 获取 BFS 可达格子 (供前端高亮使用)
     * @returns {{ min: number, max: number }}
     */
    getSkillRange(skillType) {
        const cfg = getSkillConfig(skillType);
        const cr = cfg?.cast_range ?? 1;
        return { min: 0, max: cr };
    }

    /**
     * 根据 aoe_radius 获取溅射半径
     * @returns {number} 0=单体, >0=爆炸溅射半径
     */
    getAoeRadius(skillType) {
        const cfg = getSkillConfig(skillType);
        return cfg?.aoe_radius ?? 0;
    }

    // ============================================================
    // 近战技能
    // ============================================================

    /**
     * 反击 — 被动：受攻击且对方在范围内时触发，发动反击，伤害 +2
     */
    executeCounter(unit, attacker, skillRange) {
        const cfg = getSkillConfig('counter');
        const range = skillRange ?? cfg?.cast_range ?? 1;
        const dist = this._hexDistance(unit, attacker);
        if (dist > range) return { triggered: false };

        return {
            triggered: true,
            type: 'counter',
            attack_type: 'melee',
            active: true,
            bonus: 2,
            message: '反击触发！伤害 +2'
        };
    }

    /**
     * 格挡 — 被动：受攻击时伤害 -2（去骰化：100%触发）
     */
    executeBlock() {
        const cfg = getSkillConfig('block');
        const reduction = cfg?.reduction ?? 2;
        return {
            triggered: true,
            blocked: true,
            reduction,
            message: `格挡成功！伤害 -${reduction}`
        };
    }

    /**
     * 长柄 — 被动：攻击范围朝纵横四方向各延伸 1 格
     */
    getPolearmExtraRange(unit, target) {
        const sameQ = (unit.q || 0) === (target.q || 0);
        const sameR = (unit.r || 0) === (target.r || 0);
        if (sameQ || sameR) return 1;
        return 0;
    }

    /**
     * 补给 — 主动：跳过移动，对范围 1 内友军回复 格斗值 × 1 的 HP（占用 2 槽）
     */
    executeSupply(unit, target) {
        if (target) {
            const dist = this._hexDistance(unit, target);
            if (dist > 1 || dist === 0) {
                return {
                    heal_amount: 0,
                    out_of_range: true,
                    min: 1, max: 1, actual: dist,
                    message: `补给仅对范围 1 内友军有效（当前距离 ${dist} 格）`
                };
            }
        }
        const melee = unit.melee || unit.attack || 10;
        return {
            heal_amount: melee,
            message: `补给：回复 ${melee} 点 HP`
        };
    }

    // ============================================================
    // 远程技能
    // ============================================================

    /**
     * 扫射 — 主动：扇形 2 格，不判定机动值（去骰化：确定性精准命中）
     *   精准命中单体，伤害 -2
     *   范围内单位均摊范围伤害
     */
    executeSweep(unit, target, allUnits) {
        const cfg = getSkillConfig('sweep');
        const sectorAngle = cfg?.sector_angle ?? 60;
        // 优先使用通用字段 cast_range (v3.0)，fallback 到旧 max_range
        const maxRange = cfg?.cast_range ?? cfg?.max_range ?? 2;

        if (target && !this._isInSector(unit, target, maxRange, sectorAngle)) {
            return {
                mode: 'out_of_range',
                message: `扫射需要目标在扇形${maxRange}格范围内（当前超出范围）`
            };
        }

        // 去骰化：始终精准命中单体
        return {
            mode: 'precise',
            attack_type: 'ranged',
            active: true,
            targets: [target],
            message: `扫射精准命中！单体攻击，伤害 ${cfg?.base_damage ?? cfg?.damage_modifier_precise ?? -2}`
        };
    }

    /**
     * 投掷 — 主动：1-3 格（去骰化：确定性 debuff）
     *   效果：目标周围 2 格所有目标下次伤害 +5
     */
    executeThrow(unit, target) {
        const cfg = getSkillConfig('throw');
        // 优先使用通用字段 cast_range (v3.0)，fallback 到 old min_range/max_range
        const range = cfg?.cast_range ?? cfg?.max_range ?? 3;
        const minRange = cfg?.min_range ?? 1;
        const maxRange = range;
        const ampValue = cfg?.value ?? 5;

        if (target) {
            const dist = this._hexDistance(unit, target);
            if (dist < minRange || dist > maxRange) {
                return {
                    mode: 'out_of_range',
                    min: minRange, max: maxRange, actual: dist,
                    message: `投掷需要 ${minRange}~${maxRange} 格距离（当前 ${dist} 格）`
                };
            }
        }
        return {
            mode: 'debuff',
            effect: 'damage_amp',
            value: ampValue,
            message: `投掷：目标周围 2 格内所有目标下次伤害 +${ampValue}`
        };
    }

    /**
     * 稳定 — 主动：每局游戏一次，可以在移动后使用"专注射击"
     */
    executeStable(unit, target) {
        const unitKey = unit.id || unit.unit_id;
        if (this.stableUsedInBattle.get(unitKey)) {
            return { triggered: false, message: '稳定已在本次战斗中使用过' };
        }

        if (target) {
            const dist = this._hexDistance(unit, target);
            if (dist < 1 || dist > 4) {
                return {
                    triggered: false,
                    out_of_range: true,
                    min: 1, max: 4, actual: dist,
                    message: `稳定需要 1~4 格距离（当前 ${dist} 格）`
                };
            }
        }

        this.stableUsedInBattle.set(unitKey, true);
        const ff = this.executeFocusedFire();

        return {
            triggered: true,
            type: 'stable',
            active: true,
            focused_fire: ff,
            bonus: ff.bonus,
            message: `稳定触发！${ff.message}`
        };
    }

    resetStableForBattle() {
        this.stableUsedInBattle.clear();
    }

    /**
     * 狙击 — 主动：舍弃移动，机动值差计算中，目标的机动值 -2
     */
    canSniper(unit, target) {
        if (unit.has_moved) {
            return { triggered: false, message: '狙击需要舍弃本回合移动' };
        }
        if (!target) {
            return { triggered: false, message: '狙击需要目标' };
        }
        const cfg = getSkillConfig('sniper');
        const minRange = cfg?.min_range ?? 4;
        const maxRange = cfg?.cast_range ?? cfg?.max_range ?? 6;
        const dist = this._hexDistance(unit, target);
        if (dist < minRange || dist > maxRange) {
            return {
                triggered: false,
                out_of_range: true,
                min: 4, max: 6, actual: dist,
                message: `狙击需要 4~6 格距离（当前 ${dist} 格）`
            };
        }
        return {
            triggered: true,
            type: 'sniper',
            attack_type: 'ranged',
            active: true,
            mobility_reduction: 2,
            message: '狙击：舍弃移动，目标机动值 -2'
        };
    }

    // ============================================================
    // 自动化技能
    // ============================================================

    executeAssist(unit, increment = true) {
        if (!unit || !unit.skills) return { triggered: false };
        const hasAssist = unit.skills.some(
            s => s && s.type === 'assist' && s.active
        );
        if (!hasAssist) return { triggered: false };

        if (increment) {
            unit.assist_counter = (unit.assist_counter || 0) - 1;
        }

        if ((unit.assist_counter || 0) <= 0) {
            unit.assist_counter = 0;
            return { triggered: false, message: '助攻效果已耗尽' };
        }

        return {
            triggered: true,
            type: 'assist',
            active: true,
            bonus: 3,
            remaining: unit.assist_counter,
            message: `助攻：伤害 +3（剩余 ${unit.assist_counter} 次）`
        };
    }

    executeGuard(unit, increment = true) {
        if (!unit || !unit.skills) return { triggered: false };
        const hasGuard = unit.skills.some(
            s => s && s.type === 'guard' && s.active
        );
        if (!hasGuard) return { triggered: false };

        if (increment) {
            unit.guard_counter = (unit.guard_counter || 0) - 1;
        }

        if ((unit.guard_counter || 0) <= 0) {
            unit.guard_counter = 0;
            return { triggered: false, message: '守护效果已耗尽' };
        }

        return {
            triggered: true,
            type: 'guard',
            active: true,
            reduction: 5,
            remaining: unit.guard_counter,
            message: `守护：伤害 -5（剩余 ${unit.guard_counter} 次）`
        };
    }

    executeBlockade(unit, target, increment = true) {
        if (!unit || !unit.skills) return { triggered: false };
        const hasBlockade = unit.skills.some(
            s => s && s.type === 'blockade' && s.active
        );
        if (!hasBlockade) return { triggered: false };

        if (increment) {
            unit.blockade_counter = (unit.blockade_counter || 0) - 1;
        }

        if ((unit.blockade_counter || 0) <= 0) {
            unit.blockade_counter = 0;
            return { triggered: false, message: '阻碍效果已耗尽' };
        }

        return {
            triggered: true,
            type: 'blockade',
            active: true,
            mobility_reduction: 5,
            remaining: unit.blockade_counter,
            message: `阻碍：对方机动值 -5（剩余 ${unit.blockade_counter} 次）`
        };
    }

    initAssistCounter(unit) { unit.assist_counter = 5; }
    initGuardCounter(unit) { unit.guard_counter = 3; }
    initBlockadeCounter(unit) { unit.blockade_counter = 3; }

    executeScout(unit, ally) {
        const scoutRange = unit.ranged || unit.attack || 10;
        if (!ally) return { triggered: false };
        const dist = this._hexDistance(unit, ally);
        if (dist > scoutRange || unit.faction !== ally.faction) return { triggered: false };

        return {
            triggered: true,
            type: 'scout',
            active: true,
            evasion_bonus: 2,
            scout_range: scoutRange,
            message: `侦察：友军闪避值 +2（侦察范围 ${scoutRange} 格）`
        };
    }

    // ============================================================
    // 特殊词条 — 去骰化 + 词条库对接
    // ============================================================

    /**
     * 斩杀 — 近战伤害结算后，目标 HP < 阈值% 时直接斩杀
     *   原逻辑(骰子): HP<5→掷1d6≥HP→斩杀
     *   新逻辑(确定性): HP < maxHP * threshold% → 100%触发
     */
    executeExecute(target) {
        const hp = target.hp || 0;
        const maxHp = target.max_hp || target.hp || 1;
        const cfg = getSkillConfig('execute');
        const thresholdPercent = cfg?.hp_threshold_percent ?? 10;
        const threshold = Math.max(1, Math.floor(maxHp * thresholdPercent / 100));

        if (hp <= 0 || hp > threshold) {
            return { executed: false, message: `HP=${hp} > 斩杀阈值 ${threshold}` };
        }

        return {
            executed: true,
            threshold,
            message: `斩杀！HP=${hp} ≤ 阈值${threshold} (${thresholdPercent}% maxHP)，目标直接阵亡`
        };
    }

    /**
     * 决斗 — 双方均在对方攻击范围内且 HP < 对方 max(格斗,射击) 时触发
     *   原逻辑(骰子): 双方各掷1d6比大小
     *   新逻辑(确定性): 比较 max_attack 值，高者胜
     */
    executeDuel(unitA, unitB) {
        const maxA = Math.max(unitA.melee || unitA.attack || 10, unitA.ranged || 0);
        const maxB = Math.max(unitB.melee || unitB.attack || 10, unitB.ranged || 0);

        if (unitA.hp >= maxB || unitB.hp >= maxA) return { triggered: false };

        const dist = this._hexDistance(unitA, unitB);
        if (dist > 1) return { triggered: false };

        if (maxA === maxB) {
            return {
                triggered: true,
                draw: true,
                statA: maxA,
                statB: maxB,
                message: `决斗同归于尽！双方 max_attack=${maxA}`
            };
        }

        const winner = maxA > maxB ? 'attacker' : 'defender';
        return {
            triggered: true,
            draw: false,
            winner,
            statA: maxA,
            statB: maxB,
            message: `决斗！${winner === 'attacker' ? '攻击方' : '防御方'} 获胜 (max_attack: ${maxA} vs ${maxB})`
        };
    }

    /**
     * 抢夺 — 伤害值 > 被攻击者武器攻击值时触发
     *   原逻辑(骰子): 掷1d6>3→成功
     *   新逻辑(确定性): damage > weapon_attack → 100%触发
     */
    executeSnatch(damageDealt, defenderWeaponAttack) {
        if (damageDealt <= defenderWeaponAttack) return { triggered: false };

        return {
            triggered: true,
            success: true,
            damage_reduced: Math.floor(damageDealt / 2),
            message: `抢夺成功！获得武器，伤害减半为 ${Math.floor(damageDealt / 2)}`
        };
    }

    /**
     * 专注射击 — 放弃移动，获得固定伤害加成
     *   原逻辑(骰子): 1d6≤4→+3, 5-6→+5
     *   新逻辑(确定性): 固定 +4
     */
    executeFocusedFire() {
        const cfg = getSkillConfig('focused_fire');
        const bonus = cfg?.base_damage ?? cfg?.bonus ?? 4;
        return {
            bonus,
            message: `专注射击：伤害 +${bonus}`
        };
    }

    /**
     * 幸运 — 获得空投时可直接再次移动并攻击
     *   原逻辑(骰子): 1d6: 1-2→skip, 3-4→attack, 5-6→move+attack
     *   新逻辑(确定性): 始终移除空投并获得再次移动攻击
     */
    executeLucky() {
        const cfg = getSkillConfig('lucky');
        const action = cfg?.action ?? 'remove_and_attack';
        return {
            action,
            message: '幸运触发：再次移动并攻击'
        };
    }

    /**
     * 再动 — 击杀敌军单位时触发，额外一回合（不连续触发）
     */
    canReactivate(killConfirmed, lastReactivation) {
        return killConfirmed && !lastReactivation;
    }

    // ============================================================
    // 工具方法
    // ============================================================

    _hexDistance(a, b) {
        if (!a || !b) return 999;
        const dq = Math.abs((a.q || 0) - (b.q || 0));
        const dr = Math.abs((a.r || 0) - (b.r || 0));
        const ds = Math.abs(((a.q || 0) - (b.q || 0)) + ((a.r || 0) - (b.r || 0)));
        return Math.max(dq, dr, ds);
    }

    _isInSector(unit, target, maxDist = 2, sectorAngle = 60) {
        if (!unit || !target) return false;
        const dist = this._hexDistance(unit, target);
        if (dist > maxDist || dist === 0) return false;

        const dq = (target.q || 0) - (unit.q || 0);
        const dr = (target.r || 0) - (unit.r || 0);

        const x = dq + dr * 0.5;
        const y = dr * 0.866;

        const angle = Math.atan2(y, x) * 180 / Math.PI;
        const facing = unit.facing || 0;

        let diff = Math.abs(angle - facing);
        if (diff > 180) diff = 360 - diff;

        return diff <= sectorAngle;
    }
}

module.exports = SkillExecutor;
