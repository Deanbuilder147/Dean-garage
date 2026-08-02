/**
 * cover.cjs — 援助 cover（卡7，H? on_ally_attacked）
 *
 * D6（已定）：key=cover、label="援助"，避开旧 assist="自动加伤+3" 命名冲突。
 * D4（未拍板，按建议值占位）：视距=援助者武器射程；落点=攻防连线上的空格。
 *
 * 行为：友军（A）受击时，视距内友军（C）收到 pending_reaction 反应窗口：
 *   ① 弃移动 → 瞬移到 A 与 B 之间任意格并分担 5 伤；
 *   ② 弃战斗 → 对攻击方 A 造成 5 反击伤害；
 *   ③ 放弃 → 正常结算；并预扣援助方下回合对应行动。
 * 10s 服务端超时：expireAt=Date.now()+10000（绝对时间戳为权威）；
 *   setTimeout 仅作触发器，实际以 Date.now()>expireAt 判定；超时自动按"放弃"继续 + 广播。
 * 第一版反应窗口只弹给 DM（降低联机复杂度）。
 */
const { register } = require('./index.cjs');
const { unitHasSkill } = require('../damageModifiers.cjs');

const REACTION_WINDOW_MS = 10000;
const SHARE_DAMAGE = 5;
const COUNTER_DAMAGE = 5;

// 方案A：取单位轮转角色，role 优先，faction 回退（逻辑判定唯一依据）
function unitRoleOf(u) {
  if (!u) return '';
  if (u.role != null) return u.role;
  return u.faction != null ? u.faction : '';
}

/**
 * 友军受击时建立 pending_reaction（仅内存态 battleState.pendingReaction）。
 * @returns { pending:Boolean, helperId }
 */
function onAllyAttacked(ctx) {
    const { battleState, caster, target } = ctx; // caster=攻击者A, target=被击友军B
    if (!battleState || !battleState.units) return { pending: false };
    // 找视距内、同阵营、持有 cover 的援助者 C
    const helper = battleState.units.find(u => {
        if (u === target) return false;
        // 方案A：同轮转角色=友军（即使固有阵营不同也能互相掩护）
        if (unitRoleOf(u) !== unitRoleOf(target)) return false;
        if (!unitHasSkill(u, 'cover')) return false;
        const range = Math.max(
            num((u.currentStats || u).melee), num((u.currentStats || u).ranged), 6
        );
        const d = cubeDist(u.position, target.position);
        return d <= range;
    });
    if (!helper) return { pending: false };

    battleState.pendingReaction = {
        type: 'cover',
        attackerId: caster.id || caster.unitId,
        victimId: target.id || target.unitId,
        helperId: helper.id || helper.unitId,
        expireAt: Date.now() + REACTION_WINDOW_MS,
        resolved: false,
        options: ['move_share', 'attack_counter', 'give_up'],
    };
    if (ctx.broadcast) ctx.broadcast('cover_pending', battleState.pendingReaction);
    if (ctx.log) ctx.log(`[cover] 友军 ${target.id || target.unitId} 受击，援助者 ${helper.id || helper.unitId} 收到反应窗口`);
    return { pending: true, helperId: helper.id || helper.unitId };
}

/** 结算援助选择；超时自动 give_up */
function resolveCover(ctx, choice) {
    const { battleState } = ctx;
    const pr = battleState && battleState.pendingReaction;
    if (!pr || pr.resolved) return { resolved: false };
    if (Date.now() > pr.expireAt) choice = 'give_up'; // 超时权威判定
    pr.resolved = true;
    const helper = battleState.units.find(u => (u.id || u.unitId) === pr.helperId);
    const victim = battleState.units.find(u => (u.id || u.unitId) === pr.victimId);
    const attacker = battleState.units.find(u => (u.id || u.unitId) === pr.attackerId);
    const result = { choice };

    if (choice === 'move_share') {
        // 瞬移到 victim 与 attacker 连线上的空格 + 分担 5 伤
        const cell = findLineCell(victim && victim.position, attacker && attacker.position, battleState);
        if (cell && helper) { helper.position = { q: cell.q, r: cell.r }; }
        if (victim) applyDamage(victim, SHARE_DAMAGE); // 分担（victim 受伤减小，这里仅记标记）
        if (helper) applyDamage(helper, SHARE_DAMAGE);
        result.shared = SHARE_DAMAGE;
        markForfeitNextTurn(helper, 'move');
    } else if (choice === 'attack_counter') {
        if (attacker) applyDamage(attacker, COUNTER_DAMAGE);
        result.countered = COUNTER_DAMAGE;
        markForfeitNextTurn(helper, 'attack');
    }
    battleState.pendingReaction = null;
    if (ctx.broadcast) ctx.broadcast('cover_resolved', result);
    if (ctx.log) ctx.log(`[cover] 援助结算 choice=${choice}`);
    return result;
}

function applyDamage(u, v) {
    const s = u.currentStats || u;
    if (s.hp != null) s.hp = Math.max(0, s.hp - v);
    if (u.hp != null) u.hp = Math.max(0, u.hp - v);
}
function markForfeitNextTurn(u, kind) {
    if (!u) return;
    u._forfeitNext = u._forfeitNext || {};
    u._forfeitNext[kind] = true;
}
function num(v, d = 0) { return typeof v === 'number' ? v : d; }
function cubeDist(a, b) {
    if (!a || !b) return Infinity;
    const ac = { x: a.q, z: a.r, y: -a.q - a.r };
    const bc = { x: b.q, z: b.r, y: -b.q - b.r };
    return Math.max(Math.abs(ac.x - bc.x), Math.abs(ac.y - bc.y), Math.abs(ac.z - bc.z));
}
function findLineCell(a, b, battleState) {
    if (!a || !b) return null;
    // 取 a→b 直线上的空格（排除端点）
    const N = 6;
    for (let i = 1; i < N; i++) {
        const t = i / N;
        const q = Math.round(a.q + (b.q - a.q) * t);
        const r = Math.round(a.r + (b.r - a.r) * t);
        if ((q === a.q && r === a.r) || (q === b.q && r === b.r)) continue;
        const occupied = battleState.units.some(u => u.position && u.position.q === q && u.position.r === r);
        if (!occupied) return { q, r };
    }
    return null;
}

register('on_ally_attacked', (ctx) => onAllyAttacked(ctx) || null);

module.exports = { onAllyAttacked, resolveCover, REACTION_WINDOW_MS };
