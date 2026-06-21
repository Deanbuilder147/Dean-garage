/**
 * Phase 13.5: 装备属性交叉碰撞测试
 * 
 * 验证规则：
 *   1. 光束抗性盾 (damage_kind='beam') 抵挡 beam 50%, 对 kinetic 0%
 *   2. 实弹装甲 (damage_kind='kinetic') 抵挡 kinetic 40%, 对 beam 0%
 *   3. 通用装备（无 damage_kind）对所有类型生效
 *   4. 多槽位叠加: left_hand(beam) + right_hand(kinetic)
 *      → beam攻击: 只有 left_hand 生效
 *      → kinetic攻击: 只有 right_hand 生效
 */

const DamagePipe = require('../../../services/combat-service/src/services/combatCore/damagePipe.cjs');

let pass = 0;
let fail = 0;

function assert(condition, label) {
    if (condition) {
        console.log(`  ✅ PASS: ${label}`);
        pass++;
    } else {
        console.log(`  ❌ FAIL: ${label}`);
        fail++;
    }
}

// ============================================================
// TEST 1: 光束抗性盾 — 抵挡 beam，无视 kinetic
// ============================================================
console.log('\n=== TEST 1: 光束抗性盾 ===');

const beamDefender = {
    defense: 5,
    shield: 0,
    equipment: {
        left_hand: {
            name: '光子反射盾',
            damage_kind: 'beam',
            damage_kind_modifiers: { beam: 0.5, kinetic: 0, explosive: 0 }
        }
    },
    skills: [],
    mobility: 0,
    terrain: 'moon'
};

// Beam 攻击 → 应有 0.5 减免
const r1 = DamagePipe._calcArmorReduction({ weaponType: 'beam' }, beamDefender);
console.log(`  光束攻击 → total=${r1.total}, breakdown:`, JSON.stringify(r1.breakdown));
assert(r1.total === 0.5, 'beam攻击对光束盾 → 减免 = 0.5');
assert(r1.breakdown[0].matched === true, '光束盾 left_hand → 匹配成功');

// Kinetic 攻击 → 应无减免
const r2 = DamagePipe._calcArmorReduction({ weaponType: 'kinetic' }, beamDefender);
console.log(`  实弹攻击 → total=${r2.total}, breakdown:`, JSON.stringify(r2.breakdown));
assert(r2.total === 0, 'kinetic攻击对光束盾 → 减免 = 0 (完全不设防)');
assert(r2.breakdown[0].matched === false, '光束盾 left_hand → 匹配失败');

// ============================================================
// TEST 2: 完整管道 — 光束 vs 光束盾
// ============================================================
console.log('\n=== TEST 2: 完整管道 beam vs 光束盾 ===');

const attacker_beam = {
    melee: 0,
    ranged: 20,
    attack: 20,
    mobility: 5,
    weaponType: 'beam',
    buffs: [],
    skills: [],
    extraBonuses: null,
    z: 0
};

const result_beam = DamagePipe.calculate({
    attacker: attacker_beam,
    defender: beamDefender,
    attack_type: 'ranged',
    terrainDefs: { moon: { damage_kind_modifiers: { beam: 1.0, kinetic: 1.0 } }, plain: {} }
});

console.log(`  基础攻击: ${result_beam.stages.base_attack}`);
console.log(`  防御: ${JSON.stringify(result_beam.stages.defense)}`);
console.log(`  装备减免: ${JSON.stringify(result_beam.stages.armor_reduction)}`);
console.log(`  最终伤害: ${result_beam.final_damage}`);
// 预期: 20 - 5(defense) - 0.5(armor) = 14.5 → floor → 14
assert(result_beam.stages.armor_reduction.total === 0.5, '管道中装备减免 = 0.5');
assert(result_beam.final_damage > 0, '伤害 > 0 (未黑屏)');

