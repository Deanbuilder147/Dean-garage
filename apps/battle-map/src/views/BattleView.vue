<template>
  <div class="battle-view-container p-6">
    <header class="header flex justify-between items-center mb-6">
      <div class="flex items-center gap-4">
        <router-link to="/battlefields" class="btn btn-secondary">← 返回战场</router-link>
        <h1 class="text-2xl font-bold">战斗界面</h1>
      </div>
      <div class="actions flex gap-2">
        <button @click="exportBattle" class="btn btn-secondary">📤 导出 JSON</button>
        <button @click="startBattle" v-if="!battleStarted" class="btn btn-accent">⚔️ 开始战斗</button>
      </div>
    </header>

    <div v-if="loading" class="loading">加载战斗数据...</div>
    <div v-else-if="error" class="error text-danger">{{ error }}</div>
    <div v-else class="battle-content">
      <!-- 战场地图 -->
      <div class="battlefield-map card p-4 mb-6">
        <h2 class="text-xl font-bold mb-4">战场地图</h2>
        <div id="pixi-container" class="w-full h-96 bg-surface"></div>
      </div>

      <!-- 战斗状态 -->
      <div class="battle-status grid grid-cols-2 gap-4">
        <div class="card p-4">
          <h3 class="font-bold mb-2">当前回合</h3>
          <p class="text-2xl text-primary">{{ currentTurn || 1 }}</p>
        </div>
        <div class="card p-4">
          <h3 class="font-bold mb-2">战斗状态</h3>
          <p class="text-2xl" :class="statusClass">{{ battleStatus }}</p>
        </div>
      </div>

      <!-- WebSocket 状态 -->
      <div class="ws-status mt-4 p-4 card">
        <div class="flex items-center gap-2">
          <div class="status-dot" :class="wsConnected ? 'connected' : 'disconnected'"></div>
          <span>{{ wsConnected ? 'WebSocket 已连接' : 'WebSocket 未连接' }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useBattleStore, useBattlefieldStore } from '../stores/battle'

const route = useRoute()
const battleStore = useBattleStore()
const battlefieldStore = useBattlefieldStore()

const loading = ref(true)
const error = ref(null)
const battleStarted = ref(false)
const currentTurn = ref(1)
const battleStatus = ref('未开始')
const wsConnected = ref(false)

const statusClass = computed(() => {
  return {
    'text-success': battleStatus.value === '进行中',
    'text-warning': battleStatus.value === '未开始',
    'text-danger': battleStatus.value === '已结束'
  }
})

onMounted(async () => {
  try {
    // 加载战场数据
    await battlefieldStore.fetchBattlefield(route.params.id)
    
    // 初始化 PixiJS 渲染
    initPixiJS()
    
    loading.value = false
  } catch (err) {
    error.value = err.message
    loading.value = false
  }
})

onUnmounted(() => {
  battleStore.disconnectWebSocket()
})

const initPixiJS = () => {
  // PixiJS 初始化代码 (简化版)
  console.log('Initialize PixiJS battlefield render')
  // 实际应用中这里会初始化 PixiJS 应用
}

const startBattle = async () => {
  try {
    await battleStore.createBattle({
      battlefield_id: route.params.id,
      units: []
    })
    
    battleStarted.value = true
    currentTurn.value = 1
    battleStatus.value = '进行中'
    
    // 连接 WebSocket
    battleStore.connectWebSocket(route.params.id)
    
    battleStore.ws.onopen = () => {
      wsConnected.value = true
    }
    
    battleStore.ws.onclose = () => {
      wsConnected.value = false
    }
    
    alert('战斗开始！')
  } catch (err) {
    alert('启动战斗失败：' + err.message)
  }
}

const exportBattle = async () => {
  try {
    // 如果有战斗 ID，导出战斗数据
    if (battleStore.currentBattle) {
      await battleStore.exportBattleToJSON(battleStore.currentBattle.id)
    } else {
      // 否则导出战场数据
      await battlefieldStore.exportBattlefieldToJSON(route.params.id)
    }
    alert('导出成功！')
  } catch (err) {
    alert('导出失败：' + err.message)
  }
}
</script>

<style scoped>
.battle-view-container {
  max-width: 1400px;
  margin: 0 auto;
}

.header {
  border-bottom: 2px solid var(--border);
  padding-bottom: var(--spacing);
}

.battlefield-map {
  background: var(--surface-light);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
}

#pixi-container {
  min-height: 384px;
}

.battle-status {
  max-width: 800px;
}

.ws-status {
  background: var(--surface-light);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.status-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.status-dot.connected {
  background: var(--success);
  box-shadow: 0 0 8px var(--success);
}

.status-dot.disconnected {
  background: var(--danger);
}

.btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: var(--radius);
  font-weight: bold;
  cursor: pointer;
  text-decoration: none;
}

.btn-secondary {
  background: var(--surface-lighter);
  color: var(--on-surface);
  border: 1px solid var(--border);
}

.btn-accent {
  background: var(--accent);
  color: white;
}

.btn-accent:hover {
  background: #db2777;
}

.loading, .error {
  text-align: center;
  padding: var(--spacing-xl);
  font-size: 1.25rem;
}
</style>
