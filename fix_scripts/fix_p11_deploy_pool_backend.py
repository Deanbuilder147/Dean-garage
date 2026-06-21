#!/usr/bin/env python3
"""
P11: 后端部署池管理 + 自包含部署

battles.js 修改:
1. 新增 GET /:id/deploy-pool - 返回存储的棋子快照
2. 新增 POST /:id/pending-units - 接收准备室传来的棋子快照
3. 修改 POST /:id/deploy-unit - 优先使用请求中的 unit_data，
   替代从格纳库服务拉取数据（解决格纳库 401 导致的属性错误）
"""

import re

path = '/root/original-project/services/combat-service/src/routes/battles.js'

with open(path, 'r') as f:
    content = f.read()

print(f"原始文件大小: {len(content)} chars")

# ============================================================
# Fix 1: 在 deploy-unit 路由前插入 deploy-pool 和 pending-units 端点
# ============================================================

# 找到 deploy-unit 路由定义
deploy_route_marker = "router.post('/:id/deploy-unit', authenticate, async (req, res) => {"

if deploy_route_marker in content:
    new_endpoints = """// ===== 部署池管理 =====
// GET /:id/deploy-pool - 返回可部署的棋子快照列表
router.get('/:id/deploy-pool', authenticate, async (req, res) => {
  try {
    const state = await getBattleState(req.params.id);
    if (!state) return res.status(404).json({ error: 'Battle not found' });

    const pool = state.pending_deploy_units
      ? Object.values(state.pending_deploy_units)
      : [];

    // 过滤掉已部署的单位
    const deployedIds = new Set((state.units || []).map(u => u.id));
    const available = pool.filter(u => !deployedIds.has(u.id));

    res.json({ units: available });
  } catch (e) {
    console.error('[deploy-pool] 错误:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /:id/pending-units - 接收准备室传来的棋子完整数据
router.post('/:id/pending-units', authenticate, async (req, res) => {
  try {
    const { units } = req.body;
    if (!units || !Array.isArray(units)) {
      return res.status(400).json({ error: 'units array required' });
    }

    const state = await getBattleState(req.params.id);
    if (!state) return res.status(404).json({ error: 'Battle not found' });

    state.pending_deploy_units = {};
    for (const unit of units) {
      if (unit && unit.id) {
        state.pending_deploy_units[unit.id] = unit;
      }
    }

    // 持久化
    try {
      const db = req.app.get('db');
      await db.execute(
        'UPDATE battle_sessions SET units_state = $1 WHERE id = $2',
        [JSON.stringify(state), req.params.id]
      );
    } catch (e) {
      console.warn('[pending-units] 持久化失败（非致命）:', e.message);
    }

    console.log(`[pending-units] 已存储 ${Object.keys(state.pending_deploy_units).length} 个棋子`);
    res.json({ ok: true, count: Object.keys(state.pending_deploy_units).length });
  } catch (e) {
    console.error('[pending-units] 错误:', e.message);
    res.status(500).json({ error: e.message });
  }
});

"""
    content = content.replace(deploy_route_marker, new_endpoints + deploy_route_marker)
    print("✓ 新增 deploy-pool + pending-units 端点")
