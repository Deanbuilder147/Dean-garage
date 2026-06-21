/**
 * TagChainManager - 词条链管理器
 *
 * 职责:
 * 1. 管理词条链（多个词条组合）
 * 2. 词条链的执行顺序控制
 * 3. 词条链的条件与冲突处理
 * 4. 词条链与战斗流程的集成
 */

const hookChain = require('./hookChain.cjs');
const { TagQueue } = require('./priorityQueue.cjs');

class TagChainManager {
  constructor() {
    // 活跃的词条链
    this.activeChains = new Map();

    // 词条链定义
    this.chains = new Map();

    // 冲突词条映射
    this.conflicts = new Map();

    // 组合词条映射
    this.combinations = new Map();

    // 执行统计
    this.stats = {
      triggered: 0,
      skipped: 0,
      conflicts: 0,
      byChain: {}
    };
  }

  /**
   * 定义词条链
   */
  defineChain(chainId, config) {
    this.chains.set(chainId, {
      id: chainId,
      name: config.name || chainId,
      tags: config.tags || [],  // 词条ID列表
      conditions: config.conditions || null,  // 链激活条件
      exclusive: config.exclusive || false,   // 是否独占（互斥）
      priority: config.priority || 0,
      description: config.description || ''
    });

    // 如果是独占链，建立冲突映射
    if (config.exclusive) {
      for (const tagId of config.tags) {
        if (!this.conflicts.has(tagId)) {
          this.conflicts.set(tagId, new Set());
        }
        for (const otherTagId of config.tags) {
          if (tagId !== otherTagId) {
            this.conflicts.get(tagId).add(otherTagId);
          }
        }
      }
    }

    return { success: true, chainId };
  }

  /**
   * 定义组合词条
   */
  defineCombination(comboId, config) {
    this.combinations.set(comboId, {
      id: comboId,
      name: config.name,
      requiredTags: config.requiredTags || [],
      bonusEffects: config.bonusEffects || [],
      bonusPriority: config.bonusPriority || 10,
      description: config.description
    });

    return { success: true, comboId };
  }

  /**
   * 激活词条链
   */
  activateChain(chainId, context) {
    const chain = this.chains.get(chainId);
    if (!chain) {
      return { success: false, reason: 'chain_not_found' };
    }

    // 检查链激活条件
    if (chain.conditions) {
      const conditionsMet = this.checkChainConditions(chain.conditions, context);
      if (!conditionsMet) {
        return { success: false, reason: 'conditions_not_met' };
      }
    }

    // 检查是否已激活
    if (this.activeChains.has(chainId)) {
      return { success: true, action: 'already_active', chainId };
    }

    // 检查独占冲突
    if (chain.exclusive) {
      const conflictingChain = this.findConflictingChain(chainId);
      if (conflictingChain) {
        return {
          success: false,
          reason: 'conflict',
          conflictingChain
        };
      }
    }

    // 激活链
    this.activeChains.set(chainId, {
      chain,
      activatedAt: Date.now(),
      context
    });

    // 更新统计
    if (!this.stats.byChain[chainId]) {
      this.stats.byChain[chainId] = { triggered: 0, skipped: 0 };
    }

    return { success: true, action: 'activated', chainId };
  }

  /**
   * 停用词条链
   */
  deactivateChain(chainId) {
    if (this.activeChains.has(chainId)) {
      this.activeChains.delete(chainId);
      return { success: true, chainId };
    }
    return { success: false, reason: 'not_active' };
  }

  /**
   * 检查链条件
   */
  checkChainConditions(conditions, context) {
    // 简化的条件检查
    if (conditions.phase && context.phase !== conditions.phase) {
      return false;
    }

    if (conditions.faction && context.unit?.faction !== conditions.faction) {
      return false;
    }

    if (conditions.minTags && context.tags?.length < conditions.minTags) {
      return false;
    }

    return true;
  }

  /**
   * 查找冲突链
   */
  findConflictingChain(chainId) {
    const chain = this.chains.get(chainId);
    if (!chain) return null;

    for (const [activeChainId] of this.activeChains) {
      const activeChain = this.chains.get(activeChainId);
      if (activeChain?.exclusive) {
        // 检查是否有共同的词条
        const hasCommonTag = chain.tags.some(tag => activeChain.tags.includes(tag));
        if (hasCommonTag) {
          return activeChainId;
        }
      }
    }

    return null;
  }

