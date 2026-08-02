/**
 * 战斗指令 DTO（阶段三 · 网关-引擎绝对隔离）
 * ------------------------------------------------------------
 * 收口目标：阻断「客户端伪造战局」类攻击面。前端历史上可经 context 透传
 *   battleState / allUnits / terrainMap / caster / target 等完整对象，
 *   引擎若误用这些透传对象而非内存权威态，则客户端可篡改血量、地形、占位。
 *
 * 设计纪律（与战斗宪法一致）：
 *   - 引擎只应从内存权威 BattleState 自取 battleState / allUnits / terrainMap。
 *   - 网关在此做**白名单剥离**：context 仅保留显式声明的「安全附加字段」，
 *     其余（含任何疑似战局引用）一律剔除，再传给 .cjs 引擎。
 *   - 纯函数、零 IO、零外部依赖。
 */

/** 允许穿透到引擎的 context 白名单键（仅元数据，不含任何单位/战局实例）。 */
const CONTEXT_ALLOWLIST = new Set<string>([
  'skillDefinition', // 词条库技能定义（由网关从 glossary 取，非客户端自由对象）
  'diceBranches', // 骰子分支配置（词条驱动）
  'isWeaponAttack', // 是否武器攻击（布尔开关）
  'surpriseAllowed', // 奇袭是否可用（布尔开关）
  'source', // 来源标记（如 'skill' / 'attack'），用于日志
]);

/** 必须被强制剔除的键（任何情况下都不允许客户端注入战局实例）。 */
const CONTEXT_BLOCKLIST = new Set<string>([
  'battleState',
  'allUnits',
  'units',
  'terrainMap',
  'battle',
  'caster',
  'target',
  'executorState',
  'gameState',
  'state',
]);

export interface SkillContextDTO {
  [key: string]: unknown;
}

/**
 * 白名单剥离 context：仅保留 CONTEXT_ALLOWLIST 中的键，并强制剔除
 * CONTEXT_BLOCKLIST 中的键（blocklist 优先级高于 allowlist，双重保险）。
 *
 * @param raw 客户端原始 context（可能为 undefined / null / 非对象）
 * @returns 安全 context（始终为普通对象，至少返回 {}）
 */
export function sanitizeSkillContext(raw: unknown): SkillContextDTO {
  if (!raw || typeof raw !== 'object') return {};

  const src = raw as Record<string, unknown>;
  const out: SkillContextDTO = {};

  for (const key of Object.keys(src)) {
    if (CONTEXT_BLOCKLIST.has(key)) continue; // 强制剔除伪造战局字段
    if (!CONTEXT_ALLOWLIST.has(key)) continue; // 不在白名单的一律丢弃
    out[key] = src[key];
  }

  return out;
}

/**
 * 构造传给 .cjs 引擎的标准战斗指令 DTO。
 * 引擎只接收：技能 key、施法/目标 ID（字符串，非对象）、白名单 context。
 *
 * @param params.attackerId  攻击者单位 ID（已由 pickId 归一化）
 * @param params.targetId    目标单位 ID（已由 pickId 归一化）
 * @param params.skillKey    技能 key
 * @param params.context     原始客户端 context（将被白名单剥离）
 */
export interface BuildSkillDtoParams {
  attackerId?: string;
  targetId?: string;
  skillKey?: string;
  context?: unknown;
}

export interface BattleCommandDTO {
  attackerId?: string;
  targetId?: string;
  skillKey?: string;
  context: SkillContextDTO;
}

export function buildSkillDto(params: BuildSkillDtoParams): BattleCommandDTO {
  return {
    attackerId: params.attackerId,
    targetId: params.targetId,
    skillKey: params.skillKey,
    context: sanitizeSkillContext(params.context),
  };
}
