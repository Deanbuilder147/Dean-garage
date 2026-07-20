<template>

    <div class="page-container w-full h-full flex flex-col overflow-y-auto">
      <header class="page-header">
        <h1>[ 整备室 ]</h1>
        <div class="header-meta">
          <span class="meta-item"><span class="dot-live"></span> 待命</span>
          <span class="sep">::</span>
          <span>战斗准备就绪</span>
        </div>
      </header>

      <!-- Room Info -->
      <div class="room-info">
        <div class="info-card">
          <span class="info-label">房间号</span>
          <span class="info-value">{{ roomId }}</span>
        </div>
        <div class="info-card">
          <span class="info-label">玩家</span>
          <span class="info-value">{{ room?.players?.length || 1 }} / 2</span>
        </div>
        <div class="info-card">
          <span class="info-label">状态</span>
          <span class="info-value status-ready">{{ room?.status || '等待中' }}</span>
        </div>
      </div>

      <!-- Victory Conditions -->
      <div class="selection-area">
        <div class="select-section">
          <h3>⚔ 胜利条件 <span class="section-hint">选择本场战斗的胜利方式</span></h3>
          <div class="victory-conditions-grid">
            <label v-for="vc in victoryConditionOptions" :key="vc.value" :for="`vc-${vc.value}`" class="vc-option" :class="{ active: selectedVictoryConditions.includes(vc.value) }">
              <input :id="`vc-${vc.value}`" type="checkbox" :value="vc.value" v-model="selectedVictoryConditions" />
              <span class="vc-icon">{{ vc.icon }}</span>
              <span class="vc-label">{{ vc.label }}</span>
              <span class="vc-desc">{{ vc.desc }}</span>
            </label>
          </div>
          <div v-if="selectedVictoryConditions.includes('hold_position')" class="vc-extra">
            <label for="hold-round">坚守至第 <input id="hold-round" type="number" v-model="holdRound" min="1" max="20" class="vc-round-input" /> 轮</label>
          </div>
          <div v-if="selectedVictoryConditions.includes('destroy_facility')" class="vc-extra">
            <label for="facility-q">设施坐标: Q <input id="facility-q" type="number" v-model="facilityQ" class="vc-coord-input" /> R <input id="facility-r" type="number" v-model="facilityR" class="vc-coord-input" /></label>
          </div>
        </div>
      </div>

      <!-- ACE Unit Selection -->
      <div class="selection-area" v-if="factionGroups.length > 0">
        <div class="select-section">
          <h3>★ ACE单位设置 <span class="section-hint">可选：指定阵营ACE（只有ACE能发动特殊能力）</span></h3>
          <div v-for="fg in factionGroups" :key="fg.key" class="ace-faction-row">
            <span class="ace-faction-label" :style="{color: fg.color}">{{ fg.label }}</span>
            <label :for="`role-${fg.key}`" class="sr-only">阵营角色</label>
            <select :id="`role-${fg.key}`" v-model="factionRoles[fg.key]" class="ace-select faction-role-select" @change="onRoleChange(fg.key)">
              <option value="attack">⚔ 攻击阵营</option>
              <option value="defense">🛡 防守阵营</option>
              <option value="ambush">🗡 偷袭阵营</option>
            </select>
            <label :for="`ace-${fg.key}`" class="sr-only">ACE选择</label>
            <select :id="`ace-${fg.key}`" v-model="aceSelections[fg.key]" class="ace-select">
              <option :value="null">-- 不设ACE（全员可用） --</option>
              <option v-for="unit in fg.units" :key="unit.id" :value="unit.id">{{ unit.name || ('Unit-' + unit.id) }}</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Unit Selection -->
      <div class="selection-area">
        <div class="select-section">
          <h3>选择出击单位 <span class="count">(选择出击单位)</span></h3>
          <div class="unit-grid">
            <div v-for="u in availableUnits" :key="u.id"
              :class="['unit-select-card', { selected: selectedIds.includes(u.id) }]"
              @click="toggleUnit(u)">
              <div class="us-name">{{ u.name || '未命名' }}</div>
              <div class="us-type">{{ u.type || '通用型' }}</div>
              <div class="us-stats">
                <span>攻:{{ u.attack || '--' }}</span>
                <span>防:{{ u.defense || '--' }}</span>
                <span>机:{{ u.mobility || '--' }}</span>
              </div>
              <div v-if="selectedIds.includes(u.id)" class="selected-mark">✓</div>
            </div>
          </div>
          <div v-if="availableUnits.length === 0" class="empty-msg">还没有机甲单位，请先在单位编辑器中创建</div>
        </div>

        <!-- Chat -->
        <div class="chat-section">
          <h3>战术通讯</h3>
          <div class="chat-log">
            <div v-for="(msg, i) in chatLogs" :key="i" class="chat-msg">
              <span class="chat-time">{{ msg.time }}</span>
              <span :class="['chat-user', msg.type]">{{ msg.user }}:</span>
              <span class="chat-text">{{ msg.text }}</span>
            </div>
            <div v-if="chatLogs.length === 0" class="chat-empty">等待通讯...</div>
          </div>
          <div class="chat-input-row">
            <label for="chat-message-input" class="sr-only">消息</label>
            <span class="prompt">&gt;</span>
            <input id="chat-message-input" v-model="chatInput" type="text" placeholder="输入消息..." @keydown.enter="sendChat" />
          </div>
        </div>
      </div>

      <!-- Start Button -->
      <div class="action-area">
        <button class="btn-start" :disabled="selectedIds.length === 0 || starting" @click="startBattle">
          {{ starting ? '启动中...' : '出击' }}
        </button>
      </div>
    </div></template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
