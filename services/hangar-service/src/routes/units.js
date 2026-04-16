import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';
import XLSX from 'xlsx';
import db from '../database/db.js';
import auth from '../middleware/auth.js';
import validateUnit from '../middleware/validateUnit.js';
import UNIT_TYPES from '../config/unitTypes.js';
import { EXCEL_TEMPLATE } from '../config/excel-template.js';
import { ExcelParser } from '../services/excel-parser.js';
import { ExcelValidator } from '../services/excel-validator.js';
import { UnitImportService } from '../services/unit-import-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = Router();

// 配置文件上传
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads');
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// ==================== 公共接口 ====================

// 获取单位类型配置
router.get('/unit-types', (req, res) => {
  res.json(UNIT_TYPES);
});

// ==================== 棋子 CRUD ====================

// 获取所有棋子
router.get('/', auth, (req, res) => {
  try {
    const units = db.all(`
      SELECT id, name, codename, faction, main_image_url,
             main_type as type,
             has_royroy, created_at,
             left_type,
             right_type,
             extra_type
      FROM units
      WHERE user_id = ?
      ORDER BY created_at DESC
    `, [req.user.id]);
    res.json({ units });
  } catch (error) {
    console.error('获取棋子列表失败:', error);
    res.status(500).json({ error: '获取失败' });
  }
});

// 获取单个棋子详情
router.get('/:id', auth, (req, res) => {
  try {
    const unit = db.get('SELECT * FROM units WHERE id = ?', [req.params.id]);
    if (!unit) {
      return res.status(404).json({ error: '棋子不存在' });
    }

    // 解析JSON字段
    unit.main_skills = JSON.parse(unit.main_skills || '[]');
    unit.royroy_skills = JSON.parse(unit.royroy_skills || '[]');
    unit.left_skills = JSON.parse(unit.left_skills || '[]');
    unit.right_skills = JSON.parse(unit.right_skills || '[]');
    unit.extra_skills = JSON.parse(unit.extra_skills || '[]');

    res.json(unit);
  } catch (error) {
    console.error('获取棋子详情失败:', error);
    res.status(500).json({ error: '获取失败' });
  }
});

