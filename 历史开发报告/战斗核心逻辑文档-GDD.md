# 机甲战棋 — 战斗核心逻辑文档 (GDD)

> **版本**: v1.0  
> **日期**: 2026-06-10  
> **状态**: 基于 combat-service 现有代码，反映当前实现  
> **覆盖范围**: 单位 A 攻击单位 B 的完整计算链路

---

## 一、设计哲学

### 1.1 核心原则

- **透明度**: 玩家应能理解伤害为何是某个数值，每一步计算都可追溯
- **决策深度**: 机动差、武器、地形、防具、词条各自提供独立决策维度
- **可扩展性**: 钩子链架构允许任意新词条在任意阶段插入，不影响已有逻辑
- **骰子驱动**: 不确定性的可控引入，创造高光时刻而非纯赌博

### 1.2 伤害类型分类

| 类型 | 英文标识 | 使用属性 | 射程约束 | 典型案例 |
|------|----------|----------|----------|----------|
| 近战 | `melee` | 格斗 | 相邻格（距离=1） | 光剑、链锯 |
| 远程 | `ranged` | 射击 | 武器射程内 | 光束步枪、导弹 |

---

## 二、单位属性体系

### 2.1 基础四维

| 属性 | 字段名 | 说明 | 典型范围 |
|------|--------|------|----------|
| 格斗 | `格斗` | 近战攻击力 | 0–40 |
| 射击 | `射击` | 远程攻击力 | 0–40 |
| 机动 | `机动` | 影响先攻/命中修正 | 3–10 |
| 防御 | `防御` | 基础减伤（仅旧版公式） | 0–10 |

### 2.2 战斗运行时状态

在 `CombatIntegrator` 中，每个单位除了原始属性外，还有运行时状态：

```javascript
unitState = {
    hp: number,           // 当前血量
    buffs: [],            // 激活中的临时增益
    equipment: {},         // 装备快照
    tags: [],             // 装备的词条列表
    extraTurns: 0,        // 额外回合剩余数
    canAct: true,         // 本回合是否可行动
    isDead: false,        // 是否已阵亡
    stealth: false,       // 是否隐身（马克西翁）
    stealthData: null     // 隐身详细数据
}
```

### 2.3 装备位

| 槽位 | 字段前缀 | 类型 | 影响 |
|------|----------|------|------|
| 左手 | `left_hand_*` | weapon / armor | 武器攻击力 / 防具防御力 + 耐久 |
| 右手 | `right_hand_*` | weapon / armor | 同上 |
| 背包/载具 | `backpack_*` | consumable / vehicle | 特殊效果 |

---

## 三、A 攻击 B — 完整计算流水线

下图展示从「A 下达攻击指令」到「B 扣血 + 后续效果触发」的完整过程：

```
A 选择目标 B + 攻击类型（近战/远程）
    │
    ▼
┌──────────────────────────────────────────────────┐
│  [钩子阶段 1]  pre_attack — 攻击前词条触发       │
│  决斗(duel)、专注射击(focused_shot)、奇袭(stealth_ambush)
└──────────────────┬───────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────┐
│  [钩子阶段 2]  pre_damage — 伤害计算前词条触发   │
└──────────────────┬───────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────┐
│  [步骤 1]  计算基础攻击力                         │
│  baseAttack = 攻击方.格斗 (近战) 或 .射击 (远程)  │
└──────────────────┬───────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────┐
│  [步骤 2]  计算机动差修正                         │
│  mobilityDiff = 攻击方机动 - 防御方机动            │
│  tempAttack = baseAttack + mobilityDiff           │
└──────────────────┬───────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────┐
│  [步骤 3]  计算武器加成                           │
│  weaponBonus = 左手武器加成 + 右手武器加成         │
│  tempAttack += weaponBonus                        │
└──────────────────┬───────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────┐
│  [步骤 4]  计算 Buff 加成                         │
│  attackBuff = 攻击方.attack_buff (如有)           │
│  tempAttack += attackBuff                         │
└──────────────────┬───────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────┐
│  [步骤 5]  暴击判定                               │
│  掷 d10，结果 ≥ 9 → 暴击，tempAttack × 1.5       │
└──────────────────┬───────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────┐
│  [步骤 6]  计算基础伤害 (rawDamage)               │
│  rawDamage = max(0, floor(tempAttack))            │
└──────────────────┬───────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────┐
│  [钩子阶段 3]  on_damage — 伤害计算中词条触发     │
│  可在此阶段修改 context.damage 的值               │
└──────────────────┬───────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────┐
│  [步骤 7]  计算防御减伤                           │
│  defenseReduction = 防具减伤 + 地形减伤 + 防御Buff │
│  finalDamage = max(0, rawDamage - defenseReduction)│
└──────────────────┬───────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────┐
│  [步骤 8]  应用伤害 — 目标HP扣减                    │
│  targetState.hp -= finalDamage                     │
│  防具耐久度消耗 (consumeArmorDurability)           │
└──────────────────┬───────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────┐
│  [钩子阶段 4]  post_damage — 伤害结算后词条触发   │
│  斩杀(execute)、抢夺(plunder)                      │
└──────────────────┬───────────────────────────────┘
                   │
          ┌────────┴────────┐
          ▼                 ▼
    目标HP ≤ 0          目标HP > 0
          │                 │
          ▼                 │
┌─────────────────┐         │
│ [钩子阶段 5]     │         │
│ on_kill — 击杀   │         │
│ on_death — 死亡  │         │
└────────┬────────┘         │
         │                  │
         ▼                  ▼
  ┌──────────────────────────────────────┐
  │  [钩子阶段 6]  on_damage_taken       │
  │  抗性(resistance)、受到伤害时         │
  └──────────────────┬───────────────────┘
                     │
                     ▼
  ┌──────────────────────────────────────┐
  │  [钩子阶段 7]  post_attack           │
  │  攻击后词条触发（暴露 steath_break）  │
  └──────────────────────────────────────┘
```

