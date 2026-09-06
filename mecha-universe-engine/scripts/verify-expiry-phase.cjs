#!/usr/bin/env node
/**
 * verify-expiry-phase.cjs — §8.9② 双相位衰减回路验证工具（可复用）
 *
 * 用途：
 *   验证 combat-service 的 BuffManager 在 expiry_phase 双相位下的衰减行为：
 *     - turn_end 相位：仅扣减 expiry_phase==='turn_end' 的状态（默认）；
 *     - turn_start 相位：扣减 expiry_phase==='turn_start' 的状态（被动/瞬发 Buff，避免刚挂上就秒失效）。
 *
 * 同时验证 buildStatusInstance 在收到 expiry_phase:'turn_start' + consumption.mode:'duration'
 * 时能正确产出带相位标记、时长为 1 的状态实例（与 /test-skill 挂载校验对齐）。
 *
 * 运行（服务器 / 容器内均可，需能解析 combat-service 源码）：
 *   node scripts/verify-expiry-phase.cjs
 *
 * 退出码：0=全部通过，1=存在失败项。
 */

'use strict';

const path = require('path');
const BuffManager = require('../services/combat-service/src/services/combatCore/buffManager.cjs');

let failures = 0;
function assert(cond, msg) {
  if (cond) {
    console.log('  ✅ PASS:', msg);
  } else {
    console.log('  ❌ FAIL:', msg);
    failures++;
  }
}

// 构造一个与 buildStatusInstance 真实产出结构对齐的状态实例
function makeInstance(overrides = {}) {
  return Object.assign({
    id: 'st_qa_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7),
    source: 'qa_expiry_turn_start',
    label: 'QA-双相位衰减验证',
    action_type: 'attack_buff',
    value: 3,
    consumption: { mode: 'duration', remaining: 1, max: 1 },
    trigger: { type: 'unconditional' },
    applies_on: 'guard',
    expiry_phase: 'turn_start',
  }, overrides);
}

console.log('=== §8.9② 双相位衰减回路验证 ===\n');

// ---------------------------------------------------------------
// 0) 挂载校验：buildStatusInstance 产出结构与 /test-skill 对齐
// ---------------------------------------------------------------
console.log('[挂载] buildStatusInstance 产出校验');
const mounted = BuffManager.buildStatusInstance('qa_expiry_turn_start', {
  consumption: { mode: 'duration', duration: 1 },
  expiry_phase: 'turn_start',
  applies_on: 'guard',
  modifier: 'reduction',
  value: 3,
});
assert(mounted.expiry_phase === 'turn_start', "expiry_phase === 'turn_start'");
assert(mounted.consumption && mounted.consumption.mode === 'duration', "consumption.mode === 'duration'");
assert(mounted.consumption && mounted.consumption.remaining === 1, 'consumption.remaining === 1（时长=1）');
assert(mounted.consumption && mounted.consumption.max === 1, 'consumption.max === 1');

// ---------------------------------------------------------------
// 断言 1（Turn End）：turn_start 状态应被跳过、保留
// ---------------------------------------------------------------
console.log('\n[断言1] Turn End：turn_start 状态不被扣减（保留）');
const unit = { id: 'u_qa', statusEffects: [makeInstance()] };
assert(unit.statusEffects.length === 1, '初始挂载 1 个状态');
BuffManager.tickStatus(unit, 'turn_end');
assert(unit.statusEffects.length === 1, 'turn_end 相位跳过了 turn_start 状态（length 仍为 1）');

// ---------------------------------------------------------------
// 断言 2（Turn Start）：turn_start 状态应被清理
// ---------------------------------------------------------------
console.log('\n[断言2] Turn Start：turn_start 状态被正确清理');
BuffManager.tickStatusStart(unit);
assert(unit.statusEffects.length === 0, 'turn_start 相位清理了 turn_start 状态（length === 0）');

// ---------------------------------------------------------------
// 对照：默认 turn_end 状态在 turn_end 相位被清理
// ---------------------------------------------------------------
console.log('\n[对照] turn_end 状态在 Turn End 被清理（默认行为）');
const unit2 = { id: 'u_qa2', statusEffects: [makeInstance({ expiry_phase: 'turn_end', id: 'st_qa2' })] };
BuffManager.tickStatus(unit2, 'turn_end');
assert(unit2.statusEffects.length === 0, 'turn_end 状态在 turn_end 相位被清理（length === 0）');

console.log('\n' + (failures === 0
  ? '✅ 全部断言通过：双相位衰减回路与挂载结构均符合 §8.9② 设计。'
  : `❌ 共 ${failures} 项断言失败。`));

process.exit(failures === 0 ? 0 : 1);
