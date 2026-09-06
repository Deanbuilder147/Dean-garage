#!/usr/bin/env node
/**
 * 阶段4 防御性迁移/校验脚本（并联分支六段式改造）
 *
 * 作用：
 *  1. 扫描存储A（glossary-skill-config.json）全部词条；
 *  2. 对「含 tree」的词条做结构健全性检查与懒加载补齐（Branch 回退保障离线版）：
 *     - 每个 branch 必须含 subLanes（六段固定骨架 WHEN/IF/WHO/ROLL/DO/COST）；
 *     - 递归 children/branches 深度不超过 3；
 *     - 缺则按 LANE_SKELETON 补齐空结构，保证前端画布拖入 100% 命中有效节点（对应前端 ensureBranchSubLanes）。
 *  3. 对「无 tree」的 v1 扁平词条**保持不动**（引擎自动走 v1 回退，零行为变化）。
 *
 * 用法（服务器执行，单一入口纪律）：
 *   node scripts/migrate-phase-tree.cjs [--dry]   # --dry 仅报告不写回
 *
 * 注意：本脚本为离线双保险，运行时已通过 configLoader.cleanNode + 前端 ensureBranchSubLanes 兜底。
 */
const path = require('path');
const fs = require('fs');

// 与前端 GlossaryHubNew / GlossaryStudio 的 LANE_SKELETON 严格一致（决策点3：6段固定）
// ★ 2026-09-02 修正：六段定稿 = WHEN→IF→ROLL→DO→AFTER→COST
//   WHO 段已删除（降级为 DO 段首置前导原子 B_TARGET / resolve_target），AFTER 为后效段。
//   依据：工作区 docs/原子记录-20260823.md 第一节
const LANE_SKELETON = [
  { key: 'WHEN', name: '触发' },
  { key: 'IF', name: '条件' },
  { key: 'ROLL', name: '掷骰' },
  { key: 'DO', name: '执行' },
  { key: 'AFTER', name: '后效' },
  { key: 'COST', name: '代价' },
];
const MAX_DEPTH = 3;

const CONFIG_PATH = path.resolve(
  __dirname,
  '../../services/combat-service/src/config/glossary-skill-config.json'
);
const dry = process.argv.includes('--dry');

function emptySubLanes() {
  return LANE_SKELETON.map((s) => ({ key: s.key, name: s.name, atoms: [] }));
}

function ensureBranch(b, depth) {
  let fixed = false;
  if (!b) return { ok: false, fixed: false };
  if (!Array.isArray(b.subLanes) || b.subLanes.length !== LANE_SKELETON.length) {
    b.subLanes = emptySubLanes();
    fixed = true;
  }
  // 递归子链
  if (depth < MAX_DEPTH) {
    if (Array.isArray(b.children)) {
      b.children.forEach((c) => { if (ensureNode(c, depth + 1)) fixed = true; });
    }
    if (Array.isArray(b.branches)) {
      b.branches.forEach((bb) => { if (ensureBranch(bb, depth + 1).fixed) fixed = true; });
    }
  }
  return { ok: true, fixed };
}

function ensureNode(n, depth) {
  if (!n || !n.phase) return false;
  let fixed = false;
  if (Array.isArray(n.branches)) {
    n.branches.forEach((b) => { if (ensureBranch(b, depth).fixed) fixed = true; });
  }
  if (depth < MAX_DEPTH && Array.isArray(n.children)) {
    n.children.forEach((c) => { if (ensureNode(c, depth + 1)) fixed = true; });
  }
  return fixed;
}

function main() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error('[migrate] 存储A 不存在:', CONFIG_PATH);
    process.exit(1);
  }
  const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
  const data = JSON.parse(raw);
  const keys = Object.keys(data);
  let touched = 0;
  let v2count = 0;
  let v1count = 0;

  keys.forEach((k) => {
    const skill = data[k];
    if (!skill || !Array.isArray(skill.tree) || !skill.tree.length) {
      v1count += 1; // v1 词条：保持不动（回退保障）
      return;
    }
    v2count += 1;
    let fixed = false;
    skill.tree.forEach((n) => { if (ensureNode(n, 0)) fixed = true; });
    if (fixed) touched += 1;
  });

  console.log(`[migrate] 词条总数=${keys.length}  v2(tree)=${v2count}  v1(回退)=${v1count}`);
  console.log(`[migrate] 结构补齐词条数=${touched}`);
  if (dry) {
    console.log('[migrate] --dry 模式，未写回');
    return;
  }
  if (touched > 0) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2), 'utf-8');
    console.log('[migrate] 已写回存储A');
  } else {
    console.log('[migrate] 全部 tree 结构健全，无需写回');
  }
}

main();
