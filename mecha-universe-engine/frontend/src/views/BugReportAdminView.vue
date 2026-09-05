<template>
  <div class="bra" v-if="isDominator">
    <div class="bra-head">
      <h1 class="bra-title">🐞 Bug 问题汇总</h1>
      <div class="bra-tools">
        <select v-model="filters.status" class="bra-select" @change="reload">
          <option value="">全部状态</option>
          <option v-for="s in summary.statuses" :key="s" :value="s">{{ s }} ({{ summary.byStatus[s] || 0 }})</option>
        </select>
        <select v-model="filters.module" class="bra-select" @change="reload">
          <option value="">全部模块</option>
          <option v-for="m in summary.modules" :key="m" :value="m">{{ m }}</option>
        </select>
        <select v-model="filters.severity" class="bra-select" @change="reload">
          <option value="">全部严重程度</option>
          <option v-for="sv in summary.severities" :key="sv" :value="sv">{{ sv }}</option>
        </select>
        <input v-model="filters.q" class="bra-input" placeholder="搜索描述/标题/提交人" @input="debouncedReload" />
        <a class="btn btn-add bra-export" :href="bugReportAPI.exportUrl(filters.status)" target="_blank">⬇ 导出 CSV</a>
      </div>
    </div>

    <div class="bra-stat">
      共 <b>{{ summary.total }}</b> 条 ·
      <span v-for="s in summary.statuses" :key="s" class="bra-pill" :class="'st-' + s">{{ s }} {{ summary.byStatus[s] || 0 }}</span>
    </div>

    <div v-if="loading" class="bra-loading">加载中…</div>
    <ul v-else class="bra-list">
      <li v-for="r in reports" :key="r.id" class="bra-item">
        <div class="bra-item-head">
          <span class="bra-mod">{{ r.module }}</span>
          <span class="bra-sev" :class="'sev-' + r.severity">{{ r.severity }}</span>
          <span class="bra-time">{{ r.created_at }}</span>
          <span class="bra-reporter">{{ r.reporter_name }}<template v-if="r.contact"> · {{ r.contact }}</template></span>
          <select
            :value="r.status"
            class="bra-status"
            :class="'st-' + r.status"
            @change="changeStatus(r, $event.target.value)"
          >
            <option v-for="s in summary.statuses" :key="s" :value="s">{{ s }}</option>
          </select>
        </div>
        <div v-if="r.title" class="bra-item-title">【{{ r.title }}】</div>
        <div class="bra-item-desc">{{ r.description }}</div>
      </li>
      <li v-if="!reports.length" class="bra-empty">暂无匹配的反馈</li>
    </ul>
  </div>
  <div v-else class="bra-deny">该页面仅主宰（dominator）可访问。</div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { bugReportAPI, authAPI } from '../api/client.js';
import { useUserStore } from '../stores/user.js';

const isDominator = ref(false);
const reports = ref([]);
const loading = ref(false);
const summary = reactive({ total: 0, byStatus: {}, modules: [], severities: [], statuses: [] });
const filters = reactive({ status: '', module: '', severity: '', q: '' });
let timer = null;

async function checkRole() {
  // 优先用本地 store 的 user.role（登录时已写入），回退到 /auth/me 拉取
  // 管理员(admin)/裁判(referee)/主宰(dominator)均可访问 Bug 汇总页
  const ADMIN_ROLES = ['dominator', 'admin', 'referee'];
  const userStore = useUserStore();
  const localRole = userStore.user?.role;
  if (localRole) {
    isDominator.value = ADMIN_ROLES.includes(localRole);
    return;
  }
  try {
    const me = await authAPI.me();
    isDominator.value = ADMIN_ROLES.includes(me?.role);
  } catch {
    isDominator.value = false;
  }
}

async function reload() {
  loading.value = true;
  try {
    const res = await bugReportAPI.list({ ...filters });
    reports.value = res.reports || [];
    Object.assign(summary, res.summary || {});
  } catch (e) {
    console.error('加载反馈失败', e);
  } finally {
    loading.value = false;
  }
}

