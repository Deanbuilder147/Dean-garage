<template>

  <!-- Mobile Header -->
  <header class="mobile-header">
    <span class="mobile-brand">机甲战术</span>
    <svg class="icon icon-lg" viewBox="0 0 24 24" @click="handleLogout"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/></svg>
  </header>

  <!-- Main Content -->
  <div class="page-container w-full h-full flex flex-col overflow-y-auto">

    <header class="tactical-header">
      <h1>战术模拟系统 Alpha 3.0</h1>
      <div class="header-meta">
        <span class="status-dot"><span></span>系统: 在线</span>
        <span class="meta-divider">::</span>
        <span>战区: 7-B Alpha</span>
        <span class="meta-divider">::</span>
        <span class="meta-highlight">核心温度: 42°C</span>
      </div>
    </header>

    <div class="cards-grid">

      <div class="card" @click="router.push('/battlefields')">
        <div class="card-text">
          <div class="card-icon">
            <svg class="icon icon-xl" viewBox="0 0 24 24"><path d="M19.93 7.03l-2.9-2.9-1.41 1.41 1.41 1.41-4.89 4.89-2.83-2.83-1.41 1.41 1.41 1.41-2.82 2.83-1.42-1.42-1.41 1.42 1.41 1.41L3 18.66l1.41 1.41 1.42-1.41 1.41 1.41 1.42-1.41-1.42-1.42 2.83-2.83 1.41 1.41 1.42-1.42-2.83-2.83 4.89-4.89 1.41 1.41 1.41-1.41z"/></svg>
          </div>
          <div class="card-title-group">
            <h3>战术部署</h3>
            <p>选择战场，组建机甲编队，投入高强度战术战斗行动。</p>
          </div>
        </div>
        <button class="card-btn">启动</button>
        <div class="scanline"></div>
      </div>

      <div class="card" @click="router.push('/units')">
        <div class="card-text">
          <div class="card-icon">
            <svg class="icon icon-xl" viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
          </div>
          <div class="card-title-group">
            <h3>单位编辑器</h3>
            <p>校准反应堆输出与武器挂载点，管理驾驶员同步率和机体完整性。</p>
          </div>
        </div>
        <button class="card-btn">配置</button>
        <div class="scanline"></div>
      </div>

      <div class="card" @click="router.push('/battlefield-edit')">
        <div class="card-text">
          <div class="card-icon">
            <svg class="icon icon-xl" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" fill="none" stroke="currentColor" stroke-width="2"/><rect x="14" y="3" width="7" height="7" fill="none" stroke="currentColor" stroke-width="2"/><rect x="3" y="14" width="7" height="7" fill="none" stroke="currentColor" stroke-width="2"/><rect x="14" y="14" width="7" height="7" fill="none" stroke="currentColor" stroke-width="2"/></svg>
          </div>
          <div class="card-title-group">
            <h3>地图编辑器</h3>
            <p>设计地形与天气变量，构建战术部署所需的战略地图。</p>
          </div>
        </div>
        <button class="card-btn">构建</button>
        <div class="scanline"></div>
      </div>

      <!-- Phase 19: 词条造词工厂卡片 -->
      <div class="card" @click="router.push('/glossary')">
        <div class="card-text">
          <div class="card-icon">
            <svg class="icon icon-xl" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" fill="currentColor" opacity="0.15"/><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" fill="none" stroke="currentColor" stroke-width="2"/></svg>
          </div>
          <div class="card-title-group">
            <h3>📖 词条造词工厂</h3>
            <p>查阅全部机甲技能、地形特性与战斗机制的完整百科词条库。</p>
          </div>
        </div>
        <button class="card-btn">查阅</button>
        <div class="scanline"></div>
      </div>

    </div>

    <div class="status-bar">
      <strong>系统状态:</strong>
      <span class="ok">同步稳定</span>
      <span class="sep">|</span>
      <span class="dim">神经链接: 94%</span>
      <span class="sep">|</span>
      <span class="dim">反应堆: 低温</span>
      <span class="sep">|</span>
      <span class="dim">坐标: 35.6895 N / 139.6917 E</span>
      <span class="sep">|</span>
      <span class="dim">战区: 7-B Alpha</span>
    </div>

  </div></template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'

const router = useRouter()
const userStore = useUserStore()
const user = computed(() => userStore.user)
function handleLogout() {
  localStorage.removeItem('token')
  router.push('/')
}

</script>

<style scoped>
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

.icon { width: 1em; height: 1em; display: inline-block; vertical-align: middle; fill: currentColor; flex-shrink: 0; }

.icon-xl { font-size: 3rem; }
.icon-sm { font-size: 1rem; }

.mobile-header {
  display: none;
  position: fixed; top: 0; left: 0; right: 0;
  z-index: 60;
  padding: 12px 24px;
  background: #083344;
  border-bottom: 2px solid rgba(255,176,0,0.2);
  justify-content: space-between;
  align-items: center;
  color: #ffb000;
}
.mobile-brand {
  font-size: 20px;
  font-weight: 900;
  letter-spacing: 0.05em;
}

