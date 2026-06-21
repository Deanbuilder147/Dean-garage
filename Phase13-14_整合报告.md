# 机甲战棋 Phase 13 → 14 全链路整合报告

> **日期**: 2026-06-21  
> **服务器**: 106.54.197.69 (lhins-2fs1rzs8)  
> **Git 提交链**: `97e642f` → `fcac62d` → `42e17f9` → `af00223` → `b238351` → `c6c1334` → `1a43d01` → `3e22ea9` → `origin/main`  
> **容器**: 9/9 Healthy ✅  
> **覆盖范围**: Phase 13a / 13b / 13.5 / 14

---

## 一、总体概览

本整合报告覆盖从 Phase 13 到 Phase 14 的全部 8 次迭代交付，分为四大篇章：

| 篇章 | 阶段 | 核心主题 | 关键文件数 | Git 提交 |
|:---|:---|:---|:---|:---|
| **第一篇** | Phase 13a | 地图/清洗器/悬浮卡片/双轴滑槽 | 6 | `97e642f`, `fcac62d`, `42e17f9` |
| **第二篇** | Phase 13b | 设备分流/Sidebar鉴权/新建地图/装备碰撞 | 5 | `af00223`, `b238351`, `c6c1334` |
| **第三篇** | Phase 13.5 | 装备 cross-match + 黑屏防爆兜底 | 2 | `1a43d01` |
| **第四篇** | Phase 14 | 激活 conditionEvaluator 复合条件链 | 3 | `3e22ea9` |

---

## 第一篇：Phase 13a — 地图·清洗器·悬浮卡·双轴滑槽

### 1.1 地图编辑器加载存档 (NewBattlefieldView.vue)

**目标**: 地图编辑器支持加载已保存的地图

**实现**:
- 工具栏 `map-info-bar` 内新增 `🗺️ 加载旧地图` 下拉选择框
- `fetchMapFileList()`: onMounted 时调用 `mapAPI.getMapList()` 获取存档列表
- `onSelectMapFile()`: 选中后加载完整地图数据并反序列化应用到编辑器网格
- `loadMapData(data)`: 地形数据/名称/宽高 → 编辑器网格
- `extractTerrainId()` / `extractTerrainName()`: 统一地形读取适配器，兼容 Phase 9.5 对象和旧纯字符串

**API 端点**: `GET /api/map/list` → 扫描 `data/` 目录所有 `.json` 文件

### 1.2 地形数据清洗器 (NewBattleView.vue)

**问题**: 旧版地形使用纯字符串 `"forest"`，Phase 9.5 后升级为对象 `{ terrain_id, terrain_hp, is_destructible, ... }`

**实现**:
- `extractTerrainId(terrainVal)`: 统一提取 `terrain_id`（兼容字符串和对象）
- `sanitizeTerrainCell(cellValue)`: 将旧纯字符串 `"forest"` 升级为 Phase 9.5 标准对象
- `sanitizeBattlefieldCells(cells)`: 批量升级整个 cells 数组
- 所有 `cell?.terrain` 读取点全部改为 `extractTerrainId()` 适配器

**设计原则**: 纯辅助函数 → 不修改数据格式 → 零破坏性 → 向后兼容

### 1.3 悬浮可拖拽折叠卡片 (NewBattleView.vue)

**目标**: 行动面板 + 角色栏改为悬浮可拖拽的折叠卡片

**实现**:
- **右侧行动面板**: `<aside>` → `<div class="floating-card floating-action-panel">`
- **底部角色栏**: `.faction-boxes` → `<div class="floating-card floating-faction-panel">`
- **拖拽手柄**: 每个卡片顶部 `.drag-bar`，内含折叠/展开按钮
- **拖拽实现**: `mousedown` 记录偏移 → `mousemove` 更新 `left/top` → `mouseup` 释放
- **折叠**: `v-show="!cardCollapsed"` 切换可见性
- **CSS**: `position: fixed; z-index: 100` | 半透明玻璃质感背景

### 1.4 HexGridCanvas 双轴平移滑槽

**目标**: Canvas 视口注入 X/Y 滑槽，防止飞图

**实现**:
- Template: Canvas 外层注入 `.slider-panel` 含两个 `<input type="range">`（水平 140px / 垂直 100px）
- `getGridDims()`: 基于 ISO 参数 + 网格尺寸计算棋盘世界尺寸
- `getSliderRange()`: 动态计算 min/max 边界，随 scale 动态变化
- 100% 双向联动:
  - 滑槽拉动 → offset 修改 → `draw()`
  - 鼠标拖拽/滚轮/`zoomReset` → `syncSlidersFromOffset` 更新滑槽游标
