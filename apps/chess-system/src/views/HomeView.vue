<template>
  <div class="home-view">
    <h1 class="text-2xl font-bold mb-6">欢迎来到棋子管理系统</h1>
    
    <div class="grid grid-cols-2 gap-4">
      <router-link to="/chess-units" class="card stat-card">
        <h2 class="text-xl font-bold mb-2">📋 棋子列表</h2>
        <p class="text-muted">浏览和管理所有棋子</p>
      </router-link>
      
      <router-link to="/chess-units/new" class="card stat-card">
        <h2 class="text-xl font-bold mb-2">➕ 新建棋子</h2>
        <p class="text-muted">创建新的机甲棋子</p>
      </router-link>
      
      <router-link to="/chess-units/import" class="card stat-card">
        <h2 class="text-xl font-bold mb-2">📥 导入棋子</h2>
        <p class="text-muted">批量导入 JSON 数据</p>
      </router-link>
      
      <a href="http://localhost:5174" target="_blank" class="card stat-card">
        <h2 class="text-xl font-bold mb-2">⚔️ 战斗地图</h2>
        <p class="text-muted">跳转到战斗地图系统</p>
      </a>
    </div>
    
    <div class="card mt-4">
      <h2 class="text-xl font-bold mb-4">快速统计</h2>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <p class="text-muted">总棋子数</p>
          <p class="text-2xl font-bold text-primary">30+</p>
        </div>
        <div>
          <p class="text-muted">势力数量</p>
          <p class="text-2xl font-bold text-accent">3</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
// 主页
</script>

<style scoped>
.home-view {
  max-width: 1200px;
}

.stat-card {
  transition: transform 0.2s, box-shadow 0.2s;
  text-decoration: none;
  color: inherit;
  display: block;
}

.stat-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-lg);
}

.stat-card h2 {
  color: var(--primary);
}
</style>
