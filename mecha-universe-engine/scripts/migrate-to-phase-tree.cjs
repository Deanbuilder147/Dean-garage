/**
 * migrate-to-phase-tree.cjs — Week1-1 词条富集迁移脚本
 *
 * 将 glossary-skill-config.json 中 9 条 v1 扁平词条无损升维为 v2 六段树
 * （新增 schema_version:2 + tree 字段），保留全部旧字段（双写兼容）。
 *
 * 与运行时 configLoader.autoPromoteV1ToV2 同构：产出的 tree 必须与其逐字段一致
 * （单测断言依据）。脚本为「离线一次性富集」，运行时不重复生成（getSkillConfig 见已有 tree 即跳过）。
 *
 * 用法：node scripts/migrate-to-phase-tree.cjs
 * 安全：先备份原文件为 .bak，再写回；可重复运行（已有 v2 tree 不覆盖）。
 */

const path = require('path');
const fs = require('fs');

const CONFIG_PATH = path.resolve(
  __dirname,
  '../services/combat-service/src/config/glossary-skill-config.json'
);

/** 与 configLoader.normalizeEffectAtom 同构的 effect 归一化 */
function normalizeEffectAtom(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  const type = raw.type || raw.action || 'unknown';
  return {
    ...raw,
    type,
    value: raw.value != null ? Number(raw.value) : (raw.flat_value != null ? Number(raw.flat_value) : 0),
    target: raw.target || raw.target_scope || 'target',
  };
}

/** 抽取词条的全部 effects（兼容顶层 effects 与纯 Segment 模型的 roll.segments[].effects） */
function collectEffects(skill) {
  if (Array.isArray(skill.effects) && skill.effects.length) return skill.effects;
  const segs = skill.roll && Array.isArray(skill.roll.segments) ? skill.roll.segments : [];
  const out = [];
  for (const seg of segs) {
    if (Array.isArray(seg.effects)) out.push(...seg.effects);
  }
  return out;
}

/** 与 configLoader.autoPromoteV1ToV2 同构的升维（离线版，不依赖模块加载） */
function autoPromoteV1ToV2(skill, key) {
  if (Number(skill.schema_version) === 2 && Array.isArray(skill.tree) && skill.tree.length) {
    return skill; // 已是 v2，原样返回（双写期内不覆盖离线 tree）
  }
  const trigger = skill.trigger || (skill.engine_meta && skill.engine_meta.trigger) || 'active';
  const rawEffects = collectEffects(skill);
  const normalizedAtoms = rawEffects.map(normalizeEffectAtom);
  return {
    ...skill,
    schema_version: 2,
    tree: [
      { phase: 'WHEN', atoms: [{ type: trigger }] },
      { phase: 'DO', atoms: normalizedAtoms },
    ],
  };
}

function main() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error('[migrate] 找不到配置文件:', CONFIG_PATH);
    process.exit(1);
  }
  // 备份
  const bak = CONFIG_PATH + '.bak';
  if (!fs.existsSync(bak)) {
    fs.copyFileSync(CONFIG_PATH, bak);
    console.log('[migrate] 已备份原配置到', bak);
  }

  const data = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  const skills = data.skills || {};
  let migrated = 0;
  for (const [key, skill] of Object.entries(skills)) {
    if (Number(skill.schema_version) === 2 && Array.isArray(skill.tree) && skill.tree.length) continue;
    skills[key] = autoPromoteV1ToV2(skill, key);
    migrated++;
    console.log(`[migrate] 富集词条: ${key} (${skill.name || ''})`);
  }

  data._meta = data._meta || {};
  data._meta.migrated_to_phase_tree = true;
  data._meta.migrated_at = new Date().toISOString().replace('T', ' ').substring(0, 19);

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`[migrate] 完成：共富集 ${migrated} 条词条，已写回 ${CONFIG_PATH}`);
}

main();