  /**
   * 检查词条冲突
   */
  checkConflicts(tagId) {
    const conflictingTags = this.conflicts.get(tagId);
    if (!conflictingTags) return [];

    return Array.from(conflictingTags).filter(conflictTagId => {
      // 检查是否有活跃链包含冲突词条
      for (const [, activeChain] of this.activeChains) {
        if (activeChain.chain.tags.includes(conflictTagId)) {
          return true;
        }
      }
      return false;
    });
  }

  /**
   * 检查组合词条
   */
  checkCombinations(unitTags) {
    const activeCombos = [];

    for (const [, combo] of this.combinations) {
      const hasAllTags = combo.requiredTags.every(tagId => unitTags.includes(tagId));
      if (hasAllTags) {
        activeCombos.push(combo);
      }
    }

    return activeCombos;
  }

  /**
   * 执行活跃词条链
   */
  async executeActiveChains(phase, context) {
    const results = [];

    for (const [chainId, activeChain] of this.activeChains) {
      // 获取链中的词条
      const chainTags = activeChain.chain.tags
        .map(tagId => hookChain.hooks[phase]?.find(h => h.tag.id === tagId))
        .filter(Boolean);

      if (chainTags.length === 0) continue;

      // 更新统计
      this.stats.byChain[chainId].triggered++;

      // 执行每个词条
      for (const chainTag of chainTags) {
        try {
          const result = await chainTag.handler(context);
          results.push({
            chainId,
            tagId: chainTag.tag.id,
            ...result
          });

          if (result.triggered) {
            this.stats.triggered++;
          } else {
            this.stats.skipped++;
          }
        } catch (error) {
          console.error(`[TagChain] 执行失败: ${chainTag.tag.id}`, error);
          results.push({
            chainId,
            tagId: chainTag.tag.id,
            triggered: false,
            error: error.message
          });
        }
      }
    }

    return results;
  }

  /**
   * 获取活跃链的词条队列
   */
  getActiveTagQueue(phase) {
    const queue = new TagQueue();

    for (const [chainId, activeChain] of this.activeChains) {
      for (const tagId of activeChain.chain.tags) {
        const tag = hookChain.hooks[phase]?.find(h => h.tag.id === tagId);
        if (tag) {
          queue.enqueueTag(tag.tag, { chainId });
        }
      }
    }

    return queue;
  }

  /**
   * 获取链摘要
   */
  getChainSummary(chainId) {
    const chain = this.chains.get(chainId);
    if (!chain) return null;

    const isActive = this.activeChains.has(chainId);
    const activeInfo = isActive ? this.activeChains.get(chainId) : null;

    return {
      ...chain,
      isActive,
      activatedAt: activeInfo?.activatedAt,
      stats: this.stats.byChain[chainId] || { triggered: 0, skipped: 0 }
    };
  }

  /**
   * 获取所有链摘要
   */
  getAllChainSummaries() {
    return Array.from(this.chains.keys()).map(chainId =>
      this.getChainSummary(chainId)
    );
  }

  /**
   * 获取活跃链列表
   */
  getActiveChains() {
    return Array.from(this.activeChains.entries()).map(([id, info]) => ({
      id,
      ...info.chain,
      activatedAt: info.activatedAt
    }));
  }

  /**
   * 获取执行统计
   */
  getStats() {
    return {
      ...this.stats,
      activeChains: this.activeChains.size,
      totalChains: this.chains.size
    };
  }

  /**
   * 重置统计
   */
  resetStats() {
    this.stats = {
      triggered: 0,
      skipped: 0,
      conflicts: 0,
      byChain: {}
    };
    return true;
  }

  /**
   * 停用所有链
   */
  deactivateAll() {
    const count = this.activeChains.size;
    this.activeChains.clear();
    return { deactivated: count };
  }

  /**
   * 清理链定义
   */
  clear() {
    this.chains.clear();
    this.activeChains.clear();
    this.conflicts.clear();
    this.combinations.clear();
    return true;
  }
}

// 单例导出
module.exports = new TagChainManager();
