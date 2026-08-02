// ===== Batch C-2: logStore（战报缓冲）=====
// 接收推送流携带的 combatLog[] 缓冲（P8），供战报面板统一消费，避免组件各自轮询。
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useLogStore = defineStore('log', () => {
  const logs = ref([])           // 战报条目数组
  const unread = ref(0)          // 未读条数（红点用）

  function setLogs(list) {
    logs.value = Array.isArray(list) ? list : []
    unread.value = 0
  }
  function append(log) {
    if (!log) return
    logs.value.push(log)
    unread.value += 1
  }
  function markRead() { unread.value = 0 }

  return { logs, unread, setLogs, append, markRead }
})
