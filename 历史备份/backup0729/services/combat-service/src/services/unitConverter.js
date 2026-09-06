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
        const geDou = Number(hangarUnit['main_格斗'] || hangarUnit.main_格斗 || 0);
        const sheJi = Number(hangarUnit['main_射击'] || hangarUnit.main_射击 || 0);
        const jieGou = Number(hangarUnit['main_结构'] || hangarUnit.main_结构 || 0);
        const jiDong = Number(hangarUnit['main_机动'] || hangarUnit.main_机动 || 0);

        const attack = Math.max(geDou, sheJi, 1);
        const weaponType = sheJi > geDou ? 'energy' : 'kinetic';
        const defense = Math.max(jieGou, 1);
        const hp = jieGou * 10;
        const mobility = jiDong;
        const melee = geDou;
        const ranged = sheJi;

        // 装备机动增益：推进器装备的"结构"属性贡献机动值
        const leftStruct = Number(hangarUnit['left_结构'] || hangarUnit.left_结构 || 0);
        const rightStruct = Number(hangarUnit['right_结构'] || hangarUnit.right_结构 || 0);
        const extraStruct = Number(hangarUnit['extra_结构'] || hangarUnit.extra_结构 || 0);

        const leftType = hangarUnit['left_type'] || hangarUnit.left_type || 'none';
        const rightType = hangarUnit['right_type'] || hangarUnit.right_type || 'none';
        const extraType = hangarUnit['extra_type'] || hangarUnit.extra_type || 'none';

        const THRUSTER_MOBILITY_RATIO = 0.5;
        let equipmentMobilityBonus = 0;

        if (leftType === '推进器') equipmentMobilityBonus += Math.floor(leftStruct * THRUSTER_MOBILITY_RATIO);
        if (rightType === '推进器') equipmentMobilityBonus += Math.floor(rightStruct * THRUSTER_MOBILITY_RATIO);
        if (extraType === '推进器') equipmentMobilityBonus += Math.floor(extraStruct * THRUSTER_MOBILITY_RATIO);

        const totalMobility = mobility + equipmentMobilityBonus;

        // 转换装备
        const leftEquip = this._convertEquipment(hangarUnit, 'left');
        const rightEquip = this._convertEquipment(hangarUnit, 'right');
        const extraEquip = this._convertEquipment(hangarUnit, 'extra');

        // 计算护盾值（来自装甲装备）
        const shield = this._calculateShield(leftEquip, rightEquip, extraEquip);

        // 判定护甲类型
        const armorType = this._determineArmorType(leftEquip, rightEquip, extraEquip);

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
            melee,
            ranged,
            defense,
            mobility: totalMobility,
            weaponType,
            armorType,
            shield,
            resistance: this._deriveResistance(leftEquip, rightEquip, extraEquip),
            level: 1,
            has_acted: false,
            has_moved: false,
            buffs: [],

            // 特殊装备标记
            equipment: {
                full_armor: false,
                coating: false
            },

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
            skills: this.convertSkills(hangarUnit)
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
            equip.durability = jieGou;  // 结构 × 1
            equip.resistance = null;
        } else if (combatType === 'armor') {
            equip.melee = 0;
            equip.ranged = 0;
            equip.defense = jieGou;
            equip.durability = 5;  // 固定 5
            equip.resistance = typeRaw === '盾牌' ? 'energy' : null;
        } else if (combatType === 'thruster') {
            equip.melee = 0;
            equip.ranged = 0;
            equip.defense = 0;
            equip.durability = jieGou;  // 结构 × 1 = 可被攻击次数
            equip.resistance = null;
        } else {
            equip.melee = geDou;
            equip.ranged = sheJi;
            equip.defense = jieGou;
            equip.durability = 5;  // 固定 5（背包）
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
        const jiDong = Number(hangarUnit['royroy_机动'] || hangarUnit.royroy_机动 || 0);

        return {
            name: hangarUnit.royroy_name || 'Royroy',
            attack: Math.max(geDou, sheJi, 1),
            defense: Math.max(jieGou, 1),
            hp: jieGou * 5,
            max_hp: jieGou * 5,
            mobility: jiDong,
            weaponType: sheJi > geDou ? 'energy' : 'kinetic',
            deployed: false
        };
    }

    /**
     * 推导单位级别的抗性类型（从装备中取第一个非空 resistance）
     * @private
     */
    static _deriveResistance(leftEquip, rightEquip, extraEquip) {
        for (const eq of [leftEquip, rightEquip, extraEquip]) {
            if (eq && eq.resistance) return eq.resistance;
        }
        return null;
    }

    /**
     * 将 hangar 技能转换为 combat Tag 格式
     * 匹配 Excel 技能表：反击/格挡/长柄/补给/扫射/投掷/稳定/狙击/助攻/守护/阻碍/侦察
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
            'royroy': 'royroy_skills'
        };

        for (const [slot, field] of Object.entries(skillGroups)) {
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
     * Excel 技能名称映射到 combat type
     * @private
     */
    static _skillToTag(skill, slot, index) {
        // 技能名称 → combat 类型映射
        // P2-1: 补充 6 个特殊词条（斩杀、决斗、抢夺、专注射击、幸运、再动）
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
            '全覆式装甲': 'full_armor',
            '抗性涂层': 'coating',
            '变形': 'transform',
            // 特殊词条（P2-1 新增）
            '斩杀': 'execute',
            '决斗': 'duel',
            '抢夺': 'snatch',
            '专注射击': 'focused_fire',
            '幸运': 'lucky',
            '再动': 'reactivate'
        };

        const CN_TYPE_MAP = { '自动': 'active', '手动': 'manual', '被动': 'passive' };
        const name = skill.name || '';
        // 优先采用库存 skill.type（中文类型标签），TYPE_MAP[name] 仅作兜底
        const combatType = CN_TYPE_MAP[skill.type] || TYPE_MAP[name] || 'unknown';

        const tag = {
            id: `${slot}_skill_${index}`,
            name,
            type: combatType,
            effect: skill.effect || '',
            attribute: skill.attribute === '光束' ? 'energy' : skill.attribute === '实体' ? 'kinetic' : (skill.attribute || 'kinetic'),
            slot: slot,
            active: true,
            disabled: false,
            category: this._getSkillCategory(combatType),
            slots: combatType === 'supply' || combatType === 'scout' ? 2 : 1,
            // P2-3: 新增 targetType / needTarget / counter / description 字段
            targetType: this._getTargetType(combatType),
            needTarget: this._needTarget(combatType),
            initCounter: this._getInitCounter(combatType),
            description: [skill.effect, skill.description].filter(Boolean).join('；') || this._getSkillDesc(combatType),
            original: skill
        };

        // P2-2: 修复 range 解析 — 支持 "1-3", "4~6" 等区间格式
        if (skill.range) {
            const rangeStr = String(skill.range);
            const rangeMatch = rangeStr.match(/(\d+)\s*[-~～]\s*(\d+)/);
            if (rangeMatch) {
                tag.range_min = parseInt(rangeMatch[1]);
                tag.range_max = parseInt(rangeMatch[2]);
                tag.range = tag.range_max; // 兼容旧字段
            } else {
                const singleMatch = rangeStr.match(/(\d+)/);
                if (singleMatch) {
                    const val = parseInt(singleMatch[1]);
                    tag.range_min = val;
                    tag.range_max = val;
                    tag.range = val;
                }
            }
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
            // P2-1: 特殊词条分类
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
     * P2-3: 获取技能目标类型
     * @private
     */
    static _getTargetType(type) {
        const map = {
            'supply': 'ally',    // 补给 → 友军
            'scout': 'ally',     // 侦察 → 友军
            'assist': 'self',    // 助攻 → 自身增益
            'guard': 'self',     // 守护 → 自身增益
            'blockade': 'self',  // 阻碍 → 自身增益能力
            'counter': 'enemy',  // 反击 → 敌方
            'throw': 'enemy',    // 投掷 → 敌方
            'sweep': 'enemy',    // 扫射 → 敌方
            'sniper': 'enemy',   // 狙击 → 敌方
            'block': 'self',     // 格挡 → 自身
            'polearm': 'enemy',  // 长柄 → 敌方
            'stable': 'enemy',   // 稳定 → 敌方目标
            'execute': 'enemy',  // 斩杀 → 敌方
            'duel': 'enemy',     // 决斗 → 敌方
            'snatch': 'enemy',   // 抢夺 → 敌方
            'focused_fire': 'enemy', // 专注射击 → 敌方
            'lucky': 'self',     // 幸运 → 自身
            'reactivate': 'self',// 再动 → 自身
            'full_armor': 'self',// 全覆式装甲 → 自身
            'coating': 'self',   // 抗性涂层 → 自身
            'transform': 'self', // 变形 → 自身
        };
        return map[type] || 'enemy';
    }

    /**
     * P2-3: 技能是否需要用户主动选择目标
     * @private
     */
    static _needTarget(type) {
        return ['throw', 'sweep', 'sniper', 'supply', 'stable'].includes(type);
    }

    /**
     * P2-3: 获取自动化技能的初始计数器值
     * @private
     */
    static _getInitCounter(type) {
        const map = {
            'assist': 5,   // Excel: 后续五次伤害+3
            'guard': 3,    // Excel: 后续三次受伤害-5
            'blockade': 3, // Excel: 后续三次对方机动值-5
        };
        return map[type] || 0;
    }

    /**
     * P2-3: 获取技能描述文本（以 Excel 规则为准）
     * @private
     */
    static _getSkillDesc(type) {
        const map = {
            'counter': '被动：受到敌人攻击且对方在范围内时触发，发动反击伤害+2',
            'block': '被动：受到敌人攻击时掷骰，1-3失败/4-6伤害-2',
            'polearm': '攻击范围1~2格（近战基础上延伸至第二圈）',
            'supply': '主动：跳过移动，对范围1内友军回复格斗值×1的HP（占用2槽）',
            'sweep': '主动：扇形2格，不判定机动值。掷骰1-3精准命中单体-2，4-6范围均摊',
            'throw': '主动：1~3格，掷骰1-3目标周围2格下次伤害+5，4-6目标移动值-5',
            'stable': '主动：1~4格，每局一次，移动后可使用专注射击',
            'sniper': '主动：4~6格，舍弃移动，机动值差计算中目标机动值-2',
            'assist': '被动：后续五次造成的伤害+3（适用于反击）',
            'guard': '被动：后续三次受到的伤害-5，与百分比减伤不叠加',
            'blockade': '被动：在后续三次伤害计算中，对方机动值-5',
            'scout': '被动：对射击值×1范围侦察，暴露敌方3×3区域（占用2槽）',
            'execute': '近战伤害结算后，目标HP<5时掷骰，点数≥剩余血量→直接斩杀',
            'duel': '双方在攻击范围内且HP<对方max(格斗,射击)时触发，双方掷骰大者胜',
            'snatch': '伤害值>被攻击者武器攻击值时掷骰，点数>3→伤害减半并获得武器',
            'focused_fire': '放弃移动，掷骰：1-4伤害+3，5-6伤害+5',
            'lucky': '获得空投时掷骰：1-2跳过攻击，3-4可攻击，5-6再移动攻击',
            'reactivate': '击杀敌军时触发，额外一回合（不连续触发）',
            'full_armor': '对实体武器伤害-2',
            'coating': '对光束武器伤害-2',
            'transform': '变形技能',
        };
        return map[type] || '';
    }

}

export default UnitConverter;
