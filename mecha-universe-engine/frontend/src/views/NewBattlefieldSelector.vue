<template>

    <div class="page-container w-full h-full flex flex-col overflow-y-auto">
      <header class="page-header">
        <h1>[ 战术部署 ]</h1>
        <div class="header-meta">
          <span class="meta-item"><span class="dot-live"></span> 在线</span>
          <span class="sep">::</span>
          <span>选择参战方式</span>
        </div>
      </header>

      <!-- 续接上次战局 -->
      <div v-if="resumeRoom" class="resume-banner">
        <span class="resume-icon">↻</span>
        <span class="resume-text">检测到上次战局「{{ resumeRoom.name }}」(房号 {{ resumeRoom.code }})，是否返回？</span>
        <button class="btn-resume" @click="resumeLast">返回上次战局</button>
        <button class="btn-resume-dismiss" @click="resumeRoom = null">忽略</button>
      </div>

      <!-- 入口切换 -->
      <div class="deploy-tabs">
        <button :class="['tab', { active: mode === 'join' }]" @click="mode = 'join'">加入战场</button>
        <button v-if="isGM" :class="['tab', { active: mode === 'create' }]" @click="mode = 'create'">创建战场</button>
      </div>

      <!-- 加入战场 -->
      <div v-if="mode === 'join'" class="deploy-panel">
        <div class="join-by-id">
          <input
            v-model="joinRoomId"
            class="join-input"
            placeholder="输入 GM 分享的 6 位房间号"
            inputmode="numeric"
            @keydown.enter="joinByRoomId"
          />
          <button class="btn-join" @click="joinByRoomId" :disabled="joining">
            {{ joining ? '加入中...' : '加入' }}
          </button>
        </div>

        <div class="section-title">可加入的房间</div>
        <div class="room-grid" v-if="publicRooms.length > 0">
          <div v-for="r in publicRooms" :key="r.id" class="room-card" :class="{ 'is-fighting': r.status === 'in_battle' }" @click="openJoinModal(r.id)">
            <div class="room-card-header">
              <span class="room-card-name">{{ r.name }}</span>
              <div class="room-card-actions">
                <span class="room-card-status" :class="r.status === 'in_battle' ? 'fighting' : 'waiting'">
                  {{ r.status === 'in_battle' ? '战斗中' : '等待中' }}
                </span>
            <button
              v-if="user?.role === 'dominator' || r.hostId === user?.id"
              class="room-del-btn"
              :title="user?.role === 'dominator' ? '主宰：删除房间或对局' : '删除我自己创建的房间'"
              @click.stop="deleteRoom(r)"
            >删除</button>
              </div>
            </div>
            <div class="room-card-meta">
              <span>人数 {{ r.players?.filter(p => !p.isSpectator).length || 0 }} / {{ r.maxPlayers || 4 }}</span>
              <span class="sep">|</span>
              <span>名册 {{ r.rosterLocked ? '已锁定' : '开放' }}</span>
            </div>
            <div class="room-card-id">房间号: {{ r.code }}</div>
          </div>
        </div>
        <div v-else class="empty-state">
          <p>暂无可加入的房间，去「创建战场」开一局吧</p>
        </div>
      </div>

      <!-- 创建战场 -->
      <div v-else class="deploy-panel">
        <div class="create-name-row">
          <input v-model="createName" class="join-input" placeholder="自定义战场名称（留空则使用地图名）" />
        </div>
        <div class="faction-pw-row" v-if="isGM">
          <div class="fpw-item">
            <label>攻击阵营密码</label>
            <input v-model="factionPw.attack" class="join-input fpw-input" maxlength="4" inputmode="numeric" placeholder="4 位数字（可选）" />
          </div>
          <div class="fpw-item">
            <label>防守阵营密码</label>
            <input v-model="factionPw.defense" class="join-input fpw-input" maxlength="4" inputmode="numeric" placeholder="4 位数字（可选）" />
          </div>
          <div class="fpw-item">
            <label>偷袭阵营密码</label>
            <input v-model="factionPw.ambush" class="join-input fpw-input" maxlength="4" inputmode="numeric" placeholder="4 位数字（可选）" />
          </div>
        </div>
        <p class="fpw-hint" v-if="isGM">为每个阵营设置 4 位数字密码（留空表示无需密码），玩家加入对应阵营时需输入正确密码。</p>
        <div class="bf-grid" v-if="battlefields.length > 0">
          <div v-for="bf in battlefields" :key="bf.id" class="bf-card" @click="createFromMap(bf)">
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
                <span>尺寸: {{ bf.columns || bf.width || 100 }}列 × {{ bf.rows || bf.height || 100 }}行</span>
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
        </div>
      </div>
    </div>

    <!-- 加入阵营选择弹窗 -->
    <div v-if="showJoinModal" class="join-modal-overlay" @click.self="closeJoinModal">
      <div class="join-modal">
        <h3 class="jm-title">选择阵营加入</h3>
        <p class="jm-room">房间：{{ joinTargetRoom?.name }}（房号 {{ joinTargetRoom?.code }}）</p>
        <div class="jm-roles">
          <button
            v-for="opt in roleOptions"
            :key="opt.key"
            :class="['jm-role-btn', { active: selectedRole === opt.key }]"
            @click="selectedRole = opt.key; joinPassword = ''; joinError = ''"
          >{{ opt.label }}</button>
        </div>
        <div class="jm-pw" v-if="roleNeedsPassword(selectedRole)">
          <label>「{{ roleOptions.find(o => o.key === selectedRole)?.label }}」需要密码</label>
          <input v-model="joinPassword" class="join-input" maxlength="4" inputmode="numeric" placeholder="请输入 4 位密码" @keydown.enter="confirmJoin" />
        </div>
        <p class="jm-error" v-if="joinError">{{ joinError }}</p>
        <div class="jm-actions">
          <button class="btn-join jm-confirm" :disabled="joining" @click="confirmJoin">{{ joining ? '加入中...' : '确认加入' }}</button>
          <button class="btn-resume-dismiss jm-cancel" @click="closeJoinModal">取消</button>
        </div>
      </div>
    </div>

