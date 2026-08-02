/**
 * Phase 29-P2 — 技能执行器（定状补句式解析引擎 v2.0）
 *
 * 完全体重写目标：
 * 1. 彻底拔除针对具体技能名写死的 JS 死代码 → 全量遍历 Rule JSON
 * 2. OrderClause 定状补三层语法树驱动动态断言状态机
 * 3. MAX_LOOP_STEP = 10 死循环熔断
 * 4. 外层刚性 try...catch，未识别词元自动降级基础兜底公式
 * 5. 绝不卡死真机战场！
 *
 * @module skillExecutor
 */

import { logger } from './utils/logger.js';
import {
  LexicalToken,
  DamageType,
  ErrorCode,
} from '@mecha/shared-kernel';
import type {
  OrderClause,
  Qualifier,
  Adverbial,
  Complement,
  OrderClauseError,
  SkillASTNode,
  SkillExecutionContext,
  SkillExecutionResult,
  BattleUnit,
  StatusEffect,
} from '@mecha/shared-kernel';

// ============================================
// 安全沙盒常量
// ============================================

/** 最大循环步数 — 超过时强制中止，防止死锁 */
const MAX_LOOP_STEP = 10;

/** 基础伤害公式兜底值（技能解析失败时使用） */
const FALLBACK_BASE_DAMAGE = 10;

/** 能量伤害倍率 */
const ENERGY_DAMAGE_MULTIPLIER = 1.5;

// ============================================
// 类型定义
// ============================================

interface NodeExecutionResult {
  damage: number;
  effects: StatusEffect[];
  log: string[];
  loopIncrement: number;
}

/** 定状补断言状态机运行时上下文 */
interface ClauseExecutionContext {
  caster: BattleUnit;
  target: BattleUnit;
  battlefield: any;
  diceRoll: () => number;
  loopCount: number;
  clauseLog: string[];
}

/** 定状补执行结果 */
interface ClauseExecutionOutcome {
  success: boolean;
  damage: number;
  damageType: DamageType;
  effects: StatusEffect[];
  log: string[];
  errors: OrderClauseError[];
  blocked: boolean; // 是否被定语熔断
}

// ============================================
// 一、定状补句式解析器 (v2.0 — Rule JSON 驱动)
// ============================================

/**
 * 将技能 DSL 脚本解析为 AST 节点树。
 *
 * 定状补语法规则（v2.0 增强）：
 * - 定语 (QUALIFIER): <field operator value>, 如 <action_points.MOVE > 0>
 * - 状语 (ADVERBIAL): [diceExpression successLine failValue], 如 [1d6 4 0]
 * - 补语 (COMPLEMENT): (mode value targetField), 如 (flat 5 damage) | (dice_bonus 5 energy)
 * - 条件分支 (CONDITION): {if expr} ... {/if}
 * - 循环体 (LOOP): {loop N} ... {/loop}
 *
 * 谓语（核心动作）:
 * - attack → DAMAGE_PHYSICAL
 * - fire → DAMAGE_ENERGY
 * - move → MOVE_ACTION
 * - consume → CONSUME
 * - buff → BUFF
 * - roll → DICE_ROLL
 */
export function parseSkillScript(script: string): SkillASTNode[] {
  if (!script || script.trim().length === 0) {
    return [];
  }

  const nodes: SkillASTNode[] = [];
  const lines = script.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  for (const line of lines) {
    const node = parseLine(line);
    if (node) nodes.push(node);
  }

  return nodes;
}

