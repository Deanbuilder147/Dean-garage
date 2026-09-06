# 强契约（Zod Schema）现状核查 与 完整契约定义

日期：2026-08-06
范围：`mecha-universe-engine` 全仓
触发需求：①P0-2 装备耐久决策落地 ②引入 shared-kernel 强契约前的存量核查

---

# 第一部分：存量核查结论

## 1.1 一句话结论

**存在，但完全错位 —— zod 恰好绕开了最需要它的核心链路。**

`zod@^4.3.6` 确实已在仓库中，但它躺在 6 个**边缘微服务**的 `package.json` 里，而**战斗主链路（`backend-gateway` + `combat-service` + `shared-kernel`）依赖列表中根本没有任何校验库**。

## 1.2 匹配度评分

| 维度 | 目标 | 现状 | 匹配度 |
|---|---|---|---|
| 校验库已引入 | zod 可用 | 6 个 service 已声明 | 🟡 **40%**（声明有，位置全错） |
| 战斗主链路覆盖 | gateway/combat 强校验 | **零依赖、零 import** | 🔴 **0%** |
| 契约沉淀到 shared-kernel | 三端共享同一份 | shared-kernel **无任何 schema 文件**，devDeps 只有 typescript | 🔴 **0%** |
| 运行时校验能力 | 落库/消费前拦截 | `types.ts` 仅 TS interface，**编译后擦除** | 🔴 **0%** |
| 拒绝静默吞字段 | default 分支显式告警 | 全为静默兜底 | 🔴 **0%** |
| **综合** | | | **≈ 8%** |

## 1.3 zod 实际分布（实测）

**声明了 zod 的 6 个 package.json：**
```
services/map-service/package.json:18
services/online-battle-service/package.json:26
services/combat-service/package.json:22   ← 声明了却零 import
services/hangar-service/package.json:20
services/comm-service/package.json:17     ← 声明了却零 import
services/auth-service/package.json:19
```

**未声明 zod 的（恰恰是主链路）：**
- `backend-gateway/package.json` —— ❌ 无。**但它承载了全部战斗/房间/词条/Excel 导入端点**
- `shared-kernel/package.json` —— ❌ 无。devDependencies 仅 `typescript`
- `frontend/package.json` —— ❌ 无
- 根 `package.json` —— ❌ 无

其他校验库（joi / yup / ajv / class-validator / superstruct / io-ts）：**全仓 0 命中**。

**真正 import 并使用 zod 的仅 3 处**，且均为服务本地定义、互不复用、未沉淀共享：

```js
// services/auth-service/src/routes/auth.js:4,11-18
import { z } from 'zod';
const registerSchema = z.object({
  username: z.string().min(3).max(20),
  password: z.string().min(6).max(100)
});
```
- `services/hangar-service/src/routes/units.js:24-34` → `createUnitSchema`
- `services/map-service/src/routes/battlefields.js:11-31` → `createBattlefieldSchema` / `terrainSchema`

> ⚠️ 关键讽刺：`combat-service` **声明了 zod 依赖却一次都没 import**。而 combat-service 的 `.cjs` 引擎是被 gateway 用 `createRequire` 直接吃进去的，正是断链重灾区。

## 1.4 shared-kernel 现状（Zod 化的蓝本）

`shared-kernel/src/` 仅 4 个源文件：

| 文件 | 内容 | 能否复用 |
|---|---|---|
| `index.ts` | 纯 re-export 桶文件 | ✅ 挂载点 |
| `tokens.ts` | **12 个 `enum`** + 5 个 interface | ✅✅ enum 是运行时值，可直接喂 `z.nativeEnum()` |
| `types.ts` | **25 个纯 interface/type，零运行时值** | ✅ 是 Zod 化的现成蓝本 |
| `hexMath.ts` | 9 函数 + 2 常量表（射程真相源） | 无关 |

`tokens.ts` 可复用的 enum：`LexicalToken`、`SyntaxTag`、`DamageType`、`BattlePhase`、`RoomStatus`、`PermissionLevel`、`UserRole`、`ReviewStatus`、`GenerationStatus`、`HexDirection`、`ErrorCode`。

