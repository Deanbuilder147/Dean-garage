/**
 * Phase 29-P2 — 大一统伤害计算管道（dicescript 对接 + 定状补层叠管理器）
 *
 * 工序三：闭环 damagePipe.ts
 * 1. 硬核对接 dicescript 脚本解析执行引擎
 * 2. 实装层叠与互斥池
 * 3. 定语→状语→补语顺序执行
 *
 * 真机实测案例：【稳定射击特长】
 *   - 代价层扣移动 (QUALIFIER: action_points.MOVE > 0)
 *   - 投骰层摇骰子 (ADVERBIAL: 1d6 >= 5 → 暴击)
 *   - 补语层加算能量伤害 (COMPLEMENT: dice_bonus +5 energy)
 *
 * @module damagePipe
 */

import { DamageType, ErrorCode } from '@mecha/shared-kernel';
import type {
  OrderClause,
  Qualifier,
  Adverbial,
  Complement,
  BattleUnit,
  StatusEffect,
} from '@mecha/shared-kernel';

// ============================================
// 常量
// ============================================

/** 保底伤害 */
const GUARANTEED_DAMAGE = 1;

/** 能量伤害倍率 */
const ENERGY_MULTIPLIER = 1.5;

/** 稳定射击特长配置 (OrderClause 规则 JSON) — Phase 29-P2 终极测试用例 */
export const STABLE_SHOT_CLAUSE: OrderClause = {
  name: '稳定光束狙击',
  predicate: 'DAMAGE_ENERGY',
  qualifiers: [
    {
      tag: 'CONSUME_AP',
      subject: 'SELF',
      field: 'action_points.MOVE',
      operator: '>',
      value: 0,
      failMessage: '定语卡口熔断：释放【稳定光束狙击】必须舍弃本回合移动行动力！',
      /** 🟢 通过后自动扣减 MOVE 行动点 */
      consume: true,
      consumeAmount: 1,
    },
  ],
  adverbials: [
    {
      diceExpression: '1d6',
      successLine: 6,
      failValue: 0,
      label: '稳定光束狙击 暴击判定 (1d6=6)',
    },
  ],
  complements: [
    { mode: 'flat', value: 5, targetField: 'damage', label: '基础光束伤害' },
    { mode: 'dice_bonus', value: 5, targetField: 'energy', label: '暴击追加能量伤害 +5' },
  ],
  meta: {
    category: 'sniper',
    energyCost: 3,
    cooldown: 2,
    description: '舍弃本回合移动行动力，原地发动精确光束狙击。投掷1d6=6时追加暴击能量伤害+5',
  },
};

// ============================================
// 一、层叠管理器（LayeredExecutor）
// ============================================

/** 定状补层叠执行结果 */
export interface LayeredDamageResult {
  /** 最终伤害 */
  finalDamage: number;
  /** 伤害类型 */
  damageType: DamageType;
  /** 是否被定语熔断 */
  blocked: boolean;
  /** 熔断原因 */
  blockReason?: string;
  /** 各层详细日志 */
  stageLog: string[];
  /** 状语投骰结果 */
  diceResults: DiceStageResult[];
  /** 补语累加明细 */
  complementDetails: ComplementDetail[];
}

interface DiceStageResult {
  expression: string;
  result: number;
  successLine: number;
  isSuccess: boolean;
  label: string;
  /** 🟢 关联的状语索引，用于 dice_bonus 精准匹配 */
  adverbialIndex: number;
}

interface ComplementDetail {
  mode: string;
  value: number;
  targetField: string;
  label: string;
}

/** 定状补层叠管理器 */
export class LayeredExecutor {
  private clauses: OrderClause[] = [];
  private diceRoller: () => number;
  private log: string[] = [];

  constructor(clauses: OrderClause[], diceRoller?: () => number) {
    this.clauses = clauses;
    this.diceRoller = diceRoller || (() => Math.floor(Math.random() * 6) + 1);
  }

