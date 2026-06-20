<template>
  <AppSidebar v-model="sidebarCollapsed">
    <!-- Profile -->
    <div class="sidebar-profile">
      <div class="avatar">
        <img src="https://lh3.googleusercontent.com/aida-public/AB6AXuDYyn-HCiF01XLYgK6uTbi_cB5wuYmt8wGvSbdTtGk_-bIDUvWqWvTFoahEAZhzycVcpuExWN3Rw1jX1-1PqZYrfHGb5tma9krNH7tYuYxKSqJ7ma-wJir3RmFgtHvmZ_J2Lg4QYbl3N1GTRREWIHZI4KOwkIZ8XWdW1zxDdtHVOJs8D5o3KqueWnknlSfp57HOjuj9rn0ZijamKid25utBkYLbqKFrFkQQxczNmtQx1b63kPfqZGIlEfAnUi2XSKTCDLtPh9noD-w" alt="">
      </div>
      <div class="profile-info">
        <p>[ {{ user?.username || '指挥官' }} ]</p>
        <p>军衔: {{ userRank }}</p>
      </div>
    </div>

    <nav class="nav">
      <router-link to="/home" class="nav-link" active-class="active">
        <svg class="icon-lg" viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><polyline points="9 22 9 12 15 12 15 22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <span class="nav-link-text">首页</span>
      </router-link>
      <router-link to="/units" class="nav-link" active-class="active">
        <svg class="icon-lg" viewBox="0 0 24 24"><path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z"/></svg>
        <span class="nav-link-text">单位编辑器</span>
      </router-link>
      <router-link to="/battlefield-edit" class="nav-link" active-class="active">
        <svg class="icon-lg" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" fill="none" stroke="currentColor" stroke-width="2"/><rect x="14" y="3" width="7" height="7" fill="none" stroke="currentColor" stroke-width="2"/><rect x="3" y="14" width="7" height="7" fill="none" stroke="currentColor" stroke-width="2"/><rect x="14" y="14" width="7" height="7" fill="none" stroke="currentColor" stroke-width="2"/></svg>
        <span class="nav-link-text">地图编辑器</span>
      </router-link>
      <router-link to="/battlefields" class="nav-link" active-class="active">
        <svg class="icon-lg" viewBox="0 0 24 24"><polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><line x1="12" y1="22" x2="12" y2="15.5" stroke="currentColor" stroke-width="2"/><line x1="22" y1="8.5" x2="12" y2="15.5" stroke="currentColor" stroke-width="2"/><line x1="2" y1="8.5" x2="12" y2="15.5" stroke="currentColor" stroke-width="2"/></svg>
        <span class="nav-link-text">战术部署</span>
      </router-link>
      <router-link to="/glossary" class="nav-link" active-class="active">
        <svg class="icon-lg" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        <span class="nav-link-text">词条库</span>
      </router-link>

      <template v-if="isBattlePage">
        <div class="nav-separator"></div>
        <span class="nav-link active">
          <svg class="icon-lg" viewBox="0 0 24 24"><polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>
          <span class="nav-link-text">战场指挥</span>
        </span>
      </template>
    </nav>

    <div class="action-log-panel" v-if="isBattlePage">
      <div class="log-header">
        <span>📋 行动记录</span>
        <span class="log-count">{{ sidebarActionLog.length }}</span>
      </div>
      <div class="log-entries" ref="logContainer">
        <div v-for="(entry, i) in sidebarActionLog" :key="i" :class="['log-entry', 'log-' + entry.type]">
          <span class="log-time">{{ entry.time }}</span>
          <span class="log-msg">{{ entry.message }}</span>
        </div>
        <div v-if="!sidebarActionLog.length" class="log-empty">等待行动...</div>
      </div>
    </div>
  </AppSidebar>
</template>

<script setup>
import { ref, computed, inject, nextTick, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useUserStore } from '../../stores/user'
import AppSidebar from './AppSidebar.vue'

const route = useRoute()
const userStore = useUserStore()
const user = computed(() => userStore.user)
const sidebarCollapsed = ref(false)
const logContainer = ref(null)

