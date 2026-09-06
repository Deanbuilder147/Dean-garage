# 让 Segment 模型成为 Branch 模型超集 · 完整模拟执行报告（v2）

> 生成日期：2026-08-07
> 目标（用户原话）：不针对扫射本身，而是**让玩家在 UI 上仅用 Segment 模型，就能完整表达旧 Branch（`dice.dice_branches`）模型的全部行为**，从而可废弃 Branch 旁路、玩家无需理解两套模型。
> 结论：**方向可行，且是正确归宿；但"Segment 补 3 个扩展点即可 100% 模拟"不成立。旧 Branch 共有 6 项能力维度，Segment 现状仅覆盖 2 项，需补齐 4 项（其中 1 项 C 是架构级伤害管线重接）。**

---

## 一、旧 Branch 模型的完整能力清单（代码事实，非推测）

来源：`branchEvaluator.cjs` 全文 + `skillExecutor._executeBranchModelSkill`（L1066-1181）。

| # | 能力 | 代码位置 / 行为 | Segment 现状 |
|---|---|---|---|
| **B1** | 自定义骰面 `dice_type`（如 "2d6"、非固定 6 面） | L1067 `rollDice(uf.dice.dice_type)` | ⚠️ 部分：Segment 用 `generator.faces`，需确认 UI 是否放开非 6 面 |
| **B2** | 离散/区间点数 `points`（number / [min,max] / {kind:range\|exact}） | L23-46 `pointMatches`/`branchMatches` | ❌ 缺：Segment 仅 `lower/upper` 闭区间，不支持离散单点（如"奇数命中"） |
| **B3** | **多分支可同时命中**（任一 points 命中即收集，叠加结算） | L43-46 `points.some` + L55-64 全量收集 | ❌ 缺：Segment 区间语义下多分支同中需靠"重叠区间"，无法表达离散点在两个分支同时命中 |
| **B4** | 6 动作词：`damage`(设定覆盖) / `damage_bonus`(累加) / `heal` / `apply_status` / `mobility_mod` / `accuracy_mod` | L87-122 `applyBranchEffects` | ⚠️ 近似：effectExecutor 有 damage/heal/modefy_stat，但 `damage` 的"覆盖 vs 累加"语义未区分；`accuracy/mobility` 修正回写 context 的机制 Segment 未走 |
| **B5** | **未命中即全失效**（hits=0 → 整技能 0 伤害 + 完整 formula 明细展示） | L1126-1138 | ❌ 缺：Segment 模型若掷骰未落任何区间，技能照常按谓语结算（无"赌一把全失效"语义） |
| **B6** | bonus **并回主伤害线**走统一公式 `final=base+bonus+height`（经真实减伤上下文） | L1140-1147 | ❌ 缺：Segment 走 `direct_damage` **旁路**，不进 damagePipe，不受地形/防御/装备真实减伤 |

> 你原方案列出的 3 点（AOE 目标扩展 / 伤害均摊 / 减伤）对应 B6 的子集 + D/E，但漏了 **B2 离散点、B3 多分支同中、B5 全失效、B4 覆盖/累加语义、B1 骰面** 这 5 个维度。要"完整模拟"必须把这 6 项全补齐。

---

## 二、Segment 要成为 Branch 超集：必须补齐的 6 项能力

| 编号 | 能力 | 改造点 | 层级 |
|---|---|---|---|
| A | 离散/精确点数匹配 | `segment` 新增 `points`（number/数组/区间），`_resolveRollSegments` 复用 `branchEvaluator.pointMatches` | 引擎·小 |
| B | 多分支同中 | 由 A 自然解决（Segments 可声明离散点集合，多 segment 同时命中叠加） | 引擎·小（随 A） |
| C | **伤害并回主伤害线 + 真实减伤** | 把 Segment 的 damage/bonus 修饰注入谓语 attack 的 `damagePipe` 上下文，而非独立 `direct_damage` 旁路 | **引擎·架构级（最大改造）** |
| D | AOE 目标重定向 | Segment effects 声明 `target_scope: AREA_ENEMY/ALL_UNITS`，新增 `resolveSegmentTargets` 复用谓语 AOE 收集 | 引擎·中 |
| E | 伤害均摊 `split_mode` | `damagePipe` 新增分摊逻辑；Segment 命中时读取标记 | 引擎·中 |
| F | damage 覆盖 vs 累加语义 | Segment effect 新增 `damage_mode: 'override'\|'bonus'`；accuracy/mobility 修正回写 context | 引擎·小 |

> 注：**C 是真正的难点**。当前非 branch 路径里 `_resolveRollSegments`（L514）在谓语路由（L516）**之前**调用，且走 `direct_damage` 独立扣血。要让 Segment 伤害"享受真实减伤并与 base_damage 同公式"，必须改为：Segment 修饰先收集成"伤害上下文"，在谓语 attack 结算时注入 `damagePipe`。这属于结算顺序重构。

---

## 三、落地路线（推荐：Segment 超集，Branch 标记 deprecated 保留作回退）

