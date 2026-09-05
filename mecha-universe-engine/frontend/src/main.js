import { createApp } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import { createPinia } from 'pinia';
import App from './App.vue';

import './styles/variables.css';
import './styles/tailwind.css';
// 统一前端风格（词条库琥珀标准）——最后导入，保证覆盖各页 scoped 样式
import './styles/glossary-theme.css';

// 视图导入
import NewLoginView from './views/NewLoginView.vue';
import NewRegisterView from './views/NewRegisterView.vue';
import NewHomeView from './views/NewHomeView.vue';
import GlossaryView from './views/GlossaryView.vue';
import DiceConfigView from './views/DiceConfigView.vue';
import NewUnitEditorView from './views/NewUnitEditorView.vue';
import NewBattlefieldSelector from './views/NewBattlefieldSelector.vue';
import NewBattleView from './views/NewBattleView.vue';
import NewBattlefieldView from './views/NewBattlefieldView.vue';
import NewPreparationRoom from './views/NewPreparationRoom.vue';
import AssetGenPanel from './components/AssetGenPanel.vue';
import AdminPermissionsView from './views/AdminPermissionsView.vue';
import BugReportView from './views/BugReportView.vue';
import BugReportAdminView from './views/BugReportAdminView.vue';
import AdminCenterView from './views/AdminCenterView.vue';
import GlossaryCarouselView from './views/GlossaryCarouselView.vue';

// Phase 13-A: 设备分流
import MobileBattleView from './views/MobileBattleView.vue';
import BattleEntryView from './views/BattleEntryView.vue';
import { useUserStore } from './stores/user.js';