// Phase 29-I: 鹦鹉螺号置换 — 房间数据主权移交 3006 onlineBattleAPI (SQLite 执政)
// commAPI 仅保留 sendMessage (Socket.io 实时通道)
import { combatAPI, commAPI, hangarAPI, onlineBattleAPI } from '@/api/client'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const user = computed(() => userStore.user)
const roomId = route.params.roomId
const room = ref(null)
const availableUnits = ref([])
const selectedIds = ref([])
const chatLogs = ref([])
const chatInput = ref('')
const starting = ref(false)

// ===== 胜利条件 =====
const victoryConditionOptions = [
  { value: 'annihilate', icon: '💀', label: '全歼敌方', desc: '消灭所有敌方单位' },
  { value: 'assassinate', icon: '🎯', label: '刺杀ACE', desc: '击败敌方ACE单位' },
  { value: 'destroy_facility', icon: '🏗', label: '摧毁设施', desc: '摧毁指定设施' },
  { value: 'hold_position', icon: '🛡', label: '坚守阵地', desc: '存活至指定轮次' },
  { value: 'capture', icon: '🚩', label: '占领据点', desc: '占领所有据点' },
]
const selectedVictoryConditions = ref(['annihilate'])
const holdRound = ref(8)
const facilityQ = ref(5)
const facilityR = ref(5)

// ===== ACE 设置 =====
// ===== 阵营角色设置 =====
const FACTION_ROLES = {
  attack: { label: '攻击阵营', icon: '⚔', color: '#ff4d4d' },
  defense: { label: '防守阵营', icon: '🛡', color: '#13ff43' },
  ambush: { label: '偷袭阵营', icon: '🗡', color: '#9c27b0' },
}
const factionRoles = reactive({})
const aceSelections = reactive({})
const FACTION_CONFIG = {
  earth:  { label: '地球联合', color: '#13ff43', order: 1 },
  maxion: { label: '马克西翁', color: '#ff4d4d', order: 2 },
  balon:  { label: '拜隆',     color: '#9c27b0', order: 4 },
  neutral:{ label: '中立',     color: '#ffb000', order: 3 },
}
function onRoleChange(factionKey) {
  // 角色变更时的处理
}
function getLab(f) { return (FACTION_CONFIG[f] || {}).label || f }
function getCol(f) { return (FACTION_CONFIG[f] || {}).color || '#888' }