// 创建棋子
router.post('/', auth, (req, res) => {
  try {
    const data = req.body;
    
    console.log('创建棋子数据:', JSON.stringify(data, null, 2));

    // 宽松验证：只检查必需字段和数值范围
    const errors = [];
    if (!data.name) errors.push('名称不能为空');
    if (!data.faction) errors.push('阵营不能为空');
    
    // 检查属性值是否为非负数
    const checkNonNegative = (val, name) => {
      if (val !== undefined && val !== null && val < 0) errors.push(`${name}不能为负数`);
    };
    checkNonNegative(data.main_格斗, '主机体格斗');
    checkNonNegative(data.main_射击, '主机体射击');
    checkNonNegative(data.main_结构, '主机体结构');
    checkNonNegative(data.main_机动, '主机体机动');
    
    if (errors.length > 0) {
      return res.status(400).json({ error: '验证失败', details: errors });
    }

    // 序列化技能数组
    const main_skills = JSON.stringify(data.main_skills || []);
    const royroy_skills = JSON.stringify(data.royroy_skills || []);
    const left_skills = JSON.stringify(data.left_skills || []);
    const right_skills = JSON.stringify(data.right_skills || []);
    const extra_skills = JSON.stringify(data.extra_skills || []);

    const result = db.run(`
      INSERT INTO units (
        user_id, name, codename, faction,
        main_type, main_格斗, main_射击, main_结构, main_机动, main_skills, main_image_url,
        has_royroy, royroy_name, royroy_image_url,
        royroy_格斗, royroy_射击, royroy_结构, royroy_机动, royroy_skills,
        left_type, left_image_url, left_格斗, left_射击, left_结构, left_机动, left_skills,
        right_type, right_image_url, right_格斗, right_射击, right_结构, right_机动, right_skills,
        extra_type, extra_image_url, extra_格斗, extra_射击, extra_结构, extra_机动, extra_skills
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      req.user?.id || 1, data.name, data.codename || null, data.faction || 'earth',
      data.main_type || '机体', data.main_格斗 || 0, data.main_射击 || 0, data.main_结构 || 0, data.main_机动 || 0, main_skills, data.main_image_url || null,
      data.has_royroy ? 1 : 0, data.royroy_name || null, data.royroy_image_url || null,
      data.royroy_格斗 || 0, data.royroy_射击 || 0, data.royroy_结构 || 0, data.royroy_机动 || 0, royroy_skills,
      data.left_type || 'none', data.left_image_url || null, data.left_格斗 || 0, data.left_射击 || 0, data.left_结构 || 0, data.left_机动 || 0, left_skills,
      data.right_type || 'none', data.right_image_url || null, data.right_格斗 || 0, data.right_射击 || 0, data.right_结构 || 0, data.right_机动 || 0, right_skills,
      data.extra_type || 'none', data.extra_image_url || null, data.extra_格斗 || 0, data.extra_射击 || 0, data.extra_结构 || 0, data.extra_机动 || 0, extra_skills
    ]);

    res.json({ id: result.lastInsertRowid, message: '棋子创建成功' });
  } catch (error) {
    console.error('创建棋子失败:', error);
    res.status(500).json({ error: '创建失败: ' + error.message, details: error.stack });
  }
});

// 更新棋子
router.put('/:id', auth, (req, res) => {
  try {
    const data = req.body;

    // 宽松验证
    const errors = [];
    if (!data.name) errors.push('名称不能为空');
    if (errors.length > 0) {
      return res.status(400).json({ error: '验证失败', details: errors });
    }

    // 序列化技能数组
    const main_skills = JSON.stringify(data.main_skills || []);
    const royroy_skills = JSON.stringify(data.royroy_skills || []);
    const left_skills = JSON.stringify(data.left_skills || []);
    const right_skills = JSON.stringify(data.right_skills || []);
    const extra_skills = JSON.stringify(data.extra_skills || []);

    db.run(`
      UPDATE units SET
        name = ?, codename = ?, faction = ?, main_type = ?, main_image_url = ?,
        main_格斗 = ?, main_射击 = ?, main_结构 = ?, main_机动 = ?, main_skills = ?,
        has_royroy = ?, royroy_image_url = ?, royroy_name = ?,
        royroy_格斗 = ?, royroy_射击 = ?, royroy_结构 = ?, royroy_机动 = ?, royroy_skills = ?,
        left_type = ?, left_image_url = ?, left_格斗 = ?, left_射击 = ?, left_结构 = ?, left_机动 = ?, left_skills = ?,
        right_type = ?, right_image_url = ?, right_格斗 = ?, right_射击 = ?, right_结构 = ?, right_机动 = ?, right_skills = ?,
        extra_type = ?, extra_image_url = ?, extra_格斗 = ?, extra_射击 = ?, extra_结构 = ?, extra_机动 = ?, extra_skills = ?
      WHERE id = ?
    `, [
      data.name, data.codename || null, data.faction || 'earth', data.main_type || '机体', data.main_image_url || null,
      data.main_格斗 || 0, data.main_射击 || 0, data.main_结构 || 0, data.main_机动 || 0, main_skills,
      data.has_royroy ? 1 : 0, data.royroy_image_url || null, data.royroy_name || null,
      data.royroy_格斗 || 0, data.royroy_射击 || 0, data.royroy_结构 || 0, data.royroy_机动 || 0, royroy_skills,
      data.left_type || 'none', data.left_image_url || null, data.left_格斗 || 0, data.left_射击 || 0, data.left_结构 || 0, data.left_机动 || 0, left_skills,
      data.right_type || 'none', data.right_image_url || null, data.right_格斗 || 0, data.right_射击 || 0, data.right_结构 || 0, data.right_机动 || 0, right_skills,
      data.extra_type || 'none', data.extra_image_url || null, data.extra_格斗 || 0, data.extra_射击 || 0, data.extra_结构 || 0, data.extra_机动 || 0, extra_skills,
      req.params.id
    ]);

    res.json({ message: '棋子更新成功' });
  } catch (error) {
    console.error('更新棋子失败:', error);
    res.status(500).json({ error: '更新失败: ' + error.message });
  }
});

// 删除棋子
router.delete('/:id', auth, (req, res) => {
  try {
    // 先检查棋子是否属于当前用户
    const unit = db.get('SELECT user_id FROM units WHERE id = ?', [req.params.id]);
    if (!unit) {
      return res.status(404).json({ error: '棋子不存在' });
    }
    if (unit.user_id !== req.user.id) {
      return res.status(403).json({ error: '无权删除此棋子' });
    }

    db.run('DELETE FROM units WHERE id = ?', [req.params.id]);
    res.json({ message: '棋子删除成功' });
  } catch (error) {
    console.error('删除棋子失败:', error);
    res.status(500).json({ error: '删除失败' });
  }
});

// ==================== 文件上传 ====================

// 上传图片
router.post('/upload-image', upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '没有上传文件' });
    }
    const imageUrl = `/api/hangar/units/uploads/${req.file.filename}`;
    res.json({ url: imageUrl });
  } catch (error) {
    console.error('上传图片失败:', error);
    res.status(500).json({ error: '上传失败' });
  }
});

// ==================== Excel 导入 ====================

// Excel导入棋子
router.post('/import-excel', auth, upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '没有上传文件' });
    }

    const userId = req.user.id || 1;
    const workbook = XLSX.readFile(req.file.path);

    // 查找"设定器"工作表
    let sheetName = '设定器';
    if (!workbook.Sheets[sheetName]) {
      console.log('工作表"设定器"不存在，可用工作表:', workbook.SheetNames);
      // 清理临时文件
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Excel文件中没有找到"设定器"工作表，可用工作表: ' + workbook.SheetNames.join(', ') });
    }

    const worksheet = workbook.Sheets[sheetName];
    console.log('已加载工作表:', sheetName);

    // 读取单元格值
    const getCell = (addr) => {
      const cell = worksheet[addr];
      if (!cell) return null;
      const val = cell.v;
      if (typeof val === 'number') return val;
      if (typeof val === 'string') return val.trim();
      return val?.toString() || null;
    };

    // 读取基础信息 (行2)
    console.log('开始读取基础信息...');
    const name = getCell('C2') || '未命名';
    const codename = getCell('F2') || '';
    const factionRaw = getCell('I2') || '';
    
    console.log(`基础信息: name=${name}, codename=${codename}, factionRaw=${factionRaw}`);

    // 映射阵营（支持多种写法）
    const factionMap = {
      '地球联合': 'earth', '拜隆': 'balon', '马克西翁': 'maxion',
      '拜隆军': 'balon', '地球联合军': 'earth',
      '地球': 'earth', '拜隆': 'balon', '马克': 'maxion'
    };
    const faction = factionMap[factionRaw] || 'earth';
    console.log(`阵营映射: ${factionRaw} -> ${faction}`);

    // 读取单位属性 (行4-8)
    const units = {};
    console.log('开始读取单位属性...');
    for (let row = 4; row <= 8; row++) {
      const unitName = getCell('A' + row);
      const unitType = getCell('B' + row);
      const totalPoints = getCell('C' + row);
      const gou = parseInt(getCell('D' + row)) || 0;
      const she = parseInt(getCell('E' + row)) || 0;
      const jie = parseInt(getCell('F' + row)) || 0;
      const ji = parseInt(getCell('G' + row)) || 0;
      const skillSlots = parseInt(getCell('H' + row)) || 0;
      
      console.log(`行${row}: name=${unitName}, type=${unitType}, 格斗=${gou}, 射击=${she}, 结构=${jie}, 机动=${ji}`);
      
      if (!unitName) continue;

      units[unitName] = {
        type: unitType || 'none',
        格斗: gou,
        射击: she,
        结构: jie,
        机动: ji,
        skillSlots: skillSlots
      };
    }
    console.log('读取到的单位:', Object.keys(units));

    // 主机体数据
    const mainUnit = units['主机体'] || {};
    const 格斗 = mainUnit.格斗 || 0;
    const 射击 = mainUnit.射击 || 0;
    const 结构 = mainUnit.结构 || 0;
    const 机动 = mainUnit.机动 || 0;

    // 读取技能表 (行11-22)
    const main_skills = [];
    const royroy_skills = [];
    const left_skills = [];
    const right_skills = [];
    const extra_skills = [];

    console.log('开始读取技能表...');
    for (let row = 11; row <= 22; row++) {
      const skillName = getCell('C' + row);
      const skillType = getCell('D' + row);
      const skillAttr = getCell('E' + row) || '实体';
      const skillEffect = getCell('F' + row);
      const skillRange = getCell('G' + row);
      const skillSpecial = getCell('H' + row);

      console.log(`行${row}: name=${skillName}, type=${skillType}`);

      if (!skillName) continue;

      const skill = {
        name: skillName,
        type: skillType || '自动化',
        attribute: skillAttr,
        effect: skillEffect,
        range: skillRange || '',
        special: skillSpecial || ''
      };

      // 根据行号分配技能
      // 12-14行: 主机体技能(3个)
      // 15-16行: Royroy技能(2个)
      // 17-18行: 右手技能(2个)
      // 19-20行: 左手技能(2个)
      // 21-22行: 其它/Extra技能(2个)
      if (row >= 12 && row <= 14) {
        main_skills.push(skill);
        console.log(`  -> 主机体技能[${main_skills.length}]`);
      } else if (row >= 15 && row <= 16) {
        royroy_skills.push(skill);
        console.log(`  -> Royroy技能[${royroy_skills.length}]`);
      } else if (row >= 17 && row <= 18) {
        right_skills.push(skill);
        console.log(`  -> 右手技能[${right_skills.length}]`);
      } else if (row >= 19 && row <= 20) {
        left_skills.push(skill);
        console.log(`  -> 左手技能[${left_skills.length}]`);
      } else if (row >= 21 && row <= 22) {
        // 其它技能从E列读取属性（与其他技能不同）
        skill.attribute = getCell('E' + row) || '';
        extra_skills.push(skill);
        console.log(`  -> 其它技能[${extra_skills.length}]`);
      }
    }
    console.log('技能读取完成:', {main: main_skills.length, royroy: royroy_skills.length, left: left_skills.length, right: right_skills.length, extra: extra_skills.length});

    // 装备类型
    const left_type = units['左手']?.type || 'none';
    const right_type = units['右手']?.type || 'none';
    const extra_type = units['其它']?.type || 'none';

    // 数据验证（Excel导入模式放宽验证）
    const unitData = {
      main_格斗: 格斗, main_射击: 射击, main_结构: 结构, main_机动: 机动,
      left_type, left_格斗: units['左手']?.格斗 || 0, left_射击: units['左手']?.射击 || 0,
      left_结构: units['左手']?.结构 || 0, left_机动: units['左手']?.机动 || 0,
      right_type, right_格斗: units['右手']?.格斗 || 0, right_射击: units['右手']?.射击 || 0,
      right_结构: units['右手']?.结构 || 0, right_机动: units['右手']?.机动 || 0,
      extra_type, extra_格斗: units['其它']?.格斗 || 0, extra_射击: units['其它']?.射击 || 0,
      extra_结构: units['其它']?.结构 || 0, extra_机动: units['其它']?.机动 || 0,
      has_royroy: !!units['跟随'],
      royroy_格斗: units['跟随']?.格斗 || 0, royroy_射击: units['跟随']?.射击 || 0,
      royroy_结构: units['跟随']?.结构 || 0, royroy_机动: units['跟随']?.机动 || 0
    };
    
    // Excel导入模式下放宽验证，仅检查数值是否为非负数
    const validationErrors = [];
    const checkNonNegative = (val, name) => {
      if (val < 0) validationErrors.push(`${name}不能为负数`);
    };
    checkNonNegative(unitData.main_格斗, '主机体格斗');
    checkNonNegative(unitData.main_射击, '主机体射击');
    checkNonNegative(unitData.main_结构, '主机体结构');
    checkNonNegative(unitData.main_机动, '主机体机动');
    
    if (validationErrors.length > 0) {
      console.warn('Excel导入数据验证警告:', validationErrors);
    }

    // 插入数据库 - 按数据库表字段顺序
    const sql = `
      INSERT INTO units (
        name, faction, user_id, codename,
        main_type, main_格斗, main_射击, main_结构, main_机动, main_skills,
        has_royroy, royroy_name,
        royroy_格斗, royroy_射击, royroy_结构, royroy_机动, royroy_skills,
        left_type, left_格斗, left_射击, left_结构, left_机动, left_skills,
        right_type, right_格斗, right_射击, right_结构, right_机动, right_skills,
        extra_type, extra_格斗, extra_射击, extra_结构, extra_机动, extra_skills
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      name, faction, userId, codename || null,
      '机体', 格斗, 射击, 结构, 机动, JSON.stringify(main_skills),
      units['跟随'] ? 1 : 0, '跟随',
      units['跟随']?.格斗 || 0, units['跟随']?.射击 || 0, units['跟随']?.结构 || 0, units['跟随']?.机动 || 0, JSON.stringify(royroy_skills),
      left_type || 'none', units['左手']?.格斗 || 0, units['左手']?.射击 || 0, units['左手']?.结构 || 0, units['左手']?.机动 || 0, JSON.stringify(left_skills),
      right_type || 'none', units['右手']?.格斗 || 0, units['右手']?.射击 || 0, units['右手']?.结构 || 0, units['右手']?.机动 || 0, JSON.stringify(right_skills),
      extra_type || 'none', units['其它']?.格斗 || 0, units['其它']?.射击 || 0, units['其它']?.结构 || 0, units['其它']?.机动 || 0, JSON.stringify(extra_skills)
    ];
    const result = db.run(sql, params);

    // 保留临时文件用于调试（生产环境可删除）
    // fs.unlinkSync(req.file.path);
    console.log('Excel临时文件保留:', req.file.path);

    const fullName = codename ? `${name} (${codename})` : name;

    res.json({
      id: result.lastInsertRowid,
      message: '棋子导入成功',
      warnings: validationErrors.length > 0 ? validationErrors : undefined,
      unit: {
        name: fullName,
        codename,
        faction,
        '格斗': 格斗,
        '射击': 射击,
        '结构': 结构,
        '机动': 机动,
        skills: main_skills,
        has_royroy: !!units['跟随'],
        'royroy_格斗': units['跟随']?.格斗 || 0,
        'royroy_射击': units['跟随']?.射击 || 0,
        'royroy_结构': units['跟随']?.结构 || 0,
        'royroy_机动': units['跟随']?.机动 || 0,
        royroy_skills,
        left_type: left_type || 'none',
        'left_格斗': units['左手']?.格斗 || 0,
        'left_射击': units['左手']?.射击 || 0,
        'left_结构': units['左手']?.结构 || 0,
        'left_机动': units['左手']?.机动 || 0,
        left_skills,
        right_type: right_type || 'none',
        'right_格斗': units['右手']?.格斗 || 0,
        'right_射击': units['右手']?.射击 || 0,
        'right_结构': units['右手']?.结构 || 0,
        'right_机动': units['右手']?.机动 || 0,
        right_skills,
        extra_type: extra_type || 'none',
        'extra_格斗': units['其它']?.格斗 || 0,
        'extra_射击': units['其它']?.射击 || 0,
        'extra_结构': units['其它']?.结构 || 0,
        'extra_机动': units['其它']?.机动 || 0,
        extra_skills
      }
    });
  } catch (error) {
    console.error('Excel导入失败:', error);
    // 导入失败时保留临时文件以便调试
    console.log('导入失败，临时文件保留:', req.file?.path);
    res.status(500).json({ 
      error: '导入失败: ' + error.message,
      details: error.stack
    });
  }
});

// ============================================
// 新版Excel导入API（基于配置化的解析器）
// ============================================
router.post('/import-excel-new', auth, upload.single('file'), async (req, res) => {
  try {
    console.log('[API /import-excel-new] 收到导入请求');
    
    if (!req.file) {
      return res.status(400).json({ error: '未提供文件' });
    }

    // 1. 读取Excel文件
    const fileBuffer = fs.readFileSync(req.file.path);
    console.log('[API /import-excel-new] 文件大小:', fileBuffer.length, 'bytes');

    // 2. 解析Excel
    const parser = new ExcelParser(EXCEL_TEMPLATE);
    const data = parser.parse(fileBuffer);
    console.log('[API /import-excel-new] 解析完成:', {
      name: data.basic.name,
      units: Object.keys(data.units),
      skills: data.skills.length
    });

    // 3. 验证数据
    const validator = new ExcelValidator(EXCEL_TEMPLATE);
    const validation = validator.validate(data);
    
    if (!validation.valid) {
      console.log('[API /import-excel-new] 验证失败:', validation.errors);
      // 删除临时文件
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        error: '数据验证失败',
        details: validation.errors,
        warnings: validation.warnings
      });
    }

    console.log('[API /import-excel-new] 验证通过');

    // 4. 导入数据
    const importService = new UnitImportService(db);
    const result = await importService.import(data, req.userId);

    // 删除临时文件
    fs.unlinkSync(req.file.path);

    if (!result.success) {
      console.log('[API /import-excel-new] 导入失败:', result.error);
      return res.status(500).json({
        error: '导入失败',
        message: result.error,
        log: result.log
      });
    }

    console.log('[API /import-excel-new] 导入成功, ID:', result.unitId);

    // 返回成功结果
    const fullName = data.basic.codename 
      ? `${data.basic.name} (${data.basic.codename})` 
      : data.basic.name;

    res.json({
      success: true,
      id: result.unitId,
      message: '导入成功',
      unit: {
        name: fullName,
        codename: data.basic.codename,
        faction: data.basic.faction || 'earth',
        ...data.units['主机体']
      },
      warnings: validation.warnings,
      log: result.log
    });

  } catch (error) {
    console.error('[API /import-excel-new] 错误:', error);
    // 清理临时文件
    if (req.file?.path) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
    res.status(500).json({
      error: '系统错误',
      message: error.message
    });
  }
});

