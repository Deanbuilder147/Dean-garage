import { createApp } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import { createPinia } from 'pinia';
import App from './App.vue';

import './styles/variables.css';
import './styles/tailwind.css';

// 视图导入
import NewLoginView from './views/NewLoginView.vue';
import NewRegisterView from './views/NewRegisterView.vue';
import NewHomeView from './views/NewHomeView.vue';
import GlossaryView from './views/GlossaryView.vue';
import NewUnitEditorView from './views/NewUnitEditorView.vue';
import NewBattlefieldSelector from './views/NewBattlefieldSelector.vue';
import NewBattleView from './views/NewBattleView.vue';
import NewBattlefieldView from './views/NewBattlefieldView.vue';
import NewPreparationRoom from './views/NewPreparationRoom.vue';

// Phase 13-A: 设备分流
import MobileBattleView from './views/MobileBattleView.vue';
import { detectDevice } from './utils/deviceDetector.js';

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
  { path: '/glossary', component: GlossaryView, meta: { requiresAuth: true } },
  { path: '/preparation/:roomId', component: NewPreparationRoom, meta: { requiresAuth: true } },

  // Phase 13-A: 设备专属分流路由
  { path: '/battle-pc/:id', component: NewBattleView, meta: { requiresAuth: true, device: 'pc' } },
  { path: '/battle-mobile/:id', component: MobileBattleView, meta: { requiresAuth: true, device: 'mobile' } },

  // 旧 /battle/:id 保留作为兼容入口，由导航守卫自动分流重定向
  { path: '/battle/:id', meta: { requiresAuth: true, redirectByDevice: true } }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

// 路由守卫
router.beforeEach((to, from, next) => {
  const token = localStorage.getItem('token');
  const isLoggedIn = !!token;

  // Phase 13-A: /battle/:id 自动分流为 /battle-pc/:id 或 /battle-mobile/:id
  if (to.meta.redirectByDevice && to.params.id) {
    const device = detectDevice();
    const targetPath = device.isPC
      ? `/battle-pc/${to.params.id}`
      : `/battle-mobile/${to.params.id}`;
    console.log(
      `[DeviceRouter] 设备分流: type=${device.type}, width=${device.width}, ` +
      `${to.path} → ${targetPath}`
    );
    next(targetPath);
    return;
  }

  if (to.path === '/' || to.path === '/login' || to.path === '/register') {
    next();
  }
  else if (to.meta.requiresAuth && !isLoggedIn) {
    next('/');
  }
  else {
    next();
  }
});

const pinia = createPinia();
const app = createApp(App);

app.use(pinia);
app.use(router);
app.mount('#app');