const factionGroups = computed(() => {
  const groups = {}
  for (const u of (availableUnits.value || [])) {
    const f = u.faction || 'earth'
    if (!groups[f]) groups[f] = { key: f, label: getLab(f), color: getCol(f), units: [] }
    groups[f].units.push(u)
  }
  return Object.values(groups).sort((a, b) => (FACTION_CONFIG[a.key]?.order || 99) - (FACTION_CONFIG[b.key]?.order || 99))
})

onMounted(async () => {
  // 加载棋子列表（格纳库）- 独立加载，不受房间状态影响
  try {
    const unitRes = await hangarAPI.getUnits()
    availableUnits.value = unitRes.data?.units || unitRes.data || []
  } catch (e) {
    console.error('加载棋子库失败:', e)
    availableUnits.value = []
  }

  // Phase 29-I: 加载房间信息（从 3006 SQLite 获取）
  try {
    const roomRes = await onlineBattleAPI.getRoom(roomId)
    room.value = roomRes.data
  } catch (e) {
    console.error('加载房间失败:', e)
  }
})

function toggleUnit(u) {
  const idx = selectedIds.value.indexOf(u.id)
  if (idx >= 0) {
    selectedIds.value.splice(idx, 1)
  } else {
    selectedIds.value.push(u.id)
  }
}

function sendChat() {
  if (!chatInput.value.trim()) return
  chatLogs.value.push({
    time: new Date().toLocaleTimeString(),
    user: '指挥官',
    type: 'self',
    text: chatInput.value
  })
  chatInput.value = ''
}

// ================================================================
//  Phase 18-C: 装备 DKM 防爆器 — 整备室出击侧数据源清洗
//  确保 deployPool 提交前所有 unit.equipment 三槽位完整
//  与 NewBattleView.vue 的 sanitizeUnitEquipment 保持同构
// ================================================================
function sanitizeUnitEquipment(unit) {
  if (!unit || typeof unit !== 'object') return unit
  unit.equipment = unit.equipment || {}
  const slots = ['left_hand', 'right_hand', 'other']
  let fixed = 0
  slots.forEach(slot => {
    if (!unit.equipment[slot] || typeof unit.equipment[slot] !== 'object') {
      unit.equipment[slot] = {
        damage_kind_modifiers: { kinetic: 0, beam: 0, explosive: 0, corrosive: 0 }
      }
      fixed++
    } else {
      const dkm = unit.equipment[slot].damage_kind_modifiers
      if (!dkm || typeof dkm !== 'object') {
        unit.equipment[slot].damage_kind_modifiers = { kinetic: 0, beam: 0, explosive: 0, corrosive: 0 }
        fixed++
      } else {
        const kinds = ['kinetic', 'beam', 'explosive', 'corrosive']
        let patched = false
        kinds.forEach(k => {
          if (!(k in dkm)) { dkm[k] = 0; patched = true }
        })
        if (patched) fixed++
      }
    }
  })
  if (fixed > 0) {
    console.log(`[PrepRoom-Sanitizer] 单位 "${unit.name || unit.id}": 修复 ${fixed} 个装备槽位`)
  }
  return unit
}

