<template>
  <div class="auth-page">
    <div class="bg-grid"></div>
    <div class="modal-card">
      <div class="tabs">
        <button :class="['tab', { active: mode === 'login' }]" @click="mode = 'login'">登录</button>
        <button :class="['tab', { active: mode === 'register' }]" @click="mode = 'register'">注册</button>
      </div>
      <div class="modal-header">
        <svg class="icon icon-lg" viewBox="0 0 24 24" style="color:#ffb000"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/></svg>
        <h1>{{ mode === 'login' ? '系统接入' : '新兵注册' }}</h1>
        <p class="subtitle">{{ mode === 'login' ? '输入凭据接入战术网络' : '创建档案加入机甲部队' }}</p>
      </div>
      <form v-if="mode === 'login'" @submit.prevent="handleLogin" class="form-body">
        <div class="input-group"><label>用户名</label><div class="input-row"><span class="prompt">&gt;</span><input v-model="loginForm.username" type="text" placeholder="输入用户名" /></div></div>
        <div class="input-group"><label>密码</label><div class="input-row"><span class="prompt">&gt;</span><input v-model="loginForm.password" type="password" placeholder="输入密码" /></div></div>
        <div v-if="error" class="error-msg">{{ error }}</div>
        <button type="submit" class="btn-primary" :disabled="loading">{{ loading ? '连接中...' : '接入系统' }}</button>
      </form>
      <form v-if="mode === 'register'" @submit.prevent="handleRegister" class="form-body">
        <div class="input-group"><label>用户名</label><div class="input-row"><span class="prompt">&gt;</span><input v-model="regForm.username" type="text" placeholder="选择呼号" /></div></div>
        <div class="input-group"><label>邮箱</label><div class="input-row"><span class="prompt">&gt;</span><input v-model="regForm.email" type="email" placeholder="通信频道" /></div></div>
        <div class="input-group"><label>密码</label><div class="input-row"><span class="prompt">&gt;</span><input v-model="regForm.password" type="password" placeholder="设置密钥" /></div></div>
        <div class="input-group"><label>确认密码</label><div class="input-row"><span class="prompt">&gt;</span><input v-model="regForm.verifyPassword" type="password" placeholder="再次确认密钥" /></div></div>
        <div v-if="error" class="error-msg">{{ error }}</div>
        <button type="submit" class="btn-primary" :disabled="loading">{{ loading ? '注册中...' : '创建档案' }}</button>
      </form>
      <div class="modal-footer-dec">
        <div class="status-row"><span class="dot"></span> 节点: XT-45-GAMMA <span class="sep">|</span> <span>加密通道就绪</span></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { authAPI } from '@/api/client'

const router = useRouter()
const mode = ref('register')
const loading = ref(false)
const error = ref('')
const loginForm = ref({ username: '', password: '' })
const regForm = ref({ username: '', email: '', password: '', verifyPassword: '' })

async function handleLogin() {
  error.value = ''
  if (!loginForm.value.username || !loginForm.value.password) { error.value = '请填写所有字段'; return }
  loading.value = true
  try {
    const { data } = await authAPI.login({ username: loginForm.value.username, password: loginForm.value.password })
    localStorage.setItem('token', data.token)
    router.push('/home')
  } catch (e) {
    error.value = e.response?.data?.message || '凭据验证失败，请重试'
  } finally { loading.value = false }
}

async function handleRegister() {
  error.value = ''
  const { username, email, password, verifyPassword } = regForm.value
  if (!username || !email || !password || !verifyPassword) { error.value = '请填写所有字段'; return }
  if (password !== verifyPassword) { error.value = '两次输入的密码不一致'; return }
  if (password.length < 6) { error.value = '密码至少需要 6 个字符'; return }
  loading.value = true
  try {
    await authAPI.register({ username, email, password })
    error.value = ''
    mode.value = 'login'
    loginForm.value.username = username
    loginForm.value.password = ''
  } catch (e) {
    error.value = e.response?.data?.message || '注册失败，请重试'
  } finally { loading.value = false }
}
</script>

<style scoped>
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
.auth-page { min-height: 100vh; background: #001620; display: flex; align-items: center; justify-content: center; padding: 24px; position: relative; overflow: hidden; }
.bg-grid { position: absolute; inset: 0; opacity: 0.04; background-image: radial-gradient(circle, #9f8e78 1px, transparent 1px); background-size: 24px 24px; pointer-events: none; }
.icon { width: 1em; height: 1em; display: inline-block; vertical-align: middle; fill: currentColor; flex-shrink: 0; }
.icon-lg { font-size: 2.5rem; }
.modal-card { position: relative; z-index: 2; width: 100%; max-width: 420px; background: #001e2b; border: 1px solid rgba(255,176,0,0.25); box-shadow: 0 0 40px rgba(255,176,0,0.05); }
.tabs { display: flex; border-bottom: 1px solid rgba(255,176,0,0.15); }
.tab { flex: 1; padding: 14px; background: transparent; border: none; color: rgba(193,232,255,0.45); font-family: inherit; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.15s; letter-spacing: 0.05em; }
.tab:hover { color: #ffd597; background: rgba(255,176,0,0.05); }
.tab.active { color: #ffb000; border-bottom: 2px solid #ffb000; background: rgba(255,176,0,0.05); }
.modal-header { padding: 28px 32px 0; text-align: center; }
.modal-header h1 { font-size: 22px; font-weight: 900; color: #c1e8ff; letter-spacing: 0.08em; margin: 12px 0 6px; }
.subtitle { font-size: 12px; color: rgba(193,232,255,0.5); font-family: 'Fira Code', monospace; margin-bottom: 4px; }
.form-body { padding: 24px 32px 32px; display: flex; flex-direction: column; gap: 20px; }
.input-group label { display: block; font-size: 10px; font-weight: 700; color: #ffd597; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 6px; }
.input-row { display: flex; align-items: center; border-bottom: 2px solid rgba(159,142,120,0.3); padding: 4px 0; transition: border-color 0.2s; }
.input-row:focus-within { border-bottom-color: #ffb000; }
.prompt { color: #ffb000; font-weight: 700; font-size: 16px; margin-right: 10px; font-family: 'Fira Code', monospace; }
.input-row input { flex: 1; background: transparent; border: none; color: #c1e8ff; font-family: 'Fira Code', monospace; font-size: 14px; outline: none; padding: 6px 0; }
.input-row input::placeholder { color: rgba(193,232,255,0.25); }
.error-msg { background: rgba(255,77,77,0.1); border-left: 3px solid #ff4d4d; padding: 10px 14px; color: #ff6b6b; font-size: 12px; font-family: 'Fira Code', monospace; }
.btn-primary { width: 100%; padding: 14px; background: #ffb000; color: #0a1628; font-weight: 900; font-size: 14px; letter-spacing: 0.15em; text-transform: uppercase; border: none; cursor: pointer; transition: background 0.15s, transform 0.1s; margin-top: 4px; }
.btn-primary:hover { background: #ffc840; }
.btn-primary:active { transform: scale(0.97); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.modal-footer-dec { padding: 14px 32px; border-top: 1px solid rgba(255,176,0,0.08); }
.status-row { font-family: 'Fira Code', monospace; font-size: 10px; color: rgba(193,232,255,0.4); display: flex; align-items: center; justify-content: center; gap: 10px; letter-spacing: 0.05em; }
.dot { width: 6px; height: 6px; background: #13ff43; border-radius: 50%; animation: pulse 2s infinite; }
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
.sep { color: #9f8e78; }
</style>
