# ROLL 分段「取代式」改造方案（Phase: RollReplace）

> 日期：2026-08-12
> 目标：将 ROLL 分段块从「叠加式」改为「取代式」——插入分段后，主链 DO/COST 由各分段块内的 DO/COST 取代，而非叠加在主体上。
> 关联：v2 词条树 `_walkPhaseTree`（`services/combat-service/src/services/combatCore/skillExecutor.cjs`）、六段编辑器 `frontend/src/views/GlossaryHubNew.vue`。

---

## 0. 术语定义（用户确认版）

- **子段（Sub-segment）**：作用于一个主六段中的某一段，用整个子段的计算结果/判定结果定义该段产生的值（或主段的判定依据），用以继续完成整个主六段的计算。
  - 代码载体：主链某 lane 的 `lane.nest`（「＋ 子段」按钮产出），或任意段内部的 `_enterChild` 子链。
- **分段（Branch-segment）**：通常复数出现（跟随 roll 字段），根据情况（掷骰点数落入的区间）决定主六段接下来进行什么动作。
  - 代码载体：`ROLL` 段内的 `branches[]`（每个 branch 是一个分段块，内部含完整 `subLanes` 六段子链）。

---

## 1. 现状分析（叠加式，代码证据）

### 1.1 前端数据模型：分段块已能承载独立 DO/COST（就绪）
- `built.branches.push(...)` 注入 `subLanes: LANE_SKELETON.map(...)`（`GlossaryHubNew.vue:803`），即每个分支块自带 WHEN/IF/WHO/ROLL/DO/COST 六段骨架。
- `ensureBranchSubLanes(branch)`（1172 行）懒补齐空分支的六段结构。
- `branchToNode(b)`（1306 行）将 `b.subLanes` 映射为段树 `children`（含 DO/COST 节点，1312-1317 行）。
- 模板 `branch-lanes`（312-338 行）按六段栏渲染，允许在分段块内拖入 DO/COST 原子。
- 序列化：主链 DO 仍投影到 `d.effects`（1392-1396 行），ROLL 分支投影到 `d.roll.segments`（1402-1419 行）；段树完整写 `d.tree`（1387-1388 行）。

**结论**：前端已支持「在 ROLL 分段块里填独立 DO/COST」，数据结构无缺口，无需新增字段。

### 1.2 引擎执行器：叠加式（差距根源）
`_walkPhaseTree`（`skillExecutor.cjs`）按固定顺序遍历（1427 行）：
```
ORDER = ['WHEN','IF','WHO','ROLL','DO','COST']
```
- **ROLL 段**（1477-1491 行）：命中区间分支后 `runAtoms(b.effects)` + `_enterChild(b.children)`（其中 `children` 含分段块的六段子链，会递归执行其 DO/COST），然后 `continue`。
- **DO/COST 段**（1494-1503 行）：**无论 ROLL 是否命中分支，主链 DO/COST 一定 `runAtoms(node.atoms)` 执行**。

→ 结果：分段块的 DO/COST 与主链 DO/COST **同时结算（叠加）**，主链永远执行。这正是用户所说的"插入分段后还要填主字段 DO/COST、且两者都算"的现状。

---

## 2. 目标语义（取代式）

当 `ROLL` 段存在分段（`branches.length > 0`）且**至少一个分支命中**时：
- 主链 DO/COST **不再执行**，完全由命中分支内部的 DO/COST 子链取代。
- 分段块内未填 DO/COST 的段，则该段在分支内为空（无效果），不会回退到主链。

**向后兼容**：`branches.length === 0`（未插分段）→ 仍走主链 DO/COST，行为不变。存量 v1 词条（`_resolveRollSegments` 路径）保持叠加式不动。

---

## 3. 改动点清单

### 3.1 引擎 `skillExecutor.cjs` `_walkPhaseTree`（核心，约 20 行）
- ROLL 段（1477-1491 行）命中分支后，置 `rollBranchHit = true`（声明于循环外）。
- DO/COST 段（1494 行 `if (phase === 'DO' || phase === 'COST')` 或现有 `runAtoms(node.atoms, phase)` 前）增加前置判断：
  ```js
  if ((phase === 'DO' || phase === 'COST') && rollBranchHit) {
      out.log.push(`[段树:${phase}] 被 ROLL 分段取代，跳过主链`);
      continue;
  }
  ```
