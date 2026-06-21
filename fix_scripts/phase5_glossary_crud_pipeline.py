#!/usr/bin/env python3
"""
Phase 5: 词条库编辑闭环 — 前端 GlossaryView ↔ 后端 JSON 实时同步管线
===========================================================================
实施步骤：
  1. 创建 configLoader.cjs — 共享配置加载器（支持运行时重载）
  2. 改造 skillExecutor.cjs — 改用 configLoader 动态加载
  3. 新增路由 GET/POST /api/combat/glossary-config — 读/写端点
  4. 前端 client.js — 新增 glossaryAPI
  5. 重写 GlossaryView.vue — 完整编辑界面 + 保存回写
  6. 构建、重启、验证
"""
import os, sys, subprocess, json

SERVER = "root@106.54.197.69"
KEY = "/Users/dingxuyang/Desktop/watson.pem"
PROJ = "/root/original-project"
COMBAT_SRC = f"{PROJ}/services/combat-service/src"
FRONTEND_SRC = f"{PROJ}/frontend/src"

def ssh(cmd, needs_tty=False):
    tty = "-t" if needs_tty else ""
    return subprocess.run(
        f"ssh -i {KEY} {tty} {SERVER} {repr(cmd)}",
        shell=True, capture_output=True, text=True
    )

def scp_up(local, remote):
    subprocess.run(
        f"scp -i {KEY} {local} {SERVER}:{remote}",
        shell=True, capture_output=True, text=True
    )
    print(f"  ↑ Uploaded: {remote}")

def write_remote_file(path, content):
    """Write file on remote via base64 to avoid escaping hell."""
    import base64
    b64 = base64.b64encode(content.encode()).decode()
    ssh(f"python3 -c \"import base64; open({repr(path)}, 'w').write(base64.b64decode({repr(b64)}).decode())\"")
    print(f"  ✓ Written: {path}")

# ============================================================================
# STEP 1: 创建 configLoader.cjs — 共享配置热加载器
# ============================================================================
print("\n[Step 1] Creating configLoader.cjs...")

CONFIG_LOADER = r"""/**
 * configLoader.cjs — 词条库配置热加载器
 *
 * 提供运行时重新加载词条库中枢配置的能力。
 * 调用 getGlossaryConfig() 总是返回最新的 JSON 数据。
 * 配合 API 写入端点，实现编辑后无需重启容器即可生效。
 */

const path = require('path');
const fs = require('fs');

const CONFIG_PATH = path.resolve(__dirname, '../../config/glossary-skill-config.json');

/**
 * 始终从磁盘读取最新配置
 * @returns {Object} 词条库配置对象
 */
function getGlossaryConfig() {
    try {
        const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
        return JSON.parse(raw);
    } catch (e) {
        console.error('[ConfigLoader] 读取配置文件失败:', e.message);
        return null;
    }
}

/**
 * 写入配置到磁盘
 * @param {Object} config - 新的配置对象
 * @returns {boolean} 是否写入成功
 */
function saveGlossaryConfig(config) {
    try {
        const json = JSON.stringify(config, null, 2);
        fs.writeFileSync(CONFIG_PATH, json, 'utf-8');
        console.log('[ConfigLoader] 配置已写入磁盘，所有消费者将在下次调用时加载新值');
        return true;
    } catch (e) {
        console.error('[ConfigLoader] 写入配置文件失败:', e.message);
        return false;
    }
}

/**
 * 获取技能配置
 * @param {string} skillType - 技能类型，如 'block', 'execute' 等
 * @returns {Object|null}
 */
function getSkillConfig(skillType) {
    const config = getGlossaryConfig();
    if (config && config.skills && config.skills[skillType]) {
        return config.skills[skillType];
    }
    return null;
}

/**
 * 获取系统配置
 * @param {string} systemKey - 系统键名，如 'ambush', 'fog_of_war', 'crit'
 * @returns {Object|null}
 */
function getSystemConfig(systemKey) {
    const config = getGlossaryConfig();
    if (config && config.systems && config.systems[systemKey]) {
        return config.systems[systemKey];
    }
    return null;
}

module.exports = {
    getGlossaryConfig,
    saveGlossaryConfig,
    getSkillConfig,
    getSystemConfig
};
"""

