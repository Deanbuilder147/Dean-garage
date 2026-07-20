/**
 * skillContract.js — 前端词条/技能统一数据契约（镜像后端 skillContract.cjs 唯一真相源）
 *
 * 设计目标（与后端《Mecha Universe 词条规范与核心解析对齐方案》严格对齐）：
 *   1. 前端从此有唯一字段真相源，编辑 / 序列化 / 反序列化统一调用本模块。
 *   2. 常量、枚举标签、normalize / validate / toContract 逻辑与后端 skillContract.cjs
 *      保持一致，保证「前端配出的多分支投骰词条」能被后端 100% 识别。
 *   3. 额外提供 hydrateSkill（任意格式 → 编辑器内部形状）与
 *      serializeSkillToContract（编辑器内部形状 → 标准契约 + 旧镜像，零回归）。
 *
 * 契约规范（三大板块）：
 *   名称分类：key / name / category(melee|ranged|automation|support)
 *   基础属性：target_scope / cast_range({min,max}) / skill_shape
 *   投骰多判定：has_dice / dice_type(数字) / dice_branches[]
 *     每个分支：points（{kind:'exact',value} 或 {kind:'range',min,max}，可并存）
 *              effects（核心6项动作：damage/damage_bonus/heal/apply_status/mobility_mod/accuracy_mod）
 */

// ───────────────────────── 枚举常量 ─────────────────────────
export const SKILL_CATEGORIES = ['melee', 'ranged', 'automation', 'support'];
export const CATEGORY_LABELS = {
  melee: '近战',
  ranged: '远程',
  automation: '自动化',
  support: '辅助'
};

export const TARGET_SCOPES = ['enemy', 'ally', 'enemy_equipment', 'ally_equipment'];
export const TARGET_SCOPE_LABELS = {
  enemy: '敌方单位',
  ally: '友方单位',
  enemy_equipment: '敌方装备',
  ally_equipment: '友方装备'
};

export const SKILL_SHAPES = ['single', 'fan', 'linear', 'concentric'];
export const SKILL_SHAPE_LABELS = {
  single: '单点',
  fan: '扇形',
  linear: '条形',
  concentric: '同心圆'
};

// 核心 6 项动作词（dice_branches[].effects[].action）
export const BRANCH_ACTIONS = ['damage', 'damage_bonus', 'heal', 'apply_status', 'mobility_mod', 'accuracy_mod'];
export const BRANCH_ACTION_LABELS = {
  damage: '直接伤害',
  damage_bonus: '追加伤害',
  heal: '治疗',
  apply_status: '施加状态',
  mobility_mod: '机动修正',
  accuracy_mod: '命中修正'
};

export const DAMAGE_KINDS = ['kinetic', 'beam', 'explosive', 'corrosive', 'thermal'];
export const DAMAGE_KIND_LABELS = {
  kinetic: '动能',
  beam: '光束',
  explosive: '爆炸',
  corrosive: '腐蚀',
  thermal: '热熔'
};

export const DICE_TYPES = [4, 6, 8, 10, 12, 20];
export const ACTION_TYPES = ['attack', 'heal', 'buff', 'debuff', 'passive'];
export const ACTION_TYPE_LABELS = {
  attack: '攻击',
  heal: '治疗',
  buff: '增益',
  debuff: '减益',
  passive: '被动'
};

// ───────────────────── 兼容映射（旧↔新） ─────────────────────
export const LEGACY_FILTER_TO_SCOPE = {
  enemy: 'enemy',
  ally: 'ally',
  self: 'ally',
  all: 'enemy'
};
export const SCOPE_TO_LEGACY_FILTER = {
  enemy: 'enemy',
  ally: 'ally',
  enemy_equipment: 'enemy',
  ally_equipment: 'ally'
};
export const LEGACY_RANGE_TO_SHAPE = {
  radial: 'concentric',
  directional_beam: 'linear',
  cone: 'fan',
  single: 'single'
};
export const SHAPE_TO_LEGACY_RANGE = {
  single: 'single',
  fan: 'cone',
  linear: 'directional_beam',
  concentric: 'radial'
};

// 伤害种类别名归一（修复 beam↔energy 历史错配：energy 统一视作 beam）
export const DAMAGE_KIND_ALIASES = {
  energy: 'beam',
  laser: 'beam',
  em: 'beam'
};

// ─────────────────────── 工具函数 ───────────────────────
function num(v, def) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

export function normalizeDamageKind(dk) {
  if (!dk) return 'kinetic';
  const k = String(dk).toLowerCase();
  if (DAMAGE_KINDS.includes(k)) return k;
  return DAMAGE_KIND_ALIASES[k] || 'kinetic';
}

