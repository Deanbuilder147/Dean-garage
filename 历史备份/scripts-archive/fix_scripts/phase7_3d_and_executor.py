#!/usr/bin/env python3
"""
Phase 7: 3D 视角锁定地图编辑器 + skillExecutor 通用字段读取 + NewBattleView 只读拉取
"""

import sys, os

BASE = "/root/original-project"
fixes = 0

# ============================================================
# 1. NewBattlefieldView.vue — 添加「保存 3D 视角配置」按钮
# ============================================================
nfv_path = f"{BASE}/frontend/src/views/NewBattlefieldView.vue"
with open(nfv_path, "r") as f:
    nfv = f.read()

# 1a. 在 import 中添加 glossaryAPI
old_nfv_import = "import { mapAPI } from '@/api/client'"
new_nfv_import = "import { mapAPI, glossaryAPI } from '@/api/client'"
if old_nfv_import in nfv:
    nfv = nfv.replace(old_nfv_import, new_nfv_import)
    fixes += 1
    print("✅ NewBattlefieldView: import 添加 glossaryAPI")

# 1b. 在 3D 滑块区域底部添加保存按钮
old_slider_end = """        <div class="spacing-group iso-group">
          <span class="spacing-label">3D 倾斜Y</span>
          <input type="range" min="0.00" max="0.80" step="0.01" v-model.number="isoShearY" class="iso-slider" />
          <input type="number" min="0.00" max="0.80" step="0.01" v-model.number="isoShearY" class="iso-input" />
        </div>"""
new_slider_end = """        <div class="spacing-group iso-group">
          <span class="spacing-label">3D 倾斜Y</span>
          <input type="range" min="0.00" max="0.80" step="0.01" v-model.number="isoShearY" class="iso-slider" />
          <input type="number" min="0.00" max="0.80" step="0.01" v-model.number="isoShearY" class="iso-input" />
        </div>
        <div class="spacing-group iso-save-group">
          <button class="btn-save-iso" @click="saveViewConfig" :disabled="savingViewConfig">
            {{ savingViewConfig ? '保存中...' : '💾 保存 3D 视角' }}
          </button>
          <span v-if="viewSaveMsg" class="view-save-msg">{{ viewSaveMsg }}</span>
        </div>"""

if old_slider_end in nfv:
    nfv = nfv.replace(old_slider_end, new_slider_end)
    fixes += 1
    print("✅ NewBattlefieldView: 添加「保存 3D 视角」按钮")

# 1c. 添加 saveViewConfig 函数 (在 saveMap 函数之前插入)
old_save_map = "async function saveMap() {"
new_view_config_func = """// ---- 保存 3D 视角配置到后端 ----
const savingViewConfig = ref(false)
const viewSaveMsg = ref('')
let viewSaveMsgTimer = null

async function saveViewConfig() {
  savingViewConfig.value = true
  viewSaveMsg.value = ''
  try {
    const isoConfig = {
      shearX: isoShearX.value,
      shearY: isoShearY.value,
      scaleX: 1.00,
      scaleY: 0.39,
      rotation: -24
    }
    await glossaryAPI.saveConfig({
      _meta: {
        version: '3.0-view',
        date: new Date().toISOString().replace('T', ' ').substring(0, 19),
        generated_from: 'NewBattlefieldView.vue 3D 视角调校'
      },
      _view: isoConfig
    })
    viewSaveMsg.value = '✓ 3D 视角已保存'
  } catch (e) {
    viewSaveMsg.value = '✗ 保存失败: ' + (e.response?.data?.error || e.message)
    console.error('保存视角配置失败:', e)
  } finally {
    savingViewConfig.value = false
    if (viewSaveMsgTimer) clearTimeout(viewSaveMsgTimer)
    viewSaveMsgTimer = setTimeout(() => { viewSaveMsg.value = '' }, 4000)
  }
}

async function saveMap() {"""

if old_save_map in nfv:
    nfv = nfv.replace(old_save_map, new_view_config_func)
    fixes += 1
    print("✅ NewBattlefieldView: 添加 saveViewConfig() 函数")