- 样式: 底部居中，金橙主题，毛玻璃背景

### 1.5 热修复: SQLite 数据库查询

**问题**: `/api/map/list` 扫描 `data/*.json` 文件但数据存储在 SQLite `map.db` 的 `battlefields` 表中，永远返回空列表

**修复**:
- map-service: 替换 `fs/path` 导入为数据库查询
- 路由改为 `db.prepare('SELECT * FROM battlefields').all()` + `?id=X` 加载单个地图
- 前端同步修改 `filename` → `id`，`?file=` → `?id=`
- 验证: 返回 13 个战场地图 (id 1-13)

### 1.6 文件变更汇总

| 文件 | 变更量 | 内容 |
|:---|:---|:---|
| `NewBattlefieldView.vue` | +147 | 地图加载下拉 + 存档 API |
| `NewBattleView.vue` | +331 | terrainSanitizer + 悬浮卡片 |
| `map-service/src/index.js` | +60 | GET /api/map/list |
| `api/client.js` | +5 | mapAPI 客户端 |
| `HexGridCanvas.vue` | +145 | 双轴滑槽 |
| `GlossaryView.vue` | -1 | 修复孤立 `</div>` |

### 1.7 修复历程

| 问题 | 根因 | 修复 |
|:---|:---|:---|
| NewBattlefieldView 模板损坏 | 匹配了第一个按钮而非带 `showTerrainMgr` 的 | v2: 改用精确锚点匹配 |
| terrainMap 查找失败 | NewBattleView 使用 `cells` 数组 | 重写为辅助函数模式 |
| GlossaryView (551:5) Invalid end tag | 孤立 `</div>` | 删除 |
| mecha-map ReferenceError | `app.get()` 在 `express()` 之前 | 移 `const app = express()` 至路由之前 |
| /api/map/list 空列表 | 数据在 SQLite 而非文件 | 改为数据库查询 |
| centerGrid 检测失败 | 中间行有空行/注释 | v3: 跳过注释查找 |

---

## 第二篇：Phase 13b — 设备分流·鉴权·地图·装备碰撞

### 2.1 设备 UI 差异化定向分流 (Phase 13-A)

**目标**: 移动端和 PC 端使用独立战场容器

**新建文件**:
- `src/utils/deviceDetector.js`: 双因子设备判定
  - UA + `window.innerWidth` 组合判断
  - 768px 以下或触屏 UA → mobile
- `src/views/MobileBattleView.vue`: 移动端独立空白战场容器 (2338 bytes)

**路由改造** (`src/main.js` +30 lines):
- `/battle-pc/:id` → `NewBattleView` (PC 纯净硬核战场)
- `/battle-mobile/:id` → `MobileBattleView` (移动端独立战场)
- `/battle/:id` → 导航守卫自动分流重定向 (`redirectByDevice` meta)
- PC 端 `NewBattleView.vue` **零改动**，鼠标拾取/3D 透视/行动栏完全不受影响

### 2.2 Sidebar 指挥官鉴权联动

**目标**: Sidebar 支持退出登录闭环

**修改 (TheSidebar.vue + NewLoginView.vue)**:
- profile-info 右侧注入 `[↩ 退出]` 按钮
- `handleLogout()`:
  ```js
  localStorage.clear()       // 彻底清空 Token + user
  userStore.clearUser()      // 清空 Pinia 状态
  router.push('/login')      // 重定向回登录页
  ```
- 登录/注册成功后持久化:
  ```js
  localStorage.setItem('user', JSON.stringify(data.user))
  userStore.setUser(data.user)
  ```

### 2.3 新建地图 10-200 动态尺寸

**目标**: 地图编辑器支持创建 10×10 ~ 200×200 地图

**实现 (NewBattlefieldView.vue)**:
- 工具栏注入 `[➕ 新建地图]` 按钮
- Modal: 宽度/高度数字输入框 (`min="10" max="200"`，刚性验证)
- `createNewMap()`:
  1. 清空地形: `Object.keys(terrainMap).forEach(k => delete terrainMap[k])`
  2. 设置 `battlefield: { name, width, height }`
  3. `hexGrid.redraw()` → 滑槽自动重算边界

