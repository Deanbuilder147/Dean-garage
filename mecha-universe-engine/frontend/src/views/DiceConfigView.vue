<template>
  <div class="dice-config-view">
    <header class="page-header">
      <h1>🎲 骰子工坊</h1>
      <p class="subtitle">统一骰子引擎参数 · 修改即时影响新开战斗的结算与弹窗</p>
    </header>

    <div v-if="loading" class="state-msg">加载中…</div>
    <div v-else-if="loadError" class="state-msg error">{{ loadError }}</div>

    <div v-else class="cards-grid">
      <!-- 卡片1：投骰倍率梯度 -->
      <section class="card">
        <h2>投骰倍率梯度</h2>
        <p class="card-hint">骰点 1~6 对应的基础伤害倍率（普通攻击「投骰倍率」项来源）</p>
        <div class="roll-mult-row" v-for="(m, i) in form.rollMult" :key="i">
          <label>骰点 {{ i + 1 }}</label>
          <input type="number" step="0.05" min="0" v-model.number="form.rollMult[i]" />
          <span class="mult-tag">×{{ (form.rollMult[i] * 100).toFixed(0) }}%</span>
        </div>
      </section>

      <!-- 卡片2：暴击配置 -->
      <section class="card">
        <h2>暴击配置</h2>
        <p class="card-hint">1d6 ≥ 触发骰点时暴击，倍率在 [下限, 上限] 间随机</p>
        <div class="field">
          <label>触发骰点 (1~6)</label>
          <input type="number" min="1" max="6" v-model.number="form.critThreshold" />
        </div>
        <div class="field">
          <label>倍率下限</label>
          <input type="number" step="0.05" min="0" v-model.number="form.critMin" />
        </div>
        <div class="field">
          <label>倍率上限</label>
          <input type="number" step="0.05" min="0" v-model.number="form.critMax" />
        </div>
        <p class="card-hint">当前区间：×{{ form.critMin }} ~ ×{{ form.critMax }}</p>
      </section>

      <!-- 卡片3：骰面库 -->
      <section class="card">
        <h2>骰面库</h2>
        <p class="card-hint">可用骰面（影响词条下拉与手动摇骰可选面数）</p>
        <div class="dice-types">
          <label class="type-chip" v-for="t in ALL_DICE_TYPES" :key="t">
            <input type="checkbox" :value="t" v-model="form.availableDiceTypes" />
            <span>{{ t }} 面</span>
          </label>
        </div>
      </section>

      <!-- 卡片5：手动摇骰默认 -->
      <section class="card">
        <h2>手动摇骰默认</h2>
        <p class="card-hint">未单独配置技能时的全局默认手动摇骰参数</p>
        <div class="field">
          <label>成功线</label>
          <input type="number" min="1" v-model.number="form.manualRollDefault.successLine" />
        </div>
        <div class="field">
          <label>成功追加伤害</label>
          <input type="number" min="0" v-model.number="form.manualRollDefault.bonusDamage" />
        </div>
        <div class="field inline">
          <label>全局启用手动摇骰</label>
          <input type="checkbox" v-model="form.manualRollDefault.enabled" />
        </div>
      </section>

      <!-- 卡片6：实时掷骰模拟器 -->
      <section class="card">
        <h2>实时掷骰模拟器</h2>
        <p class="card-hint">本地模拟，验证当前骰面分布（不写回引擎）</p>
        <div class="sim-controls">
          <div class="field">
            <label>骰面</label>
            <select v-model.number="sim.sides">
              <option v-for="t in form.availableDiceTypes" :key="t" :value="t">{{ t }} 面</option>
            </select>
          </div>
          <div class="field">
            <label>次数</label>
            <input type="number" min="1" max="10000" v-model.number="sim.count" />
          </div>
          <button class="btn small" @click="runSim">掷!</button>
        </div>
        <div class="histogram" v-if="sim.dist.length">
          <div class="bar" v-for="(c, i) in sim.dist" :key="i" :style="{ height: barHeight(c) + 'px' }">
            <span class="bar-label">{{ i + 1 }}</span>
            <span class="bar-count">{{ c }}</span>
          </div>
        </div>
      </section>
    </div>

    <footer class="page-footer" v-if="!loading && !loadError">
      <span class="save-state" :class="{ ok: savedOk, err: saveError }">
        {{ saveMsg }}
      </span>
      <div class="footer-actions">
        <button class="btn ghost" @click="resetDefaults">恢复默认</button>
        <button class="btn primary" :disabled="saving" @click="saveConfig">
          {{ saving ? '保存中…' : '保存参数' }}
        </button>
      </div>
      <p class="warn">注：进行中的战斗已加载进内存的单位不回滚，仅后续新结算生效。</p>
    </footer>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { diceAPI } from '../api/client.js';
