/**
 * migrate-legacy-skills.cjs — 存储A 9条业务词条「单向富集迁移」
 *
 * 设计红线（见改造设计文档 v1.1 §3.5）：
 *   ✅ 单向：legacy → 编辑器维度（editor dimension）
 *   ❌ 不写 editorToLegacy（防旧污染字段回潮）
 *
 * 安全策略（避免破坏战斗引擎）：
 *   战斗引擎 skillExecutor 当前读取旧版扁平字段（base_damage/action_type/...
 *   而非 effects[]）。因此本脚本【富集】而非【替换】：
 *   - 保留全部旧版扁平字段（引擎继续读取，零回归）
 *   - 在同一记录上【新增】编辑器维度字段：entryType / effects[] / target /
 *     aoe / map_cannon / prerequisite / faction / ap_cost
 *   前端中枢读取新增维度；引擎读取旧维度；存储A 为唯一真相源（无脑裂）。
 *
 * 幂等：若 skills[key] 已含 effects 数组，则跳过（除非 --force）。
 *
 * 用法：node scripts/migrate-legacy-skills.cjs [--force]
 */

const path = require('path');
const fs = require('fs');

const CONFIG_PATH = path.resolve(__dirname, '../services/combat-service/src/config/glossary-skill-config.json');

// 旧版 target_filter → 编辑器 target.type
const TARGET_MAP = {
  self: 'SELF',
  enemy: 'SINGLE_ENEMY',
  ally: 'SINGLE_ALLY',
  all: 'ALL_UNITS',
};

// 旧版 action_type → 效果堆栈谓语
function actionToEffect(action_type, legacy) {
  switch (action_type) {
    case 'attack':
      return {
        _id: 'ef_mig_' + Date.now() + '_dmg',
        type: 'damage',
        fixed_rate_multiplier: null,
        flat_value: Number(legacy.base_damage) || 0,
        armor_pen: 0,
        mobility_mode: 'none',
        fixed_mod: 0,
      };
    case 'debuff':
      // 如 throw：伤害+5（damage_amp）
      return {
        _id: 'ef_mig_' + Date.now() + '_deb',
        type: 'status',
        polarity: 'debuff',
        target_stat: 'DMG_TAKEN',
        preset: '',
        value: Number(legacy.value) || 5,
        duration: 3,
      };
    case 'buff':
      return {
        _id: 'ef_mig_' + Date.now() + '_buf',
        type: 'status',
        polarity: 'buff',
        target_stat: 'MELEE',
        preset: '',
        value: Number(legacy.value) || 5,
        duration: 3,
      };
    case 'heal':
      return {
        _id: 'ef_mig_' + Date.now() + '_rec',
        type: 'recovery',
        mode: 'restore',
        restore_n: 1,
        durability: { all: false, roypoy: false, weapon: false, armor: false, vehicle: false, backpack: false },
      };
    case 'passive':
    default:
      // 被动技能（block/execute/duel/...）没有主动效果，给一个占位说明 effect
      return {
        _id: 'ef_mig_' + Date.now() + '_pas',
        type: 'status',
        polarity: 'buff',
        target_stat: 'MELEE',
        preset: '',
        value: 0,
        duration: 0,
      };
  }
}

function legacyToEditor(legacy) {
  const entryType = 'skill';
  const targetType = TARGET_MAP[legacy.target_filter] || 'SINGLE_ENEMY';
  const effects = [actionToEffect(legacy.action_type, legacy)];

  // aoe / map_cannon 推导
  const aoe = { center: { q: 8, r: 8 }, spread: Number(legacy.aoe_radius) || 0 };
  const map_cannon = legacy.category === 'ranged' && (legacy.sector_angle || legacy.mode === 'directional_beam')
    ? { directions: [[0, 0, 0]], width: Number(legacy.beam_width) || 2 }
    : { directions: [] };

  return {
    // —— 编辑器维度（前端中枢读取）——
    entryType,
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
    aoe,
    map_cannon,
    effects,
    // —— 引擎内部特化字段（原样保留，供 skillExecutor 读取）——
    engine_meta: { ...legacy },
    // —— 旧版字段也保留在顶层（引擎零回归，后续可逐步清理）——
    ...legacy,
  };
}

function main() {
  const force = process.argv.includes('--force');
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error('[migrate] 未找到存储A配置:', CONFIG_PATH);
    process.exit(1);
  }
  const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
  const cfg = JSON.parse(raw);
  const skills = cfg.skills || {};
  const legacyKeys = ['block', 'sweep', 'throw', 'execute', 'duel', 'snatch', 'focused_fire', 'lucky', 'reactivate'];

  let migrated = 0;
  let skipped = 0;
  for (const key of legacyKeys) {
    const legacy = skills[key];
    if (!legacy) {
      console.warn(`[migrate] 跳过 ${key}：存储A 中不存在`);
      continue;
    }
    if (!force && Array.isArray(legacy.effects)) {
      console.log(`[migrate] 跳过 ${key}：已是新维度（含 effects）`);
      skipped++;
      continue;
    }
    skills[key] = legacyToEditor(legacy);
    console.log(`[migrate] ✅ 已富集 ${key}（${legacy.label || key}）`);
    migrated++;
  }

  cfg._meta = cfg._meta || {};
  cfg._meta.migrated_to_editor_dimension = true;
  cfg._meta.migrated_at = new Date().toISOString().replace('T', ' ').substring(0, 19);

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
  console.log(`\n[migrate] 完成：富集 ${migrated} 条，跳过 ${skipped} 条。存储A 为唯一真相源（无脑裂）。`);
}

main();
