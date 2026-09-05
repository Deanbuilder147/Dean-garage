<template>
  <div class="bug-report-page">
    <div class="br-card">
      <h1 class="br-title">🐞 遇到问题？告诉我们</h1>
      <p class="br-sub">哪怕只用一句话描述就行，越自然越好。我们会尽快查看。</p>

      <div class="br-field">
        <label class="br-label">问题描述 <span class="req">*</span></label>
        <textarea
          v-model="form.description"
          class="br-textarea"
          rows="6"
          maxlength="2000"
          placeholder="例如：我在战斗里点「结束回合」之后，画面卡住不动了，只能刷新页面。当时是在一张有河流的地图。"
        ></textarea>
        <div class="br-count">{{ form.description.length }}/2000</div>
      </div>

      <div class="br-row">
        <div class="br-field">
          <label class="br-label">大概是哪个模块？（可选，点一下即可）</label>
          <div class="br-chips">
            <button
              v-for="m in modules"
              :key="m"
              type="button"
              class="br-chip"
              :class="{ active: form.module === m }"
              @click="form.module = m"
            >{{ m }}</button>
          </div>
        </div>
      </div>

      <div class="br-row">
        <div class="br-field">
          <label class="br-label">严重程度？（可选）</label>
          <div class="br-chips">
            <button
              v-for="s in severities"
              :key="s"
              type="button"
              class="br-chip"
              :class="['sev-' + s, { active: form.severity === s }]"
              @click="form.severity = s"
            >{{ s }}</button>
          </div>
        </div>
      </div>

      <div class="br-row br-two">
        <div class="br-field">
          <label class="br-label">怎么称呼你？（可选）</label>
          <input v-model="form.reporterName" class="br-input" maxlength="60" placeholder="昵称 / 游戏 ID" />
        </div>
        <div class="br-field">
          <label class="br-label">联系方式（可选）</label>
          <input v-model="form.contact" class="br-input" maxlength="120" placeholder="QQ / 微信 / 邮箱，方便回访" />
        </div>
      </div>

      <div class="br-actions">
        <button class="btn btn-primary br-submit" :disabled="submitting || !form.description.trim()" @click="submit">
          {{ submitting ? '提交中…' : '提交反馈' }}
        </button>
        <span v-if="msg" class="br-msg" :class="msgType">{{ msg }}</span>
      </div>

      <p class="br-tip">提示：不用登录也能提交。如果你已登录，我们会自动记录你的账号，方便后续跟进。</p>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue';
import { bugReportAPI } from '../api/client.js';

const modules = ['战斗', '棋盘/地图', '棋子/七视图', '账号/权限', '房间/联机', 'UI/显示', '其他'];
const severities = ['崩溃', '严重', '一般', '建议'];

const form = reactive({
  description: '',
  module: '其他',
  severity: '一般',
  reporterName: '',
  contact: '',
});

const submitting = ref(false);
const msg = ref('');
const msgType = ref('');

async function submit() {
  if (!form.description.trim()) return;
  submitting.value = true;
  msg.value = '';
  try {
    await bugReportAPI.submit({ ...form });
    msg.value = '已收到，感谢你的反馈！🎉';
    msgType.value = 'ok';
    form.description = '';
    form.reporterName = '';
    form.contact = '';
    form.module = '其他';
    form.severity = '一般';
  } catch (e) {
    msg.value = '提交失败：' + (e?.response?.data?.message || e.message);
    msgType.value = 'err';
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.bug-report-page {
  max-width: 680px;
  margin: 0 auto;
  padding: 32px 16px 64px;
}
.br-card {
  background: linear-gradient(160deg, rgba(40, 32, 22, 0.92), rgba(28, 22, 16, 0.92));
  border: 1px solid rgba(255, 176, 0, 0.25);
  border-radius: 14px;
  padding: 28px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
}
.br-title { color: #ffb000; font-size: 24px; margin: 0 0 6px; }
.br-sub { color: #cbb89a; font-size: 14px; margin: 0 0 22px; }
.br-field { margin-bottom: 18px; }
.br-label { display: block; color: #ffd597; font-size: 13px; margin-bottom: 8px; letter-spacing: 0.5px; }
.req { color: #f472b6; }
.br-textarea, .br-input {
  width: 100%;
  background: rgba(15, 12, 9, 0.7);
  border: 1px solid rgba(159, 142, 120, 0.3);
  border-radius: 8px;
  color: #f3ead6;
  font-size: 14px;
  padding: 10px 12px;
  font-family: inherit;
  resize: vertical;
}
.br-textarea:focus, .br-input:focus { outline: none; border-color: #ffb000; }
.br-count { text-align: right; color: #8a7c66; font-size: 12px; margin-top: 4px; }
.br-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.br-chip {
  background: rgba(159, 142, 120, 0.12);
  border: 1px solid rgba(159, 142, 120, 0.3);
  color: #e2d8c2;
  border-radius: 16px;
  padding: 6px 14px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}
.br-chip:hover { border-color: #ffb000; }
.br-chip.active { background: rgba(255, 176, 0, 0.22); border-color: #ffb000; color: #ffd597; }
.br-chip.sev-崩溃.active { background: rgba(244, 63, 94, 0.25); border-color: #f43f5e; color: #fecdd3; }
.br-chip.sev-严重.active { background: rgba(249, 115, 22, 0.25); border-color: #f97316; color: #fed7aa; }
.br-chip.sev-建议.active { background: rgba(56, 189, 248, 0.22); border-color: #38bdf8; color: #bae6fd; }
.br-two { display: flex; gap: 14px; }
.br-two .br-field { flex: 1; }
.br-actions { display: flex; align-items: center; gap: 14px; margin-top: 8px; }
.br-submit { padding: 11px 28px; font-size: 15px; }
.br-msg { font-size: 13px; }
.br-msg.ok { color: #4ade80; }
.br-msg.err { color: #f87171; }
.br-tip { color: #8a7c66; font-size: 12px; margin-top: 18px; line-height: 1.6; }
@media (max-width: 520px) { .br-two { flex-direction: column; gap: 0; } }
</style>
