#!/usr/bin/env python3
"""
Phase 11.4: damage_kind 装备系统 (NewUnitEditorView.vue)
- 为每个装备槽位添加 damage_kind_modifiers 编辑
- 左手、右手、其它装备均可设置 5 种伤害类型抗性
"""
import re

BASE = '/root/original-project'

DAMAGE_KIND_MODIFIERS_TEMPLATE = '''
          <div class="dkm-section">
            <label class="dkm-title">damage_kind_modifiers (Phase 11)</label>
            <div class="dkm-grid">
              <div class="dkm-cell"><label>光束</label><input type="number" v-model.number="form.{prefix}_dkm_beam" step="0.1" min="-5" max="5" /></div>
              <div class="dkm-cell"><label>动能</label><input type="number" v-model.number="form.{prefix}_dkm_kinetic" step="0.1" min="-5" max="5" /></div>
              <div class="dkm-cell"><label>爆炸</label><input type="number" v-model.number="form.{prefix}_dkm_explosive" step="0.1" min="-5" max="5" /></div>
              <div class="dkm-cell"><label>腐蚀</label><input type="number" v-model.number="form.{prefix}_dkm_corrosive" step="0.1" min="-5" max="5" /></div>
              <div class="dkm-cell"><label>热熔</label><input type="number" v-model.number="form.{prefix}_dkm_thermal" step="0.1" min="-5" max="5" /></div>
            </div>
          </div>'''


def patch_unit_editor():
    path = f'{BASE}/frontend/src/views/NewUnitEditorView.vue'
    with open(path, 'r') as f:
        content = f.read()

    # 在左手、右手、其它装备的 SkillsEditor 之前插入 damage_kind_modifiers
    # 查找模式: SkillsEditor title="左手技能"
    slots = [
        ('left', '左手技能'),
        ('right', '右手技能'),
        ('extra', '其它技能'),
    ]

    for prefix, skills_title in slots:
        old_skills = f'SkillsEditor title="{skills_title}"'
        dkm_html = DAMAGE_KIND_MODIFIERS_TEMPLATE.format(prefix=prefix)
        new_skills = dkm_html + '\n          <' + old_skills
        if old_skills in content:
            content = content.replace(f'<{old_skills}', f'<{new_skills}')
            print(f'[OK] {prefix} 装备: 添加 damage_kind_modifiers')
        else:
            print(f'[WARN] {prefix} SkillsEditor 未找到，跳过')

    # 更新 createEmptyForm 添加 dkm 字段的默认值
    old_empty = 'function createEmptyForm() {'
    if old_empty in content:
        idx = content.find(old_empty)
        # 找到 return { 的位置
        return_idx = content.find('return {', idx)
        if return_idx > idx:
            new_fields = """
    // Phase 11: damage_kind_modifiers 默认值
    left_dkm_beam: 0, left_dkm_kinetic: 0, left_dkm_explosive: 0, left_dkm_corrosive: 0, left_dkm_thermal: 0,
    right_dkm_beam: 0, right_dkm_kinetic: 0, right_dkm_explosive: 0, right_dkm_corrosive: 0, right_dkm_thermal: 0,
    extra_dkm_beam: 0, extra_dkm_kinetic: 0, extra_dkm_explosive: 0, extra_dkm_corrosive: 0, extra_dkm_thermal: 0,
"""
            content = content[:return_idx+len('return {')] + new_fields + content[return_idx+len('return {'):]
            print('[OK] createEmptyForm: 添加 dkm 默认值')

    # 更新 form 初始化也加入这些字段
    old_default_form = 'form.value=createEmptyForm()'
    if old_default_form not in content:
        print('[WARN] createEmptyForm 调用未找到')

    # 添加 CSS
    old_css_end = '</style>'
    dkm_css = """
/* Phase 11: damage_kind_modifiers */
.dkm-section { margin-top: 8px; padding: 8px; background: rgba(0,0,0,0.15); border: 1px solid rgba(159,142,120,0.1); }
.dkm-title { font-size: 9px; color: rgba(255,176,0,0.5); letter-spacing: 1px; text-transform: uppercase; margin-bottom: 4px; display: block; }
.dkm-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; }
.dkm-cell { display: flex; flex-direction: column; align-items: center; }
.dkm-cell label { font-size: 8px; color: rgba(193,232,255,0.4); }
.dkm-cell input { width: 48px; padding: 2px 4px; background: rgba(0,0,0,0.3); border: 1px solid rgba(159,142,120,0.15); color: #c1e8ff; font-family: inherit; font-size: 10px; text-align: center; }
.dkm-cell input:focus { border-color: rgba(255,176,0,0.3); outline: none; }
</style>"""

    content = content.replace(old_css_end, dkm_css)

    with open(path, 'w') as f:
        f.write(content)
    print('[OK] NewUnitEditorView.vue: CSS + dkm 字段完成')


if __name__ == '__main__':
    print('=== Phase 11.4: damage_kind 装备系统 ===')
    patch_unit_editor()
    print('=== Phase 11.4 完成 ===')
