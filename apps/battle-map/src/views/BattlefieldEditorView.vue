<template>
  <div class="battlefield-editor-container p-6">
    <header class="header flex justify-between items-center mb-6">
      <div class="flex items-center gap-4">
        <router-link to="/battlefields" class="btn btn-secondary">← 返回列表</router-link>
        <h1 class="text-2xl font-bold">{{ isEdit ? '编辑战场' : '新建战场' }}</h1>
      </div>
      <div class="actions flex gap-2">
        <button @click="exportCurrent" class="btn btn-secondary">📤 导出 JSON</button>
        <button @click="saveBattlefield" :disabled="saving" class="btn btn-primary">
          {{ saving ? '保存中...' : '💾 保存' }}
        </button>
      </div>
    </header>

    <form @submit.prevent="saveBattlefield" class="editor-form">
      <section class="form-section card">
        <h2 class="section-title text-xl font-bold mb-4">基本信息</h2>
        <div class="grid grid-cols-2 gap-4">
          <div class="form-group">
            <label class="block mb-2">战场名称 *</label>
            <input v-model="form.name" type="text" required class="input-field">
          </div>
          <div class="form-group">
            <label class="block mb-2">
              <input type="checkbox" v-model="form.is_public"> 公开战场
            </label>
          </div>
        </div>
      </section>

      <section class="form-section card">
        <h2 class="section-title text-xl font-bold mb-4">地图尺寸</h2>
        <div class="grid grid-cols-2 gap-4">
          <div class="form-group">
            <label class="block mb-2">宽度 (列数) *</label>
            <input v-model.number="form.width" type="number" min="5" max="50" required class="input-field">
          </div>
          <div class="form-group">
            <label class="block mb-2">高度 (行数) *</label>
            <input v-model.number="form.height" type="number" min="5" max="50" required class="input-field">
          </div>
        </div>
        <div class="mt-4 p-4 bg-surface rounded">
          <p class="text-muted">总格子数：<span class="text-primary font-bold">{{ form.width * form.height }}</span></p>
        </div>
      </section>

      <section class="form-section card">
        <h2 class="section-title text-xl font-bold mb-4">地图预览</h2>
        <div class="map-preview bg-surface p-4 rounded">
          <p class="text-muted mb-4">保存后可在详细编辑模式中编辑地形</p>
          <div 
            class="grid gap-1" 
            :style="{ gridTemplateColumns: `repeat(${Math.min(form.width, 20)}, 1fr)` }"
          >
            <div 
              v-for="i in Math.min(form.width * form.height, 400)" 
              :key="i"
              class="cell w-6 h-6 bg-surface-lighter border border-border"
            ></div>
          </div>
          <p v-if="form.width * form.height > 400" class="text-muted mt-2">
            (仅显示前 400 个格子，实际将创建 {{ form.width * form.height }} 个格子)
          </p>
        </div>
      </section>
    </form>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useBattlefieldStore } from '../stores/battle'

const route = useRoute()
const router = useRouter()
const battlefieldStore = useBattlefieldStore()

const isEdit = computed(() => !!route.params.id)
const saving = ref(false)

const form = ref({
  name: '',
  width: 10,
  height: 10,
  is_public: false,
  cells: []
})

onMounted(async () => {
  if (isEdit.value) {
    try {
      const battlefield = await battlefieldStore.fetchBattlefield(route.params.id)
      Object.assign(form.value, {
        id: battlefield.id,
        name: battlefield.name,
        width: battlefield.width,
        height: battlefield.height,
        is_public: battlefield.is_public,
        cells: battlefield.cells ? JSON.parse(battlefield.cells) : []
      })
    } catch (error) {
      alert('加载失败：' + error.message)
      router.push('/battlefields')
    }
  }
})

const saveBattlefield = async () => {
  saving.value = true
  try {
    const data = {
      name: form.value.name,
      width: form.value.width,
      height: form.value.height,
      is_public: form.value.is_public,
      cells: JSON.stringify(form.value.cells.length > 0 ? form.value.cells : generateDefaultCells(form.value.width, form.value.height))
    }

    if (isEdit.value) {
      await battlefieldStore.updateBattlefield(route.params.id, data)
    } else {
      await battlefieldStore.createBattlefield(data)
    }
    
    alert('保存成功！')
    router.push('/battlefields')
  } catch (error) {
    alert('保存失败：' + error.message)
  } finally {
    saving.value = false
  }
}

const generateDefaultCells = (width, height) => {
  const cells = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      cells.push({
        x,
        y,
        terrain_id: 1,
        hp: 0,
        occupied: false
      })
    }
  }
  return cells
}

const exportCurrent = () => {
  const exportData = {
    version: '1.0',
    exportDate: new Date().toISOString(),
    battlefield: {
      id: form.value.id || 'new',
      name: form.value.name,
      width: form.value.width,
      height: form.value.height,
      is_public: form.value.is_public,
      cells: form.value.cells.length > 0 ? form.value.cells : generateDefaultCells(form.value.width, form.value.height)
    }
  }

  const jsonString = JSON.stringify(exportData, null, 2)
  const blob = new Blob([jsonString], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `battlefield_${form.value.name || 'new'}_${new Date().toISOString().split('T')[0]}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  
  alert('导出成功！')
}
</script>

<style scoped>
.battlefield-editor-container {
  max-width: 1200px;
  margin: 0 auto;
}

.header {
  border-bottom: 2px solid var(--border);
  padding-bottom: var(--spacing);
}

.form-section {
  margin-bottom: var(--spacing-lg);
  padding: var(--spacing-lg);
  background: var(--surface-light);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
}

.form-group {
  margin-bottom: var(--spacing);
}

.input-field {
  width: 100%;
  padding: var(--spacing-sm);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--on-surface);
}

.input-field:focus {
  outline: none;
  border-color: var(--primary);
}

.map-preview {
  overflow-x: auto;
}

.cell {
  width: 1.5rem;
  height: 1.5rem;
}

.btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: var(--radius);
  font-weight: bold;
  cursor: pointer;
  text-decoration: none;
}

.btn-primary {
  background: var(--primary);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: var(--primary-hover);
}

.btn-primary:disabled {
  opacity: 0.5;
}

.btn-secondary {
  background: var(--surface-lighter);
  color: var(--on-surface);
  border: 1px solid var(--border);
}

.btn-secondary:hover {
  background: var(--border);
}
</style>
