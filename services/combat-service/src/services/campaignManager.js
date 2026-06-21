/**
 * campaignManager.js — 剧情战役管理器 v1.0 (Phase 15 单机沙盒中枢)
 *
 * 职责：
 *   1. 加载 campaigns.json 配置表
 *   2. 创建单机沙盒战场实例（注入固定地图 + 敌方AI + 装备DKM）
 *   3. 阶段推进引擎：检测 trigger_conditions → 推进剧本
 *   4. 单机隔离：拦截 WebSocket 广播，战斗闭环在单机容器内
 *   5. 胜利/失败判定
 *
 * 核心设计原则：
 *   - 配置表驱动：固定关卡通过 JSON 定义沙盒初始化状态
 *   - 无状态阶段机：每回合结束检查触发条件，自动推进
 *   - 零外部依赖：不依赖联机对战服务，完全单机闭环
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { BattleState } from '../state/battleState.js';
import { CombatResolver } from '../services/combatResolver.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_PATH = path.resolve(__dirname, '../config/campaigns.json');

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
        id: c.id,
        name: c.name,
        chapter: c.chapter,
        chapter_name: c.chapter_name,
        description: c.description,
        difficulty: c.difficulty,
        stage_count: (c.stages || []).length
    }));
}

// ============================================================
// 战役状态追踪（内存）
// ============================================================

/** @type {Map<string, Object>} campaignId -> { battleId, currentStage, stages, started, completed } */
const campaignSessions = new Map();

/**
 * 获取战役会话状态
 */
function getCampaignSession(campaignId) {
    return campaignSessions.get(campaignId) || null;
}

/**
 * 启动战役关卡：创建沙盒战场 + 部署敌方单位
 *
 * @param {string} campaignId - 关卡ID
 * @param {Array} playerUnits - 玩家部署的单位数据
 * @returns {Object} { success, battleId, campaignState, stages }
 */