function parseLine(line: string): SkillASTNode | null {
  // 定语 <field operator value>
  const qualMatch = line.match(/^<(.+?)\s*(==|!=|>=|<=|>|<)\s*(.+?)>/);
  if (qualMatch) {
    return {
      type: 'attribute',
      token: qualMatch[1].trim(),
      value: `${qualMatch[2]} ${qualMatch[3]}`,
      children: [],
    };
  }

  // 状语 [diceExpression successLine failValue]
  const advMatch = line.match(/^\[(.+?)\s+(\d+)\s+(\d+)\]/);
  if (advMatch) {
    return {
      type: 'adverbial',
      token: advMatch[1],
      value: `${advMatch[2]} ${advMatch[3]}`,
      children: [],
    };
  }

  // 补语 (mode value targetField) 或 (dice_bonus value label)
  const compMatch = line.match(/^\((.+?)\s+([-]?\d+)\s+(.+?)\)/);
  if (compMatch) {
    return {
      type: 'complement',
      token: compMatch[1],
      value: `${compMatch[2]} ${compMatch[3]}`,
      children: [],
    };
  }

  // 条件分支 {if ...}
  const condMatch = line.match(/^\{(if|unless)\s+(.+?)\}/);
  if (condMatch) {
    return {
      type: 'condition',
      token: condMatch[1],
      value: condMatch[2],
      children: [],
    };
  }

  // 循环体 {loop N}
  const loopMatch = line.match(/^\{loop\s+(\d+)\}/);
  if (loopMatch) {
    return {
      type: 'loop',
      token: 'repeat',
      value: parseInt(loopMatch[1], 10),
      children: [],
    };
  }

  // 核心谓语识别（全量 Rule JSON 映射，无硬编码技能名）
  const tokenMap: Record<string, string> = {
    'attack': LexicalToken.DAMAGE_PHYSICAL,
    'fire': LexicalToken.DAMAGE_ENERGY,
    'move': LexicalToken.MOVE_ACTION,
    'consume': LexicalToken.CONSUME,
    'buff': LexicalToken.BUFF,
    'debuff': LexicalToken.BUFF,
    'roll': LexicalToken.DICE_ROLL,
    'heal': 'HEAL',
  };

  for (const [keyword, token] of Object.entries(tokenMap)) {
    if (line.startsWith(keyword)) {
      return {
        type: 'predicate',
        token,
        value: line.slice(keyword.length).trim() || undefined,
        children: [],
      };
    }
  }

  // 未识别词元 → 保留原始文本用于错误日志
  return {
    type: 'predicate',
    token: 'UNRECOGNIZED',
    value: line,
    children: [],
  };
}

// ============================================
// 二、定状补断言状态机（OrderClause 驱动）
// ============================================

/**
 * 根据 OrderClause 句式结构执行定状补三层状态机。
 *
 * 执行顺序（严格）：
 * 1. 定语（Qualifier）：逐一检查代价卡口 → 任一不满足则熔断
 *    通过后若 consume=true 则执行量化扣减 -consumeAmount
 * 2. 状语（Adverbial）：运行时投骰判定，记录每个状语的成败状态
 * 3. 补语（Complement）：累加最终数值
 *    dice_bonus 仅在关联状语成功时激活
 */
