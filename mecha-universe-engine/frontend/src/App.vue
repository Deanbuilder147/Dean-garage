<template>
  <div id="app" class="h-screen w-screen overflow-hidden">
    <HexPatternBackground />
    <div class="app-container flex h-full w-full relative">
      <main class="main-content flex-1 h-full min-w-0 min-h-0 relative overflow-y-auto overflow-x-hidden">
        <router-view />
      </main>
    </div>
    <!-- 右下角浮动导航（FAB，可收起） -->
    <TheSidebar v-if="showSidebar" />
  </div>
</template>

<script setup>
import { computed, ref, provide } from 'vue'
import { useRoute } from 'vue-router'
import TheSidebar from './components/layout/TheSidebar.vue'
import HexPatternBackground from './components/ui/HexPatternBackground.vue'

// 这些路由不显示浮动导航
const NO_SIDEBAR_ROUTES = ['/', '/login', '/register', '/terminal']
const route = useRoute()
const showSidebar = computed(() => !NO_SIDEBAR_ROUTES.includes(route.path))

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
  position: relative;
  z-index: 2;
}

.main-content {
  transition: none;
}
</style>