function startCampaign(campaignId, playerUnits = []) {
    const campaign = getCampaign(campaignId);
    if (!campaign) {
        return { success: false, error: `关卡 ${campaignId} 不存在` };
    }

    // 1. 创建沙盒战场
    const battleId = `campaign_${campaignId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const battleConfig = {
        name: campaign.name,
        width: campaign.map.width || 10,
        height: campaign.map.height || 8,
        fogOfWar: false,
        terrain: campaign.map.terrain
    };

    const battle = BattleState.createBattle(battleId, battleConfig);

    // 1.5 填充完整地形网格（未定义的格子默认 moon）
    const existingTerrainMap = {};
    for (const cell of battle.cells) {
        existingTerrainMap[`${cell.q},${cell.r}`] = cell.terrain;
    }
    battle.cells = [];
    for (let r = 0; r < battle.height; r++) {
        for (let q = 0; q < battle.width; q++) {
            const key = `${q},${r}`;
            battle.cells.push({
                q, r,
                terrain: existingTerrainMap[key] || 'moon'
            });
        }
    }

    // 2. 部署玩家单位
    const spawnZones = campaign.player_spawn_zones || [{ q: 0, r: 4 }];
    const deployedPlayerUnits = [];

    for (let i = 0; i < playerUnits.length; i++) {
        const pu = playerUnits[i];
        const spawn = spawnZones[i % spawnZones.length];

        const unitData = {
            id: pu.id || `player_${i}`,
            unit_id: pu.id || `player_${i}`,
            name: pu.name || `Unit ${i + 1}`,
            player_id: 1,
            faction: pu.faction || 'earth',
            q: spawn.q,
            r: spawn.r,
            hp: pu.hp || pu.max_hp || 100,
            max_hp: pu.max_hp || pu.hp || 100,
            attack: pu.attack || 10,
            melee: pu.melee || pu.attack || 10,
            ranged: pu.ranged || 0,
            defense: pu.defense || 5,
            mobility: pu.mobility || 3,
            weaponType: pu.weaponType || 'kinetic',
            armorType: pu.armorType || 'normal',
            shield: pu.shield || 0,
            level: pu.level || 1,
            equipment: pu.equipment || {},
            skills: pu.skills || [],
            has_acted: false,
            has_moved: false,
            buffs: []
        };

        const result = BattleState.deployUnit(battleId, unitData);
        if (result.success) {
            deployedPlayerUnits.push(unitData);
        }
    }

    // 3. 部署敌方单位（从配置表生成）
    const deployedEnemyUnits = [];
    for (const enemy of campaign.enemy_units || []) {
        const enemyData = {
            id: enemy.id,
            unit_id: enemy.id,
            name: enemy.name || 'Enemy',
            player_id: 2,
            faction: enemy.faction || 'maxion',
            q: enemy.q || 5,
            r: enemy.r || 3,
            hp: enemy.hp || enemy.max_hp || 80,
            max_hp: enemy.max_hp || enemy.hp || 80,
            attack: enemy.attack || 10,
            melee: enemy.melee || enemy.attack || 10,
            ranged: enemy.ranged || 0,
            defense: enemy.defense || 5,
            mobility: enemy.mobility || 3,
            weaponType: enemy.weaponType || 'kinetic',
            armorType: enemy.armorType || 'normal',
            shield: enemy.shield || 0,
            level: enemy.level || 2,
            equipment: enemy.equipment || {},
            skills: enemy.skills || [],
            has_acted: false,
            has_moved: false,
            buffs: []
        };

        const result = BattleState.deployUnit(battleId, enemyData);
        if (result.success) {
            deployedEnemyUnits.push(enemyData);
        }
    }

    // 4. 初始化阶段状态
    const campaignState = {
        campaignId,
        battleId,
        currentStageIndex: 0,
        currentStageId: campaign.stages?.[0]?.id || null,
        stages: campaign.stages || [],
        started: new Date().toISOString(),
        completed: false,
        stageCompleted: [],
        playerUnits: deployedPlayerUnits,
        enemyUnits: deployedEnemyUnits
    };

    campaignSessions.set(campaignId, campaignState);

    // 5. 开始战斗阶段
    battle.phase = 'combat';
    battle.log.push('[阶段] 战役教学模式开始！');

    return {
        success: true,
        battleId,
        campaignState: {
            campaignId,
            currentStageIndex: 0,
            currentStage: campaign.stages?.[0] || null,
            stageCount: campaign.stages?.length || 0,
            playerUnits: deployedPlayerUnits.length,
            enemyUnits: deployedEnemyUnits.length
        },
        stages: campaign.stages
    };
}

// ============================================================
// 阶段推进引擎
// ============================================================

/**
 * 检查当前阶段触发条件，自动推进剧本
 *
 * @param {string} campaignId - 关卡ID
 * @returns {Object} { stageChanged, currentStage, completed, triggerResults }
 */
function checkStageProgress(campaignId) {
    const session = campaignSessions.get(campaignId);
    if (!session) {
        return { stageChanged: false, error: '战役会话不存在' };
    }

    if (session.completed) {
        return { stageChanged: false, completed: true };
    }

    const campaign = getCampaign(campaignId);
    if (!campaign) {
        return { stageChanged: false, error: '关卡配置不存在' };
    }

    const battleId = session.battleId;
    const state = BattleState.getBattle(battleId);
    if (!state) {
        return { stageChanged: false, error: '战场不存在' };
    }

    const currentStage = campaign.stages[session.currentStageIndex];
    if (!currentStage) {
        // 所有阶段已完成，触发胜利
        return checkVictory(campaignId);
    }

    // 获取当前战场地形状态
    const terrainState = {};
    if (state.cells) {
        for (const cell of state.cells) {
            terrainState[`${cell.q},${cell.r}`] = cell.terrain || 'moon';
        }
    }

    // 检查触发条件
    const triggerResults = [];
    let allTriggersMet = true;

    for (const condition of currentStage.trigger_conditions || []) {
        let met = false;
        let detail = '';

        switch (condition.type) {
            case 'terrain_transformed': {
                const key = `${condition.cell_q},${condition.cell_r}`;
                const currentTerrain = terrainState[key] || 'moon';
                met = (currentTerrain === condition.to_terrain);
                detail = `地形(${condition.cell_q},${condition.cell_r}): ${currentTerrain} ${met ? '==' : '!='} ${condition.to_terrain}`;
                break;
            }
            case 'all_enemies_defeated': {
                const enemies = state.units.filter(u => u.faction !== 'earth' && u.hp > 0);
                met = enemies.length === 0;
                detail = `剩余敌方单位: ${enemies.length}`;
                break;
            }
            case 'all_player_units_defeated': {
                const players = state.units.filter(u => u.faction === 'earth' && u.hp > 0);
                met = players.length === 0;
                detail = `剩余玩家单位: ${players.length}`;
                break;
            }
            default:
                met = false;
                detail = `未知触发条件: ${condition.type}`;
        }

        triggerResults.push({
            condition: condition.type,
            met,
            detail
        });

        if (!met) {
            allTriggersMet = false;
        }
    }

    // 如果所有触发条件满足，推进到下一阶段
    if (allTriggersMet && session.currentStageIndex < campaign.stages.length - 1) {
        const completedStage = campaign.stages[session.currentStageIndex];
        session.stageCompleted.push(completedStage.id);
        session.currentStageIndex++;

        const nextStage = campaign.stages[session.currentStageIndex];
        session.currentStageId = nextStage.id;

        // 记录阶段推进日志
        BattleState.addLog(battleId, 'CAMPAIGN', `阶段推进: ${completedStage.name} → ${nextStage.name}`);

        return {
            stageChanged: true,
            previousStage: completedStage,
            currentStage: nextStage,
            currentStageIndex: session.currentStageIndex,
            completed: false,
            triggerResults,
            onCompleteMessage: completedStage.on_complete || ''
        };
    }

    // 如果所有阶段都已完成（最后一个阶段的触发条件也满足）
    if (allTriggersMet && session.currentStageIndex >= campaign.stages.length - 1) {
        const lastStage = campaign.stages[session.currentStageIndex];
        session.stageCompleted.push(lastStage.id);
        session.completed = true;

        BattleState.addLog(battleId, 'CAMPAIGN', '所有教学阶段完成！');
        state.phase = 'ended';
        state.log.push(`[结束] 教学关卡完成！地球联合胜利`);

        return {
            stageChanged: true,
            previousStage: lastStage,
            currentStage: null,
            currentStageIndex: -1,
            completed: true,
            victory: true,
            triggerResults,
            onCompleteMessage: lastStage.on_complete || '教学关卡全部完成！',
            rewards: campaign.rewards || {}
        };
    }

    return {
        stageChanged: false,
        currentStage,
        currentStageIndex: session.currentStageIndex,
        completed: false,
        triggerResults
    };
}

/**
 * 检查胜利/失败条件
 */
function checkVictory(campaignId) {
    const session = campaignSessions.get(campaignId);
    if (!session) return { victory: false, error: '会话不存在' };

    const campaign = getCampaign(campaignId);
    const state = BattleState.getBattle(session.battleId);
    if (!state) return { victory: false, error: '战场不存在' };

    // 检查胜利条件
    if (campaign.victory_condition?.type === 'all_enemies_defeated') {
        const aliveEnemies = state.units.filter(u => u.faction !== 'earth' && u.hp > 0);
        if (aliveEnemies.length === 0) {
            session.completed = true;
            state.phase = 'ended';
            return {
                victory: true,
                message: '所有敌方单位已被歼灭！教学关卡完成。',
                rewards: campaign.rewards || {}
            };
        }
    }

    // 检查失败条件
    if (campaign.defeat_condition?.type === 'all_player_units_defeated') {
        const alivePlayers = state.units.filter(u => u.faction === 'earth' && u.hp > 0);
        if (alivePlayers.length === 0) {
            session.completed = true;
            state.phase = 'ended';
            return {
                victory: false,
                defeat: true,
                message: '所有己方单位被击毁。请重新挑战。'
            };
        }
    }

    return { victory: false, defeat: false, inProgress: true };
}

// ============================================================
// 单机沙盒：回合快速闭环
// ============================================================

/**
 * 在战役模式下执行单机攻击（不通过 WebSocket 广播）
 *
 * @param {string} campaignId - 关卡ID
 * @param {string} attackerId - 攻击方ID
 * @param {string} defenderId - 防御方ID
 * @param {Object} options - { attack_type, skill_id }
 * @returns {Object} 攻击结果 + 阶段检查
 */
function executeCampaignAttack(campaignId, attackerId, defenderId, options = {}) {
    const session = campaignSessions.get(campaignId);
    if (!session) return { success: false, error: '战役会话不存在' };

    const battleId = session.battleId;
    const state = BattleState.getBattle(battleId);
    if (!state) return { success: false, error: '战场不存在' };
    if (state.phase !== 'combat') return { success: false, error: '当前不是战斗阶段' };

    const attacker = state.units.find(u => u.id === attackerId || u.unit_id === attackerId);
    const defender = state.units.find(u => u.id === defenderId || u.unit_id === defenderId);

    if (!attacker) return { success: false, error: '攻击方不存在' };
    if (!defender) return { success: false, error: '防御方不存在' };
    if (attacker.hp <= 0) return { success: false, error: '攻击方已阵亡' };
    if (defender.hp <= 0) return { success: false, error: '防御方已阵亡' };
    if (attacker.has_acted) return { success: false, error: '攻击方本回合已行动过' };

    const attackType = options.attack_type || 'melee';

    // 使用 CombatResolver 执行单机攻击
    const combatResolver = new CombatResolver();
    combatResolver.init(state, state.units.filter(u => u.hp > 0));

    const turnResult = combatResolver.executeTurn(attacker, defender, {
        turn: state.currentTurn || 1,
        attack_type: attackType,
        skill_id: options.skill_id,
        enableAmbush: false
    });

    // 记录攻击结果
    BattleState.recordAttack(battleId, attacker.id, defender.id, turnResult);

    // 攻击后检查阶段推进
    const stageCheck = checkStageProgress(campaignId);

    // 检查是否攻击的是地形（城市建筑等可破坏地形）
    let terrainResult = null;
    if (defender.q !== undefined && defender.r !== undefined && state.cells) {
        // 查找目标格子的地形
        const targetCell = state.cells.find(c => c.q === defender.q && c.r === defender.r);
        if (targetCell && targetCell.terrain === 'city_building') {
            // 检查是否使用了 explosive damage_kind
            const damageKind = turnResult.damage_pipe?.damage_kind || 'kinetic';
            if (damageKind === 'explosive') {
                // 更新地形
                targetCell.terrain = 'rubble';
                terrainResult = {
                    terrainDestroyed: true,
                    from: 'city_building',
                    to: 'rubble',
                    cell: { q: defender.q, r: defender.r },
                    message: '城市建筑被爆破拆除！变为废墟地形。'
                };
                BattleState.addLog(battleId, 'TERRAIN', `城市建筑(${defender.q},${defender.r}) → 废墟`);
            }
        }
    }

    return {
        success: true,
        attack_type: attackType,
        ...turnResult,
        terrainResult,
        campaignProgress: {
            currentStageId: stageCheck.currentStage?.id || null,
            currentStageIndex: stageCheck.currentStageIndex,
            stageChanged: stageCheck.stageChanged,
            completed: stageCheck.completed,
            victory: stageCheck.victory,
            onCompleteMessage: stageCheck.onCompleteMessage || ''
        }
    };
}

/**
 * 在战役模式下攻击地形（可破坏建筑、障碍物等）
 * 用于教学关卡 Stage 1：爆破城市建筑
 *
 * @param {string} campaignId - 关卡ID
 * @param {string} attackerId - 攻击方单位ID
 * @param {number} targetQ - 目标格子列坐标
 * @param {number} targetR - 目标格子行坐标
 * @returns {Object} 攻击结果 + 地形变化 + 阶段检查
 */
function executeCampaignTerrainAttack(campaignId, attackerId, targetQ, targetR) {
    const session = campaignSessions.get(campaignId);
    if (!session) return { success: false, error: '战役会话不存在' };

    const battleId = session.battleId;
    const state = BattleState.getBattle(battleId);
    if (!state) return { success: false, error: '战场不存在' };
    if (state.phase !== 'combat') return { success: false, error: '当前不是战斗阶段' };

    const attacker = state.units.find(u => u.id === attackerId || u.unit_id === attackerId);
    if (!attacker) return { success: false, error: '攻击方不存在' };
    if (attacker.hp <= 0) return { success: false, error: '攻击方已阵亡' };
    if (attacker.has_acted) return { success: false, error: '攻击方本回合已行动过' };

    // 检查目标距离（地形攻击必须是相邻格）
    const dq = Math.abs((attacker.q || 0) - targetQ);
    const dr = Math.abs((attacker.r || 0) - targetR);
    const ds = Math.abs(((attacker.q || 0) - targetQ) + ((attacker.r || 0) - targetR));
    const dist = Math.max(dq, dr, ds);

    if (dist > 1) {
        return { success: false, error: `目标地形距离 ${dist} 格，地形攻击需要相邻（1格内）` };
    }

    // 查找目标格子地形
    const targetCell = state.cells.find(c => c.q === targetQ && c.r === targetR);
    if (!targetCell) {
        return { success: false, error: `格子 (${targetQ},${targetR}) 不存在于战场中` };
    }

    const terrainId = targetCell.terrain || 'moon';

    // 确定攻击方的伤害类型
    let damageKind = 'kinetic';
    if (attacker.equipment) {
        // 优先使用右手武器的 damage_kind
        if (attacker.equipment.right_hand && attacker.equipment.right_hand.damage_kind) {
            damageKind = attacker.equipment.right_hand.damage_kind;
        } else {
            // 回退到 weaponType 映射
            const weaponType = attacker.weaponType || 'kinetic';
            damageKind = weaponType;
        }
    }

    // 获取地形定义
    const glossaryPath = path.resolve(__dirname, '../config/glossary-skill-config.json');
    let terrainDefs = {};
    try {
        const glossary = JSON.parse(fs.readFileSync(glossaryPath, 'utf-8'));
        terrainDefs = glossary.terrains || {};
    } catch (e) {
        console.warn('[CampaignManager] 无法读取 terrain 定义:', e.message);
    }

    const terrainDef = terrainDefs[terrainId];

    // 不可破坏的地形
    if (!terrainDef || !terrainDef.is_destructible) {
        return {
            success: true,
            terrainDestroyed: false,
            terrainId,
            terrainName: terrainDef?.name || terrainId,
            message: `${terrainDef?.name || terrainId} 地形不可破坏`,
            damageKind
        };
    }

    // 检查 damage_kind 对地形的破坏倍率
    const dkm = terrainDef.damage_kind_modifiers || {};
    const multiplier = dkm[damageKind] || 1.0;

    // 计算破坏伤害（使用攻击力作为基准）
    const baseDamage = attacker.attack || attacker.melee || 10;
    const effectiveDamage = Math.floor(baseDamage * multiplier);

    // 地形 HP 追踪（使用 battleState 的扩展字段）
    if (!state._terrainHp) state._terrainHp = {};
    const cellKey = `${targetQ},${targetR}`;
    if (state._terrainHp[cellKey] === undefined) {
        state._terrainHp[cellKey] = terrainDef.max_hp || 1;
    }

    state._terrainHp[cellKey] -= effectiveDamage;

    let terrainDestroyed = false;
    let newTerrain = terrainId;

    if (state._terrainHp[cellKey] <= 0) {
        // 地形被摧毁
        newTerrain = terrainDef.destroyed_transform_to || 'rubble';
        targetCell.terrain = newTerrain;
        delete state._terrainHp[cellKey];
        terrainDestroyed = true;
    }

    // 标记攻击方已行动
    attacker.has_acted = true;
    state.updated = new Date().toISOString();
    BattleState.addLog(battleId, 'TERRAIN_ATTACK',
        `${attacker.name} 攻击地形 (${targetQ},${targetR}) [${damageKind}] → ` +
        (terrainDestroyed ? `${terrainDef.name} → ${newTerrain}` : `残余HP ${state._terrainHp[cellKey]}`));

    // 攻击后检查阶段推进
    const stageCheck = checkStageProgress(campaignId);

    return {
        success: true,
        terrainDestroyed,
        terrainId: terrainId,
        newTerrain,
        terrainName: terrainDef.name,
        damageKind,
        baseDamage,
        effectiveDamage,
        multiplier,
        remainingHp: state._terrainHp[cellKey] || 0,
        message: terrainDestroyed
            ? `${terrainDef.name} 被 ${damageKind} 伤害摧毁！转变为 ${newTerrain}。`
            : `${terrainDef.name} 受损：${baseDamage} × ${multiplier} = ${effectiveDamage}，剩余 HP ${state._terrainHp[cellKey]}`,
        campaignProgress: {
            currentStageIndex: stageCheck.currentStageIndex,
            stageChanged: stageCheck.stageChanged,
            completed: stageCheck.completed,
            victory: stageCheck.victory,
            onCompleteMessage: stageCheck.onCompleteMessage || ''
        }
    };
}

/**
 * 在战役模式下移动单位
 */
function executeCampaignMove(campaignId, unitId, targetQ, targetR) {
    const session = campaignSessions.get(campaignId);
    if (!session) return { success: false, error: '战役会话不存在' };

    try {
        const result = BattleState.moveUnit(session.battleId, unitId, targetQ, targetR);
        return { success: true, ...result };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

/**
 * 在战役模式下结束回合（含阶段检查）
 */
function executeCampaignEndTurn(campaignId) {
    const session = campaignSessions.get(campaignId);
    if (!session) return { success: false, error: '战役会话不存在' };

    try {
        const result = BattleState.endTurn(session.battleId);

        // 回合结束后检查阶段推进
        const stageCheck = checkStageProgress(campaignId);

        return {
            success: true,
            ...result,
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

/**
 * 获取战役战场的完整状态
 */
function getCampaignBattleState(campaignId) {
    const session = campaignSessions.get(campaignId);
    if (!session) return null;

    const state = BattleState.getBattle(session.battleId);
    if (!state) return null;

    const campaign = getCampaign(campaignId);
    const currentStage = session.currentStageIndex < (campaign?.stages?.length || 0)
        ? campaign.stages[session.currentStageIndex]
        : null;

    return {
        battleState: state,
        campaign: {
            campaignId,
            currentStage,
            currentStageIndex: session.currentStageIndex,
            completed: session.completed,
            stageCompleted: session.stageCompleted || [],
            started: session.started
        }
    };
}

/**
 * 清理战役会话
 */
function cleanupCampaign(campaignId) {
    const session = campaignSessions.get(campaignId);
    if (session) {
        BattleState.deleteBattle(session.battleId);
        campaignSessions.delete(campaignId);
        return true;
    }
    return false;
}

export {
    loadCampaignConfig,
    getCampaign,
    listCampaigns,
    getCampaignSession,
    startCampaign,
    checkStageProgress,
    checkVictory,
    executeCampaignAttack,
    executeCampaignTerrainAttack,
    executeCampaignMove,
    executeCampaignEndTurn,
    getCampaignBattleState,
    cleanupCampaign
};
