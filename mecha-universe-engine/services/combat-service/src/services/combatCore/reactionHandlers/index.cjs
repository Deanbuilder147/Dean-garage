/**
 * reactionHandlers/index.cjs — 反应钩子注册表与派发器（F 基础）
 *
 * 设计：实时 /attack / /end-turn / /move 路径在关键时机调用 fire(trigger, ctx)，
 * 由本注册表把事件分发给对应卡的处理函数。各卡处理函数位于独立文件
 * （lethal / extra_turn / steal / duel / airdrop_drop / lucky_roll / cover / zoc_block），
 * 互不冲突、零侵入主链路。
 *
 * 注意：module.exports 必须在 require 各 handler 之前完成（否则循环依赖时 handler
 * 拿到的 register 为 undefined）。因此先导出，再加载子文件。
 *
 * ctx 契约（所有 handler 共享）：
 *   {
 *     battleState,            // 整局战斗状态（可写内存态，禁止写库）
 *     caster, target,         // 攻击方 / 目标（已水合的执行体单位）
 *     damage, damageKind,     // 本次最终伤害 / 伤害种类
 *     attackStat,             // 'melee' | 'ranged'
 *     round,                  // 当前轮
 *     dice,                   // 可选人工骰覆盖
 *     log,                    // (msg)=>void 推送战斗日志
 *     broadcast,              // (event, payload)=>void WebSocket 广播
 *   }
 * handler 返回对象（字段按需，缺省忽略）：
 *   { killed, killConfirmed, reactivated, extraDamage, shareDamage, counterDamage,
 *     pendingReaction, consumedMove, moveForfeited, pickedItem, ... }
 */
const fs = require('fs');
const path = require('path');

const handlers = Object.create(null);

// Phase B：网关点火清单（由 combat.ts 启动时注入），用于启动自检。
// 任何 register 的 trigger 若不在该清单内 → 启动告警（防止再出现死代码旁路）。
let _gatewayKnownTriggers = null;

function setGatewayTriggers(known) {
    if (Array.isArray(known)) _gatewayKnownTriggers = new Set(known);
}

function register(trigger, fn) {
    handlers[trigger] = fn;
}

/** 派发：找不到 handler 返回 null；handler 抛错不污染主链路 */
function fire(trigger, ctx) {
    const fn = handlers[trigger];
    if (typeof fn !== 'function') {
        // Phase B：可观测——即使无 handler 也输出可观测日志（靶场验收用）
        if (process.env.COMBAT_REACTION_DEBUG === '1') {
            console.log(`[reactionHandlers] fire ${trigger} (no handler registered)`);
        }
        return null;
    }
    try {
        return fn(ctx) || null;
    } catch (e) {
        console.error(`[reactionHandlers] "${trigger}" 执行异常:`, e.message);
        return null;
    }
}

function listTriggers() {
    return Object.keys(handlers);
}

/** Phase B：启动自检——注册表内的 trigger 若不在网关点火清单，输出告警 */
function selfCheck() {
    if (!_gatewayKnownTriggers) return; // 未注入则不校验
    const unknown = listTriggers().filter((t) => !_gatewayKnownTriggers.has(t));
    if (unknown.length) {
        console.warn(`[reactionHandlers] 自检告警：以下已注册触发器不在网关点火清单内（疑似死代码旁路）: ${unknown.join(', ')}`);
    }
    const missing = Array.from(_gatewayKnownTriggers).filter((t) => !handlers[t]);
    if (missing.length) {
        console.warn(`[reactionHandlers] 自检提示：以下网关点火点尚无 handler 注册（待实装）: ${missing.join(', ')}`);
    }
}

// 必须先导出，再加载子文件（规避循环依赖下 register 为 undefined）
module.exports = { register, fire, listTriggers, setGatewayTriggers, selfCheck };

// 自动加载同目录所有 .cjs（除 index 自身），各自 require('./index') 后 register
for (const f of fs.readdirSync(__dirname)) {
    if (f === 'index.cjs' || !f.endsWith('.cjs')) continue;
    try {
        require('./' + f);
    } catch (e) {
        console.error(`[reactionHandlers] 加载 ${f} 失败:`, e.message);
    }
}

// 子文件全部加载完毕后执行启动自检
selfCheck();
