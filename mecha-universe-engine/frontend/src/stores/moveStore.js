// ===== Batch C-2: moveStore（移动/路径视图）=====
// 维护当前单位的可达格、选中路径与移动预览，避免散落于组件局部状态。
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useMoveStore = defineStore('move', () => {
  const reachable = ref([])      // 可达六角格坐标数组
  const path = ref([])           // 当前选中路径
  const mode = ref(null)         // 'move' | 'attack' | null
  const animating = ref(false)   // 移动动画进行中（与 AnimationQueue 冻结联动）

  function setReachable(cells) { reachable.value = cells || [] }
  function setPath(p) { path.value = p || [] }
  function setMode(m) { mode.value = m }
  function setAnimating(v) { animating.value = v }

  function reset() {
    reachable.value = []
    path.value = []
    mode.value = null
    animating.value = false
  }

  return { reachable, path, mode, animating, setReachable, setPath, setMode, setAnimating, reset }
})