`types.ts` 已有 25 个类型（`UnitStats`、`UnitSkill`、`BattleUnit`、`BattleEquipment`、`EntityMatrix`、`TerrainCell`、`Room`、`SkillExecutionResult` 等）—— **但注意：文件头注释虽写「实体矩阵 Schema」，这里的 "Schema" 仅指 TypeScript 类型形状，编译后完全擦除，运行时零校验能力**。这正是本次全部 P0 断链在编译期零报错的根因。

**已发现的类型/运行时裂缝**（`types.ts:138`）：
```ts
attributes: Map<string, unknown>;   // 但 JSON 传输 / DB 落盘实际是普通对象
```

**构建配置约束**（`shared-kernel/package.json`）：
```json
"exports": {
  ".":         { "import": "./dist/index.js", "require": "./dist/index.js" },
  "./hexMath": { "import": "./dist/hexMath.js", "require": "./dist/hexMath.cjs" },
  "./tokens":  "./src/tokens.ts",
  "./types":   "./src/types.ts"
}
```
⚠️ **双产物（ESM+CJS）目前仅 `hexMath` 一个子路径享有**，靠 `build:cjs` 里一段 `node -e` 内联字符串手工复制实现。根入口 `"."` 的 `require` 条件指向的仍是 ESM 产物 —— **这意味着 combat-service 的 `.cjs` 引擎目前无法 require 根入口**。新增 contracts 子路径必须比照 hexMath 补 CJS 产物，否则引擎侧用不上。

## 1.5 现有可复用的周边设施

| 设施 | 位置 | 说明 |
|---|---|---|
| Excel 校验器 | `backend-gateway/src/services/glossary-excel-validator.ts` | **手写校验**，非库驱动。可作为 Zod 迁移的第一批改造对象 |
| Excel 归一化 | `backend-gateway/src/services/excel-schema-normalizer.ts` | 已有字段映射逻辑（含 `durability`/`maxDurability` 写入） |
| 错误码枚举 | `tokens.ts` 的 `ErrorCode` | ✅ 可直接用作校验失败的错误码来源 |
| 统一错误码字符串 | 各路由的 `VALIDATION_ERROR` | 已有约定，可沿用 |
| logger | gateway 内 `logger.info/error` | ✅ 已存在，可承载 warn |
| `diagnostics[]` / `warnings[]` | **不存在** | 🔴 需新建 |

## 1.6 现存静默降级点（实测样本）

**`skillExecutor.cjs:352-360` —— 谓语路由 default 分支**（最关键）：
```js
switch (uf.action_type) {
    case 'attack':  ...
    case 'heal':    ...
    case 'buff':    ...
    case 'debuff':  ...
    case 'passive': ...
    default:
        return {
            triggered: true, type: skillType,      // ← 注意：triggered 竟然是 true
            action_type: uf.action_type,
            bonus_value: uf.base_damage + diceBonus + heightBonus,
            message: `${uf.label}: 基础${uf.base_damage} + ...`
        };
}
```
> 这里 `triggered: true` 尤其危险：未知谓语被当作**成功执行**返回，战报不留任何异常痕迹。

其余典型静默点：`catch { stats = {} }`、`catch { equipment = {} }`、`?? {}`、`|| 0`、`u?.equipment ?? {}` 等遍布 routes 与引擎。

---

# 第二部分：P0-2 装备耐久 —— 决策已落地

## 2.1 执行内容（按你的决断：直接跳过）

| 文件 | 改动 | 状态 |
|---|---|---|
| `routes/rooms.ts:576` | 删除 `JSON.parse(u.equipment)` 幽灵读取，显式 `equipment = {}` 并注明 units 表无该列 | ✅ 已上线 |
| `combatBridge.ts:51` | `getEquipmentDurability()` 改为**显式 throw** `EQUIPMENT_DURABILITY_DISABLED`，不再加载模块 | ✅ 已上线 |
| `combatBridge.ts:25` | 移除 `_EquipmentDurability` 缓存变量 | ✅ 已上线 |

