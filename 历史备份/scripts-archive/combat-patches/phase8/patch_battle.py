#!/usr/bin/env python3
"""
Phase 8 — Patch 2/3: NewBattleView.vue 手动掷骰拦截
添加掷骰状态机、UI浮层、键盘监听、拦截逻辑
"""
import re

PATH = '/root/original-project/frontend/src/views/NewBattleView.vue'

with open(PATH, 'r') as f:
    content = f.read()

ch = 0

# === PATCH A: 添加 glossarySkills ref ===
marker = "const selectedAttackSkill = ref(null)"
glossary_ref = "\nconst glossarySkills = ref({})  // Phase8: 词条库技能配置缓存"
if marker in content and glossary_ref not in content:
    content = content.replace(marker, marker + glossary_ref)
    ch += 1
    print('[A] glossarySkills ref added')

# === PATCH B: 添加 diceRollState reactive ===
marker_b = "const selectedAttackSkill = ref(null)"
dice_reactive = """
// Phase8: 手动掷骰拦截状态机
const diceRollState = reactive({
  active: false,
  skillName: '',
  skillConfig: null,
  unitId: null,
  targetId: null,
  diceType: '1d6',
  successLine: 4,
  bonusDamage: 0,
  animationPhase: 'idle',
  rollResult: 0,
  rollAnimTimer: null,
  isSuccess: false,
  pendingAttackPayload: null,
})
"""
if marker_b in content and 'diceRollState' not in content:
    content = content.replace(marker_b, marker_b + dice_reactive)
    ch += 1
    print('[B] diceRollState added')

