# 机甲战棋 Combat 逻辑完整文档

> 基于代码库 `services/combat-service/` 整理，更新日期 2026-04-23

---

## 一、系统总览

### 1.1 技术栈

| 组件 | 技术 | 端口 |
|------|------|:----:|
| 后端服务 | Node.js + Express (ES Modules) | 3004 |
| 数据库 | SQLite (sql.js) | — |
| 实时通信 | WebSocket (ws) | 3004 |
| 认证 | JWT | — |
| 前端 | Vue3 + PixiJS | 8081 |

### 1.2 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                    前端 (Vue3 + PixiJS)                      │
│  BattleView.vue │ BattlefieldView.vue │ PreparationRoom.vue │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP API + WebSocket
┌──────────────────────────▼──────────────────────────────────┐
│              combat-service (Express, port 3004)             │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────────┐  │
│  │  battles.js  │  │ combatResolver│  │  turnManager     │  │
│  │  (API路由)   │  │  (战斗结算)   │  │  (回合管理)      │  │
│  └──────┬───────┘  └───────┬───────┘  └────────┬─────────┘  │
│         │                  │                    │            │
│  ┌──────▼──────────────────▼────────────────────▼─────────┐ │
│  │                  combatCore/ (核心引擎)                 │ │
│  │  DamagePipe │ BuffManager │ EquipManager │ HookChain  │ │
│  │  TagProcessor │ TagRegistry │ FactionSkillRegistry     │ │
│  │  ConditionEvaluator │ EffectExecutor │ CombatIntegrator│ │
│  │  AIEngine │ BehaviorTree │ AIStrategies │ AIDifficulty │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌──────────────┐  ┌───────────────┐                        │
│  │ socketService│  │  auth.js      │                        │
│  │ (WebSocket)  │  │  (JWT认证)    │                        │
│  └──────────────┘  └───────────────┘                        │
└─────────────────────────────────────────────────────────────┘
```

---

## 二、战斗流程

### 2.1 完整战斗生命周期

```
创建战斗会话
    │
    ▼
┌─ 出生点选择阶段 (spawn_selection) ─┐
│  按座位索引轮流选择母舰/基地       │
│  全部选完 → 进入下一阶段           │
└──────────────┬─────────────────────┘
               ▼
┌─ 出生点部署阶段 (spawn_deployment) ─┐
│  在各自出生点部署单位               │
│  手动结束 → 进入战术阶段           │
└──────────────┬─────────────────────┘
               ▼
┌─ 战术阶段 (tactical) ──────────────┐
│  部署 Royroy（战术子机）            │
│  Royroy 必须在主机体 1 格内         │
│  手动结束 → 进入移动阶段           │
└──────────────┬─────────────────────┘
               ▼
