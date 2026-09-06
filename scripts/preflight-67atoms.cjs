#!/usr/bin/env node
/**
 * 批次2.11 Pre-flight 契约对齐脚本（文档真实清单版）
 * ------------------------------------------------------------------
 * 对主计划《67 原子引擎落地与编辑器词库实施计划》的真实原子清单（A–K 组）逐条做对齐：
 *   - 每个原子标注「文档声称的引擎现状」(doc: ✅/🔶/❌) 与「推断的引擎 route」。
 *   - 静态核对该 route 在引擎真相源是否真存在：
 *       · effect 侧：effectExecutor.handlers 注册名 / _resolveHandlerType 别名 / EFFECT_TYPE 枚举
 *       · trigger 侧：reactionHandlers 注册表 ∩ GATEWAY_KNOWN_TRIGGERS 点火清单
 *   - 输出「文档 vs 引擎真实状态」偏差审计：
 *       · 假对齐(doc ✅ 但引擎无 route)
 *       · 已落地可升级(doc 🔶/❌ 但引擎已有 route)
 *       · 真缺口(doc ❌ 且引擎确无 route)
 *   - 附 reactionHandlers 注册表 vs 点火清单 漂移自检。
 *
 * 用法：node scripts/preflight-67atoms.cjs
 * 纯静态解析，不 require 业务模块，零依赖。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', 'mecha-universe-engine');
const EFFECT_EXECUTOR = path.join(ROOT, 'services/combat-service/src/services/combatCore/effectExecutor.cjs');
const REACTION_INDEX = path.join(ROOT, 'services/combat-service/src/services/combatCore/reactionHandlers/index.cjs');
const REACTION_DIR = path.dirname(REACTION_INDEX);
const COMBAT_TS = path.join(ROOT, 'backend-gateway/src/routes/combat.ts');
const ENUMS_TS = path.join(ROOT, 'shared-kernel/src/enums.ts');

function read(p) {
  if (!fs.existsSync(p)) { console.error('[preflight] 找不到文件:', p); process.exit(2); }
  return fs.readFileSync(p, 'utf8');
}

// 提取 effectExecutor.handlers = { ... } 对象内的键名
function parseHandlerKeys(src) {
  const keys = new Set();
  const start = src.indexOf('this.handlers');
  const brace = src.indexOf('{', start);
  const end = src.indexOf('};', brace);
  const block = src.slice(brace, end);
  const re = /^\s*([A-Za-z_][\w]*)\s*:\s*this\.handle/gm;
  let m;
  while ((m = re.exec(block))) keys.add(m[1]);
  return keys;
}

// 提取 _resolveHandlerType 别名分支
function parseAlias(src) {
  const alias = new Set();
  const re = /type\s*===\s*'([^']+)'/g;
  let m;
  while ((m = re.exec(src))) alias.add(m[1]);
  return alias;
}

// 提取 reactionHandlers 注册名
function parseReactionTriggers() {
  const keys = new Set();
  for (const f of fs.readdirSync(REACTION_DIR)) {
    if (f === 'index.cjs' || !f.endsWith('.cjs')) continue;
    const s = read(path.join(REACTION_DIR, f));
    const re = /register\('([^']+)'/g;
    let m;
    while ((m = re.exec(s))) keys.add(m[1]);
  }
  return keys;
}

// 提取 GATEWAY_KNOWN_TRIGGERS 数组
function parseGatewayTriggers(src) {
  const start = src.indexOf('const GATEWAY_KNOWN_TRIGGERS');
  const arrStart = src.indexOf('[', start);
  const arrEnd = src.indexOf(']', arrStart);
  const body = src.slice(arrStart + 1, arrEnd);
  const keys = new Set();
  const re = /'([^']+)'/g;
  let m;
  while ((m = re.exec(body))) keys.add(m[1]);
  return keys;
}

// 提取 EFFECT_TYPE 枚举值
function parseEffectTypeEnum(src) {
  const start = src.indexOf('export const EFFECT_TYPE');
  const block = src.slice(start, start + 2000);
  const end = block.indexOf('} as const');
  const body = block.slice(0, end);
  const keys = new Set();
  const re = /\w+:\s*'([^']+)'/g;
  let m;
  while ((m = re.exec(body))) keys.add(m[1]);
  return keys;
}

// ---------- 67 原子真实清单（来源：主计划 md，行 192-316） ----------
// doc: 文档现状标注（✅已支持 / 🔶部分或命名割裂 / ❌缺口）
// route: 推断的引擎真实 type / trigger
// kind: 'effect'（effectExecutor handler 侧） | 'trigger'（reactionHandlers 侧） | 'core'（核心管线字段，非独立 handler）
const ATOMS = [
  // A 组 触发时机（11 项，均为 trigger 侧 或 主链路）
  { id: 'A1', name: '主动释放', doc: '✅', route: '__main__', kind: 'core' },
  { id: 'A2', name: '受击时', doc: '✅', route: 'on_damage_dealt', kind: 'trigger' },
  { id: 'A3', name: '造成伤害后', doc: '✅', route: 'on_damage_dealt', kind: 'trigger' },
  { id: 'A4', name: '击杀时', doc: '✅', route: 'on_kill', kind: 'trigger' },
  { id: 'A5', name: '回合开始', doc: '✅', route: 'on_round_start', kind: 'trigger' },
  { id: 'A6', name: '单位回合开始', doc: '✅', route: 'on_unit_turn_start', kind: 'trigger' },
  { id: 'A7', name: '友军受击', doc: '✅', route: 'on_ally_attacked', kind: 'trigger' },
  { id: 'A8', name: '移动路径计算', doc: '✅', route: 'on_move_path', kind: 'trigger' },
  { id: 'A9', name: '目标被选中', doc: '🔶', route: 'on_target_selected', kind: 'trigger' },
  { id: 'A10', name: '获得空投', doc: '✅', route: 'on_round_start', kind: 'trigger' },
  { id: 'A11', name: '低血量', doc: '🔶', route: 'on_unit_turn_start', kind: 'trigger' },
  { id: 'A12', name: '每局限次', doc: '🔶', route: 'limit_scope', kind: 'effect' },

  // B 组 条件（10）— IF 语义（多为核心判定字段/分支，非独立 handler）
  { id: 'B1', name: '目标在射程内', doc: '✅', route: '__core_range__', kind: 'core' },
  { id: 'B2', name: 'HP<阈值', doc: '🔶', route: '_effectTriggerMet', kind: 'effect' },
  { id: 'B3', name: '双方互在射程', doc: '🔗', route: '__core_range__', kind: 'core' },
  { id: 'B4', name: '三单位共线', doc: '❌', route: 'collinear', kind: 'effect' },
  { id: 'B5', name: '未攻击过', doc: '🔶', route: '__core_ap__', kind: 'core' },
  { id: 'B6', name: '处于某地形', doc: '🔶', route: '__core_terrain__', kind: 'core' },
  { id: 'B7', name: '每局限次', doc: '🔶', route: 'limit_scope', kind: 'effect' },
  { id: 'B8', name: '充能层数=N', doc: '❌', route: 'charge_stack', kind: 'effect' },
  { id: 'B9', name: '指定状态存在', doc: '🔶', route: 'getMatchingStatus', kind: 'effect' },
  { id: 'B10', name: '冷却就绪', doc: '❌', route: 'cooldown', kind: 'effect' },

  // C 组 数值语义（核心管线字段，非独立 handler）
  { id: 'C1', name: '即时数值', doc: '✅', route: '__core_damage__', kind: 'core' },
  { id: 'C2', name: '数值比较', doc: '✅', route: '__core_damage__', kind: 'core' },
  { id: 'C3', name: '单数值多段', doc: '✅', route: '__core_segments__', kind: 'core' },
  { id: 'C4', name: '对抗数值', doc: '🔶', route: '__core_branch__', kind: 'core' },
  { id: 'C5', name: '数值参与运算', doc: '❌', route: '__core_expr__', kind: 'core' },
  { id: 'C6', name: '数值分色', doc: '❌', route: '__core_expr__', kind: 'core' },
  { id: 'C7', name: '对剩余血比较', doc: '❌', route: 'post_melee_damage', kind: 'trigger' },

  // D 组 伤害
  { id: 'D1', name: '即时斩杀', doc: '✅', route: 'post_melee_damage', kind: 'trigger' },
  { id: 'D2', name: '伤害加值/减值', doc: '✅', route: '__core_damage__', kind: 'core' },
  { id: 'D3', name: '伤害均摊', doc: '✅', route: 'direct_damage_split', kind: 'effect' },
  { id: 'D4', name: '伤害分担转移', doc: '❌', route: 'damage_share', kind: 'effect' },
  { id: 'D5', name: '伤害类型转换', doc: '🔶', route: '__core_damage_kind__', kind: 'core' },
  { id: 'D6', name: '护甲穿透', doc: '❌', route: 'armor_pierce', kind: 'effect' },
  { id: 'D7', name: '反伤', doc: '❌', route: 'reflect_damage', kind: 'effect' },

  // E 组 资源
  { id: 'E1', name: '资源回复', doc: '❌', route: 'resource_recovery', kind: 'effect' },
  { id: 'E2', name: '耐久度消耗', doc: '❌', route: 'durability_consumption', kind: 'effect' },
  { id: 'E3', name: '技能槽占用', doc: '🔶', route: 'slot_occupancy', kind: 'effect' },

  // F 组 状态
  { id: 'F1', name: '增益/减益', doc: '✅', route: 'modify_stat', kind: 'effect' },
  { id: 'F2', name: '恢复', doc: '❌', route: 'resource_recovery', kind: 'effect' },
  { id: 'F3', name: '护盾', doc: '🔶', route: 'shield', kind: 'effect' },
  { id: 'F4', name: '充能层', doc: '❌', route: 'charge_layer', kind: 'effect' },
  { id: 'F5', name: '互斥', doc: '❌', route: 'mutual_exclusion', kind: 'effect' },
  { id: 'F6', name: '永久失效', doc: '❌', route: 'permanent_disable', kind: 'effect' },

  // G 组 行动
  { id: 'G1', name: '额外行动', doc: '✅', route: 'on_kill', kind: 'trigger' },
  { id: 'G2', name: '行动债', doc: '❌', route: 'action_debt', kind: 'effect' },
  { id: 'G3', name: '抢占', doc: '❌', route: 'preempt', kind: 'effect' },
  { id: 'G4', name: '序改写', doc: '❌', route: 'order_rewrite', kind: 'effect' },
  { id: 'G5', name: '放弃移动', doc: '🔶', route: 'forfeit_move', kind: 'effect' },
  { id: 'G6', name: '跳过机动判定', doc: '🔶', route: 'skip_mobility', kind: 'effect' },
  { id: 'G7', name: '解除前置', doc: '❌', route: '__meta__', kind: 'core' },
  { id: 'G8', name: '位移', doc: '❌', route: 'displace', kind: 'effect' },

  // H 组 空间
  { id: 'H1', name: '目标被选中预检', doc: '🔶', route: 'on_target_selected', kind: 'trigger' },
  { id: 'H2', name: '击杀再动', doc: '✅', route: 'on_kill', kind: 'trigger' },
  { id: 'H3', name: '抢夺', doc: '✅', route: 'on_damage_dealt', kind: 'trigger' },
  { id: 'H4', name: '空投生成', doc: '✅', route: 'on_round_start', kind: 'trigger' },
  { id: 'H5', name: '幸运掷骰', doc: '✅', route: 'on_unit_turn_start', kind: 'trigger' },
  { id: 'H6', name: '联防阻挡', doc: '✅', route: 'on_move_path', kind: 'trigger' },

  // I 组 信息
  { id: 'I1', name: '可见性变更', doc: '❌', route: 'visibility', kind: 'effect' },
  { id: 'I2', name: '可选中', doc: '❌', route: 'selectable', kind: 'effect' },
  { id: 'I3', name: '扫描揭示', doc: '❌', route: 'scan_reveal', kind: 'effect' },

  // J 组 所有权
  { id: 'J1', name: '抢夺所有权', doc: '🔶', route: 'plunder', kind: 'effect' },

  // K 组 元能力
  { id: 'K1', name: '装备/技能耐久锁定', doc: '🔶', route: 'equipment_lock', kind: 'effect' },
  { id: 'K2', name: '多技能槽占用', doc: '🔶', route: 'slot_occupancy', kind: 'effect' },
  { id: 'K3', name: '玩家可选发动', doc: '❌', route: 'player_optional', kind: 'effect' },
  { id: 'K4', name: '打断响应窗口', doc: '🔶', route: 'interrupt_window', kind: 'effect' },
];

// ---------- 主逻辑 ----------
function main() {
  const ee = read(EFFECT_EXECUTOR);
  const handlers = parseHandlerKeys(ee);
  const alias = parseAlias(ee);
  const reactionTriggers = parseReactionTriggers();
  const gatewayTriggers = parseGatewayTriggers(read(COMBAT_TS));
  const effectEnum = parseEffectTypeEnum(read(ENUMS_TS));

  const rows = [];
  const buckets = { fake: [], upgraded: [], gap: [], ok: [] };

  for (const a of ATOMS) {
    let engineHas = false, detail = '';
    if (a.kind === 'core') {
      // 核心管线字段：视作已支持（不由独立 handler 承载），partial 标记按 doc
      engineHas = true;
      detail = '核心管线字段（非独立 handler）';
      if (a.doc === '❌') { engineHas = false; detail = '核心管线未实现 expression eval'; }
    } else if (a.kind === 'trigger') {
      const reg = reactionTriggers.has(a.route);
      const ignited = gatewayTriggers.has(a.route);
      engineHas = reg && ignited;
      detail = reg && ignited ? 'reactionHandlers+点火清单' : reg ? '已注册但不在点火白名单' : ignited ? '点火清单但无 handler' : '无 handler 且无点火';
    } else { // effect
      if (handlers.has(a.route)) { engineHas = true; detail = 'effectExecutor.handler 直击'; }
      else if (alias.has(a.route) || effectEnum.has(a.route)) { engineHas = true; detail = alias.has(a.route) ? '别名层重定向' : 'EFFECT_TYPE 枚举'; }
      else { engineHas = false; detail = '无 handler/别名/枚举'; }
    }

    // 偏差审计
    let verdict;
    if (a.doc === '✅' && !engineHas) { verdict = 'FAKE'; buckets.fake.push(a); }
    else if ((a.doc === '🔶' || a.doc === '❌') && engineHas) { verdict = 'UPGRADED'; buckets.upgraded.push(a); }
    else if (a.doc === '❌' && !engineHas) { verdict = 'GAP'; buckets.gap.push(a); }
    else { verdict = 'OK'; buckets.ok.push(a); }

    rows.push({ ...a, engineHas, detail, verdict });
  }

  const unknown = [...reactionTriggers].filter((t) => !gatewayTriggers.has(t));
  const missing = [...gatewayTriggers].filter((t) => !reactionTriggers.has(t));

  // 输出
  console.log('\n=== 批次2.11 Pre-flight 契约对齐报告（67 原子真实清单） ===\n');
  console.log('原子总数:', ATOMS.length,
    '| 真对齐 OK:', buckets.ok.length,
    '| 假对齐 FAKE:', buckets.fake.length,
    '| 已落地可升级 UPGRADED:', buckets.upgraded.length,
    '| 真缺口 GAP:', buckets.gap.length, '\n');

  const V = { OK: '\x1b[32mOK  \x1b[0m', FAKE: '\x1b[31mFAKE\x1b[0m', UPGRADED: '\x1b[36mUP  \x1b[0m', GAP: '\x1b[31mGAP \x1b[0m' };
  for (const r of rows) {
    console.log(`${V[r.verdict]} ${r.id.padEnd(3)} [${r.doc}] ${r.name.padEnd(14)} route=${String(r.route).padEnd(22)} ${r.detail}`);
  }

  console.log('\n--- 偏差审计摘要 ---');
  if (buckets.fake.length) console.log('\x1b[31m[FAKE 假对齐] 文档标✅但引擎无 route:\x1b[0m', buckets.fake.map((a) => a.id).join(', '));
  else console.log('\x1b[32m[FAKE] 无\x1b[0m');
  if (buckets.gap.length) console.log('\x1b[31m[GAP 真缺口] 文档❌且引擎确无 route:\x1b[0m', buckets.gap.map((a) => a.id).join(', '));
  else console.log('\x1b[32m[GAP] 无\x1b[0m');
  if (buckets.upgraded.length) console.log('\x1b[36m[UPGRADED 已落地] 文档🔶/❌但引擎已有 route（可升级标注）:\x1b[0m', buckets.upgraded.map((a) => a.id + '(' + a.route + ')').join(', '));

  console.log('\n--- reactionHandlers 注册表 vs 点火清单 漂移自检 ---');
  console.log('\x1b[33m[unknown] 已注册但不在点火白名单:\x1b[0m', unknown.length ? unknown.join(', ') : '无');
  console.log('\x1b[33m[missing] 点火清单但无 handler:\x1b[0m', missing.length ? missing.join(', ') : '无');

  console.log('\n真相源统计: handlers=' + handlers.size + ', 别名=' + alias.size +
    ', reactionTriggers=' + reactionTriggers.size + ', gatewayTriggers=' + gatewayTriggers.size + ', EFFECT_TYPE枚举=' + effectEnum.size);

  // 退出码：有 FAKE 或 GAP 则非 0
  process.exit(buckets.fake.length + buckets.gap.length > 0 ? 1 : 0);
}

main();
