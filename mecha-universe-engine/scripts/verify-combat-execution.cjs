/**
 * verify-combat-execution.cjs
 * P1：战斗真实执行层断言 —— 专门防止"契约通过、执行空壳"误判复发。
 *
 * 不依赖 HTTP/前端，直接 require 线上引擎模块，构造最小 context，
 * 断言 9 条存量技能触发后 unit.statusEffects / unit._meta.stat_modifiers 是否真实物理改变。
 *
 * 运行：node scripts/verify-combat-execution.cjs
 */
const path = require('path');
const executor = require('../services/combat-service/src/services/combatCore/effectExecutor.cjs');

let pass = 0, fail = 0;
function assert(cond, name, detail) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}  ${detail || ''}`); }
}

function makeUnit(id, stats) {
  return {
    id,
    _meta: { stat_modifiers: {} },
    statusEffects: [],
    hp: 100,
    current_hp: 100,
    max_hp: 100,
    currentStats: Object.assign({}, stats),
  };
}

async function run() {
  const executorInst = executor;

  // 载入存储 A 的 9 条技能
  const cfg = require('../services/combat-service/src/config/glossary-skill-config.json');
  const skills = cfg.skills || {};
  const keys = Object.keys(skills);
  console.log(`\n[载入] 存储 A 技能条数 = ${keys.length} (${keys.join(', ')})\n`);

  let testedStatus = 0, testedDamage = 0;

  for (const key of keys) {
    const skill = skills[key];
    const effects = Array.isArray(skill.effects) ? skill.effects : [];
    if (effects.length === 0) {
      console.log(`— ${key}: 无 effects，跳过`);
      continue;
    }
    const caster = makeUnit('caster', { MELEE: 10, HP: 100 });
    const target = makeUnit('target', { MELEE: 8, HP: 100 });
    const context = { unit: caster, target, skillType: key };

    const beforeStatus = JSON.stringify(caster.statusEffects) + JSON.stringify(target.statusEffects);
    const beforeMeta = JSON.stringify(caster._meta.stat_modifiers) + JSON.stringify(target._meta.stat_modifiers);
    const beforeHp = (caster.current_hp ?? caster.hp) + '|' + (target.current_hp ?? target.hp);

    const results = await executor.execute(effects, context);

    const afterStatus = JSON.stringify(caster.statusEffects) + JSON.stringify(target.statusEffects);
    const afterMeta = JSON.stringify(caster._meta.stat_modifiers) + JSON.stringify(target._meta.stat_modifiers);
    const afterHp = (caster.current_hp ?? caster.hp) + '|' + (target.current_hp ?? target.hp);

    const anyUnknown = results.some(r => r.reason === 'unknown_effect_type');
    const physicallyChanged = (beforeStatus !== afterStatus) || (beforeMeta !== afterMeta) || (beforeHp !== afterHp);

    const types = effects.map(e => e.type).join(',');
    if (types.includes('status')) testedStatus++;
    if (types.includes('damage')) testedDamage++;

    console.log(`— ${key} [${types}]`);
    assert(!anyUnknown, `  ${key}: 无 unknown_effect_type`, `results=${JSON.stringify(results)}`);
    assert(physicallyChanged, `  ${key}: 真实产出物理改变`, `status/meta 前后一致=未生效`);
  }

  console.log(`\n[统计] status 型技能 ${testedStatus} 条, damage 型技能 ${testedDamage} 条`);
  console.log(`\n========== 战斗真实执行断言结果 ==========`);
  console.log(`通过: ${pass}  失败: ${fail}`);
  if (fail > 0) {
    console.log('❌ 存在执行空壳，需修复');
    process.exit(1);
  } else {
    console.log('✅ 全部存量技能在真实管道中已物理生效（契约≠执行 的误判已被拦截）');
    process.exit(0);
  }
}

run().catch(e => { console.error('FATAL', e); process.exit(2); });