╔═══════════════════════════════════╗
║  回合循环 (每阵营轮流)            ║
║  阵营顺序: 地球联合→拜隆→马克西翁 ║
║  ┌─────────────────────────────┐  ║
║  │ 移动阶段 (move)             │  ║
║  │ 单位移动，距离 ≤ 机动值     │  ║
║  └──────────┬──────────────────┘  ║
║             ▼                     ║
║  ┌─────────────────────────────┐  ║
║  │ 行动阶段 (action)           │  ║
║  │ 攻击/使用阵营技能           │  ║
║  │ - 奇袭判定（马克西翁）      │  ║
║  │ - 增援判定（拜隆）          │  ║
║  │ - 词条触发与结算            │  ║
║  └──────────┬──────────────────┘  ║
║             ▼                     ║
║  ┌─────────────────────────────┐  ║
║  │ 结束回合                    │  ║
║  │ Buff 回合 tick              │  ║
║  │ 重置单位状态                │  ║
║  │ 进入下一阵营                │  ║
║  │ → 检查胜利条件              │  ║
║  └─────────────────────────────┘  ║
╚═══════════════════════════════════╝
```

### 2.2 阵营轮次规则

- 固定顺序：**地球联合 (earth) → 拜隆 (balon) → 马克西翁 (maxion)**
- 回到地联时 turnNumber +1，重置阵营技能使用标志
- 每回合开始时所有单位重置 `has_moved`、`has_acted`、`skip_turn`

### 2.3 胜利判定

- 只剩一个阵营有存活单位 → 该阵营胜
- 全灭 → 平局

---

## 三、伤害计算（DamagePipe）

### 3.1 伤害计算流水线（10个阶段）

```
┌──────────────────────────────────────────────────────────┐
│                    DamagePipe 流水线                       │
├────────────┬─────────────────────────────────────────────┤
│ 阶段1      │ 基础攻击力 = 格斗属性(melee) 或 射击属性(ranged) │
├────────────┼─────────────────────────────────────────────┤
│ 阶段2      │ 机动差 = 攻击方机动 - 防御方机动              │
├────────────┼─────────────────────────────────────────────┤
│ 阶段3      │ 武器加成 = 左手武器 + 右手武器               │
├────────────┼─────────────────────────────────────────────┤
│ 阶段4      │ Buff加成 = attack_buff（来自迷雾等技能）      │
├────────────┼─────────────────────────────────────────────┤
│ 阶段5      │ 临时攻击力 = 1+2+3+4 求和                    │
├────────────┼─────────────────────────────────────────────┤
│ 阶段6      │ 暴击判定: d10 ≥ 9 → 攻击力×1.5              │
│            │ 仅当 attacker.has_critical_chance = true 时  │
├────────────┼─────────────────────────────────────────────┤
│ 阶段7      │ 基础伤害 = max(0, floor(临时攻击力))         │
├────────────┼─────────────────────────────────────────────┤
│ 阶段8      │ 防御减伤 = 防具减伤 + 地形减伤 + Buff防御    │
├────────────┼─────────────────────────────────────────────┤
│ 阶段9      │ 最终伤害 = max(0, 基础伤害 - 防御减伤)       │
├────────────┼─────────────────────────────────────────────┤
│ 阶段10     │ 防具耐久度消耗（每次受击减 1）               │
│            │ 耐久耗尽 → 防具摧毁                          │
└────────────┴─────────────────────────────────────────────┘
```

### 3.2 伤害公式

```
临时攻击力 = (格斗/射击) + (己方机动 - 对方机动) + 武器加成 + Buff攻击加成

[暴击] if has_critical_chance and d10 ≥ 9:
    临时攻击力 = floor(临时攻击力 × 1.5)

基础伤害 = max(0, floor(临时攻击力))

防御减伤 = 防具减伤(左+右, 每件最多3) + 地形减伤 + Buff防御加成

最终伤害 = max(0, 基础伤害 - 防御减伤)
目标HP = max(0, 目标HP - 最终伤害)
```

### 3.3 装备系统

**武器加成（攻击方）：**

| 槽位 | 近战攻击 | 远程攻击 |
|------|:-------:|:-------:|
| 左手 | `left_hand_melee` | `left_hand_ranged` |
| 右手 | `right_hand_melee` | `right_hand_ranged` |

根据 attackType (melee/ranged) 自动选择对应属性。

**防具减伤（防御方）：**
- 每件防具最多减伤 **3点**
- 左手防具 + 右手防具，分别计算
- 每次受击消耗 **1点耐久**，耐久耗尽防具被摧毁

### 3.4 暴击系统

- **触发条件**: `attacker.has_critical_chance = true`
- **判定**: 掷 d10，结果 ≥ 9 触发暴击（20% 概率）
- **效果**: 临时攻击力 × 1.5（向下取整）

---

## 四、骰子系统

### 4.1 所有骰子一览

| 用途 | 面数 | 触发条件 | 效果 |
|------|:----:|---------|------|
| **暴击判定** | d10 | `has_critical_chance` | ≥9 暴击(×1.5) |
| **奇袭触发** | d10 | 马克西翁单位攻击 | ≤5 触发奇袭(50%) |
| **奇袭骰子** | d10 | 奇袭执行时 | 黑骰(1-5): 伤害+2 / 红骰(6-10): 移动-1 |
| **迷雾效果** | d6 | 迷雾系统发动 | 1-2: 防+2 / 3-4: 移+1 / 5-6: 攻+1 |
| **词条判定** | d6 | 词条触发检查 | 按词条定义的阈值判定 |
| **幸运词条** | d6 | luck 词条 | 1-2: 额外行动 / 3-4: 伤害加成 / 5-6: 回血 |

### 4.2 骰子核心代码

```javascript
static rollDice(sides = 6) {
  return Math.floor(Math.random() * sides) + 1;
}
```

---

## 五、阵营技能

### 5.1 三阵营定位

| 阵营 | 代号 | 定位 | 核心机制 |
|------|------|------|---------|
| **地球联合** | `earth` | 防御型 | 火力覆盖、阵地战 |
| **拜隆** | `balon` | 均衡型 | 增援系统、协同作战 |
| **马克西翁** | `maxion` | 机动型 | 迷雾系统、机动游击、奇袭 |

### 5.2 地球联合 — 火力覆盖

- **效果**: 对指定六角格区域造成 **15点伤害**
- **范围**: 半径 **2格**
- **限制**: **每轮一次**（回到地联回合时重置）
- **地形减伤**: 山地地形减免 **5点**

```
使用流程:
  POST /api/combat/:id/artillery
  body: { center_q, center_r }

  → 找到范围内所有单位
  → 山地地形减伤5
  → 造成 max(0, 15 - 地形减伤) 伤害
  → 标记 earthArtilleryUsed = true
