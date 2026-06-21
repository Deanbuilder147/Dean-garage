/**
 * TagDatabaseManager - 词条数据库管理器
 *
 * 职责:
 * 1. 词条的持久化存储（JSON文件）
 * 2. 词条的导入/导出功能
 * 3. 词条的增删改查（CRUD）
 * 4. 词条的版本管理
 */

const fs = require('fs');
const path = require('path');

class TagDatabaseManager {
  constructor(dbPath = null) {
    // 默认数据库路径
    this.dbPath = dbPath || path.join(__dirname, '../../data/tags.json');
    this.tags = new Map(); // 内存缓存
    this.versions = []; // 版本历史
    this.loaded = false;
  }

  /**
   * 初始化数据库目录
   */
  init() {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return this;
  }

  /**
   * 加载词条数据库
   */
  load() {
    try {
      if (fs.existsSync(this.dbPath)) {
        const data = JSON.parse(fs.readFileSync(this.dbPath, 'utf8'));
        this.tags = new Map(Object.entries(data.tags || {}));
        this.versions = data.versions || [];
        this.loaded = true;
        console.log(`[TagDB] 加载了 ${this.tags.size} 个词条`);
        return true;
      }
    } catch (error) {
      console.error('[TagDB] 加载失败:', error.message);
    }
    this.loaded = true;
    return false;
  }

  /**
   * 保存词条数据库
   */
  save() {
    try {
      this.init();
      const data = {
        tags: Object.fromEntries(this.tags),
        versions: this.versions,
        lastUpdated: new Date().toISOString()
      };
      fs.writeFileSync(this.dbPath, JSON.stringify(data, null, 2), 'utf8');
      console.log(`[TagDB] 保存了 ${this.tags.size} 个词条`);
      return true;
    } catch (error) {
      console.error('[TagDB] 保存失败:', error.message);
      return false;
    }
  }

