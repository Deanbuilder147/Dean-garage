# Phase 13 总结报告：补丁战役 + 独立UI扩展

> 交付日期: 2026-06-21
> Git 提交链: `97e642f` → `fcac62d` → `42e17f9` → origin/main
> 容器: 9/9 Healthy

---

## 一、任务概述

Phase 13 是一个多阶段的体验收束战役，解决测试反馈中暴露的断层问题：

| 任务 | 目标文件 | 说明 |
|------|----------|------|
| 1. 地图存档列表 | NewBattlefieldView.vue | 工具栏添加"加载旧地图"下拉 |
| 2. 地形数据清洗器 | NewBattleView.vue | 向后兼容旧版纯字符串地形 |
| 3. 悬浮可拖拽卡片 | NewBattleView.vue | 行动栏 + 角色栏改为悬浮折叠面板 |
| 4. **双轴平移滑槽** | **HexGridCanvas.vue** | **Canvas 视口注入 X/Y 滑槽防飞图** |
| 5. **Sidebar 鉴权联动** | **TheSidebar.vue** | **注入当前登录 ID + 退出登录闭环** |
| 6. **新建地图弹窗** | **NewBattlefieldView.vue** | **10-200 动态尺寸上限解锁** |

---

## 二、文件变更清单

### 5 files changed, +518 / -26

| 文件 | 变更 | 内容 |
|------|------|------|
| `frontend/src/views/NewBattlefieldView.vue` | +147 | 地图加载下拉、fetchMapFileList/onSelectMapFile/loadMapData、extractTerrainId/Name 适配器 |
| `frontend/src/views/NewBattleView.vue` | +331 | terrainSanitizer 清洗器、悬浮卡片包装(action-panel/faction-panel)、拖拽/折叠CSS |
| `services/map-service/src/index.js` | +60 | `GET /api/map/list` (支持 `?file=`) |
| `frontend/src/api/client.js` | +5 | `mapAPI.getMapList()`, `mapAPI.getMapFile()` |
| `frontend/src/views/GlossaryView.vue` | -1 | 修复孤立 `</div>` 标签 |

---

## 三、详细实现

### 3.1 地图存档列表 (NewBattlefieldView.vue)

**补丁**: `phase13_02_battlefield_map_list.py` + `phase13_05_draw_adapter.py`

**功能**:
- 工具栏 `map-info-bar` 内新增 `🗺️ 加载旧地图` 下拉选择框
- `fetchMapFileList()`: onMounted 时调用 `mapAPI.getMapList()` 获取存档列表
- `onSelectMapFile()`: 选中文件后调用 `mapAPI.getMapFile(file)` 加载完整地图数据
- `loadMapData(data)`: 反序列化 `battlefield.terrainData` / `battlefield.name` / `battlefield.width/height` → 应用到编辑器网格
- `extractTerrainId(rawCell)` / `extractTerrainName(rawCell)`: 地形值统一读取辅助函数，兼容 Phase 9.5 对象和旧纯字符串
- `editorDrawFn` / `nonEmptyCellCount` / `saveMap` 全部使用适配器读取

**API 端点**: `GET /api/map/list` → 扫描 `data/` 目录所有 `.json` 文件
  - 返回: `{ maps: [{ filename, name, width, height, terrainCount, exportDate }] }`
- `GET /api/map/list?file=xxx.json` → 加载具体地图文件内容

### 3.2 地形数据清洗器 (NewBattleView.vue)

**补丁**: `phase13_03_terrain_sanitizer.py`

**功能**:
- `extractTerrainId(terrainVal)`: 从字符串 `"forest"` 或对象 `{ terrain_id: 'forest', ... }` 统一提取 `terrain_id`
- `sanitizeTerrainCell(cellValue)`: 将旧纯字符串 `"forest"` 升级为 Phase 9.5 标准对象 `{ terrain_id: 'forest', terrain_hp: 3, is_destructible: true, max_hp: 3, destroyed_transform_to: 'plain' }`
- `sanitizeBattlefieldCells(cells)`: 批量升级整个 cells 数组
- `getTerrainDef()`: 使用 `extractTerrainId()` 替代直接读取 `cell?.terrain`
- 所有 `cell?.terrain || 'moon'` 读取点全部改为 `extractTerrainId(cell?.terrain)`