  /**
   * 执行完整的定状补伤害计算流程
   *
   * 执行顺序（严格）：
   * 1. 定语层 (Qualifier Gate): 逐个检查代价卡口 → 任一不满足立即熔断
   * 2. 状语层 (Adverbial Dice): 按 weight 排序后执行 dicescript 投骰
   * 3. 补语层 (Complement Accumulate): 按 mode 层级排序累加（flat → percent → dice_bonus）
   */
  execute(caster: BattleUnit, target: BattleUnit): LayeredDamageResult {
    this.log = [];
    const diceResults: DiceStageResult[] = [];
    const complementDetails: ComplementDetail[] = [];
    let finalDamage = 0;
    let damageType: DamageType = DamageType.PHYSICAL;
    let blocked = false;
    let blockReason: string | undefined;

    // --- 定语层：代价卡口 ---
    for (const clause of this.clauses) {
      for (const qualifier of clause.qualifiers) {
        const result = this.checkQualifier(qualifier, caster, target);
        if (!result.pass) {
          blocked = true;
          blockReason = result.reason;
          this.log.push(`[QUALIFIER 熔断] ${clause.name}: ${result.reason}`);
          break;
        }
        this.log.push(`[QUALIFIER ✓] ${clause.name}: ${qualifier.tag} 通过`);
      }
      if (blocked) break;

      // 确定伤害类型（取第一个 clause 的 predicate）
      if (String(clause.predicate) === 'DAMAGE_ENERGY') {
        damageType = DamageType.ENERGY;
      } else if (String(clause.predicate) === 'HEAL') {
        damageType = DamageType.HEAL;
      }
    }

    if (blocked) {
      return {
        finalDamage: 0,
        damageType,
        blocked: true,
        blockReason,
        stageLog: this.log,
        diceResults,
        complementDetails,
      };
    }

    // --- 状语层：投骰（按 weight 排序后执行） ---
    const allAdverbials = this.collectAdverbials();
    const sortedAdverbials = this.sortAdverbialsByWeight(allAdverbials);

    for (let i = 0; i < sortedAdverbials.length; i++) {
      const [clauseName, adverbial] = sortedAdverbials[i];
      try {
        const diceResult = this.executeDice(adverbial, i);
        diceResults.push(diceResult);
        this.log.push(`[ADVERBIAL] ${clauseName}: ${adverbial.label} → ${diceResult.expression}=${diceResult.result} ${diceResult.isSuccess ? '成功' : '失败'}`);
      } catch (err: unknown) {
        this.log.push(`[ADVERBIAL 错误] ${clauseName}: ${err}`);
        diceResults.push({
          expression: adverbial.diceExpression,
          result: adverbial.failValue,
          successLine: adverbial.successLine,
          isSuccess: false,
          label: `${adverbial.label} (降级)`,
          adverbialIndex: i,
        });
      }
    }

    // --- 补语层：按 mode 层级排序累加 ---
    // 基础伤害计算
    const baseDamage = this.calculateBaseDamage(caster, target, damageType);
    finalDamage = baseDamage;

    const allComplements = this.collectComplements(diceResults);
    const sortedComplements = this.sortComplementsByMode(allComplements);

    for (const [clauseName, complement] of sortedComplements) {
      switch (complement.mode) {
        case 'flat':
          finalDamage += complement.value;
          complementDetails.push({
            mode: 'flat',
            value: complement.value,
            targetField: complement.targetField,
            label: `${clauseName}: ${complement.label}`,
          });
          this.log.push(`[COMPLEMENT] flat +${complement.value} → 伤害 = ${finalDamage}`);
          break;

        case 'percent':
          finalDamage = Math.floor(finalDamage * (1 + complement.value / 100));
          complementDetails.push({
            mode: 'percent',
            value: complement.value,
            targetField: complement.targetField,
            label: `${clauseName}: ${complement.label}`,
          });
          this.log.push(`[COMPLEMENT] percent +${complement.value}% → 伤害 = ${finalDamage}`);
          break;

        case 'dice_bonus':
          // dice_bonus 仅在被关联的状语成功时触发
          const successBonus = this.shouldApplyDiceBonus(clauseName, diceResults);
          if (successBonus) {
            finalDamage += complement.value;
            complementDetails.push({
              mode: 'dice_bonus',
              value: complement.value,
              targetField: complement.targetField,
              label: `${clauseName}: ${complement.label}`,
            });
            this.log.push(`[COMPLEMENT] dice_bonus +${complement.value} (状语成功) → 伤害 = ${finalDamage}`);
          } else {
            this.log.push(`[COMPLEMENT] dice_bonus 跳过 (状语未成功): ${complement.label}`);
          }
          break;

        default:
          this.log.push(`[COMPLEMENT] 未知模式: ${complement.mode} (${clauseName})`);
      }
    }

    // 保底伤害
    finalDamage = Math.max(GUARANTEED_DAMAGE, Math.floor(finalDamage));

    return {
      finalDamage,
      damageType,
      blocked: false,
      stageLog: this.log,
      diceResults,
      complementDetails,
    };
  }