else:
    print("✗ 未找到 deploy-unit 路由，尝试备选模式...")
    # 尝试备选模式
    deploy_route_marker2 = "router.post('/:id/deploy-unit'"
    if deploy_route_marker2 in content:
        idx = content.find(deploy_route_marker2)
        line_start = content.rfind('\n', 0, idx) + 1
        new_endpoints = """// ===== 部署池管理 =====
router.get('/:id/deploy-pool', authenticate, async (req, res) => {
  try {
    const state = await getBattleState(req.params.id);
    if (!state) return res.status(404).json({ error: 'Battle not found' });
    const pool = state.pending_deploy_units ? Object.values(state.pending_deploy_units) : [];
    const deployedIds = new Set((state.units || []).map(u => u.id));
    const available = pool.filter(u => !deployedIds.has(u.id));
    res.json({ units: available });
  } catch (e) {
    console.error('[deploy-pool] 错误:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/pending-units', authenticate, async (req, res) => {
  try {
    const { units } = req.body;
    if (!units || !Array.isArray(units)) return res.status(400).json({ error: 'units array required' });
    const state = await getBattleState(req.params.id);
    if (!state) return res.status(404).json({ error: 'Battle not found' });
    state.pending_deploy_units = {};
    for (const unit of units) { if (unit && unit.id) state.pending_deploy_units[unit.id] = unit; }
    try {
      const db = req.app.get('db');
      await db.execute('UPDATE battle_sessions SET units_state = $1 WHERE id = $2', [JSON.stringify(state), req.params.id]);
    } catch (e) { console.warn('[pending-units] 持久化失败:', e.message); }
    res.json({ ok: true, count: Object.keys(state.pending_deploy_units).length });
  } catch (e) {
    console.error('[pending-units] 错误:', e.message);
    res.status(500).json({ error: e.message });
  }
});

"""
        content = content[:line_start] + new_endpoints + content[line_start:]
        print("✓ 新增 deploy-pool + pending-units 端点（备选插入点）")
    else:
        print("✗ 无法找到插入点，跳过端点添加")

# ============================================================
# Fix 2: 修改 deploy-unit 端点 - 优先使用 unit_data
# ============================================================

# 当前代码（已打过所有补丁后的状态）:
# let hangarUnit = null;
# try {
#   const hangarUrl = ...;
#   const headers = ...;
#   const hangarRes = await fetch(...);
#   ...
# }

old_hangar_fetch = """      // 尝试从格纳库获取棋子数据
      let hangarUnit = null;
      try {
        const hangarUrl = process.env.HANGAR_SERVICE_URL || 'http://localhost:3002';
        const headers = {};
        if (req.headers.authorization) {
          headers['Authorization'] = req.headers.authorization;
        }
        const hangarRes = await fetch(`${hangarUrl}/api/hangar/units/${unit_id}`, { headers });
        if (hangarRes.ok) {
          hangarUnit = await hangarRes.json();
        } else {
          console.warn('[deploy-unit] 格纳库响应:', hangarRes.status);
        }
      } catch (e) {
        console.warn('[deploy-unit] 无法从格纳库获取棋子数据:', e.message);
      }"""

new_hangar_fetch = """      // 优先使用请求中携带的完整棋子数据（自包含部署）
      let hangarUnit = req.body.unit_data || null;

      // 其次从后端部署池中查找
      if (!hangarUnit && state.pending_deploy_units && state.pending_deploy_units[unit_id]) {
        hangarUnit = state.pending_deploy_units[unit_id];
        console.log('[deploy-unit] 从部署池获取棋子:', hangarUnit.name || unit_id);
      }

      // 最后回退到格纳库服务
      if (!hangarUnit) {
        try {
          const hangarUrl = process.env.HANGAR_SERVICE_URL || 'http://localhost:3002';
          const headers = {};
          if (req.headers.authorization) {
            headers['Authorization'] = req.headers.authorization;
          }
          const hangarRes = await fetch(`${hangarUrl}/api/hangar/units/${unit_id}`, { headers });
          if (hangarRes.ok) {
            hangarUnit = await hangarRes.json();
          } else {
            console.warn('[deploy-unit] 格纳库响应:', hangarRes.status);
          }
        } catch (e) {
          console.warn('[deploy-unit] 无法从格纳库获取棋子数据:', e.message);
        }
      }"""

if old_hangar_fetch in content:
    content = content.replace(old_hangar_fetch, new_hangar_fetch)
    print("✓ deploy-unit 端点已改为优先使用 unit_data")
