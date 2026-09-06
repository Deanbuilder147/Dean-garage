# 🏭 Phase 8: 引擎大一统 — Old School 落地报告

```
┌─────────────────────────────────────────────────────────────┐
│  ███████╗ █████╗  ██████╗████████╗ ██████╗ ██████╗ ██╗   ██╗ │
│  ██╔════╝██╔══██╗██╔════╝╚══██╔══╝██╔═══██╗██╔══██╗╚██╗ ██╔╝ │
│  █████╗  ███████║██║        ██║   ██║   ██║██████╔╝ ╚████╔╝  │
│  ██╔══╝  ██╔══██║██║        ██║   ██║   ██║██╔══██╗  ╚██╔╝   │
│  ██║     ██║  ██║╚██████╗   ██║   ╚██████╔╝██║  ██║   ██║    │
│  ╚═╝     ╚═╝  ╚═╝ ╚═════╝   ╚═╝    ╚═════╝ ╚═╝  ╚═╝   ╚═╝    │
│                                                             │
│    引擎大一统：平铺全字段词条工厂 + 手动掷骰拦截落地              │
│    Build: Phase 8 — 2026-06-20 18:31 CST                    │
└─────────────────────────────────────────────────────────────┘
```

---

## ✅ 部署结果

| 指标 | 结果 |
|------|------|
| **前端构建** | ✅ 115 modules, 0 errors |
| **前端 JS** | `index-DDp1NEyF.js` (292.6 KB) |
| **前端 CSS** | `index-vb_Wsu_i.css` (95.6 KB) |
| **后端构建** | ✅ combat-service Docker image |
| **容器状态** | 9/9 Healthy |
| **HTTP** | 200 OK |
| **服务地址** | `https://106.54.197.69` |

---

## 📋 三大模块重构详情

### 1. GlossaryView.vue — 平铺规则工厂 (611 lines)

#### 🔥 删除项

| 删除项 | 说明 |
|--------|------|
| `UNIVERSAL_FIELDS` Set | 过滤逻辑彻底移除 |
| `advancedOpen` reactive | 折叠状态变量 |
| `getAdvancedParams()` | 高级参数提取函数 |
| `toggleAdvanced()` | 折叠展开切换函数 |
| 高级参数折叠模板块 | `▶ 高级参数` 折叠 UI 全部删除 |

#### 🆕 新增平铺字段（10 字段，全部直接可见）

**基础六维**（原有，保留）:

| 字段 | 类型 | 说明 |
|------|------|------|
| `target_filter` | 下拉 | 目标筛选 (enemy/ally/self/all) |
| `cast_range` | 数字 | 施法距离 |
| `aoe_radius` | 数字 | 范围半径 |
| `base_damage` | 数字 | 基础伤害 |
| `status_effects` | 多选 | 状态效果 |

**动作掷骰四维**（新引入）:

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `dice_type` | 字符串 | `"1d6"` | 骰子类型，支持 "2d6", "1d20" 等 |
| `success_line` | 数字 | `4` | 成功线，点数 >= 此值触发成功 |
| `success_bonus_damage` | 数字 | `0` | 成功后追加的确定性伤害 |
| `is_manual_roll` | 布尔 | `false` | 是否弹出手动摇骰层 |

#### 📝 函数修改

- **`addNewSkill()`**: 含 4 骰子字段默认值初始化，移除 `advancedOpen[newKey] = false`
- **`deleteSkill()`**: 移除 `delete advancedOpen[key]`
- **CSS**: 新增 `.dice-fields` / `.dice-section-label` 样式规则

---

### 2. NewBattleView.vue — 手动摇骰拦截生命周期 (2846 → 3068 lines)

#### 🎲 掷骰状态机

```
     技能释放
        │
        ▼
 maybeInterceptManualRoll()
        │
        ├─ is_manual_roll=false → 正常执行攻击
        │
        └─ is_manual_roll=true → [WAIT_PLAYER_ROLL]
              │
              ├─ Space / 点击 → startDiceRoll()
              │     │
              │     └─ 10 ticks × 50ms 滚动动画
              │           │
              │           ▼
              │     animationPhase = 'result'
              │           │
              │     Space / 点击 → resolveDiceRoll()
              │           │
              │     roll >= success_line ?
              │     ├─ YES → "SUCCESS" 大字 + bonusDamage
              │     └─ NO  → "FAIL"
              │           │
              │           ▼
              │     发起 combatAPI.attack(_dice_result)
              │
              └─ ESC → cancelDiceRoll()
```

#### 状态对象

```javascript
diceRollState = reactive({
  active: false,           // 是否激活掷骰
  skillName: '',           // 技能名
  diceType: '1d6',         // 骰子类型
  successLine: 4,          // 成功线
  bonusDamage: 0,          // 成功追加伤害
  animationPhase: 'idle',  // idle | rolling | result
  rollResult: 0,           // 骰子结果
  isSuccess: false,        // 是否成功
  pendingAttackPayload: null  // 暂存的攻击参数
})
```

#### 核心函数

| 函数 | 功能 |
|------|------|
| `parseDiceType(diceStr)` | 解析 "nDm" 格式 → `{ count, sides }` |
| `rollDice(diceStr)` | `Math.random()` 掷骰，返回总点数 |
| `maybeInterceptManualRoll(target, skill)` | 拦截 `is_manual_roll=true` 技能，挂起状态机 |
| `startDiceRoll()` | 500ms 滚动动画 (10 ticks × 50ms) |
| `resolveDiceRoll()` | 判定成功/失败，附加 bonusDamage |
| `cancelDiceRoll()` | 取消掷骰，恢复状态 |
| `loadGlossaryConfigForDice()` | 从 API 加载词条配置用于骰子匹配 |
| `onDiceKeyDown(e)` | Space 掷骰/确认，ESC 取消 |

