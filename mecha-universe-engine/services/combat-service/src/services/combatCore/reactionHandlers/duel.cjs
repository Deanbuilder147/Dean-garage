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

// 注意：on_target_selected 已不再在此注册（批次1·1.1 解耦）。
// 该触发器现由 generic_target_select.cjs 注册为通用预检；duel 仍由本文件的
// duelCheck 在决斗预检端点被直接调用驱动，互不污染。
// ★ Phase 7.3：删除了此前残留的 register('on_target_selected', ...)（第74-77行），
//   该残留与 generic_target_select 抢同一 trigger（last-wins 顺序不确定 → 确定性 bug）。
//   现 on_target_selected 仅由 generic_target_select 注册，duel 预检经 duelCheck 单独驱动。
module.exports = { duelCheck, resolveDuel, cubeDist, axialToCube };