function normalizeEffect(e = {}) {
  return {
    action: BRANCH_ACTIONS.includes(e.action) ? e.action : 'damage',
    value: num(e.value, 0),
    status: e.status || null, // 供 apply_status 使用
    target: e.target || 'enemy' // 供 heal/mobility_mod 定向
  };
}

function normalizePoint(p) {
  if (p == null) return null;
  if (typeof p === 'number') return { kind: 'exact', value: p };
  if (Array.isArray(p) && p.length >= 2) {
    const min = Math.min(num(p[0], 0), num(p[1], 0));
    const max = Math.max(num(p[0], 0), num(p[1], 0));
    return { kind: 'range', min, max };
  }
  if (typeof p === 'object') {
    if (p.kind === 'range') {
      const min = Math.min(num(p.min, 0), num(p.max, 0));
      const max = Math.max(num(p.min, 0), num(p.max, 0));
      return { kind: 'range', min, max };
    }
    if (p.kind === 'exact') return { kind: 'exact', value: num(p.value, 0) };
  }
  return null;
}

function normalizeBranch(b = {}) {
  let points = [];
  if (Array.isArray(b.points)) {
    points = b.points.map(normalizePoint).filter(Boolean);
  }
  // 旧契约兼容：condition_range:[min,max] → points:[区间]
  if (points.length === 0 && Array.isArray(b.condition_range) && b.condition_range.length >= 2) {
    const pp = normalizePoint(b.condition_range);
    if (pp) points = [pp];
  }
  return {
    points,
    effects: Array.isArray(b.effects) ? b.effects.map(normalizeEffect) : []
  };
}

function normalizeDiceBlocks(src = {}) {
  const fromLegacy = src.dice_mechanics && typeof src.dice_mechanics === 'object' ? src.dice_mechanics : null;
  const has_dice = Boolean(src.has_dice) || Boolean(fromLegacy && fromLegacy.has_dice);
  const diceTypeRaw = src.dice_type != null ? src.dice_type : fromLegacy ? fromLegacy.dice_type : 6;
  const dice_type = DICE_TYPES.includes(num(diceTypeRaw, 6)) ? num(diceTypeRaw, 6) : 6;
  let branches = [];
  if (Array.isArray(src.dice_branches)) branches = src.dice_branches.map(normalizeBranch);
  else if (fromLegacy && Array.isArray(fromLegacy.branches)) branches = fromLegacy.branches.map(normalizeBranch);
  return { has_dice, dice_type, dice_branches: branches };
}

/**
 * 将任意输入（新契约 / 旧内部字段）规整为内部统一结构。
 * 保留所有旧专属字段，并补齐新契约字段，使两端消费者在过渡期均可读取。
 */
export function normalizeSkill(raw = {}) {
  const src = Object.assign({}, raw);
  if (!src || typeof src !== 'object') return emptyContract();

  const key = src.key || src.id || '';
  const name = src.name || src.label || '';

  let category = src.category;
  if (!SKILL_CATEGORIES.includes(category)) category = 'melee';

  let target_scope = src.target_scope;
  let target_filter = src.target_filter;
  if (!TARGET_SCOPES.includes(target_scope)) {
    target_scope = LEGACY_FILTER_TO_SCOPE[target_filter] || 'enemy';
  }
  if (!target_filter) target_filter = SCOPE_TO_LEGACY_FILTER[target_scope] || 'enemy';

  // cast_range 支持数值或 {min,max}
  let castRange = { min: 0, max: 0 };
  if (src.cast_range && typeof src.cast_range === 'object') {
    castRange = { min: num(src.cast_range.min, 0), max: num(src.cast_range.max, 0) };
  } else if (typeof src.cast_range === 'number') {
    castRange = { min: 0, max: src.cast_range };
  } else if (typeof src.min_cast_range === 'number' || typeof src.cast_range === 'number') {
    castRange = { min: num(src.min_cast_range, 0), max: num(src.cast_range, 0) };
  }
  if (castRange.min > castRange.max) {
    castRange = { min: castRange.max, max: castRange.min };
  }

  let skill_shape = src.skill_shape;
  let range_type = src.range_type;
  if (!SKILL_SHAPES.includes(skill_shape)) skill_shape = LEGACY_RANGE_TO_SHAPE[range_type] || 'single';
  if (!range_type) range_type = SHAPE_TO_LEGACY_RANGE[skill_shape] || 'radial';

  const dice = normalizeDiceBlocks(src);

  const out = Object.assign({}, src, {
    key,
    name,
    category,
    target_scope,
    target_filter,
    cast_range: castRange,
    min_cast_range: castRange.min,
    skill_shape,
    range_type,
    damage_kind: normalizeDamageKind(src.damage_kind),
    base_damage: num(src.base_damage, 0),
    status_effects: Array.isArray(src.status_effects) ? src.status_effects : [],
    action_type: src.action_type || 'attack',
    attack_stat: src.attack_stat || 'melee',
    accuracy_mod: num(src.accuracy_mod, 0),
    evasion_mod: num(src.evasion_mod, 0),
    height_bonus_per_diff: num(src.height_bonus_per_diff, 0),
    requires_unmoved: Boolean(src.requires_unmoved),
    requires_stealth: Boolean(src.requires_stealth),
    type: src.type || 'active',
    deterministic: src.deterministic !== false,
    trigger: src.trigger || null,
    // 新投骰模型命名空间（供 Branch Evaluator 读取）
    dice
  });
  // 顶层镜像（仅在新模型启用时覆盖，避免污染旧 dice_type 字符串）
  if (dice.has_dice) {
    out.has_dice = dice.has_dice;
    out.dice_type = dice.dice_type;
    out.dice_branches = dice.dice_branches;
  }
  return out;
}

