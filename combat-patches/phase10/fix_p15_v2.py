#!/usr/bin/env python3
"""P15: Inject CombatResolver.init() into end-deployment handler for skill counter init"""
path = "/root/original-project/services/combat-service/src/routes/battles.js"
with open(path, "r") as f:
    content = f.read()

old = """    const state = JSON.parse(battle.units_state || '{}');
    state.phase = 'tactical';
    
    await db.execute('UPDATE battle_sessions SET units_state = $1, phase = $2 WHERE id = $3', [JSON.stringify(state), state.phase, req.params.id]);"""

new = """    const state = JSON.parse(battle.units_state || '{}');
    state.phase = 'tactical';

    // P15: 初始化所有单位的技能计数器（助攻/守护/阻碍）
    try {
      CombatResolver.init(state.battlefield_state, state.units || []);
      console.log('[end-deployment] 技能计数器已初始化');
    } catch (e) {
      console.warn('[end-deployment] 技能计数器初始化失败:', e.message);
    }
    
    await db.execute('UPDATE battle_sessions SET units_state = $1, phase = $2 WHERE id = $3', [JSON.stringify(state), state.phase, req.params.id]);"""

if old in content:
    content = content.replace(old, new)
    print("P15: end-deployment handler 已注入 CombatResolver.init() 调用")
else:
    print("P15 ERROR: 模式未匹配")

with open(path, "w") as f:
    f.write(content)
