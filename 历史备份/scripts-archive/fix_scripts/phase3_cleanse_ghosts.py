#!/usr/bin/env python3
"""
代码清道夫模式：全站技术考古与前任幽灵死代码全面肃清
Phase: Cleanse Ghosts
目标：清除海豹骰子/NDN残留的掷骰描述，以及不符合2.0战棋宪法标准的冗余代码
"""
import re
import sys
import os
from pathlib import Path

FILES = {
    'skills_editor': '/root/original-project/frontend/src/components/SkillsEditor.vue',
    'new_battle_view': '/root/original-project/frontend/src/views/NewBattleView.vue',
}

FIXES_APPLIED = []
FIXES_SKIPPED = []

def apply_replace(filepath, name, old, new, desc):
    """安全替换：先读文件确认 old 存在"""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    if old not in content:
        FIXES_SKIPPED.append(f"{filepath}::{name} - 未找到匹配文本，跳过")
        print(f"  ⚠ SKIP: {desc} — 模式未匹配")
        return False

    content = content.replace(old, new)
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

    FIXES_APPLIED.append((filepath, name, desc))
    print(f"  ✅ {desc}")
    return True


def main():
    print("=" * 60)
    print("代码清道夫模式：全站肃清")
    print("=" * 60)

    # ================================================================
    # [1] SkillsEditor.vue — 扫射 掷骰描述
    # ================================================================
    fp = FILES['skills_editor']
    apply_replace(
        fp, 'sweep-dice',
        "'扫射': '不进行机动值判定，掷骰决定效果: 1~3：精准命中，单体攻击，但造成伤害-2。4~6：对范围内的所有目标进行攻击，伤害由所有目标均摊'",
        "'扫射': '扇形2格范围攻击，不进行机动值判定。精准命中单体造成伤害-2，范围攻击伤害由所有目标均摊'",
        "SkillsEditor 扫射技能：移除掷骰判定描述，改为确定性效果说明"
    )

    # ================================================================
    # [2] NewBattleView.vue — 奇袭 掷骰描述
    # ================================================================
    fp = FILES['new_battle_view']
    apply_replace(
        fp, 'surprise-dice',
        "{ key: 'surprise', icon: '🗡', label: '奇袭', desc: '敌方攻击时可跳过下回合：顶替攻击 / 先制进攻(掷骰判定)，全员可用' }",
        "{ key: 'surprise', icon: '🗡', label: '奇袭', desc: '敌方攻击时触发先制进攻：跳过敌方回合并以70%攻击力反击，全员可用' }",
        "NewBattleView 奇袭技能：移除掷骰判定描述，改为确定性效果说明"
    )

    # ================================================================
    # [3] 验证结果
    # ================================================================
    print("\n" + "=" * 60)
    print("肃清结果汇总")
    print("=" * 60)
    print(f"已应用补丁: {len(FIXES_APPLIED)}")
    for fp, name, desc in FIXES_APPLIED:
        print(f"  ✅ [{name}] {desc}")
    print(f"跳过: {len(FIXES_SKIPPED)}")
    for s in FIXES_SKIPPED:
        print(f"  ⚠ {s}")

    return 0 if FIXES_APPLIED else 1


if __name__ == '__main__':
    sys.exit(main())
