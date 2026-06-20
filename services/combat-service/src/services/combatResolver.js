/**
 * combatResolver.js v2.0 — 机甲战棋战斗解析器（去骰化）
 *
 * 处理战斗系统：奇袭、火力覆盖、迷雾系统、主攻击、耐久度结算。
 * 所有随机骰子判定已移除，改为词条库确定性公式。
 */

import DamagePipe from './combatCore/damagePipe.cjs';
import EquipmentDurability from './combatCore/equipmentDurability.cjs';
import SkillExecutor from './combatCore/skillExecutor.cjs';



// 词条库参数已内置于方法默认值中

class CombatResolver {
    constructor() {
        this.battlefield = null;
        this.fogActive = false;

        // 火力覆盖状态（整场战斗）
        this.fireCoverageUsed = false;

        // 耐久度管理
        this.durability = new EquipmentDurability();

        // 技能执行器（不再需要 DiceEngine）
        this.skillExecutor = new SkillExecutor();
    }

    init(battlefield, allUnits) {
        this.battlefield = battlefield;
        this.fogActive = battlefield.fogOfWar || false;
        this.fireCoverageUsed = false;
        this.durability.reset();
        this.skillExecutor.resetStableForBattle();
        if (allUnits && allUnits.length > 0) {
            this.initSkillCounters(allUnits);
        }
    }

    // ============================================================
    // 火力覆盖系统
    // ============================================================

    resolveFireCoverage(centerCell, allUnits) {
        if (this.fireCoverageUsed) {
            return { type: 'fire_coverage', used: false, message: '火力覆盖已在本场战斗中用过' };
        }

        const affectedUnits = [];
        let totalDamage = 0;

        for (const unit of allUnits) {
            if (!unit || unit.hp <= 0) continue;

            const dq = Math.abs((unit.q || 0) - (centerCell.q || 0));
            const dr = Math.abs((unit.r || 0) - (centerCell.r || 0));
            const ds = Math.abs(dq + dr);
            const dist = Math.max(dq, dr, ds);

            if (dist <= 2) {
                // 检查是否有守护/装甲
                const blocked = this._checkFireCoverageBlock(unit);
                let actualDamage = 5;

                if (blocked) {
                    actualDamage = 0;
                    affectedUnits.push({
                        unit_id: unit.id,
                        original_damage: 5,
                        actual_damage: 0,
                        blocked: true,
                        message: `${unit.name || '?'} 抵挡了火力覆盖`
                    });
                } else {
                    unit.hp = Math.max(0, unit.hp - 5);
                    totalDamage += actualDamage;
                    affectedUnits.push({
                        unit_id: unit.id,
                        original_damage: 5,
                        actual_damage: 5,
                        blocked: false,
                        hp_after: unit.hp
                    });
                }
            }
        }

        this.fireCoverageUsed = true;
        return {
            type: 'fire_coverage',
            used: true,
            center: centerCell,
            affected_units: affectedUnits,
            total_damage: totalDamage,
            message: `火力覆盖！对(${centerCell.q},${centerCell.r})周围2格造成${totalDamage}点总伤害`
        };
    }

    _checkFireCoverageBlock(unit) {
        if (!unit || !unit.skills) return false;
        for (const skill of unit.skills) {
            if (!skill || !skill.active) continue;
            if (skill.type === 'guard' && (unit.guard_counter || 0) > 0) {
                unit.guard_counter = (unit.guard_counter || 0) - 1;
                return true;
            }
        }
        if (unit.equipment) {
            if (unit.equipment.full_armor) {
                this.durability.consumeDurability(unit, 'special_full_armor', 999);
                return true;
            }
            if (unit.equipment.coating) {
                this.durability.consumeDurability(unit, 'special_coating', 999);
                return true;
            }
        }
        return false;
    }

    _disableBlockingAbility(unit) {
        const eq = unit.equipment || {};
        if (eq.full_armor) {
            this.durability.consumeDurability(unit, 'special_full_armor', 999);
        }
        if (eq.coating) {
            this.durability.consumeDurability(unit, 'special_coating', 999);
        }
    }

    initSkillCounters(allUnits) {
        for (const unit of allUnits) {
            if (!unit || !unit.skills) continue;
            for (const skill of unit.skills) {
                if (!skill || !skill.active) continue;
                switch (skill.type) {
                    case 'assist':
                        this.skillExecutor.initAssistCounter(unit);
                        break;
                    case 'guard':
                        this.skillExecutor.initGuardCounter(unit);
                        break;
                    case 'blockade':
                        this.skillExecutor.initBlockadeCounter(unit);
                        break;
                }
            }
        }
    }