### 2.4 装备属性交叉碰撞 — damage_kind × weaponType 严格匹配

**问题**: `_calcArmorReduction` 遍历所有装备槽位但不校验 `equipment[slot].damage_kind` 与 `attacker.weaponType` 是否相同，导致光束盾错误抵挡实弹攻击。

**修改 (damagePipe.cjs +91/-22)**:

1. **_calcArmorReduction 完全重写**:
   - 仅遍历 `left_hand` / `right_hand` / `other` 三大防具槽位
   - 严格校验 `equipment[slot].damage_kind === attacker.weaponType`
   - 匹配 → 计入抗性；不匹配 → 该防具完全失效（含 breakdown 明细）
   - 无 `damage_kind` → 向后兼容通用装备
   - 返回值扩展为 `{ total, breakdown[] }`

2. **_calcDefense 同步修正**:
   - `defense_modifiers` 加入 `damage_kind` 属性匹配
   - 遍历三大槽位逐一校验

3. **calculate 方法调用点修正**: `-armorReduction` → `-(armorReduction.total || 0)`

### 2.5 文件变更汇总

| 文件 | 变更量 | 内容 |
|:---|:---|:---|
| `deviceDetector.js` | +30 | 双因子设备判定 (新文件) |
| `MobileBattleView.vue` | +50 | 移动端独立战场 (新文件) |
| `main.js` | +30 | 路由分流改造 |
| `TheSidebar.vue` | +60 | 退出登录闭环 |
| `NewLoginView.vue` | +30 | user 持久化 |
| `NewBattlefieldView.vue` | +30 | 新建地图弹窗 |
| `damagePipe.cjs` | +91/-22 | 装备交叉碰撞 |

---

## 第三篇：Phase 13.5 — 黑屏防爆兜底

### 3.1 整备室出击黑屏修复

**问题**: 从整备室出击进入战场时黑屏，只残留 background。根因: 旧版装备字段缺三槽位 DKM 对象引发 JS 运行时崩溃。

### 3.2 NewBattleView.vue: 装备 DKM 防爆器 (+138 lines)

- `sanitizeUnitEquipment(unit)`: 防御性空值反填
  - 每个槽位: `{ damage_kind_modifiers: { kinetic: 0, beam: 0, explosive: 0, corrosive: 0 } }`
- `sanitizeAllUnitsEquipment()`: 批量清洗 `battleState.units` + `deployPool`
- 注入点:
  - A1: sanitize 函数定义
  - A2: battleState 赋值后清洗
  - A3: loadDeployPool 后清洗部署池
  - A4: deployToHex 部署前清洗 unit_data
- `safeDrawBattleScene()`: `drawBattleScene` try/catch 包装，异常时 Canvas 显示错误信息
- `onMounted`: `window.error` + `unhandledrejection` 全局错误边界 (BattlefieldCRASH)
- terrainMap 二次清洗强化

### 3.3 damagePipe.cjs try/catch 加固

- `attacker.weaponType` 防御性取值
- 槽位遍历内 `try/catch` + `typeof` 类型检查 + `Number()` 显式转换

### 3.4 修复汇总

| 文件 | 变更量 | 内容 |
|:---|:---|:---|
| `NewBattleView.vue` | +138 | 装备 DKM 防爆器 + 全局错误边界 |
| `damagePipe.cjs` | +15/-8 | _calcArmorReduction try/catch 加固 |

---

## 第四篇：Phase 14 — 激活 conditionEvaluator 复合条件链

### 4.1 问题诊断

- `conditionEvaluator.evaluate()` 虽有结构化 `{required/any/not}` 支持，但不支持技能配置的**平铺格式**
- `skillExecutor` 用硬编码 `if` 检查 `requires_unmoved` / `requires_stealth`，无法支持**复合条件**
- 前端词条工厂缺少 `requires_hp_below` / `target_on_terrain` 字段

### 4.2 conditionEvaluator.cjs 完全重写

#### 4.2.1 evaluate() 双格式自动检测

```
skill配置传入 conditions
        │
        ├── !required && !any && !not && !check → evaluateFlat() [新·平铺格式]
        │   ├── requires_hp_below: unit.hp < 50?
        │   ├── requires_unmoved: !unit.has_moved?
        │   ├── target_on_terrain: target.terrain === "water"?
        │   ├── requires_stealth: unit.stealth?
        │   └── ALL pass → true, any fail → false
        │
        └── 有结构化格式 → 原有逻辑
            ├── conditions.required → evaluateAnd()
            ├── conditions.any → evaluateOr()
            └── conditions.not → !evaluate()
```

