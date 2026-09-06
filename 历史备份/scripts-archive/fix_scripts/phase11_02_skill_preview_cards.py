#!/usr/bin/env python3
"""
Phase 11.2: 前端技能预览卡片增强
- NewBattleView.vue: 技能卡片展示 Phase 10 万能语法字段
  - damage_kind 图标
  - min_cast_range 范围显示
  - accuracy_mod / evasion_mod 修正值
  - height_bonus_per_diff 高地加成
  - action_type 类型标签
"""

BASE = '/root/original-project'

def patch_battle_view_skill_preview():
    """增强 NewBattleView.vue 的技能预览函数和模板"""
    path = f'{BASE}/frontend/src/views/NewBattleView.vue'
    with open(path, 'r') as f:
        content = f.read()

    # === 1. 增强 getPassiveSkillDesc：添加 Phase 10 字段显示 ===
    old_passive = """function getPassiveSkillDesc(skill) {
  const gc = glossaryConfig.value
  if (!gc || !gc.skills) return skill.description || ''

  const gs = gc.skills[skill.type]
  if (!gs) return skill.description || ''

  switch (skill.type) {
    case 'block':
      return `被动：受到敌人攻击时伤害-${gs.reduction}`
    case 'execute':
      return `近战伤害结算后，目标HP<${gs.hp_threshold_percent}%最大HP时直接斩杀`
    case 'focused_fire':
      return `放弃移动，获得固定伤害加成+${gs.bonus}`
    case 'throw':
      return `主动：1~${gs.max_range}格，目标周围${gs.aoe_range}格所有目标下次伤害+${gs.value}`
    case 'sweep':
      return `主动：扇形${gs.max_range}格范围攻击，不进行机动值判定。精准命中单体造成伤害${gs.damage_modifier_precise}，范围攻击伤害由所有目标均摊`
    case 'duel':
      return `双方在攻击范围内且HP<对方${gs.stat_comparison}时触发，攻击力高者胜`
    case 'snatch':
      return `伤害值>被攻击者武器攻击值时触发，伤害减为×${gs.damage_multiplier}并获得武器`
    case 'lucky':
      return `获得空投时可再次移动并攻击`
    case 'reactivate':
      return `击杀敌军时触发，额外一回合（不连续触发）`
    default:
      return skill.description || ''
  }
}"""

    new_passive = """function getPassiveSkillDesc(skill) {
  const gc = glossaryConfig.value
  if (!gc || !gc.skills) return skill.description || ''

  const gs = gc.skills[skill.type]
  if (!gs) return skill.description || ''

  // Phase 11: 构建万能语法信息行
  const phase10Info = getPhase10SkillInfo(gs)
  let baseDesc = ''
  switch (skill.type) {
    case 'block':
      baseDesc = `被动：受到敌人攻击时伤害-${gs.reduction}`
      break
    case 'execute':
      baseDesc = `近战伤害结算后，目标HP<${gs.hp_threshold_percent}%最大HP时直接斩杀`
      break
    case 'focused_fire':
      baseDesc = `放弃移动，获得固定伤害加成+${gs.bonus}`
      break
    case 'throw':
      baseDesc = `主动：1~${gs.max_range}格，目标周围${gs.aoe_range}格所有目标下次伤害+${gs.value}`
      break
    case 'sweep':
      baseDesc = `主动：扇形${gs.max_range}格范围攻击，不进行机动值判定。精准命中单体造成伤害${gs.damage_modifier_precise}，范围攻击伤害由所有目标均摊`
      break
    case 'duel':
      baseDesc = `双方在攻击范围内且HP<对方${gs.stat_comparison}时触发，攻击力高者胜`
      break
    case 'snatch':
      baseDesc = `伤害值>被攻击者武器攻击值时触发，伤害减为×${gs.damage_multiplier}并获得武器`
      break
    case 'lucky':
      baseDesc = `获得空投时可再次移动并攻击`
      break
    case 'reactivate':
      baseDesc = `击杀敌军时触发，额外一回合（不连续触发）`
      break
    default:
      baseDesc = skill.description || ''
      break
  }
  if (phase10Info) baseDesc += ' | ' + phase10Info
  return baseDesc
}

/**
 * Phase 11: 从词条库提取万能语法信息预览
 * 返回格式化字符串显示 Phase 10 关键字段
 */
function getPhase10SkillInfo(gs) {
  if (!gs) return ''
  const parts = []
  if (gs.action_type) parts.push(mapActionType(gs.action_type))
  if (gs.damage_kind && gs.damage_kind !== 'kinetic') parts.push(mapDamageKind(gs.damage_kind))
  if (gs.min_cast_range) parts.push(`最小${gs.min_cast_range}格`)
  if (gs.accuracy_mod) parts.push(`命中${gs.accuracy_mod > 0 ? '+' : ''}${gs.accuracy_mod}`)
  if (gs.evasion_mod) parts.push(`回避${gs.evasion_mod > 0 ? '+' : ''}${gs.evasion_mod}`)
  if (gs.height_bonus_per_diff) parts.push(`高地×${gs.height_bonus_per_diff}`)
  if (gs.is_manual_roll) parts.push('掷骰判定')
  if (gs.requires_unmoved) parts.push('需未移动')
  if (gs.requires_stealth) parts.push('需潜行')
  return parts.join(' · ')
}

function mapActionType(type) {
  const map = { attack: '攻击', heal: '治疗', buff: '增益', debuff: '减益', passive: '被动' }
  return map[type] || type
}

function mapDamageKind(kind) {
  const map = { kinetic: '动能', beam: '光束', explosive: '爆炸', corrosive: '腐蚀', thermal: '热熔' }
  return map[kind] || kind
}"""

    if old_passive not in content:
        print('[WARN] getPassiveSkillDesc 原始文本匹配失败，跳过')
    else:
        content = content.replace(old_passive, new_passive)
        print('[OK] getPassiveSkillDesc: 添加 Phase 10 万能语法信息行')


    # === 2. 增强 getActiveSkillTooltip: 添加 Phase 10 字段 ===
    old_tooltip = """function getActiveSkillTooltip(skill) {
  const gc = glossaryConfig.value
  if (!gc || !gc.skills) return skill.description || ''

  const gs = gc.skills[skill.type]
  if (!gs) return skill.description || ''

  switch (skill.type) {
    case 'focused_fire':
      return `${skill.name}: 放弃移动，固定伤害加成 +${gs.bonus}`
    case 'sweep':
      return `${skill.name}: 扇形${gs.max_range}格范围，精准伤害${gs.damage_modifier_precise}`
    case 'throw':
      return `${skill.name}: 1~${gs.max_range}格，AOE伤害+${gs.value}`
    default:
      return skill.description || skill.name || ''
  }
}"""

    new_tooltip = """function getActiveSkillTooltip(skill) {
  const gc = glossaryConfig.value
  if (!gc || !gc.skills) return skill.description || ''

  const gs = gc.skills[skill.type]
  if (!gs) return skill.description || ''

  const phase10Info = getPhase10SkillInfo(gs)
  let base = ''
  switch (skill.type) {
    case 'focused_fire':
      base = `${skill.name}: 放弃移动，固定伤害加成 +${gs.bonus}`
      break
    case 'sweep':
      base = `${skill.name}: 扇形${gs.max_range}格范围，精准伤害${gs.damage_modifier_precise}`
      break
    case 'throw':
      base = `${skill.name}: 1~${gs.max_range}格，AOE伤害+${gs.value}`
      break
    default:
      base = skill.description || skill.name || ''
      break
  }
  if (phase10Info) base += '\\n' + phase10Info
  return base
}"""

    if old_tooltip not in content:
        print('[WARN] getActiveSkillTooltip 原始文本匹配失败，跳过')
    else:
        content = content.replace(old_tooltip, new_tooltip)
        print('[OK] getActiveSkillTooltip: 添加 Phase 10 万能语法提示')


    # === 3. 在技能卡片模板中添加 skill-tags 万能语法图标 ===
    # 在 .sk-tags 区域添加 Phase 10 标签
    old_tags_template = """              <div class=\"sk-tags\" v-if=\"skill.guaranteed_hit || skill.crit_boost || skill.pierce || skill.lifesteal\">
                <span v-if=\"skill.guaranteed_hit\" class=\"sk-tag tag-hit\">必中</span>
                <span v-if=\"skill.crit_boost\" class=\"sk-tag tag-crit\">暴击</span>
                <span v-if=\"skill.pierce\" class=\"sk-tag tag-pierce\">穿透</span>
                <span v-if=\"skill.lifesteal\" class=\"sk-tag tag-leech\">吸血</span>
              </div>"""

    new_tags_template = """              <div class=\"sk-tags\">
                <span v-if=\"skill.guaranteed_hit\" class=\"sk-tag tag-hit\">必中</span>
                <span v-if=\"skill.crit_boost\" class=\"sk-tag tag-crit\">暴击</span>
                <span v-if=\"skill.pierce\" class=\"sk-tag tag-pierce\">穿透</span>
                <span v-if=\"skill.lifesteal\" class=\"sk-tag tag-leech\">吸血</span>
                <!-- Phase 11: 万能语法标签 -->
                <span v-if=\"getSkillPhase10Tags(skill).length > 0\" class=\"sk-tags-group\">
                  <span v-for=\"tag in getSkillPhase10Tags(skill)\" :key=\"tag.key\" class=\"sk-tag\" :class=\"tag.cssClass\">{{ tag.label }}</span>
                </span>
              </div>"""

    if old_tags_template not in content:
        print('[WARN] .sk-tags 模板原始文本匹配失败，使用备用匹配')
        # 尝试更宽松的匹配
        old_tags_alt = '<div class="sk-tags" v-if="skill.guaranteed_hit'
        if old_tags_alt in content:
            print('[OK] 找到 .sk-tags 备选位置')
            # 替换整个 v-if 条件为无条件渲染
            content = content.replace(
                'class="sk-tags" v-if="skill.guaranteed_hit || skill.crit_boost || skill.pierce || skill.lifesteal"',
                'class="sk-tags"'
            )
            print('[OK] 移除 .sk-tags 的 v-if 条件')
    else:
        content = content.replace(old_tags_template, new_tags_template)
        print('[OK] .sk-tags 模板: 添加万能语法标签')


    # === 4. 添加 getSkillPhase10Tags 辅助函数 ===
    # 在 getPhase10SkillInfo 之后添加
    old_place = """function mapDamageKind(kind) {
  const map = { kinetic: '动能', beam: '光束', explosive: '爆炸', corrosive: '腐蚀', thermal: '热熔' }
  return map[kind] || kind
}"""

    new_func = """function mapDamageKind(kind) {
  const map = { kinetic: '动能', beam: '光束', explosive: '爆炸', corrosive: '腐蚀', thermal: '热熔' }
  return map[kind] || kind
}

/**
 * Phase 11: 生成技能卡片的万能语法标签
 */
function getSkillPhase10Tags(skill) {
  const gc = glossaryConfig.value
  if (!gc || !gc.skills) return []
  const gs = gc.skills[skill.type]
  if (!gs) return []
  const tags = []
  if (gs.damage_kind && gs.damage_kind !== 'kinetic') {
    tags.push({ key: 'dk', label: mapDamageKind(gs.damage_kind), cssClass: 'tag-dkind' })
  }
  if (gs.action_type) {
    tags.push({ key: 'at', label: mapActionType(gs.action_type), cssClass: 'tag-atype' })
  }
  if (gs.is_manual_roll) {
    tags.push({ key: 'mr', label: '掷骰', cssClass: 'tag-dice' })
  }
  if (gs.height_bonus_per_diff) {
    tags.push({ key: 'hb', label: `高地×${gs.height_bonus_per_diff}`, cssClass: 'tag-height' })
  }
  if (gs.min_cast_range) {
    tags.push({ key: 'mcr', label: `≥${gs.min_cast_range}格`, cssClass: 'tag-range' })
  }
  if (gs.accuracy_mod) {
    tags.push({ key: 'am', label: `命中${gs.accuracy_mod > 0 ? '+' : ''}${gs.accuracy_mod}`, cssClass: 'tag-acc' })
  }
  return tags
}"""

    if old_place not in content:
        print('[WARN] mapDamageKind 位置未找到，跳过 getSkillPhase10Tags 添加')
    else:
        content = content.replace(old_place, new_func)
        print('[OK] 添加 getSkillPhase10Tags 辅助函数')


    # === 5. 添加 Phase 11 标签 CSS ===
    # 在 style 末尾添加新标签样式
    old_style_end = '</style>'
    new_css = """
/* Phase 11: 万能语法标签 */
.sk-tags-group { display: inline-flex; gap: 2px; flex-wrap: wrap; }
.sk-tag.tag-dkind { background: rgba(255,176,0,0.15); color: #ffb000; }
.sk-tag.tag-atype { background: rgba(0,180,220,0.15); color: #00b4dc; }
.sk-tag.tag-dice { background: rgba(156,39,176,0.15); color: #ce93d8; }
.sk-tag.tag-height { background: rgba(76,175,80,0.15); color: #81c784; }
.sk-tag.tag-range { background: rgba(255,152,0,0.15); color: #ffb74d; }
.sk-tag.tag-acc { background: rgba(63,81,181,0.15); color: #7986cb; }
</style>"""

    content = content.replace(old_style_end, new_css)

    with open(path, 'w') as f:
        f.write(content)
    print('[OK] NewBattleView.vue: 技能预览增强完成')


if __name__ == '__main__':
    print('=== Phase 11.2: 技能预览卡片增强 ===')
    patch_battle_view_skill_preview()
    print('=== Phase 11.2 完成 ===')
