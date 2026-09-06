#!/usr/bin/env python3
"""修复 zoom 按钮和 overlay 闭合标签"""
content = open('/root/original-project/frontend/src/views/NewBattleView.vue', 'r', encoding='utf-8').read()

# Fix zoom buttons (without parentheses in original)
content = content.replace('@click="zoomIn"', '@click="hexGrid?.zoomIn()"')
content = content.replace('@click="zoomOut"', '@click="hexGrid?.zoomOut()"')
content = content.replace('@click="zoomReset"', '@click="hexGrid?.zoomReset()"')

# Fix overlay closing
content = content.replace(
    '        </div>\n      </div>\n\n      <!-- Faction Boxes',
    '        </div>\n        </template>\n      </HexGridCanvas>\n\n      <!-- Faction Boxes'
)

open('/root/original-project/frontend/src/views/NewBattleView.vue', 'w', encoding='utf-8').write(content)
print(f'Fixed: {len(content.splitlines())} lines')
