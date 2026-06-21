/**
 * UnitTypeModel - 单位类型模型 (基于现有数据库)
 * 
 * 不修改数据库结构，通过现有字段映射移动类型
 * 
 * 映射规则:
 * - main_type (现有字段) → move_type (陆地/空中/海上)
 * - faction (现有字段) → 默认移动类型
 * - codename (现有字段) → 特殊单位判断
 */

class UnitTypeModel {
  
  /**
   * 单位移动类型
   */
  static MOVE_TYPES = {
    LAND: 'land',
    AIR: 'air',
    SEA: 'sea'
  };
  
  /**
   * 从现有 main_type 映射到移动类型
   * 
   * 现有 main_type 值:
   * - 机体 (Mecha) - 主力单位
   * - Royroy (跟随) - 伴随单位
   * - 武器 (Weapon) - 装备
   * - 防具 (Armor) - 装备
   * - 载具 (Vehicle) - 交通工具
   * - 背包 (Backpack) - 支援装备
   */
  static mapMainTypeToMoveType(mainType, faction = 'earth', codename = '') {
    // 特殊单位通过 codename 判断
    const codenameLower = (codename || '').toLowerCase();
    
    // 检查是否包含空中和海上关键词
    const airKeywords = ['飞', '翼', '空', '风', 'bird', 'fly', 'air', 'wing', 'falcon', 'eagle'];
    const seaKeywords = ['海', '船', '舰', '艇', '潜', 'water', 'sea', 'ship', 'boat', 'marine', 'vessel'];
    
    const hasAir = airKeywords.some(kw => codenameLower.includes(kw));
    const hasSea = seaKeywords.some(kw => codenameLower.includes(kw));
    
    // 如果同时包含空中和海上关键词，优先级：海 > 空
    // 例如："飞船" 应该是海上单位 (船是主体，飞是修饰)
    if (hasSea) return this.MOVE_TYPES.SEA;
    if (hasAir) return this.MOVE_TYPES.AIR;
    
    // 默认映射 (基于 main_type)
    const typeMapping = {
      // 陆地单位 (默认)
      '机体': this.MOVE_TYPES.LAND,
      'Royroy': this.MOVE_TYPES.LAND,
      '防具': this.MOVE_TYPES.LAND,
      '背包': this.MOVE_TYPES.LAND,
      
      // 载具根据阵营判断
      '载具': faction === 'maxion' ? this.MOVE_TYPES.SEA : this.MOVE_TYPES.LAND,
      
      // 武器不是独立单位，不分配移动类型
      '武器': this.MOVE_TYPES.LAND  // 默认陆地 (作为附件)
    };
    
    return typeMapping[mainType] || this.MOVE_TYPES.LAND;
  }
  
  /**
   * 从现有单位对象提取移动类型
   * @param {Object} unit - 单位对象 (包含 main_type, faction, codename)
   * @returns {string} 移动类型：'land' | 'air' | 'sea'
   */
  static getUnitMoveType(unit) {
    return this.mapMainTypeToMoveType(
      unit.main_type || '机体',
      unit.faction || 'earth',
      unit.codename || ''
    );
  }
  
  /**
   * 地形 ID 映射 (适配现有 Map Service 地形)
   * 
   * Map Service 现有地形:
   * - empty (空地)
   * - mountain (山地)
   * - forest (森林)
   * - water (水域)
   * - mothership (母舰 - 出生点)
   * - base (基地 - 出生点)
   * 
   * UnitTypeManager 地形:
   * - plain, mountain, forest, water, base, ruin, lunar, crater, lava
   */
  static mapTerrainId(terrainId) {
    const mapping = {
      'empty': 'plain',        // 空地 → 平原
      'mountain': 'mountain',  // 保持一致
      'forest': 'forest',      // 保持一致
      'water': 'water',        // 保持一致
      'mothership': 'base',    // 母舰 → 基地 (出生点)
      'base': 'base'           // 保持一致
    };
    
    return mapping[terrainId] || 'plain';
  }
  
