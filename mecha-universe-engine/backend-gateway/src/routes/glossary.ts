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
import { createRequire } from 'module';
import multer from 'multer';
import { authenticate, requireFeature } from '../middleware/auth.js';
import { resolveRoleFeatures } from '../services/featurePermissions.js';
import { UserRole, ErrorCode } from '@mecha/shared-kernel';
// ★ Phase 31 治本：射程真相源统一从 shared-kernel 引入，禁止本地再写默认表（陷阱2：四头分化）
import { resolveSkillCategory } from '@mecha/shared-kernel';
import { parseGlossaryExcel } from '../services/glossary-excel-parser.js';
import { validateGlossaryExcel } from '../services/glossary-excel-validator.js';
// ★ 分歧B 修复：trigger 结构化落库需经 TriggerContract 校验（仅诊断，不阻断）
import { TriggerContract } from '@mecha/shared-kernel';
// ★ 分歧D：靶场接入真实战斗引擎结算
import { getSkillExecutor } from '../combatBridge.js';

/**
 * ★ §8.9③ 旧数据兼容：将任意名称转英文 snake_case 主键。
 * 仅保留 [a-z0-9_]；中文或符号会被剥离。若结果为空（纯中文名），调用方须再回退到 id 或生成占位键。
 */
function slugify(s: any): string {
  if (!s) return '';
  const out = String(s).trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  return out ? out.slice(0, 48) : '';
}

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
    category: 'ranged', bonus_range: 2,
    script: 'SELF→TARGET: DIRECTIONAL_BEAM width=2 range=5 damage_kind=beam base_damage=30',
    range_type: 'directional_beam', beam_width: 2,
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
  return role === UserRole.REFEREE || role === UserRole.DOMINATOR;
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
 * 1. ★ 射程绝对字段禁用（裁定第六章）：cast_range/range/max_range 一律不落库为射程真相源。
 *    若请求体误带 cast_range，将其转译为 category（缺则按 ranged）+ bonus_range（= cast_range - 基准），
 *    并删除原字段，从源头杜绝绝对射程回潮。
 * 2. trigger 字段为「死字段」——仅被 _getUniversalFields 读出，无任何调度逻辑；此处保留
 *    该字段但强制为字符串（单一触发标识），并对非空值告警，提示维护者勿将其当作分派键使用。
 */