---

## 四、伤害计算公式详解

### 4.1 完整公式

```
最终伤害 = max(0, rawDamage - defenseReduction)

其中:
rawDamage = floor(
    baseAttack
  + mobilityDiff
  + weaponBonus
  + attackBuff
) × criticalMultiplier

baseAttack     = 近战: unit.格斗 | 远程: unit.射击
mobilityDiff   = attackerMobility - targetMobility
weaponBonus    = 左手武器对应类型加成 + 右手武器对应类型加成
attackBuff     = unit.attack_buff (临时增益，通常由阵营技能提供)
criticalMultiplier = 1.5 (暴击时), 1.0 (非暴击)

defenseReduction = armorDefense + terrainReduction + defenseBuff
armorDefense   = 左手防具防御值 + 右手防具防御值
terrainReduction = 山地: 3, 建筑: 2, 月面: 0
defenseBuff    = unit.defense_buff (临时增益)
```

### 4.2 机动详解

机动同时影响两个维度：

1. **伤害修正**: `attackerMobility - targetMobility` 直接加减到 tempAttack
2. **移动范围**: 机动值决定每回合可移动的最大格数

设计意图: 高机动单位不仅是腿长，也在攻击时更具优势——可以通过走位获得「侧翼」/「背刺」效果的数据模拟。

### 4.3 暴击判定

- 前提: 攻击方具有 `has_critical_chance` 属性
- 掷 d10，结果 ≥ 9 触发暴击
- 暴击倍率: **1.5x** (作用于 rawDamage，防御减伤前)
- [PLACEHOLDER] 阈值 9 待 playtest 验证 — 目标暴击率约 20%

---

## 五、词条钩子系统

### 5.1 架构

```
CombatIntegrator.executeAttack()
    │
    ├── triggerPhase('pre_attack', context)
    │       │
    │       └── hookChain.executePhase('pre_attack', context)
    │               │
    │               └── tagRegistry.getTagsForPhase('pre_attack')
    │                       │
    │                       └── [duel, focused_shot]
    │                               │
    │                               ├── checkConditions(tag, context)
    │                               │       └── ConditionEvaluator.evaluate()
    │                               └── executeEffects(tag, context)
    │                                       └── EffectExecutor.execute()
    │
    ├── triggerPhase('pre_damage', ...)
    ├── damagePipe.calculate(...)           ← 伤害计算
    ├── triggerPhase('on_damage', ...)
    ├── triggerPhase('post_damage', ...)
    ├── triggerPhase('on_kill', ...)        ← 条件触发
    ├── triggerPhase('on_death', ...)       ← 条件触发
    ├── triggerPhase('on_damage_taken', ...)
    └── triggerPhase('post_attack', ...)
```

### 5.2 词条触发阶段与优先级

