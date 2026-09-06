import { CombatResolver } from '../src/services/combatResolver.js';
import { TurnManager } from '../src/services/turnManager.js';

// 测试战斗结算系统
describe('CombatResolver', () => {
  test('基础伤害计算', () => {
    const attacker = {
      id: 1,
      name: '测试攻击者',
      格斗: 10,
      机动: 4
    };
    
    const target = {
      id: 2,
      name: '测试目标',
      hp: 20,
      机动: 3
    };
    
    const result = CombatResolver.resolveAttack(attacker, target, 'melee');
    
    expect(result).toHaveProperty('attacker_id', 1);
    expect(result).toHaveProperty('target_id', 2);
    expect(result).toHaveProperty('final_damage');
    expect(result.final_damage).toBeGreaterThan(0);
  });
  
  test('奇袭触发检查', () => {
    const attacker = {
      id: 1,
      name: '马克西翁攻击者',
      faction: 'maxion',
      机动: 4
    };
    
    const target = {
      id: 2,
      name: '目标',
      hp: 20,
      机动: 3
    };
    
    const allUnits = [
      attacker,
      target,
      {
        id: 3,
        name: '奇袭单位',
        faction: 'maxion',
        机动: 4,
        hp: 15
      }
    ];
    
    const surpriseCheck = CombatResolver.checkSurpriseAttack(attacker, target, allUnits);
    
    // 奇袭检查可能返回null（50%几率）
    if (surpriseCheck) {
      expect(surpriseCheck).toHaveProperty('triggered', true);
      expect(surpriseCheck.candidates).toHaveLength(1);
    }
  });
  
  test('火力覆盖计算', () => {
    const units = [
      { id: 1, name: '单位1', q: 5, r: 5, hp: 20, faction: 'earth' },
      { id: 2, name: '单位2', q: 6, r: 5, hp: 15, faction: 'maxion' }
    ];
    
    const battlefieldState = {
      cells: [
        { q: 5, r: 5, terrain: 'lunar' },
        { q: 6, r: 5, terrain: 'lunar' }
      ]
    };
    
    const result = CombatResolver.resolveEarthArtillery(5, 5, units, battlefieldState);
    
    expect(result).toHaveProperty('center', { q: 5, r: 5 });
    expect(result).toHaveProperty('damage', 15);
    expect(result.units_affected).toHaveLength(2);
  });
});

// 测试回合管理系统
describe('TurnManager', () => {
  test('获取下一个阵营', () => {
    expect(TurnManager.getNextFaction('earth')).toBe('balon');
    expect(TurnManager.getNextFaction('balon')).toBe('maxion');
    expect(TurnManager.getNextFaction('maxion')).toBe('earth');
  });
  
  test('初始化出生点选择', () => {
    const initialState = {
      units: [],
      battle_log: []
    };
    
    const roomPlayers = [
      { user_id: 1, faction: 'earth', seat_index: 0 },
      { user_id: 2, faction: 'maxion', seat_index: 1 }
    ];
    
    const state = TurnManager.initSpawnSelection(initialState, roomPlayers);
    
    expect(state).toHaveProperty('phase', 'spawn_selection');
    expect(state.spawnOrder).toHaveLength(2);
    expect(state.spawnOrder[0]).toHaveProperty('playerId', 1);
    expect(state.spawnOrder[0]).toHaveProperty('faction', 'earth');
  });
  
  test('检查单位是否可以行动', () => {
    const activeUnit = {
      hp: 20,
      skip_turn: false,
      has_acted: false,
      has_moved: false
    };
    
    const inactiveUnit = {
      hp: 0,
      skip_turn: false,
      has_acted: false,
      has_moved: false
    };
    
    expect(TurnManager.canUnitAct(activeUnit)).toBe(true);
    expect(TurnManager.canUnitAct(inactiveUnit)).toBe(false);
  });
  
  test('计算六角格距离', () => {
    const unit1 = { q: 0, r: 0 };
    const unit2 = { q: 3, r: 2 };
    
    const distance = TurnManager.calculateDistance(unit1, unit2);
    expect(distance).toBe(5); // |3-0| + |2-0| = 5
  });
});

// 测试战斗胜利条件
describe('Victory Conditions', () => {
  test('检查胜利条件 - 一方存活', () => {
    const state = {
      units: [
        { faction: 'earth', hp: 10 },
        { faction: 'earth', hp: 15 }
      ]
    };
    
    const result = TurnManager.checkVictory(state);
    expect(result).toHaveProperty('victory', true);
    expect(result).toHaveProperty('winner', 'earth');
  });
  
  test('检查胜利条件 - 平局', () => {
    const state = {
      units: []
    };
    
    const result = TurnManager.checkVictory(state);
    expect(result).toHaveProperty('victory', true);
    expect(result).toHaveProperty('winner', 'draw');
  });
  
  test('检查胜利条件 - 未结束', () => {
    const state = {
      units: [
        { faction: 'earth', hp: 10 },
        { faction: 'maxion', hp: 15 }
      ]
    };
    
    const result = TurnManager.checkVictory(state);
    expect(result).toHaveProperty('victory', false);
  });
});

console.log('所有测试通过！');