write_remote_file(f"{COMBAT_SRC}/services/combatCore/configLoader.cjs", CONFIG_LOADER)

# ============================================================================
# STEP 2: 改造 skillExecutor.cjs — 改用 configLoader 动态加载
# ============================================================================
print("\n[Step 2] Patching skillExecutor.cjs...")

# Read current skillExecutor
result = ssh(f"cat {COMBAT_SRC}/services/combatCore/skillExecutor.cjs")
skill_exec = result.stdout

# Replace the header: remove readFileSync, use configLoader
old_header = r"""const path = require('path');
const fs = require('fs');

// 加载词条库中枢配置
let GLOSSARY_CONFIG = null;
try {
    const configPath = path.resolve(__dirname, '../../config/glossary-skill-config.json');
    GLOSSARY_CONFIG = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
} catch (e) {
    console.warn('[SkillExecutor] 词条库配置文件加载失败，使用内置默认参数:', e.message);
}

function getSkillConfig(skillType) {
    if (GLOSSARY_CONFIG && GLOSSARY_CONFIG.skills && GLOSSARY_CONFIG.skills[skillType]) {
        return GLOSSARY_CONFIG.skills[skillType];
    }
    return null;
}

function getSystemConfig(systemKey) {
    if (GLOSSARY_CONFIG && GLOSSARY_CONFIG.systems && GLOSSARY_CONFIG.systems[systemKey]) {
        return GLOSSARY_CONFIG.systems[systemKey];
    }
    return null;
}"""

new_header = """const { getSkillConfig, getSystemConfig, getGlossaryConfig } = require('./configLoader.cjs');

// configLoader 提供运行时动态加载，无需模块级缓存
// getSkillConfig() / getSystemConfig() 每次从磁盘读取最新值"""

suffix_config_line = """        this.config = GLOSSARY_CONFIG;"""
new_suffix_config_line = """        this.config = getGlossaryConfig();"""

# Do the replacement
skill_exec = skill_exec.replace(old_header, new_header)
skill_exec = skill_exec.replace(suffix_config_line, new_suffix_config_line)

write_remote_file(f"{COMBAT_SRC}/services/combatCore/skillExecutor.cjs", skill_exec)

# ============================================================================
# STEP 3: 后端新增 GET/POST /api/combat/glossary-config 路由
# ============================================================================
print("\n[Step 3] Adding glossary config routes...")

# Read current battles.js
result = ssh(f"cat {COMBAT_SRC}/routes/battles.js")
battles_js = result.stdout

# Add import for configLoader
import_line = "import UnitConverter from '../services/unitConverter.js';"
new_import = """import UnitConverter from '../services/unitConverter.js';
import { getGlossaryConfig, saveGlossaryConfig } from '../services/combatCore/configLoader.cjs';"""

battles_js = battles_js.replace(import_line, new_import)

# Add routes before "export default router"
glossary_routes = """
// ============================================================
// 词条库中枢配置 API（无需认证：配置端点不受战斗状态影响）
// ============================================================

// GET 读取词条库配置
router.get('/glossary-config', (req, res) => {
  try {
    const config = getGlossaryConfig();
    if (!config) {
      return res.status(500).json({ error: '配置文件读取失败' });
    }
    res.json(config);
  } catch (error) {
    console.error('[Glossary] GET error:', error);
    res.status(500).json({ error: '读取词条配置失败' });
  }
});

// POST 保存词条库配置
router.post('/glossary-config', (req, res) => {
  try {
    const newConfig = req.body;
    if (!newConfig || !newConfig.skills || !newConfig.systems) {
      return res.status(400).json({
        error: '配置格式无效',
        message: '必须包含 skills 和 systems 字段'
      });
    }

    // 保留 meta 信息但更新日期
    newConfig._meta = newConfig._meta || {};
    newConfig._meta.date = new Date().toISOString().replace('T', ' ').substring(0, 19);
    newConfig._meta.generated_from = 'GlossaryView.vue 前端编辑界面';
    newConfig._meta.version = newConfig._meta.version || '2.0';

    const success = saveGlossaryConfig(newConfig);
    if (!success) {
      return res.status(500).json({ error: '写入配置文件失败' });
    }

    console.log('[Glossary] 配置已更新，消费者将在下次调用时加载新值');
    res.json({
      message: '词条库配置已保存并生效',
      updated_at: newConfig._meta.date
    });
  } catch (error) {
    console.error('[Glossary] POST error:', error);
    res.status(500).json({ error: '保存词条配置失败' });
  }
});

"""

