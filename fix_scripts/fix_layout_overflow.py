#!/usr/bin/env python3
"""
修复1: NewBattleView.vue - 布局溢出（下边栏+右侧栏不可见）
  根因: .dm-main { flex: 1 } 无 min-width: 0，flex 默认 min-width: auto
  阻止收缩，canvas 2354px 撑爆容器 → 右侧面板 200px 被挤出视口，
  底部 faction-boxes 跟随溢出不可见。
  修复: .dm-main 添加 min-width: 0; min-height: 0

修复2: NewBattlefieldView.vue - 编辑器无法拖拽
  根因: .main-content 无 min-width: 0 / overflow: hidden，
  canvas 大尺寸导致页面水平溢出，产生横向滚动，event 坐标映射偏移，
  鼠标事件与 canvas 像素坐标系失配。
  修复: .main-content 添加 min-width: 0; width: 100%; overflow: hidden
"""

FILES = {
    'bv': '/root/original-project/frontend/src/views/NewBattleView.vue',
    'bf': '/root/original-project/frontend/src/views/NewBattlefieldView.vue',
}

# ==================== Fix 1: NewBattleView .dm-main ====================
with open(FILES['bv'], 'r') as f:
    bv = f.read()

old_dm_main = '.dm-main { flex: 1; overflow: hidden; position: relative; display: flex; flex-direction: column; }'
new_dm_main = '.dm-main { flex: 1; min-width: 0; min-height: 0; overflow: hidden; position: relative; display: flex; flex-direction: column; }'
bv = bv.replace(old_dm_main, new_dm_main)
print(f'[bv] .dm-main: added min-width:0; min-height:0')

with open(FILES['bv'], 'w') as f:
    f.write(bv)

# ==================== Fix 2: NewBattlefieldView .main-content ====================
with open(FILES['bf'], 'r') as f:
    bf = f.read()

old_main_content = '.main-content { padding: 32px 24px 90px; max-width: 100%; display: flex; flex-direction: column; height: 100vh; }'
new_main_content = '.main-content { padding: 32px 24px 90px; width: 100%; max-width: 100%; min-width: 0; display: flex; flex-direction: column; height: 100vh; overflow: hidden; }'
bf = bf.replace(old_main_content, new_main_content)
print(f'[bf] .main-content: added min-width:0; width:100%; overflow:hidden')

with open(FILES['bf'], 'w') as f:
    f.write(bf)

print('\n=== All fixes applied ===')
