/**
 * Phase 29-X 最高图腾令 — 共享内核：大一统词元枚举
 *
 * 锁死大一统语言学语法树的基础积木，彻底抹除乱码。
 * 所有后端服务必须从此文件导入词元，严禁硬编码字符串。
 *
 * @module @mecha/shared-kernel/tokens
 */

// ============================================
// 一、词元枚举（LexicalToken）
// 语法树基础积木，描述战场语言的基本动作单元
// ============================================
export enum LexicalToken {
  /** 自身 — 动作的发起者，语法主语 */
  SELF = 'SELF',

  /** 目标 — 动作的承受者，语法宾语 */
  TARGET = 'TARGET',

  /** AOE 半径 — 范围效果作用半径 */
  AOE_RADIUS = 'AOE_RADIUS',

  /** 全部友方 — 作用域：所有友军 */
  ALL_ALLIES = 'ALL_ALLIES',

  /** 全部敌方 — 作用域：所有敌军 */
  ALL_ENEMIES = 'ALL_ENEMIES',

  /** 移动动作 — 单位位移，语法谓语 */
  MOVE_ACTION = 'MOVE_ACTION',

  /** 攻击动作 — 单位发起攻击，语法谓语 */
  ATTACK_ACTION = 'ATTACK_ACTION',

  /** 当前能量 — 能量资源查询 */
  CURRENT_ENERGY = 'CURRENT_ENERGY',

  /** 隐匿 — 潜行/隐身状态 */
  STEALTH = 'STEALTH',

  /** 物理伤害 — 动能/爆炸类伤害 */
  DAMAGE_PHYSICAL = 'DAMAGE_PHYSICAL',

  /** 能量伤害 — 激光/等离子/EMP 类伤害 */
  DAMAGE_ENERGY = 'DAMAGE_ENERGY',

  /** 修复 — 治疗/维修动作 */
  REPAIR = 'REPAIR',

  /** 骰子检定 — 随机数判定 */
  DICE_ROLL = 'DICE_ROLL',

  /** 等于 — 比较算子（状语断言专用） */
  EQUALS = 'EQUALS',

  /** 消耗 — 资源扣除（弹药/能量/耐久） */
  CONSUME = 'CONSUME',

  /** 增益/减益 — 状态效果施加 */
  BUFF = 'BUFF',
}

export type LexicalTokenValue = `${LexicalToken}`;

// ============================================
// 二、定状补句式解析标签
// 用于 skillExecutor 的语法解析管线
// ============================================
export enum SyntaxTag {
  /** 定语 — 修饰主语/宾语的限定条件 */
  ATTRIBUTE = 'ATTRIBUTE',

  /** 状语 — 修饰谓语的执行条件/时机/范围 */
  ADVERBIAL = 'ADVERBIAL',

  /** 补语 — 补充动作的结果/程度/持续时间 */
  COMPLEMENT = 'COMPLEMENT',

  /** 条件分支 — if/else 逻辑 */
  CONDITION = 'CONDITION',

  /** 循环体 — for/while/repeat 逻辑 */
  LOOP = 'LOOP',
}

// ============================================
// 二-B、大一统句式结构（OrderClause）
// 定状补三层嵌套语法树骨架
// ============================================

/** 定语 — 针对主语的代价卡口（前置条件校验 + 量化扣减） */
export interface Qualifier {
  /** 条件标签，描述检查类型（如 'NOT_MOVED', 'CONSUME_AP'） */
  tag: string;
  /** 检查目标：SELF | TARGET */
  subject: 'SELF' | 'TARGET';
  /** 检查字段路径，如 'action_points.MOVE' | 'currentStats.hp' */
  field: string;
  /** 比较操作符 */
  operator: '==' | '!=' | '>' | '<' | '>=' | '<=';
  /** 比较值 */
  value: number | string | boolean;
  /** 不满足时的熔断消息 */
  failMessage: string;
  /**
   * 通过后是否执行量化扣减（如扣减 action_points）。
   * 设为 true 后，定语通过即自动从 subject.field 扣减 consumeAmount。
   */
  consume?: boolean;
  /** 扣减数量，默认 1 */
  consumeAmount?: number;
}

/** 状语 — 运行时动态投骰/随机数生成 */
export interface Adverbial {
  /** 骰子表达式，如 '1d6' | '2d6k1' */
  diceExpression: string;
  /** 成功阈值 */
  successLine: number;
  /** 失败值（未过线时的返回值） */
  failValue: number;
  /** 判定标签 */
  label: string;
}

/** 补语 — 数值量化改变结果 */
export interface Complement {
  /** 累加类型：flat | percent | dice_bonus */
  mode: 'flat' | 'percent' | 'dice_bonus';
  /** 累加值 */
  value: number;
  /** 目标字段 */
  targetField: string;
  /** 补语标签 */
  label: string;
}