| 触发阶段 | 钩子名称 | 词条 | 优先级 | 效果概述 |
|----------|----------|------|--------|----------|
| 轮次开始 | `round_start` | 空投 (airdrop) | 5 | DM 掷骰生成武器/防具 |
| 回合开始 | `turn_start` | 幸运 (luck) | 80 | 掷骰获得额外行动 |
| 攻击前 | `pre_attack` | 决斗 (duel) | 10 | 双方掷骰比大小 |
| 攻击前 | `pre_attack` | 专注射击 (focused_shot) | 40 | 放弃移动，掷骰+3~+5伤害 |
| 伤害结算后 | `post_damage` | 斩杀 (execute) | 60 | 近战后目标HP<5时掷骰斩杀 |
| 伤害结算后 | `post_damage` | 抢夺 (plunder) | 50 | 伤害>目标武器攻击时掷骰抢夺 |
| 击杀时 | `on_kill` | 再动 (reattack) | 90 | 击杀后获得额外完整回合 |
| 友军被攻击 | `on_ally_attacked` | 援助 (assist) | 70 | 选择拦截分担伤害或反击 |
| 受到伤害时 | `on_damage_taken` | 抗性 (resistance) | 30 | 抗性匹配的防具减伤-2 |
| 移动判定 | `movement_check` | 联防 (formation_defense) | 95 | 3同阵营单位横向排列阻挡穿越 |

### 5.3 奇袭/隐身系统 (马克西翁专属)

| 触发阶段 | 词条 | 优先级 | 效果 |
|----------|------|--------|------|
| 回合开始 | 战术隐蔽 (stealth_initiate) | 70 | 进入隐身，攻击/移动后暴露 |
| 攻击前 | 奇袭 (stealth_ambush) | 80 | 隐身攻击伤害×1.5 + 掷骰加成 |
| 被攻击时 | 伪装 (stealth_camouflage) | 60 | 隐身时掷d6≥3闪避攻击 |
| 攻击后 | 暴露 (stealth_break) | 50 | 攻击后退出隐身 |
| 移动后 | 暴露-移动 (stealth_break_move) | 50 | 移动后退出隐身 |

### 5.4 词条触发机制

每个词条在对应钩子阶段执行时，经历以下流程：

```
1. 条件检查 — ConditionEvaluator.evaluate(tag.conditions, context)
   ├── required: AND 条件组 — 全部满足才通过
   ├── any: OR 条件组 — 任一满足即通过
   └── not: 取反

2. 可选确认 — 若 tag.params.optional === true
   └── 等待用户确认 (需要UI交互)

3. 效果执行 — EffectExecutor.execute(tag.effects, context)
   └── 按 effects 数组顺序逐一执行

4. 中断处理 — 若 tag.params.interrupt === true 且执行成功
   └── 停止当前钩子链后续词条的执行
```

---

## 六、每一阶段的计算细节

### 6.1 pre_attack 阶段

**触发时机**: 伤害计算前，所有条件检查通过后才进入伤害管道。

**决斗 (duel) — 优先级 10, 中断型**

```
条件: 双方互相在射程内 AND 攻击方HP < 目标最大攻击值 AND 目标HP < 攻击方最大攻击值

效果:
  attackerRoll = d6
  defenderRoll = d6
  winner = 掷骰高者
  
  攻击方胜 → 正常继续攻击
  防御方胜 → 攻击方被反杀，目标毫发无伤
  平手   → 双方同归于尽

注意: 决斗是中断型词条 (interrupt: true)，触发后直接中断攻击流水线
```

**专注射击 (focused_shot) — 优先级 40, 可选型**

```
条件: attackType === 'ranged' AND 本回合未执行移动

效果:
  roll = d6
  roll 1-4 → +3 伤害
  roll 5-6 → +5 伤害

限制: 选择后放弃本回合移动权
```

### 6.2 伤害计算 (damagePipe.calculate)

见第四节完整公式。每一步都有详细的 steps 记录用于调试和战斗日志展示。

### 6.3 on_damage 阶段

**触发时机**: 基础伤害计算完成后、防御减伤前。

**特殊机制**: 词条可以在此阶段直接修改 `context.damage` 的值，影响后续计算。

### 6.4 post_damage 阶段

**触发时机**: 伤害已应用、防御减伤已扣除、HP已扣减后。

**斩杀 (execute) — 优先级 60**

```
条件: attackType === 'melee' AND targetHp < 5

效果:
  roll = d6
  若 roll >= targetHp → 目标立即死亡 (HP归零)
  若 roll <  targetHp → 无效果

注意: 斩杀判定在 DamagePipe.calculate 内部和钩子链中均有实现
```

**抢夺 (plunder) — 优先级 50, 可选型**

```
条件: 造成的伤害 > 目标武器攻击值 AND 目标持有武器

效果:
  roll = d6
  roll 1-3 → 失败
  roll 4-6 → 成功，获得目标武器，目标武器攻击-10
```

### 6.5 on_kill 阶段

**触发时机**: 目标 HP ≤ 0 时。

