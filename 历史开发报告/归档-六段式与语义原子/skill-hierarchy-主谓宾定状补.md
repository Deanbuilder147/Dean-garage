⚠️ 【过时文档 · 已归档】（二次过期 · 2026-09-02 复核）
本文档及其下方 2026-08-08 标注中所称「新模型：六段(WHEN/IF/WHO/ROLL/DO/COST)」**均已二次过期**。
当前六段定稿为 **`WHEN→IF→ROLL→DO→AFTER→COST`**（`WHO` 已删除，降级为 `DO` 段首置前导原子 `B_TARGET` / handlerKey `resolve_target`），见**工作区根目录** `docs/原子记录-20260823.md` 与 `docs/原子改造方案-A+B-20260823.md`。
本文档仅作历史参考（保留以追溯 L0–L6 七层模型的演进脉络），不再作为执行依据。归档时间：2026-09-02

---

⚠️ 【过时文档 · 已废弃】（2026-08-08 原始标注，保留存档）
本文档的 L0–L6 七层 / 主谓宾定状补模型，已被 2026-08-08 拍板的《67原子引擎落地与编辑器词库实施计划》（递归六段树模型）取代。
新模型：六段(WHEN/IF/WHO/ROLL/DO/COST)为有序列表（顺序即执行序）、最多 3 层递归嵌套、层间不继承仅经只读全局事件上下文连通、WHEN 为节点级触发闸门、COST 排在哪扣哪。
本文档仅作历史参考，不再作为执行依据。标注时间：2026-08-08

# 主谓宾定状补 · 技能层级系统（草案）
# Subject–Predicate–Object–Attribute–Adverbial–Complement · Skill Hierarchy System (Draft)

---

## 一、总览：一个技能 = 一句话
## Overview: One Skill = One Sentence

把每个技能当作一句话，6 个语法角色就是 6 个"层级槽位"。
Treat every skill as a sentence; the 6 grammatical roles are 6 "hierarchy slots".

"层级"有两重含义 / "Hierarchy" has two meanings:
- **组合层级**：结构树，谁包含谁（静态定义）/ **Composition hierarchy**: the structure tree, who contains whom (static definition).
- **结算层级**：执行顺序，谁先算谁后算（运行时）/ **Resolution hierarchy**: execution order, who is computed first (runtime).

---

## 二、组合层级（语法树）
## Composition Hierarchy (Syntax Tree)

```
技能 Skill（根 · 词条身份）
Skill (root · entry identity)
├─ skill_key  业务外键 · 英文键 · 非空（强契约 P0-4，严禁用 name 查表）
│             business foreign key · English key · non-empty
│             (Strong Contract P0-4: never use `name` for lookups)
├─ name       中文展示名 · 仅 UI 使用（严禁参与任何业务查表）
│             Chinese display label · UI only (never used for business lookups)
└─ entryType  词条类型 · skill / special / faction / other
              entry type · skill / special / faction / other
│
├─ L1 主语 Subject      「谁、在什么条件下能动」
│                         "Who, and under what conditions, may act"
│   ├─ 主体门控：faction（阵营） / role（角色） / ownerId（拥有者）
│   ├─ 姿态门控：requires_unmoved（需未移动） / requires_stealth（需潜行）
│   ├─ 阈值门控：requires_hp_above_percent（血量高于阈值）
│   └─ 消耗门控：ap_cost（行动点消耗） / energy（能量）
│
├─ L2 谓语 Predicate    「做什么动作」（引擎路由根）
│                         "What action to perform" (engine routing root)
│   └─ attack（攻击） / heal（治疗） / buff（增益） / debuff（减益） / passive（被动） / move（移动）
│
├─ L3 宾语 Object       「作用在谁、范围多大」
│                         "Who it affects, and how large the scope"
│   ├─ target_type：SELF（自身） / SINGLE_ALLY（单体友方） / AREA_ALLY（群体友方） / SINGLE_ENEMY（单体敌方） / AREA_ENEMY（群体敌方） / ALL_UNITS（全体单位）
│   ├─ range（射程） / min_range（最小射程）
│   ├─ aoe 形状：point（点） / sector（扇形） / map_cannon（地图炮）
│   └─ filter（筛选：单位类型 / 状态）
│
├─ L4 定语 Attribute    「动作的属性与种类」
│                         "The attributes and kind of the action"
│   ├─ damage_kind（伤害种类：kinetic 动能 / beam 光束 / explosive 爆炸 / ...）
│   ├─ attack_stat（攻击属性：melee 格斗 / ranged 射击）
│   └─ accuracy_mod（命中修正） / evasion_mod（闪避修正）
│
├─ L5 状语 Adverbial    「如何执行（环境 / 随机干预）」
│                         "How it is executed (environment / random intervention)"
│   ├─ height_bonus_per_diff（高度差加成）
│   ├─ dice_type（骰种） / is_manual_roll（手动摇骰）
│   ├─ success_line（成功线） / success_bonus_damage（成功加成伤害）
│   └─ terrain（地形修正）
│
└─ L6 补语 Complement   「最终产出什么结果」
                          "What result is ultimately produced"
    ├─ base_damage（基础伤害） / reduction（减伤）
    ├─ bonus_value（泛化累加器）
    ├─ status_effects（状态效果·挂接）
    └─ post_effects（后续效果·连锁 / 二次触发）
```

