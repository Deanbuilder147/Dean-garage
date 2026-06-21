<template>
  <div class="unit-list-container p-6">
    <header class="header flex justify-between items-center mb-6">
      <h1 class="text-2xl font-bold text-primary">机甲棋子管理</h1>
      <div class="actions flex gap-4">
        <button @click="showExportModal = true" class="btn btn-secondary">
          📤 导出 JSON
        </button>
        <button @click="showImportModal = true" class="btn btn-secondary">
          📥 Excel 导入
        </button>
        <router-link to="/units/new" class="btn btn-primary">
          ➕ 新建棋子
        </router-link>
      </div>
    </header>

    <!-- 棋子列表 -->
    <div v-if="loading" class="loading">加载中...</div>
    <div v-else-if="error" class="error text-danger">{{ error }}</div>
    <div v-else class="unit-grid grid gap-4">
      <div v-for="unit in units" :key="unit.id" class="unit-card card">
        <div class="unit-header flex items-center gap-4">
          <img v-if="unit.main_image_url" :src="unit.main_image_url" :alt="unit.name" class="unit-thumbnail rounded">
          <div class="unit-info">
            <h3 class="unit-name text-lg font-bold">{{ unit.name }}</h3>
            <p class="unit-codename text-muted">{{ unit.codename || '无代号' }}</p>
            <div class="unit-meta flex gap-2 mt-2">
              <span class="tag" :class="'tag-' + unit.faction">{{ getFactionName(unit.faction) }}</span>
              <span class="tag tag-type">{{ unit.main_type || '未配置' }}</span>
            </div>
          </div>
        </div>
        <div class="unit-stats grid grid-cols-4 gap-2 mt-4">
          <div class="stat">
            <div class="stat-label text-muted">格斗</div>
            <div class="stat-value">{{ unit.main_格斗 || 0 }}</div>
          </div>
          <div class="stat">
            <div class="stat-label text-muted">射击</div>
            <div class="stat-value">{{ unit.main_射击 || 0 }}</div>
          </div>
          <div class="stat">
            <div class="stat-label text-muted">结构</div>
            <div class="stat-value">{{ unit.main_结构 || 0 }}</div>
          </div>
          <div class="stat">
            <div class="stat-label text-muted">机动</div>
            <div class="stat-value">{{ unit.main_机动 || 0 }}</div>
          </div>
        </div>
        <div class="unit-actions flex gap-2 mt-4">
          <router-link :to="`/units/${unit.id}`" class="btn btn-sm btn-primary">编辑</router-link>
          <button @click="deleteUnit(unit.id)" class="btn btn-sm btn-danger">删除</button>
        </div>
      </div>
    </div>

    <!-- 导出 JSON 模态框 -->
    <div v-if="showExportModal" class="modal-overlay" @click="showExportModal = false">
      <div class="modal card" @click.stop>
        <h2 class="text-xl font-bold mb-4">导出棋子数据为 JSON</h2>
        <div class="modal-body">
          <div class="form-group mb-4">
            <label class="block mb-2">导出范围：</label>
            <div class="flex gap-4">
              <label class="radio-label">
                <input type="radio" v-model="exportScope" value="all"> 所有棋子
              </label>
              <label class="radio-label">
                <input type="radio" v-model="exportScope" value="selected"> 选中棋子
              </label>
            </div>
          </div>
          <div class="form-group mb-4">
            <label class="block mb-2">
              <input type="checkbox" v-model="includeStats"> 包含详细属性
            </label>
          </div>
          <div class="preview bg-surface-light p-4 rounded mb-4">
            <p class="text-sm text-muted">将导出 {{ exportCount }} 个棋子</p>
          </div>
        </div>
        <div class="modal-footer flex gap-2 justify-end">
          <button @click="showExportModal = false" class="btn btn-secondary">取消</button>
          <button @click="exportToJSON" class="btn btn-primary">📤 导出文件</button>
        </div>
      </div>
    </div>

    <!-- Excel 导入模态框 -->
    <div v-if="showImportModal" class="modal-overlay" @click="showImportModal = false">
      <div class="modal card" @click.stop>
        <h2 class="text-xl font-bold mb-4">Excel 导入棋子</h2>
        <div class="modal-body">
          <input type="file" @change="handleFileSelect" accept=".xlsx,.xls" class="file-input">
          <p class="text-sm text-muted mt-2">支持 .xlsx 和 .xls 格式</p>
        </div>
        <div class="modal-footer flex gap-2 justify-end">
          <button @click="showImportModal = false" class="btn btn-secondary">取消</button>
          <button @click="handleImport" :disabled="!selectedFile" class="btn btn-primary">📥 导入</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useUnitStore } from '../stores/unit'

const unitStore = useUnitStore()
const units = computed(() => unitStore.units)
const loading = computed(() => unitStore.loading)
const error = computed(() => unitStore.error)

