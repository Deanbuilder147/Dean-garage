/**
 * 阵营技能注册表
 * 定义三大阵营的核心技能及触发条件
 * 
 * 阵营风格:
 * - 地球联合 (earth): 防御型 - 火力覆盖、阵地战
 * - 拜隆 (balon): 均衡型 - 增援系统、协同作战
 * - 马克西翁 (maxion): 机动型 - 迷雾系统、机动游击
 * 
 * 奇袭系统 (surprise) 单独处理，涉及隐身机制
 */

const DamagePipe = require('./damagePipe.cjs');
const BuffManager = require('./buffManager.cjs');

/**
 * 阵营ID枚举
 */
const FACTION_IDS = {
  EARTH: 'earth',      // 地球联合
  BALON: 'balon',      // 拜隆
  MAXION: 'maxion'     // 马克西翁
};

/**
 * 阵营技能注册表
 */
const FactionSkillRegistry = {
  /**
   * 地球联合技能
   */
  [FACTION_IDS.EARTH]: {
    id: FACTION_IDS.EARTH,
    name: '地球联合',
    style: 'defensive',  // 防御型
    description: '以火力优势和坚固防线著称',
    
    skills: {
      /**
       * 技能1: 火力覆盖
       * 回合开始时可使用，对指定区域进行AOE打击
       */
      artillery: {
        id: 'artillery',
        name: '火力覆盖',
        description: '对目标区域发射弹幕，造成范围伤害',
        type: 'area_damage',
        
        // 触发条件
        trigger: {
          phase: 'turn_start',
          type: 'action_available'  // 可选行动
        },
        
        // 技能参数
        params: {
          damage: 15,           // 基础伤害
          radius: 2,             // 范围半径
          cooldown: 3,           // 冷却回合
          terrain_interaction: true  // 受地形影响
        },
        
        /**
         * 执行技能
         */
        execute({ caster, centerQ, centerR, units, battlefieldState }) {
          const result = {
            skill_id: 'artillery',
            skill_name: '火力覆盖',
            caster_id: caster.id,
            caster_name: caster.name,
            center: { q: centerQ, r: centerR },
            params: this.params,
            damage: this.params.damage,
            radius: this.params.radius,
            units_affected: [],
            logs: []
          };

          // 遍历所有单位，计算范围伤害
          units.forEach(unit => {
            const distance = DamagePipe.calculateHexDistance(
              { q: centerQ, r: centerR },
              { q: unit.q, r: unit.r }
            );
            
            if (distance <= result.radius) {
              // 计算地形减伤
              const terrain = DamagePipe.getTerrainAt(unit.q, unit.r, battlefieldState);
              const terrainReduction = terrain === 'mountain' ? 5 : 
                                       terrain === 'crater' ? 3 : 0;
              
              const finalDamage = Math.max(0, result.damage - terrainReduction);
              unit.hp = Math.max(0, unit.hp - finalDamage);
              
              result.units_affected.push({
                unit_id: unit.id,
                unit_name: unit.name,
                faction: unit.faction,
                distance: distance,
                damage_taken: finalDamage,
                hp_remaining: unit.hp,
                terrain_effect: terrainReduction > 0 ? `地形减伤${terrainReduction}` : '无'
              });
              
              result.logs.push({
                type: 'artillery_hit',
                unit_name: unit.name,
                faction: unit.faction,
                damage: finalDamage,
                hp_remaining: unit.hp,
                terrain: terrain
              });
              
              // 检查是否摧毁
              if (unit.hp <= 0) {
                result.logs.push({
                  type: 'artillery_destroyed',
                  unit_name: unit.name
                });
              }
            }
          });

          result.logs.push({
            type: 'artillery_fired',
            center: { q: centerQ, r: centerR },
            units_hit: result.units_affected.length
          });

          return result;
        }
      },

      /**
       * 技能2: 坚固阵地 (被动)
       * 当地球联合单位处于防御姿态时获得额外减伤
       */
      fortified_position: {
        id: 'fortified_position',
        name: '坚固阵地',
        description: '处于防御姿态时获得额外减伤',
        type: 'passive',
        
        trigger: {
          phase: 'on_damage_taken',
          type: 'passive'
        },
        
        params: {
          damage_reduction: 3,   // 额外减伤
          condition: 'defensive_stance'  // 需要防御姿态
        },
        
        /**
         * 检查被动效果
         */
        checkCondition(unit) {
          return unit.stance === 'defensive' || (unit.faction_buff && unit.faction_buff.includes('defensive_stance'));
        },
        
        /**
         * 执行被动效果
         */
        execute({ unit, damage }) {
          if (this.checkCondition(unit)) {
            return {
              skill_id: 'fortified_position',
              triggered: true,
              damage_reduction: this.params.damage_reduction,
              final_damage: Math.max(0, damage - this.params.damage_reduction)
            };
          }
          return { triggered: false };
        }
      }
    }
  },

  /**
   * 拜隆技能
   */
  [FACTION_IDS.BALON]: {
    id: FACTION_IDS.BALON,
    name: '拜隆',
    style: 'balanced',  // 均衡型
    description: '擅长协同作战和战场支援',
    
    skills: {
      /**
       * 技能1: 增援系统
       * 当拜隆单位被攻击时，附近友军可分担伤害
       */
      reinforcement: {
        id: 'reinforcement',
        name: '增援',
        description: '被攻击时，附近友军可分担伤害',
        type: 'reactive_support',
        
        trigger: {
          phase: 'on_ally_attacked',
          type: 'reactive'
        },
        
        params: {
          range: 2,                // 增援范围
          damage_share: 0.5,        // 分担50%伤害
          max_supporters: 1        // 最多1个增援单位
        },
        
        /**
         * 获取可增援的单位
         */
        getSupportUnits(target, units) {
          return units.filter(unit => {
            if (unit.faction !== FACTION_IDS.BALON) return false;
            if (unit.id === target.id) return false;
            if (unit.hp <= 0) return false;
            
            const distance = DamagePipe.calculateHexDistance(unit, target);
            return distance <= this.params.range;
          });
        },
        
        /**
         * 执行增援
         */
        execute({ target, damage, availableSupportUnits }) {
          const result = {
            skill_id: 'reinforcement',
            skill_name: '增援',
            target_id: target.id,
            target_name: target.name,
            original_damage: damage,
            logs: []
          };

          if (!availableSupportUnits || availableSupportUnits.length === 0) {
            result.logs.push({
              type: 'reinforcement_no_units',
              note: '范围内无增援单位'
            });
            return result;
          }

          // 选择最近的增援单位
          const supporter = availableSupportUnits[0];
          const damageShare = Math.floor(damage * this.params.damage_share);
          
          // 增援单位承受部分伤害
          supporter.hp = Math.max(0, supporter.hp - damageShare);
          
          // 目标减少伤害
          target.hp += damageShare;
          
          result.support_unit = {
            id: supporter.id,
            name: supporter.name,
            damage_taken: damageShare,
            hp_remaining: supporter.hp
          };
          
          result.damage_reduced = damageShare;
          result.final_damage = damage - damageShare;
          
          result.logs.push({
            type: 'reinforcement_activated',
            support_unit: supporter.name,
            damage_shared: damageShare,
            support_unit_hp: supporter.hp,
            target_hp: target.hp
          });

          // 检查增援单位是否被摧毁
          if (supporter.hp <= 0) {
            result.logs.push({
              type: 'reinforcement_supporter_destroyed',
              unit_name: supporter.name
            });
          }

          return result;
        }
      },

      /**
       * 技能2: 协同攻击 (被动)
       * 当友军在攻击范围内时获得攻击加成
       */
      coordinated_attack: {
        id: 'coordinated_attack',
        name: '协同攻击',
        description: '友军在攻击范围内时获得攻击加成',
        type: 'passive',
        
        trigger: {
          phase: 'pre_attack',
          type: 'passive'
        },
        
        params: {
          attack_bonus: 2,
          range: 2
        },
        
        /**
         * 检查是否有友军在范围内
         */
        checkCondition(attacker, units) {
          const alliesInRange = units.filter(unit => {
            if (unit.faction !== attacker.faction) return false;
            if (unit.id === attacker.id) return false;
            if (unit.hp <= 0) return false;
            
            const distance = DamagePipe.calculateHexDistance(unit, attacker);
            return distance <= this.params.range;
          });
          
          return {
            has_allies: alliesInRange.length > 0,
            allies: alliesInRange
          };
        },
        
        execute({ attacker, units }) {
          const check = this.checkCondition(attacker, units);
          if (check.has_allies) {
            return {
              skill_id: 'coordinated_attack',
              triggered: true,
              attack_bonus: this.params.attack_bonus,
              allies_count: check.allies.length
            };
          }
          return { triggered: false };
        }
      }
    }
  },

  /**
   * 马克西翁技能
   */
  [FACTION_IDS.MAXION]: {
    id: FACTION_IDS.MAXION,
    name: '马克西翁',
    style: 'mobile',  // 机动型
    description: '擅长机动游击战和战场控制',
    
    skills: {
      /**
       * 技能1: 迷雾系统
       * 回合开始时，根据骰子结果给所有马克西翁单位施加Buff
       */
      fog_system: {
        id: 'fog_system',
        name: '迷雾',
        description: '释放迷雾，根据骰子结果获得不同Buff',
        type: 'area_buff',
        
        trigger: {
          phase: 'turn_start',
          type: 'auto_trigger'  // 自动触发
        },
        
        params: {
          duration: 2,
          dice_sides: 6,
          effects: {
            1: { buff_type: 'defense', value: 2, name: '防御强化' },
            2: { buff_type: 'defense', value: 2, name: '防御强化' },
            3: { buff_type: 'mobility', value: 1, name: '机动强化' },
            4: { buff_type: 'mobility', value: 1, name: '机动强化' },
            5: { buff_type: 'attack', value: 1, name: '攻击强化' },
            6: { buff_type: 'attack', value: 1, name: '攻击强化' }
          }
        },
        
        /**
         * 执行迷雾系统
         */
        execute({ units, battlefieldState }) {
          const result = {
            skill_id: 'fog_system',
            skill_name: '迷雾',
            params: this.params,
            units_affected: [],
            logs: []
          };

          // 掷骰子决定效果
          const roll = DamagePipe.rollDice(this.params.dice_sides);
          const effect = this.params.effects[roll];
          
          result.roll = roll;
          result.effect = effect;
          
          // 获取所有马克西翁单位
          const maxionUnits = units.filter(u => u.faction === FACTION_IDS.MAXION && u.hp > 0);
          
          maxionUnits.forEach(unit => {
            const buffType = effect.buff_type === 'defense' ? BuffManager.BUFF_TYPES.DEFENSE :
                            effect.buff_type === 'mobility' ? BuffManager.BUFF_TYPES.MOBILITY :
                            BuffManager.BUFF_TYPES.ATTACK;
            
            const applied = BuffManager.applyBuff(unit, buffType, effect.value, this.params.duration);
            
            result.units_affected.push({
              unit_id: unit.id,
              unit_name: unit.name,
              buff: `+${effect.value}${effect.buff_type === 'defense' ? '防御' : effect.buff_type === 'mobility' ? '机动' : '攻击'}`,
              duration: this.params.duration,
              previousValue: applied.previousValue
            });
          });

          result.logs.push({
            type: 'fog_system_activated',
            roll: roll,
            effect: effect.name,
            units_affected: maxionUnits.length,
            duration: this.params.duration
          });

          return result;
        }
      },

      /**
       * 技能2: 机动打击 (被动)
       * 攻击后有几率获得额外机动
       */
      mobile_strike: {
        id: 'mobile_strike',
        name: '机动打击',
        description: '攻击后有几率获得额外机动',
        type: 'passive',
        
        trigger: {
          phase: 'post_attack',
          type: 'passive'
        },
        
        params: {
          trigger_chance: 0.5,  // 50%几率
          mobility_bonus: 1,
          duration: 1
        },
        
        execute({ attacker, roll }) {
          // 需要掷骰超过阈值才触发
          const triggerRoll = DamagePipe.rollDice(10);
          
          if (triggerRoll > 5) {  // >5 触发
            const applied = BuffManager.applyBuff(
              attacker,
              BuffManager.BUFF_TYPES.MOBILITY,
              this.params.mobility_bonus,
              this.params.duration
            );
            
            return {
              skill_id: 'mobile_strike',
              triggered: true,
              roll: triggerRoll,
              mobility_bonus: this.params.mobility_bonus,
              previousValue: applied.previousValue,
              duration: this.params.duration
            };
          }
          
          return { triggered: false };
        }
      },

      /**
       * 技能3: 战术撤退 (被动)
       * 当HP低于30%时，机动性提升
       */
      tactical_retreat: {
        id: 'tactical_retreat',
        name: '战术撤退',
        description: 'HP低于30%时获得机动加成',
        type: 'passive',
        
        trigger: {
          phase: 'turn_start',
          type: 'conditional_passive'
        },
        
        params: {
          hp_threshold: 0.3,  // 30%HP
          mobility_bonus: 2
        },
        
        checkCondition(unit) {
          const maxHp = unit.max_hp || unit.hp;
          return unit.hp / maxHp <= this.params.hp_threshold;
        },
        
        execute({ unit }) {
          if (this.checkCondition(unit)) {
            const applied = BuffManager.applyBuff(
              unit,
              BuffManager.BUFF_TYPES.MOBILITY,
              this.params.mobility_bonus,
              1  // 持续1回合
            );
            
            return {
              skill_id: 'tactical_retreat',
              triggered: true,
              hp_percent: Math.round((unit.hp / (unit.max_hp || unit.hp)) * 100),
              mobility_bonus: this.params.mobility_bonus
            };
          }
          return { triggered: false };
        }
      }
    }
  }
};

/**
 * 获取阵营技能
 */
function getFactionSkill(faction, skillId) {
  const factionData = FactionSkillRegistry[faction];
  if (!factionData) return null;
  return factionData.skills[skillId] || null;
}

/**
 * 获取阵营所有技能
 */
function getFactionSkills(faction) {
  const factionData = FactionSkillRegistry[faction];
  if (!factionData) return [];
  return Object.values(factionData.skills);
}

/**
 * 获取阵营信息
 */
function getFactionInfo(faction) {
  return FactionSkillRegistry[faction] || null;
}

/**
 * 检查单位是否拥有某技能
 */
function unitHasSkill(unit, skillId) {
  const skill = getFactionSkill(unit.faction, skillId);
  return skill !== null;
}

/**
 * 获取单位所有可用技能
 */
function getUnitSkills(unit) {
  return getFactionSkills(unit.faction);
}

module.exports = {
  FactionSkillRegistry,
  FACTION_IDS,
  getFactionSkill,
  getFactionSkills,
  getFactionInfo,
  unitHasSkill,
  getUnitSkills
};
