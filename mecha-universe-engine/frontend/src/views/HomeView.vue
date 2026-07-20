<template>
  <div class="min-h-screen bg-[#001620] p-6">
    <!-- 顶栏 -->
    <header class="flex justify-between items-center mb-8">
      <h1 class="text-2xl font-bold text-[#ffb000] tracking-wider">MECHA UNIVERSE</h1>
      <div class="flex items-center gap-4">
        <span class="text-white/60 text-sm">{{ userStore.user?.username }}</span>
        <button
          @click="handleLogout"
          class="px-3 py-1.5 text-sm bg-red-900/30 text-red-300 border border-red-500/20 rounded hover:bg-red-900/50 transition-colors"
        >
          登出
        </button>
      </div>
    </header>

    <!-- 欢迎面板 -->
    <div class="max-w-2xl mx-auto">
      <div class="bg-[#002233] rounded-lg border border-white/10 p-8 text-center">
        <div class="text-6xl mb-4">⚔️</div>
        <h2 class="text-xl font-bold text-white mb-2">欢迎加入机甲战棋宇宙</h2>
        <p class="text-white/50 mb-6">Phase 29-X 大一统规则母体引擎已就绪</p>

        <div class="grid grid-cols-2 gap-4 max-w-sm mx-auto">
          <div class="bg-[#001620] rounded p-4 border border-white/5">
            <div class="text-sm text-white/40 mb-1">系统状态</div>
            <div class="text-green-400 font-bold text-sm">🟢 就绪</div>
          </div>
          <div class="bg-[#001620] rounded p-4 border border-white/5">
            <div class="text-sm text-white/40 mb-1">引擎版本</div>
            <div class="text-[#ffb000] font-bold text-sm">29-X</div>
          </div>
        </div>
      </div>

      <!-- 功能卡片 -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        <div class="bg-[#002233] rounded-lg border border-white/10 p-6 hover:border-[#ffb000]/30 transition-colors cursor-pointer">
          <div class="text-2xl mb-2">🗺️</div>
          <h3 class="font-bold text-white mb-1">战场</h3>
          <p class="text-sm text-white/40">创建或加入对战房间</p>
        </div>
        <div class="bg-[#002233] rounded-lg border border-white/10 p-6 hover:border-[#ffb000]/30 transition-colors cursor-pointer">
          <div class="text-2xl mb-2">🤖</div>
          <h3 class="font-bold text-white mb-1">机库</h3>
          <p class="text-sm text-white/40">管理你的机甲单位</p>
        </div>
        <div class="bg-[#002233] rounded-lg border border-white/10 p-6 hover:border-[#ffb000]/30 transition-colors cursor-pointer">
          <div class="text-2xl mb-2">👁️</div>
          <h3 class="font-bold text-white mb-1">观战</h3>
          <p class="text-sm text-white/40">观看进行中的战斗</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'

const router = useRouter()
const userStore = useUserStore()

function handleLogout() {
  userStore.clearUser()
  router.push('/login')
}
</script>
