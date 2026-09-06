#!/usr/bin/env python3
"""
Phase 11.5: AI 技能生成器 — 基于万能语法格式自动生成平衡的技能 JSON
用法: python3 phase11_05_ai_skill_generator.py [--count 3] [--output skills.json]

生成规则:
- 主语 (Subject): 随机选择 action_type, 设置合理限制
- 谓语 (Predicate): 根据 action_type 选择 target_filter 和范围
- 定语 (Attribute): 从 5 种 damage_kind 中随机选择
- 状语 (Adverbial): 设置骰子参数和高地加成
- 补语 (Complement): 计算合理的基础伤害和效果
"""

import json
import random
import argparse
from datetime import datetime

# ===== 词库与规则 =====

ACTION_TYPES = ['attack', 'heal', 'buff', 'debuff', 'passive']
DAMAGE_KINDS = ['kinetic', 'beam', 'explosive', 'corrosive', 'thermal']
TARGET_FILTERS = ['enemy', 'ally', 'self', 'all']
ATTACK_STATS = ['melee', 'ranged', 'max']
CATEGORIES = ['melee', 'ranged', 'special', 'passive']
STATUS_EFFECTS = ['burn', 'stun', 'disable', 'slow', 'poison', 'freeze']
DICE_TYPES = ['1d4', '1d6', '1d6', '1d6', '1d8', '2d6', '1d10']

SKILL_NAMES = {
    'attack': [
        '雷霆一击', '等离子切割', '燃烧弹幕', '暴风连斩', '量子脉冲',
        '重力碾压', '相位射击', '爆裂弹头', '破甲突刺', '电磁炮击',
        '热熔射线', '腐蚀飞弹', '动能冲击', '光子风暴', '暗物质投射',
    ],
    'heal': [
        '纳米修复', '能量灌注', '结构重组', '生命绽放', '再生力场',
        '紧急维修', '细胞激活', '神圣庇护', '应急修复', '过载治疗',
    ],
    'buff': [
        '战斗狂热', '极限超频', '护盾增强', '瞄准辅助', '肾上腺素',
        '强化合金', '能量共鸣', '战术优势', '士气提升', '加速引擎',
    ],
    'debuff': [
        'EMP 干扰', '腐蚀酸液', '减速力场', '视野遮蔽', '能量吸取',
        '装甲弱化', '机动限制', '武器过载', '结构震荡', '神经毒素',
    ],
    'passive': [
        '钢铁意志', '反击本能', '战场直觉', '生存专家', '火力压制',
        '防御矩阵', '能量回收', '快速装填', '精准射击', '不屈斗志',
    ],
}

SKILL_LABELS = {
    'attack': '主动攻击',
    'heal': '主动治疗',
    'buff': '主动增益',
    'debuff': '主动减益',
    'passive': '被动技能',
}


def generate_skill_key(name: str) -> str:
    """根据中文名生成英文 key"""
    import hashlib
    return 'skill_' + hashlib.md5(name.encode()).hexdigest()[:8]


