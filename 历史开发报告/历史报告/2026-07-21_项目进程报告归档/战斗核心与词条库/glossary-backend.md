# 词条库后端 (glossary backend) 代码快照

> 生成时间：2026-07-20 ｜ 范围：gateway glossary 路由 + 配置加载器(configLoader.cjs) + 词条配置 JSON

## backend-gateway/src/routes/glossary.ts

```ts
/**
 * Phase 29-Debug — 词条库独立路由
 *
 * 脱离特定战斗 :battleId 沙盒语境，独立承载 glossary 读写端点。
 * 前端 GlossaryView 通过 /api/combat-glossary/config 自由读取、写入大厅规则配置。
 */

import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { authenticate } from '../middleware/auth.js';
import { UserRole, ErrorCode } from '@mecha/shared-kernel';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// 默认配置落地文件路径（容器内 data 目录）
const GLOSSARY_CONFIG_PATH = path.resolve(__dirname, '../../data/glossary-skill-config.json');

// 默认空配置骨架 — Phase 29-DataSecurity: 核心技能 is_public 锁死 true
const DEFAULT_CONFIG = {
  version: '5.0',
  is_public: true,
  review_status: 'approved',
  skills: {},
};

// 核心系统技能 — 硬编码只读公开
const CORE_SKILLS: Record<string, any> = {
  'melee_strike': {
    id: 'melee_strike', name: '近战打击', description: '基础近战攻击',
    is_public: true, review_status: 'approved',
    script: 'SELF→TARGET: DAMAGE_PHYSICAL flat=attack*1.0',
  },
  'ranged_shot': {
    id: 'ranged_shot', name: '远程射击', description: '基础远程攻击',
    is_public: true, review_status: 'approved',
    script: 'SELF→TARGET: DAMAGE_PHYSICAL flat=attack*0.8, range=3',
  },
  'shield_wall': {
    id: 'shield_wall', name: '护盾壁垒', description: '为自己添加护盾',
    is_public: true, review_status: 'approved',
    script: 'SELF: BUFF shield flat=shield*0.5',
  },
  'repair': {
    id: 'repair', name: '紧急修复', description: '回复自身生命值',
    is_public: true, review_status: 'approved',
    script: 'SELF: REPAIR flat=maxHp*0.2',
  },
  'overdrive': {
    id: 'overdrive', name: '超载驱动', description: '消耗能量大幅提升攻击',
    is_public: true, review_status: 'approved',
    script: 'CONSUME energy=2; SELF: BUFF attack percent=0.5',
  },
  // Phase 30: 地图炮核心技能示例
  'beam_cannon': {
    id: 'beam_cannon', name: '光束加农炮', description: '前方直线范围攻击',
    is_public: true, review_status: 'approved',
    script: 'SELF→TARGET: DIRECTIONAL_BEAM width=2 range=5 damage_kind=beam base_damage=30',
    range_type: 'directional_beam', beam_width: 2, cast_range: 5,
  },
};

// 读写辅助 — Phase 29-DataSecurity: 合并核心技能
function readConfig(): any {
  try {
    if (fs.existsSync(GLOSSARY_CONFIG_PATH)) {
      const raw = fs.readFileSync(GLOSSARY_CONFIG_PATH, 'utf-8');
      const config = JSON.parse(raw);
      // 合并核心技能（不可覆盖，始终公开）
      config.skills = { ...CORE_SKILLS, ...(config.skills || {}) };
      return config;
    }
  } catch (err) {
    console.error('[Glossary] 读取配置文件失败:', err);
  }
  const config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  config.skills = { ...CORE_SKILLS };
  return config;
}

function isAdminOrAbove(role: string): boolean {
  return role === UserRole.ADMIN || role === UserRole.DOMINATOR;
}

function writeConfig(config: any): void {
  const dir = path.dirname(GLOSSARY_CONFIG_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(GLOSSARY_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

// ========================================
// GET /config — 全量曝光公共技能（游客/任意级别 100% 只读放行）
// Phase 29-DataSecurity: 无认证要求，无条件广播
// ========================================
router.get('/config', (_req, res) => {
  const cfg = readConfig();
  res.json({
    success: true,
    glossary: cfg,
    skillCount: Object.keys(cfg.skills || {}).length,
    is_public: true,
    review_status: 'approved',
    version: cfg.version || '5.0',
  });
});

// ========================================
// POST /config — 保存词条库配置（仅 admin/dominator）
// Phase 29-DataSecurity: 普通用户 -> 403 "词条需经管理员审核方可公开"
// ========================================
router.post('/config', authenticate, (req, res) => {
  try {
    const role = req.auth?.role || UserRole.GUEST;

    // 🔒 焊死普通用户写入：直接拒绝
    if (!isAdminOrAbove(role)) {
      console.log(`[Glossary] 权限拦截: ${req.auth?.username || 'guest'} (role=${role}) 尝试写入词条库`);
      res.status(403).json({
        success: false,
        error: ErrorCode.ROLE_FORBIDDEN,
        message: '权限不足：普通玩家词条需经管理员审核方可公开',
        hint: '请联系管理员 (admin/dominator) 审核您的词条变更',
      });
      return;
    }

    const current = readConfig();
    const incoming = req.body || {};

    // 深度合并 skills（但不能覆盖核心技能）
    if (incoming.skills) {
      const nonCoreSkills: Record<string, any> = {};
      for (const [key, value] of Object.entries(incoming.skills)) {
        if (!CORE_SKILLS[key]) {
          nonCoreSkills[key] = value;
        }
      }
      current.skills = { ...CORE_SKILLS, ...(current.skills || {}), ...nonCoreSkills };
    }

    // 处理删除指令（不允许删除核心技能）
    if (Array.isArray(incoming._delete_skills) && incoming._delete_skills.length > 0) {
      for (const key of incoming._delete_skills) {
        if (!CORE_SKILLS[key]) {
          delete current.skills[key];
        }
      }
    }

    // 更新版本
    if (incoming.version) {
      current.version = incoming.version;
    }

    writeConfig(current);

    res.json({
      success: true,
      message: '词条库配置已保存并同步',
      skillCount: Object.keys(current.skills || {}).length,
      version: current.version,
    });
  } catch (err: any) {
    console.error('[Glossary] 保存配置失败:', err);
    res.status(500).json({
      success: false,
      error: 'GLOSSARY_SAVE_FAILED',
      message: err?.message || '保存配置失败',
    });
  }
});

export default router;
```