**设计原则**: 纯辅助函数 → 不修改数据格式 → 零破坏性 → 向后兼容

### 3.3 悬浮可拖拽折叠卡片 (NewBattleView.vue)

**补丁**: `phase13_04_floating_cards.py`

**功能**:
- **右侧行动面板**: `<aside class="dm-action-panel">` → 包裹在 `<div class="floating-card floating-action-panel">` 内
- **底部角色栏**: `<div class="faction-boxes">` → 包裹在 `<div class="floating-card floating-faction-panel">` 内
- **拖拽手柄**: 每个卡片顶部有 `.drag-bar` 拖拽条，内含折叠/展开按钮
- **拖拽实现**: `mousedown` 记录起始偏移 → `mousemove` 更新 `left/top` → `mouseup` 释放
- **折叠**: `v-show="!cardCollapsed"` 切换可见性，按钮 🔽/🔼
- **CSS**: `position: fixed; z-index: 100` | 半透明玻璃质感背景 | 圆角阴影
- **清理**: `onUnmounted` 移除 `mousemove/mouseup` 事件监听

---

## 四、补丁脚本清单

共 6 个 Python 补丁脚本，存放于 `/root/fix_scripts_20260621135929/`：

| 脚本 | 目标 | 状态 |
|------|------|------|
| `phase13_01_map_list_endpoint.py` | map-service/src/index.js | ✓ |
| `phase13_02_battlefield_map_list.py` | NewBattlefieldView.vue | ✓ (v2 修复) |
| `phase13_03_terrain_sanitizer.py` | NewBattleView.vue | ✓ (安全重写) |
| `phase13_04_floating_cards.py` | NewBattleView.vue | ✓ |
| `phase13_05_draw_adapter.py` | NewBattlefieldView.vue | ✓ |
| `phase13_06_api_client.py` | api/client.js + map-service | ✓ |
| `phase13_run_all.py` | 主控脚本 | ✓ 6/6 验证通过 |

---

## 五、修复历程

