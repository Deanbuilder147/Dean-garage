<template>
  <div class="page-container w-full h-full flex flex-col overflow-y-auto">
    <div class="editor-header">
      <h2>棋子库</h2>
      <p class="subtitle">经管理员审核通过的公开棋子，所有玩家均可克隆使用。</p>
    </div>

    <div v-if="loading" class="empty-state">加载中…</div>
    <div v-else-if="units.length === 0" class="empty-state">暂无公开棋子。在你的「我的投稿」中上传并等待管理员审核通过后即会出现在这里。</div>
    <div v-else class="units-grid">
      <div v-for="unit in units" :key="unit.id" class="unit-card">
        <div class="unit-image">
          <img v-if="coverUrl(unit)" :src="coverUrl(unit)" :alt="unit.name" @error="onImgError" />
          <span v-else class="placeholder">无图</span>
        </div>
        <div class="unit-info">
          <h3>{{ unit.name }}</h3>
          <p v-if="unit.codename">代号: {{ unit.codename }}</p>
          <p class="faction">{{ unit.faction }}</p>
          <p class="meta">T{{ unit.tier }} · {{ unit.category }} · {{ unit.size?.toUpperCase() }}</p>
        </div>
        <div class="unit-card-actions">
          <button class="btn btn-primary btn-mini" @click="cloneUnit(unit.id)" :disabled="cloning === unit.id">
            {{ cloning === unit.id ? '克隆中…' : '克隆到我的库' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { hangarAPI as unitsAPI } from '../api/client.js'
import { useUserStore } from '../stores/user.js'
import { useRouter } from 'vue-router'

const units = ref([])
const loading = ref(false)
const cloning = ref(null)
const userStore = useUserStore()
const router = useRouter()

function coverUrl(u) {
  if (u.main_image_url) return `/api/units/view/${encodeURIComponent(u.main_image_url)}`
  if (u.view_urls && u.view_urls.front) return `/api/units/view/${encodeURIComponent(u.view_urls.front)}`
  return null
}
function onImgError(e) { e.target.style.display = 'none' }

async function load() {
  loading.value = true
  try {
    const res = await unitsAPI.getPublicUnits()
    units.value = res.data.units || []
  } catch (e) {
    units.value = []
  } finally {
    loading.value = false
  }
}

async function cloneUnit(id) {
  if (!userStore.user) {
    router.push('/login')
    return
  }
  cloning.value = id
  try {
    await unitsAPI.cloneUnit(id)
    alert('已克隆到「我的投稿」，可在单位编辑器查看。')
  } catch (e) {
    alert((e?.response?.data?.message) || '克隆失败')
  } finally {
    cloning.value = null
  }
}

onMounted(load)
</script>
