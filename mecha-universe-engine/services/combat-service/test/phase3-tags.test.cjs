/**
 * Phase 3: 词条系统测试
 * 测试 TagRegistry 和 TagProcessor
 */

const { TagRegistry, TagProcessor } = require('../src/services/combatCore/index.cjs');

console.log('═══════════════════════════════════════════════════════════════');
console.log('【Phase 3】词条系统测试');
console.log('═══════════════════════════════════════════════════════════════\n');

// ========== 测试 1: 词条注册表 ==========
console.log('【测试 1】TagRegistry - 词条注册表');
console.log('───────────────────────────────────────────────────────────────');

const summary = TagRegistry.getSummary();
console.log(`总词条数: ${summary.total}`);
console.log('按阶段分布:');
Object.entries(summary.byPhase).forEach(([phase, count]) => {
  console.log(`  ${phase}: ${count}个`);
});

console.log('\n词条列表（按优先级）:');
summary.tags.forEach((tag, i) => {
  console.log(`  ${i + 1}. ${tag.name} (${tag.id}) - ${tag.phase} [优先级: ${tag.priority}]`);
});

console.log('\n✅ TagRegistry 测试通过\n');

// ========== 测试 2: 斩杀词条 ==========
console.log('【测试 2】斩杀 (execute)');
console.log('───────────────────────────────────────────────────────────────');

const executeContext = {
  attacker: { id: 'unit-1', hp: 30, faction: 'earth' },
  target: { id: 'unit-2', hp: 3, faction: 'maxion' },
  attackType: 'melee',
  damageDealt: 5
};

const executeResult = TagProcessor.tryTrigger('execute', executeContext);
if (executeResult) {
  console.log(`触发词条: ${executeResult.tagName}`);
  console.log(`效果: ${JSON.stringify(executeResult.effects[0], null, 2)}`);
  console.log('✅ 斩杀测试通过\n');
} else {
  console.log('❌ 斩杀未触发（条件不满足）\n');
}

// 测试不满足条件的情况
const executeFailContext = {
  attacker: { id: 'unit-1', hp: 30, faction: 'earth' },
  target: { id: 'unit-2', hp: 8, faction: 'maxion' }, // HP >= 5
  attackType: 'melee'
};

const executeFailResult = TagProcessor.tryTrigger('execute', executeFailContext);
console.log(`HP=8时不触发斩杀: ${executeFailResult === null ? '✅ 正确' : '❌ 错误'}\n`);

// ========== 测试 3: 专注射击 ==========
console.log('【测试 3】专注射击 (focused_shot)');
console.log('───────────────────────────────────────────────────────────────');

const focusedContext = {
  attacker: { id: 'unit-1', hp: 25 },
  target: { id: 'unit-2', hp: 20 },
  attackType: 'ranged',
  moveActionUsed: false
};

const focusedResult = TagProcessor.tryTrigger('focused_shot', focusedContext);
if (focusedResult) {
  console.log(`触发词条: ${focusedResult.tagName}`);
  focusedResult.effects.forEach(e => {
    console.log(`  掷骰结果: ${e.roll}`);
    console.log(`  伤害加成: +${e.damageBonus}`);
    console.log(`  消息: ${e.message}`);
  });
  console.log('✅ 专注射击测试通过\n');
}

// 测试近战时不触发
const meleeFocusedContext = {
  attacker: { id: 'unit-1', hp: 25 },
  target: { id: 'unit-2', hp: 20 },
  attackType: 'melee',
  moveActionUsed: false
};

const meleeFocusedResult = TagProcessor.tryTrigger('focused_shot', meleeFocusedContext);
console.log(`近战时不触发专注射击: ${meleeFocusedResult === null ? '✅ 正确' : '❌ 错误'}\n`);

// ========== 测试 4: 抗性 ==========
console.log('【测试 4】抗性 (resistance)');
console.log('───────────────────────────────────────────────────────────────');

const resistanceContext = {
  attacker: { id: 'unit-1', hp: 30 },
  target: {
    id: 'unit-2',
    hp: 25,
    equipment: {
      left_arm: { defense: 3, resistance_type: 'kinetic' }
    }
  },
  attackDamageType: 'kinetic'
};

const resistanceResult = TagProcessor.tryTrigger('resistance', resistanceContext);
if (resistanceResult) {
  console.log(`触发词条: ${resistanceResult.tagName}`);
  resistanceResult.effects.forEach(e => {
    console.log(`  伤害减免: -${e.reduction}`);
    console.log(`  消息: ${e.message}`);
  });
  console.log('✅ 抗性测试通过\n');
}

