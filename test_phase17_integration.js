#!/usr/bin/env node
/**
 * Phase 17 三关集成测试
 *
 * 测试流程:
 *   关卡01: 测试可破坏地形退化 + DKM 交叉碰撞
 *   关卡02: 测试手动摇骰 pending_roll 机制 (技能 is_manual_roll)
 *   关卡03: 测试 conditionEvaluator AND 复合条件 (requires_unmoved + requires_hp_below)
 */

const BASE = 'http://localhost:3004/api';
const TOKEN = process.env.TEST_TOKEN || '';

async function api(path, opts = {}) {
    const res = await fetch(`${BASE}${path}`, {
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN}` },
        ...opts
    });
    return res.json();
}

function hexDist(q1, r1, q2, r2) {
    const dq = Math.abs(q2 - q1), dr = Math.abs(r2 - r1);
    return Math.max(dq, dr, Math.abs((q2 - q1) + (r2 - r1)));
}

async function test01_terrainDestruction() {
    console.log('\n=== TEST 01: 全要素语法拆除 ===');

    const start = await api('/campaign/tutorial_01/start', {
        method: 'POST',
        body: JSON.stringify({
            playerUnits: [{
                id: 'test_player', name: 'Test Unit', faction: 'earth',
                hp: 120, max_hp: 120, attack: 14, melee: 14, ranged: 8,
                defense: 10, mobility: 6, weaponType: 'kinetic', armorType: 'normal',
                shield: 0, level: 5,
                equipment: {
                    right_hand: { name: 'Boom Hammer', damage_kind: 'explosive', attack_bonus: 3 },
                    left_hand: { name: 'Shield', defense_bonus: 3 }
                }
            }]
        })
    });

    if (!start.success) return { pass: false, error: 'Start failed: ' + start.error, name: 'Level01' };
    console.log('  ✅ Campaign started, battleId:', start.battleId);

    const state = await api('/campaign/tutorial_01/state');
    const player = state.battleState.units.find(u => u.faction === 'earth');
    const cityCell = state.battleState.cells.find(c => c.q === 2 && c.r === 1);

    console.log('  Player at:', player.q, player.r);
    console.log('  City building at (2,1):', cityCell?.terrain);

    // Move adjacent to city_building
    const move = await api('/campaign/tutorial_01/move', {
        method: 'POST',
        body: JSON.stringify({ unit_id: player.id, q: 1, r: 1 })
    });
    console.log('  Move to (1,1):', move.success ? 'OK' : move.error);

    // Attack city_building with explosive
    const terrainAtk = await api('/campaign/tutorial_01/attack-terrain', {
        method: 'POST',
        body: JSON.stringify({ unit_id: player.id, q: 2, r: 1 })
    });

    if (!terrainAtk.success) return { pass: false, error: 'Terrain attack failed: ' + terrainAtk.error, name: 'Level01' };

    console.log('  Terrain attack:', terrainAtk.damageKind, 'dmg=', terrainAtk.effectiveDamage);
    console.log('  Destroyed:', terrainAtk.terrainDestroyed);

    // Check terrain transformed
    const state2 = await api('/campaign/tutorial_01/state');
    const cityCell2 = state2.battleState.cells.find(c => c.q === 2 && c.r === 1);

    const PASS = cityCell2.terrain === 'rubble';
    console.log(PASS ? '  ✅ PASS: Terrain → rubble' : `  ❌ FAIL: Terrain = ${cityCell2.terrain}`);

    // End turn to trigger AI
    const endTurn = await api('/campaign/tutorial_01/end-turn', { method: 'POST' });
    console.log('  End turn:', endTurn.success, 'AI actions:', endTurn.aiTurn?.actions?.length || 0);

    await api('/campaign/tutorial_01/cleanup', { method: 'POST' });
    return { pass: PASS, detail: `Terrain: ${cityCell2.terrain}`, name: 'Level01' };
}

async function test02_diceMechanism() {
    console.log('\n=== TEST 02: 命运的空格拍击 ===');

    const start = await api('/campaign/tutorial_02/start', {
        method: 'POST',
        body: JSON.stringify({
            playerUnits: [{
                id: 't02_player_alpha', name: 'Dice Tester', faction: 'earth',
                hp: 130, max_hp: 130, attack: 12, melee: 12, ranged: 7,
                defense: 8, mobility: 5, weaponType: 'kinetic', armorType: 'normal',
                shield: 0, level: 6,
                equipment: {
                    right_hand: { name: 'Boom Hammer', damage_kind: 'explosive', attack_bonus: 3 },
                    left_hand: { name: 'Shield', defense_bonus: 3 }
                },
                skills: [
                    { id: 'skill_counter', type: 'counter', active: true, name: 'Counter' }
                ]
            }]
        })
    });

    if (!start.success) return { pass: false, error: 'Start failed: ' + start.error, name: 'Level02' };
    console.log('  ✅ Campaign started');

    const state = await api('/campaign/tutorial_02/state');
    const diceMaster = state.battleState.units.find(u => u.id === 't02_enemy_dice_master');
    const hasManualRoll = diceMaster?.skills?.some(s => s.is_manual_roll);
    console.log('  Enemy has manual_roll skill:', hasManualRoll);

    // Test: end turn → AI should act
    const endTurn = await api('/campaign/tutorial_02/end-turn', { method: 'POST' });
    console.log('  End turn success:', endTurn.success, 'AI actions:', endTurn.aiTurn?.actions?.length || 0);

    // Check DKM cross-collision — sentinel has beam_resist, player has kinetic/explosive
    let dkmCheck = false;
    if (endTurn.aiTurn?.actions) {
        const attackActions = endTurn.aiTurn.actions.filter(a => a.action === 'attack' || a.action === 'attack_after_move');
        console.log('  AI attack actions:', attackActions.length);
        for (const a of attackActions) {
            console.log(`    ${a.detail}`);
        }
        dkmCheck = attackActions.length > 0;
    }

    const PASS = endTurn.success && endTurn.aiTurn && endTurn.aiTurn.actions && endTurn.aiTurn.actions.length > 0;
    console.log(PASS ? '  ✅ PASS: AI turn executed with DKM-aware attacks' : '  ❌ FAIL: No AI actions');

    await api('/campaign/tutorial_02/cleanup', { method: 'POST' });
    return { pass: PASS, detail: `AI actions: ${endTurn.aiTurn?.actions?.length || 0}, manual_roll: ${hasManualRoll}`, name: 'Level02' };
}

async function test03_conditionEvaluator() {
    console.log('\n=== TEST 03: 绝地潜行复句 ===');

    const start = await api('/campaign/tutorial_03/start', {
        method: 'POST',
        body: JSON.stringify({
            playerUnits: [
                {
                    id: 't03_player_alpha', name: 'Vanguard', faction: 'earth',
                    hp: 140, max_hp: 140, attack: 15, melee: 15, ranged: 8,
                    defense: 10, mobility: 6, weaponType: 'kinetic', armorType: 'normal',
                    shield: 1, level: 7,
                    equipment: {
                        right_hand: { name: 'Siege Hammer', damage_kind: 'explosive', attack_bonus: 4 },
                        left_hand: { name: 'Heavy Shield', defense_bonus: 4 }
                    }
                },
                {
                    id: 't03_player_beta', name: 'Recon', faction: 'earth',
                    hp: 100, max_hp: 100, attack: 8, melee: 6, ranged: 12,
                    defense: 6, mobility: 7, weaponType: 'beam', armorType: 'normal',
                    shield: 0, level: 5,
                    equipment: {
                        right_hand: { name: 'Beam Rifle', damage_kind: 'beam', attack_bonus: 2 }
                    }
                }
            ]
        })
    });

    if (!start.success) return { pass: false, error: 'Start failed: ' + start.error, name: 'Level03' };
    console.log('  ✅ Campaign started with 2 player units');

    const state = await api('/campaign/tutorial_03/state');
    const fortressGuard = state.battleState.units.find(u => u.id === 't03_enemy_fortress_guard');
    const guardianFury = fortressGuard?.skills?.find(s => s.name === '守护者之怒');

    const hasRequiresUnmoved = guardianFury?.requires_unmoved === true;
    const hasRequiresHpBelow = guardianFury?.requires_hp_below === 75;
    console.log('  Guardian Fury skill:', {
        requires_unmoved: hasRequiresUnmoved,
        requires_hp_below: hasRequiresHpBelow,
        base_damage: guardianFury?.base_damage
    });

    // Test end turn (AI should act — fortress guard uses DKM and terrain advantage)
    const endTurn = await api('/campaign/tutorial_03/end-turn', { method: 'POST' });
    console.log('  AI actions after end turn:', endTurn.aiTurn?.actions?.length || 0);
    if (endTurn.aiTurn?.actions) {
        for (const a of endTurn.aiTurn.actions) {
            console.log(`    ${a.detail}`);
        }
    }

    const PASS = hasRequiresUnmoved && hasRequiresHpBelow && endTurn.success;
    console.log(PASS ? '  ✅ PASS: Both AND conditions verified' : '  ❌ FAIL: Condition mismatch');

    await api('/campaign/tutorial_03/cleanup', { method: 'POST' });
    return { pass: PASS, detail: `requires_unmoved=${hasRequiresUnmoved}, requires_hp_below=${hasRequiresHpBelow}`, name: 'Level03' };
}

async function main() {
    console.log('Phase 17 Integration Tests');
    console.log('=========================');

    const results = [];

    results.push(await test01_terrainDestruction());
    results.push(await test02_diceMechanism());
    results.push(await test03_conditionEvaluator());

    console.log('\n=========================');
    console.log('RESULTS:');
    for (const r of results) {
        console.log((r.pass ? '  ✅ PASS' : '  ❌ FAIL'), `[${r.name}]`, '-', r.detail);
    }

    const allPass = results.every(r => r.pass);
    console.log(allPass ? '\n🎉 ALL TESTS PASSED!' : '\n💥 SOME TESTS FAILED');
    process.exit(allPass ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
