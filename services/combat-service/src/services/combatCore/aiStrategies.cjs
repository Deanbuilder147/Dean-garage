/**
 * AI策略系统
 * 实现各种AI决策算法
 */

const { AI_DIFFICULTY } = require('./aiEngine.cjs');

// 六边形网格距离计算
function hexDistance(a, b) {
  return (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs((a.q + a.r) - (b.q + b.r))) / 2;
}

// 计算两点的曼哈顿距离（简化版）
function manhattanDistance(a, b) {
  return Math.abs(a.q - b.q) + Math.abs(a.r - b.r);
}

/**
 * AI策略基类
 */
class AIStrategy {
  constructor(aiEngine, difficulty) {
    this.aiEngine = aiEngine;
    this.difficulty = difficulty;
  }

  async decide(unitId, gameState) {
    throw new Error('Must be implemented by subclass');
  }
}

/**
 * 攻击型AI策略
 * 优先攻击敌人
 */
class AggressiveStrategy extends AIStrategy {
  async decide(unitId, gameState) {
    const unit = this.getUnit(unitId, gameState);
    if (!unit) return { type: 'wait' };

    const enemies = this.findEnemies(unit, gameState);
    const inRange = this.findEnemiesInRange(unit, enemies, gameState);

    // 如果有敌人可攻击
    if (inRange.length > 0) {
      const target = this.selectBestTarget(inRange, unit);
      return {
        type: 'attack',
        unitId,
        target,
        weaponIndex: 0
      };
    }

    // 寻找最近敌人并移动
    if (enemies.length > 0) {
      const nearest = this.findNearestEnemy(unit, enemies);
      const path = this.findPathToTarget(unit, nearest, gameState);
      if (path.length > 0) {
        return {
          type: 'move',
          unitId,
          target: path[0]
        };
      }
    }

    return { type: 'wait' };
  }

  getUnit(unitId, gameState) {
    return gameState.units?.find(u => u.id === unitId);
  }

  findEnemies(unit, gameState) {
    return (gameState.units || []).filter(u => u.faction !== unit.faction && u.hp > 0);
  }

  findEnemiesInRange(unit, enemies, gameState) {
    const range = unit.attack_range || 1;
    return enemies.filter(enemy => {
      const dist = manhattanDistance(unit.position, enemy.position);
      return dist <= range;
    });
  }

  selectBestTarget(enemies, attacker) {
    // 选择HP最低的目标（更容易击杀）
    return enemies.reduce((best, enemy) => {
      if (!best || enemy.hp < best.hp) return enemy;
      return best;
    }, null);
  }

  findNearestEnemy(unit, enemies) {
    return enemies.reduce((nearest, enemy) => {
      if (!nearest) return enemy;
      const distCurrent = manhattanDistance(unit.position, enemy.position);
      const distNearest = manhattanDistance(unit.position, nearest.position);
      return distCurrent < distNearest ? enemy : nearest;
    }, null);
  }

  findPathToTarget(unit, target, gameState) {
    // 简化的A*寻路
    const start = unit.position;
    const moveRange = unit.mobility || 3;
    const dist = manhattanDistance(start, target.position);
    
    if (dist <= moveRange) {
      // 直接移动到目标附近
      const dq = target.position.q - start.q;
      const dr = target.position.r - start.r;
      const stepQ = dq !== 0 ? Math.sign(dq) : 0;
      const stepR = dr !== 0 ? Math.sign(dr) : 0;
      return [{ q: start.q + stepQ, r: start.r + stepR }];
    }
    
    // 移动一定步数
    const dq = target.position.q - start.q;
    const dr = target.position.r - start.r;
    const stepQ = dq !== 0 ? Math.sign(dq) : 0;
    const stepR = dr !== 0 ? Math.sign(dr) : 0;
    const steps = Math.min(moveRange, Math.max(Math.abs(dq), Math.abs(dr)));
    return [{ q: start.q + stepQ * steps, r: start.r + stepR * steps }];
  }
}

/**
 * 防守型AI策略
 * 优先保护自己
 */
class DefensiveStrategy extends AIStrategy {
  async decide(unitId, gameState) {
    const unit = this.getUnit(unitId, gameState);
    if (!unit) return { type: 'wait' };

    // 如果HP低，优先撤退
    if (unit.hp < (unit.max_hp || 100) * 0.3) {
      const safeSpot = this.findSafeSpot(unit, gameState);
      if (safeSpot) {
        return { type: 'move', unitId, target: safeSpot };
      }
    }

    const enemies = this.findEnemies(unit, gameState);
    const inRange = this.findEnemiesInRange(unit, enemies, gameState);

    // 只有安全时才攻击
    if (inRange.length > 0 && unit.hp > (unit.max_hp || 100) * 0.5) {
      const target = this.selectLowestHP(inRange);
      return { type: 'attack', unitId, target, weaponIndex: 0 };
    }

    // 保持距离
    const tooClose = enemies.filter(e => manhattanDistance(unit.position, e.position) < 2);
    if (tooClose.length > 0) {
      const away = this.moveAwayFrom(unit, tooClose);
      if (away) {
        return { type: 'move', unitId, target: away };
      }
    }

    return { type: 'wait' };
  }

