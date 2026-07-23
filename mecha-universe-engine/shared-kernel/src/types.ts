/**
 * Phase 29-X 最高图腾令 — 共享内核：通用类型与实体矩阵 Schema
 *
 * 为 EntityMatrix 实体矩阵配置通用 Schema，追加：
 *   - 版权溯源标记 is_public_copy
 *   - AI 形象异步状态 generation_status
 *   - 动态 KV 属性容器 attributes
 *
 * @module @mecha/shared-kernel/types
 */

import type { LexicalToken, GenerationStatus, PermissionLevel, UserRole, RoomStatus, BattlePhase, DamageType, ReviewStatus } from './tokens.js';

// ============================================
// 一、基础坐标与标识
// ============================================

/** 六角格坐标 (Even-R Offset) */
export interface HexCoord {
  q: number;
  r: number;
}

/** 像素坐标 */
export interface PixelCoord {
  x: number;
  y: number;
}

/** 实体唯一标识 */
export type EntityId = string;

/** ISO 8601 时间戳 */
export type ISODateTime = string;

// ============================================
// 二、用户与认证
// ============================================

export interface UserProfile {
  id: EntityId;
  username: string;
  email: string;
  faction: string;
  permission: PermissionLevel;
  /** Phase 29-P1: 四级角色（guest/user/referee/admin/dominator） */
  role: UserRole;
  /** Phase 29-P1: 每日 AI 形象生成积分 */
  credits: number;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface AuthPayload {
  userId: EntityId;
  username: string;
  permission: PermissionLevel;
  /** Phase 29-P1: 角色信息随 Token 荷载传递 */
  role: UserRole;
  /** Phase 29-P1: 积分随荷载传递（前端即时感知） */
  credits: number;
  iat: number;
  exp: number;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: UserProfile;
}

// ============================================
// 三、单位（机甲）实体
// ============================================

export interface UnitStats {
  hp: number;
  maxHp: number;
  armor: number;
  shield: number;
  attack: number;
  defense: number;
  speed: number;
  mobility: number;
  range: number;
}

export interface UnitSkill {
  id: EntityId;
  name: string;
  description: string;
  script: string; // 定状补句式 DSL
  cooldown: number;
  currentCooldown: number;
  energyCost: number;
  damageType: DamageType;
}

/** 实体矩阵 — 通用 Schema（大一统战棋实体核心） */
export interface EntityMatrix {
  id: EntityId;

  /** 版权溯源标记：是否为公共副本（用户无权修改原始素材） */
  is_public_copy: boolean;

  /** Phase 29-DataSecurity: 四级公开权限 — 默认 0（私密） */
  is_public: boolean;

  /** Phase 29-DataSecurity: 审核状态 — pending/approved/rejected */
  review_status: ReviewStatus;

  /** Phase 29-P1: 原作者 ID — 一键将优质 UGC 单位复制为全服公用资产时的溯源锚点 */
  original_author_id: EntityId;

  /** AI 形象异步生成状态 */
  generation_status: GenerationStatus;

  /** 动态 KV 属性容器 — 用于扩展属性存储 */
  attributes: Map<string, unknown>;

  // 基础字段
  name: string;
  faction: string;
  category: string;
  tier: number;
  sprite_key: string;
  stats: UnitStats;
  skills: UnitSkill[];

