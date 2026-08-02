/**
 * Phase 29-HangarRestoration — 单位管理路由 (sql.js)
 *
 * AI 形象生成接口：前置积分扣减锁，扣尽即拦。
 * 版权溯源：is_public_copy / original_author_id 持久化。
 * Excel 导入：parse-excel + create-from-json 完整归入大一统网关。
 */

import { logger } from '../utils/logger.js';
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
import { normSize } from '../unitSize.js';

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

// 所有单位路由需认证；但图片/Logo 静态服务公开（浏览器 <img> 不携带 token，否则 401 裂图）
// 注意：router.use('/api/units', mw) 会把前缀从 req.path 剥离，故中间件内 req.path 形如 /views/...
const PUBLIC_IMAGE_RE = /^\/?(api\/units\/)?(images|views|factions\/logo)\//;
router.use('/api/units', (req, res, next) => {
  if (PUBLIC_IMAGE_RE.test(req.path)) {
    return next(); // 静态资源公开访问
  }
  return authenticate(req, res, () => requireAuth(req, res, next));
});

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
  const rows = all(
    'SELECT * FROM units WHERE owner_id = ? ORDER BY updated_at DESC',
    [req.auth!.userId]
  ) as any[];
  // Phase 30-Fix: 映射 sprite_key → main_image_url，与前端字段名对齐
  const units = rows.map(r => ({
    ...r,
    size: r.size || 'm',
    main_image_url: r.sprite_key || null,
  }));
  res.json({ units });
});

// ========================================
// Phase 29-Debug: 阵营静态字典端点（已前置到 :unitId 之前，避免路由劫持 404）
// 从内存常量返回阵营列表，保证 loadFactions() 不再 404
// ========================================
const FACTION_DICT: Record<string, { code: string; name: string; logoUrl: string }> = {
  earth:    { code: 'earth',    name: '地球联合',   logoUrl: '/api/units/factions/logo/earth.png' },
  bailong:  { code: 'bailong',  name: '拜隆军',     logoUrl: '/api/units/factions/logo/bailong.png' },
  maxion:   { code: 'maxion',   name: '马克西翁',   logoUrl: '/api/units/factions/logo/maxion.png' },
};

