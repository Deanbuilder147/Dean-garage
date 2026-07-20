<template>
  <div class="min-h-screen flex items-center justify-center bg-[#001620]">
    <div class="w-full max-w-md p-8 bg-[#002233] rounded-lg border border-white/10 shadow-2xl">
      <div class="text-center mb-8">
        <h1 class="text-3xl font-bold text-[#ffb000] tracking-wider">注册账号</h1>
        <p class="text-sm text-white/40 mt-2">加入机甲战棋宇宙</p>
      </div>

      <!-- Phase 29-X: universe-* 大一统 ID 规范 -->
      <form @submit.prevent="handleRegister" class="space-y-4">
        <div class="flex flex-col">
          <label for="universe-reg-username" class="text-sm mb-1.5 text-white/70 cursor-pointer select-none">
            账号
          </label>
          <input
            id="universe-reg-username"
            name="username"
            type="text"
            v-model="form.username"
            autocomplete="username"
            placeholder="请输入账号"
            class="p-2.5 bg-[#001620] text-white border border-white/10 rounded focus:outline-none focus:border-[#ffb000]/50"
            :disabled="loading"
          />
        </div>

        <div class="flex flex-col">
          <label for="universe-reg-email" class="text-sm mb-1.5 text-white/70 cursor-pointer select-none">
            邮箱
          </label>
          <input
            id="universe-reg-email"
            name="email"
            type="email"
            v-model="form.email"
            autocomplete="email"
            placeholder="请输入邮箱"
            class="p-2.5 bg-[#001620] text-white border border-white/10 rounded focus:outline-none focus:border-[#ffb000]/50"
            :disabled="loading"
          />
        </div>

        <div class="flex flex-col">
          <label for="universe-reg-password" class="text-sm mb-1.5 text-white/70 cursor-pointer select-none">
            密码
          </label>
          <input
            id="universe-reg-password"
            name="new-password"
            type="password"
            v-model="form.password"
            autocomplete="new-password"
            placeholder="至少 6 位密码"
            class="p-2.5 bg-[#001620] text-white border border-white/10 rounded focus:outline-none focus:border-[#ffb000]/50"
            :disabled="loading"
          />
        </div>

        <div class="flex flex-col">
          <label for="universe-reg-verify" class="text-sm mb-1.5 text-white/70 cursor-pointer select-none">
            确认密码
          </label>
          <input
            id="universe-reg-verify"
            name="verify-password"
            type="password"
            v-model="form.verifyPassword"
            autocomplete="new-password"
            placeholder="再次输入密码"
            class="p-2.5 bg-[#001620] text-white border border-white/10 rounded focus:outline-none focus:border-[#ffb000]/50"
            :disabled="loading"
          />
        </div>

        <div v-if="error" class="text-red-400 text-sm bg-red-900/20 p-2 rounded border border-red-500/20">
          {{ error }}
        </div>

        <button
          type="submit"
          class="w-full py-2.5 bg-[#ffb000] text-[#001620] font-bold rounded hover:bg-[#ffc030] transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-4"
          :disabled="loading || !form.username || !form.email || !form.password"
        >
          {{ loading ? '注册中...' : '注 册' }}
        </button>

        <div class="text-center text-sm text-white/50">
          已有账号？
          <router-link to="/login" class="text-[#ffb000] hover:underline">登录</router-link>
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
  email: '',
  password: '',
  verifyPassword: '',
})
const loading = ref(false)
const error = ref('')

async function handleRegister() {
  if (form.password !== form.verifyPassword) {
    error.value = '两次密码不一致'
    return
  }
  if (form.password.length < 6) {
    error.value = '密码至少 6 位'
    return
  }

  error.value = ''
  loading.value = true

  try {
    const { data } = await authAPI.register({
      username: form.username,
      email: form.email,
      password: form.password,
    })

    userStore.setToken(data.token)
    userStore.setUser(data.user)
    router.push('/home')
  } catch (e) {
    const msg = e.response?.data?.message || e.message || '注册失败'
    error.value = msg
  } finally {
    loading.value = false
  }
}
</script>
