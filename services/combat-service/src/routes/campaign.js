/**
 * campaign.js - 剧情战役路由 (Phase 15)
 *
 * 处理战役列表、启动关卡、攻击/移动/回合、状态查询、阶段推进。
 * 所有端点均在单机沙盒容器内运行，不依赖 WebSocket 广播。
 */
import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import {
    listCampaigns,
    getCampaign,
    startCampaign,
    executeCampaignAttack,
    executeCampaignTerrainAttack,
    executeCampaignMove,
    executeCampaignEndTurn,
    getCampaignBattleState,
    checkStageProgress,
    cleanupCampaign
} from '../services/campaignManager.js';

const router = Router();

// ============================================================
// 战役列表与详情
// ============================================================

/**
 * GET /api/campaign/list - 列出所有可用的剧情战役
 */
router.get('/list', authenticate, (req, res) => {
    const campaigns = listCampaigns();
    res.json({ success: true, campaigns, count: campaigns.length });
});

/**
 * GET /api/campaign/:campaignId - 获取单个战役详情
 */
router.get('/:campaignId', authenticate, (req, res) => {
    const campaign = getCampaign(req.params.campaignId);
    if (!campaign) {
        return res.status(404).json({ success: false, error: `关卡 ${req.params.campaignId} 不存在` });
    }

    // 返回安全的配置（不含敌方单位完整数据，避免玩家窥屏）
    res.json({
        success: true,
        campaign: {
            id: campaign.id,
            name: campaign.name,
            chapter: campaign.chapter,
            chapter_name: campaign.chapter_name,
            description: campaign.description,
            difficulty: campaign.difficulty,
            stage_count: campaign.stages?.length || 0,
            stages: (campaign.stages || []).map(s => ({
                id: s.id,
                order: s.order,
                name: s.name,
                narrative: s.narrative
            })),
            rewards: campaign.rewards
        }
    });
});

// ============================================================
// 关卡启动
// ============================================================

/**
 * POST /api/campaign/:campaignId/start - 启动战役关卡，创建沙盒战场
 *
 * Body: { playerUnits: [{ id, name, ... }] }
 */
router.post('/:campaignId/start', authenticate, (req, res) => {
    try {
        const { playerUnits } = req.body;

        if (!playerUnits || !Array.isArray(playerUnits) || playerUnits.length === 0) {
            return res.status(400).json({
                success: false,
                error: '请至少提供一个玩家单位进行部署'
            });
        }

        const result = startCampaign(req.params.campaignId, playerUnits);

        if (!result.success) {
            return res.status(400).json(result);
        }

        res.status(201).json(result);
    } catch (err) {
        console.error('[Campaign Start] 错误:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================================
// 单机战斗操作
// ============================================================

/**
 * POST /api/campaign/:campaignId/attack - 执行单机攻击
 *
 * Body: { attacker_id, defender_id, attack_type, skill_id }
 */
router.post('/:campaignId/attack', authenticate, (req, res) => {
    try {
        const { attacker_id, defender_id, attack_type, skill_id } = req.body;

        if (!attacker_id || !defender_id) {
            return res.status(400).json({ success: false, error: '缺少 attacker_id 或 defender_id' });
        }

        const result = executeCampaignAttack(req.params.campaignId, attacker_id, defender_id, {
            attack_type: attack_type || 'melee',
            skill_id
        });

        res.json(result);
    } catch (err) {
        console.error('[Campaign Attack] 错误:', err.message);
        res.status(400).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/campaign/:campaignId/attack-terrain - 攻击地形（可破坏建筑/障碍物）
 *
 * Body: { unit_id, q, r }
 */
router.post('/:campaignId/attack-terrain', authenticate, (req, res) => {
    try {
        const { unit_id, q, r } = req.body;

        if (!unit_id || q === undefined || r === undefined) {
            return res.status(400).json({ success: false, error: '缺少 unit_id 或目标坐标 q/r' });
        }

        const result = executeCampaignTerrainAttack(
            req.params.campaignId,
            unit_id,
            parseInt(q),
            parseInt(r)
        );

        res.json(result);
    } catch (err) {
        console.error('[Campaign TerrainAttack] 错误:', err.message);
        res.status(400).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/campaign/:campaignId/move - 移动单位
 *
 * Body: { unit_id, q, r }
 */
router.post('/:campaignId/move', authenticate, (req, res) => {
    try {
        const { unit_id, q, r } = req.body;

        if (!unit_id || q === undefined || r === undefined) {
            return res.status(400).json({ success: false, error: '缺少 unit_id 或目标坐标 q/r' });
        }

        const result = executeCampaignMove(req.params.campaignId, unit_id, q, r);
        res.json(result);
    } catch (err) {
        console.error('[Campaign Move] 错误:', err.message);
        res.status(400).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/campaign/:campaignId/end-turn - 结束当前回合
 */
router.post('/:campaignId/end-turn', authenticate, (req, res) => {
    try {
        const result = executeCampaignEndTurn(req.params.campaignId);
        res.json(result);
    } catch (err) {
        console.error('[Campaign EndTurn] 错误:', err.message);
        res.status(400).json({ success: false, error: err.message });
    }
});

// ============================================================
// 状态查询
// ============================================================

/**
 * GET /api/campaign/:campaignId/state - 获取战役战场完整状态
 */
router.get('/:campaignId/state', authenticate, (req, res) => {
    const state = getCampaignBattleState(req.params.campaignId);
    if (!state) {
        return res.status(404).json({ success: false, error: '战役会话不存在，请先启动关卡' });
    }
    res.json({ success: true, ...state });
});

/**
 * GET /api/campaign/:campaignId/progress - 查询阶段推进状态
 */
router.get('/:campaignId/progress', authenticate, (req, res) => {
    const result = checkStageProgress(req.params.campaignId);
    res.json({ success: true, ...result });
});

/**
 * POST /api/campaign/:campaignId/cleanup - 清理战役会话
 */
router.post('/:campaignId/cleanup', authenticate, (req, res) => {
    const cleaned = cleanupCampaign(req.params.campaignId);
    res.json({ success: cleaned });
});

export default router;