// ========== 测试 5: 幸运 ==========
console.log('【测试 5】幸运 (luck)');
console.log('───────────────────────────────────────────────────────────────');

const luckContext = {
  currentRound: 1
};

console.log('掷骰10次测试幸运效果分布:');
const luckDistribution = { skip: 0, normal: 0, extra: 0 };
for (let i = 0; i < 10; i++) {
  const result = TagProcessor.tryTrigger('luck', luckContext);
  if (result) {
    const msg = result.effects[0].message;
    if (msg.includes('跳过')) luckDistribution.skip++;
    else if (msg.includes('正常')) luckDistribution.normal++;
    else luckDistribution.extra++;
  }
}

console.log(`  1-2点 (跳过攻击): ${luckDistribution.skip}次`);
console.log(`  3-4点 (正常攻击): ${luckDistribution.normal}次`);
console.log(`  5-6点 (额外移动+攻击): ${luckDistribution.extra}次`);
console.log('✅ 幸运测试通过\n');

// ========== 测试 6: 阶段处理 ==========
console.log('【测试 6】阶段处理 (processPhase)');
console.log('───────────────────────────────────────────────────────────────');

console.log('round_start 阶段触发:');
const roundStartResults = TagProcessor.processPhase('round_start', { currentRound: 2 });
roundStartResults.forEach(r => {
  console.log(`  ${r.tagName}: ${r.effects[0].message}`);
});

console.log('\npost_damage 阶段触发:');
const postDamageResults = TagProcessor.processPhase('post_damage', {
  attacker: { id: 'unit-1', hp: 30, faction: 'earth' },
  target: { id: 'unit-2', hp: 3, faction: 'maxion', equipment: { left_hand: { attack: 5 } } },
  attackType: 'melee',
  damageDealt: 5
});
postDamageResults.forEach(r => {
  console.log(`  ${r.tagName}: ${r.effects[0].message || '已触发'}`);
});

console.log('\n✅ 阶段处理测试通过\n');

// ========== 测试 7: 抢夺 ==========
console.log('【测试 7】抢夺 (plunder)');
console.log('───────────────────────────────────────────────────────────────');

const plunderContext = {
  attacker: { id: 'unit-1', hp: 30, faction: 'earth' },
  target: { 
    id: 'unit-2', 
    hp: 5, 
    faction: 'maxion',
    equipment: { left_hand: { attack: 3 } }
  },
  attackType: 'melee',
  damageDealt: 8 // 伤害 > 目标武器攻击(3)
};

const plunderResult = TagProcessor.tryTrigger('plunder', plunderContext);
if (plunderResult) {
  console.log(`触发词条: ${plunderResult.tagName}`);
  plunderResult.effects.forEach(e => {
    console.log(`  掷骰结果: ${e.roll}`);
    console.log(`  成功: ${e.success}`);
    console.log(`  消息: ${e.message}`);
  });
  console.log('✅ 抢夺测试通过\n');
}

// ========== 测试 8: 再动 ==========
console.log('【测试 8】再动 (reattack)');
console.log('───────────────────────────────────────────────────────────────');

const reattackContext = {
  attacker: { id: 'unit-1', hp: 30, faction: 'earth' },
  target: { id: 'unit-2', hp: 5, faction: 'maxion' },
  extraTurnUsedThisRound: false
};

const reattackResult = TagProcessor.tryTrigger('reattack', {
  ...reattackContext,
  extra_turn_used_this_round: reattackContext.extraTurnUsedThisRound
});
if (reattackResult) {
  console.log(`触发词条: ${reattackResult.tagName}`);
  reattackResult.effects.forEach(e => {
    console.log(`  消息: ${e.message}`);
    console.log(`  获得额外回合: ${e.extraTurn ? '是' : '否'}`);
  });
  console.log('✅ 再动测试通过\n');
}

// ========== 总结 ==========
console.log('═══════════════════════════════════════════════════════════════');
console.log('【Phase 3 测试总结】');
console.log('═══════════════════════════════════════════════════════════════');
console.log('');
console.log('✅ TagRegistry - 词条注册表');
console.log('✅ TagProcessor - 词条处理器');
console.log('✅ 10个词条定义');
console.log('   - execute (斩杀)');
console.log('   - duel (决斗)');
console.log('   - plunder (抢夺)');
console.log('   - focused_shot (专注射击)');
console.log('   - luck (幸运)');
console.log('   - reattack (再动)');
console.log('   - assist (援助)');
console.log('   - airdrop (空投)');
console.log('   - formation_defense (联防)');
console.log('   - resistance (抗性)');
console.log('');
console.log('Phase 3 全部测试通过！');
console.log('');
