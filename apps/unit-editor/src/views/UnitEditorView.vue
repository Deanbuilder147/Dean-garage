<template>
  <div class="unit-editor-container p-6">
    <header class="header flex justify-between items-center mb-6">
      <div class="flex items-center gap-4">
        <router-link to="/units" class="btn btn-secondary">← 返回列表</router-link>
        <h1 class="text-2xl font-bold">{{ isEdit ? '编辑棋子' : '新建棋子' }}</h1>
      </div>
      <div class="actions flex gap-2">
        <button @click="exportCurrentUnit" class="btn btn-secondary">
          📤 导出 JSON
        </button>
        <button @click="saveUnit" :disabled="saving" class="btn btn-primary">
          {{ saving ? '保存中...' : '💾 保存' }}
        </button>
      </div>
    </header>

    <form @submit.prevent="saveUnit" class="editor-form">
      <!-- 基本信息 -->
      <section class="form-section card">
        <h2 class="section-title text-xl font-bold mb-4">基本信息</h2>
        <div class="grid grid-cols-2 gap-4">
          <div class="form-group">
            <label class="block mb-2">名称 *</label>
            <input v-model="form.name" type="text" required class="input-field">
          </div>
          <div class="form-group">
            <label class="block mb-2">代号</label>
            <input v-model="form.codename" type="text" class="input-field">
          </div>
          <div class="form-group">
            <label class="block mb-2">阵营 *</label>
            <select v-model="form.faction" required class="input-field">
              <option value="">请选择</option>
              <option value="earth">地球联邦</option>
              <option value="byron">拜伦帝国</option>
              <option value="maxion">马克森同盟</option>
            </select>
          </div>
          <div class="form-group">
            <label class="block mb-2">主武器类型</label>
            <input v-model="form.main_type" type="text" class="input-field">
          </div>
        </div>

        <!-- 图片上传 -->
        <div class="form-group mt-4">
          <label class="block mb-2">棋子图片</label>
          <div class="flex gap-4 items-center">
            <img v-if="imageUrl" :src="imageUrl" alt="Preview" class="thumbnail rounded">
            <input type="file" @change="handleImageUpload" accept="image/*" class="file-input">
          </div>
        </div>
      </section>

      <!-- 主体属性 -->
      <section class="form-section card">
        <h2 class="section-title text-xl font-bold mb-4">主体属性</h2>
        <div class="grid grid-cols-4 gap-4">
          <div class="form-group">
            <label class="block mb-2">格斗</label>
            <input v-model.number="form.main_格斗" type="number" class="input-field">
          </div>
          <div class="form-group">
            <label class="block mb-2">射击</label>
            <input v-model.number="form.main_射击" type="number" class="input-field">
          </div>
          <div class="form-group">
            <label class="block mb-2">结构</label>
            <input v-model.number="form.main_结构" type="number" class="input-field">
          </div>
          <div class="form-group">
            <label class="block mb-2">机动</label>
            <input v-model.number="form.main_机动" type="number" class="input-field">
          </div>
        </div>
        <div class="form-group mt-4">
          <label class="block mb-2">技能 (JSON 格式)</label>
          <textarea v-model="form.main_skills" rows="4" class="input-field font-mono"></textarea>
        </div>
      </section>

      <!-- 副武器配置 -->
      <section class="form-section card">
        <h2 class="section-title text-xl font-bold mb-4">
          <label>
            <input type="checkbox" v-model="form.has_royroy"> 启用副武器 (Royal Roy)
          </label>
        </h2>
        <div v-if="form.has_royroy" class="grid grid-cols-4 gap-4 mt-4">
          <div class="form-group">
            <label class="block mb-2">名称</label>
            <input v-model="form.royroy_name" type="text" class="input-field">
          </div>
          <div class="form-group">
            <label class="block mb-2">格斗</label>
            <input v-model.number="form.royroy_格斗" type="number" class="input-field">
          </div>
          <div class="form-group">
            <label class="block mb-2">射击</label>
            <input v-model.number="form.royroy_射击" type="number" class="input-field">
          </div>
          <div class="form-group">
            <label class="block mb-2">结构</label>
            <input v-model.number="form.royroy_结构" type="number" class="input-field">
          </div>
          <div class="form-group">
            <label class="block mb-2">机动</label>
            <input v-model.number="form.royroy_机动" type="number" class="input-field">
          </div>
        </div>
      </section>

      <!-- 左装备 -->
      <section class="form-section card">
        <h2 class="section-title text-xl font-bold mb-4">左装备</h2>
        <div class="grid grid-cols-5 gap-4">
          <div class="form-group">
            <label class="block mb-2">类型</label>
            <input v-model="form.left_type" type="text" class="input-field">
          </div>
          <div class="form-group">
            <label class="block mb-2">格斗</label>
            <input v-model.number="form.left_格斗" type="number" class="input-field">
          </div>
          <div class="form-group">
            <label class="block mb-2">射击</label>
            <input v-model.number="form.left_射击" type="number" class="input-field">
          </div>
          <div class="form-group">
            <label class="block mb-2">结构</label>
            <input v-model.number="form.left_结构" type="number" class="input-field">
          </div>
          <div class="form-group">
            <label class="block mb-2">机动</label>
            <input v-model.number="form.left_机动" type="number" class="input-field">
          </div>
        </div>
      </section>

      <!-- 右装备 -->
      <section class="form-section card">
        <h2 class="section-title text-xl font-bold mb-4">右装备</h2>
        <div class="grid grid-cols-5 gap-4">
          <div class="form-group">
            <label class="block mb-2">类型</label>
            <input v-model="form.right_type" type="text" class="input-field">
          </div>
          <div class="form-group">
            <label class="block mb-2">格斗</label>
            <input v-model.number="form.right_格斗" type="number" class="input-field">
          </div>
          <div class="form-group">
            <label class="block mb-2">射击</label>
            <input v-model.number="form.right_射击" type="number" class="input-field">
          </div>
          <div class="form-group">
            <label class="block mb-2">结构</label>
            <input v-model.number="form.right_结构" type="number" class="input-field">
          </div>
          <div class="form-group">
            <label class="block mb-2">机动</label>
            <input v-model.number="form.right_机动" type="number" class="input-field">
          </div>
        </div>
      </section>

      <!-- 额外装备 -->
      <section class="form-section card">
        <h2 class="section-title text-xl font-bold mb-4">额外装备</h2>
        <div class="grid grid-cols-5 gap-4">
          <div class="form-group">
            <label class="block mb-2">类型</label>
            <input v-model="form.extra_type" type="text" class="input-field">
          </div>
          <div class="form-group">
            <label class="block mb-2">格斗</label>
            <input v-model.number="form.extra_格斗" type="number" class="input-field">
          </div>
          <div class="form-group">
            <label class="block mb-2">射击</label>
            <input v-model.number="form.extra_射击" type="number" class="input-field">
          </div>
          <div class="form-group">
            <label class="block mb-2">结构</label>
            <input v-model.number="form.extra_结构" type="number" class="input-field">
          </div>
          <div class="form-group">
            <label class="block mb-2">机动</label>
            <input v-model.number="form.extra_机动" type="number" class="input-field">
          </div>
        </div>
      </section>
    </form>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUnitStore } from '../stores/unit'