    // ============================================================
    // 奇袭系统 — 去骰化：始终触发，70% 攻击力
    // ============================================================

    resolveAmbush(attacker, defender) {
        const cfg = getSystemConfig('ambush');
        const damagePercent = cfg?.damage_percent ?? 0.7;
        const ambushDamage = Math.floor((attacker.attack || 10) * damagePercent);
        const defenseReduction = DamagePipe._calcDefense(defender);

        return {
            type: 'ambush',
            damage: Math.max(1, ambushDamage - defenseReduction.total),
            message: `奇袭成功！造成 ${Math.max(1, ambushDamage - defenseReduction.total)} 点伤害`
        };
    }

    // ============================================================
    // 迷雾系统 — 去骰化：正常可见，无随机修正
    // ============================================================

    resolveFogEffect() {
        if (!this.fogActive) {
            return { active: false, visibility: 'normal' };
        }

        const cfg = getSystemConfig('fog_of_war');
        const visibility = cfg?.visibility ?? 'normal';
        const accuracyMod = cfg?.accuracy_modifier ?? 0;

        return {
            active: true,
            visibility,
            accuracyModifier: accuracyMod,
            message: `迷雾系统：${visibility === 'normal' ? '正常可见' : visibility === 'partial' ? '部分可见' : '完全不可见'}`
        };
    }

    // ============================================================
    // 战斗主循环
    // ============================================================

