/**
 * diceService.cjs — 统一骰子服务（Phase 30-DiceUnify）
 *
 * 取代 Phase 4 废除 DiceEngine.cjs 后散落在各处的 7+ 处重复 rollDice 实现。
 * 设计原则：
 *   1. 本服务是「哑服务」——只负责产出裸点数，不解释任何业务语义。
 *      点数 → 倍率 / 加成 / 分支 / 成功的解释仍由各业务系统的配置表负责。
 *   2. 唯一解析入口：roll(expr) 同时支持
 *        - number（当作面数，如 6 → 掷 1 颗 6 面骰）
 *        - "NdM" 字符串（如 "2d6" → 掷 2 颗 6 面骰并累加）
 *      以此消除历史上三种签名（faces / diceType / diceStr）并存的分歧。
 *   3. 全局参数（投骰倍率梯度、暴击阈值/区间、可用骰面、手动摇骰默认）
 *      集中在 glossary-skill-config.json 的顶层 `dice` 段，运行时热读，
 *      前端「骰子工坊」页面可经 /api/combat/dice-config 实时调参。
 */

const { getGlossaryConfig } = require('./configLoader.cjs');

const DEFAULT_DICE_CONFIG = {
  // 投骰倍率梯度：索引 0..5 对应骰点 1..6
  rollMult: [0.6, 0.7, 0.8, 0.9, 1.0, 1.1],
  // 暴击：1d6 >= critThreshold 触发（线上 /attack 暂不消费，保留接口）
  critThreshold: 5,
  critMin: 0.8,
  critMax: 1.5,
  // 可用骰面（供 Glossary 下拉与手动摇骰可选）
  availableDiceTypes: [4, 6, 8, 10, 12, 20],
  // 手动摇骰默认参数
  manualRollDefault: { successLine: 4, bonusDamage: 0, enabled: false },
};

/**
 * 解析骰点表达式 → { count, sides }
 */
function parseDiceExpr(expr) {
  if (typeof expr === 'number' && !isNaN(expr)) {
    return { count: 1, sides: Math.max(1, Math.floor(expr)) };
  }
  const s = String(expr == null ? '1d6' : expr).trim().toLowerCase();
  const m = s.match(/^(\d*)d(\d+)$/);
  if (m) {
    const count = m[1] ? Math.max(1, parseInt(m[1], 10)) : 1;
    const sides = Math.max(1, parseInt(m[2], 10));
    return { count, sides };
  }
  const n = parseInt(s, 10);
  if (!isNaN(n) && n > 0) return { count: 1, sides: n };
  return { count: 1, sides: 6 };
}

function rollOnce(sides) {
  return Math.floor(Math.random() * sides) + 1;
}

/**
 * 将默认配置与磁盘/传入覆盖合并
 */
function mergeDiceConfig(def, over) {
  if (!over || typeof over !== 'object') return def;
  return {
    rollMult: Array.isArray(over.rollMult) && over.rollMult.length
      ? over.rollMult.map((v) => Number(v))
      : def.rollMult,
    critThreshold: typeof over.critThreshold === 'number' ? over.critThreshold : def.critThreshold,
    critMin: typeof over.critMin === 'number' ? over.critMin : def.critMin,
    critMax: typeof over.critMax === 'number' ? over.critMax : def.critMax,
    availableDiceTypes: Array.isArray(over.availableDiceTypes) && over.availableDiceTypes.length
      ? over.availableDiceTypes.map((v) => Number(v))
      : def.availableDiceTypes,
    manualRollDefault: {
      successLine:
        typeof over.manualRollDefault?.successLine === 'number'
          ? over.manualRollDefault.successLine
          : def.manualRollDefault.successLine,
      bonusDamage:
        typeof over.manualRollDefault?.bonusDamage === 'number'
          ? over.manualRollDefault.bonusDamage
          : def.manualRollDefault.bonusDamage,
      enabled:
        typeof over.manualRollDefault?.enabled === 'boolean'
          ? over.manualRollDefault.enabled
          : def.manualRollDefault.enabled,
    },
  };
}

class DiceService {
  /**
   * 全局参数（属性访问器）：每次访问实时合并默认与磁盘 glossary.dice，
   * 保证前端经 /api/combat/dice-config 保存后立即对新结算生效。
   */
  get config() {
    const def = JSON.parse(JSON.stringify(DEFAULT_DICE_CONFIG));
    try {
      const g = getGlossaryConfig();
      if (g && g.dice && typeof g.dice === 'object') {
        return mergeDiceConfig(def, g.dice);
      }
    } catch (e) {
      // 读取失败时回退默认，不影响战斗
    }
    return def;
  }

  getConfig() {
    return this.config;
  }

  /**
   * 统一掷骰入口：返回累加点数
   * @param {number|string} expr 面数(number) 或 "NdM" 字符串，默认 "1d6"
   * @returns {number}
   */
  roll(expr = '1d6') {
    const { count, sides } = parseDiceExpr(expr);
    let total = 0;
    for (let i = 0; i < count; i++) total += rollOnce(sides);
    return total;
  }

  /**
   * 返回每颗骰子的具体点数（用于显示/动画）
   * @returns {number[]}
   */
  rollDetails(expr = '1d6') {
    const { count, sides } = parseDiceExpr(expr);
    const out = [];
    for (let i = 0; i < count; i++) out.push(rollOnce(sides));
    return out;
  }

  /**
   * 多次掷同一表达式
   * @returns {number[]}
   */
  rollMany(expr, n) {
    const arr = [];
    const times = Math.max(1, Number(n) || 1);
    for (let i = 0; i < times; i++) arr.push(this.roll(expr));
    return arr;
  }

  /**
   * 掷骰并与阈值比较
   * @param {number|string} expr
   * @param {string} operator '>' | '>=' | '<' | '<=' | '=='
   * @param {number} threshold
   */
  check(expr, operator, threshold) {
    const v = this.roll(expr);
    switch (operator) {
      case '>': return v > threshold;
      case '>=': return v >= threshold;
      case '<': return v < threshold;
      case '<=': return v <= threshold;
      case '==': return v === threshold;
      default: return false;
    }
  }

  /**
   * 整数区间随机（替代裸 Math.random，用于暴击倍率等）
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  rangeInt(min, max) {
    const lo = Math.floor(min);
    const hi = Math.floor(max);
    if (hi < lo) return lo;
    return Math.floor(Math.random() * (hi - lo + 1)) + lo;
  }
}

// 单例：全进程共享同一份 config（combat.ts 与所有 .cjs 通过同一 require 缓存取到同一实例）
module.exports = new DiceService();