  /**
   * 注册新词条
   * @param {object} tag - 词条定义
   */
  register(tag) {
    if (!tag.id) {
      throw new Error('词条必须包含 id 字段');
    }

    // 验证词条结构
    this.validateTag(tag);

    const oldTag = this.tags.get(tag.id);
    this.tags.set(tag.id, {
      ...tag,
      createdAt: oldTag?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    return { success: true, action: oldTag ? 'updated' : 'created' };
  }

  /**
   * 验证词条结构
   */
  validateTag(tag) {
    const required = ['id', 'name', 'trigger', 'effects'];
    for (const field of required) {
      if (!tag[field]) {
        throw new Error(`词条缺少必需字段: ${field}`);
      }
    }

    // 验证 trigger.phase
    const validPhases = [
      'round_start', 'turn_start', 'turn_end',
      'pre_attack', 'on_attack', 'post_attack',
      'pre_damage', 'on_damage', 'post_damage',
      'on_kill', 'on_death', 'on_defended',
      'on_damage_taken', 'on_ally_attacked',
      'movement_check', 'on_airdrop_receive', 'on_buff_expire'
    ];

    if (!validPhases.includes(tag.trigger.phase)) {
      throw new Error(`无效的 trigger.phase: ${tag.trigger.phase}`);
    }

    // 验证 effects 数组
    if (!Array.isArray(tag.effects) || tag.effects.length === 0) {
      throw new Error('effects 必须是包含至少一个效果的数组');
    }

    return true;
  }

  /**
   * 获取词条
   */
  get(id) {
    return this.tags.get(id) || null;
  }

  /**
   * 获取所有词条
   */
  getAll() {
    return Array.from(this.tags.values());
  }

  /**
   * 按阶段获取词条
   */
  getByPhase(phase) {
    return this.getAll().filter(tag => tag.trigger.phase === phase);
  }

  /**
   * 按阵营获取词条
   */
  getByFaction(faction) {
    return this.getAll().filter(tag => tag.faction === faction);
  }

  /**
   * 删除词条
   */
  delete(id) {
    if (this.tags.has(id)) {
      this.tags.delete(id);
      return true;
    }
    return false;
  }

  /**
   * 批量导入词条
   */
  importBatch(tags) {
    const results = { success: 0, failed: 0, errors: [] };

    for (const tag of tags) {
      try {
        this.register(tag);
        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push({ id: tag.id, error: error.message });
      }
    }

    if (results.success > 0) {
      this.save();
    }

    return results;
  }

  /**
   * 导出所有词条
   */
  export() {
    return {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      count: this.tags.size,
      tags: this.getAll()
    };
  }

  /**
   * 导出为指定格式
   */
  exportAs(format) {
    const data = this.export();

    switch (format) {
      case 'csv':
        return this.toCSV(data.tags);
      case 'markdown':
        return this.toMarkdown(data.tags);
      case 'json':
      default:
        return JSON.stringify(data, null, 2);
    }
  }

  /**
   * 转换为CSV格式
   */
  toCSV(tags) {
    const headers = ['id', 'name', 'phase', 'priority', 'optional', 'consumable'];
    const rows = tags.map(tag => [
      tag.id,
      tag.name,
      tag.trigger.phase,
      tag.params?.priority || 0,
      tag.params?.optional || false,
      tag.params?.consumable || false
    ].join(','));

    return [headers.join(','), ...rows].join('\n');
  }

  /**
   * 转换为Markdown格式
   */
  toMarkdown(tags) {
    let md = '# 词条数据库\n\n';
    md += `> 导出时间: ${new Date().toISOString()}\n\n`;

    // 按阶段分组
    const byPhase = {};
    for (const tag of tags) {
      const phase = tag.trigger.phase;
      if (!byPhase[phase]) byPhase[phase] = [];
      byPhase[phase].push(tag);
    }

    for (const [phase, phaseTags] of Object.entries(byPhase)) {
      md += `## ${phase}\n\n`;
      md += '| 名称 | ID | 优先级 | 可选 | 消耗 |\n';
      md += '|------|-----|--------|------|------|\n';

      for (const tag of phaseTags) {
        md += `| ${tag.name} | \`${tag.id}\` | ${tag.params?.priority || 0} | ${tag.params?.optional ? '✓' : '-'} | ${tag.params?.consumable ? '✓' : '-'} |\n`;
      }
      md += '\n';
    }

    return md;
  }

  /**
   * 创建版本快照
   */
  createSnapshot(name) {
    const snapshot = {
      name,
      timestamp: new Date().toISOString(),
      tags: this.export()
    };

    this.versions.push(snapshot);
    return snapshot;
  }

  /**
   * 恢复版本
   */
  restore(versionIndex) {
    if (versionIndex >= this.versions.length) {
      throw new Error('版本索引无效');
    }

    const version = this.versions[versionIndex];
    this.tags.clear();

    for (const tag of version.tags.tags) {
      this.tags.set(tag.id, tag);
    }

    this.save();
    return { restored: version.name, count: this.tags.size };
  }

  /**
   * 获取数据库统计
   */
  getStats() {
    const byPhase = {};
    for (const tag of this.tags.values()) {
      const phase = tag.trigger.phase;
      byPhase[phase] = (byPhase[phase] || 0) + 1;
    }

    return {
      total: this.tags.size,
      byPhase,
      versions: this.versions.length
    };
  }

  /**
   * 搜索词条
   */
  search(query) {
    const q = query.toLowerCase();
    return this.getAll().filter(tag =>
      tag.id.toLowerCase().includes(q) ||
      tag.name.toLowerCase().includes(q) ||
      (tag.description && tag.description.toLowerCase().includes(q))
    );
  }

  /**
   * 清除所有词条
   */
  clear() {
    this.tags.clear();
    this.save();
    return true;
  }

  /**
   * 重新加载
   */
  reload() {
    this.tags.clear();
    return this.load();
  }
}

// 单例导出
module.exports = new TagDatabaseManager();