async function startBattle() {
  if (selectedIds.value.length === 0) return
  starting.value = true
  localStorage.setItem('selectedUnitIds', JSON.stringify(selectedIds.value))
    localStorage.setItem('factionRoles', JSON.stringify({...factionRoles}))
    localStorage.setItem('aceSelections', JSON.stringify({...aceSelections}))

  // Phase 27: 先创建战场（获取合法 battleId），再上传部署池
  let battleId = room.value?.room?.battle_id || room.value?.battle_id
  if (!battleId) {
    try {
      const res = await combatAPI.createBattle({
        battlefield_id: room.value?.room?.mapId || room.value?.mapId || 1
      })
      battleId = res.data?.battle?.id || res.data?.battle_id || res.data?.id

      // 发送胜利条件
      try {
        const victoryData = { conditions: selectedVictoryConditions.value, hold_round: holdRound.value }
        if (selectedVictoryConditions.value.includes('destroy_facility')) {
          victoryData.target_q = facilityQ.value
          victoryData.target_r = facilityR.value
        }
        await combatAPI.setVictoryConditions(battleId, victoryData)
      } catch (e) { console.warn('胜利条件设置失败:', e) }

      // 发送ACE设置
      for (const [faction, unitId] of Object.entries(aceSelections)) {
        if (unitId) {
          try { await combatAPI.setAceUnit(battleId, { faction, unit_id: unitId }) } catch (e) { console.warn('ACE设置失败:', faction, e) }
        }
      }
    } catch (e) {
      console.warn('createBattle failed:', e.message || e)
      alert("创建战斗失败，请重新登录后重试")
      starting.value = false
      return
    }
  }

  // Phase 27: 战场创建后，将选中棋子完整数据写入后端部署池
  if (battleId) {
    try {
      const selectedUnits = availableUnits.value.filter(u => selectedIds.value.includes(u.id))
      // Phase 18-C: 出击前强制清洗装备槽位，从源头截断空值崩溃
      selectedUnits.forEach(u => sanitizeUnitEquipment(u))
      console.log(`[PrepRoom] deployPool 已防爆清洗 ${selectedUnits.length} 个棋子装备`)
      await combatAPI.setPendingUnits(battleId, { units: selectedUnits })
      console.log(`[startBattle] 已上传 ${selectedUnits.length} 个棋子到后端部署池`)
    } catch (e) {
      console.warn('[startBattle] 部署池上传失败（将回退到 localStorage）:', e.message)
    }
  }

  if (roomId) {
    try { await commAPI.sendMessage(roomId, { type: 'start', units: selectedIds.value }) } catch (e) {}
  }

  starting.value = false
  // Phase 18-C: 硬导航直达 PC 战斗视图，跳过 redirectByDevice 中间件，消除重定向黑屏
  router.push('/battle-pc/' + battleId)
}

function navigateTo(path) { router.push(path) }
</script>

<style scoped>

