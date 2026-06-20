import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { getGlossaryConfig } = require('./combatCore/configLoader.cjs');

/**
 * UnitConverter - 格纳库棋子格式 → 战斗核心单位格式转换器
 * 
 * 将 hangar-service 存储的棋子属性（格斗/射击/结构/机动）
 * 转换为 combat-service 战斗核心所需的单位格式（attack/defense/hp/mobility/equipment）
 */

/**
 * 装备类型映射：hangar 中文类型 → combat 英文类型
 */
const EQUIP_TYPE_MAP = {
    '武器': 'weapon',
    '装甲': 'armor',
    '盾牌': 'armor',
    '推进器': 'thruster',
    '辅助': 'support',
    '机体': null,
    'none': null
};

/**
 * 阵营映射
 */
const FACTION_MAP = {
    'earth': 'earth',
    'balon': 'balon',
    'byron': 'balon',
    'maxion': 'maxion',
    '地球联合': 'earth',
    '拜隆': 'balon',
    '马克西翁': 'maxion'
};

class UnitConverter {

    /**
     * 将 hangar 棋子数据转换为 combat 战斗单位
     * @param {Object} hangarUnit - hangar-service 返回的棋子对象
     * @param {Object} deployInfo - 部署信息 { q, r, player_id }
     * @returns {Object} combat 格式的战斗单位
     */
    static convert(hangarUnit, deployInfo = {}) {
        if (!hangarUnit) {
            throw new Error('UnitConverter: hangarUnit is required');
        }

        const faction = FACTION_MAP[hangarUnit.faction] || 'earth';

        // 核心属性推导
        const geDou = Number(hangarUnit['main_格斗'] || hangarUnit.main_格斗 || hangarUnit.attack || 0);
        const sheJi = Number(hangarUnit['main_射击'] || hangarUnit.main_射击 || 0);
        const jieGou = Number(hangarUnit['main_结构'] || hangarUnit.main_结构 || Math.floor((hangarUnit.hp || hangarUnit.max_hp || 0) / 10) || 0);
        const jiDong = Number(hangarUnit['main_机动'] || hangarUnit.main_机动 || hangarUnit.mobility || 0);

        const attack = Math.max(geDou, sheJi, 1);
        const weaponType = sheJi > geDou ? 'beam' : 'kinetic';
        const defense = Math.max(jieGou, 1);
        const hp = jieGou * 10;
        const mobility = jiDong;

        // 转换装备
        const leftEquip = this._convertEquipment(hangarUnit, 'left');
        const rightEquip = this._convertEquipment(hangarUnit, 'right');
        const extraEquip = this._convertEquipment(hangarUnit, 'extra');

        // 计算护盾值（来自装甲装备）
        const shield = this._calculateShield(leftEquip, rightEquip, extraEquip);

        // 判定护甲类型
        const armorType = this._determineArmorType(leftEquip, rightEquip, extraEquip);

        // 单位级抗性：从装备槽位推导（武器克制系统用）
        const unitResistance = [leftEquip, rightEquip, extraEquip]
            .find(eq => eq && eq.resistance)?.resistance || null;

        const unit = {
            id: hangarUnit.id,
            unit_id: hangarUnit.id,
            player_id: deployInfo.player_id || 0,
            name: hangarUnit.name || 'Unknown',
            faction,
            q: deployInfo.q || 0,
            r: deployInfo.r || 0,
            hp,
            max_hp: hp,
            attack,
            defense,
            mobility,
            melee: geDou,
            ranged: sheJi,
            range: sheJi > geDou ? 2 : 1,
            structure: jieGou,
            weaponType,
            armorType,
            shield,
            resistance: unitResistance,
            equipment: {
                full_armor: false,
                coating: false
            },
            level: 1,
            has_acted: false,
            has_moved: false,
            buffs: [],

            // 装备字段（与 combat DB schema 对齐）
            left_hand_type: leftEquip.type,
            left_hand_name: leftEquip.name || null,
            left_hand_melee: leftEquip.melee,
            left_hand_ranged: leftEquip.ranged,
            left_hand_defense: leftEquip.defense,
            left_hand_durability: leftEquip.durability,
            left_hand_resistance: leftEquip.resistance || null,

            right_hand_type: rightEquip.type,
            right_hand_name: rightEquip.name || null,
            right_hand_melee: rightEquip.melee,
            right_hand_ranged: rightEquip.ranged,
            right_hand_defense: rightEquip.defense,
            right_hand_durability: rightEquip.durability,
            right_hand_resistance: rightEquip.resistance || null,

            extra_type: extraEquip.type,
            extra_name: extraEquip.name || null,
            extra_melee: extraEquip.melee,
            extra_ranged: extraEquip.ranged,
            extra_defense: extraEquip.defense,
            extra_durability: extraEquip.durability,
            extra_resistance: extraEquip.resistance || null,

            // Royroy 跟随单位
            royroy_deployed: false,
            royroy_q: null,
            royroy_r: null,

            // 保留原始数据用于技能转换
            _hangarRaw: hangarUnit,

            // 转换技能为 Tag 格式
            skills: this.convertSkills(hangarUnit),
            equipped_tags: this.convertSkills(hangarUnit).map(s => s.id)
        };

        // 如果有 Royroy，附加其信息
        if (hangarUnit.has_royroy) {
            unit.royroy = this._convertRoyroy(hangarUnit);
        }

        return unit;
    }

