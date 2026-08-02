/**
 * Phase 29-Debug — 词条库独立路由
 *
 * 脱离特定战斗 :battleId 沙盒语境，独立承载 glossary 读写端点。
 * 前端 GlossaryView 通过 /api/combat-glossary/config 自由读取、写入大厅规则配置。
 */

import { logger } from '../utils/logger.js';
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
// 导出供 assetGen.ts 复用（AI 素材生成写回地形 material_url），保证单一配置真相、路径不漂移
export function readConfig(): any {
  try {
    if (fs.existsSync(GLOSSARY_CONFIG_PATH)) {
      const raw = fs.readFileSync(GLOSSARY_CONFIG_PATH, 'utf-8');
      const config = JSON.parse(raw);
      // 合并核心技能（不可覆盖，始终公开）
      config.skills = { ...CORE_SKILLS, ...(config.skills || {}) };
      return config;
    }
  } catch (err) {
    logger.error({ msg: `[Glossary] 读取配置文件失败: ${ err }` });
  }
  const config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  config.skills = { ...CORE_SKILLS };
  return config;
}

function isAdminOrAbove(role: string): boolean {
  return role === UserRole.ADMIN || role === UserRole.DOMINATOR;
}

export function writeConfig(config: any): void {
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
/**
 * A4 词条落库归一化：
 * 1. cast_range 必须是标量数值——词条执行器按数字比对射程，对象/数组会导致 NaN 比对失效。
 * 2. trigger 字段为「死字段」——仅被 _getUniversalFields 读出，无任何调度逻辑；此处保留
 *    该字段但强制为字符串（单一触发标识），并对非空值告警，提示维护者勿将其当作分派键使用。
 */
function normalizeSkillForSave(key: string, raw: any): any {
  const skill = { ...(raw || {}) };
  // cast_range：标量数字兜底
  if (skill.cast_range != null && typeof skill.cast_range !== 'number') {
    const parsed = Number(skill.cast_range);
    skill.cast_range = Number.isFinite(parsed) ? parsed : 1;
  } else if (skill.cast_range == null) {
    skill.cast_range = 1;
  }
  // trigger：死字段，强制为字符串，非空则告警（非分派键）
  if (skill.trigger != null && skill.trigger !== '') {
    skill.trigger = String(skill.trigger);
    logger.warn({ msg: `[Glossary][A4] 词条 "${key}" 携带 trigger="${skill.trigger}"，该字段为死字段，不参与任何调度，请勿依赖。` });
  }
  return skill;
}

router.post('/config', authenticate, (req, res) => {
  try {
    const role = req.auth?.role || UserRole.GUEST;
    const isAdmin = isAdminOrAbove(role);

    const current = readConfig();
    const incoming = req.body || {};

    // skills：仅 admin 可写（普通用户忽略，避免破坏审核机制）
    if (isAdmin) {
      if (incoming.skills) {
        const nonCoreSkills: Record<string, any> = {};
        for (const [key, value] of Object.entries(incoming.skills)) {
          if (!CORE_SKILLS[key]) {
            nonCoreSkills[key] = normalizeSkillForSave(key, value);
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
    } else if (incoming.skills || incoming._delete_skills) {
      logger.info({ msg: `[Glossary] 普通用户 ${req.auth?.username || 'guest'} 提交的 skills 改动已忽略（需 admin）` });
    }

    // terrains：已认证用户即可写（地形编辑器：素材绑定 / 参数编辑）
    // 合并写入，保留未被编辑的地形字段（如脚本注入的 material_url、color、move_cost 等）
    if (incoming.terrains && typeof incoming.terrains === 'object') {
      current.terrains = { ...(current.terrains || {}), ...incoming.terrains };
    }

    // 更新版本
    if (incoming.version) {
      current.version = incoming.version;
    }

    writeConfig(current);

    res.json({
      success: true,
      message: isAdmin ? '词条库与地形库配置已保存并同步' : '地形库配置已保存',
      skillCount: Object.keys(current.skills || {}).length,
      terrainCount: Object.keys(current.terrains || {}).length,
      version: current.version,
    });
  } catch (err: any) {
    logger.error({ msg: `[Glossary] 保存配置失败: ${ err }` });
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
    logger.info({ msg: `[Glossary/Excel] 收到文件: ${file.originalname}, ${file.size} bytes` });

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
    logger.error({ msg: `[Glossary/Excel] 解析异常: ${ msg }` });
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

    logger.info({ msg: `[Glossary/Excel] 导入成功: 新增/更新 ${Object.keys(applied).length} 条, 删除 ${deleted.length} 条` });

    res.json({
      success: true,
      applied: Object.keys(applied),
      deleted,
      warnings,
      skillCount: Object.keys(current.skills || {}).length,
    });
  } catch (err: any) {
    const msg = err?.message || String(err);
    logger.error({ msg: `[Glossary/Excel] 落盘失败: ${ msg }` });
    res.status(500).json({ error: ErrorCode.INTERNAL_ERROR, message: `词条导入落盘失败: ${msg}` });
  }
});

export default router;