router.get('/api/units/factions', (_req, res) => {
  // 合并三处来源：内置字典 + 持久化自定义阵营表 + 单位表已用阵营
  const customFactions: Record<string, { code: string; name: string; logoUrl: string }> = {};
  try {
    const rows = all('SELECT code, name, logo_url FROM factions') as { code: string; name: string; logo_url: string }[];
    for (const r of rows) {
      customFactions[r.code] = {
        code: r.code,
        name: r.name,
        logoUrl: r.logo_url || '',
      };
    }
  } catch (e) { /* factions 表尚未创建时忽略 */ }

  const usedCodes = all(
    'SELECT DISTINCT faction FROM units WHERE faction IS NOT NULL AND faction != \'\''
  ) as { faction: string }[];
  const dbFactions: Record<string, { code: string; name: string; logoUrl: string }> = {};
  for (const row of usedCodes) {
    const code = row.faction;
    if (!FACTION_DICT[code] && !customFactions[code]) {
      dbFactions[code] = { code, name: code, logoUrl: `/api/units/factions/logo/${code}.png` };
    }
  }

  const allFactions = { ...FACTION_DICT, ...customFactions, ...dbFactions };
  res.json({ factions: Object.values(allFactions) });
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
    size: unit.size || 'm',
    totalPoints: unit.total_points ?? 0,
    sprite_key: unit.sprite_key,
    main_image_url: unit.sprite_key || null,
    view_urls: unit.view_urls ? JSON.parse(unit.view_urls) : {},
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
    const { name, codename = '', faction = 'earth', category = 'melee', tier = 1, sprite_key: sk, stats = {}, skills = [], attributes = {}, is_public = false, view_urls = {}, size = 'm' } = req.body;
    // Phase 30-Cover: 废弃单图 main_image_url，封面改由七视图正视图派生；sprite_key 不再从 main_image_url 映射
    const sprite_key = sk || null;

    if (!name) {
      res.status(400).json({ error: ErrorCode.VALIDATION_ERROR, message: '单位名称为必填项' });
      return;
    }

    // Phase 29-DataSecurity: 审核状态机卡口
    const userRole = req.auth!.role || 'user';
    const { is_public: finalIsPublic, review_status } = computeVisibility(userRole, is_public);

    const id = uuidv4();
    run(
      `INSERT INTO units (id, owner_id, name, codename, faction, category, tier, sprite_key, view_urls, stats, skills, is_public, review_status, attributes, size)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, req.auth!.userId, name, codename || null, faction, category, tier, sprite_key, JSON.stringify(view_urls ?? {}), JSON.stringify(stats), JSON.stringify(skills), finalIsPublic, review_status, JSON.stringify(attributes), normSize(size)]
    );
    persistChanges();

    logger.info({ msg: `[Units] 创建: ${name} (is_public=${finalIsPublic}, review=${review_status}, size=${normSize(size)})` });

    res.status(201).json({ unit: { id, name, faction, category, tier, size: normSize(size), owner_id: req.auth!.userId, is_public: finalIsPublic, review_status } });
  } catch (err) {
    logger.error({ msg: `[Units] 创建单位错误: ${ err }` });
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

    logger.info({ msg: `[Units] AI 生成 — 用户 ${req.auth!.username} 消耗 1 积分，剩余 ${newCredits}` });

    // 此处可接入实际的 AI 生成管线（异步）
    res.json({
      success: true,
      message: 'AI 形象生成请求已提交',
      remainingCredits: newCredits,
      generationId: uuidv4(),
    });
  } catch (err) {
    logger.error({ msg: `[Units] AI 生成错误: ${ err }` });
    res.status(500).json({ error: ErrorCode.INTERNAL_ERROR, message: 'AI 生成失败' });
  }
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

  const { name, codename, faction, category, tier, sprite_key: sk, stats, skills, attributes, is_public, view_urls, size } = req.body;
  // Phase 30-Cover: 移除废弃 main_image_url 映射，仅保留七视图 view_urls
  const sprite_key = sk ?? unit.sprite_key;

  // Phase 29-DataSecurity: 审核状态机卡口
  const userRole = req.auth!.role || 'user';
  const requestedPublic = is_public !== undefined ? is_public : (unit.is_public === 1);
  const { is_public: finalIsPublic, review_status } = computeVisibility(userRole, requestedPublic);

  const finalCodename = codename !== undefined ? codename : unit.codename;
  const finalViewUrls = (view_urls && typeof view_urls === 'object') ? view_urls : (unit.view_urls ? JSON.parse(unit.view_urls) : {});

  run(
    `UPDATE units SET name = ?, codename = ?, faction = ?, category = ?, tier = ?, sprite_key = ?, view_urls = ?, stats = ?, skills = ?, is_public = ?, review_status = ?, attributes = ?, size = ?, updated_at = datetime('now')
     WHERE id = ?`,
    [name || unit.name, finalCodename || null, faction || unit.faction, category || unit.category, tier ?? unit.tier,
     sprite_key, JSON.stringify(finalViewUrls), JSON.stringify(stats ?? JSON.parse(unit.stats)),
     JSON.stringify(skills ?? JSON.parse(unit.skills || '[]')),
     finalIsPublic, review_status,
     JSON.stringify(attributes ?? JSON.parse(unit.attributes || '{}')), normSize(size !== undefined ? size : unit.size),
     req.params.unitId]
  );
  persistChanges();

  logger.info({ msg: `[Units] 更新: ${name || unit.name} (is_public=${finalIsPublic}, review=${review_status})` });

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

    logger.info({ msg: `[Units/Excel] 收到文件: ${req.file.originalname}, 大小: ${req.file.size} bytes` });

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

    // 4. 构建扁平预览 + 保留结构化数据用于 confirmImport
    // 注意：前端模板用英文前缀（royroy/left/right/extra），须与这里一致
    const partNameMap: Record<string, string> = { '跟随': 'royroy', '左手': 'left', '右手': 'right', '其它': 'extra' };
    const partFields = ['格斗', '射击', '结构', '机动'] as const;

    const partStatsFlat: Record<string, number> = {};
    for (const [cnName, enPrefix] of Object.entries(partNameMap)) {
      const u = legacy.units[cnName];
      for (const f of partFields) {
        partStatsFlat[`${enPrefix}_${f}`] = u?.[f] ?? 0;
      }
    }

    const previewFlat = {
      name: normalized.name,
      codename: legacy.codename,
      faction: normalized.faction,
      totalPoints: legacy.totalPoints,
      main_格斗: legacy.main_格斗,
      main_射击: legacy.main_射击,
      main_结构: legacy.main_结构,
      main_机动: legacy.main_机动,
      main_skills: legacy.skills.filter((s: any) => s.owner === '主机体'),
      has_royroy: !!legacy.units['跟随'],
      left_type: legacy.units['左手']?.type || 'none',
      right_type: legacy.units['右手']?.type || 'none',
      extra_type: legacy.units['其它']?.type || 'none',
      ...partStatsFlat,
    };

    // Phase 30-RobustData: previewNormalized 可能在 JSON 往返中丢失嵌套结构，
    // 额外提供 _importPayload 字符串确保结构化数据完整到达前端
    const importPayload = JSON.stringify({ normalized, legacy });

    res.json({
      preview: previewFlat,
      previewNormalized: { normalized, legacy },
      _importPayload: importPayload,
      warnings: validation.warnings,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ msg: `[Units/Excel] 解析异常: ${ msg }` });
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

    // Phase 30-Debug: 诊断 req.body 结构
    const bodyKeys = Object.keys(req.body || {});
    const normType = req.body?.normalized ? typeof req.body.normalized : 'missing';
    const normName = req.body?.normalized?.name ?? '(none)';
    const hasDirectName = !!req.body?.name;
    const hasImportPayload = !!req.body?._importPayload;
    logger.info({ msg: `[Units/create-from-json] body keys: [${bodyKeys.join(', ')}], normalized type: ${normType}, normalized.name: ${normName}, hasDirectName: ${hasDirectName}, hasImportPayload: ${hasImportPayload}` });

    // Phase 30-RobustData: 优先用结构化 payload 字符串，其次嵌套对象，最后扁平 fallback
    let normalized: any;
    if (req.body?._importPayload && typeof req.body._importPayload === 'string') {
      // 前端传回了 JSON 字符串格式的结构化数据
      const parsed = JSON.parse(req.body._importPayload);
      normalized = parsed.normalized;
      logger.info({ msg: `[Units/create-from-json] 使用 _importPayload 字符串，normalized.name=${normalized?.name}` });
    } else if (req.body?.normalized && typeof req.body.normalized === 'object') {
      normalized = req.body.normalized;
    } else if (req.body?.name && typeof req.body === 'object') {
      normalized = req.body;
    }

    // Phase 30-DeepDebug: 输出 normalized 核心字段的实际内容
    logger.info({ msg: `[Units/create-from-json] normalized.stats=${JSON.stringify(normalized?.stats)?.slice(0,200)}` });
    logger.info({ msg: `[Units/create-from-json] normalized.skills#=${normalized?.skills?.length}` });
    logger.info({ msg: `[Units/create-from-json] normalized.attributes=${JSON.stringify(normalized?.attributes)?.slice(0,200)}` });

    if (!normalized || !normalized.name) {
      res.status(400).json({ error: ErrorCode.VALIDATION_ERROR, message: '缺少单位数据（normalized.name 为必填项）' });
      return;
    }

    const { name, codename = '', faction = 'earth', category = 'melee', tier = 1, sprite_key, stats = {}, skills = [], attributes = {}, totalPoints = 0, view_urls = {}, size = 'm' } = normalized;

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
      `INSERT INTO units (id, owner_id, name, codename, faction, category, tier, total_points, sprite_key, view_urls, stats, skills, is_public_copy, is_public, review_status, original_author_id, generation_status, attributes, size, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, NULL, 'completed', ?, ?, ?, ?)`,
      [id, userId, name, codename || null, faction, category, tier, totalPoints, sprite_key || null, JSON.stringify(view_urls ?? {}), statsJson, skillsJson, finalIsPublic, reviewStatus, attrsJson, normSize(size), now, now]
    );
    persistChanges();

    logger.info({ msg: `[Units/Excel] 导入成功: ${name} (id=${id}, owner=${userId}, is_public=${finalIsPublic}, review=${reviewStatus})` });

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
    logger.error({ msg: `[Units/Excel] 批量导入错误: ${ msg }` });
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
// 所有图片存储在 /data/images/ (持久化 Docker volume gateway_data)
// POST /api/units/upload-view  — 七视图图片 (封面自动取正视图，废弃单图上传)
// POST /api/units/factions/upload — 阵营 Logo 图片
// ========================================
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB：放宽以容忍原图/截图 PNG，超限由全局 MulterError 处理返回 413
  fileFilter: (_req, file, cb) => {
    const allowedMimes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('仅支持 PNG/JPG/WebP/GIF 格式的图片'));
    }
  },
});