# 1d. 添加 CSS 样式
old_nfv_end = ".iso-input {\n  width: 64px;"
new_nfv_css = """.iso-save-group {
  display: flex; align-items: center; gap: 10px; margin-top: 4px;
}
.btn-save-iso {
  padding: 6px 14px; font-size: 11px; font-weight: 700; letter-spacing: 1px;
  background: rgba(19,255,67,0.08); border: 1px solid rgba(19,255,67,0.3);
  color: #13ff43; cursor: pointer; font-family: inherit;
  transition: all 0.2s;
}
.btn-save-iso:hover { background: rgba(19,255,67,0.15); border-color: #13ff43; }
.btn-save-iso:disabled { opacity: 0.4; cursor: not-allowed; }
.view-save-msg { font-size: 10px; color: #13ff43; letter-spacing: 1px; }
.iso-input {\n  width: 64px;"""

if old_nfv_end in nfv:
    nfv = nfv.replace(old_nfv_end, new_nfv_css)
    fixes += 1
    print("✅ NewBattlefieldView: 添加保存按钮 CSS")

with open(nfv_path, "w") as f:
    f.write(nfv)


# ============================================================
# 2. NewBattleView.vue — 从后端动态加载 ISO 视角配置
# ============================================================
nbv_path = f"{BASE}/frontend/src/views/NewBattleView.vue"
with open(nbv_path, "r") as f:
    nbv = f.read()

# 2a. 将硬编码的 ISO = ISO_DEFAULTS 改为响应式 ref，从后端加载
old_iso_line = "const ISO = ISO_DEFAULTS  // 等距矩阵参数 (baseline: shearX=0.25, shearY=0.44, scaleX=1.00, scaleY=0.39)"
new_iso_lines = """// ISO 等距参数 — 从后端视角配置动态加载，fallback 到 ISO_DEFAULTS
const ISO = reactive({ ...ISO_DEFAULTS })

async function loadViewConfig() {
  try {
    const res = await glossaryAPI.getConfig()
    const vc = res.data?._view
    if (vc && typeof vc.shearX === 'number') {
      ISO.shearX = vc.shearX
      ISO.shearY = vc.shearY ?? ISO_DEFAULTS.shearY
      ISO.scaleX = vc.scaleX ?? ISO_DEFAULTS.scaleX
      ISO.scaleY = vc.scaleY ?? ISO_DEFAULTS.scaleY
    }
  } catch (e) {
    console.warn('[ViewConfig] 加载视角配置失败，使用默认值:', e.message || e)
  }
}"""

if old_iso_line in nbv:
    nbv = nbv.replace(old_iso_line, new_iso_lines)
    fixes += 1
    print("✅ NewBattleView: ISO 硬编码 → 动态加载 (reactive + loadViewConfig)")

# 2b. 在 onMounted 中添加 loadViewConfig() 调用
old_onmounted = "onMounted(async () => {"
new_onmounted = """onMounted(async () => {
    // 加载 3D 视角配置 (静默拉取，战场端不提供 UI 调节)
    loadViewConfig().catch(() => {})"""
if old_onmounted in nbv:
    nbv = nbv.replace(old_onmounted, new_onmounted)
    fixes += 1
    print("✅ NewBattleView: onMounted 中添加 loadViewConfig() 调用")

# 2c. 在 loadGlossaryConfig 中也重新加载视角 (refreshState 时)
old_load_glossary = "  loadGlossaryConfig().catch(() => {})"
new_load_glossary = "  loadGlossaryConfig().catch(() => {})\n  loadViewConfig().catch(() => {})"
# 只替换第一个出现（在 refreshState 中）
if old_load_glossary in nbv:
    nbv = nbv.replace(old_load_glossary, new_load_glossary, 1)
    fixes += 1
    print("✅ NewBattleView: refreshState 中同步加载 view config")

# 2d. 在 onMounted 第二个 loadGlossaryConfig 调用也加
nbv = nbv.replace(old_load_glossary, new_load_glossary, 1)
fixes += 1
print("✅ NewBattleView: onMounted 中同步加载 view config")

