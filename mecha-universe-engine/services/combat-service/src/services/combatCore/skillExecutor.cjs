/**
 * skillExecutor.cjs — 技能执行器 v5.0 (Phase 10 万能语法战斗中枢)
 *
 * 核心设计原则:
 *   - 废除所有技能名称硬编码分支，改为 "只认通用句式、不认特定技能名"
 *   - 引入【主谓宾定状补】语法插槽：subject/predicate/object/attribute/adverbial/complement
 *   - 所有技能通过 glossary-skill-config.json 的通用字段驱动
 *   - 泛化累加器: 不判断类型名，凡有 bonus_value 即无条件累加
 *   - 100% 向后兼容：9 大技能数据反填即可完美跑通
 *
 * 语法插槽:
 *   Subject    (主语·状态):  requires_unmoved, requires_stealth, requires_hp_above_percent
 *   Predicate  (谓语·动作):  action_type (attack/heal/buff/debuff/passive)
 *   Object     (宾语·范围):  target_filter, cast_range, min_cast_range, aoe_radius, sector_angle
 *   Attribute  (定语·属性):  damage_kind, attack_stat, accuracy_mod, evasion_mod
 *   Adverbial  (状语·干预):  height_bonus_per_diff, dice_type, success_line, success_bonus_damage, is_manual_roll
 *   Complement (补语·结果):  base_damage, reduction, bonus, bonus_value, status_effects, post_effects
 */

const DiceService = require('./diceService.cjs');

// ───────────────────── 技能类型 → 默认攻击距离 ─────────────────────
// 当技能未显式声明 cast_range 时，按「技能类型(category)」推导攻击距离，
// 确保「攻击距离由技能类型决定」成为唯一真相源，避免手填数值漂移（如远程技能被误填为1格近战距离）。
// 显式 cast_range 始终优先；此表仅作兜底/缺省。
const DEFAULT_RANGE_BY_CATEGORY = {
  melee: 1,       // 近战：1 格
  ranged: 6,      // 远程：默认取最大射程
  auto: 0,        // 自动化/自身：0（仅自身）
  special: 1,     // 特殊：默认 1 格（近战判定）
  automation: 0,
  support: 1,
};

const { getSkillConfig, getSystemConfig, getGlossaryConfig } = require('./configLoader.cjs');
// H7 实时伤害减免（抗性 + 专注射射）：详见 damageModifiers.cjs
const { applyDamageModifiers } = require('./damageModifiers.cjs');
const ConditionEvaluator = require('./conditionEvaluator.cjs');
const BranchEvaluator = require('./branchEvaluator.cjs');
const { getHexKey } = require('./hexKey.cjs');
const BuffManager = require('./buffManager.cjs');

// ───────────────────── 单位体型（体积）换算 ─────────────────────
// 与 backend-gateway/src/unitSize.ts 内容镜像（s < m < l < xl）
const SIZE_ORDER = ['s', 'm', 'l', 'xl'];
const SIZE_LABELS = { s: 'S', m: 'M', l: 'L', xl: 'XL' };
const SIZE_ALIAS = { s: 's', small: 's', 小: 's', m: 'm', medium: 'm', 中: 'm', l: 'l', large: 'l', 大: 'l', xl: 'xl', xlarge: 'xl', 特大: 'xl', 超大: 'xl' };
function normSize(v) {
  const s = String(v == null ? '' : v).trim().toLowerCase();
  if (SIZE_ORDER.includes(s)) return s;
  return SIZE_ALIAS[s] || 'm';
}
function sizeDefenseBonus(a, b) {
  const ai = SIZE_ORDER.indexOf(normSize(a));
  const di = SIZE_ORDER.indexOf(normSize(b));
  if (ai < 0 || di < 0) return 0;
  return ai < di ? di - ai : 0; // 防守方更大 → 减伤
}
function sizeMobilityBonus(a, b) {
  const ai = SIZE_ORDER.indexOf(normSize(a));
  const di = SIZE_ORDER.indexOf(normSize(b));
  if (ai < 0 || di < 0) return 0;
  return ai > di ? ai - di : 0; // 攻击方更大 → 防守方机动补偿
}

/**
 * 状态去重：同一来源(source)+类型(action_type)+作用域(applies_on)的状态只保留一份，
 * 重复施放时刷新持续回合(remaining)而非叠加多层，避免助攻/守护/侦察被无限叠层。
 */
function _refreshOrAddStatus(unit, statusInstance) {
  if (!unit) return statusInstance;
  unit.statusEffects = unit.statusEffects || [];
  const existing = unit.statusEffects.find(
    (s) => s && s.source === statusInstance.source && s.action_type === statusInstance.action_type && s.applies_on === statusInstance.applies_on
  );
  if (existing) {
    existing.consumption = {
      ...(existing.consumption || {}),
      remaining: statusInstance.consumption.remaining,
      max: statusInstance.consumption.max,
    };
    existing.remainingTurns = statusInstance.remainingTurns;
    existing.value = statusInstance.value;
    existing.label = statusInstance.label;
    return existing;
  }
  unit.statusEffects.push(statusInstance);
  return statusInstance;
}


class SkillExecutor {
    constructor() {
        // 稳定技能每局使用状态追踪：key = unit.id
        this.stableUsedInBattle = new Map();
        this.config = getGlossaryConfig();
        // Phase 10: 万能语法模式（始终启用）
        this.universalMode = true;
    }

    // ============================================================
    // Phase 10: 万能语法字段获取
    // ============================================================

