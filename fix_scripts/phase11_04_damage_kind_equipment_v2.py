#!/usr/bin/env python3
"""
Phase 11.4 v2: damage_kind 装备系统 (修复版)
"""
BASE = '/root/original-project'

DKM_TEMPLATES = {
    'left': '''          <SkillsEditor v-if="form.left_type !== 'none'" title="左手技能"''',
    'right': '''          <SkillsEditor v-if="form.right_type !== 'none'" title="右手技能"''',
    'extra': '''          <SkillsEditor v-if="form.extra_type !== 'none'" title="其它技能"''',
}

DKM_INSERT = '''          <div v-if="form.{prefix}_type !== 'none'" class="dkm-section">
            <label class="dkm-title">damage_kind_modifiers (Phase 11)</label>
            <div class="dkm-grid">
              <div class="dkm-cell"><label>光束</label><input type="number" v-model.number="form.{prefix}_dkm_beam" step="0.1" min="-5" max="5" /></div>
              <div class="dkm-cell"><label>动能</label><input type="number" v-model.number="form.{prefix}_dkm_kinetic" step="0.1" min="-5" max="5" /></div>
              <div class="dkm-cell"><label>爆炸</label><input type="number" v-model.number="form.{prefix}_dkm_explosive" step="0.1" min="-5" max="5" /></div>
              <div class="dkm-cell"><label>腐蚀</label><input type="number" v-model.number="form.{prefix}_dkm_corrosive" step="0.1" min="-5" max="5" /></div>
              <div class="dkm-cell"><label>热熔</label><input type="number" v-model.number="form.{prefix}_dkm_thermal" step="0.1" min="-5" max="5" /></div>
            </div>
          </div>
'''


def patch_unit_editor():
    path = f'{BASE}/frontend/src/views/NewUnitEditorView.vue'
    with open(path, 'r') as f:
        content = f.read()

    # 在每个 SkillsEditor 之前插入 DKM
    for prefix, match_str in DKM_TEMPLATES.items():
        if match_str in content:
            dkm_html = DKM_INSERT.format(prefix=prefix)
            content = content.replace(match_str, dkm_html + match_str)
            print(f'[OK] {prefix} 装备: 添加 damage_kind_modifiers')
        else:
            print(f'[WARN] {prefix} SkillsEditor 未找到，跳过')

    # CSS
    old_css_end = '</style>'
    dkm_css = """
/* Phase 11: damage_kind_modifiers */
.dkm-section { margin-top: 6px; padding: 6px 8px; background: rgba(0,0,0,0.15); border: 1px solid rgba(159,142,120,0.1); }
.dkm-title { font-size: 8px; color: rgba(255,176,0,0.45); letter-spacing: 1px; text-transform: uppercase; margin-bottom: 3px; display: block; }
.dkm-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 3px; }
.dkm-cell { display: flex; flex-direction: column; align-items: center; }
.dkm-cell label { font-size: 7px; color: rgba(193,232,255,0.35); }
.dkm-cell input { width: 44px; padding: 2px 3px; background: rgba(0,0,0,0.3); border: 1px solid rgba(159,142,120,0.12); color: #c1e8ff; font-family: inherit; font-size: 9px; text-align: center; }
.dkm-cell input:focus { border-color: rgba(255,176,0,0.25); outline: none; }
</style>"""

    content = content.replace(old_css_end, dkm_css)

    with open(path, 'w') as f:
        f.write(content)
    print('[OK] NewUnitEditorView.vue: dkm 字段 + CSS 完成')

    # 验证
    for prefix in ['left', 'right', 'extra']:
        if f'{prefix}_dkm_beam' in content:
            print(f'[VERIFY] {prefix}_dkm_beam 已注入')
        else:
            print(f'[VERIFY WARN] {prefix}_dkm_beam 未找到!')


if __name__ == '__main__':
    print('=== Phase 11.4 v2: damage_kind 装备系统 ===')
    patch_unit_editor()
    print('=== Phase 11.4 v2 完成 ===')