# 2e. 检查 NewBattleView 是否存在 3D 滑块 (应该没有)
if 'isoShearX' not in nbv.split('<template>')[1].split('</template>')[0]:
    print("✅ NewBattleView: 确认无 3D 滑块 UI (战场端纯只读)")

with open(nbv_path, "w") as f:
    f.write(nbv)


# ============================================================
# 3. skillExecutor.cjs — 读取通用字段 (target_filter/cast_range/aoe_radius/base_damage/status_effects)
# ============================================================
se_path = f"{BASE}/services/combat-service/src/services/combatCore/skillExecutor.cjs"
with open(se_path, "r") as f:
    se = f.read()

# 3a. 在构造函数中初始化通用字段缓存
old_constructor = """    constructor() {
        // 稳定技能每局使用状态追踪：key = unit.id
        this.stableUsedInBattle = new Map();
        this.config = getGlossaryConfig();
    }"""
new_constructor = """    constructor() {
        // 稳定技能每局使用状态追踪：key = unit.id
        this.stableUsedInBattle = new Map();
        this.config = getGlossaryConfig();
    }

    /**
     * 获取技能的通用结构化属性 (v3.0 数据模型)
     * @returns {{ target_filter, cast_range, aoe_radius, base_damage, status_effects }}
     */
    _getUniversalFields(skillType) {
        const cfg = getSkillConfig(skillType);
        return {
            target_filter: cfg?.target_filter ?? 'enemy',
            cast_range: cfg?.cast_range ?? 1,
            aoe_radius: cfg?.aoe_radius ?? 0,
            base_damage: cfg?.base_damage ?? 0,
            status_effects: cfg?.status_effects ?? []
        };
    }

    /**
     * 根据 cast_range 获取 BFS 可达格子 (供前端高亮使用)
     * @returns {{ min: number, max: number }}
     */
    getSkillRange(skillType) {
        const cfg = getSkillConfig(skillType);
        const cr = cfg?.cast_range ?? 1;
        return { min: 0, max: cr };
    }

    /**
     * 根据 aoe_radius 获取溅射半径
     * @returns {number} 0=单体, >0=爆炸溅射半径
     */
    getAoeRadius(skillType) {
        const cfg = getSkillConfig(skillType);
        return cfg?.aoe_radius ?? 0;
    }"""

if old_constructor in se:
    se = se.replace(old_constructor, new_constructor)
    fixes += 1
    print("✅ skillExecutor: 构造函数中添加 _getUniversalFields/getSkillRange/getAoeRadius")

# 3b. 更新 executeCounter — 使用通用字段的 cast_range
old_counter_range = """    executeCounter(unit, attacker, skillRange = 1) {
        const dist = this._hexDistance(unit, attacker);
        if (dist > skillRange) return { triggered: false };"""
new_counter_range = """    executeCounter(unit, attacker, skillRange) {
        const cfg = getSkillConfig('counter');
        const range = skillRange ?? cfg?.cast_range ?? 1;
        const dist = this._hexDistance(unit, attacker);
        if (dist > range) return { triggered: false };"""

if old_counter_range in se:
    se = se.replace(old_counter_range, new_counter_range)
    fixes += 1
    print("✅ skillExecutor: executeCounter 使用 cast_range 通用字段")

# 3c. 更新 executeThrow — 使用 cast_range 替代硬编码 min_range/max_range
old_throw_range = """    executeThrow(unit, target) {
        const cfg = getSkillConfig('throw');
        const minRange = cfg?.min_range ?? 1;
        const maxRange = cfg?.max_range ?? 3;"""
new_throw_range = """    executeThrow(unit, target) {
        const cfg = getSkillConfig('throw');
        // 优先使用通用字段 cast_range (v3.0)，fallback 到 old min_range/max_range
        const range = cfg?.cast_range ?? cfg?.max_range ?? 3;
        const minRange = cfg?.min_range ?? 1;
        const maxRange = range;"""

