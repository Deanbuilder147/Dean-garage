#!/usr/bin/env python3
"""
Phase 7 后端基础改造: configLoader 原子增删 + battles.js 路由升级 + JSON 数据模型
"""

import json, sys, os

BASE = "/root/original-project"
fixes = 0

# ============================================================
# 1. configLoader.cjs — 新增 deleteSkills() + saveGlossaryConfig 处理 _delete_skills
# ============================================================
config_loader_path = f"{BASE}/services/combat-service/src/services/combatCore/configLoader.cjs"
with open(config_loader_path, "r") as f:
    cl = f.read()

# 1a. 在 module.exports 前插入 deleteSkills 函数
old_exports = "module.exports = {\n    getGlossaryConfig,\n    saveGlossaryConfig,\n    getSkillConfig,\n    getSystemConfig,\n};"
new_delete_func = """
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
};"""

if old_exports in cl:
    cl = cl.replace(old_exports, new_delete_func)
    fixes += 1
    print("✅ configLoader 1a: 新增 deleteSkills() 函数")

# 1b. 在 saveGlossaryConfig 中处理 _delete_skills 指令
old_save_start = "function saveGlossaryConfig(incomingConfig) {"
old_try_open = """    try {
        // 读取现有配置进行深度合并"""
new_try_block = """    try {
        // 原子删除: 处理 _delete_skills 指令
        const deleteKeys = incomingConfig._delete_skills || [];
        if (deleteKeys.length > 0) {
            deleteSkills(deleteKeys);
            // 从 incomingConfig 中移除 _delete_skills，避免写入 JSON
            delete incomingConfig._delete_skills;
        }

        // 读取现有配置进行深度合并"""

if old_try_open in cl:
    cl = cl.replace(old_try_open, new_try_block)
    fixes += 1
    print("✅ configLoader 1b: saveGlossaryConfig 支持 _delete_skills 原子删除")

with open(config_loader_path, "w") as f:
    f.write(cl)

# ============================================================
# 2. battles.js — 升级 POST /glossary-config 路由
# ============================================================
battles_path = f"{BASE}/services/combat-service/src/routes/battles.js"
with open(battles_path, "r") as f:
    bj = f.read()

old_post_section = """// POST 保存词条库配置
router.post('/glossary-config', (req, res) => {
  try {
    const newConfig = req.body;
    // 深度合并模式：接受部分更新，无严格字段要求
    if (!newConfig || typeof newConfig !== 'object' || Array.isArray(newConfig)) {
      return res.status(400).json({
        error: '配置格式无效',
        message: '请求体必须是 JSON 对象'
      });
    }

    newConfig._meta = newConfig._meta || {};
    newConfig._meta.date = new Date().toISOString().replace('T', ' ').substring(0, 19);
    newConfig._meta.generated_from = 'GlossaryView.vue 前端编辑界面';
    newConfig._meta.version = newConfig._meta.version || '2.0';

    const success = saveGlossaryConfig(newConfig);
    if (!success) {
      return res.status(500).json({ error: '写入配置文件失败' });
    }

    console.log('[Glossary] 配置已更新，消费者将在下次调用时加载新值');
    res.json({
      message: '词条库配置已保存并生效',
      updated_at: newConfig._meta.date
    });
  } catch (error) {
    console.error('[Glossary] POST error:', error);
    res.status(500).json({ error: '保存词条配置失败' });
  }
});"""

new_post_section = """// POST 保存词条库配置 (支持原子增删改查)
router.post('/glossary-config', (req, res) => {
  try {
    const newConfig = req.body;
    if (!newConfig || typeof newConfig !== 'object' || Array.isArray(newConfig)) {
      return res.status(400).json({
        error: '配置格式无效',
        message: '请求体必须是 JSON 对象'
      });
    }

    // 原子删除指令: _delete_skills: ["skill_key_1", "skill_key_2"]
    const deleteKeys = newConfig._delete_skills || [];
    if (deleteKeys.length > 0) {
      const deleted = deleteSkills(deleteKeys);
      console.log(`[Glossary] 原子删除请求: [${deleteKeys.join(', ')}], 结果: ${deleted}`);
      // 清除 _delete_skills 避免写入磁盘
      delete newConfig._delete_skills;
      // 如果请求仅包含删除指令，直接返回
      if (Object.keys(newConfig).length === 0 || (Object.keys(newConfig).length === 1 && newConfig._meta)) {
        return res.json({
          message: `已删除 ${deleteKeys.length} 个技能词条`,
          deleted: deleteKeys,
          updated_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
        });
      }
    }

    newConfig._meta = newConfig._meta || {};
    newConfig._meta.date = new Date().toISOString().replace('T', ' ').substring(0, 19);
    newConfig._meta.generated_from = 'GlossaryView.vue 前端编辑界面 (结构化 CRUD)';
    newConfig._meta.version = newConfig._meta.version || '3.0';

    const success = saveGlossaryConfig(newConfig);
    if (!success) {
      return res.status(500).json({ error: '写入配置文件失败' });
    }

    console.log('[Glossary] 配置已更新 (结构化CRUD)，消费者将在下次调用时加载新值');
    res.json({
      message: '词条库配置已保存并生效',
      updated_at: newConfig._meta.date
    });
  } catch (error) {
    console.error('[Glossary] POST error:', error);
    res.status(500).json({ error: '保存词条配置失败' });
  }
});"""