# === PATCH C: 在 executeSkillAttack 前插入骰子函数 ===
exec_marker = "async function executeSkillAttack(target, skill) {"
dice_funcs = """
// ===== Phase8: 手动掷骰系统 =====
function parseDiceType(diceStr) {
  const m = String(diceStr || '1d6').match(/^(\\d+)d(\\d+)$/i)
  return m ? { count: parseInt(m[1]), sides: parseInt(m[2]) } : { count: 1, sides: 6 }
}

function rollDice(diceStr) {
  const { count, sides } = parseDiceType(diceStr)
  let t = 0
  for (let i = 0; i < count; i++) t += Math.floor(Math.random() * sides) + 1
  return t
}

function maybeInterceptManualRoll(target, skill) {
  const cfg = glossarySkills.value || {}
  let skillCfg = null
  for (const [k, v] of Object.entries(cfg)) {
    if (v.label === skill.name || v.label === skill.label) { skillCfg = v; break }
  }
  if (!skillCfg || !skillCfg.is_manual_roll) return false
  
  diceRollState.active = true
  diceRollState.skillName = skillCfg.label || skill.name
  diceRollState.skillConfig = skillCfg
  diceRollState.unitId = selectedUnit.value?.id
  diceRollState.targetId = target.id
  diceRollState.diceType = skillCfg.dice_type || '1d6'
  diceRollState.successLine = skillCfg.success_line ?? 4
  diceRollState.bonusDamage = skillCfg.success_bonus_damage ?? 0
  diceRollState.animationPhase = 'idle'
  diceRollState.rollResult = 0
  diceRollState.isSuccess = false
  diceRollState.pendingAttackPayload = { target, skill }
  addLog('dice', `[掷骰拦截] ${skillCfg.label || skill.name} 需要手动摇骰！点击骰子或按空格`)
  hexGrid.value?.redraw()
  return true
}

function startDiceRoll() {
  if (diceRollState.animationPhase !== 'idle') return
  diceRollState.animationPhase = 'rolling'
  let tick = 0
  diceRollState.rollAnimTimer = setInterval(() => {
    diceRollState.rollResult = rollDice(diceRollState.diceType)
    tick++
    if (tick >= 10) {
      clearInterval(diceRollState.rollAnimTimer)
      diceRollState.rollResult = rollDice(diceRollState.diceType)
      diceRollState.isSuccess = diceRollState.rollResult >= diceRollState.successLine
      diceRollState.animationPhase = 'result'
      addLog('dice', `结果: ${diceRollState.rollResult} [${diceRollState.isSuccess ? 'SUCCESS' : 'FAIL'}] 成功线${diceRollState.successLine}`)
    }
  }, 50)
}

async function resolveDiceRoll() {
  if (diceRollState.animationPhase === 'idle') { startDiceRoll(); return }
  if (diceRollState.animationPhase === 'rolling') {
    clearInterval(diceRollState.rollAnimTimer)
    diceRollState.rollResult = rollDice(diceRollState.diceType)
    diceRollState.isSuccess = diceRollState.rollResult >= diceRollState.successLine
    diceRollState.animationPhase = 'result'
    return
  }
  const { pendingAttackPayload, isSuccess, bonusDamage } = diceRollState
  if (!pendingAttackPayload) return
  const payload = {
    attacker_id: String(selectedUnit.value?.id),
    target_id: String(pendingAttackPayload.target.id),
    attack_type: 'skill',
    _dice_result: {
      roll: diceRollState.rollResult,
      dice_type: diceRollState.diceType,
      success_line: diceRollState.successLine,
      is_success: isSuccess,
      bonus_damage: isSuccess ? bonusDamage : 0,
    }
  }
  if (pendingAttackPayload.skill.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pendingAttackPayload.skill.id)) {
    payload.skill_id = pendingAttackPayload.skill.id
  }
  try {
    const result = await combatAPI.attack(route.params.id, payload)
    const dmg = result.data?.combat_result?.final_damage ?? result.data?.combat_result?.damage ?? result.data?.damage ?? '?'
    if (isSuccess) {
      addLog('attack', `${selectedUnit.value?.name} [${diceRollState.skillName}] SUCCESS! 掷${diceRollState.rollResult}>=${diceRollState.successLine}, +${bonusDamage}加成 -> 伤害${dmg}`)
    } else {
      addLog('attack', `${selectedUnit.value?.name} [${diceRollState.skillName}] 掷${diceRollState.rollResult}<${diceRollState.successLine} -> 伤害${dmg}`)
    }
  } catch (e) {
    addLog('error', `技能攻击失败: ${e.response?.data?.error || e.message}`)
  }
  diceRollState.active = false
  diceRollState.animationPhase = 'idle'
  diceRollState.pendingAttackPayload = null
  actionMode.value = null
  selectedAttackSkill.value = null
  await refreshState()
}

function cancelDiceRoll() {
  if (diceRollState.rollAnimTimer) clearInterval(diceRollState.rollAnimTimer)
  diceRollState.active = false
  diceRollState.animationPhase = 'idle'
  diceRollState.pendingAttackPayload = null
  hexGrid.value?.redraw()
}

async function loadGlossaryConfigForDice() {
  try {
    const res = await glossaryAPI.getConfig()
    if (res.data?.skills) glossarySkills.value = res.data.skills
  } catch (e) { /* silent */ }
}

"""
if exec_marker in content and 'loadGlossaryConfigForDice' not in content:
    content = content.replace(exec_marker, dice_funcs + exec_marker)
    ch += 1
    print('[C] Dice functions inserted before executeSkillAttack')