// ============================================================
// TEST 3: 实弹装甲 — 抵挡 kinetic，无视 beam
// ============================================================
console.log('\n=== TEST 3: 实弹装甲 ===');

const kineticDefender = {
    defense: 3,
    shield: 0,
    equipment: {
        right_hand: {
            name: '复合反应装甲',
            damage_kind: 'kinetic',
            damage_kind_modifiers: { kinetic: 0.4, beam: 0, explosive: 0 }
        }
    },
    skills: [],
    mobility: 0,
    terrain: 'moon'
};

const r3 = DamagePipe._calcArmorReduction({ weaponType: 'kinetic' }, kineticDefender);
console.log(`  实弹攻击 → total=${r3.total}`);
assert(r3.total === 0.4, 'kinetic攻击对实弹装甲 → 减免 = 0.4');

const r4 = DamagePipe._calcArmorReduction({ weaponType: 'beam' }, kineticDefender);
console.log(`  光束攻击 → total=${r4.total}`);
assert(r4.total === 0, 'beam攻击对实弹装甲 → 减免 = 0');

// ============================================================
// TEST 4: 多槽位叠加 — 混合攻击
// ============================================================
console.log('\n=== TEST 4: 多槽位叠加 ===');

const multiDefender = {
    defense: 4,
    shield: 0,
    equipment: {
        left_hand: {
            name: '光子反射盾',
            damage_kind: 'beam',
            damage_kind_modifiers: { beam: 0.5, kinetic: 0 }
        },
        right_hand: {
            name: '复合反应装甲',
            damage_kind: 'kinetic',
            damage_kind_modifiers: { kinetic: 0.4, beam: 0 }
        },
        other: {
            name: '通用能量护盾',
            // 无 damage_kind → 通用装备
            damage_kind_modifiers: { beam: 0.1, kinetic: 0.1, explosive: 0.1 }
        }
    },
    skills: [],
    mobility: 0,
    terrain: 'moon'
};

// Beam 攻击: left_hand(0.5) + other(0.1) = 0.6, right_hand 不匹配跳过
const r5 = DamagePipe._calcArmorReduction({ weaponType: 'beam' }, multiDefender);
console.log(`  光束攻击 → total=${r5.total}, breakdown:`);
r5.breakdown.forEach(b => console.log(`    ${b.slot}: matched=${b.matched} reduction=${b.reduction} (${b.reason})`));
assert(r5.total === 0.6, 'beam: left_hand(0.5) + other通用(0.1) = 0.6');

// Kinetic 攻击: right_hand(0.4) + other(0.1) = 0.5, left_hand 不匹配跳过
const r6 = DamagePipe._calcArmorReduction({ weaponType: 'kinetic' }, multiDefender);
console.log(`  实弹攻击 → total=${r6.total}`);
assert(r6.total === 0.5, 'kinetic: right_hand(0.4) + other通用(0.1) = 0.5');

// ============================================================
// TEST 5: 完整管道 — 多槽位 kinetic 攻击
// ============================================================
console.log('\n=== TEST 5: 完整管道 kinetic 攻击混合防具 ===');

const attacker_kinetic = {
    melee: 0,
    ranged: 25,
    attack: 25,
    mobility: 6,
    weaponType: 'kinetic',
    buffs: [],
    skills: [],
    extraBonuses: null,
    z: 0
};

const result_kinetic = DamagePipe.calculate({
    attacker: attacker_kinetic,
    defender: multiDefender,
    attack_type: 'ranged',
    terrainDefs: { moon: { damage_kind_modifiers: { kinetic: 1.0 } }, plain: {} }
});

console.log(`  最终伤害: ${result_kinetic.final_damage}`);
console.log(`  装备减免: ${JSON.stringify(result_kinetic.stages.armor_reduction)}`);
assert(result_kinetic.stages.armor_reduction.total === 0.5, '管道装备减免 = 0.5 (right_hand 0.4 + other 0.1)');
assert(result_kinetic.final_damage > 0, '伤害 > 0');

