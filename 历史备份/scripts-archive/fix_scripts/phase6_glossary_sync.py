#!/usr/bin/env python3
"""Phase 6: 全链路动态同步 - NewBattleView.vue + unitConverter.js 动态绑定 glossaryConfig"""
import re

# ============================================================
# FILE 1: NewBattleView.vue
# ============================================================
filepath = "/root/original-project/frontend/src/views/NewBattleView.vue"
with open(filepath, "r") as f:
    content = f.read()

patches_ok = 0

# PATCH 1: 导入 glossaryAPI
old_import = "import { combatAPI, hangarAPI } from '@/api/client'"
new_import = "import { combatAPI, hangarAPI, glossaryAPI } from '@/api/client'"
if old_import in content:
    content = content.replace(old_import, new_import)
    patches_ok += 1
    print("✓ PATCH 1: glossaryAPI 导入完成")
else:
    print("✗ PATCH 1: 未找到 import 行")

# PATCH 2: 在 user computed 之后插入 glossaryConfig 代码块
marker = "const user = computed(() => userStore.user)"
glossary_block = """

// === Phase 6: 词条库配置动态同步（前端UI全量动态绑定）===
const glossaryConfig = ref(null)

async function loadGlossaryConfig() {
  try {
    const res = await glossaryAPI.getConfig()
    glossaryConfig.value = res.data
  } catch (e) {
    console.warn('[GlossarySync] 加载词条配置失败:', e.message || e)
  }
}

/** 根据词条库动态生成被动技能描述文本（8大核心词条） */
function getPassiveSkillDesc(skill) {
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
}

/** 给主动技能按钮动态生成 tooltip */
function getActiveSkillTooltip(skill) {
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
}
"""
if marker in content:
    content = content.replace(marker, marker + glossary_block)
    patches_ok += 1
    print("✓ PATCH 2: glossaryConfig 代码块插入完成")
else:
    print("✗ PATCH 2: 未找到 user computed 标记")

# PATCH 3: 被动技能描述使用动态函数
old_passive = '<span class="ps-desc" v-if="ps.description">{{ ps.description }}</span>'
new_passive = '<span class="ps-desc" v-if="ps.description">{{ getPassiveSkillDesc(ps) }}</span>'
if old_passive in content:
    content = content.replace(old_passive, new_passive)
    patches_ok += 1
    print("✓ PATCH 3: 被动技能描述 → getPassiveSkillDesc()")
else:
    print("✗ PATCH 3: 未找到被动技能描述模板")

# PATCH 4: 主动技能按钮添加 tooltip
old_skill_btn = '''              class="ap-skill-btn"
              :class="{
                active: selectedAttackSkill?.id === skill.id,
                'skill-disabled\''''
if old_skill_btn in content:
    new_skill_btn = '''              class="ap-skill-btn"
              :title="getActiveSkillTooltip(skill)"
              :class="{
                active: selectedAttackSkill?.id === skill.id,
                'skill-disabled\''''
    content = content.replace(old_skill_btn, new_skill_btn)
    patches_ok += 1
    print("✓ PATCH 4: 主动技能按钮添加 :title 动态 tooltip")
else:
    print("✗ PATCH 4: 未找到主动技能按钮 class")

# PATCH 5: onMounted 中加载 glossaryConfig
old_onmount = """    addLog('system', `进入战场: ${battleState.value?.map_name || '未知'} | ${battlefieldSize.value}`)
    // 加载阵营冷却 & 胜利条件"""
new_onmount = """    addLog('system', `进入战场: ${battleState.value?.map_name || '未知'} | ${battlefieldSize.value}`)
    // 加载词条库配置（动态技能参数同步）
    loadGlossaryConfig().catch(() => {})
    // 加载阵营冷却 & 胜利条件"""
if old_onmount in content:
    content = content.replace(old_onmount, new_onmount)
    patches_ok += 1
    print("✓ PATCH 5: onMounted 加载 glossaryConfig")
else:
    print("✗ PATCH 5: 未找到 onMounted 加载标记")

# PATCH 6: refreshState 中刷新 glossaryConfig
old_refresh = """  // 加载阵营冷却和胜利条件
  loadFactionRoles(); loadFactionCooldowns().catch(() => {})"""
