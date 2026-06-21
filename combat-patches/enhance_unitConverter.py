#!/usr/bin/env python3
"""增强 UnitConverter: 添加技能→Tag 转换功能"""
import re

path = '/root/original-project/services/combat-service/src/services/unitConverter.js'

with open(path, 'r') as f:
    content = f.read()

# 在最后一个方法 (_convertRoyroy) 之后、class closing } 之前添加技能转换方法
class_end = content.rfind('}\n\n')
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
     * 单个技能 → Tag 转换
     * @private
     */
    static _skillToTag(skill, slot, index) {
        const skillTypeMap = {
            '自动': 'auto',
            '手动': 'manual',
            '被动': 'passive'
        };
        const attrMap = {
            '实体': 'kinetic',
            '能量': 'beam',
            '爆炸': 'explosive',
            '物理': 'kinetic',
            '光束': 'beam',
            '特殊': 'special'
        };

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
            const dmgMatch = String(skill.effect).match(/(\\d+)/);
            if (dmgMatch) {
                tag.damage = parseInt(dmgMatch[1]);
            }
        }

        // 解析 range 字段
        if (skill.range) {
            const rangeMatch = String(skill.range).match(/(\\d+)/);
            if (rangeMatch) {
                tag.range = parseInt(rangeMatch[1]);
            }
        }

        // 解析 special 字段
        if (skill.special) {
            tag.special = skill.special;
            // 识别已知特殊效果
            const lower = String(skill.special).toLowerCase();
            if (lower.includes('必中') || lower.includes('guaranteed')) tag.guaranteed_hit = true;
            if (lower.includes('暴击') || lower.includes('crit')) tag.crit_boost = true;
            if (lower.includes('穿透') || lower.includes('pierce')) tag.pierce = true;
            if (lower.includes('吸血') || lower.includes('lifesteal')) tag.lifesteal = true;
        }

        return tag;
    }
'''

new_content = content[:class_end] + '\n' + skills_methods + '\n' + content[class_end:]

with open(path, 'w') as f:
    f.write(new_content)

print(f'Enhanced UnitConverter with skill conversion. Size: {len(new_content)} chars')