// ============================================================
// TEST 6: 空装备 — 零减免，不崩溃
// ============================================================
console.log('\n=== TEST 6: 空装备零减免 ===');

const nakedDefender = {
    defense: 2,
    shield: 0,
    equipment: {},
    skills: [],
    mobility: 0,
    terrain: 'moon'
};

const r7 = DamagePipe._calcArmorReduction({ weaponType: 'beam' }, nakedDefender);
assert(r7.total === 0, '空装备 → 减免 = 0');
assert(Array.isArray(r7.breakdown), 'breakdown 为数组');
assert(r7.breakdown.length === 0, '空装备 breakdown 为空');

// ============================================================
// TEST 7: 技能属性匹配
// ============================================================
console.log('\n=== TEST 7: 技能属性校验 ===');

const skillDefender = {
    defense: 3,
    shield: 0,
    equipment: {},
    skills: [
        {
            name: '光束护盾技能',
            active: true,
            damage_kind: 'beam',
            damage_kind_modifiers: { beam: 0.3 }
        },
        {
            name: '通用格挡',
            active: true,
            // 无 damage_kind → 通用
            damage_kind_modifiers: { beam: 0.15, kinetic: 0.15 }
        }
    ],
    mobility: 0,
    terrain: 'moon'
};

const r8 = DamagePipe._calcArmorReduction({ weaponType: 'beam' }, skillDefender);
console.log(`  光束攻击 → total=${r8.total}`);
assert(r8.total === 0.45, 'beam skill(0.3) + 通用skill(0.15) = 0.45');

const r9 = DamagePipe._calcArmorReduction({ weaponType: 'kinetic' }, skillDefender);
console.log(`  实弹攻击 → total=${r9.total}`);
assert(r9.total === 0.15, 'kinetic: 光束技能跳过, 通用skill(0.15) = 0.15');

// ============================================================
// TEST 8: _calcDefense 防御减免属性校验
// ============================================================
console.log('\n=== TEST 8: _calcDefense 防御减免属性校验 ===');

const defDefender = {
    defense: 5,
    shield: 2,
    equipment: {
        left_hand: {
            name: '光束抗性镀层',
            damage_kind: 'beam',
            defense_modifiers: { beam: 3, kinetic: 0 }
        },
        right_hand: {
            name: '通用装甲板',
            // 无 damage_kind
            defense_modifiers: { beam: 1, kinetic: 1 }
        }
    },
    buffs: [],
    mobility: 0,
    terrain: 'moon'
};

const d1 = DamagePipe._calcDefense(defDefender, { weaponType: 'beam' }, { moon: {} });
console.log(`  光束攻击 → equipment_reduction=${d1.equipment_reduction}, total=${d1.total}`);
assert(d1.equipment_reduction === 4, 'beam: left_hand(3) + right_hand通用(1) = 4');
assert(d1.total === 11, 'beam total: 5+2+4 = 11');

const d2 = DamagePipe._calcDefense(defDefender, { weaponType: 'kinetic' }, { moon: {} });
console.log(`  实弹攻击 → equipment_reduction=${d2.equipment_reduction}, total=${d2.total}`);
assert(d2.equipment_reduction === 1, 'kinetic: left_hand不匹配跳过, right_hand通用(1) = 1');
assert(d2.total === 8, 'kinetic total: 5+2+1 = 8');

// ============================================================
// SUMMARY
// ============================================================
console.log(`\n${'='.repeat(50)}`);
console.log(`  测试结果: ${pass} PASS / ${fail} FAIL`);
console.log(`${'='.repeat(50)}`);

if (fail > 0) {
    console.log('\n❌ 存在失败用例，请检查！');
    process.exit(1);
} else {
    console.log('\n✅ 所有用例通过！装备属性交叉碰撞校验正确。');
}
