import { z } from 'zod';

/**
 * 战斗服务 Zod 验证 Schema
 * 
 * 用于验证所有 API 请求的输入数据，防止非法操作和数据损坏
 */

// UUID 格式验证
const uuidSchema = z.string().uuid('无效的 ID 格式');

// 坐标验证 (六边形网格，范围 0-15)
const coordinateSchema = z.object({
  q: z.number().int().min(0, 'Q 坐标不能小于 0').max(15, 'Q 坐标不能大于 15'),
  r: z.number().int().min(0, 'R 坐标不能小于 0').max(15, 'R 坐标不能大于 15'),
});

// 战斗动作类型枚举
const actionTypeSchema = z.enum(['move', 'attack', 'skill', 'item', 'wait'], {
  errorMap: () => ({ message: '无效的动作类型，必须是 move, attack, skill, item 或 wait' }),
});

// 阵营枚举
const factionSchema = z.enum(['earth', 'byron', 'maxion'], {
  errorMap: () => ({ message: '无效的阵营，必须是 earth, byron 或 maxion' }),
});

// 创建战斗 Schema
export const createBattleSchema = z.object({
  battlefield_id: uuidSchema.refine(val => val, { message: '战场 ID 格式无效' }),
  room_id: uuidSchema.optional().refine(val => !val || val, { message: '房间 ID 格式无效' }),
  players: z.array(z.object({
    user_id: uuidSchema.refine(val => val, { message: '玩家 ID 格式无效' }),
    faction: factionSchema.refine(val => val, { message: '玩家阵营无效' }),
    seat_index: z.number().int().min(0).max(7).optional(),
  })).min(1, '至少需要 1 个玩家').max(8, '最多 8 个玩家'),
});

// 执行移动 Schema
export const moveSchema = z.object({
  unit_id: uuidSchema.refine(val => val, { message: '单位 ID 格式无效' }),
  target_q: z.number().int().min(0, '目标 Q 坐标不能小于 0').max(15, '目标 Q 坐标不能大于 15'),
  target_r: z.number().int().min(0, '目标 R 坐标不能小于 0').max(15, '目标 R 坐标不能大于 15'),
});

// 执行攻击 Schema
export const attackSchema = z.object({
  attacker_id: uuidSchema.refine(val => val, { message: '攻击者 ID 格式无效' }),
  target_id: uuidSchema.refine(val => val, { message: '目标 ID 格式无效' }),
  attack_type: z.enum(['melee', 'ranged', 'skill'], {
    errorMap: () => ({ message: '无效的攻击类型，必须是 melee, ranged 或 skill' }),
  }).optional(),
  skill_id: uuidSchema.optional().refine(val => val, { message: '技能 ID 格式无效' }),
});

// 使用技能 Schema
export const skillSchema = z.object({
  unit_id: uuidSchema.refine(val => val, { message: '单位 ID 格式无效' }),
  skill_id: uuidSchema.refine(val => val, { message: '技能 ID 格式无效' }),
  target_unit_id: uuidSchema.optional().refine(val => val, { message: '目标单位 ID 格式无效' }),
  target_q: z.number().int().optional(),
  target_r: z.number().int().optional(),
});

// 使用物品 Schema
export const itemSchema = z.object({
  unit_id: uuidSchema.refine(val => val, { message: '单位 ID 格式无效' }),
  item_id: uuidSchema.refine(val => val, { message: '物品 ID 格式无效' }),
  target_unit_id: uuidSchema.optional(),
  target_q: z.number().int().optional(),
  target_r: z.number().int().optional(),
});

// 战斗动作 Schema (通用)
export const battleActionSchema = z.object({
  unit_id: uuidSchema.refine(val => val, { message: '单位 ID 格式无效' }),
  action_type: actionTypeSchema.refine(val => val, { message: '动作类型无效' }),
  target_id: uuidSchema.optional(),
  target_q: z.number().int().optional(),
  target_r: z.number().int().optional(),
  skill_id: uuidSchema.optional(),
  item_id: uuidSchema.optional(),
});

// 选择出生点 Schema
export const spawnSelectionSchema = z.object({
  player_id: uuidSchema.refine(val => val, { message: '玩家 ID 格式无效' }),
  spawn_q: z.number().int().min(0, '出生点 Q 坐标不能小于 0').max(15, '出生点 Q 坐标不能大于 15'),
  spawn_r: z.number().int().min(0, '出生点 R 坐标不能小于 0').max(15, '出生点 R 坐标不能大于 15'),
  unit_ids: z.array(uuidSchema).min(1, '至少需要选择 1 个单位'),
});

// 部署单位 Schema
export const deploymentSchema = z.object({
  unit_id: uuidSchema.refine(val => val, { message: '单位 ID 格式无效' }),
  q: z.number().int().min(0, '部署 Q 坐标不能小于 0').max(15, '部署 Q 坐标不能大于 15'),
  r: z.number().int().min(0, '部署 R 坐标不能小于 0').max(15, '部署 R 坐标不能大于 15'),
});

// 机甲配置 Schema
export const mechConfigSchema = z.object({
  mech_id: uuidSchema.refine(val => val, { message: '机甲 ID 格式无效' }),
  pilot_id: uuidSchema.optional(),
  loadout: z.object({
    head: z.string().optional(),
    core: z.string().optional(),
    arms: z.string().optional(),
    legs: z.string().optional(),
    left_hand: z.string().optional(),
    right_hand: z.string().optional(),
  }).optional(),
  skills: z.array(uuidSchema).max(8, '最多装备 8 个技能'),
});

/**
 * 验证辅助函数
 * 
 * @param schema - Zod schema
 * @param data - 要验证的数据
 * @returns { success: boolean, data?: any, error?: { code: string, details: Array } }
 */
export function validateRequest(schema, data) {
  try {
    const validated = schema.parse(data);
    return { success: true, data: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: '请求数据验证失败',
          details: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message,
            code: e.code,
          })),
        },
      };
    }
    throw error;
  }
}
