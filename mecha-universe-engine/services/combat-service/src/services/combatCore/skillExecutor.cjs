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
// ★ Phase 31 治本：DEFAULT_RANGE_BY_CATEGORY 已收敛至 shared-kernel（唯一真相源），
// 此处不再保留本地副本（陷阱2：四头分化）。远程唯一真相值 = 3（2026-08-02 裁定）。
// 显式 cast_range 始终优先；未显式声明时由 _getUniversalFields 经 getSkillRangeFields 兜底。
const { getSkillConfig, getSystemConfig, getGlossaryConfig } = require('./configLoader.cjs');
// H7 实时伤害减免（抗性 + 专注射射）：详见 damageModifiers.cjs
const { applyDamageModifiers } = require('./damageModifiers.cjs');
const ConditionEvaluator = require('./conditionEvaluator.cjs');
const BranchEvaluator = require('./branchEvaluator.cjs');
const effectExecutor = require('./effectExecutor.cjs'); // 导出为单例实例
const atomRegistry = require('./atomRegistry.cjs'); // 语义原子 → 引擎 handler 翻译官（Week2/报告4a）
// ★ 2026-08-09 修复：hexDistance 为 (q1,r1,q2,r2) 四参签名；本文件全部以单位对象调用，
//   旧写法 hexDistance(unit, target) 恒返回 NaN —— 导致 AOE 方向量化、治疗/反击/狙击射程、
//   决斗距离等 16 处判定静默失效。统一改用对象签名版 hexDistanceCoord。
const { getHexKey, hexDistanceCoord, isTargetInRange, getHexesInRange, DEFAULT_RANGE_BY_CATEGORY, resolveSkillCategory, getSkillRangeFields } = require('./hexKey.cjs');
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
            // ★ §8.9②：状态挂接结算相位（默认 turn_end；被动 on_turn_start Buff 建议 turn_start 避免「刚挂上就秒失效」）
            expiry_phase: cfg.expiry_phase
                || (((cfg.effects || []).find((e) => e && e.type === 'status') || {}).expiry_phase)
                || 'turn_end',

            // 宾语 Object（范围）
            // ★ Phase 31-RangeNormalize：射程字段统一归一化。
            // 历史问题：cast_range/max_range/range_max/range 四字段并存，解析点(145 max_range优先)
            // 与校验点(281 cast_range优先)优先级相反，填表同时写两字段会静默分叉。
            // 现在唯一归一化入口：rawMax 取首个非空（cast_range > max_range > range_max > range），
            // 再回退 DEFAULT_RANGE_BY_CATEGORY；rawMin 同理。下游一律读 minRange/maxRange，
            // 禁止再直接读 cast_range/max_range/min_cast_range/min_range（保留镜像仅向后兼容）。
            target_filter: cfg.target_filter ?? 'enemy',
            // 归一化权威字段（下游唯一读取入口）
            // ★ Phase 31 治本：统一调用 shared-kernel.getSkillRangeFields（唯一真相源），
            // 优先级 cast_range > max_range > range_max > range，未配置按分类兜底。
            // 注意：cfg 可能未显式 cast_range（数据源遵循"不写死"原则保持 undefined），
            // 此时 getSkillRangeFields 自动按 cfg.category 兜底到 DEFAULT_RANGE_BY_CATEGORY（远程=3）。
            ...(function () {
                const rf = getSkillRangeFields(cfg);
                return {
                    minRange: rf.minRange,
                    maxRange: rf.maxRange,
                    // 镜像字段（deprecated，仅向后兼容外部消费者；内部禁止读取）
                    cast_range: rf.maxRange,
                    min_cast_range: rf.minRange,
                    max_range: rf.maxRange,
                    min_range: rf.minRange,
                };
            })(),
            aoe_radius: cfg.aoe_radius ?? 0,
            sector_angle: cfg.sector_angle ?? 60,
            aoe_range: cfg.aoe_range ?? 0,

            // ★ Phase 32-AOE 接通（C 口径：按现有结构翻译，不重构单一字段）：
            // 编辑器落库结构为 map_cannon.directions[{right/rightup/leftup/left/leftdown/rightdown}→cells]
            // 与 aoe{center,radius}；引擎 _executeAreaSkill 消费 uf.aoe_mode + uf.range.mcShapes[1-6]。
            // 此处做翻译层，把编辑器结构映射到引擎结构，无需前端/落库改造。
            // 方向键映射（与 frontend computeDirection 同顺时针口径：正右=1,右下=2,左下=3,左=4,左上=5,右上=6）：
            ...(function () {
                const DIR_MAP = {
                    right: 1, rightdown: 2, leftdown: 3, left: 4, leftup: 5, rightup: 6,
                };
                let aoe_mode = cfg.aoe_mode || '';
                const mcShapes = {};
                // 地图炮：directions 字符串键 → mcShapes[1-6] 数字键
                const mc = cfg.map_cannon && cfg.map_cannon.directions;
                if (mc && typeof mc === 'object') {
                    Object.keys(DIR_MAP).forEach((k) => {
                        const cells = (mc[k] || []).map((c) =>
                            Array.isArray(c) ? { q: Number(c[0]), r: Number(c[1]) }
                                            : { q: Number(c.q), r: Number(c.r) });
                        if (cells.length) mcShapes[DIR_MAP[k]] = cells;
                    });
                }
                // 兼容引擎原生 mcShapes 直写（若落库已含 range.mcShapes）
                const nativeMc = cfg.range && cfg.range.mcShapes;
                if (nativeMc && typeof nativeMc === 'object') {
                    Object.keys(nativeMc).forEach((k) => {
                        const cells = (nativeMc[k] || []).map((c) =>
                            Array.isArray(c) ? { q: Number(c[0]), r: Number(c[1]) }
                                            : { q: Number(c.q), r: Number(c.r) });
                        if (cells.length) mcShapes[k] = cells;
                    });
                }
                // AOE 靶心：aoe.radius(编辑器spread)>0 视为 aoe_mode='aoe'
                const aoe = cfg.aoe && typeof cfg.aoe === 'object' ? cfg.aoe : null;
                const aoeRadius = (aoe && (Number(aoe.radius) > 0 || Number(aoe.spread) > 0)) ? (Number(aoe.radius) || Number(aoe.spread)) : 0;
                if (!aoe_mode) {
                    if (Object.keys(mcShapes).length > 0) aoe_mode = 'map_cannon';
                    else if (aoeRadius > 0) aoe_mode = 'aoe';
                }
                return {
                    aoe_mode,
                    range: { mcShapes },
                    aoe_radius: aoeRadius || cfg.aoe_radius || 0,
                    // ★ 编辑器 aoe.center 是画布绝对格（画布中心=施法者 9,9），落库即写死。
                    //   战场口径与 map_cannon.directions 统一为「相对施法者偏移」，故此处转相对：rel = center - 9,9。
                    aoe_center: aoe ? { q: Number(aoe.center?.q ?? aoe.center?.[0] ?? 9) - 9, r: Number(aoe.center?.r ?? aoe.center?.[1] ?? 9) - 9 } : null,
                };
            })(),

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

            // [项9] roll 段：含 segments[]（lower/upper/effects[]）按掷骰点数区间触发内嵌效果
            roll: (cfg.roll && Array.isArray(cfg.roll.segments)) ? {
                segments: cfg.roll.segments.map((s) => ({
                    lower: Number(s.lower ?? s.min ?? 1),
                    upper: Number(s.upper ?? s.max ?? 6),
                    label: s.label || '',
                    effects: Array.isArray(s.effects) ? s.effects : [],
                })),
            } : null,

            // ★ 步骤3/4（补完计划）：递归段树 v2 透传
            // 编辑器（GlossaryHubNew 六段编排）产出 tree:[{phase,atoms,branches,children}]，
            // 与 v1 扁平字段（effects / roll.segments / conditions）双写。引擎优先走 tree，
            // 缺失时完全回落 v1，存量词条零行为变化。
            schema_version: Number(cfg.schema_version) || 1,
            tree: Array.isArray(cfg.tree) ? cfg.tree : null,

            // [项4/5/6] meta_ops 段：unlock / requires_unlock / permanent_disable / dual_slot（L6 元层）
            meta_ops: (() => {
                const m = cfg.meta_ops || {};
                const asBool = (v) => v === true || v === 'true' || v === 1;
                return {
                    unlock: Array.isArray(m.unlock) ? m.unlock.slice() : [],
                    requires_unlock: asBool(m.requires_unlock),
                    permanent_disable: asBool(m.permanent_disable),
                    dual_slot: asBool(m.dual_slot),
                };
            })(),

            // [项3] cost 段：充能/耐久初始值（charges/durability 可为数字或 { initial }）
            cost: (() => {
                const c = cfg.cost || {};
                const norm = (v) => (typeof v === 'object' && v != null)
                    ? { initial: Number(v.initial) || 0, slots: Number(v.slots) || 0 }
                    : { initial: Number(v) || 0, slots: 0 };
                return {
                    charges: norm(c.charges),
                    durability: norm(c.durability),
                    slots: Number(c.slots) || 0,
                };
            })(),

            // 谓语 Predicate（动作类型）
            action_type: cfg.action_type ?? 'attack',
            // ★ 阶段二 C：透传纯 Segment 模型元标记（带双下划线，_getUniversalFields 白名单重建会丢弃，
            //   故显式透传）。skillExecutor 据其开启 useMainPipe，使 Segment 伤害接入 DamagePipe 主伤害管线。
            __segment_model__: !!cfg.__segment_model__,
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
            // 效果栈（effects[]）：v5 结构化效果列表，主动/被动技能的效果级门控(Phase 4A)与
            // 攻击额外伤害/AOE status 均消费此字段。此前遗漏未归一化，导致 effects[] 形同死代码。
            effects: Array.isArray(cfg.effects) ? cfg.effects : [],
            action: cfg.action ?? '',
        };
    }

    _defaultUniversalFields() {
        return {
            type: 'active', label: 'unknown', category: 'melee', description: '',
            deterministic: true, trigger: '', mode: '',
            target_filter: 'enemy',
            // 归一化权威字段（与 _getUniversalFields 对齐）
            minRange: 1, maxRange: 1,
            aoe_radius: 0, sector_angle: 60,
            // 镜像字段（deprecated）
            cast_range: 1, min_cast_range: 0,
            max_range: 1, min_range: 0, aoe_range: 0,
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
    /**
     * ★ Phase 4A: 词条效果级条件门控
     * 取 effect.trigger.condition（优先）或 skill(uf).trigger.condition（回退）作为条件；
     * 无条件 → 放行(true)；有条件 → 委托 ConditionEvaluator.evaluateTriggerCondition 评估。
     * @param {object|null} effect 单个 effect（可为 null，仅用 skill 级 trigger）
     * @param {object} uf 技能通用字段（含 uf.trigger）
     * @param {object} unit 施法者
     * @param {object} target 被作用单位
     * @returns {boolean}
     */
    _effectTriggerMet(effect, uf, unit, target) {
        const cond = (effect && effect.trigger && effect.trigger.condition)
                  || (uf && uf.trigger && uf.trigger.condition)
                  || null;
        if (!cond || !Object.keys(cond).length) return true;
        return ConditionEvaluator.evaluateTriggerCondition(cond, { unit, target });
    }

    /**
     * ★ S7-S10：阵营技三角色归类
     * 优先取词条显式 faction_role（attack/defense/ambush），否则按 action_type / category 推断：
     *   attack → attack（进攻）；heal / buff → defense（防守）；debuff / stealth / displacement → ambush（偷袭）。
     * 返回小写字符串，缺省 'attack'。
     */
    _resolveFactionRole(uf) {
        const explicit = (uf && (uf.faction_role || (uf.skill && uf.skill.faction_role))) || null;
        if (explicit && ['attack', 'defense', 'ambush'].includes(String(explicit).toLowerCase())) {
            return String(explicit).toLowerCase();
        }
        const at = String((uf && uf.action_type) || '').toLowerCase();
        if (at === 'heal' || at === 'buff') return 'defense';
        if (at === 'debuff') return 'ambush';
        const cat = String((uf && (uf.category || uf.attack_type_label)) || '').toLowerCase();
        if (cat.includes('support') || cat.includes('heal') || cat.includes('guard')) return 'defense';
        if (cat.includes('stealth') || cat.includes('ambush')) return 'ambush';
        return 'attack';
    }

    /**
     * ★ S7-S10：L6 元层解析（meta_ops）
     * 兼容 skill.meta_ops 对象或 skill 顶层字段；字段：
     *   unlock: string[]            —— 施放本技能时「解锁」的其它技能 key（写入 unit._meta.unlocked_skills）
     *   requires_unlock: boolean     —— 本技能「需要」先被解锁（检查 unlocked_skills 是否含本 key），未含则拦截结算
     *   permanent_disable: boolean  —— 永久失效（被命中后写入 permanently_disabled_skills，永久拦截）
     *   dual_slot: boolean          —— 双槽位（效果路由执行两遍）
     * 缺失时全部取安全默认（空 / false / false / false），不影响既有行为。
     */
    _resolveMetaOps(uf) {
        const raw = (uf && (uf.meta_ops || (uf.skill && uf.skill.meta_ops))) || {};
        const asBool = (v) => v === true || v === 'true' || v === 1;
        return {
            unlock: Array.isArray(raw.unlock) ? raw.unlock.slice() : [],
            requires_unlock: asBool(raw.requires_unlock),
            permanent_disable: asBool(raw.permanent_disable),
            dual_slot: asBool(raw.dual_slot),
        };
    }

    /**
     * 解锁技能：将 key 写入 unit._meta.unlocked_skills（去重）。
     * 供 meta_ops.unlock 触发与外部调用方（如事件 handler）解锁词条。
     */
    _unlockSkill(unit, key) {
        if (!unit || !key) return;
        unit._meta = unit._meta || {};
        unit._meta.unlocked_skills = unit._meta.unlocked_skills || [];
        if (!unit._meta.unlocked_skills.includes(key)) unit._meta.unlocked_skills.push(key);
    }

    executeUniversalSkill(skillType, unit, target, context = {}, inlineSkillDef = null, opts = {}) {
        let cfg = getSkillConfig(skillType);
        // 网关传入的内联定义（含技能真实 Excel 射程）始终优先，
        // 确保技能自身射程覆盖词条库默认 cast_range（避免超距打不出伤害）
        if (inlineSkillDef) cfg = inlineSkillDef;
        const lookupKey = (cfg === inlineSkillDef) ? cfg : skillType;
        const uf = this._getUniversalFields(lookupKey);
        // ★ 地图炮方向选择：运行时显式方向（前端 /attack 的 aoe_dir）覆盖落库/自动量化
        if (context && context.aoe_dir != null) uf.aoe_dir = Number(context.aoe_dir);
        else if (target && target.aoe_dir != null) uf.aoe_dir = Number(target.aoe_dir);

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

        // === S5：寿命三型之「充能次数 / 耐久」扣减（cost.charges / cost.durability） ===
        // 按 skill_key 索引：unit._meta.charges[skill_key] / unit._meta.durability[skill_key]，
        // 首次施放时由 cost 读取初始值懒注入（cost.charges 可为数字或 { initial }）。
        // 仅在词条显式配置且 >0 时扣减；缺失或为 0 时完全沿用旧逻辑，零行为变化。
        const cost = uf.cost || {};
        const _metaChargesInit = (c) => (typeof c === 'object' && c != null)
            ? (Number(c.initial) || 0)
            : (Number(c) || 0);
        const chargeInit = _metaChargesInit(cost.charges);
        const durInit = _metaChargesInit(cost.durability);
        if (chargeInit > 0) {
            unit._meta = unit._meta || {};
            unit._meta.charges = unit._meta.charges || {};
            if (unit._meta.charges[skillType] == null) unit._meta.charges[skillType] = chargeInit;
            const chargesLeft = unit._meta.charges[skillType];
            if (chargesLeft <= 0) {
                return { triggered: false, message: `${uf.label} 充能次数已耗尽（charges=0）` };
            }
            unit._meta.charges[skillType] = chargesLeft - 1;
            unit._meta.chargesMax = unit._meta.chargesMax || {};
            unit._meta.chargesMax[skillType] = chargeInit;
        }
        if (durInit > 0) {
            unit._meta = unit._meta || {};
            unit._meta.durability = unit._meta.durability || {};
            if (unit._meta.durability[skillType] == null) unit._meta.durability[skillType] = durInit;
            const durLeft = unit._meta.durability[skillType];
            if (durLeft <= 0) {
                return { triggered: false, message: `${uf.label} 耐久已耗尽（durability=0）` };
            }
            unit._meta.durability[skillType] = durLeft - 1;
            unit._meta.durabilityMax = unit._meta.durabilityMax || {};
            unit._meta.durabilityMax[skillType] = durInit;
        }

        // === S7-S10：L6 元层(meta_ops) + 阵营技三角色归类（语义闭环） ===
        // ① 阵营技三角色归类：优先取 skill.faction_role，否则按 action_type/category 推断
        //    attack→attack / heal+buff→defense / debuff+stealth+displacement→ambush。
        const factionRole = this._resolveFactionRole(uf);
        // ② L6 元层解析
        const metaOps = this._resolveMetaOps(uf);
        unit._meta = unit._meta || {};
        // [S6 永久失效拦截] permanently_disabled_skills：被外部效果命中后写入，永久拦截该 skill_key 结算
        unit._meta.permanently_disabled_skills = unit._meta.permanently_disabled_skills || [];
        if (unit._meta.permanently_disabled_skills.includes(skillType)) {
            return { triggered: false, message: `${uf.label} 已被永久失效（permanently_disabled_skills）`, meta_ops: metaOps, faction_role: factionRole };
        }
        // [S6 自身永久失效] 词条自带 permanent_disable：本局不可用
        if (metaOps.permanent_disable) {
            return { triggered: false, message: `${uf.label} 已被 L6 元层永久失效（permanent_disable）`, meta_ops: metaOps, faction_role: factionRole };
        }
        // [S4 解锁校验] requires_unlock：本技能需先被解锁，未含于 unlocked_skills 则拦截
        unit._meta.unlocked_skills = unit._meta.unlocked_skills || [];
        if (metaOps.requires_unlock && !unit._meta.unlocked_skills.includes(skillType)) {
            return { triggered: false, message: `${uf.label} 尚未解锁（requires_unlock）`, meta_ops: metaOps, faction_role: factionRole };
        }
        // [S4 解锁触发] unlock：施放本技能时，将所列 key 写入 unlocked_skills（解锁其它技能）
        if (metaOps.unlock && metaOps.unlock.length) {
            metaOps.unlock.forEach((k) => this._unlockSkill(unit, k));
        }
        // [S5/S8 记录] dual_slot 双槽标记 + 阵营角色挂 _meta（供战斗发放/UI 回显）
        unit._meta.faction_role = factionRole;
        unit._meta.dual_slot = !!metaOps.dual_slot;
        unit._meta.meta_ops = metaOps;

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
        // ★ Phase 31-RangeNormalize：统一读归一化 minRange/maxRange，经 shared-kernel
        // isTargetInRange 纯函数判定（与前端高亮 / 网关 /skill 共用同一套函数），杜绝三套口径分叉。
        // minRange 默认按 category 决定（support/auto=0 允许自身格，其余=1 排除自身）。
        if (target && uf.target_filter !== 'self') {
            const inRange = isTargetInRange(
                unit.q, unit.r, target.q, target.r,
                { minRange: uf.minRange, maxRange: uf.maxRange }
            );
            if (!inRange) {
                const dist = hexDistanceCoord(unit, target);
                return {
                    triggered: false, out_of_range: true,
                    min: uf.minRange, max: uf.maxRange, actual: dist,
                    message: `${uf.label} 需要 ${uf.minRange}~${uf.maxRange} 格距离（当前 ${dist} 格）`
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

        // === ★ 步骤4：递归段树 v2 优先执行（schema_version=2 且含 tree） ===
        // v2 词条走 _walkPhaseTree（支持 IF 分叉 + ROLL 分叉 + 递归子段），
        // 走完即不再跑 v1 的 roll.segments，避免同一批效果双重结算。
        let treeResult = null;
        if (Number(uf.schema_version) === 2 && Array.isArray(uf.tree) && uf.tree.length) {
            treeResult = this._walkPhaseTree(uf.tree, unit, target, dice.roll, {
                ...context,
                useMainPipe: !!uf.__segment_model__,
            }, 0, opts);
        }

        // === 项9：roll.segments[].effects[] 接通结算（非 branch 路径统一收口） ===
        // 掷骰点数 V=dice.roll 落入某 Segment 区间 [lower, upper] 时，经效果执行器遍历结算其 effects[]。
        // （branch 模型已在 _executeBranchModelSkill 内处理；此处避免重复结算。）
        const segResult = treeResult
            ? { applied: treeResult.applied, log: treeResult.log, disabled: [], triggered: !treeResult.vetoed, allOrNothingFailed: false, segmentDamage: treeResult.damage }
            : this._resolveRollSegments(skillType, unit, target, uf, dice.roll, context, { useMainPipe: !!uf.__segment_model__ });

        // ★ 阶段一 B5：all_or_nothing 未命中 —— 整技能全失效（0 伤害、仍消耗行动）。
        //   对齐 Branch 模型未命中语义（triggered:false + final_damage:0 + active:true）。
        if (segResult.allOrNothingFailed) {
            return {
                triggered: false,
                type: skillType,
                action_type: uf.action_type,
                all_or_nothing_failed: true,
                final_damage: 0,
                targets: [],
                hit_count: 0,
                active: true,
                message: `${uf.label || skillType}: 掷骰 ${dice.roll} 未落入任何 Segment，技能全失效`,
                log: segResult.log
            };
        }

        // === 谓语路由 (Predicate Routing) ===
        // ★ 2026-08-07 重构：谓语结果先赋给 `result`，统一在 switch 之后合并 Segment 结算日志
        //   （segResult.log），保证靶场 / 前端能看到 pure_segment 模型的状语触发细节。
        let result;
        switch (uf.action_type) {
            case 'attack':
                // ★ Phase 32-AOE：范围技能形状驱动多目标结算。
                //   aoe_mode 标记（'sector'/'map_cannon'）存在时转入区域处理器，
                //   遍历所有符合形状+敌方条件的单位独立积分，汇总 result.targets[]。
                if (uf.aoe_mode) {
                    result = this._executeAreaSkill(skillType, unit, target, uf, cfg, dice, heightBonus, heightDiff, context);
                    break;
                }
                result = this._executeAttackSkill(skillType, unit, target, uf, cfg, dice, heightBonus, heightDiff, context);
                break;
            case 'heal':
                result = this._executeHealSkill(skillType, unit, target, uf, cfg, dice, context);
                break;
            case 'buff':
                result = this._executeBuffSkill(skillType, unit, target, uf, cfg, dice, context);
                break;
            case 'debuff':
                result = this._executeDebuffSkill(skillType, unit, target, uf, cfg, dice, context);
                break;
            case 'passive':
                result = this._executePassiveSkill(skillType, unit, target, uf, cfg, dice, context);
                break;
            default:
                // ★ 2026-08-06 Phase 33-Contract：拒绝静默吞失败。
                //   旧逻辑此处 `triggered: true` —— 未知谓语被当作「成功执行」返回，战报零痕迹，
                //   是本次审计发现的最危险静默点。现纠正为 `triggered: false`，并向结算结果
                //   推送标准 diagnostics（前端可渲染黄色警告条，服务端 logger 同步落盘）。
                //   注意：部分历史技能 action_type 大小写混用（如 'Attack'），此处兼容小写归一，
                //        非英语空值才视为真正的未知谓语。
                const rawType = uf.action_type;
                const normType = typeof rawType === 'string' ? rawType.toLowerCase() : '';
                const KNOWN = ['attack', 'heal', 'buff', 'debuff', 'passive'];
                if (KNOWN.includes(normType)) {
                    // 仅大小写差异：归一后照常路由（避免历史脏数据误判）
                    uf = Object.assign({}, uf, { action_type: normType });
                    switch (normType) {
                        case 'attack':  result = this._executeAttackSkill(skillType, unit, target, uf, cfg, dice, heightBonus, heightDiff, context); break;
                        case 'heal':    result = this._executeHealSkill(skillType, unit, target, uf, cfg, dice, context); break;
                        case 'buff':    result = this._executeBuffSkill(skillType, unit, target, uf, cfg, dice, context); break;
                        case 'debuff':  result = this._executeDebuffSkill(skillType, unit, target, uf, cfg, dice, context); break;
                        case 'passive': result = this._executePassiveSkill(skillType, unit, target, uf, cfg, dice, context); break;
                    }
                    break;
                }
                result = {
                    triggered: false, type: skillType,
                    action_type: rawType,
                    bonus_value: 0,
                    dice, height_bonus: 0,
                    diagnostics: [{
                        level: 'error',
                        code: 'UNKNOWN_PREDICATE',
                        message: `未知谓语 action_type="${rawType}"（技能 ${skillType} / ${uf.label}），结算已跳过`,
                        entity: skillType,
                        field: 'action_type',
                        at: Date.now(),
                    }],
                    message: `⚠ 技能 ${uf.label} 配置异常：未知谓语 ${rawType}`,
                };
                break;
        }

        // ★ 2026-08-07：合并 pure_segment 模型的状语结算日志到最终战报，
        //   使靶场 / 前端能完整呈现 Segment 触发轨迹（1-3 单体 / 4-6 范围均摊等）。
        if (segResult && segResult.log && segResult.log.length) {
            result.log = (result.log || []).concat(segResult.log);
        }

        // ★ 阶段二 C：Segment 伤害与主伤害管线汇流。
        //   谓语主伤害（predicateDamage）与 Segment 内 damage 真实管线伤害（segTotal）按 damage_mode 汇流：
        //   - 含 'override' 段：最终伤害 = segTotal，丢弃 predicateDamage（纯 Segment 词条如扫射语义）；
        //   - 'bonus'（默认）：最终伤害 = predicateDamage + segTotal。
        //   结构化输出 segmentDamage / predicateDamage / finalDamage 供战报与前端展示。
        const predicateDamage = (result && Number.isFinite(result.final_damage)) ? result.final_damage : 0;
        const segTotal = (segResult && Number.isFinite(segResult.segmentDamage)) ? segResult.segmentDamage : 0;
        const matchedSegs = (uf.roll && Array.isArray(uf.roll.segments))
            ? uf.roll.segments.filter((s) => {
                if (!s || !s.effects) return false;
                const lo = s.lower != null ? s.lower : -Infinity;
                const hi = s.upper != null ? s.upper : Infinity;
                const inRange = (lo <= dice.roll && dice.roll <= hi);
                const pts = Array.isArray(s.points) ? s.points : (s.points != null ? [s.points] : null);
                const inPts = pts ? pts.some((p) => {
                    try { return BranchEvaluator.pointMatches(p, dice.roll); } catch (_e) { return false; }
                }) : false;
                if (!inRange && !inPts) return false;
                return s.effects.some((e) => e && e.type === 'damage' && e.damage_mode === 'override');
            })
            : [];
        const hasOverride = matchedSegs.length > 0;
        const finalDamage = hasOverride ? segTotal : (predicateDamage + segTotal);
        result.segmentDamage = segTotal;
        result.predicateDamage = predicateDamage;
        result.damage_mode = hasOverride ? 'override' : (segTotal > 0 ? 'bonus' : undefined);
        result.finalDamage = finalDamage;
        // 覆盖谓语原 final_damage（若谓语存在），保证上层读取一致
        if (result.final_damage !== undefined) result.final_damage = finalDamage;
        // Phase 4 端到端：pure 模式下暴露隔离克隆帧（模拟后施法者/目标增量），
        // 供靶场 / 前端展示「厨子真的炒了菜」而不污染原 units。
        if (opts && opts.pure && treeResult && treeResult.cloneFrame) {
            result.cloneFrame = treeResult.cloneFrame;
        }
        return result;
    }

    // ============================================================
    // 谓语处理器 (Predicate Handlers)
    // ============================================================

    _executeAttackSkill(skillType, unit, target, uf, cfg, dice, heightBonus, heightDiff, context) {
        // ── 第九章（隐患3）：fixed_rate_multiplier / flat_value 落地 ──
        // 这两个字段位于 effect 维度（uf.effects[].fixed_rate_multiplier），非词条顶层。
        // legacyBase 已含网关侧 getEquipmentAttackStat 注入的武器攻击力（combat.ts L1516），
        // 故 ×fixedMult 自动覆盖武器部分。双定义优先级：只要该技能任一 damage effect 配置了
        // 倍率(>0)或固定值(≠0)，即以「legacyBase×倍率+固定值」覆盖 uf.base_damage；否则沿用历史值。
        const dmgEffect = (uf.effects || []).find(
          e => (e.type === 'damage' || e.fixed_rate_multiplier != null || e.flat_value != null)
            && !(e.trigger && e.trigger.condition)
        );
        const frm = dmgEffect ? Number(dmgEffect.fixed_rate_multiplier) : NaN;
        const fixedMult = (Number.isFinite(frm) && frm > 0) ? frm : 1.0;
        const flat = dmgEffect ? (Number(dmgEffect.flat_value) || 0) : 0;
        const legacyBase = Number(uf.base_damage) || Number(uf.damage_modifier_precise) || 0;
        const baseDamage = (dmgEffect && (Number.isFinite(frm) || flat !== 0))
          ? Math.max(0, Math.round(legacyBase * fixedMult + flat))
          : legacyBase;
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

        // ★ Phase 4A: 条件词条·额外伤害门控（仅对带 trigger.condition 的 damage effect 生效；不满足则跳过，基础伤害不受影响）
        const _condDmgEffects = (uf.effects || []).filter(e => e && e.type === 'damage' && e.trigger && e.trigger.condition);
        for (const ce of _condDmgEffects) {
            if (this._effectTriggerMet(ce, uf, unit, target)) {
                const cm = Number(ce.fixed_rate_multiplier);
                const cf = Number(ce.flat_value) || 0;
                const extra = Math.round(cf + (cm > 1 ? (cm - 1) * (Number(uf.base_damage) || 0) : 0));
                finalDamage = finalDamage + extra;
            }
        }

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
            const counterRes = this.executeCounter(target, unit, uf.maxRange || 1); // ★ Phase 31-RangeNormalize：读归一化字段
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
            faction_role: (unit._meta && unit._meta.faction_role) || 'attack',
            meta_ops: (unit._meta && unit._meta.meta_ops) || null,
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

        // ★ 批次2后半程 D4 伤害分担 / D7 反伤（读 defender._meta，纯派生计算，不在此写回真实单位）：
        //   派生结果挂到 result.gap_ops，由 executeUniversalSkill 的 pure 模式在 cloneFrame 应用，
        //   非 pure 路径由调用方消费，避免闯入核心单位写回。护栏已在 handler 侧 clamp。
        const gapOps = [];
        const dMeta = target && target._meta ? target._meta : null;
        if (dMeta && dMeta.damage_share && finalDamage > 0) {
            const shareRatio = Math.max(0, Math.min(0.8, Number(dMeta.damage_share.ratio) || 0));
            const shareDmg = Math.floor(finalDamage * shareRatio);
            if (shareDmg > 0) {
                const pool = dMeta.damage_share.pool || 'ally';
                const allies = (context && context.allUnits ? context.allUnits : [])
                    .filter(u => u && u !== target && u !== unit
                        && pool === 'ally' ? (u.faction === target.faction) : true);
                const per = allies.length ? Math.floor(shareDmg / allies.length) : 0;
                gapOps.push({ op: 'damage_share', ratio: shareRatio, total: shareDmg, perUnit: per, pool, allies: allies.map(a => a.id || a.unit_id) });
            }
        }
        if (dMeta && dMeta.reflect_damage && finalDamage > 0) {
            const reflRatio = Math.max(0, Math.min(1.0, Number(dMeta.reflect_damage.ratio) || 0));
            const reflDmg = Math.floor(finalDamage * reflRatio);
            const guard = Math.max(0, (dMeta.reflect_damage.guard || 0) - 1); // 自减防递归
            if (reflDmg > 0 && guard >= 0) {
                gapOps.push({ op: 'reflect_damage', ratio: reflRatio, damage: reflDmg, toUnit: (unit && (unit.id || unit.unit_id)) || null, guardLeft: guard });
                dMeta.reflect_damage.guard = guard; // 回写 guard 防无限反射
            }
        }
        if (gapOps.length) result.gap_ops = gapOps;

        return result;
    }

    // ★ Phase 32-AOE：区域/形状驱动多目标结算（地图炮 / 扇形 sweep 通用）
    //   以主目标 target 方向为扇形朝向（anchorDir），读取 range.mcShapes[anchorDir] 六向偏移集合，
    //   遍历所有落在形状绝对格内且为敌方的单位独立积分，汇总 result.targets[]。
    _executeAreaSkill(skillType, unit, target, uf, cfg, dice, heightBonus, heightDiff, context) {
        const allUnits = (context && context.allUnits) || [];
        const maxRange = Number(uf.maxRange) || Number(uf.cast_range) || 3;
        const mcShapes = uf.range && uf.range.mcShapes;

        // 方向量化（1-6），与前端 hexUtils.computeDirection 同口径
        const dirOf = (u) => {
            const dist = hexDistanceCoord(unit, u);
            if (dist < 1 || dist > maxRange) return null;
            const dq = (u.q || 0) - (unit.q || 0);
            const dr = (u.r || 0) - (unit.r || 0);
            const x = dq + dr * 0.5, y = dr * 0.866;
            const angle = Math.atan2(y, x) * 180 / Math.PI;
            let a = angle % 360; if (a < 0) a += 360;
            return Math.floor(((a + 30) % 360) / 60) + 1;
        };

        // ★ 地图炮（map_cannon）= 可指定方向：优先用显式 aoe_dir（前端选择），否则按主目标方向自动量化。
        //   uf.aoe_dir 由前端 /attack 的 aoe_dir 字段经 _getUniversalFields 透传，值 1-6。
        let shapeCells = [];
        const explicitDir = (uf && Number(uf.aoe_dir) >= 1 && Number(uf.aoe_dir) <= 6) ? Number(uf.aoe_dir) : null;
        const fireDir = explicitDir != null ? explicitDir : (target ? dirOf(target) : 1);
        if (mcShapes && fireDir != null && mcShapes[String(fireDir)]) {
            shapeCells = mcShapes[String(fireDir)].map(p => ({
                q: unit.q + (Array.isArray(p) ? p[0] : (p.q ?? 0)),
                r: unit.r + (Array.isArray(p) ? p[1] : (p.r ?? 0))
            }));
        }
        // ★ Phase 32-AOE（C 口径补全）：aoe_mode='aoe' 靶心模式 —— 以 aoe_center 相对偏移叠加施法者得
        //   offset 绝对中心，按战场 odd-r offset 距离（hexDistanceCoord）展开半径格，与单位 offset 坐标对齐。
        if ((!shapeCells.length || uf.aoe_mode === 'aoe') && uf.aoe_mode === 'aoe' && uf.aoe_center) {
            const cq = (unit.q || 0) + Number(uf.aoe_center.q), cr = (unit.r || 0) + Number(uf.aoe_center.r);
            const rad = Number(uf.aoe_radius) || 1;
            const mapW = (context && context.map && context.map.width) || 20;
            const mapH = (context && context.map && context.map.height) || 20;
            shapeCells = [];
            for (let q = 0; q < mapW; q++) {
                for (let r = 0; r < mapH; r++) {
                    if (hexDistanceCoord({ q: cq, r: cr }, { q, r }) <= rad) shapeCells.push({ q, r });
                }
            }
        }

        const hitSet = new Set(shapeCells.map(c => `${c.q},${c.r}`));
        const hitUnits = [];
        allUnits.forEach(u => {
            if (!u || u.id === unit.id) return;
            if (u.faction === unit.faction) return; // 仅敌方
            if (u.q === undefined) return;
            if (hitSet.has(`${u.q},${u.r}`)) hitUnits.push(u);
        });
        // 保底：形状未命中任何单位时，至少结算主目标（向后兼容旧逻辑）
        if (hitUnits.length === 0 && target) hitUnits.push(target);

        const targets = [];
        let primaryFinal = 0;
        hitUnits.forEach((tu, idx) => {
            const r = this._executeAttackSkill(skillType, unit, tu, uf, cfg, dice, heightBonus, heightDiff, context);
            const finalDamage = Number(r.final_damage) || 0;
            if (idx === 0) primaryFinal = finalDamage;
            const statusEffects = (uf.effects || [])
                .filter(e => e && e.type === 'status' && this._effectTriggerMet(e, uf, unit, tu))
                .map(e => ({ status: e.status, value: e.value, stacks: e.stacks || 1, duration: e.duration || 3 }));
            targets.push({ unitId: tu.id, q: tu.q, r: tu.r, finalDamage, statusEffects, message: r.message });
        });

        return {
            triggered: true,
            type: skillType,
            faction_role: (unit._meta && unit._meta.faction_role) || 'attack',
            meta_ops: (unit._meta && unit._meta.meta_ops) || null,
            action_type: 'attack',
            aoe_mode: uf.aoe_mode,
            active: true,
            final_damage: primaryFinal, // 兼容旧写回
            targets,                    // 多目标汇总
            hit_count: targets.length,
            message: `${uf.label}: 命中 ${targets.length} 个目标`
        };
    }

    _executeHealSkill(skillType, unit, target, uf, cfg, dice, context) {
        const healStat = uf.attack_stat === 'ranged'
            ? (unit.ranged || unit.attack || 10)
            : (unit.melee || unit.attack || 10);
        const diceBonus = dice.isSuccess ? uf.success_bonus_damage : 0;
        const healAmount = (uf.base_damage || healStat) + diceBonus;

        if (target) {
            // ★ Phase 31-RangeNormalize：删除 dist===0 特判，统一走 minRange/maxRange。
            // heal 默认 category=support → minRange=0 允许自身格；若配置显式 min_cast_range>0 则按配置。
            const dist = hexDistanceCoord(unit, target);
            if (dist < uf.minRange || dist > uf.maxRange) {
                return {
                    heal_amount: 0, out_of_range: true,
                    min: uf.minRange, max: uf.maxRange, actual: dist,
                    message: `${uf.label} 仅对范围 ${uf.minRange}~${uf.maxRange} 内友军有效`
                };
            }
        }

        return {
            triggered: true,
            type: skillType,
            faction_role: (unit._meta && unit._meta.faction_role) || 'attack',
            meta_ops: (unit._meta && unit._meta.meta_ops) || null,
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
            faction_role: (unit._meta && unit._meta.faction_role) || 'attack',
            meta_ops: (unit._meta && unit._meta.meta_ops) || null,
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
        if (uf.applies_on && this._effectTriggerMet(null, uf, unit, target)) {
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
            faction_role: (unit._meta && unit._meta.faction_role) || 'attack',
            meta_ops: (unit._meta && unit._meta.meta_ops) || null,
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
        if (uf.applies_on && this._effectTriggerMet(null, uf, unit, target)) {
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
            faction_role: (unit._meta && unit._meta.faction_role) || 'attack',
            meta_ops: (unit._meta && unit._meta.meta_ops) || null,
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
    /**
     * ★ 项9：按掷骰点数匹配 roll.segments 区间并结算内嵌 effects[]
     * @param {number} rollV 掷骰点数 V
     * 命中 lower<=V<=upper 的 Segment，将其 effects[] 经 effectExecutor.executeSync 遍历结算。
     * [项5] dual_slot/cost.slots===2 时效果路由执行两遍。
     * [项6] 扫描 effects 中 permanent_disable_target，将目标 skill_key 写入 permanently_disabled_skills。
     * 返回 { applied, log } 供调用方并入战报。
     */
    // ============================================================
    // ★ 步骤4（补完计划断点3）：递归段树执行器 _walkPhaseTree
    // 消费 schema_version=2 的 tree:[{phase, atoms, branches, children}]，
    // 按 WHEN → IF → WHO → ROLL → DO → COST 顺序遍历，其中：
    //   - IF 段：atoms 为与门（全部通过才继续）；branches 为「或分叉」——
    //            逐个求值 branch.when，命中首个即执行其 effects/children，未命中走 else（when 为空）分支。
    //   - ROLL 段：branches 按 lower/upper 闭区间匹配掷骰点数。
    //   - DO/COST 段：atoms 直接经 effectExecutor.executeSync 结算。
    //   - 任意分支的 children 可再挂完整段节点，递归下探（深度上限 3）。
    // 返回 { applied, log, vetoed, damage }，由调用方并入战报。
    // ============================================================

    /**
     * IF 段条件求值：支持三种写法
     *  1) 条件原子（atoms 里 type 为条件族）——交给 ConditionEvaluator
     *  2) branch.when 字符串表达式，形如 "hp<50" / "distance<=2" / "roll>=4" / "terrain==forest"
     *  3) 空 when —— 视为 else 兜底分支，永远成立
     * 表达式左值白名单：hp / hp_pct / target_hp / target_hp_pct / distance / roll / terrain / target_terrain
     */
    _evalWhenExpr(expr, ctx) {
        if (expr == null || String(expr).trim() === '') return true; // else 分支
        const s = String(expr).trim();
        const m = s.match(/^\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*(>=|<=|==|!=|>|<)\s*(.+?)\s*$/);
        if (!m) {
            // 非表达式：当作布尔标志读取上下文（缺失视为不成立）
            return !!ctx[s];
        }
        const [, lhsKey, op, rhsRaw] = m;
        const lhs = ctx[lhsKey];
        if (lhs === undefined) return false;
        let rhs = rhsRaw.replace(/^['"]|['"]$/g, '');
        const lNum = Number(lhs);
        const rNum = Number(rhs);
        const bothNum = Number.isFinite(lNum) && Number.isFinite(rNum);
        switch (op) {
            case '>': return bothNum && lNum > rNum;
            case '<': return bothNum && lNum < rNum;
            case '>=': return bothNum && lNum >= rNum;
            case '<=': return bothNum && lNum <= rNum;
            case '==': return bothNum ? lNum === rNum : String(lhs) === rhs;
            case '!=': return bothNum ? lNum !== rNum : String(lhs) !== rhs;
            default: return false;
        }
    }

    /**
     * ★ 步骤4：B 组条件原子（B1~B10）原生求值
     * 返回 true=通过 / false=不通过 / null=未识别（视为通过，不阻断）
     */
    _evalConditionAtom(c, unit, target, context, whenCtx) {
        const key = c.atom_key || c.key;
        const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
        const allUnits = (context && context.allUnits) || [];
        const cmp = (a, op, b) => {
            switch (op) {
                case '>': return a > b;
                case '<': return a < b;
                case '>=': return a >= b;
                case '<=': return a <= b;
                case '==': return a === b;
                case '!=': return a !== b;
                default: return a > b;
            }
        };
        switch (key) {
            // B1 射程内
            case 'in_range': {
                if (!unit || !target) return null;
                const d = hexDistanceCoord(unit, target);
                return d >= num(c.min_range, 0) && d <= num(c.max_range, Infinity);
            }
            // B2 互在射程（双方都能够到对方）
            case 'mutual_in_range': {
                if (!unit || !target) return null;
                const d = hexDistanceCoord(unit, target);
                const aMax = num(unit.attack_range ?? unit.maxRange, 1);
                const bMax = num(target.attack_range ?? target.maxRange, 1);
                return d <= aMax && d <= bMax;
            }
            // B3 HP 阈值
            case 'hp_compare': {
                const subj = (c.subject === 'self') ? unit : (target || unit);
                if (!subj) return null;
                const hp = Number(subj.hp ?? subj.current_hp ?? 0);
                const max = Number(subj.max_hp || subj.maxHp || hp || 1);
                const lhs = c.is_percent ? Math.round((hp / max) * 100) : hp;
                return cmp(lhs, c.op || '>', num(c.value, 0));
            }
            // B4 属性对比
            case 'stat_compare': {
                const A = (c.a === 'target') ? target : unit;
                const B = (c.b === 'self') ? unit : target;
                if (!A || !B) return null;
                const stat = c.stat || 'melee';
                return cmp(Number(A[stat] || 0), c.op || '>', Number(B[stat] || 0));
            }
            // B5 共线并列（同阵营 N 个单位在一条直线上且间隔为 distance）
            case 'collinear_adjacent': {
                if (!unit || !allUnits.length) return null;
                const need = num(c.count, 3);
                const step = num(c.distance, 1);
                const roleOf = (u) => u.role || u.faction;
                const same = allUnits.filter((u) => roleOf(u) === roleOf(unit));
                const DIRS = [{ q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 }];
                const has = (q, r) => same.some((u) => u.q === q && u.r === r);
                return DIRS.some((d) => {
                    let cnt = 1;
                    for (let i = 1; i < need; i++) {
                        if (has(unit.q + d.q * step * i, unit.r + d.r * step * i)) cnt++;
                        else break;
                    }
                    return cnt >= need;
                });
            }
            // B6 地形匹配
            case 'terrain_match': {
                const t = (target && target.terrain) || (unit && unit.terrain) || '';
                return String(t) === String(c.terrain || '');
            }
            // B7 伤害种类匹配（读上下文中来袭/本次伤害种类）
            case 'damage_kind_match': {
                const kind = (context && (context.damage_kind || context.incomingDamageKind)) || '';
                if (!kind) return null;
                return String(kind) === String(c.kind || '');
            }
            // B8 未执行过某动作
            case 'has_not_acted': {
                if (!unit) return null;
                const act = c.action || 'deal_damage';
                if (act === 'move') return !unit.has_moved;
                if (act === 'attack') return !unit.has_attacked;
                return !(unit._meta && unit._meta.dealt_damage_this_turn);
            }
            // B9 不在敌方扫描范围内
            case 'not_in_scan': {
                if (!unit || !allUnits.length) return null;
                const radius = num(c.radius, 2);
                const roleOf = (u) => u.role || u.faction;
                const enemies = allUnits.filter((u) => roleOf(u) !== roleOf(unit) && (u.hp ?? u.current_hp ?? 1) > 0);
                return !enemies.some((e) => hexDistanceCoord(unit, e) <= radius);
            }
            // B10 限次（按作用域计数，超限即不通过）
            case 'limit_scope': {
                if (!unit) return null;
                const scope = c.limit_scope || 'match';
                const limit = num(c.limit_count, 1);
                unit._meta = unit._meta || {};
                unit._meta.limit_counters = unit._meta.limit_counters || {};
                const ck = `${scope}:${c.entry_key || c.atom_key || 'limit'}`;
                const used = Number(unit._meta.limit_counters[ck] || 0);
                if (used >= limit) return false;
                unit._meta.limit_counters[ck] = used + 1;
                return true;
            }
            default:
                return null; // 未识别条件不阻断
        }
    }

    /** 构造 IF 表达式可读的扁平上下文 */
    _buildWhenContext(unit, target, rollV) {
        const uHp = unit ? (unit.hp ?? unit.current_hp ?? 0) : 0;
        const uMax = unit ? (unit.max_hp || unit.maxHp || uHp || 1) : 1;
        const tHp = target ? (target.hp ?? target.current_hp ?? 0) : 0;
        const tMax = target ? (target.max_hp || target.maxHp || tHp || 1) : 1;
        return {
            hp: uHp,
            hp_pct: Math.round((uHp / uMax) * 100),
            max_hp: uMax,
            target_hp: tHp,
            target_hp_pct: Math.round((tHp / tMax) * 100),
            distance: (unit && target) ? hexDistanceCoord(unit, target) : 0,
            roll: rollV ?? 0,
            terrain: (unit && unit.terrain) || '',
            target_terrain: (target && target.terrain) || '',
            has_moved: !!(unit && unit.has_moved),
            stealth: !!(unit && unit.stealth),
        };
    }

    /**
     * 递归执行段树
     * @param {Array} tree PhaseNode[]
     * @param {Object} unit 施法者
     * @param {Object} target 目标
     * @param {number} rollV 掷骰点数（供 ROLL 分叉与 when 表达式的 roll 左值）
     * @param {Object} context 战场上下文（allUnits / battleState）
     * @param {number} depth 当前深度（上限 3）
     * @param {Object} [opts] 选项；opts.pure=true 时进入「纯计算模式」：
     *        深拷贝 unit/target 为隔离帧，所有 statusEffects 写入落在克隆体，
     *        绝不污染原 battleState（满足 /glossary-studio 战场模拟隔离红线）。
     *        返回 out.cloneFrame 携带模拟后的施法者/目标克隆，供调用方读取增量。
     */
    _walkPhaseTree(tree, unit, target, rollV, context, depth = 0, opts = {}) {
        const out = { applied: 0, log: [], vetoed: false, damage: 0 };
        if (!Array.isArray(tree) || !tree.length) return out;
        if (depth > 3) {
            out.log.push('[段树] 超过最大深度 3，已截断');
            return out;
        }

        // 阶段2 隐患1：每层重建局部 fxCtx（流程变量隔离），但结算结果向上汇总到 out
        // 纯计算模式：深拷贝施法者/目标为隔离帧，原 unit/target 零副作用
        const pure = !!(opts && opts.pure);
        const simUnit = pure ? this._deepCloneUnit(unit) : unit;
        const simTarget = pure ? this._deepCloneUnit(target) : target;
        const fxCtx = {
            unit: simUnit,
            target: simTarget,
            source: simUnit,
            attacker: simUnit,
            targetUnit: simTarget,
            allUnits: (context && context.allUnits) || [],
            battleState: (context && context.battleState) || null,
            useMainPipe: !!(context && context.useMainPipe),
            segDamageAccum: 0,
        };
        // whenCtx 为局部帧（子链二次掷骰/条件改的是克隆帧，不污染父级）
        const whenCtx = this._buildWhenContext(simUnit, simTarget, rollV);

        // ROLL 取代式标志：声明为当前栈帧局部变量，递归进入子链（多重掷骰）时会新建独立栈帧，互不污染（防线2）
        let rollBranchHit = false;
        // 命中分支后，记录分支子链内是否含 DO/AFTER/COST 段原子（用于空结算提示，防线1）
        const rollBranchHas = { DO: false, AFTER: false, COST: false };

        // ★ Week2/报告4b：DO/COST 段原子先经 AtomRegistry 翻译成引擎 handler key，
        // 再交 effectExecutor.executeSync（复用预检/目标重定向/别名）。未注册语义名走直通，
        // 保证存量 v2 词条（type 即引擎 key）零回退。
        const runAtoms = (atoms, tag) => {
            const list = (atoms || []).filter((a) => a && a.type);
            if (!list.length) return;
            const resolved = atomRegistry.resolveAll(list);
            const res = effectExecutor.executeSync(resolved, fxCtx);
            out.applied += (res && res.applied ? res.applied.length : 0);
            if (res && res.applied && res.applied.some((r) => r.veto)) out.vetoed = true;
            out.log.push(`[段树:${tag}] 结算 ${list.length} 个原子`);
        };

        // 阶段2 决策点2：统一闸门 gate_condition（ROLL 区间 / IF 条件归一）
        const _evalGate = (b) => {
            if (b.gate_condition && String(b.gate_condition).trim() !== '') {
                return this._evalWhenExpr(b.gate_condition, whenCtx);
            }
            // 兼容：ROLL 用 lower/upper 区间；IF 用 when 表达式
            if (b.lower != null || b.upper != null) {
                const lo = b.lower != null ? Number(b.lower) : -Infinity;
                const hi = b.upper != null ? Number(b.upper) : Infinity;
                return rollV >= lo && rollV <= hi;
            }
            if (b.when && String(b.when).trim() !== '') {
                return this._evalWhenExpr(b.when, whenCtx);
            }
            return false;
        };

        // 阶段2 隐患1：进入子链时克隆并压入局部 context 帧（target 可被子链 WHO 重选，但不污染父级）
        const _enterChild = (children, childTarget) => {
            const subTarget = childTarget || simTarget;
            // 克隆 context 帧：子链内部对 target/roll 的修改只作用域内生效，弹栈后父级恢复
            const childCtx = {
                ...(context || {}),
                allUnits: (context && context.allUnits) || [],
                battleState: (context && context.battleState) || null,
                useMainPipe: !!(context && context.useMainPipe),
            };
            const sub = this._walkPhaseTree(children, simUnit, subTarget, rollV, childCtx, depth + 1, opts);
            out.applied += sub.applied;
            out.damage += sub.damage;
            out.log.push(...sub.log);
            if (sub.vetoed) { out.vetoed = true; return true; }
            return false;
        };

        // 顺序固定，缺段跳过
        // ★ 2026-08-23：新增 AFTER（后效）主段，位于 DO 之后、COST 之前。
        //   后效 = 执行(DO)结算完成后、基于结算结果延续到未来时间的效应（持续 buff/debuff、链式、清理），
        //   与 COST（发动者自付代价）严格区分。画布六段式：时机→条件→随机性→执行→后效→代价。
        // ★ 2026-09-02 修正：删除已废弃的 WHO 段（旧值 7 段 WHO 与 AFTER 并存，与注释及六段定稿不符）。
        //   现为六段：WHEN→IF→ROLL→DO→AFTER→COST。存量词条配置中 WHO 节点数为 0，删除无数据风险。
        const ORDER = ['WHEN', 'IF', 'ROLL', 'DO', 'AFTER', 'COST'];
        const byPhase = {};
        tree.forEach((n) => { if (n && n.phase) byPhase[n.phase] = n; });

        for (const phase of ORDER) {
            const node = byPhase[phase];
            if (!node) continue;

            if (phase === 'WHEN') {
                // 时机在此层不做副作用（由外层调度消费），仅记录
                // 原 WHO（主语/目标解析）已降级为 DO 段首置前导原子 B_TARGET / resolve_target
                if ((node.atoms || []).length) out.log.push(`[段树:${phase}] ${node.atoms.map((a) => a.type).join(',')}`);
                continue;
            }

            if (phase === 'IF') {
                // 与门：条件原子全部通过（原子按 atom_key 做原生求值，另支持自由表达式 expr/when）
                const conds = (node.atoms || []).filter((a) => a && a.type === 'condition');
                for (const c of conds) {
                    const expr = c.expr || c.when || '';
                    if (expr && !this._evalWhenExpr(expr, whenCtx)) {
                        out.vetoed = true;
                        out.log.push(`[段树:IF] 条件不满足（${expr}），中止`);
                        return out;
                    }
                    const nat = this._evalConditionAtom(c, simUnit, simTarget, context, whenCtx);
                    if (nat === false) {
                        out.vetoed = true;
                        out.log.push(`[段树:IF] 条件原子 ${c.atom_key || c.type} 未满足，中止`);
                        return out;
                    }
                }
                // 或分叉：命中首个 gate 成立的分支（gate 为空的分支作为 else 兜底，排在最后判定）
                const branches = node.branches || [];
                if (branches.length) {
                    const named = branches.filter((b) => (b.gate_condition && String(b.gate_condition).trim() !== '') || (b.when && String(b.when).trim() !== ''));
                    const fallback = branches.filter((b) => !((b.gate_condition && String(b.gate_condition).trim() !== '') || (b.when && String(b.when).trim() !== '')));
                    let hit = named.find((b) => _evalGate(b)) || fallback[0] || null;
                    if (hit) {
                        out.log.push(`[段树:IF] 命中分支「${hit.label || hit.gate_condition || hit.when || 'else'}」`);
                        runAtoms(hit.effects, 'IF.branch');
                        if (Array.isArray(hit.children) && hit.children.length) {
                            if (_enterChild(hit.children, simTarget)) return out;
                        }
                    } else {
                        out.log.push('[段树:IF] 无分支命中，跳过分叉');
                    }
                }
                continue;
            }

            if (phase === 'ROLL') {
                const branches = node.branches || [];
                const matched = branches.filter((b) => _evalGate(b));
                if (!matched.length && branches.length) {
                    out.log.push(`[段树:ROLL] 掷骰 ${rollV} 未落入任何分支区间`);
                }
                for (const b of matched) {
                    out.log.push(`[段树:ROLL] 命中区间 ${b.lower}-${b.upper}「${b.label || ''}」`);
                    rollBranchHit = true; // 取代式：主链 DO/COST 将由命中分支内的 DO/COST 取代（D2 默认：有 branches 命中即取代）
                    // 收集分支子链内是否含 DO/AFTER/COST 段原子（用于空结算提示，防线1）
                    for (const ch of (b.children || [])) {
                        if (ch && ch.phase === 'DO' && (ch.atoms || []).length) rollBranchHas.DO = true;
                        if (ch && ch.phase === 'AFTER' && (ch.atoms || []).length) rollBranchHas.AFTER = true;
                        if (ch && ch.phase === 'COST' && (ch.atoms || []).length) rollBranchHas.COST = true;
                    }
                    runAtoms(b.effects, 'ROLL.branch');
                    if (Array.isArray(b.children) && b.children.length) {
                        if (_enterChild(b.children, simTarget)) return out;
                    }
                }
                // ROLL 段自身 atoms（如 manual_roll 提示）不产生副作用，跳过
                continue;
            }

            // DO / COST：ROLL 取代式——若已命中分段分支，主链 DO/COST 被分支内 DO/COST 取代，跳过主链（D1：仅全未命中才兜底主链）
            if (rollBranchHit) {
                if (rollBranchHas[phase]) {
                    out.log.push(`[段树:${phase}] 已由 ROLL 分段取代，跳过主链`);
                } else {
                    // 防线1：命中分段但分段内该段为空（空结算），明确提示，防止误判静默 Bug
                    out.log.push(`[段树:${phase}] 已由 ROLL 分段取代，但该分段无 ${phase} 效果（空结算）`);
                }
                continue;
            }

            // DO / COST：直接结算
            runAtoms(node.atoms, phase);
            if (out.vetoed) {
                out.log.push(`[段树:${phase}] 被 veto 中断`);
                break;
            }
            if (Array.isArray(node.children) && node.children.length) {
                if (_enterChild(node.children, simTarget)) break;
            }
        }

        out.damage += fxCtx.segDamageAccum || 0;
        // 纯计算模式：把隔离帧（模拟后的施法者/目标克隆）挂到 out，供调用方读取增量，原 battleState 零污染
        if (pure) {
            out.cloneFrame = { unit: simUnit, target: simTarget };
        }
        return out;
    }

    /**
     * 深拷贝战斗单位用于纯计算隔离帧。
     * 重点克隆 statusEffects / equipState / stats（/glossary-studio 战场模拟隔离红线：严禁改原对象）。
     */
    _deepCloneUnit(u) {
        if (!u) return u;
        const clone = { ...u };
        clone.statusEffects = Array.isArray(u.statusEffects)
            ? u.statusEffects.map((s) => (s && typeof s === 'object' ? { ...s } : s))
            : [];
        clone.equipState = u.equipState ? JSON.parse(JSON.stringify(u.equipState)) : u.equipState;
        clone.stats = u.stats ? JSON.parse(JSON.stringify(u.stats)) : u.stats;
        return clone;
    }

    _resolveRollSegments(skillType, unit, target, uf, rollV, context, opts) {
        const o = opts || {};
        const out = { applied: 0, log: [], disabled: [], triggered: true, allOrNothingFailed: false, segmentDamage: 0 };
        if (!uf.roll || !Array.isArray(uf.roll.segments) || !uf.roll.segments.length) return out;
        const dualSlot = !!(uf.meta_ops && uf.meta_ops.dual_slot) || (uf.cost && uf.cost.slots === 2);
        // ★ 阶段一 A/B：Segment 匹配支持两种描述
        //   - 若 segment 声明 points（离散点/数组/区间，复用 BranchEvaluator.pointMatches），优先按 points 判定；
        //   - 否则回退到 lower/upper 闭区间（原有语义）。两者可并存：有 points 用 points，无则区间。
        const matched = uf.roll.segments.filter((s) => {
            if (s && s.points != null) {
                const pts = Array.isArray(s.points) ? s.points : [s.points];
                if (pts.some((p) => BranchEvaluator.pointMatches(p, rollV))) return true;
            }
            if (s && (s.lower != null || s.upper != null)) {
                const lo = s.lower != null ? s.lower : -Infinity;
                const hi = s.upper != null ? s.upper : Infinity;
                if (rollV >= lo && rollV <= hi) return true;
            }
            return false;
        });

        // ★ 阶段一 B5：all_or_nothing —— 掷骰未落入任何 Segment 即整技能全失效（0 伤害）。
        //   仅当技能显式开启 all_or_nothing 且确实配置了 segments 时生效（无 segments 不触发）。
        if (uf.roll.all_or_nothing && matched.length === 0) {
            out.triggered = false;
            out.allOrNothingFailed = true;
            out.log.push(`[all_or_nothing] 掷骰 ${rollV} 未落入任何 Segment，技能全失效（0 伤害）`);
            return out;
        }

        // ★ 阶段一 D：把战场单位集合与施法者传入效果上下文，供 target_scope 重定向使用。
        // ★ 阶段二 C：注入 useMainPipe（仅纯 Segment 模型词条开启，使 Segment damage 走 DamagePipe 真实减伤）
        //   与 segDamageAccum 累加器（handleDirectDamage 写入，最终回传为 segmentDamage 供谓语后汇流）。
        const fxCtx = {
            unit,
            target,
            source: unit,
            attacker: unit,
            skillType,
            targetUnit: target,
            allUnits: (context && context.allUnits) || [],
            battleState: (context && context.battleState) || null,
            useMainPipe: !!o.useMainPipe,
            segDamageAccum: 0,
        };
        for (const seg of matched) {
            if (!seg.effects || !seg.effects.length) continue;
            const routes = dualSlot ? 2 : 1;
            for (let r = 0; r < routes; r++) {
                const res = effectExecutor.executeSync(seg.effects, fxCtx);
                out.applied += (res && res.applied ? res.applied.length : 0);
            }
            for (const ef of seg.effects) {
                if (ef && ef.permanent_disable_target && target) {
                    target._meta = target._meta || {};
                    target._meta.permanently_disabled_skills = target._meta.permanently_disabled_skills || [];
                    if (!target._meta.permanently_disabled_skills.includes(ef.permanent_disable_target)) {
                        target._meta.permanently_disabled_skills.push(ef.permanent_disable_target);
                    }
                    out.disabled.push(ef.permanent_disable_target);
                }
            }
            out.log.push(`[段 ${matched.indexOf(seg) >= 0 ? (seg.lower != null ? seg.lower + '-' + seg.upper : 'pts:' + JSON.stringify(seg.points)) : ''} ${seg.label || ''}] 结算 ${seg.effects.length} 个效果${dualSlot ? ' ×2(双槽)' : ''}`);
        }
        // ★ 阶段二 C：汇流所需——Segment 内 damage 效果的真实管线伤害累计值。
        out.segmentDamage = fxCtx.segDamageAccum || 0;
        return out;
    }

    _executeBranchModelSkill(skillType, unit, target, uf, cfg, heightBonus, heightDiff, context) {
        const roll = BranchEvaluator.rollDice(uf.dice.dice_type);
        const hits = BranchEvaluator.evaluateBranches(uf.dice.dice_branches, roll);
        const ectx = BranchEvaluator.newEffectContext();
        BranchEvaluator.applyBranchEffects(hits.flatMap((h) => h.effects), ectx);

        // === 项9：roll.segments[].effects[] 接通结算 ===
        // 掷骰点数 V 落入某 Segment 区间 [lower, upper] 时，将其内嵌 effects[] 经效果执行器遍历结算。
        const segLog = [];
        let segApplied = 0;
        let permanentDisableTarget = null;
        const dualSlot = !!(uf.meta_ops && uf.meta_ops.dual_slot) || (uf.cost && uf.cost.slots === 2);
        if (uf.roll && Array.isArray(uf.roll.segments) && uf.roll.segments.length) {
            const matched = uf.roll.segments.filter((s) => roll >= s.lower && roll <= s.upper);
            const fxCtx = { unit, target, source: unit, skillType, targetUnit: target };
            for (const seg of matched) {
                if (!seg.effects || !seg.effects.length) continue;
                const routes = dualSlot ? 2 : 1; // [项5] 双槽：效果路由执行两遍
                for (let r = 0; r < routes; r++) {
                    const res = effectExecutor.executeSync(seg.effects, fxCtx);
                    segApplied += (res && res.applied ? res.applied.length : 0);
                    // [项6] 扫描 permanent_disable_target：写入目标永久失效列表
                    for (const ef of seg.effects) {
                        if (ef && ef.permanent_disable_target) {
                            permanentDisableTarget = ef.permanent_disable_target;
                        }
                    }
                }
                segLog.push(`[段 ${seg.lower}-${seg.upper} ${seg.label || ''}] 结算 ${seg.effects.length} 个效果${dualSlot ? ' ×2(双槽)' : ''}`);
            }
        }
        if (permanentDisableTarget && target) {
            target._meta = target._meta || {};
            target._meta.permanently_disabled_skills = target._meta.permanently_disabled_skills || [];
            if (!target._meta.permanently_disabled_skills.includes(permanentDisableTarget)) {
                target._meta.permanently_disabled_skills.push(permanentDisableTarget);
                segLog.push(`永久失效写入：target.${permanentDisableTarget}`);
            }
        }

        const result = {
            triggered: true,
            type: skillType,
            faction_role: (unit._meta && unit._meta.faction_role) || 'attack',
            meta_ops: (unit._meta && unit._meta.meta_ops) || null,
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
            log: [`投骰=${roll} 命中分支 ${hits.length} 个`].concat(ectx.log).concat(segLog),
            segment_effects_applied: segApplied,
            dual_slot: dualSlot,
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
        // 2026-08-07：命中判定真相源改为 DiceService 全局 hitCheck。
        //   - 若词条自身显式配了 success_line，仍优先（词条级覆盖全局）。
        //   - 否则取全局 hitCheck.successLine。
        //   - hitCheck.enabled=false 时一律视为命中（关闭骰点命中检定）。
        const globalHit = DiceService.getConfig().hitCheck || { enabled: true, successLine: 4 };
        const successLine = (typeof skillCfg.success_line === 'number')
          ? skillCfg.success_line
          : (Number.isFinite(globalHit.successLine) ? globalHit.successLine : 4);
        const bonusDamage = skillCfg.success_bonus_damage ?? 0;
        const isSuccess = globalHit.enabled === false ? true : (roll >= successLine);
        return {
            roll,
            diceType,
            successLine,
            isSuccess,
            hitCheckEnabled: globalHit.enabled !== false,
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
        // ★ Phase 31-RangeNormalize：返回归一化 minRange/maxRange
        return { min: uf.minRange, max: uf.maxRange };
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
        // ★ Phase 31-RangeNormalize：反击射程优先用传入 skillRange（攻击方 maxRange），
        // 否则回退归一化 maxRange。反击 minRange 默认 1（排除自身），用 isTargetInRange 统一判定。
        const range = skillRange ?? uf.maxRange ?? 1;
        const dist = hexDistanceCoord(unit, attacker);
        if (dist < uf.minRange || dist > range) return { triggered: false };

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
            // ★ Phase 31-RangeNormalize：删除 dist===0 特判，统一走 minRange/maxRange。
            const dist = hexDistanceCoord(unit, target);
            if (dist < uf.minRange || dist > uf.maxRange) {
                return {
                    heal_amount: 0, out_of_range: true,
                    min: uf.minRange, max: uf.maxRange, actual: dist,
                    message: `补给仅对范围 ${uf.minRange}~${uf.maxRange} 内友军有效（当前距离 ${dist} 格）`
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
        const maxRange = uf.maxRange; // ★ Phase 31-RangeNormalize：读归一化字段

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
        const minRange = uf.minRange; // ★ Phase 31-RangeNormalize：读归一化字段
        const maxRange = uf.maxRange;

        if (target) {
            const dist = hexDistanceCoord(unit, target);
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
            // ★ Phase 31-RangeNormalize：读归一化字段（stable 默认 category=special → minRange=0，
            // 但 stable 历史硬编码 1~4，这里尊重配置；若未配则用归一化默认）。
            const dist = hexDistanceCoord(unit, target);
            const minR = uf.minRange || 1;
            const maxR = uf.maxRange || 4;
            if (dist < minR || dist > maxR) {
                return {
                    triggered: false, out_of_range: true,
                    min: minR, max: maxR, actual: dist,
                    message: `稳定需要 ${minR}~${maxR} 格距离（当前 ${dist} 格）`
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
        const minRange = uf.minRange || 4; // ★ Phase 31-RangeNormalize：读归一化字段，保留历史默认 4
        const maxRange = uf.maxRange || 6;
        const dist = hexDistanceCoord(unit, target);
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
        const dist = hexDistanceCoord(unit, ally);
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
        // ★ Phase 31-RangeNormalize：决斗是近战硬语义（必须相邻 dist<=1），
        // 不走归一化 maxRange（duel category 默认 special=1，但业务要求绝对相邻）。
        const dist = hexDistanceCoord(unitA, unitB);
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

    _isInSector(unit, target, maxDist = 2, sectorAngle = 60) {
        if (!unit || !target) return false;
        const dist = hexDistanceCoord(unit, target);
        // ★ Phase 31-RangeNormalize：扇形扫射 minRange 固定 1（不能扫自身），保留此语义
        if (dist < 1 || dist > maxDist) return false;

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
