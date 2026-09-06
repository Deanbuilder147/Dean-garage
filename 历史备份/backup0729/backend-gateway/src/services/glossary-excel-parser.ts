/**
 * 词条库 Excel 解析器（仅 skills 导入）
 *
 * 读取 skills 主表 + branches 子表（按 skill_key 关联），将模板表头
 * 映射为 skillContract 契约形状，并返回可直接深度合并进
 * glossary-skill-config.json 的 skills 映射。
 *
 * 解析细节（落实用户补充）：
 *  - branches 子表 effects 形如 `action:val@target`，@target 缺省默认补 'enemy'
 *  - extra_params 列做 JSON 展开降维合并（仅并入未知字段，不覆盖契约字段）
 *  - 旧 target_filter（self/all）经 LEGACY_FILTER_TO_SCOPE 归一为 target_scope
 */

import * as XLSX from 'xlsx';

export interface ParsedSkillRow {
  rowNumber: number;
  key: string;
  name: string;
  skill: Record<string, any>;
}

export interface ParsedGlossaryExcel {
  /** key -> 契约就绪的 skill 对象（可直接合并进配置） */
  skills: Record<string, Record<string, any>>;
  rows: ParsedSkillRow[];
  meta: { skillCount: number; branchCount: number; sheetNames: string[] };
}

const LEGACY_FILTER_TO_SCOPE: Record<string, string> = { self: 'ally', all: 'enemy' };
const DAMAGE_KIND_ALIAS: Record<string, string> = {
  energy: 'beam',
  laser: 'beam',
  em: 'beam',
  electromagnetic: 'beam',
  plasma: 'beam',
};

// ── 单元格读取兜底 ──
function cellStr(v: any): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return String(v);
  return String(v).trim();
}

function optNum(v: any): number | undefined {
  if (v === '' || v === null || v === undefined) return undefined;
  const n = Number(v);
  return isNaN(n) ? undefined : n;
}

function parseBool(v: any): boolean {
  if (typeof v === 'boolean') return v;
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'true' || s === '1' || s === '是';
}

// ── branches 子表字段解析 ──
function parsePoint(s: string): any {
  const t = s.trim();
  if (t.includes('-')) {
    const [a, b] = t.split('-').map((x) => Number(x.trim()));
    return { kind: 'range', min: a, max: b };
  }
  return { kind: 'exact', value: Number(t) };
}

function parseEffect(s: string): any {
  // 形如 action:value@target（@target 缺省补 'enemy'）
  const [actionRaw, rest = ''] = s.split(':');
  const action = actionRaw.trim();
  const [valuePart, targetRaw] = rest.split('@');
  const target = (targetRaw ?? '').trim() || 'enemy';
  const eff: Record<string, any> = { action };
  if (action === 'apply_status') {
    eff.status = (valuePart ?? '').trim();
    eff.target = target;
  } else {
    eff.value = Number((valuePart ?? '').trim());
    eff.target = target;
  }
  return eff;
}

function aggregateBranches(branches: Record<string, any>[]): any[] {
  return branches
    .map((br) => ({ idx: Number(br['branch_index']) || 9999, br }))
    .sort((a, b) => a.idx - b.idx)
    .map(({ br }) => {
      const pointsCell = cellStr(br['points']);
      const points = pointsCell
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)
        .map(parsePoint);
      const effectsCell = cellStr(br['effects']);
      const effects = effectsCell
        .split(';')
        .map((e) => e.trim())
        .filter(Boolean)
        .map(parseEffect);
      return { points, effects };
    });
}

