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
      <form v-if="mode === 'login'" @submit.prevent="handleLogin" class="login-form">
        <div class="login-field-row flex flex-col mb-4">
          <label for="username-field" class="login-label text-sm mb-2 cursor-pointer select-none">
            账号 / 邮箱
          </label>
          <input
            id="username-field"
            name="username"
            type="text"
            v-model="loginForm.username"
            autocomplete="username"
            placeholder="请输入您的账号"
            class="login-input p-2 bg-[#002233] text-white border border-white/10 rounded focus:border-[#ffb000]/50"
          />
        </div>

        <div class="login-field-row flex flex-col mb-6">
          <label for="password-field" class="login-label text-sm mb-2 cursor-pointer select-none">
            密码
          </label>
          <input
            id="password-field"
            name="password"
            type="password"
            v-model="loginForm.password"
            autocomplete="current-password"
            placeholder="请输入密码"
            class="login-input p-2 bg-[#002233] text-white border border-white/10 rounded focus:border-[#ffb000]/50"
          />
        </div>

        <div v-if="error" class="error-msg">{{ error }}</div>
        <button type="submit" class="btn-login" :disabled="loading">{{ loading ? '连接中...' : '进入系统' }}</button>
      </form>
      <form v-if="mode === 'register'" @submit.prevent="handleRegister" class="login-form">
        <div class="login-field-row flex flex-col mb-4">
          <label for="reg-username-field" class="login-label text-sm mb-2 cursor-pointer select-none">
            账号 / 邮箱
          </label>
          <input
            id="reg-username-field"
            name="username"
            type="text"
            v-model="regForm.username"
            autocomplete="username"
            placeholder="请输入您的账号"
            class="login-input p-2 bg-[#002233] text-white border border-white/10 rounded focus:border-[#ffb000]/50"
          />
        </div>

        <div class="login-field-row flex flex-col mb-4">
          <label for="reg-email-field" class="login-label text-sm mb-2 cursor-pointer select-none">
            邮箱
          </label>
          <input
            id="reg-email-field"
            name="email"
            type="email"
            v-model="regForm.email"
            autocomplete="email"
            placeholder="请输入邮箱"
            class="login-input p-2 bg-[#002233] text-white border border-white/10 rounded focus:border-[#ffb000]/50"
          />
        </div>

        <div class="login-field-row flex flex-col mb-4">
          <label for="reg-password-field" class="login-label text-sm mb-2 cursor-pointer select-none">
            密码
          </label>
          <input
            id="reg-password-field"
            name="new-password"
            type="password"
            v-model="regForm.password"
            autocomplete="new-password"
            placeholder="请输入密码"
            class="login-input p-2 bg-[#002233] text-white border border-white/10 rounded focus:border-[#ffb000]/50"
          />
        </div>

        <div class="login-field-row flex flex-col mb-6">
          <label for="reg-verify-field" class="login-label text-sm mb-2 cursor-pointer select-none">
            确认密码
          </label>
          <input
            id="reg-verify-field"
            name="verify-password"
            type="password"
            v-model="regForm.verifyPassword"
            autocomplete="new-password"
            placeholder="请再次输入密码"
            class="login-input p-2 bg-[#002233] text-white border border-white/10 rounded focus:border-[#ffb000]/50"
          />
        </div>

        <div class="perm-hint">
          <span class="perm-icon">i</span>
          <span>新账号默认权限等级：<strong>Player（普通玩家）</strong> — 可加入并创建战场；裁判 / 管理员等高级权限由系统分配。</span>
        </div>

        <div v-if="error" class="error-msg">{{ error }}</div>
        <button type="submit" class="btn-login" :disabled="loading">{{ loading ? '注册中...' : '创建档案' }}</button>
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
    // 关键：写入 store 的 token（同步 localStorage），保证 userStore.isLoggedIn 正确
    userStore.setToken(data.token)
    // 同步注入 user 对象（id/role），否则准备房页面的房主/GM 门禁 isHost/isGM 全为 false，
    // 导致无法删除房间、无法开始战斗
    if (data.user) {
      localStorage.setItem('user', JSON.stringify(data.user))
      userStore.setUser(data.user)
    }
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

/* === Standardized Login Form === */
.login-form { padding: 24px 32px 32px; display: flex; flex-direction: column; gap: 8px; }
.login-field-row { display: flex; flex-direction: column; }
.login-label { display: block; font-weight: 700; color: #ffd597; text-transform: uppercase; letter-spacing: 2px; }
.login-input { font-family: 'Fira Code', monospace; font-size: 14px; outline: none; transition: border-color 0.2s; }
.login-input::placeholder { color: rgba(193,232,255,0.25); }
.btn-login { width: 100%; padding: 14px; background: #ffb000; color: #0a1628; font-weight: 900; font-size: 14px; letter-spacing: 0.15em; text-transform: uppercase; border: none; cursor: pointer; transition: background 0.15s, transform 0.1s; margin-top: 4px; }
.btn-login:hover { background: #ffc840; }
.btn-login:active { transform: scale(0.97); }
.btn-login:disabled { opacity: 0.5; cursor: not-allowed; }

.error-msg { background: rgba(255,77,77,0.1); border-left: 3px solid #ff4d4d; padding: 10px 14px; color: #ff6b6b; font-size: 12px; font-family: 'Fira Code', monospace; }
.perm-hint { display: flex; align-items: flex-start; gap: 8px; background: rgba(255,176,0,0.08); border-left: 3px solid #ffb000; padding: 10px 14px; color: rgba(193,232,255,0.7); font-size: 11px; font-family: 'Fira Code', monospace; line-height: 1.5; margin-bottom: 8px; }
.perm-hint strong { color: #ffb000; }
.perm-icon { flex-shrink: 0; width: 16px; height: 16px; border-radius: 50%; background: #ffb000; color: #0a1628; font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center; font-family: monospace; }
.modal-footer-dec { padding: 14px 32px; border-top: 1px solid rgba(255,176,0,0.08); }
.status-row { font-family: 'Fira Code', monospace; font-size: 10px; color: rgba(193,232,255,0.4); display: flex; align-items: center; justify-content: center; gap: 10px; letter-spacing: 0.05em; }
.dot { width: 6px; height: 6px; background: #13ff43; border-radius: 50%; animation: pulse 2s infinite; }
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
.sep { color: #9f8e78; }
</style>
