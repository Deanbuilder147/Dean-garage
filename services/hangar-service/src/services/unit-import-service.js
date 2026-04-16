/**
 * 单位导入服务
 * 支持事务化的单位数据导入
 */
export class UnitImportService {
  constructor(db) {
    this.db = db;
  }

  /**
   * 导入单位数据
   * @param {Object} data - 解析后的Excel数据
   * @param {number} userId - 用户ID
   * @returns {Object} 导入结果
   */
  async import(data, userId) {
    const log = new ImportLog();
    
    try {
      console.log('[UnitImportService] 开始导入单位数据...');
      log.addStep('start', '开始导入');

      // 开始事务
      const beginStmt = this.db.prepare('BEGIN TRANSACTION');
      beginStmt.run();
      log.addStep('transaction', '开始事务');

      // 1. 插入主单位记录
      const unitId = this.insertUnit(data, userId, log);
      
      // 2. 插入技能（已包含在单位记录中）
      log.addStep('skills', `技能数量: ${data.skills.length}`);

      // 提交事务
      const commitStmt = this.db.prepare('COMMIT');
      commitStmt.run();
      log.addStep('transaction', '提交事务成功');

      console.log('[UnitImportService] 导入成功, ID:', unitId);

      return {
        success: true,
        unitId,
        message: '导入成功',
        log: log.getEntries()
      };
    } catch (error) {
      // 回滚事务
      try {
        const rollbackStmt = this.db.prepare('ROLLBACK');
        rollbackStmt.run();
        log.addStep('transaction', '回滚事务');
      } catch (rollbackError) {
        console.error('[UnitImportService] 回滚失败:', rollbackError);
      }

      console.error('[UnitImportService] 导入失败:', error.message);
      log.addStep('error', `导入失败: ${error.message}`);
      
      return {
        success: false,
        error: error.message,
        log: log.getEntries()
      };
    }
  }

  /**
   * 插入单位记录
   */
  insertUnit(data, userId, log) {
    const basic = data.basic;
    const units = data.units;
    const skills = data.skills;

    // 获取主机体数据
    const mainUnit = units['主机体'] || {};
    const leftUnit = units['左手'] || {};
    const rightUnit = units['右手'] || {};
    const extraUnit = units['其它'] || {};
    const royroyUnit = units['跟随'] || {};

    // 按单位分组技能
    const skillsByOwner = {
      '主机体': [],
      '跟随': [],
      '左手': [],
      '右手': [],
      '其它': []
    };

    for (const skill of skills) {
      if (skill.owner && skillsByOwner[skill.owner]) {
        skillsByOwner[skill.owner].push({
          name: skill.name,
          type: skill.type || '自动',
          attribute: skill.attribute || '实体',
          effect: skill.effect || '',
          range: skill.range || '',
          special: skill.special || ''
        });
      }
    }

    // 构建SQL（简化版，使用原有字段结构）
    const sql = `
      INSERT INTO units (
        name, faction, user_id, codename,
        main_type, main_格斗, main_射击, main_结构, main_机动, main_skills, main_image_url,
        has_royroy, royroy_name, royroy_image_url,
        royroy_格斗, royroy_射击, royroy_结构, royroy_机动, royroy_skills,
        left_type, left_格斗, left_射击, left_结构, left_机动, left_skills, left_image_url,
        right_type, right_格斗, right_射击, right_结构, right_机动, right_skills, right_image_url,
        extra_type, extra_格斗, extra_射击, extra_结构, extra_机动, extra_skills, extra_image_url,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `;

    const params = [
      // 基本信息
      basic.name || '未命名机体',
      basic.faction || 'earth',
      userId,
      basic.codename || null,
      
      // 主机体
      mainUnit.type || '机体',
      mainUnit.格斗 || 0,
      mainUnit.射击 || 0,
      mainUnit.结构 || 0,
      mainUnit.机动 || 0,
      JSON.stringify(skillsByOwner['主机体']),
      null, // main_image_url
      
      // 跟随
      royroyUnit.type ? 1 : 0,
      royroyUnit.type ? '跟随' : null,
      null, // royroy_image_url
      royroyUnit.格斗 || 0,
      royroyUnit.射击 || 0,
      royroyUnit.结构 || 0,
      royroyUnit.机动 || 0,
      JSON.stringify(skillsByOwner['跟随']),
      
      // 左手
      leftUnit.type || 'none',
      leftUnit.格斗 || 0,
      leftUnit.射击 || 0,
      leftUnit.结构 || 0,
      leftUnit.机动 || 0,
      JSON.stringify(skillsByOwner['左手']),
      null, // left_image_url
      
      // 右手
      rightUnit.type || 'none',
      rightUnit.格斗 || 0,
      rightUnit.射击 || 0,
      rightUnit.结构 || 0,
      rightUnit.机动 || 0,
      JSON.stringify(skillsByOwner['右手']),
      null, // right_image_url
      
      // 其它
      extraUnit.type || 'none',
      extraUnit.格斗 || 0,
      extraUnit.射击 || 0,
      extraUnit.结构 || 0,
      extraUnit.机动 || 0,
      JSON.stringify(skillsByOwner['其它']),
      null // extra_image_url
    ];

    // 验证参数数量
    const placeholders = sql.match(/\?/g);
    if (placeholders.length !== params.length) {
      throw new Error(`SQL参数数量不匹配: 需要${placeholders.length}, 实际${params.length}`);
    }

    const stmt = this.db.prepare(sql);
    const result = stmt.run(...params);

    log.addStep('insert', `创建单位: ${basic.name}, ID: ${result.lastInsertRowid}`);
    
    return result.lastInsertRowid;
  }
}

/**
 * 导入日志
 */
class ImportLog {
  constructor() {
    this.entries = [];
    this.startTime = Date.now();
  }

  addStep(type, message) {
    this.entries.push({
      timestamp: new Date().toISOString(),
      elapsed: Date.now() - this.startTime,
      type,
      message
    });
  }

  getEntries() {
    return this.entries;
  }
}

export default UnitImportService;