    /**
     * 获取技能的全部通用结构化属性 (v5.0 主谓宾定状补)
     * @param {string} skillType - 技能KEY 或 skillCfg 对象
     * @returns {Object} 完整的语法插槽字典
     */
    _getUniversalFields(skillType) {
        const cfg = typeof skillType === 'string' ? getSkillConfig(skillType) : skillType;
        if (!cfg) return this._defaultUniversalFields();

        return {
            // Phase 5: 基础通用字段
            type: cfg.type || 'active',
            label: cfg.label || skillType,
            name: cfg.name || cfg.label || (typeof skillType === 'string' ? skillType : ''),
            // Step 4 接线：透传投骰多分支模型（dice 命名空间或顶层 has_dice/dice_type/dice_branches），
            // 使 executeUniversalSkill 能进入 _executeBranchModelSkill，打通前端配置的多判定投骰词条。
            dice: cfg.dice
                ? cfg.dice
                : (cfg.has_dice
                    ? { has_dice: cfg.has_dice, dice_type: cfg.dice_type, dice_branches: cfg.dice_branches || [] }
                    : null),
            category: cfg.category || 'melee',
            description: cfg.description || '',
            deterministic: cfg.deterministic !== false,
            // 条件触发（Conditional Trigger）：词条库可配 trigger 为对象 {type:'conditional',attack_type:[...],damage_kind:[...]}；
            // 若配为空字符串/未配，则视为无条件（{type:'unconditional'}）。
            trigger: (cfg.trigger && typeof cfg.trigger === 'object') ? cfg.trigger : '',
            mode: cfg.mode || '',
            // 结构化 statusEffects 字段（自动化技能统一模型）
            applies_on: cfg.applies_on || '',
            modifier: cfg.modifier || '',
            consumption: (cfg.consumption && typeof cfg.consumption === 'object') ? cfg.consumption : null,
            target_scope: cfg.target_scope || 'self',

            // 宾语 Object（范围）
            target_filter: cfg.target_filter ?? 'enemy',
            cast_range: cfg.cast_range ?? DEFAULT_RANGE_BY_CATEGORY[cfg.category] ?? 1,
            min_cast_range: cfg.min_cast_range ?? (cfg.min_range ?? 0),
            aoe_radius: cfg.aoe_radius ?? 0,
            sector_angle: cfg.sector_angle ?? 60,
            max_range: cfg.max_range ?? cfg.cast_range ?? 1,
            min_range: cfg.min_range ?? 0,
            aoe_range: cfg.aoe_range ?? 0,

            // 属性 Attribute（分流）
            damage_kind: cfg.damage_kind ?? 'kinetic',
            attack_stat: cfg.attack_stat ?? 'melee',
            accuracy_mod: cfg.accuracy_mod ?? 0,
            evasion_mod: cfg.evasion_mod ?? 0,

            // 状语 Adverbial（环境与随机干预）
            height_bonus_per_diff: cfg.height_bonus_per_diff ?? 0,
            dice_type: cfg.dice_type || '1d6',
            success_line: cfg.success_line ?? 4,
            success_bonus_damage: cfg.success_bonus_damage ?? 0,
            dice_ranges: Array.isArray(cfg.dice_ranges) ? cfg.dice_ranges : null,  // Phase 19: 分段骰
            is_manual_roll: cfg.is_manual_roll || false,

            // 谓语 Predicate（动作类型）
            action_type: cfg.action_type ?? 'attack',
            effect: cfg.effect ?? '',
            requires: cfg.requires ?? '',

            // 主语 Subject（施放条件）
            requires_unmoved: cfg.requires_unmoved ?? false,
            requires_stealth: cfg.requires_stealth ?? false,
            requires_hp_below: cfg.requires_hp_below ?? 0,      // Phase 18-A: HP阈值条件
            target_on_terrain: cfg.target_on_terrain || '',     // Phase 18-A: 地形限定条件
            hp_threshold_percent: cfg.hp_threshold_percent ?? 0,
            condition: cfg.condition ?? '',
            stat_comparison: cfg.stat_comparison ?? '',
            no_consecutive: cfg.no_consecutive ?? false,

            // 补语 Complement（结果值）
            base_damage: cfg.base_damage ?? 0,
            reduction: cfg.reduction ?? 0,
            bonus: cfg.bonus ?? 0,
            value: cfg.value ?? 0,
            mobility_buff: cfg.mobility_buff != null ? Number(cfg.mobility_buff) : 0,
            expose_radius: cfg.expose_radius != null ? Number(cfg.expose_radius) : 0,
            expose_damage: cfg.expose_damage != null ? Number(cfg.expose_damage) : 0,
            damage_modifier_precise: cfg.damage_modifier_precise ?? 0,
            damage_multiplier: cfg.damage_multiplier ?? 1.0,
            status_effects: cfg.status_effects || [],
            action: cfg.action ?? '',
        };
    }

    _defaultUniversalFields() {
        return {
            type: 'active', label: 'unknown', category: 'melee', description: '',
            deterministic: true, trigger: '', mode: '',
            target_filter: 'enemy', cast_range: 1, min_cast_range: 0,
            aoe_radius: 0, sector_angle: 60, max_range: 1, min_range: 0, aoe_range: 0,
            damage_kind: 'kinetic', attack_stat: 'melee', accuracy_mod: 0, evasion_mod: 0,
            height_bonus_per_diff: 0,
            dice_type: '1d6', success_line: 4, success_bonus_damage: 0, is_manual_roll: false,
            action_type: 'attack', effect: '', requires: '',
            requires_unmoved: false, requires_stealth: false,
            hp_threshold_percent: 0, condition: '', stat_comparison: '',
            no_consecutive: false,
            base_damage: 0, reduction: 0, bonus: 0, value: 0,
            damage_modifier_precise: 0, damage_multiplier: 1.0,
            status_effects: [], action: '',
        };
    }

    // ============================================================
    // Phase 10: 万能语法调度器 — 核心入口
    // ============================================================

    /**
     * 万能技能执行入口
     * 根据词条配置的 action_type 自动路由到对应处理器
     *
     * @param {string} skillType - 技能KEY
     * @param {Object} unit - 施放单位
     * @param {Object} target - 目标单位/格子
     * @param {Object} context - 额外上下文 { allUnits, battleState, skillRange }
     * @returns {Object} 统一执行结果
     */
    executeUniversalSkill(skillType, unit, target, context = {}, inlineSkillDef = null) {
        let cfg = getSkillConfig(skillType);
        // 网关传入的内联定义（含技能真实 Excel 射程）始终优先，
        // 确保技能自身射程覆盖词条库默认 cast_range（避免超距打不出伤害）
        if (inlineSkillDef) cfg = inlineSkillDef;
        const lookupKey = (cfg === inlineSkillDef) ? cfg : skillType;
        const uf = this._getUniversalFields(lookupKey);

        if (!cfg) {
            return { triggered: false, message: `技能 ${skillType} 未在词条库中定义` };
        }

        // === 主语检查 (Subject Checks - 直接字段) ===
        if (uf.requires_unmoved && unit.has_moved) {
            return { triggered: false, message: `${uf.label} 需要本回合未移动` };
        }
        if (uf.requires_stealth && !unit.stealth) {
            return { triggered: false, message: `${uf.label} 需要隐身状态` };
        }

        // === Phase 18-A: 平铺条件评估 (ConditionEvaluator 泛化拦截) ===
        // 将技能平面条件字段 { requires_hp_below, target_on_terrain } 交给条件评估器 AND 链判定
        if (uf.requires_hp_below > 0 || uf.target_on_terrain) {
            const flatCtx = {
                unit: {
                    hp: unit.hp,
                    maxHp: unit.max_hp || unit.maxHp || 100,
                    current_hp: unit.current_hp ?? unit.hp,
                    has_moved: unit.has_moved,
                    stealth: unit.stealth,
                },
                target: target ? {
                    terrain: target.terrain,
                } : null,
                targetTerrain: target?.terrain,
            };
            const flatConditions = {};
            if (uf.requires_hp_below > 0) flatConditions.requires_hp_below = uf.requires_hp_below;
            if (uf.target_on_terrain) flatConditions.target_on_terrain = uf.target_on_terrain;
            if (!ConditionEvaluator.evaluateFlat(flatConditions, flatCtx)) {
                // 定位原因
                if (uf.requires_hp_below > 0 && (unit.hp ?? unit.current_hp) >= uf.requires_hp_below) {
                    return { triggered: false, message: `${uf.label} 需要HP低于${uf.requires_hp_below}（当前HP=${unit.hp ?? unit.current_hp}）` };
                }
                if (uf.target_on_terrain && target?.terrain !== uf.target_on_terrain) {
                    return { triggered: false, message: `${uf.label} 目标必须站在${uf.target_on_terrain}地形（当前=${target?.terrain || '未知'}）` };
                }
                return { triggered: false, message: `${uf.label} 平铺条件未满足` };
            }
        }

        // === 宾语距离检查 (Object Range Check) ===
        if (target && uf.target_filter !== 'self') {
            const dist = this._hexDistance(unit, target);
            const minR = uf.min_cast_range || uf.min_range || 1; // 默认最小距离1（排除自身）
            const maxR = uf.cast_range || uf.max_range || 1;
            if (dist < minR || dist > maxR) {
                return {
                    triggered: false, out_of_range: true,
                    min: minR, max: maxR, actual: dist,
                    message: `${uf.label} 需要 ${minR}~${maxR} 格距离（当前 ${dist} 格）`
                };
            }
        }

        // === 定语·高地差 (Attribute - Height Bonus) ===
        let heightBonus = 0;
        let heightDiff = 0;
        if (target && uf.height_bonus_per_diff > 0) {
            const attZ = unit.z ?? unit.height ?? 0;
            const defZ = target.z ?? target.height ?? 0;
            heightDiff = attZ - defZ;
            if (heightDiff > 0) {
                heightBonus = Math.floor(heightDiff * uf.height_bonus_per_diff);
            }
        }

        // === 状语·骰子判定 (Adverbial - Dice) ===
        // 新投骰多分支模型（方案 Step 4）：has_dice + dice_branches 由配置驱动，零硬编码分支
        const newDiceModel =
          uf.dice && uf.dice.has_dice &&
          Array.isArray(uf.dice.dice_branches) && uf.dice.dice_branches.length > 0;
        if (newDiceModel) {
          return this._executeBranchModelSkill(skillType, unit, target, uf, cfg, heightBonus, heightDiff, context);
        }
        const dice = this._evaluateDice(cfg);
        const diceBonus = dice.isSuccess ? uf.success_bonus_damage : 0;

        // === 谓语路由 (Predicate Routing) ===
        switch (uf.action_type) {
            case 'attack':
                return this._executeAttackSkill(skillType, unit, target, uf, cfg, dice, heightBonus, heightDiff, context);
            case 'heal':
                return this._executeHealSkill(skillType, unit, target, uf, cfg, dice, context);
            case 'buff':
                return this._executeBuffSkill(skillType, unit, target, uf, cfg, dice, context);
            case 'debuff':
                return this._executeDebuffSkill(skillType, unit, target, uf, cfg, dice, context);
            case 'passive':
                return this._executePassiveSkill(skillType, unit, target, uf, cfg, dice, context);
            default:
                return {
                    triggered: true, type: skillType,
                    action_type: uf.action_type,
                    damage_kind: uf.damage_kind,
                    bonus_value: uf.base_damage + diceBonus + heightBonus,
                    dice, height_bonus: heightBonus,
                    message: `${uf.label}: 基础${uf.base_damage} + 骰子${diceBonus} + 高地${heightBonus}`
                };
        }
    }