// Phase 30-Fix: 图片持久化目录统一为 /data/images/ (Docker volume)
const IMG_DIR = '/data/images';

// Phase 30-Cover: 废弃单图上传 (POST /api/units/upload-image) 及其静态服务 (GET /api/units/images/:filename) 已移除。
// 封面图统一由七视图 (POST /api/units/upload-view) 的正视图派生，见下方七视图上传端点。

// ========================================
// Phase 30-Fix: 七视图上传端点
// POST /api/units/upload-view
// ========================================
router.post('/api/units/upload-view', imageUpload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: ErrorCode.VALIDATION_ERROR, message: '请上传七视图图片' });
      return;
    }
    // 优先用单位 UUID（全局唯一，杜绝同名/同代号单位互相覆盖），回退 unitCode 兼容历史数据
    let key;
    const rawId = req.body.unitId;
    if (rawId && /^[a-f0-9-]{36}$/i.test(rawId)) {
      key = rawId;
    } else {
      key = (req.body.unitCode || 'UNIT').replace(/[^a-zA-Z0-9_-]/g, '');
    }
    const direction = req.body.direction || '0';
    const filename = `${key}_${direction}_idle.png`;
    const dir = path.join(IMG_DIR, 'views');
    if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
    // 覆盖同单位同方向旧图，避免孤儿文件堆积
    const target = path.join(dir, filename);
    if (fs.existsSync(target)) { fs.unlinkSync(target); }
    fs.writeFileSync(target, req.file.buffer);
    const url = `/api/units/views/${filename}`;
    logger.info({ msg: `[Units/View] 七视图上传: ${key}_${direction} -> ${filename}` });
    res.json({ success: true, url, filename });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: ErrorCode.INTERNAL_ERROR, message: `七视图上传失败: ${msg}` });
  }
});

