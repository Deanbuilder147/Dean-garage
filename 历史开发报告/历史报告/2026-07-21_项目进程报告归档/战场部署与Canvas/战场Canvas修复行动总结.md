# 战场 Canvas 棋盘显示不完整 — 修复行动总结

> **日期**: 2026-06-29  
> **问题**: 战场视图(NewBattleView)的 Canvas 六角格棋盘**显示不完整**，**左上角沿线明显变平**  
> **对比参考**: 地图编辑器(NewBattlefieldView) 显示正常  
> **状态**: ❌ **未解决**

---

## 一、问题描述

| 项目 | 详情 |
|------|------|
| **症状** | Canvas 上六角格棋盘渲染不完整，左上角沿线明显变成平的 |
| **正常参照** | 地图编辑器 (NewBattlefieldView) 的 Canvas 渲染正确 |
| **异常页面** | 战斗视图 (NewBattleView) 的 Canvas 渲染异常 |
| **访问地址** | http://106.54.197.69:8081/ |
| **服务器** | 腾讯云轻量应用 Watson (lhins-2fs1rzs8, 106.54.197.69, ap-shanghai) |
| **前端容器** | mecha-frontend (Docker, 端口 8081) |

---

## 二、排查过程

### 2.1 初步定位

1. 排除了 CSP 白屏问题（Network 面板确认资源加载正常，只有 Google Fonts 被拦截）
2. 确认问题是 **Canvas 渲染层**的问题，而非网络/API 层
3. 对比了两个视图的代码：地图编辑器 vs 战场视图

### 2.2 发现的关键差异

#### 差异 1: HexGridCanvasEngine.vue（引擎层）

| 函数 | 问题 | 发现位置 |
|------|------|----------|
| `centerGrid()` | 只用简单 shear/scale 计算中心点，未考虑 ISO 变换后的棋盘世界边界尺寸 | Line 364-373 |
| `initTerrainCache()` | 缓存只用原始 2D 坐标计算尺寸，ISO 扩展后被裁剪 | Line 296-301 |
| CTM 变换链 | `ctx.transform()` 缺少 rotation 旋转变换支持 | Line 415-417 |

#### 差异 2: NewBattleView.vue vs NewBattlefieldView.vue（配置层）

| 配置项 | 地图编辑器 ✅ | 战场视图 ⚠️ (修复前) |
|--------|--------------|---------------------|
| `spacingH/V` | `ref(1.00)` 响应式 | 常量 `DEFAULT_SPACING_H/V`（非响应式） |
| `gridData.topologyParam` | `{ spacingH: spacingH.value }` | `{ spacingH, spacingV }`（常量直接传） |
| `isoConfig` | 直接用 `ISO_DEFAULTS` 全量 | 从后端动态加载（可能不完整） |
| `loadViewConfig()` | N/A（固定值） | 只读 shearX/scaleY，忽略 rotation/topFlat/bottomFlat |
| 后端无 `_view` 字段时 | N/A | 静默失败，配置可能残缺 |

### 2.3 后端 API 验证

```bash
curl -s http://localhost:3006/api/combat-glossary/config
# 返回结果只有 glossary.skills 数据，**没有 _view 字段**
```

这意味着战场视图的 `loadViewConfig()` 无法从后端获取视角配置，必须依赖完整的 `ISO_DEFAULTS`。

---

## 三、已执行的修复操作

### 修复 #1: HexGridCanvasEngine.vue — centerGrid() 居中算法重构

**文件**: `frontend/src/components/HexGridCanvasEngine.vue` (Line 364-391)

**原代码**:
```javascript
function centerGrid() {
  const canvas = mainCanvas.value
  if (!canvas || !props.gridData) return
  const data = props.gridData
  const midGrid = hexToPixel(Math.floor(data.width / 2), Math.floor(data.height / 2))
  const isoCenterX = midGrid.x * ISO.scaleX + midGrid.y * ISO.shearX
  const isoCenterY = midGrid.y * ISO.scaleY
  offsetX.value = canvas.width / 2 - isoCenterX * scale.value
  offsetY.value = canvas.height / 2 - isoCenterY * scale.value
}
```

