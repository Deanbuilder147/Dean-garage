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