</template>

<script setup>
// Phase 29-I: 鹦鹉螺号置换 — 房间创建主权移交 3006 onlineBattleAPI (SQLite 执政)
import { ref, computed, reactive, onMounted } from "vue"
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { mapAPI, onlineBattleAPI } from '@/api/client'

const router = useRouter()
const userStore = useUserStore()
const user = computed(() => userStore.user)
const battlefields = ref([])
// 加入 / 创建 双入口
const mode = ref('join')
const publicRooms = ref([])
const joinRoomId = ref('')
const joining = ref(false)
const createName = ref('')
const resumeRoom = ref(null)

const isGM = computed(() => ['referee', 'admin', 'dominator'].includes(user.value?.role))
// GM 创建房间时为各阵营设置的可选 4 位密码
const factionPw = reactive({ attack: '', defense: '', ambush: '' })

// 加入阵营选择弹窗
const showJoinModal = ref(false)
const joinTargetRoom = ref(null)
const selectedRole = ref('attack')
const joinPassword = ref('')
const joinError = ref('')
const roleOptions = [
  { key: 'attack', label: '攻击阵营' },
  { key: 'defense', label: '防守阵营' },
  { key: 'ambush', label: '偷袭阵营' },
  { key: 'visitor', label: '观众阵营' },
]
function roleNeedsPassword(key) {
  return !!(joinTargetRoom.value?.factionPasswordRequired?.[key])
}

// 记录续接房间（用于重新登录时提示返回）
function storeLastRoom(room) {
  if (!room) return
  try {
    localStorage.setItem('lastRoom', JSON.stringify({
      id: room.id, code: room.code, name: room.name, status: room.status
    }))
  } catch (e) {}
}

