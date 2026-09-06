#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
切除 NewBattleView 中的旧 initCanvas/setupEvents/zoom 残留代码。
边界:
  - 切除 682-720 (initCanvas/centerGrid, line 721=drawBattleScene)
  - 保留 721-1065 (drawBattleScene)
  - 保留 1067-1132 (HexGridCanvas handlers, 含 onHexContextMenu)
  - 切除 1132-1326 (旧 setupEvents/getWorldPos/canvasPosToWorld/zoomIn/zoomOut/zoomReset)
  - 保留 1327+ (selectUnit 到 CSS)
"""

CUR = '/root/original-project/frontend/src/views/NewBattleView.vue'

with open(CUR, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# 找关键行号
draw_start = None       # function drawBattleScene
hex_handler_start = None
hex_handler_end = None  # function onHexContextMenu 结束后
unit_sel_start = None   # // ===== Unit Selection =====

for i, line in enumerate(lines):
    if 'function drawBattleScene' in line:
        draw_start = i
    if '// ===== HexGridCanvas 事件处理器 (替代' in line:
        hex_handler_start = i
    if hex_handler_start and 'function onHexContextMenu(' in line and i > hex_handler_start:
        # 找到 onHexContextMenu 的闭合 } 
        hex_handler_end = i  # 记录行号，后面找闭合
    if '// ===== Unit Selection =====' in line:
        unit_sel_start = i
        break

print(f'drawBattleScene: {draw_start}')
print(f'Hex handlers: {hex_handler_start}')

# 找 onHexContextMenu 函数结束 (闭合 })
on_hex_ctx_start = None
for i in range(hex_handler_start, len(lines)):
    if 'function onHexContextMenu(' in lines[i]:
        on_hex_ctx_start = i
        break

if on_hex_ctx_start:
    depth = 0
    for i in range(on_hex_ctx_start, len(lines)):
        depth += lines[i].count('{') - lines[i].count('}')
        if depth == 0:
            hex_handler_end = i + 1  # 闭合行的下一行
            break

print(f'onHexContextMenu ends at: {hex_handler_end}')
print(f'Unit Selection: {unit_sel_start}')

# 组装: 0-draw_start (不含initCanvas), drawBattleScene, Hex handlers, Unit Selection+
# 第一部分: 0 到 draw_start(不含) 但排除 initCanvas (682-720 都是 preamble)
# 实际上 0-681 是正确的 (template, imports, state, helpers)
# 682-720 应该删除

# 查找 682 附近实际开始的内容
init_start = None
for i in range(680, 730):
    if '// ===== Canvas Rendering' in lines[i] or 'const lastCol' in lines[i]:
        init_start = i
        break

print(f'initCanvas remnants start at: {init_start}')

if init_start and draw_start and hex_handler_end and unit_sel_start:
    result = (
        lines[:init_start]           # 0-init_start: template, imports, state, helpers
        + lines[draw_start:hex_handler_end]  # drawBattleScene + Hex handlers
        + lines[unit_sel_start:]     # Unit Selection → CSS
    )
    
    with open(CUR, 'w', encoding='utf-8') as f:
        f.writelines(result)
    
    print(f'清理完成: {len(result)} 行')
else:
    print(f'ERROR: 关键行号未找到 init={init_start} draw={draw_start} hh_end={hex_handler_end} unit={unit_sel_start}')
