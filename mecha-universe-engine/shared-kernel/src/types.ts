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
  /** Phase 29-P1: 五级角色（guest/user/referee/admin/dominator） */
  role: UserRole;
  /** 等级-功能权限矩阵：当前账号等级被授权启用的功能键列表 */
  features?: string[];
  /** Phase 29-P1: 每日 AI 形象生成积分 */
  credits: number;
  /** 续接战局：最近一次创建/加入的房间 id（跨浏览器，存于 DB，登录时下发） */
  lastRoomId?: EntityId | null;
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
  /** ⚠️ 仅作"远程/近战分类"展示信号；已废除其射程判定用途（2026-08-02 归拢改造）。
   *  战斗射程一律由技能定义经 getSkillRangeFields（shared-kernel 真相源）决定。 */
  range: number;
  min_range?: number;
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
  /** T5 强引用锚点：绑定全局词条时的 skill_key（英文）；未绑定则留空（降级为软关联副本） */
  skill_key?: string;
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

// 角色剥离双轨制（2026-07-30）：权限身份与战术席位正交
export type RoomIdentity = 'player' | 'referee' | 'visitor';
export type TacticalSlot = 'attack' | 'defense' | 'ambush';

export interface RoomPlayer {
  userId: EntityId;
  username: string;
  faction: string;
  team: number;
  ready: boolean;
  joinedAt: ISODateTime;
  // 双轨制字段（替代被重载的 room_players.role）
  identityRole?: RoomIdentity;
  tacticalSlot?: TacticalSlot | null;
  // 兼容遗留字段
  role?: string;
  isSpectator?: boolean;
  selectedUnits?: string[];
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
  /** 方案A：轮转角色(attack/defense/ambush)。逻辑判定(敌我/可见/胜负/技能)的唯一依据；faction 仅用于展示。 */
  role?: string;
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
  /** ⚠️ 仅作"远程/近战分类"展示信号（= 1 + floor(射击/25)）；已废除其射程判定用途（2026-08-02 归拢改造）。
   *  战斗射程一律由技能定义经 getSkillRangeFields 决定。 */
  range?: number;
  /** A5-hold_position 契约对齐：与 position 同源暴露顶层坐标，供 victoryChecker 读取占位（部署/移动同步更新） */
  q?: number;
  r?: number;
  /** 阶段二规则6 Royroy 浮游辅机（属性模型，非独立单位） */
  royroy?: RoyroyState;
  /** 归一化部件（attributes.parts）：供前端拆解「主机体移动力 + 额外移动力」，装备舍弃时响应式重算 */
  parts?: any;
  /** 单位体型（体积）：s / m / l / xl，影响 HP/机动/渲染缩放/战斗尺寸修正 */
  size?: string;
  /** 机体基础属性（编辑器原始值）：射击值 / 格斗值 / 机动值，供前端单位卡片展示 */
  main_射击?: number;
  main_格斗?: number;
  main_机动?: number;
  /** 顶层 HP 快照（= currentStats.hp 同源，applySizeHp 修正后）：供前端 dead 判定/渲染直接读取，避免 (unit.hp ?? 0) 误判阵亡 */
  hp?: number;
  /** 顶层最大 HP 快照（= currentStats.maxHp 同源） */
  maxHp?: number;
  /** 临时机动 Buff（被更大机体攻击时获得，下回合移动 +N），由 BuffManager 写入 */
  mobility_buff?: number;
  /** 机动 Buff 剩余回合（与 mobility_buff 配套） */
  mobility_buff_turns?: number;
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
  /** A8 阵营继承：部署时由母机透传，确保 Royroy 被战斗核心的友军/敌军识别与归属逻辑正确处理 */
  faction?: string;
  ownerId?: EntityId;
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
  /**
   * 阶段二规则：阵营行动顺序（攻击→防守→偷袭，空角色跳过）。
   * 元素为「角色键」：'attack' | 'defense' | 'ambush'（不再使用 earth/balon/maxion 等势力键）。
   */
  factionTurnOrder: string[];
  /** 当前行动角色（角色键：attack/defense/ambush） */
  activeFaction: string;
  /** faction 键 → 角色键 的映射（决定某棋子归属哪个行动角色）。未列出的势力默认归入 attack。 */
  factionRoles?: Record<string, string>;
  /** 当前角色在 factionTurnOrder 中的索引 */
  activeFactionIndex: number;
  /** 战斗回合（一轮 = 所有活跃阵营各行动一次） */
  round: number;
  /**
   * Phase 6：AI 控制的角色键集合（'attack' | 'defense' | 'ambush'）。
   * 这些角色在 end-turn 切到其行动时，由服务端异步驱动 AI 自动行动；
   * 不在集合内的角色视为人类玩家操控。缺省为空数组（无 AI）。
   */
  aiRoles?: string[];
  /**
   * Phase 6：AI 回合期间累积的增量行动序列，随每步全量快照推送，
   * 供客户端逐步平滑播放（移动补间 / 受击飘字）。结构见 AiActionEntry。
   */
  aiActions?: AiActionEntry[];
}

/** Phase 6：AI 单步行动增量（随全量快照推送，客户端用于播放） */
export interface AiActionEntry {
  type: 'move' | 'attack' | 'skill' | 'end_turn';
  unitId: EntityId;
  from?: { q: number; r: number };
  to?: { q: number; r: number };
  targetId?: EntityId;
  skillKey?: string;
  // 阶段 6：combat_result 除既有任意字段外，显式承载机动/姿态分阶段数据（来自 damagePipe.stages）
  combat_result?: Record<string, any> & Partial<MobilityBreakdown>;
}

/**
 * 阶段 6·机动差值与姿态数据透传契约
 * 由 damagePipe.cjs 阶段 2/3/6 真实产出，combat.ts 在 /attack 与 aiActions 注入，
 * Godot Battle3D.gd 消费并在 BattleLog 结构化输出。
 * 字段名严格对齐 damagePipe.stages，禁止臆造：
 *  - mobility_diff: 攻方有效机动 - 守方有效机动（封顶 +5，下限不限）；每点 +1 攻击力（temp_attack = base + diff）
 *  - sniper_mobility_reduction: 狙击技能对目标机动的减免（0 表示无）
 *  - height_bonus: 高地优势加成（地形姿态类）
 *  - attacker_stance / defender_stance: 攻防姿态（'defensive' | 'aggressive' | ...），来自 unit.stance
 */
export interface MobilityBreakdown {
  mobility_diff?: number;
  sniper_mobility_reduction?: number;
  height_bonus?: number;
  attacker_stance?: string;
  defender_stance?: string;
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
