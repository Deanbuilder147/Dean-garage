/**
 * Phase 29-HangarRestoration — Excel Schema 归一器
 *
 * 职责：将旧版中文四维（格斗/射击/结构/机动）无损转换为
 * 统一 Schema 的 UnitStats 字典与 action_points 动态行动点计数池。
 *
 * 映射规则（宪法红线，严禁硬编码偏离）：
 *
 *   格斗(melee)    → UnitStats.attack   = 格斗 * 2 + 5        (0-99 → 5-203)
 *   射击(shooting) → UnitStats.range    = 1 + floor(射击/25)  (0-99 → 1-4)
 *   结构(structure)→ UnitStats.hp/maxHp = 结构 * 5 + 20       (0-99 → 20-515)
 *   机动(mobility) → UnitStats.speed    = 2 + floor(机动/20)  (0-99 → 2-6)
 *
 * 派生属性：
 *   armor   = floor(结构 * 0.25)
 *   shield  = 0（默认，由装备提供）
 *   defense = floor(机动 * 0.3)
 *
 * 装备部件（左手/右手/跟随/其它）→ attributes.parts JSON
 * 技能列表 → skills JSON 数组（UnitSkill 格式）
 * 行动点池 → attributes.action_points = { MOVE: 1, ATTACK: 1 }
 */

import { v4 as uuidv4 } from 'uuid';
import type { UnitStats, UnitSkill } from '@mecha/shared-kernel';
import type { ParsedResult, ParsedUnit, ParsedSkill } from './excel-parser.js';

// ============================================
// 导出类型
// ============================================

export interface NormalizedUnit {
  name: string;
  faction: string;
  category: string;
  tier: number;
  sprite_key: string | null;
  stats: UnitStats;
  skills: UnitSkill[];
  totalPoints: number;
  attributes: Record<string, unknown>;
  /** 原始解析数据（前端预览用） */
  rawParts: Record<string, ParsedUnit>;
  rawSkills: ParsedSkill[];
}

export interface NormalizedPreview {
  /** 归一化后的单位数据（可直接 create-from-json） */
  normalized: NormalizedUnit;
  /** 旧版中文四维原始值（前端预览兼容） */
  legacy: {
    name: string;
    codename: string | null;
    faction: string;
    totalPoints: number | null;
    main_格斗: number;
    main_射击: number;
    main_结构: number;
    main_机动: number;
    units: Record<string, ParsedUnit>;
    skills: ParsedSkill[];
  };
}

// ============================================
// 主归一入口
// ============================================

export function normalizeParsedData(parsed: ParsedResult): NormalizedPreview {
  console.log('[SchemaNormalizer] 开始 Schema 归一化...');

  const mainUnit = parsed.units['主机体'];
  if (!mainUnit) {
    throw new Error('主机体数据缺失，无法完成归一化');
  }

  // —— 阶段二新规：格斗/射击仅来自 机体 + 武器；移动范围 = 机体机动 + 载具/背包机动 ——
  const bodyStructure = typeof mainUnit.结构 === 'number' ? mainUnit.结构 : 0;
  const bodyMobility = typeof mainUnit.机动 === 'number' ? mainUnit.机动 : 0;
  const totalMelee = sumPartStat(parsed.units, '格斗', ['机体', '武器']);
  const totalShooting = sumPartStat(parsed.units, '射击', ['机体', '武器']);
  const carrierMobility = sumPartStat(parsed.units, '机动', ['载具', '背包']);

  // 归一化映射（defense 废弃→0；speed=移动格子数；mobility=仅机体机动）
  const stats = mapToUnitStats(totalMelee, totalShooting, bodyStructure, bodyMobility, carrierMobility);

  // 转换技能
  const skills = mapSkills(parsed.skills);

  // 构建 attributes
  const attributes = buildAttributes(parsed.units, parsed.skills);

  // 确定分类
  const category = inferCategory(mainUnit.type, totalMelee, totalShooting);

  const normalized: NormalizedUnit = {
    name: parsed.basic.name || '未命名机体',
    faction: parsed.basic.faction || 'earth',
    category,
    tier: 1,
    sprite_key: null,
    stats,
    skills,
    totalPoints: parsed.basic.totalPoints ?? 0,
    attributes,
    rawParts: parsed.units,
    rawSkills: parsed.skills,
  };

  const legacy = {
    name: parsed.basic.name || '',
    codename: parsed.basic.codename,
    faction: parsed.basic.faction || 'earth',
    totalPoints: parsed.basic.totalPoints,
    main_格斗: mainUnit.格斗,
    main_射击: mainUnit.射击,
    main_结构: mainUnit.结构,
    main_机动: mainUnit.机动,
    units: parsed.units,
    skills: parsed.skills,
  };

  console.log('[SchemaNormalizer] 归一完成:', JSON.stringify({
    name: normalized.name,
    faction: normalized.faction,
    category: normalized.category,
    stats,
    skillCount: skills.length,
  }));

  return { normalized, legacy };
}

// ============================================
// 四维 → UnitStats 映射（宪法红线）
// ============================================

function mapToUnitStats(
  melee: number,
  shooting: number,
  bodyStructure: number,
  bodyMobility: number,
  carrierMobility: number
): UnitStats {
  const hp = bodyStructure * 5 + 20;
  const moveRange = bodyMobility + carrierMobility; // 移动力 = 实际可走格子数（废除 /20 公式）
  return {
    hp,
    maxHp: hp,
    armor: Math.floor(bodyStructure * 0.25), // 减伤：护甲 = 机体结构 * 0.25
    shield: 0, // 防具/背包独立 hp 承担（见 attributes.parts）
    attack: melee * 2 + 5,
    defense: 0, // 防御力彻底废弃，减伤由 armor + 伤害分担接管
    speed: moveRange, // 移动格子数
    mobility: bodyMobility, // 仅机体机动（机动差额基准）
    range: 1 + Math.floor(shooting / 25),
  };
}