**再动 (reattack) — 优先级 90**

```
条件: 被杀目标是敌方单位 AND 本回合尚未获得额外回合

效果:
  attackerState.extraTurns += 1  → 攻击方获得1次额外完整回合

限制: 每回合最多触发 1 次
```

### 6.6 on_damage_taken 阶段

**触发时机**: 伤害应用后（无论目标是否死亡）。

**抗性 (resistance) — 优先级 30**

```
条件: 目标持有防具 AND 防具抗性类型 === 攻击伤害类型

防具抗性类型:
  kinetic → 抵抗近战/物理伤害
  energy  → 抵抗远程/能量伤害

效果:
  damage -= 2  (防具减伤前额外扣除)
```

---

## 七、阵营技能体系

### 7.1 地球联合 — 火力覆盖

- **效果**: 选择战场上一格为圆心，半径 2 格内所有单位 -15 HP
- **地形修正**: 山地单位额外 -5 减伤（仅承受 10 HP）
- **限制**: 每场战斗仅 1 次
- **实现文件**: `combatResolver.js` → `resolveEarthArtillery()`

### 7.2 拜隆 — 增援 + 月面回复

**增援:**
- 拜隆单位被攻击时，2 格内的友方拜隆单位可分担 50% 伤害
- 实现文件: `combatResolver.js` → `resolveSupport()`

**月面回复:**
- 处于月面地形的拜隆单位每回合回复 4 HP
- 实现文件: `turnManager.js` → `applyTurnStartEffects()`

### 7.3 马克西翁 — 迷雾 + 隐匿

**迷雾系统:**
```
roll = d6
1-2 → 全场马克西翁单位 +2 防御 (持续2回合)
3-4 → 全场马克西翁单位 +1 机动 (持续2回合)
5-6 → 全场马克西翁单位 +1 攻击 (持续2回合)
```

**隐匿 (奇袭系统):**
- 回合开始自动进入隐身状态
- 隐身中攻击获得 1.5x 伤害加成
- 隐身中被攻击有 50% 概率闪避 (d6 ≥ 3)
- 攻击或移动后自动退出隐身

---

## 八、防具系统

### 8.1 防具属性

| 属性 | 字段 | 说明 |
|------|------|------|
| 防御值 | `left_hand_defense` / `right_hand_defense` | 直接减少伤害 |
| 耐久度 | `left_hand_durability` / `right_hand_durability` | 被攻击消耗，归零后销毁 |
| 抗性类型 | `left_hand_resistance` / `right_hand_resistance` | kinetic 或 energy |

### 8.2 防具磨损

每次防具参与了伤害减免，其耐久度 -1。耐久度归零后，该槽位防具被摧毁，后续不再提供防护。

---

## 九、Buff 系统

### 9.1 Buff 类型

| 类型 | 键 | 效果 | 来源 |
|------|-----|------|------|
| 攻击 Buff | `attack_buff` | 临时攻击加成 | 阵营技能、词条效果 |
| 防御 Buff | `defense_buff` | 临时防御加成 | 阵营技能、词条效果 |
| 机动 Buff | `mobility_buff` | 临时机动加成 | 阵营技能、词条效果 |

### 9.2 Buff 生命周期

```
应用(apply) → 每回合递减(tick) → 归零后移除(expire)
```

每回合开始时 `turnManager.processBuffTicks()` 遍历所有存活的单位的 Buff，持续时间 -1。归零的 Buff 自动移除。

---

## 十、边界情况与异常处理

| 场景 | 处理方式 |
|------|----------|
| 目标已在攻击前死亡 | `combatIntegrator` 在 `executeAttack` 前应检查 `targetState.isDead` |
| 攻击方在攻击前死亡 | 攻击方不应出现在回合顺序中 |
| 武器加成 = 0 (双手空空) | `getWeaponBonus` 返回 `{bonus: 0, sources: []}` |
| 机动差为负数 | 直接扣减 tempAttack，最低 0 |
| 防具耐久归零 | `consumeArmorDurability` 将装备类型设为 null |
| 多词条同时触发 | 按优先级排序执行，高优先级优先 |
| 中断型词条触发 | `interrupt: true` 后停止当前钩子链的后续执行 |
| 可选型词条 | 等待用户确认，未确认视为不触发 |
| 暴击 + 奇袭叠加 | 暴击先乘 1.5，奇袭在 pre_attack 钩子中另行计算 |
| 目标 HP 归零后仍有词条 | `on_death` 和 `on_kill` 仍会触发 |
| 空投到已有单位的位置 | 触发 `trigger_if_occupied` → 该单位触发幸运判定 |

