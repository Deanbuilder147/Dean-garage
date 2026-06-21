<template>
  <div class="battlefield-list-container p-6">
    <header class="header flex justify-between items-center mb-6">
      <h1 class="text-2xl font-bold text-accent">战斗地图管理</h1>
      <div class="actions flex gap-4">
        <button @click="showExportModal = true" class="btn btn-secondary">
          📤 批量导出 JSON
        </button>
        <router-link to="/battlefields/new" class="btn btn-primary">
          ➕ 新建战场
        </router-link>
      </div>
    </header>

    <!-- 战场列表 -->
    <div v-if="loading" class="loading">加载中...</div>
    <div v-else-if="error" class="error text-danger">{{ error }}</div>
    <div v-else class="battlefield-grid grid gap-4">
      <div v-for="bf in battlefields" :key="bf.id" class="battlefield-card card">
        <div class="battlefield-header">
          <h3 class="battlefield-name text-lg font-bold">{{ bf.name }}</h3>
          <span v-if="bf.is_public" class="tag tag-public">公开</span>
        </div>
        <div class="battlefield-info mt-4">
          <div class="info-row flex justify-between">
            <span class="text-muted">尺寸:</span>
            <span>{{ bf.width }} x {{ bf.height }}</span>
          </div>
          <div class="info-row flex justify-between mt-2">
            <span class="text-muted">格子数:</span>
            <span>{{ (bf.width * bf.height).toLocaleString() }}</span>
          </div>
          <div class="info-row flex justify-between mt-2">
            <span class="text-muted">创建时间:</span>
            <span>{{ formatDate(bf.created_at) }}</span>
          </div>
        </div>
        <div class="battlefield-actions flex gap-2 mt-4">
          <router-link :to="`/battlefields/${bf.id}`" class="btn btn-sm btn-primary">编辑</router-link>
          <button @click="exportBattlefield(bf.id)" class="btn btn-sm btn-secondary">📤 导出</button>
          <button @click="startBattle(bf.id)" class="btn btn-sm btn-accent">⚔️ 开始战斗</button>
          <button @click="deleteBattlefield(bf.id)" class="btn btn-sm btn-danger">删除</button>
        </div>
      </div>
    </div>

    <!-- 批量导出模态框 -->
    <div v-if="showExportModal" class="modal-overlay" @click="showExportModal = false">
      <div class="modal card" @click.stop>
        <h2 class="text-xl font-bold mb-4">批量导出战场数据</h2>
        <div class="modal-body">
          <div class="form-group mb-4">
            <label class="block mb-2">选择导出范围：</label>
            <div class="flex gap-4">
              <label class="radio-label">
                <input type="radio" v-model="exportScope" value="all"> 所有战场 ({{ battlefields.length }} 个)
              </label>
            </div>
          </div>
          <div class="preview bg-surface-light p-4 rounded mb-4">
            <p class="text-sm text-muted">将导出 {{ battlefields.length }} 个战场到 ZIP 文件</p>
          </div>
        </div>
        <div class="modal-footer flex gap-2 justify-end">
          <button @click="showExportModal = false" class="btn btn-secondary">取消</button>
          <button @click="exportAllToJSON" class="btn btn-primary">📤 导出全部</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useBattlefieldStore } from '../stores/battle'

const router = useRouter()
const battlefieldStore = useBattlefieldStore()

const battlefields = computed(() => battlefieldStore.battlefields)
const loading = computed(() => battlefieldStore.loading)
const error = computed(() => battlefieldStore.error)

const showExportModal = ref(false)
const exportScope = ref('all')

onMounted(() => {
  battlefieldStore.fetchBattlefields()
  battlefieldStore.fetchTerrainTypes()
})

const formatDate = (dateString) => {
  const date = new Date(dateString)
  return date.toLocaleDateString('zh-CN')
}

const deleteBattlefield = async (id) => {
  if (confirm('确定要删除这个战场吗？此操作不可恢复。')) {
    try {
      await battlefieldStore.deleteBattlefield(id)
      alert('删除成功')
    } catch (error) {
      alert('删除失败：' + error.message)
    }
  }
}

const exportBattlefield = async (id) => {
  try {
    await battlefieldStore.exportBattlefieldToJSON(id)
    alert('导出成功！')
  } catch (error) {
    alert('导出失败：' + error.message)
  }
}

const startBattle = (battlefieldId) => {
  router.push(`/battle/${battlefieldId}`)
}

const exportAllToJSON = () => {
  const exportData = {
    version: '1.0',
    exportDate: new Date().toISOString(),
    totalCount: battlefields.value.length,
    battlefields: battlefields.value.map(bf => ({
      id: bf.id,
      name: bf.name,
      width: bf.width,
      height: bf.height,
      cells: bf.cells ? JSON.parse(bf.cells) : [],
      is_public: bf.is_public,
      created_at: bf.created_at
    }))
  }

  const jsonString = JSON.stringify(exportData, null, 2)
  const blob = new Blob([jsonString], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `battlefields_export_${new Date().toISOString().split('T')[0]}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  
  showExportModal.value = false
  alert(`成功导出 ${battlefields.value.length} 个战场到 JSON 文件！`)
}
</script>

<style scoped>
.battlefield-list-container {
  max-width: 1400px;
  margin: 0 auto;
}

.header {
  border-bottom: 2px solid var(--border);
  padding-bottom: var(--spacing);
}

.battlefield-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
  gap: var(--spacing);
}

.battlefield-card {
  background: var(--surface-light);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--spacing-lg);
  transition: transform 0.2s, box-shadow 0.2s;
}

.battlefield-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
}

.battlefield-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.tag-public {
  background: rgba(16, 185, 129, 0.2);
  color: var(--success);
  padding: 0.25rem 0.5rem;
  border-radius: var(--radius-sm);
  font-size: 0.75rem;
  font-weight: bold;
}

.info-row {
  font-size: 0.875rem;
}

.btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: var(--radius);
  font-weight: bold;
  cursor: pointer;
  text-decoration: none;
  display: inline-block;
  transition: all 0.2s;
}

.btn-primary {
  background: var(--primary);
  color: white;
}

.btn-primary:hover {
  background: var(--primary-hover);
}

.btn-secondary {
  background: var(--surface-lighter);
  color: var(--on-surface);
  border: 1px solid var(--border);
}

.btn-secondary:hover {
  background: var(--border);
}

.btn-accent {
  background: var(--accent);
  color: white;
}

.btn-accent:hover {
  background: #db2777;
}

.btn-danger {
  background: var(--danger);
  color: white;
}

.btn-sm {
  padding: 0.25rem 0.75rem;
  font-size: 0.875rem;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: var(--surface-light);
  border: 2px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--spacing-lg);
  max-width: 500px;
  width: 90%;
}

.form-group {
  margin-bottom: var(--spacing);
}

.radio-label {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  cursor: pointer;
}

.preview {
  background: var(--surface);
  border: 1px solid var(--border);
}

.loading, .error {
  text-align: center;
  padding: var(--spacing-xl);
  font-size: 1.25rem;
}
</style>
