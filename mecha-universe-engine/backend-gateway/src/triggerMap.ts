/**
 * 触发器映射表（批次1 · 1.2）
 * 编辑器 TIMING 枚举 ↔ 引擎 fireReaction 事件名。
 *
 * 背景：Phase A 已将「编辑器枚举(enums.mirror.js) ≡ shared-kernel TIMING ≡ 引擎事件名」
 * 三头对齐，绝大多数触发器为 1:1 直映。本文件作为「正式桥接表」固化该映射，
 * 并显式标注仍需「事件 + 条件」复合表达的 67 原子语义（如 A11 低血量），
 * 以消除「命名零交集」残留。
 *
 * 新增接线点时必须：① 在 shared-kernel TIMING 加键 → ② 跑 sync-enums.mjs 同步前端镜像
 * → ③ 在此表登记 → ④ 在 combat.ts GATEWAY_KNOWN_TRIGGERS 登记（启动自检）。
 */

// 编辑器 TIMING 选项 → 引擎 fireReaction 事件名（1:1 直映，键即事件名）
export const EDITOR_TIMING_TO_ENGINE: Record<string, string> = {
  on_attacked: 'on_attacked',
  on_damage_dealt: 'on_damage_dealt',
  post_melee_damage: 'post_melee_damage',
  on_kill: 'on_kill',
  on_attack_start: 'on_attack_start',
  on_target_selected: 'on_target_selected',
  on_turn_start: 'on_turn_start',
  on_round_start: 'on_round_start',
  on_ally_attacked: 'on_ally_attacked',
  on_move_path: 'on_move_path',
  on_step_point: 'on_step_point',
  on_airdrop_received: 'on_airdrop_received',
  none: 'none',
};

// 反向映射：引擎事件 → 编辑器 TIMING 选项（引擎回写 UI 用）
export const ENGINE_TO_EDITOR_TIMING: Record<string, string> = Object.fromEntries(
  Object.entries(EDITOR_TIMING_TO_ENGINE).map(([k, v]) => [v, k]),
);

// 复合触发：编辑器单一时机概念的原子，实际需「事件 + 条件」组合表达。
// 这些并非独立引擎事件，由 WHEN 事件 + IF 条件（CONDITION_TYPE）复合承载。
export const COMPOSITE_TRIGGERS: Record<string, { when: string; ifCond?: string; note: string }> = {
  // A11 低血量触发：受击/造成伤害后，IF 自身 HP < 阈值
  low_hp: {
    when: 'on_damage_dealt',
    ifCond: 'hp_compare',
    note: 'B2 HP<阈值；由 WHEN(on_damage_dealt) + IF(hp_compare) 复合，非单一引擎 trigger',
  },
  // A12 每局限次：任意事件 + limit_scope=match 复合
  per_match_limit: {
    when: 'on_attacked',
    note: 'A12 每局限次 = 任意事件 + limit_scope=match（由 battle_id/round 计数钳制）',
  },
  // H1 目标被选中预检：on_target_selected 即通用合法性闸门（见 generic_target_select.cjs）
  target_selected_precheck: {
    when: 'on_target_selected',
    note: 'on_target_selected 由 generic_target_select 注册为通用预检（目标存在/未阵亡/非自杀），与 duel 解耦',
  },
};

/** 解析编辑器时机键 → 引擎事件名（复合触发返回其主事件名） */
export function resolveEditorTrigger(timingKey: string): string {
  return EDITOR_TIMING_TO_ENGINE[timingKey] ?? timingKey;
}
