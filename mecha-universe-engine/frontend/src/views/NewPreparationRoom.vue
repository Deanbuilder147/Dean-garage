<template>
  <div class="prep-room" :class="{ 'host-view': isHost }">
    <!-- 顶部栏 -->
    <header class="room-topbar">
      <button class="btn-back" @click="goBack">← 返回战术部署</button>
      <div class="room-title">整备室 · {{ room?.name || '加载中…' }}</div>
      <div class="room-meta">
        <span class="code-badge">房号 {{ room?.code || '——' }}</span>
        <span class="status-badge" :class="room?.status">{{ statusLabel }}</span>
      </div>
    </header>

    <div v-if="error" class="room-error">⚠ {{ error }}</div>

    <div class="prep-body">
      <!-- 左侧：房间信息 + 名册 -->
      <section class="panel room-info-panel">
        <h2 class="panel-title">房间信息</h2>
        <div class="room-info">
          <div class="info-card">
            <div class="info-label">地图</div>
            <div class="info-value map-id">{{ room?.mapId }}</div>
          </div>
          <div class="info-card" :class="{ clickable: isHost || isGM }" @click="openMaxEditor" v-if="isHost || isGM">
            <div class="info-label">玩家（点击设置人数）</div>
            <div class="info-value">{{ currentPlayers }} / {{ room?.maxPlayers || 4 }}</div>
          </div>
          <div class="info-card" v-else>
            <div class="info-label">玩家</div>
            <div class="info-value">{{ currentPlayers }} / {{ room?.maxPlayers || 4 }}</div>
          </div>
          <div class="info-card">
            <div class="info-label">回合时限</div>
            <div class="info-value">{{ room?.turnTimeLimit || 60 }}s</div>
          </div>
          <div class="info-card">
            <div class="info-label">名册</div>
            <div class="info-value">{{ room?.rosterLocked ? '已锁定' : '开放' }}</div>
          </div>
        </div>

        <div v-if="editingMax" class="max-editor">
          <span>参赛人数上限：</span>
          <input type="number" min="2" max="16" v-model.number="maxPlayersInput" class="num-input" />
          <button class="btn-mini ok" @click="saveMaxPlayers">保存</button>
          <button class="btn-mini" @click="editingMax = false">取消</button>
        </div>

        <!-- 名册 -->
        <h3 class="sub-title">① 参战名册分配（选择参赛玩家与各自阵营角色）</h3>
        <div class="roster">
          <div v-if="(room?.players || []).length === 0" class="empty-mini">暂无玩家进入</div>
          <div v-for="p in (room?.players || [])" :key="p.userId" class="roster-row" :class="{ spectator: p.isSpectator }">
            <span class="roster-name">
              {{ p.username }}
              <span v-if="p.userId === room?.hostId" class="host-badge">房主</span>
              <span v-if="p.isSpectator" class="spec-badge">观战</span>
            </span>
            <!-- 房主：身份锁定为裁判（代打），席位恒空（上帝视角） -->
            <template v-if="p.userId === room?.hostId">
              <span class="locked-tag">裁判 (Referee) · 代打</span>
              <span class="locked-tag slot">席位：无（上帝视角）</span>
            </template>
            <!-- 其他玩家：身份 / 席位 两列 + 级联互斥 -->
            <template v-else>
              <select
                class="faction-select"
                :value="p.identityRole || (['referee','visitor'].includes(p.role) ? p.role : 'player')"
                :disabled="!canEditThis(p)"
                @change="onIdentityChange(p, $event.target.value)"
              >
                <option value="player">玩家</option>
                <option value="referee">裁判</option>
                <option value="visitor">观战</option>
              </select>
              <select
                class="faction-select slot-select"
                :value="p.tacticalSlot || (['attack','defense','ambush'].includes(p.role) ? p.role : '')"
                :disabled="!canEditThis(p) || isSlotLocked(p)"
                @change="updatePlayerFaction(p.userId, { identityRole: currentIdentity(p), tacticalSlot: $event.target.value, spectator: p.isSpectator })"
              >
                <option value="">—</option>
                <option value="attack">攻击席位</option>
                <option value="defense">防守席位</option>
                <option value="ambush">偷袭席位</option>
              </select>
            </template>
            <label class="spec-toggle" :class="{ disabled: !canEditThis(p) || p.userId === room?.hostId }">
              <input
                type="checkbox"
                :checked="p.isSpectator"
                :disabled="!canEditThis(p) || p.userId === room?.hostId"
                @change="onSpectatorChange(p, $event.target.checked)"
              /> 观战
            </label>
            <span class="unit-count-badge" :title="p.userId === user?.id ? '你已选中的出战棋子' : '该玩家已选中的出战棋子'">
              已选 {{ playerUnitsOf(p).length }} 棋
            </span>
            <span v-if="playerUnitsOf(p).length" class="unit-names">{{ playerUnitsOf(p).map(u => u.name).join('、') }}</span>
          </div>
          <div v-if="!(isHost || isGM)" class="hint-mini">开战前可在此选择你的阵营或观战；房主 / GM 可调整所有人的阵营。</div>
        </div>

        <!-- 整备室：出战棋子选择（选项 B） -->
        <div class="unit-deploy-block">
          <h3 class="sub-title">② 出场机甲选择（勾选你本场带入战场的棋子）</h3>
          <p class="hint-mini">勾选你本场要带入战斗的棋子；出击时这些棋子会进入部署池，按你在①中选择的阵营角色登场。其他玩家在他们自己的客户端各自勾选。</p>
          <div v-if="unitsLoading" class="empty-mini">加载单位库中…</div>
          <div v-else-if="myUnits.length === 0" class="empty-mini">你还没有可用棋子，请先到机库创建单位。</div>
          <div v-else class="unit-check-grid">
            <label
              v-for="u in myUnits"
              :key="u.id"
              class="unit-check"
              :class="{ on: mySelectedUnitIds.includes(u.id) }"
            >
              <input type="checkbox" :checked="mySelectedUnitIds.includes(u.id)" @change="toggleUnit(u.id)" />
              <span class="unit-name">{{ u.name }}</span>
              <span class="unit-meta">{{ factionLabel(u.faction) }} · {{ u.tier }}阶 · {{ u.category }}</span>
            </label>
          </div>
        </div>

        <!-- 房主操作 -->
        <div v-if="isHost" class="host-actions">
          <button class="btn-danger" @click="toggleRosterLock">
            {{ room?.rosterLocked ? '解锁名册' : '锁定名册' }}
          </button>
          <button class="btn-danger ghost" @click="deleteRoom">删除房间</button>
        </div>
      </section>

      <!-- 右侧：阵营配置 + 胜利条件 + 开战 -->
      <section class="panel config-panel">
        <!-- 阵营管理（房主）：把已加入战场的具体棋子分配到 攻击/防守/偷袭 轮转 -->
        <div v-if="isHost" class="faction-mgmt">
          <h3 class="sub-title">③ 阵营轮转映射（房主配置）：把已加入的棋子分配到 攻击 / 防守 / 偷袭</h3>
          <p class="hint-mini">此面板直接对“已加入战场的棋子”分配轮转角色。候选即下方所有参战玩家在②中勾选的棋子（房主端随 room-update 实时同步）。未在此分配的棋子，将沿用其玩家在①中选择的阵营角色。裁判(neutral)棋子不参与轮转。</p>
          <div v-if="joinedUnits.length === 0" class="empty-mini">暂无已加入的棋子。请玩家在②中勾选出场机甲后，此处会实时出现可分配棋子。</div>
          <div v-else class="faction-roles unit-roles">
            <div v-for="role in ['attack', 'defense', 'ambush']" :key="role" class="role-col">
              <div class="role-head">{{ roleLabel(role) }}（{{ roleUnits[role].length }}）</div>
              <label v-for="u in joinedUnits" :key="u.id" class="role-opt unit-role-opt">
                <input type="checkbox" :checked="roleUnits[role].includes(u.id)" @change="toggleRoleUnit(role, u.id)" />
                <span class="unit-name">{{ u.name }}</span>
                <span class="unit-meta">{{ factionLabel(u.faction) }} · {{ u.ownerName }}</span>
              </label>
            </div>
          </div>

          <!-- 阵营密码（房主） -->
          <div class="faction-pw-mgmt">
            <h3 class="sub-title">阵营密码（房主）</h3>
            <p class="hint-mini">为每个参战阵营设置 4 位数字密码（留空表示无需密码），玩家加入对应阵营时需输入正确密码。</p>
            <div class="fpw-grid">
              <div class="fpw-col">
                <label>攻击阵营 {{ room?.factionPasswordRequired?.attack ? '（已设）' : '' }}</label>
                <input v-model="factionPw.attack" maxlength="4" inputmode="numeric" placeholder="可选 4 位" />
              </div>
              <div class="fpw-col">
                <label>防守阵营 {{ room?.factionPasswordRequired?.defense ? '（已设）' : '' }}</label>
                <input v-model="factionPw.defense" maxlength="4" inputmode="numeric" placeholder="可选 4 位" />
              </div>
              <div class="fpw-col">
                <label>偷袭阵营 {{ room?.factionPasswordRequired?.ambush ? '（已设）' : '' }}</label>
                <input v-model="factionPw.ambush" maxlength="4" inputmode="numeric" placeholder="可选 4 位" />
              </div>
            </div>
            <button class="btn-save" @click="saveFactionPasswords">保存密码</button>
          </div>
        </div>

        <!-- 胜利条件 -->
        <div class="victory-config">
          <h3 class="sub-title">
            胜利条件
            <span v-if="!isHost" class="readonly-tag">（GM 设定，仅查看）</span>
            <span v-else class="autosave-tag">（自动保存）</span>
          </h3>

          <div v-if="!isHost" class="vc-readonly-note">
            当前生效：{{ enabledConditionLabels.join('、') || '全歼敌方' }}
          </div>

          <div class="vc-options">
            <label v-for="c in VC_CONDITIONS" :key="c.key" class="vc-opt">
              <input
                type="checkbox"
                :checked="vc.conditions.includes(c.key)"
                :disabled="!isHost"
                @change="toggleCondition(c.key)"
              />
              {{ c.label }}
            </label>
          </div>

          <div v-if="vc.conditions.includes('survive')" class="vc-extra">
            <span>生存回合数：</span>
            <input type="number" min="1" max="60" v-model.number="vc.holdRound" :disabled="!isHost" class="num-input" />
          </div>

          <!-- 守备方坐标 / 设施选择（摧毁设施 / 坚守阵地 / 占领据点） -->
          <div v-if="vc.conditions.includes('destroy_facility')" class="vc-extra">
            <div class="vc-extra-title">摧毁设施 · 目标坐标</div>
            <FacilityPicker :facilities="mapFacilities" v-model:q="vc.destroyFacility.q" v-model:r="vc.destroyFacility.r" :disabled="!isHost" />
          </div>
          <div v-if="vc.conditions.includes('hold_position')" class="vc-extra">
            <div class="vc-extra-title">坚守阵地 · 守备坐标</div>
            <FacilityPicker :facilities="mapFacilities" v-model:q="vc.holdPosition.q" v-model:r="vc.holdPosition.r" :disabled="!isHost" />
          </div>
          <div v-if="vc.conditions.includes('capture')" class="vc-extra">
            <div class="vc-extra-title">占领据点 · 目标坐标</div>
            <FacilityPicker :facilities="mapFacilities" v-model:q="vc.capture.q" v-model:r="vc.capture.r" :disabled="!isHost" />
          </div>
        </div>

        <!-- 开战 -->
        <div class="start-area">
      <button class="btn-start" :disabled="!isHost || loading" @click="startBattle">
        {{ loading ? '开战中…' : '出击 · 开始战斗' }}
      </button>
      <p v-if="!isHost" class="wait-hint">等待房主开始战斗…</p>
        </div>
      </section>
    </div>

    <!-- 设施选择器（内联组件） -->
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, watch, h } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { onlineBattleAPI, combatAPI, mapAPI, hangarAPI } from '@/api/client'
import { io } from 'socket.io-client'