def generate_skill(action_type: str = None) -> dict:
    """根据万能语法格式生成一个技能"""
    if action_type is None:
        action_type = random.choice(ACTION_TYPES)

    name = random.choice(SKILL_NAMES.get(action_type, SKILL_NAMES['attack']))

    # === 主语 (Subject) ===
    requires_unmoved = random.random() < 0.2  # 20% 概率需要未移动
    requires_stealth = action_type == 'attack' and random.random() < 0.1

    # === 谓语 (Predicate) ===
    if action_type == 'attack':
        target_filter = 'enemy'
        cast_range = random.choice([1, 1, 2, 2, 3, 4])
    elif action_type == 'heal':
        target_filter = random.choice(['ally', 'self'])
        cast_range = random.choice([0, 1, 1, 2])
    elif action_type == 'buff':
        target_filter = random.choice(['ally', 'self', 'all'])
        cast_range = random.choice([0, 1, 2])
    elif action_type == 'debuff':
        target_filter = 'enemy'
        cast_range = random.choice([1, 2, 3, 4])
    else:  # passive
        target_filter = 'self'
        cast_range = 0

    min_cast_range = random.choice([0, 0, 0, 0, 1, 2]) if cast_range > 1 else 0
    aoe_radius = random.choice([0, 0, 0, 0, 1, 1, 2]) if action_type in ('attack', 'debuff') else 0

    # === 定语 (Attribute) ===
    damage_kind = random.choice(DAMAGE_KINDS)

    # === 状语 (Adverbial) ===
    attack_stat = random.choice(ATTACK_STATS)
    if action_type == 'heal':
        attack_stat = random.choice(['melee', 'ranged'])
    elif action_type == 'passive':
        attack_stat = random.choice(['melee', 'max'])

    height_bonus_per_diff = random.choice([0, 0, 0, 1, 1, 2])
    dice_type = random.choice(DICE_TYPES)
    success_line = {'1d4': 2, '1d6': 4, '1d8': 5, '2d6': 7, '1d10': 6}.get(dice_type, 4)
    is_manual_roll = random.random() < 0.15  # 15% 概率手动掷骰
    accuracy_mod = random.choice([0, 0, 0, 0, 1, 2, -1])
    evasion_mod = random.choice([0, 0, 0, 0, -1, -2])

    # === 补语 (Complement) ===
    if action_type == 'attack':
        base_damage = random.choice([5, 8, 10, 12, 15, 20])
    elif action_type == 'heal':
        base_damage = random.choice([5, 8, 10, 12, 15])
    else:
        base_damage = random.choice([0, 3, 5, 8])

    success_bonus_damage = random.choice([0, 0, 3, 5, 8]) if is_manual_roll else 0

    # 状态效果
    num_effects = random.choice([0, 0, 0, 1, 1, 2])
    status_effects = random.sample(STATUS_EFFECTS, min(num_effects, len(STATUS_EFFECTS))) if num_effects > 0 else []

    # 分类
    if action_type == 'passive':
        category = 'passive'
    elif action_type in ('heal', 'buff'):
        category = 'special'
    elif cast_range <= 1 and attack_stat == 'melee':
        category = 'melee'
    else:
        category = 'ranged'

    # 生成描述
    description = generate_description(action_type, name, damage_kind, cast_range, base_damage, status_effects, aoe_radius, dice_type, success_line)

    skill_key = generate_skill_key(name)

    return {
        skill_key: {
            "label": name,
            "category": category,
            "description": description,
            "target_filter": target_filter,
            "cast_range": cast_range,
            "aoe_radius": aoe_radius,
            "base_damage": base_damage,
            "status_effects": status_effects,
            "deterministic": True,
            "damage_kind": damage_kind,
            "min_cast_range": min_cast_range,
            "accuracy_mod": accuracy_mod,
            "evasion_mod": evasion_mod,
            "height_bonus_per_diff": height_bonus_per_diff,
            "action_type": action_type,
            "attack_stat": attack_stat,
            "requires_unmoved": requires_unmoved,
            "requires_stealth": requires_stealth,
            "dice_type": dice_type,
            "success_line": success_line,
            "success_bonus_damage": success_bonus_damage,
            "is_manual_roll": is_manual_roll,
        }
    }


def generate_description(action_type, name, damage_kind, cast_range, base_damage, status_effects, aoe_radius, dice_type, success_line):
    """生成技能描述文本"""
    dk_map = {
        'kinetic': '动能', 'beam': '光束', 'explosive': '爆炸',
        'corrosive': '腐蚀', 'thermal': '热熔'
    }
    dk_cn = dk_map.get(damage_kind, damage_kind)
    se_cn = {
        'burn': '燃烧', 'stun': '眩晕', 'disable': '缴械',
        'slow': '减速', 'poison': '中毒', 'freeze': '冻结'
    }

    parts = []

    if action_type == 'attack':
        parts.append(f'{dk_cn}属性攻击')
        parts.append(f'范围{cast_range}格')
        if base_damage > 0:
            parts.append(f'基础伤害{base_damage}')
        if aoe_radius > 0:
            parts.append(f'AOE溅射{aoe_radius}格')
    elif action_type == 'heal':
        parts.append(f'恢复{base_damage}点HP')
        parts.append(f'范围{cast_range}格')
    elif action_type == 'buff':
        parts.append(f'增益效果')
        parts.append(f'范围{cast_range}格')
        if base_damage > 0:
            parts.append(f'强化值+{base_damage}')
    elif action_type == 'debuff':
        parts.append(f'减益效果')
        parts.append(f'范围{cast_range}格')
        if aoe_radius > 0:
            parts.append(f'AOE溅射{aoe_radius}格')
    elif action_type == 'passive':
        parts.append('被动触发')

    if status_effects:
        effects_cn = [se_cn.get(e, e) for e in status_effects]
        parts.append(f'附加{"/".join(effects_cn)}')

    if dice_type and success_line:
        parts.append(f'骰子判定{dice_type}≥{success_line}')

    return '，'.join(parts)