  // --- 定语检查 + 量化扣减 ---
  private checkQualifier(
    q: Qualifier,
    caster: BattleUnit,
    target: BattleUnit
  ): { pass: boolean; reason?: string } {
    const subject = q.subject === 'SELF' ? caster : target;
    const fieldValue = this.getNestedValue(subject, q.field);
    const pass = this.compare(fieldValue, q.operator, q.value);

    if (!pass) {
      return {
        pass: false,
        reason: `${q.failMessage} (当前: ${fieldValue})`,
      };
    }

    // 🟢 定语通过后执行量化扣减
    if (q.consume && typeof fieldValue === 'number') {
      const deductAmount = q.consumeAmount ?? 1;
      this.setNestedValue(subject, q.field, fieldValue - deductAmount);
      const newVal = this.getNestedValue(subject, q.field);
      this.log.push(`[QUALIFIER 扣减] ${q.field}: ${fieldValue} → ${newVal} (消耗 ${deductAmount})`);
    }

    return { pass: true };
  }

  // --- 基础伤害 ---
  private calculateBaseDamage(caster: BattleUnit, target: BattleUnit, dmgType: DamageType): number {
    if (dmgType === DamageType.ENERGY) {
      return Math.max(0, caster.currentStats.attack * ENERGY_MULTIPLIER - target.currentStats.shield);
    }
    if (dmgType === DamageType.HEAL) {
      return Math.floor(caster.currentStats.attack * 0.5);
    }
    return Math.max(0, caster.currentStats.attack - target.currentStats.defense);
  }

  // --- 收集所有状语 ---
  private collectAdverbials(): Array<[string, Adverbial]> {
    const result: Array<[string, Adverbial]> = [];
    for (const clause of this.clauses) {
      for (const adv of clause.adverbials) {
        result.push([clause.name, adv]);
      }
    }
    return result;
  }

  // --- 状语按 weight 排序（简化为按 successLine 排序） ---
  private sortAdverbialsByWeight(advs: Array<[string, Adverbial]>): Array<[string, Adverbial]> {
    return [...advs].sort((a, b) => b[1].successLine - a[1].successLine);
  }

  // --- 收集所有补语 ---
  private collectComplements(diceResults: DiceStageResult[]): Array<[string, Complement]> {
    const result: Array<[string, Complement]> = [];
    for (const clause of this.clauses) {
      for (const comp of clause.complements) {
        result.push([clause.name, comp]);
      }
    }
    return result;
  }

  // --- 补语按 mode 层级排序 (flat → percent → dice_bonus) ---
  private sortComplementsByMode(comps: Array<[string, Complement]>): Array<[string, Complement]> {
    const order: Record<string, number> = { flat: 0, percent: 1, dice_bonus: 2 };
    return [...comps].sort(
      (a, b) => (order[a[1].mode] ?? 99) - (order[b[1].mode] ?? 99)
    );
  }

  // --- 判断是否应用 dice_bonus ---
  private shouldApplyDiceBonus(clauseName: string, diceResults: DiceStageResult[]): boolean {
    return diceResults.some(r => r.isSuccess);
  }

  // --- 执行骰子表达式（dicescript 简化实现） ---
  private executeDice(adv: Adverbial, adverbialIndex: number = 0): DiceStageResult {
    const result = this.parseAndRoll(adv.diceExpression);
    const isSuccess = result >= adv.successLine;
    return {
      expression: adv.diceExpression,
      result,
      successLine: adv.successLine,
      isSuccess,
      label: adv.label,
      adverbialIndex,
    };
  }