else:
    # 尝试备选匹配（不带 auth header 的旧版本）
    old_hangar_fetch_v2 = """      // 尝试从格纳库获取棋子数据
      let hangarUnit = null;
      try {
        const hangarUrl = process.env.HANGAR_SERVICE_URL || 'http://localhost:3002';
        const hangarRes = await fetch(`${hangarUrl}/api/hangar/units/${unit_id}`);
        if (hangarRes.ok) {
          hangarUnit = await hangarRes.json();
        }
      } catch (e) {
        console.warn('[deploy-unit] 无法从格纳库获取棋子数据:', e.message);
      }"""

    if old_hangar_fetch_v2 in content:
        content = content.replace(old_hangar_fetch_v2, new_hangar_fetch)
        print("✓ deploy-unit 端点已改为优先使用 unit_data（v2匹配）")
    else:
        print("✗ 未找到 hangar fetch 代码块，尝试部分匹配...")
        # 尝试只匹配核心 try 块
        old_simple = "let hangarUnit = null;\n      try {\n        const hangarUrl"
        if old_simple in content:
            print("  找到 hangarUrl 引用，需要手动检查")
        else:
            print("  ⚠ 无法找到 deploy-unit 中的格纳库调用，请手动检查")

# ============================================================
# Fix 3: deploy-unit 结束后从 pending_deploy_units 中移除
# ============================================================

# 在 state.units.push(converted) 之后添加清理
# 查找 "state.units.push(converted);" 并在其后添加清理代码
old_push = "        state.units.push(converted);"
if old_push in content:
    new_push = """        state.units.push(converted);

        // 从部署池中移除已部署单位
        if (state.pending_deploy_units && state.pending_deploy_units[unit_id]) {
          delete state.pending_deploy_units[unit_id];
        }"""
    content = content.replace(old_push, new_push)
    print("✓ 部署后自动从 pending_deploy_units 移除")
else:
    print("✗ 未找到 state.units.push(converted)，跳过清理代码")
    # 备选：查找 fallback 的 push
    old_push_fallback = "        state.units.push({"
    # 不处理 fallback 的 push

with open(path, 'w') as f:
    f.write(content)

print(f"\n battles.js 修改后文件大小: {len(content)} chars")

# ============================================================
# Fix 4: 更新 validators/battle.validators.js - deploymentSchema 增加 unit_data 字段
# ============================================================
val_path = '/root/original-project/services/combat-service/src/validators/battle.validators.js'
try:
    with open(val_path, 'r') as f:
        val_content = f.read()
    
    # 找到 deploymentSchema 定义
    # 可能的格式:
    # export const deploymentSchema = z.object({
    #   unit_id: unitIdSchema,
    #   q: z.number()...,
    #   r: z.number()...
    # });
    
    # 匹配 deploymentSchema 的 }); 结尾，在此之前插入 unit_data 字段
    # 找到 deploymentSchema 的定义区域
    deploy_schema_start = val_content.find('export const deploymentSchema')
    if deploy_schema_start > 0:
        # 找到这个 schema 的 }); 结尾
        schema_end = val_content.find('});', deploy_schema_start)
        if schema_end > 0:
            # 在 }); 前插入 unit_data 字段
            unit_data_field = ",\n  unit_data: z.object({}).optional() // 前端可传完整棋子快照（自包含部署）\n"
            val_content = val_content[:schema_end] + unit_data_field + val_content[schema_end:]
            print("✓ deploymentSchema 增加了 unit_data 可选字段")
        else:
            print("  ℹ deploymentSchema 结构未匹配，跳过 validator 修改")
    else:
        # 备选：可能用 z.strictObject 或其他格式
        deploy_schema_start = val_content.find('deploymentSchema')
        if deploy_schema_start > 0:
            schema_end = val_content.find('});', deploy_schema_start)
            if schema_end > 0:
                unit_data_field = ",\n  unit_data: z.object({}).optional()\n"
                val_content = val_content[:schema_end] + unit_data_field + val_content[schema_end:]
                print("✓ deploymentSchema 增加了 unit_data 可选字段（备选匹配）")
        else:
            print("  ℹ 未找到 deploymentSchema，可能尚未应用 schema 验证")
    
    with open(val_path, 'w') as f:
        f.write(val_content)
except FileNotFoundError:
    print("  ℹ battle.validators.js 不存在，跳过 validator 修改")
except Exception as e:
    print(f"  ⚠ validator 修改失败: {e}")

print("P11: 后端部署池管理 + 自包含部署 完成")