/**
 * Schema 校验。返回 { valid, errors, normalized }。
 * 缺字段不报错（由 normalizeSkill 补默认），仅对非法枚举 / 分支结构报错。
 */
export function validateSkill(raw = {}) {
  const errors = [];
  const key = raw.key || raw.id;
  if (!key || typeof key !== 'string' || !key.trim()) {
    errors.push('缺少唯一标识 key（或旧字段 id）');
  }
  if (!raw.name && !raw.label) errors.push('缺少展示名 name（或旧字段 label）');
  if (raw.category && !SKILL_CATEGORIES.includes(raw.category)) {
    errors.push(`category 非法: ${raw.category}`);
  }
  if (raw.target_scope && !TARGET_SCOPES.includes(raw.target_scope)) {
    errors.push(`target_scope 非法: ${raw.target_scope}`);
  }
  if (raw.skill_shape && !SKILL_SHAPES.includes(raw.skill_shape)) {
    errors.push(`skill_shape 非法: ${raw.skill_shape}`);
  }

  const srcDice = raw.dice_branches != null
    ? { has_dice: raw.has_dice, dice_type: raw.dice_type, dice_branches: raw.dice_branches }
    : (raw.dice_mechanics && typeof raw.dice_mechanics === 'object'
        ? { has_dice: raw.dice_mechanics.has_dice, dice_type: raw.dice_mechanics.dice_type, dice_branches: raw.dice_mechanics.branches }
        : null);
  const hasDice = srcDice ? Boolean(srcDice.has_dice) : false;
  if (hasDice) {
    const diceType = num(srcDice.dice_type, 6);
    if (!DICE_TYPES.includes(diceType)) {
      errors.push(`dice_type 非法: ${diceType}（允许 ${DICE_TYPES.join('/')}）`);
    }
    const branches = Array.isArray(srcDice.dice_branches) ? srcDice.dice_branches : [];
    if (branches.length === 0) {
      errors.push('has_dice 为 true 时至少需要一个判定分支 (dice_branches)');
    }
    branches.forEach((b, i) => {
      const points = (b && Array.isArray(b.points) ? b.points : [])
        .concat(b && Array.isArray(b.condition_range) ? [b.condition_range] : []);
      if (points.length === 0) {
        errors.push(`dice_branches[${i}] 未配置任何生效点数（points）`);
      }
      const effects = (b && Array.isArray(b.effects)) ? b.effects : [];
      if (effects.length === 0) {
        errors.push(`dice_branches[${i}] 未配置任何《判定效果》`);
      }
      effects.forEach((e, j) => {
        const act = e && e.action;
        if (!BRANCH_ACTIONS.includes(act)) {
          errors.push(`dice_branches[${i}].effects[${j}].action 非法: ${act}`);
        }
      });
    });
  }

  return { valid: errors.length === 0, errors, normalized: normalizeSkill(raw) };
}

/**
 * 序列化为纯「新契约」JSON（供前端回显 / 存储），剥离旧专属过渡字段。
 */
export function toContract(skill = {}) {
  const n = normalizeSkill(skill);
  return {
    key: n.key,
    name: n.name,
    category: n.category,
    target_scope: n.target_scope,
    cast_range: { min: n.cast_range.min, max: n.cast_range.max },
    skill_shape: n.skill_shape,
    damage_kind: n.damage_kind,
    base_damage: n.base_damage,
    status_effects: n.status_effects,
    action_type: n.action_type,
    has_dice: n.dice.has_dice,
    dice_type: n.dice.dice_type,
    dice_branches: n.dice.dice_branches.map((b) => ({
      points: b.points.map((p) => (p.kind === 'range'
        ? { kind: 'range', min: p.min, max: p.max }
        : { kind: 'exact', value: p.value })),
      effects: b.effects.map((e) => ({
        action: e.action,
        value: e.value,
        ...(e.status ? { status: e.status } : {}),
        ...(e.target && e.target !== 'enemy' ? { target: e.target } : {})
      }))
    }))
  };
}

