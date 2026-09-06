/**
 * combatResolver.js v3.0 — 机甲战棋战斗解析器 (Phase 10 万能语法中枢)
 *
 * 处理战斗系统：奇袭、火力覆盖、迷雾系统、主攻击、耐久度结算。
 * Phase 10: 移除硬编码技能数组，改为万能语法字段驱动。
 */

import DamagePipe from './combatCore/damagePipe.cjs';
import EquipmentDurability from './combatCore/equipmentDurability.cjs';
import SkillExecutor from './combatCore/skillExecutor.cjs';
import SkillRegistry from './combatCore/skillRegistry.cjs';
import { getGlossaryConfig, getSystemConfig } from './combatCore/configLoader.cjs';
import { getDamageType } from './combatCore/skillContract.cjs';


class CombatResolver {
    constructor() {
        this.battlefield = null;
        this.fogActive = false;
        this.fireCoverageUsed = false;
        this.durability = new EquipmentDurability();
        this.skillExecutor = new SkillExecutor();
    }

    init(battlefield, allUnits) {
        this.battlefield = battlefield;
        this.fogActive = battlefield.fogOfWar || false;
        this.fireCoverageUsed = false;
        this.durability.reset();
        this.skillExecutor.resetStableForBattle();
        if (allUnits && allUnits.length > 0) {
            // 注册各单位装备耐久快照（否则 EquipmentDurability 全部静默 no-op）
            for (const unit of allUnits) {
                this.durability.register(unit);
            }
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
        // Phase 10: 泛化装备检查
        if (unit.equipment) {
            const eq = unit.equipment;
            // 检查所有装备槽位的 damage_kind_modifiers
            for (const slot of ['full_armor', 'coating', 'shield_gen', 'reactive_armor']) {
                if (eq[slot]) {
                    this.durability.consumeDurability(unit, 'special_' + slot, 999);
                    return true;
                }
            }
        }
        return false;
    }

    _disableBlockingAbility(unit) {
        const eq = unit.equipment || {};
        for (const slot of ['full_armor', 'coating', 'shield_gen', 'reactive_armor']) {
            if (eq[slot]) {
                this.durability.consumeDurability(unit, 'special_' + slot, 999);
            }
        }
    }

    initSkillCounters(allUnits) {
        for (const unit of allUnits) {
            if (!unit || !unit.skills) continue;
            for (const skill of unit.skills) {
                if (!skill || !skill.active) continue;
                // Phase 10: 使用万能字段判断
                const uf = this.skillExecutor._getUniversalFields(skill.type);
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
        const terrainDefs = getGlossaryConfig()?.terrains || {};
        const defenseReduction = DamagePipe._calcDefense(defender, attacker, terrainDefs);

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
    // 战斗主循环 (Phase 10: 万能语法驱动)
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

        // Phase 10: 万能语法技能路由 (移除硬编码 MELEE_SKILLS/RANGED_SKILLS)
        const resolvedSkill = this._resolveSkill(attacker, options.skill_id);

        if (resolvedSkill) {
            const uf = this.skillExecutor._getUniversalFields(resolvedSkill.type);
            // 根据 attack_stat 或 action_type 判定攻击类型
            if (uf.attack_stat === 'ranged') {
                attackType = 'ranged';
            } else if (uf.attack_stat === 'melee') {
                attackType = 'melee';
            } else if (uf.action_type === 'attack') {
                attackType = uf.attack_stat || 'melee';
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

        // Phase 10: 提取激活的技能效果 (含泛化 bonus_value)
        const activeSkillBonuses = this._extractSkillBonuses(attacker, resolvedSkill) || {};

        // Phase 10: 获取地形定义和万能技能字段
        const config = getGlossaryConfig();
        const terrainDefs = config?.terrains || {};
        const skillUf = resolvedSkill
            ? this.skillExecutor._getUniversalFields(resolvedSkill.type)
            : {};

        // Step 5: 配置驱动权威伤害种类——优先词条 damage_kind，缺失回退 weaponType
        const damageKind = getDamageType(skillUf, attacker.weaponType);

        // 阶段二：上下文有效机动（武器机动仅在使用该武器技能时生效；防具机动仅在携带方为被攻击方时生效）
        const _weaponMob = (attacker.equipState || []).filter(e => e.type === '武器').reduce((s, e) => s + (e.mobility || 0), 0);
        const _usesWeapon = attackType === 'melee' || attackType === 'ranged';
        const _attEffMob = (attacker.mobility || 0) + (_usesWeapon ? _weaponMob : 0);
        const _armorMob = (defender.equipState || []).filter(e => e.type === '防具').reduce((s, e) => s + (e.mobility || 0), 0);
        const _defEffMob = (defender.mobility || 0) + _armorMob;

        // 伤害计算 (Phase 10: 传入 terrainDefs 和新字段)
        const damageResult = DamagePipe.calculate({
            attacker: {
                melee: attMelee,
                ranged: attRanged,
                attack: attMelee || attRanged || 10,
                mobility: attacker.mobility || 0,
                weaponType: attacker.weaponType || 'kinetic',
                buffs: attacker.buffs || [],
                skills: attacker.skills || [],
                extraBonuses: activeSkillBonuses,
                z: attacker.z ?? attacker.height ?? 0,
                height: attacker.height ?? attacker.z ?? 0,
                equipment: attacker.equipment || {}
            },
            defender: {
                defense: defender.defense ?? 0,
                armorType: defender.armorType || 'normal',
                armor: defender.armor || 0,
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
            sniper_mobility_reduction: sniperMobilityReduction,
            terrainDefs,
            // Step 5: 显式注入归一化伤害种类（覆盖 weaponType）
            damage_kind: damageKind,
            // 阶段二：注入上下文有效机动（供 DamagePipe 机动差额计算，上限 +5）
            attacker_effective_mobility: _attEffMob,
            defender_effective_mobility: _defEffMob,
            // Phase 10: 万能语法字段注入管道
            is_manual_roll: skillUf.is_manual_roll || false,
            dice_type: skillUf.dice_type || '1d6',
            success_line: skillUf.success_line ?? 4,
            success_bonus_damage: skillUf.success_bonus_damage ?? 0,
            height_bonus_per_diff: skillUf.height_bonus_per_diff ?? 0
        });

        result.totalDamage += damageResult.final_damage;
        result.damage_pipe = damageResult;

        // 4. 耐久度结算（对齐 EquipmentDurability 真实方法：防御方承伤减伤 + 攻击方武器耐久）
        const duraChanges = [];
        // 4a. 防御方承受伤害 → 防具/全覆式装甲(kinetic)/抗性涂层(beam) 减伤并消耗耐久
        const defResult = this.durability.applyDamage(
            defender,
            damageResult.final_damage,
            damageKind
        );
        if (defResult && defResult.changes.length) {
            duraChanges.push(...defResult.changes);
        }
        // 4b. 攻击方武器耐久消耗（每次攻击 -1）
        this.durability.consumeWeaponDurability(attacker);
        if (duraChanges.length) {
            result.durabilityChanges = duraChanges;
        }

        return result;
    }

    _resolveSkill(attacker, skillId) {
        if (!skillId || !attacker || !attacker.skills) return null;
        return attacker.skills.find(s => s && (s.id === skillId || s.type === skillId));
    }

    /**
     * Phase 10: 泛化技能加成提取
     * 不再按技能名硬编码分支，而是从 skillExecutor 获取 bonus_value
     */
    _extractSkillBonuses(attacker, resolvedSkill) {
        if (!attacker || !attacker.skills) return null;

        const bonuses = [];
        for (const skill of attacker.skills) {
            if (!skill || !skill.active) continue;
            // 动态注册表路由：按 skill.type 查找提取器，未注册则跳过（无硬编码分支）
            const extractor = SkillRegistry.getBonusExtractor(skill.type);
            if (!extractor) continue;
            const b = extractor({ executor: this.skillExecutor, unit: attacker, skill, resolvedSkill });
            if (b) bonuses.push(b);
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
