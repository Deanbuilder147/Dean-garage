/**
 * patch.contract.ts — 增量状态写回强契约（B-4 / A-5）
 *
 * PatchContract 是 A-5「applyPatch 单一原子写回出口」的输入契约。
 * field 枚举化（PATCH_FIELD），禁止裸字符串；op 限定 set/add/sub 三种语义。
 * 该契约只在 applyPatch 入口消费（A-5 落地），本文件仅定义契约与类型。
 *
 * @module @mecha/shared-kernel/contracts/patch
 */

import { z } from 'zod';
import { EntityId } from './primitives.js';
import { PATCH_FIELD } from '../enums.js';

/** 单条字段级补丁 */
export const StatePatchItemContract = z.object({
  unitId: EntityId,
  /** 改哪个单位属性字段（取值见 PATCH_FIELD，与 UnitStatsContract 9 键对应） */
  field: z.nativeEnum(PATCH_FIELD),
  /** 操作语义：set 直接赋值 / add 累加 / sub 累减 */
  op: z.enum(['set', 'add', 'sub']),
  value: z.number(),
});
export type StatePatchItem = z.infer<typeof StatePatchItemContract>;

/** 一批原子写回：要么全成功，要么全回滚（A-5 五条不变量守卫） */
export const PatchContract = z.object({
  statePatch: z.array(StatePatchItemContract).min(1),
});
export type BattlePatch = z.infer<typeof PatchContract>;