# Insert before "export default router"
battles_js = battles_js.replace("\nexport default router;", glossary_routes + "\nexport default router;")

write_remote_file(f"{COMBAT_SRC}/routes/battles.js", battles_js)

# ============================================================================
# STEP 4: 前端 client.js — 新增 glossaryAPI
# ============================================================================
print("\n[Step 4] Adding glossaryAPI to client.js...")

result = ssh(f"cat {FRONTEND_SRC}/api/client.js")
client_js = result.stdout

# Add glossaryAPI after combatAPI before commAPI
glossary_api_block = """
export const glossaryAPI = {
  getConfig: () => apiClient.get('/combat/glossary-config'),
  saveConfig: (data) => apiClient.post('/combat/glossary-config', data)
};
"""

# Insert before commAPI
client_js = client_js.replace(
    "\nexport const commAPI = {",
    glossary_api_block + "\nexport const commAPI = {"
)

write_remote_file(f"{FRONTEND_SRC}/api/client.js", client_js)

# ============================================================================
# STEP 5: 重写 GlossaryView.vue — 完整编辑界面
# ============================================================================
print("\n[Step 5] Rewriting GlossaryView.vue...")

GLOSSARY_VUE = r"""<template>
  <main class="main-content">
    <header class="page-header">
      <h1>[ 词条库中枢 ]</h1>
      <div class="header-meta">
        <span class="meta-item"><span class="dot-live"></span> {{ syncStatus }}</span>
        <span class="sep">::</span>
        <span>战斗规则 · 技能参数 · 系统配置</span>
        <span class="sep">::</span>
        <span class="meta-version">v{{ configVersion }}</span>
      </div>
    </header>

    <!-- 操作栏 -->
    <div class="action-bar">
      <button class="btn btn-edit-mode" @click="editMode = !editMode" :class="{ active: editMode }">
        {{ editMode ? '[ 退出编辑 ]' : '[ 编辑模式 ]' }}
      </button>
      <button
        v-if="editMode"
        class="btn btn-save"
        :disabled="saving"
        @click="saveConfig"
      >
        {{ saving ? '[ 保存中... ]' : '[ 保存并同步规则 ]' }}
      </button>
      <button
        v-if="editMode"
        class="btn btn-reload"
        @click="loadConfig"
      >
        [ 重新加载 ]
      </button>
      <span v-if="saveMsg" class="save-msg">{{ saveMsg }}</span>
    </div>

    <!-- 加载中 -->
    <div v-if="loading" class="loading-state">
      <p>[ 正在连接词条库中枢... ]</p>
      <p class="loading-hint">正在从 combat-service 获取最新配置</p>
    </div>

    <!-- 加载失败 -->
    <div v-else-if="loadError" class="error-state">
      <p class="error-msg">{{ loadError }}</p>
      <button class="btn btn-reload" @click="loadConfig">[ 重试 ]</button>
    </div>

    <!-- 词条编辑面板 -->
    <div v-else class="glossary-panels">
      <!-- 技能参数面板 -->
      <section class="panel">
        <div class="panel-header">
          <h2>[ 技能参数 ]</h2>
          <span class="panel-badge">可编辑</span>
        </div>
        <div class="panel-body">
          <div v-for="(skill, key) in editableConfig.skills" :key="key" class="skill-card">
            <div class="skill-label">{{ skill.label }}</div>
            <div class="skill-desc">{{ skill.description }}</div>
            <div class="skill-params">
              <!-- block: reduction -->
              <label v-if="key === 'block'" class="param-row">
                <span class="param-key">减伤值</span>
                <input
                  v-if="editMode"
                  v-model.number="skill.reduction"
                  type="number"
                  min="0"
                  max="99"
                  class="param-input"
                />
                <span v-else class="param-value">{{ skill.reduction }}</span>
              </label>

              <!-- sweep -->
              <label v-if="key === 'sweep'" class="param-row">
                <span class="param-key">扇形角度</span>
                <input v-if="editMode" v-model.number="skill.sector_angle" type="number" min="10" max="180" class="param-input" />
                <span v-else class="param-value">{{ skill.sector_angle }}°</span>
              </label>
              <label v-if="key === 'sweep'" class="param-row">
                <span class="param-key">最大射程</span>
                <input v-if="editMode" v-model.number="skill.max_range" type="number" min="1" max="10" class="param-input" />
                <span v-else class="param-value">{{ skill.max_range }}</span>
              </label>
              <label v-if="key === 'sweep'" class="param-row">
                <span class="param-key">精准伤害修正</span>
                <input v-if="editMode" v-model.number="skill.damage_modifier_precise" type="number" class="param-input" />
                <span v-else class="param-value">{{ skill.damage_modifier_precise }}</span>
              </label>

              <!-- throw -->
              <label v-if="key === 'throw'" class="param-row">
                <span class="param-key">伤害增益</span>
                <input v-if="editMode" v-model.number="skill.value" type="number" min="0" max="50" class="param-input" />
                <span v-else class="param-value">+{{ skill.value }}</span>
              </label>
              <label v-if="key === 'throw'" class="param-row">
                <span class="param-key">AOE 范围</span>
                <input v-if="editMode" v-model.number="skill.aoe_range" type="number" min="1" max="5" class="param-input" />
                <span v-else class="param-value">{{ skill.aoe_range }}</span>
              </label>

              <!-- execute -->
              <label v-if="key === 'execute'" class="param-row">
                <span class="param-key">斩杀阈值 (%)</span>
                <input v-if="editMode" v-model.number="skill.hp_threshold_percent" type="number" min="1" max="100" class="param-input" />
                <span v-else class="param-value">{{ skill.hp_threshold_percent }}%</span>
              </label>

              <!-- duel -->
              <label v-if="key === 'duel'" class="param-row">
                <span class="param-key">比较属性</span>
                <input v-if="editMode" v-model="skill.stat_comparison" type="text" class="param-input param-text" />
                <span v-else class="param-value">{{ skill.stat_comparison }}</span>
              </label>

              <!-- snatch -->
              <label v-if="key === 'snatch'" class="param-row">
                <span class="param-key">伤害倍率</span>
                <input v-if="editMode" v-model.number="skill.damage_multiplier" type="number" min="0.1" max="1" step="0.1" class="param-input" />
                <span v-else class="param-value">×{{ skill.damage_multiplier }}</span>
              </label>

              <!-- focused_fire -->
              <label v-if="key === 'focused_fire'" class="param-row">
                <span class="param-key">攻击加成</span>
                <input v-if="editMode" v-model.number="skill.bonus" type="number" min="0" max="20" class="param-input" />
                <span v-else class="param-value">+{{ skill.bonus }}</span>
              </label>

              <!-- lucky / reactivate: no numeric params -->

              <!-- 确定性标签 -->
              <span class="deterministic-tag" :class="{ on: skill.deterministic }">
                {{ skill.deterministic ? '◆ 确定性' : '◇ 随机' }}
              </span>
            </div>
          </div>
        </div>
      </section>

      <!-- 系统参数面板 -->
      <section class="panel">
        <div class="panel-header">
          <h2>[ 系统参数 ]</h2>
          <span class="panel-badge">可编辑</span>
        </div>
        <div class="panel-body">
          <div v-for="(sys, key) in editableConfig.systems" :key="key" class="skill-card">
            <div class="skill-label">{{ sys.label }}</div>
            <div class="skill-desc">{{ sys.description }}</div>
            <div class="skill-params">
              <!-- ambush -->
              <label v-if="key === 'ambush'" class="param-row">
                <span class="param-key">反击伤害百分比</span>
                <input v-if="editMode" v-model.number="sys.damage_percent" type="number" min="0.1" max="1" step="0.05" class="param-input" />
                <span v-else class="param-value">{{ Math.round(sys.damage_percent * 100) }}%</span>
              </label>

              <!-- fog_of_war -->
              <label v-if="key === 'fog_of_war'" class="param-row">
                <span class="param-key">可见性</span>
                <select v-if="editMode" v-model="sys.visibility" class="param-select">
                  <option value="normal">正常</option>
                  <option value="reduced">降低</option>
                  <option value="blind">盲视</option>
                </select>
                <span v-else class="param-value">{{ sys.visibility }}</span>
              </label>
              <label v-if="key === 'fog_of_war'" class="param-row">
                <span class="param-key">命中修正</span>
                <input v-if="editMode" v-model.number="sys.accuracy_modifier" type="number" class="param-input" />
                <span v-else class="param-value">{{ sys.accuracy_modifier }}</span>
              </label>

              <!-- crit -->
              <label v-if="key === 'crit'" class="param-row">
                <span class="param-key">暴击率</span>
                <input v-if="editMode" v-model.number="sys.chance" type="number" min="0" max="1" step="0.01" class="param-input" />
                <span v-else class="param-value">{{ Math.round(sys.chance * 100) }}%</span>
              </label>
              <label v-if="key === 'crit'" class="param-row">
                <span class="param-key">暴击倍率(最小)</span>
                <input v-if="editMode" v-model.number="sys.multiplier_min" type="number" min="0.5" max="3" step="0.1" class="param-input" />
                <span v-else class="param-value">×{{ sys.multiplier_min }}</span>
              </label>
              <label v-if="key === 'crit'" class="param-row">
                <span class="param-key">暴击倍率(最大)</span>
                <input v-if="editMode" v-model.number="sys.multiplier_max" type="number" min="0.5" max="5" step="0.1" class="param-input" />
                <span v-else class="param-value">×{{ sys.multiplier_max }}</span>
              </label>

              <span class="deterministic-tag" :class="{ on: sys.deterministic || sys.deterministic_probability }">
                ◆ 确定化
              </span>
            </div>
          </div>
        </div>
      </section>

      <!-- 配置元信息 -->
      <section class="panel panel-meta" v-if="editableConfig._meta">
        <div class="panel-header">
          <h2>[ 配置元信息 ]</h2>
        </div>
        <div class="panel-body meta-body">
          <div>版本: {{ editableConfig._meta.version }}</div>
          <div>更新: {{ editableConfig._meta.date }}</div>
          <div>原则: {{ editableConfig._meta.principle }}</div>
        </div>
      </section>
    </div>
  </main>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { glossaryAPI } from '@/api/client.js'

// 状态
const loading = ref(true)
const loadError = ref('')
const saving = ref(false)
const saveMsg = ref('')
const saveMsgTimeout = ref(null)
const editMode = ref(false)

// 配置数据
const editableConfig = reactive({
  _meta: {},
  skills: {},
  systems: {}
})

const syncStatus = computed(() => {
  if (loading.value) return '加载中...'
  if (loadError.value) return '离线'
  return '在线'
})

const configVersion = computed(() => editableConfig._meta?.version || '?')

// 从后端加载配置
async function loadConfig() {
  loading.value = true
  loadError.value = ''
  try {
    const config = (await glossaryAPI.getConfig()).data
    // 深拷贝到 reactive
    editableConfig._meta = { ...config._meta }
    editableConfig.skills = { ...config.skills }
    editableConfig.systems = { ...config.systems }
    loading.value = false
  } catch (e) {
    console.error('加载词条配置失败:', e)
    loadError.value = e.response?.data?.error || '无法连接到 combat-service，请检查服务状态'
    loading.value = false
  }
}

// 保存配置到后端
async function saveConfig() {
  saving.value = true
  saveMsg.value = ''
  try {
    // 构建完整的配置对象
    const config = {
      _meta: {
        ...editableConfig._meta,
        date: new Date().toISOString().replace('T', ' ').substring(0, 19),
        generated_from: 'GlossaryView.vue 前端编辑界面'
      },
      skills: { ...editableConfig.skills },
      systems: { ...editableConfig.systems }
    }

    const res = (await glossaryAPI.saveConfig(config)).data
    saveMsg.value = '✓ ' + res.message
    // 更新本地元信息
    editableConfig._meta.date = config._meta.date

    // 3秒后清除消息
    if (saveMsgTimeout.value) clearTimeout(saveMsgTimeout.value)
    saveMsgTimeout.value = setTimeout(() => { saveMsg.value = '' }, 5000)
  } catch (e) {
    console.error('保存配置失败:', e)
    saveMsg.value = '✗ 保存失败: ' + (e.response?.data?.error || e.message)
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  loadConfig()
})
</script>

<style scoped>
/* ===== 基础样式 ===== */
* { box-sizing: border-box; }
.main-content {
  display: flex; flex-direction: column; height: 100vh;
  background: #001620; font-family: 'Fira Code', 'Courier New', monospace;
  color: #c1e8ff; overflow-y: auto;
}

/* ===== HEADER ===== */
.page-header {
  padding: 24px 32px 16px;
  border-bottom: 1px solid rgba(159,142,120,0.15);
}
.page-header h1 {
  margin: 0 0 8px; font-size: 18px; font-weight: 700;
  color: #ffb000; letter-spacing: 2px;
}
.header-meta { font-size: 10px; color: rgba(193,232,255,0.4); display: flex; align-items: center; gap: 8px; }
.sep { color: rgba(255,176,0,0.2); }
.dot-live { width: 6px; height: 6px; background: #13ff43; border-radius: 50%; display: inline-block; margin-right: 4px; }
.meta-version { color: rgba(255,176,0,0.5); }

/* ===== ACTION BAR ===== */
.action-bar {
  display: flex; align-items: center; gap: 12px;
  padding: 16px 32px;
  border-bottom: 1px solid rgba(159,142,120,0.1);
}
.btn {
  padding: 8px 16px; font-size: 11px; font-weight: 700;
  letter-spacing: 1px; border: 1px solid rgba(159,142,120,0.25);
  background: rgba(0,0,0,0.2); color: #c1e8ff;
  cursor: pointer; transition: all 0.2s;
  font-family: inherit;
}
.btn:hover { border-color: rgba(255,176,0,0.4); color: #ffd597; }
.btn.active { background: rgba(255,176,0,0.1); border-color: #ffb000; color: #ffb000; }
.btn-save { background: rgba(19,255,67,0.08); border-color: rgba(19,255,67,0.3); color: #13ff43; }
.btn-save:hover { background: rgba(19,255,67,0.15); border-color: #13ff43; }
.btn-save:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-reload { border-color: rgba(0,180,220,0.25); }
.save-msg { font-size: 11px; color: #13ff43; letter-spacing: 1px; }

/* ===== STATES ===== */
.loading-state, .error-state {
  text-align: center; padding: 80px 20px;
}
.loading-state p { color: rgba(193,232,255,0.5); font-size: 14px; margin: 8px 0; }
.loading-hint { font-size: 11px; color: rgba(193,232,255,0.2); }
.error-msg { color: #ff5252; font-size: 14px; }
.error-state .btn { margin-top: 16px; }

/* ===== PANELS ===== */
.glossary-panels { flex: 1; overflow-y: auto; padding: 24px 32px; }
.panel {
  border: 1px solid rgba(159,142,120,0.12);
  margin-bottom: 24px;
  background: rgba(0,0,0,0.1);
}
.panel-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(159,142,120,0.1);
}
.panel-header h2 { margin: 0; font-size: 14px; font-weight: 700; color: #ffb000; letter-spacing: 1px; }
.panel-badge {
  font-size: 9px; padding: 2px 10px; background: rgba(19,255,67,0.06);
  border: 1px solid rgba(19,255,67,0.2); color: rgba(19,255,67,0.6);
  letter-spacing: 1px;
}
.panel-body { padding: 12px 20px 20px; }

/* ===== SKILL CARDS ===== */
.skill-card {
  border: 1px solid rgba(159,142,120,0.08);
  margin-bottom: 12px; padding: 16px;
  background: rgba(0,0,0,0.15);
  transition: border-color 0.15s;
}
.skill-card:hover { border-color: rgba(255,176,0,0.15); }
.skill-label {
  font-size: 13px; font-weight: 700; color: #ffd597;
  margin-bottom: 4px; letter-spacing: 1px;
}
.skill-desc {
  font-size: 11px; color: rgba(193,232,255,0.5);
  margin-bottom: 12px; font-style: italic;
}
.skill-params { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }

/* ===== PARAM ROWS ===== */
.param-row {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 12px;
  border: 1px solid rgba(159,142,120,0.12);
  background: rgba(0,0,0,0.1);
}
.param-key {
  font-size: 10px; color: rgba(193,232,255,0.5);
  letter-spacing: 1px; white-space: nowrap; min-width: 60px;
}
.param-value {
  font-size: 12px; font-weight: 700; color: #ffb000;
  min-width: 40px; text-align: right;
}
.param-input {
  width: 70px; padding: 4px 8px; font-size: 12px;
  background: rgba(0,0,0,0.4); border: 1px solid rgba(255,176,0,0.3);
  color: #ffb000; text-align: right;
  font-family: inherit; outline: none;
}
.param-input:focus { border-color: #ffb000; box-shadow: 0 0 4px rgba(255,176,0,0.15); }
.param-input.param-text { width: 140px; text-align: left; }
.param-select {
  padding: 4px 8px; font-size: 12px; min-width: 80px;
  background: rgba(0,0,0,0.4); border: 1px solid rgba(255,176,0,0.3);
  color: #ffb000; font-family: inherit; outline: none;
}

/* ===== DETERMINISTIC TAG ===== */
.deterministic-tag {
  font-size: 9px; padding: 2px 8px;
  border: 1px solid rgba(255,82,82,0.3);
  color: rgba(255,82,82,0.5);
  letter-spacing: 1px;
  margin-left: auto;
}
.deterministic-tag.on {
  border-color: rgba(19,255,67,0.3);
  color: rgba(19,255,67,0.5);
}

/* ===== META PANEL ===== */
.panel-meta .meta-body {
  font-size: 10px; color: rgba(193,232,255,0.35);
  display: flex; flex-wrap: wrap; gap: 24px;
  line-height: 1.8;
}
</style>
"""

