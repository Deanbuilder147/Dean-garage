/**
 * DiceEngine - 海豹骰子 dicescript 适配层
 * 封装 dicescript VM，提供简化的骰子掷骰和判定 API
 * 默认骰子面数为 6（1d6），与机甲战棋游戏机制一致
 */

const dicescript = require('../../../vendor/dicescript.cjs').ds;

class DiceEngine {
    constructor() {
        this._initVM();
    }

    _initVM() {
        this._vm = dicescript.newVM();
        this._config = dicescript.newConfig();
        this._config.EnableDice = true;
        this._vm.SetConfig(this._config);
    }

    /**
     * 掷骰：执行骰子表达式并直接返回数值
     * @param {string} formula - 骰子表达式，如 "1d6", "2d6", "1d6+3"
     * @returns {number} 掷骰结果
     */
    roll(formula = '1d6') {
        this._vm.Run(formula);
        return this._vm.Ret.Value;
    }

    /**
     * 逐个掷骰：返回每个骰子的具体点数（用于显示）
     * @param {string} formula - 基础骰子表达式，如 "1d6", "2d6"
     * @returns {number[]} 各骰子点数数组
     */
    rollDetails(formula = '1d6') {
        const match = formula.match(/^(\d*)d(\d+)/);
        if (!match) {
            return [this.roll(formula)];
        }

        const count = parseInt(match[1] || '1', 10);
        const faces = parseInt(match[2], 10);
        const rolls = [];

        for (let i = 0; i < count; i++) {
            this._vm.Run(`1d${faces}`);
            rolls.push(this._vm.Ret.Value);
        }
        return rolls;
    }

    /**
     * 判定：掷骰并判断是否满足条件
     * @param {string} formula - 骰子表达式
     * @param {string} operator - 比较运算符: '>=', '<=', '>', '<', '=='
     * @param {number} threshold - 判定阈值
     * @returns {boolean} 判定结果
     */
    check(formula, operator, threshold) {
        const value = this.roll(formula);
        switch (operator) {
            case '>=': return value >= threshold;
            case '<=': return value <= threshold;
            case '>':  return value > threshold;
            case '<':  return value < threshold;
            case '==': return value === threshold;
            default:   return value >= threshold;
        }
    }

    /**
     * 批量掷骰：多次掷同一表达式
     * @param {string} formula - 骰子表达式
     * @param {number} count - 掷骰次数
     * @returns {number[]} 每次掷骰的结果
     */
    rollMultiple(formula, count) {
        const results = [];
        for (let i = 0; i < count; i++) {
            results.push(this.roll(formula));
        }
        return results;
    }

    /**
     * 重置 VM 状态（用于新一回合，换种子等）
     */
    reset() {
        this._initVM();
    }
}

// 导出类和默认单例
const defaultEngine = new DiceEngine();

module.exports = {
    DiceEngine,
    defaultEngine
};
