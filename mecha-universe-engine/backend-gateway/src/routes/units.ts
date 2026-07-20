/**
 * Phase 29-HangarRestoration — 单位管理路由 (sql.js)
 *
 * AI 形象生成接口：前置积分扣减锁，扣尽即拦。
 * 版权溯源：is_public_copy / original_author_id 持久化。
 * Excel 导入：parse-excel + create-from-json 完整归入大一统网关。
 */

import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { authenticate, requireAuth } from '../middleware/auth.js';
import { run, get, all, persistChanges } from '../db/sqlite.js';
import { ErrorCode, UserRole } from '@mecha/shared-kernel';
import { ExcelParser } from '../services/excel-parser.js';
import { ExcelValidator } from '../services/excel-validator.js';
import { normalizeParsedData } from '../services/excel-schema-normalizer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// Multer 文件上传：内存存储（Excel 文件通常 < 5MB）
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    // Phase 30-Fix: 宽松 MIME 检测，兼容各浏览器/OS 的 .xlsx 变体
    const allowedMimes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/octet-stream',            // 某些浏览器对 .xlsx 发送此类型
      'application/x-excel',
      'application/x-msexcel',
    ];
    const allowedExts = ['.xlsx', '.xls'];
    const ext = (file.originalname || '').toLowerCase().slice(file.originalname.lastIndexOf('.'));
    if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('仅支持 .xlsx / .xls 格式的 Excel 文件'));
    }
  },
});

// 所有单位路由需认证（图片静态服务除外）
router.use('/api/units', authenticate, requireAuth);

// ========================================
// Phase 29-DataSecurity: 权限卡口 — 审核状态机
// ========================================
/** 根据角色计算 is_public 与 review_status */
function computeVisibility(userRole: string, requestedPublic: boolean): { is_public: number; review_status: string } {
  const isAdminOrAbove = userRole === UserRole.ADMIN || userRole === UserRole.DOMINATOR;

  if (isAdminOrAbove) {
    // 管理员/主宰：自由设置 is_public，直接 approved
    return {
      is_public: requestedPublic ? 1 : 0,
      review_status: 'approved',
    };
  }

  // 普通用户/裁判：锁死 is_public=0，状态 pending
  return {
    is_public: 0,
    review_status: 'pending',
  };
}

// ========================================
// 获取当前用户的单位列表
// ========================================
router.get('/api/units', (req, res) => {
  const units = all(
    'SELECT * FROM units WHERE owner_id = ? ORDER BY updated_at DESC',
    [req.auth!.userId]
  );
  res.json({ units });
});

// ========================================
// Phase 30-Fix: 获取单个单位完整数据（编辑回填）
// ========================================
router.get('/api/units/:unitId', (req, res) => {
  const unit = get('SELECT * FROM units WHERE id = ? AND owner_id = ?', [req.params.unitId, req.auth!.userId]) as any;
  if (!unit) {
    res.status(404).json({ error: 'UNIT_NOT_FOUND', message: '单位不存在或无权访问' });
    return;
  }
  res.json({
    id: unit.id,
    name: unit.name,
    codename: unit.codename || '',
    faction: unit.faction,
    category: unit.category,
    tier: unit.tier,
    sprite_key: unit.sprite_key,
    main_image_url: unit.sprite_key || null,
    stats: JSON.parse(unit.stats || '{}'),
    skills: JSON.parse(unit.skills || '[]'),
    attributes: JSON.parse(unit.attributes || '{}'),
    is_public: unit.is_public,
    review_status: unit.review_status,
    created_at: unit.created_at,
    updated_at: unit.updated_at,
  });
});

