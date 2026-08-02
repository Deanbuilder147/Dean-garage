/**
 * 手动录入数据契约审计计划生成器 (manual-input-audit.cjs)
 * --------------------------------------------------------------------------
 * 1. 定义后端核心数据结构下，各「手动录入入口」的权威保存格式（JSON Schema 风格）。
 * 2. 将「审计计划」数据按该 schema 结构化（校验/派生/归一）。
 * 3. 生成包含完整审计要素的 Markdown 报告，保存至用户桌面。
 *
 * 运行：node scripts/manual-input-audit.cjs
 * 依赖：仅 Node 内置 fs / path。
 */

'use strict';

const fs = require('fs');
const path = require('path');

/* ====================================================================== *
 * PART 1 — 权威保存格式（基于后端核心数据结构反向确权的 Schema）
 * 来源（均经 read_file 核实）：
 *   excel-schema-normalizer.ts (units 形状真相)
 *   db/sqlite.ts (表列定义)
 *   routes/units.ts / maps.ts / glossary.ts / combat.ts
 *   services/combat-service/src/config/glossary-skill-config.json (terrain/skill 枚举)
 *   combat.ts (Royroy 模型、buildTerrainMap、victoryChecker 消费字段)
 * ====================================================================== */

const ENUM = {
  faction: ['earth', 'maxion', 'balon', 'neutral'],
  unitType: ['机体', '载具', '背包兵', '其他'],
  terrain: ['moon', 'mountain', 'forest', 'fortress', 'ruins', 'crystal', 'rubble', 'city_building', 'open', 'water'],
  damageKind: ['kinetic', 'beam', 'explosive', 'corrosive', 'thermal'],
  actionType: ['attack', 'heal', 'buff', 'debuff', 'passive'],
  skillCategory: ['melee', 'ranged', 'special', 'auto'],
  attackStat: ['melee', 'ranged', 'max'],
  victoryCondition: ['annihilate', 'assassinate', 'destroy_facility', 'hold_position', 'capture'],
};

function f(name, type, required, opts = {}) {
  return {
    name,
    type,
    required: !!required,
    enum: opts.enum || null,
    default: opts.default !== undefined ? opts.default : (required ? undefined : null),
    desc: opts.desc || '',
    consumer: opts.consumer || '',
  };
}