## 2.2 ⚠️ 审计修正（重要，与昨日报告不同）

排查中发现**必须区分两条独立的装备路径**，昨日报告将其混为一谈：

| 路径 | 数据来源 | 是否有效 | 处置 |
|---|---|---|---|
| **`u.equipment`**（DB 列） | units 表**根本无此列** | ❌ 恒 undefined，幽灵外键 | ✅ 本次已摘除 |
| **`equipState`**（派生字段） | `battleStateFactory.buildEquipmentFromParts(parts)` 从 parts 构建 | ✅ **真实有效** | ⚠️ **保留不动** |

`equipState` 由 `battleStateFactory.ts:221,244-270` 从机体 parts 实时构建（武器/防具/载具/背包），被 `combat.ts:1237` 的 `computeWeaponMobilityBonus` 用于武器机动加成与攻击力叠加 —— **这条链路是通的，绝不能一并砍掉**。本次仅停用「耐久」语义，武器机动/攻击力叠加不受影响。

另外确认：`getEquipmentDurability()` 在 `routes/` 下**零调用点**，故停用不影响任何现网链路（纯粹是清除一个随时可能被误接的定时炸弹）。

## 2.3 部署验证
- 服务器 `npm run build` tsc 干净
- `docker compose build --no-cache mecha-gateway` + `up -d --no-deps` 完成
- 容器内 `/app/dist/combatBridge.js` 含 `EQUIPMENT_DURABILITY_DISABLED`
- 4 容器 healthy，8081 返回 HTTP 200

---

# 第三部分：完整契约定义（待实施）

> 结论：现有设施**不可复用为强契约**，必须新建。以下是完整定义。

## 3.1 目录与构建结构

```
shared-kernel/
├── src/
│   ├── contracts/
│   │   ├── index.ts          # 桶导出
│   │   ├── primitives.ts     # 原子类型 + enum 包装
│   │   ├── unit.contract.ts
│   │   ├── skill.contract.ts
│   │   ├── glossary.contract.ts
│   │   ├── map.contract.ts
│   │   ├── room.contract.ts
│   │   ├── battle.contract.ts
│   │   └── diagnostics.ts    # 统一诊断通道
│   └── index.ts              # 追加 export * from './contracts'
```

**package.json 必须同步改造**（否则 `.cjs` 引擎用不上）：
```json
"dependencies": { "zod": "^4.3.6" },
"exports": {
  "./contracts": {
    "import": "./dist/contracts/index.js",
    "require": "./dist/contracts/index.cjs"   // ★ 必须比照 hexMath 补 CJS 产物
  }
}
```
并在 `build:cjs` 脚本中追加 contracts 的 CJS 编译（当前该脚本只处理 hexMath 一个文件）。

同时 `backend-gateway/package.json` 需新增 `zod` 依赖（当前完全没有）。

## 3.2 primitives.ts — 原子契约

```ts
import { z } from 'zod';
import { UserRole, ReviewStatus, RoomStatus, DamageType, BattlePhase } from '../tokens.js';

export const EntityId   = z.string().min(1, '实体 ID 不可为空');
export const ISODate    = z.string().datetime({ offset: true });

/** 英文 Key：强制小写字母/数字/下划线，杜绝中文 Label 混入业务键位 */
export const EnglishKey = z.string().regex(/^[a-z][a-z0-9_]*$/, '业务 Key 必须为英文小写 snake_case，禁止中文');

/** 中文展示文本：仅允许出现在 label/name 类字段 */
export const DisplayLabel = z.string().min(1).max(64);

export const HexCoord = z.object({ q: z.number().int(), r: z.number().int() });

export const UnitSizeEnum   = z.enum(['s', 'm', 'l', 'xl']);
export const FactionEnum    = z.enum(['earth', 'maxion', 'balon', 'neutral']);
export const RoleEnum       = z.enum(['attack', 'defense', 'ambush']);
export const SkillCategory  = z.enum(['melee', 'ranged', 'special', 'support', 'auto', 'automation']);
export const ActionTypeEnum = z.enum(['attack', 'heal', 'buff', 'debuff', 'passive']);

export const UserRoleEnum   = z.nativeEnum(UserRole);
export const RoomStatusEnum = z.nativeEnum(RoomStatus);
export const DamageTypeEnum = z.nativeEnum(DamageType);
```

