#!/usr/bin/env python3
"""P12 manual fix: Insert pending-units upload into startBattle()"""
path = "/root/original-project/frontend/src/views/NewPreparationRoom.vue"
with open(path, "r") as f:
    content = f.read()

old = """  localStorage.setItem('selectedUnitIds', JSON.stringify(selectedIds.value))
    localStorage.setItem('factionRoles', JSON.stringify({...factionRoles}))
    localStorage.setItem('aceSelections', JSON.stringify({...aceSelections}))
  let battleId = room.value?.room?.battle_id || room.value?.battle_id
  if (roomId) {"""

new = """  localStorage.setItem('selectedUnitIds', JSON.stringify(selectedIds.value))
    localStorage.setItem('factionRoles', JSON.stringify({...factionRoles}))
    localStorage.setItem('aceSelections', JSON.stringify({...aceSelections}))
  let battleId = room.value?.room?.battle_id || room.value?.battle_id

  // P12: 将选中的棋子完整数据传给后端部署池
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

  if (roomId) {"""

if old in content:
    content = content.replace(old, new)
    print("P12: startBattle() 已增加 pending-units API 调用")
else:
    print("P12 ERROR: 模式未匹配")

with open(path, "w") as f:
    f.write(content)
