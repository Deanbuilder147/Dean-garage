/**
 * Phase A — 词表与契约统一：战斗词条枚举唯一真相源
 * ------------------------------------------------------------------
 * 所有子包（backend-gateway / combat-service / frontend）统一从这里导入，
 * 消除「编辑器枚举 ≡ shared-kernel 枚举 ≡ handler key」三头分化（见改造报告第七章）。
 *
 * 命名约定：枚举值为运行时实际字符串（与 JSON / handler key 一一对应），
 * 暴露 `XxxKey = keyof typeof XXX` 类型供严格校验。
 * 本文件为 Phase A「前期筹备」种子枚举；Phase C/D 会据此对齐 effectExecutor /
 * reactionHandlers 的实际 key，确保枚举值 == handler 注册 key。
 */

/**
 * 触发时机 TIMING —— 统一事件总线名。
 *
 * 【Phase A 收口·2026-08-13】以前此处用「语义事件命名」(on_attacked/on_damage_dealt/
 * post_melee_damage)，与 combatIntegrator.cjs 实际点火名(pre_damage/on_damage/
 * post_damage/on_damage_taken) 及 reactionHandlers 注册 key 三套并存，导致「结算阶段
 * ↔ 原子时机」对齐永远对不齐。现以 combatIntegrator 运行时点火名为【唯一真相源】，
 * 枚举值 == 点火字符串 == reactionHandlers 注册 key。
 *
 * 运行时点火清单（combatIntegrator.cjs triggerPhase 调用）：
 *   round_start / turn_start / turn_end
 *   pre_attack / pre_damage / on_damage / post_damage
 *   on_kill / on_death / on_damage_taken / post_attack
 *   movement_check
 * 其余（PRE_SKILL/POST_SKILL/PRE_HEAL/POST_HEAL/ON_HIT 等）为 Godot 侧预留，非后端点火。
 */
export const TIMING = {
  // —— 回合/轮次生命周期（运行时点火）——
  ROUND_START: 'round_start',
  TURN_START: 'turn_start',
  TURN_END: 'turn_end',
  // —— 攻击/伤害结算流程（运行时点火，combatIntegrator.executeAttack）——
  PRE_ATTACK: 'pre_attack',
  PRE_DAMAGE: 'pre_damage',
  ON_DAMAGE: 'on_damage',
  POST_DAMAGE: 'post_damage',
  ON_KILL: 'on_kill',
  ON_DEATH: 'on_death',
  ON_DAMAGE_TAKEN: 'on_damage_taken',
  POST_ATTACK: 'post_attack',
  // —— 移动（运行时点火）——
  MOVEMENT_CHECK: 'movement_check',
  // —— Godot 侧预留（非后端点火，保持枚举一致以便跨端通信）——
  PHASE_START: 'phase_start',
  PHASE_END: 'phase_end',
  ROUND_END: 'round_end',
  PRE_MOVE: 'pre_move',
  POST_MOVE: 'post_move',
  PRE_SKILL: 'pre_skill',
  POST_SKILL: 'post_skill',
  PRE_HEAL: 'pre_heal',
  POST_HEAL: 'post_heal',
  ON_HIT: 'on_hit',
  CONDITIONAL: 'conditional',
  // —— 历史语义别名（已废弃，保留仅作向后兼容，勿在新代码使用）——
  ON_ATTACKED: 'on_attacked',
  ON_DAMAGE_DEALT: 'on_damage_dealt',
  POST_MELEE_DAMAGE: 'post_melee_damage',
  ON_ATTACK_START: 'on_attack_start',
  ON_TARGET_SELECTED: 'on_target_selected',
  ON_ALLY_ATTACKED: 'on_ally_attacked',
  ON_MOVE_PATH: 'on_move_path',
  ON_STEP_POINT: 'on_step_point',
  ON_AIRDROP_RECEIVED: 'on_airdrop_received',
  ON_BATTLE_START: 'on_battle_start',
} as const;
export type TimingKey = keyof typeof TIMING;

/**
 * ★ B-4：PatchContract.field 枚举（语义="改哪个单位属性字段"）。
 * 值域取自 UnitStatsContract 的 9 个属性键，与 EFFECT_TYPE（"效果做什么"）是不同轴，
 * 不复用。A-5 的 applyPatch 写回出口消费此枚举做增量 Diff field 判定。
 */
export const PATCH_FIELD = {
  HP: 'hp',
  MAX_HP: 'max_hp',
  ATTACK: 'attack',
  DEFENSE: 'defense',
  ARMOR: 'armor',
  SHIELD: 'shield',
  MOBILITY: 'mobility',
  EVASION: 'evasion',
  ACCURACY: 'accuracy',
} as const;
export type PatchFieldKey = keyof typeof PATCH_FIELD;

/**
 * ★ B-4 / I-6：地形键规范枚举（新建词条/契约的真相源）。
 * 注意：现有存量地图含 ruins（非 ruin）、void、space 等枚举外值，
 * 故 TerrainCellContract.terrain_key 仍保持 EnglishKey 宽松校验，本枚举仅作新契约引用与未来迁移基准，
 * 不强制收紧（避免存量地图加载即 400）。
 */