    /**
     * 批量转换
     */
    static convertAll(hangarUnits, deployInfoList = []) {
        return hangarUnits.map((hu, idx) => {
            const deployInfo = deployInfoList[idx] || {};
            return this.convert(hu, deployInfo);
        });
    }

    /**
     * 转换单个装备槽
     * @private
     */
    static _convertEquipment(hangarUnit, slot) {
        const prefix = `${slot}_`;
        const typeRaw = hangarUnit[`${prefix}type`] || 'none';
        const combatType = EQUIP_TYPE_MAP[typeRaw] || null;

        if (!combatType) {
            return {
                type: null,
                name: null,
                melee: 0,
                ranged: 0,
                defense: 0,
                durability: 0,
                resistance: null
            };
        }

        const geDou = Number(hangarUnit[`${prefix}格斗`] || hangarUnit[`${prefix}_格斗`] || 0);
        const sheJi = Number(hangarUnit[`${prefix}射击`] || hangarUnit[`${prefix}_射击`] || 0);
        const jieGou = Number(hangarUnit[`${prefix}结构`] || hangarUnit[`${prefix}_结构`] || 0);

        const equip = {
            type: combatType,
            name: hangarUnit[`${prefix}type`] !== 'none' ? `${typeRaw}(${slot})` : null
        };

        if (combatType === 'weapon') {
            equip.melee = geDou;
            equip.ranged = sheJi;
            equip.defense = 0;
            equip.durability = jieGou || 5;
            equip.resistance = null;
        } else if (combatType === 'armor') {
            equip.melee = 0;
            equip.ranged = 0;
            equip.defense = jieGou;
            equip.durability = jieGou * 2 || 10;
            equip.resistance = typeRaw === '盾牌' ? 'beam' : null;
        } else if (combatType === 'thruster') {
            equip.melee = 0;
            equip.ranged = 0;
            equip.defense = 0;
            equip.durability = jieGou || 5;
            equip.resistance = null;
        } else {
            equip.melee = geDou;
            equip.ranged = sheJi;
            equip.defense = jieGou;
            equip.durability = Math.max(jieGou, 3);
            equip.resistance = null;
        }

        return equip;
    }

    /**
     * 计算总护盾值
     * @private
     */
    static _calculateShield(leftEquip, rightEquip, extraEquip) {
        let shield = 0;
        [leftEquip, rightEquip, extraEquip].forEach(eq => {
            if (eq && eq.type === 'armor') {
                shield += eq.defense || 0;
            }
        });
        return shield;
    }

    /**
     * 判定护甲类型
     * @private
     */
    static _determineArmorType(leftEquip, rightEquip, extraEquip) {
        const hasArmor = [leftEquip, rightEquip, extraEquip].some(eq => eq && eq.type === 'armor');
        const hasThruster = [leftEquip, rightEquip, extraEquip].some(eq => eq && eq.type === 'thruster');
        
        if (hasArmor) return 'heavy';
        if (hasThruster) return 'light';
        return 'normal';
    }

