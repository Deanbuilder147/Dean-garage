#!/usr/bin/env python3
"""
P16: 补丁 NewBattleView.vue

修复两件事:
  1. 攻击 400 错误 — 确保 executeAttack 将 ID 转为字符串
  2. 选择攻击/技能时地图高亮可攻击范围

兼容性: 不管 fix_attack_skill_select.py 是否已应用，都能正确补丁
"""

FILE = "/root/original-project/frontend/src/views/NewBattleView.vue"

with open(FILE, "r") as f:
    content = f.read()

# ============================================================
# Step 0: 确认 selectedAttackSkill 和 selectAttackSkill 是否存在
#         如果 fix_attack_skill_select.py 未应用，则添加它们
# ============================================================
has_selected_skill = "selectedAttackSkill" in content

if not has_selected_skill:
    print("P16-0: selectedAttackSkill 不存在，添加 ref 和函数...")
    # 添加 selectedAttackSkill ref
    content = content.replace(
        "const actionMode = ref(null)  // 'move' | 'attack' | 'defend' | 'skill' | 'wait'\nconst actionLog = ref([])",
        'const actionMode = ref(null)  // \'move\' | \'attack\' | \'defend\' | \'skill\' | \'wait\'\nconst selectedAttackSkill = ref(null)  // skill selected for attack action\nconst actionLog = ref([])'
    )
    
    # 添加 selectAttackSkill 函数（注入到 executeAttack 前）
    old_exec = "async function executeAttack(target) {"
    new_func = """// Select attack skill (null = normal attack)
function selectAttackSkill(skill) {
  selectedAttackSkill.value = skill
  if (skill) {
    addLog('info', `选择攻击技能: ${skill.name}`)
  } else {
    addLog('info', '选择普通攻击')
  }
}

async function executeAttack(target) {"""
    content = content.replace(old_exec, new_func)
    
    # 添加攻击方式选择子菜单
    old_skills_section = """        <!-- Sub-actions: skill list -->
        <div class="ap-skills" v-if="actionMode === 'skill' && selectedUnit.skills?.length">
          <div class="ap-section-title">选择技能</div>
          <button
            v-for="skill in selectedUnit.skills"
            :key="skill.id || skill.name"
            class="ap-skill-btn"
            @click="executeAction('skill', { skill_id: skill.id || skill.name })"
          >
            {{ skill.name }}
          </button>
        </div>"""
    
    new_skills_section = """        <!-- Sub-actions: Attack skill/weapon selection -->
        <div class="ap-skills" v-if="actionMode === 'attack' && !selectedAttackSkill && selectedUnit.skills?.length">
          <div class="ap-section-title">选择攻击方式</div>
          <button class="ap-skill-btn ap-basic-attack" @click="selectAttackSkill(null)">⚔ 普通攻击</button>
          <button v-for="skill in selectedUnit.skills" :key="skill.id || skill.name" class="ap-skill-btn" @click="selectAttackSkill(skill)">
            {{ skill.name }}<span v-if="skill.type" class="skill-type-badge">{{ skill.type }}</span>
          </button>
        </div>

        <!-- Sub-actions: skill list (non-attack skills) -->
        <div class="ap-skills" v-if="actionMode === 'skill' && selectedUnit.skills?.length">
          <div class="ap-section-title">选择技能</div>
          <button v-for="skill in selectedUnit.skills" :key="skill.id || skill.name" class="ap-skill-btn" @click="selectAttackSkill(skill); actionMode = 'attack'">
            {{ skill.name }}<span v-if="skill.type" class="skill-type-badge">{{ skill.type }}</span>
          </button>
        </div>"""
    
    if old_skills_section in content:
        content = content.replace(old_skills_section, new_skills_section)
        print("P16-0: 添加了攻击方式选择子菜单")
    else:
        print("P16-0 WARNING: skill section 已存在（可能已由 fix_attack_skill_select 添加）")
    
    # 更新 mode hint 显示技能名
    old_hint = """<span v-else-if="actionMode === 'attack'">点击敌方单位攻击</span>"""
    new_hint = """<span v-else-if="actionMode === 'attack' && selectedAttackSkill">
            <span class="skill-hint-name">[{{ selectedAttackSkill.name || '普通攻击' }}]</span> 点击敌方单位
          </span>
          <span v-else-if="actionMode === 'attack'">点击敌方单位攻击</span>"""
    if old_hint in content:
        content = content.replace(old_hint, new_hint)
    else:
        # 可能已被 fix_attack_skill_select 修改，尝试另一种模式
        old_hint2 = '<span v-else-if="actionMode === \'attack\' && selectedAttackSkill">\n            <span class="skill-hint-name">[{{ selectedAttackSkill.name || \'普通攻击\' }}]</span> 点击敌方单位\n          </span>\n          <span v-else-if="actionMode === \'attack\'">点击敌方单位攻击</span>'
        # Already there, no need to add
    
    # 更新 startAction 清除 selectedAttackSkill
    old_start = """function startAction(mode) {
  if (!selectedUnit.value) return
  actionMode.value = mode
  addLog('info', `${selectedUnit.value.name} 选择行动: ${mode}`)
  if (mode === 'defend' || mode === 'wait') {
    executeAction(mode)
  }
  draw()
}"""
    new_start = """function startAction(mode) {
  if (!selectedUnit.value) return
  actionMode.value = mode
  selectedAttackSkill.value = null
  addLog('info', `${selectedUnit.value.name} 选择行动: ${mode}`)
  if (mode === 'defend' || mode === 'wait') {
    executeAction(mode)
  }
  draw()
}"""
    if old_start in content:
        content = content.replace(old_start, new_start)
    
    # 更新 canvas click handler 要求先选技能
    old_canvas = """      // If in attack mode and clicked different unit
      if (actionMode.value === 'attack' && selectedUnit.value) {
        if (clickedUnit.id !== selectedUnit.value.id) {
          executeAttack(clickedUnit)
          return
        }
      }"""
    new_canvas = """      // If in attack mode and clicked different unit
      if (actionMode.value === 'attack' && selectedUnit.value) {
        if (clickedUnit.id !== selectedUnit.value.id) {
          // Require skill selection if unit has skills
          if (!selectedAttackSkill.value && selectedUnit.value.skills?.length) {
            addLog('hint', '请先选择攻击方式（技能/普通攻击）')
            return
          }
          executeAttack(clickedUnit)
          return
        }
      }"""
    if old_canvas in content:
        content = content.replace(old_canvas, new_canvas)
    
    # 添加 CSS
    css_old = """.ap-skill-btn:hover {
  background: #394150;
}"""
    css_new = """.ap-skill-btn:hover {
  background: #394150;
}

.ap-basic-attack {
  border: 1px solid #6b7280;
}

.skill-type-badge {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 10px;
  background: #4b5563;
  color: #d1d5db;
}

.skill-hint-name {
  color: #fbbf24;
  font-weight: bold;
}"""
    if css_old in content:
        content = content.replace(css_old, css_new)
    
    print("P16-0: 已注入 selectedAttackSkill + selectAttackSkill + UI + CSS")

