/**
 * 需求④ 地图素材上传（全局地形素材库）
 * POST /api/terrain/upload   单文件(file) + ?terrain=<id> → 落盘 /data/images/terrains/<id>.<ext>
 * GET  /api/terrain/materials/:filename → 静态服务
 * 复用 units.ts 的 imageUpload（gateway_data volume 持久化），无需 DB 迁移。
 */
import { logger } from '../utils/logger.js';
import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticate } from '../middleware/auth.js';

const router = Router();

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('仅支持 PNG/JPG/WEBP/GIF 格式的图片'));
  },
});

// 持久化目录：与七视图同级，挂在 gateway_data volume 下（镜像重建不丢）
const TERRAIN_DIR = path.join('/data/images', 'terrains');
if (!fs.existsSync(TERRAIN_DIR)) {
  fs.mkdirSync(TERRAIN_DIR, { recursive: true });
}

// 上传：以 terrainId 命名覆盖式写入
router.post('/upload', authenticate, imageUpload.single('file'), (req, res) => {
  try {
    const terrain = (req.query.terrain as string) || (req.body && req.body.terrain);
    if (!terrain) {
      res.status(400).json({ error: 'terrain required' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'no file' });
      return;
    }
    const ext = path.extname(req.file.originalname) || '.png';
    const safe = String(terrain).replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `${safe}${ext}`;
    fs.writeFileSync(path.join(TERRAIN_DIR, filename), req.file.buffer);
    const url = `/api/terrain/materials/${filename}`;
    logger.info({ msg: `[Terrain/Material] 上传: ${terrain} -> ${filename}` });
    res.json({ ok: true, url, filename });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `素材上传失败: ${msg}` });
  }
});

// 静态服务：地形素材图
router.get('/materials/:filename', (req, res) => {
  const filePath = path.join(TERRAIN_DIR, path.basename(req.params.filename));
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ error: 'MATERIAL_NOT_FOUND' });
  }
});

export default router;
