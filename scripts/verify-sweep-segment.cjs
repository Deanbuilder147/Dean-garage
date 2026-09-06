/**
 * verify-sweep-segment.cjs — 扫射纯 Segment 模型靶场验证（阶段一收口）
 *
 * 目标：验证存储A「扫射(sweep)」改造为纯 Segment 模型后，
 *  - 掷骰 1~3 点 → SINGLE_ENEMY 仅单体扣 -2
 *  - 掷骰 4~6 点 → AREA_ENEMY 对所有敌方均摊（split_mode=equal）
 * 全流程经 effectExecutor.handleDirectDamage 结算，log 含 segment 触发记录。
 */
const path = require('path');

const ENGINE = path.resolve(__dirname, '../mecha-universe-engine/services/combat-service/src/services/combatCore');
const SkillExecutor = require(path.join(ENGINE, 'skillExecutor.cjs'));
const DiceService = require(path.join(ENGINE, 'diceService.cjs'));

// ── 固定骰点：覆盖 DiceService.roll 实现确定性摇骰 ──
let FORCED = 1;
DiceService.roll = () => FORCED;

const se = new SkillExecutor();

function mkUnit(id, role, faction, hp, q, r) {
  return {
    id, role, faction,
    q, r,
    hp, maxHp: hp,
    mobility: 5,
    statusEffects: [],
  };
}

// caster 置于 (0,0)；靶置于 (1,0)（距离 1，落在 sweep max_range=3 内）
const caster = mkUnit('caster', 'attack', 'earth', 100, 0, 0);

function freshTargets() {
  return [
    mkUnit('E1', 'defense', 'maxion', 50, 1, 0),
    mkUnit('E2', 'defense', 'maxion', 50, 2, 0),
    mkUnit('E3', 'defense', 'maxion', 50, 3, 0),
  ];
}

const ALL_PASS = [];
function check(name, cond, detail) {
  ALL_PASS.push({ name, ok: !!cond, detail });
  console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
}

async function run() {
  // ── 场景 1：掷骰 1~3 点（精准单体 -2）──
  for (const roll of [1, 2, 3]) {
    FORCED = roll;
    const targets = freshTargets();
    const ctx = { allUnits: [caster, ...targets], roleOf: (u) => u.role || u.faction };
    const r = await se.executeUniversalSkill('sweep', caster, targets[0], ctx);

    const dealt = targets.map((t) => t.maxHp - t.hp);
    const onlyOneHit = dealt.filter((d) => d > 0).length === 1;
    const hitVal = dealt.find((d) => d > 0);
    check(`[1-3] 点${roll}: 仅单体命中`, onlyOneHit && hitVal === 2,
      `dealt=[${dealt.join(',')}] log=${JSON.stringify(r.log || []).slice(0, 120)}`);
  }

  // ── 场景 2：掷骰 4~6 点（范围均摊 -6 / 3 敌 = -2/-2/-2）──
  for (const roll of [4, 5, 6]) {
    FORCED = roll;
    const targets = freshTargets();
    const ctx = { allUnits: [caster, ...targets], roleOf: (u) => u.role || u.faction };
    const r = await se.executeUniversalSkill('sweep', caster, targets[0], ctx);

    const dealt = targets.map((t) => t.maxHp - t.hp);
    const allHit = dealt.every((d) => d > 0);
    const balanced = dealt.every((d) => d === 2);
    check(`[4-6] 点${roll}: 三敌全中且均摊`, allHit && balanced,
      `dealt=[${dealt.join(',')}] log=${JSON.stringify(r.log || []).slice(0, 160)}`);
  }

  // ── 场景 3：log 含 segment 结算记录 ──
  FORCED = 5;
  {
    const targets = freshTargets();
    const ctx = { allUnits: [caster, ...targets], roleOf: (u) => u.role || u.faction };
    const r = await se.executeUniversalSkill('sweep', caster, targets[0], ctx);
    const hasSegLog = Array.isArray(r.log) && r.log.some((l) => /Segment|segment|范围|均摊|单体/.test(String(l)));
    check(`log 含 Segment 结算记录`, hasSegLog, `log=${JSON.stringify(r.log || [])}`);
  }

  const failed = ALL_PASS.filter((x) => !x.ok);
  console.log(`\n==== 结果: ${ALL_PASS.length - failed.length}/${ALL_PASS.length} 通过 ====`);
  if (failed.length) {
    console.error('失败项:', failed.map((f) => f.name).join('; '));
    process.exit(1);
  }
  console.log('🎯 扫射纯 Segment 模型验证全部通过');
}

run().catch((e) => { console.error('验证脚本异常:', e); process.exit(1); });
