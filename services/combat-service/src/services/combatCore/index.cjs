/**
 * CombatCore 模块导出
 * 战斗核心模块化组件
 */

const DamagePipe = require('./damagePipe.cjs');
const BuffManager = require('./buffManager.cjs');
const EquipManager = require('./equipManager.cjs');
const TagRegistry = require('./tagRegistry.cjs');
const TagProcessor = require('./tagProcessor.cjs');
const FactionSkillRegistry = require('./factionSkillRegistry.cjs');
const HookChain = require('./hookChain.cjs');
const ConditionEvaluator = require('./conditionEvaluator.cjs');
const EffectExecutor = require('./effectExecutor.cjs');
const TagDatabaseManager = require('./tagDatabaseManager.cjs');
const { PriorityQueue, TagQueue, ActionQueue } = require('./priorityQueue.cjs');
const TagChainManager = require('./tagChainManager.cjs');
const CombatIntegrator = require('./combatIntegrator.cjs');

module.exports = {
  // 核心组件
  DamagePipe,
  BuffManager,
  EquipManager,
  EquipmentManager: EquipManager, // 别名兼容

  // 词条系统
  TagRegistry,
  TagProcessor,
  TagDatabaseManager,
  TagChainManager,
  HookChain,
  ConditionEvaluator,
  EffectExecutor,

  // 阵营技能
  FactionSkillRegistry,

  // 队列系统
  PriorityQueue,
  TagQueue,
  ActionQueue,

  // 集成器
  CombatIntegrator
};