def generate_batch(count: int = 5, action_type: str = None) -> dict:
    """批量生成技能"""
    skills = {}
    seen_names = set()

    for _ in range(count * 3):  # 最多尝试 3 倍数量避免重复
        skill = generate_skill(action_type)
        key = list(skill.keys())[0]
        name = skill[key]['label']
        if name not in seen_names:
            skills.update(skill)
            seen_names.add(name)
        if len(skills) >= count:
            break

    return skills


def print_skill_summary(skills: dict):
    """打印技能摘要"""
    print(f"\n{'='*60}")
    print(f"生成 {len(skills)} 个技能")
    print(f"{'='*60}")

    for key, skill in skills.items():
        at = skill['action_type']
        dk = skill['damage_kind']
        rng = f"{skill['min_cast_range']}~{skill['cast_range']}"
        aoe = f"AOE{skill['aoe_radius']}" if skill['aoe_radius'] else "单体"
        mrl = "掷骰判定" if skill['is_manual_roll'] else ""
        req = []
        if skill['requires_unmoved']:
            req.append('需未移动')
        if skill['requires_stealth']:
            req.append('需潜行')
        req_str = ' | '.join(req) if req else ''
        effects = skill.get('status_effects', [])
        eff_str = ','.join(effects) if effects else '无'

        print(f"\n  [{key}] {skill['label']}")
        print(f"    类型: {SKILL_LABELS.get(at, at)} | {dk} | {skill['attack_stat']}")
        print(f"    范围: {rng}格 | {aoe} | 目标: {skill['target_filter']}")
        print(f"    伤害: {skill['base_damage']} | 效果: {eff_str} | {mrl} {req_str}")
        print(f"    高地: ×{skill['height_bonus_per_diff']} | 命中: {skill['accuracy_mod']:+d} | 回避: {skill['evasion_mod']:+d}")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='AI 万能语法技能生成器 (Phase 11)')
    parser.add_argument('--count', type=int, default=5, help='生成数量 (默认 5)')
    parser.add_argument('--type', choices=ACTION_TYPES, default=None, help='限定动作类型')
    parser.add_argument('--output', type=str, default=None, help='输出文件路径')
    parser.add_argument('--summary', action='store_true', default=True, help='打印摘要')

    args = parser.parse_args()

    print(f"🧙 Phase 11.5: AI 万能语法技能生成器")
    print(f"   生成数量: {args.count}")
    print(f"   限定类型: {args.type or '随机'}")
    print(f"   生成规则: 主谓宾定状补 六维插槽")

    skills = generate_batch(args.count, args.type)

    if args.summary:
        print_skill_summary(skills)

    output_data = {
        "_meta": {
            "version": "5.0-ai-generated",
            "date": datetime.now().isoformat(),
            "generated_from": "Phase11.5 AI Skill Generator (万能语法)",
            "count": len(skills),
            "action_type_filter": args.type or "all",
        },
        "skills": skills,
    }

    if args.output:
        with open(args.output, 'w', encoding='utf-8') as f:
            json.dump(output_data, f, ensure_ascii=False, indent=2)
        print(f"\n✅ 已保存到: {args.output}")
    else:
        output_file = f"ai_generated_skills_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(output_data, f, ensure_ascii=False, indent=2)
        print(f"\n✅ 已保存到: {output_file}")

    print(f"\n💡 提示: 生成的技能文件可直接导入 GlossaryView 词条库")
    print(f"   导入方式: 复制 skills 字段内容到 glossary-skill-config.json")