## 3.3 unit.contract.ts

```ts
export const UnitStatsContract = z.object({
  hp:       z.number().int().min(1).default(100),
  max_hp:   z.number().int().min(1).optional(),   // 统一 snake_case，禁 hpMax
  attack:   z.number().int().min(0).default(0),
  defense:  z.number().int().min(0).default(0),
  armor:    z.number().int().min(0).default(0),   // ★ P0-3：必须在契约中显式存在
  shield:   z.number().int().min(0).default(0),
  mobility: z.number().int().min(0).default(0),
  evasion:  z.number().int().default(0),
  accuracy: z.number().int().default(0),
});

/** ★ P0-1：唯一命名法 snake_case。camelCase 变体一律在入口归一，不进契约 */
export const SkillsByOwnerContract = z.record(z.string(), z.array(SkillContract));

export const UnitAttributesContract = z.object({
  skills_by_owner: SkillsByOwnerContract.default({}),
  parts:           z.record(z.string(), z.any()).default({}),
}).passthrough();   // 过渡期放行未知键，但配合 strictLog 记录

export const UnitContract = z.object({
  id:         EntityId,
  owner_id:   EntityId,
  name:       DisplayLabel,
  codename:   z.string().default(''),
  faction:    FactionEnum.default('earth'),
  category:   SkillCategory.default('melee'),
  tier:       z.number().int().min(1).default(1),
  size:       UnitSizeEnum.default('m'),
  stats:      UnitStatsContract,
  skills:     z.array(SkillContract).default([]),
  attributes: UnitAttributesContract.default({}),
  // ★ P0-2：equipment 已停用，契约中【故意不定义】。
  //   如未来恢复，须同时补 DB 列 + 写入端，再在此追加。
});
```

## 3.4 skill.contract.ts（治理 P0-4 中英错位核心）

```ts
export const SkillContract = z.object({
  /** ★ P0-4 根治：业务外键强制英文 Key 且【非空】，杜绝 null 静默降级 */
  skill_key: EnglishKey,

  /** 中文展示名 —— 仅用于 UI，严禁参与任何业务查表 */
  name:      DisplayLabel,

  /** ★ 原 effect 字段：降级为纯展示，重命名以杜绝误用 */
  effect_label: DisplayLabel.optional(),

  /** ★ 分类唯一真相源：落库前必须归一为 category 单字段。
   *  旧的 type / typeLabel / attack_type[] / action_type[] 五路兜底一律在入口消化 */
  category:    SkillCategory,
  action_type: ActionTypeEnum,

  cast_range:     z.number().int().min(0).nullable().default(null),
  min_cast_range: z.number().int().min(0).nullable().default(null),
  slot:           z.string().nullable().default(null),
  effects:        z.array(EffectContract).default([]),
});
```
> 配套硬约束：`typeLabel` 从读取端**删除**（无人写入却三处读取）；`type` 仅保留在迁移适配器中。

## 3.5 glossary.contract.ts

```ts
export const GlossaryEntryContract = z.object({
  key:   EnglishKey,        // 英文，主键
  name:  DisplayLabel,      // 中文，仅展示
  category:    SkillCategory,
  action_type: ActionTypeEnum,
  base_damage: z.number().default(0),
  effects:     z.array(EffectContract).default([]),
});

/** 中文 Label → 英文 Key 反查字典：唯一真相源，由词条库运行时派生。
 *  ★ 严禁任何组件内硬编码静态映射表（现存 EFFECT_TO_KEY_FALLBACK 属过渡兜底，须删除） */
export function buildLabelToKeyDict(entries: GlossaryEntry[]): Map<string, string> {
  return new Map(entries.map(e => [e.name, e.key]));
}
```

## 3.6 map.contract.ts

