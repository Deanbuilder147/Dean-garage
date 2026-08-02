/**
 * duel.cjs — 决斗 duel（卡2，H1 on_target_selected 预检 + 结算）
 *
 * D2（建议值，未拍板前按"替代"占位）：决斗替代本次普通攻击。
 * 触发条件：双方互在对方武器射程内 + 双方 HP 均低于对方 max(格斗,射击)。
 * 行为：双方各掷 1d6，大者胜；同点同归于尽（draw_result:"both_die"）。
 * 旧 executeDuel 无骰子、按属性定胜负、写死距离<=1 —— 此处按表格重写。
 */
const { register } = require('./index.cjs');
const { unitHasSkill } = require('../damageModifiers.cjs');

function rollD6(manual) { return manual != null ? manual : (1 + Math.floor(Math.random() * 6)); }

function statOf(u) {
    const s = u.currentStats || u;
    return {
        hp: num(s.hp),
        melee: num(s.melee),
        ranged: num(s.ranged),
        maxMelee: num(s.maxMelee),
        maxRanged: num(s.maxRanged),
    };
}
function num(v, d = 0) { return typeof v === 'number' ? v : d; }

/** 轴向坐标 → 立方距离（与前端 hexUtils 同口径） */
function cubeDist(a, b) {
    if (!a || !b) return Infinity;
    const ac = axialToCube(a.q, a.r), bc = axialToCube(b.q, b.r);
    return Math.max(Math.abs(ac.x - bc.x), Math.abs(ac.y - bc.y), Math.abs(ac.z - bc.z));
}
function axialToCube(q, r) { return { x: q, z: r, y: -q - r }; }

/** 预检：返回 { canDuel, reason? } */
function duelCheck(caster, target) {
    if (!unitHasSkill(caster, 'duel')) return { canDuel: false, reason: 'no_skill' };
    const c = statOf(caster), t = statOf(target);
    const cRange = Math.max(c.melee, c.ranged);
    const tRange = Math.max(t.melee, t.ranged);
    const d = cubeDist(caster.position, target.position);
    if (d > cRange || d > tRange) return { canDuel: false, reason: 'out_of_range' };
    const cMax = Math.max(c.maxMelee || c.melee, c.maxRanged || c.ranged);
    const tMax = Math.max(t.maxMelee || t.melee, t.maxRanged || t.ranged);
    if (c.hp >= cMax || t.hp >= tMax) return { canDuel: false, reason: 'hp_not_below' };
    return { canDuel: true };
}

/** 结算：双方掷骰比大小 */
function resolveDuel(ctx, manualCaster, manualTarget) {
    const { caster, target } = ctx;
    const rc = rollD6(manualCaster);
    const rt = rollD6(manualTarget);
    let outcome;
    if (rc > rt) outcome = 'attacker_win';
    else if (rt > rc) outcome = 'defender_win';
    else outcome = 'both_die';

    if (outcome === 'attacker_win') {
        if (target.currentStats) target.currentStats.hp = 0;
        target.hp = 0;
    } else if (outcome === 'defender_win') {
        if (caster.currentStats) caster.currentStats.hp = 0;
        caster.hp = 0;
    } else {
        if (target.currentStats) target.currentStats.hp = 0;
        if (caster.currentStats) caster.currentStats.hp = 0;
        target.hp = 0; caster.hp = 0;
    }
    if (ctx.log) ctx.log(`[duel] 决斗：${rc} vs ${rt} → ${outcome}`);
    if (ctx.broadcast) ctx.broadcast('duel', { rc, rt, outcome });
    return { outcome, casterRoll: rc, targetRoll: rt };
}

register('on_target_selected', (ctx) => {
    const { caster, target } = ctx;
    return duelCheck(caster, target);
});

module.exports = { duelCheck, resolveDuel, cubeDist, axialToCube };
