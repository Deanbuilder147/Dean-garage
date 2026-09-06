#!/usr/bin/env python3
"""
P13: NewBattleView - 从后端 API 拉取部署池 + 部署时传完整棋子数据

修改:
1. loadDeployPool() - 优先从 GET /api/combat/:id/deploy-pool 获取部署池
   失败时 fallback 到 localStorage + hangarAPI 的原有逻辑
2. deployToHex() - 部署时附带 unit_data（完整棋子快照），
   后端不再需要调用格纳库服务
"""

path = '/root/original-project/frontend/src/views/NewBattleView.vue'

with open(path, 'r') as f:
    content = f.read()

print(f"原始文件大小: {len(content)} chars")

# ============================================================
# Fix 1: 修改 loadDeployPool() - 优先使用后端 deploy-pool API
# ============================================================

# 匹配 loadDeployPool 函数的开头
old_pool_start = """async function loadDeployPool() {
  console.log('[loadDeployPool] 开始加载棋子数据...')
  try {
    const res = await hangarAPI.getUnits()
    const allUnits = res.data?.units || res.data || []
    console.log('[loadDeployPool] API返回棋子数:', allUnits.length)"""

new_pool_start = """async function loadDeployPool() {
  console.log('[loadDeployPool] 从后端拉取部署池...')

  // 优先使用后端部署池 API（解决 localStorage 依赖 + 格纳库 401 问题）
  try {
    const token = localStorage.getItem('token')
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {}
    const poolRes = await fetch(`/api/combat/${route.params.id}/deploy-pool`, { headers })
    if (poolRes.ok) {
      const poolData = await poolRes.json()
      if (poolData.units && poolData.units.length > 0) {
        deployPool.value = poolData.units
        console.log('[loadDeployPool] 后端部署池返回棋子数:', deployPool.value.length)
        return
      }
    }
    console.log('[loadDeployPool] 后端部署池为空，回退到 hangar API')
  } catch (e) {
    console.warn('[loadDeployPool] 部署池API不可用，回退到 hangar API:', e.message || e)
  }

  // Fallback: localStorage + hangarAPI
  console.log('[loadDeployPool] 使用 localStorage + hangar API fallback')
  try {
    const res = await hangarAPI.getUnits()
    const allUnits = res.data?.units || res.data || []
    console.log('[loadDeployPool] API返回棋子数:', allUnits.length)"""

if old_pool_start in content:
    content = content.replace(old_pool_start, new_pool_start)
    print("✓ loadDeployPool() 已改为优先使用后端 deploy-pool API")
else:
    # 备选匹配：可能的变体（如没有 console.log 前缀或略有不同的格式）
    old_pool_v2 = """async function loadDeployPool() {
  console.log('[loadDeployPool] 开始加载棋子数据...')
  try {
    const res = await hangarAPI.getUnits()
    const allUnits = res.data?.units || res.data || []"""

    if old_pool_v2 in content:
        content = content.replace(old_pool_v2, new_pool_start)
        print("✓ loadDeployPool() 已改为优先使用后端 deploy-pool API（v2）")
    else:
        # 尝试匹配更灵活的模式
        import re
        pool_pattern = r'async function loadDeployPool\(\)\s*\{[^}]*try\s*\{[^}]*hangarAPI\.getUnits\(\)'
        if re.search(pool_pattern, content, re.DOTALL):
            print("  ℹ 找到 loadDeployPool 但格式略有不同，尝试部分替换...")
            # 匹配 hangarAPI.getUnits 并在此之前插入 API 调用
            get_units_call = 'const res = await hangarAPI.getUnits()'
            if get_units_call in content:
                pre_call = """  // 优先尝试后端部署池 API
  try {
    const token = localStorage.getItem('token')
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {}
    const poolRes = await fetch(`/api/combat/${route.params.id}/deploy-pool`, { headers })
    if (poolRes.ok) {
      const poolData = await poolRes.json()
      if (poolData.units && poolData.units.length > 0) {
        deployPool.value = poolData.units
        console.log('[loadDeployPool] 后端部署池返回棋子数:', deployPool.value.length)
        return
      }
    }
  } catch (e) {
    console.warn('[loadDeployPool] 部署池API不可用，回退到 hangar API:', e.message || e)
  }

  // Fallback:
  """
                content = content.replace(get_units_call, pre_call + get_units_call)
                print("✓ 在 hangarAPI.getUnits 前插入了 deploy-pool API 调用")
            else:
                print("✗ 未找到 hangarAPI.getUnits() 调用")
        else:
            print("✗ 未找到 loadDeployPool 函数，请手动检查")

# ============================================================
# Fix 2: 修改 deployToHex() - 部署时附带 unit_data
# ============================================================

old_deploy_call = "await combatAPI.deployUnit(route.params.id, { unit_id: unit.id, q, r })"
new_deploy_call = "await combatAPI.deployUnit(route.params.id, { unit_id: unit.id, q, r, unit_data: unit })"

if old_deploy_call in content:
    content = content.replace(old_deploy_call, new_deploy_call)
    print("✓ deployToHex() 部署时附带 unit_data（完整棋子快照）")
else:
    # 备选：可能有空格差异
    old_deploy_v2 = "await combatAPI.deployUnit(route.params.id, { unit_id: unit.id, q, r });"
    if old_deploy_v2 in content:
        new_deploy_v2 = "await combatAPI.deployUnit(route.params.id, { unit_id: unit.id, q, r, unit_data: unit });"
        content = content.replace(old_deploy_v2, new_deploy_v2)
        print("✓ deployToHex() 部署时附带 unit_data（v2匹配）")
    else:
        print("✗ 未找到 deployUnit 调用，尝试搜索...")
        if 'combatAPI.deployUnit' in content:
            # 尝试定位所有 deployUnit 调用
            import re
            matches = list(re.finditer(r'combatAPI\.deployUnit\([^)]+\)', content))
            if matches:
                for m in matches:
                    call = m.group()
                    if 'unit_data' not in call and 'unit_id' in call:
                        # 在 ) 前插入 , unit_data: unit
                        new_call = call.replace(')', ', unit_data: unit)')
                        content = content.replace(call, new_call)
                        print(f"  ✓ 修复了一个 deployUnit 调用: {call[:60]}...")
            else:
                print("  ✗ 无法匹配 deployUnit 调用模式")
        else:
            print("  ✗ 未找到 combatAPI.deployUnit")

with open(path, 'w') as f:
    f.write(content)

print(f"\n修改后文件大小: {len(content)} chars")
print("P13: NewBattleView 部署池 + 自包含部署 完成")