export function executeClauseStateMachine(
  clause: OrderClause,
  caster: BattleUnit,
  target: BattleUnit,
  diceRollFn: () => number,
  battlefield?: any,
): ClauseExecutionOutcome {
  const log: string[] = [];
  const errors: OrderClauseError[] = [];
  let damage = 0;
  let damageType: DamageType = DamageType.PHYSICAL;
  const effects: StatusEffect[] = [];
  let blocked = false;

  // 确定伤害类型（字符串比较兼容 'HEAL' 非标准词元）
  if (String(clause.predicate) === LexicalToken.DAMAGE_ENERGY) {
    damageType = DamageType.ENERGY;
  } else if (String(clause.predicate) === 'HEAL') {
    damageType = DamageType.HEAL;
  }

  // --- 第一步：定语卡口（Qualifier Gate + 量化扣减） ---
  for (const qualifier of clause.qualifiers) {
    const subject = qualifier.subject === 'SELF' ? caster : target;
    const fieldValue = getNestedField(subject, qualifier.field);
    const pass = evaluateQualifier(fieldValue, qualifier.operator, qualifier.value);

    if (!pass) {
      log.push(`[QUALIFIER 熔断] ${qualifier.failMessage} (${qualifier.field}: ${fieldValue})`);
      errors.push({
        phase: 'qualifier',
        message: qualifier.failMessage,
        token: qualifier.tag,
      });
      blocked = true;
      break; // 定语任一不满足，立即熔断
    }

    log.push(`[QUALIFIER ✓] ${qualifier.tag}: ${qualifier.field} ${qualifier.operator} ${qualifier.value} → 通过`);

    // 🟢 定语通过后执行量化扣减（如消耗 action_points）
    if (qualifier.consume && qualifier.field) {
      const deductAmount = qualifier.consumeAmount ?? 1;
      const currentVal = getNestedField(subject, qualifier.field);
      if (typeof currentVal === 'number') {
        // 直接修改 subject 上的嵌套字段
        setNestedField(subject, qualifier.field, currentVal - deductAmount);
        const newVal = getNestedField(subject, qualifier.field);
        log.push(`[QUALIFIER 扣减] ${qualifier.field}: ${currentVal} → ${newVal} (消耗 ${deductAmount})`);
      }
    }
  }

  if (blocked) {
    return {
      success: false,
      damage: 0,
      damageType,
      effects,
      log,
      errors,
      blocked: true,
    };
  }

  // --- 第二步：状语投骰（Adverbial Dice） ---
  // 🟢 记录每个状语的成败状态，供补语精准关联
  const adverbialResults: Map<number, boolean> = new Map();
  let advIndex = 0;
  for (const adverbial of clause.adverbials) {
    try {
      const rollResult = executeDiceExpression(adverbial.diceExpression, diceRollFn);
      const isSuccess = rollResult >= adverbial.successLine;
      adverbialResults.set(advIndex, isSuccess);
      log.push(`[ADVERBIAL] ${adverbial.label}: 掷 ${adverbial.diceExpression} = ${rollResult} ${isSuccess ? '>=' : '<'} ${adverbial.successLine} → ${isSuccess ? '成功' : '失败'}`);
      advIndex++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      adverbialResults.set(advIndex, false);
      log.push(`[ADVERBIAL 错误] ${adverbial.label}: ${msg} — 降级使用 failValue=${adverbial.failValue}`);
      errors.push({ phase: 'adverbial', message: msg, token: adverbial.diceExpression });
      advIndex++;
    }
  }

  // --- 第三步：补语累加（Complement Accumulate） ---
  // 按层级排序：flat 先，percent 后，dice_bonus 最后
  const sortedComplements = [...clause.complements].sort((a, b) => {
    const order: Record<string, number> = { flat: 0, percent: 1, dice_bonus: 2 };
    return (order[a.mode] ?? 99) - (order[b.mode] ?? 99);
  });

  let baseDamage = 0;
  if (damageType === DamageType.ENERGY) {
    baseDamage = Math.max(0, caster.currentStats.attack * ENERGY_DAMAGE_MULTIPLIER - target.currentStats.shield);
  } else {
    baseDamage = Math.max(0, caster.currentStats.attack - target.currentStats.defense);
  }
  damage = baseDamage;

  // 🟢 检查是否有任意状语成功（dice_bonus 需要状语成功才触发）
  const anyAdverbialSuccess = adverbialResults.size > 0
    && Array.from(adverbialResults.values()).some(v => v === true);

  for (const comp of sortedComplements) {
    switch (comp.mode) {
      case 'flat':
        damage += comp.value;
        log.push(`[COMPLEMENT] flat +${comp.value} → 伤害 = ${damage}`);
        break;

      case 'percent':
        damage = Math.floor(damage * (1 + comp.value / 100));
        log.push(`[COMPLEMENT] percent +${comp.value}% → 伤害 = ${damage}`);
        break;

      case 'dice_bonus':
        // 🟢 dice_bonus 仅在有状语成功时触发
        if (anyAdverbialSuccess) {
          damage += comp.value;
          log.push(`[COMPLEMENT] dice_bonus +${comp.value} (状语成功触发) → 伤害 = ${damage}`);
        } else {
          log.push(`[COMPLEMENT] dice_bonus +${comp.value} 跳过（状语未成功）`);
        }
        break;

      default:
        log.push(`[COMPLEMENT 警告] 未知补语模式: ${comp.mode}`);
    }
  }

  // 保底伤害
  damage = Math.max(1, Math.floor(damage));

  return {
    success: true,
    damage,
    damageType,
    effects,
    log,
    errors,
    blocked: false,
  };
}

// ============================================
// 三、安全沙盒技能执行器 (v2.0 刚性兜底)
// ============================================

/**
 * 在安全沙盒中执行技能。
 *
 * 支持两种模式：
 * 1. OrderClause 规则 JSON 模式（推荐，定状补状态机）
 * 2. DSL 脚本模式（向后兼容）
 *
 * 执行流程：
 * 1. 解析输入 → 判断模式
 * 2. 定状补状态机 / AST 遍历
 * 3. 循环步数拦截 (MAX_LOOP_STEP)
 * 4. 外层刚性 try...catch — UGC 语法错误绝不死机
 */
