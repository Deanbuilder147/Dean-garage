// ===== Batch C-3: Animation Queue（状态冻结 + 事件排队防撕裂）=====
// 问题：comm 实时推送可能在短时间内高频到达（移动伏击/反应奇袭结算等多事件叠加），
// 直接多次调用 refreshState 会撕裂 UI（单位瞬移、面板闪烁、竞态）。
// 方案：所有状态刷新经此队列串行化，同一 key 的待处理任务去重合并（仅保留最新），
// 并支持"状态冻结"（动画播放期间暂停消费，动画结束再 flush）。

const pending = new Map() // key -> task(fn)
let running = false
let frozen = false
const waiters = []

/**
 * 入队一个状态刷新任务
 * @param {string} key 任务键（相同 key 合并，仅保留最后一次）
 * @param {Function} task 执行函数（通常为 refreshState）
 */
export function enqueueState(key, task) {
  pending.set(key, task)
  if (!running && !frozen) runNext()
}

/** 冻结消费（动画播放期间调用，防止推送撕裂动画）*/
export function freezeQueue() {
  frozen = true
}

/** 解冻并消费积压任务 */
export function unfreezeQueue() {
  frozen = false
  if (!running) runNext()
}

export function isQueueFrozen() {
  return frozen
}

function runNext() {
  if (pending.size === 0) {
    running = false
    return
  }
  if (frozen) {
    running = false
    return
  }
  running = true
  // 取出所有待处理任务（合并后同一 key 仅一次），依次执行
  const tasks = Array.from(pending.values())
  pending.clear()
  let i = 0
  const step = () => {
    if (i >= tasks.length) {
      // 一轮结束，若期间又有新任务则继续
      if (pending.size > 0 && !frozen) {
        runNext()
      } else {
        running = false
      }
      return
    }
    const t = tasks[i++]
    Promise.resolve()
      .then(() => t())
      .catch((e) => console.warn('[AnimationQueue] 任务执行失败:', e?.message || e))
      .finally(() => {
        // 让出一帧，避免高频刷新导致主线程卡死与 UI 抖动
        setTimeout(step, 16)
      })
  }
  step()
}