export const TERRAIN_KEY = {
  PLAIN: 'plain',
  FOREST: 'forest',
  MOUNTAIN: 'mountain',
  WATER: 'water',
  RUIN: 'ruin',
  CRYSTAL: 'crystal',
  MOON: 'moon',
} as const;
export type TerrainKeyKey = keyof typeof TERRAIN_KEY;

/**
 * ★ C-6：装备槽位规范枚举（slotKey 枚举化）。与 toExecutorUnit 投影的 equipState[].slot 对齐。
 */
export const EQUIP_SLOT = {
  LEFT: 'left',
  RIGHT: 'right',
  EXTRA: 'extra',
  CORE: 'core',
  CHASSIS: 'chassis',
} as const;
export type EquipSlotKey = keyof typeof EQUIP_SLOT;

/** 效果类型 EFFECT_TYPE —— 与 effectExecutor handler key 对齐（种子，Phase C 收口） */
export const EFFECT_TYPE = {
  DAMAGE: 'damage',
  RECOVERY: 'recovery',
  STATUS: 'status',
  DISPLACEMENT: 'displacement',
  INSTANT_KILL: 'instant_kill',
  MUTUAL_DESTRUCTION: 'mutual_destruction',
  DUEL_RESOLUTION: 'duel_resolution',
  PLUNDER: 'plunder',
  GRANT_TURN: 'grant_turn',
  ASSIST_CHOICE: 'assist_choice',
  SPAWN_ITEMS: 'spawn_items',
  ENTER_STEALTH: 'enter_stealth',
  REVEAL: 'reveal',
  SCAN: 'scan',
  VISIBILITY: 'visibility',
  NEUTRAL_OPTION: 'neutral_option',
  BLOCKADE: 'blockade',
  REWRITE_ORDER: 'rewrite_order',
  TAKEOVER_TURN: 'takeover_turn',
  PREPAY: 'prepay',
  PREPAY_TURN: 'prepay_turn',
  GRANT_ACTION: 'grant_action',
  REVOKE_ACTION: 'revoke_action',
  CHARGE: 'charge',
  MUTEX_STATUS: 'mutex_status',
  PERMANENT_DISABLE: 'permanent_disable',
  MODIFY_STAT: 'modify_stat',
} as const;
export type EffectTypeKey = keyof typeof EFFECT_TYPE;
// S2：稳定有序的 key 列表（供前端 EffectStackBuilder 下拉直接遍历，消除「4 种局限类型」硬编码）
export const EFFECT_TYPE_KEYS = Object.keys(EFFECT_TYPE) as EffectTypeKey[];

/** 掷骰模式 ROLL_MODE —— 3.3 可插拔 1–6 数值生成 */
export const ROLL_MODE = {
  NONE: 'none',
  DICE: 'dice',
  SPINNER: 'spinner',
  CARD_DRAW: 'card_draw',
  ROCK_PAPER_SCISSORS: 'rps',
} as const;
export type RollModeKey = keyof typeof ROLL_MODE;

/** 作用域限次 LIMIT_SCOPE —— 与 cooldown（时间轴）正交（见第九章 ⑨） */
export const LIMIT_SCOPE = {
  MATCH: 'match',
  FACTION: 'faction',
  PERSONAL: 'personal',
  PER_TURN: 'per_turn',
} as const;
export type LimitScopeKey = keyof typeof LIMIT_SCOPE;

/**
 * 数值生成方法 VALUE_METHOD —— P0-4 可插拔方法层
 * 产出 1–6 原始数值，经 segments 映射归一；与 ROLL_MODE 同义收敛到一处。
 */
export const VALUE_METHOD = {
  DICE: 'dice',
  SPINNER: 'spinner',
  CARD: 'card',
  RPS: 'rps',
} as const;
export type ValueMethodKey = keyof typeof VALUE_METHOD;

/** 条件类型 CONDITION_TYPE —— B 组条件门槛，统一 when.conditions[] 复数数组（见第九章 ⑤） */
export const CONDITION_TYPE = {
  IN_RANGE: 'in_range',
  MUTUAL_IN_RANGE: 'mutual_in_range',
  HP_COMPARE: 'hp_compare',
  STAT_COMPARE: 'stat_compare',
  COLLINEAR_ADJACENT: 'collinear_adjacent',
  TERRAIN_MATCH: 'terrain_match',
  DAMAGE_KIND_MATCH: 'damage_kind_match',
  HAS_NOT_ACTED: 'has_not_acted',
  NOT_IN_SCAN: 'not_in_scan',
} as const;
export type ConditionTypeKey = keyof typeof CONDITION_TYPE;

/** 词条录入类型 ENTRY_TYPE —— entryType 字段取值（Phase E 扩展 special / faction） */
export const ENTRY_TYPE = {
  SKILL: 'skill',
  FACTION: 'faction',
  SPECIAL: 'special',
  SYSTEM: 'system',
} as const;
export type EntryTypeKey = keyof typeof ENTRY_TYPE;
