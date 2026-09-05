// ================================================================
// battle/useBattleState.js
// 移动端战斗状态组合式：拉取 + 规范化 + 实时同步（WebSocket 或轮询）
// 供 MobileBattleView 复用，与 PC 版 NewBattleView 共用同一套数据契约。
// ================================================================
import { ref, computed, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { combatAPI } from '../api/client.js'
import { normalizeBattleState } from './normalizeBattle.js'
import { connectBattleSocket, disconnectBattleSocket } from '../utils/battleSocket.js'
import { useUserStore } from '../stores/user.js'

/**
 * @param {object} opts
 * @param {string} [opts.battleId] 不传则取当前路由 params.id
 * @param {boolean} [opts.useSocket=true] 是否连接 WebSocket 实时同步
 */
export function useBattleState(opts = {}) {
  const route = useRoute()
  const battleId = opts.battleId || route.params.id
  const userStore = useUserStore()

  const battleState = ref(null)
  const loading = ref(true)
  const error = ref('')
  const lastSyncedAt = ref(0)

  const allUnits = computed(() => {
    const s = battleState.value
    if (!s || !s.units) return []
    return Array.isArray(s.units) ? s.units : Object.values(s.units)
  })

  const myFaction = computed(() => {
    const f = userStore.user?.faction
    if (f) return f
    const myId = userStore.user?.id
    if (!myId) return null
    const mine = allUnits.value.find(u => String(u.ownerId) === String(myId))
    return mine?.faction || null
  })

  // 行动阵营 / 回合信息
  const turnInfo = computed(() => ({
    turn: battleState.value?.turn ?? 0,
    round: battleState.value?.round ?? 0,
    activeFaction: battleState.value?.activeFaction ?? null,
    phase: battleState.value?.phase ?? 'battle',
    isMyTurn: battleState.value?.activeFaction === myFaction.value,
  }))

  async function refresh() {
    if (!battleId) return
    try {
      const { data } = await combatAPI.getBattleState(battleId)
      const raw = data.battle || data
      battleState.value = normalizeBattleState(raw)
      if (raw.factionRoles) factionRoles.value = raw.factionRoles
      lastSyncedAt.value = Date.now()
    } catch (e) {
      error.value = e?.message || '拉取战局失败'
    } finally {
      loading.value = false
    }
  }

  // factionRoles 透传（部分 UI 需要）
  const factionRoles = ref(battleState.value?.factionRoles || {})

  let pollTimer = null
  function startPolling(interval = 2000) {
    stopPolling()
    pollTimer = setInterval(refresh, interval)
  }
  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
  }

  function connect() {
    if (!opts.useSocket) { startPolling(); return }
    const token = localStorage.getItem('token')
    connectBattleSocket({
      battleId,
      token,
      faction: myFaction.value,
      role: 'attack',
      onConnect: refresh, // 重连后强制刷新全量态
      onState: (payload) => {
        // WS 推送全量/增量态，统一经规范化入口
        const raw = payload?.battle || payload
        if (raw) {
          battleState.value = normalizeBattleState(raw)
          if (raw.factionRoles) factionRoles.value = raw.factionRoles
          lastSyncedAt.value = Date.now()
        }
      },
    })
  }

  // 初始化
  refresh().then(() => { if (opts.useSocket !== false) connect() })

  onUnmounted(() => {
    stopPolling()
    disconnectBattleSocket()
  })

  return {
    battleId,
    battleState,
    allUnits,
    myFaction,
    turnInfo,
    loading,
    error,
    factionRoles,
    refresh,
    startPolling,
    stopPolling,
    connect,
  }
}