const showExportModal = ref(false)
const showImportModal = ref(false)
const exportScope = ref('all')
const includeStats = ref(true)
const selectedFile = ref(null)

const exportCount = computed(() => {
  return units.value.length
})

onMounted(() => {
  unitStore.fetchUnits()
  unitStore.fetchUnitTypes()
})

const getFactionName = (faction) => {
  const names = {
    earth: '地球联邦',
    byron: '拜伦帝国',
    maxion: '马克森同盟'
  }
  return names[faction] || faction
}

const deleteUnit = async (id) => {
  if (confirm('确定要删除这个棋子吗？')) {
    try {
      await unitStore.deleteUnit(id)
      alert('删除成功')
    } catch (error) {
      alert('删除失败：' + error.message)
    }
  }
}

const handleFileSelect = (event) => {
  selectedFile.value = event.target.files[0]
}

const handleImport = async () => {
  if (!selectedFile.value) return
  
  try {
    await unitStore.importExcel(selectedFile.value)
    alert('导入成功！')
    showImportModal.value = false
    selectedFile.value = null
  } catch (error) {
    alert('导入失败：' + error.message)
  }
}

const exportToJSON = () => {
  const exportData = {
    version: '1.0',
    exportDate: new Date().toISOString(),
    totalCount: units.value.length,
    units: units.value.map(unit => ({
      id: unit.id,
      name: unit.name,
      codename: unit.codename,
      faction: unit.faction,
      main_type: unit.main_type,
      main_格斗：unit.main_格斗，
      main_射击：unit.main_射击，
      main_结构：unit.main_结构，
      main_机动：unit.main_机动，
      main_skills: unit.main_skills ? JSON.parse(unit.main_skills) : null,
      main_image_url: unit.main_image_url,
      has_royroy: unit.has_royroy,
      royroy_name: unit.royroy_name,
      royroy_格斗：unit.royroy_格斗，
      royroy_射击：unit.royroy_射击，
      royroy_结构：unit.royroy_结构，
      royroy_机动：unit.royroy_机动，
      royroy_skills: unit.royroy_skills ? JSON.parse(unit.royroy_skills) : null,
      left_type: unit.left_type,
      left_格斗：unit.left_格斗，
      left_射击：unit.left_射击，
      left_结构：unit.left_结构，
      left_机动：unit.left_机动，
      left_skills: unit.left_skills ? JSON.parse(unit.left_skills) : null,
      right_type: unit.right_type,
      right_格斗：unit.right_格斗，
      right_射击：unit.right_射击，
      right_结构：unit.right_结构，
      right_机动：unit.right_机动，
      right_skills: unit.right_skills ? JSON.parse(unit.right_skills) : null,
      extra_type: unit.extra_type,
      extra_格斗：unit.extra_格斗，
      extra_射击：unit.extra_射击，
      extra_结构：unit.extra_结构，
      extra_机动：unit.extra_机动，
      extra_skills: unit.extra_skills ? JSON.parse(unit.extra_skills) : null,
      created_at: unit.created_at
    }))
  }

  const jsonString = JSON.stringify(exportData, null, 2)
  const blob = new Blob([jsonString], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `units_export_${new Date().toISOString().split('T')[0]}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  
  showExportModal.value = false
  alert(`成功导出 ${units.value.length} 个棋子到 JSON 文件！`)
}
</script>

<style scoped>
.unit-list-container {
  max-width: 1400px;
  margin: 0 auto;
}

.header {
  border-bottom: 2px solid var(--border);
  padding-bottom: var(--spacing);
}

.unit-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: var(--spacing);
}

.unit-card {
  background: var(--surface-light);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--spacing);
  transition: transform 0.2s, box-shadow 0.2s;
}

.unit-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
}

.unit-thumbnail {
  width: 80px;
  height: 80px;
  object-fit: cover;
  border: 2px solid var(--border);
}

.tag {
  padding: 0.25rem 0.5rem;
  border-radius: var(--radius-sm);
  font-size: 0.75rem;
  font-weight: bold;
}

.tag-earth {
  background: rgba(59, 130, 246, 0.2);
  color: #60a5fa;
}

.tag-byron {
  background: rgba(168, 85, 247, 0.2);
  color: #c084fc;
}

.tag-maxion {
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
}

.tag-type {
  background: rgba(16, 185, 129, 0.2);
  color: #34d399;
}

.stat {
  text-align: center;
  padding: var(--spacing-sm);
  background: var(--surface);
  border-radius: var(--radius);
}

.stat-value {
  font-size: 1.25rem;
  font-weight: bold;
  color: var(--primary);
}

.stat-label {
  font-size: 0.75rem;
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
  max-height: 90vh;
  overflow-y: auto;
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

.file-input {
  width: 100%;
  padding: var(--spacing);
  background: var(--surface);
  border: 2px dashed var(--border);
  border-radius: var(--radius);
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