// ★ 射程加法模型（裁定 6.1）：maxRange = BASE_RANGE_BY_CATEGORY[category] + (Number(bonus_range)||0)；
//   分类识别统一走 shared-kernel.resolveSkillCategory，并把 category 显式落库，下游 getSkillRangeFields 无需再猜。
function normalizeSkillForSave(key: string, raw: any): any {
  const skill = { ...(raw || {}) };
  // cast_range（绝对射程）转译：仅作兼容迁移，绝不保留为射程真相
  if (skill.cast_range != null) {
    const abs = Number(skill.cast_range);
    if (Number.isFinite(abs)) {
      const cat = skill.category || resolveSkillCategory(skill) || 'ranged';
      const BASE: Record<string, number> = { melee: 1, ranged: 3, auto: 0, support: 3, special: 1 };
      const base = BASE[cat] ?? 3;
      skill.category = cat;
      skill.bonus_range = (Number(skill.bonus_range) || 0) + (abs - base);
      delete skill.cast_range;
      logger.warn({ msg: `[Glossary][A4] 词条 "${key}" 携带废弃字段 cast_range=${abs}，已转译为 category=${cat}+bonus_range=${skill.bonus_range}。` });
    } else {
      delete skill.cast_range;
    }
  }
  // 显式标注分类（唯一真相源），消除 type/typeLabel/category 字段脱节
  skill.category = resolveSkillCategory(skill);
  // ★ 分歧B 修复：trigger 严禁 String() 字符串化，保留结构化对象原样落库。
  // 经 TriggerContract 校验（仅诊断，不阻断）—— 对象/空串/未配均安全；空串/未配视为无条件。
  if (skill.trigger != null && skill.trigger !== '') {
    if (typeof skill.trigger === 'object') {
      const tparsed = (TriggerContract as any).safeParse(skill.trigger);
      if (!tparsed.success) {
        logger.warn({ msg: `[Glossary][B] trigger 契约告警(已原样落库)`, key, issues: (tparsed as any).error?.issues });
      }
      // 对象原样保留（含 type/condition 等），供 combat.ts evaluatePassives 读取 s.trigger?.type
    } else if (typeof skill.trigger === 'string') {
      // 向后兼容：保留旧字符串形式（不参与调度，仅展示），提示升级为对象
      logger.warn({ msg: `[Glossary][B] 词条 "${key}" trigger 仍为字符串（旧格式），建议升级为 {type,condition} 对象` });
    }
  }
  // 地图炮 directions 结构规范化（唯一合法形态：{ [dirKey]: [{q,r}, ...] }）
  // 旧格式为扁平数组 [[q,r,layer], ...]，若不重建会因 JSON 序列化把数组下标混成 "0" 脏键
  if (skill.map_cannon && typeof skill.map_cannon === 'object') {
    const DIR_KEYS = ['right', 'rightup', 'leftup', 'left', 'leftdown', 'rightdown'];
    const src = skill.map_cannon.directions;
    const out: Record<string, Array<{ q: number; r: number }>> = {};
    for (const k of DIR_KEYS) out[k] = [];
    const toCells = (list: any): Array<{ q: number; r: number }> =>
      (Array.isArray(list) ? list : [])
        .map((c: any) => (Array.isArray(c) ? { q: Number(c[0]), r: Number(c[1]) } : { q: Number(c?.q), r: Number(c?.r) }))
        .filter((c) => Number.isFinite(c.q) && Number.isFinite(c.r));
    if (Array.isArray(src)) {
      out[DIR_KEYS[0]] = toCells(src); // 旧扁平格式：统一归入首方向
    } else if (src && typeof src === 'object') {
      for (const k of DIR_KEYS) out[k] = toCells(src[k]); // 只认合法方向键，其余脏键丢弃
    }
    skill.map_cannon = { ...skill.map_cannon, directions: out };
  }
  // ★ 步骤3（补完计划）：递归段树 tree 透传 + schema_version 标注
  // 编辑器（GlossaryHubNew 六段编排）产出 tree:[{phase,atoms,branches,children}]，
  // 与 v1 扁平投影（effects/roll.segments/conditions）双写。此处只做「结构清洗 + 版本标注」，
  // 绝不把 tree 拍平覆盖 v1 字段（v1 由前端同批写入），保证新旧读端各取所需。
  if (Array.isArray(skill.tree)) {
    // ★ 2026-09-02 修正：六段定稿 = WHEN→IF→ROLL→DO→AFTER→COST（WHO 已删除，AFTER 必须存在）
    //   旧值含已删除的 WHO、且缺 AFTER → AFTER 段节点会被下方 `?: 'DO'` 强制归为 DO，导致后效丢失。
    const PHASES = ['WHEN', 'IF', 'ROLL', 'DO', 'AFTER', 'COST'];
    const cleanAtoms = (list: any): any[] =>
      (Array.isArray(list) ? list : [])
        .filter((a: any) => a && typeof a === 'object' && typeof a.type === 'string' && a.type)
        .map((a: any) => ({ ...a }));
    const cleanNode = (n: any, depth: number): any => {
      if (!n || typeof n !== 'object') return null;
      const phase = PHASES.includes(n.phase) ? n.phase : 'DO';
      const node: any = { phase, atoms: cleanAtoms(n.atoms) };
      // 分叉分支（IF 走 when 条件槽，ROLL 走 lower/upper 区间）
      const branches = (Array.isArray(n.branches) ? n.branches : [])
        .map((b: any) => {
          if (!b || typeof b !== 'object') return null;
          const br: any = { label: String(b.label || ''), effects: cleanAtoms(b.effects) };
          if (b.when != null) br.when = String(b.when);
          if (b.lower != null && Number.isFinite(Number(b.lower))) br.lower = Number(b.lower);
          if (b.upper != null && Number.isFinite(Number(b.upper))) br.upper = Number(b.upper);
          if (depth < 3 && Array.isArray(b.children)) {
            br.children = b.children.map((c: any) => cleanNode(c, depth + 1)).filter(Boolean);
          }
          return br;
        })
        .filter(Boolean);
      node.branches = branches;
      if (depth < 3 && Array.isArray(n.children) && n.children.length) {
        node.children = n.children.map((c: any) => cleanNode(c, depth + 1)).filter(Boolean);
      }
      return node;
    };
    const tree = skill.tree.map((n: any) => cleanNode(n, 0)).filter(Boolean);
    if (tree.length) {
      skill.tree = tree;
      skill.schema_version = 2;
    } else {
      delete skill.tree;
      delete skill.schema_version;
    }
  }

  // ★ 分歧C / §8.9③：主键统一为 skill_key（阶段3 软着陆回填）+ 去除遗留 id
  // 旧数据（仅含 id/name 无 skill_key）读路径自动回填，写回时统一持久化为 skill_key。
  if (!skill.skill_key) {
    skill.skill_key = skill.id || slugify(skill.name) || `skill_${Date.now().toString(36)}`;
  }
  delete skill.id; // 去除遗留 id 字段，消除双主键脑裂（阶段4 硬拦截 skill_key 非空即就绪）
  return skill;
}