const SCHEMAS = {
  /* 1. 机甲单位 Unit */
  unit: {
    title: '机甲单位 Unit',
    api: 'POST /api/units',
    ui: 'NewUnitEditorView.vue → saveUnit → buildUnitPayload(form)',
    db: 'units 表 (stats[JSON], skills[JSON], attributes[JSON], name, faction, codename, unit_code, type, owner_id, owner_name, import_source, is_public_copy, is_public, royalty, created_at)',
    consumer: 'createBattleUnit(state, rawUnit) — 读取 stats/skills/attributes 构造 BattleUnit',
    fields: [
      f('unit_code', 'string', true, { desc: '唯一单位编码，如 "Unit-001"' }),
      f('name', 'string', true),
      f('codename', 'string', false),
      f('faction', 'string', true, { enum: ENUM.faction, consumer: 'factionSkillRegistry.getFactionSkills()' }),
      f('type', 'string', true, { enum: ENUM.unitType }),
      f('owner_id', 'number', true),
      f('owner_name', 'string', false),
      f('import_source', 'string', false, { default: 'manual' }),
      f('stats', 'object', true, { desc: '战斗数值唯一真相', consumer: 'BattleUnit.currentStats / maxStats' }),
      f('skills', 'array', false, { default: [], desc: 'UnitSkill[]', consumer: 'createBattleUnit 展开为 unit.skills' }),
      f('attributes', 'object', true, { desc: '部件/阵营技能/装备/royroy', consumer: 'createBattleUnit 读取 parts/factionSkills/equipment/royroy' }),
    ],
    nested: {
      'stats': [
        f('hp', 'number', true, { consumer: 'damagePipe / victoryChecker(annihilate)' }),
        f('maxHp', 'number', true),
        f('armor', 'number', true, { consumer: 'damagePipe 减伤' }),
        f('shield', 'number', false, { default: 0 }),
        f('attack', 'number', true, { consumer: 'skillExecutor 攻击结算' }),
        f('defense', 'number', true, { default: 0, desc: '已废弃，保留兼容' }),
        f('speed', 'number', true, { desc: '可移动格数', consumer: 'move 范围' }),
        f('mobility', 'number', true, { desc: '仅机体机动' }),
        f('range', 'number', true, { consumer: 'attackRange 计算' }),
        f('min_range', 'number', false, { default: 1 }),
      ],
      'skills[] (UnitSkill)': [
        f('id', 'string', true), f('name', 'string', true), f('description', 'string', false),
        f('script', 'string', false), f('cooldown', 'number', false, { default: 0, consumer: 'skillRegistry 冷却' }),
        f('currentCooldown', 'number', false, { default: 0 }), f('energyCost', 'number', false, { default: 0 }),
        f('damageType', 'string', false, { enum: ENUM.damageKind }),
      ],
      'attributes (parts/factionSkills/equipment/royroy)': [
        f('parts', 'object', true, { desc: '部件槽位对象，键见 partOrder', consumer: 'createBattleUnit 注入 unit.parts' }),
        f('skills_by_owner', 'object', false, { default: {} }),
        f('factionSkills', 'array', false, { default: [], desc: '阵营技能 id 列表', consumer: 'createBattleUnit 合并入 skills' }),
        f('stance', 'string', false),
        f('equipment', 'object', false, { desc: '3 槽位 {left_hand,right_hand,other}，每槽 {damage_kind_modifiers:{kinetic,beam,explosive,corrosive}}', consumer: 'move/attack 减伤' }),
        f('royroy', 'object', false, { desc: 'Royroy 辅机模型（见 royroy schema）' }),
      ],
      'attributes.parts (键 = 主机体/跟随/左手/右手/其它)': [
        f('type', 'string', true), f('normalizedType', 'string', true, { consumer: 'createBattleUnit 判断背包/防具额外HP' }),
        f('slot', 'string', true), f('structure', 'number', false), f('durability', 'number', false, { consumer: '背包/防具独立 HP' }),
        f('hp', 'number', false), f('maxHp', 'number', false), f('attack', 'number', false),
        f('defense', 'number', false), f('mobility', 'number', false), f('skills', 'array', false, { default: [] }),
      ],
    },
  },

  /* 2. 战场 / 地形 Battlefield */
  battlefield: {
    title: '战场 / 地形 Battlefield',
    api: 'POST /api/map/battlefields',
    ui: 'NewBattlefieldView.vue → saveMap → {cells, spawn_points, attributes}',
    db: 'maps 表 (name, width, height, cells[JSON], spawn_points[JSON], attributes[JSON], is_public_copy, is_public, review_status, generation_status)',
    consumer: 'buildTerrainMap(state) — 仅读 c.terrain；spawn_points 用于布阵；terrainCost/terrainDefense 查静态表',
    fields: [
      f('name', 'string', true), f('width', 'number', false, { default: 100 }), f('height', 'number', false, { default: 100 }),
      f('cells', 'array', true, { desc: '六角格数组；引擎只读 c.terrain', consumer: 'buildTerrainMap' }),
      f('spawn_points', 'array', false, { default: [], desc: '出生点 {q,r,faction?}' }),
      f('attributes', 'object', false, { default: {} }),
      f('is_public_copy', 'boolean', false, { default: false }), f('is_public', 'boolean', false, { default: false }),
      f('review_status', 'string', false, { default: 'pending' }), f('generation_status', 'string', false, { default: 'complete' }),
    ],
    nested: {
      'cells[]': [
        f('q', 'number', true, { desc: 'Even-R offset 列坐标' }),
        f('r', 'number', true, { desc: 'Even-R offset 行坐标' }),
        f('terrain', 'string', true, { enum: ENUM.terrain, desc: '地形 ID；须命中静态 terrain 表才享减伤/移动成本', consumer: 'buildTerrainMap → defense_bonus / terrainCost' }),
      ],
      'spawn_points[]': [
        f('q', 'number', true), f('r', 'number', true), f('faction', 'string', false, { enum: ENUM.faction }),
      ],
    },
  },

  /* 3. 阵营 Faction */
  faction: {
    title: '阵营 Faction',
    api: 'POST /api/units/factions',
    ui: 'NewPreparationRoom.vue 阵营编辑 / 后端 /generate',
    db: 'factions 表 (id, name, code, logo_url, created_at, updated_at)  ★无 skills 列',
    consumer: 'factionSkillRegistry.getFactionSkills(faction) — 从【硬编码】FactionSkillRegistry 读取，不读 DB',
    fields: [
      f('code', 'string', true, { desc: '阵营编码，唯一' }), f('name', 'string', true), f('logo_url', 'string', false),
    ],
    risk: '自建阵营写入 factions 表后，引擎 getFactionSkills() 仍从硬编码对象（仅 earth/balon/maxion，不含 neutral）取技能，不读 DB → 自建阵营单位拿不到任何阵营技能。此外：未知 faction 当前被 getFactionSkills 返回 []（已安全）与 getFactionInfo 返回 null（已防御）兜底，无即时崩溃；但若未来任一逻辑段直接读取 FactionSkillRegistry[faction].color 或解构返回对象，未知 faction 会抛 TypeError 致 /attack 500。故不仅是「读不到」，还存在潜在「崩溃面」，必须加安全兜底锁封死。',
  },

  /* 4. 词条 / 技能 Skill */
  skill: {
    title: '词条 / 技能 Skill',
    api: 'POST /config (key=glossary_skill_config)',
    ui: 'GlossaryView.vue → configs 表',
    db: 'configs 表 (key, value[JSON]) — skills 为 id→对象 字典',
    consumer: 'skillExecutor.cjs / skillRegistry.cjs — 仅认 action_type 五谓语 switch',
    fields: [
      f('id', 'string', true), f('label', 'string', true),
      f('type', 'string', true, { enum: ['active', 'passive'] }),
      f('category', 'string', true, { enum: ENUM.skillCategory }),
      f('action_type', 'string', true, { enum: ENUM.actionType, desc: '★唯一分派键；未知值落 default 静默失效' }),
      f('cast_range', 'number', true, { desc: '★必须标量' }),
      f('min_cast_range', 'number', false, { default: 0 }), f('aoe_radius', 'number', false, { default: 0 }),
      f('base_damage', 'number', false, { default: 0 }), f('damage_kind', 'string', false, { enum: ENUM.damageKind, default: 'kinetic' }),
      f('attack_stat', 'string', true, { enum: ENUM.attackStat }), f('deterministic', 'boolean', false, { default: true }),
      f('requires_unmoved', 'boolean', false, { default: false }), f('requires_stealth', 'boolean', false, { default: false }),
      f('status_effects', 'array', false, { default: [] }),
      f('accuracy_mod', 'number', false, { default: 0 }), f('evasion_mod', 'number', false, { default: 0 }),
      f('height_bonus_per_diff', 'number', false, { default: 0 }),
      f('trigger', 'string', false, { default: null, desc: '★死字段：被 _getUniversalFields 读出但无任何调度' }),
      f('description', 'string', false),
    ],
  },

  /* 5. 胜利条件 Victory Conditions */
  victoryConditions: {
    title: '胜利条件 Victory Conditions',
    api: 'POST /api/combat/:battleId/victory-conditions',
    ui: 'NewPreparationRoom.vue → victory-conditions',
    db: 'battles 表 victory_conditions[JSON] → state.victoryConditions (整包存 req.body)',
    consumer: 'victoryChecker.evaluateVictory(state) — 实际只认 vc.facility 对象',
    risk: '★真实活 bug（契约错位）：前端 destroy_facility 送 {target_q,target_r}、hold_position 送 {hold_round}；但 victoryChecker 读的是 vc.facility.{q,r,hp,faction,attacker}（L53/100/137）。字段名不匹配 → facility 恒为 null → destroy_facility 与 hold_position 永不触发（录了但读不到）。',
    fields: [
      f('conditions', 'array', true, { enum: ENUM.victoryCondition, desc: '至少一个条件' }),
      f('hold_round', 'number', false, { desc: 'hold_position 轮次（前端发送）' }),
      f('target_q', 'number', false, { desc: '前端 destroy_facility 发送（但 victoryChecker 不读，须映射为 facility.q）' }),
      f('target_r', 'number', false, { desc: '前端 destroy_facility 发送（须映射为 facility.r）' }),
      f('facility', 'object', false, { desc: '★victoryChecker 真实期望：{q,r,hp,faction,attacker}；当前前端未发送 → 条件死链' }),
    ],
    nested: {
      'facility (victoryChecker 实际期望，须由前端/网关映射生成)': [
        f('q', 'number', true, { desc: '设施 offset 坐标（= 前端 target_q）' }),
        f('r', 'number', true, { desc: '设施 offset 坐标（= 前端 target_r）' }),
        f('hp', 'number', false, { default: 0, desc: 'destroy_facility 比对 hp<=0' }),
        f('faction', 'string', false, { enum: ENUM.faction, desc: 'hold_position 占据方' }),
        f('attacker', 'string', false, { enum: ENUM.faction, desc: 'destroy_facility 攻击方' }),
      ],
    },
  },

  /* 6. 王牌机体 ACE Unit */
  aceUnit: {
    title: '王牌机体 ACE Unit',
    api: 'POST /api/combat/:battleId/ace-unit',
    ui: 'NewPreparationRoom.vue → ace-unit',
    db: 'battles 表 ace_unit[JSON] → state.aceUnit',
    consumer: 'combatResolver（王牌倍率 / 胜负判定）',
    fields: [f('faction', 'string', true, { enum: ENUM.faction }), f('unit_id', 'string|number', true)],
  },

  /* 7. 部署单位池 Pending Units */
  pendingUnits: {
    title: '部署单位池 Pending Units',
    api: 'POST /api/combat/:battleId/pending-units',
    ui: 'NewPreparationRoom.vue → pending-units',
    db: 'battles 表 pending_units[JSON] → state.pendingUnits',
    consumer: 'createBattleUnit / deploy 阶段',
    fields: [f('units', 'array', true, { desc: '完整单位对象数组；equipment 须已 sanitize 为 3 槽位 damage_kind_modifiers' })],
  },

  /* 8. Royroy 浮游辅机 */
  royroy: {
    title: 'Royroy 浮游辅机 (attributes.royroy 内嵌模型)',
    api: '随 Unit 保存 / 运行时 /action (deploy_royroy|retrieve_royroy|damage_royroy)',
    ui: '单位编辑器「跟随」部件 → buildUnitPayload 注入 royroy',
    db: 'units 表 attributes JSON 内 royroy 对象',
    consumer: 'combat.ts /action 处理器 + move 自动重定位（读 deployed/status/q/r/hp/cooldownRound/isAuto）',
    fields: [
      f('deployed', 'boolean', true, { default: false }),
      f('status', 'string', true, { enum: ['inactive', 'deployed', 'destroyed'] }),
      f('q', 'number', false, { desc: '部署后坐标' }), f('r', 'number', false),
      f('hp', 'number', true, { default: 0 }), f('maxHp', 'number', true, { default: 0 }),
      f('cooldownRound', 'number', false, { default: 0 }),
      f('isAuto', 'boolean', false, { default: false, desc: 'auto 类：主机移动后自动重定位' }),
      f('faction', 'string', false, { enum: ENUM.faction, desc: '★阵营继承：部署时由母机透传，确保友军/敌军识别正确' }),
      f('ownerId', 'number', false, { desc: '★归属玩家继承：部署时由母机透传' }),
    ],
  },
};

