<template>
  <div class="home-container">
    <!-- CRT扫描线效果 -->
    <CRTScanlines />
    
    <!-- 顶部导航栏 -->
    <header class="home-header">
      <div class="header-title-section">
        <h1 class="header-title font-space">机甲战棋</h1>
        <div class="header-subtitle text-muted">MECHA BATTLE</div>
      </div>
      <div class="header-actions">
        <div class="user-info">
          <span class="user-name font-space">{{ user?.username }}</span>
          <Tag :variant="getFactionVariant(user?.faction)" class="faction-tag">
            {{ getFactionName(user?.faction) }}
          </Tag>
        </div>
        <Button variant="tertiary" @click="handleLogout">登出</Button>
      </div>
    </header>
    
    <!-- 主内容区 -->
    <main class="home-main">
      <div class="menu-grid">
        <!-- 创建棋子卡片 -->
        <Card variant="elevated" class="menu-card hover-lift" @click="$router.push('/units/new')">
          <div class="menu-icon">
            <Icon name="palette" size="48" variant="primary" />
          </div>
          <div class="menu-title uppercase">创建棋子</div>
          <div class="menu-desc text-muted">设计新的机甲角色</div>
        </Card>

        <!-- 机甲库卡片 -->
        <Card variant="elevated" class="menu-card hover-lift" @click="$router.push('/units')">
          <div class="menu-icon">
            <Icon name="box" size="48" variant="primary" />
          </div>
          <div class="menu-title uppercase">机甲库</div>
          <div class="menu-desc text-muted">管理已创建的棋子</div>
        </Card>

        <!-- 战场编辑卡片 -->
        <Card variant="elevated" class="menu-card hover-lift" @click="$router.push('/battlefields')">
          <div class="menu-icon">
            <Icon name="map" size="48" variant="primary" />
          </div>
          <div class="menu-title uppercase">战场编辑</div>
          <div class="menu-desc text-muted">创建和编辑战场</div>
        </Card>

        <!-- 开始战斗卡片 -->
        <Card variant="elevated" class="menu-card menu-card-battle hover-lift" @click="showBattlefieldSelector">
          <div class="menu-icon">
            <Icon name="sword" size="48" variant="secondary" />
          </div>
          <div class="menu-title uppercase">开始战斗</div>
          <div class="menu-desc text-muted">选择战场开始对战</div>
          <Tag variant="blue" class="battle-tag">NEW</Tag>
        </Card>
      </div>
    </main>
    
    <!-- 战场选择弹窗 -->
    <BattlefieldSelector 
      v-if="showSelector" 
      @close="showSelector = false"
      @select="onBattlefieldSelect"
    />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useUserStore } from '../stores/user';
import BattlefieldSelector from './BattlefieldSelector.vue';
import CRTScanlines from '../components/ui/CRTScanlines.vue';
import Button from '../components/ui/Button.vue';
import Card from '../components/ui/Card.vue';
import Tag from '../components/ui/Tag.vue';
import Icon from '../components/ui/Icon.vue';

const router = useRouter();
const userStore = useUserStore();

const user = computed(() => userStore.user);
const showSelector = ref(false);

function getFactionName(faction) {
  const names = {
    earth: '地球联合',
    bylon: '拜隆',
    maxion: '马克西翁'
  };
  return names[faction] || '未知';
}

function getFactionVariant(faction) {
  const variants = {
    earth: 'blue',
    bylon: 'yellow',
    maxion: 'green'
  };
  return variants[faction] || 'default';
}

function handleLogout() {
  localStorage.removeItem('token');
  userStore.clearUser();
  router.push('/login');
}

function showBattlefieldSelector() {
  showSelector.value = true;
}

function onBattlefieldSelect(battlefieldId) {
  showSelector.value = false;
  // BattlefieldSelector 内部会处理跳转到整备室的逻辑
}
</script>

<style scoped>
.home-container {
  min-height: 100vh;
  background-color: var(--surface);
  position: relative;
}

.home-header {
  background: linear-gradient(180deg, var(--surface-container-high) 0%, var(--surface-container) 100%);
  padding: 20px 24px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

/* 色调层级边框 - 代替1px solid */
.home-header::before {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    var(--surface-container-high) 20%,
    var(--surface-container-highest) 50%,
    var(--surface-container-high) 80%,
    transparent 100%
  );
}

.header-title-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.header-title {
  font-family: var(--font-headline);
  font-size: 32px;
  font-weight: 900;
  color: var(--primary);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  font-style: italic;
}

.header-subtitle {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: var(--on-surface-variant);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 16px;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-name {
  font-family: var(--font-headline);
  font-size: 14px;
  font-weight: 700;
  color: var(--on-surface);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.faction-tag {
  font-size: 10px;
}

.home-main {
  padding: 32px;
  max-width: 1200px;
  margin: 0 auto;
}

.menu-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 20px;
}

.menu-card {
  text-align: center;
  cursor: pointer;
  padding: 24px 20px;
  position: relative;
  background: var(--surface-container);
  border-radius: 0;
  transition: all 0.2s steps(4);
  overflow: hidden;
}

/* 色调层级边框 - 代替1px solid */
.menu-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    var(--surface-container-high) 20%,
    var(--surface-container-highest) 50%,
    var(--surface-container-high) 80%,
    transparent 100%
  );
}

.menu-card::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    var(--surface-container-high) 20%,
    var(--surface-container-highest) 50%,
    var(--surface-container-high) 80%,
    transparent 100%
  );
}

.menu-card-battle:hover {
  background: var(--surface-container-low);
}

.menu-card:hover {
  transform: translateY(-4px);
  background: var(--surface-container-low);
  box-shadow: 0 4px 0 0 var(--primary), 0 8px 20px rgba(0, 255, 65, 0.15);
}

.menu-icon {
  margin-bottom: 16px;
  opacity: 0.9;
}

.menu-title {
  font-family: var(--font-headline);
  font-size: 18px;
  font-weight: 700;
  color: var(--on-surface);
  margin-bottom: 8px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.menu-desc {
  font-family: var(--font-body);
  font-size: 14px;
  line-height: 1.4;
  color: var(--on-surface-variant);
}

.battle-tag {
  position: absolute;
  top: 12px;
  right: 12px;
}
</style>
