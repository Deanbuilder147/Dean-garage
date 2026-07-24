/**
 * 词条库 Excel 校验器（仅 skills 导入）
 *
 * 内嵌 skillContract 枚举副本，与 frontend/src/contracts/skillContract.js 保持同步。
 * 对 parser 产出的 skills 做全量校验，返回 { valid, errors, warnings }。
 * 注意：会对传入 skill 对象做就地归一（如 category=special → melee），便于落盘。
 */

import type { ParsedGlossaryExcel } from './glossary-excel-parser.js';

const VALID_CATEGORIES = ['melee', 'ranged', 'automation', 'support', 'auto', 'special'];
const VALID_TARGET_SCOPE = ['enemy', 'ally', 'self', 'enemy_equipment', 'ally_equipment'];
const VALID_SKILL_SHAPE = ['single', 'fan', 'linear', 'concentric'];
const VALID_DAMAGE_KIND = ['kinetic', 'beam', 'explosive', 'corrosive', 'thermal'];
const VALID_ACTION_TYPE = ['attack', 'heal', 'buff', 'debuff', 'passive'];
const VALID_TYPE = ['active', 'passive'];
const VALID_ATTACK_STAT = ['melee', 'ranged', 'max'];
const VALID_DICE_TYPE = ['4', '6', '8', '10', '12', '20'];
const VALID_BRANCH_ACTION = [
  'damage',
  'damage_bonus',
  'heal',
  'apply_status',
  'mobility_mod',
  'accuracy_mod',
];

export interface ValidationIssue {
  row?: number;
  key?: string;
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export function validateGlossaryExcel(parsed: ParsedGlossaryExcel): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const seenKeys = new Set<string>();

  for (const r of parsed.rows) {
    const { rowNumber, key, name, skill } = r;

    if (!key) {
      errors.push({ row: rowNumber, field: 'key', message: 'key 不能为空（唯一标识）' });
      continue;
    }
    if (!name) {
      errors.push({ row: rowNumber, key, field: 'name', message: 'name（展示名）不能为空' });
    }
    if (seenKeys.has(key)) {
      warnings.push({ row: rowNumber, key, field: 'key', message: `key 重复，第 ${rowNumber} 行将覆盖先前行` });
    }
    seenKeys.add(key);

    // category
    if (skill.category) {
      if (!VALID_CATEGORIES.includes(skill.category)) {
        if (skill.category === 'special') {
          warnings.push({ row: rowNumber, key, field: 'category', message: 'category=special 已归为 melee' });
          skill.category = 'melee';
        } else {
          errors.push({ row: rowNumber, key, field: 'category', message: `非法 category: ${skill.category}` });
        }
      }
    }

    // target_scope
    if (skill.target_scope && !VALID_TARGET_SCOPE.includes(skill.target_scope)) {
      errors.push({ row: rowNumber, key, field: 'target_scope', message: `非法 target_scope: ${skill.target_scope}` });
    }

    // skill_shape
    if (!skill.skill_shape) {
      warnings.push({ row: rowNumber, key, field: 'skill_shape', message: 'skill_shape 缺省，已默认 single' });
    } else if (!VALID_SKILL_SHAPE.includes(skill.skill_shape)) {
      errors.push({ row: rowNumber, key, field: 'skill_shape', message: `非法 skill_shape: ${skill.skill_shape}` });
    }

    // damage_kind
    if (skill.damage_kind && !VALID_DAMAGE_KIND.includes(skill.damage_kind)) {
      errors.push({ row: rowNumber, key, field: 'damage_kind', message: `非法 damage_kind: ${skill.damage_kind}` });
    }

    // action_type
    if (skill.action_type && !VALID_ACTION_TYPE.includes(skill.action_type)) {
      errors.push({ row: rowNumber, key, field: 'action_type', message: `非法 action_type: ${skill.action_type}` });
    }

    // type
    if (skill.type && !VALID_TYPE.includes(skill.type)) {
      errors.push({ row: rowNumber, key, field: 'type', message: `非法 type: ${skill.type}` });
    }

    // attack_stat
    if (skill.attack_stat && !VALID_ATTACK_STAT.includes(skill.attack_stat)) {
      errors.push({ row: rowNumber, key, field: 'attack_stat', message: `非法 attack_stat: ${skill.attack_stat}` });
    }

    // dice_type
    if (skill.dice_type && !VALID_DICE_TYPE.includes(String(skill.dice_type))) {
      errors.push({ row: rowNumber, key, field: 'dice_type', message: `非法 dice_type: ${skill.dice_type}` });
    }

    // dice_branches 结构校验
    if (skill.has_dice) {
      if (!Array.isArray(skill.dice_branches) || skill.dice_branches.length === 0) {
        errors.push({ row: rowNumber, key, field: 'dice_branches', message: 'has_dice=true 但缺少 dice_branches 分支数据' });
      } else {
        skill.dice_branches.forEach((b: any, bi: number) => {
          if (!b || !Array.isArray(b.points) || b.points.length === 0) {
            errors.push({ row: rowNumber, key, field: `dice_branches[${bi}].points`, message: '分支缺少 points 判定' });
          }
          if (!b || !Array.isArray(b.effects) || b.effects.length === 0) {
            errors.push({ row: rowNumber, key, field: `dice_branches[${bi}].effects`, message: '分支缺少 effects 效果' });
          }
          (b?.effects || []).forEach((e: any, ei: number) => {
            if (!e || !VALID_BRANCH_ACTION.includes(e.action)) {
              errors.push({
                row: rowNumber,
                key,
                field: `dice_branches[${bi}].effects[${ei}].action`,
                message: `非法 effect action: ${e?.action}`,
              });
            }
          });
        });
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
