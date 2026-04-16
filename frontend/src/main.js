import { createApp } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import { createPinia } from 'pinia';
import App from './App.vue';

// 导入Google Fonts - 暂时注释，防止加载失败阻塞脚本
// import 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&display=swap';

// 导入全局样式变量
import './styles/variables.css';

// 导入视图
import LoginView from './views/LoginView.vue';
import RegisterView from './views/RegisterView.vue';
import HomeView from './views/HomeView.vue';
import UnitEditorView from './views/UnitEditorView.vue';
import BattlefieldView from './views/BattlefieldView.vue';
import BattleView from './views/BattleView.vue';
import PreparationRoom from './views/PreparationRoom.vue';

// 路由配置
const routes = [
  { path: '/', redirect: '/home' },
  { path: '/login', component: LoginView, meta: { guest: true } },
  { path: '/register', component: RegisterView, meta: { guest: true } },
  { path: '/home', component: HomeView, meta: { requiresAuth: true } },
  { path: '/units', component: UnitEditorView, meta: { requiresAuth: true } },
  { path: '/units/new', component: UnitEditorView, meta: { requiresAuth: true } },
  { path: '/units/:id', component: UnitEditorView, meta: { requiresAuth: true } },
  { path: '/battlefields', component: BattlefieldView, meta: { requiresAuth: true } },
  { path: '/battle/:id', component: BattleView, meta: { requiresAuth: true } },
  { path: '/preparation/:roomId', component: PreparationRoom, meta: { requiresAuth: true } }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

// 路由守卫
router.beforeEach((to, from, next) => {
  const token = localStorage.getItem('token');
  const isLoggedIn = !!token;
  
  // 需要认证但未登录 → 跳转登录页
  if (to.meta.requiresAuth && !isLoggedIn) {
    next('/login');
  }
  // 已登录但访问登录/注册页 → 跳转主页
  else if (to.meta.guest && isLoggedIn) {
    next('/home');
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
