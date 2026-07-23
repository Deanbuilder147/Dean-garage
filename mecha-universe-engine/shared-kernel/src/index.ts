/**
 * @mecha/shared-kernel — 大一统规则母体共享内核
 *
 * Phase 29-X 最高图腾令：全量重做 Monorepo 大一统规则母体引擎
 * 本模块为所有子包提供统一的枚举、类型与工具函数。
 *
 * @module @mecha/shared-kernel
 */

// 词元枚举（语法树基础积木）
export {
  LexicalToken,
  SyntaxTag,
  DamageType,
  BattlePhase,
  RoomStatus,
  PermissionLevel,
  UserRole,
  GenerationStatus,
  HexDirection,
  ErrorCode,
  ReviewStatus,
} from './tokens.js';

export type { LexicalTokenValue } from './tokens.js';

// Phase 29-P2: 定状补句式结构
export type {
  Qualifier,
  Adverbial,
  Complement,
  OrderClause,
  OrderClauseError,
} from './tokens.js';

// 通用类型
export type {
  HexCoord,
  PixelCoord,
  EntityId,
  ISODateTime,
  UserProfile,
  AuthPayload,
  LoginRequest,
  RegisterRequest,
  AuthResponse,
  UnitStats,
  UnitSkill,
  EntityMatrix,
  TerrainCell,
  BattlefieldMap,
  RoomPlayer,
  RoomSettings,
  Room,
  CreateRoomRequest,
  JoinRoomRequest,
  BattleUnit,
  RoyroyState,
  StatusEffect,
  BattleState,
  BattleLogEntry,
  SkillASTNode,
  SkillExecutionContext,
  SkillExecutionResult,
  WatchEvent,
} from './types.js';
