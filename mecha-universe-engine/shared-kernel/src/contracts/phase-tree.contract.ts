/**
 * phase-tree.contract.ts — 六段递归段树强契约（补完计划步骤3）
 *
 * 背景（词条库与战斗引擎补完计划-2026-08-09 · 断点3）：
 *   v1 的词条形状是「扁平六段」——timing / conditions / target / roll.segments / effects / cost，
 *   IF 段只能表达「与门（全部满足才继续）」，无法表达分叉；ROLL 段虽有 segments 分叉，
 *   但分支内部只能挂 effects[]，不能再嵌一层完整六段。
 *
 * v2（schema_version = 2）引入递归段树：
 *   tree: PhaseNode[]（顶层按 WHEN/IF/WHO/ROLL/DO/COST 六段各一节点）
 *   PhaseNode = { phase, atoms[], branches[], children[] }
 *   PhaseBranch = { label, when?, lower?, upper?, effects[], children[] }
 *     - IF 段分支用 `when`（条件表达式/条件原子标识），留空视为 else 兜底分支
 *     - ROLL 段分支用 `lower`/`upper`（闭区间点数）
 *     - branch.children 可再挂完整 PhaseNode，实现递归（深度上限 3 层）
 *
 * 兼容策略：v2 与 v1 双写。编辑器保存时同时产出 tree（新）与 effects/roll.segments/conditions（旧投影），
 * 引擎优先走 tree，缺失时回落 v1，保证存量词条零破坏。
 *
 * @module @mecha/shared-kernel/contracts/phase-tree
 */

import { z } from 'zod';

/**
 * 六段相位枚举（编排泳道键，与编辑器 LANE_SKELETON 一一对应）
 *
 * ★ 2026-09-02 修正：六段定稿 = `WHEN → IF → ROLL → DO → AFTER → COST`
 *   - **删除 `WHO`**：WHO 段已废止，降级为 `DO` 段首置前导原子 `B_TARGET`（handlerKey `resolve_target`）
 *   - **插入 `AFTER`**：后效段（持续 buff / 链式 / 清理），位于 `DO` 之后、`COST` 之前
 *   - 依据：工作区根目录 `docs/原子记录-20260823.md` 第一节（权威真相源）
 *   - ⚠️ 修改本枚举后**必须 `npm run build`** 同步 `dist/`（gateway 运行时消费 dist 产物）
 */
export const PhaseEnum = z.enum(['WHEN', 'IF', 'ROLL', 'DO', 'AFTER', 'COST']);
export type PhaseKey = z.infer<typeof PhaseEnum>;

/** 段树深度上限：顶层节点为 0 层，branch.children / node.children 各下探一层 */
export const PHASE_TREE_MAX_DEPTH = 3;

/**
 * 段内原子：`type` 必须是引擎 effectExecutor handler 真名（或其已注册别名），
 * 其余字段为该原子的参数，passthrough 保留。
 * `atom_key` 为编辑器侧原子标识（如 'map_cannon' / 'action_debt_turn'），
 * 仅用于回读时还原参数表单，引擎不消费。
 */
export const PhaseAtomContract = z.object({
  type: z.string().min(1),
  atom_key: z.string().optional(),
}).passthrough();
export type PhaseAtom = z.infer<typeof PhaseAtomContract>;

/** 段树节点 / 分支（互相递归，用 z.lazy 打结） */
export interface PhaseNode {
  phase: PhaseKey;
  atoms: PhaseAtom[];
  branches: PhaseBranch[];
  children?: PhaseNode[];
}

/**
 * ROLL 取代式语义（Phase RollReplace，2026-08-12）：
 * 当某主六段的 ROLL 节点含 `branches` 且掷骰落入任一分支区间时，主链 DO/COST 段
 * 由「命中分支的 children 中对应 DO/COST 段」取代，主链 DO/COST 不再结算。
 * - 分支内 DO/COST 为空（无原子）→ 该段为空结算，引擎 log 明确提示，不回退主链。
 * - 掷骰未落入任何分支区间（空隙）→ 主链 DO/COST 作为兜底正常结算。
 * - 无 branches（未插分段）→ 走主链 DO/COST，行为不变。
 * - `rollBranchHit` 标志必须为 `_walkPhaseTree` 当前栈帧局部变量，多重 ROLL 递归互不污染。
 */
export interface PhaseBranch {
  label: string;
  /** IF 分叉条件（留空 = else 兜底分支） */
  when?: string;
  /** ROLL 分叉区间下界（闭） */
  lower?: number;
  /** ROLL 分叉区间上界（闭） */
  upper?: number;
  effects: PhaseAtom[];
  children?: PhaseNode[];
}

export const PhaseBranchContract: z.ZodType<PhaseBranch> = z.lazy(() =>
  z.object({
    label: z.string().default(''),
    when: z.string().optional(),
    lower: z.number().optional(),
    upper: z.number().optional(),
    effects: z.array(PhaseAtomContract).default([]),
    children: z.array(PhaseNodeContract).optional(),
  })
);

export const PhaseNodeContract: z.ZodType<PhaseNode> = z.lazy(() =>
  z.object({
    phase: PhaseEnum,
    atoms: z.array(PhaseAtomContract).default([]),
    branches: z.array(PhaseBranchContract).default([]),
    children: z.array(PhaseNodeContract).optional(),
  })
);

/** 顶层段树：允许缺段（缺段视为空段，引擎按顺序跳过） */
export const PhaseTreeContract = z.array(PhaseNodeContract);
export type PhaseTree = z.infer<typeof PhaseTreeContract>;

/** 词条 v2 段树包装：{ schema_version: 2, tree: [...] } */
export const PhaseTreeEnvelopeContract = z.object({
  schema_version: z.literal(2),
  tree: PhaseTreeContract,
}).passthrough();

/** 判定一个词条对象是否已升级到 v2 段树 */
export function isPhaseTreeV2(skill: any): boolean {
  return !!skill
    && Number(skill.schema_version) === 2
    && Array.isArray(skill.tree)
    && skill.tree.length > 0;
}

/** 取段树中指定相位的节点（缺失返回 undefined） */
export function getPhaseNode(tree: PhaseTree | undefined, phase: PhaseKey): PhaseNode | undefined {
  if (!Array.isArray(tree)) return undefined;
  return tree.find((n) => n && n.phase === phase);
}