*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
.page-container { display: flex; flex-direction: column; background: #001620; color: #c1e8ff; font-family: 'Noto Sans SC', system-ui, sans-serif; }
.icon { width: 1em; height: 1em; display: inline-block; vertical-align: middle; fill: currentColor; flex-shrink: 0; }

/* ===== NAV (shared) ===== */

/* ACE Selection */

/* ===== MAIN CONTENT LAYOUT ===== */

/* ===== PAGE HEADER ===== */
.page-header {
  position: relative;
  margin-bottom: 32px;
  padding-left: 16px;
}
.page-header::before {
  content: '';
  position: absolute;
  left: 0; top: 0;
  width: 4px; height: 100%;
  background: #ffb000;
}
.page-header h1 {
  font-size: 28px;
  font-weight: 900;
  color: #c1e8ff;
  letter-spacing: 0.1em;
  margin-bottom: 8px;
}
.header-meta {
  display: flex; align-items: center; gap: 12px;
  font-family: 'Fira Code', monospace;
  font-size: 11px;
  color: #d7c4ac;
}
.meta-item {
  display: inline-flex; align-items: center; gap: 6px;
}
.dot-live {
  width: 8px; height: 8px;
  background: #13ff43;
  border-radius: 50%;
  animation: pulse 2s infinite;
}
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
.sep { color: #9f8e78; }

/* ===== ROOM INFO ===== */
.room-info {
  display: flex; gap: 16px;
  margin-bottom: 28px;
  flex-wrap: wrap;
}
.info-card {
  background: #001e2b;
  border: 1px solid rgba(255,176,0,0.25);
  padding: 12px 20px;
  display: flex; flex-direction: column; gap: 4px;
  min-width: 120px;
  position: relative;
}
.info-card::before {
  content: '';
  position: absolute;
  left: 0; top: 0;
  width: 3px; height: 100%;
  background: #ffb000;
}
.info-label {
  font-size: 9px;
  color: #9f8e78;
  text-transform: uppercase;
  letter-spacing: 2px;
  font-family: 'Fira Code', monospace;
}
.info-value {
  font-size: 16px;
  font-weight: 700;
  color: #c1e8ff;
}
.status-ready { color: #13ff43; }

/* ===== SELECTION AREA ===== */
.selection-area {
  background: #001e2b;
  border: 1px solid rgba(255,176,0,0.2);
  margin-bottom: 20px;
  padding: 24px;
  position: relative;
}
.selection-area::before {
  content: '';
  position: absolute;
  left: 0; top: 0;
  width: 4px; height: 100%;
  background: #ffb000;
}
.select-section h3 {
  font-size: 14px;
  font-weight: 700;
  color: #ffb000;
  margin-bottom: 16px;
  letter-spacing: 0.05em;
  display: flex; align-items: baseline; gap: 10px;
}
.section-hint {
  font-size: 10px;
  font-weight: 400;
  color: rgba(193,232,255,0.35);
  font-family: 'Fira Code', monospace;
}
.count {
  font-size: 12px;
  font-weight: 400;
  color: rgba(193,232,255,0.4);
}

/* ===== VICTORY CONDITIONS ===== */
.victory-conditions-grid {
  display: flex; flex-wrap: wrap; gap: 10px;
}
.vc-option {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 12px 16px;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
  background: #001620;
  min-width: 100px;
}
.vc-option:hover { border-color: rgba(255,176,0,0.2); }
.vc-option.active { border-color: #ffb000; color: #ffb000; background: rgba(255,176,0,0.08); }
.vc-option input { display: none; }
.vc-icon { font-size: 14px; }
.vc-label {
  font-size: 10px;
  font-weight: 700;
  color: inherit;
}
.vc-desc { font-size: 8px; color: rgba(255,255,255,0.2); display: block; }
.vc-extra {
  margin-top: 8px; font-size: 10px; color: rgba(255,176,0,0.7);
  padding: 6px 10px; background: rgba(255,176,0,0.05); border: 1px solid rgba(255,176,0,0.15);
}
.vc-extra label {
  display: flex; align-items: center; gap: 6px;
}
.vc-round-input, .vc-coord-input {
  width: 46px; padding: 2px 4px; background: #001e2b; border: 1px solid rgba(255,176,0,0.3);
  color: #ffb000; font-size: 10px; font-family: monospace; text-align: center; margin: 0 4px;
}

/* ===== ACE SELECTION ===== */
.ace-faction-row {
  display: flex; align-items: center; gap: 10px; padding: 6px 0;
  border-bottom: 1px solid rgba(255,255,255,0.04);
}
.ace-faction-label { font-size: 11px; font-weight: 700; min-width: 80px; text-transform: uppercase; letter-spacing: 1px; }
.ace-select {
  flex: 1; padding: 4px 8px; background: #001e2b; border: 1px solid rgba(255,255,255,0.1);
  color: #c1e8ff; font-size: 11px; font-family: inherit;
}
.ace-select:focus { outline: none; border-color: #00b4dc; }
.faction-role-select {
  min-width: 110px;
  font-size: 11px;
  font-weight: 600;
}
.faction-role-select option { background: #001e2b; }

/* ===== UNIT SELECTION GRID ===== */
.unit-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 10px;
  margin-bottom: 16px;
}
.unit-select-card {
  background: #001620;
  border: 1px solid rgba(255,255,255,0.08);
  padding: 14px;
  cursor: pointer;
  transition: all 0.15s;
  position: relative;
  border-radius: 4px;
}
.unit-select-card:hover {
  border-color: rgba(255,176,0,0.15);
  background: #001e2b;
}
.unit-select-card.selected {
  border-color: #ffb000;
  background: rgba(255,176,0,0.06);
  box-shadow: 0 0 8px rgba(255,176,0,0.1);
}
.us-name {
  font-size: 13px;
  font-weight: 700;
  color: #c1e8ff;
  margin-bottom: 4px;
}
.us-type {
  font-size: 9px;
  color: #9f8e78;
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 1px;
}
.us-stats {
  display: flex; gap: 12px;
  font-size: 10px;
  font-family: 'Fira Code', monospace;
  color: rgba(193,232,255,0.6);
}
.us-stats span {
  display: inline-flex; align-items: center; gap: 2px;
}
.selected-mark {
  position: absolute;
  top: 6px; right: 8px;
  color: #ffb000;
  font-size: 14px;
  font-weight: 700;
}
.empty-msg {
  color: rgba(241,243,252,0.15);
  font-size: 11px;
  text-align: center;
  padding: 24px 0;
  grid-column: 1 / -1;
}

/* ===== CHAT SECTION ===== */
.chat-section {
  margin-top: 20px;
  border-top: 1px solid rgba(255,255,255,0.06);
  padding-top: 16px;
}
.chat-section h3 {
  font-size: 12px;
  color: rgba(255,176,0,0.7);
  margin-bottom: 10px;
  letter-spacing: 0.05em;
}
.chat-log {
  background: #001620;
  border: 1px solid rgba(255,255,255,0.06);
  padding: 10px;
  max-height: 160px;
  overflow-y: auto;
  margin-bottom: 8px;
}
.chat-msg {
  font-size: 10px;
  padding: 2px 0;
  font-family: 'Fira Code', monospace;
  line-height: 1.4;
  display: flex; gap: 6px;
}
.chat-time {
  color: rgba(255,255,255,0.15);
  flex-shrink: 0;
  font-size: 9px;
}
.chat-user {
  flex-shrink: 0;
  font-weight: 700;
}
.chat-user.self { color: #ffb000; }
.chat-user.system { color: #00b4dc; }
.chat-user.other { color: #13ff43; }
.chat-text { color: rgba(193,232,255,0.6); }
.chat-empty {
  color: rgba(241,243,252,0.1);
  font-size: 10px;
  text-align: center;
  padding: 10px 0;
}
.chat-input-row {
  display: flex; align-items: center; gap: 8px;
}
.chat-input-row .prompt {
  color: #ffb000;
  font-family: 'Fira Code', monospace;
  font-size: 14px;
}
.chat-input-row input {
  flex: 1;
  background: #001620;
  border: 1px solid rgba(255,255,255,0.08);
  color: #c1e8ff;
  padding: 6px 10px;
  font-size: 11px;
  font-family: inherit;
  outline: none;
}
.chat-input-row input:focus { border-color: #ffb000; }
.chat-input-row input::placeholder { color: rgba(255,255,255,0.1); }

/* ===== ACTION AREA ===== */
.action-area {
  display: flex; justify-content: center;
  padding: 32px 0;
}
.btn-start {
  background: #ffb000;
  color: #0a1628;
  padding: 14px 48px;
  font-weight: 700;
  font-size: 14px;
  letter-spacing: 3px;
  text-transform: uppercase;
  border: none;
  cursor: pointer;
  transition: background 0.15s, transform 0.1s, opacity 0.15s;
  font-family: inherit;
}
.btn-start:hover { background: #ffc840; }
.btn-start:active { transform: scale(0.96); }
.btn-start:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* ===== FOOTER ===== */
.footer {
  position: fixed; bottom: 0; left: 256px; right: 0;
  transition: left 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  background: rgba(2,9,17,0.92);
  border-top: 1px solid rgba(255,176,0,0.18);
  padding: 6px 24px;
  display: flex; justify-content: space-between; align-items: center;
  font-family: 'Fira Code', monospace;
  font-size: 10px;
  z-index: 50;
}
.footer-left span {
  color: #ffb000;
  font-weight: 700;
  letter-spacing: 2px;
  text-transform: uppercase;
}
.footer-right {
  display: flex; gap: 28px;
  letter-spacing: 2px;
  text-transform: uppercase;
}
.footer-right .good { color: rgba(122,236,255,0.8); }
.footer-right .muted { color: rgba(255,176,0,0.35); }

@media (max-width: 1024px) {
  .page-container { padding: 80px 20px 60px; }
  .footer { left: 0 !important; }
  .unit-grid { grid-template-columns: 1fr; }
  .room-info { flex-direction: column; }
}

</style>
