# 🏭 Phase 9: 关卡效能大跃进 — Old School 落地报告

```
┌─────────────────────────────────────────────────────────────┐
│  ██████╗ ██╗  ██╗ █████╗ ███████╗███████╗     █████╗       │
│  ██╔══██╗██║  ██║██╔══██╗██╔════╝██╔════╝    ██╔══██╗      │
│  ██████╔╝███████║███████║███████╗█████╗      ███████║      │
│  ██╔═══╝ ██╔══██║██╔══██║╚════██║██╔══╝      ██╔══██║      │
│  ██║     ██║  ██║██║  ██║███████║███████╗    ██║  ██║      │
│  ╚═╝     ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚══════╝    ╚═╝  ╚═╝      │
│                                                             │
│    关卡效能大跃进：批量地形刷 + 自定义地形库 + 视口死锁 + 可破坏环境 │
│    Build: Phase 9 — 2026-06-20 19:24 CST                    │
└─────────────────────────────────────────────────────────────┘
```

---

## ✅ 部署结果

| 指标 | 结果 |
|------|------|
| **前端构建** | ✅ 115 modules, 0 errors |
| **前端 JS** | `index-DSldZ0qA.js` (296.8 KB) |
| **前端 CSS** | 99.4 KB |
| **后端构建** | ✅ combat-service Docker image |
| **容器状态** | 9/9 Healthy |
| **HTTP** | 200 OK |

---

## 📋 四大功能模块详解

### Feature 1: 坐标区间批量地形修改器

#### 问题
原先地图编辑器的地形刷只能逐格点选，设计一张大图需要点击数百次。DM 需要一种快速铺地形的方式——跟 Excel 区域填充一样。

#### 方案
在 `NewBattlefieldView.vue` 地形调色板下方添加批量操作面板。

#### 修改文件
- **NewBattlefieldView.vue** (646 → 957 lines): +311 行

#### 新增模板

```html
<div class="batch-panel">
  <div class="batch-title">[ 区间批量修改 ]</div>
  <div class="batch-row">
    <label>起点</label>
    <input v-model.number="batchStartQ" type="number" placeholder="Q" />
    <input v-model.number="batchStartR" type="number" placeholder="R" />
    <label>终点</label>
    <input v-model.number="batchEndQ" type="number" placeholder="Q" />
    <input v-model.number="batchEndR" type="number" placeholder="R" />
  </div>
  <div class="batch-row">
    <select v-model="batchTerrain">
      <option v-for="t in allTerrainTypes" :key="t.id" :value="t.id">{{ t.name }}</option>
    </select>
    <button class="btn-batch" @click="applyBatchTerrain">批量修改</button>
    <span v-if="batchResult" class="batch-result">{{ batchResult }}</span>
  </div>
</div>
```

#### 核心逻辑

```javascript
function applyBatchTerrain() {
  const sq = Math.min(batchStartQ.value, batchEndQ.value)
  const eq = Math.max(batchStartQ.value, batchEndQ.value)
  const sr = Math.min(batchStartR.value, batchEndR.value)
  const er = Math.max(batchStartR.value, batchEndR.value)
  let count = 0
  for (let r = sr; r <= er; r++) {
    for (let q = sq; q <= eq; q++) {
      if (q >= 0 && q < gridW.value && r >= 0 && r < gridH.value) {
        terrainMap[`${q},${r}`] = batchTerrain.value
        count++
      }
    }
  }
  batchResult.value = `已修改 ${count} 个格子为 ${batchTerrain.value}`
  hexGrid.value?.redraw()
  addLog('batch', `区间[${sq},${sr}]→[${eq},${er}] 地形 → ${batchTerrain.value} (${count}格)`)
}
```

#### 状态变量

| 变量 | 类型 | 说明 |
|------|------|------|
| `batchStartQ/R` | ref(0) | 区间起点坐标 |
| `batchEndQ/R` | ref(0) | 区间终点坐标 |
| `batchTerrain` | ref('moon') | 填充的地形类型 |
| `batchResult` | ref('') | 操作结果反馈 (3 秒自动消失) |

