/**
 * AI难度分级系统
 * 定义不同难度的AI行为特征
 */

const { AI_DIFFICULTY } = require('./aiEngine.cjs');

/**
 * 难度配置
 */
const DIFFICULTY_CONFIG = {
  [AI_DIFFICULTY.EASY]: {
    name: '简单',
    description: '适合新手，AI行为可预测',
    // 决策延迟（毫秒）
    thinkDelay: 500,
    // 是否使用随机行动
    useRandomness: true,
    // 随机行动概率
    randomChance: 0.3,
    // 是否考虑敌人威胁
    considerThreats: false,
    // 攻击准确率
    accuracy: 0.7,
    // 是否使用技能
    useSkills: false,
    // 移动优化程度（0-1，越高越优）
    moveOptimization: 0.3,
    // 视野范围加成
    visionBonus: 0,
    // 伤害修正（AI造成的伤害倍率）
    damageMultiplier: 0.8,
    // 承受伤害修正（AI受到的伤害倍率）
    receivedDamageMultiplier: 1.2
  },
  [AI_DIFFICULTY.NORMAL]: {
    name: '普通',
    description: '标准难度，AI会做出合理决策',
    thinkDelay: 1000,
    useRandomness: true,
    randomChance: 0.15,
    considerThreats: true,
    accuracy: 0.85,
    useSkills: true,
    moveOptimization: 0.6,
    visionBonus: 1,
    damageMultiplier: 1.0,
    receivedDamageMultiplier: 1.0
  },
  [AI_DIFFICULTY.HARD]: {
    name: '困难',
    description: '高难度挑战，AI会做出最优决策',
    thinkDelay: 1500,
    useRandomness: false,
    randomChance: 0,
    considerThreats: true,
    accuracy: 0.95,
    useSkills: true,
    moveOptimization: 1.0,
    visionBonus: 2,
    damageMultiplier: 1.1,
    receivedDamageMultiplier: 0.9
  }
};

/**
 * 获取难度配置
 */
function getDifficultyConfig(difficulty) {
  return DIFFICULTY_CONFIG[difficulty] || DIFFICULTY_CONFIG[AI_DIFFICULTY.NORMAL];
}

/**
 * 获取所有难度列表
 */
function getAllDifficulties() {
  return Object.entries(DIFFICULTY_CONFIG).map(([key, config]) => ({
    id: key,
    name: config.name,
    description: config.description
  }));
}

/**
 * AI难度代理
 * 根据难度修改AI行为
 */
class AIDifficultyProxy {
  constructor(baseAI, difficulty) {
    this.baseAI = baseAI;
    this.config = getDifficultyConfig(difficulty);
    this.difficulty = difficulty;
  }

  /**
   * 应用随机性
   */
  applyRandomness(originalDecision) {
    if (!this.config.useRandomness) {
      return originalDecision;
    }

    if (Math.random() < this.config.randomChance) {
      // 随机决定是否随机行动
      const randomActions = ['move', 'attack', 'wait'];
      const randomAction = randomActions[Math.floor(Math.random() * randomActions.length)];
      
      return {
        ...originalDecision,
        type: randomAction,
        isRandom: true
      };
    }

    return originalDecision;
  }

  /**
   * 应用攻击准确率
   */
  applyAccuracy(target, gameState) {
    if (Math.random() > this.config.accuracy) {
      // 未命中，选择其他目标
      const unit = gameState.units?.find(u => u.id === target.id);
      if (unit) {
        // 随机偏移
        return {
          ...target,
          missed: true
        };
      }
    }
    return target;
  }

  /**
   * 应用伤害修正
   */
  applyDamage(damage, isReceiving) {
    const multiplier = isReceiving 
      ? this.config.receivedDamageMultiplier 
      : this.config.damageMultiplier;
    return Math.round(damage * multiplier);
  }

  /**
   * 获取视野加成
   */
  getVisionBonus() {
    return this.config.visionBonus;
  }

  /**
   * 获取移动优化程度
   */
  getMoveOptimization() {
    return this.config.moveOptimization;
  }

  /**
   * 是否应使用技能
   */
  shouldUseSkills() {
    return this.config.useSkills;
  }

  /**
   * 获取思考延迟
   */
  getThinkDelay() {
    return this.config.thinkDelay;
  }
}

/**
 * 难度比较
 */
function compareDifficulty(d1, d2) {
  const order = [AI_DIFFICULTY.EASY, AI_DIFFICULTY.NORMAL, AI_DIFFICULTY.HARD];
  return order.indexOf(d1) - order.indexOf(d2);
}

/**
 * 获取下一个难度
 */
function getNextDifficulty(current) {
  const order = [AI_DIFFICULTY.EASY, AI_DIFFICULTY.NORMAL, AI_DIFFICULTY.HARD];
  const idx = order.indexOf(current);
  return order[Math.min(idx + 1, order.length - 1)];
}

module.exports = {
  DIFFICULTY_CONFIG,
  getDifficultyConfig,
  getAllDifficulties,
  AIDifficultyProxy,
  compareDifficulty,
  getNextDifficulty
};