```

### 5.3 拜隆 — 增援系统

- **触发条件**: 拜隆单位**被攻击时**自动触发
- **效果**: 距离 **2格内**的其他拜隆存活单位分担伤害
- **分担方式**: 增援单位承受 **原始伤害的一半**（向下取整）

```
增援流程:
  攻击拜隆单位
    → 检查 2 格内其他拜隆单位
    → 如有 → 返回增援选项给前端
    → 玩家选择增援单位
    → 增援单位承受 damage/2
    → 目标恢复 damage/2
    → 增援单位 HP ≤ 0 → 被摧毁
```

### 5.4 马克西翁 — 迷雾系统

- **效果**: 掷 d6 决定全阵营 Buff
- **持续**: **2回合**
- **限制**: **每轮一次**

| 骰子结果 | 效果 | Buff 类型 | 数值 |
|:-------:|------|----------|:----:|
| 1-2 | 全体防御增强 | DEFENSE | +2 |
| 3-4 | 全体机动增强 | MOBILITY | +1 |
| 5-6 | 全体攻击增强 | ATTACK | +1 |

---

## 六、奇袭系统（马克西翁专属）

### 6.1 触发条件

1. 攻击方必须是 **马克西翁阵营**
2. 掷 d10，结果 **≤ 5**（50% 触发率）
3. 范围内存在其他**可奇袭的马克西翁单位**：
   - 存活且未行动
   - 距离目标 ≤ 该单位的机动值

### 6.2 奇袭选项

| 选项 | 代号 | 效果 |
|------|------|------|
| **顶替攻击** | `replace` | 取消原攻击，奇袭单位执行攻击 |
| **先制攻击** | `counter` | 原攻击继续 + 奇袭单位额外攻击（伤害叠加） |
| **放弃** | `giveup` | 放弃奇袭，执行原攻击 |

### 6.3 奇袭骰子

奇袭攻击额外掷 d10：

| 骰子 | 范围 | 颜色 | 效果 |
|------|:----:|:----:|------|
| 黑骰 | 1-5 | 黑色 | 伤害 **+2** |
| 红骰 | 6-10 | 红色 | 移动 **-1**（下回合） |

### 6.4 奇袭后的限制

- 奇袭单位标记 `skip_next_turn = true`（下回合跳过，无论骰子颜色）

---

## 七、隐匿/视线系统

### 7.1 单位可见性判定

单位对敌方可见需要**同时满足**三个条件：

```
可见 = (距离 ≤ 感知范围) AND (视线通畅) AND (未被隐匿)
```

- **距离**: 攻击方与目标的六角格距离
- **视线**: 两点连线上无山地/建筑遮挡
- **隐匿**: `hidden = true && hiddenTurns > 0` 时不可见

### 7.2 隐匿词条组（stealth-tags.cjs）

| 词条 | 名称 | 效果 |
|------|------|------|
| `stealth_initiate` | 战术隐蔽 | 回合开始进入隐身 |
| `stealth_ambush` | 奇袭 | 隐身攻击额外伤害 |
| `stealth_camouflage` | 伪装 | 隐身闪避判定 |
| `stealth_break` | 暴露 | 攻击/移动后解除隐身 |

### 7.3 隐匿与迷雾的关联

- 马克西翁回合开始时自动触发迷雾系统
- 迷雾的 Buff 通过 `BuffManager` 管理
- 隐匿状态由 `stealth_initiate` 词条控制

---

## 八、Buff 系统（BuffManager）

### 8.1 Buff 类型

```javascript
BuffManager.BUFF_TYPES = {
  ATTACK: 'attack_buff',     // 攻击加成
  DEFENSE: 'defense_buff',   // 防御加成
  MOBILITY: 'mobility_buff'  // 机动加成
};
```

### 8.2 Buff 生命周期

```
施加 Buff (applyBuff)
    → 记录 type, value, duration, previousValue
    → 每回合开始 tick (duration - 1)
    → duration ≤ 0 → Buff 过期，恢复原始值
    → 过期事件写入战斗日志