const route = useRoute()
const router = useRouter()
const unitStore = useUnitStore()

const isEdit = computed(() => !!route.params.id)
const saving = ref(false)
const imageUrl = ref(null)

const form = ref({
  name: '',
  codename: '',
  faction: '',
  main_type: '',
  main_格斗：0,
  main_射击：0,
  main_结构：0,
  main_机动：0,
  main_skills: '',
  has_royroy: false,
  royroy_name: '',
  royroy_格斗：0,
  royroy_射击：0,
  royroy_结构：0,
  royroy_机动：0,
  royroy_skills: '',
  left_type: '',
  left_格斗：0,
  left_射击：0,
  left_结构：0,
  left_机动：0,
  left_skills: '',
  right_type: '',
  right_格斗：0,
  right_射击：0,
  right_结构：0,
  right_机动：0,
  right_skills: '',
  extra_type: '',
  extra_格斗：0,
  extra_射击：0,
  extra_结构：0,
  extra_机动：0,
  extra_skills: ''
})

onMounted(async () => {
  if (isEdit.value) {
    try {
      const unit = await unitStore.fetchUnit(route.params.id)
      Object.assign(form.value, {
        ...unit,
        main_skills: unit.main_skills ? JSON.stringify(unit.main_skills, null, 2) : '',
        royroy_skills: unit.royroy_skills ? JSON.stringify(unit.royroy_skills, null, 2) : '',
        left_skills: unit.left_skills ? JSON.stringify(unit.left_skills, null, 2) : '',
        right_skills: unit.right_skills ? JSON.stringify(unit.right_skills, null, 2) : '',
        extra_skills: unit.extra_skills ? JSON.stringify(unit.extra_skills, null, 2) : ''
      })
      imageUrl.value = unit.main_image_url
    } catch (error) {
      alert('加载失败：' + error.message)
      router.push('/units')
    }
  }
})

