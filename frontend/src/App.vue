<template>
  <div class="app-container">
    <TheSidebar v-if="showSidebar" />
    <main :class="['main-content', { 'with-sidebar': showSidebar }]">
      <header v-if="showSidebar" class="mobile-header">
        <span class="mobile-brand">机甲战术</span>
      </header>
      <router-view />
    </main>
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

.app-container {
  min-height: 100vh;
  background: #001620;
  color: #c1e8ff;
  font-family: 'Noto Sans SC', 'Space Grotesk', system-ui, -apple-system, sans-serif;
  overflow-x: hidden;
  display: flex;
}

.main-content {
  flex: 1;
  min-height: 100vh;
  transition: margin-left 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.main-content.with-sidebar {
  margin-left: 240px;
}

.mobile-header {
  display: none;
}

@media (max-width: 1024px) {
  .main-content.with-sidebar {
    margin-left: 0;
    padding-top: 60px;
  }
  .mobile-header {
    display: flex;
  }
}
</style>