```

### 8.3 Buff 影响范围

| Buff 类型 | 影响 | 在伤害管道中的作用 |
|----------|------|-------------------|
| attack_buff | +N 攻击力 | DamagePipe 阶段4 |
| defense_buff | +N 防御力 | DamagePipe 阶段8 |
| mobility_buff | +N 移动力 | 移动阶段，扩大移动范围 |

---

## 九、词条系统（Tags）

### 9.1 已注册词条一览

| 词条ID | 名称 | 阵营 | 触发阶段 | 核心效果 |
|--------|------|------|---------|---------|
| `execute` | 处决 | 通用 | on_attack | 目标 HP ≤ 阈值 → 即死 |
| `duel` | 决斗 | 通用 | on_attack | 双方比拼判定，输者额外受伤 |
| `plunder` | 掠夺 | 通用 | post_attack | 击败敌人窃取装备 |
| `focused_shot` | 集中射击 | 通用 | pre_attack | 远程攻击伤害加成 |
| `luck` | 幸运 | 通用 | post_attack | d6 判定：额外行动/伤害/回血 |
| `reattack` | 再攻击 | 通用 | post_attack | 获得额外攻击机会 |
| `assist` | 支援 | 通用 | pre_attack | 附近友军协同加成 |
| `airdrop` | 空投 | 通用 | turn_start | 快速部署到指定位置 |
| `formation_defense` | 阵型防御 | 通用 | pre_damage | 邻接友军提供防御加成 |
| `resistance` | 抗性 | 通用 | pre_damage | 减少特定类型伤害 |
| `stealth_initiate` | 战术隐蔽 | 马克西翁 | turn_start | 进入隐身状态 |
| `stealth_ambush` | 奇袭 | 马克西翁 | on_attack | 隐身攻击额外伤害 |
| `stealth_camouflage` | 伪装 | 马克西翁 | pre_damage | 隐身闪避判定 |
| `stealth_break` | 暴露 | 马克西翁 | on_attack | 攻击后解除隐身 |

### 9.2 词条系统架构

```
TagRegistry (词条注册表)
    → 注册所有词条定义
    → 按阶段/优先级/效果类型查询

HookChain (钩子链)
    → 管理 10+ 个战斗钩子点
    → round_start, turn_start, turn_end
    → pre_attack, on_attack, post_attack
    → pre_damage, on_damage, post_damage
    → 按优先级排序执行

ConditionEvaluator (条件评估器)
    → 评估词条触发条件
    → 支持 AND/OR/NOT 复合条件

TagProcessor (词条处理器)
    → 词条触发判定
    → 掷骰子判定
    → 效果执行

EffectExecutor (效果执行器)
    → 12+ 种效果类型处理器
    → 即死/伤害骰/减伤/决斗/掠夺/额外回合/移动阻止等

TagChainManager (词条链管理器)
    → 多词条组合执行
    → 冲突处理
    → 优先级排序

CombatIntegrator (战斗核心集成器)
    → 统一调度所有子系统
    → 管理战斗生命周期
    → 提供统一执行接口