import { rollMany } from '../utils/diceUtil.js';

const ALL_DICE_TYPES = [4, 6, 8, 10, 12, 20];

const loading = ref(true);
const loadError = ref('');
const saving = ref(false);
const saveMsg = ref('');
const savedOk = ref(false);
const saveError = ref(false);

const form = reactive({
  rollMult: [0.6, 0.7, 0.8, 0.9, 1.0, 1.1],
  critThreshold: 5,
  critMin: 0.8,
  critMax: 1.5,
  availableDiceTypes: [4, 6, 8, 10, 12, 20],
  manualRollDefault: { successLine: 4, bonusDamage: 0, enabled: false },
});

const sim = reactive({ sides: 6, count: 200, dist: [] });

function applyConfig(cfg) {
  if (!cfg) return;
  if (Array.isArray(cfg.rollMult) && cfg.rollMult.length === 6) form.rollMult = cfg.rollMult.map(Number);
  if (typeof cfg.critThreshold === 'number') form.critThreshold = cfg.critThreshold;
  if (typeof cfg.critMin === 'number') form.critMin = cfg.critMin;
  if (typeof cfg.critMax === 'number') form.critMax = cfg.critMax;
  if (Array.isArray(cfg.availableDiceTypes) && cfg.availableDiceTypes.length)
    form.availableDiceTypes = cfg.availableDiceTypes.map(Number);
  if (cfg.manualRollDefault) {
    form.manualRollDefault.successLine = cfg.manualRollDefault.successLine ?? 4;
    form.manualRollDefault.bonusDamage = cfg.manualRollDefault.bonusDamage ?? 0;
    form.manualRollDefault.enabled = !!cfg.manualRollDefault.enabled;
  }
  if (!form.availableDiceTypes.includes(sim.sides)) sim.sides = form.availableDiceTypes[0] || 6;
}

async function loadConfig() {
  loading.value = true;
  loadError.value = '';
  try {
    const res = await diceAPI.getConfig();
    const cfg = res?.data?.config || res?.config;
    applyConfig(cfg);
  } catch (e) {
    loadError.value = '加载骰子配置失败：' + (e?.message || e);
  } finally {
    loading.value = false;
  }
}

function buildPayload() {
  return {
    rollMult: form.rollMult.map(Number),
    critThreshold: Number(form.critThreshold),
    critMin: Number(form.critMin),
    critMax: Number(form.critMax),
    availableDiceTypes: form.availableDiceTypes.map(Number),
    manualRollDefault: {
      successLine: Number(form.manualRollDefault.successLine),
      bonusDamage: Number(form.manualRollDefault.bonusDamage),
      enabled: !!form.manualRollDefault.enabled,
    },
  };
}

async function saveConfig() {
  saving.value = true;
  saveMsg.value = '';
  savedOk.value = false;
  saveError.value = false;
  try {
    const res = await diceAPI.saveConfig(buildPayload());
    if (res?.data?.ok || res?.ok) {
      savedOk.value = true;
      saveMsg.value = '已保存，新战斗即时生效 ✓';
    } else {
      saveError.value = true;
      saveMsg.value = '保存返回异常';
    }
  } catch (e) {
    saveError.value = true;
    saveMsg.value = '保存失败：' + (e?.message || e);
  } finally {
    saving.value = false;
  }
}

