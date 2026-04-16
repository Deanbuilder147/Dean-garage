/**
 * AI战斗流程示例
 * 展示如何在实际战斗中使用AI系统
 * 
 * 使用方法:
 *   node phase9-ai-combat-demo.cjs
 */

const path = require('path');

// 加载必要的模块
const { CombatIntegrator } = require('./combatIntegrator.cjs');
const { AICombatController, AI_DIFFICULTY } = require('./aiIntegration.cjs');
const { TagDatabaseManager } = require('./tagDatabaseManager.cjs');
const { HookChain } = require('./hookChain.cjs');
const { TagRegistry } = require('./tagRegistry.cjs');
const { createTagSystem } = require('./tagSystem.cjs');

// 简单的六角格距离计算
function hexDistance(a, b) {
  return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
}

// 创建战斗环境
async function createAIBattle() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('【AI战斗流程演示】');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // 1. 初始化词条系统
  console.log('📦 步骤1: 初始化词条系统');
  const tagDb = new TagDatabaseManager();
  const tagRegistry = new TagRegistry();
  const hookChain = new HookChain();
  const tagSystem = createTagSystem(tagRegistry, hookChain);

  // 加载基础词条
  const { registerBasicTags } = require('./tagRegistry.cjs');
  registerBasicTags(tagRegistry);

  console.log('   ✅ 词条系统就绪\n');

  // 2. 创建战斗集成器
  console.log('⚔️  步骤2: 创建战斗集成器');
  const combatIntegrator = new CombatIntegrator({
    tagSystem,
    onEvent: (event, data) => {
      console.log(`   📢 事件: ${event}`, data);
    }
  });
  console.log('   ✅ 战斗集成器就绪\n');

  // 3. 创建AI控制器
  console.log('🤖 步骤3: 创建AI控制器');
  const aiController = new AICombatController(combatIntegrator, {
    difficulty: AI_DIFFICULTY.NORMAL,  // 可选: EASY, NORMAL, HARD
    enabled: true
  });
  console.log('   ✅ AI控制器就绪');
  console.log(`   📊 难度: ${aiController.getDifficulty()}`);
  console.log(`   ⏱️  思考延迟: ${aiController.difficultyProxy?.getThinkDelay() || 1000}ms\n`);

  // 4. 创建战斗
  console.log('🎮 步骤4: 创建战斗');
  const battle = combatIntegrator.createBattle({
    id: 'battle-vs-ai-001',
    battlefield: {
      width: 10,
      height: 10
    },
    onTurnStart: (data) => {
      console.log(`\n   ═══ 回合 ${data.round} - ${data.currentUnitId} 的回合 ═══`);
    },
    onTurnEnd: (data) => {
      console.log(`   ${data.currentUnitId} 回合结束`);
    }
  });
  console.log('   ✅ 战斗已创建\n');

  // 5. 添加玩家单位
  console.log('👤 步骤5: 添加玩家单位 (地球联合)');
  const playerUnit = combatIntegrator.addUnit({
    id: 'player-01',
    name: '玩家机甲-α',
    class: 'assault',
    faction: 'earth',
    position: { q: 2, r: 2 },
    stats: {
      hp: 100,
      maxHp: 100,
      attack: 25,
      defense: 15,
      mobility: 4,
      range: 1
    },
    faction_skill: ['artillery'],
    equipped_tags: ['counter', 'lucky']
  });
  console.log(`   ✅ 玩家单位: ${playerUnit.name}`);
  console.log(`   📍 位置: (${playerUnit.position.q}, ${playerUnit.position.r})`);
  console.log(`   ❤️ HP: ${playerUnit.stats.hp}/${playerUnit.stats.maxHp}\n`);

  // 6. 添加AI单位
  console.log('🤖 步骤6: 添加AI单位 (马克西翁)');
  const aiUnit = combatIntegrator.addUnit({
    id: 'ai-01',
    name: 'AI机甲-Ω',
    class: 'stealth',
    faction: 'maxion',
    position: { q: 7, r: 7 },
    stats: {
      hp: 90,
      maxHp: 90,
      attack: 28,
      defense: 12,
      mobility: 5,
      range: 2
    },
    faction_skill: ['fog_system'],
    equipped_tags: ['stealth_initiate', 'stealth_ambush']
  });
  console.log(`   ✅ AI单位: ${aiUnit.name}`);
  console.log(`   📍 位置: (${aiUnit.position.q}, ${aiUnit.position.r})`);
  console.log(`   ❤️ HP: ${aiUnit.stats.hp}/${aiUnit.stats.maxHp}`);
  console.log(`   🌫️ 隐身词条: ${aiUnit.equipped_tags.filter(t => t.startsWith('stealth')).join(', ')}\n`);

  // 7. 注册AI单位
  console.log('🔗 步骤7: 注册AI单位');
  aiController.registerAIUnit('ai-01', {
    strategy: 'aggressive',
    personality: 'aggressive'
  });
  console.log('   ✅ AI单位已注册到AI控制器\n');

  // 8. 开始战斗
  console.log('🚀 步骤8: 开始战斗\n');
  combatIntegrator.startBattle();

  // 9. 执行回合
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('【战斗执行】');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // 获取战斗状态
  const state = combatIntegrator.getBattleState();
  console.log(`📊 当前轮次: ${state.currentRound}`);
  console.log(`📊 当前单位: ${state.currentUnitId}`);
  console.log(`📊 存活单位: ${state.units.filter(u => u.stats.hp > 0).map(u => u.id).join(', ')}\n`);

  // 模拟玩家回合
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('【玩家回合】');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const distance = hexDistance(
    combatIntegrator.getUnit('player-01').position,
    combatIntegrator.getUnit('ai-01').position
  );
  console.log(`📏 距离AI单位: ${distance} 格`);

  if (distance <= 1) {
    console.log('⚔️  执行近战攻击!\n');
    const attackResult = combatIntegrator.executeAttack({
      attackerId: 'player-01',
      defenderId: 'ai-01',
      attackType: 'melee'
    });
    console.log(`   攻击结果: ${attackResult.success ? '命中' : '未命中'}`);
    if (attackResult.damage) {
      console.log(`   伤害: ${attackResult.damage}`);
      console.log(`   AI剩余HP: ${attackResult.targetHp}`);
    }
  } else {
    console.log('🏃 移动向敌人...\n');
    // 简单移动逻辑
    const moveResult = combatIntegrator.executeMove({
      unitId: 'player-01',
      target: { q: 5, r: 5 }
    });
    console.log(`   移动结果: ${moveResult.success ? '成功' : '失败'}`);
  }

  // 模拟AI回合
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('【AI回合】');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // 获取AI决策
  const aiDecision = await aiController.aiEngine.makeDecision('ai-01');
  console.log(`🤖 AI决策: ${aiDecision.action}`);
  console.log(`   目标: ${aiDecision.target || '无'}`);
  console.log(`   移动到: (${aiDecision.position?.q || 'N/A'}, ${aiDecision.position?.r || 'N/A'})`);
  console.log(`   理由: ${aiDecision.reason}\n`);

  // 执行AI决策
  const aiThinkDelay = aiController.difficultyProxy.getThinkDelay();
  console.log(`⏱️  AI思考中... (${aiThinkDelay}ms延迟)`);
  await new Promise(resolve => setTimeout(resolve, Math.min(aiThinkDelay, 500))); // 实际使用时用完整延迟

  // 根据AI决策执行
  if (aiDecision.action === 'attack' && aiDecision.target) {
    const aiAttackResult = combatIntegrator.executeAttack({
      attackerId: 'ai-01',
      defenderId: aiDecision.target,
      attackType: 'ranged',
      damageModifier: aiController.difficultyProxy.applyDamageModifier(1.0)
    });
    console.log(`\n⚔️  AI执行攻击!`);
    console.log(`   攻击结果: ${aiAttackResult.success ? '命中' : '未命中'}`);
    if (aiAttackResult.damage) {
      console.log(`   伤害: ${aiAttackResult.damage}`);
      console.log(`   玩家剩余HP: ${aiAttackResult.targetHp}`);
    }
  } else if (aiDecision.action === 'move') {
    const aiMoveResult = combatIntegrator.executeMove({
      unitId: 'ai-01',
      target: aiDecision.position
    });
    console.log(`\n🏃 AI执行移动!`);
    console.log(`   移动结果: ${aiMoveResult.success ? '成功' : '失败'}`);
  } else if (aiDecision.action === 'stealth') {
    console.log('\n🌫️ AI执行隐身!');
    combatIntegrator.getUnit('ai-01').isStealth = true;
    console.log('   AI单位进入隐身状态');
  }

  // 10. 结束战斗
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('【战斗结果】');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const finalState = combatIntegrator.getBattleState();
  console.log(`📊 最终状态:`);
  finalState.units.forEach(unit => {
    console.log(`   ${unit.name}: ${unit.stats.hp}/${unit.stats.maxHp} HP`);
  });

  const winner = finalState.units.find(u => u.stats.hp > 0);
  console.log(`\n🏆 获胜者: ${winner ? winner.name : '无 (平局)'}`);

  // 结束战斗
  const battleResult = combatIntegrator.endBattle();
  console.log(`\n📋 战斗统计:`);
  console.log(`   总回合数: ${battleResult.rounds}`);
  console.log(`   玩家造成伤害: ${battleResult.playerDamage}`);
  console.log(`   AI造成伤害: ${battleResult.aiDamage}`);

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('【演示完成】');
  console.log('═══════════════════════════════════════════════════════════════\n');

  return {
    battle,
    aiController,
    combatIntegrator,
    result: battleResult
  };
}

// 运行演示
createAIBattle().catch(console.error);

// 导出模块供外部使用
module.exports = { createAIBattle };
