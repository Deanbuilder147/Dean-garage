/**
 * campaignManager.js v2.0 — 剧情战役管理器 (Phase 17: AI引擎 + 自包含沙盒)
 *
 * 自包含架构：
 *   - 内置 in-memory battle state (无需外部 BattleState 模块)
 *   - 使用 CombatResolver 进行攻击计算
 *   - hexDistance 内联实现
 *   - Phase 17: 启发式敌方 AI 战术引擎
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { CombatResolver } from '../services/combatResolver.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const CONFIG_PATH = path.resolve(__dirname, '../config/campaigns.json');

// Phase 17: 导入 CJS 核心模块用于 AI 引擎
const TerrainMovement = require('./combatCore/terrainMovement.cjs');
const DamagePipe = require('./combatCore/damagePipe.cjs');

// ============================================================
// 工具: hexDistance (Even-R Offset)
// ============================================================
function hexDistance(q1, r1, q2, r2) {
    const dq = Math.abs(q2 - q1);
    const dr = Math.abs(r2 - r1);
    const ds = Math.abs((q2 - q1) + (r2 - r1));
    return Math.max(dq, dr, ds);
}

// ============================================================
// 内联 In-Memory Battle State (自包含，无外部依赖)
// ============================================================
const battleStates = new Map();

function createBattle(battleId, config) {
    const state = {
        id: battleId,
        name: config.name || 'Campaign',
        width: config.width || 10,
        height: config.height || 8,
        fogOfWar: false,
        cells: [],
        units: [],
        phase: 'deployment',
        currentTurn: 1,
        log: [],
        _terrainHp: {},
        created: new Date().toISOString(),
        updated: new Date().toISOString()
    };
    battleStates.set(battleId, state);
    return state;
}

function getBattle(battleId) {
    return battleStates.get(battleId) || null;
}

function deleteBattle(battleId) {
    battleStates.delete(battleId);
}

function addLog(battleId, category, message) {
    const state = getBattle(battleId);
    if (state) {
        state.log.push(`[${category}] ${message}`);
    }
}

function deployUnit(battleId, unitData) {
    const state = getBattle(battleId);
    if (!state) return { success: false, error: 'Battle not found' };
    state.units.push({ ...unitData });
    return { success: true };
}

function moveUnit(battleId, unitId, targetQ, targetR) {
    const state = getBattle(battleId);
    if (!state) return { success: false, error: 'Battle not found' };
    const unit = state.units.find(u => u.id === unitId || u.unit_id === unitId);
    if (!unit) return { success: false, error: 'Unit not found' };
    if (unit.hp <= 0) return { success: false, error: 'Unit destroyed' };

    // Simple distance check
    const dist = hexDistance(unit.q, unit.r, targetQ, targetR);
    const maxMove = unit.mobility || 3;
    if (dist > maxMove) return { success: false, error: `Too far: ${dist} > ${maxMove}` };

    // Check not occupied
    const occupied = state.units.some(
        u => u.q === targetQ && u.r === targetR && u.hp > 0 && u.id !== unit.id
    );
    if (occupied) return { success: false, error: 'Target hex occupied' };

    unit.q = targetQ;
    unit.r = targetR;
    unit.has_moved = true;
    state.updated = new Date().toISOString();

    return { success: true, unit };
}

function endTurn(battleId) {
    const state = getBattle(battleId);
    if (!state) return { success: false, error: 'Battle not found' };
    state.currentTurn = (state.currentTurn || 1) + 1;
    // Reset action flags
    for (const u of state.units) {
        u.has_acted = false;
        u.has_moved = false;
    }
    state.updated = new Date().toISOString();
    return { success: true, turn: state.currentTurn };
}

// ============================================================
// 配置加载
// ============================================================

function loadCampaignConfig() {
    try {
        const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
        return JSON.parse(raw);
    } catch (e) {
        console.error('[CampaignManager] 加载 campaigns.json 失败:', e.message);
        return null;
    }
}

function getCampaign(campaignId) {
    const config = loadCampaignConfig();
    if (!config || !config.campaigns || !config.campaigns[campaignId]) {
        return null;
    }
    return config.campaigns[campaignId];
}

function listCampaigns() {
    const config = loadCampaignConfig();
    if (!config || !config.campaigns) return [];
    return Object.values(config.campaigns).map(c => ({
        id: c.id, name: c.name, chapter: c.chapter,
        chapter_name: c.chapter_name, description: c.description,
        difficulty: c.difficulty, stage_count: (c.stages || []).length
    }));
}

// ============================================================
// 战役状态追踪（内存）
// ============================================================
/** @type {Map<string, Object>} */
const campaignSessions = new Map();