router.post('/config', authenticate, (req, res) => {
  try {
    const role = req.auth?.role || UserRole.GUEST;
    // Phase 30-Perm：admin/dominator 永远可编辑；勾选 glossary.edit 的等级（如 referee）亦可编辑
    const isAdmin = isAdminOrAbove(role) || resolveRoleFeatures(role).includes('glossary.edit');

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
router.post('/import-excel', excelUpload.single('file'), authenticate, requireFeature('glossary.excel'), (req, res) => {
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
router.post('/import-apply', authenticate, requireFeature('glossary.excel'), (req, res) => {
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

// ================================================================
// 词条库中枢 Hub 路由组（改造设计文档 v1.1 §3.3）
// 单一写入口：经 combat-service configLoader 读写存储A（消除双库脑裂）
// 与上方 Excel/地形编辑器（存储B）完全隔离，零回归风险。
// ================================================================
// 引入 configLoader（存储A 权威源，战斗引擎 skillExecutor 也读它）
let _configLoader: any = null;
const nodeRequire = createRequire(import.meta.url);
function getConfigLoader() {
  if (_configLoader) return _configLoader;
  _configLoader = nodeRequire('../../services/combat-service/src/services/combatCore/configLoader.cjs');
  return _configLoader;
}

// 核心技能（前端兜底，受保护，不可经 hub 落库/删除）
const HUB_CORE_SKILLS = ['melee_strike', 'ranged_shot', 'shield_wall', 'repair', 'overdrive', 'beam_cannon'];

function isHubCore(key: string): boolean {
  return HUB_CORE_SKILLS.includes(key);
}

// ★ S1：生成符合强契约的六段式草稿骨架（POST /hub-config 使用）
// 默认注入引擎 _getUniversalFields 所需的全部字段，保证新建草稿即可被靶场引擎空安全解析。
const HUB_DRAFT_BASE_RANGE: Record<string, number> = { melee: 1, ranged: 3, auto: 0, support: 3, special: 1 };
function generateHubDraft(body: any): any {
  const b = body || {};
  const name = b.name || '新技能草稿';
  const category = b.category || 'ranged';
  const actionType = b.action_type || 'attack';
  const targetScope = b.target_scope || 'single_enemy';
  const key = b.skill_key || b.key || ('skill_draft_' + Date.now().toString(36));
  const baseRange = HUB_DRAFT_BASE_RANGE[category] ?? 3;
  const raw = {
    skill_key: key,
    name,
    category,
    action_type: actionType,
    target_scope: targetScope,
    bonus_range: 0,
    base_damage: 0,
    // 六段式骨架
    timing: { trigger: 'active', phase: 'any' },
    cost: { ap: 1, enforce: false, charges: 0, durability: 0, cooldown: 0, limit_scope: 'none' },
    roll: { mode: 'none', generator: { method: 'flat', value: 0 }, segments: [] },
    target: { scope: targetScope, min_range: 1, max_range: baseRange },
    conditions: [],
    effects: [],
    // L6 元层 & 阵营技占位（S7-S10 消费）
    meta_ops: { unlock: [], permanent_disable: [], dual_slot: false },
    faction_role: b.faction_role || null,
    _draft: true,
    _created_at: new Date().toISOString(),
  };
  // 经统一归一化（category 真相源、skill_key 主键、旧字段转译），保证落库一致
  return normalizeSkillForSave(key, raw);
}

// GET /hub-config — Hub 全量读取（存储A + 核心技能兜底 + 地形回退）
router.get('/hub-config', (_req, res) => {
  try {
    const { getGlossaryConfig } = getConfigLoader();
    const stored = getGlossaryConfig();
    const skills = { ...(stored.skills || {}) };
    // 核心技能兜底（存储A 中无则补）
    for (const k of HUB_CORE_SKILLS) {
      if (!skills[k]) skills[k] = (CORE_SKILLS as any)[k] || { skill_key: k, name: k };
    }
    // ★ 分歧C / §8.9③：确保每个词条带 skill_key（存储A 主键 = map key），旧数据无 skill_key 时回填
    for (const [k, v] of Object.entries(skills)) {
      if (v && !(v as any).skill_key) (v as any).skill_key = k;
    }
    res.json({
      success: true,
      glossary: {
        _meta: stored._meta || { version: '5.0' },
        skills,
        terrains: stored.terrains || {},
        systems: stored.systems || {},
      },
      skillCount: Object.keys(skills).length,
    });
  } catch (err: any) {
    logger.error({ msg: `[Glossary/Hub] 读取失败: ${ err }` });
    res.status(500).json({ success: false, error: 'HUB_READ_FAILED', message: err?.message || '读取失败' });
  }
});

// GET /hub-config/:key — 单条读取
router.get('/hub-config/:key', (req, res) => {
  try {
    const { getGlossaryConfig } = getConfigLoader();
    const stored = getGlossaryConfig();
    const key = req.params.key;
    const skill = (stored.skills || {})[key];
    if (!skill) {
      res.status(404).json({ success: false, error: 'SKILL_NOT_FOUND', message: `词条 ${key} 不存在` });
      return;
    }
    res.json({ success: true, key, skill });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'HUB_READ_FAILED', message: err?.message || '读取失败' });
  }
});

// GET /atom-meta — 原子元数据清单（方案 A 前端编辑器对接入口）
// 返回 atomRegistry.listMeta()：语义名 + handlerKey + kind + params + guard + desc，
// 作为「语义底座完备态」单一真相源，前端编辑器据此派生语义原子下拉与表单参数，无需二次硬编码。
let _atomRegistry: any = null;
router.get('/atom-meta', (_req, res) => {
  try {
    if (!_atomRegistry) {
      _atomRegistry = nodeRequire('../../services/combat-service/src/services/combatCore/atomRegistry.cjs');
    }
    const list = typeof _atomRegistry.listMeta === 'function'
      ? _atomRegistry.listMeta()
      : (typeof _atomRegistry.list === 'function' ? _atomRegistry.list() : []);
    res.json({ success: true, atomCount: list.length, atoms: list });
  } catch (err: any) {
    logger.error({ msg: `[Glossary/AtomMeta] 读取失败: ${ err }` });
    res.status(500).json({ success: false, error: 'ATOM_META_FAILED', message: err?.message || '读取失败' });
  }
});

// POST /hub-config — 新建词条草稿（生成符合强契约的六段式骨架，写存储A）
router.post('/hub-config', authenticate, (req, res) => {
  try {
    const role = req.auth?.role || UserRole.GUEST;
    // Phase 30-Perm：admin/dominator 或勾选 glossary.edit 的等级（如 referee）可新建
    if (!isAdminOrAbove(role) && !resolveRoleFeatures(role).includes('glossary.edit')) {
      res.status(403).json({ success: false, error: 'FORBIDDEN', message: '仅管理员或已授权等级可新建词条' });
      return;
    }
    const { getGlossaryConfig, saveGlossaryConfig } = getConfigLoader();
    const stored = getGlossaryConfig();
    stored.skills = stored.skills || {};
    const draft = generateHubDraft(req.body || {});
    const key = draft.skill_key;
    if (stored.skills[key]) {
      res.status(409).json({ success: false, error: 'KEY_CONFLICT', message: `词条 ${key} 已存在` });
      return;
    }
    stored.skills[key] = draft;
    saveGlossaryConfig(stored);
    logger.info({ msg: `[Glossary/Hub] 草稿已创建: ${key}` });
    res.json({ success: true, key, skill: draft, message: '草稿已创建（六段式骨架）' });
  } catch (err: any) {
    logger.error({ msg: `[Glossary/Hub] 草稿创建失败: ${ err }` });
    res.status(500).json({ success: false, error: 'HUB_CREATE_FAILED', message: err?.message || '创建失败' });
  }
});

// PUT /hub-config/:key — 单条更新（单一写入口：写存储A）
router.put('/hub-config/:key', authenticate, (req, res) => {
  try {
    const role = req.auth?.role || UserRole.GUEST;
    // Phase 30-Perm：admin/dominator 或勾选 glossary.edit 的等级（如 referee）可编辑
    if (!isAdminOrAbove(role) && !resolveRoleFeatures(role).includes('glossary.edit')) {
      res.status(403).json({ success: false, error: 'FORBIDDEN', message: '仅管理员或已授权等级可编辑词条库' });
      return;
    }
    const key = req.params.key;
    if (isHubCore(key)) {
      res.status(403).json({ success: false, error: 'CORE_PROTECTED', message: `核心技能 ${key} 受保护，不可覆写` });
      return;
    }
    const { getGlossaryConfig, saveGlossaryConfig } = getConfigLoader();
    const stored = getGlossaryConfig();
    const raw = req.body || {};
    // 单条归一化：丢弃旧污染字段（cast_range 转译），保留加法射程模型
    const normalized = normalizeSkillForSave(key, raw);
    stored.skills = stored.skills || {};
    // ★ 分歧C：主键统一为 skill_key（URL 主键权威），去除遗留 id，消除双主键脑裂
    const nextSkill = { ...(stored.skills[key] || {}), ...normalized, skill_key: key };
    delete nextSkill.id;
    // ⚠️ saveGlossaryConfig 内部对对象做 deepMerge，无法删除磁盘上已存在的键
    //（典型症状：map_cannon.directions 旧数组格式残留 "0" 脏键，怎么存都清不掉）。
    // 对策：把本次要整体替换的子结构先在内存基线里删空，deepMerge 后即为干净结果。
    stored.skills[key] = nextSkill;
    saveGlossaryConfig(stored);
    res.json({ success: true, key, skill: nextSkill, message: '词条已保存至存储A' });
  } catch (err: any) {
    logger.error({ msg: `[Glossary/Hub] 保存失败: ${ err }` });
    res.status(500).json({ success: false, error: 'HUB_SAVE_FAILED', message: err?.message || '保存失败' });
  }
});

// DELETE /hub-config/:key — 单条删除（核心技能保护）
router.delete('/hub-config/:key', authenticate, (req, res) => {
  try {
    const role = req.auth?.role || UserRole.GUEST;
    // Phase 30-Perm：admin/dominator 或勾选 glossary.edit 的等级（如 referee）可删除
    if (!isAdminOrAbove(role) && !resolveRoleFeatures(role).includes('glossary.edit')) {
      res.status(403).json({ success: false, error: 'FORBIDDEN', message: '仅管理员或已授权等级可删除词条' });
      return;
    }
    const key = req.params.key;
    if (isHubCore(key)) {
      res.status(403).json({ success: false, error: 'CORE_PROTECTED', message: `核心技能 ${key} 受保护，不可删除` });
      return;
    }
    const { getGlossaryConfig, saveGlossaryConfig } = getConfigLoader();
    const stored = getGlossaryConfig();
    delete (stored.skills || {})[key];
    saveGlossaryConfig(stored);
    res.json({ success: true, key, message: '词条已删除' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'HUB_DELETE_FAILED', message: err?.message || '删除失败' });
  }
});

// POST /test-skill — 单回合靶场模拟器（改造设计文档 v1.1 §区域4）
// ★ 分歧D 修复：接入真实战斗引擎 combat-service/skillExecutor.executeUniversalSkill 结算（非伪代码）。
// 预置桩位：施法者(基准机甲) + 木人靶(可调防具/耐久)，对每个目标独立调用引擎，返回结构化结果。
router.post('/test-skill', (req, res) => {
  try {
    const { getGlossaryConfig } = getConfigLoader();
    const stored = getGlossaryConfig();
    const key = (req.body && req.body.key) || '';
    const mergedSkills = { ...CORE_SKILLS, ...(stored.skills || {}) };
    const skillDef = mergedSkills[key] || null;
    if (!skillDef) {
      res.status(404).json({ success: false, error: 'SKILL_NOT_FOUND', message: `词条 ${key} 不存在` });
      return;
    }

    const executor = getSkillExecutor();
    // 桩位基准（与前端 BattleTestPanel 约定一致）
    // ★ 每个单位必须带唯一 id：effectExecutor 的 AREA_ENEMY 过滤依赖 u.id 区分施法者与目标，
    //   缺失 id 会导致 u.id === caster.id 恒为 true（undefined===undefined），所有单位被误判为施法者而跳过。
    const base = (idPrefix: string) => ({
      id: `${idPrefix}`,
      q: 0, r: 0, faction: 'earth', role: 'attack', maxHp: 100, hp: 100, armor: 0,
      attack: 10, defense: 0, level: 1, energy: 5, skills: [], statusEffects: [], currentStats: {},
    });
    const caster = { ...base('__caster__'), q: 0, r: 0 };
    const targets = (Array.isArray(req.body.targets) && req.body.targets.length)
      ? (req.body.targets as any[]).map((t: any, i: number) => ({
          ...base(`__tgt_${i + 1}__`),
          q: i + 1, r: 0,
          armor: Number(t.armor) || 0,
          hp: Number(t.hp) || 100, maxHp: Number(t.hp) || 100,
          faction: t.faction || 'maxion', role: t.role || 'defense',
        }))
      : [{
          ...base('__tgt_1__'), q: 1, r: 0,
          armor: Number(req.body.armor) || 0,
          hp: Number(req.body.hp) || 100, maxHp: Number(req.body.hp) || 100,
          faction: req.body.faction || 'maxion', role: req.body.role || 'defense',
        }];
    const context = {
      allUnits: [caster, ...targets],
      battleState: { units: [caster, ...targets], round: 1, currentTurn: 0 },
      terrainMap: req.body.terrainMap || {},
      weaponMobility: 0,
      skillKey: key,
    };
    // ★ Phase 33-PureSegment：区分两种结算语义，避免「一次技能被结算 N 遍」
    // 自选目标型（引擎内部自行决定打谁，靶场只调用【一次】）的识别规则：
    //   1) 顶层 target.type 为群体/区域枚举（AREA_*/ALL_*/MULTIPLE_*）—— 六段式由 W 组 target_selection 收敛；
    //   2) 分段内原子显式带 target_scope（如 D3 伤害均摊）；
    //   3) 分段内原子带群体/区域 target_type 枚举。
    // 否则（纯单体型）保持旧行为：对每个目标独立调用（验证「AOE Fork」）。
    const segs: any[] = (skillDef?.roll?.segments || []) as any[];
    const MULTI_RE = /^(ALL_|AREA_|MULTIPLE_)/i;
    const isTopLevelMultiTarget = MULTI_RE.test(
      (skillDef?.target?.type || skillDef?.target_type || '') as string
    );
    const engineDrivenTargeting =
      isTopLevelMultiTarget ||
      segs.some((s: any) =>
        Array.isArray(s?.effects) &&
        s.effects.some(
          (e: any) =>
            !!e?.target_scope ||
            MULTI_RE.test((e?.target_type || '') as string)
        )
      );

    const snapshot = (t: any) => ({
      hp: t.hp ?? t.current_hp ?? null,
      maxHp: t.maxHp ?? t.max_hp ?? null,
      armor: t.armor ?? 0,
      currentStats: t.currentStats || {},
      statusEffects: (t.statusEffects || []).map((s: any) => ({
        type: s.type || s.action_type || s.label,
        value: s.value,
        duration: s.duration,
        source: s.source,
      })),
    });

    let perTarget: any[];
    if (engineDrivenTargeting) {
      const primary = targets[0];
      let engineResult: any = null;
      let engineError: string | null = null;
      // ★ 靶场可指定骰子值（dice_result），但引擎内部自行掷骰——这里临时覆盖 DiceService 单例的掷骰方法，
      // 结算后还原，避免影响后续请求。仅当显式传入 dice_result（1-6 整数）时启用。
      const forced = Number(req.body?.dice_result) || 0;
      let diceSvc: any = null;
      const origFns: Record<string, any> = {};
      if (forced >= 1 && forced <= 6) {
        try {
          diceSvc = nodeRequire('../../services/combat-service/src/services/combatCore/diceService.cjs');
          const ds = diceSvc && (diceSvc.default || diceSvc.DiceService || diceSvc);
          for (const fn of ['roll', 'rollDetails', 'rollMany', 'check']) {
            if (typeof ds?.[fn] === 'function') {
              origFns[fn] = ds[fn].bind(ds);
            }
          }
          const fixed = forced;
          if (typeof ds?.roll === 'function') ds.roll = () => fixed;
          if (typeof ds?.rollDetails === 'function') ds.rollDetails = () => [fixed];
          if (typeof ds?.rollMany === 'function') ds.rollMany = () => [fixed];
          if (typeof ds?.check === 'function') ds.check = () => true;
        } catch (_e) { /* 覆盖失败则退回引擎随机掷骰 */ }
      }
      try {
        // Phase 4 端到端：启用 pure 隔离帧，引擎在临时克隆帧上结算，不污染靶场临时 units；
        // 模拟后增量经 out.cloneFrame 透传，供前端展示「厨子真的炒了菜」。
        engineResult = executor.executeUniversalSkill(key, caster, primary, context, skillDef, { pure: true });
      } catch (e: any) {
        engineError = String(e?.message || e);
      }
      // 还原 DiceService 掷骰方法
      if (diceSvc) {
        const ds = diceSvc.default || diceSvc.DiceService || diceSvc;
        for (const fn of Object.keys(origFns)) {
          if (typeof ds?.[fn] === 'function') ds[fn] = origFns[fn];
        }
      }
      // 单次结算后，逐个目标回显真实血量（引擎已 mutate allUnits 中的对象）
      const cloneFrame = engineResult?.cloneFrame || null;
      perTarget = targets.map((t: any, i: number) => {
        if (engineError) return { target: { q: t.q, r: t.r }, error: engineError };
        return {
          target: { q: t.q, r: t.r },
          result: {
            // 仅主目标携带完整引擎结果，其余目标标记为「同一次结算的受影响单位」
            ...(i === 0 ? engineResult : { triggered: engineResult?.triggered, collateral: true }),
            survivor: snapshot(t),
          },
          cloneFrame: i === 0 ? cloneFrame : null,
        };
      });
    } else {
      perTarget = targets.map((t: any) => {
      try {
        // Phase 4 端到端：启用 pure 隔离帧，模拟后增量经 r.cloneFrame 透传
        const r = executor.executeUniversalSkill(key, caster, t, context, skillDef, { pure: true });
        const cloneFrame = r?.cloneFrame || null;
        return { target: { q: t.q, r: t.r }, result: { ...r, survivor: snapshot(t) }, cloneFrame };
      } catch (e: any) {
        return { target: { q: t.q, r: t.r }, error: String(e?.message || e) };
      }
      });
    }
    const finalDamage = perTarget.reduce((s: number, p: any) => s + (Number(p.result?.finalDamage) || 0), 0);

    res.json({
      success: true,
      skill_key: key,
      skillName: skillDef.name || key,
      engine: 'combat-service/.cjs',
      targets: perTarget,
      final_damage: finalDamage,
    });
  } catch (err: any) {
    logger.error({ msg: `[Glossary/Hub] 靶场测试失败: ${ err }` });
    res.status(500).json({ success: false, error: 'HUB_TEST_FAILED', message: err?.message || '测试失败' });
  }
});

// ============================================================
// POST /hub-config/simulate-skill — Phase 4 真实模拟管道（端到端）
// ------------------------------------------------------------
// 与 /test-skill（靶场单回合桩位）的区别：
//  - /test-skill 用内部基准桩位（施法者 + 木人靶），仅验证「词条本身能结算」。
//  - /hub-config/simulate-skill 接收【前端画布的真实单位状态 battleStateStarter】，
//    以策划在自由画板上摆放的施法者/目标/地形作为引擎输入，跑真实引擎 pure 隔离帧，
//    把「画布状态 → 引擎结算 → 回写 cloneFrame」串成闭环。
//  - 前端 Phase 3 跳转/回写状态机消费本端点的 cloneFrame + survivor，把真实伤害/状态
//    涂抹回画布单位（HP 条/命中高亮/statusEffects 图标），而非占位涂色。
// ============================================================
router.post('/hub-config/simulate-skill', (req, res) => {
  try {
    const { getGlossaryConfig } = getConfigLoader();
    const stored = getGlossaryConfig();
    const key = (req.body && req.body.key) || '';
    // ★ 与 GET /config 对齐：存储A 原始 skills 之上合并 CORE_SKILLS（只读公开核心词条，
    //   如 melee_strike/ranged_shot 仅硬编码于 CORE_SKILLS，getGlossaryConfig() 不含）。
    const mergedSkills = { ...CORE_SKILLS, ...(stored.skills || {}) };
    const skillDef = mergedSkills[key] || null;
    if (!skillDef) {
      res.status(404).json({ success: false, error: 'SKILL_NOT_FOUND', message: `词条 ${key} 不存在` });
      return;
    }

    const executor = getSkillExecutor();

    // ★ Phase 4：优先使用画布真实状态 battleStateStarter.units，否则退回基准桩位
    // 画布单位结构（来自 GlossaryHubNew.vue 的运行时 units）：
    //   { id, q, r, faction, role, hp, maxHp, armor, attack, defense, energy, statusEffects[], currentStats{} }
    const starterUnits: any[] = Array.isArray(req.body?.battleStateStarter?.units)
      ? req.body.battleStateStarter.units
      : [];

    let caster: any;
    let targets: any[];

    if (starterUnits.length) {
      // 画布真实状态：第一个单位作施法者，其余作目标
      // 兜底补全引擎所需的字段，避免缺字段导致引擎内部 NaN
      const normalize = (u: any, idx: number) => ({
        id: u.id || `__unit_${idx}__`,
        q: Number(u.q) || 0,
        r: Number(u.r) || 0,
        faction: u.faction || 'earth',
        role: u.role || u.faction || 'attack',
        maxHp: Number(u.maxHp) || 100,
        hp: u.hp != null ? Number(u.hp) : (Number(u.maxHp) || 100),
        armor: Number(u.armor) || 0,
        attack: Number(u.attack) || 10,
        defense: Number(u.defense) || 0,
        level: Number(u.level) || 1,
        energy: Number(u.energy) || 5,
        skills: Array.isArray(u.skills) ? u.skills : [],
        statusEffects: Array.isArray(u.statusEffects) ? u.statusEffects : [],
        currentStats: u.currentStats || {},
      });
      caster = normalize(starterUnits[0], 0);
      targets = starterUnits.slice(1).map((u: any, i: number) => normalize(u, i + 1));
      // 若画布只有一个单位（无目标），生成一个画布之外的木人靶供单体技能结算
      if (targets.length === 0) {
        targets = [{ ...caster, id: '__sim_target__', q: caster.q + 1, r: caster.r,
          faction: 'maxion', role: 'defense', hp: 100, maxHp: 100 }];
      }
    } else {
      // 退回基准桩位（与 /test-skill 一致），保证端点即使前端未传状态也能跑通
      const base = (idPrefix: string, q: number) => ({
        id: `${idPrefix}`, q, r: 0, faction: 'earth', role: 'attack', maxHp: 100, hp: 100,
        armor: 0, attack: 10, defense: 0, level: 1, energy: 5, skills: [], statusEffects: [], currentStats: {},
      });
      caster = base('__caster__', 0);
      const reqTargets = (Array.isArray(req.body.targets) && req.body.targets.length)
        ? req.body.targets
        : [{}];
      targets = reqTargets.map((t: any, i: number) => ({
        ...base(`__tgt_${i + 1}__`, i + 1),
        armor: Number(t.armor) || 0,
        hp: Number(t.hp) || 100, maxHp: Number(t.hp) || 100,
        faction: t.faction || 'maxion', role: t.role || 'defense',
      }));
    }

    const context = {
      allUnits: [caster, ...targets],
      battleState: { units: [caster, ...targets], round: Number(req.body?.battleStateStarter?.round) || 1, currentTurn: 0 },
      terrainMap: req.body?.battleStateStarter?.terrainMap || req.body?.terrainMap || {},
      weaponMobility: 0,
      skillKey: key,
    };

    const segs: any[] = (skillDef?.roll?.segments || []) as any[];
    const engineDrivenTargeting = segs.some((s: any) =>
      Array.isArray(s?.effects) && s.effects.some((e: any) => !!e?.target_scope)
    );

    const snapshot = (t: any) => ({
      id: t.id,
      q: t.q, r: t.r,
      hp: t.hp ?? t.current_hp ?? null,
      maxHp: t.maxHp ?? t.max_hp ?? null,
      armor: t.armor ?? 0,
      currentStats: t.currentStats || {},
      statusEffects: (t.statusEffects || []).map((s: any) => ({
        type: s.type || s.action_type || s.label,
        value: s.value,
        duration: s.duration,
        source: s.source,
      })),
    });

    let perTarget: any[];
    let effectsApplied = 0;

    if (engineDrivenTargeting) {
      const primary = targets[0];
      let engineResult: any = null;
      let engineError: string | null = null;
      const forced = Number(req.body?.dice_result) || 0;
      let diceSvc: any = null;
      const origFns: Record<string, any> = {};
      if (forced >= 1 && forced <= 6) {
        try {
          diceSvc = nodeRequire('../../services/combat-service/src/services/combatCore/diceService.cjs');
          const ds = diceSvc && (diceSvc.default || diceSvc.DiceService || diceSvc);
          for (const fn of ['roll', 'rollDetails', 'rollMany', 'check']) {
            if (typeof ds?.[fn] === 'function') origFns[fn] = ds[fn].bind(ds);
          }
          if (typeof ds?.roll === 'function') ds.roll = () => forced;
          if (typeof ds?.rollDetails === 'function') ds.rollDetails = () => [forced];
          if (typeof ds?.rollMany === 'function') ds.rollMany = () => [forced];
          if (typeof ds?.check === 'function') ds.check = () => true;
        } catch (_e) { /* 覆盖失败则退回引擎随机掷骰 */ }
      }
      try {
        engineResult = executor.executeUniversalSkill(key, caster, primary, context, skillDef, { pure: true });
        // 统计实际应用的原子效果数（cloneFrame 里 target 的 statusEffects 增量 + 伤害）
        if (engineResult?.cloneFrame?.target) effectsApplied += 1;
      } catch (e: any) {
        engineError = String(e?.message || e);
      }
      if (diceSvc) {
        const ds = diceSvc.default || diceSvc.DiceService || diceSvc;
        for (const fn of Object.keys(origFns)) {
          if (typeof ds?.[fn] === 'function') ds[fn] = origFns[fn];
        }
      }
      const cloneFrame = engineResult?.cloneFrame || null;
      perTarget = targets.map((t: any, i: number) => {
        if (engineError) return { target: { q: t.q, r: t.r, id: t.id }, error: engineError };
        return {
          target: { q: t.q, r: t.r, id: t.id },
          result: {
            ...(i === 0 ? engineResult : { triggered: engineResult?.triggered, collateral: true }),
            survivor: snapshot(t),
          },
          cloneFrame: i === 0 ? cloneFrame : null,
        };
      });
    } else {
      perTarget = targets.map((t: any) => {
        try {
          const r = executor.executeUniversalSkill(key, caster, t, context, skillDef, { pure: true });
          if (r?.cloneFrame?.target) effectsApplied += 1;
          return { target: { q: t.q, r: t.r, id: t.id }, result: { ...r, survivor: snapshot(t) }, cloneFrame: r?.cloneFrame || null };
        } catch (e: any) {
          return { target: { q: t.q, r: t.r, id: t.id }, error: String(e?.message || e) };
        }
      });
    }

    const finalDamage = perTarget.reduce((s: number, p: any) => s + (Number(p.result?.finalDamage) || 0), 0);

    // ★ Phase 3/4 回写真源：把每个目标的模拟后快照展平，供前端状态机 diff（模拟前 HP vs 模拟后 HP）。
    // 回写来源优先级：
    //   1) cloneFrame（六段式词条走 _walkPhaseTree 生成，含真实 HP/statusEffects 增量）；
    //   2) 谓语技能（melee_strike 等）无 cloneFrame，则用 finalDamage 扣减目标 HP 构造最小快照，
    //      保证画布仍能涂抹真实伤害数字（statusEffects 为空，符合纯输出语义）。
    const rewind = perTarget.map((p: any) => {
      const cf = p.cloneFrame;
      const pId = p.target.id;
      const fd = Number(p.result?.finalDamage) || 0;
      if (cf && (cf.target || cf.unit)) {
        const tgt = cf.target || {};
        const cas = cf.unit || {};
        return {
          id: pId,
          casterAfter: { hp: cas.hp, maxHp: cas.maxHp, statusEffects: cas.statusEffects, currentStats: cas.currentStats },
          targetAfter: { hp: tgt.hp, maxHp: tgt.maxHp, statusEffects: tgt.statusEffects, currentStats: tgt.currentStats },
          hasEffect: true,
          finalDamage: fd,
        };
      }
      // 无 cloneFrame：用 finalDamage 扣减目标初始 HP（从 starterUnits 找原值）
      const before = starterUnits.length
        ? (starterUnits.find((u: any) => u.id === pId)?.hp ?? 100)
        : 100;
      const afterHp = Math.max(0, before - fd);
      const tookDmg = fd > 0 || p.result?.triggered;
      return {
        id: pId,
        targetAfter: { hp: afterHp, maxHp: before, statusEffects: [], currentStats: {} },
        hasEffect: !!tookDmg,
        finalDamage: fd,
      };
    });

    res.json({
      success: true,
      skill_key: key,
      skillName: skillDef.name || key,
      engine: 'combat-service/.cjs',
      source: starterUnits.length ? 'canvas' : 'stub',
      targets: perTarget,
      rewind,                 // ★ Phase 3 状态机消费：模拟后真实快照
      effectsApplied,         // 实际应用原子效果计数
      final_damage: finalDamage,
    });
  } catch (err: any) {
    logger.error({ msg: `[Glossary/Hub] simulate-skill 失败: ${ err }` });
    res.status(500).json({ success: false, error: 'HUB_SIMULATE_FAILED', message: err?.message || '模拟失败' });
  }
});

export default router;