const userRank = computed(() => {
  if (!user.value) return 'AC-01'
  const f = (user.value.faction || '').charAt(0).toUpperCase() + (user.value.faction || '').slice(1)
  return f || 'AC-01'
})

const isBattlePage = computed(() => route.path.startsWith('/battle/'))

const sidebarActionLog = inject('sidebarActionLog', [])

watch(sidebarActionLog, () => {
  nextTick(() => {
    if (logContainer.value) logContainer.value.scrollTop = 0
  })
}, { deep: true })
</script>

<style scoped>
.sidebar-profile {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(255,176,0,0.08);
}

.avatar {
  width: 36px; height: 36px;
  border-radius: 50%;
  background: rgba(255,176,0,0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  border: 1px solid rgba(255,176,0,0.2);
  overflow: hidden;
  position: relative;
  flex-shrink: 0;
}

.avatar img {
  width: 100%; height: 100%;
  object-fit: cover;
}

.profile-info p {
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
  white-space: nowrap;
}

.profile-info p:first-child {
  font-weight: 700;
  color: #ffb000;
  font-size: 13px;
  letter-spacing: 1px;
}

.profile-info p:last-child {
  color: rgba(193,232,255,0.5);
  font-size: 9px;
  font-family: 'Fira Code', monospace;
}

.nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav-link {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  color: rgba(241,243,252,0.35);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
  border-radius: 4px;
  text-decoration: none;
  border: none;
  background: transparent;
  font-family: inherit;
  letter-spacing: 1px;
}

.nav-link:hover {
  color: #c1e8ff;
  background: rgba(255,176,0,0.05);
}

.nav-link.active {
  color: #ffb000;
  background: rgba(255,176,0,0.08);
  border-left: 3px solid #ffb000;
}

.nav-link-text { white-space: nowrap; }
.icon-lg { width: 20px; height: 20px; flex-shrink: 0; }

.nav-separator {
  height: 1px;
  background: rgba(255,176,0,0.08);
  margin: 4px 0;
}

.action-log-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: rgba(255,176,0,0.03);
  border: 1px solid rgba(255,176,0,0.06);
  border-radius: 6px;
  overflow: hidden;
  min-height: 0;
}

.log-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 10px;
  font-size: 11px;
  font-weight: 700;
  color: rgba(255,176,0,0.5);
  border-bottom: 1px solid rgba(255,176,0,0.06);
  letter-spacing: 1px;
}

.log-count {
  background: rgba(255,176,0,0.12);
  color: #ffb000;
  padding: 1px 6px;
  border-radius: 8px;
  font-size: 9px;
}

.log-entries {
  flex: 1;
  overflow-y: auto;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.log-entries::-webkit-scrollbar { width: 3px; }
.log-entries::-webkit-scrollbar-thumb {
  background: rgba(255,176,0,0.15);
  border-radius: 2px;
}

.log-entry {
  font-size: 9px;
  padding: 3px 6px;
  border-radius: 3px;
  font-family: 'Fira Code', monospace;
  line-height: 1.4;
  display: flex;
  gap: 6px;
}

.log-time { color: rgba(255,255,255,0.2); flex-shrink: 0; }
.log-msg { color: rgba(241,243,252,0.5); }

.log-entry.log-system { background: rgba(255,255,255,0.02); }
.log-entry.log-move .log-msg { color: #00b4dc; }
.log-entry.log-attack .log-msg { color: #ff4d4d; }
.log-entry.log-action .log-msg { color: #ffb000; }
.log-entry.log-deploy .log-msg { color: #ffb000; }
.log-entry.log-turn .log-msg { color: rgba(255,176,0,0.7); font-weight: 700; }
.log-entry.log-error .log-msg { color: #ff4d4d; background: rgba(255,77,77,0.1); }
.log-entry.log-info { font-style: italic; }
.log-entry.log-select .log-msg { color: #c1e8ff; }

.log-empty {
  color: rgba(241,243,252,0.1);
  font-size: 10px;
  text-align: center;
  padding: 20px 0;
}
</style>
