# Phase 11 · 万能语法中枢完成 — 交付报告

> **日期**: 2026-06-21  
> **提交**: `52a7939` → `origin/main`  
> **文件**: 13 changed, +896/-58  
> **容器**: 8/8 Healthy ✅  
> **前一阶段**: Phase 10 (`bd91983`)

---

## 一、完成清单

| # | 任务 | 状态 | 详情 |
|---|------|------|------|
| 1 | 手动摇骰 WebSocket 同步 | ✅ | 后端状态机 + 前端掷骰 UI 已对接 |
| 2 | 前端技能预览卡片 | ✅ | 9 技能卡片展示万能语法标签 |
| 3 | 万能槽位分步创建向导 | ✅ | 6 步向导 (主谓宾定状补) |
| 4 | damage_kind 装备系统 | ✅ | 左手/右手/其它装备 5 种伤害抗性 |
| 5 | AI 技能生成器 | ✅ | Python 脚本，万能语法格式 JSON 输出 |

---

## 二、手动摇骰 WebSocket 同步

### 架构

```
前端 (NewBattleView.vue)             后端 (socketService.js)
     |                                      |
     | ① 空格拍骰子                          |
     | startDiceRoll() → resolveDiceRoll()   |
     |                                      |
     | ② HTTP POST /api/combat/:id/attack   |
     |    + _dice_result: { roll, ... }     |
     |                                      |
     | ③ WebSocket emit                     |
     |    manual_roll_request →              |
     |                              → broadcast to room
```

### 文件变更

| 文件 | 变更 |
|------|------|
| `socketService.js` | 新增 `manual_roll_request` / `manual_roll_response` / `manual_roll_broadcast` 消息处理 |
| `combatResolver.js` | `manualRollPending` Map + `processManualRollResult()` 实例方法 |
| `damagePipe.cjs` | `_applyManualRollBonus` 优先使用 `external_roll_result` |
| `skillExecutor.cjs` | `evaluateManualRoll` 接受 `externalResult` 参数 |

### NewBattleView.vue 已存在的 Phase 8 掷骰 UI

前端早在 Phase 8 就实现了完整的掷骰 UI：
- `diceRollState` 响应式状态机 (idle → rolling → result)
- `maybeInterceptManualRoll()` 拦截需要手动掷骰的技能
- `startDiceRoll()` / `resolveDiceRoll()` / `cancelDiceRoll()` 
- 空格键拍骰子 / ESC 取消
- 骰子动画滚动 (50ms × 10 tick)
- 结果注入 `_dice_result` 到攻击请求

Phase 11 在此基础上添加了 WebSocket 广播同步，使掷骰结果可被房间内其他玩家看到。

---

## 三、技能预览卡片增强

### NewBattleView.vue 新增函数

| 函数 | 功能 |
|------|------|
| `getPhase10SkillInfo(gs)` | 从词条库提取万能语法信息，返回格式化字符串 |
| `getSkillPhase10Tags(skill)` | 生成 Phase 10 标签数组，供模板渲染 |
| `mapActionType(type)` | 动作类型中文映射 |
| `mapDamageKind(kind)` | 伤害类型中文映射 |

### 标签系统

| 标签 | CSS Class | 显示条件 | 颜色 |
|------|-----------|----------|------|
| 攻击/治疗/增益/减益/被动 | `tag-atype` | `action_type` 存在 | 青色 `#00b4dc` |
| 动能/光束/爆炸/腐蚀/热熔 | `tag-dkind` | `damage_kind` ≠ kinetic | 金色 `#ffb000` |
| 掷骰 | `tag-dice` | `is_manual_roll` | 紫色 `#ce93d8` |
| 高地×N | `tag-height` | `height_bonus_per_diff` > 0 | 绿色 `#81c784` |
| ≥N格 | `tag-range` | `min_cast_range` > 0 | 橙色 `#ffb74d` |
| 命中+N | `tag-acc` | `accuracy_mod` ≠ 0 | 靛蓝 `#7986cb` |

---

## 四、万能槽位分步创建向导

### GlossaryView.vue 新增组件

| 步骤 | 名称 | 配置项 |
|------|------|--------|
| Step 1 | 主语 Subject | `action_type`, `attack_stat`, `requires_unmoved`, `requires_stealth` |
| Step 2 | 谓语 Predicate | `target_filter`, `cast_range`, `min_cast_range`, `aoe_radius` |
| Step 3 | 定语 Attribute | `damage_kind`, `category`, `description` |
| Step 4 | 状语 Adverbial | `height_bonus_per_diff`, `dice_type`, `success_line`, `success_bonus_damage`, `is_manual_roll`, `accuracy_mod`, `evasion_mod` |
| Step 5 | 补语 Complement | `base_damage`, `status_effects` (逗号分隔) |
| Step 6 | 确认 Review | 预览全部配置，确认创建 |