  getUnit(unitId, gameState) {
    return gameState.units?.find(u => u.id === unitId);
  }

  findEnemies(unit, gameState) {
    return (gameState.units || []).filter(u => u.faction !== unit.faction && u.hp > 0);
  }

  findEnemiesInRange(unit, enemies, gameState) {
    const range = unit.attack_range || 1;
    return enemies.filter(e => manhattanDistance(unit.position, e.position) <= range);
  }

  selectLowestHP(enemies) {
    return enemies.reduce((min, e) => e.hp < min.hp ? e : min, enemies[0]);
  }

  findSafeSpot(unit, gameState) {
    const allies = (gameState.units || []).filter(u => u.faction === unit.faction && u.id !== unit.id);
    
    // 移动到友军附近
    for (const ally of allies) {
      const dist = manhattanDistance(unit.position, ally.position);
      const moveRange = unit.mobility || 3;
      if (dist <= moveRange) {
        return { q: ally.position.q, r: ally.position.r };
      }
    }
    return null;
  }

  moveAwayFrom(unit, threats) {
    const threat = threats[0];
    const dq = unit.position.q - threat.position.q;
    const dr = unit.position.r - threat.position.r;
    const stepQ = dq !== 0 ? Math.sign(dq) : 0;
    const stepR = dr !== 0 ? Math.sign(dr) : 0;
    return { q: unit.position.q + stepQ, r: unit.position.r + stepR };
  }
}

/**
 * 平衡型AI策略
 * 攻防兼备
 */
class BalancedStrategy extends AIStrategy {
  async decide(unitId, gameState) {
    const unit = this.getUnit(unitId, gameState);
    if (!unit) return { type: 'wait' };

    const enemies = this.findEnemies(unit, gameState);
    const inRange = this.findEnemiesInRange(unit, enemies, gameState);

    // 优先攻击
    if (inRange.length > 0) {
      const target = this.selectBalancedTarget(inRange, unit);
      return { type: 'attack', unitId, target, weaponIndex: 0 };
    }

    // 寻找有价值的移动
    const target = this.findBestMoveTarget(unit, enemies, gameState);
    if (target) {
      return { type: 'move', unitId, target };
    }

    return { type: 'wait' };
  }

  getUnit(unitId, gameState) {
    return gameState.units?.find(u => u.id === unitId);
  }

  findEnemies(unit, gameState) {
    return (gameState.units || []).filter(u => u.faction !== unit.faction && u.hp > 0);
  }

  findEnemiesInRange(unit, enemies, gameState) {
    const range = unit.attack_range || 1;
    return enemies.filter(e => manhattanDistance(unit.position, e.position) <= range);
  }

  selectBalancedTarget(enemies, attacker) {
    // 优先攻击低HP目标，但也考虑自己的伤害
    return enemies.reduce((best, enemy) => {
      if (!best) return enemy;
      const scoreBest = best.hp / (attacker.attack || 10);
      const scoreEnemy = enemy.hp / (attacker.attack || 10);
      return scoreEnemy < scoreBest ? enemy : best;
    }, null);
  }

  findBestMoveTarget(unit, enemies, gameState) {
    const moveRange = unit.mobility || 3;
    const attackRange = unit.attack_range || 1;
    
    // 找到可以攻击到敌人的最近位置
    let bestTarget = null;
    let bestScore = Infinity;

    for (const enemy of enemies) {
      const dist = manhattanDistance(unit.position, enemy.position);
      if (dist <= moveRange + attackRange) {
        const movesNeeded = dist - attackRange;
        if (movesNeeded >= 0 && movesNeeded < bestScore) {
          bestScore = movesNeeded;
          const stepQ = enemy.position.q - unit.position.q;
          const stepR = enemy.position.r - unit.position.r;
          const sQ = stepQ !== 0 ? Math.sign(stepQ) : 0;
          const sR = stepR !== 0 ? Math.sign(stepR) : 0;
          bestTarget = { 
            q: unit.position.q + sQ * Math.min(moveRange, dist),
            r: unit.position.r + sR * Math.min(moveRange, dist)
          };
        }
      }
    }

    return bestTarget;
  }
}

/**
 * 策略工厂
 */
const STRATEGIES = {
  [AI_DIFFICULTY.EASY]: AggressiveStrategy,
  [AI_DIFFICULTY.NORMAL]: BalancedStrategy,
  [AI_DIFFICULTY.HARD]: BalancedStrategy
};

function createStrategy(aiEngine, difficulty) {
  const StrategyClass = STRATEGIES[difficulty] || BalancedStrategy;
  return new StrategyClass(aiEngine, difficulty);
}

module.exports = {
  AIStrategy,
  AggressiveStrategy,
  DefensiveStrategy,
  BalancedStrategy,
  createStrategy,
  hexDistance,
  manhattanDistance
};
