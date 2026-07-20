/**
 * Phase 18-A: 词条工厂极限多重复句造句压力测试
 * 
 * 测试范围:
 *   A. ConditionEvaluator 平铺 4 重极限条件 AND 链评估
 *   B. DamagePipe 地形弱点系数 (water → beam ×0.5)
 *   C. 4 场景短路拦截对账
 * 
 * 运行: node services/combat-service/test/phase18a_stress_test.cjs
 */

const ConditionEvaluator = require('../src/services/combatCore/conditionEvaluator.cjs');
const path = require('path');

// ================================================================
// 测试数据: 「雷磁蓄能·绝地轰击」技能配置
// ================================================================
const THUNDER_MAGNET_SKILL = {
  id: 'thunder_magnet_desperate_strike',
  name: '雷磁蓄能·绝地轰击',
  label: '雷磁蓄能·绝地轰击',
  action_type: 'attack',
  attack_stat: 'ranged',
  category: 'special',
  damage_kind: 'beam',
  target_filter: 'enemy',
  cast_range: 5,
  min_cast_range: 1,
  aoe_radius: 0,
  base_damage: 25,
  dice_type: '1d8',
  success_line: 4,
  success_bonus_damage: 8,
  height_bonus_per_diff: 2,
  
  // === 4 重极限条件 ===
  requires_hp_below: 75,       // 1. 血量低于 75
  requires_unmoved: true,       // 2. 本回合舍弃移动
  target_on_terrain: 'water',   // 3. 目标必须站在水域
  requires_stealth: false,      // (未激活)
};

// ================================================================
// 测试辅助函数
// ================================================================
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    const result = fn();
    if (result) {
      passedTests++;
      console.log(`  ✅ PASS: ${name}`);
    } else {
      failedTests++;
      console.log(`  ❌ FAIL: ${name}`);
    }
  } catch (e) {
    failedTests++;
    console.log(`  💥 CRASH: ${name} — ${e.message}`);
  }
}

function assert(condition, msg) {
  if (!condition) {
    console.log(`     ↳ ${msg}`);
  }
  return condition;
}