export function executeSkill(
  input: string | OrderClause,
  context: SkillExecutionContext
): SkillExecutionResult {
  // 外层刚性 try...catch：绝不卡死战场
  try {
    // 模式判断：OrderClause 对象 vs DSL 字符串
    if (typeof input === 'object' && 'predicate' in input) {
      return executeClause(input, context);
    } else {
      return executeDSL(String(input), context);
    }
  } catch (err: unknown) {
    // UGC 语法错误降级使用基础公式兜底
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ msg: `[CRITICAL FAILED] [SkillExecutor] 技能执行异常，降级兜底:
  Error: ${message}
  Input: ${typeof input === 'string' ? input.slice(0, 200) : JSON.stringify(input).slice(0, 200)}
  Caster: ${context.caster.matrixId || context.caster.unitId}
  Target: ${context.target.matrixId || context.target.unitId}
` });
    return {
      ...createFallbackResult(context, message),
      error: ErrorCode.SKILL_EXECUTION_ERROR,
    };
  }
}

/** OrderClause 规则 JSON 执行路径 */
function executeClause(
  clause: OrderClause,
  context: SkillExecutionContext
): SkillExecutionResult {
  const { caster, target, diceRoll, battlefield } = context;

  const outcome = executeClauseStateMachine(
    clause,
    caster,
    target,
    diceRoll,
    battlefield,
  );

  const result: SkillExecutionResult = {
    success: outcome.success,
    damage: outcome.damage,
    damageType: outcome.damageType,
    effects: outcome.effects,
    log: outcome.log,
  };

  if (outcome.blocked) {
    // 定语熔断 — 不是错误，是主动拦截
    result.success = false;
    if (outcome.errors.length > 0) {
      result.error = ErrorCode.SKILL_PARSE_ERROR;
      result.log = [...result.log, `[CLAUSE BLOCKED] ${outcome.errors[0].message}`];
    }
  }

  if (outcome.errors.length > 0 && !outcome.blocked) {
    // 有错误但未熔断 → 部分降级
    result.error = ErrorCode.SKILL_EXECUTION_ERROR;
    result.log = [...result.log, ...outcome.errors.map(e => `[${e.phase.toUpperCase()} ERROR] ${e.message}`)];
  }

  return result;
}

/** DSL 字符串执行路径（向后兼容 AST 解析） */
function executeDSL(
  script: string,
  context: SkillExecutionContext
): SkillExecutionResult {
  const nodes = parseSkillScript(script);

  if (nodes.length === 0) {
    return createFallbackResult(context, '技能脚本为空');
  }

  // 检测未识别词元
  const unrecognized = nodes.filter(n => n.token === 'UNRECOGNIZED');
  if (unrecognized.length > 0) {
    const tokens = unrecognized.map(n => n.value).join(', ');
    logger.warn({ msg: `[SkillExecutor] 检测到未识别词元: ${tokens}，继续执行已知部分` });
  }

  const result: SkillExecutionResult = {
    success: true,
    damage: 0,
    damageType: DamageType.PHYSICAL,
    effects: [],
    log: [],
  };

  let loopCounter = 0;

  for (const node of nodes) {
    const stepResult = executeNode(node, context, loopCounter);
    result.damage += stepResult.damage;
    result.effects.push(...stepResult.effects);
    result.log.push(...stepResult.log);
    loopCounter += stepResult.loopIncrement;

    // MAX_LOOP_STEP 死循环熔断拦截
    if (loopCounter > MAX_LOOP_STEP) {
      result.log.push(`[SKILL 熔断] 循环步数超过上限 ${MAX_LOOP_STEP}，强制中止执行`);
      result.error = ErrorCode.SKILL_LOOP_OVERFLOW;
      logger.error({ msg: `[CRITICAL FAILED] [SkillExecutor] 死循环熔断！loopCounter=${loopCounter} > ${MAX_LOOP_STEP}
  Script: ${script.slice(0, 200)}
  Caster: ${context.caster.matrixId || context.caster.unitId}` });
      break;
    }
  }

  return result;
}

// ============================================
// 四、AST 节点执行
// ============================================

