#!/usr/bin/env python3
"""
P12: NewPreparationRoom - 开始战斗时将完整棋子快照传给后端

修改 startBattle() 函数:
- 选中棋子后，调用 POST /api/combat/:battleId/pending-units
- 将 complete unit data (从 availableUnits 过滤) 传给后端
- 这样战斗页面可以直接从后端拉取部署池，不再依赖 localStorage + hangarAPI
"""

path = '/root/original-project/frontend/src/views/NewPreparationRoom.vue'

with open(path, 'r') as f:
    content = f.read()

print(f"原始文件大小: {len(content)} chars")

# ============================================================
# Fix: 修改 startBattle() - try 块中增加 pending-units API 调用
# ============================================================

# 匹配: localStorage.setItem('selectedUnitIds' ...) 这一行所在位置
# 在这一行之后插入 API 调用

old_localstorage = """    // Save selected unit IDs for battle page to filter deployPool
    localStorage.setItem('selectedUnitIds', JSON.stringify(selectedIds.value))
    const battleId = room.value?.room?.battle_id || room.value?.battle_id
    await commAPI.sendMessage(roomId, { type: 'start', units: selectedIds.value })"""

new_with_upload = """    // Save selected unit IDs for battle page to filter deployPool
    localStorage.setItem('selectedUnitIds', JSON.stringify(selectedIds.value))
    const battleId = room.value?.room?.battle_id || room.value?.battle_id

    // 将选中的棋子完整数据传给后端部署池
    try {
      const selectedUnits = availableUnits.value.filter(u => selectedIds.value.includes(u.id))
      const token = localStorage.getItem('token')
      await fetch(`/api/combat/${battleId}/pending-units`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({ units: selectedUnits })
      })
      console.log(`[startBattle] 已上传 ${selectedUnits.length} 个棋子到后端部署池`)
    } catch (e) {
      console.warn('[startBattle] 部署池上传失败（将回退到 localStorage）:', e.message)
    }

    await commAPI.sendMessage(roomId, { type: 'start', units: selectedIds.value })"""

if old_localstorage in content:
    content = content.replace(old_localstorage, new_with_upload)
    print("✓ startBattle() try 块已增加 pending-units API 调用")
else:
    # 备选：匹配不带注释的版本
    old_simple = """    localStorage.setItem('selectedUnitIds', JSON.stringify(selectedIds.value))
    const battleId = room.value?.room?.battle_id || room.value?.battle_id
    await commAPI.sendMessage(roomId, { type: 'start', units: selectedIds.value })"""
    
    if old_simple in content:
        content = content.replace(old_simple, new_with_upload)
        print("✓ startBattle() try 块已增加 pending-units API 调用（v2匹配）")
    else:
        print("✗ 未找到 startBattle() try 块，尝试匹配 core pattern...")
        # 尝试匹配仅 battleId 行
        core = 'const battleId = room.value?.room?.battle_id || room.value?.battle_id'
        if core in content:
            print(f"  找到 battleId 引用: {content.count(core)} 处")
            # 找到 try 块中的那一个（第一个）
            idx = content.find(core)
            
            # 在 battleId 行和 sendMessage 行之间插入
            send_msg = 'await commAPI.sendMessage(roomId, { type: \'start\', units: selectedIds.value })'
            if send_msg in content:
                insert_code = """    // 将选中的棋子完整数据传给后端部署池
    try {
      const selectedUnits = availableUnits.value.filter(u => selectedIds.value.includes(u.id))
      const token = localStorage.getItem('token')
      await fetch(`/api/combat/${battleId}/pending-units`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({ units: selectedUnits })
      })
      console.log(`[startBattle] 已上传 ${selectedUnits.length} 个棋子到后端部署池`)
    } catch (e) {
      console.warn('[startBattle] 部署池上传失败（将回退到 localStorage）:', e.message)
    }

    """
                content = content.replace(send_msg, insert_code + send_msg)
                print("✓ 在 sendMessage 前插入了 pending-units API 调用")
            else:
                print("✗ 未找到 sendMessage 调用")
        else:
            print("✗ 未找到 battleId 定义，请手动检查 NewPreparationRoom.vue")

# ============================================================
# Fix 2: 同样在 catch 块中添加（如果有）
# ============================================================

# 匹配 catch 块中的 localStorage.setItem
old_catch = """    localStorage.setItem('selectedUnitIds', JSON.stringify(selectedIds.value))
    const battleId = room.value?.room?.battle_id || room.value?.battle_id
    router.push(battleId ? `/battle/${battleId}` : '/battle/1')"""

new_catch = """    localStorage.setItem('selectedUnitIds', JSON.stringify(selectedIds.value))
    const battleId = room.value?.room?.battle_id || room.value?.battle_id
    // 尝试上传部署池（catch 中尽力而为）
    try {
      const selectedUnits = availableUnits.value.filter(u => selectedIds.value.includes(u.id))
      const token = localStorage.getItem('token')
      await fetch(`/api/combat/${battleId}/pending-units`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({ units: selectedUnits })
      })
    } catch (_) {}
    router.push(battleId ? `/battle/${battleId}` : '/battle/1')"""

if old_catch in content:
    # 只替换第二次出现（catch 块中的那个）
    # 用 count 来判断
    count = content.count(old_catch)
    if count >= 2:
        first_idx = content.find(old_catch)
        second_idx = content.find(old_catch, first_idx + len(old_catch))
        content = content[:second_idx] + new_catch + content[second_idx + len(old_catch):]
        print("✓ startBattle() catch 块也增加了 pending-units API 调用")
    elif count == 1:
        print("  ℹ catch 块与 try 块完全相同，可能已被替换")
    else:
        print("  ℹ 未找到独立的 catch 块 localStorage 调用")
else:
    print("  ℹ 未找到 catch 块模式（可能已被替换或结构不同）")

with open(path, 'w') as f:
    f.write(content)

print(f"\n修改后文件大小: {len(content)} chars")
print("P12: NewPreparationRoom 上传部署池 完成")
