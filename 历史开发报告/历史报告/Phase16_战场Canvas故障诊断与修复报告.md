# Phase 16: 战场 Canvas 故障诊断与四层根因修复报告

> 诊断时间: 2026-06-21 20:20-20:50
> 诊断工具: Playwright 自动化浏览器探测 + curl API 验证
> 修复范围: 3 个核心文件, 4 层根因链

---

## 一、故障现象

用户访问 `/battle/:id` 页面时，浏览器控制台完全看不到战场画布（Canvas）相关内容。Playwright 探测显示：
- `<main>` 区域完全为空，无 Canvas
- 控制台无任何 Vue 运行时日志
- 页面白屏

## 二、诊断流程

### 步骤 1: API 验证

确认战斗数据存在：

```bash
curl -sL http://localhost:3004/api/battles
# → battles 表有数据，id 可用
```

### 步骤 2: 路由诊断

Playwright 分别测试两条路由：

| 路由 | 结果 |
|:---|:---|
| `/battle/547b3641-...` | **白屏** — `<main>` 完全为空，无组件渲染 |
| `/battle-pc/547b3641-...` | **正常** — 标题、工具栏、地形图例、面板全部出现 |

### 步骤 3: CSS 规则探测

Playwright `getComputedStyle` 发现关键异常：

```
dm-main display → "block"  ← 应为 "flex"！
```

进一步检查打包后的 CSS 文件：

```css
/* 实际生效的规则（残缺）： */
.log-entry.log-select .dm-main[data-v-7be6c20d] { ... }
```

`.dm-main` 被前面未闭合的孤儿选择器污染，形成无法匹配的后代选择器链，导致 `display: flex` 从未生效。

### 步骤 4: Canvas 尺寸探测

Canvas 实际属性值：

```
Canvas 分辨率: 392×150（仅 150px 高）
Sandbox 高度: 248px（含浮动面板占位 155px）
Viewport: 1280×720
```

30×20 的战场只能用 150px 渲染，大部分网格被裁剪。

### 步骤 5: Flex 布局空间分析

dm-main 子元素的布局占用：

```
子元素 0: BATTLE-HEADER → 50px
子元素 1: BATTLE-TOOLBAR → 43px
子元素 2: game-canvas-sandbox → 248px（flex: 1 但被浮动面板挤压）
子元素 3: floating-faction-panel → 155px（flex 流中占用空间）
```

---

## 三、四层根因链

### 根因 1: 路由白屏（结构层）

**现象**: `/battle/:id` 路由无 `component` 属性

**原始代码** (`main.js`):
```js
// 旧 /battle/:id 保留作为兼容入口，由导航守卫自动分流重定向
{ path: '/battle/:id', meta: { requiresAuth: true, redirectByDevice: true } }
```

**问题**: 虽然 `redirectByDevice` 守卫会尝试分流到 `/battle-pc/:id` 或 `/battle-mobile/:id`，但若守卫执行失败或用户直接硬导航，该路由没有后备组件，Vue Router 只能渲染空白。

**修复**:
```js
{ path: '/battle/:id', component: NewBattleView, meta: { requiresAuth: true, redirectByDevice: true } }
```

### 根因 2: CSS 孤儿选择器破坏 `.dm-main`（样式层）

**现象**: `.dm-main { display: flex }` 从未生效

**原因**: 14 个残缺的 `.log-entry.log-*` 选择器缺少 `{}` 闭合，CSS 解析器将其与后续的 `.dm-main` 规则串联成超长后代选择器：

```
.log-entry.log-move .log-entry.log-select .log-entry.log-use [...13个...] .dm-main[data-v-7be6c20d]
```

这种选择器永远不会匹配任何 DOM 元素，导致 `.dm-main` 的所有 flex 布局属性（`display: flex`, `flex-direction: column`, `overflow: hidden`）全部失效。

**被删除的 14 个孤儿选择器** (行号 2650-2663):
```css
.log-entry.log-move
.log-entry.log-activate
.log-entry.log-block
.log-entry.log-counter
.log-entry.log-sweep
.log-entry.log-throw
.log-entry.log-scout
.log-entry.log-snatch
.log-entry.log-stable
.log-entry.log-supply
.log-entry.log-duel
.log-entry.log-assist
.log-entry.log-guard
.log-entry.log-flee
```

**修复**: `python3 -c "del lines[2649:2657]"` 精确删除加验证。

### 根因 3: 浮动面板占用 Flex 空间（布局层）

**现象**: Faction Panel 在 `<main>` 内部占据 155px flex 空间

**原始 DOM 结构**:
```html
<main class="dm-main">
  <BattleHeader />
  <BattleToolbar />
  <div class="game-canvas-sandbox">...</div>
  <!-- 浮动阵营面板在 main 内部，参与 flex 布局 -->
  <div class="floating-card floating-faction-panel">...</div>
</main>
```

虽然 Action Panel 在 `<main>` 外部，但 Faction Panel 仍在 flex 容器内。即使其 CSS 声明了 `position: fixed`，在 flex 容器中仍占据流空间。

**修复**: Python 脚本将 `floating-faction-panel` 剪切并粘贴到 `</main>` 之后。