    // ============================================================
    // 谓语处理器 (Predicate Handlers)
    // ============================================================

    _executeAttackSkill(skillType, unit, target, uf, cfg, dice, heightBonus, heightDiff, context) {
        const baseDamage = uf.base_damage || uf.damage_modifier_precise || 0;
        const diceBonus = Number(uf.success_bonus_damage) || 0;
        const attackType = uf.attack_stat === 'ranged' ? 'ranged' : 'melee';
        const defenderResistance = (target && (target.resist_kind ?? (target.resistance && target.resistance.resist_kind))) || '无';

        // ── 阶段1.5/3.5/8.5：结构化 statusEffects 条件匹配（blockade 削机动 / assist 增伤 / guard 减伤）──
        // 统一由遍历 unit.statusEffects + matchTrigger 动态提取，与具体技能名解耦（彻底废弃 executeAssist/Guard/Blockade）。
        const trigCtx = { attack_type: attackType, damage_kind: uf.damage_kind };
        const _attackerStatus = (unit && Array.isArray(unit.statusEffects))
            ? BuffManager.getMatchingStatus(unit, trigCtx, 'attack') : [];
        const _attackerDebuff = (unit && Array.isArray(unit.statusEffects))
            ? BuffManager.getMatchingStatus(unit, trigCtx, 'attack_debuff_target') : [];
        const _defenderStatus = (target && Array.isArray(target.statusEffects))
            ? BuffManager.getMatchingStatus(target, trigCtx, 'defense') : [];
        const blockadeMob = _attackerDebuff.reduce((s, b) => s + (Number(b.value) || 0), 0);
        const assistVal = _attackerStatus.reduce((s, b) => s + (Number(b.value) || 0), 0);
        const guardVal = _defenderStatus.reduce((s, b) => s + (Number(b.value) || 0), 0);

        // ── 1d6 伤害倍率梯度（替代原二元 dodge：roll1→60% … roll6→110%）──
        // 仅作用于纯伤害技能（has_dice 分支模型走 _executeBranchModelSkill，豁免本梯度）。
        // 倍率缩放基础伤害，其后机动/地形/防御仍真实加减（方式A：减伤可见、不被地板吃掉）。
        const ROLL_MULT = DiceService.config.rollMult;
        const _roll = Math.min(6, Math.max(1, Number(dice?.roll ?? 4)));
        const rollMult = ROLL_MULT[_roll - 1] ?? 1.0;
        const baseScaled = Math.round((baseDamage || 0) * rollMult);

        // ── 机动差修正（用户定义公式核心项）：攻击力 - 双方机动值差 ──
        // 机动值差 = 防御方机动 - 攻击方机动（带正负号），作为减项；
        // 攻击方机动高 → 差为负 → 实际增伤；防御方机动高 → 差为正 → 减伤。
        // 若攻击来源为武器类装备，攻击方有效机动需叠加该武器机动值（context.isWeaponAttack / weaponMobility）。
        const weaponMobRaw = (context && context.isWeaponAttack) ? Number(context.weaponMobility ?? 0) : 0;
        const attMobBase = Number(unit?.mobility ?? 0);
        const attMob = attMobBase + weaponMobRaw;   // 含武器机动的攻击方有效机动
        const defMobRaw = Number(target?.mobility ?? 0);
        const defMob = Math.max(0, defMobRaw - blockadeMob);   // 扣除 blockade 机动削弱
        const mobilityDiff = defMob - attMob;        // 防御方机动优势
        let mobilityMod = -mobilityDiff;             // 实际并入伤害的符号值（攻击方机动高则为正）
        // 上限封顶：攻击方机动优势带来的增伤最高 +4；防御方机动优势（减伤）无上限。
        let mobilityCapped = false;
        if (mobilityMod > 4) { mobilityMod = 4; mobilityCapped = true; }

        const subtotal = baseScaled + mobilityMod + diceBonus + heightBonus;
        let finalDamage = subtotal;

        // H7 实时伤害减免（抗性 + 专注射射）：在结算反击前挂一次（详见 damageModifiers.cjs）
        let resistReduction = 0;
        let focusedFireBonus = 0;
        try {
            // D 修复：传入 subtotal（而非预清零的 finalDamage），让抗性/专注射击分别归因；闪避在应用后统一归零
            const mod = applyDamageModifiers({
                caster: unit,
                target,
                damage: subtotal,
                damageKind: uf.damage_kind,
                attackStat: uf.attack_stat,
                manualDice: null,
            });
            finalDamage = mod.damage;
            resistReduction = mod.resistanceReduction || 0;
            focusedFireBonus = mod.focusedFireBonus || 0;
            if (mod.log && mod.log.length) mod.log.forEach((l) => console.log('[skillExecutor]', l));
        } catch (e) {
            console.error('[skillExecutor] applyDamageModifiers 失败:', e.message);
        }

        // ── Phase 30-Cover 掩体系统实装：地形防御固定减伤（与 damagePipe._calcDefense 语义一致）──
        // 仅当战斗上下文透传了 terrainMap（"q,r"→terrainId）时生效；无地形图则跳过（向后兼容）。
        let terrainReduction = 0;
        let terrainId = null;
        try {
            const terrainMap = (context && context.terrainMap) || null;
            if (terrainMap && target && target.q != null) {
                terrainId = terrainMap[getHexKey(target.q, target.r)] || null;
                const tb = this._getTerrainDefenseBonus(target.q, target.r, terrainMap);
                if (tb > 0) {
                    const before = finalDamage;
                    finalDamage = Math.max(0, finalDamage - tb);
                    terrainReduction = before - finalDamage;
                    if (finalDamage !== before) {
                        console.log(`[skillExecutor][cover] 地形减伤 ${tb} → finalDamage ${before}→${finalDamage} (${target.q},${target.r})`);
                    }
                }
            }
        } catch (e) {
            console.error('[skillExecutor][cover] 应用失败:', e && e.message);
        }

        // ── 阶段3.5 / 8.5：assist 增伤 + guard 减伤 ──
        if (assistVal) finalDamage = finalDamage + assistVal;
        if (guardVal) finalDamage = Math.max(0, finalDamage - guardVal);

        // === 体型克制：被更小攻击者 → 防守方每档 +1 防御减伤 ===
        const atkSize = normSize(unit.size);
        const defSize = normSize(target.size);
        const sizeDef = sizeDefenseBonus(atkSize, defSize);
        if (sizeDef > 0) {
          finalDamage = Math.max(0, finalDamage - sizeDef);
        }
        // 体型机动补偿：被更大攻击者 → 防守方下回合机动 +N（Buff 在网关写回处挂；result 构造后赋值）
        const sizeMob = sizeMobilityBonus(atkSize, defSize);

        // ── 反击结算：受击方在反击射程内自动反击（仅当 glossary 配置 'counter' 技能时启用）──
        let counterTriggered = false;
        let counterDamage = 0;
        if (target && target.hp > 0 && getSkillConfig('counter')) {
            const counterRes = this.executeCounter(target, unit, uf.max_range || uf.cast_range || 1);
            if (counterRes && counterRes.triggered) {
                counterTriggered = true;
                counterDamage = counterRes.bonus || 0;
            }
        }

        // ── 伤害公式明细（供前端战斗结算弹窗展示）──
        const formula = [
            { label: '基础伤害值', value: baseDamage, desc: `${attackType === 'ranged' ? '射击' : '格斗'}属性（机体+装备携带值）` },
            { label: '投骰倍率', value: baseScaled - baseDamage, desc: `1d6=${_roll} → ×${(rollMult * 100).toFixed(0)}% 基础 ${baseDamage}×${rollMult}=${baseScaled}` },
            { label: '机动差修正', value: mobilityMod, desc: `攻方机动 ${attMob}${weaponMobRaw > 0 ? `(机体${attMobBase}+武器${weaponMobRaw})` : ''} - 守方机动 ${defMob} = ${mobilityMod}${mobilityCapped ? '（攻击方优势封顶 +4）' : ''}${mobilityMod < 0 ? '（防御方优势减伤无上限）' : ''}` },
            { label: '骰子加成', value: diceBonus, desc: `成功加成 ${uf.success_bonus_damage || 0}` },
            { label: '高地加成', value: heightBonus, desc: heightDiff > 0 ? `高度差 ${heightDiff}` : '无高度差' },
            { label: '小计', value: subtotal, isSubtotal: true },
            { label: '抗性减伤', value: -resistReduction, desc: `伤害类型 ${uf.damage_kind || '?'} vs 防御 ${defenderResistance}` },
            ...(focusedFireBonus > 0 ? [{ label: '专注射击加成', value: focusedFireBonus, desc: `${uf.attack_stat === 'ranged' ? '远程' : '近战'}专注射击` }] : []),
            { label: '地形减伤', value: -terrainReduction, desc: terrainId ? `地形 ${terrainId}` : '无地形减伤' },
            ...(sizeDef > 0 ? [{ label: '体型减伤', value: -sizeDef, desc: `防守方体型更大（${SIZE_LABELS[defSize]} ▷ ${SIZE_LABELS[atkSize]}），压制 ${sizeDef} 档，每档 −1 伤害`, isSizeDef: true }] : []),
            { label: '最终伤害', value: finalDamage, isFinal: true },
        ];
        if (counterTriggered) formula.push({ label: '反击伤害(反向)', value: counterDamage, desc: '受击方自动反击', isCounter: true });

        const result = {
            triggered: true,
            type: skillType,
            action_type: 'attack',
            attack_type: attackType,
            attack_stat: uf.attack_stat,
            damage_kind: uf.damage_kind,
            active: true,
            base_damage: baseDamage,
            dice,
            height_bonus: heightBonus,
            height_diff: heightDiff,
            final_damage: finalDamage,
            bonus_value: finalDamage,
            dodged: false,
            counter_triggered: counterTriggered,
            counter_damage: counterDamage,
            accuracy_mod: uf.accuracy_mod,
            evasion_mod: uf.evasion_mod,
            status_effects: uf.status_effects,
            // 本轮结算中被「命中条件且被实际使用」的 statusEffects.id 列表（供调用方扣减层数）
            triggered_status: [
                ..._attackerStatus.map(b => b.id),
                ..._attackerDebuff.map(b => b.id),
                ..._defenderStatus.map(b => b.id),
            ],
            formula,
        };

        // 体型克制信息下沉给网关/前端（防守方更大→减伤横幅；攻击方更大→机动补偿）
        if (sizeDef > 0) {
          result.sizeBanner = { kind: 'def', reduction: sizeDef, attackerSize: atkSize, defenderSize: defSize };
        }
        if (sizeMob > 0) {
          result.sizeTactic = { kind: 'mob', amount: sizeMob, attackerSize: atkSize, defenderSize: defSize };
        }

        // 构建消息
        let msgParts = [`${uf.label}`];
        if (dice.roll > 0) {
            // Phase 19: dice_ranges 分段模式下显示区间标签，否则显示传统 successLine
            if (dice.rangeLabel) {
                const rangeTag = dice.isSuccess ? `[${dice.rangeLabel}]` : `[未命中]`;
                msgParts.push(`掷${dice.diceType}=${dice.roll} ${rangeTag}`);
            } else {
                msgParts.push(`掷${dice.diceType}=${dice.roll}${dice.isSuccess ? '>=' + dice.successLine : '<' + dice.successLine}`);
            }
        }
        if (heightBonus > 0) msgParts.push(`高地+${heightBonus}`);
        if (finalDamage <= 0) {
            msgParts.push(`未造成伤害`);
        } else {
            msgParts.push(`伤害${finalDamage}`);
        }
        if (counterTriggered) msgParts.push(`受反击${counterDamage}`);
        result.message = msgParts.join(', ');

        // 定语修正注入 context
        if (context) {
            if (uf.accuracy_mod) context.accuracy_mod = (context.accuracy_mod || 0) + uf.accuracy_mod;
            if (uf.evasion_mod) context.evasion_mod = (context.evasion_mod || 0) + uf.evasion_mod;
        }

        return result;
    }

