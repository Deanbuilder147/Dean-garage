/**
 * 行为树系统
 * 定义AI决策逻辑的树形结构
 */

// 节点类型
const NODE_TYPE = {
  SELECTOR: 'selector',      // 选择器（返回成功或运行中）
  SEQUENCE: 'sequence',      // 序列器（全部成功才成功）
  PARALLEL: 'parallel',      // 并行（同时执行多个）
  CONDITION: 'condition',    // 条件检查
  ACTION: 'action'           // 动作执行
};

// 节点状态
const NODE_STATUS = {
  SUCCESS: 'success',
  FAILURE: 'failure',
  RUNNING: 'running'
};

/**
 * 基础节点类
 */
class BTNode {
  constructor(name, type) {
    this.name = name;
    this.type = type;
    this.status = null;
    this.children = [];
  }

  addChild(node) {
    this.children.push(node);
    return this;
  }

  async execute(context) {
    throw new Error('Must be implemented by subclass');
  }

  reset() {
    this.status = null;
    for (const child of this.children) {
      child.reset();
    }
  }
}

/**
 * 选择器节点
 * 按顺序执行子节点，直到某个成功
 */
class Selector extends BTNode {
  constructor(name) {
    super(name, NODE_TYPE.SELECTOR);
  }

  async execute(context) {
    for (const child of this.children) {
      const result = await child.execute(context);
      if (result === NODE_STATUS.SUCCESS) {
        this.status = NODE_STATUS.SUCCESS;
        return NODE_STATUS.SUCCESS;
      }
      if (result === NODE_STATUS.RUNNING) {
        this.status = NODE_STATUS.RUNNING;
        return NODE_STATUS.RUNNING;
      }
    }
    this.status = NODE_STATUS.FAILURE;
    return NODE_STATUS.FAILURE;
  }
}

/**
 * 序列器节点
 * 按顺序执行子节点，必须全部成功
 */
class Sequence extends BTNode {
  constructor(name) {
    super(name, NODE_TYPE.SEQUENCE);
  }

  async execute(context) {
    for (const child of this.children) {
      const result = await child.execute(context);
      if (result === NODE_STATUS.FAILURE) {
        this.status = NODE_STATUS.FAILURE;
        return NODE_STATUS.FAILURE;
      }
      if (result === NODE_STATUS.RUNNING) {
        this.status = NODE_STATUS.RUNNING;
        return NODE_STATUS.RUNNING;
      }
    }
    this.status = NODE_STATUS.SUCCESS;
    return NODE_STATUS.SUCCESS;
  }
}

/**
 * 条件节点
 * 检查条件是否满足
 */
class Condition extends BTNode {
  constructor(name, conditionFn) {
    super(name, NODE_TYPE.CONDITION);
    this.conditionFn = conditionFn;
  }

  async execute(context) {
    try {
      const result = await this.conditionFn(context);
      this.status = result ? NODE_STATUS.SUCCESS : NODE_STATUS.FAILURE;
      return this.status;
    } catch (error) {
      console.error(`Condition ${this.name} error:`, error);
      this.status = NODE_STATUS.FAILURE;
      return NODE_STATUS.FAILURE;
    }
  }
}

/**
 * 动作节点
 * 执行具体动作
 */
class Action extends BTNode {
  constructor(name, actionFn) {
    super(name, NODE_TYPE.ACTION);
    this.actionFn = actionFn;
  }

  async execute(context) {
    try {
      const result = await this.actionFn(context);
      this.status = result ? NODE_STATUS.SUCCESS : NODE_STATUS.FAILURE;
      return this.status;
    } catch (error) {
      console.error(`Action ${this.name} error:`, error);
      this.status = NODE_STATUS.FAILURE;
      return NODE_STATUS.FAILURE;
    }
  }
}

/**
 * 优先选择器
 * 根据优先级选择子节点执行
 */
class PrioritySelector extends BTNode {
  constructor(name, options = {}) {
    super(name, NODE_TYPE.SELECTOR);
    this.priorities = options.priorities || [];
  }

  async execute(context) {
    const sortedChildren = [...this.children].sort((a, b) => {
      const pA = this.priorities[this.children.indexOf(a)] || 0;
      const pB = this.priorities[this.children.indexOf(b)] || 0;
      return pB - pA;
    });

    for (const child of sortedChildren) {
      const result = await child.execute(context);
      if (result === NODE_STATUS.SUCCESS) {
        this.status = NODE_STATUS.SUCCESS;
        return NODE_STATUS.SUCCESS;
      }
      if (result === NODE_STATUS.RUNNING) {
        this.status = NODE_STATUS.RUNNING;
        return NODE_STATUS.RUNNING;
      }
    }
    this.status = NODE_STATUS.FAILURE;
    return NODE_STATUS.FAILURE;
  }
}

/**
 * 行为树
 */
class BehaviorTree {
  constructor(root, name = 'Root') {
    this.root = root;
    this.name = name;
  }

  async tick(context) {
    return await this.root.execute(context);
  }

  reset() {
    this.root.reset();
  }
}

// 工厂函数
const bt = {
  selector: (name) => new Selector(name),
  sequence: (name) => new Sequence(name),
  condition: (name, fn) => new Condition(name, fn),
  action: (name, fn) => new Action(name, fn),
  prioritySelector: (name, priorities) => new PrioritySelector(name, { priorities }),
  tree: (root, name) => new BehaviorTree(root, name)
};

module.exports = {
  bt,
  NODE_TYPE,
  NODE_STATUS,
  Selector,
  Sequence,
  Condition,
  Action,
  PrioritySelector,
  BehaviorTree
};