### 阶段 0：UI 形态设计（玩家视角）
RollPanel 只需**一个模型**面板，字段涵盖 Branch 全部表达力：
- 掷骰：`generator.method=dice` / `faces`（放开非 6 面 → 满足 B1）
- 分支列表（即 segments），每条：
  - 匹配：`lower/upper`（区间）**+** 可选 `points`（离散点，满足 B2/B3）
  - 标签 `label`（仅战报）
  - 内嵌 effects（复用现有 EffectStackBuilder，扩展以下字段）：
    - `target_scope`（单体/AREA_ENEMY/ALL_UNITS → D）
    - `damage_mode: override|bonus`（→ F）
    - `split_mode: equal`（→ E）
    - 现有 damage/heal/modify_stat（易伤/减移动力/命中修正 → B4）
- 新增开关 `roll.all_or_nothing`（掷骰未落任何 segment → 技能全失效，满足 B5）

> 这样玩家**永远只面对一个 Segment 面板**，旧 Branch 的"赌一把/多分支/自定义骰面/AOE/均摊"全都能配出来。

### 阶段 1：引擎补齐（C 为核心）
1. `skillExecutor`：`_resolveRollSegments` 改调用 `branchEvaluator.pointMatches(seg, roll)` 支持 points（A/B）；新增 `roll.all_or_nothing` 处理（B5）。
2. 新增 `resolveSegmentTargets(seg, fxCtx)`（D）：复用谓语 AOE 收集（hex 距离/区域枚举），把 fxCtx.target 替换为目标集合。
3. `effectExecutor`：damage 分支区分 `damage_mode`（F）；新增 `handleDamageModifier` 处理 `split_mode`（E）。
4. **C（架构级）**：把 Segment 的 damage/bonus 修饰收集为 `segDamageCtx`，在谓语 attack 的 `damagePipe` 调用前注入（而非独立 `direct_damage`）。顺序改为：先收集 Segment 修饰 → 谓语 attack 主结算（含 Segment 修饰 + 真实减伤）→ 再结算 Segment 的非伤害 effects（status/heal/位移）。
5. `damagePipe`：新增 `split_mode: 'equal'` 分摊（E）。

### 阶段 2：数据迁移 + 回退保障
- 迁移脚本：扫描存储A 所有 `dice.dice_branches` 词条，转写为 `roll.segments[].effects[]` 等价表达（points / target_scope / damage_mode / split_mode / status）。
- **保留 `_executeBranchModelSkill` + `branchEvaluator.cjs` 作为 deprecated 回退**，直至靶场回归全绿再删。

### 阶段 3：靶场回归（验收标准）
- 同一词条，旧 Branch 路径 vs 新 Segment 路径，输出 `finalDamage / 命中目标数 / status_effects / formula` 必须**逐字节一致**，才算"超集模拟成功"。

---

## 四、工作量与风险

| 项 | 量级 | 风险 |
|---|---|---|
| A/B（points 匹配） | 0.5 天 | 低 |
| D（AOE 重定向） | 0.5 天 | 中（需复用谓语 AOE 收集，接口要对齐） |
| E（均摊） | 0.5 天 | 中（取整/地板处理） |
| F（覆盖/累加语义 + 修正回写） | 0.5 天 | 低 |
| **C（伤害管线重接）** | **1-1.5 天** | **高（结算顺序重构，易影响现有所有攻击词条，须全量回归）** |
| 迁移脚本 + 靶场回归 | 0.5-1 天 | 中 |
| **合计** | **约 3.5-4.5 天** | — |

> 对比：你原方案声称"后端零改动"——实际是 **C 这一项就已是架构级后端改造**，其余 5 项也需改引擎。所以"后端零改动"不成立；但"前端 RollPanel 不用大改（继续用 segments 数组 + 少量字段扩展）"基本成立。

---

## 五、决策建议

1. **方向正确**：Segment 归一、废弃 Branch 旁路，是更纯粹的"主谓宾定状补"架构，长期必做。
2. **不要低估 C**：C 是真正的工作量大头与风险点——它让 Segment 伤害"享受真实减伤并与基础伤害同公式"，这是 Branch 目前独有、Segment 现状完全没有的能力。
3. **分阶段上线**：先交付 A/B/D/E/F（让玩家能配出 Branch 的"外观行为"，除真实减伤一致性外），C 单独排期并在全量回归后合入。C 合入前，Segment 伤害走 direct_damage 旁路（与现在一致），不影响现有词条。
4. **兼容过渡**：迁移完成 + 靶场全绿前，Branch 代码保留不删，避免回归事故。

---

## 附：关键代码位置（供复核）
- `branchEvaluator.cjs` L18-46：掷骰/pointMatches/branchMatches（B1/B2/B3 真相源）；L87-122：6 动作词（B4）；L52-65：多分支同中收集（B3）。
- `skillExecutor.cjs` L503-507：Branch 短路判定；L514：`_resolveRollSegments` 调用点（谓语前）；L1038-1064：`_resolveRollSegments`（仅 lower/upper/label，label 仅战报）；L1066-1181：`_executeBranchModelSkill`（B5 全失效 L1126、B6 并回主线 L1140、B4 status/修正回写 L1167-1177）。
- `effectExecutor.cjs` L85-97：type 映射（damage→direct_damage 只认 flat_value 绝对值）；L197-225：handleDirectDamage 不认 target_scope（D 缺口）；L355+：handleModifyStat 可挂 status（B4 部分已支持）。
- `damagePipe.cjs`：全文无 split/均摊（E 缺口）；仅谓语 attack 路径调用（C 缺口根因）。
- 前端 `RollPanel.vue`：仅暴露 `roll.segments`，无 `dice_branches` 控件，无 points/allo_or_nothing/target_scope/split_mode 字段。