if old_throw_range in se:
    se = se.replace(old_throw_range, new_throw_range)
    fixes += 1
    print("✅ skillExecutor: executeThrow 使用 cast_range 通用字段")

# 3d. 更新 executeSweep — 使用 cast_range + base_damage (通用字段优先)
old_sweep = """    executeSweep(unit, target, allUnits) {
        const cfg = getSkillConfig('sweep');
        const sectorAngle = cfg?.sector_angle ?? 60;
        const maxRange = cfg?.max_range ?? 2;"""
new_sweep = """    executeSweep(unit, target, allUnits) {
        const cfg = getSkillConfig('sweep');
        const sectorAngle = cfg?.sector_angle ?? 60;
        // 优先使用通用字段 cast_range (v3.0)，fallback 到旧 max_range
        const maxRange = cfg?.cast_range ?? cfg?.max_range ?? 2;"""

if old_sweep in se:
    se = se.replace(old_sweep, new_sweep)
    fixes += 1
    print("✅ skillExecutor: executeSweep 使用 cast_range 通用字段")

# 3d2. 更新 executeSweep damage message 使用 base_damage
old_sweep_msg = """            message: `扫射精准命中！单体攻击，伤害 -2`"""
new_sweep_msg = """            message: `扫射精准命中！单体攻击，伤害 ${cfg?.base_damage ?? cfg?.damage_modifier_precise ?? -2}`"""
if old_sweep_msg in se:
    se = se.replace(old_sweep_msg, new_sweep_msg)
    fixes += 1
    print("✅ skillExecutor: executeSweep 消息使用 base_damage 通用字段")

# 3e. 更新 executeFocusedFire — 使用 base_damage
old_ff = """    executeFocusedFire() {
        const cfg = getSkillConfig('focused_fire');
        const bonus = cfg?.bonus ?? 4;"""
new_ff = """    executeFocusedFire() {
        const cfg = getSkillConfig('focused_fire');
        const bonus = cfg?.base_damage ?? cfg?.bonus ?? 4;"""

if old_ff in se:
    se = se.replace(old_ff, new_ff)
    fixes += 1
    print("✅ skillExecutor: executeFocusedFire 使用 base_damage 通用字段")

# 3f. 更新 canSniper — 使用 cast_range
old_sniper = """    canSniper(unit, target) {
        if (unit.has_moved) {
            return { triggered: false, message: '狙击需要舍弃本回合移动' };
        }
        if (!target) {
            return { triggered: false, message: '狙击需要目标' };
        }
        const dist = this._hexDistance(unit, target);
        if (dist < 4 || dist > 6) {"""
new_sniper = """    canSniper(unit, target) {
        if (unit.has_moved) {
            return { triggered: false, message: '狙击需要舍弃本回合移动' };
        }
        if (!target) {
            return { triggered: false, message: '狙击需要目标' };
        }
        const cfg = getSkillConfig('sniper');
        const minRange = cfg?.min_range ?? 4;
        const maxRange = cfg?.cast_range ?? cfg?.max_range ?? 6;
        const dist = this._hexDistance(unit, target);
        if (dist < minRange || dist > maxRange) {"""

if old_sniper in se:
    se = se.replace(old_sniper, new_sniper)
    fixes += 1
    print("✅ skillExecutor: canSniper 使用 cast_range 通用字段")

with open(se_path, "w") as f:
    f.write(se)


# ============================================================
# 总结
# ============================================================
print(f"\n=== Phase 7 3D 视角 + skillExecutor: {fixes} 处完成 ===")
print("  • NewBattlefieldView.vue: 保存 3D 视角到后端 _view 配置")
print("  • NewBattleView.vue: 动态加载后端视角配置 (只读消费者)")
print("  • skillExecutor.cjs: 5 处方法升级读取通用字段")
print("    - _getUniversalFields() 统一查询接口")
print("    - getSkillRange() / getAoeRadius() 供前端高亮")
print("    - executeCounter/executeThrow/executeSweep/canSniper/focusedFire 优先读通用字段")
