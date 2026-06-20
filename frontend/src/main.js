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
import TerminalView from './views/TerminalView.vue';

// 路由配置
const routes = [
  { path: '/', component: NewLoginView },
  { path: '/login', component: NewLoginView },
  { path: '/register', component: NewRegisterView },
  { path: '/terminal', component: TerminalView },
  { path: '/home', component: NewHomeView, meta: { requiresAuth: true } },
  { path: '/units', component: NewUnitEditorView, meta: { requiresAuth: true } },
  { path: '/units/new', component: NewUnitEditorView, meta: { requiresAuth: true } },
  { path: '/units/:id', component: NewUnitEditorView, meta: { requiresAuth: true } },
  { path: '/battlefields', component: NewBattlefieldSelector, meta: { requiresAuth: true } },
  { path: '/battlefield-edit/:id?', component: NewBattlefieldView, meta: { requiresAuth: true } },
  { path: '/glossary', component: GlossaryView, meta: { requiresAuth: true } },
  { path: '/battle/:id', component: NewBattleView, meta: { requiresAuth: true } },
  { path: '/preparation/:roomId', component: NewPreparationRoom, meta: { requiresAuth: true } }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

// 路由守卫
router.beforeEach((to, from, next) => {
  const token = localStorage.getItem('token');
  const isLoggedIn = !!token;
  
  if (to.path === '/' || to.path === '/login' || to.path === '/register' || to.path === '/terminal') {
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
