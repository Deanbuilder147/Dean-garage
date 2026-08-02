/**
 * lucky_roll.cjs — 幸运 lucky（卡5，H5 on_unit_turn_start）
 *
 * 依赖：单位拾取空投后获得「空投增益」标记（unit._airdropBuff），且持有 lucky。
 * 行为：单位回合开始掷 1d6：
 *   1-2 → effect:"skip_attack"（跳过攻击）
 *   3-4 → effect:"allow_attack"（可攻击）
 *   5-6 → effect:"extra_move_and_attack"（再次移动并攻击）
 * 返回 effect 供前端启用/禁用行动按钮。
 */
const { register } = require('./index.cjs');
const { unitHasSkill } = require('../damageModifiers.cjs');

function rollD6(manual) { return manual != null ? manual : (1 + Math.floor(Math.random() * 6)); }

register('on_unit_turn_start', (ctx) => {
    const { caster, dice } = ctx;
    if (!unitHasSkill(caster, 'lucky')) return null;
    if (!caster._airdropBuff) return null; // 未获得空投增益不触发
    const roll = rollD6(dice);
    let effect;
    if (roll <= 2) effect = 'skip_attack';
    else if (roll <= 4) effect = 'allow_attack';
    else effect = 'extra_move_and_attack';
    caster._luckyEffect = effect;
    caster._luckyRoll = roll;
    if (ctx.log) ctx.log(`[lucky] 幸运掷骰=${roll} → ${effect}`);
    if (ctx.broadcast) ctx.broadcast('lucky_roll', { unitId: caster.id || caster.unitId, roll, effect });
    return { effect, roll };
});