// 七视图静态服务
router.get('/api/units/views/:filename', (req, res) => {
  const filePath = path.join(IMG_DIR, 'views', req.params.filename);
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ error: 'VIEW_NOT_FOUND' });
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
    const dir = path.join(IMG_DIR, 'factions');
    if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
    fs.writeFileSync(path.join(dir, filename), req.file.buffer);
    const url = `/api/units/factions/logo/${filename}`;
    logger.info({ msg: `[Units/Faction] Logo 上传成功: ${req.file.originalname} -> ${filename}` });
    res.json({ success: true, url, filename, logoUrl: url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: ErrorCode.INTERNAL_ERROR, message: `阵营 Logo 上传失败: ${msg}` });
  }
});

// Phase 30: 阵营 Logo 静态服务
router.get('/api/units/factions/logo/:filename', (req, res) => {
  const filePath = path.join(IMG_DIR, 'factions', req.params.filename);
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ error: 'LOGO_NOT_FOUND' });
  }
});

// ========================================
// Phase 30: 创建自定义阵营（持久化到 factions 表）
// 注意：必须放在 imageUpload (multer) 声明之后，否则 TS 报 "used before declaration"
// ========================================
router.post('/api/units/factions', imageUpload.single('image'), (req, res) => {
  try {
    const code = (req.body.code || '').trim();
    const name = (req.body.name || '').trim();
    if (!code) { res.status(400).json({ error: ErrorCode.VALIDATION_ERROR, message: '阵营 Code 不能为空' }); return; }
    if (!/^[a-zA-Z0-9_-]+$/.test(code)) {
      res.status(400).json({ error: ErrorCode.VALIDATION_ERROR, message: 'Code 只能包含字母、数字、下划线、连字符' }); return;
    }
    if (!name) { res.status(400).json({ error: ErrorCode.VALIDATION_ERROR, message: '阵营名称不能为空' }); return; }
    if (FACTION_DICT[code]) { res.status(400).json({ error: ErrorCode.VALIDATION_ERROR, message: '该 Code 与内置阵营冲突' }); return; }
    if (get('SELECT code FROM factions WHERE code = ?', [code])) {
      res.status(400).json({ error: ErrorCode.VALIDATION_ERROR, message: '该阵营 Code 已存在' }); return;
    }

    let logoUrl = '';
    if (req.file) {
      const ext = req.file.originalname.split('.').pop() || 'png';
      const filename = `faction-${uuidv4().slice(0, 8)}.${ext}`;
      const dir = path.join(IMG_DIR, 'factions');
      if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
      fs.writeFileSync(path.join(dir, filename), req.file.buffer);
      logoUrl = `/api/units/factions/logo/${filename}`;
    }

    run('INSERT INTO factions (code, name, logo_url) VALUES (?, ?, ?)', [code, name, logoUrl]);
    persistChanges();
    logger.info({ msg: `[Units/Faction] 阵营创建成功: ${code} (${name})` });
    res.status(201).json({ success: true, faction: { code, name, logoUrl } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: ErrorCode.INTERNAL_ERROR, message: `阵营创建失败: ${msg}` });
  }
});

export default router;
