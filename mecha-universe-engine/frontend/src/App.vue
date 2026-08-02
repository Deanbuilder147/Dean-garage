<template>
  <div id="app" class="h-screen w-screen overflow-hidden">
    <div
      class="app-container flex h-full w-full"
      :style="{ '--sidebar-w': sidebarCollapsed ? '52px' : '240px' }"
    >
      <aside
        v-if="showSidebar"
        class="app-sidebar-wrap flex-shrink-0 h-full"
        :style="{ width: sidebarCollapsed ? '52px' : '240px' }"
      >
        <TheSidebar v-model="sidebarCollapsed" />
      </aside>
      <!-- 主内容区改为纵向可滚动，避免子页面（如后台管理）内容超出视口被裁切 -->
      <main class="main-content flex-1 h-full relative overflow-y-auto overflow-x-hidden">
        <router-view />
      </main>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { provide } from 'vue'
import TheSidebar from './components/layout/TheSidebar.vue'

// Routes that should NOT show sidebar
const NO_SIDEBAR_ROUTES = ['/', '/login', '/register', '/terminal']

const route = useRoute()
const showSidebar = computed(() => !NO_SIDEBAR_ROUTES.includes(route.path))

// 侧边栏收起状态：提升到布局层，驱动收起时主画面 reclaim 收起区域的宽度
const sidebarCollapsed = ref(false)

// Provide shared actionLog for battle pages
const sidebarActionLog = ref([])
provide('sidebarActionLog', sidebarActionLog)
</script>

<style>
@import './styles/variables.css';

#app {
  background: #001620;
  color: #c1e8ff;
  font-family: 'Noto Sans SC', 'Space Grotesk', system-ui, -apple-system, sans-serif;
}

.app-container {
  /* flex h-full w-full — 由 Tailwind 提供 */
}

.main-content {
  /* flex-1 h-full relative overflow-hidden — 由 Tailwind 提供 */
  transition: none;
}

/* 收起时主画面紧跟收起后的 48px 侧边栏，reclaim 原 w-64 预留区，避免留出大块空白 */
.app-sidebar-wrap {
  transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

@media (max-width: 1024px) {
  .app-sidebar-wrap {
    display: none;
  }
}
</style>
