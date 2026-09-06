/**
 * skillAdapter.cjs — 单向桥接（legacy → editor dimension）
 *
 * ⚠️ 架构红线（改造设计文档 v1.1 §3.5.4）：
 *   只做 legacyToEditor（旧 → 新），坚决不写 editorToLegacy。
 *   我们在前期阶段已把 cast_range / damage_kind 等污染字段清零，
 *   倒退回旧 Schema 会破坏加法射程模型与 Effect Stack 架构。
 *
 * 用途：
 *   ① 迁移脚本 scripts/migrate-legacy-skills.cjs 调用
 *   ② 运行时若词条仍是旧格式（无 effects），供前端展示兜底转换
 *   ③ 引擎侧 skillExecutor 直接读取新 Schema + engine_meta，
 *      不存在新→旧转译环节。
 */

const TARGET_MAP = {
  self: 'SELF',
  enemy: 'SINGLE_ENEMY',
  ally: 'SINGLE_ALLY',
  all: 'ALL_UNITS',
};

const REVERSE_TARGET_MAP = {
  SELF: 'self',
  SINGLE_ENEMY: 'enemy',
  AREA_ENEMY: 'enemy',
  SINGLE_ALLY: 'ally',
  AREA_ALLY: 'ally',
  ALL_UNITS: 'all',
};

function actionToEffect(action_type, legacy) {
  switch (action_type) {
    case 'attack':
      return {
        _id: 'ef_' + (legacy.id || 'x') + '_dmg',
        type: 'damage',
        fixed_rate_multiplier: null,
        flat_value: Number(legacy.base_damage) || 0,
        armor_pen: 0,
        mobility_mode: 'none',
        fixed_mod: 0,
      };
    case 'debuff':
      return {
        _id: 'ef_' + (legacy.id || 'x') + '_deb',
        type: 'status',
        polarity: 'debuff',
        target_stat: 'DMG_TAKEN',
        preset: '',
        value: Number(legacy.value) || 5,
        duration: 3,
      };
    case 'buff':
      return {
        _id: 'ef_' + (legacy.id || 'x') + '_buf',
        type: 'status',
        polarity: 'buff',
        target_stat: 'MELEE',
        preset: '',
        value: Number(legacy.value) || 5,
        duration: 3,
      };
    case 'heal':
      return {
        _id: 'ef_' + (legacy.id || 'x') + '_rec',
        type: 'recovery',
        mode: 'restore',
        restore_n: 1,
        durability: { all: false, roypoy: false, weapon: false, armor: false, vehicle: false, backpack: false },
      };
    default:
      return {
        _id: 'ef_' + (legacy.id || 'x') + '_pas',
        type: 'status',
        polarity: 'buff',
        target_stat: 'MELEE',
        preset: '',
        value: 0,
        duration: 0,
      };
  }
}

/**
 * 旧版扁平词条 → 编辑器维度对象（单向）
 */
function legacyToEditor(legacy) {
  if (!legacy || typeof legacy !== 'object') return legacy;
  // 已是新维度
  if (Array.isArray(legacy.effects)) return legacy;

  const targetType = TARGET_MAP[legacy.target_filter] || 'SINGLE_ENEMY';
  return {
    entryType: 'skill',
    name: legacy.label || legacy.id,
    description: legacy.description || '',
    ap_cost: 1,
    category: legacy.category || 'ranged',
    bonus_range: Number(legacy.bonus_range) || 0,
    min_range: legacy.min_range != null ? Number(legacy.min_range) : (legacy.category === 'melee' ? 1 : 1),
    prerequisite: { skill_type: '', note: '' },
    trigger: legacy.trigger ? { type: legacy.trigger, value: '' } : { type: 'none', value: '' },
    faction: { limited_to: 'all', limit_count: 'faction_once', stance: 'attack' },
    target: { type: targetType, filter: { unit_types: [], status: 'none' } },
    aoe: { center: { q: 8, r: 8 }, spread: Number(legacy.aoe_radius) || 0 },
    map_cannon: { directions: [] },
    effects: [actionToEffect(legacy.action_type, legacy)],
    engine_meta: { ...legacy },
    ...legacy,
  };
}

/**
 * 运行时：返回给前端编辑器的词条（旧格式自动单向转换）
 */
function getSkillForEditor(raw) {
  if (!raw) return null;
  return legacyToEditor(raw);
}

module.exports = { legacyToEditor, getSkillForEditor, TARGET_MAP, REVERSE_TARGET_MAP };