## services/combat-service/src/services/combatCore/configLoader.cjs

```js
/**
 * configLoader.cjs — 词条库配置热加载器 (Phase 10)
 *
 * 提供运行时重新加载词条库中枢配置的能力。
 * 调用 getGlossaryConfig() 总是返回最新的 JSON 数据。
 * 配合 API 写入端点，实现编辑后无需重启容器即可生效。
 *
 * saveGlossaryConfig 采用深度合并策略：
 *   - 将传入数据与磁盘现有配置深度合并后写入
 *   - 确保部分更新不会丢失其他字段
 */

const path = require('path');
const fs = require('fs');

const CONFIG_PATH = path.resolve(__dirname, '../../config/glossary-skill-config.json');

/**
 * 深度合并两个对象
 * - 对于普通值，新值覆盖旧值
 * - 对于对象，递归合并
 * - 对于数组，新数组替换旧数组
 */
function deepMerge(target, source) {
    if (!source || typeof source !== 'object') return source;
    if (!target || typeof target !== 'object') return source;

    const result = { ...target };
    for (const key of Object.keys(source)) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
            result[key] = deepMerge(result[key] || {}, source[key]);
        } else {
            result[key] = source[key];
        }
    }
    return result;
}

function getGlossaryConfig() {
    try {
        const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
        return JSON.parse(raw);
    } catch (e) {
        console.error('[ConfigLoader] 读取配置文件失败:', e.message);
        return null;
    }
}

function saveGlossaryConfig(incomingConfig) {
    try {
        // 原子删除: 处理 _delete_skills 指令
        const deleteKeys = incomingConfig._delete_skills || [];
        if (deleteKeys.length > 0) {
            deleteSkills(deleteKeys);
            // 从 incomingConfig 中移除 _delete_skills，避免写入 JSON
            delete incomingConfig._delete_skills;
        }

        // 读取现有配置进行深度合并
        let existing = {};
        try {
            const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
            existing = JSON.parse(raw);
        } catch (e) {
            console.warn('[ConfigLoader] 读取现有配置失败，将创建新文件:', e.message);
        }

        // 深度合并：确保部分更新不丢失数据
        const merged = deepMerge(existing, incomingConfig);

        // 更新 meta
        merged._meta = merged._meta || {};
        merged._meta.date = new Date().toISOString().replace('T', ' ').substring(0, 19);
        if (!merged._meta.generated_from) {
            merged._meta.generated_from = 'API 写入';
        }

        const json = JSON.stringify(merged, null, 2);
        fs.writeFileSync(CONFIG_PATH, json, 'utf-8');
        console.log('[ConfigLoader] 配置已深度合并写入磁盘');
        return true;
    } catch (e) {
        console.error('[ConfigLoader] 写入配置文件失败:', e.message);
        return false;
    }
}

function getSkillConfig(skillType) {
    const config = getGlossaryConfig();
    if (config && config.skills && config.skills[skillType]) {
        return config.skills[skillType];
    }
    return null;
}

function getSystemConfig(systemKey) {
    const config = getGlossaryConfig();
    if (config && config.systems && config.systems[systemKey]) {
        return config.systems[systemKey];
    }
    return null;
}


function deleteSkills(skillKeys) {
    if (!skillKeys || !Array.isArray(skillKeys) || skillKeys.length === 0) {
        console.warn('[ConfigLoader] deleteSkills: 无效的 keys 参数');
        return false;
    }
    try {
        const config = getGlossaryConfig();
        if (!config || !config.skills) return false;
        let deleted = 0;
        for (const key of skillKeys) {
            if (config.skills[key] !== undefined) {
                delete config.skills[key];
                deleted++;
            }
        }
        if (deleted > 0) {
            const json = JSON.stringify(config, null, 2);
            fs.writeFileSync(CONFIG_PATH, json, 'utf-8');
            console.log(`[ConfigLoader] 已删除 ${deleted} 个技能: [${skillKeys.join(', ')}]`);
        }
        return deleted > 0;
    } catch (e) {
        console.error('[ConfigLoader] deleteSkills 失败:', e.message);
        return false;
    }
}

module.exports = {
    getGlossaryConfig,
    saveGlossaryConfig,
    deleteSkills,
    getSkillConfig,
    getSystemConfig,
};
```