#### 攻击拦截

`executeSkillAttack()` 函数首行新增：

```javascript
if (maybeInterceptManualRoll(target, skill)) return  // 挂起，等待玩家掷骰
```

#### 键盘生命周期

```javascript
onMounted(() => {
  document.addEventListener('keydown', onDiceKeyDown)
  // ... 3D 视角加载
})

onUnmounted(() => {
  document.removeEventListener('keydown', onDiceKeyDown)
})
```

#### UI 浮层模板

```html
<div v-if="diceRollState.active" class="dice-overlay">
  <div class="dice-panel">
    <div class="dice-title">{{ skillName }}</div>
    <div class="dice-info">{{ diceType }} | 成功线: {{ successLine }}+</div>
    
    <!-- 三态切换 -->
    <div class="dice-result-area">
      <!-- idle: 点击骰子或按 Space 掷骰 -->
      <!-- rolling: 数字滚动动画 -->
      <!-- result: 最终点数 + SUCCESS/FAIL -->
    </div>
    
    <div class="dice-actions">
      <button>掷骰</button>
      <button>确认攻击</button>
      <button>取消</button>
    </div>
  </div>
</div>
```

#### CSS 动画

```css
@keyframes dicePop { /* 骰子弹入 */ }
@keyframes diceShake { /* 骰子抖动 */ }
.result-success { /* 绿色大字 "SUCCESS" */ }
.result-fail { /* 红色大字 "FAIL" */ }
```

---

### 3. skillExecutor.cjs — 动态骰子驱动 (510 lines)

#### 🆕 新增方法

| 方法 | 签名 | 功能 |
|------|------|------|
| `_parseDice(diceStr)` | `"2d10"` → `{ count:2, sides:10 }` | 解析骰子表达式 |
| `_rollDice(diceStr)` | `"1d6"` → `4` | `Math.random()` 掷骰 |
| `_evaluateDice(cfg)` | → `{ roll, isSuccess, bonusDamage }` | 判断成功/失败 |
| `_applyDiceToDamage(cfg, base)` | → `{ damage, dice }` | 合并骰子加成到伤害 |
| `_getUniversalFields()` | 扩展含 4 骰子字段 | 通用字段读取 |

#### 核心公式

```
finalDamage = base_damage + (roll >= success_line ? success_bonus_damage : 0)
```

#### 🔄 7 技能骰子感知升级

| 技能 | 说明 |
|------|------|
| `executeBlock` | 格挡技能接入骰子判定 |
| `executeSweep` | 横扫技能接入骰子判定 |
| `executeThrow` | 投掷技能接入骰子判定 |
| `executeCounter` | 反击技能接入骰子判定 |
| `executeSupply` | 补给技能接入骰子判定 |
| `executeFocusedFire` | 集火技能接入骰子判定 |
| `canSniper` | 狙击范围判定接入骰子 |

---

## 🔧 补丁文件清单

| 文件 | 位置 |
|------|------|
| `patch_glossary.py` | GlossaryView.vue 平铺化修改 |
| `patch_battle.py` | NewBattleView.vue 掷骰拦截 |
| `patch_skill_executor.py` | skillExecutor.cjs 骰子驱动 |
| `insert_dice_overlay.py` | NewBattleView.vue 模板浮层插入 |

---

## 🧪 验证测试

### 后端骰子系统

```
> 1d6 roll: 5
> 2d10 parse: { count: 2, sides: 10 }
> 1d20 eval (success=10): { roll: 7, isSuccess: false, bonusDamage: 0 }
```

### 前端 JS Bundle

```
diceRollState: ✅ 已打包
dice-overlay: ✅ 已打包
maybeInterceptManualRoll: ✅ 已打包
```

### 前端 CSS

```
dice-overlay: ✅ 已注入
```

---

## 🔑 使用说明

### 启用手动摇骰

1. 打开词条库 (GlossaryView)
2. 进入编辑模式
3. 找到目标技能卡片
4. 将 **手动摇骰** 开关拨到 **ON**
5. 调参：骰子类型 / 成功线 / 成功追加
6. 保存配置

### 战场体验

1. 选择具有 `is_manual_roll=true` 的技能
2. 点击目标释放
3. 屏幕中央弹出骰子面板
4. 按 **空格** 或点击 **掷骰** 按钮
5. 500ms 滚动动画定格
6. 判定 SUCCESS / FAIL
7. 点击 **确认攻击** 发动
8. 按 **ESC** 取消

### 向后兼容

- 现有技能不配置骰子字段时，自动回退确定性行为
- `dice_type` 缺省 → `"1d6"`
- `success_line` 缺省 → `4`
- `is_manual_roll` 缺省 → `false`

---

## 📌 设计原则

> **"Old School 铁律"**：高级参数折叠已死，全字段平铺永生。
> 每一个属性都在卡片上直接可触达——这就是规则工厂。
>
> 词条不再有隐藏面板。所有字段一眼可见，一经填入立刻生效，
> 利用 `deepMerge` 动态写入后端，实现全属性"无中生有"的拓展自由。

---

*Generated: 2026-06-20 18:41 CST | Phase 8 — 引擎大一统*