修复后 dm-main 仅保留 3 个子元素（Header / Toolbar / Sandbox）。

### 根因 4: Canvas 初始化时序（时序层）

**现象**: `initCanvas()` 在 `nextTick` 后读取 `container.clientHeight` 仍为 150px

**原因**: Vue 的 `nextTick` 仅保证虚拟 DOM 已更新，不保证浏览器已完成 CSS 布局计算。加上根因 2 导致 flex 布局失效，容器高度严重不足。

**修复**: 添加双重保护：

1. **`requestAnimationFrame × 2` 延迟**: 确保浏览器完成首次 composite 后再读取容器尺寸

2. **`ResizeObserver`**: 监听 `canvas-container` 的尺寸变化，一旦布局完成立即重新设置 Canvas 分辨率

```js
// 伪代码示意
onMounted(() => {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      initCanvas()
    })
  })
  
  resizeObserver = new ResizeObserver(() => {
    updateCanvasSize()
  })
  resizeObserver.observe(containerEl)
})
```

---

## 四、修复效果对比

| 指标 | 修复前 | 修复后 |
|:---|:---|:---|
| `/battle/:id` 路由 | 白屏（无 component） | 正常渲染 NewBattleView ✅ |
| dm-main `display` | `block`（CSS 规则未生效） | **`flex`** ✅ |
| CSS 孤儿选择器 | 14 个 | **0** 个 ✅ |
| Canvas 分辨率 | 392×150 | **1038×628** |
| Canvas 高度 | 150px | **628px**（4 倍提升） |
| Sandbox 高度 | 250px | **629.5px** |
| dm-main 子元素 | 4（含浮动面板） | **3**（面板已移出主容器） |
| ResizeObserver | 无 | **已激活** ✅ |
| JS 控制台错误 | 17+ ReferenceError | **0** 错误 |

---

## 五、修复文件清单

| 文件 | 修改类型 | 修复描述 |
|:---|:---|:---|
| `frontend/src/main.js` | Python 替换 | `/battle/:id` 添加 `component: NewBattleView` |
| `frontend/src/components/HexGridCanvas.vue` | Python 注入 | 添加 `ResizeObserver` + `requestAnimationFrame×2` 延迟初始化 |
| `frontend/src/views/NewBattleView.vue` | Python 移动 + 删除 | 1) Faction Panel 移出 `<main>`; 2) 删除 14 个孤儿 CSS 选择器 |

### 补丁脚本位置

```
fix_scripts/phase16_fix_route_canvas.py    # 路由 + Canvas 延迟
fix_scripts/fix_css_orphaned_selectors.py  # CSS 孤儿选择器删除
fix_scripts/fix_faction_panel_position.py  # 面板移出 dm-main
```

---

## 六、诊断方法论总结

本次诊断采用 **自底向上的四层探测法**：

```
第 0 层: API 层      → curl 验证战斗数据存在
第 1 层: 路由层      → Playwright 对比 /battle vs /battle-pc
第 2 层: DOM 结构层  → getComputedStyle + innerHTML 快照
第 3 层: CSS 规则层  → document.styleSheets 遍历 + dist CSS grep
第 4 层: 布局层      → 逐子元素分析 flex 空间占用
```

每层探测用 **Playwright 闭环验证**，修复后再次探头确认，杜绝"修复了A又引入B"的副作用。

关键工具链：
- **Playwright Browser**: `goto` → `run-code` → `evaluate()` 远程诊断
- **CSS 二进制分析**: `grep -oP` 直接搜索打包后的 `.css` 文件
- **Python 精确手术**: 按行号/字符串锚点精准修改，避免 sed 误伤
- **Docker 重建**: `docker compose build frontend`（非 restart，镜像需重建）

---

## 七、教训与预防

1. **Python 补丁脚本的锚点依赖风险**: 本次修复发现 Phase 13.5 的 Python 补丁依赖 `const terrainMap = reactive({})` 作为插入锚点，但该锚点在 git checkout 后丢失，导致后续 17 处引用全部崩溃。建议：对于关键插入点，使用**行号锚点 + 上下文双验证**，或改用 AST 解析。

2. **CSS 孤儿选择器静默破坏**: 14 个无 `{}` 的选择器在编译时无任何警告（Vite/CSS 解析器容错），但实际将后续所有选择器串联成单条无效规则。建议：启用 `postcss-no-orphan` 或 CI 中加入 CSS 语法 lint。

3. **`position: fixed` 元素不应放在 flex 容器内**: 即使声明了 `fixed` 定位，在 flex 流中仍占据空间。浮动 UI 元素应放在布局容器的兄弟层级或 body 直接子级。

4. **`nextTick` 不足以保证布局完成**: 涉及 Canvas 尺寸初始化的场景，必须使用 `requestAnimationFrame` 或 `ResizeObserver` 确认浏览器已完成 composite。

5. **Docker 容器必须 rebuild 而非 restart**: mecha-frontend 无 volume mount，镜像内置 dist。仅执行宿主机的 `npm run build` 不会更新容器内文件。任何前端代码变更后必须 `docker compose build frontend && docker compose up -d frontend`。