# ============================================================
# Step 1: 修复 executeAttack — String(id) + attack_type
# ============================================================
# 尝试匹配 fix_combat_resolver_v2 的原始 executeAttack（无 String）
old_v1 = """async function executeAttack(target) {
  if (!selectedUnit.value) return
  const attacker = selectedUnit.value
  try {
    const result = await combatAPI.attack(route.params.id, {
      attacker_id: attacker.id,
      target_id: target.id,
    })
    if (result.data?.surprise_triggered) {
      addLog('action', `⚡ 奇袭触发！${attacker.name} vs ${target.name}`)
    } else {
      addLog('attack', `${attacker.name} 攻击 ${target.name} → 伤害 ${result.data?.combat_result?.damage || '?'}`)
    }
    actionMode.value = null
    await refreshState()
  } catch (e) {
    addLog('error', `攻击失败: ${e.response?.data?.error || e.message}`)
    cancelAction()
  }
}"""

new_v1 = """async function executeAttack(target) {
  if (!selectedUnit.value) return
  const attacker = selectedUnit.value
  const skill = selectedAttackSkill.value
  try {
    const params = {
      attacker_id: String(attacker.id),
      target_id: String(target.id),
      attack_type: skill ? 'skill' : ((attacker.range || 1) > 1 ? 'ranged' : 'melee'),
    }
    if (skill) params.skill_id = String(skill.id || skill.name)
    const result = await combatAPI.attack(route.params.id, params)
    const skillLabel = skill ? `[${skill.name}] ` : ''
    if (result.data?.surprise_triggered) {
      addLog('action', `⚡ 奇袭触发！${attacker.name} ${skillLabel}vs ${target.name}`)
    } else {
      addLog('attack', `${attacker.name} ${skillLabel}攻击 ${target.name} → 伤害 ${result.data?.combat_result?.damage || '?'}`)
    }
    actionMode.value = null
    selectedAttackSkill.value = null
    await refreshState()
  } catch (e) {
    addLog('error', `攻击失败: ${e.response?.data?.error || e.message}`)
    cancelAction()
  }
}"""