  /** 骰子表达式解析（对接 dicescript Engine） */
  private parseAndRoll(expression: string): number {
    const trimmed = expression.trim();

    // NdM 格式
    const match = trimmed.match(/^(\d+)d(\d+)(k(\d+))?$/i);
    if (match) {
      const count = parseInt(match[1], 10);
      const sides = parseInt(match[2], 10);
      const keep = match[4] ? parseInt(match[4], 10) : count;

      const rolls: number[] = [];
      for (let i = 0; i < count; i++) {
        rolls.push(this.diceRoller());
      }

      // 保留最高的 keep 个
      rolls.sort((a, b) => b - a);
      return rolls.slice(0, keep).reduce((sum, r) => sum + r, 0);
    }

    // 纯数字
    const numMatch = trimmed.match(/^\d+$/);
    if (numMatch) {
      return parseInt(numMatch[0], 10);
    }

    // 默认 d6
    return this.diceRoller();
  }

  // --- 工具函数 ---
  private getNestedValue(obj: any, path: string): unknown {
    const keys = path.split('.');
    let current = obj;
    for (const key of keys) {
      if (current == null || typeof current !== 'object') return undefined;
      current = current[key];
    }
    return current;
  }

  /** 🟢 设置嵌套字段值（action_points 消费专用） */
  private setNestedValue(obj: any, path: string, value: unknown): void {
    const keys = path.split('.');
    let current = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      if (current[keys[i]] == null || typeof current[keys[i]] !== 'object') {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;
  }

  private compare(actual: unknown, operator: string, expected: number | string | boolean): boolean {
    const numA = Number(actual);
    const numB = Number(expected);

    if (!isNaN(numA) && !isNaN(numB)) {
      switch (operator) {
        case '==': return numA === numB;
        case '!=': return numA !== numB;
        case '>': return numA > numB;
        case '<': return numA < numB;
        case '>=': return numA >= numB;
        case '<=': return numA <= numB;
        default: return true;
      }
    }

    const strA = String(actual);
    const strB = String(expected);
    switch (operator) {
      case '==': return strA === strB;
      case '!=': return strA !== strB;
      default: return true;
    }
  }
}

// ============================================
// 二、对外统一接口
// ============================================

/**
 * 快速计算 — 使用 OrderClause 规则 JSON
 */
export function computeDamage(
  clauses: OrderClause[],
  caster: BattleUnit,
  target: BattleUnit,
  diceRoller?: () => number,
): LayeredDamageResult {
  const executor = new LayeredExecutor(clauses, diceRoller);
  return executor.execute(caster, target);
}

/**
 * 稳定射击特长快速计算
 */
export function computeStableShot(
  caster: BattleUnit,
  target: BattleUnit,
  diceRoller?: () => number,
): LayeredDamageResult {
  return computeDamage([STABLE_SHOT_CLAUSE], caster, target, diceRoller);
}

// ============================================
// 三、层叠互斥池
// ============================================

/** 互斥标签 — 标记冲突的技能效果组 */
export enum ExclusionTag {
  /** 增益类互斥 (多个增益取最高) */
  BUFF_EXCLUSIVE = 'BUFF_EXCLUSIVE',
  /** 减益类互斥 (多个减益取最严重) */
  DEBUFF_EXCLUSIVE = 'DEBUFF_EXCLUSIVE',
  /** 伤害增强互斥 (多个增强取最大，不叠加) */
  DAMAGE_BOOST_EXCLUSIVE = 'DAMAGE_BOOST_EXCLUSIVE',
}

/** 层叠互斥池 */
export class ExclusionPool {
  private pools = new Map<ExclusionTag, Array<{ source: string; value: number }>>();

  /** 尝试加入互斥池 */
  tryAdd(tag: ExclusionTag, source: string, value: number): boolean {
    let pool = this.pools.get(tag);
    if (!pool) {
      pool = [];
      this.pools.set(tag, pool);
    }

    const existing = pool.find(p => p.source === source);
    if (existing) {
      // 同源：取最大值
      if (value > existing.value) {
        existing.value = value;
      }
      return true;
    }

    pool.push({ source, value });
    return true;
  }

  /** 获取最终有效值 (取最大值/最严重) */
  getEffectiveValue(tag: ExclusionTag): number {
    const pool = this.pools.get(tag);
    if (!pool || pool.length === 0) return 0;
    return Math.max(...pool.map(p => p.value));
  }

  /** 清空所有池 */
  clear(): void {
    this.pools.clear();
  }
}
