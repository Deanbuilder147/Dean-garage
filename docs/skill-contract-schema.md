# 词条 / 技能统一数据契约（Skill Contract Schema）

> 本文档是《Mecha Universe 词条规范与核心解析对齐方案》的契约标准，前后端必须对齐。
> 代码真相源：`mecha-universe-engine/services/combat-service/src/services/combatCore/skillContract.cjs`
> 本规范采用 **渐进式迁移** 策略：旧技能（扁平字段）与新契约（结构化字段）并存，由 `skillContract.cjs` 双向规整。

---

## 1. 标准 JSON 契约（新契约）

```jsonc
{
  "key": "string",                 // 核心检索代号（唯一标识），取代旧 id
  "name": "string",                // 中文展示名，取代旧 label
  "category": "melee | ranged | automation | support",
  "target_scope": "enemy | ally | enemy_equipment | ally_equipment",
  "cast_range": { "min": 0, "max": 0 },   // 也支持纯数值：cast_range: 3
  "skill_shape": "single | fan | linear | concentric",
  "damage_kind": "kinetic | beam | explosive | corrosive | thermal",
  "base_damage": 0,
  "status_effects": [],
  "action_type": "attack | heal | buff | debuff | passive",
  "has_dice": true,               // 是否投骰（顶层，布尔）
  "dice_type": 6,                  // 骰子面数：4/6/8/10/12/20
  "dice_branches": [              // 判定分支数组（可多个并存）
    {
      "points": [2, 5, [1, 4]],   // 生效点数集合：离散点数 number 或 区间 [min,max]，可并存
      "effects": [                // 该判定下挂载的《判定效果》列表（按顺序执行）
        { "action": "damage_bonus", "value": 3 }
      ]
    }
  ]
}
```

---

## 2. 字段语义表

| 字段 | 类型 | 取值 | 说明 |
|---|---|---|---|
| `key` | string | 唯一 | 检索代号；旧 `id` 自动映射 |
| `name` | string | — | 中文名；旧 `label` 映射 |
| `category` | enum | melee/ranged/automation/support | 名称分类 |
| `target_scope` | enum | enemy/ally/enemy_equipment/ally_equipment | 释放对象；取代旧 `target_filter` |
| `cast_range` | 数值或 {min,max} | 数字 | 释放距离；纯数值 N 规整为 {min:0,max:N} |
| `skill_shape` | enum | single/fan/linear/concentric | 技能形状；旧 `range_type`(single/cone/directional_beam/radial) 映射 |
| `damage_kind` | enum | kinetic/beam/explosive/corrosive/thermal | 伤害种类，**配置为唯一真相**（修复 P0-1 漏传） |
| `base_damage` | number | — | 基础伤害 |
| `status_effects` | array | — | 状态效果列表 |
| `action_type` | enum | attack/heal/buff/debuff/passive | 动作大类 |
| `has_dice` | bool | — | 是否投骰（顶层） |
| `dice_type` | number | 4/6/8/10/12/20 | 骰子面数 |
| `dice_branches[]` | array | — | 判定分支数组，可多个并存 |
| `dice_branches[].points` | array | number 或 [min,max] | 生效点数集合：离散点数与区间可并存 |
| `dice_branches[].effects[]` | array | — | 该判定下挂载的《判定效果》列表（按顺序执行） |

---

## 3. 分支动作词表（核心 6 项）

`dice_branches[].effects[].action` 取值与语义：

| action | 语义 | 典型 value 含义 |
|---|---|---|
| `damage` | 直接伤害（覆盖/设定本次伤害） | 伤害点数 |
| `damage_bonus` | 追加伤害（累加器，不覆盖） | 追加点数 |
| `heal` | 治疗（回复 HP） | 回复量 |
| `apply_status` | 施加状态 | 配合 `status` 字段指定状态 key |
| `mobility_mod` | 机动修正（移动力/机动值改动） | 增减量 |
| `accuracy_mod` | 命中修正（命中/闪避率改动） | 增减量（百分点） |

`effect` 结构：`{ "action": "<verb>", "value": <number>, "status"?: "<key>", "target"?: "enemy"|"ally"|"self" }`

---

## 4. 伤害种类术语统一（修复 beam↔energy 错配）

配置真实枚举为 `kinetic / beam / explosive / corrosive / thermal`，**无 `energy`**。
历史代码中 `equipmentDurability` 以 `weaponType === 'energy'` 判定光束涂层，而配置无此键 → 涂层对光束永不触发。

归一规则（`skillContract.cjs#normalizeDamageKind`）：

| 输入（含历史别名） | 归一为 |
|---|---|
| energy / laser / em | beam |
| kinetic / beam / explosive / corrosive / thermal | 原值 |
| 空 / 未知 | kinetic（默认） |

> 任何读取 `damage_kind` 的代码都必须经过 `normalizeDamageKind`，禁止直接使用 `attacker.weaponType` 覆盖配置值（修复 P0-1）。

---

## 5. 兼容映射（旧 ↔ 新）

| 旧字段 | 新字段 |
|---|---|
| `id` | `key` |
| `label` | `name` |
| `target_filter` (enemy/ally/self/all) | `target_scope` (enemy/ally/...) |
| `cast_range` (单数字) + `min_cast_range` | `cast_range{min,max}` |
| `range_type` (single/cone/directional_beam/radial) | `skill_shape` (single/fan/linear/concentric) |
| `dice_type` / `success_line` / `success_bonus`（旧投骰模型） | `has_dice` / `dice_type` / `dice_branches`（新多分支模型） |

旧技能专属字段（`bonus` / `hp_threshold_percent` / `stat_comparison` 等）在过渡期通过展开拷贝保留，供具名 EXECUTORS 继续读取，逐步迁移至 `dice_branches`。

---

## 6. 示例

### 6.1 带「多点数 + 区间」并存的技能（新契约）
```json
{
  "key": "precision_strike",
  "name": "精准打击",
  "category": "ranged",
  "target_scope": "enemy",
  "cast_range": { "min": 1, "max": 3 },
  "skill_shape": "single",
  "damage_kind": "beam",
  "base_damage": 2,
  "action_type": "attack",
  "has_dice": true,
  "dice_type": 6,
  "dice_branches": [
    { "points": [2, 5, [1, 4]], "effects": [ { "action": "damage_bonus", "value": 3 } ] },
    { "points": [[5, 6]], "effects": [ { "action": "damage_bonus", "value": 6 }, { "action": "apply_status", "status": "stun", "target": "enemy" } ] }
  ]
}
```
> 解析：掷出 1/2/3/4 → 命中判定1（追加+3）；掷出 5 → 同时命中判定1(离散5)与判定2([5,6])（追加+3+6并施加 stun）；掷出 6 → 命中判定2（追加+6并施加 stun）。

### 6.2 旧技能零改动兼容（经 normalizeSkill 规整）
```json
{
  "id": "block", "label": "格挡", "category": "melee",
  "target_filter": "self", "cast_range": 0, "damage_kind": "kinetic",
  "base_damage": 0, "action_type": "passive", "reduction": 2, "trigger": "on_attacked"
}
```
→ 规整后：`key="block"`, `name="格挡"`, `target_scope="ally"`, `cast_range={min:0,max:0}`, `skill_shape="single"`, `dice.has_dice=false`，并保留 `reduction` / `trigger` 等旧专属字段。
