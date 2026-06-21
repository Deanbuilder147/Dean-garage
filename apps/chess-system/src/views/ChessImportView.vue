<template>
  <div class="chess-import-view p-6">
    <header class="header mb-6">
      <div class="flex items-center gap-4">
        <router-link to="/chess-units" class="btn btn-secondary">← 返回列表</router-link>
        <h1 class="text-2xl font-bold">导入棋子数据</h1>
      </div>
    </header>

    <div class="card">
      <h2 class="text-xl font-bold mb-4">JSON 导入</h2>
      <p class="text-muted mb-4">粘贴棋子 JSON 数据进行批量导入</p>
      
      <textarea 
        v-model="jsonInput" 
        rows="10" 
        class="input-field mb-4"
        placeholder='[{"name": "棋子名称", "faction": "earth", ...}]'
      ></textarea>
      
      <div class="flex gap-2">
        <button @click="importJSON" class="btn btn-primary">📥 导入数据</button>
        <button @click="loadExample" class="btn btn-secondary">📋 加载示例</button>
      </div>
    </div>

    <div v-if="importedUnits.length > 0" class="card mt-6">
      <h2 class="text-xl font-bold mb-4">已导入的棋子 ({{ importedUnits.length }})</h2>
      <div class="imported-list">
        <div v-for="unit in importedUnits" :key="unit.id" class="imported-item flex justify-between items-center py-2">
          <div>
            <span class="font-bold">{{ unit.name }}</span>
            <span class="text-muted ml-2">{{ getFactionName(unit.faction) }}</span>
          </div>
          <span class="text-success">✓ 已导入</span>
        </div>
      </div>
      <router-link to="/chess-units" class="btn btn-primary mt-4">查看棋子列表</router-link>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useChessStore } from '../stores/chess'

const chessStore = useChessStore()
const jsonInput = ref('')
const importedUnits = ref([])

const getFactionName = (factionId) => {
  const faction = chessStore.factions.find(f => f.id === factionId)
  return faction?.name || factionId
}

const loadExample = () => {
  jsonInput.value = JSON.stringify([
    {
      name: "示例机甲",
      faction: "earth",
      type: "mech",
      rarity: "sr",
      stats: { hp: 3000, attack: 600, defense: 400, speed: 80, range: 4, cost: 8 },
      tags: ["output", "support"],
      description: "这是一个示例棋子"
    }
  ], null, 2)
}

const importJSON = () => {
  try {
    const data = JSON.parse(jsonInput.value)
    const units = Array.isArray(data) ? data : [data]
    
    units.forEach((unit, index) => {
      if (!unit.name || !unit.faction || !unit.stats) {
        throw new Error(`第 ${index + 1} 个棋子数据不完整`)
      }
      
      const newUnit = {
        ...unit,
        id: Date.now() + index
      }
      
      chessStore.units.push(newUnit)
      importedUnits.value.push(newUnit)
    })
    
    alert(`成功导入 ${units.length} 个棋子！`)
    jsonInput.value = ''
  } catch (error) {
    alert('导入失败：' + error.message)
  }
}
</script>

<style scoped>
.chess-import-view {
  max-width: 800px;
  margin: 0 auto;
}

.header {
  border-bottom: 2px solid var(--border);
  padding-bottom: var(--spacing);
}

.input-field {
  width: 100%;
  padding: var(--spacing);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--on-surface);
  font-family: monospace;
  font-size: 0.875rem;
}

.input-field:focus {
  outline: none;
  border-color: var(--primary);
}

.imported-list {
  max-height: 300px;
  overflow-y: auto;
}

.imported-item {
  border-bottom: 1px solid var(--border);
}

.imported-item:last-child {
  border-bottom: none;
}
</style>