```ts
export const TerrainCellContract = z.object({
  q: z.number().int(),
  r: z.number().int(),
  terrain_key: EnglishKey,          // ★ 强制英文，中文仅 label
  terrain_label: DisplayLabel.optional(),
  height: z.number().int().default(0),
});
```

## 3.7 diagnostics.ts — 拒绝静默吞字段（核心机制）

```ts
export const DiagnosticContract = z.object({
  level:   z.enum(['info', 'warn', 'error']),
  code:    z.string(),          // 如 SKILL_KEY_MISSING / UNKNOWN_PREDICATE
  message: z.string(),
  entity:  z.string().optional(),
  field:   z.string().optional(),
  at:      z.number(),
});

/** 战报/结算结果统一挂载点 —— 前端可渲染黄色警告条 */
export const WithDiagnostics = z.object({
  diagnostics: z.array(DiagnosticContract).default([]),
});
```

**校验中间件（gateway）**：
```ts
export function validateBody<T extends z.ZodTypeAny>(schema: T) {
  return (req, res, next) => {
    const r = schema.safeParse(req.body);
    if (!r.success) {
      logger.warn({ msg: '[CONTRACT] 请求体校验失败', issues: r.error.issues });
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        issues: r.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    // ★ 拒绝静默吞字段：未知字段显式告警而非丢弃
    const unknown = Object.keys(req.body ?? {}).filter(k => !(k in (r.data as object)));
    if (unknown.length) logger.warn({ msg: '[CONTRACT] 请求体含未知字段', unknown });
    req.body = r.data;
    next();
  };
}
```

**引擎 default 分支改造**（对应 1.6 的 `skillExecutor.cjs:352`）：
```js
default:
    // ★ 拒绝静默：未知谓语必须发声，且 triggered 置 false
    return {
        triggered: false,
        type: skillType,
        action_type: uf.action_type,
        bonus_value: 0,
        diagnostics: [{
            level: 'error', code: 'UNKNOWN_PREDICATE',
            message: `未知谓语 action_type="${uf.action_type}"（技能 ${skillType}），结算已跳过`,
            at: Date.now(),
        }],
        message: `⚠ 技能 ${uf.label} 配置异常：未知谓语 ${uf.action_type}`,
    };
```

## 3.8 三端接入点

| 端 | 接入方式 |
|---|---|
| 前端 | 提交前 `UnitContract.safeParse(payload)`，失败高亮表单字段 |
| 网关 | 路由挂 `validateBody(UnitContract)`；出库 `.parse()` 保证消费端形状 |
| 引擎（.cjs） | `require('@mecha/shared-kernel/contracts')` —— **依赖 3.1 的 CJS 产物** |

## 3.9 实施顺序（建议）

| 阶段 | 内容 | 风险 |
|---|---|---|
| 1 | shared-kernel 加 zod 依赖 + contracts 目录 + **CJS 双产物构建** | 低（纯新增） |
| 2 | 落地 `diagnostics.ts` + 引擎 default 分支改造 | 低，立竿见影提升可观测性 |
| 3 | UnitContract / SkillContract 先以 **`safeParse` + 仅告警不拦截** 灰度 | 低，先收集线上真实脏数据 |
| 4 | 观察告警量归零后，切换为 **硬拦截 400** | 中，需先清洗存量数据 |
| 5 | 删除 `typeLabel` 读取、组件内 `EFFECT_TO_KEY_FALLBACK` 静态表 | 中 |
| 6 | CI 加断言「写入端字段集合 ⊇ 消费端读取字段集合」 | 低 |

> ⚠️ 强烈建议阶段 3、4 分离。直接上硬拦截会因存量脏数据（大量 `skill_key` 为 null 的历史技能）导致线上批量 400。

---

# 附：待你决断事项

1. **是否立即开工第三部分**（阶段 1-2 约束小、收益高，可先做）？
2. **存量脏数据清洗**：现有 `skill_key` 为 null 的历史技能，是写迁移脚本批量回填（用中文 name 反查词条库），还是保留兜底读取？
3. **`attributes.skillsByOwner` 兼容期**：当前已双读兼容，是否需要迁移脚本把存量 camelCase 数据统一改写为 snake_case 后移除兼容分支？