/** 大一统句式结构 — 定状补三层嵌套 */
export interface OrderClause {
  /** 句式名称（技能名匹配键） */
  name: string;
  /** 谓语词元（核心动作） */
  predicate: LexicalTokenValue;
  /** 定语 — 代价卡口，必须全部通过才进入后续执行 */
  qualifiers: Qualifier[];
  /** 状语 — 运行时投骰判定 */
  adverbials: Adverbial[];
  /** 补语 — 累加最终数值 */
  complements: Complement[];
  /** 元数据 */
  meta?: Record<string, unknown>;
}

/** OrderClause 解析/执行错误 */
export interface OrderClauseError {
  /** 错误阶段：qualifier | adverbial | complement */
  phase: 'qualifier' | 'adverbial' | 'complement';
  /** 错误详情 */
  message: string;
  /** 原始词元 */
  token?: string;
}

// ============================================
// 三、伤害类型枚举
// ============================================
export enum DamageType {
  PHYSICAL = 'PHYSICAL',
  ENERGY = 'ENERGY',
  TRUE_DAMAGE = 'TRUE_DAMAGE',
  HEAL = 'HEAL',
}

// ============================================
// 四、战场状态枚举
// ============================================
export enum BattlePhase {
  DEPLOYMENT = 'DEPLOYMENT',
  INITIATIVE = 'INITIATIVE',
  MOVEMENT = 'MOVEMENT',
  COMBAT = 'COMBAT',
  RESOLUTION = 'RESOLUTION',
  CLEANUP = 'CLEANUP',
}

export enum RoomStatus {
  WAITING = 'waiting',
  READY = 'ready',
  IN_BATTLE = 'in_battle',
  FINISHED = 'finished',
  CANCELLED = 'cancelled',
}

// ============================================
// 五、权限级别枚举（数值级别，兼容旧版 permission 字段）
// ============================================
export enum PermissionLevel {
  /** 游客 — 仅可观看公开内容 */
  GUEST = 0,

  /** 注册用户 — 可创建/加入房间 */
  USER = 1,

  /** 高级用户 — 可创建私人房间 */
  PREMIUM = 2,

  /** 管理员 — 全权限 */
  ADMIN = 3,
}

// ============================================
// 五-B、四级角色枚举（Phase 29-P1 新权限体系）
// ============================================
export enum UserRole {
  /** 游客 — 无 Token，仅可观看公开内容与试玩战役 */
  GUEST = 'guest',

  /** 普通用户 — 可加入房间、使用基础功能 */
  USER = 'user',

  /** 裁判 — 可创建联机房间、主持对战 */
  REFEREE = 'referee',

  /** 管理员 — 后台管理、赠送积分、单位审核 */
  ADMIN = 'admin',

  /** 主宰 — 超级管理员，全服最高权限 */
  DOMINATOR = 'dominator',
}

// ============================================
// 五-C、审核状态枚举（Phase 29-DataSecurity）
// ============================================
export enum ReviewStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

// ============================================
// 六、AI 生成状态
// ============================================
export enum GenerationStatus {
  IDLE = 'idle',
  QUEUED = 'queued',
  GENERATING = 'generating',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

// ============================================
// 七、六角格方向系统（Even-R Offset）
// ============================================
export enum HexDirection {
  NE = 0,
  E = 1,
  SE = 2,
  SW = 3,
  W = 4,
  NW = 5,
}

// ============================================
// 八、错误码枚举
// ============================================
export enum ErrorCode {
  // 认证
  AUTH_TOKEN_MISSING = 'AUTH_TOKEN_MISSING',
  AUTH_TOKEN_EXPIRED = 'AUTH_TOKEN_EXPIRED',
  AUTH_TOKEN_INVALID = 'AUTH_TOKEN_INVALID',
  AUTH_CREDENTIALS_INVALID = 'AUTH_CREDENTIALS_INVALID',

  // 房间
  ROOM_NOT_FOUND = 'ROOM_NOT_FOUND',
  ROOM_FULL = 'ROOM_FULL',
  ROOM_PASSWORD_REQUIRED = 'ROOM_PASSWORD_REQUIRED',
  ROOM_ALREADY_JOINED = 'ROOM_ALREADY_JOINED',
  ROOM_NOT_OWNER = 'ROOM_NOT_OWNER',

  // 战斗
  COMBAT_INVALID_MOVE = 'COMBAT_INVALID_MOVE',
  COMBAT_INVALID_TARGET = 'COMBAT_INVALID_TARGET',
  COMBAT_UNIT_NOT_FOUND = 'COMBAT_UNIT_NOT_FOUND',

  // 技能执行
  SKILL_PARSE_ERROR = 'SKILL_PARSE_ERROR',
  SKILL_LOOP_OVERFLOW = 'SKILL_LOOP_OVERFLOW',
  SKILL_EXECUTION_ERROR = 'SKILL_EXECUTION_ERROR',

  // 经济系统 (Phase 29-P1)
  CREDITS_INSUFFICIENT = 'CREDITS_INSUFFICIENT',
  CREDITS_GIFT_SUCCESS = 'CREDITS_GIFT_SUCCESS',

  // 权限 (Phase 29-P1)
  ROLE_FORBIDDEN = 'ROLE_FORBIDDEN',

  // 通用
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}
