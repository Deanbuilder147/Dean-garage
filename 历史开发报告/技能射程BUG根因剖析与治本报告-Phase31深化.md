# 技能射程 Bug「反复作祟」根因剖析 + 治本改造报告（Phase 31 深化）

- **报告日期**：2026-08-02
- **项目**：mecha-universe-engine（机甲战棋）
- **关联文档**：`历史开发报告/技能射程显示错误BUG排查与修复报告.md`（上一轮"表面修复"记录）
- **状态**：✅ 四陷阱全部剖析清楚，按「三不原则」完成架构级治本并部署验证通过。

---

## 〇、为什么上一轮"修好了"又"卷土重来"？

上一轮（见前报告）只在 `normalizer` / `glossary` 把"无脑兜底 1"改成"按分类兜底 3"，**但没有解决根因**，反而埋下新雷：
- 我又在 `normalizer` / `glossary` / `skillExecutor` / `NewBattleView` 各新建/改写了一份 `DEFAULT_RANGE_BY_CATEGORY`，**四处共存**。
- 我把引擎原本的 `ranged=6` 改成 `3`，但 `combat.ts` / `NewBattleView` 的 `BASIC_RANGED_RANGE` 仍是 `6`——**数值又打架**。
- 数据源仍"写死值"（只是从 1 改成 3），下游兜底仍被废。

这正是本次要根治的"四陷阱"。

---

## 一、四大陷阱根因剖析

### 陷阱 1：数据源头"强行污染"（最致命根因）
- **位置**：`excel-schema-normalizer.ts` 的 `mapSkills` / `glossary.ts` 的 `normalizeSkillForSave`。
- **问题**：技能未填射程时，网关在解析/保存那一刻就把 `cast_range` 硬编码写进 JSON（先是 1，上一轮改成 3）。
- **后果**：下游所有"动态兜底逻辑"（`skillExecutor._getUniversalFields`、`NewBattleView.getSkillRange`）一看 `skill.cast_range` 已有值，直接使用，**永不触发"按 category 取默认"兜底函数**。
- **本质**：数据源污染使"分类默认射程"机制名存实亡。

### 陷阱 2：真相源"四头分化"且数值打架
- **位置**（修复前）：`NewBattleView.vue`、`skillExecutor.cjs`、`excel-schema-normalizer.ts`、`glossary.ts` 各一份 `DEFAULT_RANGE_BY_CATEGORY`。
- **真实打架点**（本轮核实）：`combat.ts` / `NewBattleView.vue` 的 `BASIC_RANGED_RANGE=6`，而技能默认表被我上一轮改成 `3`。即"基础攻击认为是 6，技能默认是 3"。
- **后果**：网关下发显式 `cast_range: 3` 会覆盖前端/引擎期望的 6，模块间口径永远对不上。

### 陷阱 3：老战局 JSON 状态"阴魂不散"
- **位置**：`battleState` 内存/数据库快照。
- **问题**：修复前创建的战局，技能 JSON 已残存 `cast_range:1`。代码上线后，玩家刷新继续玩旧局，读出的仍是旧 `1`。
- **本质**：这是数据问题，代码无法改历史 JSON，只能靠"重开新局"规避（非代码 bug，但给用户"又没修好"的错觉）。

### 陷阱 4：字段名"语义脱节"（type vs category vs typeLabel）
- **位置**：网关读 `type:"远程"/"ranged"`、引擎用 `category:"ranged"`、前端卡片读 `typeLabel:"远程"`。
- **问题**：数据传递中任一环节漏转字段，下游读 `undefined`，无奈落最外层 `?? 1` 兜底。

---

## 二、治本方案：架构级「三不原则」

1. **源头不写死**：网关解析 Excel / 保存 Glossary 时，用户没填射程就保持 `cast_range` 等字段为 `undefined`，交下游动态兜底。
2. **默认值不重写**：`DEFAULT_RANGE_BY_CATEGORY` 从前端/引擎/网关解析器**全部删除**，只在 `shared-kernel` 维护唯一真相源（远程唯一真相值裁定为 **3**）。
3. **前端不独立猜**：`NewBattleView.getSkillRange` 改为调用与 `shared-kernel` 逐字一致的 `hexUtils.getSkillRangeFields` 镜像（因 frontend 未纳入 monorepo workspace 无法 import，以"严格镜像 + 注释约束"等效实现），删除组件内本地默认表。

---

## 三、具体改动清单

### 3.1 `shared-kernel/src/hexMath.ts`（★唯一真相源，新增）
- `DEFAULT_RANGE_BY_CATEGORY = {melee:1, ranged:3, auto:0, automation:0, special:1, support:1}`
- `DEFAULT_MIN_RANGE_BY_CATEGORY`（同结构）
- `resolveSkillCategory(skill)`：统一兼容 `category / type / typeLabel / attack_type[] / action_type[]`（治本陷阱 4）
- `getSkillRangeFields(skill)`：优先级 `cast_range ?? max_range ?? range_max ?? range`（首个非空），未配置按分类兜底；**支持 `"2~5"` 字符串拆分**（修复显式 range 字符串静默失效隐患）
- 同步 `shared-kernel/src/index.ts` 导出上述符号。

### 3.2 `excel-schema-normalizer.ts`（陷阱 1+2+4）
- 删除本地 `DEFAULT_RANGE_BY_CATEGORY` / `DEFAULT_MIN_RANGE_BY_CATEGORY` / `resolveCategoryForMap` / `parseRange`，改 `import { resolveSkillCategory, getSkillRangeFields } from '@mecha/shared-kernel'`。
- `mapSkills` 未配置 range 时返回 `{}`（`cast_range` 等保持 **undefined**），仅标注 `category`（治本陷阱 1）。