    _executeHealSkill(skillType, unit, target, uf, cfg, dice, context) {
        const healStat = uf.attack_stat === 'ranged'
            ? (unit.ranged || unit.attack || 10)
            : (unit.melee || unit.attack || 10);
        const diceBonus = dice.isSuccess ? uf.success_bonus_damage : 0;
        const healAmount = (uf.base_damage || healStat) + diceBonus;

        if (target) {
            const dist = this._hexDistance(unit, target);
            if (dist > uf.cast_range || dist === 0) {
                return {
                    heal_amount: 0, out_of_range: true,
                    min: 1, max: uf.cast_range, actual: dist,
                    message: `${uf.label} 仅对范围 ${uf.cast_range} 内友军有效`
                };
            }
        }

        return {
            triggered: true,
            type: skillType,
            action_type: 'heal',
            active: true,
            heal_amount: healAmount,
            bonus_value: healAmount,
            dice,
            message: dice.roll > 0
                ? `${uf.label}: 回复 ${healAmount} HP [掷${dice.diceType}=${dice.roll}]`
                : `${uf.label}: 回复 ${healAmount} 点 HP`
        };
    }

    _executeBuffSkill(skillType, unit, target, uf, cfg, dice, context) {
        const buffValue = uf.base_damage || uf.bonus || uf.value || 0;
        const diceBonus = dice.isSuccess ? uf.success_bonus_damage : 0;
        const finalValue = buffValue + diceBonus;

        const result = {
            triggered: true,
            type: skillType,
            action_type: 'buff',
            active: true,
            buff_value: finalValue,
            bonus_value: finalValue,
            dice,
            message: dice.roll > 0
                ? `${uf.label}: +${finalValue} [掷${dice.diceType}=${dice.roll}]`
                : `${uf.label}: +${finalValue}`
        };

        // 侦察类：机动增益（自身，持续 duration）—— 不依赖 applies_on
        if (uf.mobility_buff && !uf.applies_on) {
            const mobStatus = BuffManager.buildStatusInstance(skillType, {
                ...uf,
                applies_on: 'mobility',
                modifier: 'mobility_buff',
                bonus: uf.mobility_buff,
                value: uf.mobility_buff,
            });
            if (!Array.isArray(unit.statusEffects)) unit.statusEffects = [];
            _refreshOrAddStatus(unit, mobStatus);
            result.statusEffects_added = [mobStatus];
            result.buff_value = uf.mobility_buff;
            result.bonus_value = uf.mobility_buff;
            result.message = `${uf.label}: 机动 +${uf.mobility_buff}（持续 ${(uf.consumption && uf.consumption.duration) || uf.duration || '?'} 回合）`;
            return result;
        }

        // 仅当词条显式声明 applies_on（结构化自动化技能：assist/guard/blockade）时，
        // 才生成并写回 statusEffects 实例；未声明的旧 buff（stable/sniper 等）
        // 走原路径，仅返回 buff_value，不持久化，避免影响其语义。
        if (uf.applies_on) {
            const destUnit = (uf.target_scope === 'self' || uf.target_scope === 'self_only' || !uf.target_scope) ? unit : target;
            const statusInstance = BuffManager.buildStatusInstance(skillType, uf);
            if (!Array.isArray(destUnit.statusEffects)) destUnit.statusEffects = [];
            _refreshOrAddStatus(destUnit, statusInstance);
            result.statusEffects_added = [statusInstance];
        }

        return result;
    }