function executeNode(
  node: SkillASTNode,
  context: SkillExecutionContext,
  currentLoop: number
): NodeExecutionResult {
  switch (node.type) {
    case 'predicate':
      return executePredicate(node, context);

    case 'attribute':
      return executeAttributeNode(node, context);

    case 'adverbial':
      return executeAdverbialNode(node, context);

    case 'complement':
      return executeComplementNode(node, context);

    case 'condition': {
      const conditionMet = evaluateCondition(node, context);
      if (!conditionMet) {
        return { damage: 0, effects: [], log: [`条件不满足: ${node.token} ${node.value}`], loopIncrement: 0 };
      }
      return executeChildren(node.children, context, currentLoop);
    }

    case 'loop': {
      const iterations = Math.min(typeof node.value === 'number' ? node.value : 1, MAX_LOOP_STEP);
      const result: NodeExecutionResult = { damage: 0, effects: [], log: [], loopIncrement: 0 };
      for (let i = 0; i < iterations; i++) {
        const iterResult = executeChildren(node.children, context, currentLoop + i);
        result.damage += iterResult.damage;
        result.effects.push(...iterResult.effects);
        result.log.push(...iterResult.log);
        result.loopIncrement += iterResult.loopIncrement + 1;

        // 内层循环也检查熔断
        if (result.loopIncrement > MAX_LOOP_STEP) {
          result.log.push(`[LOOP 熔断] 循环体内部超过 ${MAX_LOOP_STEP} 步`);
          break;
        }
      }
      result.log.push(`循环执行 ${iterations} 次完成`);
      return result;
    }

    default:
      return { damage: 0, effects: [], log: [`未知节点类型: ${node.type}`], loopIncrement: 0 };
  }
}

function executeChildren(
  children: SkillASTNode[],
  context: SkillExecutionContext,
  currentLoop: number
): NodeExecutionResult {
  const result: NodeExecutionResult = { damage: 0, effects: [], log: [], loopIncrement: 0 };
  for (const child of children) {
    const childResult = executeNode(child, context, currentLoop + result.loopIncrement);
    result.damage += childResult.damage;
    result.effects.push(...childResult.effects);
    result.log.push(...childResult.log);
    result.loopIncrement += childResult.loopIncrement;
  }
  return result;
}

/** 定语节点执行 */
function executeAttributeNode(
  node: SkillASTNode,
  context: SkillExecutionContext
): NodeExecutionResult {
  const field = node.token;
  const [op, valStr] = String(node.value || '').split(/\s+/);
  const caster = context.caster;
  const fieldValue = getNestedField(caster, field);
  const pass = evaluateQualifier(fieldValue, op, valStr);

  if (!pass) {
    return {
      damage: 0,
      effects: [],
      log: [`[ATTRIBUTE 熔断] ${field} ${op} ${valStr}: 当前值 ${fieldValue} → 技能释放失败`],
      loopIncrement: 1,
    };
  }

  return {
    damage: 0,
    effects: [],
    log: [`[ATTRIBUTE ✓] ${field} ${op} ${valStr} → 通过`],
    loopIncrement: 1,
  };
}

/** 状语节点执行（投骰） */
function executeAdverbialNode(
  node: SkillASTNode,
  context: SkillExecutionContext
): NodeExecutionResult {
  const diceExpr = node.token;
  const [successLineStr, failValStr] = String(node.value || '').split(/\s+/);
  const successLine = parseInt(successLineStr, 10) || 4;
  const failValue = parseInt(failValStr, 10) || 0;

  try {
    const roll = executeDiceExpression(diceExpr, context.diceRoll);
    const isSuccess = roll >= successLine;
    return {
      damage: 0,
      effects: [],
      log: [`[ADVERBIAL] ${diceExpr} = ${roll} ${isSuccess ? '≥' : '<'} ${successLine} → ${isSuccess ? '成功' : '失败'}`],
      loopIncrement: 1,
    };
  } catch (err: unknown) {
    return {
      damage: 0,
      effects: [],
      log: [`[ADVERBIAL 错误] ${diceExpr}: ${err} → 降级 failValue=${failValue}`],
      loopIncrement: 1,
    };
  }
}