onMounted(async () => {
  // 地图列表（创建战场用）
  try {
    const { data } = await mapAPI.getBattlefields()
    battlefields.value = data.battlefields || data || []
  } catch (e) { /* ignore */ }
  // 可加入房间列表（含 GM 创建的公开房间）
  try {
    const { data } = await onlineBattleAPI.getRooms()
    publicRooms.value = (data.rooms || []).filter(r => r.status !== 'cancelled')
  } catch (e) { /* ignore */ }

  // 续接上次战局提示
  // 真相源优先级：
  //   1) 后端 /me 下发的 lastRoomId（已持久化在 DB，跨浏览器可靠，由 userStore 权威持有）
  //   2) 同浏览器 localStorage 的 lastRoom 仅作辅助，且只用于「未开战(waiting)」房间提示，
  //      绝不能用过期的本地 roomId 当作「进行中战局」去重连（历史上曾残留 f4edae19 这类已不存在的 roomId）
  try {
    let lastId = null
    const u = userStore.user
    if (u && u.lastRoomId) {
      lastId = u.lastRoomId // 后端权威源优先
    } else {
      const raw = localStorage.getItem('lastRoom')
      if (raw) {
        try {
          const last = JSON.parse(raw)
          if (last && last.id && last.status === 'waiting') lastId = last.id
        } catch (_) {}
      }
    }
    if (lastId) {
      try {
        const { data } = await onlineBattleAPI.getRoom(lastId)
        const r = data?.room || data
        if (r && r.status !== 'cancelled') {
          resumeRoom.value = { id: r.id, code: r.code, name: r.name, status: r.status }
        } else {
          // 房间已不存在/已取消：清理本地过期残留，避免下次再次误用
          localStorage.removeItem('lastRoom')
        }
      } catch (e) {
        localStorage.removeItem('lastRoom')
      }
    }
  } catch (e) { try { localStorage.removeItem('lastRoom') } catch (_) {} }
})

