<template>

    <div class="page-container w-full h-full flex flex-col overflow-y-auto">
      <header class="page-header">
        <h1>[ 战术部署 ]</h1>
        <div class="header-meta">
          <span class="meta-item"><span class="dot-live"></span> 在线</span>
          <span class="sep">::</span>
          <span>已加载 {{ battlefields.length }} 个战场</span>
        </div>
      </header>

      <!-- Battlefield Cards -->
      <div class="bf-grid" v-if="battlefields.length > 0">
        <div v-for="bf in battlefields" :key="bf.id" class="bf-card" @click="selectBattlefield(bf)">
          <div class="bf-card-header">
            <h3>{{ bf.name }}</h3>
            <div class="bf-card-header-right">
              <span class="bf-tag">{{ getTerrainLabel(bf) }}</span>
              <button class="btn-delete-map" @click.stop="deleteMap(bf)" title="删除此地图">×</button>
            </div>
          </div>
          <p class="bf-desc">{{ bf.description || '战略要地，适合各类机甲编队展开作战。' }}</p>
          <div class="bf-footer">
            <div class="bf-stats">
              <span>尺寸: {{ bf.columns || bf.width || 20 }}列 × {{ bf.rows || bf.height || 20 }}行</span>
              <span>|</span>
              <span>难度: {{ bf.difficulty || '标准' }}</span>
            </div>
            <button class="btn-deploy">部署 <svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/></svg></button>
          </div>
        </div>
      </div>

      <div v-else class="empty-state">
        <svg class="icon icon-xl" viewBox="0 0 24 24" style="color:#ffb000;opacity:0.3"><path d="M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM15 19l-6-2.11V5l6 2.11V19z"/></svg>
        <p>暂无可用的战场地图</p>
      </div></div>
  
</template>

<script setup>
// Phase 29-I: 鹦鹉螺号置换 — 房间创建主权移交 3006 onlineBattleAPI (SQLite 执政)
import { ref, computed, onMounted } from "vue"
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { mapAPI, onlineBattleAPI } from '@/api/client'

const router = useRouter()
const userStore = useUserStore()
const user = computed(() => userStore.user)
const battlefields = ref([])

onMounted(async () => {
  try {
    const { data } = await mapAPI.getBattlefields()
    battlefields.value = data.battlefields || data || []
  } catch (e) { /* ignore */ }
})

async function selectBattlefield(bf) {
  try {
    const { data } = await onlineBattleAPI.createRoom({ name: bf.name, mapId: String(bf.id) })
    router.push(`/preparation/${data.room?.id || data.roomId || data.id}`)
  } catch (e) {
    console.error('[BattlefieldSelector] 创建房间失败:', e)
    router.push('/preparation/1')
  }
}

function getTerrainLabel(bf) {
  const t = bf.terrain || ''
  if (!t || t === '平原') return '平原'
  if (t.length < 20) return t
  // terrain is raw JSON data, show a short label instead
  return bf.difficulty || '标准地图'
}
// Phase 30-Fix: 旧地图删除
async function deleteMap(bf) {
  if (!confirm(`确认删除地图 "${bf.name}"？此操作不可撤销。`)) return
  try {
    await mapAPI.deleteBattlefield(bf.id)
    battlefields.value = battlefields.value.filter(m => m.id !== bf.id)
    console.log(`[MapList] 已删除地图: ${bf.name}`)
  } catch (e) {
    console.error('[MapList] 删除地图失败:', e)
    alert('删除失败: ' + (e.response?.data?.error || e.message))
  }
}
function navigateTo(path) { router.push(path) }
</script>

<style scoped>
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
.page-container { min-height: 100vh; background: #001620; color: #c1e8ff; font-family: 'Noto Sans SC', system-ui, sans-serif; }
.icon { width: 1em; height: 1em; display: inline-block; vertical-align: middle; fill: currentColor; flex-shrink: 0; }

/* ===== NAV (shared) ===== */

.page-header { position: relative; padding-left: 16px; margin-bottom: 32px; }
.page-header::before { content: ''; position: absolute; left: 0; top: 0; width: 4px; height: 100%; background: #ffb000; }
.page-header h1 { font-size: 28px; font-weight: 900; letter-spacing: 0.1em; margin-bottom: 6px; }
.header-meta { display: flex; gap: 16px; font-family: 'Fira Code', monospace; font-size: 11px; color: #d7c4ac; align-items: center; }
.dot-live { display: inline-block; width: 6px; height: 6px; background: #13ff43; border-radius: 50%; margin-right: 4px; animation: pulse 2s infinite; }
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
.sep { color: #9f8e78; }
.bf-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; }
.bf-card { background: #001e2b; border: 1px solid rgba(255,176,0,0.15); padding: 24px; cursor: pointer; transition: all 0.2s; }
.bf-card:hover { background: #002e3f; border-color: rgba(255,176,0,0.4); }
.bf-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.bf-card-header h3 { font-size: 18px; font-weight: 700; }
.bf-card-header-right { display: flex; align-items: center; gap: 8px; }
.bf-tag { font-size: 10px; color: #ffb000; background: rgba(255,176,0,0.1); padding: 2px 10px; border: 1px solid rgba(255,176,0,0.2); }
.btn-delete-map {
  background: none; border: 1px solid rgba(255,80,80,0.3); color: rgba(255,80,80,0.6);
  width: 24px; height: 24px; font-size: 14px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.15s;
}
.btn-delete-map:hover { background: rgba(255,80,80,0.15); border-color: #ff5050; color: #ff5050; }
.bf-desc { font-size: 13px; color: rgba(193,232,255,0.55); line-height: 1.6; margin-bottom: 18px; }
.bf-footer { display: flex; justify-content: space-between; align-items: center; }
.bf-stats { font-size: 10px; color: rgba(193,232,255,0.35); font-family: 'Fira Code', monospace; display: flex; gap: 8px; }
.btn-deploy { display: flex; align-items: center; gap: 6px; padding: 8px 20px; background: #ffb000; color: #0a1628; border: none; font-size: 12px; font-weight: 700; cursor: pointer; transition: background 0.15s; }
.btn-deploy:hover { background: #ffc840; }
.empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 300px; background: #001e2b; border: 1px solid rgba(255,176,0,0.1); color: rgba(193,232,255,0.3); gap: 16px; }
.empty-state p { font-size: 14px; }
.footer { position: fixed; bottom: 0; left: 256px; right: 0;
  transition: left 0.25s cubic-bezier(0.4, 0, 0.2, 1); background: rgba(2,9,17,0.92); border-top: 1px solid rgba(255,176,0,0.18); padding: 6px 24px; display: flex; justify-content: space-between; align-items: center; font-family: 'Fira Code', monospace; font-size: 10px; z-index: 50; }
.footer-left span { color: #ffb000; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; }
.footer-right { display: flex; gap: 28px; letter-spacing: 2px; text-transform: uppercase; }
.footer-right .good { color: rgba(122,236,255,0.8); }
.footer-right .muted { color: rgba(255,176,0,0.35); }
</style>