new_refresh = """  // 刷新词条库配置（确保战场显示最新数值）
  loadGlossaryConfig().catch(() => {})
  // 加载阵营冷却和胜利条件
  loadFactionRoles(); loadFactionCooldowns().catch(() => {})"""
if old_refresh in content:
    content = content.replace(old_refresh, new_refresh)
    patches_ok += 1
    print("✓ PATCH 6: refreshState 刷新 glossaryConfig")
else:
    print("✗ PATCH 6: 未找到 refreshState 加载标记")

with open(filepath, "w") as f:
    f.write(content)

print(f"\n=== NewBattleView.vue: {patches_ok}/6 patches 成功 ===")

# ============================================================
# FILE 2: unitConverter.js - 动态生成技能描述
# ============================================================
uc_path = "/root/original-project/services/combat-service/src/services/unitConverter.js"
with open(uc_path, "r") as f:
    uc = f.read()

uc_patches = 0

# PATCH U1: 添加 configLoader import
old_import_uc = "/**\n * UnitConverter"
new_import_uc = """const { getGlossaryConfig } = require('./combatCore/configLoader.cjs');

/**
 * UnitConverter"""
if old_import_uc in uc:
    uc = uc.replace(old_import_uc, new_import_uc)
    uc_patches += 1
    print("\n✓ UNIT PATCH 1: configLoader 导入完成")
else:
    print("\n✗ UNIT PATCH 1: 未找到 UnitConverter 类头")

# PATCH U2: 替换 _getSkillDesc 为动态版本
old_desc_method = """    static _getSkillDesc(type) {
        const map = {
            'conceal': '被动：开场隐匿，敌方距离≤3、造成伤害、被侦察、非友方直线路径时暴露。跳过战术环节后移动恢复',
            'counter': '被动：受到敌人攻击且对方在范围内时触发，发动反击伤害+2',
            'block': '被动：受到敌人攻击时伤害-2',
            'polearm': '攻击范围额外朝纵横四个方向延伸1格',
            'supply': '主动：跳过移动，对范围1内友军回复格斗值×1的HP（占用2槽）',
            'sweep': '主动：扇形2格范围攻击，不进行机动值判定。精准命中单体造成伤害-2，范围攻击伤害由所有目标均摊',
            'throw': '主动：1~3格，目标周围2格所有目标下次伤害+5',
            'stable': '主动：1~4格，每局一次，移动后可使用专注射击',
            'sniper': '主动：4~6格，舍弃移动，机动值差计算中目标机动值-2',
            'assist': '被动：后续五次造成的伤害+3（适用于反击）',
            'guard': '被动：后续三次受到的伤害-5，与百分比减伤不叠加',
            'blockade': '被动：在后续三次伤害计算中，对方机动值-5',
            'scout': '被动：对射击值×1范围侦察，暴露敌方3×3区域（占用2槽）',
            'execute': '近战伤害结算后，目标HP<10%最大HP时直接斩杀',
            'duel': '双方在攻击范围内且HP<对方max(格斗,射击)时触发，攻击力高者胜',
            'snatch': '伤害值>被攻击者武器攻击值时触发，伤害减半并获得武器',
            'focused_fire': '放弃移动，获得固定伤害加成+4',
            'lucky': '获得空投时可再次移动并攻击',
            'reactivate': '击杀敌军时触发，额外一回合（不连续触发）',
            'full_armor': '对实体武器伤害-2',
            'coating': '对光束武器伤害-2',
            'transform': '变形技能',
        };
        return map[type] || '';
    }"""