// ==================== Excel预览功能（新版流程）====================

// 解析Excel为JSON预览数据（不保存到数据库）
router.post('/parse-excel', auth, upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '没有上传文件' });
    }

    const workbook = XLSX.readFile(req.file.path);

    // 查找"设定器"工作表
    let sheetName = '设定器';
    if (!workbook.Sheets[sheetName]) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ 
        error: 'Excel文件中没有找到"设定器"工作表',
        availableSheets: workbook.SheetNames 
      });
    }

    const worksheet = workbook.Sheets[sheetName];

    // 读取单元格值（空值返回'null'字符串）
    const getCell = (addr) => {
      const cell = worksheet[addr];
      if (!cell) return 'null';
      const val = cell.v;
      if (val === undefined || val === null || val === '') return 'null';
      if (typeof val === 'number') return val;
      if (typeof val === 'string') {
        const trimmed = val.trim();
        return trimmed === '' ? 'null' : trimmed;
      }
      return val?.toString() || 'null';
    };

    // 读取基础信息 (行2)
    const name = getCell('C2') === 'null' ? '' : getCell('C2');
    const codename = getCell('F2') === 'null' ? '' : getCell('F2');
    const factionRaw = getCell('I2') === 'null' ? '' : getCell('I2');

    // 映射阵营
    const factionMap = {
      '地球联合': 'earth', '拜隆': 'balon', '马克西翁': 'maxion',
      '拜隆军': 'balon', '地球联合军': 'earth',
      '地球': 'earth', '马克': 'maxion'
    };
    const faction = factionMap[factionRaw] || 'earth';

    // 读取单位属性 (行4-8)
    const units = {};
    for (let row = 4; row <= 8; row++) {
      const unitName = getCell('A' + row);
      const unitType = getCell('B' + row);
      const gou = getCell('D' + row);
      const she = getCell('E' + row);
      const jie = getCell('F' + row);
      const ji = getCell('G' + row);

      if (unitName === 'null') continue;

      units[unitName] = {
        type: unitType === 'null' ? 'none' : unitType,
        格斗: gou === 'null' ? 0 : parseInt(gou) || 0,
        射击: she === 'null' ? 0 : parseInt(she) || 0,
        结构: jie === 'null' ? 0 : parseInt(jie) || 0,
        机动: ji === 'null' ? 0 : parseInt(ji) || 0
      };
    }

    // 主机体数据
    const mainUnit = units['主机体'] || { 格斗: 0, 射击: 0, 结构: 0, 机动: 0 };

    // 读取技能表 (行11-22) - 修复：空值保留为'null'，不跳过
    const main_skills = [];
    const royroy_skills = [];
    const left_skills = [];
    const right_skills = [];
    const extra_skills = [];

    for (let row = 11; row <= 22; row++) {
      const skillName = getCell('C' + row);
      const skillType = getCell('D' + row);
      const skillAttr = getCell('E' + row);
      const skillEffect = getCell('F' + row);
      const skillRange = getCell('G' + row);

      // 判断整行是否完全为空（全为'null'）
      const isEmptyRow = skillName === 'null' && skillType === 'null' && 
                         skillAttr === 'null' && skillEffect === 'null' && 
                         skillRange === 'null';
      
      if (isEmptyRow) continue; // 只有整行空才跳过

      const skill = {
        name: skillName,
        type: skillType === 'null' ? '' : skillType,
        attribute: skillAttr === 'null' ? '实体' : skillAttr,
        effect: skillEffect === 'null' ? '' : skillEffect,
        range: skillRange === 'null' ? '' : skillRange
      };

      // 根据行号分配技能
      if (row >= 12 && row <= 14) {
        main_skills.push(skill);
      } else if (row >= 15 && row <= 16) {
        royroy_skills.push(skill);
      } else if (row >= 17 && row <= 18) {
        right_skills.push(skill);
      } else if (row >= 19 && row <= 20) {
        left_skills.push(skill);
      } else if (row >= 21 && row <= 22) {
        extra_skills.push(skill);
      }
    }

    // 装备类型
    const left_type = units['左手']?.type || 'none';
    const right_type = units['右手']?.type || 'none';
    const extra_type = units['其它']?.type || 'none';

    // 收集空值字段（用于前端提示）
    const emptyFields = [];
    if (name === '') emptyFields.push({ field: 'name', message: '棋子名称未填写' });
    if (!units['主机体']) emptyFields.push({ field: 'mainUnit', message: '主机体数据缺失' });
    if (extra_type !== 'none' && extra_skills.length === 0) {
      emptyFields.push({ field: 'extra_skills', message: '其它装备已选择，但技能未填写（可后续补充）' });
    }

    // 构建预览数据
    const previewData = {
      name,
      codename,
      faction,
      // 主机体
      main_type: '机体',
      main_格斗: mainUnit.格斗,
      main_射击: mainUnit.射击,
      main_结构: mainUnit.结构,
      main_机动: mainUnit.机动,
      main_skills,
      // Royroy
      has_royroy: !!units['跟随'],
      royroy_name: units['跟随'] ? 'Royroy' : '',
      royroy_格斗: units['跟随']?.格斗 || 0,
      royroy_射击: units['跟随']?.射击 || 0,
      royroy_结构: units['跟随']?.结构 || 0,
      royroy_机动: units['跟随']?.机动 || 0,
      royroy_skills,
      // 左手
      left_type,
      left_格斗: units['左手']?.格斗 || 0,
      left_射击: units['左手']?.射击 || 0,
      left_结构: units['左手']?.结构 || 0,
      left_机动: units['左手']?.机动 || 0,
      left_skills,
      // 右手
      right_type,
      right_格斗: units['右手']?.格斗 || 0,
      right_射击: units['右手']?.射击 || 0,
      right_结构: units['右手']?.结构 || 0,
      right_机动: units['右手']?.机动 || 0,
      right_skills,
      // 其它
      extra_type,
      extra_格斗: units['其它']?.格斗 || 0,
      extra_射击: units['其它']?.射击 || 0,
      extra_结构: units['其它']?.结构 || 0,
      extra_机动: units['其它']?.机动 || 0,
      extra_skills
    };

    // 删除临时文件
    fs.unlinkSync(req.file.path);

    res.json({
      success: true,
      preview: previewData,
      emptyFields,
      warnings: emptyFields.length > 0 ? emptyFields.map(f => f.message) : []
    });

  } catch (error) {
    console.error('Excel解析失败:', error);
    if (req.file?.path) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
    res.status(500).json({ error: '解析失败: ' + error.message });
  }
});