/* ====================================================================== *
 * PART 2 — 审计计划数据（结构化输入）
 * ====================================================================== */

const AUDIT_PLAN_INPUT = [
  {
    id: 'A1', module: 'unit', title: '机甲单位编辑器',
    entry: 'NewUnitEditorView.vue (saveUnit→buildUnitPayload)', route: 'POST /api/units',
    consumer: 'createBattleUnit / skillExecutor / combatResolver', risk: 'HIGH',
    problem: '历史 bug：平铺表单整包发出，后端只认 stats/skills/attributes → 手动单位战斗数据全空（已修复为 buildUnitPayload 同构打包）。射程断层（二次断层）：过去 range 仅存 currentStats.range 嵌套层，前端 selectedUnit.range（顶层）读不到 → 普通攻击被压成距离 1；已于 2026-07-24 在 createBattleUnit L134 提升顶层 range 修复，currentStats.range 在 L110 保留。本条作为回归守卫。',
    checks: [
      'buildUnitPayload 输出字段名 == createBattleUnit 读取字段名（stats.* / skills[] / attributes.parts / factionSkills / equipment / royroy）',
      'stats 必填项完整（hp/maxHp/armor/attack/defense/speed/mobility/range）',
      'skills[].id/name/cooldown/energyCost 与 UnitSkill 一致',
      'attributes.parts 键集合 == {主机体,跟随,左手,右手,其它}',
      'equipment 3 槽位 damage_kind_modifiers 键集合 == {kinetic,beam,explosive,corrosive}',
      'faction 命中 factionSkillRegistry 或标注「自建阵营无技能」',
      'royroy 模型字段齐全（deployed/status/hp/maxHp/cooldownRound/isAuto）',
      '必查项8（射程二次断层回归守卫）：createBattleUnit 已提升顶层 unit.range（L134）且保留 currentStats.range（L110）；网关 /attack 普通攻击走 casterUnit.currentStats?.range（L902）。须确保两者双向同步、currentStats.range 必填，防止回归为「录入 range=3 仅打 1 格」。',
    ],
    fallback: 'createBattleUnit 对缺字段有 try/catch 兜底 + 默认值，但字段错位会静默丢数据',
  },
  {
    id: 'A2', module: 'battlefield', title: '战场 / 地形编辑器',
    entry: 'NewBattlefieldView.vue (saveMap)', route: 'POST /api/map/battlefields',
    consumer: 'buildTerrainMap / terrainCost / terrainDefense', risk: 'HIGH',
    problem: '引擎只读 c.terrain；后端兼容 cells 数组或 terrain 字典两种格式，resolveTerrainId 从值里挖 terrain_id/terrain/id/type。若前端送出 terrain_id 而非 terrain → 静默回退 moon。自定义地形 move_cost/defense_bonus 若不命中静态 terrain 表则无效。',
    checks: [
      'saveMap 送出的 cells[].terrain 字段名 == buildTerrainMap 读取的 c.terrain',
      'terrain 值 ∈ ENUM.terrain（命中静态表才享减伤/移动成本）',
      'spawn_points 的 q,r 与 cells 坐标体系一致（Even-R offset）',
      '自定义地形 move_cost/defense_bonus 是否真被 terrainCost/terrainDefense 读取（而非仅 UI 展示）',
      'width/height 与实际 cells 范围匹配',
      '坐标 Key 一致性（防月面回退）：buildTerrainMap 用 `${q},${r}`（L45），skillExecutor 地形读取用 `${target.q},${target.r}`（L335）/ `cellQ+","+cellR`（L1154），前端 hexKey=`${q},${r}`（L1955），getHexKey 亦 `${q},${r}`——当前均逗号分隔一致，无 `3_4` 类拼写漂移；建议统一收敛到单一 getHexKey(q,r) 函数，杜绝未来坐标格式分裂导致地形 Key 命中失败、回退 moon。',
      '距离计算体系：Even-R offset→Axial/Cube 由 hexDistanceOffset（combat.ts）统一转换；确认引擎地形查找与距离/ZOC 判定使用的是同一套 offset 坐标，未误混入 axial 坐标做 Key。',
    ],
    fallback: 'buildTerrainMap 默认 c.terrain||"moon" → 地形静默丢失为无减伤月面',
  },
  {
    id: 'A3', module: 'faction', title: '自定义阵营',
    entry: '整备室阵营编辑 / POST /api/units/factions', route: 'POST /api/units/factions',
    consumer: 'factionSkillRegistry.getFactionSkills()', risk: 'HIGH',
    problem: 'factions 表无 skills 列；引擎从硬编码 FactionSkillRegistry（仅 earth/balon/maxion，不含 neutral）取技能，不读 DB。自建阵营单位拿不到任何阵营技能。此外：未知 faction 当前被 getFactionSkills 返回 []（已安全，无即时崩溃）与 getFactionInfo 返回 null（已防御）兜底；但若未来任一逻辑段直接读取 FactionSkillRegistry[faction].color 或解构返回对象，未知 faction 会抛 TypeError 致 /attack 500。故不仅是「读不到」，还存在潜在「崩溃面」，必须加安全兜底锁封死。',
    checks: [
      'factions 表是否应增加 skills 列以持久化阵营技能',
      'factionSkillRegistry 是否改造为运行时从 DB 动态加载（含自建阵营）',
      '安全兜底锁（关键）：getFactionSkills(faction) 未知 → 返回 []（保持数组类型，勿改对象以免破坏 .forEach 调用）；getFactionInfo(faction) 未知 → 返回 {id: faction, skills: [], buff: {}}（而非 null），防止未来 .color / .id 访问崩溃',
      '确认硬编码 FACTION_IDS 仅 earth/balon/maxion；neutral/未知 亦被视作无技能（须与前端 FACTION_CONFIG.unknown 兜底对齐）',
    ],
    fallback: '当前：getFactionSkills 未知→[]（安全，功能缺失）；getFactionInfo 未知→null（需改造为安全结构）。真正架构缺口：factions 表技能不进引擎；未知 faction 在未来代码路径存在崩溃面，须以安全兜底锁封死。',
  },
  {
    id: 'A4', module: 'skill', title: '词条 / 技能编辑器',
    entry: 'GlossaryView.vue (POST /config)', route: 'POST /config',
    consumer: 'skillExecutor / skillRegistry', risk: 'MEDIUM',
    problem: 'admin-only，深度合入 cfg.skills。危险点：action_type 是唯一分派键，UI 若新增未知 action_type 会静默失效；trigger 为死字段；cast_range 必须标量。',
    checks: [
      'action_type ∈ {attack,heal,buff,debuff,passive}，未知值须拦截',
      'cast_range 为标量数值（非对象）',
      'category 用容错值 auto/special（battleStateFactory isAuto 硬依赖 auto）',
      'damage_kind_modifiers / status_effects 字段名与 skillExecutor 读取一致',
      'trigger 字段明确标注「不可调度」避免误用',
    ],
    fallback: '未知 action_type 落 default 仅返回 bonus_value 无副作用（静默失效）',
  },
  {
    id: 'A5', module: 'victoryConditions', title: '胜利条件配置',
    entry: 'NewPreparationRoom.vue → victory-conditions', route: 'POST /api/combat/:battleId/victory-conditions',
    consumer: 'victoryChecker.evaluateVictory', risk: 'HIGH',
    problem: '★真实活 bug（契约错位，比原 MEDIUM 更严重）：前端 destroy_facility 送 {target_q,target_r}、hold_position 送 {hold_round}；但 victoryChecker（L53/100/137）读的是 vc.facility.{q,r,hp,faction,attacker}。字段名不匹配 → facility 恒为 null → destroy_facility 与 hold_position 永不触发（典型"录了但读不到"）。坐标比对本身一致：hold_position 用 unit.position.{q,r}（offset）== facility.{q,r}（offset），无轴向混用；但须确保 facility 字段真正落地且统一用 offset 坐标。',
    checks: [
      'conditions ∈ ENUM.victoryCondition 且非空',
      '★契约对齐：前端 target_q/target_r 须在落库或网关处映射为 victoryConditions.facility.{q,r}；hold_round 条件须同时生成 facility.{faction,hp,attacker}，或改 victoryChecker 直接读 target_q/target_r',
      '坐标同一把尺子：victoryChecker 比对须用 offset 坐标（unit.position.{q,r} 与 facility.{q,r} 同为 Even-R offset），调用统一 getHexKey/hexDistanceOffset，禁止轴向坐标直接 ==',
      'evaluateVictory 对 destroy_facility 实际比对 facility.hp<=0、对 hold_position 比对 u.q===fq && u.r===fr，确认无坐标体系错配',
    ],
    fallback: '现网：facility 为 null → destroy_facility/hold_position 永不触发胜利（条件死链，非崩溃）',
  },
  {
    id: 'A6', module: 'aceUnit', title: '王牌机体配置',
    entry: 'NewPreparationRoom.vue → ace-unit', route: 'POST /api/combat/:battleId/ace-unit',
    consumer: 'combatResolver（王牌倍率/胜负）', risk: 'LOW',
    problem: 'faction 须合法；unit_id 须指向 pending_units 中存在的单位。',
    checks: ['faction ∈ ENUM.faction', 'unit_id 存在于 pending_units'],
    fallback: '缺失 → 无王牌加成',
  },
  {
    id: 'A7', module: 'pendingUnits', title: '部署单位池',
    entry: 'NewPreparationRoom.vue → pending-units', route: 'POST /api/combat/:battleId/pending-units',
    consumer: 'createBattleUnit / deploy', risk: 'MEDIUM',
    problem: 'units[] 须为完整 Unit 形状（含 stats/skills/attributes）；equipment 须已 sanitize 为 3 槽位 damage_kind_modifiers，否则 deploy 时减伤缺失。',
    checks: ['units[] 复用 unit schema 全字段校验', 'equipment 与 unit schema 一致', '同 unit_code 去重'],
    fallback: '缺 equipment → 减伤失效；缺 stats → createBattleUnit 兜底默认值',
  },
  {
    id: 'A8', module: 'royroy', title: 'Royroy 浮游辅机',
    entry: '单位编辑器「跟随」部件 → buildUnitPayload', route: '随 Unit 保存',
    consumer: 'combat.ts /action (deploy/retrieve/damage_royroy) + move 自动重定位', risk: 'MEDIUM',
    problem: 'royroy 内嵌于 attributes。若 buildUnitPayload 未注入 isAuto/deployed/status/hp/maxHp/cooldownRound，则 /action 部署会 400「该单位无 Royroy」或字段缺失。',
    checks: [
      'buildUnitPayload 注入完整 royroy 模型（deployed/status/hp/maxHp/cooldownRound/isAuto）',
      '★阵营继承：royroy 实体须携带并继承母机 faction/ownerId（部署时由 combat.ts /action 透传），确保友军/敌军/归属识别逻辑（含未来可能将 royroy 纳入 AoE/ZOC 目标集合）正确',
      'isAuto 与 category=auto 词条门控一致',
      'deploy_royroy 校验 q/r 相邻 + 占用格',
    ],
    fallback: 'roy 不存在 → 400 NO_ROYROY；字段缺失 → 部署异常',
  },
];