    /**
     * 转换 Royroy 跟随单位
     * @private
     */
    static _convertRoyroy(hangarUnit) {
        const geDou = Number(hangarUnit['royroy_格斗'] || hangarUnit.royroy_格斗 || 0);
        const sheJi = Number(hangarUnit['royroy_射击'] || hangarUnit.royroy_射击 || 0);
        const jieGou = Number(hangarUnit['royroy_结构'] || hangarUnit.royroy_结构 || 0);
        const jiDong = Number(hangarUnit['royroy_机动'] || hangarUnit.royroy_机动 || hangarUnit.mobility || 0);

        return {
            name: hangarUnit.royroy_name || 'Royroy',
            attack: Math.max(geDou, sheJi, 1),
            defense: Math.max(jieGou, 1),
            hp: jieGou * 5,
            max_hp: jieGou * 5,
            mobility: jiDong,
            weaponType: sheJi > geDou ? 'beam' : 'kinetic',
            deployed: false
        };
    }

    /**
     * 将 hangar 技能转换为 combat Tag 格式
     * @param {Object} hangarUnit - hangar 棋子对象
     * @returns {Array<Object>} combat Tag 数组
     */
    static convertSkills(hangarUnit) {
        const allSkills = [];
        const skillGroups = {
            'main': 'main_skills',
            'left': 'left_skills',
            'right': 'right_skills',
            'extra': 'extra_skills',
            'royroy': 'royroy_skills',
            // Fallback: frontend may send skills as a plain 'skills' array
            '_fallback': 'skills'
        };

        for (const [slot, field] of Object.entries(skillGroups)) {
            if (slot === '_fallback') {
                // Only use fallback if no other skill fields produced results
                if (allSkills.length > 0) continue;
            }
            let skills = hangarUnit[field];
            if (typeof skills === 'string') {
                try { skills = JSON.parse(skills); } catch (e) { skills = []; }
            }
            if (!Array.isArray(skills)) continue;

            skills.forEach((skill, idx) => {
                if (!skill || !skill.name) return;
                const tag = this._skillToTag(skill, slot, idx);
                if (tag) allSkills.push(tag);
            });
        }
        return allSkills;
    }

