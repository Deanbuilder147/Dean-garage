<template>
  <div class="size-config-view">
    <header class="page-header">
      <h1>📐 体型工坊</h1>
      <p class="subtitle">统一各体型（S/M/L/XL）的尺寸缩放、HP、机动、受击系数与七视图固定盒子 · 保存即时生效，刷新即更新</p>
    </header>

    <div v-if="loading" class="state-msg">加载中…</div>
    <div v-else-if="loadError" class="state-msg error">{{ loadError }}</div>

    <div v-else class="cards-grid">
      <!-- 卡片1：七视图固定盒子（基础值，绘制时再 ×1.6） -->
      <section class="card span-2">
        <h2>七视图固定盒子（基础像素 w×h）</h2>
        <p class="card-hint">每档尺寸锁定固定绘制尺寸，消除「原图比例导致小尺寸反而更大」；实际屏幕上再 ×1.6 放大。</p>
        <div class="box-table">
          <div class="box-head"><span>尺寸</span><span>宽 (w)</span><span>高 (h)</span><span>锁定比例</span><span>×1.6 后</span></div>
          <div class="box-row" v-for="sz in SIZES" :key="sz">
            <span class="sz-tag">{{ sz.toUpperCase() }}</span>
            <input type="number" min="1" step="1" :value="form.sevenBox[sz].w" @input="onW(sz, $event)" />
            <input type="number" min="1" step="1" :value="form.sevenBox[sz].h" @input="onH(sz, $event)" />
            <label class="lock-cell" :title="lockRatio[sz] ? '已锁定，改一边将按比例联动另一边' : '未锁定，宽高独立'">
              <input type="checkbox" :checked="lockRatio[sz]" @change="toggleLock(sz)" />
              <span>{{ lockRatio[sz] ? '🔒' : '🔓' }}</span>
            </label>
            <span class="box-preview">
              {{ Math.round(form.sevenBox[sz].w * 1.6) }} × {{ Math.round(form.sevenBox[sz].h * 1.6) }}
            </span>
          </div>
        </div>
        <p class="card-hint lock-tip">勾选「锁定比例」后，修改宽或高会按当前比例自动联动另一边，避免七视图盒子被拉变形。</p>
      </section>

      <!-- 卡片2：渲染缩放 / HP / 机动 / 受击 四系数 -->
      <section class="card" v-for="sz in SIZES" :key="'k' + sz">
        <h2>{{ sz.toUpperCase() }} 系数</h2>
        <p class="card-hint">渲染缩放=棋子外观倍率；HP/机动=数值修正；受击=挨打伤害倍率（越大越疼）</p>
        <div class="field">
          <label>渲染缩放</label>
          <input type="number" step="0.01" min="0.1" v-model.number="form.renderScale[sz]" />
        </div>
        <div class="field">
          <label>HP 系数</label>
          <input type="number" step="0.01" min="0.1" v-model.number="form.hpFactor[sz]" />
        </div>
        <div class="field">
          <label>机动系数</label>
          <input type="number" step="0.01" min="0.1" v-model.number="form.mobFactor[sz]" />
        </div>
        <div class="field">
          <label>受击系数</label>
          <input type="number" step="0.01" min="0.1" v-model.number="form.hitFactor[sz]" />
        </div>
      </section>

      <!-- 卡片：实时预览（直接看当前配置下各尺寸棋子实际显示大小） -->
      <section class="card span-2">
        <h2>实时预览（当前生效尺寸）</h2>
        <p class="card-hint">
          下方按当前「七视图盒子 ×1.6」绘出各尺寸棋子占地，改上面任意数值会即时反映。
          <strong>注意</strong>：战场内普通 2D 棋子走「渲染缩放」系数（见各尺寸卡片），七视图图片才用本盒子约束，两者共同决定你看到的大小。
        </p>
        <div class="preview-row">
          <div class="preview-cell" v-for="sz in SIZES" :key="'p' + sz">
            <canvas
              class="preview-canvas"
              :width="Math.round(form.sevenBox[sz].w * 1.6) + 8"
              :height="Math.round(form.sevenBox[sz].h * 1.6) + 8"
              :ref="el => setPreviewRef(sz, el)"
            ></canvas>
            <div class="preview-label">
              {{ sz.toUpperCase() }} · 渲染缩放 {{ form.renderScale[sz] }} ×
              <br />{{ Math.round(form.sevenBox[sz].w * 1.6) }}×{{ Math.round(form.sevenBox[sz].h * 1.6) }}px
            </div>
          </div>
        </div>
      </section>
    </div>

    <footer class="page-footer" v-if="!loading && !loadError">
      <span class="save-state" :class="{ ok: savedOk, err: saveError }">{{ saveMsg }}</span>
      <div class="footer-actions">
        <button class="btn ghost" @click="resetDefaults">恢复默认</button>
        <button class="btn primary" :disabled="saving" @click="saveConfig">
          {{ saving ? '保存中…' : '保存参数' }}
        </button>
      </div>
      <p class="warn">注：保存后刷新页面即全站生效；进行中的战斗单位以新参数结算新伤害。</p>
    </footer>
  </div>