    _executeDebuffSkill(skillType, unit, target, uf, cfg, dice, context) {
        const debuffValue = uf.base_damage || uf.value || 0;
        const diceBonus = dice.isSuccess ? uf.success_bonus_damage : 0;
        const finalValue = debuffValue + diceBonus;
        const statusEffects = uf.status_effects || [];

        const result = {
            triggered: true,
            type: skillType,
            action_type: 'debuff',
            active: true,
            debuff_value: finalValue,
            bonus_value: finalValue,
            aoe_radius: uf.aoe_radius || uf.aoe_range || 0,
            status_effects: statusEffects,
            dice,
            message: dice.roll > 0
                ? `${uf.label}: 增伤+${finalValue} [掷${dice.diceType}=${dice.roll}]`
                : `${uf.label}: 目标周围 ${uf.aoe_range || uf.aoe_radius} 格内所有目标下次伤害 +${finalValue}`
        };

        // 仅当词条显式声明 applies_on（结构化自动化技能：blockade）时生成并写回 statusEffects 实例。
        if (uf.applies_on) {
            const destUnit = (uf.target_scope === 'self' || uf.target_scope === 'self_only' || !uf.target_scope) ? unit : target;
            const statusInstance = BuffManager.buildStatusInstance(skillType, uf);
            if (!Array.isArray(destUnit.statusEffects)) destUnit.statusEffects = [];
            _refreshOrAddStatus(destUnit, statusInstance);
            result.statusEffects_added = [statusInstance];
        }

        return result;
    }

    _executePassiveSkill(skillType, unit, target, uf, cfg, dice, context) {
        const result = {
            triggered: true,
            type: skillType,
            action_type: 'passive',
            active: true,
            damage_kind: uf.damage_kind,
            bonus_value: (uf.reduction || uf.base_damage || uf.bonus || 0) + (dice.isSuccess ? 1 : 0),
            dice,
            message: `${uf.label} 触发`
        };

        // 特殊被动效果：斩杀 / 决斗 / 抢夺 / 幸运 / 再动
        if (uf.condition === 'damage_greater_than_target_weapon_attack' || cfg.condition === 'damage_greater_than_target_weapon_attack') {
            return {
                ...result,
                snatch_mode: true,
                damage_multiplier: uf.damage_multiplier || 0.5,
                message: '抢夺判定待触发'
            };
        }

        if (uf.stat_comparison === 'max_attack' || cfg.stat_comparison === 'max_attack') {
            return {
                ...result,
                duel_mode: true,
                message: '决斗判定待触发'
            };
        }

        return result;
    }

    // ============================================================
    // 新投骰多分支模型 (Phase 对齐方案 Step 4)
    // 由 dice_branches 配置驱动：投骰 → 命中分支 → 顺序执行其下全部效果
    // ============================================================
    _executeBranchModelSkill(skillType, unit, target, uf, cfg, heightBonus, heightDiff, context) {
        const roll = BranchEvaluator.rollDice(uf.dice.dice_type);
        const hits = BranchEvaluator.evaluateBranches(uf.dice.dice_branches, roll);
        const ectx = BranchEvaluator.newEffectContext();
        BranchEvaluator.applyBranchEffects(hits.flatMap((h) => h.effects), ectx);

        const result = {
            triggered: true,
            type: skillType,
            action_type: uf.action_type || 'attack',
            damage_kind: uf.damage_kind,
            active: true,
            roll,
            dice_type: uf.dice.dice_type,
            hit: hits.length > 0,
            outcome: hits.length > 0 ? 'success' : 'failure',
            height_bonus: heightBonus,
            height_diff: heightDiff,
            status_effects: [],
            log: [`投骰=${roll} 命中分支 ${hits.length} 个`].concat(ectx.log)
        };

        if (hits.length === 0) {
            result.bonus_value = 0;
            result.damage = 0;
            result.final_damage = 0;
            // 公式明细（供前端结算弹窗展示）：未命中无伤害
            result.formula = [
                { label: '基础伤害值', value: Number(uf.base_damage) || 0, desc: `机体${uf.attack_stat === 'ranged' ? '射击' : '格斗'}属性（含装备，若技能由装备携带）` },
                { label: '投骰判定', value: 0, desc: `投${uf.dice.dice_type}=${roll} 未命中任何判定分支` },
                { label: '最终伤害', value: 0, isFinal: true, warn: true },
            ];
            result.message = `${uf.name || uf.label}: 投骰=${roll} 未命中任何判定分支，技能未生效`;
            return result;
        }

        const bonus = ectx.bonus + (Number(uf.success_bonus_damage) || 0);
        let finalDamage = 0;
        if (uf.action_type === 'attack' || (ectx.damage > 0 && uf.action_type !== 'heal')) {
            const base = ectx.damage > 0 ? ectx.damage : Number(uf.base_damage) || 0;
            finalDamage = base + bonus + heightBonus;
            result.damage = finalDamage;
            result.final_damage = finalDamage;
            result.base_damage = Number(uf.base_damage) || 0;
            result.bonus_value = finalDamage;
        } else {
            result.bonus_value = bonus;
        }
        // 公式明细（供前端结算弹窗展示）：有判定效果词条（投骰子分支）逐行呈现
        const branchesDesc = hits.map(h => h.label || h.action || '分支').join(' / ');
        result.formula = [
            { label: '基础伤害值', value: Number(uf.base_damage) || 0, desc: `机体${uf.attack_stat === 'ranged' ? '射击' : '格斗'}属性（含装备，若技能由装备携带）` },
            { label: '投骰判定', value: 0, desc: `投${uf.dice.dice_type}=${roll} → 命中分支：${branchesDesc}` },
            ...(bonus > 0 ? [{ label: '效果加成', value: bonus, desc: ectx.log.join('; ') }] : []),
            { label: '高地加成', value: heightBonus, desc: heightDiff > 0 ? `高度差 ${heightDiff}` : '无高度差' },
            { label: '最终伤害', value: finalDamage, isFinal: true },
        ];

        if (ectx.heal > 0) {
            result.heal = ectx.heal;
            result.heal_amount = ectx.heal;
        }

        for (const s of ectx.statuses) {
            result.status_effects.push({ status: s.status, target: s.target });
        }

        // 命中/机动修正：回写 context 供结算管线使用
        result.accuracy_mod = (Number(uf.accuracy_mod) || 0) + ectx.accuracyMod;
        result.mobility_mod = ectx.mobilityMod;
        if (context) {
            if (result.accuracy_mod) context.accuracy_mod = (context.accuracy_mod || 0) + result.accuracy_mod;
            if (result.mobility_mod) context.mobility_mod = (context.mobility_mod || 0) + result.mobility_mod;
        }

        result.message = `${uf.name || uf.label}: 投骰=${roll} 命中 ${hits.length} 分支 → ${ectx.log.join('; ')}`;
        return result;
    }

