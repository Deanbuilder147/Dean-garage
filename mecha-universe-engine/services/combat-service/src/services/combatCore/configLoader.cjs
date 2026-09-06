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
 * Phase A 防御校验器（单一写入口挂载，非路由层）。
 * 安全降级：shared-kernel 未构建/不可用时静默跳过，绝不阻断装载。
 * 校验器在模块加载时解析一次（热路径不再重复 require）。
 */
let _validateGlossaryConfig = null;
let _validatorInit = false;
function getGlossaryValidator() {
    if (_validatorInit) return _validateGlossaryConfig;
    _validatorInit = true;
    try {
        const contracts = require('@mecha/shared-kernel/contracts');
        if (typeof contracts.validateGlossaryConfig === 'function') {
            _validateGlossaryConfig = contracts.validateGlossaryConfig;
        }
    } catch (e) {
        // shared-kernel 不可用时跳过校验（防御性，不影响装载）
    }
    return _validateGlossaryConfig;
}

/**
 * 深度合并两个对象
 * - 对于普通值，新值覆盖旧值
 * - 对于对象，递归合并
 * - 对于数组，新数组替换旧数组
 */
function deepMerge(target, source) {
    if (!source || typeof source !== 'object') return source;
    if (!target || typeof target !== 'object') return source;

    // 数组 vs 对象类型不一致时禁止递归合并：
    // 例如旧值 [[0,0,0]] 与新值 {right:[...]} 合并会产出 {"0":[0,0,0], right:[...]} 脏键，
    // 导致 map_cannon.directions 等结构被污染且永远无法清除。类型不同一律以新值为准。
    if (Array.isArray(target) !== Array.isArray(source)) return source;

    const result = { ...target };
    for (const key of Object.keys(source)) {
        const sv = source[key];
        const tv = result[key];
        if (sv && typeof sv === 'object' && !Array.isArray(sv)
            && tv && typeof tv === 'object' && !Array.isArray(tv)) {
            result[key] = deepMerge(tv, sv);
        } else {
            // 新值为数组/标量，或新旧类型不一致 → 整体替换（可正确"删键"）
            result[key] = sv;
        }
    }
    return result;
}

function getGlossaryConfig(raw) {
    try {
        const rawData = fs.readFileSync(CONFIG_PATH, 'utf-8');
        const data = JSON.parse(rawData);
        // Phase A 防御校验：仅告警，绝不阻断装载
        const validate = getGlossaryValidator();
        if (validate) {
            try {
                const res = validate(data);
                if (res && res.warnings && res.warnings.length) {
                    console.warn('[ConfigLoader] 词条配置防御校验告警:', res.warnings.join(' | '));
                }
            } catch (ve) {
                // 校验异常不影响装载
            }
        }
        // Phase C：六段式标准化（仅在请求 normalized 视图时补全；原始 JSON 不动）
        if (raw === true) return data;
        if (data && data.skills && typeof data.skills === 'object') {
            const out = {};
            for (const [k, v] of Object.entries(data.skills)) {
                out[k] = normalizeEntry(v, k);
            }
            data.skills = out;
        }
        return data;
    } catch (e) {
        console.error('[ConfigLoader] 读取配置文件失败:', e.message);
        return null;
    }
}

/**
 * Phase C：六段式标准化（读取时补全，绝不改行为）。
 * 现有词条用扁平字段(engine_meta/ap_cost/trigger/cast_range...)承载语义，
 * 此处映射到六段式(timing/conditions/target/roll/effects/cost)，
 * 使契约校验与六段式编辑器 UI 有一致真相源；引擎仍读旧扁平字段（读兼容）。
 * 仅新增字段，绝不删除/改写旧字段。
 */
function normalizeEntry(raw, key) {
    if (!raw || typeof raw !== 'object') return raw;
    const e = { ...raw };
    const em = raw.engine_meta || {};
    e.key = e.key || key;

    if (!e.timing) {
        e.timing = { trigger: raw.trigger || em.trigger || null };
    }
    if (!e.conditions) e.conditions = [];
    if (!e.target) {
        e.target = {
            shape: (raw.target && raw.target.shape) || em.target_shape || 'single',
            range: raw.cast_range != null ? raw.cast_range
                : (raw.max_range != null ? raw.max_range
                    : (raw.range != null ? raw.range : null)),
            count: (raw.target && raw.target.count) || em.target_count || 1,
        };
    }
    if (!e.roll) {
        e.roll = { mode: em.roll_mode || 'dice', generator: { method: em.roll_method || 'standard' } };
    }
    if (!e.cost) {
        e.cost = {
            ap: raw.ap_cost != null ? raw.ap_cost : (em.ap_cost != null ? em.ap_cost : 1),
            charges: em.charges != null ? em.charges : (em.limit_count != null ? em.limit_count : null),
            durability: em.durability != null ? em.durability : null,
            cooldown: em.cooldown != null ? em.cooldown : null,
            limit_scope: em.limit_scope || raw.limit_scope || 'MATCH',
        };
    }
    if (!e.effects) e.effects = Array.isArray(raw.effects) ? raw.effects : [];
    return e;
}

/**
 * Phase C：三型寿命管制（opt-in，默认不拦截，保证现有行为 100% 不变）。
 * limit_scope: MATCH(整局)/FACTION(阵营)/PERSONAL(单体)/PER_TURN(每回合)
 * 仅当 entry.cost.enforce === true 时生效（深度接线靠靶场实测迭代）。
 */