</template>

<script setup>
import { ref, reactive, watch, onMounted } from 'vue';
import { sizeAPI } from '../api/client.js';
import { setSizeConfigOverride, snapshotSizeConfig } from '../utils/unitSize.js';

const SIZES = ['s', 'm', 'l', 'xl'];

// 锁定比例：每档尺寸独立开关。开时改宽/高按当前比例联动另一边。
const lockRatio = reactive({ s: false, m: false, l: false, xl: false });
// 各尺寸基准比例（w/h），切换锁定时取当前值，未锁定时无效。
const ratio = reactive({ s: 1, m: 1, l: 1, xl: 1 });

function toggleLock(sz) {
  lockRatio[sz] = !lockRatio[sz];
  if (lockRatio[sz]) {
    // 锁定瞬间以当前宽高作为基准比例
    const w = Number(form.sevenBox[sz].w) || 1;
    const h = Number(form.sevenBox[sz].h) || 1;
    ratio[sz] = w / h;
  }
}

function onW(sz, e) {
  const w = Math.max(1, Math.round(Number(e.target.value) || 1));
  form.sevenBox[sz].w = w;
  if (lockRatio[sz]) {
    const h = Math.max(1, Math.round(w / ratio[sz]));
    form.sevenBox[sz].h = h;
  }
}

function onH(sz, e) {
  const h = Math.max(1, Math.round(Number(e.target.value) || 1));
  form.sevenBox[sz].h = h;
  if (lockRatio[sz]) {
    const w = Math.max(1, Math.round(h * ratio[sz]));
    form.sevenBox[sz].w = w;
  }
}
const DEFAULTS = {
  renderScale: { s: 0.82, m: 1.0, l: 1.22, xl: 1.5 },
  hpFactor: { s: 0.9, m: 1.0, l: 1.05, xl: 1.1 },
  mobFactor: { s: 1.1, m: 1.0, l: 0.95, xl: 0.9 },
  hitFactor: { s: 0.9, m: 1.0, l: 1.1, xl: 1.2 },
  sevenBox: {
    s: { w: 44, h: 40 },
    m: { w: 54, h: 54 },
    l: { w: 66, h: 67 },
    xl: { w: 82, h: 83 },
  },
};

const loading = ref(true);
const loadError = ref('');
const saving = ref(false);
const saveMsg = ref('');
const savedOk = ref(false);
const saveError = ref(false);

const form = reactive({
  renderScale: { ...DEFAULTS.renderScale },
  hpFactor: { ...DEFAULTS.hpFactor },
  mobFactor: { ...DEFAULTS.mobFactor },
  hitFactor: { ...DEFAULTS.hitFactor },
  sevenBox: {
    s: { ...DEFAULTS.sevenBox.s },
    m: { ...DEFAULTS.sevenBox.m },
    l: { ...DEFAULTS.sevenBox.l },
    xl: { ...DEFAULTS.sevenBox.xl },
  },
});

// 实时预览：收集各尺寸 canvas ref，按当前 sevenBox×1.6 重绘占位方块
const previewRefs = {};
function setPreviewRef(sz, el) {
  if (el) previewRefs[sz] = el;
}
const PREVIEW_COLORS = {
  s: '#5ad1ff', m: '#ffb000', l: '#ff7a45', xl: '#ff4d6d',
};
function drawPreview() {
  for (const sz of SIZES) {
    const el = previewRefs[sz];
    if (!el) continue;
    const ctx = el.getContext('2d');
    if (!ctx) continue;
    const w = el.width, h = el.height;
    ctx.clearRect(0, 0, w, h);
    const pw = Math.round(form.sevenBox[sz].w * 1.6);
    const ph = Math.round(form.sevenBox[sz].h * 1.6);
    ctx.fillStyle = PREVIEW_COLORS[sz] || '#ffb000';
    ctx.globalAlpha = 0.85;
    ctx.fillRect(4, 4, pw, ph);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(4, 4, pw, ph);
  }
}

function applyConfig(cfg) {
  if (!cfg) return;
  for (const sz of SIZES) {
    if (cfg.renderScale && typeof cfg.renderScale[sz] === 'number') form.renderScale[sz] = cfg.renderScale[sz];
    if (cfg.hpFactor && typeof cfg.hpFactor[sz] === 'number') form.hpFactor[sz] = cfg.hpFactor[sz];
    if (cfg.mobFactor && typeof cfg.mobFactor[sz] === 'number') form.mobFactor[sz] = cfg.mobFactor[sz];
    if (cfg.hitFactor && typeof cfg.hitFactor[sz] === 'number') form.hitFactor[sz] = cfg.hitFactor[sz];
    if (cfg.sevenBox && cfg.sevenBox[sz]) {
      form.sevenBox[sz] = { w: Number(cfg.sevenBox[sz].w), h: Number(cfg.sevenBox[sz].h) };
    }
    // 同步锁定比例基准（宽/高），供用户随后勾选锁定时使用（不自动锁定）
    const w = Number(form.sevenBox[sz].w) || 1;
    const h = Number(form.sevenBox[sz].h) || 1;
    ratio[sz] = w / h;
  }
  drawPreview();
}