    // ============================================================
    // 骰子系统 (Phase 8)
    // ============================================================

    // 掷骰（统一走 diceService.cjs，支持 "NdM" 与面数）
    _rollDice(diceStr) {
        return DiceService.roll(diceStr);
    }

    _evaluateDice(skillCfg) {
        if (!skillCfg) return { roll: 0, diceType: '1d6', successLine: 4, isSuccess: false, bonusDamage: 0 };

        const diceType = skillCfg.dice_type || '1d6';
        const roll = this._rollDice(diceType);

        // ============================================================
        //  Phase 19: 多档位分段骰系统 (dice_ranges)
        //  优先级高于旧版 success_line 单一阈值
        //  配置格式: dice_ranges: [{ min:1, max:X, action:"...", bonus_damage:N }, ...]
        // ============================================================
        if (Array.isArray(skillCfg.dice_ranges) && skillCfg.dice_ranges.length > 0) {
            const range = skillCfg.dice_ranges.find(r => roll >= r.min && roll <= r.max);
            if (range) {
                return {
                    roll,
                    diceType,
                    successLine: null,
                    range_min: range.min,
                    range_max: range.max,
                    range_action: range.action || '',
                    isSuccess: range.action !== 'miss',
                    bonusDamage: range.bonus_damage || (range.action === 'critical' ? (skillCfg.success_bonus_damage ?? 0) : 0),
                    rangeLabel: range.label || range.action || '',
                    rangeDamageMultiplier: range.damage_multiplier ?? 1.0,
                    // 透传 range 原始配置供后续判决使用
                    _range: range
                };
            }
            // 掷骰结果落空（不在任何区间内），视为失败
            return {
                roll, diceType, successLine: null,
                isSuccess: false, bonusDamage: 0,
                range_min: 0, range_max: 0, range_action: 'miss',
                rangeLabel: 'miss', rangeDamageMultiplier: 1.0,
                _range: null
            };
        }

        // 降级：传统 success_line 单一阈值（向后兼容）
        const successLine = skillCfg.success_line ?? 4;
        const bonusDamage = skillCfg.success_bonus_damage ?? 0;
        const isSuccess = roll >= successLine;
        return {
            roll,
            diceType,
            successLine,
            isSuccess,
            bonusDamage: isSuccess ? bonusDamage : 0
        };
    }

    _applyDiceToDamage(skillCfg, baseDamageOverride) {
        const cfg = typeof skillCfg === 'string' ? getSkillConfig(skillCfg) : skillCfg;
        const baseDamage = baseDamageOverride ?? (cfg?.base_damage ?? 0);
        if (!cfg || !cfg.dice_type || cfg.dice_type === 'none') {
            return { damage: baseDamage, dice: null };
        }
        const dice = this._evaluateDice(cfg);
        // Phase 19: dice_ranges 分段模式下，use rangeDamageMultiplier
        const mult = (dice.rangeDamageMultiplier != null) ? dice.rangeDamageMultiplier : 1.0;
        const finalDamage = Math.round((baseDamage + (dice.bonusDamage || 0)) * mult);
        return { damage: finalDamage, dice };
    }

    // ============================================================
    // Phase 10: 手动摇骰状态机钩子
    // ============================================================

    /**
     * 手动摇骰判定 (Phase 10 状态机接入点)
     * 当前为自动模拟，实际使用时挂起状态机等待玩家前台拍空格
     */
    evaluateManualRoll(skillCfg) {
        if (!skillCfg || !skillCfg.is_manual_roll) {
            return { manual: false, bonus: 0 };
        }
        const dice = this._evaluateDice(skillCfg);
        const bonus = dice.isSuccess ? (skillCfg.success_bonus_damage ?? 0) : 0;
        return {
            manual: true,
            roll: dice.roll,
            diceType: dice.diceType,
            successLine: dice.successLine,
            isSuccess: dice.isSuccess,
            bonus,
            message: dice.isSuccess
                ? `[手动摇骰 SUCCESS] 掷${dice.diceType}=${dice.roll} >= ${dice.successLine}, 追加+${bonus}`
                : `[手动摇骰 FAIL] 掷${dice.diceType}=${dice.roll} < ${dice.successLine}`
        };
    }

    // ============================================================
    // 向后兼容：保留原有技能方法（内部调用万能调度器）
    // ============================================================

    getSkillRange(skillType) {
        const uf = this._getUniversalFields(skillType);
        const cr = uf.cast_range;
        return { min: uf.min_cast_range, max: cr };
    }

    getAoeRadius(skillType) {
        const uf = this._getUniversalFields(skillType);
        return uf.aoe_radius;
    }

    resetStableForBattle() {
        this.stableUsedInBattle.clear();
    }

    // ---- 近战技能 ----

    executeCounter(unit, attacker, skillRange) {
        const cfg = getSkillConfig('counter');
        const uf = this._getUniversalFields('counter');
        const range = skillRange ?? uf.cast_range ?? 1;
        const dist = this._hexDistance(unit, attacker);
        if (dist > range) return { triggered: false };

        const dice = this._evaluateDice(cfg);
        const baseBonus = uf.bonus || uf.base_damage || 2;
        const bonus = baseBonus + (dice.isSuccess ? uf.success_bonus_damage : 0);
        return {
            triggered: true, type: 'counter', attack_type: 'melee', active: true,
            bonus, bonus_value: bonus, damage_kind: uf.damage_kind, dice,
            message: dice.roll > 0
                ? `反击！掷${dice.diceType}=${dice.roll}, 伤害+${bonus}`
                : `反击触发！伤害 +${bonus}`
        };
    }

