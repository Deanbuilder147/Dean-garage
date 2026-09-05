<template>
  <div class="page-container w-full h-full flex flex-col overflow-y-auto">
    <div class="editor-header">
      <h2>我的投稿</h2>
      <p class="subtitle">你上传的所有棋子及其审核状态。普通用户上传后默认待审核，审核通过并公开后即可被全员使用。</p>
    </div>

    <div v-if="loading" class="empty-state">加载中…</div>
    <div v-else-if="units.length === 0" class="empty-state">你还没有投稿。<router-link to="/units">去单位编辑器创建</router-link>。</div>
    <div v-else class="units-grid">
      <div v-for="unit in units" :key="unit.id" class="unit-card" @click="editUnit(unit)">
        <div class="unit-image">
          <span v-if="!unit.is_public" class="badge badge-pending">{{ statusLabel(unit.review_status) }}</span>
          <span v-else class="badge badge-approved">已公开</span>
        </div>
        <div class="unit-info">
          <h3>{{ unit.name }}</h3>
          <p v-if="unit.codename">代号: {{ unit.codename }}</p>
          <p class="faction">{{ unit.faction }}</p>
          <p class="meta">T{{ unit.tier }} · {{ unit.category }} · {{ unit.size?.toUpperCase() }}</p>
          <p class="status-line" :class="statusClass(unit.review_status, unit.is_public)">
            状态：{{ statusLabel(unit.review_status) }}<template v-if="unit.is_public && unit.review_status === 'approved'"> · 已公开</template>
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { hangarAPI as unitsAPI } from '../api/client.js'
import { useRouter } from 'vue-router'

const units = ref([])
const loading = ref(false)
const router = useRouter()

function statusLabel(s) {
  if (s === 'approved') return '审核通过'
  if (s === 'rejected') return '已驳回'
  return '待审核'
}
function statusClass(s, isPublic) {
  if (s === 'approved' && isPublic) return 'ok'
  if (s === 'rejected') return 'bad'
  return 'warn'
}
function editUnit(u) { router.push(`/units/${u.id}`) }

async function load() {
  loading.value = true
  try {
    const res = await unitsAPI.getMySubmissions()
    units.value = res.data.units || []
  } catch (e) {
    units.value = []
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>
