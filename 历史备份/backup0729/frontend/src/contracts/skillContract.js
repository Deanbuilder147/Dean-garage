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
export const SKILL_CATEGORIES = ['melee', 'ranged', 'automation', 'support', 'auto', 'special'];
export const CATEGORY_LABELS = {
  melee: '近战',
  ranged: '远程',
  automation: '自动化',
  support: '辅助',
  auto: '自动化(旧)',
  special: '特殊(旧)'
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
// 技能字段定义：驱动编辑器「兼容插槽 / 自动化增益」分区，含完整中文释义
export const SKILL_FIELD_DEFS = [
  // —— 兼容插槽（旧专属字段）——
  { key: 'aoe_radius', label: 'AOE 半径', hint: '范围技能影响半径（格）：0 表示仅命中单体目标', section: 'compat', type: 'number', min: 0, max: 10 },
  { key: 'range_type', label: '范围类型', hint: '技能作用几何：同心圆 / 地图炮 / 扇形 / 单点', section: 'compat', type: 'select', options: [ { value: 'radial', label: '同心圆 radial' }, { value: 'directional_beam', label: '地图炮 directional_beam' }, { value: 'cone', label: '扇形 cone' }, { value: 'single', label: '单点 single' } ] },
  { key: 'beam_width', label: '炮宽(格)', hint: '仅地图炮(directional_beam)生效：横向覆盖的格数', section: 'compat', type: 'number', min: 1, max: 10 },
  { key: 'min_cast_range', label: '最小距离', hint: '施放技能所需的最小格距（格）；专注射击为 4（不可打近身）', section: 'compat', type: 'number', min: 0, max: 20 },
  { key: 'accuracy_mod', label: '命中修正', hint: '命中率增减（±整数）：正加负减', section: 'compat', type: 'number', min: -10, max: 10 },
  { key: 'evasion_mod', label: '闪避修正', hint: '闪避率增减（±整数）；侦察原用此字段，新版机动值见「机动值加成」', section: 'compat', type: 'number', min: -10, max: 10 },
  { key: 'height_bonus_per_diff', label: '高地格加成', hint: '每 1 格高度差提供的额外伤害值', section: 'compat', type: 'number', min: 0, max: 10 },
  { key: 'attack_stat', label: '攻击属性', hint: '伤害结算使用的攻击属性：格斗 / 射击 / 取最高', section: 'compat', type: 'select', options: [ { value: 'melee', label: '格斗 melee' }, { value: 'ranged', label: '射击 ranged' }, { value: 'max', label: '取最高 max' } ] },
  { key: 'base_damage', label: '基础伤害', hint: '不依赖武器的固定伤害值；专注射击改为 0（改用百分比加成）', section: 'compat', type: 'number' },
  { key: 'requires_unmoved', label: '要求未移动', hint: '发动前本单位本回合必须未移动', section: 'compat', type: 'bool' },
  { key: 'requires_stealth', label: '要求隐身', hint: '发动前本单位必须处于隐匿状态', section: 'compat', type: 'bool' },
  // —— 自动化 / 增益配置（核心新增）——
  { key: 'ap_cost', label: '行动点消耗', hint: '发动该技能消耗的战术行动点：1=1 个额度；2=移动+攻击（专注射击）', section: 'automation', type: 'number', min: 0, max: 3 },
  { key: 'duration', label: '持续回合', hint: '增益/减益持续的阵营回合数；每过一个阵营回合递减 1，归零即清除（防御=1）', section: 'automation', type: 'number', min: 0, max: 20 },
  { key: 'consumption', label: '消费模型', hint: '消耗语义：{"mode":"duration","duration":N} 按回合，或 {"mode":"counter","count":N} 按事件次数', section: 'automation', type: 'json' },
  { key: 'bonus', label: '增伤数值', hint: '助攻专用：增益期间每次造成伤害额外 +N（助攻=3）', section: 'automation', type: 'number' },
  { key: 'reduction', label: '减伤数值', hint: '守护专用：增益期间每次受到伤害额外 -N（守护=5，与百分比减伤不叠加）', section: 'automation', type: 'number' },
  { key: 'value', label: '修正数值', hint: '阻碍专用：攻击结算时对方机动值 -N（阻碍=5）', section: 'automation', type: 'number' },
  { key: 'mobility_buff', label: '机动值加成', hint: '侦察专用：为自身增加的机动值（侦察=+2），持续至自身下个回合开始', section: 'automation', type: 'number' },
  { key: 'applies_on', label: '生效时机', hint: '触发阶段：attack(造成伤害时)/defense(受到伤害时)/attack_debuff_target(攻击计算对方时)', section: 'automation', type: 'select', options: [ { value: '', label: '无' }, { value: 'attack', label: '造成伤害 attack' }, { value: 'defense', label: '受到伤害 defense' }, { value: 'attack_debuff_target', label: '攻击削敌 attack_debuff_target' } ] },
  { key: 'modifier', label: '修正类型', hint: '数值作用类型：attack_buff(增伤)/defense_buff(减伤)/mobility_debuff(削机动)', section: 'automation', type: 'select', options: [ { value: '', label: '无' }, { value: 'attack_buff', label: '增伤 attack_buff' }, { value: 'defense_buff', label: '减伤 defense_buff' }, { value: 'mobility_debuff', label: '削机动 mobility_debuff' } ] },
  { key: 'dice_ranges', label: '骰子加成区间', hint: '专注射击专用：[{min,max,bonus_pct}]，bonus_pct 为攻击伤害百分比（1→20%/2-5→50%/6→100%）', section: 'automation', type: 'json' },
  { key: 'expose_radius', label: '暴露半径', hint: '侦察专用：暴露自身周围 N 格视野（对范围内敌方造成占位伤害）', section: 'automation', type: 'number', min: 0, max: 10 },
  { key: 'expose_damage', label: '暴露伤害', hint: '侦察暴露造成的伤害值，通常为 0（预留给偷袭阵营隐匿技钩子）', section: 'automation', type: 'number' },
]

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
    dice_branches: branches,
    // —— 自动化 / 增益 / 兼容字段：加载时一并保留，确保编辑器可编辑且保存不丢 ——
    description: raw.description || raw.desc || '',
    aoe_radius: (raw.aoe_radius != null ? Number(raw.aoe_radius) : 0),
    range_type: raw.range_type || 'radial',
    beam_width: (raw.beam_width != null ? Number(raw.beam_width) : 1),
    height_bonus_per_diff: (raw.height_bonus_per_diff != null ? Number(raw.height_bonus_per_diff) : 0),
    attack_stat: raw.attack_stat || 'melee',
    bonus: (raw.bonus != null ? Number(raw.bonus) : 0),
    reduction: (raw.reduction != null ? Number(raw.reduction) : 0),
    value: (raw.value != null ? Number(raw.value) : 0),
    applies_on: raw.applies_on || '',
    modifier: raw.modifier || '',
    duration: (raw.duration != null ? Number(raw.duration) : (raw.consumption && raw.consumption.duration != null ? Number(raw.consumption.duration) : 0)),
    ap_cost: (raw.ap_cost != null ? Number(raw.ap_cost) : 0),
    mobility_buff: (raw.mobility_buff != null ? Number(raw.mobility_buff) : 0),
    expose_radius: (raw.expose_radius != null ? Number(raw.expose_radius) : 0),
    expose_damage: (raw.expose_damage != null ? Number(raw.expose_damage) : 0),
    bonus_pct: (raw.bonus_pct != null ? Number(raw.bonus_pct) : 0),
    consumption: raw.consumption != null ? raw.consumption : null,
    dice_ranges: raw.dice_ranges != null ? raw.dice_ranges : null,
    deterministic: !!raw.deterministic,
    once_per_battle: !!raw.once_per_battle,
    is_auto: (raw.category || '').toLowerCase() === 'auto' || !!raw.is_auto,
    is_automation: !!raw.is_automation || (raw.category || '').toLowerCase() === 'auto'
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
