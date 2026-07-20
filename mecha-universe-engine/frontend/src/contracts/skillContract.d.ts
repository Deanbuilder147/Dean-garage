/**
 * skillContract.d.ts — 前端词条契约 TypeScript 类型定义（镜像后端 skillContract.cjs）
 * 与 skillContract.js 运行时模块字段名严格对齐，供编辑器类型提示（不进入打包）。
 */

export type Category = 'melee' | 'ranged' | 'automation' | 'support';
export type TargetScope = 'enemy' | 'ally' | 'enemy_equipment' | 'ally_equipment';
export type SkillShape = 'single' | 'fan' | 'linear' | 'concentric';
export type DamageKind = 'kinetic' | 'beam' | 'explosive' | 'corrosive' | 'thermal';
export type ActionType = 'attack' | 'heal' | 'buff' | 'debuff' | 'passive';
export type BranchAction = 'damage' | 'damage_bonus' | 'heal' | 'apply_status' | 'mobility_mod' | 'accuracy_mod';
export type DiceType = 4 | 6 | 8 | 10 | 12 | 20;

/** 投骰点数条目：离散点数 (exact) 或区间 (range) */
export type PointEntry =
  | { kind: 'exact'; value: number }
  | { kind: 'range'; min: number; max: number };

/** 《判定效果》：核心 6 项动作之一 */
export interface BranchEffect {
  action: BranchAction;
  value: number;
  status?: string | null;
  target?: string;
}

/** 《判定N》：生效点数集合 + 多条判定效果 */
export interface DiceBranch {
  id?: string;
  label?: string;
  points: PointEntry[];
  effects: BranchEffect[];
}

export interface CastRange {
  min: number;
  max: number;
}

/** 标准契约（Step 1 字段结构大一统） */
export interface SkillContract {
  key: string;
  name: string;
  category: Category;
  target_scope: TargetScope;
  cast_range: CastRange;
  skill_shape: SkillShape;
  damage_kind: DamageKind;
  action_type: ActionType;
  has_dice: boolean;
  dice_type: DiceType;
  dice_branches: DiceBranch[];
}

/** 编辑器内部 reactive 形状（含 UI 辅助字段与旧兼容镜像） */
export interface EditorSkill extends SkillContract {
  id?: string;
  label?: string;
  target_filter: string;
  min_cast_range: number;
  range_type: string;
  base_damage: number;
  status_effects: unknown[];
  attack_stat: string;
  accuracy_mod: number;
  evasion_mod: number;
  height_bonus_per_diff: number;
  requires_unmoved: boolean;
  requires_stealth: boolean;
  type: string;
  deterministic: boolean;
  trigger: string | null;
  dice_branches: Array<DiceBranch & { id: string; label: string }>;
}

export const SKILL_CATEGORIES: Category[];
export const CATEGORY_LABELS: Record<Category, string>;
export const TARGET_SCOPES: TargetScope[];
export const TARGET_SCOPE_LABELS: Record<TargetScope, string>;
export const SKILL_SHAPES: SkillShape[];
export const SKILL_SHAPE_LABELS: Record<SkillShape, string>;
export const BRANCH_ACTIONS: BranchAction[];
export const BRANCH_ACTION_LABELS: Record<BranchAction, string>;
export const DAMAGE_KINDS: DamageKind[];
export const DAMAGE_KIND_LABELS: Record<DamageKind, string>;
export const DICE_TYPES: DiceType[];
export const ACTION_TYPES: ActionType[];
export const ACTION_TYPE_LABELS: Record<ActionType, string>;

export function normalizeDamageKind(dk?: string): DamageKind;
export function normalizeSkill(raw?: Record<string, unknown>): Record<string, unknown>;
export function validateSkill(raw?: Record<string, unknown>): { valid: boolean; errors: string[]; normalized: Record<string, unknown> };
export function toContract(skill?: Record<string, unknown>): SkillContract;
export function hydrateSkill(raw?: Record<string, unknown>): EditorSkill;
export function serializeSkillToContract(editorShape?: Record<string, unknown>): Record<string, unknown>;

declare const SkillContract: {
  SKILL_CATEGORIES: Category[];
  CATEGORY_LABELS: Record<Category, string>;
  TARGET_SCOPES: TargetScope[];
  TARGET_SCOPE_LABELS: Record<TargetScope, string>;
  SKILL_SHAPES: SkillShape[];
  SKILL_SHAPE_LABELS: Record<SkillShape, string>;
  BRANCH_ACTIONS: BranchAction[];
  BRANCH_ACTION_LABELS: Record<BranchAction, string>;
  DAMAGE_KINDS: DamageKind[];
  DAMAGE_KIND_LABELS: Record<DamageKind, string>;
  DICE_TYPES: DiceType[];
  ACTION_TYPES: ActionType[];
  ACTION_TYPE_LABELS: Record<ActionType, string>;
  DAMAGE_KIND_ALIASES: Record<string, DamageKind>;
  LEGACY_FILTER_TO_SCOPE: Record<string, TargetScope>;
  SCOPE_TO_LEGACY_FILTER: Record<TargetScope, string>;
  LEGACY_RANGE_TO_SHAPE: Record<string, SkillShape>;
  SHAPE_TO_LEGACY_RANGE: Record<SkillShape, string>;
  normalizeDamageKind: typeof normalizeDamageKind;
  normalizeSkill: typeof normalizeSkill;
  validateSkill: typeof validateSkill;
  toContract: typeof toContract;
  hydrateSkill: typeof hydrateSkill;
  serializeSkillToContract: typeof serializeSkillToContract;
};

export default SkillContract;
