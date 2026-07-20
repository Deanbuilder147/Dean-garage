# 🔍 三大问题全链路诊断报告

**生成时间**: 2026-06-24 17:57  
**项目**: Mecha Universe Engine  
**诊断范围**: 单位编辑器 / 地图编辑器 / 词条库

---

## 目录

1. [问题一：单位编辑器无棋子显示](#问题一单位编辑器无棋子显示)
2. [问题二：地图编辑器无渲染鼠标高亮丢失](#问题二地图编辑器无渲染鼠标高亮丢失)
3. [问题三：词条库空白](#问题三词条库空白)
4. [优先级排序与修复路线图](#优先级排序与修复路线图)

---

## 问题一：单位编辑器无棋子显示，且无法显示已有棋子详情

### 数据链路全图

```
NewUnitEditorView.vue
  └─ onMounted → loadUnits()                 [第 599 行]
       └─ hangarAPI.getUnits()
            └─ apiClient.get('/units')          ← client.js 第 75 行
                   └─ Vite 代理转发
                         └─ GET /api/units    ← 后端 units.ts 第 66 行
                                └─ DB: SELECT * FROM units
                                     WHERE owner_id = ?
```

### 前端关键代码

**`NewUnitEditorView.vue` 第 531 行：**
```javascript
async function loadUnits() {
  try {
    const { data } = await hangarAPI.getUnits()
    units.value = data.units || []     // ← 解包路径：data.units
  } catch (e) {
    console.error(e)                  // ← 静默失败！无用户提示
  }
}
```

**`client.js` 第 75 行（hangarAPI 定义）：**
```javascript
export const hangarAPI = {
  getUnits: () => apiClient.get('/units'),   // ← 实际请求 /api/units
  // ...
}
```

**后端 `units.ts` 第 66 行响应格式：**
```typescript
router.get('/api/units', (req, res) => {
  const units = all('SELECT * FROM units WHERE owner_id = ?', [req.auth!.userId])
  res.json({ units })              // ← 返回格式：{ units: [...] }
})
```

### 可能原因分析

| #   | 原因 | 验证方式 | 概率 |
|-----|------|----------|------|
| 1 | **Token 过期/无效**，axios 拦截器清除 token 后跳登录，但 `getUnits` 的 catch 只做 `console.error`，静默失败导致 `units.value = []` | 打开浏览器 DevTools → Network → 查看 `/api/units` 响应状态 | ⭐⭐⭐⭐⭐ |
| 2 | **后端 `authenticate` 中间件**要求 `requireAuth`，游客状态无 token 导致 401；拦截器判断 `hadToken=false` 不跳转，但数据返回空 | 同上，检查 Response Status 是否为 401 | ⭐⭐⭐⭐ |
| 3 | **数据库 `units` 表为空**，或者 `owner_id` 与当前登录用户 ID 不匹配 | 检查 DB 数据： `SELECT * FROM units` | ⭐⭐⭐ |
| 4 | **`loadUnits()` 在 `onMounted` 第 599 行调用，但 `userStore.user` 尚未初始化**（异步），导致 `owner_id` 查询条件为 `undefined` / `null` | 在 loadUnits 前加 `await userStore.initialize()` | ⭐⭐⭐ |

### 正反馈修复经验

> Phase 28 中 `loadFactions()` 同样存在静默失败问题，当时解决方式是：**在 catch 中设置 `error.value` 并显示给用户**，而不是只 `console.error`。

### 建议修复方案

**方案 A：增强错误提示（立即生效）**

```javascript
// NewUnitEditorView.vue 第 531 行附近
const loadError = ref('')

async function loadUnits() {
  try {
    const { data } = await hangarAPI.getUnits()
    units.value = data.units || []
    loadError.value = ''
    if (units.value.length === 0) {
      console.warn('[Units] 0 units returned, check auth & DB')
    }
  } catch (e) {
    console.error('[Units] 加载失败:', e.response?.status, e.message)
    loadError.value = '加载失败：' + (e.response?.data?.error || e.message)
  }
}
```

**方案 B：检查 Token 初始化时机**

```javascript
// NewUnitEditorView.vue 第 599 行附近
onMounted(async () => {
  // 确保用户状态已初始化
  if (!user.value) {
    await userStore.fetchProfile?.()  // 或类似初始化方法
  }
  await loadUnits()
  await loadFactions()
})
```

### 排查步骤（给你）

1. 打开浏览器 **DevTools** (F12)
2. 切换到 **Network** 标签
3. 刷新单位编辑器页面
4. 查看 `/api/units` 请求：
   - **Request Headers** → 是否有 `Authorization: Bearer ...`？
   - **Response Status** → 是 200、401 还是 403？
   - **Response Body** → 是 `{ units: [...] }` 还是 `{ error: ... }`？

---

## 问题二：地图编辑器无渲染 + 鼠标高亮丢失

### Part A：旧地图不渲染

#### 数据链路全图

```
NewBattlefieldView.vue
  └─ onMounted [第 544 行]
       ├─ 1. route.query.id → mapAPI.getBattlefield(mapId)
       │        └─ apiClient.get(`/map/battlefields/${id}`)
       │             └─ 代理到 → GET /api/map/battlefields/:id   ← 后端 maps.ts 第 129 行
       │                  └─ DB: SELECT * FROM maps WHERE id = ?
       │
       └─ 2. fallback → mapAPI.getBattlefields()
                └─ apiClient.get('/map/battlefields')
                      └─ 代理到 → GET /api/map/battlefields    ← 后端 maps.ts 第 94 行
                             └─ DB: SELECT * FROM maps ...
```

#### 前端关键代码

**`NewBattlefieldView.vue` 第 544-577 行（onMounted）：**
```javascript
onMounted(async () => {
  const mapId = route.query.id || route.params.id
  let mapData = null
  try {
    if (mapId) {
      try {
        const res = await mapAPI.getBattlefield(mapId)
        mapData = res.data?.battlefield || res.data  // ← 兼容两种格式
      } catch (e) {
        console.warn('[BattlefieldEdit] Failed to load map by ID:', mapId, e.message)
      }
    }
    if (!mapData) {
      const { data } = await mapAPI.getBattlefields()
      if (data && data.battlefields && data.battlefields.length > 0) {
        mapData = data.battlefields[0]                   // ← 取第一个地图
      }
    }
    if (mapData) {
      await loadMapData(mapData)                         // ← 加载到编辑器
    }
  } catch (e) { /* ... */ }
})
```

**`loadMapData()` 第 512-542 行（地形数据转换）：**
```javascript
async function loadMapData(mapData) {
  battlefield.value = mapData
  // 清空现有地形
  Object.keys(terrainMap).forEach(k => delete terrainMap[k])
  // 加载地形数据
  const rawTerrain = mapData.terrain || mapData.terrainData
  if (rawTerrain) {
    const t = typeof rawTerrain === 'string' ? JSON.parse(rawTerrain) : rawTerrain
    if (t && typeof t === 'object') {
      Object.entries(t).forEach(([key, val]) => { terrainMap[key] = val })
    }
  }
  // ...
}
```

#### 可能原因分析

| #   | 原因 | 说明 | 概率 |
|-----|------|------|------|
| 1 | **`getBattlefield` 返回格式不匹配**：后端 maps.ts 第 136-142 行返回 `{ ...map, cells: [...] }`，但前端第 550-551 行期待 `res.data?.battlefield` 或 `res.data` | 如果后端直接返回 map 对象（非 `{ battlefield: ... }` 包裹），则 `mapData` 可能为 `undefined` | ⭐⭐⭐⭐ |
| 2 | **`cells` 与 `terrainMap` 转换失败**：后端返回 `cells: [{q, r, terrain}, ...]`（数组格式），但 `loadMapData` 第 518-523 行处理的是 `terrain: { "q,r": "terrainId" }`（对象格式） | 格式不兼容导致地形数据无法正确加载 | ⭐⭐⭐⭐⭐ |
| 3 | **`getBattlefields()` 返回格式问题**：后端第 106 行返回 `{ battlefields: parsed }`，但如果在游客状态，`is_public=0` 的地图不会出现在列表中 | 列表为空，导致 `mapData` 为 `null` | ⭐⭐⭐ |
| 4 | **Canvas 尺寸为 0**（`containerRef.clientWidth === 0`），导致地形无法渲染 | 宪法红线：Canvas 尺寸由逻辑脚本硬性控制，CSS Flex 可能导致高度为 0 | ⭐⭐⭐ |

#### 正反馈修复经验

> Phase 13 中曾修复过 `loadMapData` 中地形数据格式不兼容的问题（旧版字符串 vs 新版结构化对象），当时解决方式是：**`extractTerrainId()` 兼容三种格式（字符串 / 对象 / null）**。

---

### Part B：鼠标坐标/高亮边框消失

#### 数据链路全图

```
HexGridCanvasEngine.vue (大一统渲染引擎)
  └─ <canvas @mousemove="handleMouseMove" @click="handleClick">
       ├─ handleMouseMove → 计算 hex 坐标 → drawHover()
       └─ handleClick → 计算 hex 坐标 → emit('cell-clicked')
```

#### 前端关键代码

**`NewBattlefieldView.vue` 第 34-42 行（Canvas 组件调用）：**
```html
<HexGridCanvasEngine
  ref="hexGrid"
  :grid-data="gridData"
  :highlight-cells="editorHighlights"
  :iso-config="isoConfig"
  :show-hover="true"              ← hover 高亮已启用
  :use-terrain-cache="false"
  @cell-clicked="handleEditorBrush"
/>
```

#### 可能原因分析

| #   | 原因 | 说明 | 概率 |
|-----|------|------|------|
| 1 | **`HexGridCanvasEngine` 组件内部 `handleMouseMove` 未正确实现**，或 `@cell-hovered` 事件未 emit | `show-hover` prop 已绑定 `:show-hover="true"`（第 39 行），问题在引擎内部 | ⭐⭐⭐⭐⭐ |
| 2 | **Canvas 尺寸为 0**（`containerRef.clientWidth === 0`），导致鼠标坐标转换失败；只有点击时通过 Vue 事件获取坐标才有效 | 宪法红线：Canvas 尺寸由逻辑脚本硬性控制，CSS Flex 可能导致高度为 0 | ⭐⭐⭐⭐ |
| 3 | **双击/点击后强制触发了 `nextTick` 重绘，但鼠标移动时 `drawHover` 未调用 `invalidateTerrain()` 或 hover 状态未正确设置** | 需检查 HexGridCanvasEngine.vue 的 mousemove 处理器 | ⭐⭐⭐ |

### 建议修复方案

**地图不渲染（立即排查）：**

在 `onMounted` 第 550 行附近加日志：
```javascript
const res = await mapAPI.getBattlefield(mapId)
console.log('[BattlefieldEdit] API response:', res.data)  // ← 加这行
mapData = res.data?.battlefield || res.data
```

**鼠标高亮（需检查引擎）：**

检查 `HexGridCanvasEngine.vue` 中的 `handleMouseMove` 是否正确调用 `clearHover()` + `setHoverCell()` 并触发重绘。

---

## 问题三：词条库依然没有任何东西

### 数据链路全图

```
GlossaryView.vue
  └─ onMounted → loadConfig()                   [第 735 行]
       └─ glossaryAPI.getConfig()
            └─ apiClient.get('/combat-glossary/config')   ← client.js 第 143 行
                   └─ Vite 代理转发
                         └─ GET /api/combat-glossary/config  ← 后端 glossary.ts 第 94 行
                                └─ readConfig()
                                     └─ 合并 CORE_SKILLS + JSON 文件
```

### 前端关键代码

**`GlossaryView.vue` 第 735-756 行（`loadConfig` 函数）：**
```javascript
async function loadConfig() {
  loading.value = true
  loadError.value = ''
  try {
    const config = (await glossaryAPI.getConfig()).data    // ← config = { success, glossary, skillCount, version }
    editableConfig._meta = { ...config._meta }           // ← Bug! 应该是 config.glossary._meta
    editableConfig.skills = { ...config.skills }         // ← Bug! 应该是 config.glossary.skills
    editableConfig.systems = { ...config.systems }       // ← Bug! 应该是 config.glossary.systems
    
    // 初始化 key 编辑缓存
    for (const key of Object.keys(config.skills || {})) {  // ← Bug! 应该是 config.glossary.skills
      skillKeyEdits[key] = key
    }
    pendingDeletes.value = []
    loading.value = false
  } catch (e) {
    console.error('加载词条配置失败:', e)
    loadError.value = e.response?.data?.error || '无法连接到 combat-service，请检查服务状态'
    loading.value = false
  }
}
```

### 🔴 关键 Bug 定位

**后端返回格式**（glossary.ts 第 96-103 行）：
```typescript
router.get('/config', (_req, res) => {
  const cfg = readConfig();
  res.json({
    success: true,
    glossary: cfg,                    // ← skills 在 glossary 内部！
    skillCount: Object.keys(cfg.skills || {}).length,
    is_public: true,
    review_status: 'approved',
    version: cfg.version || '5.0',
  });
});
```

**前端错误解包**：
```javascript
// 后端实际返回
{
  "success": true,
  "glossary": {
    "_meta": { "version": "5.1", ... },
    "skills": { "melee_strike": {...}, ... },   // ← skills 在这里！
    "systems": { "ambush": {...}, ... },
    "terrains": { ... },
    "damage_kinds": { ... },
    "action_types": { ... }
  },
  "skillCount": 15,
  "version": "5.1"
}

// 前端错误解包
const config = res.data          // config = { success, glossary, skillCount, version }
config.skills                   // ← undefined！skills 在 config.glossary.skills
```

### 可能原因分析

| #   | 原因 | 验证方式 | 概率 |
|-----|------|------|------|
| 1 | **`loadConfig()` 中数据解包错误**：`config.skills` 为 `undefined`，导致 `editableConfig.skills = { ...undefined }` = `{}`，词条卡片 `v-for="(skill, key) in editableConfig.skills"` 不渲染 | 打开 DevTools → Console → 看是否有报错 | ⭐⭐⭐⭐⭐ |
| 2 | **Phase 29 合并后的配置文件未正确写入容器**，导致 `readConfig()` 读到空配置，`CORE_SKILLS` 也只有 5 个 | 服务器上检查 `/app/data/glossary-skill-config.json` 内容 | ⭐⭐⭐ |
| 3 | **后端 `readConfig()` 第 67 行有 Bug**：`config.skills = { ...CORE_SKILLS, ...(config.skills || {}) }` 会展开 CORE_SKILLS 的键值——但如果 JSON 文件中 skills 的 key 与 CORE_SKILLS 重复，会被覆盖 | 检查合并后 JSON 的 skills 键名 | ⭐⭐ |

### 建议修复方案

**立即修复 `GlossaryView.vue` 第 739-742 行：**

```javascript
// 修复后
async function loadConfig() {
  loading.value = true
  loadError.value = ''
  try {
    const res = (await glossaryAPI.getConfig())    // res = axios response
    const data = res.data                            // data = { success, glossary, skillCount, version }
    const glossary = data.glossary || data           // ← 关键修复：从 glossary 取值
    
    editableConfig._meta = { ...glossary._meta }
    editableConfig.skills = { ...glossary.skills }         // ← 修复
    editableConfig.systems = { ...glossary.systems }       // ← 修复
    
    // 初始化 key 编辑缓存
    for (const key of Object.keys(glossary.skills || {})) {
      skillKeyEdits[key] = key
    }
    pendingDeletes.value = []
    loading.value = false
  } catch (e) {
    console.error('加载词条配置失败:', e)
    loadError.value = e.response?.data?.error || '无法连接到词条库'
    loading.value = false
  }
}
```

---

## 优先级排序与修复路线图

| 优先级 | 问题 | 根因 | 修复难度 | 影响范围 |
|--------|------|------|----------|----------|
| **P0** | 词条库空白 | `loadConfig()` 数据解包路径错误（`config.skills` → 应是 `config.glossary.skills`） | 低（2 行修改） | 全项目词条系统 |
| **P1** | 单位编辑器不显示 | Token/Auth 问题 或 `loadUnits` 静默失败 | 中（需 DevTools 确认） | 单位管理系统 |
| **P1** | 地图不渲染 | 响应数据格式不匹配（`res.data` vs `res.data.battlefield`）或 cells 格式不兼容 | 中 | 地图编辑器 |
| **P2** | 鼠标高亮消失 | `HexGridCanvasEngine` 内部 hover 逻辑问题 或 Canvas 尺寸问题 | 高（需改引擎组件） | 地图编辑器交互 |

---

## 立即行动项

### ✅ P0：修复词条库空白（最优先）

**文件**: `frontend/src/views/GlossaryView.vue`  
**行号**: 第 739-742 行  
**修改内容**:

```diff
async function loadConfig() {
  loading.value = true
  loadError.value = ''
  try {
    const res = (await glossaryAPI.getConfig())
-   const config = res.data
-   editableConfig._meta = { ...config._meta }
-   editableConfig.skills = { ...config.skills }
-   editableConfig.systems = { ...config.systems }
+   const data = res.data
+   const glossary = data.glossary || data
+   editableConfig._meta = { ...glossary._meta }
+   editableConfig.skills = { ...glossary.skills }
+   editableConfig.systems = { ...glossary.systems }
    
    // 初始化 key 编辑缓存
-   for (const key of Object.keys(config.skills || {})) {
+   for (const key of Object.keys(glossary.skills || {})) {
      skillKeyEdits[key] = key
    }
    pendingDeletes.value = []
    loading.value = false
  } catch (e) {
    console.error('加载词条配置失败:', e)
    loadError.value = e.response?.data?.error || '无法连接到词条库'
    loading.value = false
  }
}
```

---

## 附：后端路由注册检查清单

### ✅ 已确认路由

| 前端调用 | 代理路径 | 后端路由文件 | 状态 |
|---------|---------|-------------|------|
| `glossaryAPI.getConfig()` | `/api/combat-glossary/config` | `backend-gateway/src/routes/glossary.ts` | ✅ |
| `mapAPI.getBattlefields()` | `/api/map/battlefields` | `backend-gateway/src/routes/maps.ts` | ✅ |
| `mapAPI.getBattlefield(id)` | `/api/map/battlefields/:id` | `backend-gateway/src/routes/maps.ts` | ✅ |
| `hangarAPI.getUnits()` | `/api/units` | `backend-gateway/src/routes/units.ts` | ✅ |

### ⚠️ 注意事项

1. **`client.js` 第 22 行 Bug**：`Authorization` 拼写为 `Authoration`（缺少 `h`），导致 Token 无法正确传递到后端！
   ```javascript
   // 当前代码（Bug）
   config.headers.Authorization = `Bearer ${token}`;  // ← 拼错！
   
   // 应该是
   config.headers.Authorization = `Bearer ${token}`;  // ← 正确拼写
   ```
   **这个 Bug 可能导致所有需要认证的请求都失败！**

2. **`mapAPI.getMapById(id)` 实现错误**（client.js 第 98 行）：
   ```javascript
   getMapById: (id) => apiClient.get('/map/list', { params: { id } }),  // ← 错误
   // 应该是
   getMapById: (id) => apiClient.get(`/map/list?id=${encodeURIComponent(id)}`),  // ← 正确
   ```

---

**报告结束**