const router = useRouter()
const userStore = useUserStore()
const user = computed(() => userStore.user)
const roomId = computed(() => router.currentRoute.value.params.roomId || router.currentRoute.value.params.id)

const room = ref(null)
const loading = ref(false)
const error = ref('')
const editingMax = ref(false)
const maxPlayersInput = ref(4)
const mapFacilities = ref([])
let refreshTimer = null
let prepSocket = null

// 胜利条件统一模型（持久化到房间）
const vc = reactive({
  conditions: ['annihilate'],
  holdRound: 8,
  destroyFacility: { q: 5, r: 5 },
  holdPosition: { q: 5, r: 5 },
  capture: { q: 5, r: 5 },
})

const VC_CONDITIONS = [
  { key: 'annihilate', label: '全歼敌方' },
  { key: 'hold_position', label: '坚守阵地' },
  { key: 'destroy_facility', label: '摧毁设施' },
  { key: 'survive', label: '生存达到一定回合' },
  { key: 'capture', label: '占领据点' },
]
const enabledConditionLabels = computed(() =>
  VC_CONDITIONS.filter(c => vc.conditions.includes(c.key)).map(c => c.label)
)

const isHost = computed(() => room.value?.hostId === user.value?.id)
const isGM = computed(() => ['referee', 'admin', 'dominator'].includes(user.value?.role))
const currentPlayers = computed(() =>
  (room.value?.players || []).filter(p => !p.isSpectator).length
)
const statusLabel = computed(() => {
  const s = room.value?.status
  if (s === 'in_battle') return '战斗中'
  if (s === 'preparing') return '准备中'
  return '等待中'
})
// 房主为每个轮转角色（攻击/防守/偷袭）分配的“已加入棋子”清单（role->[unitId]），为阵营轮转权威源
const roleUnits = reactive({ attack: [], defense: [], ambush: [] })
// 房主为各参战阵营设置的 4 位密码（可选）
const factionPw = reactive({ attack: '', defense: '', ambush: '' })