    /**
     * 单个技能 -> Tag 转换
     * @private
     */
    /**
     * 单个技能 -> Tag 转换
     * Excel 技能名称映射到 combat type（使用 skill.effect 字段查询）
     * @private
     */
    static _skillToTag(skill, slot, index) {
        // 技能名称 → combat 类型映射
        const TYPE_MAP = {
            '反击': 'counter',
            '格挡': 'block',
            '长柄': 'polearm',
            '补给': 'supply',
            '扫射': 'sweep',
            '投掷': 'throw',
            '稳定': 'stable',
            '狙击': 'sniper',
            '助攻': 'assist',
            '守护': 'guard',
            '阻碍': 'blockade',
            '侦察': 'scout',
            '隐匿': 'conceal',
            '全覆式装甲': 'full_armor',
            '抗性涂层': 'coating',
            '变形': 'transform',
            '斩杀': 'execute',
            '决斗': 'duel',
            '抢夺': 'snatch',
            '专注射击': 'focused_fire',
            '幸运': 'lucky',
            '再动': 'reactivate'
        };

        // 优先用 skill.type（已为英文 combat 类型），其次 skill.effect，fallback 到 skill.name
        const lookupKey = (skill.type && TYPE_MAP[skill.type]) ? null : (skill.effect || skill.name || '');
        const combatType = skill.type && Object.values(TYPE_MAP).includes(skill.type)
            ? skill.type
            : (TYPE_MAP[lookupKey] || 'unknown');

        const attrMap = { '实体': 'kinetic', '能量': 'beam', '爆炸': 'explosive', '物理': 'kinetic', '光束': 'beam', '特殊': 'special' };

        // 反向映射：English → 中文
        const ATTR_LABEL = { 'kinetic': '实体', 'beam': '光束', 'explosive': '爆炸', 'special': '特殊' };
        // 技能类型 English → 中文效果名（TYPE_MAP 的反向）
        const TYPE_LABEL = {};
        for (const [cn, en] of Object.entries(TYPE_MAP)) {
            TYPE_LABEL[en] = cn;
        }
        // 分类 English → 中文
        const CAT_LABEL = { 'melee': '近战', 'ranged': '远程', 'auto': '自动', 'special': '特殊' };

        const tag = {
            id: `${slot}_skill_${index}`,
            name: skill.name,
            type: combatType,
            attribute: attrMap[skill.attribute] || 'kinetic',
            slot: slot,
            active: true,
            disabled: false,
            category: this._getSkillCategory(combatType),
            slots: combatType === 'supply' || combatType === 'scout' ? 2 : (combatType === 'conceal' ? 0 : 1),
            targetType: this._getTargetType(combatType),
            needTarget: this._needTarget(combatType),
            initCounter: this._getInitCounter(combatType),
            description: skill.description || this._getSkillDesc(combatType),
            // Preserve skill-specific properties for combat pipeline
            reduction: skill.reduction,
            bonus: skill.bonus,
            focused_fire: skill.focused_fire,
            mobility_reduction: skill.mobility_reduction,
            original: skill,
            // 中文显示标签
            attributeLabel: ATTR_LABEL[attrMap[skill.attribute] || 'kinetic'] || '实体',
            typeLabel: TYPE_LABEL[combatType] || skill.type || combatType,
            categoryLabel: CAT_LABEL[this._getSkillCategory(combatType)] || combatType,
            rangeLabel: undefined  // 稍后填充
        };

        // 解析 effect 字段
        if (skill.effect) {
            tag.effect = skill.effect;
            const dmgMatch = String(skill.effect).match(/(\d+)/);
            if (dmgMatch) tag.damage = parseInt(dmgMatch[1]);
        }

        // 解析 range — 支持 "1-3", "4~6", "周围一圈", "周围两圈" 等格式
        if (skill.range) {
            const rangeStr = String(skill.range);
            tag.range_raw = skill.range;
            // 中文数字 → 阿拉伯数字映射
            const CN_NUM = { '一':'1','二':'2','两':'2','三':'3','四':'4','五':'5','六':'6','七':'7','八':'8','九':'9' };
            const normalizedRange = rangeStr.replace(/[一二两三四五六七八九]/g, c => CN_NUM[c] || c);
            const rangeMatch = normalizedRange.match(/(\d+)\s*[-~～]\s*(\d+)/);
            if (rangeMatch) {
                tag.range_min = parseInt(rangeMatch[1]);
                tag.range_max = parseInt(rangeMatch[2]);
                tag.range = tag.range_max;
            } else {
                const singleMatch = normalizedRange.match(/(\d+)/);
                if (singleMatch) {
                    const val = parseInt(singleMatch[1]);
                    tag.range_min = val;
                    tag.range_max = val;
                    tag.range = val;
                }
            }
        }
        // 填充 rangeLabel（用于 UI 显示）
        if (tag.range_min !== undefined && tag.range_max !== undefined) {
            tag.rangeLabel = tag.range_min === tag.range_max
                ? String(tag.range_min)
                : `${tag.range_min}-${tag.range_max}`;
        } else {
            tag.rangeLabel = String(tag.range || 1);
        }

        // 解析 special 字段
        if (skill.special) {
            tag.special = skill.special;
            const lower = String(skill.special).toLowerCase();
            if (lower.includes('必中')) tag.guaranteed_hit = true;
            if (lower.includes('暴击') || lower.includes('crit')) tag.crit_boost = true;
            if (lower.includes('穿透')) tag.pierce = true;
            if (lower.includes('吸血')) tag.lifesteal = true;
        }

        return tag;
    }

    /**
     * 获取技能分类（近战/远程/自动化/特殊）
     * @private
     */
    static _getSkillCategory(type) {
        switch (type) {
            case 'counter':
            case 'block':
            case 'polearm':
            case 'supply':
                return 'melee';
            case 'sweep':
            case 'throw':
            case 'stable':
            case 'sniper':
                return 'ranged';
            case 'assist':
            case 'guard':
            case 'blockade':
            case 'scout':
                return 'auto';
            case 'full_armor':
            case 'coating':
            case 'transform':
            case 'execute':
            case 'duel':
            case 'snatch':
            case 'focused_fire':
            case 'lucky':
            case 'reactivate':
                return 'special';
            default:
                return 'unknown';
        }
    }