function debouncedReload() {
  clearTimeout(timer);
  timer = setTimeout(reload, 350);
}

async function changeStatus(r, status) {
  try {
    await bugReportAPI.updateStatus(r.id, status);
    r.status = status;
    Object.assign(summary, (await bugReportAPI.list({ ...filters })).summary);
  } catch (e) {
    alert('更新失败：' + (e?.response?.data?.message || e.message));
  }
}

onMounted(async () => {
  await checkRole();
  if (isDominator.value) reload();
});
</script>

<style scoped>
.bra { max-width: 960px; margin: 0 auto; padding: 28px 16px 64px; }
.bra-title { color: #ffb000; font-size: 22px; margin: 0 0 14px; }
.bra-tools { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 14px; }
.bra-select, .bra-input {
  background: rgba(15, 12, 9, 0.7);
  border: 1px solid rgba(159, 142, 120, 0.3);
  color: #f3ead6;
  border-radius: 7px;
  padding: 7px 10px;
  font-size: 13px;
}
.bra-input { flex: 1; min-width: 160px; }
.bra-export { text-decoration: none; padding: 8px 14px; font-size: 13px; }
.bra-stat { color: #cbb89a; font-size: 13px; margin-bottom: 14px; }
.bra-stat b { color: #ffd597; }
.bra-pill { display: inline-block; margin-left: 8px; padding: 2px 10px; border-radius: 12px; font-size: 12px; }
.bra-pill.st-待处理 { background: rgba(148,163,184,0.2); color: #cbd5e1; }
.bra-pill.st-处理中 { background: rgba(249,115,22,0.2); color: #fed7aa; }
.bra-pill.st-已修复 { background: rgba(74,222,128,0.2); color: #bbf7d0; }
.bra-pill.st-已关闭 { background: rgba(100,116,139,0.2); color: #94a3b8; }
.bra-pill.st-不予处理 { background: rgba(244,63,94,0.18); color: #fecdd3; }
.bra-loading { color: #94a3b8; padding: 30px; text-align: center; }
.bra-list { list-style: none; margin: 0; padding: 0; }
.bra-item {
  background: rgba(40, 32, 22, 0.6);
  border: 1px solid rgba(159, 142, 120, 0.18);
  border-radius: 10px;
  padding: 14px 16px;
  margin-bottom: 12px;
}
.bra-item-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.bra-mod { color: #ffd597; font-size: 12px; background: rgba(255,176,0,0.12); padding: 2px 10px; border-radius: 10px; }
.bra-sev { font-size: 12px; padding: 2px 10px; border-radius: 10px; }
.bra-sev.sev-崩溃 { background: rgba(244,63,94,0.2); color: #fecdd3; }
.bra-sev.sev-严重 { background: rgba(249,115,22,0.2); color: #fed7aa; }
.bra-sev.sev-一般 { background: rgba(148,163,184,0.2); color: #cbd5e1; }
.bra-sev.sev-建议 { background: rgba(56,189,248,0.2); color: #bae6fd; }
.bra-time { color: #8a7c66; font-size: 12px; }
.bra-reporter { color: #cbb89a; font-size: 12px; flex: 1; }
.bra-status { background: rgba(15,12,9,0.7); border: 1px solid rgba(159,142,120,0.3); color: #f3ead6; border-radius: 6px; padding: 4px 8px; font-size: 12px; }
.bra-status.st-已修复 { border-color: #4ade80; color: #bbf7d0; }
.bra-status.st-处理中 { border-color: #f97316; color: #fed7aa; }
.bra-item-title { color: #ffb000; font-size: 13px; margin: 8px 0 4px; }
.bra-item-desc { color: #e7ddc9; font-size: 14px; line-height: 1.7; white-space: pre-wrap; word-break: break-word; }
.bra-empty { color: #94a3b8; text-align: center; padding: 30px; }
.bra-deny { color: #f87171; text-align: center; padding: 60px; }
</style>
