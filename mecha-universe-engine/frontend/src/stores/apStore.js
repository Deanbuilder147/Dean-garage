// ===== Batch C-2: apStore（行动点视图）=====
// 从战斗态派生当前选中单位的 AP（行动点）状态，供行动面板置灰/徽标使用。
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useApStore = defineStore('ap', () => {
  const unitId = ref(null)
  const hasMoved = ref(false)
  const hasActed = ref(false)
  const hasDefended = ref(false)
  const standby = ref(false)
  const actionPoints = ref(null) // 原始 action_points 对象 {MOVE,ATTACK,DEFEND}

  const canMove = computed(() => !hasMoved.value && !standby.value)
  const canAttack = computed(() => !hasActed.value && !standby.value)
  const canDefend = computed(() => !hasDefended.value && !standby.value)

  function syncFromUnit(unit) {
    if (!unit) {
      unitId.value = null
      hasMoved.value = hasActed.value = hasDefended.value = standby.value = false
      actionPoints.value = null
      return
    }
    unitId.value = unit.unitId || unit.id
    hasMoved.value = !!unit.has_moved
    hasActed.value = !!unit.has_acted
    hasDefended.value = !!unit.has_defended
    standby.value = !!unit.standby
    actionPoints.value = unit.action_points || null
  }

  return { unitId, hasMoved, hasActed, hasDefended, standby, actionPoints, canMove, canAttack, canDefend, syncFromUnit }
})