  /**
   * 反向映射：UnitTypeManager 地形 → Map Service 地形
   */
  static reverseMapTerrainId(terrainId) {
    const mapping = {
      'plain': 'empty',
      'mountain': 'mountain',
      'forest': 'forest',
      'water': 'water',
      'base': 'base',
      'ruin': 'empty',       // 废墟 → 空地
      'lunar': 'empty',      // 月面 → 空地
      'crater': 'empty',     // 陨石坑 → 空地
      'lava': 'water'        // 岩浆 → 水域 (障碍)
    };
    
    return mapping[terrainId] || 'empty';
  }
  
  /**
   * 获取单位的完整类型信息
   * @param {Object} unit - 单位对象
   * @returns {Object} 完整类型信息
   */
  static getUnitTypeInfo(unit) {
    const moveType = this.getUnitMoveType(unit);
    
    return {
      unit_id: unit.id,
      name: unit.name,
      codename: unit.codename,
      faction: unit.faction,
      main_type: unit.main_type,
      move_type: moveType,
      description: this.getMoveTypeDescription(moveType),
      keywords: this.detectKeywords(unit.codename || '')
    };
  }
  
  /**
   * 检测 codename 中的关键词
   */
  static detectKeywords(codename) {
    const keywords = {
      air: [],
      sea: []
    };
    
    const codenameLower = codename.toLowerCase();
    
    const airKeywords = ['飞', '翼', '航', '空', '风', 'bird', 'fly', 'air', 'wing', 'falcon', 'eagle'];
    const seaKeywords = ['海', '船', '舰', '艇', '潜', '航', 'water', 'sea', 'ship', 'boat', 'marine'];
    
    for (const kw of airKeywords) {
      if (codenameLower.includes(kw)) keywords.air.push(kw);
    }
    
    for (const kw of seaKeywords) {
      if (codenameLower.includes(kw)) keywords.sea.push(kw);
    }
    
    return keywords;
  }
  
  /**
   * 获取移动类型描述
   */
  static getMoveTypeDescription(moveType) {
    const descriptions = {
      land: {
        cn: '陆地单位',
        en: 'Land Unit',
        terrain: '只能在陆地地形移动',
        advantage: '地对海 +1 攻击',
        disadvantage: '地对空 -1 攻击'
      },
      air: {
        cn: '空中单位',
        en: 'Air Unit',
        terrain: '可以在所有地形移动',
        advantage: '空对海 +2 攻击',
        disadvantage: '无明显劣势'
      },
      sea: {
        cn: '海上单位',
        en: 'Sea Unit',
        terrain: '只能在水域移动',
        advantage: '高防御/高火力',
        disadvantage: '无法攻击陆地，对空 -2'
      }
    };
    
    return descriptions[moveType] || descriptions.land;
  }
  
  /**
   * 检查单位是否可以进入某地形 (使用 Map Service 地形 ID)
   * @param {Object} unit - 单位对象
   * @param {string} terrainId - Map Service 地形 ID
   * @returns {boolean}
   */
  static canUnitMoveToTerrain(unit, terrainId) {
    const moveType = this.getUnitMoveType(unit);
    const mappedTerrain = this.mapTerrainId(terrainId);
    
    // 导入 UnitTypeManager
    const UnitTypeManager = require('./unitTypeManager.cjs');
    return UnitTypeManager.canMoveTo(moveType, mappedTerrain);
  }
  
  /**
   * 获取单位在地形上的移动消耗 (使用 Map Service 地形 ID)
   * @param {Object} unit - 单位对象
   * @param {string} terrainId - Map Service 地形 ID
   * @returns {number} 移动消耗
   */
  static getUnitTerrainMoveCost(unit, terrainId) {
    const moveType = this.getUnitMoveType(unit);
    const mappedTerrain = this.mapTerrainId(terrainId);
    
    const UnitTypeManager = require('./unitTypeManager.cjs');
    return UnitTypeManager.getMoveCost(moveType, mappedTerrain);
  }
}

module.exports = UnitTypeModel;
