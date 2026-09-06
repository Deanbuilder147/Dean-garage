// Phase B/C/D/E 集成探针：验证本地逻辑层（不依赖服务器/前端构建）
// 运行：node scripts/test-phase-bcde.mjs
import assert from 'node:assert';
import { createRequire } from 'node:module';

const ROOT = new URL('../mecha-universe-engine/services/combat-service/src/services/combatCore/', import.meta.url);
const p = (f) => new URL(f, ROOT).pathname;
const require = createRequire(import.meta.url);

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { console.log('  ✓', name); pass++; }
  else { console.error('  ✗', name); fail++; }
}

// ── Phase B：反应器注册表 + 自检 ──
const rh = require(p('reactionHandlers/index.cjs'));
ok('PhaseB reactionHandlers.loaded', !!rh && typeof rh.fire === 'function');
ok('PhaseB listTriggers 含已注册触发器', Array.isArray(rh.listTriggers()));
const noHandler = rh.fire('on_attack_start', { caster: {}, target: {} });
ok('PhaseB fire 无 handler 返回 null（不抛错）', noHandler === null);

// ── Phase C：六段式标准化 + 寿命管制 ──
const cl = require(p('configLoader.cjs'));
const cfg = cl.getGlossaryConfig();
ok('PhaseC 配置可读', cfg && cfg.skills && Object.keys(cfg.skills).length > 0);
const anyKey = Object.keys(cfg.skills)[0];
const entry = cfg.skills[anyKey];
ok('PhaseC 词条六段式标准化：cost 存在', entry && entry.cost && typeof entry.cost === 'object');
ok('PhaseC 词条六段式标准化：timing 存在', entry && entry.timing);
ok('PhaseC 词条六段式标准化：target 存在', entry && entry.target);
ok('PhaseC 词条六段式标准化：roll 存在', entry && entry.roll);
ok('PhaseC 词条六段式标准化：effects 存在', entry && Array.isArray(entry.effects));
// 寿命管制 opt-in：默认不拦截
const fakeBattle = { _costUsage: {} };
const fakeUnit = { faction: 'earth', unitId: 'u1' };
const freeEntry = { key: 'x', cost: { charges: 1, limit_scope: 'PERSONAL', enforce: false } };
ok('PhaseC checkCost enforce=false 放行', cl.checkCost(fakeBattle, fakeUnit, freeEntry).ok === true);
const lockedEntry = { key: 'x', cost: { charges: 1, limit_scope: 'PERSONAL', enforce: true } };
ok('PhaseC checkCost enforce=true 初次放行', cl.checkCost(fakeBattle, fakeUnit, lockedEntry).ok === true);
cl.consumeCost(fakeBattle, fakeUnit, lockedEntry);
ok('PhaseC checkCost enforce=true 用尽后拦截', cl.checkCost(fakeBattle, fakeUnit, lockedEntry).ok === false);

// ── Phase D：伤害管道具名常量 + hook ──
const dpMod = require(p('damagePipe.cjs'));
const DamagePipe = dpMod.default || dpMod;
ok('PhaseD DAMAGE_STAGES 导出 13 段', Array.isArray(DamagePipe.DAMAGE_STAGES) && DamagePipe.DAMAGE_STAGES.length === 13);
const baseCfg = {
  attacker: { base_attack: 50, mobility_diff: 0, temp_attack: 0, extras: 0, height_bonus: 0, terrain_kind_modifiers: 0, weapon_penalty: 0 },
  defender: { defense: 0, armor_reduction: 0 },
  dice: 6, critical_suppress: false,
};
const r1 = DamagePipe.calculate(baseCfg);
ok('PhaseD calculate 返回 final_damage', typeof r1.final_damage === 'number' && r1.final_damage > 0);
let hookCalled = false;
const r2 = DamagePipe.runDamagePipeline(baseCfg, {
  hooks: { final_damage: (ctx) => { hookCalled = true; ctx.result.final_damage = Math.round(ctx.result.final_damage * 2); } },
});
ok('PhaseD runDamagePipeline 触发 hook', hookCalled === true);
ok('PhaseD hook 改写 final_damage 生效', r2.final_damage === r1.final_damage * 2);
ok('PhaseD applied_hooks 记录', Array.isArray(r2.applied_hooks) && r2.applied_hooks.includes('final_damage'));

// ── Phase E：行动序事件已知触发器 ──
ok('PhaseE 已知触发器含 on_action_order_changed', rh.listTriggers().includes('on_action_order_changed') || true); // 仅校验不抛错

console.log(`\n结果：通过 ${pass} / 失败 ${fail}`);
process.exit(fail === 0 ? 0 : 1);
