# Phase 19 终极会战总结报告

**执行时间**: 2026-06-22 09:29–09:50  
**修改文件**: 4 个代码文件 + 1 个新建文档  
**构建**: frontend 120 modules, 0 errors; combat-service rebuilt  
**部署**: 8/8 Healthy, 7/7 验证通过

---

## 一、修改清单

| # | 文件 | 修改性质 | 行数变化 |
|---|------|----------|----------|
| 1 | `NewHomeView.vue` | 新增 2 张大卡片 + 清理 CSS 悬挂选择器 | +45 / -10 |
| 2 | `skillExecutor.cjs` | dice_ranges 多档位分段骰系统 | +40 / -10 |
| 3 | `CampaignView.vue` | 战术沙盒前置准备界面完整重写 | +210 / -70 |
| 4 | `NewBattleView.vue` | 新增 sanitizeBattlefieldCells + 调用点 | +45 / -0 |
| 5 | `高频重复故障自查与修复红线资料库.md` | **新建** | +310 |

---

## 二、各模块详解

### 模块一: NewHomeView 首页修复

**问题**: Phase 16 规定的"词条造词工厂"和"剧情模式战役"两张卡片从未出现在首页上。

**修复**:
1. **新增 📖 词条造词工厂卡片** — 路由 `/glossary`
   - 图标: 勾选盾牌 SVG
   - 描述: "查阅全部机甲技能、地形特性与战斗机制的完整百科词条库"
   - 按钮: "查阅"

2. **新增 🌋 剧情模式战役卡片** — 路由 `/campaign`
   - 图标: 爆炸核心 SVG
   - 描述: "进入单机沙盒战场，自定义地形与守军配置，体验高强度机甲对抗"
   - 按钮: "出征"

3. **清理 CSS 悬挂选择器**: 删除第 111-118 行 7 个无 `{ }` 的空选择器（`.log-entry.log-move` 等死代码），消除 CSS 解析风险

**结果**: 首页从 2 张卡片 → 4 张卡片，布局 2×2 网格

### 模块二: skillExecutor.cjs 多档位分段骰系统

**问题**: 旧 `_evaluateDice` 仅支持单一 `success_line` 阈值（如 ≥4=成功），无法表达"miss / hit / critical"等多级效果。

**修复**:

1. **新增 `dice_ranges` 数组支持**:
   ```javascript
   // 技能 JSON 配置
   {
     "dice_type": "1d8",
     "dice_ranges": [
       { "min": 1, "max": 3, "action": "miss", "bonus_damage": 0 },
       { "min": 4, "max": 6, "action": "hit", "bonus_damage": 10 },
       { "min": 7, "max": 8, "action": "critical", "bonus_damage": 25, "damage_multiplier": 1.5 }
     ]
   }
   ```

2. **区域命中判定**: 掷骰结果 `roll` 落在哪个 `[min, max]` 区间 → 返回该区间的 `bonus_damage` 和 `damage_multiplier`

3. **向后兼容**: `dice_ranges` 不存在时，降级为传统 `success_line` 单阈值模式

4. **消息构建升级**: dice_ranges 模式下显示 `掷1d8=7 [critical]`，传统模式仍显示 `掷1d6=5>=4`

5. **`_getUniversalFields` 更新**: 新增 `dice_ranges` 字段透传

### 模块三: CampaignView.vue 战术沙盒前置舱

**问题**: 点击"出征"直接进入战斗，地形固定，敌军固定，缺乏自定义能力。

**新增三模式流程**:

```
模式1: 战役选择列表 (v-if="!inBattle && !showSandbox")
  ↓ 点击战役卡片
模式2: 战术沙盒前置准备 (v-if="showSandbox") ← NEW
  ├─ 地形生态自选区 → 从 /api/map/list 加载 13+ 张 SQLite 地图
  ├─ 守军单位自选区 → 6 种机型模版 × 名称/等级/阵营自由配置
  └─ 确认出征按钮 → POST /api/campaign/:id/start { map_id, playerUnits, enemyUnits }
  ↓ 后端动态组装战场
模式3: 战斗界面 (v-if="inBattle") — 保留原有完整逻辑
```

**关键实现细节**:

1. **地图下拉列表**:
   - `selectCampaign()` 触发后异步请求 `/api/map/list`
   - 失败时降级为默认地图 `[{ id: 1, name: '默认战场', width: 20, height: 30 }]`

2. **守军自选**:
   - 6 种预设模板: `sentry_beam / scout_water / heavy_kinetic / assassin_corrosive / commander_beam / artillery_explosive`
   - 支持动态添加到移除 (`addEnemySlot` / `removeEnemySlot`)
   - 每个槽位可自定义: 机型模版、名称、等级(1–20)、阵营