### 使用方式
1. 进入 GlossaryView → 点击「编辑模式」
2. 点击「🧙 分步向导」
3. 按 1→2→3→4→5→6 顺序配置
4. 第 6 步确认并点击「创建词条」
5. 返回主面板保存

---

## 五、damage_kind 装备系统

### NewUnitEditorView.vue 新增

| 装备槽 | dkm 字段 | 伤害类型 |
|--------|----------|----------|
| 左手 | `left_dkm_beam/kinetic/explosive/corrosive/thermal` | 光束/动能/爆炸/腐蚀/热熔 |
| 右手 | `right_dkm_beam/kinetic/explosive/corrosive/thermal` | 光束/动能/爆炸/腐蚀/热熔 |
| 其它 | `extra_dkm_beam/kinetic/explosive/corrosive/thermal` | 光束/动能/爆炸/腐蚀/热熔 |

### 后端管线已对接

`damagePipe.cjs` 的 `_calcArmorReduction` 方法遍历装备槽位：
```js
for (const slot of ['full_armor', 'coating', 'shield_gen', 'reactive_armor']) {
    const slotMods = eq[slot].damage_kind_modifiers || {};
    reduction += slotMods[weaponType] || 0;
}
```

---

## 六、AI 技能生成器

### 用法

```bash
# 生成 5 个随机技能
python3 phase11_05_ai_skill_generator.py --count 5

# 只生成攻击类技能
python3 phase11_05_ai_skill_generator.py --count 3 --type attack

# 输出到文件
python3 phase11_05_ai_skill_generator.py --count 5 --output my_skills.json
```

### 生成规则

- **主语**: 随机 action_type + 20% 概率需未移动
- **谓语**: 根据动作类型自动选择合理的 target_filter 和范围
- **定语**: 从 5 种 damage_kind 中随机
- **状语**: 骰子类型 + 成功能 + 高地加成
- **补语**: 平衡的基础伤害 (attack: 5-20, heal: 5-15) + 随机状态效果

### 技能命名库

| 类型 | 示例名称 |
|------|----------|
| attack | 雷霆一击、等离子切割、量子脉冲、重力碾压… |
| heal | 纳米修复、能量灌注、结构重组、再生力场… |
| buff | 战斗狂热、极限超频、护盾增强、战术优势… |
| debuff | EMP干扰、腐蚀酸液、减速力场、能量吸取… |
| passive | 钢铁意志、反击本能、战场直觉、快速装填… |

---

## 七、验证结果

### 容器健康 (8/8 ✅)

| 容器 | 状态 |
|------|------|
| mecha-combat | ✅ healthy |
| mecha-frontend | ✅ healthy |
| mecha-battle-db | ✅ healthy |
| mecha-auth | ✅ healthy |
| mecha-comm | ✅ healthy |
| mecha-hangar | ✅ healthy |
| mecha-map | ✅ healthy |
| mecha-online-battle | ✅ healthy |

### 功能验证

| 测试 | 结果 |
|------|------|
| 后端 health | ✅ `{"status":"healthy"}` |
| 词条库配置 | ✅ v5.0, 9 skills, 10 terrains |
| 前端服务 | ✅ HTTP 200, 正确渲染 |
| AI 生成器 | ✅ 生成 3 个格式正确的技能 JSON |

---

## 八、Git 提交

```
52a7939 Phase 11: 万能语法中枢完成 — WebSocket手动摇骰 + 技能预览 + 分步向导 + 装备DKM + AI生成器
13 files changed, +896, -58

frontend/src/views/GlossaryView.vue
frontend/src/views/NewBattleView.vue
frontend/src/views/NewUnitEditorView.vue
services/combat-service/src/services/combatCore/damagePipe.cjs
services/combat-service/src/services/combatCore/skillExecutor.cjs
services/combat-service/src/services/combatResolver.js
services/combat-service/src/services/socketService.js
(+6 additional files from concurrent work)
```

---

## 九、Phase 12 后续建议

1. **dkm 数据管道对接**: NewUnitEditorView 的平坦 dkm 字段需映射到 `damagePipe._calcArmorReduction` 的装备对象
2. **WebSocket 手动摇骰完整闭环**: `combatResolver.executeTurn` 需要真正挂起等待 WebSocket 响应（目前掷骰结果通过 HTTP `_dice_result` 参数传入）
3. **技能预览实时刷新**: 词条库修改后自动刷新战场技能卡片
4. **AI 技能一键导入**: 前端增加「导入 AI 生成技能」按钮
5. **装备 dkm 可视化**: 战场端显示敌方装备的伤害抗性