function canEditThis(p) {
  return isHost.value || isGM.value || p.userId === user.value?.id
}
function factionLabel(f) {
  return { earth: '地球', maxion: '马克尼翁', balon: '巴隆', neutral: '裁判' }[f] || f
}
function roleLabel(r) {
  return { attack: '攻击阵营', defense: '防守阵营', ambush: '偷袭阵营', referee: '裁判阵营', visitor: '观众阵营' }[r] || r
}
// 已加入战场的棋子（后端 joinUpdate 实时推送），房主据此分配轮转角色
const joinedUnits = computed(() => room.value?.joinedUnits || [])
function playerUnitsOf(p) {
  return joinedUnits.value.filter((u) => u.ownerId === p.userId)
}
// 房主在③面板把某个已加入棋子分配到某轮转角色（互斥：一个棋子只属于一个角色）
function toggleRoleUnit(role, uid) {
  for (const r of ['attack', 'defense', 'ambush']) {
    roleUnits[r] = roleUnits[r].filter((id) => id !== uid)
  }
  if (!roleUnits[role].includes(uid)) roleUnits[role].push(uid)
  saveRoleUnits()
}
function saveRoleUnits() {
  onlineBattleAPI.updateSettings(roomId.value, {
    rules: { ...(room.value?.rules || {}), roleUnits: JSON.parse(JSON.stringify(roleUnits)) },
  }).catch((e) => console.warn('saveRoleUnits 失败', e))
}

