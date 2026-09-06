/**
 * combatBridge.ts — 桥接层：将 services/combat-service 的 .cjs 核心战斗引擎
 * 接入 TS 网关运行时（Node ESM 下用 createRequire 加载 CommonJS 模块）。
 *
 * 设计要点（来自战斗桥接计划）：
 *  - index.cjs 聚合标签系统（DamagePipe/BuffManager/EquipManager/TagRegistry/TagProcessor…），
 *    并不导出 SkillExecutor / skillContract / EquipmentDurability，故此处**分别** require。
 *  - 核心 .cjs 零裸 npm 依赖；海豹骰子 vendor/dicescript.cjs 由 DiceEngine 内嵌，
 *    随 services/combat-service 整体 COPY 进网关镜像（见 backend-gateway/Dockerfile）。
 *  - 引擎读取词条配置统一走 /app/data/glossary-skill-config.json（Dockerfile 已 symlink）。
 *  - 懒加载：即便 combat-service 未打包进镜像，网关其余端点仍可正常启动，
 *    仅 /skill 端点在实际调用时返回明确错误。
 */

import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// 相对路径基于编译产物 /app/dist/combatBridge.js 解析 → /app/services/combat-service/...
const CORE_DIR = '../services/combat-service/src/services/combatCore/';

let _SkillExecutorClass: any = null;
let _skillExecutorInstance: any = null;
let _skillContract: any = null;
// 装备耐久系统 2026-08-08 恢复：数据真相源为 unit.equipState（见 getEquipmentDurability）。
// 实际扣减/锁定由 combat-service/equipmentDurability.cjs 在结算时调用（2.0B 接线）。
let _effectExecutor: any = null;

function loadCjs(name: string): any {
  return require(CORE_DIR + name);
}

export function getSkillExecutor(): any {
  if (!_skillExecutorInstance) {
    _SkillExecutorClass = _SkillExecutorClass || loadCjs('skillExecutor.cjs');
    _skillExecutorInstance = new _SkillExecutorClass();
  }
  return _skillExecutorInstance;
}

// effectExecutor.cjs 导出单例（module.exports = new EffectExecutor()），直接返回实例。
export function getEffectExecutor(): any {
  if (!_effectExecutor) _effectExecutor = loadCjs('effectExecutor.cjs');
  return _effectExecutor;
}

export function getSkillContract(): any {
  if (!_skillContract) _skillContract = loadCjs('skillContract.cjs');
  return _skillContract;
}

// 装备耐久管理器（equipmentDurability.cjs 已导出单例，与 combat-service/effectExecutor
// 命中同一模块缓存，共享 _state / _locks）。2.0B 接线：战斗初始化 register、
// 结算 applyDamage / consumeWeaponDurability、K1 lockDurability 均经此单例。
let _equipmentDurability: any = null;
export function getEquipmentDurabilityManager(): any {
  if (!_equipmentDurability) _equipmentDurability = loadCjs('equipmentDurability.cjs');
  return _equipmentDurability;
}

/**
 * ★ 2026-08-08 恢复（批次2 · 2.0A / 2.0B）：装备耐久系统重新启用。
 *
 * 恢复策略（安全路线，不动线上库 schema）：
 * 装备耐久的**数据真相源**是战斗单位的 `unit.equipState`
 * （由 battleStateFactory.buildEquipmentFromParts 从 parts 构建，
 * 已携带 durability / maxDurability / destroyed）。
 * 2026-08-06 P0-2 停用的是「units 表 equipment 幽灵列 + 空转的耐久计算」，
 * 但 equipState 这条活路径从未失效（仅供武器机动/攻击叠加）。
 * 本函数即由 equipState 派生耐久视图，无需 units.equipment 列。
 *
 * 真正的「扣减/破损/锁定」由 combat-service 的 equipmentDurability.cjs 承担
 * （register 从 equipState 装载 → applyDamage/consumeWeaponDurability 结算 →
 * lockDurability 钳 0 不可恢复），详见 2.0B 结算接线。
 *
 * @param unit 战斗单位（需含 equipState 数组）
 * @returns { [slot]: { durability, maxDurability, destroyed } }
 */
export function getEquipmentDurability(unit: any): any {
  const eq = Array.isArray(unit?.equipState) ? unit.equipState : [];
  const out: any = {};
  eq.forEach((e: any, i: number) => {
    const key = e?.slot || e?.name || `slot_${i}`;
    out[key] = {
      durability: e?.durability ?? 0,
      maxDurability: e?.maxDurability ?? e?.durability ?? 0,
      destroyed: !!e?.destroyed,
    };
  });
  return out;
}

export default {
  getSkillExecutor,
  getSkillContract,
  getEquipmentDurability,
};