    executeTurn(attacker, defender, options = {}) {
        const result = {
            turn: options.turn || 1,
            actions: [],
            totalDamage: 0,
            fogEffect: null,
            durabilityChanges: []
        };

        // 1. 迷雾判定
        if (this.fogActive) {
            result.fogEffect = this.resolveFogEffect();
        }

        // 2. 奇袭判定
        if (options.enableAmbush !== false) {
            const ambush = this.resolveAmbush(attacker, defender);
            if (ambush) {
                result.actions.push(ambush);
                result.totalDamage += ambush.damage;
            }
        }

        // 3. 主攻击
        let attackType = options.attack_type || 'melee';
        let attMelee = attacker.melee || attacker.attack || 10;
        let attRanged = attacker.ranged || attacker.attack || 10;

        // 技能处理
        const resolvedSkill = this._resolveSkill(attacker, options.skill_id);

        const MELEE_SKILLS = ['counter', 'block', 'polearm', 'long_handle', 'supply'];
        const RANGED_SKILLS = ['sweep', 'throw', 'stable', 'sniper', 'sweep_precise', 'focused_fire'];

        if (resolvedSkill) {
            if (MELEE_SKILLS.includes(resolvedSkill.type)) {
                attackType = 'melee';
            } else if (RANGED_SKILLS.includes(resolvedSkill.type)) {
                attackType = 'ranged';
            }
        }

        // 狙击技能
        let sniperMobilityReduction = 0;
        if ((attackType === 'ranged' || attackType === 'skill') && !attacker.has_moved) {
            const hasSniper = (resolvedSkill && resolvedSkill.type === 'sniper') ||
                (attacker.skills || []).some(
                    s => s && s.type === 'sniper' && s.active
                );
            if (hasSniper) {
                sniperMobilityReduction = 2;
            }
        }

        // 提取激活的技能效果
        const activeSkillBonuses = this._extractSkillBonuses(attacker, resolvedSkill) || {};

        // 伤害计算
        const damageResult = DamagePipe.calculate({
            attacker: {
                melee: attMelee,
                ranged: attRanged,
                attack: attMelee || attRanged || 10,
                mobility: attacker.mobility || 0,
                weaponType: attacker.weaponType || 'kinetic',
                buffs: attacker.buffs || [],
                skills: attacker.skills || [],
                extraBonuses: activeSkillBonuses
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
            attack_type: attackType,
            sniper_mobility_reduction: sniperMobilityReduction
        });

        result.totalDamage += damageResult.final_damage;
        result.damage_pipe = damageResult;

        // 4. 耐久度结算
        const duraChanges = this.durability.resolveTurn(attacker, defender, options.turn);
        if (duraChanges && duraChanges.length) {
            result.durabilityChanges = duraChanges;
        }

        return result;
    }

    _resolveSkill(attacker, skillId) {
        if (!skillId || !attacker || !attacker.skills) return null;
        return attacker.skills.find(s => s && (s.id === skillId || s.type === skillId));
    }

    _extractSkillBonuses(attacker, resolvedSkill) {
        if (!attacker || !attacker.skills) return null;

        const bonuses = [];
        for (const skill of attacker.skills) {
            if (!skill || !skill.active) continue;

            if (skill.type === 'assist') {
                const assistResult = this.skillExecutor.executeAssist(attacker, false);
                if (assistResult.triggered) {
                    bonuses.push({ type: 'assist', value: assistResult.bonus });
                }
            }
            if (skill.type === 'blockade') {
                const blockadeResult = this.skillExecutor.executeBlockade(attacker, undefined, false);
                if (blockadeResult.triggered) {
                    bonuses.push({ type: 'blockade', value: blockadeResult.mobility_reduction });
                }
            }
            if (skill.type === 'counter') {
                bonuses.push({ type: 'counter', value: 2 });
            }
            if (skill.type === 'focused_fire' && resolvedSkill && resolvedSkill.type === 'focused_fire') {
                const ff = this.skillExecutor.executeFocusedFire();
                bonuses.push({ type: 'focused_fire', value: ff.bonus });
            }
        }

        return bonuses.length > 0 ? { bonuses } : null;
    }

    reset() {
        this.fogActive = false;
        this.fireCoverageUsed = false;
        this.durability.reset();
        this.skillExecutor.resetStableForBattle();
    }
}


// ============================================================
// 静态包装方法
// ============================================================

CombatResolver.resolveAttack = function(attacker, target, attack_type, skill_id) {
    const res = new CombatResolver();
    return res.executeTurn(attacker, target, { attack_type, skill_id });
};

CombatResolver.resolveSurpriseAttack = function(surpriseUnit, target, attack_type) {
    const res = new CombatResolver();
    return res.executeTurn(surpriseUnit, target, { attack_type, enableAmbush: true });
};

CombatResolver.getSupportUnits = function(target, allUnits) {
    if (!target || !allUnits) return [];
    return allUnits.filter(u => {
        if (!u || u.id === target.id || (u.hp || 0) <= 0) return false;
        if (u.faction !== target.faction) return false;
        const dq = Math.abs((u.q || 0) - (target.q || 0));
        const dr = Math.abs((u.r || 0) - (target.r || 0));
        return Math.max(dq, dr, Math.abs(dq + dr)) <= 1;
    });
};

CombatResolver.resolveEarthArtillery = function(center_q, center_r, units, battlefield_state) {
    const res = new CombatResolver();
    res.fireCoverageUsed = false;
    return res.resolveFireCoverage({ q: center_q, r: center_r }, units);
};

CombatResolver.resolveFogSystem = function(units, battlefield_state) {
    const res = new CombatResolver();
    res.fogActive = !!(battlefield_state && battlefield_state.fogOfWar);
    const effects = [];
    for (const unit of (units || [])) {
        if (unit && (unit.hp || 0) > 0) {
            effects.push({
                unit_id: unit.id,
                ...res.resolveFogEffect()
            });
        }
    }
    return { active: res.fogActive, effects };
};

CombatResolver.resolveReinforcement = function(targetUnit, supportUnit, originalDamage) {
    if (!targetUnit || !supportUnit) {
        return { interceded: false, message: '增援失败：单位无效' };
    }
    const dq = Math.abs((targetUnit.q || 0) - (supportUnit.q || 0));
    const dr = Math.abs((targetUnit.r || 0) - (supportUnit.r || 0));
    const ds = Math.abs((targetUnit.q || 0) - (supportUnit.q || 0) + (targetUnit.r || 0) - (supportUnit.r || 0));
    const dist = Math.max(dq, dr, ds);
    if (dist > 1) {
        return { interceded: false, message: '增援距离 ' + dist + ' 格，超出1格范围' };
    }
    if (supportUnit.hp <= 0) {
        return { interceded: false, message: '增援单位已阵亡' };
    }
    const redirectedDamage = Math.floor(originalDamage * 0.8);
    const targetDamage = originalDamage - redirectedDamage;
    supportUnit.hp = Math.max(0, supportUnit.hp - redirectedDamage);
    return {
        interceded: true,
        redirected_damage: redirectedDamage,
        target_damage: targetDamage,
        reinforcement_id: supportUnit.id,
        reinforcement_name: supportUnit.name || '?',
        reinforcement_hp: supportUnit.hp,
        message: (supportUnit.name || '?') + ' 增援了 ' + (targetUnit.name || '?') + '！承受 ' + redirectedDamage + ' 伤害（目标承担 ' + targetDamage + '）'
    };
};

CombatResolver.checkSurpriseAttack = function(attacker, target, allUnits) {
    return null;
};

export { CombatResolver };
