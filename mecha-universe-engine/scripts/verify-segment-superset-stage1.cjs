'use strict';
// 阶段一（A/B/B5/D/E/F）功能验证：直接调用引擎，证明 Segment 表达力扩展生效。
const path = require('path');
const EffectExecutor = require('../services/combat-service/src/services/combatCore/effectExecutor.cjs');
const DamagePipe = require('../services/combat-service/src/services/combatCore/damagePipe.cjs');
const BranchEvaluator = require('../services/combat-service/src/services/combatCore/branchEvaluator.cjs');

const ee = EffectExecutor; // 单例实例（模块导出实例）
let pass = 0, fail = 0;
function assert(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra !== undefined ? ' → ' + JSON.stringify(extra) : '')); }
}

const mk = (id, faction, hp) => ({ id, faction, hp, current_hp: hp, max_hp: hp });
const caster = mk('U1', 'earth', 100);
const enemies = [mk('E1', 'maxion', 50), mk('E2', 'maxion', 50), mk('E3', 'balon', 50)];
const allUnits = [caster, ...enemies];

async function main() {
  console.log('=== A/B：points 离散匹配（复用 BranchEvaluator.pointMatches / branchMatches）===');
  assert('pointMatches 离散点命中', BranchEvaluator.pointMatches(3, 3) === true);
  assert('pointMatches 离散点未命中', BranchEvaluator.pointMatches(3, 4) === false);
  // 数组外层由 branchMatches 遍历（每个元素 = number 或 [min,max] 区间）
  assert('branchMatches 离散数组命中', BranchEvaluator.branchMatches({ points: [1, 3, 5] }, 5) === true);
  assert('branchMatches 离散数组未命中', BranchEvaluator.branchMatches({ points: [1, 3, 5] }, 2) === false);
  assert('pointMatches 区间命中', BranchEvaluator.pointMatches([2, 4], 3) === true);

  console.log('=== D：target_scope 重定向（AREA_ENEMY / ALL_UNITS）===');
  let r1 = await ee.handleDirectDamage({ amount: 10, target_scope: 'SINGLE_ENEMY', target: 'target' }, { target: enemies[0], unit: caster, allUnits });
  assert('SINGLE_ENEMY 仅打单体', r1.targets.length === 1 && r1.targets[0].id === 'E1', r1.targets && r1.targets.map(t => t.id));
  let r2 = await ee.handleDirectDamage({ amount: 9, target_scope: 'AREA_ENEMY' }, { unit: caster, attacker: caster, allUnits });
  assert('AREA_ENEMY 打到 3 个敌方', r2.targets.length === 3, r2.targets.map(t => t.id));
  assert('AREA_ENEMY 不含施法者', !r2.targets.find(t => t.id === 'U1'));
  let r3 = await ee.handleDirectDamage({ amount: 9, target_scope: 'ALL_UNITS' }, { unit: caster, attacker: caster, allUnits });
  assert('ALL_UNITS 打到 3 个非施法者', r3.targets.length === 3, r3.targets.map(t => t.id));

  console.log('=== E：split_mode equal 均摊 ===');
  let r4 = await ee.handleDirectDamage({ amount: 10, target_scope: 'AREA_ENEMY', split_mode: 'equal' }, { unit: caster, attacker: caster, allUnits });
  assert('均摊总额守恒', r4.targets.reduce((s, t) => s + t.dealt, 0) === 10, r4.targets.map(t => t.dealt));
  assert('均摊地板分布 [4,3,3]', JSON.stringify(r4.targets.map(t => t.dealt).sort((a, b) => b - a)) === JSON.stringify([4, 3, 3]), r4.targets.map(t => t.dealt));
  assert('均摊余数给首个', r4.targets[0].dealt === 4, r4.targets[0].dealt);
  assert('splitDamageAmongTargets(10,3)', JSON.stringify(DamagePipe.splitDamageAmongTargets(10, 3)) === JSON.stringify([4, 3, 3]));
  assert('splitDamageAmongTargets(7,2)', JSON.stringify(DamagePipe.splitDamageAmongTargets(7, 2)) === JSON.stringify([4, 3]));

  console.log('=== F：damage_mode 读取（override/bonus）===');
  let r5 = await ee.handleDirectDamage({ amount: 5, damage_mode: 'override' }, { target: enemies[0], unit: caster, allUnits });
  assert('damage_mode=override 被记录', r5.damageMode === 'override', r5.damageMode);
  let r6 = await ee.handleDirectDamage({ amount: 5, damage_mode: 'bonus' }, { target: enemies[0], unit: caster, allUnits });
  assert('damage_mode=bonus 默认', r6.damageMode === 'bonus', r6.damageMode);

  console.log('=== B5：all_or_nothing 短路判定（skillExecutor 内匹配空集语义）===');
  const segs = [{ lower: 1, upper: 3, points: null, effects: [] }, { lower: 4, upper: 6, points: null, effects: [] }];
  function matchSegs(rollV) {
    return segs.filter((s) => {
      if (s.points != null) { const pts = Array.isArray(s.points) ? s.points : [s.points]; if (pts.some(p => BranchEvaluator.pointMatches(p, rollV))) return true; }
      if (s.lower != null || s.upper != null) { const lo = s.lower != null ? s.lower : -Infinity; const hi = s.upper != null ? s.upper : Infinity; if (rollV >= lo && rollV <= hi) return true; }
      return false;
    });
  }
  assert('all_or_nothing: roll=2 命中区间', matchSegs(2).length === 1);
  assert('all_or_nothing: roll=7 未命中(触发全失效)', matchSegs(7).length === 0);
  const ptsSegs = [{ points: [1, 3, 5], lower: null, upper: null, effects: [] }];
  function matchPts(rollV) { return ptsSegs.filter(s => { const pts = Array.isArray(s.points) ? s.points : [s.points]; return pts.some(p => BranchEvaluator.pointMatches(p, rollV)); }); }
  assert('A/B 并集：points=[1,3,5] roll=3 命中', matchPts(3).length === 1);
  assert('A/B 并集：points=[1,3,5] roll=2 未命中', matchPts(2).length === 0);

  console.log('\n========== 阶段一功能验证结果 ==========');
  console.log('通过: ' + pass + '  失败: ' + fail);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch(e => { console.error('验证脚本异常:', e); process.exit(2); });