// 加入战场：根据房间号
async function doJoin(id) {
  if (!id) return
  joining.value = true
  try {
    await onlineBattleAPI.joinRoom(id, {})
    let roomStatus = null
    let battleId = null
    try {
      const { data } = await onlineBattleAPI.getRoom(id)
      const rm = data?.room || data
      storeLastRoom(rm)
      roomStatus = rm?.status
      battleId = rm?.battleId
    } catch (e) {}
    // 重连场景：若房间已在战斗中，直接回到战场；否则进入整备室（权限范围由房间名册还原）
    if (roomStatus === 'in_battle' && battleId) {
      router.push(`/battle-pc/${battleId}`)
    } else {
      router.push(`/preparation/${id}`)
    }
  } catch (e) {
    const errCode = e?.response?.data?.error
    // 续接幂等：用户本就在房间内（如从备战页返回准备间，last_room_id 仍在），
    // 后端返回 ROOM_ALREADY_JOINED。忽略该报错，直接导航进入房间，避免弹"你已经在该房间中"。
    if (errCode === 'ROOM_ALREADY_JOINED') {
      router.push(`/preparation/${id}`)
      return
    }
    console.error('[BattlefieldSelector] 加入房间失败:', e)
    alert('加入房间失败：' + (e.response?.data?.message || e.message))
  } finally {
    joining.value = false
  }
}
// 加入房间：弹出阵营选择（攻击/防守/偷袭/观众），有密码则要求输入
// 若房间已在战斗中，则行为应与「返回上次战局」一致——直接重连进战场，而非弹阵营选择
function openJoinModal(id) {
  if (!id) return
  joining.value = true
  onlineBattleAPI.getRoom(id).then(({ data }) => {
    const room = data?.room || data
    if (room && room.status === 'in_battle' && room.battleId) {
      // 战斗中对局：直接重连，与 resumeLast/doJoin 一致
      showJoinModal.value = false
      router.push(`/battle-pc/${room.battleId}`)
      return
    }
    joinTargetRoom.value = room
    selectedRole.value = 'attack'
    joinPassword.value = ''
    joinError.value = ''
    showJoinModal.value = true
  }).catch((e) => {
    alert('房间不存在：' + (e.response?.data?.message || e.message))
  }).finally(() => { joining.value = false })
}
async function navigateAfterJoin(id) {
  let roomStatus = null
  let battleId = null
  try {
    const { data } = await onlineBattleAPI.getRoom(id)
    const rm = data?.room || data
    storeLastRoom(rm)
    roomStatus = rm?.status
    battleId = rm?.battleId
  } catch (e) {}
  if (roomStatus === 'in_battle' && battleId) router.push(`/battle-pc/${battleId}`)
  else router.push(`/preparation/${id}`)
}
async function confirmJoin() {
  if (!joinTargetRoom.value) return
  const id = joinTargetRoom.value.id
  joining.value = true
  joinError.value = ''
  try {
    await onlineBattleAPI.joinRoom(id, {
      role: selectedRole.value,
      password: selectedRole.value === 'visitor' ? undefined : (joinPassword.value || undefined),
      spectator: selectedRole.value === 'visitor',
    })
    showJoinModal.value = false
    await navigateAfterJoin(id)
  } catch (e) {
    const errCode = e?.response?.data?.error
    if (errCode === 'ROOM_ALREADY_JOINED') {
      showJoinModal.value = false
      await navigateAfterJoin(id)
      return
    }
    joinError.value = e?.response?.data?.message || e?.message || '加入失败'
  } finally {
    joining.value = false
  }
}
function closeJoinModal() { showJoinModal.value = false }
// 房间列表内删除自己创建的房间
async function deleteRoom(r) {
  if (!confirm(`确定删除房间「${r.name}」？该操作不可撤销，房间内的对局也会一并取消。`)) return
  try {
    await onlineBattleAPI.deleteRoom(r.id)
    publicRooms.value = publicRooms.value.filter(x => x.id !== r.id)
    if (resumeRoom.value && resumeRoom.value.id === r.id) resumeRoom.value = null
    try { localStorage.removeItem('lastRoom') } catch (_) {}
  } catch (e) {
    alert('删除房间失败：' + (e.response?.data?.message || e.message))
  }
}
function resumeLast() {
  if (resumeRoom.value) doJoin(resumeRoom.value.id)
}
async function joinByRoomId() {
  const raw = (joinRoomId.value || '').trim()
  if (!raw) { alert('请输入房间号'); return }
  // 6 位数字视为房号，先解析为房间 id
  if (/^\d{6}$/.test(raw)) {
    joining.value = true
    try {
      const { data } = await onlineBattleAPI.getRoomByCode(raw)
      if (data?.room?.id) { openJoinModal(data.room.id); return }
      alert('房间号不存在')
    } catch (e) { alert('房间号不存在') }
    finally { joining.value = false }
    return
  }
  openJoinModal(raw)
}