  // 元数据
  created_by: EntityId;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

// ============================================
// 四、战场与地图
// ============================================

export interface TerrainCell {
  q: number;
  r: number;
  terrain: string;
  elevation: number;
  passable: boolean;
}

export interface BattlefieldMap {
  id: EntityId;
  name: string;
  width: number;
  height: number;
  cells: TerrainCell[];
  spawn_points: HexCoord[];
  is_public_copy: boolean;
  /** Phase 29-DataSecurity: 四级公开权限 — 默认 0（私密） */
  is_public: boolean;
  /** Phase 29-DataSecurity: 审核状态 — pending/approved/rejected */
  review_status: ReviewStatus;
  generation_status: GenerationStatus;
  attributes: Map<string, unknown>;
}

// ============================================
// 五、房间与联机
// ============================================

export interface RoomPlayer {
  userId: EntityId;
  username: string;
  faction: string;
  team: number;
  ready: boolean;
  joinedAt: ISODateTime;
}

export interface RoomSettings {
  name: string;
  maxPlayers: number;
  mapId: EntityId;
  turnTimeLimit: number;
  isPrivate: boolean;
  password?: string;
  rules: Record<string, unknown>;
}

export interface Room {
  id: EntityId;
  status: RoomStatus;
  settings: RoomSettings;
  hostId: EntityId;
  players: RoomPlayer[];
  battleId?: EntityId;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface CreateRoomRequest {
  name: string;
  maxPlayers?: number;
  mapId: string;
  turnTimeLimit?: number;
  isPrivate?: boolean;
  password?: string;
  rules?: Record<string, unknown>;
}

export interface JoinRoomRequest {
  password?: string;
  team?: number;
}

// ============================================
// 六、战斗运行时
// ============================================

/** 阶段二：装备战斗状态（耐久 / 独立 HP / 机动） */
export interface BattleEquipment {
  name: string;
  type: string;        // 武器 / 防具 / 载具 / 背包
  slot?: string;
  mobility?: number;
  hp: number;
  maxHp: number;
  durability: number;
  maxDurability: number;
  destroyed: boolean;
  isShield: boolean;   // 防具/背包：独立伤害吸收槽
}

export interface BattleUnit {
  unitId: EntityId;
  matrixId: EntityId;
  ownerId: EntityId;
  position: HexCoord;
  currentStats: UnitStats;
  skills: UnitSkill[];
  statusEffects: StatusEffect[];
  // 🟢 鹦鹉螺号元驱动行动计数池：取代硬编码 hasMoved/hasAttacked，
  // 天然吞噬并完美兼容一切 TRPG 规则的多动/残余行动点机制
  // 默认机战规则积木：{ MOVE: 1, ATTACK: 1 }
  action_points: Record<string, number>;
  // Phase 30-Cover: 战场端渲染补全字段（由 deploy-unit / initialize 注入，供前端渲染圆标/七视图）
  faction?: string;
  name?: string;
  codename?: string;
  unitCode?: string;
  type?: string;
  /** 七视图 URL 映射：{ "0": 正视图URL, ... "6": 方向6 URL }，每方向独立 PNG */
  viewUrls?: Record<string, string> | string;
  /** 阶段二：装备耐久/独立HP状态 */
  equipState?: BattleEquipment[];
  /** 阶段二：移动范围（= 有效机动总和，实际可走格子数） */
  moveRange?: number;
  /** 阶段二：基准机动（仅机体机动，机动差额基准） */
  mobility?: number;
  /** 阶段二规则6 Royroy 浮游辅机（属性模型，非独立单位） */
  royroy?: RoyroyState;
}

/** Royroy 浮游辅机状态（随主机行动，非独立 BattleUnit） */
export interface RoyroyState {
  name: string;
  attack: number;
  defense: number;
  hp: number;
  maxHp: number;
  /** 是否自动化技能：true=绑定主机随动（主机移动后自动重定位至邻域空格）；false=定点炮台/地雷，绝对不可移动 */
  isAuto: boolean;
  /** 部署模式：follow(随动) | fixed(定点) */
  deployMode: 'follow' | 'fixed';
  /** 生命周期：inactive(未部署) | deployed(场上) | destroyed(被击毁，本局不可再部署/回收) */
  status: 'inactive' | 'deployed' | 'destroyed';
  /** 是否已部署（冗余于 status，便于前端判断） */
  deployed: boolean;
  /** 场上坐标（部署后有效） */
  q?: number;
  r?: number;
  /** 回收冷却：battle.round 达到此值前不可再部署、技能不可用 */
  cooldownRound?: number;
}

export interface StatusEffect {
  id: EntityId;
  type: string;
  duration: number;
  remainingTurns: number;
  params: Record<string, unknown>;
}

export interface BattleState {
  id: EntityId;
  phase: BattlePhase;
  turn: number;
  activeUnitId: EntityId;
  units: Map<EntityId, BattleUnit>;
  map: BattlefieldMap;
  log: BattleLogEntry[];
  startedAt: ISODateTime;
  /** 阶段二规则：阵营行动顺序（攻击→防守→偷袭，空角色跳过），元素为 faction 键 */
  factionTurnOrder: string[];
  /** 当前行动阵营（faction 键） */
  activeFaction: string;
  /** 当前阵营在 factionTurnOrder 中的索引 */
  activeFactionIndex: number;
  /** 战斗回合（一轮 = 所有活跃阵营各行动一次） */
  round: number;
}

export interface BattleLogEntry {
  timestamp: ISODateTime;
  type: LexicalToken | string;
  actor: EntityId;
  target?: EntityId;
  data: Record<string, unknown>;
}

// ============================================
// 七、技能执行 DSL
// ============================================

/** 定状补句式 DSL 中间表示 */
export interface SkillASTNode {
  type: 'predicate' | 'attribute' | 'adverbial' | 'complement' | 'condition' | 'loop';
  token: string;
  value?: string | number;
  children: SkillASTNode[];
}

export interface SkillExecutionContext {
  caster: BattleUnit;
  target: BattleUnit;
  battlefield: BattleState;
  diceRoll: () => number;
  loopCount: number;
}

export interface SkillExecutionResult {
  success: boolean;
  damage: number;
  damageType: DamageType;
  effects: StatusEffect[];
  log: string[];
  error?: string;
}

// ============================================
// 八、观战流
// ============================================

export interface WatchEvent {
  battleId: EntityId;
  timestamp: number;
  events: BattleLogEntry[];
}