---

## 三、结算层级（运行时执行顺序）
## Resolution Hierarchy (Runtime Execution Order)

施放一次技能，引擎严格按 L1→L6 分层结算。
When a skill is cast, the engine resolves strictly layer by layer, L1 → L6.

1. **L1 主语 Subject**：门控不通过 → 直接 reject（`NOT_YOUR_TURN` / 条件不足），**不消耗 AP**。
   Gating fails → reject immediately (`NOT_YOUR_TURN` / condition not met); **no AP consumed**.
2. **L2 谓语 Predicate**：选路由分支（`attack` → `_executeAttackSkill` 等）。
   Select the routing branch (`attack` → `_executeAttackSkill`, etc.).
3. **L3 宾语 Object**：确立命中集合（单目标 或 AOE 形状内全体）。
   Establish the hit set (single target, or all units within the AOE shape).
4. **L4 定语 Attribute**：确定伤害类型 / 属性，进入 `damagePipe`。
   Determine damage type / attributes, enter `damagePipe`.
5. **L5 状语 Adverbial**：环境 / 掷骰修正叠加。
   Stack environment / dice modifiers.
6. **L6 补语 Complement**：产出 `final_damage` / `statusEffects` / `post_effects`，落盘。
   Produce `final_damage` / `statusEffects` / `post_effects`, then persist.

> **AOE Fork**：在 **L3 之后**对命中集合内**每个目标独立重复 L4→L6** —— 即「地图炮分别判断」。
> **AOE Fork**: after **L3**, repeat **L4→L6 independently for every target** in the hit set — this is the "map-cannon judges each target separately" behavior.

---

## 四、可选第三轴：配置覆盖层级
## Optional Third Axis: Configuration Override Hierarchy

同一字段多处定义时按层级覆盖（决定"谁说了算"）。
When the same field is defined in multiple places, override by hierarchy (decides "who wins").

```
默认配置  <  词条(effects[])  <  装备  <  临时 buff  <  手动摇骰覆盖
Default   <  Entry(effects[]) < Gear < Temp buff  <  Manual-roll override
```

---

## 五、与现有引擎的对应关系
## Mapping to the Current Engine

| 层级 Layer | 现有字段（skillExecutor.cjs） Existing fields |
| --- | --- |
| L0 词条身份 Identity | `skill_key`（业务外键·英文·非空）/ `name`（中文展示名·仅 UI） |
| L1 主语 Subject | `requires_unmoved`（需未移动）/ `requires_stealth`（需潜行）/ `requires_hp_above_percent`（血量高于阈值）/ `ap_cost`（行动点消耗） |
| L2 谓语 Predicate | `action_type`（攻击类型：attack 攻击 / heal 治疗 / buff 增益 / debuff 减益 / passive 被动） |
| L3 宾语 Object | `target_filter`（目标筛选）/ `cast_range`（施放射程）/ `min_cast_range`（最小射程）/ `aoe_radius`（AOE 半径）/ `sector_angle`（扇形角度）/ `aoe_mode`（AOE 模式：sector 扇形 / map_cannon 地图炮） |
| L4 定语 Attribute | `damage_kind`（伤害种类）/ `attack_stat`（攻击属性：melee 格斗 / ranged 射击）/ `accuracy_mod`（命中修正）/ `evasion_mod`（闪避修正） |
| L5 状语 Adverbial | `height_bonus_per_diff`（高度差加成）/ `dice_type`（骰种）/ `success_line`（成功线）/ `success_bonus_damage`（成功加成伤害）/ `is_manual_roll`（手动摇骰） |
| L6 补语 Complement | `base_damage`（基础伤害）/ `reduction`（减伤）/ `bonus`（加成）/ `bonus_value`（泛化累加器）/ `status_effects`（状态效果）/ `post_effects`（后续效果） |