#### 4.2.2 evaluateFlat() 平铺条件链

- 遍历 `conditions` 对象的所有键值对
- `flatConditionKeys` 白名单过滤（仅 4 个条件字段被识别）
- 所有条件 **AND 短路评估**

#### 4.2.3 新增 checker

| Checker | 触发键 | 逻辑 | 跳过条件 |
|:---|:---|:---|:---|
| HP 阈值 | `requires_hp_below` | `unit.hp < value` | value=0 |
| 未移动 | `requires_unmoved` | `unit.has_moved !== true` | value=false |
| 目标地形 | `target_on_terrain` | `target.terrain === value` | value="" |
| 潜行状态 | `requires_stealth` | `unit.stealth === true` | value=false |

#### 4.2.4 registerChecker() 扩展机制

新 checker 通过 `registerChecker(key, callback)` 注册，自动加入 `flatConditionKeys` 白名单。

### 4.3 skillExecutor.cjs 改造 (+19/-4)

- 引入 `ConditionEvaluator`
- `executeUniversalSkill` 构建 `condContext({ context: { unit, target, targetTerrain, battleState } })`
- `ConditionEvaluator.evaluate(cfg, condContext)` 统一评估
- 移除硬编码的 `requires_unmoved` / `requires_stealth` if 检查

### 4.4 GlossaryView.vue 前端词条工厂 (+24)

- **Step 1 主语**: 新增 `requires_hp_below` 数字输入 (0=不限)
- **Step 1 主语**: 新增 `target_on_terrain` 地形下拉选择 (10 种地形)
- `wizardForm` reactive / `toggleWizard` reset / `commitWizardSkill` 全部同步新字段

### 4.5 测试结果: 30/30 PASS

| 测试组 | 内容 | 状态 |
|:---|:---|:---|
| T1 | `requires_hp_below`: HP<50 通过, HP=60 拒绝, 0 跳过 | ✅ |
| T2 | `requires_unmoved`: 未移动通过, 已移动拒绝 | ✅ |
| T3 | `target_on_terrain`: 水域通过, 森林拒绝, 空跳过 | ✅ |
| T4 | **三条件复合 AND**: 水战 (HP<50 + 未移动 + 水域) | ✅ |
| T5 | 混合配置: label/base_damage 等非条件字段被忽略 | ✅ |
| T6 | **向后兼容**: 结构化 `{required: [{check:...}]}` | ✅ |
| T7 | 空条件: null/undefined/{} | ✅ |
| T8-T10 | evaluateFlat 直接调用、单 check、requires_stealth | ✅ |

### 4.6 文件变更汇总

| 文件 | 变更量 | 内容 |
|:---|:---|:---|
| `conditionEvaluator.cjs` | 完全重写 | 平铺格式 + 4 新 checker |
| `skillExecutor.cjs` | +19/-4 | ConditionEvaluator 替换硬编码 |
| `GlossaryView.vue` | +24 | Step1 新增 HP 阈值 + 目标地形 |

---

## 五、Git 全提交链

```
3e22ea9  Phase 14: 激活 conditionEvaluator 复合条件链与多重造句真机测试入口
1a43d01  Phase 13.5: 黑屏防爆双重兜底 (equipment DKM + global error boundary)
c6c1334  Phase 13.5: 装备属性交叉碰撞 — damage_kind × weaponType 严格匹配
b238351  Phase 13.5: Sidebar 鉴权联动 + 新建地图 10-200 动态尺寸
af00223  Phase 13-A: 设备 UI 差异化定向分流 (PC/Mobile 独立战场)
42e17f9  Phase 13: 清理备份文件
fcac62d  Phase 13 hotfix: /api/map/list 改为 SQLite 数据库查询
97e642f  Phase 13: 补丁战役 — 地图列表/地形清洗器/悬浮可拖拽卡片
7b9ccb4  Phase 12: 装备管线收束 & 手动摇骰闭环 & AI 导入
```

---

## 六、核心架构总览

### 6.1 条件链体系（Phase 14 里程碑）

