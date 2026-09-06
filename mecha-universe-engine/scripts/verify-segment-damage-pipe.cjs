/**
 * 阶段二 C 验证：Segment 伤害接入主伤害管线 (DamagePipe) 汇流
 * 运行：node scripts/verify-segment-damage-pipe.cjs
 *
 * 验证点：
 *  1. sweep dice=2（SINGLE_ENEMY/override/flat_value:-2）→ 单体扣 2，segmentDamage=2
 *  2. sweep dice=5（AREA_ENEMY/override/flat_value:-6/split equal）→ 三敌各扣 2，segmentDamage=6
 *  3. 高减伤：defender 带 armor/defense，Segment 伤害经 DamagePipe 真实减伤（final < raw）
 *  4. 暴击：DiceService.checkCrit 强制 true + critMult 固定，Segment 伤害被放大
 *  5. bonus 模式：attack 谓语主伤害 + Segment bonus 伤害正确叠加
 */
const path = require('path');
const SkillExecutor = require('../services/combat-service/src/services/combatCore/skillExecutor.cjs');
const DiceService = require('../services/combat-service/src/services/combatCore/diceService.cjs');
const { splitDamageAmongTargets } = require('../services/combat-service/src/services/combatCore/damagePipe.cjs');

const cfgPath = path.join(__dirname, '..', 'services', 'combat-service', 'src', 'config', 'glossary-skill-config.json');
const glossary = JSON.parse(require('fs').readFileSync(cfgPath, 'utf8'));
const SWEEP = glossary.skills.sweep;

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${extra ? JSON.stringify(extra) : ''}`); }
};

function baseUnit(id, over = {}) {
  return Object.assign({
    id, q: 0, r: 0, faction: 'earth', role: 'attack',
    maxHp: 100, hp: 100, attack: 10, armor: 0, defense: 0, mobility: 0, statusEffects: [], skills: []
  }, over);
}
function enemy(id, q, over = {}) {
  return Object.assign({
    id, q, r: 0, faction: 'maxion', role: 'defense',
    maxHp: 20, hp: 20, attack: 5, armor: 0, defense: 0, mobility: 0, statusEffects: [], skills: []
  }, over);
}

const run = (skillDef, dice, caster, targets, allUnits, extraCtx = {}) => {
  const exec = new SkillExecutor();
  const context = { allUnits: allUnits || [caster, ...targets], battleState: { terrainDefs: {} }, ...extraCtx };
  // 强制骰子值
  const origRoll = DiceService.roll;
  DiceService.roll = () => dice;
  let res;
  try { res = exec.executeUniversalSkill(skillDef.id || 'sweep', caster, targets[0], context, skillDef); }
  finally { DiceService.roll = origRoll; }
  return res;
};

console.log('\n=== 阶段二 C 验证 ===');

// 1. 单体 override
{
  const c = baseUnit('caster');
  const e = enemy('e1', 1);
  const r = run(SWEEP, 2, c, [e]);
  ok('case1 单体 override: segmentDamage=2', r.segmentDamage === 2, r);
  ok('case1 单体 override: finalDamage=2', r.finalDamage === 2, r);
  ok('case1 单体 override: 目标扣 2', e.hp === 18, { hp: e.hp });
  ok('case1 单体 override: damage_mode=override', r.damage_mode === 'override', r);
}

// 2. 范围均摊 override
{
  const c = baseUnit('caster');
  const e1 = enemy('e1', 1), e2 = enemy('e2', 2), e3 = enemy('e3', 3);
  const r = run(SWEEP, 5, c, [e1, e2, e3]);
  ok('case2 范围 override: segmentDamage=6', r.segmentDamage === 6, r);
  ok('case2 范围 override: 各目标扣 2', e1.hp === 18 && e2.hp === 18 && e3.hp === 18, { e1: e1.hp, e2: e2.hp, e3: e3.hp });
  ok('case2 范围 override: finalDamage=6', r.finalDamage === 6, r);
}

// 3. 高减伤：defender 带 armor+defense，经 DamagePipe 真实减伤
{
  const c = baseUnit('caster');
  const e = enemy('e1', 1, { armor: 5, defense: 3 });
  const r = run(SWEEP, 2, c, [e]);
  // raw=2，DamagePipe：baseAttack=2（覆盖），减伤 armorReduction+defense 会吃掉部分 → final < 2（最低 GUARANTEED_DAMAGE=1）
  ok('case3 高减伤: 伤害被减免 (hp>18 即扣<2)', e.hp > 18 && e.hp <= 19, { hp: e.hp, seg: r.segmentDamage });
  ok('case3 高减伤: segmentDamage 反映真实减伤 (<2)', r.segmentDamage >= 1 && r.segmentDamage <= 2, { seg: r.segmentDamage });
}

// 4. 暴击放大：allow_crit:true 的 Segment 固定伤害应经 DamagePipe 真实暴击倍率放大。
//   ★ 约束：DiceService.config 是 getter（实时合并 glossary.dice），且 checkCrit 用解构引用，
//     无法在本地单测中覆盖 critThreshold/critMin；故采用「对照实验」而非硬编码 ×2：
//     - 让 DiceService.roll 固定返回 6（≥ 默认 critThreshold=5 → 真实暴击必然触发）；
//     - 对照 A：allow_crit:true（suppressCrit=false）→ 伤害被 crit 倍率放大（> base）；
//     - 对照 B：无 allow_crit（suppressCrit=true）→ 同 base 不放大。
{
  const damagePipe = require('../services/combat-service/src/services/combatCore/damagePipe.cjs');
  const c = baseUnit('caster');
  const e = enemy('e1', 1);
  const origRoll = DiceService.roll;
  DiceService.roll = () => 6; // 强制 checkCrit() = (6 >= 5) = true
  const base = 10; // 用较大基数，避免 floor(base*critMult) 因取整回退（如 2*1.13→floor=2 无差异）
  const cfgA = { attacker: c, defender: e, attack_type: 'melee', damage_kind: 'kinetic', baseDamage: base, terrainDefs: {}, armor_pen: 0, suppressCrit: false };
  const cfgB = { ...cfgA, suppressCrit: true };
  const outA = damagePipe.calculate(cfgA);
  const outB = damagePipe.calculate(cfgB);
  DiceService.roll = origRoll;
  ok('case4 暴击: allow_crit 路径触发 crit (is_crit=true)', outA.is_crit === true, outA);
  ok('case4 暴击: crit 倍率 >1 且放大伤害 (A.final > B.final)', outA.is_crit && outA.crit_multiplier > 1 && outA.final_damage > outB.final_damage, { a: outA, b: outB });
  ok('case4 暴击: 抑制路径不暴击 (B.is_crit=false)', outB.is_crit === false, outB);

  // 端到端：allow_crit:true 的 Segment 词条经 run() 汇流后，segmentDamage 应反映 crit 放大（> base 2）
  const skillCrit = {
    id: 'test_crit', name: '测试暴击', action_type: 'passive', base_damage: 0,
    __segment_model__: true,
    roll: { dice_type: '1d6', segments: [{ lower: 1, upper: 6, label: 'crit段',
      effects: [{ type: 'damage', flat_value: -10, target_scope: 'SINGLE_ENEMY', damage_mode: 'override', split_mode: 'none', allow_crit: true }] }] },
  };
  const c2 = baseUnit('caster');
  const e2 = enemy('e1', 1);
  // 经 run() 传入 dice=6（run 内部把 DiceService.roll 覆盖为返回 6，使真实 checkCrit 6>=5 触发暴击）
  const r = run(skillCrit, 6, c2, [e2]);
  ok('case4 暴击: 端到端 Segment allow_crit 伤害被放大 (>10)', r.segmentDamage > 10, { seg: r.segmentDamage });
}

// 5. bonus 模式：attack 谓语主伤害 + Segment bonus 叠加
{
  // 构造一个 attack 谓语、带 base_damage、且 Segment 内 damage_mode:'bonus' 的词条
  const skill = {
    id: 'test_bonus', name: '测试叠加', action_type: 'attack', base_damage: 5,
    roll: { dice_type: '1d6', segments: [{ lower: 1, upper: 6, label: 'bonus段',
      effects: [{ type: 'damage', flat_value: -3, target_scope: 'SINGLE_ENEMY', damage_mode: 'bonus', split_mode: 'none' }] }] },
  };
  const c = baseUnit('caster');
  const e = enemy('e1', 1, { defense: 0, armor: 0 });
  const r = run(skill, 3, c, [e]);
  // predicateDamage 来自 attack 谓语（base_damage=5 → 走简化公式 final≈5+height0），segTotal=3(override?否→bonus) → final=5+3=8 左右
  ok('case5 bonus: damage_mode=bonus', r.damage_mode === 'bonus', r);
  ok('case5 bonus: finalDamage = predicate+segTotal', Math.abs((r.predicateDamage + r.segmentDamage) - r.finalDamage) < 0.001, { p: r.predicateDamage, s: r.segmentDamage, f: r.finalDamage });
  // 注：谓语主伤害由网关层据 result.final_damage 扣血（引擎内仅 Segment 直接改 target.hp），
  //     故此处验证汇流后的 finalDamage 数值正确性（应 >5，含主伤+叠加）。
  ok('case5 bonus: 汇流 finalDamage > 5 (主伤+叠加)', r.finalDamage > 5, { f: r.finalDamage });
}

console.log(`\n=== 结果: ${pass} 通过 / ${fail} 失败 ===`);
process.exit(fail ? 1 : 0);
