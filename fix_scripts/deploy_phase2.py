#!/usr/bin/env python3
"""
Phase 2 部署脚本:
1. 备份原始文件
2. 补丁 HexGridCanvas.vue (isoShearX/isoShearY props)
3. 替换 NewBattlefieldView.vue (重构版)
4. 验证关键检查点
"""
import shutil, os, sys

BASE = '/root/original-project/frontend/src'

# ======== Step 0: 备份 ========
backup_dir = '/root/original-project/frontend/backups/20260619-phase2'
os.makedirs(backup_dir, exist_ok=True)

for fname in ['components/HexGridCanvas.vue', 'views/NewBattlefieldView.vue']:
    src = os.path.join(BASE, fname)
    dst = os.path.join(backup_dir, os.path.basename(fname))
    if os.path.exists(src):
        shutil.copy2(src, dst)
        print(f"✓ 备份: {fname} → {dst}")

# ======== Step 1: HexGridCanvas 补丁 ========
# (已由 patch_hexgridcanvas_iso.py 在之前执行)
# 这里只做验证
hgc_path = os.path.join(BASE, 'components/HexGridCanvas.vue')
with open(hgc_path, 'r') as f:
    hgc_text = f.read()

hgc_checks = [
    'import { ref, reactive,',
    'isoShearX: { type: Number',
    'isoShearY: { type: Number',
    'const ISO = reactive({ ...ISO_DEFAULTS })',
    "watch(() => props.isoShearX",
    "watch(() => props.isoShearY",
]
for c in hgc_checks:
    if c not in hgc_text:
        print(f"❌ HexGridCanvas 补丁验证失败: {c}")
        sys.exit(1)
print(f"✓ HexGridCanvas 补丁验证通过 ({len(hgc_text.splitlines())} 行)")

# ======== Step 2: NewBattlefieldView 替换 ========
refactored_path = '/tmp/NewBattlefieldView_refactored.vue'
target_path = os.path.join(BASE, 'views/NewBattlefieldView.vue')

if not os.path.exists(refactored_path):
    print(f"❌ 找不到重构文件: {refactored_path}")
    sys.exit(1)

with open(refactored_path, 'r') as f:
    new_content = f.read()

with open(target_path, 'w', encoding='utf-8') as f:
    f.write(new_content)

print(f"✓ NewBattlefieldView.vue 已替换 ({len(new_content.splitlines())} 行)")

# ======== Step 3: 验证 NewBattlefieldView ========
BAD = [
    ('let canvas', 'let canvas 声明'),
    ('let ctx', 'let ctx 声明'),
    ('canvasWrapper', 'canvasWrapper ref'),
    ('canvasContainer', 'canvasContainer ref'),
    ('function initCanvas(', 'initCanvas'),
    ('function setupEvents(', 'setupEvents'),
    ('function getWorldPos(', 'getWorldPos'),
    ('function centerGridOnCanvas(', 'centerGridOnCanvas'),
    ('function zoomIn(', 'zoomIn fn'),
    ('function zoomOut(', 'zoomOut fn'),
    ('function zoomReset(', 'zoomReset fn'),
    ("canvas = document.createElement('canvas')", "createElement canvas"),
    ('c.addEventListener', '原生 addEventListener'),
    ('c.style.cursor', '原生 cursor 设置'),
    ('let isDragging', 'isDragging let'),
    ('let _windowDragMove', '_windowDragMove let'),
    ('offsetX.value', '裸 offsetX.value'),
    ('offsetY.value', '裸 offsetY.value'),
    ('scale.value', '裸 scale.value'),
]

GOOD = [
    'import HexGridCanvas',
    'const hexGrid = ref(null)',
    'function editorDrawFn',
    'function onHexClick',
    'function onHexHover',
    'function onHexContextMenu',
    'function selectBrush',
    'function adjustSpacing',
    'function resetSpacing',
    'function saveMap',
    'function exportJSON',
    'onMounted(async',
    'hexGrid.value?.redraw()',
    'hexGrid?.zoomIn()',
    'hexGrid?.zoomOut()',
    'hexGrid?.zoomReset()',
    '<HexGridCanvas',
    'mode="edit"',
    '@hex-click=',
    '@hex-hover=',
    '@hex-contextmenu=',
    ':iso-shear-x=',
    ':iso-shear-y=',
    'v-model.number="isoShearX"',
    'v-model.number="isoShearY"',
    '<style scoped>',
    '</style>',
]

errors = []
for s, desc in BAD:
    if s in new_content:
        errors.append(f'  ❌ 残留: {desc}')

for s in GOOD:
    if s not in new_content:
        errors.append(f'  ❌ 缺失: {s}')

# 特殊检查: canvasWrapperCanvas 字样不应存在
if 'canvasWrapper' in new_content and 'ref="canvasWrapper"' in new_content:
    errors.append('  ❌ 残留: canvasWrapper ref')

opens = new_content.count('{')
closes = new_content.count('}')
if opens != closes:
    errors.append(f'  ⚠️ 括号不匹配: {{{opens}/{closes}}}')

if errors:
    print(f'验证: {len(errors)} 个问题')
    for e in errors:
        print(e)
    sys.exit(1)

print(f'✅ NewBattlefieldView.vue 全部验证通过!')
print(f'   行数: {len(new_content.splitlines())}')
print(f'   括号: {opens}/{closes} ✓')
print(f'   BAD 检查: {len(BAD)} 项全部清除')
print(f'   GOOD 检查: {len(GOOD)} 项全部存在')
