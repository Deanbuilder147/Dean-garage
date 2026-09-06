# C-待核对：T5（第十章强引用）前置 —— type↔key 桥接厘清稿

> [2026-08-04 T5 落地核销说明]
> 本文档为 T5 开发前夕的核对草案。经落地代码实测验证，以下 2 点与草案有出入，以当前代码为准：
> - 全局词条类型字段为 `category`（英文 `melee`/`ranged`/`auto`），而非 `type`。
> - 单位技能 `type` 维持中文（如"近战"），由 `CATEGORY_TO_CN[s.category]` 在绑定时灌入，`makeUnitSkill` 未做英文归一。
>
> 实际生效契约：
> - 全局 `category` (英文) ➔ 映射为 ➔ 单位 `type` (中文)
> - 全局 `key` (英文) ➔ 映射为 ➔ 单位 `skill_key` (强引用锚点标记；注意：2026-08-04 数据交换审计复核，`combat.ts` 全文无 `skill_key` 消费逻辑，所谓"外键"当前仅作绑定关系标记，并无 `gc.skills[key]` 式回查解引用——详见 `docs/机甲战棋-数据交换遗漏审计-20260804.md` 取舍4)

---

> ⚠️ 草案原文保留如下，其中被上述核销说明推翻的 2 处（第 13 行 `type` 中文本体、第 15 行 switch 归一英文、第 60 行 `type` 英文 key）已用删除线标注，请勿照此实现。

> 用途：T5「SkillsEditor 软关联→强引用」动手前，必须厘清的 3 个桥接决策点。
> 以下事实均来自代码实测，非假设。请逐条核对，确认后我即开始 T5 编码。

---

## 一、现状三方真相（已实测）

| 位置 | 字段语义 | 实测值 |
|------|----------|--------|
| 全局词条 `skillContract` | `key` | **全局唯一标识**（如 `block`/`execute`/`focused_fire`），`name` 为展示名 |
| 全局词条 `skillContract` | `~~type~~` `category` | **~~中文本体类型：~~`近战`/`远程`/`自动化`** 实际为英文本体类型 `melee`/`ranged`/`auto`（非 `type`） |
| 单位技能 `SkillsEditor` 副本 | `name`/`type`/`effect`/`attribute` | **手填独立副本**，无 `skill_key` 字段，不引用全局词条 |
| `makeUnitSkill`（NewUnitEditorView L931） | 输出 `type` | ~~把中文 `type` 经 `switch` 归一为**英文 key**（block/execute/...）供战场索引~~ 直接透传中文 `type`（`s.type||'自动'`），未做英文归一 |
| 战场 `gc.skills[skill.type]`（NewBattleView L829） | 索引 key | 即单位技能 `type`（中文），`resolveSkillCategory` 兼容中英文；非全局 `key` |

**关键结论**：单位技能当前是「独立副本」，与全局词条**没有任何引用关系**。所谓"软关联"风险是指——副本 `name` 是手敲的，若全局词条改名/删除，单位副本不会感知（但也不崩溃，因为是副本）。第十章要做的"强引用"是**新增一条按 `skill_key` 精确绑定的能力**，而非修现有副本。

---

## 二、待核对决策点

### 决策 1：强引用的存储形态（二选一）

- **方案 A（快照副本 + 绑定 key）**：下拉选中全局词条后，把该词条完整字段（name/type/effects/map_cannon/cast_range...）灌入单位技能副本，并记 `skill_key=选中词条key`。日后词条更新时，单位技能需手动「同步」按钮拉最新。
  - 优点：单位技能自给自足，战斗结算零改动；历史旧单位天然兼容。
  - 缺点：词条改了单位不同步（需手动）。

- **方案 B（纯引用 key，运行时回查）**：单位技能只存 `skill_key`，战斗时 `gc.skills[skill_key]` 直接读全局词条。
  - 优点：永远最新。
  - 缺点：需改 `makeUnitSkill`+战斗链路，且旧局 JSON 全失效，回归面大。

**我的推荐：方案 A**（零回归、契合当前副本架构、历史兼容好）。请确认。

### 决策 2：强引用下拉的数据源与展示

- 数据源：`GET /api/combat-glossary/config` 返回的 `skills`（Hub 存储 A 全部词条）。
- 下拉项展示：`key（全局唯一）` + `name（中文名）`，绑定值 = `key`。
- 选中后：`unitSkill.skill_key = key`，并自动填充 `name` + 归一并灌入中文 `type`（经 `CATEGORY_TO_CN[s.category]` 映射）。

确认：下拉是否**覆盖**当前手填内容（选中即灌入），还是**仅记 key** 让用户继续手改？（推荐：选中即灌入 name+type，skill_key 随行）

### 决策 3：历史旧单位技能的回退（软→强补全）

旧单位技能只有 `name`，无 `skill_key`。T5 落地后：
- 编辑旧单位时，按 `name` 模糊/精确匹配全局词条 `name` → 自动补全 `skill_key`。
- 匹配不上：保留原手填副本，`skill_key` 留空（降级为软关联，不报错）。
- 这与第三章"旧单位技能静默置空回退"一致：找不到 key 时**不破坏现有单位**，仅无法享受强引用同步。

确认：回退匹配用「name 精确匹配」即可，还是需「name 包含/拼音」模糊？（推荐：精确匹配 name，失败则留空）

---

## 三、type↔key 桥接最终落点（方案 A 下，按落地核销修正）

```
全局词条.key      ──(下拉选中)──►  unitSkill.skill_key      （强引用外键，英文）
全局词条.name     ──(灌入)──────►  unitSkill.name
全局词条.category ──(CATEGORY_TO_CN 映射)──► unitSkill.type (中文)  ──makeUnitSkill 透传──►  gc.skills[中文type]
```

- `skill_key` = 全局 `key`（强引用锚点）
- `type` 中文 = 战场索引用（由全局 `category` 英文经 `CATEGORY_TO_CN` 映射得来，非 switch 归一）
- 两字段**并存不冲突**：`skill_key` 管「引用谁」，`type` 中文管「战场怎么索引」。

---

## 四、T5 落地清单（确认后执行）

1. `skillContract.js/d.ts` 增 `skill_key?: string` 字段。
2. `SkillsEditor.vue` 每个技能卡增「从全局词条选择」下拉（绑定 `skill_key`），选中即灌 `name`+映射中文 `type`。
3. `NewUnitEditorView.vue` `makeUnitSkill` 透传 `skill_key`。
4. 旧单位加载时按 `name` 精确匹配补全 `skill_key`（匹配不上留空降级）。
5. 前端 build + 重建 `mecha-frontend` 部署。

---

**请回复：决策1/2/3 是否按推荐（方案A / 选中即灌入 / name精确匹配）执行？或指出偏差。**