export function parseGlossaryExcel(buffer: Buffer): ParsedGlossaryExcel {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetNames = workbook.SheetNames;

  const skillsSheet = workbook.Sheets['skills'];
  if (!skillsSheet) {
    throw new Error('Excel 缺少 skills 工作表');
  }

  const skillRows = XLSX.utils.sheet_to_json<Record<string, any>>(skillsSheet, {
    defval: '',
  });

  const branchesSheet = workbook.Sheets['branches'];
  const branchRows = branchesSheet
    ? XLSX.utils.sheet_to_json<Record<string, any>>(branchesSheet, { defval: '' })
    : [];

  // 按 skill_key 聚合 branches，跳过纯注释行（points/effects 均为空）
  const branchMap: Record<string, Record<string, any>[]> = {};
  for (const br of branchRows) {
    const sk = cellStr(br['skill_key']);
    if (!sk) continue;
    if (!cellStr(br['points']) && !cellStr(br['effects'])) continue; // 跳过说明行
    (branchMap[sk] = branchMap[sk] || []).push(br);
  }

  const skills: Record<string, Record<string, any>> = {};
  const rows: ParsedSkillRow[] = [];
  let branchCount = 0;

  skillRows.forEach((row, i) => {
    const rowNumber = i + 2; // 第 1 行为表头，行号从 2 起
    const key = cellStr(row['key']);
    const name = cellStr(row['name']);
    if (!key && !name) return; // 跳过空行

    // target_scope：旧 target_filter 值（self/all）归一
    const targetScopeRaw = cellStr(row['target_scope']);
    let target_scope = targetScopeRaw;
    let target_filter: string | undefined;
    if (LEGACY_FILTER_TO_SCOPE[targetScopeRaw]) {
      target_scope = LEGACY_FILTER_TO_SCOPE[targetScopeRaw];
      target_filter = targetScopeRaw;
    }

    // 射程
    const castMin = optNum(row['cast_range_min']);
    const castMax = optNum(row['cast_range_max']);
    const cast_range = {
      min: castMin ?? 1,
      max: castMax ?? 3,
    };

    // damage_kind 别名归一
    let damage_kind = cellStr(row['damage_kind']) || 'kinetic';
    if (DAMAGE_KIND_ALIAS[damage_kind]) damage_kind = DAMAGE_KIND_ALIAS[damage_kind];

    // status_effects：逗号或 JSON 数组
    const seRaw = row['status_effects'];
    let status_effects: string[] = [];
    if (typeof seRaw === 'string' && seRaw.trim()) {
      const t = seRaw.trim();
      try {
        const j = JSON.parse(t);
        if (Array.isArray(j)) status_effects = j.map(String);
      } catch {
        status_effects = t
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      }
    } else if (Array.isArray(seRaw)) {
      status_effects = seRaw.map(String);
    }

    const has_dice = parseBool(row['has_dice']);
    const dice_type = cellStr(row['dice_type']) || '6';

    // dice_branches：优先 skills 表 dice_branches 列 JSON，否则聚合 branches 子表
    let dice_branches: any[] = [];
    const dbRaw = row['dice_branches'];
    if (dbRaw && String(dbRaw).trim()) {
      try {
        const j = JSON.parse(String(dbRaw));
        if (Array.isArray(j)) dice_branches = j;
      } catch {
        throw new Error(`词条 ${key} 的 dice_branches 列不是合法 JSON`);
      }
    } else if (branchMap[key]) {
      dice_branches = aggregateBranches(branchMap[key]);
    }
    branchCount += dice_branches.length;

    const skill: Record<string, any> = {
      key,
      name,
      label: name,
      category: cellStr(row['category']) || 'melee',
      target_scope,
      target_filter,
      cast_range,
      min_cast_range: castMin,
      skill_shape: cellStr(row['skill_shape']) || 'single',
      damage_kind,
      base_damage: optNum(row['base_damage']) ?? 0,
      action_type: cellStr(row['action_type']) || 'attack',
      type: cellStr(row['type']) || 'active',
      description: cellStr(row['description']),
      deterministic: parseBool(row['deterministic']),
      status_effects,
      accuracy_mod: optNum(row['accuracy_mod']) ?? 0,
      evasion_mod: optNum(row['evasion_mod']) ?? 0,
      height_bonus_per_diff: optNum(row['height_bonus_per_diff']) ?? 0,
      attack_stat: cellStr(row['attack_stat']) || 'melee',
      requires_unmoved: parseBool(row['requires_unmoved']),
      requires_stealth: parseBool(row['requires_stealth']),
      has_dice,
      dice_type,
      dice_branches,
    };

    // extra_params 降维合并：仅并入未知字段，绝不覆盖契约字段
    const epRaw = row['extra_params'];
    if (epRaw && String(epRaw).trim()) {
      try {
        const ep = JSON.parse(String(epRaw));
        if (ep && typeof ep === 'object') {
          for (const [k, v] of Object.entries(ep)) {
            if (!(k in skill)) skill[k] = v;
          }
        }
      } catch {
        throw new Error(`词条 ${key} 的 extra_params 列不是合法 JSON`);
      }
    }

    skills[key] = skill;
    rows.push({ rowNumber, key, name, skill });
  });

  return {
    skills,
    rows,
    meta: { skillCount: rows.length, branchCount, sheetNames },
  };
}
