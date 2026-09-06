/**
 * damageModifiers.cjs — 实时攻击路径伤害减免（H7 钩子载体）
 *
 * 关键架构事实（产出前核查结论）：
 *   实时 /attack 走 skillExecutor._executeAttackSkill 内联公式（skillExecutor.cjs:278），
 *   不调用 damagePipe.calculate。因此抗性 / 专注射射减免必须在此处、内联公式之后插入一次。
 *
 * 本模块对外只暴露一个调用点 applyDamageModifiers(...)，供 _executeAttackSkill 调用。
 * 这样保持 skillExecutor.cjs 主链路零侵入，所有减免逻辑收敛于此文件。
 *
 * 减免项：
 *   - resistance：单位配置 resistance.damage_kind_modifiers，对同 damage_kind 攻击减伤
 *   - focused_fire：持有专注射击 + 本回合放弃移动 + 远程攻击 → 分段骰 +3/+5（对抗/专注对齐）
 */
const { getSkillConfig } = require('./configLoader.cjs');
const DiceService = require('./diceService.cjs');

/** 取单位抗性配置（兼容扁平 resistance 与嵌套 equipment.resistance） */
function getUnitResistance(unit) {
    if (!unit) return null;
    const r = unit.resistance || (unit.equipment && unit.equipment.resistance);
    if (!r) return null;
    // 形态1：{ damage_kind_modifiers: { kinetic:2 } }
    if (r.damage_kind_modifiers && typeof r.damage_kind_modifiers === 'object') {
        return { kind: r.resist_kind || null, mods: r.damage_kind_modifiers };
    }
    // 形态2：resist_kind 单值（历史兼容）
    if (r.resist_kind) {
        return { kind: r.resist_kind, mods: { [r.resist_kind]: 2 } };
    }
    return null;
}

/** 抗性减免：对同 damage_kind 的攻击按 damage_kind_modifiers 减伤 */
function applyResistance(target, damage, damageKind) {
    const r = getUnitResistance(target);
    if (!r || !r.mods) return { damage, reduction: 0 };
    const val = Number(r.mods[damageKind] || 0);
    if (!val) return { damage, reduction: 0 };
    return { damage: Math.max(0, damage - val), reduction: val };
}

/** 单位是否持有某技能（兼容 skills：字符串数组 / 对象数组[{key}] / 字符串 / 对象） */
function unitHasSkill(unit, key) {
    if (!unit || !unit.skills) return false;
    const s = unit.skills;
    if (Array.isArray(s)) {
        return s.some(x => typeof x === 'string'
            ? x === key
            : (x && (x.key === key || x.skill_key === key || x.id === key)));
    }
    if (typeof s === 'string') return s === key || s.split(',').map(x => x.trim()).includes(key);
    if (typeof s === 'object') return Boolean(s[key]);
    return false;
}

/**
 * 专注射射减免（H7）
 * 条件：持有 focused_fire + 本回合放弃移动（forfeit_move_this_turn / 未移动）+ 远程攻击
 * 行为：1d6 → 1-4:+3 / 5-6:+5，直接并入 final_damage
 * 返回 { bonus, dice }
 */
function applyFocusedFire(caster, attackStat, manualDice) {
    const cfg = getSkillConfig('focused_fire');
    const enabled = unitHasSkill(caster, 'focused_fire') ||
        (cfg && caster && caster.skills && caster.skills['focused_fire']);
    if (!enabled) return { pct: 0, dice: 0 };
    if (attackStat !== 'ranged') return { pct: 0, dice: 0 };
    // 放弃移动：本回合未移动（has_moved=false/undefined）即视为专注
    if (caster.has_moved === true) return { pct: 0, dice: 0 };

    const dice = manualDice != null ? manualDice : DiceService.roll(6);
    const ranges = (cfg && cfg.dice_ranges) || [];
    let pct = 0;
    for (const r of ranges) {
        if (dice >= r.min && dice <= r.max) {
            pct = (r.bonus_pct != null) ? r.bonus_pct : (r.bonus_damage || 0);
            break;
        }
    }
    return { pct, dice };
}

/**
 * 唯一对外调用点：在 _executeAttackSkill 内联公式算出 final_damage 后调用。
 * @returns { damage, log:[...] }
 */
function applyDamageModifiers({ caster, target, damage, damageKind, attackStat, manualDice }) {
    const log = [];
    let dmg = damage;
    // 1) 抗性
    const res = applyResistance(target, dmg, damageKind);
    if (res.reduction > 0) {
        dmg = res.damage;
        log.push(`[resistance] 抗性减伤 -${res.reduction}（${damageKind}）`);
    }
    // 2) 专注射射（攻击方增益，最后加）
    const ff = applyFocusedFire(caster, attackStat, manualDice);
    if (ff.pct > 0) {
        dmg += Math.round(dmg * ff.pct);
        log.push(`[focused_fire] 专注射击 +${Math.round(dmg * ff.pct)}（骰点 ${ff.dice}）`);
    }
    return {
        damage: Math.max(0, dmg),
        log,
        focusedFireDice: ff.dice,
        resistanceReduction: res.reduction,
        focusedFirePct: ff.pct,
        focusedFireBonus: Math.round(dmg * ff.pct),
    };
}

module.exports = {
    getUnitResistance,
    applyResistance,
    applyFocusedFire,
    unitHasSkill,
    applyDamageModifiers,
};
