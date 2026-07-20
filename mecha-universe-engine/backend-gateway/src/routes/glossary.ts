/**
 * Phase 29-Debug — 词条库独立路由
 *
 * 脱离特定战斗 :battleId 沙盒语境，独立承载 glossary 读写端点。
 * 前端 GlossaryView 通过 /api/combat-glossary/config 自由读取、写入大厅规则配置。
 */

import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { UserRole, ErrorCode } from '@mecha/shared-kernel';
import { parseGlossaryExcel } from '../services/glossary-excel-parser.js';
import { validateGlossaryExcel } from '../services/glossary-excel-validator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// Excel 上传：内存存储（词条库 Excel 通常 < 1MB）
const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    const allowedMimes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/octet-stream',
      'application/x-excel',
      'application/x-msexcel',
    ];
    const allowedExts = ['.xlsx', '.xls'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('仅支持 .xlsx / .xls 文件'));
    }
  },
});

// 默认配置落地文件路径（容器内 data 目录）
const GLOSSARY_CONFIG_PATH = path.resolve(__dirname, '../../data/glossary-skill-config.json');

// 默认空配置骨架 — Phase 29-DataSecurity: 核心技能 is_public 锁死 true
const DEFAULT_CONFIG = {
  version: '5.0',
  is_public: true,
  review_status: 'approved',
  skills: {},
};

// 核心系统技能 — 硬编码只读公开
const CORE_SKILLS: Record<string, any> = {
  'melee_strike': {
    id: 'melee_strike', name: '近战打击', description: '基础近战攻击',
    is_public: true, review_status: 'approved',
    script: 'SELF→TARGET: DAMAGE_PHYSICAL flat=attack*1.0',
  },
  'ranged_shot': {
    id: 'ranged_shot', name: '远程射击', description: '基础远程攻击',
    is_public: true, review_status: 'approved',
    script: 'SELF→TARGET: DAMAGE_PHYSICAL flat=attack*0.8, range=3',
  },
  'shield_wall': {
    id: 'shield_wall', name: '护盾壁垒', description: '为自己添加护盾',
    is_public: true, review_status: 'approved',
    script: 'SELF: BUFF shield flat=shield*0.5',
  },
  'repair': {
    id: 'repair', name: '紧急修复', description: '回复自身生命值',
    is_public: true, review_status: 'approved',
    script: 'SELF: REPAIR flat=maxHp*0.2',
  },
  'overdrive': {
    id: 'overdrive', name: '超载驱动', description: '消耗能量大幅提升攻击',
    is_public: true, review_status: 'approved',
    script: 'CONSUME energy=2; SELF: BUFF attack percent=0.5',
  },
  // Phase 30: 地图炮核心技能示例
  'beam_cannon': {
    id: 'beam_cannon', name: '光束加农炮', description: '前方直线范围攻击',
    is_public: true, review_status: 'approved',
    script: 'SELF→TARGET: DIRECTIONAL_BEAM width=2 range=5 damage_kind=beam base_damage=30',
    range_type: 'directional_beam', beam_width: 2, cast_range: 5,
  },
};

// 读写辅助 — Phase 29-DataSecurity: 合并核心技能
function readConfig(): any {
  try {
    if (fs.existsSync(GLOSSARY_CONFIG_PATH)) {
      const raw = fs.readFileSync(GLOSSARY_CONFIG_PATH, 'utf-8');
      const config = JSON.parse(raw);
      // 合并核心技能（不可覆盖，始终公开）
      config.skills = { ...CORE_SKILLS, ...(config.skills || {}) };
      return config;
    }
  } catch (err) {
    console.error('[Glossary] 读取配置文件失败:', err);
  }
  const config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  config.skills = { ...CORE_SKILLS };
  return config;
}

function isAdminOrAbove(role: string): boolean {
  return role === UserRole.ADMIN || role === UserRole.DOMINATOR;
}

