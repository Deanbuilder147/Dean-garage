import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import { createPinia } from 'pinia'
import App from './App.vue'

// 导入视图
import UnitListView from './views/UnitListView.vue'
import UnitEditorView from './views/UnitEditorView.vue'

// 路由配置
const routes = [
  { path: '/', redirect: '/units' },
  { path: '/units', component: UnitListView, meta: { requiresAuth: true } },
  { path: '/units/new', component: UnitEditorView, meta: { requiresAuth: true } },
  { path: '/units/:id', component: UnitEditorView, meta: { requiresAuth: true } }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// 路由守卫 - 检查登录状态
router.beforeEach((to, from, next) => {
  const token = localStorage.getItem('token')
  const isLoggedIn = !!token
  
  if (to.meta.requiresAuth && !isLoggedIn) {
    // 重定向到主应用登录页
    window.location.href = 'http://localhost:8081/login'
    return
  }
  
  next()
})

// 创建 Pinia 实例
const pinia = createPinia()

// 创建 Vue 应用
const app = createApp(App)

app.use(pinia)
app.use(router)
app.mount('#app')

console.log('🚀 Unit Editor App started on port 8082')
