const EffectExecutor = require('../src/services/combatCore/effectExecutor.cjs');
const TagRegistry = require('../src/services/combatCore/tagRegistry.cjs');
const HookChain = require('../src/services/combatCore/hookChain.cjs');

console.log('=== 调试斩杀效果 ===\n');

const executeTag = TagRegistry.getById('execute');
console.log('斩杀词条效果:', JSON.stringify(executeTag.effects, null, 2));

const context = {
  attackType: 'melee',
  target: { hp: 1 },
  damageDealt: 2,
  attacker: { faction: 'earth' }
};

console.log('\n执行效果...');
EffectExecutor.execute(executeTag.effects, context).then(results => {
  console.log('效果执行结果:', JSON.stringify(results, null, 2));
});

// 多次测试
console.log('\n=== 多次掷骰测试 ===');
for (let i = 0; i < 10; i++) {
  const roll = Math.floor(Math.random() * 6) + 1;
  console.log(`掷骰 ${i+1}: ${roll}, 目标HP=1, 结果: ${roll >= 1 ? '斩杀成功' : '失败'}`);
}