### 3.3 `glossary.ts`（陷阱 1+2+4）
- 删除本地 `GLOSSARY_DEFAULT_RANGE_BY_CATEGORY` / `resolveCategoryForGlossary`。
- `normalizeSkillForSave`：`cast_range` 仅做数字清洗，**`null/undefined` 保持不写死**；显式标注 `skill.category = resolveSkillCategory(skill)`。

### 3.4 `skillExecutor.cjs`（陷阱 2+4）→ `hexKey.cjs`
- 删除本地 `DEFAULT_RANGE_BY_CATEGORY`；`hexKey.cjs` 增加 re-export `DEFAULT_RANGE_BY_CATEGORY / DEFAULT_MIN_RANGE_BY_CATEGORY / resolveSkillCategory / getSkillRangeFields`（来自 `@mecha/shared-kernel/hexMath`）。
- `_getUniversalFields` 的 `minRange/maxRange/cast_range` 镜像字段改由 `getSkillRangeFields(cfg)` 计算（cfg 含 `category` 与显式字段，未配置自动按分类兜底 3）。

### 3.5 `combat.ts` / `NewBattleView.vue`（陷阱 2 数值打架）
- `BASIC_RANGED_RANGE` 由 `6` 改为 `3`，与 shared-kernel 真相值严格对齐。

### 3.6 `frontend/src/utils/hexUtils.js`（陷阱 2+3 前端侧）
- 新增与 shared-kernel 逐字一致的 `DEFAULT_RANGE_BY_CATEGORY` / `DEFAULT_MIN_RANGE_BY_CATEGORY` / `resolveSkillCategory` / `getSkillRangeFields` 镜像，醒目注释声明 shared-kernel 为权威、改一处须同步。
- `NewBattleView.vue` 删除本地 `RANGE_DEFAULT_BY_CATEGORY` 与 `resolveSkillCategory` 函数，`getSkillRange` / `getSkillRangeMin` 改调 `hexUtils.getSkillRangeFields`（治本陷阱 2：前端不再有独立默认表）。

### 3.7 部署相关
- `Dockerfile` 维持"本地 tsc → rsync → 容器内 COPY dist"流程（上一轮已修 alpine tsc 失败）。
- shared-kernel 重新 `npm run build`（ESM + CJS 双产物）。

---

## 四、部署与验证（吸取 SSH 断链教训：先确认连通再执行，端到端实测）

- **连通确认**：`ssh ... 'echo CONNECTED; df -h /'` → CONNECTED，磁盘 18G 可用（无 ENOSPC 风险）。
- **构建**：`shared-kernel npm run build` 通过；`gateway npx tsc` 通过（0 error）；前端服务器 `npm run build` 通过（新 bundle `index-BOuJmvzb.js`）。
- **部署**：`docker compose build --no-cache mecha-gateway mecha-frontend` → BUILD_EXIT=0；`up -d --no-deps`（避开 db 孤儿）→ 两容器 Recreated + gateway Healthy。
- **端到端实测**（容器内真调用，非 grep 旧产物）：
  - `shared-kernel.getSkillRangeFields({type:"远程"})` → `{minRange:1,maxRange:3}` ✅
  - `normalizer.mapSkills([{type:"远程"}])` 输出 `cast_range=undefined` / `category=ranged` ✅（陷阱 1 铁证：源头已不写死）
  - 引擎 `_getUniversalFields` 同款逻辑（cast_range=undefined）→ 远程 max=3、自动化 max=0、显式 `range:"2~5"` → max=5/min=2 ✅
  - 前端 bundle `index-BOuJmvzb.js` 在线且含 `ranged:3` 真相值 ✅
  - gateway `/health` → HTTP 200 ✅

---

## 五、遗留事项（给用户）

1. **陷阱 3 需用户配合**：旧战局（如 13:38 那局）JSON 已残存 `cast_range:1`，代码无法改历史数据。请**重开一局新战斗**，新建战局的技能 cast_range 将为 `undefined`，由引擎按分类兜底为 3。
2. **远程真相值裁定为 3**：已与你确认统一为 3（原 Phase 31 设计是 6，本轮改 3 全链路对齐）。若日后想调回 6，只改 `shared-kernel/src/hexMath.ts` 一处 `ranged:3` + 重新 build + 部署即可，无需动其余三处（这正是治本收益）。
3. **前端镜像同步纪律**：`frontend/src/utils/hexUtils.js` 的射程段是 shared-kernel 镜像，改 shared-kernel 后须同步该处（已在注释强制约束）。

---

## 六、根因总结（为何"反复作祟"不再复发）

| 陷阱 | 旧症 | 治本后 |
|---|---|---|
| 1 源头污染 | 数据源写死 cast_range | 未配置保持 undefined，下游兜底生效 |
| 2 真相源分化 | 4 处默认表 + 数值打架 | 仅 shared-kernel 1 处，远程=3 全链路一致 |
| 3 旧局残留 | 旧 JSON cast_range=1 | 代码无法改历史，需重开新局（已告知） |
| 4 字段脱节 | type/category/typeLabel 读 undefined 落 ??1 | resolveSkillCategory 统一兼容所有字段形态 |

**核心结论**：此前"卷土重来"是因为只在数据出口打补丁（把 1 改成 3），未切断"数据源写死值→下游兜底失效"的因果链。本次从架构上执行"源头不写死 + 真相源唯一 + 前端不独立猜"，把"按分类动态兜底"机制真正激活，Bug 循环被切断。