function getCampaignSession(campaignId) {
    return campaignSessions.get(campaignId) || null;
}

// ============================================================
// Phase 17 AI 引擎辅助函数
// ============================================================

// Phase 17: 使用 TerrainMovement.cjs 统一地形数据（替代硬编码回退表）
function _getTerrain(battle, q, r) {
    if (!battle || !battle.cells) return 'moon';
    const cell = battle.cells.find(c => c.q === q && c.r === r);
    return cell ? (cell.terrain || 'moon') : 'moon';
}

function _getTerrainCost(terrainId) {
    return TerrainMovement.getMoveCost(terrainId);
}

function _getTerrainDefense(terrainId) {
    return TerrainMovement.getDefenseBonus(terrainId);
}

function _getNeighbors(q, r, width, height) {
    const parity = r & 1;
    const offsets = parity
        ? [[1,0],[1,-1],[0,-1],[-1,0],[0,1],[1,1]]
        : [[1,0],[0,-1],[-1,-1],[-1,0],[-1,1],[0,1]];
    return offsets
        .map(([dq, dr]) => ({ q: q + dq, r: r + dr }))
        .filter(n => n.q >= 0 && n.q < width && n.r >= 0 && n.r < height);
}

function _getReachable(battle, startQ, startR, movement) {
    const reachable = [];
    const visited = new Set();
    const queue = [{ q: startQ, r: startR, cost: 0 }];
    visited.add(`${startQ},${startR}`);

    // Phase 17: 使用 TerrainMovement.getMoveCost 统一地形消耗查询
    while (queue.length > 0) {
        const cur = queue.shift();
        if (cur.cost > 0) reachable.push(cur);
        for (const n of _getNeighbors(cur.q, cur.r, battle.width, battle.height)) {
            const key = `${n.q},${n.r}`;
            if (visited.has(key)) continue;
            const occupied = (battle.units || []).some(
                u => u.q === n.q && u.r === n.r && u.hp > 0
            );
            if (occupied) continue;
            const terrain = _getTerrain(battle, n.q, n.r);
            const cost = _getTerrainCost(terrain);
            const newCost = cur.cost + cost;
            if (newCost <= movement) {
                visited.add(key);
                queue.push({ q: n.q, r: n.r, cost: newCost });
            }
        }
    }
    return reachable;
}

/**
 * Phase 17: AI 伤害计算 — 使用 DamagePipe.calculate 完整管道
 * 包含 DKM 交叉碰撞公式：防具 damage_kind_modifiers 匹配 weaponType 触发减免
 * 不匹配则防具完全失效（multiplier = 1.0）
 */