async function loadRoom() {
  try {
    const { data } = await onlineBattleAPI.getRoom(roomId.value)
    if (!data || !data.room) {
      error.value = '房间不存在或已被删除（可能已结束/解散）'
      return
    }
    room.value = data.room
    // 载入 GM 已保存的胜利条件
    const vcData = room.value?.victoryConditions
    if (vcData && Array.isArray(vcData.conditions)) {
      Object.assign(vc, JSON.parse(JSON.stringify(vcData)))
    }
    // 载入房主“棋子→轮转角色”配置（若有）
    if (room.value?.rules?.roleUnits) {
      const ru = room.value.rules.roleUnits
      roleUnits.attack = Array.isArray(ru.attack) ? ru.attack : []
      roleUnits.defense = Array.isArray(ru.defense) ? ru.defense : []
      roleUnits.ambush = Array.isArray(ru.ambush) ? ru.ambush : []
    }
    loadMapFacilities()
    // GM 出击后自动同步进入战场（player 在 GM 出击后才打开/刷新整备室时也生效）
    syncBattleEntry()
    // 整备室：初始化当前玩家出战棋子选择 + 拉取个人单位库（选项 B）
    if (!selectionInitialized) {
      initMySelection()
      loadMyUnits()
    }
  } catch (e) {
    error.value = '加载房间失败：' + (e?.response?.data?.message || e.message)
  }
}

// ===== 整备室出战棋子选择（选项 B） =====
const myUnits = ref([])
const mySelectedUnitIds = ref([])
const unitsLoading = ref(false)
let selectionInitialized = false

function findMyPlayerRow() {
  return (room.value?.players || []).find((p) => p.userId === user.value?.id)
}

async function loadMyUnits() {
  unitsLoading.value = true
  try {
    const { data } = await hangarAPI.getUnits()
    myUnits.value = (data?.units || []).map((u) => ({
      id: u.id || u.unitId,
      name: u.name,
      faction: u.faction,
      tier: u.tier || 1,
      category: u.category || 'melee',
    }))
  } catch (e) {
    myUnits.value = []
  } finally {
    unitsLoading.value = false
  }
}

function initMySelection() {
  if (selectionInitialized) return
  const me = findMyPlayerRow()
  if (me && Array.isArray(me.selectedUnitIds)) {
    mySelectedUnitIds.value = [...me.selectedUnitIds]
  } else {
    try {
      const ls = localStorage.getItem('selectedUnitIds')
      if (ls) mySelectedUnitIds.value = JSON.parse(ls)
    } catch { /* ignore */ }
  }
  selectionInitialized = true
}

async function toggleUnit(id) {
  const arr = [...mySelectedUnitIds.value]
  const i = arr.indexOf(id)
  if (i >= 0) arr.splice(i, 1)
  else arr.push(id)
  mySelectedUnitIds.value = arr
  await saveMyUnits()
}

async function saveMyUnits() {
  try {
    localStorage.setItem('selectedUnitIds', JSON.stringify(mySelectedUnitIds.value))
    await onlineBattleAPI.setPlayerUnits(roomId.value, user.value?.id, mySelectedUnitIds.value)
  } catch (e) {
    // 落库失败不阻断本地选择；下次刷新房间仍可读本地缓存
  }
}

// GM 出击后自动同步进入战场：房间已 in_battle 且拿到 battleId 时跳转。
// GM 端已先 router.push 并卸载本组件，故不会重复；player 端收到 room-update / 轮询 / 首屏加载均会触发。
function syncBattleEntry() {
  if (room.value?.status === 'in_battle' && room.value?.battleId) {
    const target = '/battle-pc/' + room.value.battleId
    if (router.currentRoute.value.path !== target) router.push(target)
  }
}

