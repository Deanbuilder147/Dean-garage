/**
 * 第二顺位：网关 atom-registry 路由上下文验证（2026-08-23）
 * 模拟 GET /api/combat/atom-registry 的两分支（listMeta 透传 / ?resolve= 预览），
 * 并验证 entry validator 随词条库注入。
 * 与 combat.ts 新增路由 handler 逻辑一致，确认网关语境下 atomRegistry 依赖健康。
 */
const assert = require('assert');
const { createRequire } = require('module');
const path = require('path');
// 本文件位于 services/combat-service/src/services/combatCore/，atomRegistry 同目录
const req = createRequire(__filename);
const atomRegistry = req('./atomRegistry.cjs');
const configLoader = req('./configLoader.cjs');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (e) { console.log(`  ❌ ${name}\n     ${e.message}`); failed++; }
}

console.log('══════ 第二顺位 atom-registry 网关路由上下文验证 ══════\n');

// ① GET /atom-registry（无 query）→ listMeta 全量透传
test('listMeta 全量透传（路由无 resolve 分支）', () => {
  const atoms = atomRegistry.listMeta();
  assert.ok(Array.isArray(atoms) && atoms.length >= 50, `atoms 数量充分 (${atoms.length})`);
  const b = atoms.find((a) => a.semantic === 'B_TARGET');
  assert.strictEqual(b.handlerKey, 'resolve_target');
  assert.ok(Array.isArray(b.params), 'params 为表单结构');
  assert.strictEqual(typeof b.guard, 'string');
});

// ② GET /atom-registry?resolve=B_DISPLACE → 翻译预览
test('resolve 预览分支（?resolve= 翻译语义名→引擎 effect）', () => {
  const preview = atomRegistry.resolve({ type: 'B_DISPLACE', direction: 'fixed6', fixed_dir: 0, cells: 2 });
  assert.strictEqual(preview.type, 'displace');
  assert.strictEqual(preview.mode, 'fixed6');
  assert.strictEqual(preview.steps, 2);
});

// ③ entry validator 注入（路由内基于词条库 key 集合刷新）
test('entry_id 校验器随词条库注入（B_ENTRY 护栏生效）', () => {
  const cfg = configLoader.getGlossaryConfig() || { skills: {} };
  cfg.skills = cfg.skills || {};
  cfg.skills['demo_skill_x'] = { key: 'demo_skill_x' };
  configLoader.saveGlossaryConfig(cfg);
  const entryKeys = new Set(Object.keys(cfg.skills || {}));
  atomRegistry.setEntryValidator((id) => entryKeys.has(id));
  assert.strictEqual(atomRegistry.validateEntryExists('demo_skill_x'), true);
  assert.strictEqual(atomRegistry.validateEntryExists('ghost_entry'), false);
  // 清理
  delete cfg.skills['demo_skill_x'];
  configLoader.saveGlossaryConfig(cfg);
});

console.log(`\n结果：通过 ${passed}，失败 ${failed}`);
process.exit(failed === 0 ? 0 : 1);