function resetDefaults() {
  applyConfig({
    rollMult: [0.6, 0.7, 0.8, 0.9, 1.0, 1.1],
    critThreshold: 5,
    critMin: 0.8,
    critMax: 1.5,
    availableDiceTypes: [4, 6, 8, 10, 12, 20],
    manualRollDefault: { successLine: 4, bonusDamage: 0, enabled: false },
  });
  saveMsg.value = '已恢复默认值，记得点「保存参数」';
  savedOk.value = false;
  saveError.value = false;
}

function runSim() {
  const results = rollMany(sim.sides, sim.count);
  const dist = new Array(sim.sides).fill(0);
  for (const r of results) {
    if (r >= 1 && r <= sim.sides) dist[r - 1]++;
  }
  sim.dist = dist;
}

function barHeight(c) {
  const max = Math.max(1, ...sim.dist);
  return Math.round((c / max) * 120) + 4;
}

onMounted(loadConfig);
</script>

<style scoped>
.dice-config-view {
  padding: 24px 32px;
  height: 100%;
  overflow-y: auto;
  color: #f1f3fc;
  background: #0c0f1a;
}
.page-header h1 { margin: 0; font-size: 22px; color: #ffb000; letter-spacing: 2px; }
.subtitle { margin: 4px 0 20px; color: rgba(193, 232, 255, 0.5); font-size: 12px; }
.state-msg { padding: 40px; text-align: center; color: rgba(241, 243, 252, 0.5); }
.state-msg.error { color: #ff6b6b; }

.cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}
.card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 176, 0, 0.12);
  border-radius: 10px;
  padding: 16px 18px;
}
.card h2 { margin: 0 0 6px; font-size: 15px; color: #c1e8ff; letter-spacing: 1px; }
.card-hint { margin: 0 0 12px; font-size: 11px; color: rgba(193, 232, 255, 0.45); line-height: 1.5; }

.roll-mult-row, .field {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
  font-size: 12px;
}
.field.inline { gap: 8px; }
.sim-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 14px; }
.roll-mult-row label, .field label { width: 90px; color: rgba(241, 243, 252, 0.7); flex-shrink: 0; }
.roll-mult-row input, .field input, .field select {
  width: 80px;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 176, 0, 0.2);
  color: #f1f3fc;
  border-radius: 5px;
  padding: 5px 8px;
  font-family: 'Fira Code', monospace;
}
.mult-tag { color: #ffb000; font-family: 'Fira Code', monospace; }

.dice-types { display: flex; flex-wrap: wrap; gap: 8px; }
.type-chip {
  display: flex; align-items: center; gap: 6px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 176, 0, 0.15);
  border-radius: 6px; padding: 6px 10px;
  font-size: 12px; cursor: pointer;
}

.histogram { display: flex; align-items: flex-end; gap: 6px; height: 140px; margin-top: 12px; }
.bar {
  flex: 1;
  background: linear-gradient(180deg, #ffb000, rgba(255, 176, 0, 0.25));
  border-radius: 4px 4px 0 0;
  position: relative;
  min-height: 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
}
.bar-label { position: absolute; bottom: -18px; font-size: 10px; color: rgba(241, 243, 252, 0.5); }
.bar-count { font-size: 10px; color: #0c0f1a; font-weight: 700; padding-top: 2px; }

.page-footer { margin-top: 24px; display: flex; flex-direction: column; gap: 10px; }
.footer-actions { display: flex; gap: 12px; justify-content: flex-end; }
.save-state { font-size: 12px; color: rgba(241, 243, 252, 0.5); }
.save-state.ok { color: #6bff9e; }
.save-state.err { color: #ff6b6b; }
.warn { font-size: 11px; color: rgba(255, 107, 107, 0.6); margin: 0; }

.btn {
  border: none; border-radius: 6px; padding: 8px 16px;
  font-family: inherit; letter-spacing: 1px; cursor: pointer; font-size: 12px;
}
.btn.small { padding: 5px 14px; background: #ffb000; color: #0c0f1a; font-weight: 700; }
.btn.small:hover { background: #ffc233; }
.btn.small:active { transform: translateY(1px); }
.btn.primary { background: #ffb000; color: #0c0f1a; font-weight: 700; }
.btn.primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn.ghost { background: transparent; border: 1px solid rgba(255, 176, 0, 0.3); color: #ffb000; }
</style>