---

### Feature 2: 自定义地形库 CRUD

#### 问题
地形类型硬编码在前端，DM 无法创建新地形或修改属性（如防御加成、移动消耗）。

#### 方案
在 `glossary-skill-config.json` 中新增 `terrains` 节点，前端增加地形管理弹窗，打通后端读写。

#### 修改文件

| 文件 | 改动 |
|------|------|
| `glossary-skill-config.json` | +`terrains` 节点 (8 种地形) |
| `NewBattlefieldView.vue` | +地形管理弹窗模板、状态、方法、CSS |
| `configLoader.cjs` | 已有 `saveGlossaryConfig()` 支持深度合并 |

#### 8 种预置地形

| Key | 名称 | color | move_cost | defense_bonus | is_destructible | max_hp | destroyed→ |
|-----|------|-------|-----------|---------------|-----------------|--------|------------|
| `moon` | 月面 | #c0c0c0 | 1 | 0 | ❌ | 0 | moon |
| `plain` | 平原 | #7a9b4f | 1 | 0 | ❌ | 0 | plain |
| `mountain` | 山地 | #8b7355 | 3 | +20 | ❌ | 0 | mountain |
| `water` | 水域 | #4682b4 | 99 | -10 | ❌ | 0 | water |
| `forest` | 森林 | #2d5a27 | 2 | +15 | ✅ | 3 | plain |
| `fortress` | 堡垒 | #4a4a6a | 1 | +30 | ✅ | 5 | plain |
| `ruins` | 废墟 | #696969 | 2 | +10 | ❌ | 0 | ruins |
| `crystal` | 晶矿 | #7b68ee | 2 | +5 | ✅ | 2 | plain |

#### 地形管理弹窗功能

- `loadTerrainDefinitions()`: 从 `GET /api/combat/glossary-config` 拉取全量地形
- `addTerrainType()`: 输入新 KEY → 添加默认地形条目
- `deleteTerrainType(key)`: confirm 后删除
- `saveTerrainConfig()`: POST 全量配置到后端，`_meta.version` → 4.0
- 工具栏按钮: `[ 地形管理 ]` → `showTerrainMgr = true`

---

### Feature 3: R=0 视口水平死锁

#### 问题
等距投影中，shearY 导致 R=0 行产生倾斜，棋盘坐标系不与屏幕水平/垂直对齐。

#### 方案
在 CTM 管道中增加旋转补偿，确保 R=0 行始终水平于画布。

#### 修改文件
- **HexGridCanvas.vue** (530 → 561 lines): +31 行

#### 核心数学

```
渲染管线: ctx.rotate(rotRad) → ctx.transform(scaleX, shearY, shearX, scaleY)
  旋转角 rotRad = rotationAngle × π / 180 (默认 -24°)
  
逆运算(点击): 
  先 ÷ scale 逆 CTM 
  → 再 rotate(-rotRad) 逆旋转 
  → 得到纯六角坐标
```

#### 具体改动

| # | 位置 | 改动 |
|---|------|------|
| 1 | props | 新增 `isoRotation: { type: Number, default: -24 }` |
| 2 | state | 新增 `const rotationAngle = ref(-24)` |
| 3 | draw() CTM | `ctx.rotate(rotRad)` 在 shear transform 之前 |
| 4 | canvasPosToWorld | 反向旋转 undo: `finalX = cosR×flatX - sinR×flatY` |
| 5 | centerGrid() | 旋转补偿后的棋盘中心计算 |
| 6 | watch | `isoRotation` prop 变化 → rotationAngle 同步 → redraw |
| 7 | defineExpose | 暴露 `rotationAngle` 供外部调整 |

---

### Feature 4: 可破坏环境单元生命周期

#### 问题
地形只是静态贴图，攻击不会改变环境。棋子在森林/堡垒中无法获得战术反馈。

#### 方案
实现完整的地形破坏管线：攻击 → terrain_hp 扣减 → hp≤0 触发 destroy → 地形变换。