async function loadConfig() {
  loading.value = true;
  loadError.value = '';
  try {
    const res = await sizeAPI.getConfig();
    const cfg = res?.data?.config || res?.config;
    applyConfig(cfg);
  } catch (e) {
    loadError.value = '加载体型配置失败：' + (e?.message || e);
  } finally {
    loading.value = false;
  }
}

// 实时联动：任意表单数值变化即重绘预览
watch(form, drawPreview, { deep: true });

function buildPayload() {
  const box = {};
  for (const sz of SIZES) box[sz] = { w: Number(form.sevenBox[sz].w), h: Number(form.sevenBox[sz].h) };
  return {
    renderScale: { s: Number(form.renderScale.s), m: Number(form.renderScale.m), l: Number(form.renderScale.l), xl: Number(form.renderScale.xl) },
    hpFactor: { s: Number(form.hpFactor.s), m: Number(form.hpFactor.m), l: Number(form.hpFactor.l), xl: Number(form.hpFactor.xl) },
    mobFactor: { s: Number(form.mobFactor.s), m: Number(form.mobFactor.m), l: Number(form.mobFactor.l), xl: Number(form.mobFactor.xl) },
    hitFactor: { s: Number(form.hitFactor.s), m: Number(form.hitFactor.m), l: Number(form.hitFactor.l), xl: Number(form.hitFactor.xl) },
    sevenBox: box,
  };
}

async function saveConfig() {
  saving.value = true;
  saveMsg.value = '';
  savedOk.value = false;
  saveError.value = false;
  try {
    const payload = buildPayload();
    const res = await sizeAPI.saveConfig(payload);
    if (res?.data?.ok || res?.ok) {
      // 写入前端 localStorage 覆盖，刷新即生效
      setSizeConfigOverride(payload);
      savedOk.value = true;
      saveMsg.value = '已保存，刷新页面即全站更新 ✓';
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
  applyConfig(JSON.parse(JSON.stringify(DEFAULTS)));
  saveMsg.value = '已恢复默认值，记得点「保存参数」';
  savedOk.value = false;
  saveError.value = false;
}

onMounted(loadConfig);
</script>

<style scoped>
.size-config-view {
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
.card.span-2 { grid-column: 1 / -1; }

.preview-row { display: flex; flex-wrap: wrap; gap: 18px; align-items: flex-end; margin-top: 8px; }
.preview-cell { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.preview-canvas { background: rgba(0, 0, 0, 0.25); border-radius: 4px; }
.preview-label { font-size: 11px; color: rgba(193, 232, 255, 0.6); text-align: center; line-height: 1.4; }
.card h2 { margin: 0 0 6px; font-size: 15px; color: #c1e8ff; letter-spacing: 1px; }
.card-hint { margin: 0 0 12px; font-size: 11px; color: rgba(193, 232, 255, 0.45); line-height: 1.5; }

.field { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; font-size: 12px; }
.field label { width: 70px; color: rgba(241, 243, 252, 0.7); flex-shrink: 0; }
.field input {
  width: 80px;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 176, 0, 0.2);
  color: #f1f3fc;
  border-radius: 5px;
  padding: 5px 8px;
  font-family: 'Fira Code', monospace;
}

.box-table { display: flex; flex-direction: column; gap: 6px; }
.box-head, .box-row { display: grid; grid-template-columns: 60px 90px 90px 70px 110px; gap: 12px; align-items: center; }
.box-head { font-size: 11px; color: rgba(193, 232, 255, 0.5); }
.lock-cell { display: inline-flex; align-items: center; gap: 4px; cursor: pointer; font-size: 14px; }
.lock-cell input[type="checkbox"] { width: 16px; height: 16px; accent-color: #ffb000; cursor: pointer; }
.lock-tip { margin-top: 10px; }
.box-row input {
  width: 80px;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 176, 0, 0.2);
  color: #f1f3fc;
  border-radius: 5px;
  padding: 5px 8px;
  font-family: 'Fira Code', monospace;
}
.sz-tag { color: #ffb000; font-weight: 700; font-family: 'Fira Code', monospace; }
.box-preview { color: #c1e8ff; font-family: 'Fira Code', monospace; font-size: 12px; }

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
.btn.primary { background: #ffb000; color: #0c0f1a; font-weight: 700; }
.btn.primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn.ghost { background: transparent; border: 1px solid rgba(255, 176, 0, 0.3); color: #ffb000; }
</style>