// 路由配置
const routes = [
  { path: '/', component: NewLoginView },
  { path: '/login', component: NewLoginView },
  { path: '/register', component: NewRegisterView },
  { path: '/home', component: NewHomeView, meta: { requiresAuth: true } },
  { path: '/units', component: NewUnitEditorView, meta: { requiresAuth: true } },
  { path: '/units/new', component: NewUnitEditorView, meta: { requiresAuth: true } },
  { path: '/units/:id', component: NewUnitEditorView, meta: { requiresAuth: true } },
  { path: '/battlefields', component: NewBattlefieldSelector, meta: { requiresAuth: true } },
  { path: '/battlefield-edit/:id?', component: NewBattlefieldView, meta: { requiresAuth: true } },
  // /glossary 为词条库应急页面（暂不维护，仅作回退备份）；新词条库中枢请走 /glossary-studio
  { path: '/glossary', component: GlossaryView, meta: { requiresAuth: true, emergency: true, emergencyNote: '词条库应急页面，暂不维护' } },
  { path: '/glossary-studio', component: () => import('./views/GlossaryHubNew.vue'), meta: { requiresAuth: true } },
  { path: '/glossary-carousel', component: GlossaryCarouselView, meta: { requiresAuth: true, title: '词条展示' } },
  // 独立验证页：六段式画布净化版（WHEN/IF/ROLL/DO/AFTER/COST），确认无误后替换 /glossary-studio
  { path: '/glossary-studio-v2', component: () => import('./views/GlossaryStudio.vue'), meta: { requiresAuth: true } },
  // ★ 并行新增：词条锻造双皮肤（2026-09-02）
  //   严禁替换/覆盖现有词条库页面（/glossary、/glossary-studio、/glossary-studio-v2、/glossary-carousel），
  //   以下两条为新增路由，与原有页面共存，可独立测试编辑。
  { path: '/glossary-forge-prism', component: () => import('./views/GlossaryForgePrismView.vue'), meta: { requiresAuth: true, title: '词条锻造·棱柱工坊' } },
  { path: '/glossary-forge-blueprint', component: () => import('./views/GlossaryForgeBlueprintView.vue'), meta: { requiresAuth: true, title: '词条锻造·蓝图' } },
  { path: '/dice-config', component: DiceConfigView, meta: { requiresAuth: true, requiresRole: ['admin', 'dominator'] } },
  { path: '/size-config', component: () => import('./views/SizeConfigView.vue'), meta: { requiresAuth: true, requiresRole: ['admin', 'dominator'] } },
  { path: '/preparation/:roomId', component: NewPreparationRoom, meta: { requiresAuth: true } },
  { path: '/asset-gen', component: AssetGenPanel, meta: { requiresAuth: true } },
  { path: '/admin', component: AdminPermissionsView, meta: { requiresAuth: true, requiresRole: 'dominator', title: '后台管理' } },
  { path: '/admin-center', component: AdminCenterView, meta: { requiresAuth: true, requiresRole: ['admin', 'referee', 'dominator'], title: '后台管理' } },
  { path: '/bug-report', component: BugReportView, meta: { title: '问题反馈' } },
  { path: '/bug-report-admin', component: BugReportAdminView, meta: { requiresAuth: true, requiresRole: 'dominator', title: 'Bug 汇总' } },
  { path: '/unit-library', component: () => import('./views/UnitLibraryView.vue'), meta: { title: '棋子库' } },
  { path: '/my-units', component: () => import('./views/MyUnitsView.vue'), meta: { requiresAuth: true, title: '我的投稿' } },
  { path: '/unit-review', component: () => import('./views/UnitReviewView.vue'), meta: { requiresAuth: true, requiresRole: ['referee', 'dominator'], title: '棋子审核台' } },
  { path: '/map-review', component: () => import('./views/MapReviewView.vue'), meta: { requiresAuth: true, requiresRole: ['admin', 'dominator'], title: '地图审核台' } },

  // Phase 13-A: 设备专属分流路由
  { path: '/battle-pc/:id', component: NewBattleView, meta: { requiresAuth: true, device: 'pc' } },
  { path: '/battle-mobile/:id', component: MobileBattleView, meta: { requiresAuth: true, device: 'mobile' } },

  // /battle/:id 为显式视角选择入口（用户手动选 PC / 移动版），不再自动分流
  { path: '/battle/:id', component: BattleEntryView, meta: { requiresAuth: true } }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

// 路由守卫
router.beforeEach((to, from, next) => {
  const token = localStorage.getItem('token');
  const isLoggedIn = !!token;

  if (to.path === '/' || to.path === '/login' || to.path === '/register') {
    next();
  }
  else if (to.meta.requiresAuth && !isLoggedIn) {
    next('/');
  }
  else if (to.meta.requiresRole) {
    // 角色守卫：仅指定角色（或角色数组）可进入。
    // 支持单角色字符串或数组（如 ['admin','dominator']）。
    // 使用 localStorage 中的 token 作为登录态来源（与 requiresAuth 分支一致），
    // 避免 store.token 与 localStorage 不同步时误判未登录。
    const userStore = useUserStore();
    const u = userStore.user;
    const allowed = Array.isArray(to.meta.requiresRole)
      ? to.meta.requiresRole
      : [to.meta.requiresRole];
    if (isLoggedIn && u && allowed.includes(u.role)) {
      next();
    } else {
      next('/home');
    }
  }
  else {
    next();
  }
});

const pinia = createPinia();
const app = createApp(App);

app.use(pinia);
const userStore = useUserStore();
// 启动时从 localStorage 恢复 user（token 已在 store 初始化时读取），
// 避免刷新后 user 为 null 导致 requiresRole 守卫误判、后台入口消失。
// token 来源兼容：localStorage.token 优先，回落 localStorage.user.token（登录侧实际写入位置）
function getBootToken() {
  const direct = localStorage.getItem('token');
  if (direct) return direct;
  try {
    const u = JSON.parse(localStorage.getItem('user') || '{}');
    return u && u.token ? u.token : null;
  } catch {
    return null;
  }
}
const bootToken = getBootToken();

// 安全策略：本地 user 仅作首屏占位，服务端 /me 为权威来源。
// 前端门禁(isHost/isGM/requiresRole)只是 UX，真实权限由后端 req.auth 强制校验，
// 因此即使本地 user 被篡改（如控制台伪造 role），也会被 /me 基于真实 token 纠正。
if (bootToken && localStorage.getItem('user')) {
  try {
    const cached = JSON.parse(localStorage.getItem('user'));
    if (cached && cached.id) userStore.setUser(cached); // 仅首屏占位，稍后被 /me 覆盖
  } catch (e) {
    /* 忽略损坏的本地 user 数据 */
  }
}
// 兜底自愈 + 权威刷新：只要有 token，一律拉 /me 用服务端真实身份覆盖本地，
// 确保准备房等页面的房主/GM 门禁 isHost/isGM 正确（否则「无法删除房间 / 无法开始战斗」）。
// token 失效（如过期）时清理本地会话，避免「显示已登录但请求全 401」的僵尸态。
if (bootToken) {
  fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + bootToken } })
    .then((r) => {
      if (r.ok) return r.json();
      if (r.status === 401) {
        localStorage.removeItem('user');
        userStore.clearUser();
      }
      return null;
    })
    .then((profile) => { if (profile && profile.id) userStore.setUser(profile); })
    .catch(() => { /* 忽略自愈失败，下次启动再补 */ });
}
app.use(router);
app.mount('#app');
