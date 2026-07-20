<template>
  <div class="min-h-screen flex items-center justify-center bg-[#001620]">
    <div class="w-full max-w-md p-8 bg-[#002233] rounded-lg border border-white/10 shadow-2xl">
      <!-- Logo -->
      <div class="text-center mb-8">
        <h1 class="text-3xl font-bold text-[#ffb000] tracking-wider">MECHA UNIVERSE</h1>
        <p class="text-sm text-white/40 mt-2">大一统规则母体引擎</p>
      </div>

      <!-- Phase 29-X: 纯净登录表单 — universe-* 大一统 ID 规范 -->
      <form @submit.prevent="handleLogin" class="space-y-5">
        <div class="flex flex-col">
          <label for="universe-username" class="text-sm mb-1.5 text-white/70 cursor-pointer select-none">
            账号
          </label>
          <input
            id="universe-username"
            name="username"
            type="text"
            v-model="form.username"
            autocomplete="username"
            placeholder="请输入账号"
            class="p-2.5 bg-[#001620] text-white border border-white/10 rounded focus:outline-none focus:border-[#ffb000]/50 transition-colors"
            :disabled="loading"
          />
        </div>

        <div class="flex flex-col">
          <label for="universe-password" class="text-sm mb-1.5 text-white/70 cursor-pointer select-none">
            密码
          </label>
          <input
            id="universe-password"
            name="password"
            type="password"
            v-model="form.password"
            autocomplete="current-password"
            placeholder="请输入密码"
            class="p-2.5 bg-[#001620] text-white border border-white/10 rounded focus:outline-none focus:border-[#ffb000]/50 transition-colors"
            :disabled="loading"
            @keyup.enter="handleLogin"
          />
        </div>

        <!-- 错误提示 -->
        <div v-if="error" class="text-red-400 text-sm bg-red-900/20 p-2 rounded border border-red-500/20">
          {{ error }}
        </div>

        <!-- 登录按钮 -->
        <button
          type="submit"
          class="w-full py-2.5 bg-[#ffb000] text-[#001620] font-bold rounded hover:bg-[#ffc030] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="loading || !form.username || !form.password"
        >
          {{ loading ? '登录中...' : '登 录' }}
        </button>

        <!-- 注册链接 -->
        <div class="text-center text-sm text-white/50">
          没有账号？
          <router-link to="/register" class="text-[#ffb000] hover:underline">注册</router-link>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { authAPI } from '@/api/client'
import { useUserStore } from '@/stores/user'

const router = useRouter()
const userStore = useUserStore()

const form = reactive({
  username: '',
  password: '',
})
const loading = ref(false)
const error = ref('')

async function handleLogin() {
  if (!form.username || !form.password) return

  error.value = ''
  loading.value = true

  try {
    const { data } = await authAPI.login({
      username: form.username,
      password: form.password,
    })

    userStore.setToken(data.token)
    userStore.setUser(data.user)
    router.push('/home')
  } catch (e) {
    const msg = e.response?.data?.message || e.message || '登录失败'
    error.value = msg
  } finally {
    loading.value = false
  }
}
</script>