if old_v1 in content:
    content = content.replace(old_v1, new_v1)
    print("P16-1: executeAttack v1 修复完成（String + attack_type + skill_id）")
else:
    # 尝试匹配 fix_attack_skill_select 的版本（已有 String 但缺 attack_type）
    import re
    pattern_v2 = r'async function executeAttack\(target\) \{[\s\S]*?const params = \{[\s\S]*?attacker_id: String\(attacker\.id\),[\s\S]*?target_id: String\(target\.id\),[\s\S]*?\}[\s\S]*?if \(skill\) \{[\s\S]*?params\.attack_type = .skill.[\s\S]*?params\.skill_id = String\(skill[\s\S]*?\}'
    match = re.search(pattern_v2, content)
    if match:
        # 已存在 String 版本，只需加 attack_type 到普通攻击
        old_v2 = match.group()
        new_v2 = """async function executeAttack(target) {
  if (!selectedUnit.value) return
  const attacker = selectedUnit.value
  const skill = selectedAttackSkill.value
  try {
    const params = {
      attacker_id: String(attacker.id),
      target_id: String(target.id),
      attack_type: skill ? 'skill' : ((attacker.range || 1) > 1 ? 'ranged' : 'melee'),
    }
    if (skill) params.skill_id = String(skill.id || skill.name)
    const result = await combatAPI.attack(route.params.id, params)
    const skillLabel = skill ? `[${skill.name}] ` : ''
    if (result.data?.surprise_triggered) {
      addLog('action', `⚡ 奇袭触发！${attacker.name} ${skillLabel}vs ${target.name}`)
    } else {
      addLog('attack', `${attacker.name} ${skillLabel}攻击 ${target.name} → 伤害 ${result.data?.combat_result?.damage || '?'}`)
    }
    actionMode.value = null
    selectedAttackSkill.value = null
    await refreshState()
  } catch (e) {
    addLog('error', `攻击失败: ${e.response?.data?.error || e.message}`)
    cancelAction()
  }
}"""
        content = content.replace(old_v2, new_v2)
        print("P16-1: executeAttack v2 修复完成（添加 attack_type + 清除 selectedAttackSkill）")
    else:
        print("P16-1 WARNING: 未找到任何已知 executeAttack 模式")
        print("  请手动确保 executeAttack 使用 String(id) 并包含 attack_type 参数")

# ============================================================
# Step 2: cancelAction 清除 selectedAttackSkill
# ============================================================
old_cancel = """function cancelAction() {
  actionMode.value = null
  draw()
}"""

if old_cancel in content:
    content = content.replace(old_cancel, """function cancelAction() {
  actionMode.value = null
  selectedAttackSkill.value = null
  draw()
}""")
    print("P16-2: cancelAction 添加 selectedAttackSkill 清除")

# ============================================================
# Step 3: draw() 添加攻击范围和技能范围高亮
# ============================================================

