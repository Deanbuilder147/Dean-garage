/**
 * @mecha/shared-kernel/contracts — 强契约统一导出
 *
 * Phase 33-Contract（2026-08-06）。所有业务契约集中在此导出，
 * 三端（前端 / 网关 / 引擎 .cjs）共享同一份运行时校验定义。
 *
 * @module @mecha/shared-kernel/contracts
 */

// 原子类型与枚举
export * from './primitives.js';

// 统一诊断通道（拒绝静默吞字段的核心机制）
export * from './diagnostics.js';

// 实体契约
export * from './skill.contract.js';
export * from './unit.contract.js';
export * from './glossary.contract.js';
export * from './map.contract.js';
export * from './room.contract.js';
export * from './battle.contract.js';
export * from './patch.contract.js';
export * from './battle-state.contract.js';

// 六段递归段树（schema_version=2，补完计划步骤3）
export * from './phase-tree.contract.js';