async function refreshRoom() {
  try {
    const { data } = await onlineBattleAPI.getRoom(roomId.value)
    room.value = data.room
    syncBattleEntry()
  } catch (e) {}
}

// 实时名册：订阅 comm 的 prep 频道，gateway 名册变更后广播 room-update 即刷新
function connectPrepSocket() {
  const token = localStorage.getItem('token')
  if (!token || prepSocket) return
  try {
    prepSocket = io({
      path: '/socket.io',
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
    })
    prepSocket.on('connect', () => {
      prepSocket.emit('join-room', { roomId: roomId.value, roomType: 'prep' })
    })
    prepSocket.on('room-update', () => {
      refreshRoom()
    })
    prepSocket.on('connect_error', () => {})
  } catch (e) {
    prepSocket = null
  }
}
function disconnectPrepSocket() {
  if (prepSocket) {
    try { prepSocket.emit('leave-room', { roomId: roomId.value, roomType: 'prep' }) } catch (e) {}
    try { prepSocket.disconnect() } catch (e) {}
    prepSocket = null
  }
}

async function loadMapFacilities() {
  if (!room.value?.mapId) return
  try {
    const { data } = await mapAPI.getBattlefield(room.value.mapId)
    const bf = data?.battlefield || data
    const sp = bf?.spawn_points
    if (typeof sp === 'string') {
      try { mapFacilities.value = JSON.parse(sp) } catch (e) { mapFacilities.value = [] }
    } else if (Array.isArray(sp)) {
      mapFacilities.value = sp
    } else {
      mapFacilities.value = []
    }
  } catch (e) { mapFacilities.value = [] }
}

// 玩家阵营 / 观战
async function updatePlayerFaction(userId, payload) {
  try {
    await onlineBattleAPI.setPlayerFaction(roomId.value, userId, payload)
    await refreshRoom()
  } catch (e) {
    alert('更新失败：' + (e?.response?.data?.message || e.message))
  }
}

// 双轨制级联辅助（2026-07-30）
function currentIdentity(p) {
  return p.identityRole || (['referee', 'visitor'].includes(p.role) ? p.role : 'player')
}
function isSlotLocked(p) {
  const id = currentIdentity(p)
  return id === 'referee' || id === 'visitor'
}
async function onIdentityChange(p, val) {
  // 选裁判/观战 → 席位强制清空且置灰
  const tacticalSlot = (val === 'referee' || val === 'visitor') ? null : (p.tacticalSlot || 'attack')
  await updatePlayerFaction(p.userId, { identityRole: val, tacticalSlot, spectator: p.isSpectator })
}
async function onSpectatorChange(p, checked) {
  if (checked) {
    await updatePlayerFaction(p.userId, { identityRole: 'visitor', tacticalSlot: null, spectator: true })
  } else {
    const slot = p.tacticalSlot || 'attack'
    await updatePlayerFaction(p.userId, { identityRole: 'player', tacticalSlot: slot, spectator: false })
  }
}

// 设置参赛人数
function openMaxEditor() {
  if (!(isHost.value || isGM.value)) return
  maxPlayersInput.value = room.value?.maxPlayers || 4
  editingMax.value = true
}
async function saveMaxPlayers() {
  try {
    await onlineBattleAPI.updateSettings(roomId.value, { maxPlayers: Number(maxPlayersInput.value) })
    editingMax.value = false
    await refreshRoom()
  } catch (e) { alert('保存失败：' + (e?.response?.data?.message || e.message)) }
}

// 名册锁定 / 删除
async function toggleRosterLock() {
  try {
    await onlineBattleAPI.lockRoster(roomId.value, { locked: !room.value?.rosterLocked })
    await refreshRoom()
  } catch (e) { alert('操作失败：' + (e?.response?.data?.message || e.message)) }
}
async function deleteRoom() {
  if (!confirm('确认删除该房间？')) return
  try {
    await onlineBattleAPI.deleteRoom(roomId.value)
    router.push('/battlefields')
  } catch (e) { alert('删除失败：' + (e?.response?.data?.message || e.message)) }
}

// 胜利条件编辑（房主）
function toggleCondition(key) {
  const i = vc.conditions.indexOf(key)
  if (i >= 0) vc.conditions.splice(i, 1)
  else vc.conditions.push(key)
}
async function saveVC() {
  if (!isHost.value) return
  try {
    await onlineBattleAPI.updateSettings(roomId.value, { victoryConditions: JSON.parse(JSON.stringify(vc)) })
  } catch (e) {}
}
watch(vc, () => { saveVC() }, { deep: true })

