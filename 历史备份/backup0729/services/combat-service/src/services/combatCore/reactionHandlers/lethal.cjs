/**
 * lethal.cjs — 斩杀 execute（卡1，H2 post_melee_damage）
 *
 * 触发：近战伤害结算后，目标 HP 落入 (0,5) 且攻击方持有 execute。
 * 行为：掷 1d6，点数 > 目标剩余 HP → 即时斩杀（HP=0）。
 *   D1（已拍板以表格为准）：扁平阈值 condition_value:5 + roll_gt_target_hp，
 *   废弃旧 JSON 的 hp_threshold_percent:10 无骰子模型。
 */
const { register } = require('./index.cjs');
const { unitHasSkill } = require('../damageModifiers.cjs');

function rollD6(manual) { return manual != null ? manual : (1 + Math.floor(Math.random() * 6)); }
function getHp(u) { return u == null ? null : (u.hp != null ? u.hp : (u.currentStats && u.currentStats.hp)); }
function setHp(u, v) {
    if (!u) return;
    if (u.currentStats) u.currentStats.hp = v;
    u.hp = v;
}

register('post_melee_damage', (ctx) => {
    const { caster, target, attackStat, dice } = ctx;
    if (attackStat && attackStat !== 'melee') return null;
    if (!unitHasSkill(caster, 'execute')) return null;
    const hp = getHp(target);
    if (hp == null || hp <= 0 || hp >= 5) return null;

    const roll = rollD6(dice);
    const success = roll > hp;
    if (success) {
        setHp(target, 0);
        if (ctx.log) ctx.log(`[execute] 斩杀成功！目标 HP=${hp}，掷骰=${roll} > ${hp}`);
        if (ctx.broadcast) ctx.broadcast('execute_lethal', { targetId: target.id || target.unitId, roll, hp });
        return { killed: true, killConfirmed: true, lethalRoll: roll };
    }
    if (ctx.log) ctx.log(`[execute] 斩杀失败，目标 HP=${hp}，掷骰=${roll} 未超过`);
    return { lethalRoll: roll, success: false };
});