#### 修改文件

| 文件 | 改动 |
|------|------|
| `skillExecutor.cjs` | +4 地形方法 (198 行) |
| `battles.js` | +`terrain_hp: {}` 状态初始化 |

#### 新增四大方法

```javascript
_getTerrainConfig()          // 从 glossary-skill-config.json 读取 terrains 配置
_applyTerrainDamage(unit, targetCell, damage, battleState)
  // → { terrainDestroyed, newTerrain, message }
  //  扣 terrain_hp[key] -= damage
  //  hp ≤ 0 → terrain[key] = destroyed_transform_to
_getTerrainDefenseBonus(cellQ, cellR, terrainMap)  // 查询格子防御修正
_getTerrainMoveCost(cellQ, cellR, terrainMap)      // 查询格子移动消耗
```

#### 可破坏地形生命周期

```
攻击命中 → _applyTerrainDamage(targetCell, damage)
              │
              ├─ is_destructible=false → 无效果
              │
              └─ is_destructible=true
                    │
                    ├─ terrain_hp[key] 初始化 = max_hp
                    ├─ terrain_hp[key] -= damage
                    ├─ hp > 0 → "受损: 2/3"
                    └─ hp ≤ 0 → "被摧毁！→ 平原"
                          terrain[key] = destroyed_transform_to
                          delete terrain_hp[key]
```

#### 全局导出

```javascript
function getTerrainConfig() { return getGlossaryConfig()?.terrains || {} }
function evaluateTerrainDestruction(cellQ, cellR, damage, battleState) { ... }
```

---

## 🔧 补丁文件清单

| 文件 | 位置 | 功能 |
|------|------|------|
| `patch1_batch_terrain.py` | combat-patches/phase9/ | 批量地形修改器 |
| `patch2_terrain_crud.py` | combat-patches/phase9/ | 自定义地形库 CRUD |
| `patch3_horizon_lock.py` | combat-patches/phase9/ | R=0 视口水平死锁 |
| `patch4_destructible_terrain.py` | combat-patches/phase9/ | 可破坏环境单元 |
| `fix_terrain_methods.py` | combat-patches/phase9/ | SkillExecutor 地形方法注入 |
| `run_all.sh` | combat-patches/phase9/ | 一键执行脚本 |

---

## 🧪 验证测试

### 可破坏地形测试

```
> forest(hp=3) 受击 1+2=3 
  → terrain_hp[2,2] = 0 
  → trigger destruction 
  → terrain[2,2] = "plain" ✅
```

### 8 种地形全量加载

```
moon / plain / mountain / water / forest / fortress / ruins / crystal ✅
```

### glossary-config 版本

```
version: 4.0, 9 skills + 8 terrain types
```

---

## 🔑 使用说明

### 批量铺地形
1. 在地图编辑器左侧调色板下方找到 `[ 区间批量修改 ]`
2. 输入起点 (Q,R) 和终点 (Q,R)
3. 选择目标地形类型
4. 点击「批量修改」

### 管理地形库
1. 点击工具栏 `[ 地形管理 ]` 按钮
2. 编辑地形属性（名称/颜色/移动消耗/防御/可破坏）
3. 点击「保存地形库」

### 可破坏机制
- `is_destructible=true` 的地形（森林/堡垒/晶矿）被攻击会扣 HP
- HP 归零后变换为 `destroyed_transform_to` 指定的地形
- `max_hp` 越高需要越多次攻击才能摧毁

---

## 📌 设计原则

> **"关卡 = 棋盘 × 规则"**
> 批量刷笔解放了 DM 的双手，自定义地形库打通了规则的创造力，
> 视口死锁保证了数学上的精确性，可破坏环境让棋盘本身变成了动态战场。
>
> 从这一阶段开始，地图不再是静态背景，而是可交互、可破坏、可自定义的关卡元素。

---

*Generated: 2026-06-20 23:47 CST | Phase 9 — 关卡效能大跃进*
