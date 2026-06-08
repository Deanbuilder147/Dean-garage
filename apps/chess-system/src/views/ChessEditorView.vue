<template>
  <div class="chess-editor-view p-6">
    <header class="header flex justify-between items-center mb-6">
      <div class="flex items-center gap-4">
        <router-link to="/chess-units" class="btn btn-secondary">← 返回列表</router-link>
        <h1 class="text-2xl font-bold">{{ isEdit ? '编辑棋子' : '新建棋子' }}</h1>
      </div>
      <button @click="saveUnit" :disabled="saving" class="btn btn-primary">
        {{ saving ? '保存中...' : '💾 保存' }}
      </button>
    </header>

    <form @submit.prevent="saveUnit" class="editor-form">
      <section class="form-section card mb-6">
        <h2 class="section-title text-xl font-bold mb-4">基本信息</h2>
        <div class="grid grid-cols-2 gap-4">
          <div class="form-group">
            <label class="block mb-2">棋子名称 *</label>
            <input v-model="form.name" type="text" required class="input-field">
          </div>
          <div class="form-group">
            <label class="block mb-2">势力 *</label>
            <select v-model="form.faction" required class="input-field">
              <option value="">选择势力</option>
              <option v-for="f in factions" :key="f.id" :value="f.id">{{ f.name }}</option>
            </select>
          </div>
          <div class="form-group">
            <label class="block mb-2">类型</label>
            <select v-model="form.type" class="input-field">
              <option value="mech">机甲</option>
              <option value="vehicle">载具</option>
              <option value="infantry">步兵</option>
              <option value="aircraft">飞行器</option>
            </select>
          </div>
          <div class="form-group">
            <label class="block mb-2">稀有度</label>
            <select v-model="form.rarity" class="input-field">
              <option value="r">R</option>
              <option value="sr">SR</option>
              <option value="ssr">SSR</option>
              <option value="ur">UR</option>
            </select>
          </div>
        </div>
      </section>

      <section class="form-section card mb-6">
        <h2 class="section-title text-xl font-bold mb-4">属性配置</h2>
        <div class="grid grid-cols-3 gap-4">
          <div class="form-group">
            <label class="block mb-2">HP *</label>
            <input v-model.number="form.stats.hp" type="number" min="0" required class="input-field">
          </div>
          <div class="form-group">
            <label class="block mb-2">攻击 *</label>
            <input v-model.number="form.stats.attack" type="number" min="0" required class="input-field">
          </div>
          <div class="form-group">
            <label class="block mb-2">防御 *</label>
            <input v-model.number="form.stats.defense" type="number" min="0" required class="input-field">
          </div>
          <div class="form-group">
            <label class="block mb-2">速度 *</label>
            <input v-model.number="form.stats.speed" type="number" min="0" required class="input-field">
          </div>
          <div class="form-group">
            <label class="block mb-2">射程 *</label>
            <input v-model.number="form.stats.range" type="number" min="1" required class="input-field">
          </div>
          <div class="form-group">
            <label class="block mb-2">成本 *</label>
            <input v-model.number="form.stats.cost" type="number" min="1" max="10" required class="input-field">
          </div>
        </div>
      </section>

      <section class="form-section card mb-6">
        <h2 class="section-title text-xl font-bold mb-4">标签</h2>
        <div class="tags-grid grid grid-cols-4 gap-2">
          <label v-for="tag in availableTags" :key="tag" class="tag-checkbox">
            <input type="checkbox" :value="tag" v-model="form.tags">
            <span>{{ getTagName(tag) }}</span>
          </label>
        </div>
      </section>

      <section class="form-section card mb-6">
        <h2 class="section-title text-xl font-bold mb-4">描述</h2>
        <textarea v-model="form.description" rows="4" class="input-field" placeholder="描述棋子的背景故事和特点..."></textarea>
      </section>
    </form>

    <div class="fixed-bottom p-6">
      <div class="card">
        <h3 class="font-bold mb-4">预览</h3>
        <div class="preview-card p-4" :style="{ borderLeft: `4px solid ${getFactionColor(form.faction)}` }">
          <h4 class="text-lg font-bold">{{ form.name || '未命名' }}</h4>
          <p class="text-muted text-sm mb-2">{{ getFactionName(form.faction) }} | {{ form.rarity?.toUpperCase() }}</p>
          <div class="flex gap-4 text-sm">
            <span>HP: <strong>{{ form.stats.hp || 0 }}</strong></span>
            <span>攻击：<strong class="text-danger">{{ form.stats.attack || 0 }}</strong></span>
            <span>防御：<strong class="text-success">{{ form.stats.defense || 0 }}</strong></span>
            <span>速度：<strong class="text-accent">{{ form.stats.speed || 0 }}</strong></span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useChessStore } from '../stores/chess'

const route = useRoute()
const router = useRouter()
const chessStore = useChessStore()

const isEdit = computed(() => !!route.params.id)
const saving = ref(false)

const form = ref({
  name: '',
  faction: '',
  type: 'mech',
  rarity: 'sr',
  stats: {
    hp: 3000,
    attack: 600,
    defense: 400,
    speed: 80,
    range: 4,
    cost: 8
  },
  tags: [],
  description: ''
})

const factions = computed(() => chessStore.factions)
const availableTags = computed(() => chessStore.tags)

onMounted(() => {
  if (isEdit.value) {
    const unit = chessStore.units.find(u => u.id == route.params.id)
    if (unit) {
      form.value = JSON.parse(JSON.stringify(unit))
    }
  }
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
    output: '输出', burst: '爆发', aoe: '范围', control: '控制',
    support: '支援', tank: '坦克', speed: '速度', defense: '防御'
  }
  return tagMap[tag] || tag
}

const saveUnit = async () => {
  saving.value = true
  try {
    if (isEdit.value) {
      // 更新现有棋子
      const index = chessStore.units.findIndex(u => u.id == route.params.id)
      if (index !== -1) {
        chessStore.units[index] = { ...form.value, id: route.params.id }
      }
    } else {
      // 创建新棋子
      const newUnit = await chessStore.createUnit({
        ...form.value,
        id: Date.now()
      })
      chessStore.units.push(newUnit)
    }
    
    alert('保存成功！')
    router.push('/chess-units')
  } catch (error) {
    alert('保存失败：' + error.message)
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.chess-editor-view {
  max-width: 1000px;
  margin: 0 auto;
}

.header {
  border-bottom: 2px solid var(--border);
  padding-bottom: var(--spacing);
}

.form-section {
  padding: var(--spacing-lg);
}

.section-title {
  color: var(--primary);
  border-bottom: 1px solid var(--border);
  padding-bottom: var(--spacing-sm);
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

.tag-checkbox {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm);
  background: var(--surface-light);
  border-radius: var(--radius);
  cursor: pointer;
}

.tag-checkbox:hover {
  background: var(--surface-lighter);
}

.tag-checkbox input[type="checkbox"] {
  width: 1rem;
  height: 1rem;
  cursor: pointer;
}

.fixed-bottom {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--bg);
  border-top: 1px solid var(--border);
}

.preview-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
</style>
