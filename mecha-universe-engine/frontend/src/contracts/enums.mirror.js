/**
 * ⚠️ 自动镜像文件 —— 勿手动编辑。
 * 真相源：@mecha/shared-kernel/src/enums.ts
 * 生成：scripts/sync-enums.mjs
 * 一致性：scripts/test-enum-consistency.mjs（CI 断言相等）
 *
 * Phase A 词表与契约统一：前端未纳入 monorepo，故以「逐字镜像 + 注释约束 +
 * 一致性断言」方式保持 编辑器枚举 ≡ shared-kernel 枚举 ≡ 引擎 handler key 三头一致。
 * 改 shared-kernel/src/enums.ts 后必须重跑 sync-enums.mjs 并跑一致性测试。
 */

export const TIMING = {
  ON_ATTACKED: 'on_attacked',
  ON_DAMAGE_DEALT: 'on_damage_dealt',
  POST_MELEE_DAMAGE: 'post_melee_damage',
  ON_KILL: 'on_kill',
  ON_ATTACK_START: 'on_attack_start',
  ON_TARGET_SELECTED: 'on_target_selected',
  ON_TURN_START: 'on_turn_start',
  ON_ROUND_START: 'on_round_start',
  ON_ALLY_ATTACKED: 'on_ally_attacked',
  ON_MOVE_PATH: 'on_move_path',
  ON_STEP_POINT: 'on_step_point',
  ON_AIRDROP_RECEIVED: 'on_airdrop_received',
};

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
};
// S2：与 shared-kernel EFFECT_TYPE_KEYS 对齐的有序 key 列表（前端下拉唯一遍历源）
export const EFFECT_TYPE_KEYS = Object.keys(EFFECT_TYPE);

export const ROLL_MODE = {
  NONE: 'none',
  DICE: 'dice',
  SPINNER: 'spinner',
  CARD_DRAW: 'card_draw',
  ROCK_PAPER_SCISSORS: 'rps',
};

export const LIMIT_SCOPE = {
  MATCH: 'match',
  FACTION: 'faction',
  PERSONAL: 'personal',
  PER_TURN: 'per_turn',
};

export const VALUE_METHOD = {
  DICE: 'dice',
  SPINNER: 'spinner',
  CARD: 'card',
  RPS: 'rps',
};

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
};

export const ENTRY_TYPE = {
  SKILL: 'skill',
  FACTION: 'faction',
  SPECIAL: 'special',
  SYSTEM: 'system',
};

export default { TIMING, EFFECT_TYPE, ROLL_MODE, LIMIT_SCOPE, VALUE_METHOD, CONDITION_TYPE, ENTRY_TYPE };