## services/combat-service/src/config/glossary-skill-config.json

```json
{
  "_meta": {
    "version": "5.0",
    "description": "机甲战棋词条库中枢配置 — Phase 10 万能语法战斗中枢",
    "generated_from": "GlossaryView.vue 结构化 CRUD + Phase 10 主谓宾定状补语法插槽",
    "date": "2026-06-21 12:00:00",
    "principle": "Phase 10 万能语法中枢: 主谓宾定状补插槽 + damage_kind分流 + 高地优势 + 手动摇骰 + 泛化加成累加器"
  },
  "damage_kinds": {
    "kinetic": { "label": "动能", "description": "物理冲击伤害" },
    "beam": { "label": "光束", "description": "能量束伤害" },
    "explosive": { "label": "爆炸", "description": "范围爆破伤害" },
    "corrosive": { "label": "腐蚀", "description": "持续性腐蚀伤害" },
    "thermal": { "label": "热熔", "description": "高温热熔伤害" }
  },
  "action_types": {
    "attack": { "label": "攻击", "description": "对目标造成伤害" },
    "heal": { "label": "治疗", "description": "回复目标HP" },
    "buff": { "label": "增益", "description": "施加正面效果" },
    "debuff": { "label": "减益", "description": "施加负面效果" },
    "passive": { "label": "被动", "description": "条件触发" }
  },
  "skills": {
    "block": {
      "type": "passive",
      "label": "格挡",
      "category": "melee",
      "description": "受攻击时伤害-2",
      "deterministic": true,
      "reduction": 2,
      "trigger": "on_attacked",
      "target_filter": "self",
      "cast_range": 0,
      "aoe_radius": 0,
      "base_damage": 0,
      "status_effects": [],
      "damage_kind": "kinetic",
      "min_cast_range": 0,
      "accuracy_mod": 0,
      "evasion_mod": 0,
      "height_bonus_per_diff": 0,
      "action_type": "passive",
      "attack_stat": "melee",
      "requires_unmoved": false,
      "requires_stealth": false
    },
    "sweep": {
      "type": "active",
      "label": "扫射",
      "category": "ranged",
      "description": "扇形2格范围攻击，不进行机动值判定。精准命中单体造成伤害-2，范围攻击伤害由所有目标均摊",
      "deterministic": true,
      "sector_angle": 60,
      "max_range": 2,
      "damage_modifier_precise": -2,
      "mode": "deterministic_sweep",
      "target_filter": "enemy",
      "cast_range": 2,
      "aoe_radius": 0,
      "base_damage": -2,
      "status_effects": [],
      "damage_kind": "kinetic",
      "min_cast_range": 0,
      "accuracy_mod": 0,
      "evasion_mod": 0,
      "height_bonus_per_diff": 0,
      "action_type": "attack",
      "attack_stat": "ranged",
      "requires_unmoved": false,
      "requires_stealth": false
    },
    "throw": {
      "type": "active",
      "label": "投掷",
      "category": "ranged",
      "description": "1~3格，目标周围2格所有目标下次伤害+5",
      "deterministic": true,
      "min_range": 1,
      "max_range": 3,
      "effect": "damage_amp",
      "value": 5,
      "aoe_range": 2,
      "target_filter": "enemy",
      "cast_range": 3,
      "aoe_radius": 2,
      "base_damage": 5,
      "status_effects": [],
      "damage_kind": "kinetic",
      "min_cast_range": 1,
      "accuracy_mod": 0,
      "evasion_mod": 0,
      "height_bonus_per_diff": 0,
      "action_type": "debuff",
      "attack_stat": "ranged",
      "requires_unmoved": false,
      "requires_stealth": false
    },
    "execute": {
      "type": "passive",
      "label": "斩杀",
      "category": "special",
      "description": "近战伤害结算后，目标HP<10%最大HP时直接斩杀",
      "deterministic": true,
      "hp_threshold_percent": 10,
      "trigger": "post_melee_damage",
      "target_filter": "enemy",
      "cast_range": 1,
      "aoe_radius": 0,
      "base_damage": 999,
      "status_effects": [],
      "damage_kind": "kinetic",
      "min_cast_range": 0,
      "accuracy_mod": 0,
      "evasion_mod": 0,
      "height_bonus_per_diff": 0,
      "action_type": "passive",
      "attack_stat": "melee",
      "requires_unmoved": false,
      "requires_stealth": false
    },
    "duel": {
      "type": "passive",
      "label": "决斗",
      "category": "special",
      "description": "双方在攻击范围内且HP<对方max(格斗,射击)时触发，攻击力高者胜",
      "deterministic": true,
      "stat_comparison": "max_attack",
      "trigger": "when_both_in_range",
      "target_filter": "enemy",
      "cast_range": 1,
      "aoe_radius": 0,
      "base_damage": 0,
      "status_effects": [],
      "damage_kind": "kinetic",
      "min_cast_range": 0,
      "accuracy_mod": 0,
      "evasion_mod": 0,
      "height_bonus_per_diff": 0,
      "action_type": "passive",
      "attack_stat": "max",
      "requires_unmoved": false,
      "requires_stealth": false
    },
    "snatch": {
      "type": "passive",
      "label": "抢夺",
      "category": "special",
      "description": "伤害值>被攻击者武器攻击值时触发，伤害减半并获得武器",
      "deterministic": true,
      "condition": "damage_greater_than_target_weapon_attack",
      "damage_multiplier": 0.5,
      "trigger": "on_damage_dealt",
      "target_filter": "enemy",
      "cast_range": 1,
      "aoe_radius": 0,
      "base_damage": 0,
      "status_effects": [],
      "damage_kind": "kinetic",
      "min_cast_range": 0,
      "accuracy_mod": 0,
      "evasion_mod": 0,
      "height_bonus_per_diff": 0,
      "action_type": "passive",
      "attack_stat": "melee",
      "requires_unmoved": false,
      "requires_stealth": false
    },
    "focused_fire": {
      "type": "active",
      "label": "专注射击",
      "category": "ranged",
      "description": "放弃移动，直接获得固定伤害加成+4",
      "deterministic": true,
      "bonus": 4,
      "requires": "no_movement_this_turn",
      "target_filter": "enemy",
      "cast_range": 1,
      "aoe_radius": 0,
      "base_damage": 4,
      "status_effects": [],
      "damage_kind": "kinetic",
      "min_cast_range": 0,
      "accuracy_mod": 0,
      "evasion_mod": 0,
      "height_bonus_per_diff": 0,
      "action_type": "attack",
      "attack_stat": "ranged",
      "requires_unmoved": true,
      "requires_stealth": false
    },
    "lucky": {
      "type": "passive",
      "label": "幸运",
      "category": "special",
      "description": "获得空投时可再次移动并攻击",
      "deterministic": true,
      "action": "remove_and_attack",
      "trigger": "on_airdrop_received",
      "target_filter": "all",
      "cast_range": 0,
      "aoe_radius": 0,
      "base_damage": 0,
      "status_effects": [],
      "damage_kind": "kinetic",
      "min_cast_range": 0,
      "accuracy_mod": 0,
      "evasion_mod": 0,
      "height_bonus_per_diff": 0,
      "action_type": "passive",
      "attack_stat": "melee",
      "requires_unmoved": false,
      "requires_stealth": false
    },
    "reactivate": {
      "type": "passive",
      "label": "再动",
      "category": "special",
      "description": "击杀敌军时触发，额外一回合（不连续触发）",
      "deterministic": true,
      "trigger": "on_kill",
      "no_consecutive": true,
      "target_filter": "self",
      "cast_range": 0,
      "aoe_radius": 0,
      "base_damage": 0,
      "status_effects": [],
      "damage_kind": "kinetic",
      "min_cast_range": 0,
      "accuracy_mod": 0,
      "evasion_mod": 0,
      "height_bonus_per_diff": 0,
      "action_type": "passive",
      "attack_stat": "melee",
      "requires_unmoved": false,
      "requires_stealth": false
    }
  },
  "systems": {
    "ambush": {
      "label": "奇袭",
      "description": "敌方攻击时触发先制进攻：跳过敌方回合并以70%攻击力反击，全员可用",
      "deterministic": true,
      "trigger": "always_on_enemy_attack",
      "damage_percent": 0.7
    },
    "fog_of_war": {
      "label": "迷雾系统",
      "description": "战场迷雾：视野正常可见，无额外命中率修正",
      "deterministic": true,
      "visibility": "normal",
      "accuracy_modifier": 0
    },
    "crit": {
      "label": "暴击系统",
      "description": "每次攻击固定33.3%暴击率，暴击倍率1.0~1.5",
      "deterministic_probability": true,
      "chance": 0.333,
      "multiplier_min": 1.0,
      "multiplier_max": 1.5
    }
  },
  "terrains": {
    "moon": {
      "name": "月面",
      "color": "#c0c0c0",
      "move_cost": 1,
      "defense_bonus": 0,
      "is_destructible": false,
      "max_hp": 0,
      "destroyed_transform_to": "moon",
      "damage_kind_modifiers": {
        "beam": 1.0,
        "kinetic": 1.0,
        "explosive": 1.0,
        "corrosive": 1.0,
        "thermal": 1.0
      }
    },
    "plain": {
      "name": "平原",
      "color": "#7a9b4f",
      "move_cost": 1,
      "defense_bonus": 0,
      "is_destructible": false,
      "max_hp": 0,
      "destroyed_transform_to": "plain",
      "damage_kind_modifiers": {
        "beam": 1.0,
        "kinetic": 1.0,
        "explosive": 1.0,
        "corrosive": 1.0,
        "thermal": 1.0
      }
    },
    "mountain": {
      "name": "山地",
      "color": "#8b7355",
      "move_cost": 3,
      "defense_bonus": 20,
      "is_destructible": false,
      "max_hp": 0,
      "destroyed_transform_to": "mountain",
      "damage_kind_modifiers": {
        "beam": 1.0,
        "kinetic": 0.9,
        "explosive": 1.0,
        "corrosive": 1.0,
        "thermal": 1.0
      }
    },
    "water": {
      "name": "水域",
      "color": "#4682b4",
      "move_cost": 99,
      "defense_bonus": -10,
      "is_destructible": false,
      "max_hp": 0,
      "destroyed_transform_to": "water",
      "damage_kind_modifiers": {
        "beam": 0.5,
        "kinetic": 1.0,
        "explosive": 0.8,
        "corrosive": 0.6,
        "thermal": 1.2
      }
    },
    "forest": {
      "name": "森林",
      "color": "#2d5a27",
      "move_cost": 2,
      "defense_bonus": 15,
      "is_destructible": true,
      "max_hp": 3,
      "destroyed_transform_to": "plain",
      "damage_kind_modifiers": {
        "beam": 0.9,
        "kinetic": 1.0,
        "explosive": 1.1,
        "corrosive": 1.0,
        "thermal": 1.0
      }
    },
    "fortress": {
      "name": "堡垒",
      "color": "#4a4a6a",
      "move_cost": 1,
      "defense_bonus": 30,
      "is_destructible": true,
      "max_hp": 5,
      "destroyed_transform_to": "plain",
      "damage_kind_modifiers": {
        "beam": 1.0,
        "kinetic": 1.0,
        "explosive": 1.0,
        "corrosive": 1.0,
        "thermal": 1.0
      }
    },
    "ruins": {
      "name": "废墟",
      "color": "#696969",
      "move_cost": 2,
      "defense_bonus": 10,
      "is_destructible": false,
      "max_hp": 0,
      "destroyed_transform_to": "ruins",
      "damage_kind_modifiers": {
        "beam": 1.0,
        "kinetic": 1.0,
        "explosive": 1.0,
        "corrosive": 1.0,
        "thermal": 1.0
      }
    },
    "crystal": {
      "name": "晶矿",
      "color": "#7b68ee",
      "move_cost": 2,
      "defense_bonus": 5,
      "is_destructible": true,
      "max_hp": 2,
      "destroyed_transform_to": "plain",
      "damage_kind_modifiers": {
        "beam": 1.5,
        "kinetic": 1.0,
        "explosive": 1.0,
        "corrosive": 1.0,
        "thermal": 1.0
      }
    },
    "rubble": {
      "name": "残骸",
      "color": "#8b7d6b",
      "move_cost": 2,
      "defense_bonus": 10,
      "is_destructible": false,
      "max_hp": 0,
      "destroyed_transform_to": "rubble",
      "damage_kind_modifiers": {
        "beam": 1.0,
        "kinetic": 1.0,
        "explosive": 1.0,
        "corrosive": 1.0,
        "thermal": 1.0
      }
    },
    "city_building": {
      "name": "城市建筑",
      "color": "#b8860b",
      "move_cost": 1,
      "defense_bonus": 25,
      "is_destructible": true,
      "max_hp": 4,
      "destroyed_transform_to": "rubble",
      "damage_kind_modifiers": {
        "beam": 1.0,
        "kinetic": 1.0,
        "explosive": 1.0,
        "corrosive": 1.0,
        "thermal": 1.0
      }
    }
  }
}
```
