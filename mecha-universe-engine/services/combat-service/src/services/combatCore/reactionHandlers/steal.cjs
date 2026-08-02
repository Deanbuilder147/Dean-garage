/**
 * steal.cjs — 抢夺 snatch（卡3，H3 on_damage_dealt）
 *
 * 触发：本次伤害 > 被攻击者最佳/主手武器攻击值，且攻击方持有 snatch。
 * 行为（两段式）：
 *   1) on_damage_dealt 返回 canSnatch + 目标武器信息，由战斗路由暂存 offer；
 *   2) 攻击方选择接受后调用 resolveSnatch → 掷 1d6：<4 失败；>=4 本次伤害减半(向下取整)+获得该武器。
 * 三层同步（仅内存态 battleState，禁止回写整备室/仓库）：
 *   A 扁平 right_hand_* / B 嵌套 equipment.right_hand / C equipState 数组。
 * 徒手占位符：防御方扁平 right_hand_type:null 清空加成，但 equipment.right_hand 绝不传 null，
 *   给纯净对象 { type:'unarmed', attack:unit.melee, damage_kind_modifiers:{kinetic:0,beam:0} }。
 */
const { register } = require('./index.cjs');
const { unitHasSkill } = require('../damageModifiers.cjs');

function num(v, d = 0) { return typeof v === 'number' ? v : d; }

function getBestWeaponAttack(unit) {
    if (!unit) return 0;
    const eq = unit.equipment || {};
    const cand = [
        eq.right_hand && num(eq.right_hand.attack),
        eq.left_hand && num(eq.left_hand.attack),
        num(unit.right_hand_melee), num(unit.right_hand_ranged),
        num(unit.melee), num(unit.ranged),
    ].filter(v => v > 0);
    return cand.length ? Math.max(...cand) : 0;
}

/** 取目标主手武器对象（用于抢夺） */
function getTargetWeapon(unit) {
    if (!unit) return null;
    const eq = unit.equipment || {};
    return eq.right_hand || null;
}

register('on_damage_dealt', (ctx) => {
    const { caster, target, damage } = ctx;
    if (!unitHasSkill(caster, 'snatch')) return null;
    const best = getBestWeaponAttack(target);
    if (damage <= best) return null;
    return {
        canSnatch: true,
        bestWeaponAttack: best,
        targetWeapon: getTargetWeapon(target),
    };
});

/**
 * 第 2 段：攻击方接受抢夺后调用。
 * @returns { success, halvedDamage, stolenWeapon }
 */
function resolveSnatch(ctx, rawDamage) {
    const { caster, target } = ctx;
    if (!unitHasSkill(caster, 'snatch')) return { success: false };
    const roll = ctx.dice != null ? ctx.dice : (1 + Math.floor(Math.random() * 6));
    if (roll < 4) {
        if (ctx.log) ctx.log(`[snatch] 抢夺失败，掷骰=${roll} < 4`);
        return { success: false, roll };
    }
    const halved = Math.floor(rawDamage / 2);
    const stolen = getTargetWeapon(target);
    // 三层同步（内存态）
    if (stolen) {
        // B 嵌套 equipment
        if (!caster.equipment) caster.equipment = {};
        caster.equipment.right_hand = JSON.parse(JSON.stringify(stolen));
        // A 扁平
        caster.right_hand_type = stolen.type || null;
        caster.right_hand_melee = num(stolen.attack);
        caster.right_hand_ranged = num(stolen.attack);
        // C equipState（前端展示）
        if (!Array.isArray(caster.equipState)) caster.equipState = [];
        caster.equipState = caster.equipState.filter(e => !(e && e.slot === 'right_hand'));
        caster.equipState.push({ slot: 'right_hand', ...stolen });
        // 徒手占位符：防御方扁平清空，但 equipment 绝不传 null
        if (target.equipment) {
            target.right_hand_type = null;
            target.right_hand_melee = 0;
            target.right_hand_ranged = 0;
            target.equipment.right_hand = {
                type: 'unarmed',
                attack: num(target.melee),
                damage_kind_modifiers: { kinetic: 0, beam: 0 },
            };
        }
    }
    if (ctx.log) ctx.log(`[snatch] 抢夺成功！掷骰=${roll}>=4，伤害减半 ${rawDamage}→${halved}，获得武器`);
    if (ctx.broadcast) ctx.broadcast('snatch', { by: caster.id || caster.unitId, from: target.id || target.unitId });
    return { success: true, roll, halvedDamage: halved, stolenWeapon: stolen };
}

module.exports = { getBestWeaponAttack, getTargetWeapon, resolveSnatch };