# 3a: 在移动范围后添加攻击/技能范围计算
old_move_end = """    }\n  }\n\n  for (let r = 0; r < gridHeight.value; r++) {"""
new_range_code = """    }
  }

  // Attack range preview (red highlight)
  const attackRangeHexes = new Set()
  if (actionMode.value === 'attack' && selectedUnit.value) {
    const su = selectedUnit.value
    const range = su.range || 1
    for (let dr = -range; dr <= range; dr++) {
      const maxDq = range - Math.abs(dr)
      for (let dq = -maxDq; dq <= maxDq; dq++) {
        const tq = (su.q || 0) + dq
        const tr = (su.r || 0) + dr
        if (tq >= 0 && tq < gridWidth.value && tr >= 0 && tr < gridHeight.value) {
          attackRangeHexes.add(`${tq},${tr}`)
        }
      }
    }
  }

  // Skill range preview (orange highlight)
  const skillRangeHexes = new Set()
  if (selectedUnit.value && selectedAttackSkill.value) {
    const su = selectedUnit.value
    const skill = selectedAttackSkill.value
    const range = skill.range_max || skill.range || 1
    const rangeMin = skill.range_min || 1
    for (let dr = -range; dr <= range; dr++) {
      const maxDq = range - Math.abs(dr)
      for (let dq = -maxDq; dq <= maxDq; dq++) {
        const tq = (su.q || 0) + dq
        const tr = (su.r || 0) + dr
        if (tq >= 0 && tq < gridWidth.value && tr >= 0 && tr < gridHeight.value) {
          const hexDist = Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr))
          if (hexDist >= rangeMin) {
            skillRangeHexes.add(`${tq},${tr}`)
          }
        }
      }
    }
  }

  for (let r = 0; r < gridHeight.value; r++) {"""

if old_move_end in content:
    content = content.replace(old_move_end, new_range_code)
    print("P16-3a: draw() 添加了攻击范围(红)和技能范围(橙)计算")
else:
    print("P16-3a WARNING: 移动范围代码模式未找到")

# 3b: 在移动范围渲染后添加攻击/技能范围渲染
old_move_render = """      // Move range highlight
      if (moveRangeHexes.has(`${q},${r}`)) {
        ctx.fillStyle = 'rgba(0,180,220,0.15)'
        drawHexPath(ctx, cx, cy)
        ctx.fill()
        ctx.strokeStyle = 'rgba(0,180,220,0.4)'
        ctx.lineWidth = 2
        drawHexPath(ctx, cx, cy)
        ctx.stroke()
      }"""

new_render_all = """      // Move range highlight
      if (moveRangeHexes.has(`${q},${r}`)) {
        ctx.fillStyle = 'rgba(0,180,220,0.15)'
        drawHexPath(ctx, cx, cy)
        ctx.fill()
        ctx.strokeStyle = 'rgba(0,180,220,0.4)'
        ctx.lineWidth = 2
        drawHexPath(ctx, cx, cy)
        ctx.stroke()
      }

      // Attack range highlight
      if (attackRangeHexes.has(`${q},${r}`)) {
        ctx.fillStyle = 'rgba(255,77,77,0.1)'
        drawHexPath(ctx, cx, cy)
        ctx.fill()
        ctx.strokeStyle = 'rgba(255,77,77,0.3)'
        ctx.lineWidth = 2
        drawHexPath(ctx, cx, cy)
        ctx.stroke()
      }

      // Skill range highlight
      if (skillRangeHexes.has(`${q},${r}`)) {
        ctx.fillStyle = 'rgba(255,176,0,0.12)'
        drawHexPath(ctx, cx, cy)
        ctx.fill()
        ctx.strokeStyle = 'rgba(255,176,0,0.35)'
        ctx.lineWidth = 2
        drawHexPath(ctx, cx, cy)
        ctx.stroke()
      }"""

if old_move_render in content:
    content = content.replace(old_move_render, new_render_all)
    print("P16-3b: draw() 添加了攻击(红色)和技能(橙色)范围渲染")
else:
    print("P16-3b WARNING: 移动范围渲染代码模式未找到")

# Write back
with open(FILE, "w") as f:
    f.write(content)

print("\n✅ P16 全部修复完成:")
print("  1. executeAttack → String(id) + attack_type → 不再 400")
print("  2. 攻击模式: 红色半透明高亮可攻击范围 (range = unit.range)")
print("  3. 技能选择: 橙色半透明高亮技能范围 (支持 range_min/range_max 区间)")
print("  4. cancelAction 清除 selectedAttackSkill 状态")
print("  5. 自动注入 selectedAttackSkill / selectAttackSkill 如缺失")