**修复后**:
```javascript
function centerGrid() {
  const canvas = mainCanvas.value
  if (!canvas || !props.gridData) return
  const data = props.gridData
  // 计算整个棋盘的 2D 世界边界
  const topLeft = hexToPixel(0, 0)
  const bottomRight = hexToPixel(data.width - 1, data.height - 1)
  const midGrid = hexToPixel(Math.floor(data.width / 2), Math.floor(data.height / 2))

  // 应用完整的 ISO 变换矩阵 (含 shear + scale)
  const isoMidX = midGrid.x * ISO.scaleX + midGrid.y * ISO.shearX
  const isoMidY = midGrid.y * ISO.scaleY

  // 计算棋盘在 ISO 变换后的世界尺寸
  const worldW = (bottomRight.x - topLeft.x) * ISO.scaleX + (bottomRight.y - topLeft.y) * Math.abs(ISO.shearX) + HEX_WIDTH * 2
  const worldH = (bottomRight.y - topLeft.y) * ISO.scaleY + HEX_HEIGHT * 2

  // fit-to-view 逻辑
  const viewW = canvas.width / scale.value
  const viewH = canvas.height / scale.value

  if (worldW > viewW || worldH > viewH) {
    // 棋盘比视图大，居中显示中心点
    offsetX.value = canvas.width / 2 - isoMidX * scale.value
    offsetY.value = canvas.height / 2 - isoMidY * scale.value
  } else {
    // 棋盘比视图小，完全居中
    offsetX.value = (canvas.width - worldW * scale.value) / 2 - topLeft.x * ISO.scaleX * scale.value
    offsetY.value = (canvas.height - worldH * scale.value) / 2 - topLeft.y * ISO.scaleY * scale.value
  }
}
```

---

### 修复 #2: HexGridCanvasEngine.vue — initTerrainCache() 缓存尺寸扩展

**文件**: `frontend/src/components/HexGridCanvasEngine.vue` (Line 291-307)

**原代码**:
```javascript
function initTerrainCache() {
  if (!terrainCache) terrainCache = document.createElement('canvas')
  const data = props.gridData
  const lastCell = hexToPixel(data.width - 1, data.height - 1)
  const cacheW = lastCell.x + HEX_WIDTH * 1.5
  const cacheH = lastCell.y + HEX_HEIGHT * 1.5
  terrainCache.width = Math.ceil(cacheW)
  terrainCache.height = Math.ceil(cacheH)
}
```

**修复后**:
```javascript
function initTerrainCache() {
  if (!terrainCache) terrainCache = document.createElement('canvas')
  const data = props.gridData
  const lastCell = hexToPixel(data.width - 1, data.height - 1)
  const worldW2D = lastCell.x + HEX_WIDTH * 1.5
  const worldH2D = lastCell.y + HEX_HEIGHT * 1.5

  // ISO 变换后的实际占用空间 (考虑 shearX 和 scaleY 的扩展)
  const cacheW = Math.ceil(worldW2D * ISO.scaleX + worldH2D * Math.abs(ISO.shearX) + HEX_WIDTH * 4)
  const cacheH = Math.ceil(worldH2D * ISO.scaleY + HEX_HEIGHT * 4)
  terrainCache.width = Math.max(cacheW, 100)
  terrainCache.height = Math.max(cacheH, 100)
}
```

---

### 修复 #3: NewBattleView.vue — 统一 spacing 为响应式 ref

**文件**: `frontend/src/views/NewBattleView.vue` (约 Line 948-951)

**原代码**:
```javascript
const spacingH = DEFAULT_SPACING_H   // 常量
const spacingV = DEFAULT_SPACING_V   // 常量
```

**修复后**:
```javascript
const spacingH = ref(DEFAULT_SPACING_H)  // 响应式，与地图编辑器一致
const spacingV = ref(DEFAULT_SPACING_V)  // 响应式，与地图编辑器一致
```

---

### 修复 #4: NewBattleView.vue — gridData topologyParam 使用 .value

**文件**: `frontend/src/views/NewBattleView.vue` (computed gridData)

**原代码**:
```javascript
topologyParam: { spacingH, spacingV }   // 传递常量
```

**修复后**:
```javascript
topologyParam: { spacingH: spacingH.value, spacingV: spacingV.value }  // 解包 ref
```

---

### 修复 #5: NewBattleView.vue — loadViewConfig() 全量字段读取

**文件**: `frontend/src/views/NewBattleView.vue` (loadViewConfig 函数)

**原代码**:
```javascript
async function loadViewConfig() {
  try {
    const res = await glossaryAPI.getConfig()
    const vc = res.data?._view
    if (vc && typeof vc.shearX === 'number') {
      ISO.shearX = vc.shearX
      ISO.shearY = vc.shearY ?? ISO_DEFAULTS.shearY
      ISO.scaleX = vc.scaleX ?? ISO_DEFAULTS.scaleX
      ISO.scaleY = vc.scaleY ?? ISO_DEFAULTS.scaleY
    }
  } catch (e) { ... }
}
```