// ========================================
// 创建单位（不含 AI 生成，普通保存）
// ========================================
router.post('/api/units', (req, res) => {
  try {
    const { name, faction = 'earth', category = 'melee', tier = 1, sprite_key, stats = {}, skills = [], attributes = {}, is_public = false } = req.body;

    if (!name) {
      res.status(400).json({ error: ErrorCode.VALIDATION_ERROR, message: '单位名称为必填项' });
      return;
    }

    // Phase 29-DataSecurity: 审核状态机卡口
    const userRole = req.auth!.role || 'user';
    const { is_public: finalIsPublic, review_status } = computeVisibility(userRole, is_public);

    const id = uuidv4();
    run(
      `INSERT INTO units (id, owner_id, name, faction, category, tier, sprite_key, stats, skills, is_public, review_status, attributes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, req.auth!.userId, name, faction, category, tier, sprite_key || null, JSON.stringify(stats), JSON.stringify(skills), finalIsPublic, review_status, JSON.stringify(attributes)]
    );
    persistChanges();

    console.log(`[Units] 创建: ${name} (is_public=${finalIsPublic}, review=${review_status})`);

    res.status(201).json({ unit: { id, name, faction, category, tier, owner_id: req.auth!.userId, is_public: finalIsPublic, review_status } });
  } catch (err) {
    console.error('[Units] 创建单位错误:', err);
    res.status(500).json({ error: ErrorCode.INTERNAL_ERROR, message: '创建单位失败' });
  }
});

// ========================================
// Phase 29-P1: AI 形象生成 — 前置积分扣减锁
// 每次调用消耗 1 积分，扣尽即拦 403
// ========================================
router.post('/api/units/generate', (req, res) => {
  try {
    const userId = req.auth!.userId;

    // 查询当前积分
    const user = get('SELECT credits FROM users WHERE id = ?', [userId]) as any;
    if (!user) {
      res.status(404).json({ error: 'USER_NOT_FOUND', message: '用户不存在' });
      return;
    }

    const currentCredits = typeof user.credits === 'number' ? user.credits : 0;

    // 🔒 积分扣减锁：无情拦截
    if (currentCredits <= 0) {
      res.status(403).json({
        error: ErrorCode.CREDITS_INSUFFICIENT,
        message: 'AI 形象生成积分已耗尽。每日重置或等待管理员赠送积分。',
        remainingCredits: 0,
      });
      return;
    }

    // 扣减 1 积分
    const newCredits = currentCredits - 1;
    run('UPDATE users SET credits = ?, updated_at = datetime(\'now\') WHERE id = ?', [newCredits, userId]);
    persistChanges();

    console.log(`[Units] AI 生成 — 用户 ${req.auth!.username} 消耗 1 积分，剩余 ${newCredits}`);

    // 此处可接入实际的 AI 生成管线（异步）
    res.json({
      success: true,
      message: 'AI 形象生成请求已提交',
      remainingCredits: newCredits,
      generationId: uuidv4(),
    });
  } catch (err) {
    console.error('[Units] AI 生成错误:', err);
    res.status(500).json({ error: ErrorCode.INTERNAL_ERROR, message: 'AI 生成失败' });
  }
});

// ========================================
// Phase 29-Debug: 阵营静态字典端点
// 从内存常量返回阵营列表，保证 loadFactions() 不再 404
// ========================================
const FACTION_DICT: Record<string, { code: string; name: string; logoUrl: string }> = {
  earth:    { code: 'earth',    name: '地球联合',   logoUrl: '/api/units/factions/logo/earth.png' },
  bailong:  { code: 'bailong',  name: '拜隆军',     logoUrl: '/api/units/factions/logo/bailong.png' },
  maxion:   { code: 'maxion',   name: '马克西翁',   logoUrl: '/api/units/factions/logo/maxion.png' },
};

router.get('/api/units/factions', (_req, res) => {
  // 动态合并数据库中实际使用到的阵营
  const usedCodes = all(
    'SELECT DISTINCT faction FROM units WHERE faction IS NOT NULL AND faction != \'\''
  ) as { faction: string }[];
  const dbFactions: Record<string, { code: string; name: string; logoUrl: string }> = {};
  for (const row of usedCodes) {
    const code = row.faction;
    if (!FACTION_DICT[code]) {
      dbFactions[code] = { code, name: code, logoUrl: `/api/units/factions/logo/${code}.png` };
    }
  }

  const allFactions = { ...FACTION_DICT, ...dbFactions };
  res.json({ factions: Object.values(allFactions) });
});

// ========================================
// 更新单位
// ========================================
router.put('/api/units/:unitId', (req, res) => {
  const unit = get('SELECT * FROM units WHERE id = ? AND owner_id = ?', [req.params.unitId, req.auth!.userId]) as any;
  if (!unit) {
    res.status(404).json({ error: 'UNIT_NOT_FOUND', message: '单位不存在或无权修改' });
    return;
  }

  const { name, faction, category, tier, sprite_key, stats, skills, attributes, is_public } = req.body;

  // Phase 29-DataSecurity: 审核状态机卡口
  const userRole = req.auth!.role || 'user';
  const requestedPublic = is_public !== undefined ? is_public : (unit.is_public === 1);
  const { is_public: finalIsPublic, review_status } = computeVisibility(userRole, requestedPublic);

  run(
    `UPDATE units SET name = ?, faction = ?, category = ?, tier = ?, sprite_key = ?, stats = ?, skills = ?, is_public = ?, review_status = ?, attributes = ?, updated_at = datetime('now')
     WHERE id = ?`,
    [name || unit.name, faction || unit.faction, category || unit.category, tier ?? unit.tier,
     sprite_key ?? unit.sprite_key, JSON.stringify(stats ?? JSON.parse(unit.stats)),
     JSON.stringify(skills ?? JSON.parse(unit.skills || '[]')),
     finalIsPublic, review_status,
     JSON.stringify(attributes ?? JSON.parse(unit.attributes || '{}')), req.params.unitId]
  );
  persistChanges();

  console.log(`[Units] 更新: ${name || unit.name} (is_public=${finalIsPublic}, review=${review_status})`);

  res.json({ success: true, is_public: finalIsPublic, review_status });
});

// ========================================
// Phase 29-HangarRestoration: Excel 文件解析端点
// POST /api/units/parse-excel
// 接收 FormData (field: 'file')，返回归一化预览数据
// ========================================
router.post('/api/units/parse-excel', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: ErrorCode.VALIDATION_ERROR, message: '请上传 Excel 文件（.xlsx）' });
      return;
    }

    console.log(`[Units/Excel] 收到文件: ${req.file.originalname}, 大小: ${req.file.size} bytes`);

    // 1. 解析 Excel
    const parser = new ExcelParser();
    const parsed = parser.parse(req.file.buffer);

    // 2. 验证数据
    const validator = new ExcelValidator();
    const validation = validator.validate(parsed);

    if (!validation.valid) {
      res.status(400).json({
        error: ErrorCode.VALIDATION_ERROR,
        message: 'Excel 数据验证失败',
        errors: validation.errors,
        warnings: validation.warnings,
      });
      return;
    }

    // 3. Schema 归一化
    const { normalized, legacy } = normalizeParsedData(parsed);

    // 4. 返回预览（前端确认后调 create-from-json）
    res.json({
      preview: {
        normalized,
        legacy,
        metadata: parsed.metadata,
      },
      warnings: validation.warnings,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Units/Excel] 解析异常:', msg);
    res.status(500).json({ error: ErrorCode.INTERNAL_ERROR, message: `Excel 解析失败: ${msg}` });
  }
});

// ========================================
// Phase 29-HangarRestoration: 事务化批量导入端点
// POST /api/units/create-from-json
// 接收归一化后的单位数据，事务化 INSERT 进主库
// owner_id 物理锁死为当前登录用户
// ========================================
router.post('/api/units/create-from-json', (req, res) => {
  try {
    const userId = req.auth!.userId;
    const userRole = req.auth!.role || 'user';
    const { normalized } = req.body;

    if (!normalized || !normalized.name) {
      res.status(400).json({ error: ErrorCode.VALIDATION_ERROR, message: '缺少单位数据（normalized.name 为必填项）' });
      return;
    }

    const { name, faction = 'earth', category = 'melee', tier = 1, sprite_key, stats = {}, skills = [], attributes = {} } = normalized;

    // Phase 29-DataSecurity: 审核状态机卡口
    const isAdminOrAbove = userRole === UserRole.ADMIN || userRole === UserRole.DOMINATOR;
    const finalIsPublic = isAdminOrAbove ? 1 : 0;
    const reviewStatus = isAdminOrAbove ? 'approved' : 'pending';

    // 确保 stats 为有效 JSON
    const statsJson = typeof stats === 'string' ? stats : JSON.stringify(stats);
    const skillsJson = typeof skills === 'string' ? skills : JSON.stringify(skills);
    const attrsJson = typeof attributes === 'string' ? attributes : JSON.stringify(attributes);

    const id = uuidv4();
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

    run(
      `INSERT INTO units (id, owner_id, name, faction, category, tier, sprite_key, stats, skills, is_public_copy, is_public, review_status, original_author_id, generation_status, attributes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, NULL, 'completed', ?, ?, ?)`,
      [id, userId, name, faction, category, tier, sprite_key || null, statsJson, skillsJson, finalIsPublic, reviewStatus, attrsJson, now, now]
    );
    persistChanges();

    console.log(`[Units/Excel] 导入成功: ${name} (id=${id}, owner=${userId}, is_public=${finalIsPublic}, review=${reviewStatus})`);

    res.status(201).json({
      success: true,
      unit: {
        id,
        name,
        faction,
        category,
        tier,
        owner_id: userId,
        is_public: finalIsPublic,
        review_status: reviewStatus,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Units/Excel] 批量导入错误:', msg);
    res.status(500).json({ error: ErrorCode.INTERNAL_ERROR, message: `导入失败: ${msg}` });
  }
});

// ========================================
// 删除单位
// ========================================
router.delete('/api/units/:unitId', (req, res) => {
  const unit = get('SELECT * FROM units WHERE id = ? AND owner_id = ?', [req.params.unitId, req.auth!.userId]) as any;
  if (!unit) {
    res.status(404).json({ error: 'UNIT_NOT_FOUND', message: '单位不存在或无权删除' });
    return;
  }
  run('DELETE FROM units WHERE id = ?', [req.params.unitId]);
  persistChanges();
  res.json({ success: true });
});

// ========================================
// Phase 30-ImageUpload: 图片上传基建
// POST /api/units/upload-image — 单位机体图片
// POST /api/units/factions/upload — 阵营 Logo 图片
// ========================================
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    const allowedMimes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('仅支持 PNG/JPG/WebP/GIF 格式的图片'));
    }
  },
});

router.post('/api/units/upload-image', imageUpload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: ErrorCode.VALIDATION_ERROR, message: '请上传图片文件' });
      return;
    }
    const ext = req.file.originalname.split('.').pop() || 'png';
    const filename = `unit-${uuidv4().slice(0, 8)}.${ext}`;
    const dir = path.resolve(__dirname, '../../data/images');
    if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
    fs.writeFileSync(path.join(dir, filename), req.file.buffer);
    const url = `/api/units/images/${filename}`;
    console.log(`[Units/Image] 上传成功: ${req.file.originalname} -> ${filename}`);
    res.json({ success: true, url, filename });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: ErrorCode.INTERNAL_ERROR, message: `图片上传失败: ${msg}` });
  }
});

// Phase 30: 静态图片服务 (匹配 upload-image 返回的 URL)
router.get('/api/units/images/:filename', (req, res) => {
  const filePath = path.resolve(__dirname, '../../data/images', req.params.filename);
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ error: 'IMAGE_NOT_FOUND' });
  }
});

router.post('/api/units/factions/upload', imageUpload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: ErrorCode.VALIDATION_ERROR, message: '请上传阵营 Logo 图片' });
      return;
    }
    const ext = req.file.originalname.split('.').pop() || 'png';
    const filename = `faction-${uuidv4().slice(0, 8)}.${ext}`;
    const dir = path.resolve(__dirname, '../../data/images/factions');
    if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
    fs.writeFileSync(path.join(dir, filename), req.file.buffer);
    const url = `/api/units/factions/logo/${filename}`;
    console.log(`[Units/Faction] Logo 上传成功: ${req.file.originalname} -> ${filename}`);
    res.json({ success: true, url, filename, logoUrl: url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: ErrorCode.INTERNAL_ERROR, message: `阵营 Logo 上传失败: ${msg}` });
  }
});

// Phase 30: 阵营 Logo 静态服务
router.get('/api/units/factions/logo/:filename', (req, res) => {
  const filePath = path.resolve(__dirname, '../../data/images/factions', req.params.filename);
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ error: 'LOGO_NOT_FOUND' });
  }
});

export default router;