.tactical-header {
  position: relative;
  margin-bottom: 40px;
  padding-left: 16px;
}
.tactical-header::before {
  content: ''; position: absolute;
  left: 0; top: 0;
  width: 4px; height: 100%;
  background: #ffb000;
}
.tactical-header h1 {
  font-size: 32px;
  font-weight: 900;
  color: #c1e8ff;
  letter-spacing: 0.1em;
  margin-bottom: 8px;
}
.header-meta {
  display: flex; align-items: center; gap: 16px;
  font-family: 'Fira Code', monospace;
  font-size: 11px;
  color: #d7c4ac;
}
.status-dot {
  display: inline-flex; align-items: center; gap: 6px;
}
.status-dot span:first-child {
  width: 8px; height: 8px;
  background: #13ff43;
  border-radius: 50%;
  animation: pulse 2s infinite;
}
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
.meta-divider { color: #9f8e78; }
.meta-highlight { color: #ffd597; }

/* 首页卡片统一使用 .card / .card-btn（含战术部署，已并入 cards-grid） */

.cards-grid {
  display: flex;
  flex-direction: column;
  gap: 24px;
  margin-bottom: 40px;
}
.card {
  position: relative;
  background: #001e2b;
  border: 1px solid rgba(255,176,0,0.25);
  padding: 32px;
  display: flex;
  flex-direction: row;
  align-items: center;
  cursor: pointer;
  transition: background 0.2s, box-shadow 0.2s;
  box-shadow: 6px 6px 0 rgba(0,0,0,0.3), 10px 10px 16px rgba(0,0,0,0.2);
}
.card::before {
  content: '';
  position: absolute;
  left: 0; top: 0;
  width: 4px; height: 100%;
  background: #ffb000;
}
.card:hover { background: #002e3f; box-shadow: 8px 8px 0 rgba(0,0,0,0.35), 14px 14px 20px rgba(0,0,0,0.25); }
.card-tag {
  position: absolute;
  top: 16px; right: 16px;
  font-size: 10px;
  color: #9f8e78;
  font-family: 'Fira Code', monospace;
  opacity: 0.5;
}
.card-icon {
  color: #ffb000;
  margin-bottom: 16px;
}
.card h3 {
  font-size: 22px;
  font-weight: 700;
  color: #c1e8ff;
  margin-bottom: 10px;
  letter-spacing: 0.02em;
}
.card p {
  font-size: 14px;
  color: rgba(193,232,255,0.65);
  line-height: 1.7;
  max-width: 280px;
}
.card-text {
  display: flex;
  align-items: center;
  gap: 20px;
  flex: 1;
}
.card-title-group h3 {
  font-size: 22px;
  font-weight: 700;
  color: #c1e8ff;
  margin-bottom: 8px;
  letter-spacing: 0.02em;
}
.card-title-group p {
  font-size: 14px;
  color: rgba(193,232,255,0.65);
  line-height: 1.7;
  max-width: 480px;
}
.card-footer {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-top: 20px;
}
.card-dots {
  display: flex; gap: 4px;
}
.card-dots span {
  width: 16px; height: 4px;
  background: #13ff43;
  border-radius: 2px;
}
.card-dots span:nth-child(n+3) { background: #02394d; }
.card-btn {
  flex-shrink: 0;
  background: #ffb000;
  color: #0a1628;
  padding: 12px 24px;
  font-weight: 700;
  font-size: 12px;
  letter-spacing: 2px;
  text-transform: uppercase;
  border: none;
  cursor: pointer;
  transition: background 0.15s, transform 0.1s;
}
.card-btn:hover { background: #ffc840; }
.card-btn:active { transform: scale(0.96); }

.status-bar {
  background: #001620;
  border-top: 1px solid rgba(19,255,67,0.08);
  padding: 16px 24px;
  font-family: 'Fira Code', monospace;
  font-size: 10px;
  display: flex; flex-wrap: wrap; gap: 16px;
  align-items: center;
}
.status-bar strong { color: #d7c4ac; }
.status-bar .ok { color: rgba(193,232,255,0.8); }
.status-bar .dim { color: rgba(193,232,255,0.55); }
.status-bar .sep { color: #9f8e78; }

.footer {
  position: fixed; bottom: 0; left: var(--sidebar-w, 240px); right: 0;
  transition: left 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  background: rgba(2,9,17,0.92);
  border-top: 1px solid rgba(255,176,0,0.18);
  padding: 6px 24px;
  display: flex; justify-content: space-between; align-items: center;
  font-family: 'Fira Code', monospace;
  font-size: 10px;
  z-index: 50;
}
.footer-left span {
  color: #ffb000;
  font-weight: 700;
  letter-spacing: 2px;
  text-transform: uppercase;
}
.footer-right {
  display: flex; gap: 28px;
  letter-spacing: 2px;
  text-transform: uppercase;
}
.footer-right .good { color: rgba(122,236,255,0.8); }
.footer-right .muted { color: rgba(255,176,0,0.35); }

.scanline {
  position: absolute; bottom: 0; left: 0; right: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, rgba(255,176,0,0.08), transparent);
  pointer-events: none;
}

@media (max-width: 1024px) {
  .app-sidebar { display: none; }
  .mobile-header { display: flex; }
  .page-container { padding: 80px 20px 60px; }
  .footer { left: 0 !important; }
  .cards-grid { grid-template-columns: 1fr; }
}
</style>