/** 补语节点执行 */
function executeComplementNode(
  node: SkillASTNode,
  context: SkillExecutionContext
): NodeExecutionResult {
  const mode = node.token;
  const [valStr, targetField] = String(node.value || '').split(/\s+/);
  const value = parseInt(valStr, 10) || 0;

  switch (mode) {
    case 'flat':
      return {
        damage: value,
        effects: [],
        log: [`[COMPLEMENT] flat +${value} → ${targetField}`],
        loopIncrement: 1,
      };
    case 'percent':
      return {
        damage: 0, // percent 在 accumulate 阶段处理
        effects: [],
        log: [`[COMPLEMENT] percent +${value}% → ${targetField}`],
        loopIncrement: 1,
      };
    case 'dice_bonus':
      return {
        damage: value,
        effects: [],
        log: [`[COMPLEMENT] dice_bonus +${value} → ${targetField}`],
        loopIncrement: 1,
      };
    default:
      return {
        damage: 0,
        effects: [],
        log: [`[COMPLEMENT 警告] 未知模式: ${mode}`],
        loopIncrement: 1,
      };
  }
}

// ============================================
// 五、谓语执行
// ============================================

function executePredicate(
  node: SkillASTNode,
  context: SkillExecutionContext
): NodeExecutionResult {
  const { caster, target, diceRoll } = context;

  switch (node.token) {
    case LexicalToken.DAMAGE_PHYSICAL: {
      const baseAtk = caster.currentStats.attack;
      const targetDef = target.currentStats.defense;
      const roll = diceRoll();
      const damage = Math.max(1, baseAtk - targetDef + roll);
      return {
        damage,
        effects: [],
        log: [`物理伤害: ${baseAtk}ATK - ${targetDef}DEF + ${roll}骰 = ${damage}`],
        loopIncrement: 1,
      };
    }

    case LexicalToken.DAMAGE_ENERGY: {
      const baseAtk = caster.currentStats.attack;
      const targetShield = target.currentStats.shield;
      const roll = diceRoll();
      const damage = Math.max(1, baseAtk * ENERGY_DAMAGE_MULTIPLIER - targetShield + roll);
      return {
        damage,
        effects: [],
        log: [`能量伤害: ${baseAtk}×${ENERGY_DAMAGE_MULTIPLIER}ATK - ${targetShield}盾 + ${roll}骰 = ${damage}`],
        loopIncrement: 1,
      };
    }

    case LexicalToken.MOVE_ACTION: {
      return {
        damage: 0,
        effects: [],
        log: [`移动动作: ${node.value || '默认方向'}`],
        loopIncrement: 1,
      };
    }

    case LexicalToken.CONSUME: {
      return {
        damage: 0,
        effects: [],
        log: [`消耗: ${node.value || '资源'}`],
        loopIncrement: 1,
      };
    }

    case LexicalToken.BUFF: {
      return {
        damage: 0,
        effects: [],
        log: [`增益/减益: ${node.value || '状态效果'}`],
        loopIncrement: 1,
      };
    }

    case LexicalToken.DICE_ROLL: {
      const roll = diceRoll();
      return {
        damage: 0,
        effects: [],
        log: [`骰子检定: ${roll}`],
        loopIncrement: 1,
      };
    }

    case 'HEAL': {
      const healAmount = Math.floor(caster.currentStats.attack * 0.5);
      return {
        damage: -healAmount,
        effects: [],
        log: [`治疗: ${healAmount}`],
        loopIncrement: 1,
      };
    }

    case 'UNRECOGNIZED': {
      // 未识别词元 → 记录警告但不崩溃
      logger.warn({ msg: `[SkillExecutor] 未识别词元: ${node.value}` });
      return {
        damage: 0,
        effects: [],
        log: [`[UNRECOGNIZED] 未识别词元: ${node.value} — 跳过`],
        loopIncrement: 1,
      };
    }

    default: {
      return {
        damage: 0,
        effects: [],
        log: [`未识别谓语: ${node.token}`],
        loopIncrement: 1,
      };
    }
  }
}

// ============================================
// 六、条件求值 & 工具函数
// ============================================

function evaluateCondition(node: SkillASTNode, context: SkillExecutionContext): boolean {
  const { caster } = context;
  const cond = String(node.value || '');

  // hp > 50% 类条件
  const hpMatch = cond.match(/hp\s*([><=]+)\s*(\d+)%?/);
  if (hpMatch) {
    const [_, op, val] = hpMatch;
    const hpPct = (caster.currentStats.hp / caster.currentStats.maxHp) * 100;
    return compareValues(hpPct, op, Number(val));
  }

  // action_points 动态行动点查询（全量由计数池接管，彻底废除 hasMoved/hasAttacked）
  const apMatch = cond.match(/action_points\.(\w+)/);
  if (apMatch) {
    const key = apMatch[1];
    return (caster.action_points?.[key] ?? 0) > 0;
  }

  // range 条件
  if (cond.includes('range')) {
    return true; // 简化处理
  }

  // 默认通过
  return true;
}