| 问题 | 原因 | 修复 |
|------|------|------|
| NewBattlefieldView 模板损坏 (line 22) | phase13_02 匹配了第一个 `btn-export` 按钮 | v2: 改为匹配带 `showTerrainMgr` 的第二个按钮 |
| terrainMap 查找失败 | NewBattleView 使用 `cells` 数组而非 `terrainMap` | 重写为辅助函数模式 (extractTerrainId 等) |
| GlossaryView (551:5) Invalid end tag | 孤立 `</div>` 标签 | 删除 line 551 |
| mecha-map 启动失败 | `app.get()` 在 `express()` 之前调用 | 将 `const app = express()` 移至路由之前 |
| `/api/map/list` 返回空列表 | 扫描 data/*.json 但数据在 SQLite | 改为 `SELECT * FROM battlefields` 数据库查询 |
| phase13_sliders centerGrid 检测失败 | 中间行有空行/注释/分隔符 | v3: 跳过注释查找 `initCanvas` |

---

## 六、Phase 13 独立UI扩展: 双轴平移滑槽

### 补丁: `phase13_sliders.py` (5 项注入)

| 注入点 | 位置 | 内容 |
|--------|------|------|
| Template | `</canvas-container>` → `cursor-hint` | `.slider-panel` + 两个 `<input type="range">` |
| Script refs | `offsetY` → `hoverCoord` | `hSlider` / `vSlider` / `_sliderSyncing` |
| Helper funcs | `centerGrid()` → `initCanvas()` | `getGridDims()` / `getSliderRange()` / `syncSlidersFromOffset()` / `onHSlider()` / `onVSlider()` |
| draw() sync | `ctx.restore()` 之后 | `syncSlidersFromOffset()` |
| CSS | `</style>` 之前 | `.slider-panel` 等样式 |

### 核心机制

```
滑槽拉动 → onHSlider/onVSlider → offsetX/Y 修改 → draw()
                                          ↓
鼠标拖拽/滚轮/zoom → offsetX/Y 修改 → draw() → syncSlidersFromOffset → 滑槽 UI 更新
                                                       ↑
                                            _sliderSyncing=true 时跳过
```

### 动态边界公式
```
getGridDims() → gridW = worldW*scaleX + worldH*|shearX|
                 gridH = worldH*scaleY

getSliderRange():
  minX = -gridW*scale.value + canvas.width*0.2
  maxX = canvas.width*0.8
  minY = -gridH*scale.value + canvas.height*0.2
  maxY = canvas.height*0.8
```

---

## 七、Phase 13.5: Sidebar 鉴权联动 + 新建地图 10-200

### 补丁: `phase13_5_patches.py` (12 项注入)

| 文件 | 注入项 | 内容 |
|------|--------|------|
| TheSidebar.vue | 5 | 退出按钮模板 / useRouter import / router ref / handleLogout 函数 / CSS |
| NewLoginView.vue | 3 | useUserStore import / userStore 实例 / user 持久化 (login + register) |
| NewBattlefieldView.vue | 4 | 新建按钮 / 弹窗模板 / newMap refs / createNewMap 函数 |

### 5.1 TheSidebar 鉴权联动

**退出按钮**: 注入在 profile-info 区域 `[ username ]` 下方
```
handleLogout():
  localStorage.clear()        # 彻底清空 Token + user
  userStore.clearUser()       # 清空 Pinia 状态
  router.push('/login')       # 重定向回登录页
```

**user 持久化**: NewLoginView 登录/注册成功后
```js
localStorage.setItem('user', JSON.stringify(data.user))
userStore.setUser(data.user)
```

### 5.2 新建地图弹窗

**Modal 组件**:
- 宽度 input: `v-model.number="newMapWidth"` `min="10" max="200"`
- 高度 input: `v-model.number="newMapHeight"` `min="10" max="200"`
- 实时显示: 总计 {{ newMapWidth * newMapHeight }} 格

**createNewMap()**:
1. 刚性约束: 10 ≤ w,h ≤ 200 且整数
2. 清空地形: `Object.keys(terrainMap).forEach(k => delete terrainMap[k])`
3. 设置 battlefield: `{ name: "新战场 WxH", width: w, height: h }`
4. hexGrid.redraw() → 滑槽 getGridDims() 自动重算边界

---

## 八、部署验证

### 构建
```
vite v5.4.21 building for production...
✓ 115 modules transformed.
dist/index.html                   1.74 kB │ gzip:   0.96 kB
dist/assets/index-lkoOfiHG.css  106.70 kB │ gzip:  19.19 kB
dist/assets/index-CKtt8ttF.js   334.88 kB │ gzip: 116.58 kB
✓ built in 3.27s (Phase 13.5)
```

### 容器
```
mecha-map             Up X seconds (healthy)
mecha-frontend        Up X seconds (healthy)
mecha-combat          Up X minutes (healthy)
mecha-online-battle   Up 18 hours (healthy)
nginx-ssl             Up 5 days
mecha-hangar          Up 6 days (healthy)
mecha-comm            Up 9 days (healthy)
mecha-auth            Up 11 days (healthy)
mecha-battle-db       Up 8 weeks (healthy)
```

### API 验证
- `GET /api/map/list` → 返回 13 个战场地图 ✓
- `GET /api/map/list?id=1` → 加载具体地图 ✓
- `GET http://localhost:8081/` → HTML 200 ✓

---

## 九、Git 提交链

```
7b9ccb4 (Phase 12)
   ↓
97e642f (Phase 13 补丁战役)       5 files, +518/-26
   ↓
fcac62d (Phase 13 hotfix)        2 files, +34/-51  (SQLite 查询)
   ↓
7b5cfee (Phase 13 滑槽注入)      2 files, +766      (含备份)
   ↓
42e17f9 (chore: 清理备份)        1 file,  -621
   ↓
b238351 (Phase 13.5)             3 files, +114      → origin/main
```

---

## 十、后续建议 (Phase 14+)

1. **地图持久化保存** — 编辑器保存时通过 `/api/map/save` 写入服务端 data/ 目录
2. **战场加载地图选择** — NewBattleView 创建战斗时允许从存档加载地图
3. **悬浮卡片状态持久化** — localStorage 记住用户拖拽位置和折叠状态
4. **地形清洗器集成测试** — 用旧格式地图文件端到端测试清洗管线
5. **地图缩略图预览** — 加载下拉中显示地形布局缩略图