// 房主保存各阵营密码
async function saveFactionPasswords() {
  try {
    await onlineBattleAPI.updateSettings(roomId.value, {
      factionPasswords: {
        attack: factionPw.attack.trim(),
        defense: factionPw.defense.trim(),
        ambush: factionPw.ambush.trim(),
      },
    })
    await refreshRoom()
    alert('阵营密码已保存')
  } catch (e) {
    alert('保存失败：' + (e?.response?.data?.message || e.message))
  }
}

function buildVictoryData() {
  const vd = { conditions: [...vc.conditions], hold_round: Number(vc.holdRound) }
  if (vc.conditions.includes('destroy_facility')) {
    vd.target_q = Number(vc.destroyFacility.q)
    vd.target_r = Number(vc.destroyFacility.r)
  }
  if (vc.conditions.includes('hold_position')) {
    vd.target_q = Number(vc.holdPosition.q)
    vd.target_r = Number(vc.holdPosition.r)
  }
  if (vc.conditions.includes('capture')) {
    vd.target_q = Number(vc.capture.q)
    vd.target_r = Number(vc.capture.r)
  }
  return vd
}

async function startBattle() {
  if (!confirm('确认开始战斗？开始后名册将锁定。')) return
  try {
    loading.value = true
    // 先持久化房主“棋子→轮转角色”配置（roleUnits），确保开战时 seedRoomBattle 能读到最新映射
    try {
      await onlineBattleAPI.updateSettings(roomId.value, {
        victoryConditions: JSON.parse(JSON.stringify(vc)),
        rules: { ...(room.value?.rules || {}), roleUnits: JSON.parse(JSON.stringify(roleUnits)) },
      })
    } catch (e) { console.warn('updateSettings 失败', e) }
    const { data } = await onlineBattleAPI.startBattle(roomId.value)
    const battleId = data.battleId
    const victoryData = buildVictoryData()
    try {
      await combatAPI.setVictoryConditions(battleId, victoryData)
    } catch (e) { console.warn('setVictoryConditions 失败', e) }
    router.push(`/battle-pc/${battleId}`)
  } catch (e) {
    alert('开始战斗失败：' + (e?.response?.data?.message || e.message))
  } finally {
    loading.value = false
  }
}

function goBack() { router.push('/battlefields') }

// 设施选择器内联组件
const FacilityPicker = {
  props: {
    facilities: { type: Array, default: () => [] },
    q: { type: [Number, String], default: 5 },
    r: { type: [Number, String], default: 5 },
    disabled: { type: Boolean, default: false },
  },
  emits: ['update:q', 'update:r'],
  setup(props, { emit }) {
    function label(f, i) {
      const t = f?.type || f?.name
      return (t ? `${t}` : `地图设施 ${i + 1}`) + ` (${f?.q ?? '?'}, ${f?.r ?? '?'})`
    }
    function onPick(e) {
      const idx = e.target.value
      if (idx === '') return
      const f = props.facilities[Number(idx)]
      if (f) { emit('update:q', Number(f.q)); emit('update:r', Number(f.r)) }
    }
    return () => h('div', { class: 'facility-picker' }, [
      props.facilities.length
        ? h('select', {
            class: 'facility-select',
            disabled: props.disabled,
            onChange: onPick,
          }, [
            h('option', { value: '' }, '— 选择地图设施（母舰/基地/维修站/出生点）—'),
            ...props.facilities.map((f, i) => h('option', { value: i, key: i }, label(f, i))),
          ])
        : null,
      h('div', { class: 'coord-inputs' }, [
        h('label', {}, ['Q ', h('input', {
          type: 'number', class: 'num-input sm', disabled: props.disabled,
          value: props.q, onInput: (e) => emit('update:q', Number(e.target.value)),
        })]),
        h('label', {}, ['R ', h('input', {
          type: 'number', class: 'num-input sm', disabled: props.disabled,
          value: props.r, onInput: (e) => emit('update:r', Number(e.target.value)),
        })]),
      ]),
    ])
  },
}

onMounted(() => {
  loadRoom()
  connectPrepSocket()
  refreshTimer = setInterval(refreshRoom, 5000)
})
onUnmounted(() => { if (refreshTimer) clearInterval(refreshTimer); disconnectPrepSocket() })
</script>