---

## 十一、调优参数汇总

以下参数标为 `[PLACEHOLDER]`，需在 playtest 中验证：

| 参数 | 当前值 | 调节方向 | 影响 |
|------|--------|----------|------|
| 暴击阈值 (d10) | 9 (20%) | ↓ 增加暴击率 | 战斗刺激性 |
| 暴击倍率 | 1.5x | ↑ 增加暴击价值 | 暴击投入产出比 |
| 斩杀阈值 (目标HP) | < 5 | ↑ 扩大斩杀范围 | 近战单位价值 |
| 斩杀骰面 | d6 | ↓ 更容易斩杀 | 同上 |
| 抢夺成功阈值 (d6) | > 3 | ↓ 更容易抢夺 | 抢夺词条吸引力 |
| 专注射击伤害 | 3/5 (d6) | ↑ 增加远程上限 | 远程单位价值 |
| 抗性减伤 | 2 | ↑ 增强防具 | 防具装备价值 |
| 地形减伤 (山地) | 3 | ↑ 增加地形价值 | 位置策略深度 |
| 地形减伤 (建筑) | 2 | ↑ 同上 | 同上 |
| 防火力覆盖伤害 | 15 | ↑ 增加清场能力 | 地联强度 |
| 月面回复量 | 4 HP | ↑ 增加续航 | 拜隆持久力 |

---

## 十二、战斗日志格式

每次攻击产生如下结构的战斗日志：

```javascript
{
    attacker_id: "unit_001",
    attacker_name: "重装机甲-A1",
    target_id: "unit_004",
    target_name: "隐形机甲-M3",
    attack_type: "melee",
    steps: [
        { phase: "base_attack", value: 25, note: "格斗属性" },
        { phase: "mobility_diff", value: +2, note: "攻击方机动(6) - 防御方机动(4)" },
        { phase: "weapon_bonus", value: 8, sources: [...], note: "武器加成" },
        { phase: "attack_buff", value: 0, note: "攻击Buff: +0" },
        { phase: "raw_damage", value: 35, note: "基础伤害" },
        { phase: "defense_reduction", value: 5, sources: [...], note: "防御减伤" },
        { phase: "final_damage", value: 30, formula: "35 - 5 = 30", note: "最终伤害" },
        { phase: "durability_consumed", consumed: [...], note: "防具耐久度消耗" }
    ],
    final_damage: 30,
    target_hp_before: 45,
    target_hp_after: 15,
    modifiers: {
        mobility: 2,
        weapon: 8,
        attack_buff: 0,
        defense_reduction: 5,
        critical: false
    },
    // 如果有词条触发，追加:
    postDamageEffects: { ... }
}
```

---

## 十三、回合系统结构

### 13.1 完整阶段序列

```
1. spawn_selection    → 出生点选择
2. spawn_deployment   → 单位部署
3. tactical           → 战术阶段（Royroy部署）
4. move               → 移动阶段
5. action             → 行动阶段（攻击/技能）
6. end                → 结束阶段
```

### 13.2 阵营轮转

```
earth → balon → maxion → earth → ...
```

每个阵营完成 move → action → end 后切换到下一阵营。

---

## 十四、相关文件索引

| 文件 | 职责 |
|------|------|
| `combatCore/combatIntegrator.cjs` | 战斗生命周期调度，攻击流水线主入口 |
| `combatCore/damagePipe.cjs` | 伤害计算公式实现（10个步骤） |
| `combatCore/hookChain.cjs` | 钩子链系统，按阶段执行词条 |
| `combatCore/tagRegistry.cjs` | 词条注册表，管理10个词条的阶段映射 |
| `combatCore/conditionEvaluator.cjs` | 条件评估器，支持 AND/OR/NOT + 20+ 预置检查器 |
| `combatCore/effectExecutor.cjs` | 效果执行器，处理斩杀/决斗/抢夺/隐身等效果 |
| `combatCore/buffManager.cjs` | Buff 管理器，攻击/防御/机动临时增益 |
| `combatCore/equipManager.cjs` | 装备管理器，武器加成/防具减伤/耐久消耗 |
| `combatCore/tags/*.cjs` | 各词条定义文件 |
| `combatCore/tags/stealth-tags.cjs` | 马克西翁奇袭/隐身词条组 |
| `combatResolver.js` | 旧版战斗结算（阵营技能、奇袭、增援） |
| `turnManager.js` | 回合/阶段管理、出生点、Buff计时 |

---

*文档基于 combat-service 源码分析，版本基于 2026-04-16 的 Phase 8 完成状态。*