    /**
     * 获取技能目标类型
     * @private
     */
    static _getTargetType(type) {
        const map = {
            'supply': 'ally',
            'scout': 'ally',
            'conceal': 'self',
            'assist': 'self',
            'guard': 'self',
            'blockade': 'self',
            'counter': 'enemy',
            'throw': 'enemy',
            'sweep': 'enemy',
            'sniper': 'enemy',
            'block': 'self',
            'polearm': 'enemy',
            'stable': 'enemy',
            'execute': 'enemy',
            'duel': 'enemy',
            'snatch': 'enemy',
            'focused_fire': 'enemy',
            'lucky': 'self',
            'reactivate': 'self',
            'full_armor': 'self',
            'coating': 'self',
            'transform': 'self',
        };
        return map[type] || 'enemy';
    }

    /**
     * 技能是否需要用户主动选择目标
     * @private
     */
    static _needTarget(type) {
        return ['throw', 'sweep', 'sniper', 'supply', 'stable'].includes(type);
    }

    /**
     * 获取自动化技能的初始计数器值
     * @private
     */
    static _getInitCounter(type) {
        const map = {
            'assist': 5,
            'guard': 3,
            'blockade': 3,
        };
        return map[type] || 0;
    }

    /**
     * 获取技能描述文本
     * @private
     */
        /**
     * 获取技能描述文本 v2.0 — 去骰化
     * @private
     */
    static _getSkillDesc(type) {
        // Phase 6: 从词条库中枢动态读取技能描述，实现全链路动态同步
        let gc = null;
        try {
            gc = getGlossaryConfig();
        } catch (e) {
            // 降级：configLoader 不可用时使用静态度
        }

        const gs = (gc && gc.skills) ? gc.skills[type] : null;

        // 8大核心词条：动态数值填充
        if (gs) {
            switch (type) {
                case 'block':
                    return `被动：受到敌人攻击时伤害-${gs.reduction}`;
                case 'execute':
                    return `近战伤害结算后，目标HP<${gs.hp_threshold_percent}%最大HP时直接斩杀`;
                case 'focused_fire':
                    return `放弃移动，获得固定伤害加成+${gs.bonus}`;
                case 'throw':
                    return `主动：1~${gs.max_range}格，目标周围${gs.aoe_range}格所有目标下次伤害+${gs.value}`;
                case 'sweep':
                    return `主动：扇形${gs.max_range}格范围攻击，不进行机动值判定。精准命中单体造成伤害${gs.damage_modifier_precise}，范围攻击伤害由所有目标均摊`;
                case 'duel':
                    return `双方在攻击范围内且HP<对方${gs.stat_comparison}时触发，攻击力高者胜`;
                case 'snatch':
                    return `伤害值>被攻击者武器攻击值时触发，伤害减为×${gs.damage_multiplier}并获得武器`;
                case 'lucky':
                    return `获得空投时可再次移动并攻击`;
                case 'reactivate':
                    return `击杀敌军时触发，额外一回合（不连续触发）`;
            }
        }

        // 非词条技能的静态映射（回退）
        const map = {
            'conceal': '被动：开场隐匿，敌方距离≤3、造成伤害、被侦察、非友方直线路径时暴露。跳过战术环节后移动恢复',
            'counter': '被动：受到敌人攻击且对方在范围内时触发，发动反击伤害+2',
            'polearm': '攻击范围额外朝纵横四个方向延伸1格',
            'supply': '主动：跳过移动，对范围1内友军回复格斗值×1的HP（占用2槽）',
            'stable': '主动：1~4格，每局一次，移动后可使用专注射击',
            'sniper': '主动：4~6格，舍弃移动，机动值差计算中目标机动值-2',
            'assist': '被动：后续五次造成的伤害+3（适用于反击）',
            'guard': '被动：后续三次受到的伤害-5，与百分比减伤不叠加',
            'blockade': '被动：在后续三次伤害计算中，对方机动值-5',
            'scout': '被动：对射击值×1范围侦察，暴露敌方3×3区域（占用2槽）',
            'full_armor': '对实体武器伤害-2',
            'coating': '对光束武器伤害-2',
            'transform': '变形技能',
        };
        return map[type] || '';
    }



}

export default UnitConverter;