> 本设计是对现有引擎字段的**收编与命名空间化**，并非推倒重来。
> This design **consolidates and namespaces** the existing engine fields; it is not a rewrite.

---

## 六、强契约约束（skill_key vs name）
## Strong Contract Constraint (skill_key vs name)

依据 `shared-kernel/src/contracts/skill.contract.ts`（强契约 P0-4）：
Per `shared-kernel/src/contracts/skill.contract.ts` (Strong Contract P0-4):

- **`skill_key`** = 业务外键 / 英文键 / **非空**。所有查表、引擎匹配、战场引用一律用它。
  **`skill_key`** = business foreign key / English key / **non-empty**. Use it for ALL lookups, engine matching, and battle references.
- **`name`** = 中文展示名 / **仅 UI 使用**，严禁参与任何业务查表（`skill_key` 为 null 会静默降级、下游 0 效果）。
  **`name`** = Chinese display label / **UI only**; must never be used for any business lookup (a null `skill_key` silently degrades and yields zero effects downstream).

> ⚠️ 阶段 4 硬拦截后，`skill_key` 为 null 将直接返回 400；灰度期由 `rooms.ts` 的 `effectiveKey` 兜底。
> ⚠️ After the Phase-4 hard block, a null `skill_key` returns HTTP 400 outright; during the gray period `rooms.ts`'s `effectiveKey` provides a fallback.

---

## 七、skill_key 词汇中英对照表
## skill_key Vocabulary Bilingual Glossary

下列为引擎各层实际使用的枚举字符串（取自 `skillExecutor.cjs` / `damagePipe.cjs` / `routeEffectStackToTargets`），翻译直接写在单词边上。
The following are the actual enum strings used by the engine, grouped by layer; the Chinese translation is written inline next to each token.

### L2 谓语 Predicate — `action_type`
- `attack`（攻击）
- `heal`（治疗）
- `buff`（增益）
- `debuff`（减益）
- `passive`（被动）
- `move`（移动）

### L3 宾语 Object — `target_filter` / `target_type` / `aoe_mode`
- `enemy`（敌方）
- `ally`（友方）
- `self`（自身）
- `SELF`（自身）
- `SINGLE_ALLY`（单体友方）
- `AREA_ALLY`（群体友方）
- `SINGLE_ENEMY`（单体敌方）
- `AREA_ENEMY`（群体敌方）
- `ALL_UNITS`（全体单位）
- `sector`（扇形 · AOE 形状）
- `map_cannon`（地图炮 · AOE 形状）

### L4 定语 Attribute — `attack_stat` / `damage_kind` / `category`
- `melee`（格斗 · 格斗值）
- `ranged`（射击 · 射击值）
- `kinetic`（动能 · 伤害种类）
- `beam`（光束 · 伤害种类）
- `explosive`（爆炸 · 伤害种类）
- `corrosive`（腐蚀 · 伤害种类）
- `thermal`（热能 · 伤害种类）
- `special`（特殊 · 技能分类）
- `support`（支援 · 技能分类）
- `auto` / `automation`（自动化 · 技能分类）

### L5 状语 Adverbial — 掷骰 / 成功线
- `dice_type: '1d6'`（1 颗 6 面骰）
- `success_line`（成功线 · 掷骰判定阈值）
- `success_bonus_damage`（成功加成伤害）
- `is_manual_roll`（手动摇骰）
- `height_bonus_per_diff`（高度差加成）

### L6 补语 Complement — `status` / `applies_on` / `consumption.mode`
- `applies_on: 'attack'`（作用于攻击）
- `applies_on: 'attack_debuff_target'`（作用于攻击减益目标）
- `applies_on: 'defense'`（作用于防御）
- `applies_on: 'mobility'`（作用于机动）
- `modifier: 'mobility_buff'`（机动增益修正）
- `assist`（助攻 · status 类型）
- `guard`（守护 · status 类型）
- `blockade`（封锁 · status 类型）
- `scout`（侦察 · status 类型）
- `focused_fire`（集火 · status 类型）
- `consumption.mode: 'duration'`（持续消耗 · 按回合）
- `consumption.mode: 'stacks'`（层数消耗 · 按叠层）

### 触发条件 Trigger — `trigger.type`
- `on_turn_start`（回合开始时）
- `on_damage_taken`（受击时）
- `on_kill`（击杀时）
- `on_ally_down`（友方倒下时）
- `unconditional`（无条件）
- `none`（无）

---

## 八、与现有词条制作系统的整合对比与改造建议
## Integration Comparison & Refactor Proposal vs. the Current Glossary System