/* ====================================================================== *
 * PART 3 — 结构化处理（normalizeAuditPlan）
 * ====================================================================== */

const RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH'];

function normalizeAuditPlan(input, schemas) {
  const items = input.map((rec) => {
    const schema = schemas[rec.module];
    if (!schema) throw new Error(`审计计划引用了未知模块 schema: ${rec.module} (id=${rec.id})`);
    const risk = String(rec.risk || '').toUpperCase();
    if (!RISK_LEVELS.includes(risk)) throw new Error(`非法 risk 等级: ${rec.risk} (id=${rec.id})`);
    return {
      id: rec.id,
      module: rec.module,
      title: rec.title,
      schemaTitle: schema.title,
      link: {
        ui_entry: rec.entry,
        api_route: rec.route,
        db_store: schema.db,
        core_consumer: rec.consumer || schema.consumer,
      },
      risk,
      problem: rec.problem || '',
      requiredChecks: rec.checks || [],
      fallback: rec.fallback || '未声明兜底行为',
      schemaRef: `${rec.module} schema`,
    };
  });

  const riskStat = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  items.forEach((r) => { riskStat[r.risk]++; });

  return {
    generatedAt: new Date().toISOString(),
    totalItems: items.length,
    riskStat,
    modules: Object.keys(schemas).length,
    items,
  };
}