function checkCost(battle, unit, entry) {
    const cost = entry && entry.cost;
    if (!cost || cost.enforce !== true) return { ok: true };
    const scope = cost.limit_scope || 'MATCH';
    const cap = cost.charges != null ? cost.charges : (cost.durability != null ? cost.durability : null);
    if (cap == null) return { ok: true };
    battle._costUsage = battle._costUsage || {};
    const k = _usageKey(battle, unit, entry.key || entry.skill_key, scope);
    if ((battle._costUsage[k] || 0) >= cap) {
        return { ok: false, reason: `已达 ${scope} 寿命上限 ${cap}` };
    }
    return { ok: true };
}
function consumeCost(battle, unit, entry) {
    const cost = entry && entry.cost;
    if (!cost || cost.enforce !== true) return;
    const scope = cost.limit_scope || 'MATCH';
    battle._costUsage = battle._costUsage || {};
    const k = _usageKey(battle, unit, entry.key || entry.skill_key, scope);
    battle._costUsage[k] = (battle._costUsage[k] || 0) + 1;
}
function _usageKey(battle, unit, skillKey, scope) {
    if (scope === 'PERSONAL') return `personal:${unit?.unitId || unit?.id}:${skillKey}`;
    if (scope === 'FACTION') return `faction:${unit?.faction}:${skillKey}`;
    if (scope === 'PER_TURN') return `turn:${battle?.turn}:${unit?.faction}:${skillKey}`;
    return `match:${skillKey}`;
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
        const skill = config.skills[skillType];
        // 合并方案 7.2（隐患1防御）：词条未带 v2 tree 时，运行时自动升维，
        // 保证 _walkPhaseTree 的 v2 路径"通电"；已带离线 tree 则原样返回（双写兼容）。
        // 注意：仅在读取视图升维，绝不写回磁盘原始 JSON（getGlossaryConfig(raw=true) 不受影响）。
        if (!(Number(skill.schema_version) === 2 && Array.isArray(skill.tree) && skill.tree.length)) {
            return autoPromoteV1ToV2(skill);
        }
        return skill;
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
    checkCost,
    consumeCost,
    normalizeEntry,
    normalizeEffectAtom,
    autoPromoteV1ToV2,
};

/**
 * 合并方案 7.2（隐患1防御 · Week1 兜底）
 * 单个 effect 原子的归一化：字段清洗 + 类型兜底，必须与老路径
 * effectExecutor.executeSync 消费的字段结构同构，禁止私自改名/塞字段。
 * 注意：type 的真名重定向（status→modify_stat 等）由 effectExecutor
 * 内部 _resolveHandlerType 负责（老路径同源），此处只做基础清洗，
 * 不重复重定向，避免双定义漂移。
 */
function normalizeEffectAtom(raw) {
    if (!raw || typeof raw !== 'object') return raw;
    const type = raw.type || raw.action || 'unknown';
    return {
        ...raw,
        type,
        // 数值类字段兜底：保持与 executeSync 读取一致
        value: raw.value != null ? Number(raw.value) : (raw.flat_value != null ? Number(raw.flat_value) : 0),
        target: raw.target || raw.target_scope || 'target',
    };
}

/**
 * 合并方案 7.2（隐患1防御 · Week1 兜底）
 * 运行时把 v1 扁平词条（effects[] / trigger / ap_cost ...）升维为 v2 六段树。
 * 必须复用 normalizeEntry 已建立的字段映射口径，保证产出的 tree 与
 * 「离线迁移脚本生成的 tree」逐字段一致（可单测断言）。
 *
 * 产出约定（与 _walkPhaseTree 消费对齐）：
 *   WHEN  = 触发事件（trigger）
 *   IF    = 空（v1 无条件守卫时留空，不塞假条件）
 *   WHO   = 空（作用域由 target 配置承载，tree 不重复）
 *   ROLL  = 空（v1 掷骰由 effect 内部承载，顶层不提）
 *   DO    = 归一化后的 effects 原子列表
 *   COST  = 空（AP 消耗由引擎 action_type 调度层处理，tree 不重复）
 */
function autoPromoteV1ToV2(v1Skill) {
    if (!v1Skill || typeof v1Skill !== 'object') return v1Skill;
    if (Number(v1Skill.schema_version) === 2 && Array.isArray(v1Skill.tree) && v1Skill.tree.length) {
        return v1Skill; // 已是 v2，原样返回（双写验证期内不覆盖离线 tree）
    }
    const base = normalizeEntry(v1Skill, v1Skill.key || v1Skill.name);
    // 抽取 effects：兼容顶层 effects 与纯 Segment 模型的 roll.segments[].effects
    // （与 scripts/migrate-to-phase-tree.cjs 同构，保证双写一致性，杜绝隐患1静默失败）
    let rawEffects = Array.isArray(v1Skill.effects) ? v1Skill.effects : [];
    if (rawEffects.length === 0 && v1Skill.roll && Array.isArray(v1Skill.roll.segments)) {
        for (const seg of v1Skill.roll.segments) {
            if (Array.isArray(seg.effects)) rawEffects.push(...seg.effects);
        }
    }
    const normalizedAtoms = rawEffects.map(normalizeEffectAtom);
    return {
        ...v1Skill,
        schema_version: 2,
        tree: [
            { phase: 'WHEN', atoms: [{ type: base.timing && base.timing.trigger ? base.timing.trigger : 'active' }] },
            { phase: 'DO', atoms: normalizedAtoms },
        ],
    };
}