**修复后**:
```javascript
async function loadViewConfig() {
  try {
    const res = await glossaryAPI.getConfig()
    const vc = res.data?._view
    if (vc && typeof vc === 'object') {
      if (typeof vc.shearX === 'number') ISO.shearX = vc.shearX
      if (typeof vc.shearY === 'number') ISO.shearY = vc.shearY
      if (typeof vc.scaleX === 'number') ISO.scaleX = vc.scaleX
      if (typeof vc.scaleY === 'number') ISO.scaleY = vc.scaleY
      if (typeof vc.rotation === 'number') ISO.rotation = vc.rotation
      if (typeof vc.topFlat === 'number') ISO.topFlat = vc.topFlat
      if (typeof vc.bottomFlat === 'number') ISO.bottomFlat = vc.bottomFlat
      console.log('[ViewConfig] 已加载视角配置:', JSON.stringify(vc))
    } else {
      console.log('[ViewConfig] 后端无视角配置，使用 ISO_DEFAULTS 基准值')
    }
  } catch (e) { ... }
}
```

---

## 四、部署记录

| 时间 | 操作 | 结果 |
|------|------|------|
| 16:33 | 第1次构建 (`npm run build`) | ✅ 成功 (353 KB JS + 102 KB CSS) |
| 16:33 | 上传 dist 到服务器 `/root/dist_20260629163340` | ✅ 成功 |
| 16:33 | 复制到项目目录 + Docker rebuild + restart | ✅ Running (healthy), HTTP 200 |
| 16:43 | 第2次构建（含统一配置修复） | ✅ 成功 |
| 16:43 | 上传 dist 到服务器 `/root/dist_20260629164303` | ✅ 成功 |
| 16:43 | 复制到项目目录 + Docker rebuild + restart | ✅ Running (healthy), HTTP 200 |

**部署命令摘要**:
```bash
# 本地构建
cd frontend && npm run build

# 服务器更新（通过腾讯云 Lighthouse TAT）
rm -rf /root/mecha-universe-engine/frontend/dist/*
cp -r /root/dist_20260629164303/* /root/mecha-universe-engine/frontend/dist/
cd /root/mecha-universe-engine && docker compose build --no-cache frontend
docker compose up -d frontend
```

---

## 五、已确认正确的基准参数

根据 MEMORY.md 中保存的用户确认值：

```
等距视角基准参数：
iso=ON
shearX=0.25, shearY=0.44
scaleX=1.00, scaleY=0.39
rotation=-24°
单元=64×72, 顶角=25%, 底角=25%
间距=H103% V79% O51%
```

这些值在 `hexUtils.js` 的 `ISO_DEFAULTS` 中定义。

---

## 六、尚未排除的可能原因

以下方向**尚未深入排查**，建议后续检查：

### 6.1 渲染流程差异
- [ ] 地图编辑器和战场视图是否使用了**不同的绘制函数**？
- [ ] `drawHex()` / `drawHexIsometric()` 在两个视图中的调用路径是否一致？
- [ ] 战场视图是否有**额外的裁剪区域** (clip/scissor)？

### 6.2 Canvas 尺寸与 CSS
- [ ] 战场视图的 Canvas 元素**实际像素尺寸**是多少？（vs 地图编辑器）
- [ ] 是否有 CSS 样式导致 Canvas 被**拉伸或压缩**？
- [ ] `devicePixelRatio` 处理是否正确？

### 6.3 数据层面
- [ ] 战场的 `cells` 数据与地图编辑器的地形数据**结构是否完全一致**？
- [ ] `gridData.width` / `gridData.height` 值是否正确？
- [ ] 战场是否有**特殊的坐标系偏移**？

### 6.4 等距变换矩阵
- [ ] 当前 CTM `ctx.transform(scaleX, 0, shearX, scaleY, 0, 0)` **缺少 rotation**
- [ ] 地图编辑器是否在别处处理了 rotation？还是根本没用？
- [ ] shearX=0.25 的方向是否正确（应该向右倾斜还是向左）？

### 6.5 视口/相机参数
- [ ] 战场视图初始化时的 `offsetX` / `offsetY` / `scale` 初始值是什么？
- [ ] 是否有代码在**渲染之后又修改了**这些值？
- [ ] `centerGrid()` 是否在正确的时机被调用（数据加载完成后）？

---

## 七、关键文件清单

| 文件路径 | 作用 | 本次是否修改 |
|----------|------|-------------|
| `frontend/src/components/HexGridCanvasEngine.vue` | Canvas 渲染引擎（核心） | ✅ 是 |
| `frontend/src/views/NewBattleView.vue` | 战场视图（配置+数据） | ✅ 是 |
| `frontend/src/views/NewBattlefieldView.vue` | 地图编辑器（正常参照） | ❌ 否 |
| `frontend/src/utils/hexUtils.js` | 六角格坐标转换 + ISO_DEFAULTS | ❌ 否 |

