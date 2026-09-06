<template>
  <div id="app" class="h-screen w-screen overflow-hidden">
    <div class="app-container flex h-full w-full">
      <aside v-if="showSidebar" class="app-sidebar w-64 flex-shrink-0 h-full">
        <TheSidebar />
      </aside>
      <main class="main-content flex-1 h-full relative overflow-hidden">
        <router-view />
      </main>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { provide, ref } from 'vue'
import TheSidebar from './components/layout/TheSidebar.vue'

// Routes that should NOT show sidebar
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
  /* flex h-full w-full — 由 Tailwind 提供 */
}

.main-content {
  /* flex-1 h-full relative overflow-hidden — 由 Tailwind 提供 */
  transition: none;
}

@media (max-width: 1024px) {
  .app-sidebar {
    display: none;
  }
}
</style>