if old_post_section in bj:
    bj = bj.replace(old_post_section, new_post_section)
    fixes += 1
    print("✅ battles.js: POST /glossary-config 支持 _delete_skills 原子删除 + CRUD")

# 检查 import 是否有 deleteSkills
if "deleteSkills" not in bj.split("router.get('/glossary-config'")[0]:
    old_import = "import { getGlossaryConfig, saveGlossaryConfig } from '../services/combatCore/configLoader.cjs';"
    new_import = "import { getGlossaryConfig, saveGlossaryConfig, deleteSkills } from '../services/combatCore/configLoader.cjs';"
    if old_import in bj:
        bj = bj.replace(old_import, new_import)
        fixes += 1
        print("✅ battles.js: import 添加 deleteSkills")

with open(battles_path, "w") as f:
    f.write(bj)

# ============================================================
# 3. glossary-skill-config.json — 升级数据模型，添加 5 个通用字段
# ============================================================
json_path = f"{BASE}/services/combat-service/src/config/glossary-skill-config.json"
with open(json_path, "r") as f:
    config = json.load(f)

UNIVERSAL_DEFAULTS = {
    "target_filter": "enemy",
    "cast_range": 1,
    "aoe_radius": 0,
    "base_damage": 0,
    "status_effects": []
}

# 为每个技能填入智能默认的通用字段
SKILL_DEFAULTS = {
    "block":        {"target_filter": "self",  "cast_range": 0, "aoe_radius": 0, "base_damage": 0, "status_effects": []},
    "sweep":        {"target_filter": "enemy", "cast_range": 2, "aoe_radius": 0, "base_damage": -2, "status_effects": []},
    "throw":        {"target_filter": "enemy", "cast_range": 3, "aoe_radius": 2, "base_damage": 5, "status_effects": []},
    "execute":      {"target_filter": "enemy", "cast_range": 1, "aoe_radius": 0, "base_damage": 999, "status_effects": []},
    "duel":         {"target_filter": "enemy", "cast_range": 1, "aoe_radius": 0, "base_damage": 0, "status_effects": []},
    "snatch":       {"target_filter": "enemy", "cast_range": 1, "aoe_radius": 0, "base_damage": 0, "status_effects": []},
    "focused_fire": {"target_filter": "enemy", "cast_range": 1, "aoe_radius": 0, "base_damage": 4, "status_effects": []},
    "lucky":        {"target_filter": "all",   "cast_range": 0, "aoe_radius": 0, "base_damage": 0, "status_effects": []},
    "reactivate":   {"target_filter": "self",  "cast_range": 0, "aoe_radius": 0, "base_damage": 0, "status_effects": []},
}

skill_count = 0
for key, skill in config.get("skills", {}).items():
    defaults = SKILL_DEFAULTS.get(key, UNIVERSAL_DEFAULTS)
    for field, value in defaults.items():
        if field not in skill:
            skill[field] = value
    skill_count += 1

config["_meta"]["version"] = "3.0"
config["_meta"]["principle"] = "技能效果确定化 + 5 通用字段结构 (target_filter/cast_range/aoe_radius/base_damage/status_effects)"

with open(json_path, "w") as f:
    json.dump(config, f, ensure_ascii=False, indent=2)

fixes += 1
print(f"✅ glossary-skill-config.json: {skill_count} 个技能升级至 v3.0 通用字段模型")

# ============================================================
# 总结
# ============================================================
print(f"\n=== Phase 7 后端基础改造: {fixes} 处完成 ===")
print("  • configLoader.cjs: deleteSkills() + _delete_skills 原子删除")
print("  • battles.js: POST 路由支持 CREATE/DELETE/UPDATE")
print(f"  • glossary-skill-config.json: {skill_count} 技能 → v3.0 通用字段")