    executeBlock() {
        const cfg = getSkillConfig('block');
        const uf = this._getUniversalFields('block');
        const reduction = uf.reduction || 2;
        const dice = this._evaluateDice(cfg);
        const effReduction = reduction + (dice.isSuccess ? 1 : 0);
        return {
            triggered: true, blocked: true,
            reduction: effReduction, bonus_value: effReduction, dice,
            message: dice.roll > 0
                ? `格挡！伤害 -${effReduction} [掷${cfg.dice_type}=${dice.roll}${dice.isSuccess ? '>=success' : '<success'}]`
                : `格挡成功！伤害 -${effReduction}`
        };
    }

    getPolearmExtraRange(unit, target) {
        const sameQ = (unit.q || 0) === (target.q || 0);
        const sameR = (unit.r || 0) === (target.r || 0);
        if (sameQ || sameR) return 1;
        return 0;
    }

    executeSupply(unit, target) {
        const uf = this._getUniversalFields('supply');
        if (target) {
            const dist = this._hexDistance(unit, target);
            if (dist > uf.cast_range || dist === 0) {
                return {
                    heal_amount: 0, out_of_range: true,
                    min: 1, max: uf.cast_range, actual: dist,
                    message: `补给仅对范围 ${uf.cast_range} 内友军有效（当前距离 ${dist} 格）`
                };
            }
        }
        const melee = unit.melee || unit.attack || 10;
        const cfg = getSkillConfig('supply');
        const dice = this._evaluateDice(cfg);
        const healAmount = melee + (dice.isSuccess ? (uf.success_bonus_damage) : 0);
        return {
            heal_amount: healAmount, bonus_value: healAmount, dice,
            message: dice.roll > 0
                ? `补给：回复 ${healAmount} HP [掷${dice.diceType}=${dice.roll}]`
                : `补给：回复 ${healAmount} 点 HP`
        };
    }

    // ---- 远程技能 ----

    executeSweep(unit, target, allUnits) {
        const cfg = getSkillConfig('sweep');
        const uf = this._getUniversalFields('sweep');
        const sectorAngle = uf.sector_angle;
        const maxRange = uf.cast_range || uf.max_range;

        if (target && !this._isInSector(unit, target, maxRange, sectorAngle)) {
            return { mode: 'out_of_range', message: `扫射需要目标在扇形${maxRange}格范围内（当前超出范围）` };
        }

        const { damage: finalDmg, dice } = this._applyDiceToDamage(cfg);
        return {
            mode: 'precise', attack_type: 'ranged', active: true,
            targets: [target],
            base_damage: uf.base_damage || uf.damage_modifier_precise || -2,
            final_damage: finalDmg, damage_kind: uf.damage_kind,
            bonus_value: finalDmg, dice,
            message: dice?.roll > 0
                ? `扫射！掷${dice.diceType}=${dice.roll}${dice.isSuccess ? '>=success' : '<success'}, 伤害${finalDmg}`
                : `扫射精准命中！伤害 ${finalDmg}`
        };
    }

    executeThrow(unit, target) {
        const cfg = getSkillConfig('throw');
        const uf = this._getUniversalFields('throw');
        const minRange = uf.min_cast_range || uf.min_range || 1;
        const maxRange = uf.cast_range || uf.max_range;

        if (target) {
            const dist = this._hexDistance(unit, target);
            if (dist < minRange || dist > maxRange) {
                return {
                    mode: 'out_of_range',
                    min: minRange, max: maxRange, actual: dist,
                    message: `投掷需要 ${minRange}~${maxRange} 格距离（当前 ${dist} 格）`
                };
            }
        }

        const dice = this._evaluateDice(cfg);
        const baseAmp = uf.value || uf.base_damage || 5;
        const ampValue = baseAmp + (dice.isSuccess ? uf.success_bonus_damage : 0);
        return {
            mode: 'debuff', effect: 'damage_amp',
            value: ampValue, bonus_value: ampValue,
            aoe_radius: uf.aoe_radius || uf.aoe_range || 2,
            dice,
            message: dice.roll > 0
                ? `投掷！增伤+${ampValue} [掷${dice.diceType}=${dice.roll}]`
                : `投掷：目标周围 2 格内所有目标下次伤害 +${ampValue}`
        };
    }

    executeStable(unit, target) {
        const uf = this._getUniversalFields('stable');
        const unitKey = unit.id || unit.unit_id;
        if (this.stableUsedInBattle.get(unitKey)) {
            return { triggered: false, message: '稳定已在本次战斗中使用过' };
        }

        if (target) {
            const dist = this._hexDistance(unit, target);
            if (dist < 1 || dist > 4) {
                return {
                    triggered: false, out_of_range: true,
                    min: 1, max: 4, actual: dist,
                    message: `稳定需要 1~4 格距离（当前 ${dist} 格）`
                };
            }
        }

        this.stableUsedInBattle.set(unitKey, true);
        const ff = this.executeFocusedFire();

        return {
            triggered: true, type: 'stable', active: true,
            focused_fire: ff, bonus: ff.bonus, bonus_value: ff.bonus,
            message: `稳定触发！${ff.message}`
        };
    }

    canSniper(unit, target) {
        const cfg = getSkillConfig('sniper');
        const uf = this._getUniversalFields('sniper');
        if (unit.has_moved) {
            return { triggered: false, message: '狙击需要舍弃本回合移动' };
        }
        if (!target) {
            return { triggered: false, message: '狙击需要目标' };
        }
        const minRange = uf.min_cast_range || uf.min_range || 4;
        const maxRange = uf.cast_range || uf.max_range || 6;
        const dist = this._hexDistance(unit, target);
        if (dist < minRange || dist > maxRange) {
            return {
                triggered: false, out_of_range: true,
                min: minRange, max: maxRange, actual: dist,
                message: `狙击需要 ${minRange}~${maxRange} 格距离（当前 ${dist} 格）`
            };
        }
        const dice = this._evaluateDice(cfg);
        const mobReduce = 2 + (dice.isSuccess ? uf.success_bonus_damage : 0);
        return {
            triggered: true, type: 'sniper', attack_type: 'ranged', active: true,
            mobility_reduction: mobReduce, bonus_value: mobReduce, dice,
            damage_kind: uf.damage_kind,
            message: dice.roll > 0
                ? `狙击！掷${dice.diceType}=${dice.roll}, 目标机动值-${mobReduce}`
                : `狙击：舍弃移动，目标机动值 -${mobReduce}`
        };
    }

    // ---- 自动化技能 ----
    // 注：executeAssist/executeGuard/executeBlockade 已于 v5 重构中彻底废弃。
    // 自动化技能（assist/guard/blockade/stable/sniper/scout）一律通过统一的
    // statusEffects 模型 + BuffManager 动态提取，与具体技能名解耦。

    executeScout(unit, ally) {
        const uf = this._getUniversalFields('scout');
        const scoutRange = unit.ranged || unit.attack || 10;
        if (!ally) return { triggered: false };
        const dist = this._hexDistance(unit, ally);
        // 方案A：侦察友军判定按轮转角色归并（同角色=友军）
        const su = unit.role != null ? unit.role : unit.faction;
        const sa = ally.role != null ? ally.role : ally.faction;
        if (dist > scoutRange || su !== sa) return { triggered: false };
        return {
            triggered: true, type: 'scout', active: true,
            evasion_bonus: uf.evasion_mod || 2,
            bonus_value: uf.evasion_mod || 2,
            scout_range: scoutRange,
            message: `侦察：友军闪避值 +${uf.evasion_mod || 2}（侦察范围 ${scoutRange} 格）`
        };
    }

