import { reactive, watch } from 'vue'

// 战斗画布背景配置（颜色 + 背景图），跨视图共享、localStorage 持久化。
// 后台管理修改 → 战斗页实时读取，无需刷新。

const STORAGE_KEY = 'battleCanvasBg'
const DEFAULT = { color: '#061218', image: '' }

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT }
    const p = JSON.parse(raw)
    return { color: p.color || DEFAULT.color, image: p.image || '' }
  } catch {
    return { ...DEFAULT }
  }
}

// 模块级单例：同一 SPA 会话内所有视图共享同一份响应式状态
const bg = reactive(load())

watch(
  bg,
  (v) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(v))
    } catch (e) {
      // localStorage 容量受限（大图 dataURL 可能超限），静默失败
      console.warn('[battleCanvasBg] 保存失败', e)
    }
  },
  { deep: true }
)

export function useBattleCanvasBg() {
  function resetBg() {
    bg.color = DEFAULT.color
    bg.image = ''
  }
  return { bg, resetBg }
}
