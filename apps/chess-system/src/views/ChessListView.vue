<template>
  <div class="chess-list-view">
    <header class="header flex justify-between items-center mb-6">
      <h1 class="text-2xl font-bold">棋子列表</h1>
      <router-link to="/chess-units/new" class="btn btn-primary">➕ 新建棋子</router-link>
    </header>

    <div v-if="loading" class="loading">加载中...</div>
    <div v-else class="chess-grid grid gap-4">
      <div v-for="unit in units" :key="unit.id" class="chess-card card">
        <div class="chess-header flex justify-between items-center mb-4">
          <h3 class="unit-name text-xl font-bold">{{ unit.name }}</h3>
          <span class="faction-tag" :style="{ background: getFactionColor(unit.faction) }">
            {{ getFactionName(unit.faction) }}
          </span>
        </div>
        
        <div class="unit-stats grid grid-cols-2 gap-2 mb-4">
          <div class="stat">
            <span class="text-muted">HP:</span>
            <span class="font-bold">{{ unit.stats?.hp || 0 }}</span>
          </div>
          <div class="stat">
            <span class="text-muted">攻击:</span>
            <span class="font-bold text-danger">{{ unit.stats?.attack || 0 }}</span>
          </div>
          <div class="stat">
            <span class="text-muted">防御:</span>
            <span class="font-bold text-success">{{ unit.stats?.defense || 0 }}</span>
          </div>
          <div class="stat">
            <span class="text-muted">速度:</span>
            <span class="font-bold text-accent">{{ unit.stats?.speed || 0 }}</span>
          </div>
        </div>

        <div class="unit-tags flex gap-2 mb-4">
          <span v-for="tag in unit.tags" :key="tag" class="tag">
            {{ getTagName(tag) }}
          </span>
        </div>

        <div class="chess-actions flex gap-2">
          <router-link :to="`/chess-units/${unit.id}`" class="btn btn-sm btn-primary">编辑</router-link>
          <button @click="exportUnit(unit.id)" class="btn btn-sm btn-secondary">📤 导出</button>
        </div>
      </div>

      <div v-if="units.length === 0" class="empty-state card">
        <p class="text-muted text-center">暂无棋子数据</p>
        <router-link to="/chess-units/new" class="btn btn-primary mt-4">创建第一个棋子</router-link>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useChessStore } from '../stores/chess'

const chessStore = useChessStore()
const units = computed(() => chessStore.units)
const loading = computed(() => chessStore.loading)
const factions = computed(() => chessStore.factions)

onMounted(() => {
  // 加载预设数据
  loadPresetUnits()
})

const getFactionColor = (factionId) => {
  const faction = factions.value.find(f => f.id === factionId)
  return faction?.color || '#64748b'
}

const getFactionName = (factionId) => {
  const faction = factions.value.find(f => f.id === factionId)
  return faction?.name || factionId
}

const getTagName = (tag) => {
  const tagMap = {
    output: '输出',
    burst: '爆发',
    aoe: '范围',
    control: '控制',
    support: '支援',
    tank: '坦克',
    speed: '速度',
    defense: '防御'
  }
  return tagMap[tag] || tag
}

const exportUnit = async (id) => {
  try {
    await chessStore.exportUnitToJSON(id)
    alert('导出成功！')
  } catch (error) {
    alert('导出失败：' + error.message)
  }
}

const loadPresetUnits = () => {
  // 加载预设棋子数据
  chessStore.units = [
    {
      id: 1,
      name: '烈焰凤凰',
      faction: 'earth',
      type: 'mech',
      rarity: 'ssr',
      stats: { hp: 3200, attack: 850, defense: 420, speed: 95, range: 5, cost: 10 },
      tags: ['output', 'burst', 'aoe'],
      description: '地球联邦的精英机甲，擅长范围攻击'
    },
    {
      id: 2,
      name: '寒冰守卫',
      faction: 'earth',
      type: 'mech',
      rarity: 'sr',
      stats: { hp: 4500, attack: 520, defense: 680, speed: 65, range: 4, cost: 9 },
      tags: ['tank', 'control', 'defense'],
      description: '强大的防御型机甲，能有效保护队友'
    },
    {
      id: 3,
      name: '暗影刺客',
      faction: 'byron',
      type: 'mech',
      rarity: 'ssr',
      stats: { hp: 2800, attack: 920, defense: 350, speed: 120, range: 3, cost: 10 },
      tags: ['output', 'burst', 'speed'],
      description: '拜伦帝国的刺客单位，拥有极高的机动性'
    },
    {
      id: 4,
      name: '雷霆战锤',
      faction: 'byron',
      type: 'mech',
      rarity: 'sr',
      stats: { hp: 3800, attack: 780, defense: 520, speed: 70, range: 4, cost: 9 },
      tags: ['output', 'aoe', 'tank'],
      description: '重装攻击机甲，擅长突破敌方防线'
    },
    {
      id: 5,
      name: '风暴使者',
      faction: 'maxion',
      type: 'mech',
      rarity: 'ssr',
      stats: { hp: 3000, attack: 880, defense: 400, speed: 100, range: 6, cost: 10 },
      tags: ['output', 'aoe', 'control'],
      description: '马克辛共和国的王牌机甲，掌控风暴之力'
    },
    {
      id: 6,
      name: '大地守护者',
      faction: 'maxion',
      type: 'mech',
      rarity: 'sr',
      stats: { hp: 5000, attack: 480, defense: 750, speed: 60, range: 3, cost: 9 },
      tags: ['tank', 'defense', 'support'],
      description: '最坚固的防御机甲，能为队友提供护盾'
    }
  ]
}
</script>

<style scoped>
.chess-list-view {
  max-width: 1400px;
}

.header {
  border-bottom: 2px solid var(--border);
  padding-bottom: var(--spacing);
}

.chess-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: var(--spacing-lg);
}

.chess-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--spacing-lg);
  transition: transform 0.2s, box-shadow 0.2s;
}

.chess-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-lg);
}

.faction-tag {
  padding: 0.25rem 0.75rem;
  border-radius: var(--radius-sm);
  font-size: 0.75rem;
  font-weight: bold;
  color: white;
}

.unit-stats {
  background: var(--surface-light);
  padding: var(--spacing);
  border-radius: var(--radius);
}

.stat {
  display: flex;
  justify-content: space-between;
  font-size: 0.875rem;
}

.unit-tags {
  flex-wrap: wrap;
}

.tag {
  background: var(--surface-lighter);
  color: var(--on-surface);
  padding: 0.25rem 0.5rem;
  border-radius: var(--radius-sm);
  font-size: 0.75rem;
  font-weight: 600;
}

.empty-state {
  text-align: center;
  padding: var(--spacing-xl);
}

.btn-sm {
  padding: 0.25rem 0.75rem;
  font-size: 0.875rem;
}

.loading {
  text-align: center;
  padding: var(--spacing-xl);
  font-size: 1.25rem;
  color: var(--muted);
}
</style>
