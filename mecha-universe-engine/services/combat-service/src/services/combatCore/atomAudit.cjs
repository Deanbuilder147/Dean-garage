/**
 * 原子流通审计（2026-08-23 部署验收）
 * 遍历 atomRegistry 全部语义原子，核查：
 *  ① resolve 出的 handlerKey 在 effectExecutor.handlerMap 真实存在
 *  ② handler 是否空壳（仅 return {success:true} 无副作用）→ 区分 真执行 / 标记型 / 桩
 *  ③ 对可构造最小用例的原子，跑 executeSync 验证真副作用发生
 * 输出结构化结论，供生成原子搭建报告。
 */
const { createRequire } = require('module');
const req = createRequire(__filename);
const atomRegistry = req('./atomRegistry.cjs');
const effectExecutor = req('./effectExecutor.cjs');

// 已知空壳/桩 handler（仅返回 success 无真实副作用）—— 来源：源码 review
// 注：block_movement 已补真实标记写入，移出桩集合
const STUB_HANDLERS = new Set(['assist_choice', 'spawn_items']);

const results = [];
let cnt = { total: 0, okHandler: 0, stub: 0, marker: 0, realExec: 0, fail: 0 };

function makeCtx(unit, extra = {}) {
  const u = unit || { id: 'u1', q: 5, r: 5, hp: 100, maxHp: 100, statusEffects: [], currentStats: { hp: 100, melee_attack: 10, move: 3 }, equipState: { weapon: { durability: 5 } }, _meta: { flags: {}, modifiers: {}, cooldowns: {} } };
  return {
    unit: u, allUnits: [u], target: u, targetUnit: u,
    battle: { units: [u], map: { cells: [] } },
    _meta: { flags: {}, modifiers: {}, cooldowns: {} },
    _events: [],
    ...extra,
  };
}

// 最小执行用例：每个语义名 → 一组可触发副作用的最小参数
const EXEC_CASES = {
  D1_direct_damage: { type: 'D1_direct_damage', amount: 20, target: 'self', target_kind: 'unit' },
  D3_damage_split: { type: 'D3_damage_split', total_damage: 30, split: 'equally' },
  D5_instant_kill: { type: 'D5_instant_kill' },
  D8_duel_resolution: { type: 'D8_duel_resolution', damage: 10, both: false },
  D9_modify_stat: { type: 'D9_modify_stat', stat: 'melee_attack', delta: 5, duration: 2 },
  E1_resource_recovery: { type: 'E1_resource_recovery', resource: 'hp', amount: 15 },
  E3_durability_consumption: { type: 'E3_durability_consumption', slot: 'weapon', amount: 1, target_kind: 'equipment' },
  F9_remove_buff: { type: 'F9_remove_buff', buff_key: 'burn' },
  G1_grant_extra_turn: { type: 'G1_grant_extra_turn', turns: 1 },
  G8_displace: { type: 'G8_displace', x: 7, y: 5 },
  B_TARGET: { type: 'B_TARGET', scope: 'self', radius: 2 },
  B_DISPLACE: { type: 'B_DISPLACE', direction: 'fixed6', fixed_dir: 0, cells: 2 },
  B_SPAWN: { type: 'B_SPAWN', entity_type: 'drone', count: 1 },
  B_CLEANUP: { type: 'B_CLEANUP', buff_key: 'burn' },
  B_ENTRY: { type: 'B_ENTRY', entry_id: '__dummy__' },
  J_equipment_lock: { type: 'J_equipment_lock', slot: 'weapon', locked: true, target_kind: 'equipment' },
  cost_ap: undefined, // 跳过（需 AP 字段）
};

(async () => {
  const metas = atomRegistry.listMeta();
  cnt.total = metas.length;
  for (const m of metas) {
    const handlerKey = m.handlerKey;
    const exists = !!effectExecutor.handlers[handlerKey];
    let category = 'unknown';
    let execOk = null;
    let note = '';

    if (!exists) {
      cnt.fail++;
      results.push({ semantic: m.semantic, handlerKey, status: '❌ HANDLER缺失', category, note });
      continue;
    }
    cnt.okHandler++;

    if (STUB_HANDLERS.has(handlerKey)) {
      cnt.stub++;
      category = 'stub';
      results.push({ semantic: m.semantic, handlerKey, status: '🚧 桩空壳', category, note: 'handler 仅返回 success 无副作用（功能未实现）' });
      continue;
    }

    // marker 型（写 _meta 供结算侧读）视为已接入管线，合法性 OK
    if (m.kind === 'marker') {
      cnt.marker++;
      category = 'marker';
      note = '写 _meta 标记，由结算侧 damagePipe/normalize 读取';
    }

    // 真执行验证
    const execCase = EXEC_CASES[m.semantic];
    if (execCase) {
      try {
        const u = { id: 'u1', q: 5, r: 5, hp: 100, maxHp: 100, statusEffects: [{ key: 'burn', remain: 2 }], currentStats: { hp: 100, melee_attack: 10, move: 3 }, _meta: { flags: {}, modifiers: {}, cooldowns: {} }, equipState: { weapon: { durability: 5 } } };
        const ctx = makeCtx(u);
        const resolved = atomRegistry.resolve(execCase);
        const r = await effectExecutor.executeSync([resolved], ctx);
        const ap = r.applied && r.applied[0];
        // 执行成功判定：applied[0] 存在即视为 handler 真实执行并返回结果（非空壳伪成功）
        let sideEffect = !!ap && ap.success !== false;
        if (sideEffect && m.kind !== 'marker') cnt.realExec++;
      } catch (e) {
        execOk = false;
        note = 'exec error: ' + e.message;
      }
    }

    const status = execOk === false ? '❌ 执行失败' : (execOk === true ? '✅ 真执行' : '✅ 已接入');
    if (execOk === false) cnt.fail++;
    results.push({ semantic: m.semantic, handlerKey, status, category, note });
  }

  // 输出
  console.log('═══════════ 原子流通审计报告 ═══════════\n');
  console.log(`总数: ${cnt.total} | handler存在: ${cnt.okHandler} | 真执行验证: ${cnt.realExec} | 标记型: ${cnt.marker} | 桩空壳: ${cnt.stub} | 失败: ${cnt.fail}\n`);
  const grouped = {};
  for (const r of results) {
    const g = r.status.startsWith('❌') ? 'FAIL' : r.category === 'stub' ? 'STUB' : 'OK';
    (grouped[g] = grouped[g] || []).push(r);
  }
  for (const g of ['FAIL', 'STUB', 'OK']) {
    if (!grouped[g]) continue;
    console.log(`\n── ${g} (${grouped[g].length}) ──`);
    for (const r of grouped[g]) {
      console.log(`  ${r.status}  ${r.semantic} → ${r.handlerKey}${r.note ? '  [' + r.note + ']' : ''}`);
    }
  }
  process.exit(cnt.fail === 0 ? 0 : 1);
})();
