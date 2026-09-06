⚠️ 【过时文档 · 已归档】
本文档自称「唯一真相源」，但其六段定义 `PhaseEnum = ['WHEN','IF','WHO','ROLL','DO','COST']`（含 `WHO`、缺 `AFTER`）已被 **2026-08-23 拍板的《原子改造方案（A+B）》及其产出《原子记录-20260823》** 取代。
最新权威设计以**工作区根目录** `docs/原子记录-20260823.md` 为准：**六段定稿 = `WHEN→IF→ROLL→DO→AFTER→COST`**，其中 `WHO` 段已删除、降级为 `DO` 段首置前导原子 `B_TARGET`（handlerKey `resolve_target`）。
本文档仅作历史参考，不再作为执行依据。归档时间：2026-09-02

> ⚠️ 归档说明：本文自述的「唯一真相源」「以本文档为准」等声明**已失效**，请勿据此处修改代码。
> 其引用的 `战斗核心与六段式盘点及合并方案报告-2026-08-19.md` 同为 08-19 旧口径。
> 注意：`shared-kernel/src/contracts/phase-tree.contract.ts` 的 `PhaseEnum` 至今仍沿用了本文档的旧值（含 WHO 无 AFTER），属**未同步的历史遗留**，应改而非以此为准。

---

# 六段式数据模型 · 权威定义（合并方案真相源）〔标题已失效〕

> 本文档是「战斗核心 × 六段式」合并方案中六段式数据模型的**唯一真相源**，与
> `战斗核心与六段式盘点及合并方案报告-2026-08-19.md` 第 2.2 节保持同步。
> 遍历器（`_walkPhaseTree`）、归一化（`configLoader`）、可视化编辑器均以本文档为准。
>
> 旧文档 `docs/skill-hierarchy-主谓宾定状补.md` 已被 2026-08-08 拍板的递归六段树模型取代，
> 新功能请勿参考旧文档。

## 1. 六段语义（六个维度各管一件事）

| 段 | 语义 | 类比 |
|---|---|---|
| `WHEN` | 触发事件（根节点相位，也是触发器身份） | 菜谱的"什么时候做" |
| `IF` | 条件守卫（可多分支，分支命中走各自子树） | "如果…" |
| `WHO` | 作用域 / 目标选择 | "对谁做" |
| `ROLL` | 随机性（每层独立掷骰） | "看运气" |
| `DO` | 效果（点名 atom，真正改变状态；为**有序效果列表**，可承载多谓语/多效果组合） | "做什么" |
| `COST` | 代价（AP/资源，仅在 DO 之前位置扣） | "耗什么" |

六段**有序**：`WHEN → IF → WHO → ROLL → DO → COST`，顺序即执行序。
`WHEN` 具双重身份——既是一棵树的「根节点相位」，也是「触发事件」本身，两者同形。
`WHEN` 是**节点级可选闸门**：任何节点都可带 WHEN 作为附加触发条件，而非单独抽出的段。

## 2. 递归结构（单相位节点 + 子树）

- **单相位节点**：一个 `PhaseNode` 只表示六段中的**一段**（`phase:'WHEN'|'IF'|...`），自己不同时持有六个槽位。六个维度靠**一层层节点串联**成树，而非塞进一个节点。
- **子树挂载点**：递归 `children` / `branches[].children` 仅允许挂在 `DO` 与 `IF` 分支上（表达"执行后连锁"与"条件分叉"）；`WHEN/WHO/ROLL/COST` 的值只能是原子/标量，**绝不能是另一棵完整的六段树**（见第 4 节红线）。
- **子树在父段的 `nest` 处就地展开执行**，不是独立孤岛。
- **约束**：整树 `MAX_DEPTH=3`；每层 ≤6 段，每段最多 1 个 `nest` 子树。

```ts
PhaseEnum = ['WHEN','IF','WHO','ROLL','DO','COST']
PHASE_TREE_MAX_DEPTH = 3
PhaseNode   = { phase, atoms: PhaseAtom[], branches: PhaseBranch[], children?: PhaseNode[] }
PhaseBranch = { label, when?, lower?, upper?, effects: PhaseAtom[], children? }
```

## 3. 子树「自相似」且「不必六段齐全」