/** 定语求值 */
function evaluateQualifier(
  fieldValue: unknown,
  operator: string,
  expectedValue: number | string | boolean
): boolean {
  const actual = typeof fieldValue === 'string' ? fieldValue : Number(fieldValue);
  const expected = typeof expectedValue === 'string'
    ? (expectedValue === 'true' ? true : expectedValue === 'false' ? false : expectedValue)
    : expectedValue;

  return compareValues(actual, operator, expected);
}

/** 通用值比较 */
function compareValues(a: unknown, op: string, b: unknown): boolean {
  const numA = Number(a);
  const numB = Number(b);

  if (!isNaN(numA) && !isNaN(numB)) {
    switch (op) {
      case '==': return numA === numB;
      case '!=': return numA !== numB;
      case '>': return numA > numB;
      case '<': return numA < numB;
      case '>=': return numA >= numB;
      case '<=': return numA <= numB;
      default: return true;
    }
  }

  // 布尔/字符串比较
  const strA = String(a);
  const strB = String(b);
  switch (op) {
    case '==': return strA === strB;
    case '!=': return strA !== strB;
    default: return true;
  }
}

/** 从对象中获取嵌套字段值 */
function getNestedField(obj: any, path: string): unknown {
  const keys = path.split('.');
  let current = obj;
  for (const key of keys) {
    if (current == null || typeof current !== 'object') return undefined;
    current = current[key];
  }
  return current;
}

/** 向对象中设置嵌套字段值（action_points 消费专用） */
function setNestedField(obj: any, path: string, value: unknown): void {
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

/** 骰子表达式执行（简化版 dicescript 调用） */
function executeDiceExpression(expression: string, roller: () => number): number {
  // 简化骰子解析：NdM 格式
  const match = expression.trim().match(/^(\d+)d(\d+)$/i);
  if (match) {
    const count = parseInt(match[1], 10);
    const sides = parseInt(match[2], 10);
    let total = 0;
    for (let i = 0; i < count; i++) {
      total += Math.floor(Math.random() * sides) + 1;
    }
    return total;
  }

  // 无法解析 → 默认 d6
  return roller();
}

// ============================================
// 七、兜底公式
// ============================================

function createFallbackResult(context: SkillExecutionContext, reason: string): SkillExecutionResult {
  const roll = context.diceRoll();
  const damage = FALLBACK_BASE_DAMAGE + roll;
  return {
    success: true,
    damage,
    damageType: DamageType.PHYSICAL,
    effects: [],
    log: [
      `[SAFEGUARD] 技能执行异常降级兜底`,
      `[SAFEGUARD] 原因: ${reason}`,
      `[SAFEGUARD] 兜底公式: ${FALLBACK_BASE_DAMAGE}基础 + ${roll}骰 = ${damage}`,
    ],
  };
}

// ============================================
// 八、公开接口
// ============================================

/**
 * 快速计算技能伤害（对外统一接口）
 */
export function computeSkillDamage(
  script: string,
  caster: BattleUnit,
  target: BattleUnit,
  battlefield?: any
): SkillExecutionResult {
  const context: SkillExecutionContext = {
    caster,
    target,
    battlefield: battlefield || buildDefaultBattlefield(),
    diceRoll: () => Math.floor(Math.random() * 6) + 1,
    loopCount: 0,
  };

  return executeSkill(script, context);
}

/**
 * 根据 OrderClause 规则 JSON 计算技能伤害
 */
export function computeClauseDamage(
  clause: OrderClause,
  caster: BattleUnit,
  target: BattleUnit,
  battlefield?: any
): SkillExecutionResult {
  const context: SkillExecutionContext = {
    caster,
    target,
    battlefield: battlefield || buildDefaultBattlefield(),
    diceRoll: () => Math.floor(Math.random() * 6) + 1,
    loopCount: 0,
  };

  return executeSkill(clause, context);
}

function buildDefaultBattlefield(): any {
  return {
    id: 'default',
    phase: 'COMBAT',
    turn: 1,
    activeUnitId: '',
    units: new Map(),
    map: {} as any,
    log: [],
    startedAt: new Date().toISOString(),
  };
}