    // ---- 特殊词条 ----

    executeExecute(target) {
        const uf = this._getUniversalFields('execute');
        const hp = target.hp || 0;
        const maxHp = target.max_hp || target.hp || 1;
        const thresholdPercent = uf.hp_threshold_percent || 10;
        const threshold = Math.max(1, Math.floor(maxHp * thresholdPercent / 100));

        if (hp <= 0 || hp > threshold) {
            return { executed: false, message: `HP=${hp} > 斩杀阈值 ${threshold}` };
        }
        return {
            executed: true, threshold,
            message: `斩杀！HP=${hp} ≤ 阈值${threshold} (${thresholdPercent}% maxHP)，目标直接阵亡`
        };
    }

    executeDuel(unitA, unitB) {
        const uf = this._getUniversalFields('duel');
        const maxA = Math.max(unitA.melee || unitA.attack || 10, unitA.ranged || 0);
        const maxB = Math.max(unitB.melee || unitB.attack || 10, unitB.ranged || 0);

        if (unitA.hp >= maxB || unitB.hp >= maxA) return { triggered: false };
        const dist = this._hexDistance(unitA, unitB);
        if (dist > 1) return { triggered: false };

        if (maxA === maxB) {
            return {
                triggered: true, draw: true,
                statA: maxA, statB: maxB,
                message: `决斗同归于尽！双方 max_attack=${maxA}`
            };
        }

        const winner = maxA > maxB ? 'attacker' : 'defender';
        return {
            triggered: true, draw: false, winner,
            statA: maxA, statB: maxB,
            message: `决斗！${winner === 'attacker' ? '攻击方' : '防御方'} 获胜 (max_attack: ${maxA} vs ${maxB})`
        };
    }

    executeSnatch(damageDealt, defenderWeaponAttack) {
        const uf = this._getUniversalFields('snatch');
        if (damageDealt <= defenderWeaponAttack) return { triggered: false };
        return {
            triggered: true, success: true,
            damage_reduced: Math.floor(damageDealt * (uf.damage_multiplier || 0.5)),
            message: `抢夺成功！获得武器，伤害减半为 ${Math.floor(damageDealt * (uf.damage_multiplier || 0.5))}`
        };
    }

    executeFocusedFire() {
        const cfg = getSkillConfig('focused_fire');
        const uf = this._getUniversalFields('focused_fire');
        const baseBonus = uf.base_damage || uf.bonus || 4;
        const dice = this._evaluateDice(cfg);
        const bonus = baseBonus + (dice.isSuccess ? uf.success_bonus_damage : 0);
        return {
            bonus, bonus_value: bonus, dice,
            message: dice.roll > 0
                ? `专注射击：掷${dice.diceType}=${dice.roll}, 伤害+${bonus}`
                : `专注射击：伤害 +${bonus}`
        };
    }

    executeLucky() {
        const cfg = getSkillConfig('lucky');
        const uf = this._getUniversalFields('lucky');
        const action = uf.action || 'remove_and_attack';
        return {
            action, bonus_value: 0,
            message: '幸运触发：再次移动并攻击'
        };
    }

    canReactivate(killConfirmed, lastReactivation) {
        return killConfirmed && !lastReactivation;
    }

    // ============================================================
    // 工具方法
    // ============================================================

    _hexDistance(a, b) {
        if (!a || !b) return 999;
        // ★ 阶段 B：Even-R offset 语义统一（前端坐标即 offset，禁止 axial 公式误算）
        const offToAx = (q, r) => ({ q: q - (r + (r & 1)) / 2, r });
        const ax = offToAx(a.q || 0, a.r || 0);
        const bx = offToAx(b.q || 0, b.r || 0);
        const dq = Math.abs(ax.q - bx.q);
        const dr = Math.abs(ax.r - bx.r);
        const ds = Math.abs(ax.q + ax.r - bx.q - bx.r);
        return Math.max(dq, dr, ds);
    }

    _isInSector(unit, target, maxDist = 2, sectorAngle = 60) {
        if (!unit || !target) return false;
        const dist = this._hexDistance(unit, target);
        if (dist > maxDist || dist === 0) return false;

        const dq = (target.q || 0) - (unit.q || 0);
        const dr = (target.r || 0) - (unit.r || 0);

        const x = dq + dr * 0.5;
        const y = dr * 0.866;

        const angle = Math.atan2(y, x) * 180 / Math.PI;
        const facing = unit.facing || 0;

        let diff = Math.abs(angle - facing);
        if (diff > 180) diff = 360 - diff;
        return diff <= sectorAngle;
    }

    // ============================================================
    // Phase9: 可破坏地形管道
    // ============================================================

    _getTerrainConfig() {
        try {
            const cfg = getGlossaryConfig();
            return cfg?.terrains || {};
        } catch (e) { return {}; }
    }

    _applyTerrainDamage(unit, targetCell, damage, battleState) {
        if (!targetCell || !battleState) return { terrainDestroyed: false, newTerrain: null, message: '' };
        const terrains = this._getTerrainConfig();
        const key = targetCell.q + ',' + targetCell.r;
        const currentTerrainId = (battleState.terrain && battleState.terrain[key]) || 'moon';
        const terrainDef = terrains[currentTerrainId];
        if (!terrainDef || !terrainDef.is_destructible) {
            return { terrainDestroyed: false, newTerrain: null, message: '' };
        }
        if (!battleState.terrain_hp) battleState.terrain_hp = {};
        if (battleState.terrain_hp[key] === undefined) {
            battleState.terrain_hp[key] = terrainDef.max_hp;
        }
        battleState.terrain_hp[key] -= damage;
        if (battleState.terrain_hp[key] <= 0) {
            const transformTo = terrainDef.destroyed_transform_to || 'moon';
            battleState.terrain[key] = transformTo;
            delete battleState.terrain_hp[key];
            return {
                terrainDestroyed: true,
                newTerrain: transformTo,
                message: terrainDef.name + ' 被摧毁！'
            };
        }
        return {
            terrainDestroyed: false,
            newTerrain: null,
            message: terrainDef.name + ' 受损: ' + battleState.terrain_hp[key] + '/' + terrainDef.max_hp
        };
    }

    _getTerrainDefenseBonus(cellQ, cellR, terrainMap) {
        if (!terrainMap) return 0;
        const terrains = this._getTerrainConfig();
        const tid = terrainMap[getHexKey(cellQ, cellR)] || 'moon';
        const def = terrains[tid];
        return def?.defense_bonus ?? 0;
    }

    _getTerrainMoveCost(cellQ, cellR, terrainMap) {
        if (!terrainMap) return 1;
        const terrains = this._getTerrainConfig();
        const tid = terrainMap[getHexKey(cellQ, cellR)] || 'moon';
        const def = terrains[tid];
        return def?.move_cost ?? 1;
    }
}


/**
 * Phase9: 全局地形实用函数 (无状态, 可外部调用)
 */
function getTerrainConfig() {
    try { return getGlossaryConfig()?.terrains || {}; }
    catch (e) { return {}; }
}

function evaluateTerrainDestruction(cellQ, cellR, damage, battleState) {
    const exec = new SkillExecutor();
    return exec._applyTerrainDamage(null, { q: cellQ, r: cellR }, damage, battleState);
}

module.exports = SkillExecutor;