```

### 9.3 钩子点列表

| 钩子点 | 触发时机 |
|--------|---------|
| `round_start` | 新一轮开始（地联回合） |
| `turn_start` | 某阵营回合开始 |
| `turn_end` | 某阵营回合结束 |
| `pre_attack` | 攻击判定前 |
| `on_attack` | 攻击判定时 |
| `post_attack` | 攻击结算后 |
| `pre_damage` | 伤害计算前 |
| `on_damage` | 伤害结算时 |
| `post_damage` | 伤害结算后 |
| `unit_destroyed` | 单位被摧毁时 |

---

## 十、AI 系统

### 10.1 难度分级

| 难度 | 思考延迟 | 随机行动概率 | 考虑威胁 | 攻击准确率 | 使用技能 |
|------|:-------:|:----------:|:-------:|:--------:|:------:|
| 简单 (easy) | 500ms | 30% | 否 | 70% | 否 |
| 普通 (normal) | 1000ms | 10% | 是 | 85% | 是 |
| 困难 (hard) | 1500ms | 0% | 是 | 95% | 是 |

### 10.2 AI 决策架构

```
AICombatController (战斗控制器)
    │
    ├── AIEngine (决策引擎)
    │     → 管理AI单位、回合调度
    │
    ├── BehaviorTree (行为树)
    │     → Selector / Sequence / Parallel
    │     → Condition / Action 节点
    │     → SUCCESS / FAILURE / RUNNING 状态
    │
    ├── AIStrategies (策略库)
    │     → 六角格距离计算
    │     → 攻击优先级评估
    │     → 移动目标选择
    │
    └── AIDifficulty (难度代理)
          → 按难度调节决策参数
          → 注入随机性
```

---

## 十一、数据库结构

### 11.1 battle_sessions（战斗会话）

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | INTEGER PK | 主键 |
| `battlefield_id` | INTEGER | 战场ID |
| `room_id` | INTEGER | 房间ID（可选） |
| `units_state` | TEXT (JSON) | 完整战斗状态快照 |
| `status` | TEXT | active / ended |
| `phase` | TEXT | 当前阶段 |
| `current_faction` | TEXT | 当前行动阵营 |
| `current_turn` | INTEGER | 当前回合数 |
| `spawn_phase_done` | BOOLEAN | 出生点选择是否完成 |
| `spawn_order` | TEXT (JSON) | 出生点选择顺序 |

### 11.2 battle_units（战斗单位）

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | INTEGER PK | 主键 |
| `battle_id` | INTEGER FK | 战斗ID |
| `unit_id` | INTEGER | 单位ID |
| `player_id` | INTEGER | 玩家ID |
| `faction` | TEXT | 阵营 |
| `q`, `r` | INTEGER | 六角格坐标 |
| `hp` | INTEGER | 生命值 |
| `格斗` | INTEGER | 近战属性 |
| `射击` | INTEGER | 远程属性 |
| `机动` | INTEGER | 移动力（默认3） |
| `left_hand_type` | TEXT | 左手装备类型 |
| `left/right_hand_melee` | INTEGER | 装备格斗加成 |
| `left/right_hand_ranged` | INTEGER | 装备射击加成 |
| `left/right_hand_durability` | INTEGER | 装备耐久度 |
| `royroy_deployed` | BOOLEAN | Royroy 是否已部署 |
| `royroy_q`, `royroy_r` | INTEGER | Royroy 坐标 |

### 11.3 battle_logs（战斗日志）

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | INTEGER PK | 主键 |
| `battle_id` | INTEGER FK | 战斗ID |
| `log_type` | TEXT | 日志类型 |
| `content` | TEXT | 日志内容 |
| `timestamp` | DATETIME | 时间戳 |

---

## 十二、API 接口

### 12.1 战斗会话

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/combat` | 获取战斗列表 |
| POST | `/api/combat` | 创建战斗 |
| GET | `/api/combat/:id` | 获取战斗详情 |

