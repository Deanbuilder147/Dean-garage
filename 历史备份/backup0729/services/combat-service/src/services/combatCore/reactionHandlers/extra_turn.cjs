/**
 * extra_turn.cjs — 再动 reactivate（卡6，H2 on_kill）
 *
 * 触发：击杀敌军（target.hp===0）且攻击方持有 reactivate。
 * 行为：攻击者 AP 立即重置（MOVE+ATTACK 各发还），打 _lastReactivationRound 标记；
 *   同 round 内再次击杀不再触发（no_consecutive）。
 * 依赖 turnManager 最小侵入：combat.ts /end-turn 调用 turnManager.nextTurn 时
 *   优先判断 currentUnit.extraTurn===true → 重置 actionPoints + 跳过队列切换。
 */
const { register } = require('./index.cjs');
const { unitHasSkill } = require('../damageModifiers.cjs');

register('on_kill', (ctx) => {
    const { caster, battleState } = ctx;
    if (!unitHasSkill(caster, 'reactivate')) return null;
    const round = ctx.round != null ? ctx.round : (battleState && battleState.round);
    if (caster._lastReactivationRound === round) return null; // no_consecutive
    caster._lastReactivationRound = round;

    const st = caster.currentStats || caster;
    if (st.maxMovePoints != null) st.movePoints = st.maxMovePoints;
    if (st.maxActionPoints != null) st.actionPoints = st.maxActionPoints;
    else st.actionPoints = 1;

    caster.extraTurn = true;
    caster.reactivatedRound = round;
    if (ctx.log) ctx.log('[reactivate] 再动！AP 已重置，本回合可再次行动');
    if (ctx.broadcast) ctx.broadcast('reactivate', { unitId: caster.id || caster.unitId });
    return { reactivated: true };
});
