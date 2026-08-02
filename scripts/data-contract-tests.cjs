'use strict';
/**
 * 数据契约 Round-Trip 测试（Phase 2 第三梯队封底）
 * 直接 require combat-service 的 .cjs 真实结算模块，断言关键入口消费侧不再出现 undefined / 崩溃。
 * 覆盖：A3 阵营安全兜底 / A2 坐标 Key 大一统 / A5 胜利条件 facility 死链修复。
 * （A1/A4/A7/A8 为网关 TS 侧逻辑，由 tsc 构建 + 代码审查封底，本文件不重复覆盖。）
 */
const path = require('path');
const CORE = '/Users/dingxuyang/CodeBuddy/20260604120036/mecha-universe-engine/services/combat-service/src/services/combatCore';

const { getFactionInfo, getFactionSkills, getFactionBuff } = require(path.join(CORE, 'factionSkillRegistry.cjs'));
const { getHexKey } = require(path.join(CORE, 'hexKey.cjs'));
const { evaluateVictory } = require(path.join(CORE, 'victoryChecker.cjs'));

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log('  \u2713', name); }
  else { fail++; console.error('  \u2717 FAIL:', name); }
}

// ---------------- A3 阵营安全兜底锁 ----------------
console.log('\n[A3] 未知阵营安全兜底');
const unknownInfo = getFactionInfo('my_custom_faction');
ok('getFactionInfo(未知) 返回对象(非 null)', unknownInfo !== null && typeof unknownInfo === 'object');
ok('getFactionInfo(未知).skills 为对象', unknownInfo && typeof unknownInfo.skills === 'object');
ok('getFactionSkills(未知) 返回 [] (数组, 供 .forEach)', Array.isArray(getFactionSkills('my_custom_faction')) && getFactionSkills('my_custom_faction').length === 0);
ok('getFactionInfo(未知).buff 为 {} (供 .buff 解构, 不崩)', unknownInfo && typeof unknownInfo.buff === 'object');
ok('已知阵营 earth 正常', getFactionInfo('earth') && Array.isArray(getFactionSkills('earth')));

// ---------------- A2 坐标 Key 大一统 ----------------
console.log('\n[A2] 六边形坐标 Key 唯一真相源');
ok("getHexKey(3,4) === '3,4'", getHexKey(3, 4) === '3,4');
ok("getHexKey(0,0) === '0,0'", getHexKey(0, 0) === '0,0');

// ---------------- A5 胜利条件 facility 死链修复 ----------------
console.log('\n[A5] 胜利条件 facility 契约对齐');
function mkState(vc, units, round) {
  return { units: new Map(units.map(u => [u.id, u])), round, victoryConditions: vc };
}
function mkUnit(id, faction, q, r, hp) {
  return { id, faction, hp, position: { q, r }, q, r };
}

// 1) destroy_facility：facility 存在且 hp<=0 → 触发（攻击方获胜）
const vcDestroy = { conditions: ['destroy_facility'], facility: { q: 5, r: 5, hp: 0, faction: 'balon', attacker: 'earth' } };
const rDestroy = evaluateVictory(mkState(vcDestroy, [mkUnit('x', 'earth', 5, 5, 10)], 3));
ok('destroy_facility: facility.hp<=0 时攻击方获胜', rDestroy && rDestroy.victory && rDestroy.winner === 'earth' && rDestroy.condition === 'destroy_facility');

// 2) destroy_facility：facility.hp>0 → 不触发（死链修复的正面验证：不会误判）
const vcDestroyAlive = { conditions: ['destroy_facility'], facility: { q: 5, r: 5, hp: 100, faction: 'balon', attacker: 'earth' } };
ok('destroy_facility: facility.hp>0 时不误判获胜', evaluateVictory(mkState(vcDestroyAlive, [mkUnit('x', 'earth', 5, 5, 10)], 3)).victory === false);

// 3) 旧形状（无 facility）：destroy_facility 永不触发 —— 证明原死链确实存在
const vcLegacy = { conditions: ['destroy_facility'], target_q: 5, target_r: 5 };
ok('旧形状(无 facility): destroy_facility 永不被触发（死链复现）', evaluateVictory(mkState(vcLegacy, [mkUnit('x', 'earth', 5, 5, 10)], 3)).victory === false);

// 4) hold_position：facility + 友军占位 + 轮次达标 → 触发（坚守方获胜）
const vcHold = { conditions: ['hold_position'], hold_round: 3, facility: { q: 5, r: 5, faction: 'earth', holder: 'earth' } };
const rHold = evaluateVictory(mkState(vcHold, [mkUnit('x', 'earth', 5, 5, 10)], 5));
ok('hold_position: 友军在设施格且轮次达标 → 坚守方获胜', rHold && rHold.victory && rHold.winner === 'earth' && rHold.condition === 'hold_position');

// 5) hold_position：占位正确但轮次未到 → 不触发
const rHoldEarly = evaluateVictory(mkState(vcHold, [mkUnit('x', 'earth', 5, 5, 10)], 2));
ok('hold_position: 轮次未达标不触发', rHoldEarly.victory === false);

// 6) hold_position 旧形状（无 facility / 无顶层 q/r）→ 不触发（验证契约前置）
const vcHoldLegacy = { conditions: ['hold_position'], hold_round: 3 };
ok('旧形状(无 facility): hold_position 不触发（死链复现）', evaluateVictory(mkState(vcHoldLegacy, [mkUnit('x', 'earth', 5, 5, 10)], 5)).victory === false);

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
