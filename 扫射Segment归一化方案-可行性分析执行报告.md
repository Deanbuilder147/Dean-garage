# 扫射「Segment 模型归一化 Branch 旁路」可行性分析执行报告

> 生成日期：2026-08-07
> 评审对象：用户提出的"方案 B —— 增强 Segment 模型模拟 Branch，删掉 dice_branches 旁路"
> 结论：**架构方向正确、长期该做，但"3 个扩展点即可 100% 模拟"的判断不成立——AOE 目标扩展与伤害均摊目前为零能力，需新建而非补丁。可行，但工作量被低估，且引入一处结构性语义冲突（基础攻击与 Segment 是两条独立伤害线）。**

---

## 0. 先对齐事实：当前两套模型的真实代码形态

### A. Branch 模型（`dice.dice_branches[]`）
- 入口：`skillExecutor.cjs` L503-507 —— 若 `uf.dice.has_dice && dice_branches.length>0` 则 `return _executeBranchModelSkill(...)`，直接短路，不进谓语路由。
- 行为：由 `BranchEvaluator`（独立 6 动作词执行引擎）按 `dice_type` 掷骰、命中 `points` 区间分支、独立结算各分支的 damage/heal/status/displacement。
- 关键差异（用户方案想抹平的 3 点）：
  1. **目标范围**：Branch 分支可声明独立 target 集合（含 AOE 区域全体）；
  2. **伤害规则**：Branch 分支自带 `bonus`/`damage` 增量，且 `_executeBranchModelSkill` 的 `finalDamage = base + bonus + heightBonus` 把分支加成**并回主伤害线**（L1140-1147）；
  3. **副作用**：分支内 status 经 `ectx.statuses` 独立挂载（L1162+）。

### B. Segment 模型（`roll.segments[]`）
- 入口：`skillExecutor.cjs` L514 —— 在谓语路由（L516）**之前**调用 `_resolveRollSegments(rollV=dice.roll)`。
- 行为：对每个命中区间，调 `effectExecutor.executeSync(seg.effects, fxCtx)`，**直接对固定 `context.target` 结算**。
- 现状能力（实测）：
  - `direct_damage` handler（`effectExecutor.cjs` L197-225）：只读 `context.target`，**完全不认 `target_scope`**。→ `target_scope: AREA_ENEMY` 现在是**死字段**。
  - `modify_stat` handler：可挂易伤/减移动力（带 duration 即 status）。→ **这部分 Segment 已能模拟**。
  - 伤害增量：Segment 的 `direct_damage` 是**独立扣血线**，不并入 `base_damage` 主公式。→ 与 Branch 的"并回主伤害线"语义不同。

---

## 1. 逐条核验用户方案的 3 个扩展点

### 扩展点 1：效果级目标重定向（Per-Effect Target Override）
- **用户设想**：Segment 的 `effects[]` 声明 `target_scope: AREA_ENEMY`，置入 Segment 时 damage 自动扩为 AOE 全体。
- **代码现实**：❌ 不支持。`handleDirectDamage` 仅 `params.target_unit || context.target`，`context.target` 是谓语传入的单体。AOE 目标解析逻辑**只存在于谓语路由的 attack 分支与 `factionSkillRegistry`**，Segment 路径完全没有"按区域收集单位"的能力。
- **改造量**：需新建 `resolveSegmentTargets(seg, fxCtx)`——复用谓语的 AOE 收集（hex 距离/区域枚举），并把 `target_scope` 翻译成目标集合，再逐目标跑 `handleDirectDamage`。**这是新能力，不是补丁。**

### 扩展点 2：Segment 内嵌伤害修饰规则（split_mode / flat_value）
- **`flat_value: -2`**：⚠️ 部分可行但有语义错配。`effectExecutor` 的 damage 分支把 `flat_value` 当作**绝对值伤害**（`Math.abs(flat_value)`）直接扣血（L92）。用户想表达的是"主伤害 -2 减伤"，但 Segment 现在会把它当成"对单体额外造成 2 点伤害"。**要支持"减伤"须新增 `damage_modifier` 类型（负=减主伤），而非复用 damage 的 flat_value。**
- **`split_mode: 'equal'`（均摊）**：❌ 完全不支持。`damagePipe.cjs` 全文无 `split`/`均摊`/分摊逻辑。需新建：当 Segment 命中且含 `split_mode`，把该 Segment 的伤害在 AOE 目标间均分（含取整、地板/天花板处理）。**纯新增。**
- **改造量**：中等。需扩 `effectExecutor` 的 damage 分支 + 在 Segment 结算管线注入"伤害修饰上下文"，让 damagePipe 能读到当前落入 Segment 的标记。但 damagePipe 当前**不接收 Segment 上下文**——它只在谓语 attack 路径被调用，Segment 走的是 `direct_damage` 旁路，**根本不经过 damagePipe**。→ 意味着"均摊/减伤经过 damagePipe 真实计算"的设想需要重接管线，不是"damagePipe 读标记即可"。

### 扩展点 3：基础动作与条件叠加
- **用户设想**：`base_damage: 10` 照常执行，分支变化全由 `segments[i].effects[]` 增量注入。
- **代码现实**：⚠️ 半成立。谓语 attack 会用 `base_damage` 结算主伤害（L516+），Segment 在其前后追加 `direct_damage`。但两者是**两条独立伤害线**：
  - 谓语线：`finalDamage = base + bonus + heightBonus`（走 damagePipe 真实减伤/地形/防御）。
  - Segment 线：`direct_damage` **绕过 damagePipe**，只做 `raw*(1+pen*0.05)` 简化扣血（L210），**不享受地形/防御/装备减伤**。
  - 所以"基础攻击照常 + 分支增量"成立，但**两条线的减伤规则不一致**——用户方案隐含的"统一结算"并未达到。要让 Segment 伤害也走 damagePipe 真实减伤，需把 Segment 伤害并入谓语线（而非独立 `direct_damage`），这又回到"注入 base_damage 公式"——与当前非 branch 路径的架构相斥。