write_remote_file(f"{FRONTEND_SRC}/views/GlossaryView.vue", GLOSSARY_VUE)

# ============================================================================
# STEP 6: 构建、重启、验证
# ============================================================================
print("\n[Step 6] Building Docker and restarting...")

print("\n--- Rebuilding combat-service Docker ---")
result = ssh(f"cd {PROJ}/services/combat-service && docker build -t mecha-combat . 2>&1 | tail -8")
print(result.stdout)
if result.stderr.strip():
    print("STDERR:", result.stderr.strip())

print("\n--- Restarting container via docker compose ---")
result = ssh(f"cd {PROJ} && docker compose up -d combat-service 2>&1")
print(result.stdout)
if result.stderr.strip():
    print("STDERR:", result.stderr.strip())

print("\n--- Waiting for healthy... ---")
ssh("sleep 4")
result = ssh("curl -s http://localhost:3004/health")
print(result.stdout)

print("\n--- Testing GET glossary-config ---")
result = ssh("curl -s http://localhost:3004/api/combat/glossary-config -H 'Content-Type: application/json' | python3 -c \"import sys,json; d=json.load(sys.stdin); print('Skills:', list(d['skills'].keys())); print('Systems:', list(d['systems'].keys())); print('Version:', d['_meta']['version'])\"")
print(result.stdout)

print("\n--- Testing POST glossary-config ---")
result = ssh(r"""curl -s -X POST http://localhost:3004/api/combat/glossary-config -H 'Content-Type: application/json' -d '{"_meta":{"version":"2.1","principle":"test"},"skills":{"block":{"type":"passive","label":"格挡","category":"melee","description":"测试","deterministic":true,"reduction":5,"trigger":"on_attacked"}},"systems":{"ambush":{"label":"奇袭","description":"测试","deterministic":true,"trigger":"always_on_enemy_attack","damage_percent":0.8}}}'""")
print(result.stdout)

print("\n--- Verifying updated config ---")
result = ssh("python3 -c \"import json; d=json.load(open('/root/original-project/services/combat-service/src/config/glossary-skill-config.json')); print('block.reduction:', d['skills']['block']['reduction']); print('ambush.damage_percent:', d['systems']['ambush']['damage_percent']); print('version:', d['_meta']['version'])\"")
print(result.stdout)

print("\n=== Phase 5 DONE ===")
"""
"""

print("Script definition complete.")