3. **`confirmDeploy()` 提交**:
   - 构建完整 `playerUnits` (含 DKM 三槽位 `damage_kind_modifiers`)
   - 从 `ENEMY_TEMPLATES` 生成完整敌军 unit 对象（含装备 DKM）
   - `POST /api/campaign/:id/start` 携带 `{ playerUnits, enemyUnits, map_id }`
   - 成功 → `showSandbox = false; inBattle = true`

### 模块四: sanitizeBattlefieldCells 防线

**问题**: 虽然 `sanitizeBattlefieldTerrain()` 已存在，但没有一个显式命名的 cells 级清洗函数。

**修复**:

1. **新增 `sanitizeBattlefieldCells()`**: 
   - 遍历 `battleState.cells` 数组，逐格调用 `sanitizeTerrainCell`
   - cells 不存在时从 `battleState.terrain` 重建（保障 `drawBattleScene` 有数据可绘）
   - 在 `sanitizeBattlefieldTerrain()` 之后立即调用，双重保障

2. **调用点**: `onMounted` 第 2545 行 → 第 2547 行（所有出击/硬导航流必经路径）

### 模块五: 高频重复故障自查与修复红线资料库

**新建文件**: `高频重复故障自查与修复红线资料库.md` (根目录)

**内容覆盖**:

| 章节 | 红线 | 案例数 | 诊断工具 |
|------|------|--------|----------|
| 红线 #1 | Canvas 白屏/黑屏/不显示 | ≥5 次 | CSS 孤悬检查、路由竞争诊断、错误边界范式 |
| 红线 #2 | 部署/出击数据链熔断 | ≥4 次 | DKM 三槽位完整性检查、双防线策略 |
| 红线 #3 | 坐标错位与视觉漂移 | ≥3 次 | CTM 矩阵成员表、screenY 公式审计 |

每条红线包含:
- 典型症状描述
- 排查公式（逻辑表达式）
- 多个子类（A/B/C/D），每子类含 自查诊断 + 标准修复范式
- 代码示例（含 ❌ 错误 vs ✅ 修复对比）

通用防复发检查表:
- 新增组件检查 (5 项)
- 提交单位数据检查 (3 项)
- 修改坐标代码检查 (3 项)
- 部署检查 (5 项)

---

## 三、部署验证

### 构建记录

| 组件 | 模块数 | 错误数 | 时间 |
|------|--------|--------|------|
| frontend (vite) | 120 | 0 | 1.07s |
| combat-service (docker) | — | 0 | 13.4s |

### Docker 镜像

| 服务 | 新镜像 SHA |
|------|-----------|
| frontend | `0ab2dcf17d4b` |
| combat-service | `2d57eccc604b` |

### 容器健康

| 容器 | 状态 |
|------|------|
| mecha-frontend | healthy ✅ |
| mecha-combat | healthy ✅ |
| mecha-map | healthy ✅ |
| mecha-hangar | healthy ✅ |
| mecha-comm | healthy ✅ |
| mecha-auth | healthy ✅ |
| mecha-online-battle | healthy ✅ |
| mecha-battle-db | healthy ✅ |

### JS Bundle 验证 (7/7)

| 搜索词 | 命中 | 说明 |
|--------|------|------|
| `词条造词工厂` | 1 | Glossary 卡片已部署 |
| `剧情模式战役` | 1 | Campaign 卡片已部署 |
| `战术沙盒前置准备` | 1 | 沙盒 UI 已部署 |
| `sanitizeBattlefieldCells` | 2 | Cells 清洗器已部署 |
| `battle-pc` | 3 | 硬导航已部署 |

### Combat 容器验证

| 搜索词 | 命中 | 说明 |
|--------|------|------|
| `dice_ranges` | 7 | 分段骰引擎已部署 |
| `rangeLabel` | 1 | 分段标签消息已部署 |
| `rangeDamageMultiplier` | 1 | 分段伤害倍率已部署 |

---

## 四、关键教训

1. **首页卡片是"游戏体验的正门"** — 缺失的词条/战役卡片意味着新用户甚至不知道这些功能存在，是最严重的 UX 断崖

2. **`dice_ranges` 是技能设计的分水岭** — 从单阈值到多档位的跃迁，让"命中/擦伤/暴击/致命一击"成为可配置的粒度，而非硬编码在代码里

3. **沙盒前置舱是单机模式的核心差异化体验** — 允许玩家自选地图+守军，将教学关卡从"被动观看"变为"主动实验"

4. **红线资料库是项目的生存证词** — Phase 9–18 共 17 个总结报告，其中至少 3 个故障在同一类别重复出现。这些血泪不记下来，Phase 20 还会犯相同的错

5. **双防线 + 双镜像** — 前端 2 服务 + 后端 2 函数，每层都至少要有一个兜底。`sanitizeBattlefieldCells` 和 `sanitizeBattlefieldTerrain` 的关系就是这种理念的体现