# === PATCH D: 修改 executeSkillAttack 添加拦截 ===
old_exec = """async function executeSkillAttack(target, skill) {
  if (!selectedUnit.value) return
  const attacker = selectedUnit.value
  try {
    const attackPayload = {
      attacker_id: String(attacker.id),
      target_id: String(target.id),
      attack_type: 'skill',
    }
    // Only include skill_id if it is a valid UUID (equipment-generated skills have non-UUID ids)
    if (skill.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(skill.id)) {
      attackPayload.skill_id = skill.id
    }
    const result = await combatAPI.attack(route.params.id, attackPayload)
    const dmg = result.data?.combat_result?.final_damage ?? result.data?.combat_result?.damage ?? result.data?.damage ?? '?'
    addLog('attack', `${attacker.name} 使用 [${skill.name}] 攻击 ${target.name} \u2192 伤害 ${dmg}`)
    actionMode.value = null
    selectedAttackSkill.value = null
    await refreshState()
  } catch (e) {
    addLog('error', `技能攻击失败: ${e.response?.data?.error || e.message}`)
    cancelAction()
  }
}"""
new_exec = """async function executeSkillAttack(target, skill) {
  if (!selectedUnit.value) return
  const attacker = selectedUnit.value
  // Phase8: 手动掷骰拦截
  if (maybeInterceptManualRoll(target, skill)) return
  try {
    const attackPayload = {
      attacker_id: String(attacker.id),
      target_id: String(target.id),
      attack_type: 'skill',
    }
    if (skill.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(skill.id)) {
      attackPayload.skill_id = skill.id
    }
    const result = await combatAPI.attack(route.params.id, attackPayload)
    const dmg = result.data?.combat_result?.final_damage ?? result.data?.combat_result?.damage ?? result.data?.damage ?? '?'
    addLog('attack', `${attacker.name} 使用 [${skill.name}] 攻击 ${target.name} \u2192 伤害 ${dmg}`)
    actionMode.value = null
    selectedAttackSkill.value = null
    await refreshState()
  } catch (e) {
    addLog('error', `技能攻击失败: ${e.response?.data?.error || e.message}`)
    cancelAction()
  }
}"""
if old_exec in content:
    content = content.replace(old_exec, new_exec)
    ch += 1
    print('[D] executeSkillAttack updated with interception')

# === PATCH E: 在 refreshState 中添加 glossary 加载 ===
marker_e = "loadViewConfig().catch(() => {})"
# 搜最后出现的那个
last_idx = content.rfind(marker_e)
if last_idx > 0 and 'loadGlossaryConfigForDice' not in content[last_idx-50:last_idx+100]:
    # 在最后一个 loadViewConfig 之后插入
    new_e = marker_e + '\n  loadGlossaryConfigForDice().catch(() => {})'
    content = content[:last_idx] + new_e + content[last_idx + len(marker_e):]
    ch += 1
    print('[E] Glossary loading hooked into refreshState')

# === PATCH F: 键盘监听 ===
# 找 onMounted
mounted_marker = 'onMounted(() => {'
if mounted_marker in content:
    # 在 onMounted 内加事件监听
    kb_listener = "\n  document.addEventListener('keydown', onDiceKeyDown)"
    content = content.replace(mounted_marker, mounted_marker + kb_listener)
    ch += 1
    print('[F] Keyboard listener added to onMounted')

    # 在 defineExpose 之前加键盘处理函数和 cleanup
    if 'onUnmounted' not in content:
        # 找 onMounted 的闭合位置
        unmounted_hook = "\n\nonUnmounted(() => {\n  document.removeEventListener('keydown', onDiceKeyDown)\n})"
        # Insert before the last export/defineExpose or at end of <script>
        if 'defineExpose' in content:
            content = content.replace('defineExpose', unmounted_hook + '\n\ndefineExpose')
        else:
            # Insert before </script>
            content = content.replace('</script>', unmounted_hook + '\n</script>')
        ch += 1
        print('[F2] onUnmounted cleanup added')

# 添加键盘处理函数
# 在 defineExpose 前插入
kb_handler = """
// Phase8: 空格掷骰 / ESC取消
function onDiceKeyDown(e) {
  if (!diceRollState.active) return
  if (e.code === 'Space') {
    e.preventDefault()
    if (diceRollState.animationPhase === 'idle') startDiceRoll()
    else if (diceRollState.animationPhase === 'result') resolveDiceRoll()
  }
  if (e.code === 'Escape') cancelDiceRoll()
}
"""
if 'onDiceKeyDown' not in content:
    content = content.replace('defineExpose', kb_handler + '\ndefineExpose')
    ch += 1
    print('[G] onDiceKeyDown handler added')

with open(PATH, 'w') as f:
    f.write(content)

print(f'\n=== NewBattleView.vue: {ch} patches applied ===')