function _aiCalcDamage(attacker, defender, battle) {
    const attackType = (attacker.ranged && attacker.ranged > 0) ? 'ranged' : 'melee';
    const terrain = _getTerrain(battle, defender.q, defender.r);
    const defenderTerrainDef = _getTerrainDefense(terrain);

    // Phase 17: 使用 DamagePipe 完整 13 阶段伤害管道
    const pipeResult = DamagePipe.calculate({
        attacker: {
            melee: attacker.melee || attacker.attack || 10,
            ranged: attacker.ranged || 0,
            attack: attacker.attack || 10,
            mobility: attacker.mobility || 3,
            weaponType: attacker.weaponType || 'kinetic',
            armorType: attacker.armorType || 'normal',
            shield: attacker.shield || 0,
            buffs: attacker.buffs || [],
            skills: attacker.skills || [],
            equipment: attacker.equipment || {},
            z: attacker.z || 0,
            height: attacker.height || 0
        },
        defender: {
            defense: defender.defense || 5,
            armorType: defender.armorType || 'normal',
            shield: defender.shield || 0,
            resistance: 0,
            buffs: defender.buffs || [],
            equipment: defender.equipment || {},
            skills: defender.skills || [],
            mobility: defender.mobility || 3,
            terrain: terrain,
            terrainDefense: defenderTerrainDef,
            z: defender.z || 0,
            height: defender.height || 0
        },
        attack_type: attackType,
        sniper_mobility_reduction: 0,
        terrainDefs: {},
        is_manual_roll: false
    });

    const dmg = pipeResult.final_damage || 1;
    defender.hp = Math.max(0, defender.hp - dmg);
    const killed = defender.hp <= 0;

    // DKM 交叉碰撞乘数（从地形修正阶段反推）
    let dkmMult = 1.0;
    const attackerWt = attacker.weaponType || 'kinetic';
    if (defender.equipment?.full_armor?.damage_kind_modifiers) {
        const mods = defender.equipment.full_armor.damage_kind_modifiers;
        if (mods[attackerWt] !== undefined) dkmMult = mods[attackerWt];
    }

    return {
        dmg, killed, dkmMult,
        rawAtk: pipeResult.stages.base_attack || 10,
        effectiveDef: pipeResult.stages.defense?.total || 5,
        pipeResult
    };
}

// ============================================================
// 关卡启动
// ============================================================

