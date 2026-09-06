#!/usr/bin/env python3
"""增强 UnitConverter: 添加技能→Tag 转换 + 更新 convert 方法"""

path = '/root/original-project/services/combat-service/src/services/unitConverter.js'

with open(path, 'r') as f:
    content = f.read()

# 1. 在 convert 方法的 return unit 之前添加技能转换
# 找到 'return unit;' 在 convert 方法中
old_return = "        // 保留原始数据用于技能转换\n            _hangarRaw: hangarUnit"
new_return = """        // 保留原始数据用于技能转换
            _hangarRaw: hangarUnit,

            // 转换技能为 Tag 格式
            skills: this.convertSkills(hangarUnit),
            equipped_tags: this.convertSkills(hangarUnit).map(s => s.id)"""

content = content.replace(old_return, new_return)

# 2. 在最后一个方法之后、class closing } 之前添加技能转换方法
# 找到 class 的结尾
class_end = content.rfind('}\n\n')
# 找到 export
export_start = content.rfind('\nexport default UnitConverter;')

skills_methods = '''
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
     * @private
     */
    static _skillToTag(skill, slot, index) {
        const skillTypeMap = { '自动': 'auto', '手动': 'manual', '被动': 'passive' };
        const attrMap = { '实体': 'kinetic', '能量': 'beam', '爆炸': 'explosive', '物理': 'kinetic', '光束': 'beam', '特殊': 'special' };

        const tag = {
            id: `${slot}_skill_${index}`,
            name: skill.name,
            type: skillTypeMap[skill.type] || 'auto',
            attribute: attrMap[skill.attribute] || 'kinetic',
            slot: slot,
            original: skill
        };

        // 解析 effect 字段为可计算参数
        if (skill.effect) {
            tag.effect = skill.effect;
            const dmgMatch = String(skill.effect).match(/(\\\\d+)/);
            if (dmgMatch) tag.damage = parseInt(dmgMatch[1]);
        }

        // 解析 range
        if (skill.range) {
            const rangeMatch = String(skill.range).match(/(\\\\d+)/);
            if (rangeMatch) tag.range = parseInt(rangeMatch[1]);
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
'''

# Insert before export
before_export = content[:export_start]
after_export = content[export_start:]

# Find the class closing } which is right before export
class_close = before_export.rfind('\n}')
if class_close > 0:
    content = before_export[:class_close] + '\n' + skills_methods + '\n' + before_export[class_close:] + after_export
else:
    # fallback
    content = before_export + skills_methods + after_export

with open(path, 'w') as f:
    f.write(content)

print(f'Enhanced UnitConverter with skill conversion + updated convert(). Size: {len(content)} chars')
print('Skills convert method added')
print('convert() now calls convertSkills()')