---

## 2. 方案 B 可行性结论

| 维度 | 用户方案声称 | 代码现实 | 判定 |
|---|---|---|---|
| AOE 目标扩展 | "允许 Segment effects 声明 target_scope" | 引擎完全不读 target_scope | 需**新建**目标解析能力 |
| 伤害均摊 | "damagePipe 读 split_mode 自动均摊" | damagePipe 无 split；Segment 不走 damagePipe | 需**新建**均摊 + 重接管线 |
| 固定减伤 -2 | "flat_value:-2" | flat_value 被当"额外伤害"非减伤 | 需**新增** damage_modifier 类型 |
| 基础攻击+增量 | "base_damage 照常，分支增量注入" | 两条独立伤害线、减伤规则不一致 | 语义近似但**非统一结算** |
| 删 Branch 旁路 | "全量归一 Segment" | Branch 比 Segment 多"并回主伤害线+独立 target 集合" | 删前须先补齐上述能力 |

**结论**：
1. **方向对**：长期应消除两套并列模型，Segment 作为"状语"统一承载分支是更纯粹的架构。
2. **"100% 完美模拟"不成立**：用户列出的 3 点中，AOE 目标扩展与均摊是**零能力**，减伤是**语义错配**——都需要新建代码，不是"补 3 个扩展点"。
3. **被低估的工作量**：真正要做的是 (a) Segment 目标解析器（复用谓语 AOE 收集）、(b) Segment 伤害修饰类型（damage_modifier：-2 减伤 / split 均摊）、(c) 把 Segment 伤害并入谓语 damagePipe 线（或让 direct_damage 也走真实减伤）。这是一次**中等规模的引擎改造**，不是 UI 不动的"后端零改动"。
4. **结构性冲突**：当前非 branch 路径里 Segment 在谓语**之前**结算（L514 先于 L516），且是独立扣血。要让"基础攻击 + 分支增量"在**同一伤害公式**里呈现（如用户 JSON 示例期望的 `base_damage:10` 被 -2 修正成 8），必须重构结算顺序——把 Segment 修饰**注入谓语 attack 的 damagePipe 上下文**，而非在谓语外追加。

---

## 3. 推荐执行路线（若决定做方案 B）

**阶段 1 — 语义对齐（必做，约 2-3 文件）**
- `effectExecutor.cjs`：新增 `handleDamageModifier`（认 `flat_value` 负=减主伤、`split_mode`）；damage 分支区分"真实伤害(direct)"与"修饰(modifier)"。
- `skillExecutor.cjs`：`_resolveRollSegments` 增加 `seg.target_scope` 解析 → 调复用谓语的 AOE 收集函数，把 `fxCtx.target` 替换为目标集合，逐目标结算。
- 新增 Segment→damagePipe 上下文桥接：落 Segment 的修饰标记传入谓语 attack 的 damagePipe（顺序调整为 Segment 修饰在前、谓语结算在后）。

**阶段 2 — 数据迁移（必做）**
- 编写迁移脚本：扫描存储A 所有 `dice.dice_branches` 词条（含老版 sweep），转写为 `roll.segments[].effects[]` 的等价表达（target_scope / damage_modifier / status）。
- **保留 Branch 代码路径作回退**，直至迁移脚本全量验证通过再删 `_executeBranchModelSkill` + `branchEvaluator.cjs`。

**阶段 3 — 验证（必做）**
- 靶场（BattleTestPanel）对照测试：同一 sweep 词条，branch 旧路径 vs segment 新路径，输出 finalDamage / 目标数 / status 必须逐字节一致，才算"归一成功"。

---

## 4. 给用户的决策建议

- **若目标是"架构洁癖、长期可维护"**：方案 B 值得做，但请按本报告阶段 1-3 排期，**不要相信"后端零改动"**。预期工作量：引擎 3 文件 + 迁移脚本 + 靶场回归，约 1-2 天。
- **若目标是"立刻让扫射按骰点切换攻击方式"**：**不要等方案 B**。当前 Branch 模型已完整支持且已接通，直接在 UI（RollPanel）加 `dice_branches` 编辑控件（方案 A 的前端部分）即可当天上线，Branch 代码保持不动。
- **折中（推荐 🌟）**：先上方案 A 的 UI 控件（让扫射立刻可用），并行排期方案 B 的引擎归一。归一完成后，迁移脚本自动把已有 `dice_branches` 词条转 Segment，再删 Branch——既不停业务，又达成架构目标。

---

## 附：本结论所依据的关键代码位置（供复核）

- `skillExecutor.cjs` L503-507：Branch 短路判定；L514：`_resolveRollSegments` 调用点（谓语前）；L1038-1064：`_resolveRollSegments` 实现（只认 lower/upper/label，label 仅战报）；L1066+：`_executeBranchModelSkill`；L1140-1147：Branch 把分支 bonus 并回主伤害线。
- `effectExecutor.cjs` L85-97：type 映射（damage→direct_damage 只认 flat_value 绝对值）；L197-225：`handleDirectDamage` 不认 target_scope；L355+：`handleModifyStat` 可挂 status（Segment 已能模拟易伤/减移动力）。
- `damagePipe.cjs`：全文无 split/均摊逻辑（grep 仅命中 `calculateHexDistance` 无关项）。
- 前端 `RollPanel.vue`：仅暴露 `roll.segments`，无 `dice.dice_branches` 编辑控件。
