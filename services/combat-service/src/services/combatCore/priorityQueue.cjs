/**
 * PriorityQueue - 优先级队列
 *
 * 职责:
 * 1. 按优先级自动排序元素
 * 2. 支持相同优先级的FIFO顺序
 * 3. 支持队列操作（入队、出队、查看、删除）
 * 4. 支持优先级更新
 */

class PriorityQueue {
  constructor(options = {}) {
    this.maxSize = options.maxSize || Infinity;
    this.compareFn = options.compareFn || ((a, b) => b.priority - a.priority);
    this.items = [];
  }

  /**
   * 获取队列大小
   */
  get size() {
    return this.items.length;
  }

  /**
   * 检查队列是否为空
   */
  get isEmpty() {
    return this.items.length === 0;
  }

  /**
   * 检查队列是否已满
   */
  get isFull() {
    return this.items.length >= this.maxSize;
  }

  /**
   * 入队
   */
  enqueue(item, priority = 0) {
    if (this.isFull) {
      return { success: false, reason: 'queue_full' };
    }

    const element = {
      data: item,
      priority,
      id: item.id || `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      enqueuedAt: Date.now()
    };

    // 二分查找插入位置
    let low = 0;
    let high = this.items.length;

    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (this.compareFn(this.items[mid], element) <= 0) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }

    this.items.splice(low, 0, element);

    return { success: true, element };
  }

  /**
   * 出队（最高优先级）
   */
  dequeue() {
    if (this.isEmpty) {
      return { success: false, reason: 'queue_empty' };
    }

    const element = this.items.shift();
    return { success: true, element };
  }

  /**
   * 查看队首（不移除）
   */
  peek() {
    if (this.isEmpty) {
      return { success: false, reason: 'queue_empty' };
    }

    return { success: true, element: this.items[0] };
  }

  /**
   * 查看队尾
   */
  peekLast() {
    if (this.isEmpty) {
      return { success: false, reason: 'queue_empty' };
    }

    return { success: true, element: this.items[this.items.length - 1] };
  }

  /**
   * 按ID移除元素
   */
  remove(id) {
    const index = this.items.findIndex(item => item.id === id);
    if (index === -1) {
      return { success: false, reason: 'not_found' };
    }

    const removed = this.items.splice(index, 1)[0];
    return { success: true, removed };
  }

  /**
   * 更新元素优先级
   */
  updatePriority(id, newPriority) {
    const index = this.items.findIndex(item => item.id === id);
    if (index === -1) {
      return { success: false, reason: 'not_found' };
    }

    // 移除旧位置
    const element = this.items.splice(index, 1)[0];
    element.priority = newPriority;

    // 重新插入正确位置
    let low = 0;
    let high = this.items.length;

    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (this.compareFn(this.items[mid], element) <= 0) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }

    this.items.splice(low, 0, element);

    return { success: true, element };
  }

  /**
   * 清空队列
   */
  clear() {
    this.items = [];
    return true;
  }

  /**
   * 获取所有元素（按优先级排序）
   */
  toArray() {
    return this.items.map(item => item.data);
  }

  /**
   * 批量入队
   */
  enqueueBatch(items, defaultPriority = 0) {
    const results = [];
    for (const item of items) {
      results.push(this.enqueue(item, defaultPriority));
    }
    return results;
  }

  /**
   * 获取指定优先级的所有元素
   */
  getByPriority(priority) {
    return this.items
      .filter(item => item.priority === priority)
      .map(item => item.data);
  }

  /**
   * 获取优先级范围
   */
  getPriorityRange(min, max) {
    return this.items
      .filter(item => item.priority >= min && item.priority <= max)
      .map(item => item.data);
  }

  /**
   * 获取队列摘要
   */
  getSummary() {
    return {
      size: this.size,
      isFull: this.isFull,
      isEmpty: this.isEmpty,
      maxSize: this.maxSize,
      priorities: [...new Set(this.items.map(item => item.priority))].sort((a, b) => b - a)
    };
  }

  /**
   * 过滤队列
   */
  filter(fn) {
    const filtered = this.items.filter(item => fn(item.data, item));
    return filtered.map(item => item.data);
  }

  /**
   * 查找元素
   */
  find(fn) {
    const found = this.items.find(item => fn(item.data, item));
    return found ? found.data : null;
  }

  /**
   * 检查是否存在
   */
  contains(id) {
    return this.items.some(item => item.id === id);
  }

  /**
   * 迭代器
   */
  *[Symbol.iterator]() {
    for (const item of this.items) {
      yield item.data;
    }
  }
}

/**
 * TagQueue - 词条专用优先级队列
 */
class TagQueue extends PriorityQueue {
  constructor() {
    super({
      compareFn: (a, b) => {
        // 先按优先级降序
        if (b.priority !== a.priority) {
          return b.priority - a.priority;
        }
        // 同优先级按时间升序（先触发的先执行）
        return a.enqueuedAt - b.enqueuedAt;
      }
    });
  }

  /**
   * 入队词条
   */
  enqueueTag(tag, context = {}) {
    return this.enqueue({
      ...tag,
      context
    }, tag.params?.priority || 0);
  }

  /**
   * 获取所有待触发词条
   */
  getPendingTags() {
    return this.toArray();
  }

  /**
   * 按阶段获取词条
   */
  getByPhase(phase) {
    return this.filter(tag => tag.trigger?.phase === phase);
  }
}

/**
 * ActionQueue - 战斗行动队列
 */
class ActionQueue extends PriorityQueue {
  constructor() {
    super({
      compareFn: (a, b) => {
        // 高优先级行动先执行
        if (b.priority !== a.priority) {
          return b.priority - a.priority;
        }
        // 同优先级按时间戳
        return a.timestamp - b.timestamp;
      }
    });
  }

  /**
   * 入队行动
   */
  enqueueAction(action) {
    return this.enqueue({
      ...action,
      timestamp: Date.now()
    }, action.priority || 0);
  }

  /**
   * 获取所有待执行行动
   */
  getPendingActions() {
    return this.toArray();
  }
}

module.exports = {
  PriorityQueue,
  TagQueue,
  ActionQueue
};