<style scoped>
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
.prep-room {
  min-height: 100vh; background: #001620; color: #c1e8ff;
  font-family: 'Noto Sans SC', system-ui, sans-serif; padding: 16px 24px 40px;
}
.room-topbar { display: flex; align-items: center; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
.btn-back { background: #001e2b; border: 1px solid rgba(255,176,0,0.25); color: #c1e8ff; padding: 8px 16px; cursor: pointer; font-size: 13px; }
.btn-back:hover { border-color: #ffb000; }
.room-title { font-size: 22px; font-weight: 900; letter-spacing: 0.05em; flex: 1; }
.room-meta { display: flex; gap: 10px; align-items: center; }
.code-badge { background: rgba(255,176,0,0.12); border: 1px solid rgba(255,176,0,0.3); color: #ffb000; padding: 4px 12px; font-family: 'Fira Code', monospace; font-size: 12px; }
.status-badge { padding: 4px 12px; font-size: 11px; border-radius: 4px; }
.status-badge.waiting { color: #13ff43; background: rgba(19,255,67,0.1); }
.status-badge.in_battle { color: #ffb000; background: rgba(255,176,0,0.1); }
.status-badge.preparing { color: #7aeaff; background: rgba(122,234,255,0.1); }

.room-error { background: rgba(255,64,64,0.12); border: 1px solid rgba(255,64,64,0.4); color: #ff8a8a; padding: 12px 16px; margin-bottom: 16px; border-radius: 6px; font-size: 13px; }

.prep-body { display: grid; grid-template-columns: 360px 1fr; gap: 24px; align-items: start; }
.panel { background: #001e2b; border: 1px solid rgba(255,176,0,0.12); padding: 20px; }
.panel-title { font-size: 15px; color: #ffb000; margin-bottom: 14px; letter-spacing: 0.05em; }
.sub-title { font-size: 13px; color: #ffb000; margin: 18px 0 10px; letter-spacing: 0.05em; border-left: 3px solid #ffb000; padding-left: 8px; }

.room-info { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.info-card { background: #002e3f; border: 1px solid rgba(255,176,0,0.1); padding: 12px; }
.info-card.clickable { cursor: pointer; border-color: rgba(255,176,0,0.4); }
.info-card.clickable:hover { background: #00384c; }
.info-label { font-size: 10px; color: rgba(193,232,255,0.5); margin-bottom: 4px; }
.info-value { font-size: 14px; font-weight: 700; font-family: 'Fira Code', monospace; word-break: break-all; }
.map-id { font-size: 11px; }

.max-editor { display: flex; align-items: center; gap: 8px; margin: 12px 0; font-size: 12px; background: #002e3f; padding: 10px; border: 1px solid rgba(255,176,0,0.2); }
.num-input { width: 64px; padding: 5px 8px; background: rgba(0,0,0,0.35); border: 1px solid rgba(255,176,0,0.22); color: #ffd597; border-radius: 4px; outline: none; font-family: inherit; }
.num-input:focus { border-color: #ffb000; box-shadow: 0 0 0 2px rgba(255,176,0,0.15); }
.num-input.sm { width: 56px; }
.btn-mini { padding: 5px 12px; background: #ffb000; color: #0a1628; border: none; font-size: 11px; cursor: pointer; font-weight: 700; }
.btn-mini.ok:hover { background: #ffc840; }

.roster { margin-top: 8px; }
.empty-mini { color: rgba(193,232,255,0.35); font-size: 12px; padding: 12px; text-align: center; border: 1px dashed rgba(255,176,0,0.15); }
.roster-row { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 10px; padding: 8px 10px; background: #002e3f; border: 1px solid rgba(255,176,0,0.08); margin-bottom: 6px; }
.roster-row.spectator { opacity: 0.6; }
.roster-name { flex: 1 1 auto; min-width: 0; font-size: 13px; display: flex; align-items: center; gap: 6px; }
.host-badge { font-size: 9px; background: #ffb000; color: #0a1628; padding: 1px 5px; border-radius: 3px; }
.spec-badge { font-size: 9px; background: rgba(122,234,255,0.2); color: #7aeaff; padding: 1px 5px; border-radius: 3px; }
.faction-select { background: rgba(0,0,0,0.35); border: 1px solid rgba(255,176,0,0.22); color: #ffd597; padding: 4px 6px; font-size: 12px; border-radius: 4px; outline: none; font-family: inherit; }
.faction-select:focus { border-color: #ffb000; box-shadow: 0 0 0 2px rgba(255,176,0,0.15); }
/* 房主锁定语：统一成词条库数值框风格（只读框，不与下拉框混淆） */
.locked-tag {
  background: rgba(0,0,0,0.35);
  border: 1px solid rgba(255,176,0,0.22);
  color: #ffd597;
  padding: 4px 8px;
  font-size: 11px;
  border-radius: 4px;
  white-space: nowrap;
  letter-spacing: 0.3px;
}
.locked-tag.slot { color: rgba(255,213,151,0.6); font-style: italic; }
.spec-toggle { font-size: 11px; color: rgba(193,232,255,0.7); display: flex; align-items: center; gap: 3px; }
.spec-toggle.disabled { opacity: 0.45; }
.hint-mini { font-size: 10px; color: rgba(193,232,255,0.4); margin-top: 6px; line-height: 1.5; }

.unit-deploy-block { margin-top: 18px; }
.unit-check-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 8px; max-height: 320px; overflow-y: auto; padding-right: 4px; }
.unit-check { display: flex; flex-direction: column; gap: 2px; padding: 7px 9px; background: #00202c; border: 1px solid rgba(255,176,0,0.12); cursor: pointer; font-size: 12px; transition: all 0.15s; }
.unit-check:hover { border-color: rgba(255,176,0,0.4); }
.unit-check.on { background: rgba(255,176,0,0.12); border-color: #ffb000; }
.unit-check input { position: absolute; opacity: 0; pointer-events: none; }
.unit-check .unit-name { font-size: 12px; color: #c1e8ff; padding-left: 18px; position: relative; }
.unit-check.on .unit-name::before { content: '✓'; position: absolute; left: 0; color: #ffb000; font-weight: 900; }
.unit-check .unit-meta { font-size: 10px; color: rgba(193,232,255,0.45); padding-left: 18px; }
.unit-count-badge { font-size: 9px; color: rgba(255,176,0,0.7); background: rgba(255,176,0,0.1); padding: 1px 6px; border-radius: 3px; white-space: nowrap; }
.unit-names { flex-basis: 100%; font-size: 10px; color: rgba(255,255,255,0.55); margin-left: 0; }
.unit-role-opt { flex-direction: column; align-items: flex-start; gap: 2px; padding: 4px 6px; border-radius: 4px; }
.unit-role-opt .unit-meta { font-size: 10px; color: rgba(255,255,255,0.45); }

.host-actions { display: flex; gap: 10px; margin-top: 16px; }
.btn-danger { padding: 8px 16px; background: rgba(255,80,80,0.15); border: 1px solid #ff5050; color: #ff8080; cursor: pointer; font-size: 12px; }
.btn-danger:hover { background: rgba(255,80,80,0.25); }
.btn-danger.ghost { background: none; }

.config-panel { min-height: 420px; }
.faction-mgmt { margin-bottom: 8px; }
.faction-roles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.role-col { background: #002e3f; padding: 10px; border: 1px solid rgba(255,176,0,0.1); }
.role-head { font-size: 12px; color: #ffb000; margin-bottom: 8px; font-weight: 700; }
.role-opt { display: flex; align-items: center; gap: 6px; font-size: 12px; margin-bottom: 4px; cursor: pointer; }

.victory-config { margin-top: 8px; }
.faction-pw-mgmt { margin-top: 18px; border-top: 1px dashed rgba(255,176,0,0.2); padding-top: 14px; }
.fpw-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 8px; }
.fpw-col { display: flex; flex-direction: column; gap: 6px; }
.fpw-col label { font-size: 11px; color: rgba(193,232,255,0.7); }
.fpw-col input { padding: 8px; text-align: center; letter-spacing: 0.3em; background: rgba(0,0,0,0.35); border: 1px solid rgba(255,176,0,0.22); color: #ffd597; font-size: 13px; border-radius: 4px; outline: none; font-family: inherit; }
.fpw-col input:focus { border-color: #ffb000; box-shadow: 0 0 0 2px rgba(255,176,0,0.15); }
.btn-save { margin-top: 12px; padding: 8px 18px; background: #ffb000; color: #0a1628; border: none; font-weight: 700; cursor: pointer; }
.readonly-tag { font-size: 10px; color: #7aeaff; font-weight: 400; }
.autosave-tag { font-size: 10px; color: rgba(193,232,255,0.4); font-weight: 400; }
.vc-readonly-note { font-size: 12px; color: #7aeaff; background: rgba(122,234,255,0.08); padding: 8px 10px; margin-bottom: 10px; }
.vc-options { display: flex; flex-wrap: wrap; gap: 12px; }
.vc-opt { display: flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer; }
.vc-extra { margin-top: 12px; background: #002e3f; padding: 10px 12px; border: 1px solid rgba(255,176,0,0.12); }
.vc-extra-title { font-size: 12px; color: #ffb000; margin-bottom: 8px; }

.facility-picker { display: flex; flex-direction: column; gap: 8px; }
.facility-select { background: rgba(0,0,0,0.35); border: 1px solid rgba(255,176,0,0.22); color: #ffd597; padding: 6px 8px; font-size: 12px; border-radius: 4px; outline: none; font-family: inherit; }
.facility-select:focus { border-color: #ffb000; box-shadow: 0 0 0 2px rgba(255,176,0,0.15); }
.coord-inputs { display: flex; gap: 12px; font-size: 12px; align-items: center; }
.coord-inputs label { display: flex; align-items: center; gap: 4px; }

.start-area { margin-top: 24px; text-align: center; }
.btn-start { padding: 14px 48px; background: #ffb000; color: #0a1628; border: none; font-size: 16px; font-weight: 900; cursor: pointer; letter-spacing: 0.1em; }
.btn-start:hover { background: #ffc840; }
.btn-start:disabled { opacity: 0.5; cursor: not-allowed; }
.wait-hint { font-size: 11px; color: rgba(193,232,255,0.4); margin-top: 8px; }
</style>