const handleImageUpload = async (event) => {
  const file = event.target.files[0]
  if (!file) return
  
  try {
    const result = await unitStore.uploadImage(file)
    imageUrl.value = result.image_url
  } catch (error) {
    alert('上传失败：' + error.message)
  }
}

const saveUnit = async () => {
  saving.value = true
  try {
    const data = { ...form.value }
    
    // 解析 JSON 字段
    try {
      if (data.main_skills) data.main_skills = JSON.stringify(JSON.parse(data.main_skills))
      if (data.royroy_skills) data.royroy_skills = JSON.stringify(JSON.parse(data.royroy_skills))
      if (data.left_skills) data.left_skills = JSON.stringify(JSON.parse(data.left_skills))
      if (data.right_skills) data.right_skills = JSON.stringify(JSON.parse(data.right_skills))
      if (data.extra_skills) data.extra_skills = JSON.stringify(JSON.parse(data.extra_skills))
    } catch (e) {
      alert('技能 JSON 格式错误，请检查')
      saving.value = false
      return
    }

    if (isEdit.value) {
      await unitStore.updateUnit(route.params.id, data)
    } else {
      await unitStore.createUnit(data)
    }
    
    alert('保存成功！')
    router.push('/units')
  } catch (error) {
    alert('保存失败：' + error.message)
  } finally {
    saving.value = false
  }
}

const exportCurrentUnit = () => {
  const exportData = {
    version: '1.0',
    exportDate: new Date().toISOString(),
    unit: {
      id: form.value.id || 'new',
      name: form.value.name,
      codename: form.value.codename,
      faction: form.value.faction,
      main_type: form.value.main_type,
      main_格斗：form.value.main_格斗，
      main_射击：form.value.main_射击，
      main_结构：form.value.main_结构，
      main_机动：form.value.main_机动，
      main_skills: form.value.main_skills ? JSON.parse(form.value.main_skills) : null,
      main_image_url: imageUrl.value,
      has_royroy: form.value.has_royroy,
      royroy_name: form.value.royroy_name,
      royroy_格斗：form.value.royroy_格斗，
      royroy_射击：form.value.royroy_射击，
      royroy_结构：form.value.royroy_结构，
      royroy_机动：form.value.royroy_机动，
      royroy_skills: form.value.royroy_skills ? JSON.parse(form.value.royroy_skills) : null,
      left_type: form.value.left_type,
      left_格斗：form.value.left_格斗，
      left_射击：form.value.left_射击，
      left_结构：form.value.left_结构，
      left_机动：form.value.left_机动，
      left_skills: form.value.left_skills ? JSON.parse(form.value.left_skills) : null,
      right_type: form.value.right_type,
      right_格斗：form.value.right_格斗，
      right_射击：form.value.right_射击，
      right_结构：form.value.right_结构，
      right_机动：form.value.right_机动，
      right_skills: form.value.right_skills ? JSON.parse(form.value.right_skills) : null,
      extra_type: form.value.extra_type,
      extra_格斗：form.value.extra_格斗，
      extra_射击：form.value.extra_射击，
      extra_结构：form.value.extra_结构，
      extra_机动：form.value.extra_机动，
      extra_skills: form.value.extra_skills ? JSON.parse(form.value.extra_skills) : null
    }
  }

  const jsonString = JSON.stringify(exportData, null, 2)
  const blob = new Blob([jsonString], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `unit_${form.value.name || 'new'}_${new Date().toISOString().split('T')[0]}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  
  alert('导出成功！')
}
</script>

<style scoped>
.unit-editor-container {
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

.section-title {
  color: var(--primary);
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
  font-family: inherit;
}

.input-field:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
}

.file-input {
  padding: var(--spacing-sm);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.thumbnail {
  width: 100px;
  height: 100px;
  object-fit: cover;
  border: 2px solid var(--border);
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

.btn-primary:hover:not(:disabled) {
  background: var(--primary-hover);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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