---

## 八、快速复现步骤

```bash
# 1. 访问战场页面
open http://106.54.197.69:8081/

# 2. 进入战斗/战场视图

# 3. 观察 Canvas 区域：
#    - 左上角六角格沿线是否变平
#    - 棋盘是否完整显示
#    - 与地图编辑器对比差异

# 4. 浏览器调试：
#    F12 → Console 查看 [ViewConfig] 日志
#    F12 → Elements 检查 <canvas> 实际尺寸
#    F22 → Performance 录制渲染过程
```

---

## 九、联系方式/上下文

- **项目根目录**: `/Users/dingxuyang/CodeBuddy/20260604120036`
- **SSH 连接**: `ssh -i /Users/dinguyang/Desktop/watson.pem root@106.54.197.69`
- **Docker 项目路径**: `/root/mecha-universe-engine/`
- **前端容器名**: `mecha-frontend`
- **相关记忆 ID**: `71512344`（战棋开发终极宪法 v2.0）、`83280824`（等距视角基准参数）

---

## 十、Phase 29-CanvasTrueCenter 绝杀令（第3轮修复 — 已部署 ✅）

> **时间**: 2026-06-29 17:10  
> **状态**: ✅ 已部署，待验证

### 工序一：CTM 变换矩阵补齐 Rotation 旋转变换

**文件**: `frontend/src/components/HexGridCanvasEngine.vue`

| 修改点 | 详情 |
|--------|------|
| `draw()` CTM链 (Line ~446) | 新增 `ctx.rotate(ISO.rotation * Math.PI / 180)` 在 ISO transform 之后 |
| `centerGrid()` (Line ~370) | **完全重构**：4角点 → ISO变换 → rotation旋转 → AABB边界检测 → fit-to-view |
| `defineExpose` (Line ~818) | 新增暴露 `centerGrid` 方法（之前缺失！） |

**核心代码**:
```javascript
// draw() CTM 链（修复后）
ctx.translate(offsetX.value, offsetY.value)
ctx.scale(scale.value, scale.value)
ctx.transform(ISO.scaleX, 0, ISO.shearX, ISO.scaleY, 0, 0)
// Phase 29-CanvasTrueCenter: 补齐 rotation
if (ISO.rotation) {
  const rad = ISO.rotation * Math.PI / 180
  ctx.rotate(rad)
}
```

```javascript
// centerGrid() 核心算法（修复后）
function transformPoint(p) {
  const isoX = p.x * ISO.scaleX + p.y * ISO.shearX
  const isoY = p.y * ISO.scaleY
  const rad = (ISO.rotation || 0) * Math.PI / 180
  return {
    x: isoX * Math.cos(rad) - isoY * Math.sin(rad),
    y: isoX * Math.sin(rad) + isoY * Math.cos(rad)
  }
}
// 对4个角点做完整变换 → AABB包围盒 → fit-to-view居中
```

### 工序二：双 Tick 物理绝杀 + resize 防护

**文件**: `frontend/src/views/NewBattleView.vue`

| 修改点 | 详情 |
|--------|------|
| `onMounted` 末端 | 注入 `await nextTick(); await nextTick();` + centerGrid + invalidateTerrain + redraw |
| `resize` handler | 新增 `_resizeHandler`：initFloatingCardPositions + 100ms延迟后 centerGrid + redraw |
| `onUnmounted` | 清理更新为 `_resizeHandler` 引用 |

```javascript
// onMounted 末端（修复后）
await nextTick()
await nextTick()  // 双Tick！等待侧边栏/弹窗DOM稳定
if (hexGrid.value) {
  console.log('[CanvasTrueCenter] 双Tick校准触发')
  hexGrid.value.centerGrid()
  hexGrid.value.invalidateTerrain()
  hexGrid.value.redraw()
}
```

```javascript
// resize handler（修复后）
const _resizeHandler = () => {
  initFloatingCardPositions()
  setTimeout(() => {
    if (hexGrid.value) { hexGrid.value.centerGrid(); hexGrid.value.redraw() }
  }, 100)
}
window.addEventListener('resize', _resizeHandler)
```

### 工序三：全冷清洗部署

```bash
docker compose down && docker compose build --no-cache frontend && docker compose up -d frontend
```
**结果**: mecha-frontend ✅ Running (healthy), HTTP 200 OK

### 验证步骤

```
访问 http://106.54.197.69:8081/ → 登录 dean147/123456 → 进入战场 → Cmd+Shift+R
检查：左上角是否恢复规则六角格蜂巢边界、棋盘完整无裁剪、与地图编辑器视角一致
控制台搜索 [CanvasTrueCenter] 确认双Tick触发
```