function startCampaign(campaignId, playerUnits = []) {
    const campaign = getCampaign(campaignId);
    if (!campaign) return { success: false, error: `关卡 ${campaignId} 不存在` };

    const battleId = `campaign_${campaignId}_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
    const battle = createBattle(battleId, {
        name: campaign.name,
        width: campaign.map.width || 10,
        height: campaign.map.height || 8
    });

    // 填充完整地形网格
    const terrainMap = {};
    if (campaign.map.terrain) {
        for (const [key, val] of Object.entries(campaign.map.terrain)) {
            terrainMap[key] = val;
        }
    }
    for (let r = 0; r < battle.height; r++) {
        for (let q = 0; q < battle.width; q++) {
            const key = `${q},${r}`;
            battle.cells.push({ q, r, terrain: terrainMap[key] || 'moon' });
        }
    }

    // 部署玩家单位
    const spawnZones = campaign.player_spawn_zones || [{ q: 0, r: 4 }];
    const deployedPlayers = [];
    for (let i = 0; i < playerUnits.length; i++) {
        const pu = playerUnits[i];
        const spawn = spawnZones[i % spawnZones.length];
        const unitData = {
            id: pu.id || `player_${i}`, unit_id: pu.id || `player_${i}`,
            name: pu.name || `Unit ${i+1}`, faction: pu.faction || 'earth',
            q: spawn.q, r: spawn.r,
            hp: pu.hp || pu.max_hp || 100, max_hp: pu.max_hp || pu.hp || 100,
            attack: pu.attack || 10, melee: pu.melee || pu.attack || 10,
            ranged: pu.ranged || 0, defense: pu.defense || 5,
            mobility: pu.mobility || 3, weaponType: pu.weaponType || 'kinetic',
            armorType: pu.armorType || 'normal', shield: pu.shield || 0,
            level: pu.level || 1, equipment: pu.equipment || {},
            skills: pu.skills || [], has_acted: false, has_moved: false, buffs: []
        };
        deployUnit(battleId, unitData);
        deployedPlayers.push(unitData);
    }

    // 部署敌方单位
    const deployedEnemies = [];
    for (const enemy of campaign.enemy_units || []) {
        const enemyData = {
            id: enemy.id, unit_id: enemy.id,
            name: enemy.name || 'Enemy', faction: enemy.faction || 'maxion',
            q: enemy.q || 5, r: enemy.r || 3,
            hp: enemy.hp || enemy.max_hp || 80, max_hp: enemy.max_hp || enemy.hp || 80,
            attack: enemy.attack || 10, melee: enemy.melee || enemy.attack || 10,
            ranged: enemy.ranged || 0, defense: enemy.defense || 5,
            mobility: enemy.mobility || 3, weaponType: enemy.weaponType || 'kinetic',
            armorType: enemy.armorType || 'normal', shield: enemy.shield || 0,
            level: enemy.level || 2, equipment: enemy.equipment || {},
            skills: enemy.skills || [], has_acted: false, has_moved: false, buffs: []
        };
        deployUnit(battleId, enemyData);
        deployedEnemies.push(enemyData);
    }

    // 初始化阶段状态
    const session = {
        campaignId, battleId, currentStageIndex: 0,
        currentStageId: campaign.stages?.[0]?.id || null,
        stages: campaign.stages || [], started: new Date().toISOString(),
        completed: false, stageCompleted: [],
        playerUnits: deployedPlayers, enemyUnits: deployedEnemies
    };
    campaignSessions.set(campaignId, session);

    battle.phase = 'combat';
    addLog(battleId, 'SYSTEM', '战役教学模式开始！');

    return {
        success: true, battleId,
        campaignState: {
            campaignId, currentStageIndex: 0,
            currentStage: campaign.stages?.[0] || null,
            stageCount: campaign.stages?.length || 0,
            playerUnits: deployedPlayers.length,
            enemyUnits: deployedEnemies.length
        },
        stages: campaign.stages
    };
}

// ============================================================
// 阶段推进引擎
// ============================================================

function checkStageProgress(campaignId) {
    const session = campaignSessions.get(campaignId);
    if (!session) return { stageChanged: false, error: '战役会话不存在' };
    if (session.completed) return { stageChanged: false, completed: true };

    const campaign = getCampaign(campaignId);
    if (!campaign) return { stageChanged: false, error: '关卡配置不存在' };

    const battle = getBattle(session.battleId);
    if (!battle) return { stageChanged: false, error: '战场不存在' };

    const currentStage = campaign.stages[session.currentStageIndex];
    if (!currentStage) return checkVictory(campaignId);

    const terrainState = {};
    for (const cell of battle.cells) {
        terrainState[`${cell.q},${cell.r}`] = cell.terrain || 'moon';
    }

    const triggerResults = [];
    let allTriggersMet = true;

    for (const condition of currentStage.trigger_conditions || []) {
        let met = false, detail = '';
        switch (condition.type) {
            case 'terrain_transformed': {
                const key = `${condition.cell_q},${condition.cell_r}`;
                const ct = terrainState[key] || 'moon';
                met = (ct === condition.to_terrain);
                detail = `地形(${condition.cell_q},${condition.cell_r}): ${ct} ${met?'==':'!='} ${condition.to_terrain}`;
                break;
            }
            case 'all_enemies_defeated': {
                const enemies = battle.units.filter(u => u.faction !== 'earth' && u.hp > 0);
                met = enemies.length === 0;
                detail = `剩余敌方: ${enemies.length}`;
                break;
            }
            case 'all_player_units_defeated': {
                const players = battle.units.filter(u => u.faction === 'earth' && u.hp > 0);
                met = players.length === 0;
                detail = `剩余玩家: ${players.length}`;
                break;
            }
            default:
                met = false;
                detail = `未知条件: ${condition.type}`;
        }
        triggerResults.push({ condition: condition.type, met, detail });
        if (!met) allTriggersMet = false;
    }

    if (allTriggersMet && session.currentStageIndex < campaign.stages.length - 1) {
        const completedStage = campaign.stages[session.currentStageIndex];
        session.stageCompleted.push(completedStage.id);
        session.currentStageIndex++;
        const nextStage = campaign.stages[session.currentStageIndex];
        session.currentStageId = nextStage.id;
        addLog(session.battleId, 'CAMPAIGN', `阶段推进: ${completedStage.name} → ${nextStage.name}`);
        return {
            stageChanged: true, previousStage: completedStage,
            currentStage: nextStage, currentStageIndex: session.currentStageIndex,
            completed: false, triggerResults,
            onCompleteMessage: completedStage.on_complete || ''
        };
    }

    if (allTriggersMet && session.currentStageIndex >= campaign.stages.length - 1) {
        const lastStage = campaign.stages[session.currentStageIndex];
        session.stageCompleted.push(lastStage.id);
        session.completed = true;
        addLog(session.battleId, 'CAMPAIGN', '所有教学阶段完成！');
        battle.phase = 'ended';
        return {
            stageChanged: true, previousStage: lastStage,
            currentStage: null, currentStageIndex: -1,
            completed: true, victory: true, triggerResults,
            onCompleteMessage: lastStage.on_complete || '教学关卡全部完成！',
            rewards: campaign.rewards || {}
        };
    }

    return {
        stageChanged: false, currentStage,
        currentStageIndex: session.currentStageIndex,
        completed: false, triggerResults
    };
}

function checkVictory(campaignId) {
    const session = campaignSessions.get(campaignId);
    if (!session) return { victory: false, error: '会话不存在' };
    const campaign = getCampaign(campaignId);
    const battle = getBattle(session.battleId);
    if (!battle) return { victory: false, error: '战场不存在' };

    if (campaign?.victory_condition?.type === 'all_enemies_defeated') {
        const alive = battle.units.filter(u => u.faction !== 'earth' && u.hp > 0);
        if (alive.length === 0) {
            session.completed = true;
            battle.phase = 'ended';
            return { victory: true, message: '所有敌方单位已被歼灭！', rewards: campaign.rewards || {} };
        }
    }
    if (campaign?.defeat_condition?.type === 'all_player_units_defeated') {
        const alive = battle.units.filter(u => u.faction === 'earth' && u.hp > 0);
        if (alive.length === 0) {
            session.completed = true;
            battle.phase = 'ended';
            return { victory: false, defeat: true, message: '所有己方单位被击毁。' };
        }
    }
    return { victory: false, defeat: false, inProgress: true };
}

// ============================================================
// 单机战斗操作
// ============================================================

function executeCampaignAttack(campaignId, attackerId, defenderId, options = {}) {
    const session = campaignSessions.get(campaignId);
    if (!session) return { success: false, error: '战役会话不存在' };
    const battle = getBattle(session.battleId);
    if (!battle) return { success: false, error: '战场不存在' };
    if (battle.phase !== 'combat') return { success: false, error: '非战斗阶段' };

    const attacker = battle.units.find(u => u.id === attackerId || u.unit_id === attackerId);
    const defender = battle.units.find(u => u.id === defenderId || u.unit_id === defenderId);
    if (!attacker || !defender) return { success: false, error: '单位不存在' };
    if (attacker.hp <= 0 || defender.hp <= 0) return { success: false, error: '单位已阵亡' };
    if (attacker.has_acted) return { success: false, error: '本回合已行动' };

    const attackType = options.attack_type || 'melee';
    const combatResolver = new CombatResolver();
    combatResolver.init(battle, battle.units.filter(u => u.hp > 0));

    try {
        const turnResult = combatResolver.executeTurn(attacker, defender, {
            turn: battle.currentTurn || 1,
            attack_type: attackType,
            skill_id: options.skill_id,
            enableAmbush: false
        });
        addLog(session.battleId, 'ATTACK',
            `${attacker.name} → ${defender.name}: ${turnResult.final_damage || 0} 伤害`);

        // 地形破坏检查
        let terrainResult = null;
        if (defender.q !== undefined && defender.r !== undefined && battle.cells) {
            const targetCell = battle.cells.find(c => c.q === defender.q && c.r === defender.r);
            if (targetCell?.terrain === 'city_building') {
                const dk = turnResult.damage_pipe?.damage_kind || 'kinetic';
                if (dk === 'explosive') {
                    targetCell.terrain = 'rubble';
                    terrainResult = {
                        terrainDestroyed: true, from: 'city_building', to: 'rubble',
                        cell: { q: defender.q, r: defender.r },
                        message: '城市建筑被爆破拆除！变为废墟地形。'
                    };
                    addLog(session.battleId, 'TERRAIN', `城市建筑(${defender.q},${defender.r}) → 废墟`);
                }
            }
        }

        const stageCheck = checkStageProgress(campaignId);
        return {
            success: true, attack_type: attackType,
            final_damage: turnResult.final_damage || 0,
            damage_pipe: turnResult.damage_pipe || {},
            terrainResult,
            campaignProgress: {
                currentStageIndex: stageCheck.currentStageIndex,
                stageChanged: stageCheck.stageChanged,
                completed: stageCheck.completed,
                victory: stageCheck.victory,
                onCompleteMessage: stageCheck.onCompleteMessage || ''
            }
        };
    } catch (err) {
        // CombatResolver 失败时使用简化计算
        const { dmg } = _aiCalcDamage(attacker, defender, battle);
        addLog(session.battleId, 'ATTACK_SIMPLE',
            `${attacker.name} → ${defender.name}: ${dmg} 伤害 (简化)`);
        const stageCheck = checkStageProgress(campaignId);
        return {
            success: true, attack_type: attackType,
            final_damage: dmg, simplified: true,
            campaignProgress: {
                currentStageIndex: stageCheck.currentStageIndex,
                stageChanged: stageCheck.stageChanged,
                completed: stageCheck.completed,
                victory: stageCheck.victory,
                onCompleteMessage: stageCheck.onCompleteMessage || ''
            }
        };
    }
}

function executeCampaignTerrainAttack(campaignId, attackerId, targetQ, targetR) {
    const session = campaignSessions.get(campaignId);
    if (!session) return { success: false, error: '战役会话不存在' };
    const battle = getBattle(session.battleId);
    if (!battle) return { success: false, error: '战场不存在' };
    if (battle.phase !== 'combat') return { success: false, error: '非战斗阶段' };

    const attacker = battle.units.find(u => u.id === attackerId || u.unit_id === attackerId);
    if (!attacker || attacker.hp <= 0) return { success: false, error: '攻击方不可用' };
    if (attacker.has_acted) return { success: false, error: '本回合已行动' };

    const dist = hexDistance(attacker.q, attacker.r, targetQ, targetR);
    if (dist > 1) return { success: false, error: `目标距离 ${dist} > 1` };

    const targetCell = battle.cells.find(c => c.q === targetQ && c.r === targetR);
    if (!targetCell) return { success: false, error: '格子不存在' };

    const terrainId = targetCell.terrain || 'moon';
    let damageKind = 'kinetic';
    if (attacker.equipment?.right_hand?.damage_kind) {
        damageKind = attacker.equipment.right_hand.damage_kind;
    }

    // 读取地形定义
    let terrainDefs = {};
    try {
        const glossaryPath = path.resolve(__dirname, '../config/glossary-skill-config.json');
        const glossary = JSON.parse(fs.readFileSync(glossaryPath, 'utf-8'));
        terrainDefs = glossary.terrains || {};
    } catch (e) { /* fallback */ }

    const terrainDef = terrainDefs[terrainId];
    if (!terrainDef?.is_destructible) {
        return {
            success: true, terrainDestroyed: false, terrainId,
            message: `${terrainDef?.name || terrainId} 不可破坏`, damageKind
        };
    }

    const dkm = terrainDef.damage_kind_modifiers || {};
    const multiplier = dkm[damageKind] || 1.0;
    const baseDamage = attacker.attack || attacker.melee || 10;
    const effectiveDamage = Math.floor(baseDamage * multiplier);

    if (!battle._terrainHp) battle._terrainHp = {};
    const cellKey = `${targetQ},${targetR}`;
    if (battle._terrainHp[cellKey] === undefined) {
        battle._terrainHp[cellKey] = terrainDef.max_hp || 1;
    }
    battle._terrainHp[cellKey] -= effectiveDamage;

    let destroyed = false, newTerrain = terrainId;
    if (battle._terrainHp[cellKey] <= 0) {
        newTerrain = terrainDef.destroyed_transform_to || 'rubble';
        targetCell.terrain = newTerrain;
        delete battle._terrainHp[cellKey];
        destroyed = true;
    }

    attacker.has_acted = true;
    battle.updated = new Date().toISOString();
    addLog(session.battleId, 'TERRAIN_ATTACK',
        `${attacker.name} 攻击(${targetQ},${targetR}) [${damageKind}] → ${destroyed ? '摧毁' : '受损'}`);

    const stageCheck = checkStageProgress(campaignId);
    return {
        success: true, terrainDestroyed: destroyed,
        terrainId, newTerrain, damageKind, effectiveDamage, multiplier,
        message: destroyed
            ? `${terrainDef.name} 被摧毁 → ${newTerrain}`
            : `受损: ${effectiveDamage}, 剩余HP: ${battle._terrainHp[cellKey]}`,
        campaignProgress: {
            currentStageIndex: stageCheck.currentStageIndex,
            stageChanged: stageCheck.stageChanged,
            completed: stageCheck.completed,
            victory: stageCheck.victory,
            onCompleteMessage: stageCheck.onCompleteMessage || ''
        }
    };
}

function executeCampaignMove(campaignId, unitId, targetQ, targetR) {
    const session = campaignSessions.get(campaignId);
    if (!session) return { success: false, error: '战役会话不存在' };
    try {
        const result = moveUnit(session.battleId, unitId, targetQ, targetR);
        return { success: true, ...result };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

// ============================================================
// Phase 17: AI 战术引擎
// ============================================================

function executeAIEnemyTurn(campaignId) {
    const session = campaignSessions.get(campaignId);
    if (!session) return { success: false, error: 'Campaign session not found' };
    const battle = getBattle(session.battleId);
    if (!battle) return { success: false, error: 'Battle not found' };

    const enemies = battle.units.filter(u => u.faction !== 'earth' && u.hp > 0);
    const players = battle.units.filter(u => u.faction === 'earth' && u.hp > 0);
    if (players.length === 0) return { success: true, actions: [], message: 'No player units' };

    const actions = [];

    for (const enemy of enemies) {
        let target = null, minDist = Infinity;
        for (const p of players) {
            if (p.hp <= 0) continue;
            const d = hexDistance(enemy.q, enemy.r, p.q, p.r);
            if (d < minDist) { minDist = d; target = p; }
        }
        if (!target) continue;

        const weaponRange = (enemy.ranged && enemy.ranged > 0)
            ? Math.max(2, Math.ceil(enemy.ranged / 3))
            : 1;

        // 步骤1: 开火判定
        if (minDist <= weaponRange) {
            const { dmg, killed } = _aiCalcDamage(enemy, target, battle);
            const atkType = (enemy.ranged && enemy.ranged > 0) ? 'ranged' : 'melee';
            addLog(session.battleId, 'AI_ATTACK',
                `[AI] ${enemy.name} → ${target.name}: ${dmg}伤害${killed?' [击毁]':''}`);
            actions.push({
                unit: enemy.name, unitId: enemy.id,
                action: 'attack', attackType: atkType,
                target: target.name, targetId: target.id,
                damage: dmg, targetHp: target.hp,
                targetMaxHp: target.max_hp, killed,
                detail: `[开火] ${enemy.name} (${atkType}) → ${target.name}: ${dmg}伤害${killed?' [击毁]':''}`
            });
            continue;
        }

        // 步骤2: 智能寻路
        const reachable = _getReachable(battle, enemy.q, enemy.r, enemy.mobility || 3);
        if (reachable.length === 0) {
            actions.push({
                unit: enemy.name, unitId: enemy.id,
                action: 'stuck', detail: `[困住] ${enemy.name} 无路可走，原地待命`
            });
            continue;
        }

        reachable.sort((a, b) => {
            const da = hexDistance(a.q, a.r, target.q, target.r);
            const db = hexDistance(b.q, b.r, target.q, target.r);
            if (da !== db) return da - db;
            const ta = _getTerrain(battle, a.q, a.r);
            const tb = _getTerrain(battle, b.q, b.r);
            return _getTerrainDefense(tb) - _getTerrainDefense(ta);
        });

        const best = reachable[0];
        const oldQ = enemy.q, oldR = enemy.r;
        const newTerrain = _getTerrain(battle, best.q, best.r);
        enemy.q = best.q;
        enemy.r = best.r;
        addLog(session.battleId, 'AI_MOVE',
            `[AI] ${enemy.name} (${oldQ},${oldR})→(${best.q},${best.r}) [${newTerrain}]`);

        actions.push({
            unit: enemy.name, unitId: enemy.id,
            action: 'move',
            fromQ: oldQ, fromR: oldR, toQ: best.q, toR: best.r,
            terrain: newTerrain,
            detail: `[行军] ${enemy.name} (${oldQ},${oldR}) → (${best.q},${best.r}) [${newTerrain}]`
        });

        // 步骤3: 移动后二次开火
        const newDist = hexDistance(best.q, best.r, target.q, target.r);
        if (newDist <= weaponRange) {
            const { dmg, killed } = _aiCalcDamage(enemy, target, battle);
            const atkType = (enemy.ranged && enemy.ranged > 0) ? 'ranged' : 'melee';
            addLog(session.battleId, 'AI_ATTACK',
                `[AI] ${enemy.name}(移动后) → ${target.name}: ${dmg}伤害${killed?' [击毁]':''}`);
            actions.push({
                unit: enemy.name, unitId: enemy.id,
                action: 'attack_after_move', attackType: atkType,
                target: target.name, targetId: target.id,
                damage: dmg, targetHp: target.hp,
                targetMaxHp: target.max_hp, killed,
                detail: `[行军后开火] ${enemy.name} → ${target.name}: ${dmg}伤害${killed?' [击毁]':''}`
            });
        }
    }

    addLog(session.battleId, 'AI_TURN',
        `[AI] 回合结束: ${enemies.length}敌机, ${actions.length}操作`);

    return { success: true, actions, enemyCount: enemies.length };
}

// ============================================================
// 结束回合 (含 AI)
// ============================================================

function executeCampaignEndTurn(campaignId) {
    const session = campaignSessions.get(campaignId);
    if (!session) return { success: false, error: '战役会话不存在' };

    try {
        const result = endTurn(session.battleId);

        // Phase 17: 敌方 AI 自动执行
        const aiResult = executeAIEnemyTurn(campaignId);

        // 检查阶段推进
        const stageCheck = checkStageProgress(campaignId);

        return {
            success: true,
            turn: result.turn,
            aiTurn: aiResult,
            campaignProgress: {
                currentStageId: stageCheck.currentStage?.id || null,
                currentStageIndex: stageCheck.currentStageIndex,
                stageChanged: stageCheck.stageChanged,
                completed: stageCheck.completed,
                victory: stageCheck.victory,
                onCompleteMessage: stageCheck.onCompleteMessage || ''
            }
        };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

// ============================================================
// 状态查询与清理
// ============================================================

function getCampaignBattleState(campaignId) {
    const session = campaignSessions.get(campaignId);
    if (!session) return null;
    const battle = getBattle(session.battleId);
    if (!battle) return null;

    const campaign = getCampaign(campaignId);
    const currentStage = session.currentStageIndex < (campaign?.stages?.length || 0)
        ? campaign.stages[session.currentStageIndex]
        : null;

    return {
        battleState: battle,
        campaign: {
            campaignId, currentStage, currentStageIndex: session.currentStageIndex,
            completed: session.completed,
            stageCompleted: session.stageCompleted || [],
            started: session.started
        }
    };
}

function cleanupCampaign(campaignId) {
    const session = campaignSessions.get(campaignId);
    if (session) {
        deleteBattle(session.battleId);
        campaignSessions.delete(campaignId);
        return true;
    }
    return false;
}

// ============================================================
// 导出
// ============================================================

export {
    loadCampaignConfig, getCampaign, listCampaigns,
    getCampaignSession, startCampaign, checkStageProgress, checkVictory,
    executeCampaignAttack, executeCampaignTerrainAttack,
    executeCampaignMove, executeCampaignEndTurn,
    executeAIEnemyTurn,
    getCampaignBattleState, cleanupCampaign
};