> 本节基于对现有前端（GlossaryHub / DetailPanel / EffectStackBuilder）与后端（glossary.ts / skill.contract.ts / combat.ts）的真实代码盘点。
> This section is grounded in the actual current code: front-end (GlossaryHub / DetailPanel / EffectStackBuilder) and back-end (glossary.ts / skill.contract.ts / combat.ts).

### 8.1 现状盘点 / Current State

**前端 Frontend**
- `GlossaryHub.vue`：四区域布局；读/写均走 `/combat-glossary/hub-config`（存储 A，单一入口，改造设计文档 v1.1 落地）。保存时 `delete payload.id`（`GlossaryHub.vue:200`）。
- `DetailPanel.vue`：编辑维度 = 词条类型 `entryType`（skill/special/faction/other）、`action_type`、`target_scope`（enemy/ally/self/enemy_equipment/ally_equipment/both/all）、`category`（melee/ranged/auto）、`bonus_range`/`min_range`/`ap_cost`、`trigger`（type + condition 对象）、`faction`（limited_to/limit_count/stance）、`effects[]`。
- `EffectStackBuilder.vue`：**每条 effect 已带 `ef.target_type`**（`SELF`/`SINGLE_ENEMY`/`AREA_ENEMY`/`SINGLE_ALLY`/`AREA_ALLY`/`ALL_UNITS`，`EffectStackBuilder.vue:188-195`），与后端 `routeEffectStackToTargets` 的枚举**完全一致**。

**后端 Backend**
- `glossary.ts`：`/hub-config`（PUT/DELETE，存储 A，configLoader）、`/config`（存储 B，data/glossary-skill-config.json，旧路径）、`/import-excel`、`/test-skill`（靶场，仅 `CASTER.atk + flat - armor` 简化结算，未走真实引擎）。
- `skill.contract.ts`：强契约已定义 `skill_key`（英文·非空）、`trigger`（对象 {type, condition}）、`effects[]`。
- `combat.ts`：`routeEffectStackToTargets` 按 `eff.target_type` 路由；`evaluatePassives` 读 `trigger.type` 调度被动。

### 8.2 字段对照表 / Field Mapping (新层级 ↔ 现有系统)

| 新层级 Layer | 新设计字段 | 现有对应（前端 / 后端） | 契合度 Fit |
| --- | --- | --- | --- |
| L0 身份 Identity | `skill_key`（英文·非空）/ `name`（中文展示） | 现有 `id` + 对象键 / `name` | ⚠️ 差：应改名 `skill_key`（强契约 P0-4） |
| L1 主语 Subject | `requires_unmoved` 等 / `ap_cost` | `DetailPanel.ap_cost` 已有；`requires_*` 缺失 UI | ◐ 部分 |
| L2 谓语 Predicate | `action_type`（attack/heal/buff/debuff/passive） | `DetailPanel.action_type` 完全一致 | ✅ 完全契合 |
| L3 宾语 Object | `target_type`（SELF…ALL_UNITS）/ `range`/`aoe` | `EffectStackBuilder.ef.target_type` ✅；但 `DetailPanel.target_scope`（enemy/ally/both…）是**另一套词表** | ◐ 两套并行，需统一 |
| L4 定语 Attribute | `damage_kind` / `attack_stat`（melee/ranged）/ `accuracy_mod` | `effects[].type` 隐含；引擎 `skillExecutor` 已用 `damage_kind`/`attack_stat` | ✅ 引擎已对齐，UI 未显式 |
| L5 状语 Adverbial | `dice_type` / `success_line` / `height_bonus_per_diff` | 引擎 `diceService` 已用；UI 无专门维度 | ◐ 引擎有，UI 缺 |
| L6 补语 Complement | `effects[]`（damage/status/recovery/displacement + `target_type`/`flat_value`/`value`/`duration`）/`post_effects` | `EffectStackBuilder.effects[]` 字段高度重叠；唯缺 `post_effects`(连锁) | ✅ 高度契合，仅缺连锁 |

### 8.3 可整合点（含 4 处真实分歧）/ Integration Points (incl. 4 real divergences)

1. **【分歧 A】靶向词表双轨** — `DetailPanel.target_scope`（enemy/ally/self/both/all，行 57-66）与引擎 `target_type`（SELF/SINGLE_ENEMY…，行 173 + `EffectStackBuilder` 行 188）是两套并行枚举。
   - 整合：保留 `target_scope` 作为「主目标范围」提示（= L3 的施法者意图），但 **per-effect `target_type` 才是 L3 真正的路由依据**（引擎已支持 both/all 按 `target_type` 分头命中）。UI 可在 `DetailPanel` 直接复用 `EffectStackBuilder` 的 `TARGET_TYPES`，消除双轨。