function writeConfig(config: any): void {
  const dir = path.dirname(GLOSSARY_CONFIG_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(GLOSSARY_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

// ========================================
// GET /config — 全量曝光公共技能（游客/任意级别 100% 只读放行）
// Phase 29-DataSecurity: 无认证要求，无条件广播
// ========================================
router.get('/config', (_req, res) => {
  const cfg = readConfig();
  res.json({
    success: true,
    glossary: cfg,
    skillCount: Object.keys(cfg.skills || {}).length,
    is_public: true,
    review_status: 'approved',
    version: cfg.version || '5.0',
  });
});

// ========================================
// POST /config — 保存词条库配置（仅 admin/dominator）
// Phase 29-DataSecurity: 普通用户 -> 403 "词条需经管理员审核方可公开"
// ========================================
router.post('/config', authenticate, (req, res) => {
  try {
    const role = req.auth?.role || UserRole.GUEST;

    // 🔒 焊死普通用户写入：直接拒绝
    if (!isAdminOrAbove(role)) {
      console.log(`[Glossary] 权限拦截: ${req.auth?.username || 'guest'} (role=${role}) 尝试写入词条库`);
      res.status(403).json({
        success: false,
        error: ErrorCode.ROLE_FORBIDDEN,
        message: '权限不足：普通玩家词条需经管理员审核方可公开',
        hint: '请联系管理员 (admin/dominator) 审核您的词条变更',
      });
      return;
    }

    const current = readConfig();
    const incoming = req.body || {};

    // 深度合并 skills（但不能覆盖核心技能）
    if (incoming.skills) {
      const nonCoreSkills: Record<string, any> = {};
      for (const [key, value] of Object.entries(incoming.skills)) {
        if (!CORE_SKILLS[key]) {
          nonCoreSkills[key] = value;
        }
      }
      current.skills = { ...CORE_SKILLS, ...(current.skills || {}), ...nonCoreSkills };
    }

    // 处理删除指令（不允许删除核心技能）
    if (Array.isArray(incoming._delete_skills) && incoming._delete_skills.length > 0) {
      for (const key of incoming._delete_skills) {
        if (!CORE_SKILLS[key]) {
          delete current.skills[key];
        }
      }
    }

    // 更新版本
    if (incoming.version) {
      current.version = incoming.version;
    }

    writeConfig(current);

    res.json({
      success: true,
      message: '词条库配置已保存并同步',
      skillCount: Object.keys(current.skills || {}).length,
      version: current.version,
    });
  } catch (err: any) {
    console.error('[Glossary] 保存配置失败:', err);
    res.status(500).json({
      success: false,
      error: 'GLOSSARY_SAVE_FAILED',
      message: err?.message || '保存配置失败',
    });
  }
});

// ================================================================
// 词条 Excel 导入（两步法 · 步骤一）
// POST /api/combat-glossary/import-excel
// 内存解析 + 全量校验 + 预览（不落盘）。errors 非空时前端禁用确认。
// ================================================================
router.post('/import-excel', excelUpload.single('file'), authenticate, requireAdmin, (req, res) => {
  try {
    const file = (req as any).file;
    if (!file) {
      res.status(400).json({ error: ErrorCode.VALIDATION_ERROR, message: '请上传 Excel 文件（.xlsx / .xls）' });
      return;
    }
    console.log(`[Glossary/Excel] 收到文件: ${file.originalname}, ${file.size} bytes`);

    const parsed = parseGlossaryExcel(file.buffer);
    const validation = validateGlossaryExcel(parsed);

    // 计算新增 / 更新计数（核心技能不可覆盖，不计入）
    const current = readConfig();
    const currentSkills = current.skills || {};
    let newCount = 0;
    let updateCount = 0;
    for (const key of Object.keys(parsed.skills)) {
      if (CORE_SKILLS[key]) continue;
      if (currentSkills[key]) updateCount++;
      else newCount++;
    }

    res.json({
      valid: validation.valid,
      skills: parsed.skills,
      counts: { new: newCount, update: updateCount, total: parsed.meta.skillCount },
      warnings: validation.warnings,
      errors: validation.errors,
    });
  } catch (err: any) {
    const msg = err?.message || String(err);
    console.error('[Glossary/Excel] 解析异常:', msg);
    res.status(500).json({ error: ErrorCode.INTERNAL_ERROR, message: `Excel 解析失败: ${msg}` });
  }
});

// ================================================================
// 词条 Excel 导入（两步法 · 步骤二）
// POST /api/combat-glossary/import-apply
// 接收预览确认后的 skills 映射，按 key 深度合并写入权威配置。
// 核心技能不可覆盖 / 不可删除；支持 _delete_skills 删除指令。
// ================================================================
router.post('/import-apply', authenticate, requireAdmin, (req, res) => {
  try {
    const body = req.body || {};
    const skills = body.skills || {};
    const deleteList = Array.isArray(body._delete_skills) ? body._delete_skills : [];
    if (!skills || typeof skills !== 'object') {
      res.status(400).json({ error: ErrorCode.VALIDATION_ERROR, message: '缺少 skills 数据' });
      return;
    }

    const current = readConfig();
    const currentSkills = current.skills || {};
    const warnings: string[] = [];
    const applied: Record<string, any> = {};

    for (const [key, cfg] of Object.entries(skills)) {
      if (CORE_SKILLS[key]) {
        warnings.push(`核心技能 ${key} 受保护，已跳过覆盖`);
        continue;
      }
      applied[key] = cfg;
    }

    const deleted: string[] = [];
    for (const key of deleteList) {
      if (CORE_SKILLS[key]) {
        warnings.push(`核心技能 ${key} 受保护，已跳过删除`);
        continue;
      }
      delete currentSkills[key];
      deleted.push(key);
    }

    current.skills = { ...CORE_SKILLS, ...currentSkills, ...applied };
    writeConfig(current);

    console.log(`[Glossary/Excel] 导入成功: 新增/更新 ${Object.keys(applied).length} 条, 删除 ${deleted.length} 条`);

    res.json({
      success: true,
      applied: Object.keys(applied),
      deleted,
      warnings,
      skillCount: Object.keys(current.skills || {}).length,
    });
  } catch (err: any) {
    const msg = err?.message || String(err);
    console.error('[Glossary/Excel] 落盘失败:', msg);
    res.status(500).json({ error: ErrorCode.INTERNAL_ERROR, message: `词条导入落盘失败: ${msg}` });
  }
});

export default router;