/* ====================================================================== *
 * PART 4 — 报告生成（generateReport）
 * ====================================================================== */

function yamlField(fd) {
  let s = `- **${fd.name}** \`${fd.type}\``;
  s += fd.required ? '  _(必填)_' : '  _(可选)_';
  if (fd.enum) s += `  枚举: ${fd.enum.map((e) => '`' + e + '`').join(' / ')}`;
  if (fd.default !== undefined && fd.default !== null) s += `  默认: \`${JSON.stringify(fd.default)}\``;
  if (fd.desc) s += `\n  - 说明: ${fd.desc}`;
  if (fd.consumer) s += `\n  - 消费端: ${fd.consumer}`;
  return s;
}

function renderSchemaBlock(key, schema) {
  let md = `### ${schema.title}\n\n`;
  md += `- **录入入口 UI**: ${schema.ui}\n`;
  md += `- **API**: \`${schema.api}\`\n`;
  md += `- **落库**: ${schema.db}\n`;
  md += `- **核心消费端**: ${schema.consumer}\n`;
  if (schema.risk) md += `- **⚠️ 已知风险**: ${schema.risk}\n`;
  md += `\n**顶层字段**\n\n${schema.fields.map(yamlField).join('\n')}\n`;
  if (schema.nested) {
    for (const [subName, subFields] of Object.entries(schema.nested)) {
      md += `\n**嵌套: \`${subName}\`**\n\n${subFields.map(yamlField).join('\n')}\n`;
    }
  }
  md += '\n';
  return md;
}

