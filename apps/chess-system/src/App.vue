<template>
  <div id="app">
    <nav class="navbar">
      <div class="nav-brand">♟️ 棋子管理系统</div>
      <div class="nav-links">
        <router-link to="/" class="nav-link">首页</router-link>
        <router-link to="/chess-units" class="nav-link">棋子列表</router-link>
        <router-link to="/chess-units/new" class="nav-link">新建棋子</router-link>
        <router-link to="/chess-units/import" class="nav-link">导入</router-link>
      </div>
    </nav>
    <main class="main-content">
      <router-view />
    </main>
  </div>
</template>

<script setup>
// App 根组件
</script>

<style>
#app {
  min-height: 100vh;
  background: var(--bg);
  color: var(--on-bg);
}

.navbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 2rem;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  z-index: 100;
}

.nav-brand {
  font-size: 1.5rem;
  font-weight: bold;
  color: var(--primary);
}

.nav-links {
  display: flex;
  gap: 1.5rem;
}

.nav-link {
  color: var(--on-surface);
  text-decoration: none;
  font-weight: 500;
  padding: 0.5rem 1rem;
  border-radius: var(--radius);
  transition: background 0.2s, color 0.2s;
}

.nav-link:hover {
  background: var(--surface-light);
  color: var(--primary);
}

.nav-link.router-link-active {
  background: var(--primary);
  color: white;
}

.main-content {
  padding: 2rem;
  max-width: 1400px;
  margin: 0 auto;
}
</style>