// 创建战场：选地图后建房（仅 GM 可创建），可为本房间各阵营设置可选 4 位密码
async function createFromMap(bf) {
  try {
    const pw = {
      attack: factionPw.attack.trim(),
      defense: factionPw.defense.trim(),
      ambush: factionPw.ambush.trim(),
    }
    const { data } = await onlineBattleAPI.createRoom({
      name: (createName.value || '').trim() || bf.name,
      mapId: String(bf.id),
      factionPasswords: pw,
    })
    const room = data.room || data
    if (room) storeLastRoom(room)
    router.push(`/preparation/${room?.id || data.roomId || data.id}`)
  } catch (e) {
    console.error('[BattlefieldSelector] 创建房间失败:', e)
    alert('创建房间失败：' + (e.response?.data?.message || e.message))
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

.page-header { position: relative; padding-left: 16px; margin-bottom: 24px; }
.page-header::before { content: ''; position: absolute; left: 0; top: 0; width: 4px; height: 100%; background: #ffb000; }
.page-header h1 { font-size: 28px; font-weight: 900; letter-spacing: 0.1em; margin-bottom: 6px; }
.header-meta { display: flex; gap: 16px; font-family: 'Fira Code', monospace; font-size: 11px; color: #d7c4ac; align-items: center; }
.dot-live { display: inline-block; width: 6px; height: 6px; background: #13ff43; border-radius: 50%; margin-right: 4px; animation: pulse 2s infinite; }
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
.sep { color: #9f8e78; }

/* ===== 入口切换 ===== */
.deploy-tabs { display: flex; gap: 12px; margin-bottom: 24px; }
.deploy-tabs .tab {
  padding: 12px 32px; background: #001e2b; border: 1px solid rgba(255,176,0,0.2);
  color: #c1e8ff; font-size: 14px; font-weight: 700; cursor: pointer; transition: all 0.15s;
}
.deploy-tabs .tab:hover { border-color: rgba(255,176,0,0.4); }
.deploy-tabs .tab.active { background: #ffb000; color: #0a1628; border-color: #ffb000; }
.deploy-panel { animation: fade 0.2s ease; }
@keyframes fade { from { opacity: 0; } to { opacity: 1; } }

/* ===== 加入战场 ===== */
.join-by-id { display: flex; gap: 12px; margin-bottom: 24px; }
.join-input {
  flex: 1; padding: 12px 16px; background: #001e2b; border: 1px solid rgba(255,176,0,0.3);
  color: #c1e8ff; font-size: 13px; font-family: 'Fira Code', monospace; outline: none;
}
.join-input::placeholder { color: rgba(193,232,255,0.25); }
.join-input:focus { border-color: #ffb000; }
.btn-join {
  padding: 12px 32px; background: #ffb000; color: #0a1628; border: none;
  font-size: 13px; font-weight: 700; cursor: pointer; transition: background 0.15s;
}
.btn-join:hover { background: #ffc840; }
.btn-join:disabled { opacity: 0.5; cursor: not-allowed; }

/* ===== 续接上次战局 ===== */
.resume-banner { display: flex; align-items: center; gap: 12px; background: rgba(255,176,0,0.1); border: 1px solid rgba(255,176,0,0.35); padding: 12px 18px; margin-bottom: 20px; font-size: 13px; }
.resume-icon { color: #ffb000; font-size: 16px; }
.resume-text { color: rgba(193,232,255,0.8); flex: 1; }
.btn-resume { padding: 8px 20px; background: #ffb000; color: #0a1628; border: none; font-size: 12px; font-weight: 700; cursor: pointer; }
.btn-resume:hover { background: #ffc840; }
.btn-resume-dismiss { padding: 8px 16px; background: none; border: 1px solid rgba(193,232,255,0.25); color: rgba(193,232,255,0.6); font-size: 12px; cursor: pointer; }
.btn-resume-dismiss:hover { border-color: rgba(193,232,255,0.5); }
.create-name-row { margin-bottom: 18px; }

.section-title { font-size: 12px; color: #ffb000; letter-spacing: 0.1em; margin-bottom: 12px; text-transform: uppercase; font-family: 'Fira Code', monospace; }
.room-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
.room-card { background: #001e2b; border: 1px solid rgba(255,176,0,0.15); padding: 16px; cursor: pointer; transition: all 0.2s; }
.room-card:hover { background: #002e3f; border-color: rgba(255,176,0,0.4); }
.room-card.is-fighting { border-color: rgba(255,80,80,0.5); cursor: default; }
.room-card.is-fighting:hover { background: #001e2b; }
.room-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.room-card-actions { display: flex; align-items: center; gap: 8px; }
.room-del-btn { font-size: 11px; padding: 2px 8px; border-radius: 4px; cursor: pointer; color: #ff5b5b; background: rgba(255,91,91,0.12); border: 1px solid rgba(255,91,91,0.4); transition: all 0.15s; }
.room-del-btn:hover { background: rgba(255,91,91,0.25); color: #fff; }
.room-card-name { font-size: 15px; font-weight: 700; }
.room-card-status { font-size: 10px; padding: 2px 8px; border-radius: 4px; }
.room-card-status.waiting { color: #13ff43; background: rgba(19,255,67,0.1); }
.room-card-status.fighting { color: #ffb000; background: rgba(255,176,0,0.1); }
.room-card-meta { font-size: 11px; color: rgba(193,232,255,0.5); font-family: 'Fira Code', monospace; display: flex; gap: 8px; margin-bottom: 6px; }
.room-card-id { font-size: 10px; color: rgba(193,232,255,0.3); font-family: 'Fira Code', monospace; word-break: break-all; }

/* ===== 创建战场（地图列表） ===== */
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
.empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 200px; background: #001e2b; border: 1px solid rgba(255,176,0,0.1); color: rgba(193,232,255,0.3); gap: 16px; }
.empty-state p { font-size: 14px; }
.footer { position: fixed; bottom: 0; left: var(--sidebar-w, 240px); right: 0;
  transition: left 0.25s cubic-bezier(0.4, 0, 0.2, 1); background: rgba(2,9,17,0.92); border-top: 1px solid rgba(255,176,0,0.18); padding: 6px 24px; display: flex; justify-content: space-between; align-items: center; font-family: 'Fira Code', monospace; font-size: 10px; z-index: 50; }
.footer-left span { color: #ffb000; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; }
.footer-right { display: flex; gap: 28px; letter-spacing: 2px; text-transform: uppercase; }
.footer-right .good { color: rgba(122,236,255,0.8); }
.footer-right .muted { color: rgba(255,176,0,0.35); }

/* ===== 创建战场：阵营密码 ===== */
.faction-pw-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 10px; }
.fpw-item { display: flex; flex-direction: column; gap: 6px; }
.fpw-item label { font-size: 11px; color: #ffb000; font-family: 'Fira Code', monospace; }
.fpw-input { text-align: center; letter-spacing: 0.3em; }
.fpw-hint { font-size: 11px; color: rgba(193,232,255,0.45); margin-bottom: 16px; line-height: 1.5; }

/* ===== 加入阵营选择弹窗 ===== */
.join-modal-overlay { position: fixed; inset: 0; background: rgba(0,8,14,0.75); display: flex; align-items: center; justify-content: center; z-index: 200; }
.join-modal { width: 420px; max-width: 92vw; background: #001e2b; border: 1px solid rgba(255,176,0,0.4); padding: 28px; box-shadow: 0 20px 60px rgba(0,0,0,0.6); }
.jm-title { font-size: 18px; font-weight: 700; color: #ffb000; margin-bottom: 6px; }
.jm-room { font-size: 12px; color: rgba(193,232,255,0.55); margin-bottom: 18px; font-family: 'Fira Code', monospace; }
.jm-roles { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 16px; }
.jm-role-btn { padding: 12px; background: #002a3b; border: 1px solid rgba(193,232,255,0.2); color: #c1e8ff; font-size: 14px; cursor: pointer; transition: all 0.15s; }
.jm-role-btn:hover { border-color: rgba(255,176,0,0.5); }
.jm-role-btn.active { background: #ffb000; color: #0a1628; border-color: #ffb000; font-weight: 700; }
.jm-pw { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
.jm-pw label { font-size: 12px; color: #ff5b5b; }
.jm-pw input { text-align: center; letter-spacing: 0.3em; }
.jm-error { font-size: 12px; color: #ff5b5b; margin-bottom: 10px; }
.jm-actions { display: flex; gap: 12px; justify-content: flex-end; }
.jm-confirm { padding: 10px 24px; background: #ffb000; color: #0a1628; border: none; font-weight: 700; cursor: pointer; }
.jm-confirm:disabled { opacity: 0.6; cursor: not-allowed; }
.jm-cancel { padding: 10px 20px; background: none; border: 1px solid rgba(193,232,255,0.25); color: rgba(193,232,255,0.6); cursor: pointer; }
</style>