// ============================================
// 装备类型 → 分类推断
// ============================================

function inferCategory(mainType: string, melee: number, shooting: number): string {
  const t = mainType.toLowerCase();
  if (t.includes('装甲') || t.includes('盾牌')) return 'tank';
  if (t.includes('推进器') || t.includes('辅助')) return 'support';

  // 按属性倾向推断
  if (shooting > melee * 1.3) return 'ranged';
  return 'melee';
}

// ============================================
// 技能转换
// ============================================

function mapSkills(rawSkills: ParsedSkill[]): UnitSkill[] {
  return rawSkills.map((s, idx) => ({
    id: uuidv4(),
    name: s.name,
    description: s.effect || s.special || '',
    effect: s.effect || '',
    type: s.type || '自动',
    script: '',
    cooldown: 0,
    currentCooldown: 0,
    energyCost: 0,
    damageType: inferDamageType(s.attribute),
  }));
}

function inferDamageType(attribute: string): any {
  const a = attribute.toLowerCase();
  if (a.includes('能量') || a.includes('beam')) return 'ENERGY' as any;
  if (a.includes('实弹') || a.includes('物理')) return 'PHYSICAL' as any;
  if (a.includes('回复') || a.includes('修复')) return 'HEAL' as any;
  return 'PHYSICAL' as any;
}

// ============================================
// 属性构建
// ============================================

function buildAttributes(
  units: Record<string, ParsedUnit>,
  skills: ParsedSkill[]
): Record<string, unknown> {
  // 装备部件数据
  const parts: Record<string, unknown> = {};
  const partOrder = ['主机体', '跟随', '左手', '右手', '其它'];
  for (const name of partOrder) {
    if (units[name]) {
      const t = normalizePartType(units[name].type);
      const isShield = t === '防具' || t === '背包';
      const pStruct = typeof units[name].结构 === 'number' ? units[name].结构 : 0;
      const hp = isShield ? pStruct * 2 : 0; // 防具/背包独立 HP = 结构 * 2
      const durability =
        t === '武器' || t === '载具' ? pStruct : // 武器/载具耐久 = 结构值
        t === '防具' || t === '背包' ? 5 :       // 防具/背包基础耐久 = 5
        0;
      parts[name] = {
        type: units[name].type,
        normalizedType: t,
        slot: name,
        格斗: units[name].格斗,
        射击: units[name].射击,
        结构: units[name].结构,
        机动: units[name].机动,
        hp,
        maxHp: hp,
        durability,
        maxDurability: durability,
        destroyed: false,
        isShield,
        skillSlots: units[name].skillSlots,
      };
    }
  }

  // 技能按归属分组
  const skillsByOwner: Record<string, unknown[]> = {};
  for (const s of skills) {
    const owner = s.owner || '未知';
    if (!skillsByOwner[owner]) skillsByOwner[owner] = [];
    skillsByOwner[owner].push({
      name: s.name,
      type: s.type,
      attribute: s.attribute,
      effect: s.effect,
      range: s.range,
      special: s.special,
    });
  }

  // 按各部位 skillSlots 补齐技能数组（空槽用 null 占位；转换器对 !skill||!skill.name 已兼容跳过）
  for (const owner of Object.keys(skillsByOwner)) {
    const slots = (units[owner] && units[owner].skillSlots) || skillsByOwner[owner].length;
    while (skillsByOwner[owner].length < (slots as number)) skillsByOwner[owner].push(null);
  }

  return {
    action_points: { MOVE: 1, ATTACK: 1 },
    parts,
    skills_by_owner: skillsByOwner,
    import_source: 'excel',
    import_version: '2.0',
  };
}

// ============================================
// 辅助函数
// ============================================

/** 按 type 过滤后累加部件的指定属性值；allowedTypes 缺省则累加全部 */
function sumPartStat(
  units: Record<string, ParsedUnit>,
  field: string,
  allowedTypes?: string[]
): number {
  let total = 0;
  for (const unit of Object.values(units)) {
    if (allowedTypes && !allowedTypes.includes(normalizePartType(unit.type))) continue;
    const val = (unit as any)[field];
    if (typeof val === 'number') total += val;
  }
  return total;
}

/** 部件 type 归一（机体/武器/防具/载具/背包/跟随） */
function normalizePartType(t: string | undefined): string {
  if (!t) return '未知';
  const s = String(t).trim();
  const ALIAS: Record<string, string> = {
    '机体': '机体', '主机体': '机体', '本体': '机体', '机甲': '机体', 'mech': '机体',
    '武器': '武器', '枪': '武器', '炮': '武器', '剑': '武器', '刃': '武器', 'weapon': '武器',
    '防具': '防具', '盾': '防具', '装甲': '防具', '护甲': '防具', 'armor': '防具',
    '载具': '载具', '车': '载具', '推进器': '载具', '飞行器': '载具', 'vehicle': '载具',
    '背包': '背包', '包': '背包', 'backpack': '背包',
    '跟随': '跟随', 'royroy': '跟随', '随从': '跟随', '辅机': '跟随', 'follower': '跟随',
  };
  if (ALIAS[s]) return ALIAS[s];
  const lower = s.toLowerCase();
  return ALIAS[lower] || s;
}

export default normalizeParsedData;