### 12.2 战斗操作

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/combat/:id/move` | 单位移动 |
| POST | `/api/combat/:id/attack` | 单位攻击 |
| POST | `/api/combat/:id/surprise-choice` | 奇袭选择 |
| POST | `/api/combat/:id/end-turn` | 结束回合 |

### 12.3 阵营技能

| 方法 | 路径 | 说明 | 阵营 |
|------|------|------|------|
| POST | `/api/combat/:id/artillery` | 火力覆盖 | 地球联合 |
| POST | `/api/combat/:id/fog-system` | 迷雾系统 | 马克西翁 |

### 12.4 认证

所有接口需要 JWT Bearer Token：
```
Authorization: Bearer <token>
```

### 12.5 WebSocket

```
连接: ws://host:3004?token=<JWT>&battleId=<BATTLE_ID>
```

| 消息类型 | 方向 | 说明 |
|---------|------|------|
| `join_battle` | 客户端→服务 | 加入战斗房间 |
| `leave_battle` | 客户端→服 | 离开战斗房间 |
| `battle_update` | 双向 | 战斗状态更新 |
| `unit_moved` | 双向 | 单位移动广播 |
| `unit_attacked` | 双向 | 攻击结算广播 |
| `turn_ended` | 双向 | 回合结束广播 |
| `chat_message` | 双向 | 聊天消息 |
| `ping/pong` | 双向 | 心跳检测 |

---

## 十三、六角格系统

### 13.1 坐标系

使用 **axial 坐标系** (q, r)。

### 13.2 距离计算

```javascript
// 曼哈顿距离（简化版）
static calculateDistance(unit1, unit2) {
  return Math.abs(unit1.q - unit2.q) + Math.abs(unit1.r - unit2.r);
}

// 精确六角格距离（AI 使用）
function hexDistance(a, b) {
  return (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs((a.q + a.r) - (b.q + b.r))) / 2;
}
```

### 13.3 地形类型

| 地形 | 效果 |
|------|------|
| `lunar` | 月面（默认，无特殊效果） |
| `mountain` | 山地（视线遮挡，火力覆盖减伤5） |
| `building` | 建筑（视线遮挡） |

---

## 十四、前端视图

| 视图 | 文件 | 功能 |
|------|------|------|
| 战斗主界面 | `BattleView.vue` (2017行) | 回合信息、阶段面板、单位管理、WebSocket同步 |
| 战场编辑器 | `BattlefieldView.vue` (1760行) | 六角格地图编辑、地形绘制、格子间距调整 |
| 战场选择器 | `BattlefieldSelector.vue` (548行) | 模态对话框，加载并选择战场 |
| 整备室 | `PreparationRoom.vue` (1705行) | AI对战设置、阵营分配、玩家管理 |

---

## 十五、文件索引

### 后端核心

| 文件 | 行数 | 职责 |
|------|:----:|------|
| `src/index.js` | 76 | 服务入口 |
| `src/routes/battles.js` | 641 | API路由 |
| `src/services/combatResolver.js` | 355 | 战斗结算（骰娘） |
| `src/services/turnManager.js` | 555 | 回合管理 |
| `src/services/socketService.js` | 285 | WebSocket通信 |
| `src/middleware/auth.js` | 323 | 认证中间件 |
| `src/database/db.js` | 418 | 数据库层 |

### combatCore 引擎

| 文件 | 行数 | 职责 |
|------|:----:|------|
| `combatCore/damagePipe.cjs` | 315 | 伤害计算管道 |
| `combatCore/buffManager.cjs` | 276 | Buff管理 |
| `combatCore/equipManager.cjs` | 184 | 装备管理 |
| `combatCore/hookChain.cjs` | 272 | 钩子链 |
| `combatCore/tagRegistry.cjs` | 164 | 词条注册 |
| `combatCore/tagProcessor.cjs` | 379 | 词条处理 |
| `combatCore/tagChainManager.cjs` | 369 | 词条链管理 |
| `combatCore/tagDatabaseManager.cjs` | 348 | 词条数据库 |
| `combatCore/tagCompatibilityAdapter.cjs` | 297 | 兼容适配器 |
| `combatCore/skillToTagConverter.cjs` | 402 | 技能→词条转换 |
| `combatCore/conditionEvaluator.cjs` | 279 | 条件评估 |
| `combatCore/effectExecutor.cjs` | 737 | 效果执行 |
| `combatCore/factionSkillRegistry.cjs` | 573 | 阵营技能 |
| `combatCore/combatIntegrator.cjs` | 478 | 核心集成 |
| `combatCore/priorityQueue.cjs` | 322 | 优先级队列 |
| `combatCore/aiEngine.cjs` | 248 | AI引擎 |
| `combatCore/aiStrategies.cjs` | 311 | AI策略 |
| `combatCore/aiDifficulty.cjs` | 200 | AI难度 |
| `combatCore/aiIntegration.cjs` | 364 | AI集成 |
| `combatCore/behaviorTree.cjs` | 220 | 行为树 |
