/**
 * Phase 28: Faction 阵营资产管理路由
 * 
 * 端点:
 *   GET  /                          — 获取所有阵营列表
 *   POST /upload                    — 创建/更新阵营 + 上传 PNG logo
 * 
 * Logo 存储在 uploads/factions/ 目录，命名: faction_{code}.png
 * 静态挂载路径: /api/hangar/factions/logo/{filename}
 */
import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// ================================================================
//  Faction 数据持久化 (JSON 文件，提升可扩展性)
// ================================================================

// 使用 Docker 数据卷持久化路径，防止容器重建丢失阵营数据
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');
const FACTIONS_FILE = path.join(DATA_DIR, 'factions.json');

// 出厂默认阵营
const DEFAULT_FACTIONS = [
  { code: 'earth',   name: '地球联合',   logo: null },
  { code: 'bailong', name: '拜隆军',     logo: null },
  { code: 'maxion',  name: '马克西翁',   logo: null },
];

function loadFactions() {
  try {
    if (fs.existsSync(FACTIONS_FILE)) {
      const raw = fs.readFileSync(FACTIONS_FILE, 'utf-8');
      const data = JSON.parse(raw);
      if (Array.isArray(data) && data.length > 0) return data;
    }
  } catch (e) {
    console.error('[factions] 加载失败，回退默认值:', e.message);
  }
  // 首次启动：写入默认阵营
  saveFactions(DEFAULT_FACTIONS);
  return DEFAULT_FACTIONS;
}

function saveFactions(factions) {
  const dir = path.dirname(FACTIONS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(FACTIONS_FILE, JSON.stringify(factions, null, 2), 'utf-8');
}

// ================================================================
//  Multer 配置 — 仅接收 PNG，写入 uploads/factions/
// ================================================================

const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(DATA_DIR, '..', 'uploads', 'factions');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const code = (req.body.code || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '');
    cb(null, `faction_${code}.png`);
  },
});

const logoUpload = multer({
  storage: logoStorage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'image/png') {
      cb(null, true);
    } else {
      cb(new Error('仅支持 PNG 格式图片'));
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB 上限
});

// ================================================================
//  GET / — 获取所有阵营
// ================================================================

router.get('/', (req, res) => {
  try {
    const factions = loadFactions();
    res.json({ success: true, factions });
  } catch (e) {
    console.error('[factions] GET 错误:', e.message);
    res.status(500).json({ error: '获取阵营列表失败' });
  }
});

// ================================================================
//  POST /upload — 添加/更新阵营 + 上传 PNG Logo
//  入参: multipart/form-data { code, name, image (PNG file) }
// ================================================================

router.post('/upload', (req, res, next) => {
  logoUpload.single('image')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: '图片大小不能超过 5MB' });
      }
      if (err.message === '仅支持 PNG 格式图片') {
        return res.status(400).json({ error: '仅支持 PNG 格式图片' });
      }
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}, (req, res) => {
  try {
    const { code, name } = req.body;
    
    if (!code || !code.trim()) {
      return res.status(400).json({ error: '阵营 Code 不能为空' });
    }
    if (!name || !name.trim()) {
      return res.status(400).json({ error: '阵营名称不能为空' });
    }

    const safeCode = code.trim().replace(/[^a-zA-Z0-9_-]/g, '');
    if (!safeCode) {
      return res.status(400).json({ error: '阵营 Code 只能包含字母、数字、下划线和连字符' });
    }

    const logoPath = req.file
      ? `/api/hangar/factions/logo/faction_${safeCode}.png`
      : null;

    const factions = loadFactions();
    const existingIdx = factions.findIndex(f => f.code === safeCode);

    if (existingIdx >= 0) {
      // 更新已有阵营
      factions[existingIdx].name = name.trim();
      if (logoPath) factions[existingIdx].logo = logoPath;
    } else {
      // 新增阵营
      factions.push({
        code: safeCode,
        name: name.trim(),
        logo: logoPath,
      });
    }

    saveFactions(factions);
    console.log(`[factions] 阵营已保存: ${safeCode} (${name}), logo: ${logoPath || '无'}`);

    res.json({
      success: true,
      faction: { code: safeCode, name: name.trim(), logo: logoPath },
    });
  } catch (e) {
    console.error('[factions] upload 错误:', e.message);
    res.status(500).json({ error: '保存阵营失败: ' + e.message });
  }
});

export default router;