2. **【分歧 B】`trigger` 被后端强制字符串化（真实 Bug）** — `glossary.ts:178-182` 的 `normalizeSkillForSave` 把 `skill.trigger` 强制 `String(...)`，会把前端发来的 `{type, condition}` 对象变成 `"[object Object]"`，**导致 `condition` 阈值与被动调度彻底丢失**。而 `skill.contract.ts` 已把 `trigger` 定义为对象，`combat.ts.evaluatePassives` 也按对象读 `trigger.type`。
   - 整合：删除该字符串化死逻辑，改用 `TriggerContract`（zod）校验后**原样存对象**，`evaluatePassives` 即可消费 `DetailPanel` 已做好的触发条件子块。

3. **【分歧 C】`id` 与 `skill_key` 错位** — 强契约要求 `skill_key`（英文·非空），但存储仍用 `id` + 对象键；`GlossaryHub.vue:200` 保存时 `delete payload.id`。
   - 整合：落库字段统一为 `skill_key`（Phase 33 `EnglishKey`），`DetailPanel` 只读摘要的 `draft.id` 改为 `skill_key`，与 P0-4 根治直接对齐。

4. **【分歧 D】靶场未走真实引擎** — `/test-skill`（`glossary.ts:490-548`）只做 `CASTER.atk + flat - armor` 简化结算，**不验证 L4→L6 与 AOE 分别判断**。
   - 整合：靶场改为调用真实 `executeUniversalSkill`（引擎 `_executeAreaSkill` 已对命中集合逐目标独立结算 `result.targets`），`BattleTestPanel` 即可看到每个目标的独立 `final_damage`，正向验证本方案「分别判断」。

**其余高度契合、可直接复用：**
- `effects[]` 就是 L6 补语的现成载体；`action_type`、`ef.target_type` 与引擎枚举逐字一致。
- 前端读写已统一走存储 A（`/hub-config`），与「单一写入口」原则一致，改造阻力小。

### 8.4 改造建议（按优先级）/ Refactor Proposal (Prioritized)

| 优先级 | 改造项 | 动作 | 影响面 |
| --- | --- | --- | --- |
| P0 | 修 `trigger` 字符串化 Bug | `glossary.ts` 删除 `String(trigger)`，`zod` 校验 `TriggerContract` 后存对象 | 被动技能调度生效 |
| P0 | `id` → `skill_key` | 落库/读取/UI 摘要统一 `skill_key`（EnglishKey 非空） | 强契约 P0-4 落地 |
| P1 | 统一靶向词表 | `DetailPanel.target_scope` 复用 `EffectStackBuilder.TARGET_TYPES`；文档化「target_scope=主目标提示，ef.target_type=路由依据」 | 消除双轨 |
| P1 | 靶场接真实引擎 | `/test-skill` 调 `executeUniversalSkill`，返回 `result.targets` 逐目标伤害 | 验证 L4→L6 分别判断 |
| P2 | `effects[]` 补 `post_effects`(连锁) | `EffectStackBuilder` 增「连锁触发」节点 → 映射到 L6 补语 | 完整 L6 |
| P2 | 废弃存储 B 写路径 | `/config`(POST) 仅留兼容只读，`/hub-config` 成唯一写入口 | 消灭双库脑裂残留 |
| P3 | UI 按 L1→L6 分组重排 | `DetailPanel` 维度按主语/谓语/宾语/定语/状语/补语分区呈现 | 降低认知负担 |

### 8.5 结论：能否融到一起？/ Verdict: Can they fuse?

**可以，且融合度很高（~80% 字段已现成）。** 本方案并非另起炉灶，而是把散落在 `DetailPanel` / `EffectStackBuilder` / `skillExecutor` / `damagePipe` / `routeEffectStackToTargets` 中的真实字段**收编进 L0–L6 命名空间**。真正需要动手的只有 4 处分歧（A 双轨词表、B trigger 字符串化、C id/skill_key、D 靶场假引擎），且均为局部修复，不涉及引擎重写。建议以 P0 两项（trigger 修复 + skill_key 对齐）为切入点，即可让现有词条制作系统「说」本方案的层级语言。
**Yes — fusion is highly feasible (~80% of fields already exist).** The proposal consolidates real fields already present across the UI and engine into the L0–L6 namespace. Only 4 local divergences (A/B/C/D) need fixing, none requiring an engine rewrite. Start with the two P0 items (trigger fix + skill_key alignment) to make the current editor "speak" this hierarchy.