// 从JSON创建棋子（用于确认上传流程）
router.post('/create-from-json', auth, (req, res) => {
  try {
    const data = req.body;

    console.log('[create-from-json] 收到数据:', JSON.stringify(data, null, 2));

    // 宽松验证：只检查必需字段
    const errors = [];
    if (!data.name || data.name === 'null' || data.name === '') {
      errors.push('棋子名称不能为空');
    }
    if (!data.faction) {
      errors.push('阵营不能为空');
    }

    // 检查数值是否为非负数
    const checkNonNegative = (val, name) => {
      const num = parseInt(val);
      if (!isNaN(num) && num < 0) errors.push(`${name}不能为负数`);
    };
    checkNonNegative(data.main_格斗, '主机体格斗');
    checkNonNegative(data.main_射击, '主机体射击');
    checkNonNegative(data.main_结构, '主机体结构');
    checkNonNegative(data.main_机动, '主机体机动');

    if (errors.length > 0) {
      return res.status(400).json({ error: '验证失败', details: errors });
    }

    // 清理技能数据中的'null'值
    const cleanSkills = (skills) => {
      if (!Array.isArray(skills)) return '[]';
      return skills.map(s => ({
        name: s?.name === 'null' ? '' : (s?.name || ''),
        type: s?.type === 'null' ? '' : (s?.type || ''),
        attribute: s?.attribute === 'null' ? '实体' : (s?.attribute || '实体'),
        effect: s?.effect === 'null' ? '' : (s?.effect || ''),
        range: s?.range === 'null' ? '' : (s?.range || '')
      }));
    };

    // 序列化技能数组
    const main_skills = JSON.stringify(cleanSkills(data.main_skills || []));
    const royroy_skills = JSON.stringify(cleanSkills(data.royroy_skills || []));
    const left_skills = JSON.stringify(cleanSkills(data.left_skills || []));
    const right_skills = JSON.stringify(cleanSkills(data.right_skills || []));
    const extra_skills = JSON.stringify(cleanSkills(data.extra_skills || []));

    const result = db.run(`
      INSERT INTO units (
        user_id, name, codename, faction,
        main_type, main_格斗, main_射击, main_结构, main_机动, main_skills, main_image_url,
        has_royroy, royroy_name, royroy_image_url,
        royroy_格斗, royroy_射击, royroy_结构, royroy_机动, royroy_skills,
        left_type, left_image_url, left_格斗, left_射击, left_结构, left_机动, left_skills,
        right_type, right_image_url, right_格斗, right_射击, right_结构, right_机动, right_skills,
        extra_type, extra_image_url, extra_格斗, extra_射击, extra_结构, extra_机动, extra_skills
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      req.user?.id || 1, 
      data.name === 'null' ? '' : data.name, 
      data.codename === 'null' ? null : data.codename, 
      data.faction || 'earth',
      data.main_type || '机体', 
      parseInt(data.main_格斗) || 0, 
      parseInt(data.main_射击) || 0, 
      parseInt(data.main_结构) || 0, 
      parseInt(data.main_机动) || 0, 
      main_skills, 
      data.main_image_url || null,
      data.has_royroy ? 1 : 0, 
      data.royroy_name === 'null' ? null : data.royroy_name, 
      data.royroy_image_url || null,
      parseInt(data.royroy_格斗) || 0, 
      parseInt(data.royroy_射击) || 0, 
      parseInt(data.royroy_结构) || 0, 
      parseInt(data.royroy_机动) || 0, 
      royroy_skills,
      data.left_type || 'none', 
      data.left_image_url || null, 
      parseInt(data.left_格斗) || 0, 
      parseInt(data.left_射击) || 0, 
      parseInt(data.left_结构) || 0, 
      parseInt(data.left_机动) || 0, 
      left_skills,
      data.right_type || 'none', 
      data.right_image_url || null, 
      parseInt(data.right_格斗) || 0, 
      parseInt(data.right_射击) || 0, 
      parseInt(data.right_结构) || 0, 
      parseInt(data.right_机动) || 0, 
      right_skills,
      data.extra_type || 'none', 
      data.extra_image_url || null, 
      parseInt(data.extra_格斗) || 0, 
      parseInt(data.extra_射击) || 0, 
      parseInt(data.extra_结构) || 0, 
      parseInt(data.extra_机动) || 0, 
      extra_skills
    ]);

    res.json({ 
      success: true,
      id: result.lastInsertRowid, 
      message: '棋子创建成功' 
    });

  } catch (error) {
    console.error('从JSON创建棋子失败:', error);
    res.status(500).json({ error: '创建失败: ' + error.message });
  }
});

export default router;