// ─────────────────── 前端专属：编辑器形状互转 ───────────────────
function genId() {
  return 'br_' + Math.random().toString(36).slice(2, 9);
}

function emptyContract() {
  return {
    key: '', name: '', category: 'melee',
    target_scope: 'enemy', target_filter: 'enemy',
    cast_range: { min: 1, max: 1 }, min_cast_range: 1,
    skill_shape: 'single', range_type: 'single',
    damage_kind: 'kinetic', action_type: 'attack',
    base_damage: 0, status_effects: [], attack_stat: 'melee',
    accuracy_mod: 0, evasion_mod: 0, height_bonus_per_diff: 0,
    requires_unmoved: false, requires_stealth: false,
    type: 'active', deterministic: true, trigger: null,
    dice: { has_dice: false, dice_type: 6, dice_branches: [] },
    has_dice: false, dice_type: 6, dice_branches: []
  };
}

/**
 * 任意格式（旧/新/后端原始）→ 编辑器内部形状。
 * 额外为每条分支补全 UI 用的 id 与 label（《判定N》），
 * points / effects 规整为后端兼容的内部表示，便于双向序列化无损。
 *
 * @param {Object} raw
 * @returns {Object} 编辑器 reactive 形状
 */
export function hydrateSkill(raw = {}) {
  const n = normalizeSkill(raw);
  const branches = (n.dice.dice_branches || []).map((b, i) => ({
    id: b.id || genId(),
    label: b.label || `判定${i + 1}`,
    points: b.points.map((p) => (p.kind === 'range'
      ? { kind: 'range', min: p.min, max: p.max }
      : { kind: 'exact', value: p.value })),
    effects: b.effects.map((e) => ({
      action: e.action,
      value: e.value,
      status: e.status || null,
      target: e.target || 'enemy'
    }))
  }));
  return {
    key: n.key,
    name: n.name,
    category: n.category,
    target_scope: n.target_scope,
    target_filter: n.target_filter,
    cast_range: { min: n.cast_range.min, max: n.cast_range.max },
    min_cast_range: n.cast_range.min,
    skill_shape: n.skill_shape,
    range_type: n.range_type,
    damage_kind: n.damage_kind,
    action_type: n.action_type,
    base_damage: n.base_damage,
    status_effects: n.status_effects,
    attack_stat: n.attack_stat,
    accuracy_mod: n.accuracy_mod,
    evasion_mod: n.evasion_mod,
    height_bonus_per_diff: n.height_bonus_per_diff,
    requires_unmoved: n.requires_unmoved,
    requires_stealth: n.requires_stealth,
    type: n.type,
    deterministic: n.deterministic,
    trigger: n.trigger,
    has_dice: n.dice.has_dice,
    dice_type: n.dice.dice_type,
    dice_branches: branches
  };
}

/**
 * 序列化：编辑器内部形状 → 标准契约 + 旧镜像字段（零回归兼容后端 _getUniversalFields 与 9 个旧技能）。
 * 直接复用 normalizeSkill，确保输出与后端契约完全一致（含 dice 命名空间、target_filter、range_type 等）。
 *
 * @param {Object} editorShape - hydrateSkill 产出的形状
 * @returns {Object} 可经 POST /api/combat-glossary/config 提交的标准契约 + 旧镜像
 */
export function serializeSkillToContract(editorShape = {}) {
  const n = normalizeSkill(editorShape);
  // 旧路径镜像：target_filter / min_cast_range / cast_range(数字) / range_type
  const legacy = {
    target_filter: n.target_filter,
    min_cast_range: n.cast_range.min,
    cast_range: n.cast_range.max,
    range_type: n.range_type
  };
  return Object.assign({}, n, legacy);
}

export const SkillContract = {
  SKILL_CATEGORIES, CATEGORY_LABELS, TARGET_SCOPES, TARGET_SCOPE_LABELS,
  SKILL_SHAPES, SKILL_SHAPE_LABELS, BRANCH_ACTIONS, BRANCH_ACTION_LABELS,
  DAMAGE_KINDS, DAMAGE_KIND_LABELS, DICE_TYPES, ACTION_TYPES, ACTION_TYPE_LABELS,
  DAMAGE_KIND_ALIASES, LEGACY_FILTER_TO_SCOPE, SCOPE_TO_LEGACY_FILTER,
  LEGACY_RANGE_TO_SHAPE, SHAPE_TO_LEGACY_RANGE,
  normalizeDamageKind, normalizeSkill, validateSkill, toContract,
  hydrateSkill, serializeSkillToContract
};

export default SkillContract;