```
词条工厂 (GlossaryView)
   │
   │  用户分步向导输入:
   │    requires_hp_below: 50
   │    requires_unmoved: true
   │    target_on_terrain: "water"
   │
   ▼
技能配置 JSON (glossary-skill-config.json)
   │
   ▼
executeUniversalSkill() → 构建 condContext
   │
   ▼
ConditionEvaluator.evaluate()
   │
   ├── 平铺格式 → evaluateFlat()
   │   ├── requires_hp_below ✓
   │   ├── requires_unmoved ✓
   │   └── target_on_terrain ✓
   │       └── ALL pass? → 放行技能
   │
   └── 结构化格式 → evaluateAnd/Or/Not
       └── 向后兼容 Phase 8-12 全部词条
```

### 6.2 装备抗性交叉碰撞体系（Phase 13b 里程碑）

```
攻击方 weaponType: "beam"
        │
        ▼
_calcArmorReduction / _calcDefense
        │
        ├── left_hand:  damage_kind="beam" → dampen 0.5  ✅ 匹配生效
        ├── right_hand: damage_kind="kinetic" → dampen 0.3 ❌ 不匹配失效
        └── other:      无 damage_kind → 通用装备
                             │
                             ▼
                    totalReduction = 0.5
                    breakdown: [left_hand: 0.5, right_hand: 0(skipped)]
```

---

## 七、完整文件变更矩阵

| 文件 | Phase 13a | Phase 13b | Phase 13.5 | Phase 14 | 行总计 |
|:---|:---|:---|:---|:---|:---|
| `NewBattlefieldView.vue` | +147 | +30 | — | — | **+177** |
| `NewBattleView.vue` | +331 | — | +138 | — | **+469** |
| `HexGridCanvas.vue` | +145 | — | — | — | **+145** |
| `damagePipe.cjs` | — | +91/-22 | +15/-8 | — | **+76** |
| `conditionEvaluator.cjs` | — | — | — | 完全重写 | **~150** |
| `skillExecutor.cjs` | — | — | — | +19/-4 | **+19** |
| `GlossaryView.vue` | -1 | — | — | +24 | **+23** |
| `TheSidebar.vue` | — | +60 | — | — | **+60** |
| `MobileBattleView.vue` | — | +50 | — | — | **+50** (新) |
| `main.js` | — | +30 | — | — | **+30** |
| `NewLoginView.vue` | — | +30 | — | — | **+30** |
| `deviceDetector.js` | — | +30 | — | — | **+30** (新) |
| `map-service/src/index.js` | +60 | — | — | — | **+60** |
| `api/client.js` | +5 | — | — | — | **+5** |
| **合计** | | | | | **~1,324** |

---

## 八、容器清单 (9/9 Healthy)

| 容器 | 端口 | 状态 |
|:---|:---|:---|
| `mecha-frontend` | 8081 | ✅ Healthy, HTTP 200 |
| `mecha-combat` | 3004 | ✅ Healthy |
| `mecha-map` | — | ✅ Healthy |
| `mecha-online-battle` | — | ✅ Healthy |
| `mecha-hangar` | — | ✅ Healthy |
| `mecha-comm` | — | ✅ Healthy |
| `mecha-auth` | — | ✅ Healthy |
| `mecha-battle-db` | — | ✅ Healthy |
| `nginx-ssl` | — | ✅ Running |

---

## 九、关键设计原则

1. **零破坏向后兼容**: 所有 9 大原有技能不受影响，结构化格式与平铺格式共存
2. **防爆兜底文化**: 装备 DKM 空值反填 + try/catch 包装 + 全局错误边界
3. **设备隔离**: PC 端和移动端独立路由和容器，互不干扰
4. **条件链白名单机制**: `flatConditionKeys` 确保非条件字段不会误判
5. **装备严格交叉匹配**: `damage_kind × weaponType` 一一对应，不匹配则防具完全失效

---

## 十、后续建议

1. **词条工厂条件链完整测试**: 创建多个复合条件技能，端到端战斗验证
2. **手动摇骰 WebSocket 完整闭环**: `combatResolver` 真正挂起等待 WebSocket 响应
3. **AI 技能大批量生成**: 利用 Phase 11 生成器 + Phase 12 导入批量膨胀技能库
4. **移动端战场开发**: `MobileBattleView.vue` 目前占位，需填充独立触控交互
5. **装备 dkm 可视化**: 战场端显示敌方装备伤害抗性
6. **地图缩略图预览**: 加载下拉中显示地形布局缩略图
