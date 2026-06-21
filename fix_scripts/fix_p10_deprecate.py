#!/usr/bin/env python3
"""P2-10: Mark combatIntegrator.cjs as deprecated, pointing to combatResolver + turnManager"""
path = '/root/original-project/services/combat-service/src/services/combatCore/combatIntegrator.cjs'
with open(path, 'r') as f:
    content = f.read()

# Add deprecation notice at top of file
deprecation = '''/**
 * ============================================================
 * DEPRECATED — 此文件已弃用
 * ============================================================
 * 战斗逻辑主线现已统一为:
 *   - combatResolver.js (攻击/技能解析)
 *   - turnManager.js    (回合/阶段管理)
 *   - damagePipe.cjs    (伤害计算管道)
 *   - terrainMovement.cjs (地形/移动系统)
 *
 * CombatIntegrator 保留仅供向后兼容，新功能请勿在此添加。
 * 计划在 v2.0 移除。
 * ============================================================
 */

'''

content = deprecation + content

with open(path, 'w') as f:
    f.write(content)
print('P2-10: combatIntegrator.cjs marked as deprecated')