// 平铺条件提取: 从技能配置中提取 flat 条件键
function extractFlatConditions(skill) {
  const conds = {};
  if (skill.requires_hp_below > 0) conds.requires_hp_below = skill.requires_hp_below;
  if (skill.requires_unmoved) conds.requires_unmoved = skill.requires_unmoved;
  if (skill.requires_stealth) conds.requires_stealth = skill.requires_stealth;
  if (skill.target_on_terrain) conds.target_on_terrain = skill.target_on_terrain;
  return conds;
}

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║   Phase 18-A: 词条工厂极限多重复句造句压力测试              ║');
console.log('║   技能: 雷磁蓄能·绝地轰击                                   ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

// ================================================================
// 第一部分: 条件评估器白名单校验
// ================================================================
console.log('━━━ 第一部分: conditionEvaluator 白名单检查 ━━━');

test('flatConditionKeys 包含 requires_hp_below', () => {
  return assert(
    ConditionEvaluator.flatConditionKeys.has('requires_hp_below'),
    'requires_hp_below 不在白名单中'
  );
});

test('flatConditionKeys 包含 requires_unmoved', () => {
  return assert(
    ConditionEvaluator.flatConditionKeys.has('requires_unmoved'),
    'requires_unmoved 不在白名单中'
  );
});

test('flatConditionKeys 包含 target_on_terrain', () => {
  return assert(
    ConditionEvaluator.flatConditionKeys.has('target_on_terrain'),
    'target_on_terrain 不在白名单中'
  );
});

test('flatConditionKeys 包含 requires_stealth', () => {
  return assert(
    ConditionEvaluator.flatConditionKeys.has('requires_stealth'),
    'requires_stealth 不在白名单中'
  );
});

test('checkers 注册了 requires_hp_below', () => {
  return assert(
    typeof ConditionEvaluator.checkers.requires_hp_below === 'function',
    'requires_hp_below 检查器未注册'
  );
});

test('checkers 注册了 requires_unmoved', () => {
  return assert(
    typeof ConditionEvaluator.checkers.requires_unmoved === 'function',
    'requires_unmoved 检查器未注册'
  );
});

test('checkers 注册了 target_on_terrain', () => {
  return assert(
    typeof ConditionEvaluator.checkers.target_on_terrain === 'function',
    'target_on_terrain 检查器未注册'
  );
});

// ================================================================
// 第二部分: 技能平铺条件提取
// ================================================================
console.log('\n━━━ 第二部分: 技能配置 → 平铺条件提取 ━━━');

const flatConditions = extractFlatConditions(THUNDER_MAGNET_SKILL);
console.log(`  平铺条件: ${JSON.stringify(flatConditions, null, 2)}`);

test('提取出 3 个条件 (requires_hp_below, requires_unmoved, target_on_terrain)', () => {
  return assert(
    Object.keys(flatConditions).length === 3,
    `期望 3 个条件，实际 ${Object.keys(flatConditions).length}: ${Object.keys(flatConditions).join(', ')}`
  );
});

test('requires_hp_below = 75', () => {
  return assert(flatConditions.requires_hp_below === 75, `值: ${flatConditions.requires_hp_below}`);
});

test('requires_unmoved = true', () => {
  return assert(flatConditions.requires_unmoved === true, `值: ${flatConditions.requires_unmoved}`);
});

test('target_on_terrain = "water"', () => {
  return assert(flatConditions.target_on_terrain === 'water', `值: ${flatConditions.target_on_terrain}`);
});

// ================================================================
// 第三部分: 4 阶短路拦截对账 (核心测试)
// ================================================================
console.log('\n━━━ 第三部分: 4 阶短路拦截对账 ━━━');

// 基础单位: 满血 100, 静止, 目标在水域
const baseUnit = { hp: 100, maxHp: 100, max_hp: 100, has_moved: false, stealth: false };
const waterTarget = { terrain: 'water' };
const forestTarget = { terrain: 'forest' };

// --- 场景 1: 满血 + 静止 + 水域目标 → requires_hp_below 拦截 ---
test('场景1: 满血 HP=100 → requires_hp_below(75) 拦截', () => {
  const ctx = {
    unit: { ...baseUnit, hp: 100 },
    target: { ...waterTarget },
  };
  const result = ConditionEvaluator.evaluateFlat(flatConditions, ctx);
  console.log(`     ↳ evaluateFlat 结果: ${result} (期望 false — 满血应拦截)`);
  return assert(result === false, '满血单位不应通过 requires_hp_below 检查');
});

// --- 场景 2: 残血 + 已移动 + 水域目标 → requires_unmoved 拦截 ---
test('场景2: 残血 HP=50 但已移动 → requires_unmoved 拦截', () => {
  const ctx = {
    unit: { ...baseUnit, hp: 50, has_moved: true },
    target: { ...waterTarget },
  };
  const result = ConditionEvaluator.evaluateFlat(flatConditions, ctx);
  console.log(`     ↳ evaluateFlat 结果: ${result} (期望 false — 已移动应拦截)`);
  return assert(result === false, '已移动单位不应通过 requires_unmoved 检查');
});

// --- 场景 3: 残血 + 静止 + 森林目标 → target_on_terrain 拦截 ---
test('场景3: 残血静止但目标在森林 → target_on_terrain 拦截', () => {
  const ctx = {
    unit: { ...baseUnit, hp: 30 },
    target: { ...forestTarget },
  };
  const result = ConditionEvaluator.evaluateFlat(flatConditions, ctx);
  console.log(`     ↳ evaluateFlat 结果: ${result} (期望 false — 森林不应通过 water 限定)`);
  return assert(result === false, '森林目标不应通过 target_on_terrain=water 检查');
});

// --- 场景 4: 残血 + 静止 + 水域目标 → 白名单放行！ ---
test('场景4: 残血 HP=30 + 静止 + 水域目标 → 白名单完美放行 ✅', () => {
  const ctx = {
    unit: { ...baseUnit, hp: 30 },
    target: { ...waterTarget },
  };
  const result = ConditionEvaluator.evaluateFlat(flatConditions, ctx);
  console.log(`     ↳ evaluateFlat 结果: ${result} (期望 true — 四条件全满足应放行)`);
  return assert(result === true, '四条件全满足应放行到伤害管道');
});

// ================================================================
// 第四部分: 边界值测试
// ================================================================
console.log('\n━━━ 第四部分: 边界值测试 ━━━');

// 边界 1: HP 恰好等于阈值
test('边界: HP=75 (恰好等于阈值) → requires_hp_below(75) 应拦截 (严格小于)', () => {
  const ctx = {
    unit: { ...baseUnit, hp: 75 },
    target: { ...waterTarget },
  };
  const result = ConditionEvaluator.evaluateFlat(flatConditions, ctx);
  console.log(`     ↳ HP=75, 条件 requires_hp_below=75 → 严格小于 → ${result}`);
  return assert(result === false, 'HP=75 应被拦截 (requires_hp_below 是严格 < 而非 ≤)');
});

// 边界 2: HP=74 (恰好低于阈值)
test('边界: HP=74 → requires_hp_below(75) 应放行', () => {
  const ctx = {
    unit: { ...baseUnit, hp: 74 },
    target: { ...waterTarget },
  };
  const result = ConditionEvaluator.evaluateFlat(flatConditions, ctx);
  console.log(`     ↳ HP=74, 条件 requires_hp_below=75 → ${result}`);
  return assert(result === true, 'HP=74 应被放行 (74 < 75)');
});

// 边界 3: HP=1 (极端低血)
test('边界: HP=1 → 应放行', () => {
  const ctx = {
    unit: { ...baseUnit, hp: 1 },
    target: { ...waterTarget },
  };
  const result = ConditionEvaluator.evaluateFlat(flatConditions, ctx);
  return assert(result === true, 'HP=1 极低血应放行');
});

// 边界 4: HP=0 (已死亡)
test('边界: HP=0 → requires_hp_below(75) 应放行 (0<75)', () => {
  const ctx = {
    unit: { ...baseUnit, hp: 0 },
    target: { ...waterTarget },
  };
  const result = ConditionEvaluator.evaluateFlat(flatConditions, ctx);
  return assert(result === true, 'HP=0 应放行 (但上层可能需要战死检查)');
});

// 边界 5: target 没有 terrain 字段
test('边界: target 无 terrain 字段 → target_on_terrain 应拦截', () => {
  const ctx = {
    unit: { ...baseUnit, hp: 30 },
    target: { name: 'EnemyMech' },  // 无 terrain
  };
  const result = ConditionEvaluator.evaluateFlat(flatConditions, ctx);
  return assert(result === false, '无 terrain 字段应不满足 target_on_terrain=water');
});

// ================================================================
// 第五部分: 伤害管道地形弱点系数验证
// ================================================================
console.log('\n━━━ 第五部分: 水域对 beam 属性 0.5x 弱点系数裁剪 ━━━');

// 读取地形配置验证静态数据
const glossaryConfigPath = path.join(__dirname, '..', 'src', 'config', 'glossary-skill-config.json');
try {
  const fs = require('fs');
  const glossaryConfig = JSON.parse(fs.readFileSync(glossaryConfigPath, 'utf8'));
  const waterTerrain = glossaryConfig.terrains?.water;

  test('地形配置中存在 water', () => {
    return assert(!!waterTerrain, 'water 地形定义缺失');
  });

  if (waterTerrain) {
    test('water.damage_kind_modifiers 存在', () => {
      return assert(!!waterTerrain.damage_kind_modifiers, 'damage_kind_modifiers 缺失');
    });

    test('water 对 beam 的修正 = 0.5', () => {
      return assert(
        waterTerrain.damage_kind_modifiers?.beam === 0.5,
        `实际值: ${waterTerrain.damage_kind_modifiers?.beam}`
      );
    });

    test('water 对 kinetic 的修正 = 1.0', () => {
      return assert(
        waterTerrain.damage_kind_modifiers?.kinetic === 1.0,
        `实际值: ${waterTerrain.damage_kind_modifiers?.kinetic}`
      );
    });

    test('water 对 explosive 的修正 = 0.8', () => {
      return assert(
        waterTerrain.damage_kind_modifiers?.explosive === 0.8,
        `实际值: ${waterTerrain.damage_kind_modifiers?.explosive}`
      );
    });

    test('water 对 corrosive 的修正 = 0.6', () => {
      return assert(
        waterTerrain.damage_kind_modifiers?.corrosive === 0.6,
        `实际值: ${waterTerrain.damage_kind_modifiers?.corrosive}`
      );
    });

    test('water 对 thermal 的修正 = 1.2', () => {
      return assert(
        waterTerrain.damage_kind_modifiers?.thermal === 1.2,
        `实际值: ${waterTerrain.damage_kind_modifiers?.thermal}`
      );
    });
  }

  // 伤害计算模拟: base_damage=25, beam × water(0.5) = 12.5 → floor 12
  test('伤害模拟: base_damage=25 × water.beam(0.5) = 12', () => {
    const baseDamage = THUNDER_MAGNET_SKILL.base_damage;
    const terrainModifier = waterTerrain?.damage_kind_modifiers?.beam || 1.0;
    const finalDamage = Math.floor(baseDamage * terrainModifier);
    console.log(`     ↳ ${baseDamage} × ${terrainModifier} = ${baseDamage * terrainModifier} → floor → ${finalDamage}`);
    return assert(finalDamage === 12, `期望 12, 实际 ${finalDamage}`);
  });

  // 验证晶矿(crystal) 对 beam 的 1.5x 加成
  const crystalTerrain = glossaryConfig.terrains?.crystal;
  if (crystalTerrain) {
    test('crystal 对 beam 的修正 = 1.5 (强化)', () => {
      return assert(
        crystalTerrain.damage_kind_modifiers?.beam === 1.5,
        `实际值: ${crystalTerrain.damage_kind_modifiers?.beam}`
      );
    });

    test('对比: beam 在 crystal(1.5x) vs water(0.5x) — 3倍差距', () => {
      const crystalMod = crystalTerrain.damage_kind_modifiers?.beam || 1.0;
      const waterMod = waterTerrain?.damage_kind_modifiers?.beam || 1.0;
      console.log(`     ↳ crystal×${crystalMod} vs water×${waterMod} = ${(crystalMod/waterMod).toFixed(1)}x 差距`);
      return assert(crystalMod / waterMod === 3.0, 'beam 在两种地形间应有 3 倍差距');
    });
  }

} catch (e) {
  console.log(`  💥 地形配置读取失败: ${e.message}`);
  test('地形配置文件可读', () => false);
}

// ================================================================
// 第六部分: 极端造句压测 (Corner Cases)
// ================================================================
console.log('\n━━━ 第六部分: 极限造句压测 ━━━');

// 极端造句 1: 所有条件全不激活
test('极限: 全条件关闭(HP=0, unmoved=false, terrain=空) → 放行', () => {
  const emptyConditions = { requires_hp_below: 0, requires_unmoved: false, target_on_terrain: '' };
  // 注意: evaluateFlat 中 !value && value !== true 会跳过 0, false, ''
  // 所以所有条件都会被跳过 → 返回 true
  const ctx = { unit: { hp: 100 }, target: { terrain: 'plain' } };
  const result = ConditionEvaluator.evaluateFlat(emptyConditions, ctx);
  return assert(result === true, '全条件关闭应放行');
});

// 极端造句 2: requires_hp_below=1 (最低阈值)
test('极限: requires_hp_below=1 + HP=0 → 放行', () => {
  const strictConds = { requires_hp_below: 1, requires_unmoved: true };
  const ctx = { unit: { hp: 0, has_moved: false }, target: { terrain: 'water' } };
  const result = ConditionEvaluator.evaluateFlat(strictConds, ctx);
  return assert(result === true, 'HP=0 < 1, 已静止 → 应放行');
});

// 极端造句 3: 混合地形检查
test('极限: target_on_terrain 对比 10 种地形', () => {
  const terrains = ['plain', 'mountain', 'forest', 'water', 'moon', 'fortress', 'ruins', 'crystal', 'rubble', 'city_building'];
  const conds = { target_on_terrain: 'water', requires_unmoved: true };
  const ctx = { unit: { has_moved: false } };
  
  let correctCount = 0;
  for (const t of terrains) {
    const result = ConditionEvaluator.evaluateFlat(conds, { ...ctx, target: { terrain: t } });
    if (t === 'water' && result === true) correctCount++;
    if (t !== 'water' && result === false) correctCount++;
  }
  console.log(`     ↳ 10 种地形检查: ${correctCount}/10 正确`);
  return assert(correctCount === 10, `10 种地形中 ${correctCount} 个正确判定`);
});

// 极端造句 4: getAvailableCheckers 包含所有 Phase 14 新增项
test('极限: getAvailableCheckers 包含所有 4 个 Phase 14 条件键', () => {
  const available = ConditionEvaluator.getAvailableCheckers();
  const required = ['requires_hp_below', 'requires_unmoved', 'requires_stealth', 'target_on_terrain'];
  const missing = required.filter(k => !available.includes(k));
  if (missing.length > 0) {
    console.log(`     ↳ 缺失: ${missing.join(', ')}`);
  }
  return assert(missing.length === 0, `缺失检查器: ${missing.join(', ')}`);
});

// ================================================================
// 汇总
// ================================================================
console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log(`║   测试汇总: ${totalTests} 项, ✅ ${passedTests} 通过, ❌ ${failedTests} 失败`);
if (failedTests === 0) {
  console.log('║   状态: 🏆 全部通过! 雷磁蓄能·绝地轰击 4 阶拦截完美运作!');
} else {
  console.log(`║   状态: ⚠️ 有 ${failedTests} 项未通过，需要排查!`);
}
console.log('╚══════════════════════════════════════════════════════════════╝\n');

// 三关验证
console.log('━━━ 三关闭环验证 ━━━');
const triCheck1 = (passedTests >= 25); // 第一关: 25+ 测试通过
const triCheck2 = (passedTests === totalTests); // 第二关: 全部通过
const triCheck3 = (
  ConditionEvaluator.flatConditionKeys.has('requires_hp_below') &&
  ConditionEvaluator.flatConditionKeys.has('requires_unmoved') &&
  ConditionEvaluator.flatConditionKeys.has('target_on_terrain')
); // 第三关: 白名单完整

console.log(`  Level 01 (测试量≥25): ${triCheck1 ? '✅ PASS' : '❌ FAIL'} (${totalTests}项)`);
console.log(`  Level 02 (零失败): ${triCheck2 ? '✅ PASS' : '❌ FAIL'}`);
console.log(`  Level 03 (白名单完整): ${triCheck3 ? '✅ PASS' : '❌ FAIL'}`);

process.exit(failedTests > 0 ? 1 : 0);