function renderAuditItem(item) {
  let md = `#### ${item.id} · ${item.title}  _[${item.risk}]_\n\n`;
  md += `- **模块**: \`${item.module}\` (${item.schemaTitle})\n`;
  md += `- **四跳链路**:\n`;
  md += `  1. UI 录入: ${item.link.ui_entry}\n`;
  md += `  2. API 路由: \`${item.link.api_route}\`\n`;
  md += `  3. 落库形状: ${item.link.db_store}\n`;
  md += `  4. 核心消费: ${item.link.core_consumer}\n`;
  if (item.problem) md += `- **问题/历史坑**: ${item.problem}\n`;
  md += `- **必查契约点** _(${item.requiredChecks.length})_:\n${item.requiredChecks.map((c, i) => `  ${i + 1}. ${c}`).join('\n')}\n`;
  md += `- **兜底行为**: ${item.fallback}\n`;
  md += `- **权威格式引用**: ${item.schemaRef}\n\n`;
  return md;
}

function generateReport(schemas, normalized) {
  const now = new Date().toLocaleString('zh-CN');
  let md = '';
  md += `# 手动录入数据契约审计计划报告\n\n`;
  md += `> 生成时间: ${now}  \n`;
  md += `> 覆盖手动录入模块: ${normalized.modules} 个  \n`;
  md += `> 审计条目: ${normalized.totalItems} 条  \n`;
  md += `> 风险分布: HIGH ${normalized.riskStat.HIGH} / MEDIUM ${normalized.riskStat.MEDIUM} / LOW ${normalized.riskStat.LOW}\n\n`;
  md += `---\n\n## 一、背景与目的\n\n`;
  md += `项目采用「分阶段独立开发」：手动录入端（UI 表单）与核心消费端（战斗引擎 / 结算服务）字段契约**全为隐式**。本次刚修复的「手动单位战斗数据全空」bug（form 平铺 → 后端只认 stats/skills/attributes）正是该债务的典型爆发点。本报告基于后端现有核心数据结构，**反向确权每个手动录入入口的权威保存格式**，并据此制定本审计计划，确保「录了就能被核心读到」。\n\n`;
  md += `## 二、审计方法论（四跳契约追踪）\n\n`;
  md += `对每个手动录入路径，串联四跳并逐跳对账：\n\n`;
  md += '```mermaid\nflowchart LR\n  A[UI 表单字段] -->|请求体 payload| B[API 路由解析]\n  B -->|落库列| C[DB 存储形状]\n  C -->|查询返回| D[引擎消费端读取字段]\n  A -.契约缺失.-> E[静默丢数据]\n  style E fill:#b30000,stroke:#fff,color:#fff\n  style D fill:#1a6b2f,stroke:#fff,color:#fff\n```\n\n';
  md += `**判定标准**：在 B→C、C→D 两跳中，凡出现「录入端写了 X，消费端读 Y，且无默认值兜底/无告警」的，即记为缺陷。\n\n`;
  md += `## 三、风险总览\n\n`;
  const byRisk = { HIGH: [], MEDIUM: [], LOW: [] };
  normalized.items.forEach((it) => byRisk[it.risk].push(it.title));
  md += `| 风险 | 条目数 | 模块 |\n| --- | --- | --- |\n`;
  md += `| 🔴 HIGH | ${normalized.riskStat.HIGH} | ${byRisk.HIGH.join(' / ') || '—'} |\n`;
  md += `| 🟡 MEDIUM | ${normalized.riskStat.MEDIUM} | ${byRisk.MEDIUM.join(' / ') || '—'} |\n`;
  md += `| 🟢 LOW | ${normalized.riskStat.LOW} | ${byRisk.LOW.join(' / ') || '—'} |\n\n`;
  md += `---\n\n## 四、权威保存格式（Schema 真相表）\n\n`;
  for (const [key, schema] of Object.entries(SCHEMAS)) {
    md += renderSchemaBlock(key, schema);
  }
  md += `---\n\n## 五、审计计划（逐入口四跳 + 必查契约点）\n\n`;
  for (const item of normalized.items) {
    md += renderAuditItem(item);
  }
  md += `---\n\n## 六、执行路线与交付物\n\n`;
  md += `1. **Phase 1（本脚本产出）**：建立 8 个模块的权威 Schema 真相表，作为一切录入/消费的基准契约。\n`;
  md += `2. **Phase 2（逐入口修复）**：按风险排序 HIGH→LOW，对 A1（单位，已修复）/ A2（战场）/ A3（阵营）/ A4（词条）逐一落地字段对齐。\n`;
  md += `3. **Phase 3（契约测试）**：为每条路径补 round-trip 测试（录入 → 落库 → 引擎读取），防止复发。\n`;
  md += `4. **Phase 4（E2E 验证）**：浏览器开真实战局，验证地形减伤 / 阵营技能 / 胜利遮罩 / Royroy 部署。\n\n`;
  md += `### 交付物\n\n`;
  md += `- 结构化审计对象（normalized）：可供测试/CI 复用的 JSON 契约。\n`;
  md += `- 本报告（Markdown）：保存至用户桌面。\n\n`;
  md += `---\n\n_本报告由 \`scripts/manual-input-audit.cjs\` 基于后端核心数据结构自动生成。_\n`;
  return md;
}

/* ====================================================================== *
 * PART 5 — 执行入口
 * ====================================================================== */

function main() {
  const normalized = normalizeAuditPlan(AUDIT_PLAN_INPUT, SCHEMAS);
  const report = generateReport(SCHEMAS, normalized);

  // 同时输出结构化 JSON（便于 CI/复用）
  const outDir = path.resolve(__dirname);
  fs.writeFileSync(path.join(outDir, 'manual-input-audit.structured.json'), JSON.stringify(normalized, null, 2), 'utf8');

  // 桌面路径（macOS）
  const desktop = path.join(process.env.HOME || '/Users', 'Desktop');
  const desktopFile = path.join(desktop, '手动录入数据契约审计计划报告.md');
  fs.writeFileSync(desktopFile, report, 'utf8');

  console.log('✅ 结构化审计对象已写入:', path.join(outDir, 'manual-input-audit.structured.json'));
  console.log('✅ 审计报告已保存至桌面:', desktopFile);
  console.log(`   模块数=${normalized.modules} 条目数=${normalized.totalItems} 风险=HIGH:${normalized.riskStat.HIGH} MEDIUM:${normalized.riskStat.MEDIUM} LOW:${normalized.riskStat.LOW}`);
}

main();