- 注意：`_enterChild(b.children)` 已递归执行分支六段子链中的 DO/COST，无需额外改动即可结算分支内的主体效果。

### 3.2 前端 `writeLanesToDraft`（可选标记，约 5 行）
- 若需在词条层显式区分模式，可在 `d.roll.segments` 写入时附加 `replace_mode: true`；否则依赖"有 branches 即取代"的默认规则。推荐**不加开关**，用"有 branches 即取代"统一语义，降低复杂度。

### 3.3 靶场日志（验证用，约 5 行）
- 在 GlossaryHub 靶场结算结果中，当 `rollBranchHit` 时追加提示「主 DO/COST 已被分段 X 取代」，便于设计师确认取代生效。

### 3.4 契约/注释（约 10 行）
- `battle.contract.ts` 的 tree 节点注释补一句：「ROLL 段含 branches 时，主链 DO/COST 由命中分支的 DO/COST 取代」。

---

## 4. 待确认决策点（影响文档落地，需用户拍板）

### D1：ROLL 分段「全部未命中」时的兜底
掷骰落入分支区间空隙（如分支只覆盖 1-3、5-6，掷出 4）时：
- **(推荐) 主链 DO/COST 作为兜底执行**：保证"总有主体效果"，避免空结算。
- (备选) 完全不结算（技能本次无效果）。
- 实现差异：`rollBranchHit` 仅在"有命中"时置 true；全未命中保持 false → 主链照跑（即采用推荐项，无需额外代码）。

### D2：取代式是否做成「每词条可切换」
- **(推荐) 统一默认取代式**：只要 ROLL 插了分段即取代，无开关。存量无分段词条不受影响。
- (备选) 增加 `roll.replace_mode = 'replace' | 'additive'` 字段，允许逐词条选择。
- 实现差异：采用推荐项则 3.2 可省略；采用备选项需前端加开关 + 序列化。

---

## 5. 工作量评估

| 模块 | 改动量 | 风险 | 说明 |
|---|---|---|---|
| 引擎 `_walkPhaseTree` | ~20 行 | 低 | 单标志位 + 两处前置判断；不影响无分段词条 |
| 前端 `writeLanesToDraft` | 0~5 行 | 无 | 取决 D2（推荐项可省） |
| 靶场日志提示 | ~5 行 | 无 | 纯展示 |
| 契约注释 | ~10 行 | 无 | 文档化 |
| v1 路径 `_resolveRollSegments` | 0 行 | — | 保持叠加式不动，向后兼容 |
| 回归测试/靶场验证 | 0.5 天 | — | 含 D1 边界用例 |

**总估时：0.5~1 天，低风险。** 核心仅在引擎一处加标志位，前端数据模型已就绪，无需新增字段或重做 UI。

---

## 6. 验证方案

1. **取代生效**：构造 ROLL 分段（如 1-3→伤害 999，4-6→伤害 1），主链 DO 填伤害 100。掷骰=2 → 期望结算伤害 999，日志显示「主 DO 被分段取代」，主链 100 不结算。
2. **兜底（D1 推荐）**：分段 1-3、5-6，掷骰=4 → 主链 100 兜底结算。
3. **无分段兼容**：ROLL 无 branches → 主链 DO 照常，行为不变。
4. **v1 兼容**：存量 `roll.segments` 词条走 `_resolveRollSegments` 仍叠加，不回归。
5. **靶场面板**：前端靶场结果区展示取代提示，设计师可肉眼确认。

---

## 7. 实施顺序建议

1. 锁定 D1/D2 决策（默认即推荐项，可免确认直接实施）。
2. 改 `skillExecutor.cjs` `_walkPhaseTree`（3.1）。
3. 加靶场日志提示（3.3）。
4. 补契约注释（3.4）。
5. 服务器 build + 重建 gateway + 靶场回归（6.1–6.5）。
6. 写 memory 记录改动。