- **自相似（句式同构）**：用同一套 `WHEN/IF/WHO/ROLL/DO/COST` 句式去描述其中复杂的一段；规则无论多深都用同一套词汇，策划不需学第二种语法。
- **不必齐全**：子树不必从 `WHEN` 起头、不必六段写满，只补上「相对父节点多出来的那层语义」。
- **空值合法**：某段 `atoms:[]` 或整段缺失 = 该维度不参与（如 `ROLL` 为空 = 本次不用掷骰，直接用确定值）。
- **不完整合法**：子树只填关心的格子，不关心的留空或继承上下文。
- **上下文继承**：事件源（`WHEN` 触发事件）、作用域（`WHO`）等从根沿树向下传递，子树无需重复声明。

> 例：根 `WHEN(被攻击)` 下，`IF(攻击者=火系)` 子树只写 IF，`DO(反伤)` 子树只写 DO，
> 更深一层 `DO(对相邻友军+10%)` 还是只写 DO。全树靠上下文继承保持连贯，没有一层是六段写满的。

## 4. 红线：禁止「相位互套坍缩」

若允许「每一段的值都可是任意完整六段树且六段互相等价无限制套娃」，会退化出
`WHEN=when, IF=when, WHO=when, ROLL=when, DO=when, COST=when` 的六同型怪物，
语义无限套娃、引擎无法判定执行序。

**硬约束**：
- 单相位节点：一个节点只属六段之一，禁止"一个节点内六槽位各自嵌套"。
- 子树只能从 `DO` / `IF` 分支挂出，且子树的"根相位"须明确（它是在父上下文里的 IF / DO / ROLL，不是重开一棵无主树）。
- `WHEN/WHO/ROLL/COST` 的值禁止是另一棵六段树（触发器/标量/作用域不应再被规则树包裹）。
- 全局参数（掷骰/范围/AP）集中在配置顶层，禁止在 tree 内硬编码。

## 5. 上下文传递（默认隔离 + 显式 stepFrame 帧传递）

| 来源 | 立场 |
|---|---|
| `67原子引擎...md` 〇.六 | **层间不继承**——子层只读「全局事件上下文」不可变快照，不读父层运算产物。 |
| 用户设计模型 | **上下文继承**——子树应能看到父层 `roll_result` 等产物（否则"父层暴击→子层追加"无法实现）。 |

**选边（merged 方案定调）**：「默认隔离 + 显式 `stepFrame` 帧传递」——
1. **全局事件上下文（triggerCtx）不可变只读快照**：`trigger_event` / `attacker` / `primary_target` / `self` / `trigger_roll` / `trigger_coord` / `trigger_value` / `skill_ref` / `battle_id` / `round`。子层只读不写，永不塞集合。
2. **`stepFrame`（帧局部栈）**：父层产生的临时结果（`roll_result` / `if_passed`）在进子层前 `push`，子层显式声明 `reads:['parent.roll_result']` 才透传，结束 `pop()`。默认不继承（杜绝递归污染），按需继承。
3. `WHEN` 闸门用的触发 payload 走独立 `triggerCtx`，不与 `stepFrame` 混用。

## 6. 执行语义约束

- **层内有序**：同层六段按 `WHEN→IF→WHO→ROLL→DO→COST` 执行；`COST` 段出现在 `DO` 之前的位置才扣费。
- **Pre-flight 预检**：进入 `COST` 段前做合法性预检（射程/目标/AP 足够），不通过则整条 SKIP（不扣费、无副作用）。
- **partial execution 不回滚**：进入 `DO` 后若中段失败，已执行的 atom 不回滚（部分成功即部分生效）。
- **ROLL 跨层独立**：每层 `ROLL` 段各自掷骰、互不影响（不继承父层 roll_result，除非子层显式 `reads` 父帧）。

## 7. 编辑器句式（更高层抽象）

可视化编辑器用三段式 `On<Event>(Args){ if(<Condition>) <Response> }` 表达，是一棵六段树的语法糖：
- `On<Event>` = `WHEN` + `WHO`
- `if(<Condition>)` = `IF`
- `<Response>` = `ROLL`/`DO`/`COST`（复杂 Response 用子树自相似展开）

编辑器所见即六段树，二者同构，无二次翻译损耗。

## 8. 与运行时兜底的接口约定

- 词条 JSON 带 `schema_version:2` + `tree` → 引擎直接走 `_walkPhaseTree`（v2 路径）。
- 词条无 tree → `configLoader.autoPromoteV1ToV2` 运行时升维（复用 `normalizeEntry` 字段口径），保证 v2 路径"通电"；离线迁移脚本（`migrate-to-phase-tree.cjs`）生成的 tree 与其逐字段一致。
- 归一化 `normalizeEffectAtom` 必须与老路径 `effectExecutor.executeSync` 消费的字段结构同构（type 真名重定向由 effectExecutor 内部负责，归一化层不重复重定向）。
