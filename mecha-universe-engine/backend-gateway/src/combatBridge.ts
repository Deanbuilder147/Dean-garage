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
let _EquipmentDurability: any = null;
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

export function getEquipmentDurability(): any {
  if (!_EquipmentDurability) _EquipmentDurability = loadCjs('equipmentDurability.cjs');
  return _EquipmentDurability;
}

export default {
  getSkillExecutor,
  getSkillContract,
  getEquipmentDurability,
};
