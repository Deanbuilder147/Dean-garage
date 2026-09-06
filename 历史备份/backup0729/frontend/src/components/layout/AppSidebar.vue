<template>
  <aside 
    class="app-sidebar" 
    :class="{ collapsed: modelValue }"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <button 
      class="collapse-toggle" 
      @click="toggleCollapse" 
      :title="modelValue ? '展开侧边栏' : '收起侧边栏'"
    >
      <svg viewBox="0 0 24 24" width="14" height="14" class="toggle-chevron" :class="{ rotated: !modelValue }">
        <polyline points="15 18 9 12 15 6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
    <div class="sidebar-inner">
      <slot></slot>
    </div>
  </aside>
</template>

<script setup>
const props = defineProps({
  modelValue: { type: Boolean, default: false }
})
const emit = defineEmits(['update:modelValue'])

let hoverExpanded = false

function toggleCollapse() {
  emit('update:modelValue', !props.modelValue)
}

function handleMouseEnter() {
  if (props.modelValue) {
    hoverExpanded = true
    emit('update:modelValue', false)
  }
}

function handleMouseLeave() {
  if (hoverExpanded) {
    hoverExpanded = false
    emit('update:modelValue', true)
  }
}
</script>

<style scoped>
.app-sidebar {
  position: fixed;
  left: 0;
  top: 0;
  width: 240px;
  height: 100vh;
  background: rgba(8,51,68,0.95);
  border-right: 1px solid rgba(255,176,0,0.1);
  z-index: 50;
  display: flex;
  flex-direction: column;
  transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}

.app-sidebar.collapsed {
  width: 48px;
}

.collapse-toggle {
  position: absolute;
  top: 12px;
  right: 8px;
  width: 28px;
  height: 28px;
  border-radius: 4px;
  border: 1px solid rgba(255,176,0,0.15);
  background: rgba(255,176,0,0.06);
  color: rgba(255,176,0,0.5);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  transition: all 0.2s;
  padding: 0;
}

.collapse-toggle:hover {
  background: rgba(255,176,0,0.15);
  color: #ffb000;
  border-color: rgba(255,176,0,0.3);
}

.toggle-chevron {
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.toggle-chevron.rotated {
  transform: rotate(180deg);
}

.sidebar-inner {
  display: flex;
  flex-direction: column;
  padding: 48px 12px 16px;
  gap: 12px;
  flex: 1;
  overflow: hidden;
  opacity: 1;
  transition: opacity 0.15s ease;
}

.app-sidebar.collapsed .sidebar-inner {
  padding: 48px 8px 16px;
  opacity: 1;
}

/* When collapsed, hide text but keep icons */
.app-sidebar.collapsed :deep(.profile-info),
.app-sidebar.collapsed :deep(.nav-link-text),
.app-sidebar.collapsed :deep(.action-log-panel) {
  display: none;
}

.app-sidebar.collapsed :deep(.sidebar-profile) {
  justify-content: center;
  border-bottom: none;
  padding-bottom: 8px;
}

.app-sidebar.collapsed :deep(.avatar) {
  width: 32px;
  height: 32px;
  font-size: 12px;
}

.app-sidebar.collapsed :deep(.nav-link) {
  justify-content: center;
  padding: 8px 4px;
  border-radius: 4px;
  border-left: none !important;
}

.app-sidebar.collapsed :deep(.nav-link.active) {
  border-left: none !important;
}

.app-sidebar.collapsed :deep(.profile-section),
.app-sidebar.collapsed :deep(.sidebar-profile) {
  border-bottom: none;
  padding-bottom: 8px;
  margin-bottom: 0;
}

/* Scrollbar */
.app-sidebar::-webkit-scrollbar {
  width: 3px;
}
.app-sidebar::-webkit-scrollbar-thumb {
  background: rgba(255,176,0,0.15);
  border-radius: 2px;
}
</style>