# 宪法级修正：Canvas CSS 物理尺寸死锁 + JS 动态尺寸污染切除

**日期**: 2026-06-20 12:34  
**文件**: `frontend/src/components/HexGridCanvas.vue`

---

## 问题诊断

HexGridCanvas.vue 中的 JS 代码**严重违反《战棋开发终极宪法 v2.0》沙盒边界隔离红线**：

| 违规行为 | 代码位置 | 后果 |
|----------|----------|------|
| `computeCanvasSize()` 根据网格世界坐标计算 `cw`/`ch` | 已删除函数 | Canvas 物理尺寸随 grid 大小变化 |
| `canvas.width = cw; canvas.height = ch;` | `initCanvas()` + `draw()` | 画布物理撑爆父容器 |
| `draw()` 每帧检查尺寸变化并 resize | 原 draw() 函数 | 持续布局重排，挤压工具栏/行动栏 |
| `.canvas-container` 无 `width:100%; height:100%` | CSS | 自由随 JS 赋值膨胀 |

**这些行为导致**：Canvas 物理像素数随网格变大而变大（可能数千像素），而外层容器用 `flex:1` 约束，形成"子元素撑爆父元素→父元素被迫扩大→挤走兄弟元素"的链式灾难。

---

## 5 处宪法修正

### 修正 1: CSS `.canvas-container` — 锁死为 100%
```css
.canvas-container {
  position: relative;
  overflow: hidden;
  width: 100%;    /* ← 新增 */
  height: 100%;   /* ← 新增 */
}
```

### 修正 2: CSS `<canvas>` — 锁死为 100%
```css
.canvas-container canvas {
  display: block;
  width: 100%;    /* ← 新增 */
  height: 100%;   /* ← 新增 */
}
```

### 修正 3: JS — 删除 `computeCanvasSize()` 函数
整个函数及其 JSDoc 注释完全删除。该函数根据世界坐标计算画布所需物理尺寸，是尺寸污染的根源。

### 修正 4: JS `initCanvas()` — 锁死为容器像素尺寸
```javascript
// 宪法红线: canvas 物理尺寸严格等于容器 CSS 像素尺寸，绝不使用世界坐标
canvas.width = container.clientWidth
canvas.height = container.clientHeight
```

### 修正 5: JS `draw()` — 切除动态 resize 块
删除每帧的 `const { cw, ch } = computeCanvasSize()` 和 resize 判断，仅保留 `centerGrid()` 调用。

### 附带修正: `zoomReset()` — 内联世界范围计算
`zoomReset()` 需要世界范围来计算 fitScale，将原 `computeCanvasSize()` 的计算逻辑内联到函数内，仅用于缩放计算，不写入 canvas 属性。

---

## 宪法红线（修正后）

| 层级 | 约束 | 永不改变 |
|------|------|----------|
| CSS | `.canvas-container` `width:100%; height:100%` | ✅ |
| CSS | `<canvas>` `width:100%; height:100%` | ✅ |
| JS | `canvas.width/height` 仅 init 时设一次 = `container.clientWidth/Height` | ✅ |
| 视图变换 | 全部通过 CTM `ctx.translate + ctx.scale + ctx.transform(ISO)` | ✅ |

---

## 验证链

```bash
# 构建
npm run build → ✓ built in 3.64s

# Docker
docker compose up -d frontend → mecha-frontend Up Healthy

# HTTP
curl localhost:8081 → HTTP 200

# 生产 CSS
.canvas-container[data-v-...]{position:relative;overflow:hidden;width:100%;height:100%}
.canvas-container canvas[data-v-...]{display:block;width:100%;height:100%}

# 生产 JS
computeCanvasSize 引用计数 = 0
```

---

## 效果预期

1. Canvas 物理尺寸永远等于父容器 CSS 像素尺寸，不再随网格大小变化
2. 拖拽平移和滚轮缩放纯靠 CTM 变换实现，不触动任何 DOM/CSS 属性
3. 右侧行动栏、底部工具栏/棋子列表位置锁定，不因 Canvas 变化漂移
4. 完全符合《战棋开发终极宪法 v2.0》沙盒边界隔离红线
