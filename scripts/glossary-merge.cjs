/**
 * Phase 29-GlossaryMerge: 双向增量洗白合并器
 * 
 * 策略（方案C）：
 * - 基座：6.23 富配置（9技能 + 5伤害 + 5动作 + 3系统 + 9地形）
 * - 增量源：网关运行时瘦身版 skills（5 CORE + 2 用户新增）
 * - 去重：按 label 去重（避免同名词条覆盖）
 * - 保留运行时的 is_public / review_status 标记
 */

const fs = require('fs');
const path = require('path');

// === 文件路径 ===
const RICH_PATH = process.argv[2] || '/tmp/rich_glossary.json';
const SLIM_PATH = process.argv[3] || '/tmp/slim_glossary.json';
const OUTPUT_PATH = process.argv[4] || '/tmp/merged_glossary.json';

console.log('=== Phase 29 双向增量洗白合并器 ===\n');
console.log(`[基座-富配置] ${RICH_PATH}`);
console.log(`[增量-瘦身版] ${SLIM_PATH}`);
console.log(`[输出-完全体] ${OUTPUT_PATH}\n`);

// === 加载数据 ===
const rich = JSON.parse(fs.readFileSync(RICH_PATH, 'utf8'));
const slim = JSON.parse(fs.readFileSync(SLIM_PATH, 'utf8'));

console.log(`[基座] skills: ${Object.keys(rich.skills || {}).length} 个`);
console.log(`[基座] damage_kinds: ${Object.keys(rich.damage_kinds || {}).length} 个`);
console.log(`[基座] action_types: ${Object.keys(rich.action_types || {}).length} 个`);
console.log(`[基座] systems: ${Object.keys(rich.systems || {}).length} 个`);
console.log(`[基座] terrains: ${Object.keys(rich.terrains || {}).length} 个`);
console.log(`\n[增量] skills: ${Object.keys(slim.skills || {}).length} 个`);

// === 构建基座 label 索引（用于去重） ===
const baseSkillLabels = new Set();
const baseSkillLabelsLower = new Set();
for (const [key, skill] of Object.entries(rich.skills || {})) {
  if (skill.label) {
    baseSkillLabels.add(skill.label);
    baseSkillLabelsLower.add(skill.label.toLowerCase());
  }
}
for (const [key, sys] of Object.entries(rich.systems || {})) {
  if (sys.label) {
    baseSkillLabels.add(sys.label);
    baseSkillLabelsLower.add(sys.label.toLowerCase());
  }
}

console.log(`\n[去重] 基座 label 集合大小: ${baseSkillLabels.size}`);
console.log(`[去重] 基座 labels: ${[...baseSkillLabels].join(', ')}`);

// === 合并结果 = 基座深拷贝 ===
const merged = JSON.parse(JSON.stringify(rich));

// 确保 skills 存在
if (!merged.skills) merged.skills = {};

// === 增量合并 ===
let addedCount = 0;
let skippedCount = 0;
const addedKeys = [];
const skippedKeys = [];

for (const [key, skill] of Object.entries(slim.skills || {})) {
  const skillLabel = skill.label || skill.name || key;
  
  // 去重检查：按 label（大小写不敏感）
  if (baseSkillLabelsLower.has(skillLabel.toLowerCase())) {
    skippedKeys.push(`${key} (${skillLabel})`);
    skippedCount++;
    continue;
  }
  
  // 增量追加
  merged.skills[key] = JSON.parse(JSON.stringify(skill));
  addedKeys.push(`${key} (${skillLabel})`);
  addedCount++;
  baseSkillLabelsLower.add(skillLabel.toLowerCase());
}

// === 报告 ===
console.log(`\n=== 合并结果 ===`);
console.log(`[新增] ${addedCount} 个词条并入:`);
addedKeys.forEach(k => console.log(`  + ${k}`));
console.log(`[跳过] ${skippedCount} 个词条（已存在）:`);
skippedKeys.forEach(k => console.log(`  ~ ${k}`));
console.log(`\n[最终] skills: ${Object.keys(merged.skills).length} 个`);
console.log(`[最终] terrains: ${Object.keys(merged.terrains || {}).length} 个`);
console.log(`[最终] systems: ${Object.keys(merged.systems || {}).length} 个`);
console.log(`[最终] damage_kinds: ${Object.keys(merged.damage_kinds || {}).length} 个`);

// 列出所有 skills
console.log(`\n=== 完全体 Skills 目录 ===`);
for (const [key, skill] of Object.entries(merged.skills)) {
  console.log(`  ${key} → ${skill.label || skill.name || key}`);
}

// === 保留运行时的顶层标记 ===
if (slim.version) merged.version = slim.version;
if (slim.is_public !== undefined) merged.is_public = slim.is_public;
if (slim.review_status) merged.review_status = slim.review_status;

// 更新 _meta
merged._meta = merged._meta || {};
merged._meta.version = '5.1';
merged._meta.description = 'Phase 29 双向增量洗白合并 — 6.23富配置底座 + 运行时用户增量';
merged._meta.merge_date = new Date().toISOString();
merged._meta.skills_from_rich = Object.keys(rich.skills || {}).length;
merged._meta.skills_from_slim = Object.keys(slim.skills || {}).length;
merged._meta.skills_merged = addedCount;
merged._meta.skills_skipped = skippedCount;
merged._meta.skills_final = Object.keys(merged.skills).length;

// === 写入输出 ===
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(merged, null, 2), 'utf8');
console.log(`\n[完成] 完全体配置已写入 ${OUTPUT_PATH} (${JSON.stringify(merged).length} bytes)`);