new_desc_method = """    static _getSkillDesc(type) {
        // Phase 6: 从词条库中枢动态读取技能描述，实现全链路动态同步
        let gc = null;
        try {
            gc = getGlossaryConfig();
        } catch (e) {
            // 降级：configLoader 不可用时使用静态度
        }

        const gs = (gc && gc.skills) ? gc.skills[type] : null;

        // 8大核心词条：动态数值填充
        if (gs) {
            switch (type) {
                case 'block':
                    return `被动：受到敌人攻击时伤害-${gs.reduction}`;
                case 'execute':
                    return `近战伤害结算后，目标HP<${gs.hp_threshold_percent}%最大HP时直接斩杀`;
                case 'focused_fire':
                    return `放弃移动，获得固定伤害加成+${gs.bonus}`;
                case 'throw':
                    return `主动：1~${gs.max_range}格，目标周围${gs.aoe_range}格所有目标下次伤害+${gs.value}`;
                case 'sweep':
                    return `主动：扇形${gs.max_range}格范围攻击，不进行机动值判定。精准命中单体造成伤害${gs.damage_modifier_precise}，范围攻击伤害由所有目标均摊`;
                case 'duel':
                    return `双方在攻击范围内且HP<对方${gs.stat_comparison}时触发，攻击力高者胜`;
                case 'snatch':
                    return `伤害值>被攻击者武器攻击值时触发，伤害减为×${gs.damage_multiplier}并获得武器`;
                case 'lucky':
                    return `获得空投时可再次移动并攻击`;
                case 'reactivate':
                    return `击杀敌军时触发，额外一回合（不连续触发）`;
            }
        }

        // 非词条技能的静态映射（回退）
        const map = {
            'conceal': '被动：开场隐匿，敌方距离≤3、造成伤害、被侦察、非友方直线路径时暴露。跳过战术环节后移动恢复',
            'counter': '被动：受到敌人攻击且对方在范围内时触发，发动反击伤害+2',
            'polearm': '攻击范围额外朝纵横四个方向延伸1格',
            'supply': '主动：跳过移动，对范围1内友军回复格斗值×1的HP（占用2槽）',
            'stable': '主动：1~4格，每局一次，移动后可使用专注射击',
            'sniper': '主动：4~6格，舍弃移动，机动值差计算中目标机动值-2',
            'assist': '被动：后续五次造成的伤害+3（适用于反击）',
            'guard': '被动：后续三次受到的伤害-5，与百分比减伤不叠加',
            'blockade': '被动：在后续三次伤害计算中，对方机动值-5',
            'scout': '被动：对射击值×1范围侦察，暴露敌方3×3区域（占用2槽）',
            'full_armor': '对实体武器伤害-2',
            'coating': '对光束武器伤害-2',
            'transform': '变形技能',
        };
        return map[type] || '';
    }"""

if old_desc_method in uc:
    uc = uc.replace(old_desc_method, new_desc_method)
    uc_patches += 1
    print("✓ UNIT PATCH 2: _getSkillDesc → 动态 glossaryConfig")
else:
    print("✗ UNIT PATCH 2: 未找到 _getSkillDesc 方法")

with open(uc_path, "w") as f:
    f.write(uc)

print(f"\n=== unitConverter.js: {uc_patches}/2 patches 成功 ===")

# ============================================================
# FILE 3: GlossaryView.vue - 保存后重新拉取确认
# ============================================================
gv_path = "/root/original-project/frontend/src/views/GlossaryView.vue"
with open(gv_path, "r") as f:
    gv = f.read()

gv_patches = 0

# PATCH G1: 保存成功后重新拉取配置确认服务器状态
old_save = """    saveMsg.value = '✓ ' + res.message
    editableConfig._meta.date = config._meta.date
    if (saveMsgTimeout.value) clearTimeout(saveMsgTimeout.value)
    saveMsgTimeout.value = setTimeout(() => { saveMsg.value = '' }, 5000)"""
new_save = """    saveMsg.value = '✓ ' + res.message
    // Phase 6: 保存成功后重新从服务器拉取，确认前端 UI 完全同步
    await loadConfig()
    if (saveMsgTimeout.value) clearTimeout(saveMsgTimeout.value)
    saveMsgTimeout.value = setTimeout(() => { saveMsg.value = '' }, 5000)"""
if old_save in gv:
    gv = gv.replace(old_save, new_save)
    gv_patches += 1
    print("\n✓ GLOSSARY PATCH 1: saveConfig 后重新拉取配置")
else:
    print("\n✗ GLOSSARY PATCH 1: 未找到 saveMsg 行")

with open(gv_path, "w") as f:
    f.write(gv)

print(f"\n=== GlossaryView.vue: {gv_patches}/1 patches 成功 ===")
print("\n========== Phase 6 脚本执行完成 ==========")
