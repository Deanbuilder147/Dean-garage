import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import { createPinia } from 'pinia'
import App from './App.vue'

// 导入视图
import BattlefieldListView from './views/BattlefieldListView.vue'
import BattlefieldEditorView from './views/BattlefieldEditorView.vue'
import BattleView from './views/BattleView.vue'

// 路由配置
const routes = [
  { path: '/', redirect: '/battlefields' },
  { path: '/battlefields', component: BattlefieldListView, meta: { requiresAuth: true } },
  { path: '/battlefields/new', component: BattlefieldEditorView, meta: { requiresAuth: true } },
  { path: '/battlefields/:id', component: BattlefieldEditorView, meta: { requiresAuth: true } },
  { path: '/battle/:id', component: BattleView, meta: { requiresAuth: true } }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// 路由守卫
router.beforeEach((to, from, next) => {
  const token = localStorage.getItem('token')
  const isLoggedIn = !!token
  
  if (to.meta.requiresAuth && !isLoggedIn) {
    window.location.href = 'http://localhost:8081/login'
    return
  }
  
  next()
})

const pinia = createPinia()
const app = createApp(App)

app.use(pinia)
app.use(router)
app.mount('#app')

console.log('🚀 Battle Map App started on port 8083')
